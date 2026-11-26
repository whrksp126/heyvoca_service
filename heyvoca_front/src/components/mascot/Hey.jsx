// src/components/mascot/Hey.jsx
//
// 헤이 — 헤이보카 마스코트 토끼. 포즈를 골라 쓰는 재사용 컴포넌트.
//
//   <Hey pose="wave" size={120} />
//   <Hey pose={pose} onTap={() => vibrate({ duration: 5 })} />
//
// 그림은 전부 이 파일의 SVG 다(외부 이미지 없음). 기존 3D 풍 헤이의 생김새 —
// 크림빛 흰 털, 분홍 귀 안쪽과 볼, 초록 잎 스카프, 주황 멜빵바지 — 를 그대로 가져오고,
// 납작해 보이지 않게 방사형 그라디언트로 양감을 준다.
//
// 구조 원칙: **자세는 SVG transform 속성, 움직임은 CSS 애니메이션**(hey.css).
// 움직이는 부위는 전부 "관절이 원점"인 좌표로 그린다(Joint). 그러면 CSS 쪽은
// transform-origin 계산 없이 rotate/scale 만 쓰면 되고, 모션을 꺼도 자세가 남는다.
// 사용법은 같은 폴더 README.md.

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { HEY_POSES, reactionFace } from './heyPoses';
import './hey.css';

const VIEW_W = 200;
const VIEW_H = 250;
const GROUND_Y = 236;

const C = {
  furLine: '#E4D3BF',
  earIn: '#F6A3B4',
  earInDeep: '#EE8AA0',
  cheek: '#FFB3C2',
  nose: '#F08CA2',
  eye: '#3E2A22',
  mouth: '#6B4636',
  mouthIn: '#D9606F',
  tongue: '#F7A0AC',
  leaf: '#8FD16F',
  leafDeep: '#62B14F',
  overall: '#F28C4E',
  overallDeep: '#D96F36',
  button: '#FFD978',
  can: '#B9C0CB',
  canDeep: '#8E96A3',
  water: '#7CC7F2',
  soil: '#8A5A36',
  soilLight: '#A8744A',
  seed: '#9A6A3C',
  spark: '#FFD25E',
};

/** 관절 — (x, y)로 옮기고 rotate 만큼 돌린 뒤, 안쪽 그룹에 움직임 클래스를 건다 */
const Joint = ({ x = 0, y = 0, rotate = 0, className, children }) => (
  <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    <g className={className}>{children}</g>
  </g>
);

const Arm = ({ fill }) => (
  <>
    <rect x="-8" y="-6" width="16" height="41" rx="8" fill={fill} stroke={C.furLine} strokeWidth="1.2" />
    {/* 손끝 하이라이트 — 팔이 몸과 같은 색이라 겹쳐도 구분되게 한다 */}
    <ellipse cx="-2" cy="27" rx="4" ry="5" fill="#FFFFFF" opacity="0.55" />
  </>
);

const Ear = ({ fill }) => (
  <>
    <ellipse cx="0" cy="-30" rx="14.5" ry="34" fill={fill} stroke={C.furLine} strokeWidth="1.2" />
    <ellipse cx="0" cy="-28" rx="7.6" ry="24.5" fill={C.earIn} />
    <ellipse cx="1.5" cy="-22" rx="3.6" ry="15" fill={C.earInDeep} opacity="0.45" />
  </>
);

const Eye = ({ kind, look }) => {
  if (kind === 'happy') {
    return <path d="M-8 3 Q0 -9 8 3" fill="none" stroke={C.eye} strokeWidth="3.6" strokeLinecap="round" />;
  }
  if (kind === 'closed') {
    return <path d="M-8 -1 Q0 6 8 -1" fill="none" stroke={C.eye} strokeWidth="3.2" strokeLinecap="round" />;
  }
  const [dx, dy] = look ?? [0, 0];
  const small = kind === 'worry';
  return (
    <g className="hey-blink">
      <ellipse cx="0" cy="0" rx={small ? 7.5 : 8.5} ry={small ? 8.5 : 10} fill={C.eye} />
      <circle cx={-2.6 + dx} cy={-3.6 + dy} r="3.1" fill="#FFFFFF" />
      <circle cx={3 + dx} cy={3.2 + dy} r="1.5" fill="#FFFFFF" opacity="0.85" />
    </g>
  );
};

