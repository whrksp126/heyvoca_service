// src/components/script/ScriptFieldBody.jsx
//
// 글자(문자 학습) 그리드 — 학습장의 "글자" 탭 본문. 2026-09-30 개편: 글자 학습 세션을 더는
// 별도 풀시트(예전 ScriptSessionNewFullSheet)로 돌리지 않고, 학습하기(TakeTest, testType=
// 'script') 안에서 일반 단어 학습과 똑같은 화면(진행바·O/X·농장 상태 바·재출제·결과 화면)으로
// 돌린다 — 글자 하나 = 단어 하나로 취급해 FSRS·작물 성장이 단어와 동일하게 굴러간다.
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
  groupByRow,
  mergeProgress,
  mapScriptSessionItem,
  practicableItems,
  masteredCount,
  rowLabel,
} from '../../utils/scriptData';
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
  // goSession이 세션을 시작하기 직전에 이 플래그를 세워 두고, /vocabulary-sheets로
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

  const rows = useMemo(() => groupByRow(items), [items]);
  const totalMastered = masteredCount(items);
  const totalPracticable = practicableItems(items);

  const subtitle = useMemo(
    () => availableScripts.map((s) => SCRIPT_LABEL[s]).join(' · '),
    [availableScripts]
  );

  const goSession = useCallback(async (rowItems, mode, label) => {
    if (starting || !rowItems || rowItems.length === 0) return;
    setStarting(true);
    try {
      // 세션 조회 모드(서버 힌트) — '이미 알아요' 확인도 이미 배운 셈 치고 복습과 같은
      // 문제 구성으로 묻는다(2026-09-30 결정: 전용 배치 승인 엔드포인트 없이 /study/log
      // 정답 기록으로 대체). 문제 배열의 실제 모양(만나기 포함 여부 등)은 클라이언트가
      // utils/scriptQuestions.js buildScriptTestQuestions(원래 mode)로 따로 정한다.
      const sessionMode = mode === 'learn' ? 'learn' : 'review';
      const chars = rowItems.map((it) => it.char);
      const res = await getScriptSessionApi(activeScript, sessionMode, chars);
      if (res?.code !== 200 || !Array.isArray(res.data?.items) || res.data.items.length === 0) {
        showToast('지금은 시작할 수 없어요. 잠시 후 다시 시도해주세요');
        return;
      }
      const words = res.data.items.map((item) => mapScriptSessionItem(activeScript, item));
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
          },
        },
      });
    } finally {
      setStarting(false);
    }
  }, [activeScript, navigate, starting]);

  return (
    <div className="h-full overflow-y-auto px-[20px] pb-[32px]">
      <div className="flex items-baseline justify-between pt-[14px]">
        <h3 className="text-[15px] font-[800] tracking-[-0.03em] text-layout-black dark:text-layout-white">
          {subtitle}
        </h3>
        <span className="text-[12.5px] font-[700] text-layout-gray-400">
          익힌 글자 {totalMastered}/{items.length}
        </span>
      </div>

      {totalPracticable.length > 0 && (
        <div className="flex justify-end mt-[8px]">
          <button
            type="button"
            disabled={starting}
            onClick={() => goSession(totalPracticable, 'review', '연습')}
            className="h-[30px] px-[12px] rounded-full text-[12.5px] font-[700] bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600 disabled:opacity-60"
          >
            연습하기
          </button>
        </div>
      )}

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
        {!loading && rows.map(({ rowKey, items: rowItems }) => (
          <ScriptRow
            key={rowKey}
            script={activeScript}
            label={rowLabel(activeScript, rowKey, rowItems)}
            items={rowItems}
            practicableItems={practicableItems(rowItems)}
            onLearn={() => goSession(rowItems, 'learn', rowLabel(activeScript, rowKey, rowItems))}
            onPractice={() => goSession(practicableItems(rowItems), 'review', rowLabel(activeScript, rowKey, rowItems))}
            onSkip={() => goSession(rowItems, 'skip', rowLabel(activeScript, rowKey, rowItems))}
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
