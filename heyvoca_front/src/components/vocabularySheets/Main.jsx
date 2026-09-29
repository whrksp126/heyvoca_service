import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { vibrate } from '../../utils/osFunction';
import { getStoredVocaSheetsTab, setStoredVocaSheetsTab } from '../../utils/vocaSheetsTab';
import VocaBooksTab from './VocaBooksTab';
import ScriptFieldBody from '../script/ScriptFieldBody';

const TABS = [
  { key: 'books', label: '단어장' },
  { key: 'script', label: '글자' },
];

/**
 * 학습장 — 상단 탭 "단어장 | 글자" (2026-09-29).
 *
 * 예전에는 이 파일이 곧 단어장 목록 화면이었다. 글자(문자 학습)가 홈 진입 카드·전용 풀시트
 * (ScriptFieldNewFullSheet)로 따로 있다가, 단어장과 같은 "학습장" 아래 탭으로 들어왔다 —
 * 세그먼트는 상점 탭(newfullsheet/StoreNewFullSheet)의 3탭과 같은 규격(회색 트랙 + 흰 알약)을
 * 그대로 쓴다. 고른 탭은 localStorage에 기억한다(세션이 끝나도 유지) — 실패해도(프라이빗
 * 모드 등) 매번 "단어장"으로 시작할 뿐 기능이 깨지지 않는다.
 */
const Main = () => {
  "use memo";

  const [activeTab, setActiveTab] = useState(getStoredVocaSheetsTab);

  // 다른 화면(학습 언어 전환 권유 등)이 navigate('/vocabulary-sheets', { state: { tab } })로
  // 특정 탭을 지정해 들어오는 경우 — 이 페이지는 TabShell이 한 번 마운트하면 계속 떠 있는
  // 상태라 pathname만으로는 재진입을 못 감지한다. navigate는 매번 새 location.key를 발급하므로
  // 그걸로 "이번 진입에서 탭을 지정했는가"를 판별한다.
  const location = useLocation();
  useEffect(() => {
    const requested = location.state?.tab;
    if (requested && TABS.some((t) => t.key === requested)) {
      setActiveTab(requested);
      setStoredVocaSheetsTab(requested);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const handleSelectTab = (key) => {
    if (key === activeTab) return;
    vibrate({ duration: 5 });
    setActiveTab(key);
    setStoredVocaSheetsTab(key);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-var(--current-header-height)-var(--current-bottom-nav-height)-var(--status-bar-height))]">
      {/* 세그먼트 — 상점 탭과 같은 규격(mx-[16px] 트랙 + rounded-[8px] 알약) */}
      <div className="shrink-0 mt-[10px] mx-[16px] mb-[10px] h-[36px] flex p-[3px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark">
        {TABS.map((tab) => {
          const on = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleSelectTab(tab.key)}
              className={`flex-1 flex items-center justify-center rounded-[8px] text-[13px] font-[700] tracking-[-0.03em] ${
                on
                  ? 'bg-layout-white dark:bg-primary-main-dark text-layout-black dark:text-layout-white shadow-[0_1px_3px_rgba(0,0,0,0.12)] dark:shadow-none'
                  : 'text-layout-gray-400 dark:text-layout-gray-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === 'books' ? <VocaBooksTab /> : <ScriptFieldBody />}
      </div>
    </div>
  );
};

export default Main;
