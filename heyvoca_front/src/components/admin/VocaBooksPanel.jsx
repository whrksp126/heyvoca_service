// src/components/admin/VocaBooksPanel.jsx
// 단어장 관리 탭 컨테이너. 필터/검색/정렬 + 목록 + (Step 4) 편집 Drawer.
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { listVocaBooks, toggleBookstore } from '@/api/adminVocaBooks';
import VocaBookFilters from './VocaBookFilters';
import VocaBookList from './VocaBookList';
import VocaBookDetailDrawer from './VocaBookDetailDrawer';
import BookstoreRegisterModal from './BookstoreRegisterModal';

const STORAGE_KEY = 'heyvoca_admin_token';
const PAGE_SIZE = 50;

const VocaBooksPanel = ({ token, onLogout }) => {
  "use memo";

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [sourceCounts, setSourceCounts] = useState({});
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({ source: 'all', q: '', sort: 'updated_at' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 검색 input은 debounce — 사용자 타이핑 중 매번 API 호출하지 않도록
  const [qInput, setQInput] = useState('');
  const debounceRef = useRef(null);

  // 편집 Drawer
  const [editingBookId, setEditingBookId] = useState(null);

  // 서점 등록 모달 (목록 토글에서 처음 등록 시)
  const [registerForBook, setRegisterForBook] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async (overridePage) => {
    setLoading(true);
    setError('');
    try {
      const json = await listVocaBooks(token, {
        page: overridePage ?? page,
        pageSize: PAGE_SIZE,
        source: filters.source,
        q: filters.q,
        sort: filters.sort,
      });
      const data = json?.data ?? {};
      setItems(data.items || []);
      setTotal(data.total || 0);
      setSourceCounts(data.source_counts || {});
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        onLogout && onLogout();
        return;
      }
      setError(err.message || '단어장 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout, page, filters]);

  useEffect(() => {
    load();
  }, [load]);

  // 검색어 debounce 적용
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q: qInput }));
      setPage(1);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [qInput]);

  const handleFilterChange = (patch) => {
    if ('q' in patch) {
      setQInput(patch.q);
      return;
    }
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const handleEdit = (book) => {
    setEditingBookId(book.id);
  };

  const handleDrawerClose = () => setEditingBookId(null);

  // Drawer 안에서 메타·단어 변경 시 목록 행 즉시 반영
  const handleBookUpdated = (updated) => {
    if (!updated) return;
    setItems((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
  };

  const updateBookInList = (id, patch) => {
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };

  const handleToggleBookstore = async (book) => {
    if (!book.bookstore) {
      setRegisterForBook(book);
      return;
    }
    setTogglingId(book.id);
    try {
      const json = await toggleBookstore(token, book.id, {});
      updateBookInList(book.id, { bookstore: json?.data?.bookstore });
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        onLogout && onLogout();
        return;
      }
      alert(err.message || '서점 노출 토글에 실패했습니다.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleRegistered = (data) => {
    if (registerForBook) {
      updateBookInList(registerForBook.id, { bookstore: data?.bookstore });
    }
    setRegisterForBook(null);
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-gray-300 text-sm font-semibold uppercase tracking-wide">
          단어장 관리 <span className="text-gray-600 normal-case">· 총 {total}건</span>
        </h2>
        {loading && <span className="text-xs text-gray-600">불러오는 중...</span>}
      </div>

      <VocaBookFilters
        source={filters.source}
        q={qInput}
        sort={filters.sort}
        sourceCounts={sourceCounts}
        onChange={handleFilterChange}
      />

      {error && (
        <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <VocaBookList
        items={items}
        onEdit={handleEdit}
        onToggleBookstore={handleToggleBookstore}
      />

      {editingBookId && (
        <VocaBookDetailDrawer
          token={token}
          bookId={editingBookId}
          onClose={handleDrawerClose}
          onMetaSaved={handleBookUpdated}
          onLogout={onLogout}
        />
      )}

      {registerForBook && (
        <BookstoreRegisterModal
          token={token}
          book={registerForBook}
          onClose={() => setRegisterForBook(null)}
          onRegistered={handleRegistered}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200"
          >
            이전
          </button>
          <span className="text-xs text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200"
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
};

export default VocaBooksPanel;
