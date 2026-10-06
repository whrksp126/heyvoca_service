// src/components/takeTest/rewards/LegacyAuroraStage.jsx
//
// 예전 규격 슬라이드(연속 학습 · 출석 등)의 본문 — 스크롤 영역 + 아이콘 뒤 핑크 오로라.
// 새 연출 슬라이드(밭 성장 · 아이템 · 보석 · 업적)는 각자 빛을 그리므로 이 본문을 쓰지 않는다.
import React from 'react';
import { motion } from 'framer-motion';
import ResultItemBackground01 from '../../../assets/images/ResultItemBackground01.svg';
import ResultItemBackground02 from '../../../assets/images/ResultItemBackground02.svg';

const LIST_SLIDE_TOP_PAD = 40;   // 컨테이너 위 패딩(28) 위에 더 얹는 값

/*
  컨텐츠 영역 — **여기가 스크롤한다.**
  그림·문구·목록이 한 덩어리로 움직이고, 아이콘 뒤 글로우도 같은 블록 안에 있어
  따라 움직인다. 짧은 슬라이드는 min-h-full + justify-center 로 가운데에 선다.
  (예전에는 -translate-y-[55px] 로 헤더 높이만큼 끌어올려 가운데를 맞췄는데,
   스크롤이 생기면 그만큼 아래가 잘리므로 패딩으로 자리를 잡는다.)

  isListSlide: 목록이 붙는 슬라이드 — 가운데 정렬도 오로라도 쓰지 않고 위 여백만 준다.
  noGlow: 오로라만 뺀다(연속 학습).
*/
const LegacyAuroraStage = ({ isListSlide = false, noGlow = false, children }) => (
  <div className='relative flex-1 overflow-y-auto scrollbar-hide px-[20px] py-[28px]'>
    <div className={`relative w-full ${isListSlide ? '' : 'min-h-full flex flex-col justify-center'}`}>
      {/*
        글로우 기준 블록 — **콘텐츠 높이에 딱 맞는다.**
        보상 슬라이드는 바깥이 min-h-full 이라 글로우를 거기에 붙이면
        `top-50px` 이 화면 위쪽 50px 이 되어, 세로 중앙에 선 아이콘과 어긋난다.
        콘텐츠와 같은 높이의 블록을 한 겹 두고 그 안에서 재면 항상 아이콘 중심이다.
      */}
      <div className='relative w-full' style={isListSlide ? { paddingTop: LIST_SLIDE_TOP_PAD } : undefined}>
        {noGlow ? null : (
          <>
            {/* ResultItemBackground01: 크기 변화 + 회전 + 섬광 효과 */}
            <div className='pointer-events-none absolute top-[50px] left-[50%] z-0 translate-x-[-50%] translate-y-[-50%] w-[230px] h-[230px]'>
              <motion.img
                src={ResultItemBackground01}
                alt="결과 아이템 배경"
                className='w-full h-full object-contain'
                animate={{
                  rotate: [0, 360, 720],
                  scale: [1, 2, 1, 2, 1],
                  opacity: [0.8, 1, 0.8, 1, 0.8],
                }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
            {/* ResultItemBackground02: 투명도 + 확대/축소 */}
            <div className='pointer-events-none absolute top-[50px] left-[50%] z-0 translate-x-[-50%] translate-y-[-50%] w-[757px] h-[600px]'>
              <motion.img
                src={ResultItemBackground02}
                alt="결과 아이템 배경"
                className='w-full h-full object-contain'
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </>
        )}
        <div className='relative z-10 w-full flex flex-col items-center'>
          {children}
        </div>
      </div>
    </div>
  </div>
);

export default LegacyAuroraStage;
