// src/components/admin/VocaBookDetailDrawer.jsx
// 단어장 상세/편집 우측 슬라이드 드로어.
import React, { useEffect, useState } from 'react';
import { getVocaBook } from '@/api/adminVocaBooks';
import VocaBookMetaForm from './VocaBookMetaForm';
import VocaWordRow from './VocaWordRow';
import VocaWordAddForm from './VocaWordAddForm';
import BookstoreInfoForm from './BookstoreInfoForm';
import BookstoreRegisterModal from './BookstoreRegisterModal';

const STORAGE_KEY = 'heyvoca_admin_token';

const VocaBookDetailDrawer = ({ token, bookId, onClose, onMetaSaved, onLogout }) => {
  "use memo";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [book, setBook] = useState(null);
  const [bookstore, setBookstore] = useState(null);
  const [words, setWords] = useState([]);
  const [wordFilter, setWordFilter] = useState('');
  const [showRegister, setShowRegister] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const json = await getVocaBook(token, bookId);
      const b = json?.data?.book || null;
      setBook(b);
      setBookstore(b?.bookstore || null);
      setWords(json?.data?.words || []);
    } catch (err) {
      if (err.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        onLogout && onLogout();
        return;
      }
      setError(err.message || '단어장 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (bookId) load();
  }, [bookId]);

  const handleMetaSaved = (updated) => {
    setBook(updated);
    onMetaSaved && onMetaSaved(updated);
  };

  const handleBookstoreChanged = (nextBookstore) => {
    setBookstore(nextBookstore || null);
    if (book) {
      const merged = { ...book, bookstore: nextBookstore || null };
      setBook(merged);
      onMetaSaved && onMetaSaved(merged);
    }
  };

  const handleRegistered = (data) => {
    setShowRegister(false);
    handleBookstoreChanged(data?.bookstore);
  };

  const handleWordUpdated = (updated) => {
    setWords((prev) => prev.map((w) =>
      w.map_id === updated.map_id
        ? { ...w, meanings: updated.meanings, examples: updated.examples, level: updated.level, parse_error: false }
        : w
    ));
  };

  const handleWordDeleted = (mapId) => {
    setWords((prev) => prev.filter((w) => w.map_id !== mapId));
    setBook((prev) => prev ? { ...prev, word_count: Math.max(0, (prev.word_count || 0) - 1) } : prev);
    onMetaSaved && book && onMetaSaved({ ...book, word_count: Math.max(0, (book.word_count || 0) - 1) });
  };

  const handleWordAdded = (added) => {
    const newRow = {
      map_id: added.map_id,
      voca_id: added.voca_id,
      word: added.word,
      pronunciation: added.pronunciation,
      verb_forms: added.verb_forms,
      voca_level: added.voca_level,
      level: added.level,
      meanings: added.meanings || [],
      examples: added.examples || [],
      raw_meanings: null,
      raw_examples: null,
      parse_error: false,
      is_active: true,
    };
    setWords((prev) => [...prev, newRow]);
    setBook((prev) => prev ? { ...prev, word_count: (prev.word_count || 0) + 1 } : prev);
    onMetaSaved && book && onMetaSaved({ ...book, word_count: (book.word_count || 0) + 1 });
  };

  const filteredWords = wordFilter
    ? words.filter((w) =>
        (w.word || '').toLowerCase().includes(wordFilter.toLowerCase()) ||
        (w.meanings || []).some((m) => m.includes(wordFilter))
      )
    : words;

  return (
    <div className="fixed inset-0 z-30 flex" role="dialog" aria-modal="true">
      <div
        className="flex-1 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside className="w-full max-w-2xl h-full bg-gray-950 border-l border-gray-800 flex flex-col">
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="min-w-0">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide">
              단어장 #{bookId}
            </div>
            <div className="text-base font-semibold text-white truncate">
              {book?.book_nm || '...'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200"
          >
            닫기
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
          {loading && (
            <div className="text-center text-gray-600 text-sm py-12">불러오는 중...</div>
          )}
          {error && (
            <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/50 rounded-xl px-4 py-3">
              {error}
            </div>
          )}

          {!loading && book && (
            <>
              <VocaBookMetaForm token={token} book={book} onSaved={handleMetaSaved} />

              <BookstoreInfoForm
                token={token}
                book={book}
                bookstore={bookstore}
                onChanged={handleBookstoreChanged}
                onOpenRegister={() => setShowRegister(true)}
              />

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-gray-300 text-xs font-semibold uppercase tracking-wide">
                    단어 <span className="text-gray-600 normal-case">({words.length})</span>
                  </h3>
                  <input
                    type="text"
                    placeholder="단어/의미 필터"
                    value={wordFilter}
                    onChange={(e) => setWordFilter(e.target.value)}
                    className="bg-gray-900 border border-gray-700 text-xs text-gray-200 rounded px-2 py-1 w-44 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <VocaWordAddForm
                  token={token}
                  bookId={bookId}
                  onAdded={handleWordAdded}
                />

                <div className="space-y-2">
                  {filteredWords.length === 0 ? (
                    <div className="text-center text-gray-600 text-xs py-8">
                      {wordFilter ? '필터에 맞는 단어가 없습니다.' : '단어가 없습니다.'}
                    </div>
                  ) : (
                    filteredWords.map((w) => (
                      <VocaWordRow
                        key={w.map_id}
                        token={token}
                        bookId={bookId}
                        word={w}
                        onUpdated={handleWordUpdated}
                        onDeleted={handleWordDeleted}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {showRegister && book && (
          <BookstoreRegisterModal
            token={token}
            book={book}
            onClose={() => setShowRegister(false)}
            onRegistered={handleRegistered}
          />
        )}
      </aside>
    </div>
  );
};

export default VocaBookDetailDrawer;
