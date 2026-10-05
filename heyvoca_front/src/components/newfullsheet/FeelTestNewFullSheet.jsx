import React, { useState, useEffect } from 'react';
import { CaretLeft, HandTap, FilmSlate } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useNewFullSheetActions } from '../../context/NewFullSheetContext';
import { parseAppVersion, getDevicePlatform } from '../../utils/osFunction';
import {
  feel, getFeelTimingSnapshot, getHapticOffsetMs, setHapticOffsetMs,
  SFX_DURATION_MS, getHapticPattern, validatePattern, PATTERN_DURATION_MS,
  Pressable, requestHapticCaps,
} from '../../lib/feel';
import { ComboInterlude, CompleteCut } from '../takeTest/StudyInterlude';

// 손맛 테스트(마이페이지 > 설정 > 실험실) — 모든 큐를 눌러 재생해 보고, 진동 오프셋(ms)으로
// 소리와 진동의 엇박을 실기기에서 직접 맞춘다. 맞춘 값을 알려 주면 lib/feel/cue.js 의
// FEEL_TIMING.PLATFORM_OFFSET_MS 상수에 반영한다. 오프셋은 이 기기 localStorage(feel.hapticOffsetMs)에 저장된다.
const CUE_LIST = [
  { cue: 'tap', label: '탭', desc: '작은 나무 톡 + 가장 약한 tick' },
  { cue: 'select', label: '선택', desc: '물방울 뽁 + click' },
  { cue: 'correct', label: '정답', desc: '마림바 2음 상승, tick 후 click' },
  { cue: 'wrong', label: '오답', desc: '낮고 부드러운 뿌웅, heavyClick 1회' },
  { cue: 'match', label: '카드 짝 맞음', desc: '맑은 딩딩, tick 2회' },
  { cue: 'combo', n: 2, label: '콤보 2', desc: '펜타토닉을 따라 한 음씩 올라감' },
  { cue: 'combo', n: 5, label: '콤보 5' },
  { cue: 'combo', n: 10, label: '콤보 10' },
  { cue: 'combo', n: 14, label: '콤보 14(상한)' },
  { cue: 'perfect', label: '완벽해요', desc: '반짝이는 3음, tick tick click' },
  { cue: 'progress', label: '진행바 채움', desc: '아주 작게' },
  { cue: 'bonus', label: '보너스', desc: '통통 튀는 4음' },
  { cue: 'complete', label: '완료', desc: '짧은 팡파르' },
];

const Row = ({ label, value }) => (
  <div className="flex items-start justify-between gap-[12px] py-[6px]">
    <span className="text-[13px] text-layout-gray-300">{label}</span>
    <span className="text-[13px] font-[600] text-layout-black dark:text-layout-white text-right break-all">{value}</span>
  </div>
);

