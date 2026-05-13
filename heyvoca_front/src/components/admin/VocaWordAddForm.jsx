// src/components/admin/VocaWordAddForm.jsx
// 단어 추가 폼. word 입력 후 추가 시 동음이의 후보 응답(409) 처리.
import React, { useState } from 'react';
import { addWord } from '@/api/adminVocaBooks';

const VocaWordAddForm = ({ token, bookId, onAdded }) => {
  "use memo";

  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [meaningsText, setMeaningsText] = useState('');
  const [exEn, setExEn] = useState('');
  const [exKo, setExKo] = useState('');
  const [level, setLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState(null);

  const reset = () => {
    setWord('');
    setPronunciation('');
    setMeaningsText('');
    setExEn('');
    setExKo('');
    setLevel('');
    setCandidates(null);
    setError('');
  };

  const buildPayload = (vocaId) => {
    const meanings = meaningsText.split(',').map((s) => s.trim()).filter(Boolean);
    const examples = exEn.trim() || exKo.trim() ? [{ en: exEn.trim(), ko: exKo.trim() }] : [];
    if (vocaId) {
      return { voca_id: vocaId, meanings, examples, level: level || null };
    }
    return {
      word: word.trim(),
      pronunciation: pronunciation.trim() || null,
      meanings,
      examples,
      level: level || null,
    };
  };

  const submit = async (opts = {}) => {
    setSaving(true);
    setError('');
    try {
      const payload = buildPayload(opts.vocaId);
      const json = await addWord(token, bookId, payload, { force: opts.force });
      onAdded && onAdded(json?.data);
      reset();
      setOpen(false);
    } catch (err) {
      if (err.status === 409 && err.payload?.data?.candidates) {
        setCandidates(err.payload.data.candidates);
      } else {
        setError(err.message || '추가 실패');
      }
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <div className="flex">
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          + 단어 추가
        </button>
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded-lg bg-gray-900/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400 font-semibold">단어 추가</span>
        <button
          onClick={() => { setOpen(false); reset(); }}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          닫기
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="word *"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="발음 (선택)"
          value={pronunciation}
          onChange={(e) => setPronunciation(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
      </div>
      <input
        type="text"
        placeholder="의미 (콤마로 구분: 사과, 능금)"
        value={meaningsText}
        onChange={(e) => setMeaningsText(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="예문 EN (선택)"
          value={exEn}
          onChange={(e) => setExEn(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="예문 KO (선택)"
          value={exKo}
          onChange={(e) => setExKo(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="lv"
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="w-16 bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded px-2 py-1.5 focus:outline-none focus:border-blue-500"
        />
        <button
          onClick={() => submit()}
          disabled={saving || !word.trim()}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white transition-colors"
        >
          {saving ? '추가 중...' : '추가'}
        </button>
      </div>

      {candidates && (
        <div className="mt-1 border border-amber-700/50 bg-amber-900/20 rounded p-2 space-y-1.5">
          <div className="text-[11px] text-amber-300">
            ⚠️ 사전에 동일 단어가 이미 있어요. 기존 단어를 선택하거나 강제 신규 생성하세요.
          </div>
          <div className="space-y-1">
            {candidates.map((c) => (
              <div key={c.voca_id} className="flex items-center gap-2 text-xs">
                <button
                  onClick={() => submit({ vocaId: c.voca_id })}
                  disabled={saving}
                  className="px-2 py-0.5 rounded bg-amber-700/40 hover:bg-amber-700/60 text-amber-100"
                >
                  voca_id {c.voca_id} 선택
                </button>
                <span className="text-gray-300">{c.word}</span>
                {c.pronunciation && <span className="text-gray-500">[{c.pronunciation}]</span>}
                {c.level && <span className="text-gray-600">난이도 {c.level}</span>}
              </div>
            ))}
            <button
              onClick={() => submit({ force: true })}
              disabled={saving}
              className="text-[11px] text-amber-300 hover:text-amber-200 underline"
            >
              ↪ 그래도 신규 voca로 생성하기
            </button>
          </div>
        </div>
      )}

      {error && <div className="text-red-400 text-xs">{error}</div>}
    </div>
  );
};

export default VocaWordAddForm;
