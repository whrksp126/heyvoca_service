// src/components/admin/VocaBooksPanel.jsx
// 단어장 관리 탭 컨테이너. 필터/검색/정렬 + 목록(무한 스크롤) + 편집 Drawer.
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
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState({ source: 'all', q: '' });
  const [sortBy, setSortBy] = useState('updated_at');
  const [sortDir, setSortDir] = useState('desc');
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

  // 무한 스크롤 sentinel
  const sentinelRef = useRef(null);

  // 페이지 단위로 목록 fetch.
  // mode='reset' → items 교체 + page=1, mode='append' → items 누적 + 다음 page.
  const load = useCallback(async (pageToLoad, mode) => {
    setLoading(true);
    setError('');
    try {
      const json = await listVocaBooks(token, {
        page: pageToLoad,
        pageSize: PAGE_SIZE,
        source: filters.source,
        q: filters.q,
        sortBy,
        sortDir,
      });
      const data = json?.data ?? {};
      const newItems = data.items || [];
      setItems((prev) => (mode === 'append' ? [...prev, ...newItems] : newItems));
      setTotal(data.total || 0);
      setSourceCounts(data.source_counts || {});
      setHasMore(newItems.length === PAGE_SIZE);
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        onLogout && onLogout();
        return;
      }
      setError(err.message || '단어장 목록을 불러오지 못했습니다.');
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [token, onLogout, filters, sortBy, sortDir]);

  // 필터/정렬 변경 시 1페이지부터 새로 로드 (items 교체)
  useEffect(() => {
    setPage(1);
    setHasMore(true);
    load(1, 'reset');
    // load는 deps에 filters/sortBy/sortDir 포함되므로 변경 시 재생성됨
  }, [load]);

  // 페이지 증가 시 누적 로드
  useEffect(() => {
    if (page === 1) return;
    load(page, 'append');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // 검색어 debounce 적용
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, q: qInput }));
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [qInput]);

  // IntersectionObserver — sentinel이 보이면 다음 페이지 로드
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !loading) {
          setPage((p) => p + 1);
        }
      },
      { rootMargin: '200px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [hasMore, loading]);

  const handleFilterChange = (patch) => {
    if ('q' in patch) {
      setQInput(patch.q);
      return;
    }
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  const handleSortChange = (nextSortBy, nextSortDir) => {
    setSortBy(nextSortBy);
    setSortDir(nextSortDir);
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
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={handleSortChange}
        onEdit={handleEdit}
        onToggleBookstore={handleToggleBookstore}
      />

      {/* 무한 스크롤 sentinel + 상태 표시 */}
      {items.length > 0 && (
        <div ref={sentinelRef} className="py-6 text-center text-xs text-gray-600">
          {loading
            ? '불러오는 중...'
            : hasMore
              ? '아래로 스크롤하면 더 불러옵니다'
              : `모두 불러왔습니다 (${items.length} / ${total})`}
        </div>
      )}

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
    </section>
  );
};

export default VocaBooksPanel;
