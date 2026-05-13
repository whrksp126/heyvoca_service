// src/components/admin/VocaBookMetaForm.jsx
// 단어장 메타정보 인라인 편집 폼.
import React, { useState, useEffect } from 'react';
import { patchVocaBook } from '@/api/adminVocaBooks';

const SOURCE_OPTIONS = ['AI 생성', '직접 제작'];

const VocaBookMetaForm = ({ token, book, onSaved }) => {
  "use memo";

  const [form, setForm] = useState({
    book_nm: book.book_nm || '',
    language: book.language || '',
    source: book.source || '',
    category: book.category || '',
    username: book.username || '',
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm({
      book_nm: book.book_nm || '',
      language: book.language || '',
      source: book.source || '',
      category: book.category || '',
      username: book.username || '',
    });
    setDirty(false);
    setError('');
  }, [book.id]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const json = await patchVocaBook(token, book.id, form);
      onSaved && onSaved(json?.data);
      setDirty(false);
    } catch (err) {
      setError(err.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wide">
          메타 정보
        </h3>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
        >
          {saving ? '저장 중...' : dirty ? '저장' : '변경 없음'}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="단어장명" required>
          <input
            type="text"
            value={form.book_nm}
            onChange={(e) => handleChange('book_nm', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
          />
        </Field>
        <Field label="언어" required>
          <input
            type="text"
            value={form.language}
            onChange={(e) => handleChange('language', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
          />
        </Field>
        <Field label="Source" required>
          <select
            value={form.source}
            onChange={(e) => handleChange('source', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
          >
            {!SOURCE_OPTIONS.includes(form.source) && form.source && (
              <option value={form.source}>{form.source}</option>
            )}
            {SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="카테고리">
          <input
            type="text"
            value={form.category}
            onChange={(e) => handleChange('category', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
          />
        </Field>
        <Field label="작성자">
          <input
            type="text"
            value={form.username}
            onChange={(e) => handleChange('username', e.target.value)}
            className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
          />
        </Field>
        <Field label="단어 수 (자동)">
          <input
            type="text"
            value={book.word_count ?? 0}
            disabled
            className="w-full bg-gray-900/50 border border-gray-800 text-sm text-gray-500 rounded-md px-2 py-1.5"
          />
        </Field>
      </div>

      {error && (
        <div className="text-red-400 text-xs">{error}</div>
      )}
    </div>
  );
};

const Field = ({ label, required, children }) => (
  <label className="block">
    <span className="block text-[11px] text-gray-500 mb-1">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </span>
    {children}
  </label>
);

export default VocaBookMetaForm;
