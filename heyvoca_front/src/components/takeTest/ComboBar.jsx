import { useEffect, useRef } from 'react';
import { feel } from '../../lib/feel';

/**
 * 콤보 마일스톤 단계 — 진행바는 브랜드 primary 계열을 유지하고 색을 갈아끼우는 대신 같은 계열 안에서
 * 끝부분이 옅게 빛나는 그라디언트로 미묘하게 강조한다.
 *   0~4: primary-600 단색(기본) / 5~9: 600→400 / 10+: 600→500→300(끝이 더 밝게)
 * Main.jsx 가 진행바 채움 색을 고를 때 쓴다(진단 모드의 crop-carrot 가 우선).
 */
export const COMBO_MILESTONE_STEP = 5;
export const getComboFillClass = (current = 0) => {
  if (current >= 10) return 'bg-gradient-to-r from-primary-main-600 via-primary-main-500 to-primary-main-300';
  if (current >= COMBO_MILESTONE_STEP) return 'bg-gradient-to-r from-primary-main-600 to-primary-main-400';
  return 'bg-primary-main-600';
};

/**
 * 콤보 소리·진동 전담(화면 라벨 없음) — AI 추천 테스트에서 콤보가 "오를 때" feel('combo', {n}) 을 쏜다.
 * 예전에는 진행바 위 '{n}콤보' 라벨과 15+ 중앙 pill 도 여기서 그렸지만, 라벨은 제거했고
 * 5의 배수 연출은 Main 의 ComboInterlude 가 맡는다. 진행바 콤보 단계 강조(getComboFillClass)는 위에서 export.
 *
 * - 진입 시 초기 콤보값으로는 울리지 않음(초기 노출 버그 방지).
 * - feel() 이 정답 큐 뒤로 밀어 소리·진동 시점을 정한다(정답 큐와 겹치지 않게).
 * - DOM 을 그리지 않으므로 레이아웃 영향 없음.
 */
const ComboBar = ({ combo }) => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const current = combo?.current ?? 0;
  const prevRef = useRef(null); // null = 아직 초기화 전(첫 값은 트리거하지 않음)

  useEffect(() => {
    if (prevRef.current === null) {
      prevRef.current = current;
      return;
    }
    if (current >= 2 && current > prevRef.current) feel('combo', { n: current });
    prevRef.current = current;
  }, [current]);

  return null;
};

export default ComboBar;
