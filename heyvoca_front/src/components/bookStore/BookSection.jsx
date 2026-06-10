import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from '@phosphor-icons/react';
import { useVocabulary } from '../../context/VocabularyContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { PreviewBookStoreNewFullSheet } from '../newfullsheet/PreviewBookStoreNewFullSheet';
import { BuyEmptyBookNewBottomSheet } from '../newBottomSheet/BuyEmptyBookNewBottomSheet';
import { getBookStoreDetailApi, getRecommendedBookStoreApi } from '../../api/bookStore';
import { vibrate } from '../../utils/osFunction';
import gem from '../../assets/images/gem.png';

const ALL_CATEGORY = '전체';
const EMPTY_BOOK_PRICE = 10;
const RECOMMEND_LIMIT = 3;

const BookCard = ({ item, onClick, className = '' }) => (
  <motion.li
    key={item.id}
    style={{ backgroundColor: item.color.background }}
    className={`
      flex flex-col gap-[15px] justify-between
      p-[20px]
      rounded-[12px]
      cursor-pointer
      shadow-sm
      aspect-square
      ${className}
    `}
    whileTap={{ scale: 0.96 }}
    whileHover={{ scale: 1.04 }}
    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
    onClick={onClick}
  >
    <div className="flex flex-col gap-[5px]">
      {item.category && (
        <div
          style={{ backgroundColor: item.color.main }}
          className="flex items-center justify-center w-[max-content] px-[6px] py-[3px] rounded-[20px] text-[8px] font-[700] text-layout-white"
        >
          {item.category}
        </div>
      )}
      <h2 className="font-[700] text-[16px] text-layout-black">{item.name}</h2>
    </div>
    <div className="flex items-end justify-between">
      <span className="flex items-center gap-[2px] text-[14px] font-[600] text-layout-black">
        <img src={gem} alt="보석" className="w-[17px] h-[15px]" /> {item.gem}
      </span>
      <div
        style={{ color: item.color.main, backgroundColor: item.color.sub }}
        className="flex items-center justify-center w-[30px] h-[30px] rounded-[50px] text-[16px]"
      >
        <Plus />
      </div>
    </div>
  </motion.li>
);