const Mouth = ({ kind }) => {
  if (kind === 'open') {
    return (
      <g>
        <path d="M-7 -1 Q0 12 7 -1 Z" fill={C.mouthIn} stroke={C.mouth} strokeWidth="1.6" strokeLinejoin="round" />
        <ellipse cx="0" cy="5" rx="3" ry="2" fill={C.tongue} />
      </g>
    );
  }
  if (kind === 'frown') {
    return <path d="M-5 3 Q0 -3 5 3" fill="none" stroke={C.mouth} strokeWidth="2.2" strokeLinecap="round" />;
  }
  if (kind === 'o') {
    return <ellipse cx="0" cy="2" rx="2.8" ry="3.4" fill={C.mouthIn} stroke={C.mouth} strokeWidth="1.4" />;
  }
  if (kind === 'flat') {
    return <path d="M-4 2 Q0 3.5 4 1" fill="none" stroke={C.mouth} strokeWidth="2.2" strokeLinecap="round" />;
  }
  // 기본 — 토끼 입(ω)
  return <path d="M-7 0 Q-3.5 5 0 0 Q3.5 5 7 0" fill="none" stroke={C.mouth} strokeWidth="2.2" strokeLinecap="round" />;
};

/** 네 갈래 별 — 기쁨·탭 반응에 튄다 */
const Spark = ({ x, y, s = 1, className }) => (
  <Joint x={x} y={y} className={className}>
    <path
      transform={`scale(${s})`}
      d="M0 -9 Q1.6 -1.6 9 0 Q1.6 1.6 0 9 Q-1.6 1.6 -9 0 Q-1.6 -1.6 0 -9 Z"
      fill={C.spark}
    />
  </Joint>
);

/**
 * @param {string}   pose        heyPoses.js 의 키. 모르는 값이면 'idle'.
 * @param {number}   size        폭(px). 주지 않으면 부모 상자를 채운다(높이는 비율 4:5 로 따라온다).
 * @param {boolean}  flip        좌우 반전 — 소품(물뿌리개·씨앗)이 왼쪽으로 간다.
 * @param {boolean}  shadow      발밑 그림자. 밭처럼 바깥에서 그림자를 따로 그리는 곳은 끈다.
 * @param {boolean}  paused      움직임을 강제로 멈춘다. 화면 밖일 때는 알아서 멈춘다.
 * @param {function} onTap       주면 탭할 수 있게 되고, 탭하면 폴짝 뛴 뒤 호출된다.
 * @param {string}   label       스크린리더용 이름. 장식이면 비워 둔다(aria-hidden).
 * @param {string}   className   바깥 svg 에 덧붙일 클래스(여백·정렬용).
 */
