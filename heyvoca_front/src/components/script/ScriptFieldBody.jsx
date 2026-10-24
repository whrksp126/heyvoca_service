// src/components/script/ScriptFieldBody.jsx
//
// 글자(문자 학습) 그리드 — 학습장의 "글자" 탭 본문. 2026-09-30 개편: 글자 학습 세션을 더는
// 별도 풀시트(예전 ScriptSessionNewFullSheet)로 돌리지 않고, 학습하기(TakeTest, testType=
// 'script') 안에서 일반 단어 학습과 똑같은 화면(진행바·O/X·농장 상태 바·재출제·결과 화면)으로
// 돌린다 — 글자 하나 = 단어 하나로 취급해 FSRS·작물 성장이 단어와 동일하게 굴러간다.
//
// 2026-09-30 재개편(듀오링고 문자 탭 방식): 줄 단위 "이 줄 배우기"·"이미 알아요" 진입점을
// 없앴다. 행 헤더는 이제 라벨만 표시하고(ScriptRow), 칸(ScriptCell)을 탭하면 소리만
// 들려준다(2026-10-24 상세 시트 폐지). 상단에는 홈 주 CTA와 같은 전폭 버튼을 둔다 — 안 배운 글자가 남았으면 격자 순서대로 다음
// 글자 배우기, 다 배웠으면 "글자 연습하기"(mode=review, 서버가 XP 낮은 글자를 우선).
//
// 진행도는 GET /script/progress(계약: heyvoca_back 동시 구현)가 단어와 같은 visual_stage
// 문자열을 내려줘서, 이 그리드와 학습 결과 화면(StudyResult.jsx)이 같은 CropImage 규칙을 쓴다.

