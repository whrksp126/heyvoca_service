// src/components/TabShell.jsx
//
// 바텀 네비 5탭(농장·단어장·찾기·상점·마이)을 모두 마운트해 두고,
// 탭 이동은 "보이는 것만 바꾸는" 방식으로 처리하는 셸.
//
// 배경: App.jsx의 AppLayout이 <Routes>로 5개 탭을 각각 라우트에 걸어 두면
// 탭을 누를 때마다 이전 화면이 unmount되고 새 화면이 mount된다 — 그 결과 마이페이지의
// getFarmItemsApi/getFarmOverviewApi/getInvitesApi, 상점 탭의 조회가 탭을 오갈 때마다
// 다시 호출되고, 각 화면의 등장 애니메이션이 매번 재생되고, 스크롤 위치가 날아간다.
//
// 이 컴포넌트는 App.jsx의 AppLayout에서 <Routes>와 형제로, 모든 라우트에서 항상 마운트된
// 채로 렌더링된다(요구사항 4). 현재 경로가 5탭 중 하나면 해당 탭을 "활성"으로 보여주고,
// 나머지 이미 마운트된 탭은 화면 밖으로 숨긴다. 탭이 아닌 화면(로그인·온보딩·학습 등)에서는
// 전부 숨겨서 아무것도 보이지 않고 터치도 가로채지 않는다.
//
// 숨기는 방식: display:none은 레이아웃 자체가 사라져 스크롤 위치가 0으로 초기화된다.
// 대신 visibility:hidden + pointer-events:none + position:fixed(문서 흐름에서 제거)를 쓴다.
// visibility는 DOM 하위로 상속되는 속성이라, 안에 있는 position:fixed 요소(마이페이지 헤더 등,
// 자신의 containing block이 뷰포트라 부모 박스 밖에서 그려질 수 있다)까지 함께 숨는다 —
// 히트테스트도 visibility:hidden 요소는 건너뛰므로 터치를 가로챌 일이 없다.
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useOnboardingUnlock } from '../context/OnboardingUnlockContext';
import BottomNav from './component/BottomNav';
import Home from '../pages/Home';
import VocabularySheets from '../pages/VocabularySheets';
import Dictionary from '../pages/Dictionary';
import BookStore from '../pages/BookStore';
import MyPage from '../pages/myPage';

// BottomNav의 NAV_ITEMS와 대응되는 탭 정의.
// match: 이 탭이 담당하는 경로 판별(단어장 탭은 /vocabulary-sheets/:id도 같은 탭).
// lockKey: OnboardingUnlockContext 잠금 키(null이면 잠금 대상 아님).
const TABS = [
  { key: 'home', match: (p) => p === '/home', Component: Home, lockKey: null },
  {
    key: 'vocabulary-sheets',
    match: (p) => p === '/vocabulary-sheets' || p.startsWith('/vocabulary-sheets/'),
    Component: VocabularySheets,
    lockKey: 'vocabook',
  },
  { key: 'dictionary', match: (p) => p === '/dictionary', Component: Dictionary, lockKey: 'dict' },
  { key: 'book-store', match: (p) => p === '/book-store', Component: BookStore, lockKey: 'store' },
  { key: 'mypage', match: (p) => p === '/mypage', Component: MyPage, lockKey: null },
];