const BookSection = () => {
  "use memo";

  const { isBookStoreLoading, bookStore } = useVocabulary();
  const { pushNewFullSheet } = useNewFullSheetActions();
  const { pushNewBottomSheet } = useNewBottomSheetActions();

  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [recommendedBooks, setRecommendedBooks] = useState([]);
  const [isRecommendedLoading, setIsRecommendedLoading] = useState(false);

  const categories = useMemo(() => {
    const set = new Set();
    bookStore.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return [ALL_CATEGORY, ...Array.from(set)];
  }, [bookStore]);

  const filteredBooks = useMemo(() => {
    if (selectedCategory === ALL_CATEGORY) return bookStore;
    return bookStore.filter((b) => b.category === selectedCategory);
  }, [bookStore, selectedCategory]);

  const usesScrollableRecommendations = recommendedBooks.length >= 3;

  useEffect(() => {
    let isMounted = true;

    const fetchRecommendedBooks = async () => {
      try {
        setIsRecommendedLoading(true);
        const result = await getRecommendedBookStoreApi(RECOMMEND_LIMIT);
        if (!isMounted || result?.code !== 200) {
          if (isMounted) setRecommendedBooks([]);
          return;
        }

        const recommendations = Array.isArray(result?.data?.recommendations)
          ? result.data.recommendations
          : [];
        const visibleRecommendations = recommendations
          .filter((item) => !item.owned)
          .slice(0, RECOMMEND_LIMIT);
        setRecommendedBooks(visibleRecommendations);
      } catch (error) {
        if (isMounted) {
          console.error('추천 단어장 조회 오류:', error);
          setRecommendedBooks([]);
        }
      } finally {
        if (isMounted) setIsRecommendedLoading(false);
      }
    };

    fetchRecommendedBooks();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleBookStoreClick = async (id) => {
    try {
      vibrate({ duration: 5 });
      setIsLoadingDetail(true);
      const result = await getBookStoreDetailApi(id);
      if (result && result.code === 200) {
        pushNewFullSheet(PreviewBookStoreNewFullSheet, {
          bookStoreVocabularySheet: result.data,
        });
      } else {
        alert('단어장 정보를 가져오는데 실패했습니다.');
      }
    } catch (error) {
      console.error('서점 상세 조회 오류:', error);
      alert('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleEmptyBookClick = () => {
    vibrate({ duration: 5 });
    pushNewBottomSheet(BuyEmptyBookNewBottomSheet, {});
  };

  if (isBookStoreLoading) {
    return (
      <section className="flex flex-col gap-[16px] py-[20px]">
        <h3 className="text-center text-[16px] font-[700] text-layout-black dark:text-layout-white">
          단어장
        </h3>
        <div className="flex items-center justify-center py-[40px]">
          <p className="text-[14px] text-layout-gray-200">로딩 중...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex flex-col gap-[16px] py-[20px]">
      <h3 className="text-center text-[16px] font-[700] text-layout-black dark:text-layout-white">
        단어장
      </h3>

      {!isRecommendedLoading && recommendedBooks.length > 0 && (
        <div className="flex flex-col gap-[10px] px-[16px]">
          <div className="flex flex-col gap-[2px]">
            <h4 className="text-[16px] font-[700] text-layout-black dark:text-layout-white">
              추천 단어장
            </h4>
            <p className="text-[12px] font-[500] text-layout-gray-300">
              현재 레벨에 맞춰 골랐어요
            </p>
          </div>
          <ul
            className={
              usesScrollableRecommendations
                ? 'flex gap-[15px] overflow-x-auto scrollbar-hide pb-[4px] -mx-[16px] px-[16px]'
                : 'grid grid-cols-2 gap-[15px]'
            }
          >
            {recommendedBooks.map((item) => (
              <BookCard
                key={`recommended-${item.id}`}
                item={item}
                onClick={() => handleBookStoreClick(item.id)}
                className={usesScrollableRecommendations ? 'w-[160px] min-w-[160px] flex-shrink-0' : ''}
              />
            ))}
          </ul>
        </div>
      )}

      {/* 카테고리 필터 칩 */}
      <div className="px-[16px]">
        <div className="flex gap-[8px] overflow-x-auto scrollbar-hide">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  vibrate({ duration: 5 });
                  setSelectedCategory(cat);
                }}
                className={`
                  flex-shrink-0
                  inline-flex items-center justify-center
                  h-[25px] px-[10px]
                  rounded-[50px]
                  border-[1px]
                  text-[12px] font-[700] leading-none
                  ${isSelected
                    ? 'border-primary-main-600 text-primary-main-600'
                    : 'border-layout-gray-200 text-layout-gray-200'
                  }
                `}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* 카드 그리드 */}
      <ul className="grid grid-cols-2 gap-[15px] px-[16px]">
        {selectedCategory === ALL_CATEGORY && (
          <motion.li
            key="empty-book"
            className="
              flex flex-col gap-[15px] justify-between
              p-[20px]
              rounded-[12px]
              cursor-pointer
              shadow-sm
              aspect-square
              bg-layout-gray-50
            "
            whileTap={{ scale: 0.96 }}
            whileHover={{ scale: 1.04 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            onClick={handleEmptyBookClick}
          >
            <div className="flex flex-col gap-[5px]">
              <div className="flex items-center justify-center w-[max-content] px-[6px] py-[3px] rounded-[20px] bg-layout-gray-400 text-[8px] font-[700] text-layout-white">
                CUSTOM
              </div>
              <h2 className="font-[700] text-[16px] text-layout-black">빈 단어장</h2>
            </div>
            <div className="flex items-end justify-between">
              <span className="flex items-center gap-[2px] text-[14px] font-[600] text-layout-black">
                <img src={gem} alt="보석" className="w-[17px] h-[15px]" /> {EMPTY_BOOK_PRICE}
              </span>
              <div className="flex items-center justify-center w-[30px] h-[30px] rounded-[50px] bg-layout-gray-100 text-layout-gray-300">
                <Plus />
              </div>
            </div>
          </motion.li>
        )}

        {filteredBooks.map((item) => (
          <BookCard
            key={item.id}
            item={item}
            onClick={() => handleBookStoreClick(item.id)}
          />
        ))}
      </ul>

      {/* 상세 정보 로딩 오버레이 */}
      <AnimatePresence>
        {isLoadingDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-layout-white/60 dark:bg-layout-black/60 backdrop-blur-[2px]"
          >
            <div className="flex flex-col items-center gap-[10px]">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-[30px] h-[30px] border-[3px] border-primary-main-600 border-t-transparent rounded-full"
              />
              <p className="text-[14px] font-[600] text-layout-black dark:text-layout-white">
                정보를 가져오는 중...
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default BookSection;