import React, {
  useEffect, useMemo, useRef, useState, useCallback,
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { ensureScriptApi, getScriptSessionApi } from '../../api/script';
import {
  SCRIPT_LABEL,
  scriptsForLearningLang,
  buildScriptGroups,
  mergeProgress,
  mapScriptSessionItem,
  buildDistractorPool,
  practicableItems,
  isStarted,
} from '../../utils/scriptData';
import { motion } from 'framer-motion';
import { Plus, ArrowsClockwise, CircleNotch } from '@phosphor-icons/react';
import { haptic, SPRING, TAP } from '../../lib/feel';
import ScriptRow from './ScriptRow';
import { vibrate, showToast } from '../../utils/osFunction';

// 스크립트별(히라가나/가타카나/알파벳 등) 진행도 메모리 캐시 — 모듈 스코프. 이 컴포넌트는
// TabShell이 항상 마운트해 두므로(components/TabShell.jsx) /take-test를 오가도 리마운트되지
// 않는다 — 캐시 무효화는 아래 awaitingReturnRef + location 이펙트가 명시적으로 처리한다.
const scriptProgressCache = new Map(); // script -> items[]

const ScriptFieldBody = () => {
  "use memo";

  const navigate = useNavigate();
  const location = useLocation();
  const { learningLang } = useUser();

  const availableScripts = useMemo(() => scriptsForLearningLang(learningLang), [learningLang]);
  const [activeScript, setActiveScript] = useState(availableScripts[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [starting, setStarting] = useState(false);
  // 이 탭(학습장 "글자")은 TabShell이 항상 마운트해 둔다(components/TabShell.jsx) —
  // /take-test로 갔다가 돌아와도 이 컴포넌트는 언마운트·재마운트되지 않는다. 그래서
  // startSession이 세션을 시작하기 직전에 이 플래그를 세워 두고, /vocabulary-sheets로
  // 되돌아온 순간(location.pathname 변화 — TabShell처럼 숨겨져 있어도 useLocation은
  // 갱신된다)을 감지해 진행도를 다시 불러온다. 이게 없으면 방금 학습한 글자의 작물이
  // 그리드에 반영되지 않은 채 남는다.
  const awaitingReturnRef = useRef(false);

  useEffect(() => {
    if (location.pathname !== '/vocabulary-sheets') return;
    if (!awaitingReturnRef.current) return;
    awaitingReturnRef.current = false;
    scriptProgressCache.clear();
    setRefreshKey((k) => k + 1);
  }, [location.pathname]);

  useEffect(() => {
    setActiveScript(availableScripts[0]);
  }, [availableScripts]);

  // 학습 언어가 바뀌면(알파벳 ↔ 히라가나/가타카나) 캐시를 통째로 비운다.
  useEffect(() => {
    scriptProgressCache.clear();
  }, [learningLang]);

  useEffect(() => {
    const cached = scriptProgressCache.get(activeScript);
    if (cached) {
      setItems(cached);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // ensure — 글자장이 없으면 생성(멱등), 있으면 progress와 같은 모양을 그대로 돌려준다.
      // 매번 이 하나만 불러도 안전 + 추가 왕복 없이 첫 진입에서도 바로 그리드가 채워진다.
      const res = await ensureScriptApi(activeScript);
      if (cancelled) return;
      const progressItems = res?.code === 200 ? res.data?.items : [];
      const merged = mergeProgress(activeScript, progressItems);
      scriptProgressCache.set(activeScript, merged);
      setItems(merged);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [activeScript, refreshKey]);

  const groups = useMemo(() => buildScriptGroups(activeScript, items), [activeScript, items]);
  const totalPracticable = practicableItems(items);
  // 상단 학습 버튼(2026-09-30 실기기 피드백 — "순차적으로, 알아서"): 아직 안 배운 글자가
  // 있으면 격자 순서대로 다음 두 글자를 배우고(두 글자면 마지막에 확인 문제가 붙는다),
  // 전부 배웠으면 연습(mode=review, 서버가 XP 낮은 글자부터)으로 넘어간다.
  //
  // 2026-10 개편: 버튼 두 개로 나눴다 — "새 글자 배우기"(격자 순서상 다음 두 글자, 예전 "こ·さ 배우기")
  // 와 "글자 복습"(이미 배운 글자들을 응용 문제로 — 듣고 쓰기·조합 단어·듣기 카드 맞추기).
  // 배운 글자가 없으면 복습은 비활성 + 안내, 다 배웠으면 새 글자는 비활성 + 안내.
  // 2026-10-24(이슈 #15): 활성 상태의 부가 문구(다음 글자 표기·"배운 글자 N개")는 뺐다 — 안내는 비활성일 때만.
  const NEXT_LEARN_COUNT = 2;
  const nextLearnItems = useMemo(
    () => items.filter((it) => !isStarted(it)).slice(0, NEXT_LEARN_COUNT),
    [items]
  );
  const canLearn = nextLearnItems.length > 0;
  const canReview = totalPracticable.length > 0;

  const subtitle = useMemo(
    () => availableScripts.map((s) => SCRIPT_LABEL[s]).join(' · '),
    [availableScripts]
  );

  // targetItems: 세션에 담을 글자(들) — 칸 하나(단일 배우기/연습하기)이거나 심은 글자
  // 전체(상단 "글자 연습하기"). mode: 'learn' | 'review'.
  const startSession = useCallback(async (targetItems, mode, label) => {
    if (starting || !targetItems || targetItems.length === 0) return;
    // 어떤 버튼으로 시작했는지(mode)를 담아 그 버튼에만 불러오는 중 표시를 띄운다
    setStarting(mode);
    try {
      // practice(시트의 연습하기)도 서버에는 chars 를 그대로 지정하는 learn 으로 — review 는 서버가 글자를 고른다
      const sessionMode = mode === 'review' ? 'review' : 'learn';
      const chars = targetItems.map((it) => it.char);
      const res = await getScriptSessionApi(activeScript, sessionMode, chars);
      if (res?.code !== 200 || !Array.isArray(res.data?.items) || res.data.items.length === 0) {
        showToast('지금은 시작할 수 없어요. 잠시 후 다시 시도해주세요');
        return;
      }
      const words = res.data.items.map((item) => mapScriptSessionItem(activeScript, item));
      // 오답 후보 풀 — 칸 하나짜리 세션(글자 1개)이 대부분이라 words 자신으로는 사지선다를
      // 채울 수 없다. 이 스크립트의 전체 글자 목록(items)을 풀로 함께 실어 보낸다
      // (utils/scriptQuestions.js buildScriptTestQuestions가 words 대신 이 pool로 오답을 뽑는다).
      const pool = buildDistractorPool(activeScript, items);
      // 복습 조합 단어 문제 — 서버가 고른 "배운 글자로만 된 실제 단어"(mode=review)와 배운 글자 집합
      const wordBank = Array.isArray(res.data.words) ? res.data.words : [];
      const learnedChars = items.filter((it) => isStarted(it)).map((it) => it.char);
      // 돌아왔을 때 반드시 재조회하도록 — 위 location 이펙트가 처리한다(이 탭은 언마운트되지 않는다).
      awaitingReturnRef.current = true;
      navigate('/take-test', {
        state: {
          testType: 'script',
          data: {
            script: activeScript,
            mode,
            rowLabel: label,
            sessionId: res.data.session_id ?? null,
            words,
            pool,
            wordBank,
            learnedChars,
          },
        },
      });
    } finally {
      setStarting(false);
    }
  }, [activeScript, items, navigate, starting]);

  return (
    <div className="h-full overflow-y-auto px-[20px] pb-[32px]">
      <div className="flex items-baseline justify-between pt-[14px]">
        <h3 className="text-[15px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
          {subtitle}
        </h3>
        <span className="text-[12.5px] font-[700] text-layout-gray-400">
          배운 글자 {totalPracticable.length}/{items.length}
        </span>
      </div>

      {/* 상단 두 버튼 — 새 글자 배우기(주 CTA, 홈 FarmCta 규격) / 글자 복습(보조) */}
      <div className="flex gap-[8px] mt-[12px]">
        <motion.button
          type="button"
          // 2026-10-24(이슈 #15 3차): 불러오는 동안 disabled 로 바꾸면 누르는 도중 탭 모션이 끊겨
          // "렉 걸린 듯" 보였다 — 비활성은 조건 미충족일 때만, 중복 시작은 startSession 이 막는다.
          disabled={!canLearn}
          aria-busy={starting === 'learn' || undefined}
          onClick={() => startSession(nextLearnItems, 'learn', '새 글자')}
          whileTap={canLearn ? { scale: TAP.scale } : undefined}
          transition={SPRING.snappy}
          onTapStart={canLearn ? () => haptic('light') : undefined}
          className="
            flex-1 min-w-0 flex flex-col items-center justify-center gap-[2px]
            h-[64px] rounded-[12px]
            bg-[linear-gradient(180deg,#FF88DC_0%,#FF70D4_100%)]
            shadow-[inset_0_1px_0_rgba(255,255,255,.34)]
            disabled:opacity-50
          "
        >
          <span className="flex items-center gap-[5px] text-layout-white text-[16px] font-[700] leading-[1.2] tracking-[-0.02em]">
            {starting === 'learn'
              ? <CircleNotch size={16} weight="bold" className="animate-spin" />
              : <Plus size={16} weight="bold" />}
            새 글자 배우기
          </span>
          {!canLearn && (
            <span className="text-layout-white/90 text-[12px] font-[600] leading-[1.2]">
              모든 글자를 배웠어요
            </span>
          )}
        </motion.button>
        <motion.button
          type="button"
          disabled={!canReview}
          aria-busy={starting === 'review' || undefined}
          onClick={() => startSession(totalPracticable, 'review', '글자 복습')}
          whileTap={canReview ? { scale: TAP.scale } : undefined}
          transition={SPRING.snappy}
          onTapStart={canReview ? () => haptic('light') : undefined}
          className="
            flex-1 min-w-0 flex flex-col items-center justify-center gap-[2px]
            h-[64px] rounded-[12px]
            border-[2px] border-primary-main-600
            bg-layout-white dark:bg-layout-black
            disabled:border-border dark:disabled:border-border-dark
          "
        >
          <span className={`flex items-center gap-[5px] text-[16px] font-[700] leading-[1.2] tracking-[-0.02em] ${canReview ? 'text-primary-main-600' : 'text-layout-gray-300'}`}>
            {starting === 'review'
              ? <CircleNotch size={16} weight="bold" className="animate-spin" />
              : <ArrowsClockwise size={16} weight="bold" />}
            글자 복습
          </span>
          {!canReview && (
            <span className="text-[12px] font-[600] leading-[1.2] text-layout-gray-300">
              글자를 먼저 배워 보세요
            </span>
          )}
        </motion.button>
      </div>

      {availableScripts.length > 1 && (
        <div className="flex gap-[8px] mt-[14px]">
          {availableScripts.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { vibrate({ duration: 5 }); setActiveScript(s); }}
              className={`
                h-[34px] px-[16px] rounded-full text-[13.5px] font-[700]
                ${s === activeScript
                  ? 'bg-layout-black dark:bg-layout-white text-layout-white dark:text-layout-black'
                  : 'bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-gray-400 dark:text-layout-gray-200'}
              `}
            >
              {SCRIPT_LABEL[s]}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-col mt-[6px]">
        {!loading && groups.map((group, idx) => (
          <ScriptRow
            key={group.key}
            script={activeScript}
            label={group.label}
            columns={group.columns}
            items={group.cells}
            showVowelHeader={idx === 0 && activeScript !== 'alphabet'}
          />
        ))}
      </div>

      <p className="mt-[18px] text-[10.5px] text-layout-gray-300 text-center">
        획순 데이터: KanjiVG, CC BY-SA 3.0
      </p>
    </div>
  );
};

export default ScriptFieldBody;
