import React, { useEffect, useState } from 'react';
import { CaretLeft, Lightbulb, Translate, Plant } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { vibrate, showToast } from '../../utils/osFunction';
import { getLabSettingsApi, setLabFeatureApi, getCachedLabFeatures } from '../../api/lab';
import { useUser } from '../../context/UserContext';
import { DEFAULT_LEARNING_LANG, LANG_LABEL } from '../../utils/lang';

// 실험실 기능 목록 — 새 기능은 이 배열에 한 줄 추가로 노출된다.
const LAB_FEATURES = [
  {
    key: 'recall_first',
    icon: Lightbulb,
    name: '먼저 떠올려 보기',
    desc: '보기를 보기 전에 답을 먼저 떠올려 봐요',
  },
  {
    key: 'farm_home',
    icon: Plant,
    name: '내 농장 꾸미기',
    desc: '홈을 꾸밀 수 있는 농장으로 바꿔요',
  },
  {
    key: 'multi_lang',
    icon: Translate,
    name: '다른 언어 학습하기 (베타)',
    desc: '홈 왼쪽 위에서 학습 언어를 바꿀 수 있어요',
  },
];

// 응답 payload가 {data:{features}} / {features} 둘 중 어떤 형태로 와도 안전하게 추출
const extractFeatures = (result) => result?.data?.features || result?.features || null;

const ToggleSwitch = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    className={`
      relative inline-flex h-[28px] w-[50px] shrink-0 cursor-pointer rounded-full border-2 border-transparent
      transition-colors duration-200 ease-in-out focus:outline-none
      ${checked ? 'bg-primary-main-500' : 'bg-layout-gray-100 dark:bg-layout-gray-300'}
    `}
  >
    <span className="sr-only">토글</span>
    <span
      className={`
        pointer-events-none inline-block h-[24px] w-[24px] transform rounded-full bg-layout-white shadow ring-0
        transition duration-200 ease-in-out
        ${checked ? 'translate-x-[22px]' : 'translate-x-0'}
      `}
    />
  </button>
);

// 마이페이지 > 설정 > 실험실 — 정식 출시 전 기능을 미리 켜볼 수 있는 화면
const LabNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const { learningLang, setLearningLang } = useUser();
  // 앱 시작 시 prefetch된 캐시로 초기화 → 열자마자 올바른 토글 상태(OFF 깜빡임 없음).
  const [features, setFeatures] = useState(() => getCachedLabFeatures() || {});

  // 진입 시 최신 설정으로 재검증(캐시가 있으면 화면은 이미 정확하므로 깜빡임 없음)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const result = await getLabSettingsApi();
        const loaded = extractFeatures(result);
        if (mounted && loaded) setFeatures(loaded);
      } catch (error) {
        console.error('실험실 설정 로드 실패:', error);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleToggle = async (key) => {
    vibrate({ duration: 5 });
    const next = !features[key];

    // 낙관적 업데이트
    setFeatures((prev) => ({ ...prev, [key]: next }));

    try {
      const result = await setLabFeatureApi(key, next);
      const updated = extractFeatures(result);
      if (updated) setFeatures(updated);
    } catch (error) {
      console.error('실험실 기능 설정 변경 실패:', error);
      // 롤백
      setFeatures((prev) => ({ ...prev, [key]: !next }));
      showToast('설정 변경에 실패했어요. 다시 시도해주세요.');
      return;
    }

    // 다른 언어 학습을 끄면 기본 언어(영어)로 되돌린다 — 칩이 사라져 되돌릴 방법이 없어지므로.
    if (key === 'multi_lang' && !next && learningLang !== DEFAULT_LEARNING_LANG) {
      const ok = await setLearningLang(DEFAULT_LEARNING_LANG);
      showToast(ok
        ? `${LANG_LABEL[DEFAULT_LEARNING_LANG]} 학습으로 돌아왔어요`
        : '학습 언어를 되돌리지 못했어요. 다시 시도해주세요.');
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      {/* Header */}
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-[#ddd]"
      >
        <motion.button
          onClick={() => { vibrate({ duration: 5 }); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileHover={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', scale: 1.05 }}
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">
          실험실
        </h1>
        <div className="w-[24px]" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-[20px] pt-[20px] pb-[8px]">
          <p className="text-[13px] text-layout-gray-300 leading-[1.5]">
            아직 정식 출시 전인 기능을 미리 켜볼 수 있어요.{'\n'}
            불안정할 수 있으니 참고해주세요.
          </p>
        </div>

        <ul className="w-full m-0 p-0 list-none">
          {LAB_FEATURES.map((feature) => {
            const Icon = feature.icon;
            const enabled = !!features[feature.key];
            return (
              <li key={feature.key} className="flex flex-col bg-layout-white dark:bg-layout-black">
                <div className="flex items-center justify-between px-[20px] py-[16px] border-b border-[#ddd] dark:border-border-dark">
                  <div className="flex items-center gap-3 pr-[16px]">
                    <Icon weight="fill" className="text-[20px] text-primary-main-600 shrink-0" />
                    <div className="flex flex-col gap-[2px]">
                      <span className="text-[16px] font-bold text-layout-black dark:text-layout-white">
                        {feature.name}
                      </span>
                      <span className="text-[13px] text-layout-gray-200 dark:text-layout-gray-300 leading-tight">
                        {feature.desc}
                      </span>
                    </div>
                  </div>
                  <ToggleSwitch checked={enabled} onChange={() => handleToggle(feature.key)} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default LabNewFullSheet;
