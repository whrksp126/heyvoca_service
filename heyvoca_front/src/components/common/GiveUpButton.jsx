/*
  '모르겠어요' — 문제 카드 안 중앙 하단의 작은 텍스트 버튼(2026-11-19 QA).
  누르면 호출부가 즉시 오답 채점한다. 채점 뒤에는 호출부가 숨겨(visible=false) 농장 상태 바 자리와
  겹치지 않게 한다. 단어 쓰기(spellingFill)·문장 조립(sentenceArrange)·해석 조립(sentenceTranslate) 공용.

  pointerdown/mousedown 기본 동작을 막아 숨긴 입력(키보드)의 포커스를 뺏지 않는다.
  카드는 relative 여야 한다(absolute 로 카드 하단에 붙는다).
*/
const GiveUpButton = ({ visible = true, onClick }) => {
  if (!visible) return null;
  return (
    <div className="absolute left-0 right-0 bottom-[10px] z-[2] flex justify-center pointer-events-none">
      <button
        type="button"
        onPointerDown={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
        className="pointer-events-auto px-[10px] py-[6px] text-[13px] font-[700] text-layout-gray-400 dark:text-layout-gray-100 underline underline-offset-[3px] decoration-layout-gray-300 dark:decoration-[#555555]"
      >
        모르겠어요
      </button>
    </div>
  );
};

export default GiveUpButton;
