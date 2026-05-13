// src/components/admin/BookstoreInfoForm.jsx
// 단어장 상세 Drawer 안의 "서점 등록 정보" 섹션 — 등록 상태 토글 + 가격/카테고리/색상 수정.
import React, { useEffect, useState } from 'react';
import { toggleBookstore, patchBookstore } from '@/api/adminVocaBooks';

const BookstoreInfoForm = ({ token, book, bookstore, onChanged, onOpenRegister }) => {
  "use memo";

  const [form, setForm] = useState(() => buildForm(bookstore));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(buildForm(bookstore));
    setDirty(false);
    setError('');
  }, [bookstore?.id, bookstore?.hide, bookstore?.gem, bookstore?.category, bookstore?.level_id, bookstore?.color, bookstore?.name, bookstore?.downloads]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!bookstore) return;
    setSaving(true);
    setError('');
    try {
      const json = await patchBookstore(token, book.id, {
        name: form.name,
        gem: Number(form.gem),
        category: form.category,
        category_id: form.category_id === '' ? null : Number(form.category_id),
        level_id: Number(form.level_id),
        level: form.level || null,
        downloads: Number(form.downloads) || 0,
        color: form.color || null,
      });
      onChanged && onChanged(json?.data);
      setDirty(false);
    } catch (err) {
      setError(err.message || '저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    if (!bookstore) {
      onOpenRegister && onOpenRegister();
      return;
    }
    setToggling(true);
    setError('');
    try {
      const json = await toggleBookstore(token, book.id, {});
      onChanged && onChanged(json?.data?.bookstore);
    } catch (err) {
      setError(err.message || '토글 실패');
    } finally {
      setToggling(false);
    }
  };

  const isVisible = bookstore?.hide === 'N';

  return (
    <div className="space-y-3 border border-gray-800 rounded-lg p-3 bg-gray-900/30">
      <div className="flex items-center justify-between">
        <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wide">
          서점 등록
        </h3>
        <div className="flex items-center gap-2">
          {bookstore ? (
            <ToggleSwitch
              on={isVisible}
              loading={toggling}
              onClick={handleToggle}
              labelOn="노출중"
              labelOff="숨김"
            />
          ) : (
            <button
              onClick={handleToggle}
              className="px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-500 text-white"
            >
              + 서점에 등록
            </button>
          )}
        </div>
      </div>

      {bookstore && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field label="서점 표시명">
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="가격 (gem)">
              <input
                type="number"
                min="0"
                value={form.gem}
                onChange={(e) => handleChange('gem', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="카테고리">
              <input
                type="text"
                value={form.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="카테고리 ID">
              <input
                type="number"
                min="0"
                value={form.category_id}
                onChange={(e) => handleChange('category_id', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="레벨 ID">
              <input
                type="number"
                min="0"
                value={form.level_id}
                onChange={(e) => handleChange('level_id', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label="레벨 라벨">
              <input
                type="text"
                value={form.level}
                onChange={(e) => handleChange('level', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
            <Field label={`다운로드 (${form.downloads || 0})`}>
              <input
                type="number"
                min="0"
                value={form.downloads}
                onChange={(e) => handleChange('downloads', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 text-sm text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
              />
            </Field>
          </div>

          <Field label="색상 (JSON)">
            <input
              type="text"
              value={form.color}
              onChange={(e) => handleChange('color', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 font-mono text-[11px] text-gray-100 rounded-md px-2 py-1.5 focus:outline-none focus:border-blue-500"
            />
          </Field>

          <div className="flex items-center justify-end">
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed text-white"
            >
              {saving ? '저장 중...' : dirty ? '서점 정보 저장' : '변경 없음'}
            </button>
          </div>
        </>
      )}

      {error && <div className="text-red-400 text-xs">{error}</div>}
    </div>
  );
};

function buildForm(bs) {
  return {
    name: bs?.name || '',
    gem: bs?.gem ?? 10,
    category: bs?.category || '',
    category_id: bs?.category_id ?? '',
    level_id: bs?.level_id ?? 1,
    level: bs?.level || '',
    downloads: bs?.downloads ?? 0,
    color: bs?.color || '',
  };
}

const Field = ({ label, children }) => (
  <label className="block">
    <span className="block text-[11px] text-gray-500 mb-1">{label}</span>
    {children}
  </label>
);

const ToggleSwitch = ({ on, loading, onClick, labelOn, labelOff }) => (
  <button
    onClick={onClick}
    disabled={loading}
    className={
      'inline-flex items-center gap-2 px-2 py-1 rounded-full border text-[11px] transition-colors ' +
      (on
        ? 'bg-blue-900/40 border-blue-700/50 text-blue-200 hover:bg-blue-900/60'
        : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700')
    }
  >
    <span className={
      'inline-block w-2 h-2 rounded-full ' +
      (on ? 'bg-blue-400' : 'bg-gray-500')
    } />
    {loading ? '변경 중...' : on ? labelOn : labelOff}
  </button>
);

export default BookstoreInfoForm;
