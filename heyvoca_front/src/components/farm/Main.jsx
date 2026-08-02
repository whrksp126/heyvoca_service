import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CaretRight } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheet } from '../../hooks/useNewFullSheet';
import { vibrate } from '../../utils/osFunction';
import { getFarmOverviewApi, getFarmPlantsApi, markFarmMigrationSeenApi } from '../../api/farm';
import {
  CROP_STAGES,
  CROP_LABEL,
  FARM_ITEM_LABEL,
  cropLabel,
  isCritical,
  isStudiable,
} from '../../utils/crop';
import CropImage, { CROP_ASSETS } from './CropImage';
import FarmHero from './FarmHero';
import RottenListSheet from './RottenListSheet';
import StoreNewFullSheet from '../newfullsheet/StoreNewFullSheet';

const PAGE_SIZE = 30;
/**
 * 전환 안내(migration_notice)를 이미 봤는지. 서버에도 표시하지만(POST /farm/migration/seen)
 * 기기 저장을 함께 두는 이유는 응답을 기다리지 않고 즉시 닫기 위해서다 —
 * 서버 표시가 실패해도 이번 화면에서는 다시 뜨지 않는다.
 */
const MIGRATION_SEEN_KEY = 'heyvoca_farm_migration_seen';

const readMigrationSeen = () => {
  try {
    return localStorage.getItem(MIGRATION_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * 우측 상태 문구. 작물 그림이 이미 단계를 말하므로 여기서는 **언제 돌보면 되는지**만 말한다.
 * 썩은 작물은 예정이 없으므로 회색 칩으로 따로 표시한다 (기획 6.1 — 학습 대상에서 빠진다).
 */
const reviewStatus = (plant) => {
  if (!isStudiable(plant?.health)) return { text: '썩음', tone: 'rot' };

  const days = plant?.days_to_review;
  if (days === null || days === undefined) return { text: '안 배움', tone: 'muted' };
  if (days < 0) return { text: `${Math.abs(days)}일 지남`, tone: 'late' };
  if (days === 0) return { text: '오늘 물 필요', tone: 'today' };
  if (days === 1) return { text: '내일', tone: 'muted' };
  return { text: `${days}일 뒤`, tone: 'muted' };
};

const TONE_CLASS = {
  today: 'text-primary-main-600',
  late: 'text-secondary-yellow-600',
  muted: 'text-layout-gray-300',
  rot: 'text-layout-gray-400 dark:text-layout-gray-200 bg-layout-gray-50 dark:bg-layout-gray-dark px-[7px] py-[3px] rounded-full',
};

/**
 * 당근 농장 V2 — 농장 상세.
 * 단계별 그룹 탭(씨앗·새싹·이파리·당근·황금) + 그 단계의 작물 목록(커서 페이지네이션).
 * 목록 행 배치는 단어장 내부 단어 목록과 같은 규칙 — [작물][단어+뜻][우측 상태].
 */
const Main = () => {
  const { pushNewFullSheet } = useNewFullSheet();

  const [group, setGroup] = useState('seed');
  const [counts, setCounts] = useState(null);
  const [health, setHealth] = useState(null);
  const [rottenCnt, setRottenCnt] = useState(0);
  const [comeback, setComeback] = useState(null);
  const [migration, setMigration] = useState(null);
  const [migrationSeen, setMigrationSeen] = useState(readMigrationSeen);

  const [plants, setPlants] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const loadingRef = useRef(false);
  const requestRef = useRef(0);
  const sentinelRef = useRef(null);

  const loadOverview = useCallback(async () => {
    const res = await getFarmOverviewApi();
    if (res?.code === 200) {
      setCounts(res?.data?.counts || null);
      // 히어로가 밭 전체의 분위기를 정할 때 쓴다 — 손이 필요한 작물이 있으면 밭이 그렇게 보여야 한다
      setHealth(res?.data?.health || null);
      setRottenCnt(res?.data?.health?.rotten || 0);
      setComeback(res?.data?.comeback || null);
      setMigration(res?.data?.migration_notice || null);
    }
  }, []);

  const dismissMigration = () => {
    vibrate({ duration: 5 });
    // 화면은 즉시 닫고, 서버 표시는 뒤따라 보낸다. 응답을 기다리면 네트워크가 느릴 때
    // 확인 버튼이 먹히지 않은 것처럼 보인다.
    setMigrationSeen(true);
    try {
      localStorage.setItem(MIGRATION_SEEN_KEY, '1');
    } catch { /* 저장 실패해도 이번 화면에서는 닫힌다 */ }
    // 기기 저장소만으로는 "한 번만 보여 준다"를 지킬 수 없다 — 기기를 바꾸면 다시 뜬다.
    markFarmMigrationSeenApi();
  };

  // force=true 는 탭 전환·새로고침처럼 **앞선 요청을 무시하고** 새로 읽어야 하는 경우다.
  // 늦게 도착한 이전 요청의 응답은 requestRef 로 걸러 버린다.
  const loadPage = useCallback(async (targetGroup, nextCursor, { force = false } = {}) => {
    if (loadingRef.current && !force) return;
    const requestId = ++requestRef.current;
    loadingRef.current = true;
    setLoading(true);

    const res = await getFarmPlantsApi({
      group: targetGroup,
      limit: PAGE_SIZE,
      cursor: nextCursor,
    });

    if (requestId !== requestRef.current) return;

    if (res?.code === 200) {
      const data = res?.data || {};
      const list = Array.isArray(data.items) ? data.items : [];
      setPlants((prev) => (nextCursor ? [...prev, ...list] : list));
      setCursor(data.next_cursor ?? null);
      setHasMore(!!data.next_cursor && list.length > 0);
      setFailed(false);
    } else {
      if (!nextCursor) setPlants([]);
      setHasMore(false);
      setFailed(true);
    }

    setLoading(false);
    loadingRef.current = false;
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // 탭이 바뀌면 처음부터 다시 읽는다
  useEffect(() => {
    setPlants([]);
    setCursor(null);
    setHasMore(true);
    loadPage(group, null, { force: true });
  }, [group, loadPage]);

  // 센티넬이 뷰포트에 들어오면 다음 페이지 (200px 선반영)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((obs) => {
      if (obs[0]?.isIntersecting) loadPage(group, cursor);
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
    // plants.length — 화면이 길어 한 페이지로 채워지지 않으면 다음 페이지를 이어 읽는다
  }, [hasMore, cursor, group, loadPage, plants.length]);

  const refresh = useCallback(() => {
    loadOverview();
    setPlants([]);
    setCursor(null);
    setHasMore(true);
    loadPage(group, null, { force: true });
  }, [group, loadOverview, loadPage]);

  // 삽·회복제가 모자랄 때 상점 도구 탭으로 보낸다. 돌보기 시트 위에 얹으므로
  // 상점을 닫으면 고르던 목록이 그대로 남는다(선택이 날아가지 않는다).
  const openRottenSheet = () => {
    vibrate({ duration: 5 });
    pushNewFullSheet(
      RottenListSheet,
      { onChanged: refresh, onOpenShop: openToolShop },
      { smFull: true, closeOnBackdropClick: true },
    );
  };

  const openToolShop = () => {
    pushNewFullSheet(
      StoreNewFullSheet,
      {
        initialTab: 'tools',
        // 구매 결과의 "썩은 작물 보러 가기"(shop-result §2⑤) — 상점을 닫고 썩은 목록을 연다.
        // 넘기지 않으면 시트만 닫혀 그 버튼이 아무 데도 데려가지 못한다.
        onGoRotten: openRottenSheet,
        onInventoryChanged: refresh,
      },
      { smFull: true, closeOnBackdropClick: true },
    );
  };

  const handleGroup = (next) => {
    if (next === group) return;
    vibrate({ duration: 5 });
    setGroup(next);
  };

  const empty = !loading && !failed && plants.length === 0;

  return (
    <div
      className="
        flex flex-col
        h-[calc(100vh-var(--current-header-height)-var(--current-bottom-nav-height)-var(--status-bar-height))]
      "
    >
      {/* 전환 안내 — 예전 기록이 농장으로 어떻게 옮겨졌는지 한 번만 알린다 (기획 15.3) */}
      {migration && !migrationSeen && (
        <div className="mx-[16px] mt-[12px] px-[13px] py-[12px] rounded-[12px] bg-crop-sprout-bg">
          <p className="text-[13.5px] font-[700] text-layout-black dark:text-layout-white">
            농장이 새로 열렸어요
          </p>
          <p className="text-[12.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 leading-[1.55] mt-[3px]">
            지금까지의 학습 기록을 그대로 농장으로 옮겼어요.
            {migration.auto_recovered > 0 && ` 작물 ${migration.auto_recovered}개는 촉촉한 상태로 다시 심어 두었어요.`}
          </p>
          {(migration.shovel > 0 || migration.nutrient > 0 || migration.shield > 0 || migration.gem > 0) && (
            <p className="text-[12.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 leading-[1.55] mt-[3px]">
              시작 선물도 창고에 넣어 두었어요 —{' '}
              {[
                migration.shovel > 0 && `${FARM_ITEM_LABEL.SHOVEL} ${migration.shovel}개`,
                migration.nutrient > 0 && `${FARM_ITEM_LABEL.NUTRIENT} ${migration.nutrient}개`,
                migration.shield > 0 && `${FARM_ITEM_LABEL.SHIELD} ${migration.shield}개`,
                migration.gem > 0 && `보석 ${migration.gem}개`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          <motion.button
            type="button"
            onClick={dismissMigration}
            whileTap={{ scale: 0.97 }}
            className="mt-[10px] h-[32px] px-[14px] rounded-full bg-layout-white dark:bg-layout-black text-[12.5px] font-[700] text-primary-main-600"
          >
            확인했어요
          </motion.button>
        </div>
      )}

      {/* 복귀 미션 — 며칠만 이어가면 썩은 작물을 한 번에 되살려 준다 (기획 7.4) */}
      {comeback && (
        <div className="mx-[16px] mt-[12px] px-[13px] py-[12px] rounded-[12px] bg-primary-main-50 dark:bg-primary-main-dark">
          <p className="text-[13.5px] font-[700] text-layout-black dark:text-layout-white">
            다시 와서 반가워요
          </p>
          <p className="text-[12.5px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 leading-[1.55] mt-[3px]">
            {comeback.required_days}일 동안 가볍게 이어가면 쉬는 동안 마른 작물을 한 번에 되살려 드려요.
          </p>
          <div className="flex items-center gap-[8px] mt-[9px]">
            <div className="flex-1 h-[6px] rounded-full bg-layout-white dark:bg-layout-black overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-main-600"
                style={{
                  width: `${Math.min(100, Math.round(
                    ((comeback.progress_days ?? 0) / Math.max(1, comeback.required_days ?? 1)) * 100
                  ))}%`,
                }}
              />
            </div>
            <span className="flex-shrink-0 text-[12px] font-[700] text-primary-main-600">
              {comeback.progress_days ?? 0} / {comeback.required_days ?? 0}일
            </span>
          </div>
        </div>
      )}

      {/* 돌볼 작물 진입 — 개수를 크게 내세우지 않는다 (기획 7.4) */}
      {rottenCnt > 0 && (
        <motion.button
          type="button"
          onClick={openRottenSheet}
          whileTap={{ scale: 0.99 }}
          className="flex items-center gap-[11px] mx-[16px] mt-[12px] mb-[4px] px-[13px] py-[11px] rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark text-left"
        >
          <img
            src={CROP_ASSETS.mascotWatering}
            alt=""
            draggable={false}
            className="w-[34px] h-[34px] object-contain select-none flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-[700] text-layout-black dark:text-layout-white">
              오늘 돌볼 작물이 있어요
            </p>
            <p className="text-[12px] font-[400] text-layout-gray-400 dark:text-layout-gray-200 mt-[1px]">
              가볍게 몇 개만 살펴볼까요?
            </p>
          </div>
          <CaretRight size={16} className="text-layout-gray-200 flex-shrink-0" />
        </motion.button>
      )}

      {/* 작물 목록 — 히어로와 탭이 함께 스크롤된다.
          히어로를 고정으로 두면 420px 를 늘 깔고 앉아 목록이 볼 수 없을 만큼 좁아진다.
          대신 탭은 sticky 라 목록을 내리는 동안에도 단계를 바꿀 수 있다. */}
      <div className="flex-1 overflow-y-auto">
        <FarmHero counts={counts} health={health} onSelectGroup={handleGroup} />

      {/* 단계 그룹 탭 */}
      <div className="
        sticky top-0 z-[15]
        flex gap-[6px] px-[16px] pt-[12px] pb-[10px] overflow-x-auto scrollbar-hide flex-shrink-0
        bg-layout-white dark:bg-layout-black
      ">
        {CROP_STAGES.map((stage) => {
          const on = stage === group;
          const cnt = counts ? counts[stage] : null;
          return (
            <motion.button
              key={stage}
              type="button"
              onClick={() => handleGroup(stage)}
              whileTap={{ scale: 0.96 }}
              className={`
                flex-shrink-0 flex items-center gap-[5px]
                h-[30px] px-[11px] rounded-full
                text-[12.5px] font-[700] whitespace-nowrap
                ${on
                  ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
                  : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
              `}
            >
              <CropImage stage={stage} health="FRESH" size={16} />
              {CROP_LABEL[stage]}
              {cnt !== null && cnt !== undefined && (
                <span className="font-[800]">{cnt}</span>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="px-[16px]">
        {plants.map((plant) => {
          const status = reviewStatus(plant);
          const rotten = !isStudiable(plant.health);
          const critical = isCritical(plant.health);
          const stage = plant.crop || plant.stage;

          const row = (
            <>
              {/* CRITICAL 은 시듦과 그림이 같아 테두리로 구분한다 (프론트 계약 2절) */}
              <span
                className={`
                  flex items-center justify-center flex-shrink-0 w-[34px] h-[34px] rounded-[8px]
                  ${critical ? 'bg-secondary-yellow-100 dark:bg-secondary-yellow-dark ring-1 ring-secondary-yellow-400' : ''}
                `}
              >
                <CropImage stage={stage} health={plant.health} size={30} />
              </span>
              <div className={`flex-1 min-w-0 ${rotten ? 'opacity-70' : ''}`}>
                <div className="flex items-center gap-[5px]">
                  <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white truncate">
                    {plant.word}
                  </span>
                </div>
                <div className="text-[12px] text-layout-gray-400 truncate mt-[1px]">
                  {plant.meaning}
                </div>
              </div>
              <span className={`flex-shrink-0 text-[11.5px] font-[700] text-right ${TONE_CLASS[status.tone]}`}>
                {status.text}
              </span>
              {rotten && <CaretRight size={13} className="text-layout-gray-200 flex-shrink-0" />}
            </>
          );

          // 썩은 작물은 회복 전까지 학습할 수 없다 → 행을 누르면 돌보기 화면으로 간다 (기획 6.1)
          return rotten ? (
            <button
              type="button"
              key={plant.user_voca_id}
              onClick={openRottenSheet}
              className="flex items-center gap-[11px] w-full h-[58px] border-b border-[#F4F4F4] dark:border-border-dark text-left"
            >
              {row}
            </button>
          ) : (
            <div
              key={plant.user_voca_id}
              className="flex items-center gap-[11px] h-[58px] border-b border-[#F4F4F4] dark:border-border-dark"
            >
              {row}
            </div>
          );
        })}

        {loading && (
          <div className="py-[18px] text-center text-[12.5px] font-[400] text-layout-gray-300">
            불러오는 중이에요
          </div>
        )}

        {failed && !loading && (
          <div className="flex flex-col items-center gap-[10px] py-[48px]">
            <p className="text-[13px] font-[400] text-layout-gray-300 text-center leading-[1.55]">
              작물을 불러오지 못했어요.
              <br />
              잠시 뒤 다시 시도해 주세요.
            </p>
            <motion.button
              type="button"
              onClick={() => { vibrate({ duration: 5 }); refresh(); }}
              whileTap={{ scale: 0.97 }}
              className="h-[36px] px-[16px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-200"
            >
              다시 불러오기
            </motion.button>
          </div>
        )}

        {empty && (
          <div className="flex flex-col items-center gap-[10px] py-[48px]">
            <CropImage stage={group} health="FRESH" size={56} />
            <p className="text-[13.5px] font-[700] text-layout-black dark:text-layout-white">
              아직 {cropLabel(group)} 단계의 작물이 없어요
            </p>
            <p className="text-[12.5px] font-[400] text-layout-gray-300 text-center leading-[1.55]">
              오늘의 학습을 이어가면 이 자리도 차올라요.
            </p>
          </div>
        )}

        <div ref={sentinelRef} className="h-[1px]" />
        <div className="h-[16px]" />
        </div>
      </div>
    </div>
  );
};

export default Main;