const FeelTestNewFullSheet = () => {
  "use memo"; // React Compiler가 이 컴포넌트를 자동으로 최적화

  const { popNewFullSheet } = useNewFullSheetActions();
  const [offset, setOffset] = useState(() => getHapticOffsetMs());
  const [snap, setSnap] = useState(() => getFeelTimingSnapshot());
  const [lastPlayed, setLastPlayed] = useState(null);
  // 학습 중 전체 화면 연출 미리 보기 — { kind: 'interlude' | 'complete', n?, key }
  const [preview, setPreview] = useState(null);
  const [interludeToggle, setInterludeToggle] = useState(false);

  // undefined = 조회 중, null = 회신 없음(구버전 앱/웹)
  const [caps, setCaps] = useState(undefined);
  useEffect(() => {
    let alive = true;
    requestHapticCaps().then((v) => { if (alive) setCaps(v); });
    return () => { alive = false; };
  }, []);

  const platform = getDevicePlatform() === 'android' ? 'android' : 'ios';
  const appInfo = parseAppVersion();

  const play = (item) => {
    // 오디오 컨텍스트는 첫 탭에서 만들어지므로 재생 뒤에 측정값을 갱신한다.
    feel(item.cue, { n: item.n });
    setLastPlayed(`${item.label}`);
    setSnap(getFeelTimingSnapshot());
  };

  const changeOffset = (value) => {
    const v = setHapticOffsetMs(value);
    setOffset(v);
    setSnap(getFeelTimingSnapshot());
  };

  const totalDelay = Math.round(
    snap.leadMs + snap.outputLatencyMs - snap.bridgeMs + snap.platformOffsetMs + snap.userOffsetMs,
  );

  return (
    <div className="flex flex-col h-full w-full bg-layout-white dark:bg-layout-black">
      <div style={{ paddingTop: 'var(--status-bar-height)' }}></div>
      <div
        data-page-header
        className="relative flex items-center justify-between h-[55px] pt-[20px] px-[16px] pb-[14px] border-b border-[#ddd]"
      >
        <motion.button
          onClick={() => { feel('tap'); popNewFullSheet(); }}
          className="text-layout-gray-200 dark:text-layout-white rounded-[8px]"
          whileTap={{ scale: 0.95, backgroundColor: 'rgba(0, 0, 0, 0.1)' }}
          transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
          <CaretLeft size={24} />
        </motion.button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-[18px] font-[700] text-layout-black dark:text-layout-white">
          손맛 테스트
        </h1>
        <div className="w-[24px]" />
      </div>

      <div className="flex-1 overflow-y-auto pb-[40px]">
        {/* 현재 측정값 */}
        <section className="px-[20px] pt-[20px]">
          <h2 className="text-[14px] font-[700] text-layout-black dark:text-layout-white mb-[6px]">현재 측정값</h2>
          <div className="rounded-[12px] bg-layout-gray-50 dark:bg-layout-gray-dark px-[16px] py-[8px]">
            <Row label="플랫폼" value={`${snap.platform}${appInfo ? ` · 앱 ${appInfo.version}${appInfo.build ? ` (${appInfo.build})` : ''}` : ' · 앱 아님(웹)'}`} />
            <Row label="진동 패턴 지원" value={snap.patternSupported ? '예 (haptic_pattern, 앱 1.1.2+)' : '아니오 (기존 진동/웹 폴백)'} />
            <Row
              label="진동 능력(haptic_caps)"
              value={caps === undefined ? '조회 중' : caps === null ? '회신 없음 (웹 또는 앱 미지원)'
                : `${caps.platform} · API ${caps.apiLevel} · 진폭제어 ${caps.hasAmplitudeControl ? '예' : '아니오'} · 프리베이크 ${caps.supportsPrebaked ? '예' : '아니오'}`}
            />
            <Row label="오디오 출력 지연" value={`${snap.outputLatencyMs.toFixed(1)}ms · ${snap.outputLatencySource}`} />
            <Row label="오디오 리드" value={`${snap.leadMs}ms`} />
            <Row label="브릿지 지연 추정" value={`${snap.bridgeMs}ms`} />
            <Row label="플랫폼 보정(상수)" value={`${snap.platformOffsetMs}ms`} />
            <Row label="사용자 오프셋" value={`${snap.userOffsetMs}ms`} />
            <Row label="진동 지연 합계" value={`${totalDelay}ms${totalDelay < 0 ? ' (음수 → 소리를 늦춤)' : ''}`} />
            {lastPlayed && <Row label="마지막 재생" value={lastPlayed} />}
          </div>
        </section>

        {/* 전체 화면 연출 미리 보기 */}
        <section className="px-[20px] pt-[20px]">
          <h2 className="text-[14px] font-[700] text-layout-black dark:text-layout-white mb-[6px]">전체 화면 연출 미리 보기</h2>
          <div className="flex gap-[8px]">
            <Pressable
              onClick={() => {
                setInterludeToggle((v) => !v);
                setPreview({ kind: 'interlude', n: interludeToggle ? 10 : 5, key: Date.now() });
              }}
              className="flex flex-1 items-center justify-center gap-[6px] h-[44px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[14px] font-[600] text-layout-black dark:text-layout-white"
            >
              <FilmSlate weight="fill" className="text-[18px] text-primary-main-600" />
              콤보 인터루드 (x{interludeToggle ? 10 : 5})
            </Pressable>
            <Pressable
              onClick={() => setPreview({ kind: 'complete', key: Date.now() })}
              className="flex flex-1 items-center justify-center gap-[6px] h-[44px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[14px] font-[600] text-layout-black dark:text-layout-white"
            >
              <FilmSlate weight="fill" className="text-[18px] text-primary-main-600" />
              학습 완료 컷
            </Pressable>
          </div>
          <p className="mt-[8px] text-[12px] leading-[1.5] text-layout-gray-300">
            인터루드는 1.6초, 완료 컷은 1.1초 뒤 자동으로 닫히고 탭하면 바로 닫혀요. 소리·진동은 실제 학습과 같은 큐(bonus·complete)를 써요.
          </p>
        </section>

        {/* 오프셋 슬라이더 */}
        <section className="px-[20px] pt-[20px]">
          <div className="flex items-center justify-between mb-[6px]">
            <h2 className="text-[14px] font-[700] text-layout-black dark:text-layout-white">진동 오프셋</h2>
            <span className="text-[14px] font-[700] text-primary-main-600">{offset > 0 ? `+${offset}` : offset}ms</span>
          </div>
          <input
            type="range"
            min={-100}
            max={200}
            step={1}
            value={offset}
            onChange={(e) => changeOffset(e.target.value)}
            className="w-full accent-primary-main-600"
            aria-label="진동 오프셋(ms)"
          />
          <div className="flex items-center justify-between text-[11px] text-layout-gray-300">
            <span>-100 (진동이 먼저)</span>
            <span>+200 (진동이 늦게)</span>
          </div>
          <p className="mt-[8px] text-[12px] leading-[1.5] text-layout-gray-300">
            진동이 소리보다 늦게 느껴지면 값을 낮추고, 먼저 느껴지면 높여요. 정답 큐를 반복해 눌러 가며 맞춘 값을 개발자에게 알려 주세요.
          </p>
          <Pressable
            onClick={() => changeOffset(0)}
            className="mt-[8px] h-[36px] px-[14px] rounded-[10px] bg-layout-gray-50 dark:bg-layout-gray-dark text-[13px] font-[600] text-layout-black dark:text-layout-white"
          >
            0으로 되돌리기
          </Pressable>
        </section>

        {/* 큐 목록 */}
        <section className="pt-[20px]">
          <h2 className="px-[20px] text-[14px] font-[700] text-layout-black dark:text-layout-white mb-[4px]">큐 재생</h2>
          <ul className="w-full m-0 p-0 list-none">
            {CUE_LIST.map((item) => {
              const events = getHapticPattern(item.cue, { n: item.n, platform });
              const errs = events ? validatePattern(events) : [];
              return (
                <li key={`${item.cue}-${item.n ?? ''}`} className="border-b border-[#ddd] dark:border-border-dark">
                  <Pressable
                    onClick={() => play(item)}
                    className="flex items-center justify-between w-full px-[20px] py-[14px] text-left"
                  >
                    <span className="flex items-center gap-[12px] pr-[12px]">
                      <HandTap weight="fill" className="text-[20px] text-primary-main-600 shrink-0" />
                      <span className="flex flex-col gap-[2px]">
                        <span className="text-[15px] font-[700] text-layout-black dark:text-layout-white">
                          {item.label} <span className="text-[12px] font-[500] text-layout-gray-300">{item.cue}</span>
                        </span>
                        {item.desc && <span className="text-[12px] text-layout-gray-300 leading-tight">{item.desc}</span>}
                      </span>
                    </span>
                    <span className="flex flex-col items-end shrink-0 text-[11px] text-layout-gray-300">
                      <span>소리 {SFX_DURATION_MS[item.cue]}ms</span>
                      <span>진동 {events ? `${PATTERN_DURATION_MS[item.cue]}ms` : '없음'}</span>
                      <span className={errs.length ? 'text-status-error-600' : ''}>{!events ? '-' : errs.length ? `규격 위반 ${errs.length}` : '규격 OK'}</span>
                    </span>
                  </Pressable>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {preview?.kind === 'interlude' && (
        <ComboInterlude key={preview.key} n={preview.n} milestone={preview.n} onDone={() => setPreview(null)} />
      )}
      {preview?.kind === 'complete' && (
        <CompleteCut key={preview.key} label="학습 완료" onDone={() => setPreview(null)} />
      )}
    </div>
  );
};

export default FeelTestNewFullSheet;