const TabShell = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const location = useLocation();
  const { isLogin, isLoginChecked } = useUser();
  const { isFeatureLocked } = useOnboardingUnlock();

  const activeTab = useMemo(
    () => TABS.find((t) => t.match(location.pathname)) || null,
    [location.pathname]
  );
  const activeKey = activeTab?.key ?? null;

  // 한 번 마운트된 탭은 계속 마운트 상태를 유지한다(다시 unmount하지 않음) — API 재호출·
  // 등장 애니메이션 재생·스크롤 초기화를 막는 핵심.
  const [mountedKeys, setMountedKeys] = useState(() => new Set());

  // 현재 활성 탭은 즉시 마운트한다. 잠금 여부와 무관하게 마운트한다 — 사용자가 이미
  // 그 경로에 있다면(딥링크 등으로 잠금을 우회했더라도) 빈 화면보다 실제 화면을 보여주는
  // 쪽이 맞다. 잠금은 BottomNav의 진입 차단(탭 전환) 문제이지 라우트 가드가 아니다.
  useEffect(() => {
    if (!isLogin || !isLoginChecked || !activeKey) return;
    setMountedKeys((prev) => (prev.has(activeKey) ? prev : new Set(prev).add(activeKey)));
  }, [activeKey, isLogin, isLoginChecked]);

  // 위 effect는 커밋 이후에 실행되므로, 처음 어떤 탭에 진입하는 순간(예: 스플래시 →
  // /home)에는 한 프레임 동안 mountedKeys에 activeKey가 아직 없어 빈 화면이 잠깐 보일 수
  // 있다. 렌더링에 쓸 집합은 mountedKeys에 activeKey를 항상 더해 계산해, 활성 탭은
  // state 갱신을 기다리지 않고 이번 렌더부터 바로 그려지게 한다(마운트 유지 여부를 정하는
  // mountedKeys 자체는 위 effect가 그대로 관리한다).
  const renderKeys = useMemo(() => {
    if (!activeKey || mountedKeys.has(activeKey)) return mountedKeys;
    return new Set(mountedKeys).add(activeKey);
  }, [mountedKeys, activeKey]);

  // 로그아웃하면 마운트 상태를 전부 비운다 — 로그인 가드 없이 API를 계속 호출하는 일이
  // 없도록(요구사항 7), 다음 로그인 때 다시 처음부터(홈 우선) 마운트되도록 한다.
  useEffect(() => {
    if (isLoginChecked && !isLogin) {
      setMountedKeys((prev) => (prev.size === 0 ? prev : new Set()));
    }
  }, [isLogin, isLoginChecked]);

  // 첫 탭(대부분 홈)이 마운트되어 그려진 뒤, 유휴 시간에 나머지 탭을 마저 마운트한다.
  // "홈 먼저, 나머지는 홈이 그려진 직후"(요구사항 6) — 첫 페인트를 늦추지 않기 위해서다.
  // 잠긴 탭(vocabook/dict/store)은 해금 전까지 제외하고, isFeatureLocked가 바뀔 때마다
  // (= 해금 상태가 바뀔 때마다) 다시 시도해 해금 직후에도 자연스럽게 마운트되게 한다.
  useEffect(() => {
    if (!isLogin || !isLoginChecked) return;
    if (mountedKeys.size === 0) return; // 아직 첫 탭도 안 그려짐 — 대기

    let cancelled = false;
    const useRIC = typeof window.requestIdleCallback === 'function';
    const schedule = (cb) => (useRIC
      ? window.requestIdleCallback(cb, { timeout: 1500 })
      : window.setTimeout(cb, 200));
    const cancelSchedule = (h) => (useRIC
      ? window.cancelIdleCallback && window.cancelIdleCallback(h)
      : window.clearTimeout(h));

    const handle = schedule(() => {
      if (cancelled) return;
      setMountedKeys((prev) => {
        let changed = false;
        const next = new Set(prev);
        TABS.forEach((t) => {
          if (next.has(t.key)) return;
          if (t.lockKey && isFeatureLocked(t.lockKey)) return; // 잠긴 탭은 해금 전까지 보류
          next.add(t.key);
          changed = true;
        });
        return changed ? next : prev;
      });
    });

    return () => {
      cancelled = true;
      cancelSchedule(handle);
    };
  }, [isLogin, isLoginChecked, mountedKeys.size, isFeatureLocked]);

  if (!isLogin || !isLoginChecked) return null;

  return (
    <>
      {TABS.map((t) => {
        if (!renderKeys.has(t.key)) return null;
        const isActive = t.key === activeKey;
        const { Component } = t;
        return (
          <div
            key={t.key}
            className={isActive ? '' : 'fixed inset-0 z-[-1] invisible pointer-events-none'}
            aria-hidden={isActive ? undefined : true}
            // 비활성 탭이 학습 화면 등 탭 아닌 화면 위를 덮거나 터치를 가로채지 않아야 한다
            // (요구사항 4) — visibility:hidden은 안에 있는 position:fixed 요소(마이페이지
            // 헤더, BottomNav 류)까지 상속으로 함께 숨기고, 히트테스트도 건너뛴다.
          >
            <Component />
          </div>
        );
      })}
      {activeKey && <BottomNav />}
    </>
  );
};

export default TabShell;
