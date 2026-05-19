// src/components/admin/VocaWordRow.jsx
// 단어 한 행 — 의미 chip + 예문 행 인라인 편집 + 저장/삭제.
// 사전 패널(읽기 전용)에서 [+] 클릭으로 단어장 의미/예문에 수입 가능.
import React, { useState, useEffect } from 'react';
import { patchWord, deleteWord, getVocaDictionary } from '@/api/adminVocaBooks';

const TARGET_WORD_RE = /<strong[^>]*class=["'][^"']*\btarget-word\b[^"']*["'][^>]*>/i;
const hasEmphasis = (s) => TARGET_WORD_RE.test(s || '');

/** 예문 한 쌍의 강조 상태 → 'green' | 'yellow' | 'red' */
const emphasisLevel = (origin, meaning) => {
  const a = hasEmphasis(origin);
  const b = hasEmphasis(meaning);
  if (a && b) return 'green';
  if (a || b) return 'yellow';
  return 'red';
};

const DOT_STYLE = {
  green: { cls: 'bg-emerald-500', title: '원어·의미 모두 강조 처리됨' },
  yellow: { cls: 'bg-yellow-400', title: '한쪽만 강조 처리됨' },
  red: { cls: 'bg-red-500', title: '강조 처리 없음' },
};

const VocaWordRow = ({ token, bookId, word, onUpdated, onDeleted }) => {
  "use memo";

  const [meanings, setMeanings] = useState(word.meanings || []);
  const [examples, setExamples] = useState(word.examples || []);
  const [level, setLevel] = useState(word.level ?? '');
  const [newMeaning, setNewMeaning] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showRawWarning, setShowRawWarning] = useState(word.parse_error || false);

  // 사전 패널
  const [dictOpen, setDictOpen] = useState(false);
  const [dictLoading, setDictLoading] = useState(false);
  const [dictError, setDictError] = useState('');
  const [dict, setDict] = useState(null); // { meanings: [...], examples: [...] }

  useEffect(() => {
    setMeanings(word.meanings || []);
    setExamples(word.examples || []);
    setLevel(word.level ?? '');
    setDirty(false);
    setShowRawWarning(word.parse_error || false);
    setDictOpen(false);
    setDict(null);
  }, [word.map_id]);

  const markDirty = () => setDirty(true);

  const addMeaning = () => {
    const m = newMeaning.trim();
    if (!m) return;
    if (meanings.includes(m)) {
      setNewMeaning('');
      return;
    }
    setMeanings((prev) => [...prev, m]);
    setNewMeaning('');
    markDirty();
  };

  const importMeaning = (text) => {
    if (!text || meanings.includes(text)) return;
    setMeanings((prev) => [...prev, text]);
    markDirty();
  };

  const importExample = (origin, meaning) => {
    if (!origin && !meaning) return;
    // 동일한 origin/meaning 한 쌍이 이미 있는지 검사
    const dup = examples.some((ex) => (ex.origin || '') === (origin || '') && (ex.meaning || '') === (meaning || ''));
    if (dup) return;
    setExamples((prev) => [...prev, { origin: origin || '', meaning: meaning || '' }]);
    markDirty();
  };

  const removeMeaning = (idx) => {
    setMeanings((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const updateExample = (idx, key, value) => {
    setExamples((prev) => prev.map((e, i) => (i === idx ? { ...e, [key]: value } : e)));
    markDirty();
  };

  const addExample = () => {
    setExamples((prev) => [...prev, { origin: '', meaning: '' }]);
    markDirty();
  };

  const removeExample = (idx) => {
    setExamples((prev) => prev.filter((_, i) => i !== idx));
    markDirty();
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const json = await patchWord(token, bookId, word.map_id, {
        meanings,
        examples,
        level: level === '' ? null : level,
      });
      onUpdated && onUpdated(json?.data);
      setDirty(false);
      setShowRawWarning(false);
    } catch (err) {
      setError(err.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`'${word.word}' 단어를 단어장에서 제거합니다. 진행할까요?`)) return;
    setDeleting(true);
    setError('');
    try {
      await deleteWord(token, bookId, word.map_id);
      onDeleted && onDeleted(word.map_id);
    } catch (err) {
      setError(err.message || '삭제 실패');
      setDeleting(false);
    }
  };

  const toggleDict = async () => {
    if (dictOpen) {
      setDictOpen(false);
      return;
    }
    setDictOpen(true);
    if (dict) return;
    setDictLoading(true);
    setDictError('');
    try {
      const json = await getVocaDictionary(token, word.voca_id);
      setDict(json?.data || null);
    } catch (err) {
      setDictError(err.message || '사전 조회 실패');
    } finally {
      setDictLoading(false);
    }
  };

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/30 p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-base font-semibold text-gray-100 truncate">{word.word}</span>
            {word.pronunciation && (
              <span className="text-xs text-gray-500">[{word.pronunciation}]</span>
            )}
            {word.voca_level && (
              <span className="text-[10px] text-gray-600">난이도 {word.voca_level}</span>
            )}
            <span className="text-[10px] text-gray-600">voca_id {word.voca_id}</span>
          </div>
          {showRawWarning && (
            <div className="mt-1 text-[11px] text-amber-400">
              ⚠️ 의미/예문 JSON 파싱 실패 — 저장 시 정규화됨
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={toggleDict}
            className={
              'px-2 py-1 text-xs rounded border transition-colors ' +
              (dictOpen
                ? 'bg-indigo-900/40 border-indigo-700/60 text-indigo-200'
                : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700')
            }
            title="사전(voca) 의미/예문 보기"
          >
            📚 사전
          </button>
          <input
            type="number"
            placeholder="lv"
            value={level}
            onChange={(e) => { setLevel(e.target.value); markDirty(); }}
            className="w-12 bg-gray-900 border border-gray-700 text-xs text-gray-200 rounded px-1.5 py-1 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={!dirty || saving || deleting}
            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          >
            {saving ? '...' : '저장'}
          </button>
          <button
            onClick={handleDelete}
            disabled={saving || deleting}
            className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-red-900/50 text-gray-400 hover:text-red-300 transition-colors"
          >
            {deleting ? '...' : '삭제'}
          </button>
        </div>
      </div>

      {/* 사전 패널 */}
      {dictOpen && (
        <DictionaryPanel
          loading={dictLoading}
          error={dictError}
          dict={dict}
          existingMeanings={meanings}
          existingExamples={examples}
          onImportMeaning={importMeaning}
          onImportExample={importExample}
        />
      )}

      {/* 의미 chip */}
      <div>
        <div className="text-[10px] text-gray-500 mb-1">의미</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {meanings.map((m, i) => (
            <span
              key={`${m}-${i}`}
              className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 text-gray-200 text-xs rounded-full px-2 py-0.5"
            >
              {m}
              <button
                onClick={() => removeMeaning(i)}
                className="text-gray-500 hover:text-red-300"
                aria-label="제거"
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            placeholder="의미 추가 후 Enter"
            value={newMeaning}
            onChange={(e) => setNewMeaning(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addMeaning();
              }
            }}
            className="bg-gray-900 border border-gray-700 text-xs text-gray-200 rounded px-2 py-1 w-40 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* 예문 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-500">예문</span>
          <button
            onClick={addExample}
            className="text-[11px] text-blue-400 hover:text-blue-300"
          >
            + 예문 추가
          </button>
        </div>
        <div className="space-y-1.5">
          {examples.length === 0 && (
            <div className="text-[11px] text-gray-600">예문이 없습니다.</div>
          )}
          {examples.map((ex, i) => {
            const level = emphasisLevel(ex.origin, ex.meaning);
            const dot = DOT_STYLE[level];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${dot.cls}`}
                  title={dot.title}
                  aria-label={dot.title}
                />
                <input
                  type="text"
                  placeholder="원어"
                  value={ex.origin || ''}
                  onChange={(e) => updateExample(i, 'origin', e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 text-xs text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="의미"
                  value={ex.meaning || ''}
                  onChange={(e) => updateExample(i, 'meaning', e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 text-xs text-gray-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => removeExample(i)}
                  className="text-gray-500 hover:text-red-300 px-1 text-sm"
                  aria-label="예문 제거"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="text-red-400 text-xs">{error}</div>}
    </div>
  );
};

// ──────────────────────────────────────────────────────────
// 사전 패널 — voca의 모든 의미/예문 표시 + 단어장으로 수입 버튼
// ──────────────────────────────────────────────────────────
const DictionaryPanel = ({
  loading, error, dict,
  existingMeanings, existingExamples,
  onImportMeaning, onImportExample,
}) => {
  if (loading) {
    return (
      <div className="border border-indigo-900/50 bg-indigo-950/30 rounded-lg p-3 text-xs text-indigo-300">
        사전 데이터를 불러오는 중...
      </div>
    );
  }
  if (error) {
    return (
      <div className="border border-red-800/50 bg-red-950/30 rounded-lg p-3 text-xs text-red-300">
        {error}
      </div>
    );
  }
  if (!dict) return null;

  const meanings = dict.meanings || [];
  const examples = dict.examples || [];

  const isMeaningImported = (text) => existingMeanings.includes(text);
  const isExampleImported = (origin, meaning) => existingExamples.some(
    (ex) => (ex.origin || '') === (origin || '') && (ex.meaning || '') === (meaning || '')
  );

  return (
    <div className="border border-indigo-900/50 bg-indigo-950/20 rounded-lg p-3 space-y-3">
      <div className="text-[10px] text-indigo-300 font-semibold uppercase tracking-wide">
        📚 사전에 있는 데이터 (참고/수입용)
      </div>

      <div>
        <div className="text-[10px] text-indigo-400/80 mb-1">의미 ({meanings.length})</div>
        {meanings.length === 0 ? (
          <div className="text-[11px] text-gray-600">사전에 등록된 의미가 없습니다.</div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {meanings.map((m) => {
              const taken = isMeaningImported(m.meaning);
              return (
                <button
                  key={m.id}
                  onClick={() => onImportMeaning(m.meaning)}
                  disabled={taken}
                  className={
                    'inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border transition-colors ' +
                    (taken
                      ? 'bg-gray-900/60 border-gray-800 text-gray-600 cursor-not-allowed'
                      : 'bg-indigo-900/30 border-indigo-700/60 text-indigo-100 hover:bg-indigo-800/50')
                  }
                  title={taken ? '이미 단어장에 있습니다' : '단어장에 추가'}
                >
                  {taken ? '✓' : '+'} {m.meaning}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <div className="text-[10px] text-indigo-400/80 mb-1">예문 ({examples.length})</div>
        {examples.length === 0 ? (
          <div className="text-[11px] text-gray-600">사전에 등록된 예문이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {examples.map((ex) => {
              const taken = isExampleImported(ex.origin, ex.meaning);
              return (
                <div
                  key={ex.id}
                  className="flex items-start gap-2 bg-indigo-950/30 border border-indigo-900/50 rounded-md px-2 py-1.5"
                >
                  <div className="min-w-0 flex-1 text-[11px] leading-relaxed">
                    <div
                      className="text-gray-200"
                      dangerouslySetInnerHTML={{ __html: ex.origin || '' }}
                    />
                    <div
                      className="text-gray-400"
                      dangerouslySetInnerHTML={{ __html: ex.meaning || '' }}
                    />
                  </div>
                  <button
                    onClick={() => onImportExample(ex.origin, ex.meaning)}
                    disabled={taken}
                    className={
                      'shrink-0 px-2 py-0.5 text-[11px] rounded border transition-colors ' +
                      (taken
                        ? 'bg-gray-900/60 border-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-indigo-900/30 border-indigo-700/60 text-indigo-100 hover:bg-indigo-800/50')
                    }
                    title={taken ? '이미 단어장에 있습니다' : '단어장에 추가'}
                  >
                    {taken ? '✓ 추가됨' : '+ 추가'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="text-[10px] text-indigo-400/60">
        수입한 항목은 단어장 편집 영역에 dirty 상태로 들어갑니다. <span className="text-indigo-300">[저장]</span> 버튼을 눌러야 DB에 반영됩니다.
      </div>
    </div>
  );
};

export default VocaWordRow;
