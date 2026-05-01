// .apkg 클라이언트 파싱: jszip + sql.js로 collection.anki2(SQLite)를 읽어
// 백엔드 /vocaBooks/upload/anki/preview 응답과 동일한 형태를 반환한다.
// 백엔드 voca_books.py의 _parse_apkg / _clean_anki_field 와 동등한 결과.

import JSZip from 'jszip';
import initSqlJs from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { normalizeTargetWord } from './targetWord';

let sqlJsPromise = null;
const getSqlJs = () => {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  }
  return sqlJsPromise;
};

// 백엔드 _clean_anki_field 와 동일 규칙. keep_html=False 기본.
export const cleanAnkiField = (raw, keepHtml = false) => {
  if (!raw) return '';
  let text = String(raw);

  // 미디어 참조 제거
  text = text.replace(/\[sound:[^\]]*\]/g, '');
  text = text.replace(/<img[^>]*>/g, '');

  if (!keepHtml) {
    // cloze deletion → answer
    text = text.replace(/\{\{c\d+::([\s\S]*?)(?:::[^}]*)?\}\}/g, '$1');
    // <br> → 공백
    text = text.replace(/<br\s*\/?>/gi, ' ');
    // 나머지 태그 제거
    text = text.replace(/<[^>]+>/g, '');
    // 엔티티 디코딩
    if (typeof document !== 'undefined') {
      const el = document.createElement('textarea');
      el.innerHTML = text;
      text = el.value;
    }
  }

  text = text.replace(/[ \t]+/g, ' ').trim();
  return text;
};

const yieldToEventLoop = () => new Promise((resolve) => setTimeout(resolve, 0));

// .apkg 파일을 파싱해 백엔드 preview 응답 형식과 동일한 구조를 반환.
// onProgress({ phase, done, total, percent }) 콜백으로 진행률 보고.
export const parseApkg = async (file, { onProgress } = {}) => {
  if (!file) throw new Error('파일이 없습니다.');

  const report = (phase, done, total) => {
    if (typeof onProgress !== 'function') return;
    const safeTotal = Math.max(0, total | 0);
    const safeDone = Math.min(safeTotal, Math.max(0, done | 0));
    const percent = safeTotal > 0 ? Math.round((safeDone / safeTotal) * 100) : 0;
    onProgress({ phase, done: safeDone, total: safeTotal, percent });
  };

  // 1. ZIP 로드 (미디어는 무시)
  report('unzip', 0, 1);
  const zip = await JSZip.loadAsync(file);
  let dbEntry = null;
  for (const name of ['collection.anki21', 'collection.anki2', 'collection.anki21b']) {
    if (zip.files[name]) {
      dbEntry = zip.files[name];
      break;
    }
  }
  if (!dbEntry) {
    throw new Error('apkg 파일에서 Anki 데이터베이스를 찾을 수 없습니다.');
  }

  const dbBytes = await dbEntry.async('uint8array');
  report('unzip', 1, 1);

  // 2. SQLite 로드
  report('open-db', 0, 1);
  const SQL = await getSqlJs();
  const db = new SQL.Database(dbBytes);
  report('open-db', 1, 1);

  try {
    // 3. 노트 타입(모델) 추출
    const models = {}; // { mid: { name, fields: [field_name, ...] } }

    const tableCheck = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='notetypes'"
    );
    const hasNotetypes = tableCheck.length > 0 && tableCheck[0].values.length > 0;

    if (hasNotetypes) {
      // 신버전 (anki21)
      const ntRows = db.exec('SELECT id, name FROM notetypes');
      if (ntRows.length > 0) {
        for (const row of ntRows[0].values) {
          const [mid, name] = row;
          const fr = db.exec('SELECT name FROM fields WHERE ntid=? ORDER BY ord', [mid]);
          const fieldNames = fr.length > 0 ? fr[0].values.map((r) => r[0]) : [];
          models[mid] = { name, fields: fieldNames };
        }
      }
    } else {
      // 구버전 (anki2)
      const colRow = db.exec('SELECT models FROM col');
      if (colRow.length > 0 && colRow[0].values.length > 0) {
        const modelsJson = JSON.parse(colRow[0].values[0][0]);
        for (const midStr of Object.keys(modelsJson)) {
          const m = modelsJson[midStr];
          const mid = Number(midStr);
          models[mid] = {
            name: m.name || 'Unknown',
            fields: (m.flds || []).map((f) => f.name),
          };
        }
      }
    }

    if (Object.keys(models).length === 0) {
      throw new Error('노트 타입 정보를 찾을 수 없습니다.');
    }

    // 4. 덱 이름
    let deckName = 'Anki Deck';
    const deckCheck = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='decks'"
    );
    if (deckCheck.length > 0 && deckCheck[0].values.length > 0) {
      const dr = db.exec('SELECT name FROM decks LIMIT 1');
      if (dr.length > 0 && dr[0].values.length > 0) {
        deckName = dr[0].values[0][0];
      }
    } else {
      const colDecks = db.exec('SELECT decks FROM col');
      if (colDecks.length > 0 && colDecks[0].values.length > 0) {
        const decksJson = JSON.parse(colDecks[0].values[0][0]);
        for (const did of Object.keys(decksJson)) {
          if (did !== '1') {
            deckName = decksJson[did].name || deckName;
            break;
          }
        }
      }
    }

    // 5. 노트 데이터 (전체) — mid별로 그룹핑
    const notesByMid = {};
    let total = 0;
    const cntRow = db.exec('SELECT COUNT(*) FROM notes');
    if (cntRow.length > 0) total = cntRow[0].values[0][0];

    let done = 0;
    report('parse-notes', 0, total);

    const stmt = db.prepare('SELECT mid, flds FROM notes');
    while (stmt.step()) {
      const { mid, flds } = stmt.getAsObject();
      const model = models[mid];
      if (model) {
        const values = String(flds).split('\x1f');
        const noteDict = {};
        for (let i = 0; i < model.fields.length; i++) {
          noteDict[model.fields[i]] = values[i] != null ? values[i] : '';
        }
        if (!notesByMid[mid]) notesByMid[mid] = [];
        notesByMid[mid].push(noteDict);
      }
      done += 1;
      // 일정 간격마다 yield + 진행률 보고
      if (done % 200 === 0) {
        report('parse-notes', done, total);
        // eslint-disable-next-line no-await-in-loop
        await yieldToEventLoop();
      }
    }
    stmt.free();
    report('parse-notes', total, total);

    // 6. 응답 구성
    const noteTypes = [];
    for (const midKey of Object.keys(models)) {
      const mid = Number(midKey);
      const notes = notesByMid[mid] || [];
      if (notes.length === 0) continue;
      const samples = notes.slice(0, 5).map((n) => {
        const out = {};
        for (const k of Object.keys(n)) out[k] = cleanAnkiField(n[k]);
        return out;
      });

      const fieldStats = {};
      for (const fname of models[mid].fields) {
        const lengths = [];
        for (const n of notes) {
          const cleaned = cleanAnkiField(n[fname] || '');
          if (cleaned) lengths.push(cleaned.length);
        }
        if (lengths.length > 0) {
          fieldStats[fname] = {
            avgLen: lengths.reduce((a, b) => a + b, 0) / lengths.length,
            maxLen: Math.max(...lengths),
            nonEmptyCount: lengths.length,
          };
        } else {
          fieldStats[fname] = { avgLen: 0, maxLen: 0, nonEmptyCount: 0 };
        }
      }

      noteTypes.push({
        noteTypeId: mid,
        noteTypeName: models[mid].name,
        fields: models[mid].fields,
        noteCount: notes.length,
        samples,
        fieldStats,
        // 다음 단계(매핑→저장)에서 재파싱 없이 바로 사용하기 위해 raw 노트 보관 (메모리 내)
        _allNotes: notes,
      });
    }

    return { deckName, noteTypes };
  } finally {
    db.close();
  }
};

