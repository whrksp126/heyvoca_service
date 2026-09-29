import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Translate } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { vibrate, showToast } from '../../utils/osFunction';
import { SUPPORTED_LEARNING_LANGS, LANG_LABEL } from '../../utils/lang';
import { getScriptProgressApi } from '../../api/script';
import { ConfirmNewBottomSheet } from './ConfirmNewBottomSheet';

// 일본어로 처음 전환할 때 "글자부터 익혀 볼래요?" 권유는 딱 1회만 — 과하지 않게.
const JA_SCRIPT_PROMPT_KEY = 'heyvoca_script_prompt_ja_shown';

/**
 * 학습 언어 전환 — 홈 왼쪽 위 언어 칩(실험실 "다른 언어 학습하기" 켜짐)에서 연다.
 *
 * 행 규격은 VocabularyBookMenuNewBottomSheet 와 같다(아이콘 사각 30px · 제목 14.5px/700).
 * 현재 언어 행에만 체크를 단다. 고르면 서버에 저장(setLearningLang) → 단어장·통계·농장이
 * 새 언어 기준으로 재조회된다. 이모지·국기는 쓰지 않는다(디자인 규칙).
 */
export const LearningLangNewBottomSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewBottomSheet, pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { learningLang, setLearningLang } = useUser();
  const [pendingLang, setPendingLang] = useState(null);
  const navigate = useNavigate();

  // 가나 진행이 전혀 없을 때만 1회 권유 — 실패해도(네트워크 등) 그냥 넘어간다(권유일 뿐).
  const maybePromptScriptField = async () => {
    try {
      if (localStorage.getItem(JA_SCRIPT_PROMPT_KEY) === '1') return;
      localStorage.setItem(JA_SCRIPT_PROMPT_KEY, '1');
      const res = await getScriptProgressApi('hiragana');
      const items = res?.code === 200 ? (res.data?.items || []) : [];
      const anyStarted = items.some((it) => (it.level || 0) > 0);
      if (anyStarted) return;
      setTimeout(async () => {
        const go = await pushAwaitNewBottomSheet(
          ConfirmNewBottomSheet,
          {
            title: '글자부터 익혀 볼래요?',
            subTitle: '히라가나·가타카나 읽기부터 천천히 시작할 수 있어요',
            btns: { confirm: '글자 밭 가기', cancel: '나중에' },
          },
          { isBackdropClickClosable: true, isDragToCloseEnabled: true }
        );
        if (go) navigate('/script');
      }, 500);
    } catch (e) { /* 권유일 뿐 — 조용히 무시 */ }
  };

  const handleSelect = async (lang) => {
    if (pendingLang) return;
    vibrate({ duration: 5 });
    if (lang === learningLang) {
      popNewBottomSheet();
      return;
    }
    setPendingLang(lang);
    const ok = await setLearningLang(lang);
    setPendingLang(null);
    if (!ok) {
      showToast('학습 언어를 바꾸지 못했어요. 다시 시도해주세요.');
      return;
    }
    popNewBottomSheet();
    showToast(`${LANG_LABEL[lang]} 학습으로 전환했어요`);
    if (lang === 'ja') maybePromptScriptField();
  };

  return (
    <div className="flex flex-col px-[20px] pt-[18px] pb-[20px]">
      <h1 className="text-[16px] font-[700] tracking-[-0.03em] text-layout-black dark:text-layout-white">
        학습 언어
      </h1>

      <div className="mt-[10px]">
        {SUPPORTED_LEARNING_LANGS.map((lang, idx) => {
          const isCurrent = lang === learningLang;
          const isPending = lang === pendingLang;
          return (
            <motion.button
              key={lang}
              type="button"
              onClick={() => handleSelect(lang)}
              disabled={!!pendingLang}
              whileTap={{ scale: 0.99, backgroundColor: 'rgba(0,0,0,0.03)' }}
              className={`
                flex items-center gap-[11px] w-full py-[12px] text-left rounded-[8px]
                disabled:opacity-60
                ${idx > 0 ? 'border-t border-[#F4F4F4] dark:border-[rgba(255,255,255,.07)]' : ''}
              `}
            >
              <span
                className={`
                  w-[30px] h-[30px] shrink-0 rounded-[9px] flex items-center justify-center
                  ${isCurrent
                    ? 'bg-primary-main-100 dark:bg-primary-main-dark text-primary-main-600'
                    : 'bg-layout-gray-50 dark:bg-[#2A2A2A] text-layout-gray-400'}
                `}
              >
                <Translate size={16} weight="bold" />
              </span>

              <span
                className={`
                  flex-1 min-w-0 text-[14.5px] font-[700] tracking-[-0.03em]
                  ${isCurrent ? 'text-primary-main-600' : 'text-layout-black dark:text-layout-white'}
                `}
              >
                {LANG_LABEL[lang]}
                {isPending && (
                  <small className="ml-[6px] text-[11.5px] font-[500] tracking-[-0.02em] text-layout-gray-300">
                    바꾸는 중…
                  </small>
                )}
              </span>

              {isCurrent && (
                <Check size={18} weight="fill" className="shrink-0 text-primary-main-600" />
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
};

export default LearningLangNewBottomSheet;
