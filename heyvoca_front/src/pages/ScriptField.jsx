// src/pages/ScriptField.jsx
//
// 글자 밭 — 문자(가나/알파벳) 학습 그리드. 학습 언어가 ja면 히라가나/가타카나 탭,
// en이면 알파벳 하나만 보여준다(기획서 "글자 밭" §화면1).
// 필수 기능이 아니라 "권유 + 건너뛰기" 톤 — 상단에 무거운 진행바 대신 담백한 요약만 둔다.

import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CaretLeft } from '@phosphor-icons/react';
import { useUser } from '../context/UserContext';
import { vibrate } from '../utils/osFunction';
import { getScriptProgressApi } from '../api/script';
import {
  SCRIPT_LABEL,
  scriptsForLearningLang,
  groupByRow,
  mergeProgress,
  dueItems,
  masteredCount,
  rowLabel,
} from '../utils/scriptData';
import ScriptRow from '../components/script/ScriptRow';

const ScriptField = () => {
  "use memo";

  const navigate = useNavigate();
  const { state } = useLocation();
  const { learningLang } = useUser();

  const availableScripts = useMemo(() => scriptsForLearningLang(learningLang), [learningLang]);
  const [activeScript, setActiveScript] = useState(availableScripts[0]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

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
    // state?.refresh — 세션에서 돌아왔을 때 같은 탭이라도 다시 조회
  }, [activeScript, state?.refresh]);

  const rows = useMemo(() => groupByRow(items), [items]);
  const totalMastered = masteredCount(items);
  const totalDue = dueItems(items);

  const goSession = (chars, mode, label) => {
    if (!chars || chars.length === 0) return;
    navigate('/script/session', {
      state: { script: activeScript, chars, pool: items, mode, rowLabel: label },
    });
  };

  return (
    <div className="flex flex-col h-screen bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-end justify-center w-full h-[55px] px-[16px] py-[14px] bg-layout-white dark:bg-layout-black"
      >
        <div className="absolute left-[10px] bottom-[13px] flex items-center justify-center">
          <button
            type="button"
            onClick={() => { vibrate({ duration: 5 }); navigate(-1); }}
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

export default ScriptField;
