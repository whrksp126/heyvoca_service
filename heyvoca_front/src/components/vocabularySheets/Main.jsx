import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { vibrate } from '../../utils/osFunction';
import { getStoredVocaSheetsTab, setStoredVocaSheetsTab } from '../../utils/vocaSheetsTab';
import SegmentTabBar from '../common/SegmentTabBar';
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
      {/* 세그먼트 — 상점 탭과 규격을 공유하는 공용 컴포넌트(SegmentTabBar) */}
      <SegmentTabBar tabs={TABS} activeKey={activeTab} onSelect={handleSelectTab} />

      {/*
        두 탭을 항상 같이 마운트해 두고 "보이는 것만 바꾼다" — TabShell(바텀 네비 5탭)과 같은
        패턴이다(2026-09-29 QA). 예전에는 activeTab에 따라 조건부 렌더링해서 탭을 오갈 때마다
        VocaBooksTab·ScriptFieldBody가 매번 새로 마운트됐고, 특히 ScriptFieldBody는 마운트마다
        /script/progress를 다시 불렀다 — 전환이 느리고 스크롤 위치도 날아갔다. display:none
        대신 fixed+invisible로 숨기는 이유도 TabShell과 같다: 문서 흐름에서 완전히 빼서
        비활성 탭이 학습장 화면 위를 덮거나 터치를 가로채지 않게 하면서, display:none과 달리
        레이아웃이 사라지지 않아 안의 스크롤 위치가 유지된다.
      */}
      <div className="flex-1 min-h-0 relative">
        <div
          className={activeTab === 'books' ? 'h-full' : 'fixed inset-0 z-[-1] invisible pointer-events-none'}
          aria-hidden={activeTab === 'books' ? undefined : true}
        >
          <VocaBooksTab />
        </div>
        <div
          className={activeTab === 'script' ? 'h-full' : 'fixed inset-0 z-[-1] invisible pointer-events-none'}
          aria-hidden={activeTab === 'script' ? undefined : true}
        >
          <ScriptFieldBody />
        </div>
      </div>
    </div>
  );
};

export default Main;
