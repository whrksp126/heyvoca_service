// src/components/script/ScriptFieldBody.jsx
//
// 글자(문자 학습) 그리드 — 학습장의 "글자" 탭 본문(2026-09-29). 예전에는 이 내용 전체가
// 공용 풀시트 components/newfullsheet/ScriptFieldNewFullSheet.jsx였다. 진입로가 홈 카드와
// 학습 언어 전환 권유 둘뿐이라 "글자 밭"이라는 별도 공간보다 학습장 안의 탭 하나로 두는 편이
// 자연스러워 이 화면으로 옮기며 헤더(뒤로가기·제목)를 뗐다 — 탭 자체가 이미 "지금 보고
// 있는 화면"을 말해 준다.
//
// 세션(ScriptSessionNewFullSheet)은 여전히 풀시트로 push한다 — 학습/복습/따라쓰기는
// 탭 안에 넣기엔 무거운 전용 화면이라 그대로 둔다. 세션이 끝나면 onComplete로 이 컴포넌트의
// 로컬 상태를 갱신한 뒤 popNewFullSheet로 이 탭으로 돌아온다(탭은 그대로 마운트돼 있다).

import React, {
  useEffect, useMemo, useState, useCallback,
} from 'react';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { getScriptProgressApi } from '../../api/script';
import {
  SCRIPT_LABEL,
  scriptsForLearningLang,
  groupByRow,
  mergeProgress,
  dueItems,
  masteredCount,
  rowLabel,
} from '../../utils/scriptData';
import ScriptRow from './ScriptRow';
import ScriptSessionNewFullSheet from '../newfullsheet/ScriptSessionNewFullSheet';
import { vibrate } from '../../utils/osFunction';

// 스크립트별(히라가나/가타카나/알파벳 등) 진행도 메모리 캐시 — 모듈 스코프라 이 컴포넌트가
// 다시 마운트돼도(예: 다른 탭에 갔다가 돌아옴) 살아 있다. 지금은 Main.jsx가 이 컴포넌트를
// 언마운트하지 않지만, 그래도 두 겹으로 방어해 둔다 — 탭 전환 자체가 재조회를 부르지
// 않아야 "즉시" 전환된다(2026-09-29 QA). 갱신 시점은 딱 둘: 세션 완료(refreshProgress)와
// 학습 언어 변경(아래 learningLang effect가 통째로 비운다) 뿐이다.
const scriptProgressCache = new Map(); // script -> items[]

const ScriptFieldBody = () => {
  "use memo";

  const { pushNewFullSheet } = useNewFullSheetActions();
  const { learningLang } = useUser();

  const availableScripts = useMemo(() => scriptsForLearningLang(learningLang), [learningLang]);
  const [activeScript, setActiveScript] = useState(availableScripts[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setActiveScript(availableScripts[0]);
  }, [availableScripts]);

  // 학습 언어가 바뀌면(알파벳 ↔ 히라가나/가타카나) 캐시를 통째로 비운다 — 스크립트 키가
  // 언어별로 겹치지는 않지만, "언어 변경 시에만 갱신"이라는 규칙을 명확히 지키기 위한
  // 방어적 초기화다.
  useEffect(() => {
    scriptProgressCache.clear();
  }, [learningLang]);

  useEffect(() => {
    // 이 스크립트가 이미 캐시에 있으면 네트워크 왕복 없이 즉시 보여준다 — 히라가나↔가타카나,
    // 학습장 단어장↔글자 탭을 오갈 때 "즉시" 전환되는 핵심(2026-09-29 QA). refreshProgress의
    // 폴백 경로가 지금 스크립트의 캐시를 지운 다음에만 여기서 실제로 다시 불러온다.
    const cached = scriptProgressCache.get(activeScript);
    if (cached) {
      setItems(cached);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const res = await getScriptProgressApi(activeScript);
      if (cancelled) return;
      const progressItems = res?.code === 200 ? res.data?.items : [];
      const merged = mergeProgress(activeScript, progressItems);
      scriptProgressCache.set(activeScript, merged);
      setItems(merged);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
    // refreshKey — refreshProgress 폴백 경로가 캐시를 지운 뒤 여기로 다시 들어오게 하는 트리거
  }, [activeScript, refreshKey]);

  const rows = useMemo(() => groupByRow(items), [items]);
  const totalMastered = masteredCount(items);
  const totalDue = dueItems(items);

  // 언어별 소제목 — 일본어는 "히라가나 · 가타카나", 영어는 "알파벳"
  const subtitle = useMemo(
    () => availableScripts.map((s) => SCRIPT_LABEL[s]).join(' · '),
    [availableScripts]
  );

  // 세션이 끝나고 이 화면으로 돌아올 때 호출 — 진행도를 반영한다(pop은 세션 쪽에서 한다).
  // updatedItems가 있으면(세션이 /script/log·/script/skip 응답을 기다린 뒤 넘겨준 갱신된
  // level 등) 재조회 없이 로컬 상태에 바로 병합해 즉시 반영한다 — 응답이 없거나(네트워크
  // 실패 등) 비어 있으면 안전하게 전체 재조회(refreshKey)로 폴백한다.
  const refreshProgress = useCallback((updatedItems) => {
    if (Array.isArray(updatedItems) && updatedItems.length > 0) {
      setItems((prev) => {
        const byChar = new Map(prev.map((it) => [it.char, it]));
        updatedItems.forEach((u) => {
          if (u?.char) byChar.set(u.char, { ...byChar.get(u.char), ...u });
        });
        const merged = prev.map((it) => byChar.get(it.char) ?? it);
        scriptProgressCache.set(activeScript, merged); // 세션 완료 — 캐시도 같이 갱신
        return merged;
      });
      return;
    }
    scriptProgressCache.delete(activeScript); // 폴백 재조회 대상 스크립트만 캐시 무효화
    setRefreshKey((k) => k + 1);
  }, [activeScript]);

  const goSession = (chars, mode, label) => {
    if (!chars || chars.length === 0) return;
    pushNewFullSheet(
      ScriptSessionNewFullSheet,
      { script: activeScript, chars, pool: items, mode, rowLabel: label, onComplete: refreshProgress },
      { smFull: true, closeOnBackdropClick: false }
    );
  };

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

      {totalDue.length > 0 && (
        <div className="flex justify-end mt-[8px]">
          <button
            type="button"
            onClick={() => goSession(totalDue, 'review', '복습')}
            className="h-[30px] px-[12px] rounded-full text-[12.5px] font-[700] bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600"
          >
            복습하기 {totalDue.length}
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
            dueItems={dueItems(rowItems)}
            onLearn={() => goSession(rowItems, 'learn', rowLabel(activeScript, rowKey, rowItems))}
            onReview={() => goSession(dueItems(rowItems), 'review', rowLabel(activeScript, rowKey, rowItems))}
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
