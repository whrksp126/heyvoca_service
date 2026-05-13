// src/components/admin/BookstoreRegisterModal.jsx
// 서점에 단어장을 처음 등록할 때 필수 필드(gem/category/level_id 등)를 받는 모달.
import React, { useState } from 'react';
import { toggleBookstore } from '@/api/adminVocaBooks';

const DEFAULT_COLOR = '{"main":"#FF88DC","sub":"#FFD7F3","background":"#FFEEFA"}';

const BookstoreRegisterModal = ({ token, book, onClose, onRegistered }) => {
  "use memo";

  const [name, setName] = useState(book.book_nm || '');
  const [gem, setGem] = useState(10);
  const [category, setCategory] = useState(book.category || '');
  const [categoryId, setCategoryId] = useState('');
  const [levelId, setLevelId] = useState(1);
  const [level, setLevel] = useState('');
  const [downloads, setDownloads] = useState(0);
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      const json = await toggleBookstore(token, book.id, {
        name,
        gem: Number(gem),
        category,
        category_id: categoryId === '' ? null : Number(categoryId),
        level_id: Number(levelId),
        level: level || null,
        downloads: Number(downloads) || 0,
        color,
      });
      onRegistered && onRegistered(json?.data);
    } catch (err) {
      setError(err.message || '등록 실패');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={saving ? undefined : onClose} />
      <div className="relative bg-gray-950 border border-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <header className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">서점에 등록</h2>
          <button
            onClick={saving ? undefined : onClose}
            className="text-xs text-gray-500 hover:text-gray-200"
            disabled={saving}
          >
            취소
          </button>
        </header>
        <div className="px-4 py-4 space-y-3 max-h-[80vh] overflow-y-auto">
          <p className="text-[11px] text-gray-500">
            <span className="text-gray-300">{book.book_nm}</span> 단어장을 서점에 노출합니다.
            필수값을 채워주세요.
          </p>

          <Field label="서점 표시명 *">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="가격 (gem) *">
              <input
                type="number"
                min="0"
                value={gem}
                onChange={(e) => setGem(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="레벨 ID *">
              <input
                type="number"
                min="0"
                value={levelId}
                onChange={(e) => setLevelId(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="카테고리 *">
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="카테고리 ID">
              <input
                type="number"
                min="0"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                placeholder="선택"
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="레벨 라벨">
              <input
                type="text"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="예: 초급"
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="초기 다운로드">
              <input
                type="number"
                min="0"
                value={downloads}
                onChange={(e) => setDownloads(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
          </div>

          <Field label="색상 (JSON)">
            <input
              type="text"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 font-mono text-[11px] text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </Field>

          {error && <div className="text-red-400 text-xs">{error}</div>}
        </div>

        <footer className="px-4 py-3 border-t border-gray-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !category.trim()}
            className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white"
          >
            {saving ? '등록 중...' : '등록 후 노출'}
          </button>
        </footer>
      </div>
    </div>
  );
};

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] text-gray-500 mb-1">{label}</span>
    {children}
  </label>
);

export default BookstoreRegisterModal;
