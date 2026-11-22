import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Keyboard, CheckCircle, ArrowClockwise } from '@phosphor-icons/react';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { vibrate } from '../../utils/osFunction';
import { canUseNative, getNativeEnv } from '../../utils/nativeBridge';
import postMessageManager from '../../utils/postMessageManager';
import {
  getJaKeyboardStatus,
  openJaKeyboardSettings,
  markJaKeyboardReady,
  hasKanaChar,
} from '../../utils/jaKeyboard';

const STEPS = {
  ios: [
    '설정 > 일반 > 키보드 > 키보드',
    '새로운 키보드 추가 > 일본어',
    '가나(또는 로마자)를 골라 추가',
  ],
  android: [
    '설정 > 키보드 설정 (사용 중인 키보드)',
    '언어 및 유형(또는 언어 추가) 선택',
    '일본어를 추가',
  ],
};

/**
 * 일본어 키보드 설정 안내 — 일본어 학습을 시작하기 전에 키보드가 없을 때 뜬다.
 * resolveNewBottomSheet(true) = 통과(시작), false = 닫음(시작 안 함). 설정을 마치기 전엔 시작할 수 없다.
 */
export const JaKeyboardGateNewBottomSheet = () => {
  "use memo";
  const { resolveNewBottomSheet } = useNewBottomSheetActions();
  const [platform, setPlatform] = useState(getNativeEnv().platform || null);
  const [status, setStatus] = useState('checking'); // checking | enabled | missing | unknown
  const [settingsTarget, setSettingsTarget] = useState(null); // 'keyboard' | 'app' | null
  const [typed, setTyped] = useState('');
  const doneRef = useRef(false);

  const pass = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    markJaKeyboardReady();
    resolveNewBottomSheet(true);
  };

  const recheck = async () => {
    const res = await getJaKeyboardStatus();
    if (doneRef.current) return;
    if (res.platform) setPlatform(res.platform);
    setStatus(res.status);
    if (res.status === 'enabled') pass();
  };

  // 최신 recheck 를 이벤트 콜백이 부르도록 ref 로 잡는다.
  const recheckRef = useRef(recheck);
  useEffect(() => { recheckRef.current = recheck; });

  useEffect(() => {
    recheckRef.current();
    const again = () => recheckRef.current();
    const onVisible = () => { if (document.visibilityState === 'visible') again(); };
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', onVisible);
    const off = postMessageManager.waitFor('appForeground', again);
    return () => {
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', onVisible);
      off();
    };
  }, []);

  const handleOpenSettings = async () => {
    vibrate({ duration: 5 });
    const res = await openJaKeyboardSettings();
    if (res.target) setSettingsTarget(res.target);
  };

  // 조합 중(IME)에는 확인하지 않는다 — 조합이 끝난 값 기준으로만 판정.
  const verify = (value) => { if (hasKanaChar(value)) pass(); };

  const steps = STEPS[platform] || null;
  const canOpenSettings = canUseNative('openKeyboardSettings');
  const showIosAppNote = settingsTarget === 'app' || (platform === 'ios' && canOpenSettings);

  return (
    <div className="relative bg-layout-white dark:bg-layout-black">
      <div className="
        flex flex-col gap-[16px]
        max-h-[calc(90vh-47px)]
        pt-[32px] px-[20px] pb-[105px]
        overflow-y-auto
      ">
        <div className="flex flex-col items-center gap-[8px]">
          <Keyboard size={36} weight="fill" aria-hidden="true" className="text-primary-main-600" />
          <h3 className="text-center text-[18px] font-[700] text-layout-black dark:text-layout-white">
            일본어 키보드를 추가해 주세요
          </h3>
          <p className="text-center text-[13px] leading-[1.5] break-keep text-layout-gray-400 dark:text-layout-gray-200">
            일본어는 직접 써 보는 문제가 있어서 일본어 키보드가 필요해요
          </p>
        </div>

        {steps ? (
          <ol className="flex flex-col gap-[8px] rounded-[12px] p-[14px] bg-layout-gray-50 dark:bg-layout-gray-dark">
            {steps.map((text, i) => (
              <li key={text} className="flex items-start gap-[10px]">
                <span className="
                  flex-shrink-0 w-[20px] h-[20px] rounded-full
                  flex items-center justify-center
                  text-[12px] font-[700] bg-primary-main-600 text-layout-white dark:text-layout-black
                ">{i + 1}</span>
                <span className="text-[14px] font-[600] leading-[1.5] break-keep text-layout-black dark:text-layout-white">{text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-[12px] p-[14px] text-[14px] font-[600] leading-[1.5] break-keep bg-layout-gray-50 dark:bg-layout-gray-dark text-layout-black dark:text-layout-white">
            기기의 키보드 설정에서 언어에 일본어를 추가해 주세요
          </p>
        )}

        {showIosAppNote && (
          <p className="text-[13px] leading-[1.5] break-keep text-layout-gray-400 dark:text-layout-gray-200">
            설정 열기를 누르면 헤이보카 설정이 열려요. 뒤로 가서 일반 &gt; 키보드로 이동해 주세요
          </p>
        )}

        <div className="flex flex-col gap-[8px]">
          <p className="text-[14px] font-[700] text-layout-black dark:text-layout-white">
            입력해서 확인하기
          </p>
          <p className="text-[13px] leading-[1.5] break-keep text-layout-gray-400 dark:text-layout-gray-200">
            추가했다면 키보드를 일본어로 바꿔서 아래에 あ 를 입력해 보세요
          </p>
          <input
            type="text"
            lang="ja"
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            placeholder="あ"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value);
              if (!e.nativeEvent?.isComposing) verify(e.target.value);
            }}
            onCompositionEnd={(e) => verify(e.target.value)}
            className="
              w-full h-[45px] px-[15px] text-center
              bg-layout-white dark:bg-layout-black
              border-[1px] border-layout-gray-200 dark:border-[#444444] rounded-[8px]
              font-[600] text-[16px] text-layout-black dark:text-layout-white
              outline-none focus:border-primary-main-600
            "
          />
        </div>

        <div className="flex items-center justify-center gap-[6px]">
          {status === 'enabled' ? (
            <>
              <CheckCircle size={18} weight="fill" aria-hidden="true" className="text-status-success-500" />
              <span className="text-[13px] font-[700] text-status-success-600 dark:text-status-success-400">일본어 키보드가 확인됐어요</span>
            </>
          ) : (
            <motion.button
              type="button"
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-[6px] px-[10px] py-[6px] text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-100"
              onClick={() => { vibrate({ duration: 5 }); setStatus('checking'); recheck(); }}
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
              {status === 'checking' ? '확인하는 중이에요' : '다시 확인'}
            </motion.button>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between gap-[15px] p-[20px]">
        <motion.button
          className="
            flex-1 h-[52px] rounded-[12px]
            text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
          onClick={() => { vibrate({ duration: 5 }); resolveNewBottomSheet(false); }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 500, damping: 15 }}
        >나중에</motion.button>
        {canOpenSettings && (
          <motion.button
            className="
              flex-1 h-[52px] rounded-[12px]
              bg-primary-main-600
              text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]"
            onClick={handleOpenSettings}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 500, damping: 15 }}
          >설정 열기</motion.button>
        )}
      </div>
    </div>
  );
};

export default JaKeyboardGateNewBottomSheet;