const Hey = ({
  pose = 'idle',
  size,
  flip = false,
  shadow = true,
  paused = false,
  onTap,
  label,
  className = '',
}) => {
  "use memo";

  const uid = useId().replace(/:/g, '');
  const svgRef = useRef(null);
  const reactTimer = useRef(null);
  const [offscreen, setOffscreen] = useState(false);
  const [reacting, setReacting] = useState(false);

  const poseKey = HEY_POSES[pose] ? pose : 'idle';
  const def = HEY_POSES[poseKey];
  const face = reacting ? { ...def, ...reactionFace(poseKey) } : def;

  // 화면 밖이면 멈춘다 — 홈은 스크롤이 길어 헤이가 안 보이는 시간이 더 길다.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => () => clearTimeout(reactTimer.current), []);

  const handleTap = useCallback(() => {
    clearTimeout(reactTimer.current);
    setReacting(true);
    reactTimer.current = setTimeout(() => setReacting(false), 900);
    onTap?.(poseKey);
  }, [onTap, poseKey]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTap();
    }
  }, [handleTap]);

  const tappable = typeof onTap === 'function';
  const fur = `url(#${uid}-fur)`;
  const furBody = `url(#${uid}-body)`;
  // 좌우 반전해도 글자(Z)는 뒤집히면 안 된다
  const unflip = flip ? 'scale(-1 1)' : undefined;

  const arms = (
    <>
      <Joint x={-28} y={-62} rotate={face.armL} className="hey-arm-l">
        <Arm fill={fur} />
        {def.prop === 'pom' && <circle className="hey-pom" cx="0" cy="35" r="10" />}
      </Joint>
      <Joint x={28} y={-62} rotate={face.armR} className="hey-arm-r">
        <Arm fill={fur} />
        {def.prop === 'pom' && <circle className="hey-pom" cx="0" cy="35" r="10" />}
        {def.prop === 'seed' && (
          <ellipse className="hey-seed" cx="1" cy="36" rx="4" ry="5" fill={C.seed} />
        )}
      </Joint>
    </>
  );

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      width={size ?? '100%'}
      height={size ? (size * VIEW_H) / VIEW_W : '100%'}
      className={`hey ${tappable ? 'hey-tappable' : ''} ${className}`}
      data-pose={poseKey}
      data-paused={paused || offscreen ? 'true' : 'false'}
      data-react={reacting ? 'true' : 'false'}
      {...(label ? { role: tappable ? 'button' : 'img', 'aria-label': label } : { 'aria-hidden': !tappable })}
      {...(tappable ? { role: 'button', tabIndex: 0, onClick: handleTap, onKeyDown: handleKeyDown } : {})}
    >
      <defs>
        <radialGradient id={`${uid}-fur`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="62%" stopColor="#FFF8EE" />
          <stop offset="100%" stopColor="#EFDFCB" />
        </radialGradient>
        <radialGradient id={`${uid}-body`} cx="40%" cy="20%" r="85%">
          <stop offset="0%" stopColor="#FFFDF8" />
          <stop offset="70%" stopColor="#FBF1E3" />
          <stop offset="100%" stopColor="#E9D7C1" />
        </radialGradient>
        <linearGradient id={`${uid}-overall`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#F9A163" />
          <stop offset="100%" stopColor={C.overallDeep} />
        </linearGradient>
        <linearGradient id={`${uid}-can`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DCE1E8" />
          <stop offset="100%" stopColor={C.canDeep} />
        </linearGradient>
        <clipPath id={`${uid}-torso`}>
          <ellipse cx="0" cy="-46" rx="34" ry="32" />
        </clipPath>
      </defs>

      <g transform={flip ? `translate(${VIEW_W} 0) scale(-1 1)` : undefined}>
        {shadow && (
          <Joint x={100} y={GROUND_Y + 2} className="hey-shadow">
            <ellipse cx="0" cy="0" rx="40" ry="6.5" />
          </Joint>
        )}

        {/* 씨앗 심기 — 흙무더기와 돋아나는 새싹. 몸과 따로 서 있어야 뛰어도 안 흔들린다 */}
        {def.prop === 'seed' && (
          <g transform={`translate(162 ${GROUND_Y})`}>
            <path d="M-21 2 Q-12 -15 0 -15 Q12 -15 21 2 Z" fill={C.soil} />
            <path d="M-12 -7 Q-4 -14 4 -13" fill="none" stroke={C.soilLight} strokeWidth="3" strokeLinecap="round" />
            <Joint x={0} y={-14} className="hey-sprout">
              <path d="M0 0 V-12" stroke={C.leafDeep} strokeWidth="3" strokeLinecap="round" />
              <path d="M0 -11 C-3 -21 -14 -21 -15 -14 C-9 -9 -3 -9 0 -11 Z" fill={C.leaf} />
              <path d="M0 -11 C3 -22 15 -22 16 -15 C10 -9 3 -9 0 -11 Z" fill={C.leafDeep} />
            </Joint>
          </g>
        )}

        <Joint x={100} y={GROUND_Y} className="hey-all">
          {/* 발 */}
          <ellipse cx="-17" cy="-6" rx="15" ry="9" fill={fur} stroke={C.furLine} strokeWidth="1.2" />
          <ellipse cx="17" cy="-6" rx="15" ry="9" fill={fur} stroke={C.furLine} strokeWidth="1.2" />

          {/* 몸통 + 멜빵바지 — 숨쉴 때 바닥을 기준으로 살짝 부푼다 */}
          <g className="hey-torso">
            <ellipse cx="0" cy="-46" rx="34" ry="32" fill={furBody} stroke={C.furLine} strokeWidth="1.2" />
            <g clipPath={`url(#${uid}-torso)`}>
              <rect x="-36" y="-48" width="72" height="40" fill={`url(#${uid}-overall)`} />
              <path d="M-36 -48 Q0 -40 36 -48" fill="none" stroke={C.overallDeep} strokeWidth="1.6" opacity="0.5" />
              <path d="M-13 -64 L-23 -80 M13 -64 L23 -80" stroke={C.overall} strokeWidth="6" strokeLinecap="round" />
            </g>
            <rect x="-15" y="-67" width="30" height="24" rx="5" fill={`url(#${uid}-overall)`} />
            <circle cx="-10" cy="-61" r="2.6" fill={C.button} />
            <circle cx="10" cy="-61" r="2.6" fill={C.button} />
            {!def.armsFront && arms}
          </g>

          {/* 머리 — 목(0,-76)이 관절. 원본처럼 머리가 몸보다 크다 */}
          <Joint x={0} y={-76} rotate={face.head} className="hey-head">
            <g transform="scale(1.16)">
            <Joint x={-22} y={-72} rotate={face.earL} className="hey-ear-l"><Ear fill={fur} /></Joint>
            <Joint x={22} y={-72} rotate={face.earR} className="hey-ear-r"><Ear fill={fur} /></Joint>

            <ellipse cx="0" cy="-38" rx="50" ry="43" fill={fur} stroke={C.furLine} strokeWidth="1.2" />
            {/* 정수리 털 */}
            <path d="M-5 -80 Q0 -88 4 -80" fill={fur} stroke={C.furLine} strokeWidth="1.2" strokeLinejoin="round" />

            <ellipse cx="-33" cy="-26" rx="8.5" ry="5.5" fill={C.cheek} opacity="0.75" />
            <ellipse cx="33" cy="-26" rx="8.5" ry="5.5" fill={C.cheek} opacity="0.75" />

            {face.brows === 'worry' && !reacting && (
              <path
                d="M-28 -53 L-14 -58 M28 -53 L14 -58"
                stroke={C.mouth} strokeWidth="2.4" strokeLinecap="round"
              />
            )}

            <g transform="translate(-20 -40)"><Eye kind={face.eyes} look={face.look} /></g>
            <g transform="translate(20 -40)"><Eye kind={face.eyes} look={face.look} /></g>

            <path d="M-3.6 -31 Q0 -33.5 3.6 -31 Q2.4 -26.5 0 -26.5 Q-2.4 -26.5 -3.6 -31 Z" fill={C.nose} />
            <g transform="translate(0 -23)"><Mouth kind={face.mouth} /></g>

            {def.prop === 'sweat' && (
              <Joint x={44} y={-62} className="hey-sweat">
                <path d="M0 -7 C4 -1 5 2 5 4 A5 5 0 0 1 -5 4 C-5 2 -4 -1 0 -7 Z" fill={C.water} />
              </Joint>
            )}
            </g>
          </Joint>

          {/* 초록 잎 스카프 — 턱 아래에 걸친다 */}
          <g transform="translate(0 7) scale(1.08 1)">
          <path d="M0 -80 C-10 -91 -31 -88 -35 -77 C-25 -70 -9 -72 0 -80 Z" fill={C.leaf} />
          <path d="M0 -80 C10 -91 31 -88 35 -77 C25 -70 9 -72 0 -80 Z" fill={C.leafDeep} />
          <path d="M-28 -79 Q-14 -80 -3 -80 M28 -79 Q14 -80 3 -80" stroke="#FFFFFF" strokeWidth="1" opacity="0.4" fill="none" />
          <circle cx="0" cy="-79" r="4.2" fill={C.leafDeep} />
          </g>

          {/* 물뿌리개 — 팔보다 먼저 그려 손이 위에 얹히게 한다 */}
          {def.prop === 'can' && (
            <Joint x={22} y={-38} className="hey-can">
              <g transform="scale(1.25)">
              <path d="M10 2 L38 -18" stroke={C.overall} strokeWidth="6.5" strokeLinecap="round" />
              <ellipse cx="40" cy="-19" rx="5" ry="7" transform="rotate(35 40 -19)" fill={C.overallDeep} />
              <path d="M-12 -14 Q0 -34 12 -14" fill="none" stroke={C.overall} strokeWidth="5" strokeLinecap="round" />
              <rect x="-16" y="-15" width="32" height="29" rx="7" fill={`url(#${uid}-can)`} stroke={C.canDeep} strokeWidth="1.2" />
              <path d="M0 -8 C4 -2 5 1 5 3 A5 5 0 0 1 -5 3 C-5 1 -4 -2 0 -8 Z" fill="#FFF6E6" />
              </g>
            </Joint>
          )}
          {def.prop === 'can' && (
            <g fill={C.water}>
              <circle className="hey-drop hey-drop-1" cx="76" cy="-56" r="3.4" />
              <circle className="hey-drop hey-drop-2" cx="83" cy="-53" r="2.8" />
              <circle className="hey-drop hey-drop-3" cx="70" cy="-51" r="2.6" />
            </g>
          )}

          {def.armsFront && arms}
        </Joint>

        {/* 머리 위 효과 — 몸의 움직임을 따라가지 않는다 */}
        {def.prop === 'zzz' && (
          <g className="hey-zzz-group" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <Joint x={100} y={60} className="hey-zzz hey-zzz-1"><path d="M-5 -5 H5 L-5 5 H5" strokeWidth="3" transform={unflip} /></Joint>
            <Joint x={113} y={38} className="hey-zzz hey-zzz-2"><path d="M-7 -7 H7 L-7 7 H7" strokeWidth="3.4" transform={unflip} /></Joint>
            <Joint x={130} y={14} className="hey-zzz hey-zzz-3"><path d="M-9 -9 H9 L-9 9 H9" strokeWidth="3.8" transform={unflip} /></Joint>
          </g>
        )}

        {def.prop === 'thought' && (
          <g className="hey-thought">
            <circle className="hey-think-dot hey-think-1" cx="150" cy="78" r="4" />
            <circle className="hey-think-dot hey-think-2" cx="161" cy="62" r="6" />
            <g className="hey-think-dot hey-think-3">
              <ellipse cx="176" cy="36" rx="20" ry="16" />
              <g className="hey-think-ink">
                <circle cx="168" cy="36" r="2.6" />
                <circle cx="176" cy="36" r="2.6" />
                <circle cx="184" cy="36" r="2.6" />
              </g>
            </g>
          </g>
        )}

        {(def.prop === 'sparkle' || reacting) && (
          <g>
            <Spark x={30} y={70} s={1.1} className="hey-spark hey-spark-1" />
            <Spark x={172} y={56} s={1.3} className="hey-spark hey-spark-2" />
            <Spark x={158} y={128} s={0.8} className="hey-spark hey-spark-3" />
            <Spark x={22} y={132} s={0.7} className="hey-spark hey-spark-4" />
          </g>
        )}
      </g>
    </svg>
  );
};

export default Hey;
