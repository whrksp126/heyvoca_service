// src/components/home/main
import React from 'react';
import logo_h from '../../assets/images/logo_h.png';
import 헤이캐릭터02 from '../../assets/images/헤이캐릭터02.png';

import { SketchLogo } from '@phosphor-icons/react';

const Main = () => {
  return (
    <div className="
        flex flex-col
        h-screen
      "
      style={{
        background: 'linear-gradient(to bottom, #FF69C6 0%, #FF8DD4 22%, #FFFFFF 42%)',
      }}
    >
      <div className="
        flex justify-between items-center
        pt-[20px] px-[16px] pb-[14px]
      ">
        <img src={logo_h} alt="heyvoca logo" className="h-[25px]" />
        <div className="flex gap-[5px] items-center">
          <div className="w-[20px] h-[20px] flex items-center justify-center rounded-full bg-[#FF8DD4]">
            <SketchLogo size={12} color="#fff" />
          </div>
          <span className="text-[#fff] text-[14px] font-bold">50</span>
        </div>
      </div>


      <div className="
        relative
        flex flex-col items-start justify-center gap-[20px]
        px-[20px] py-[10px]
      ">
        <h2 className="
          text-[#fff] text-[24px]
        ">
          <strong>헤이</strong>님,<br/>
          <strong>1,450개</strong><br/>
          단어를 학습 중이에요!
        </h2>
        <img src={헤이캐릭터02} alt="" className="
          absolute top-[-9px] right-[25px]
          h-[148px]
        " />
        <div className="relative flex w-[100%] h-[50px]">
          <div className="
            absolute top-[0] left-[0] right-[0] bottom-[0] z-[0]
            rounded-[10px]
            bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
          "></div>
          <button className="
            absolute top-[3px] left-[3px] right-[3px] bottom-[3px] z-[1]
            flex items-center justify-center
            rounded-[7px]
            bg-white
          ">
            <span className="
              text-transparent bg-clip-text
              bg-gradient-to-br from-[rgba(255,141,212,1)] via-[rgba(205,141,255,1)] to-[rgba(116,213,255,1)]
              text-[16px] font-[800]
            ">
              오늘의 학습
            </span>
          </button>
        </div>
      </div>


      <div>
        <h2>데일리 미션</h2>
        <div>
          <div>
            <span>접속하기</span>
            <div>완료</div>
          </div>
          <div>
            <span>오늘의 학습</span>
            <div>미완료</div>
          </div>
        </div>
      </div>

    </div>
  )
}
export default Main;