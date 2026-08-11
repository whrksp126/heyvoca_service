/* eslint-disable react/prop-types */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
} from 'react';
import { Layout, Fit, Alignment, useRive } from '@rive-app/react-canvas';
import {
  FARM_MOTION_ACTION,
  FARM_MOTION_ANIMATION,
  FARM_MOTION_INPUT,
  FARM_MOTION_MACHINE,
  clampMotionValue,
} from './farmMotionContract';

/**
 * Rive 파일 요구사항:
 * - State machine: HeyVocaFarm
 * - Inputs: farmMotionContract.js 참고
 *
 * 부모는 ref.current.play('water')처럼 의미 기반 명령만 사용한다.
 */
const RiveFarmActor = forwardRef(function RiveFarmActor({
  src,
  artboard,
  className = '',
  fallback = null,
  onReady,
  onLoadError,
}, ref) {
  const layout = useMemo(
    () => new Layout({ fit: Fit.Contain, alignment: Alignment.BottomCenter }),
    [],
  );
  const { rive, RiveComponent } = useRive(
    src
      ? {
          src,
          artboard,
          stateMachines: FARM_MOTION_MACHINE,
          autoplay: true,
          layout,
          onLoadError,
        }
      : null,
    { useOffscreenRenderer: true },
  );

  const inputs = useCallback(() => {
    if (!rive) return new Map();
    return new Map(
      rive.stateMachineInputs(FARM_MOTION_MACHINE).map((input) => [input.name, input]),
    );
  }, [rive]);

  const setValue = useCallback((name, value) => {
    const input = inputs().get(name);
    if (input) input.value = value;
  }, [inputs]);

  const fire = useCallback((name) => {
    inputs().get(name)?.fire?.();
  }, [inputs]);

  // MCP로 만든 현재 파일은 선형 애니메이션 이름도 안정적인 공개 계약으로
  // 유지한다. ViewModel 전환 연결 전에도 웹에서 각 동작을 바로 검증할 수 있다.
  const playAnimation = useCallback((name) => {
    if (!rive || !name) return;
    rive.play(name);
  }, [rive]);

  const play = useCallback((action, payload = {}) => {
    switch (action) {
      case FARM_MOTION_ACTION.IDLE:
        setValue(FARM_MOTION_INPUT.mood, 0);
        setValue(FARM_MOTION_INPUT.walking, false);
        playAnimation(FARM_MOTION_ANIMATION.idle);
        break;
      case FARM_MOTION_ACTION.HAPPY:
        setValue(FARM_MOTION_INPUT.mood, 1);
        break;
      case FARM_MOTION_ACTION.SAD:
        setValue(FARM_MOTION_INPUT.mood, 2);
        break;
      case FARM_MOTION_ACTION.EARS:
        fire(FARM_MOTION_INPUT.earFold);
        playAnimation(FARM_MOTION_ANIMATION.earFold);
        break;
      case FARM_MOTION_ACTION.WALK:
        setValue(FARM_MOTION_INPUT.walking, payload.active !== false);
        playAnimation(payload.active === false
          ? FARM_MOTION_ANIMATION.idle
          : FARM_MOTION_ANIMATION.walk);
        break;
      case FARM_MOTION_ACTION.JUMP:
        fire(FARM_MOTION_INPUT.jump);
        playAnimation(FARM_MOTION_ANIMATION.jump);
        break;
      case FARM_MOTION_ACTION.WAVE:
        fire(FARM_MOTION_INPUT.wave);
        playAnimation(FARM_MOTION_ANIMATION.wave);
        break;
      case FARM_MOTION_ACTION.WATER:
        playAnimation(FARM_MOTION_ANIMATION.wave);
        break;
      case FARM_MOTION_ACTION.CELEBRATE:
        playAnimation(FARM_MOTION_ANIMATION.wave);
        break;
      default:
        console.warn(`[RiveFarmActor] Unknown action: ${action}`);
    }
  }, [fire, playAnimation, setValue]);

  const setCrop = useCallback(({ growth, health, wind } = {}) => {
    if (growth != null) setValue(FARM_MOTION_INPUT.growth, clampMotionValue(growth, 0, 3));
    if (health != null) setValue(FARM_MOTION_INPUT.health, clampMotionValue(health, 0, 3));
    if (wind != null) setValue(FARM_MOTION_INPUT.wind, clampMotionValue(wind, 0, 1));
  }, [setValue]);

  useImperativeHandle(ref, () => ({ play, setCrop, rive }), [play, setCrop, rive]);
  useEffect(() => { if (rive) onReady?.({ play, setCrop, rive }); }, [onReady, play, rive, setCrop]);

  if (!src) return fallback;
  return <RiveComponent className={className} aria-label="헤이보카 농장 캐릭터" />;
});

export default RiveFarmActor;
