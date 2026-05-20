// src/components/admin/VocaBookList.jsx
// 단어장 목록 테이블. 편집/토글은 상위 패널 콜백으로 위임. 정렬은 th 클릭으로 처리.
import React from 'react';

const formatDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
};

const SOURCE_BADGE = {
  'AI 생성': 'bg-purple-900/40 text-purple-200 border-purple-700/50',
  '직접 제작': 'bg-emerald-900/40 text-emerald-200 border-emerald-700/50',
};

const BookstoreStatus = ({ bookstore }) => {
  if (!bookstore) {
    return <span className="text-gray-600 text-xs">미등록</span>;
  }
  if (bookstore.hide === 'N') {
    return <span className="text-blue-400 text-xs">✓ 노출중 · gem {bookstore.gem}</span>;
  }
  return <span className="text-gray-500 text-xs">숨김 · gem {bookstore.gem}</span>;
};

const COLUMNS = [
  { key: 'id',         label: 'ID',         align: 'left',  sortable: true },
  { key: 'book_nm',    label: '단어장명',    align: 'left',  sortable: true },
  { key: 'language',   label: '언어',        align: 'left',  sortable: true },
  { key: 'source',     label: 'Source',     align: 'left',  sortable: true },
  { key: 'category',   label: '카테고리',    align: 'left',  sortable: true },
  { key: 'word_count', label: '단어수',      align: 'right', sortable: true },
  { key: 'bookstore',  label: '서점 등록',   align: 'left',  sortable: true },
  { key: 'updated_at', label: '갱신일',      align: 'left',  sortable: true },
  { key: '_actions',   label: '동작',        align: 'right', sortable: false },
];

const SortIndicator = ({ active, dir }) => {
  if (!active) {
    return <span className="ml-1 text-gray-700">↕</span>;
  }
  return <span className="ml-1 text-blue-400">{dir === 'asc' ? '▲' : '▼'}</span>;
};

const VocaBookList = ({ items, sortBy, sortDir, onSortChange, onEdit, onToggleBookstore }) => {
  "use memo";
  if (!items.length) {
    return (
      <div className="text-center py-16 text-gray-600 text-sm">
        조건에 맞는 단어장이 없습니다.
      </div>
    );
  }

  const handleHeaderClick = (col) => {
    if (!col.sortable || !onSortChange) return;
    if (col.key === sortBy) {
      // 같은 컬럼이면 방향 토글
      onSortChange(col.key, sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      // 새 컬럼이면 기본 desc (숫자/날짜는 desc가 자연스럽고, 문자열도 desc 시작이 일관성 있음)
      onSortChange(col.key, 'desc');
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-900 text-gray-400 text-xs uppercase tracking-wide">
          <tr>
            {COLUMNS.map((col) => {
              const active = col.sortable && col.key === sortBy;
              return (
                <th
                  key={col.key}
                  className={
                    'px-3 py-2 font-medium ' +
                    (col.align === 'right' ? 'text-right ' : 'text-left ') +
                    (col.sortable ? 'cursor-pointer select-none hover:text-white transition-colors ' : '')
                  }
                  onClick={() => handleHeaderClick(col)}
                  title={col.sortable ? '클릭하여 정렬' : ''}
                >
                  <span className={active ? 'text-white' : ''}>{col.label}</span>
                  {col.sortable && <SortIndicator active={active} dir={sortDir} />}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((book) => (
            <tr
              key={book.id}
              className="border-t border-gray-800 hover:bg-gray-900/40 transition-colors"
            >
              <td className="px-3 py-2 text-gray-500">{book.id}</td>
              <td className="px-3 py-2 text-gray-100">{book.book_nm}</td>
              <td className="px-3 py-2 text-gray-400">{book.language}</td>
              <td className="px-3 py-2">
                <span
                  className={
                    'inline-block px-2 py-0.5 rounded-full text-[11px] border ' +
                    (SOURCE_BADGE[book.source] || 'bg-gray-800 text-gray-300 border-gray-700')
                  }
                >
                  {book.source}
                </span>
              </td>
              <td className="px-3 py-2 text-gray-400">{book.category || '-'}</td>
              <td className="px-3 py-2 text-right text-gray-300 tabular-nums">{book.word_count ?? 0}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => onToggleBookstore && onToggleBookstore(book)}
                  className="hover:opacity-80 transition-opacity"
                  title={book.bookstore ? '클릭하여 노출 상태 전환' : '클릭하여 서점에 등록'}
                >
                  <BookstoreStatus bookstore={book.bookstore} />
                </button>
              </td>
              <td className="px-3 py-2 text-gray-500 text-xs">{formatDate(book.updated_at)}</td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => onEdit && onEdit(book)}
                  className="px-2.5 py-1 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 transition-colors"
                >
                  편집
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default VocaBookList;
