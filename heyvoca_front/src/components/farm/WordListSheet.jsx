// src/components/farm/WordListSheet.jsx
//
// 홈 "지금 볼 만한 단어" 카드들의 전체 목록 풀시트.
//
// 헤더·행·페이지네이션 규격은 같은 성격의 기존 시트인 RottenListSheet 를 그대로 따른다
// (새 규격을 만들지 않는다 — 헤더 55px·CaretLeft 뒤로가기·행 h-58px·구분선 #F4F4F4 등).
// 다만 여기는 선택·복구 같은 조작이 없는 **읽기 전용 목록**이라 그 부분만 걷어냈다.
//
// 두 가지 모드로 쓴다.
//   정적(items)  이미 클라이언트에 전체 목록이 있을 때 — 오늘 자란 단어(todayChanges를
//                그대로 합친 값) · 최근에 심은 단어 · 지금 물이 필요한 단어(둘 다 홈 피드
//                캐시를 limit 20으로 올려 그대로 재사용, 추가 API 호출 없음).
//   페이지드(paged) 총량이 커서(수십~백 단위) 커서 페이지네이션이 필요한 "아직 심지 않은
//                씨앗" 전용. GET /farm/plants?group=unplanted 를 스크롤에 맞춰 이어 부른다.
//
// 행을 눌러도 단어 상세 시트를 열지 않는다 — 여기 넘어오는 행(user_voca_id)은
// WordDetaileNewBottomSheet 가 요구하는 (vocabularySheetId, id) 쌍이 아니라서, 그 매핑을
// 새로 만들어야 하는데 이번 범위에 없다(보고 참고). 목록만 정확히 보여주는 쪽을 택했다.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';
import { getFarmPlantsApi } from '../../api/farm';
import CropImage, { CROP_ASSETS } from './CropImage';
import { HEALTH_STATES } from '../../utils/crop';

const PAGE_SIZE = 20;

/**
 * @param {string}   title       헤더 타이틀
 * @param {array}    [items]     정적 모드 — 전체 목록(이미 다 갖고 있을 때)
 * @param {boolean}  [paged]     페이지드 모드 — true면 /farm/plants?group=unplanted 를 커서로 이어 부른다
 * @param {string}   [emptyText] 빈 목록일 때 문구
 * @param {string}   [ctaLabel]  하단 고정 버튼 글자(있을 때만 버튼을 그린다)
 * @param {function} [onCta]     하단 버튼을 눌렀을 때 — 시트를 먼저 닫고 나서 호출한다
 */
const WordListSheet = ({ title, items, paged = false, emptyText = '목록이 비어 있어요', ctaLabel, onCta }) => {
  const { popNewFullSheet } = useNewFullSheetActions();

  const [pagedItems, setPagedItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(paged);
  const [loading, setLoading] = useState(paged);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);

  const loadPage = useCallback(async (nextCursor) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const res = await getFarmPlantsApi({ group: 'unplanted', limit: PAGE_SIZE, cursor: nextCursor });
    if (res?.code === 200) {
      const data = res?.data || {};
      const list = Array.isArray(data.items) ? data.items : [];
      setPagedItems((prev) => (nextCursor ? [...prev, ...list] : list));
      setCursor(data.next_cursor ?? null);
      setHasMore(!!data.next_cursor && list.length > 0);
    } else {
      setHasMore(false);
    }

    setLoading(false);
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    if (paged) loadPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged]);

  // 센티넬이 뷰포트에 들어오면 다음 페이지 (200px 선반영) — RottenListSheet 와 같은 방식
  useEffect(() => {
    if (!paged) return;
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((obs) => {
      if (obs[0]?.isIntersecting) loadPage(cursor);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [paged, hasMore, cursor, loadPage]);

  const rows = paged ? pagedItems : (items || []);
  const empty = !loading && rows.length === 0;

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>

      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-border dark:border-border-dark bg-layout-white dark:bg-layout-black"
      >
        <motion.button
          type="button"
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileTap={{ scale: 0.95 }}
          aria-label="닫기"
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white whitespace-nowrap">
          {title}
        </h1>
        <div />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-[16px]">
          {rows.map((it, idx) => (
            <div
              key={it.user_voca_id ?? `${it.word}-${idx}`}
              className="flex items-center gap-[11px] w-full h-[58px] border-b border-[#F4F4F4] dark:border-border-dark"
            >
              <CropImage
                stage={it.stage || it.crop}
                health={it.health || HEALTH_STATES.FRESH}
                size={40}
                className="flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
                  {it.word}
                </div>
                {it.meaning ? (
                  <div className="text-[12px] text-layout-gray-400 dark:text-layout-gray-300 truncate mt-[1px]">
                    {it.meaning}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {loading && (
            <div className="py-[18px] text-center text-[12.5px] font-[400] text-layout-gray-300">
              불러오는 중이에요
            </div>
          )}

          {empty && (
            <div className="flex flex-col items-center gap-[10px] py-[48px]">
              <img
                src={CROP_ASSETS.mascotHouse}
                alt=""
                draggable={false}
                className="w-[80px] h-[80px] object-contain select-none"
              />
              <p className="text-[13.5px] font-[700] text-layout-black dark:text-layout-white">
                {emptyText}
              </p>
            </div>
          )}

          {paged && <div ref={sentinelRef} className="h-[1px]" />}
        </div>

        <div className="h-[24px]" />
      </div>

      {/* 하단 고정 CTA — 예: 씨앗 시트의 "씨앗 심으러 가기". 누르면 시트부터 닫는다. */}
      {ctaLabel && onCta && (
        <div className="flex-shrink-0 border-t border-border dark:border-border-dark bg-layout-white dark:bg-layout-black px-[16px] pt-[12px]">
          <motion.button
            type="button"
            onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); onCta(); }}
            whileTap={{ scale: 0.97 }}
            className="w-full h-[52px] rounded-[12px] bg-primary-main-600 text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]"
          >
            {ctaLabel}
          </motion.button>
          <div style={{ height: 'calc(var(--safe-area-bottom) + 12px)' }} />
        </div>
      )}
    </div>
  );
};

export default WordListSheet;
