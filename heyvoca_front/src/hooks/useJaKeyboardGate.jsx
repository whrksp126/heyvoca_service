import { useNewBottomSheetActions } from '../context/NewBottomSheetContext';
import JaKeyboardGateNewBottomSheet from '../components/newBottomSheet/JaKeyboardGateNewBottomSheet';
import { getActiveLearningLang } from '../utils/lang';
import { getJaKeyboardStatus, isJaKeyboardReady, markJaKeyboardReady } from '../utils/jaKeyboard';

/**
 * 일본어 학습 시작 게이트. 학습을 시작하는 모든 진입점이 시작 직전에 `await ensureJaKeyboard()` 를 부른다.
 *  - 영어 모드: 즉시 true(아무 영향 없음).
 *  - 일본어 모드: 통과 기록이 있고 네이티브가 "없음"이라 하지 않으면 true, 네이티브가 enabled 면 기록 후 true,
 *    그 외에는 안내 시트를 띄워 설정(또는 입력 확인)이 끝날 때까지 기다린다. 시트를 닫으면 false → 시작하지 않는다.
 */
export const useJaKeyboardGate = () => {
  const { pushAwaitNewBottomSheet } = useNewBottomSheetActions();

  const ensureJaKeyboard = async () => {
    if (getActiveLearningLang() !== 'ja') return true;
    const { status } = await getJaKeyboardStatus();
    if (status === 'enabled') {
      markJaKeyboardReady();
      return true;
    }
    if (status !== 'missing' && isJaKeyboardReady()) return true;
    const ok = await pushAwaitNewBottomSheet(
      JaKeyboardGateNewBottomSheet,
      {},
      { isBackdropClickClosable: false, isDragToCloseEnabled: false },
    );
    return ok === true;
  };

  return { ensureJaKeyboard };
};

export default useJaKeyboardGate;
