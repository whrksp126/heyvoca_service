import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useNewBottomSheetActions } from '../../context/NewBottomSheetContext';
import { useUser } from '../../context/UserContext';
import { vibrate, showToast } from '../../utils/osFunction';
import { SUPPORTED_LEARNING_LANGS, LANG_LABEL, LANG_GLYPH } from '../../utils/lang';
import { getScriptProgressApi } from '../../api/script';
import { ConfirmNewBottomSheet } from './ConfirmNewBottomSheet';
import SetupTile from '../common/SetupTile';

// 일본어로 처음 전환할 때 "글자부터 익혀 볼래요?" 권유는 딱 1회만 — 과하지 않게.
const JA_SCRIPT_PROMPT_KEY = 'heyvoca_script_prompt_ja_shown';

/** 언어 타일의 글자 배지 — TestSetupNewBottomSheet의 방향 배지와 같은 규격
 *  (currentColor 테두리라 타일 선택색을 그대로 따른다). */
const LangBadge = ({ children }) => (
  <span className="flex items-center justify-center w-[40px] h-[30px] rounded-[8px] border-[1.5px] border-current text-[15px] font-[800]">
    {children}
  </span>
);

/**
 * 학습 언어 전환 — 홈 왼쪽 위 언어 칩(실험실 "다른 언어 학습하기" 켜짐)에서 연다.
 *
 * 규격은 설정 계열 시트(StudySetupNewBottomSheet · TestSetupNewBottomSheet)와 같다 —
 * 제목 중앙 18px/700 · 선택 타일(SetupTile, 체크 배지) · 하단 취소/확인 2버튼.
 * 고르는 즉시 바뀌지 않고 '확인'을 눌러야 전환된다(다른 설정 시트와 동일한 흐름).
 * 이모지·국기는 쓰지 않는다(디자인 규칙) — 언어 표지는 한 글자 배지(Aa/あ)로 대신한다.
 */
export const LearningLangNewBottomSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewBottomSheet, pushAwaitNewBottomSheet } = useNewBottomSheetActions();
  const { learningLang, setLearningLang } = useUser();
  const [selectedLang, setSelectedLang] = useState(learningLang);
  const [applying, setApplying] = useState(false);
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

  const handleConfirm = async () => {
    if (applying) return;
    vibrate({ duration: 5 });
    if (selectedLang === learningLang) {
      popNewBottomSheet();
      return;
    }
    setApplying(true);
    const ok = await setLearningLang(selectedLang);
    setApplying(false);
    if (!ok) {
      showToast('학습 언어를 바꾸지 못했어요. 다시 시도해주세요.');
      return;
    }
    popNewBottomSheet();
    showToast(`${LANG_LABEL[selectedLang]} 학습으로 전환했어요`);
    if (selectedLang === 'ja') maybePromptScriptField();
  };

  return (
    <div className="relative">
      <div className="
        flex flex-col gap-[20px]
        max-h-[calc(90vh-47px)]
        pt-[20px] px-[20px] pb-[115px]
        overflow-y-auto
      ">
        <h1 className="text-[18px] font-[700] text-center text-layout-black dark:text-layout-white">
          학습 언어
        </h1>

        <div className="flex gap-[8px]">
          {SUPPORTED_LEARNING_LANGS.map((lang) => (
            <SetupTile
              key={lang}
              role="radio"
              selected={selectedLang === lang}
              onClick={() => { if (!applying) setSelectedLang(lang); }}
              className="h-[96px]"
            >
              <LangBadge>{LANG_GLYPH[lang]}</LangBadge>
              <span className="text-[14px] font-[700] group-data-[selected=true]:text-layout-black dark:group-data-[selected=true]:text-layout-white">
                {LANG_LABEL[lang]}
              </span>
            </SetupTile>
          ))}
        </div>
      </div>

      <div className="
        absolute bottom-0 left-0 right-0
        flex items-center justify-between gap-[15px]
        p-[20px]
      ">
        <motion.button
          className="
            flex-1
            h-[52px]
            rounded-[12px]
            text-[16px] font-[700] tracking-[-0.03em]
            border-[2px] border-border dark:border-border-dark bg-layout-white dark:bg-layout-black text-layout-gray-400 dark:text-layout-gray-100"
          onClick={() => { vibrate({ duration: 5 }); popNewBottomSheet(); }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >취소</motion.button>
        <motion.button
          className="
            flex-1
            h-[52px]
            rounded-[12px]
            bg-primary-main-600
            text-layout-white dark:text-layout-black text-[16px] font-[700] tracking-[-0.03em]
            disabled:opacity-60
          "
          onClick={handleConfirm}
          disabled={applying}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >{applying ? '바꾸는 중…' : '확인'}</motion.button>
      </div>
    </div>
  );
};

export default LearningLangNewBottomSheet;
