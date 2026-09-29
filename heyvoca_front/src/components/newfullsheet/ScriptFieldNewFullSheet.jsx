// src/components/newfullsheet/ScriptFieldNewFullSheet.jsx
//
// 글자 밭 — 문자(가나/알파벳) 학습 그리드. 원래 /script 페이지 라우트였으나, 딥링크 없이
// 항상 홈 진입 카드·일본어 전환 권유에서만 열리는 화면이라 페이지 라우트로 남기면 안드로이드
// 하드웨어 뒤로가기가 라우트 히스토리가 비었을 때 앱을 그대로 종료시키는 문제가 있었다
// (2026-09-29 QA). 다른 풀시트(StudyNewFullSheet 등)와 같은 공용 풀시트 시스템으로 옮겨
// 뒤로가기 처리를 window.onBackPressed의 newFullSheet 스택 우선 처리에 맡긴다
// (utils/osFunction.jsx onBackPressed 참고 — 오버라이드 불필요).
//
// 세션(ScriptSessionNewFullSheet)은 이 시트 위에 push되고, 세션이 끝나면
// onSessionComplete로 진행도 재조회를 요청한 뒤 popNewFullSheet로 이 화면으로 돌아온다.

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { CaretLeft } from '@phosphor-icons/react';
import { useUser } from '../../context/UserContext';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate } from '../../utils/osFunction';
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
import ScriptRow from '../script/ScriptRow';
import ScriptSessionNewFullSheet from './ScriptSessionNewFullSheet';

const ScriptFieldNewFullSheet = () => {
  "use memo";

  const { popNewFullSheet, pushNewFullSheet } = useNewFullSheetActions();
  const { learningLang } = useUser();

  const availableScripts = useMemo(() => scriptsForLearningLang(learningLang), [learningLang]);
  const [activeScript, setActiveScript] = useState(availableScripts[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setActiveScript(availableScripts[0]);
  }, [availableScripts]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const res = await getScriptProgressApi(activeScript);
      if (cancelled) return;
      const progressItems = res?.code === 200 ? res.data?.items : [];
      setItems(mergeProgress(activeScript, progressItems));
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
    // refreshKey — 세션에서 돌아왔을 때 같은 탭이라도 다시 조회
  }, [activeScript, refreshKey]);

  const rows = useMemo(() => groupByRow(items), [items]);
  const totalMastered = masteredCount(items);
  const totalDue = dueItems(items);

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
        return prev.map((it) => byChar.get(it.char) ?? it);
      });
      return;
    }
    setRefreshKey((k) => k + 1);
  }, []);

  const goSession = (chars, mode, label) => {
    if (!chars || chars.length === 0) return;
    pushNewFullSheet(
      ScriptSessionNewFullSheet,
      { script: activeScript, chars, pool: items, mode, rowLabel: label, onComplete: refreshProgress },
      { smFull: true, closeOnBackdropClick: false }
    );
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-end justify-center w-full h-[55px] px-[16px] py-[14px] bg-layout-white dark:bg-layout-black"
      >
        <div className="absolute left-[10px] bottom-[13px] flex items-center justify-center">
          <button
            type="button"
            onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
            className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          >
            <CaretLeft size={24} />
          </button>
        </div>
        <div className="px-[44px]">
          <h2 className="text-[18px] font-[700] leading-[21px] text-center text-layout-black dark:text-layout-white">
            글자 밭
          </h2>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-[20px] pb-[32px]">
        <div className="flex items-center justify-between pt-[14px]">
          <span className="text-[13px] font-[700] text-layout-gray-400">
            익힌 글자 {totalMastered}/{items.length}
          </span>
          {totalDue.length > 0 && (
            <button
              type="button"
              onClick={() => goSession(totalDue, 'review', '복습')}
              className="h-[30px] px-[12px] rounded-full text-[12.5px] font-[700] bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600"
            >
              복습하기 {totalDue.length}
            </button>
          )}
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
    </div>
  );
};

export default ScriptFieldNewFullSheet;