// preview 결과 + 매핑 → vocaList(서버 저장용)로 변환.
// onProgress({ done, total, percent }) 콜백으로 진행률 보고.
export const buildVocaListFromMapping = async (
  noteType,
  mapping,
  { onProgress } = {}
) => {
  if (!noteType || !noteType._allNotes) {
    throw new Error('파싱된 노트 데이터가 없습니다.');
  }

  const total = noteType._allNotes.length;
  let done = 0;
  const report = () => {
    if (typeof onProgress !== 'function') return;
    onProgress({
      done,
      total,
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
    });
  };
  report();

  const fieldWord = mapping.word;
  const fieldMeaning = mapping.meaning;
  const fieldPron = mapping.pronunciation;
  const fieldExample = mapping.example;
  const fieldExampleMeaning = mapping.exampleMeaning;

  const merged = new Map(); // origin → item

  for (const note of noteType._allNotes) {
    done += 1;
    if (done % 200 === 0) {
      report();
      // eslint-disable-next-line no-await-in-loop
      await yieldToEventLoop();
    }

    const word = cleanAnkiField(note[fieldWord]);
    const meaning = cleanAnkiField(note[fieldMeaning]);
    if (!word || !meaning) continue;

    const meanings = meaning.split(',').map((m) => m.trim()).filter(Boolean);

    if (fieldPron && note[fieldPron] && String(note[fieldPron]).trim()) {
      const pron = cleanAnkiField(note[fieldPron]);
      if (pron) meanings.unshift(`[${pron}]`);
    }

    let examples = [];
    if (fieldExample && note[fieldExample] && String(note[fieldExample]).trim()) {
      const exOriginRaw = cleanAnkiField(note[fieldExample], true);
      const exOrigin = normalizeTargetWord(exOriginRaw);
      let exMeaning = '';
      if (fieldExampleMeaning && note[fieldExampleMeaning] && String(note[fieldExampleMeaning]).trim()) {
        const exMeaningRaw = cleanAnkiField(note[fieldExampleMeaning], true);
        exMeaning = normalizeTargetWord(exMeaningRaw);
      }
      examples = [{ origin: exOrigin, meaning: exMeaning }];
    }

    if (merged.has(word)) {
      const existing = merged.get(word);
      for (const m of meanings) {
        if (!existing.meanings.includes(m)) existing.meanings.push(m);
      }
      for (const ex of examples) {
        const dup = existing.examples.find(
          (e) => e.origin === ex.origin && e.meaning === ex.meaning
        );
        if (!dup) existing.examples.push(ex);
      }
    } else {
      merged.set(word, { origin: word, meanings, examples });
    }
  }

  done = total;
  report();
  return Array.from(merged.values());
};
