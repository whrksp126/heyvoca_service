// src/components/mascot/HeyPreview.jsx
//
// 헤이 포즈 미리보기 — 개발용 라우트 /dev/hey.
// 포즈 전체를 한눈에 보고, 홈이 어떤 상황에서 어떤 포즈를 고르는지도 여기서 돌려 본다.

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CaretLeft, Moon, Sun } from '@phosphor-icons/react';
import Hey from './Hey';
import { HEY_POSES, HEY_POSE_KEYS, resolveHomeHeyPose } from './heyPoses';

const HOME_CASES = [
  { key: 'empty', label: '빈 밭', args: { homeState: 'empty' } },
  { key: 'critical', label: '썩기 직전 다수', args: { homeState: 'critical', critical: 6 } },
  { key: 'criticalFew', label: '썩기 직전 1~3', args: { homeState: 'due', critical: 2, due: 8 } },
  { key: 'due', label: '돌봄 남음', args: { homeState: 'due', due: 12 } },
  { key: 'dueFew', label: '돌봄 3개 이하', args: { homeState: 'due', due: 2 } },
  { key: 'newSeed', label: '새 씨앗 차례', args: { homeState: 'newSeed' } },
  { key: 'done', label: '전부 완료', args: { homeState: 'done' } },
  { key: 'loading', label: '조회 전', args: { loaded: false } },
];

const HOURS = [
  { hour: 9, label: '낮' },
  { hour: 23, label: '밤' },
];

const HeyPreview = () => {
  "use memo";

  const navigate = useNavigate();
  // 테마는 앱 설정을 건드리지 않고 이 화면에서만 바꿔 본다 — 나갈 때 원래대로 돌려놓는다.
  const initialDark = useRef(document.documentElement.classList.contains('dark'));
  const [dark, setDark] = useState(initialDark.current);
  useEffect(() => {
    const root = document.documentElement;
    const original = initialDark.current;
    root.classList.toggle('dark', dark);
    return () => { root.classList.toggle('dark', original); };
  }, [dark]);
  const [paused, setPaused] = useState(false);
  const [hour, setHour] = useState(9);
  const [lastTap, setLastTap] = useState(null);

  return (
    <div>
      <div className="min-h-screen overflow-y-auto h-screen bg-farm-canvas dark:bg-layout-black text-layout-black dark:text-layout-white">
        <div className="
          sticky top-0 z-[10] flex items-center gap-[8px]
          px-[12px] pt-[max(12px,var(--status-bar-height))] pb-[12px]
          bg-farm-canvas/90 dark:bg-layout-black/90 backdrop-blur-[8px]
        ">
          <button
            type="button"
            aria-label="뒤로"
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-[36px] h-[36px] rounded-full"
          >
            <CaretLeft size={22} weight="bold" />
          </button>
          <h1 className="flex-1 text-[18px] font-[700] tracking-[-0.02em]">헤이 포즈 미리보기</h1>
          <button
            type="button"
            onClick={() => setPaused((v) => !v)}
            className="h-[36px] px-[12px] rounded-full text-[13px] font-[700] bg-layout-white dark:bg-layout-gray-dark border border-layout-gray-100 dark:border-white/10"
          >
            {paused ? '움직이기' : '멈추기'}
          </button>
          <button
            type="button"
            aria-label={dark ? '라이트 모드로' : '다크 모드로'}
            onClick={() => setDark((v) => !v)}
            className="flex items-center justify-center w-[36px] h-[36px] rounded-full bg-layout-white dark:bg-layout-gray-dark border border-layout-gray-100 dark:border-white/10"
          >
            {dark ? <Sun size={18} weight="fill" /> : <Moon size={18} weight="fill" />}
          </button>
        </div>

        <div className="px-[16px] pb-[48px] max-w-[720px] mx-auto">
          <p className="text-[13px] text-layout-gray-400 dark:text-layout-gray-300 leading-[1.5]">
            탭하면 폴짝 뜁니다. {lastTap ? `방금 탭한 포즈: ${HEY_POSES[lastTap].label}` : '아무 헤이나 눌러 보세요.'}
          </p>

          <h2 className="mt-[20px] mb-[10px] text-[15px] font-[700]">포즈 {HEY_POSE_KEYS.length}가지</h2>
          <div className="grid grid-cols-3 gap-[10px]">
            {HEY_POSE_KEYS.map((key) => (
              <div
                key={key}
                className="flex flex-col items-center pt-[14px] pb-[12px] px-[6px] rounded-[16px] bg-layout-white dark:bg-layout-gray-dark border border-layout-gray-100 dark:border-white/10"
              >
                <Hey pose={key} size={96} paused={paused} onTap={setLastTap} label={`헤이 — ${HEY_POSES[key].label}`} />
                <span className="mt-[8px] text-[13px] font-[700] tracking-[-0.02em]">{HEY_POSES[key].label}</span>
                <span className="mt-[2px] text-[11px] text-layout-gray-400 dark:text-layout-gray-300 text-center leading-[1.3]">
                  {HEY_POSES[key].hint}
                </span>
                <code className="mt-[4px] text-[10px] text-layout-gray-300 dark:text-layout-gray-400">{key}</code>
              </div>
            ))}
          </div>

          <div className="mt-[28px] mb-[10px] flex items-center justify-between">
            <h2 className="text-[15px] font-[700]">홈이 고르는 포즈</h2>
            <div className="inline-flex p-[3px] rounded-full bg-layout-gray-50 dark:bg-layout-gray-dark">
              {HOURS.map((h) => (
                <button
                  key={h.hour}
                  type="button"
                  onClick={() => setHour(h.hour)}
                  className={`h-[28px] px-[12px] rounded-full text-[12px] font-[700] ${hour === h.hour ? 'bg-layout-white dark:bg-layout-black shadow-sm' : 'text-layout-gray-400'}`}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-[8px]">
            {HOME_CASES.map((c) => {
              const pose = resolveHomeHeyPose({ ...c.args, hour });
              return (
                <div
                  key={c.key}
                  className="flex flex-col items-center py-[10px] px-[4px] rounded-[14px] bg-layout-white dark:bg-layout-gray-dark border border-layout-gray-100 dark:border-white/10"
                >
                  <Hey pose={pose} size={64} paused={paused} />
                  <span className="mt-[6px] text-[11px] font-[700] text-center leading-[1.3]">{c.label}</span>
                  <span className="text-[10px] text-layout-gray-400 dark:text-layout-gray-300">{HEY_POSES[pose].label}</span>
                </div>
              );
            })}
          </div>

          <h2 className="mt-[28px] mb-[10px] text-[15px] font-[700]">크기 · 좌우 반전</h2>
          <div className="flex items-end gap-[14px] p-[14px] rounded-[16px] bg-layout-white dark:bg-layout-gray-dark border border-layout-gray-100 dark:border-white/10 overflow-x-auto">
            <Hey pose="idle" size={32} paused={paused} />
            <Hey pose="wave" size={48} paused={paused} />
            <Hey pose="water" size={72} paused={paused} />
            <Hey pose="water" size={72} flip paused={paused} />
            <Hey pose="joy" size={120} paused={paused} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeyPreview;
