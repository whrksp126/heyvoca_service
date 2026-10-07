import React, { useEffect, useId } from 'react';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import { Plant } from '@phosphor-icons/react';
import { vibrate } from '../../utils/osFunction';
// 목록 줄과 같은 실제 씨앗 봉투 그림 — 흉내 낸 그림은 가짜처럼 보여 반려됨(2026-10-07)
import seedPacketImg from '../../assets/images/farm/crops/unplanted/healthy-seed.png';

/**
 * 서점 단어장 상세의 히어로 — 포장된 씨앗 묶음.
 *
 * 예전에는 산 뒤 화면과 같은 밭(BookFieldHero)에 씨앗을 전부 심어 보여 줬다. 그런데 이 화면의
 * 단어는 아직 사지도 배우지도 않은 것이라, "이미 밭에 심긴" 그림이 사실과 어긋났다.
 * 그래서 밭 대신 **봉투째 상자에 담긴 씨앗**을 그린다 — 목록 줄의 분홍 씨앗 봉투와 같은 물건이
 * 모여 있는 모습이라, 사면 이 봉투들이 내 밭으로 온다는 게 그림만으로 읽힌다.
 *
 * - 상자 크기와 봉투 수는 단어 수에 따라 4단계로 커진다(BUNDLE_TIERS).
 * - 이름표의 수는 **지금 사면 새로 받는 씨앗**(미보유 단어 수)이다.
 * - 이미 일부를 갖고 있으면 상자에는 미보유분만 담고, 보유분은 아래 초록 칩으로 따로 말한다.
 *   보유분을 밭으로 함께 그리지 않는 이유 — 그 단어들의 실제 성장 단계는 내 단어장 화면이
 *   보여 주는 것이고, 여기서 밭을 다시 그리면 "살 물건"과 "가진 것"이 한 그림에 섞인다.
 * - 전부 갖고 있으면 상자가 비고 칩이 그 사실을 말한다.
 *
 * 높이(341px)는 BookFieldHero 와 같다 — 목록의 윈도우 렌더링이 이 값을 기준으로 계산한다.
 */

// [단어 수 상한, 뒷줄 봉투 수, 앞줄 봉투 수]
const BUNDLE_TIERS = [
  [30, 1, 2],
  [100, 2, 3],
  [300, 3, 4],
  [Infinity, 4, 5],
];

const CX = 160;
const PACKET_STEP = 44;
const PACKET_SCALE = 1.25;

const tierOf = (count) => {
  if (count <= 0) return [0, 0, 0];
  return BUNDLE_TIERS.find(([max]) => count <= max);
};

// 한 줄에 k 개를 부채꼴로 편다 — 가운데서 멀수록 조금 기울고 조금 내려앉는다
const rowOf = (k, baseY, row) => Array.from({ length: k }, (_, i) => {
  const offset = i - (k - 1) / 2;
  return {
    key: `${row}-${i}`,
    x: CX + offset * PACKET_STEP,
    y: baseY + Math.abs(offset) * 3,
    rot: offset * 5,
  };
});

/** 씨앗 봉투 하나 — 원점은 봉투 바닥 가운데. 목록 줄의 봉투 그림과 같은 생김새다 */
const Packet = () => (
  <image href={seedPacketImg} x="-66" y="-104" width="130" height="130" preserveAspectRatio="xMidYMid meet" />
);

const Star = ({ x, y, size, ids }) => (
  <path
    transform={`translate(${x} ${y}) scale(${size})`}
    d="M0 -7.5Q1.95 -1.95 7.5 0Q1.95 1.95 0 7.5Q-1.95 1.95 -7.5 0Q-1.95 -1.95 0 -7.5Z"
    fill={`url(#${ids.star})`}
    stroke="#F6B93B"
    strokeWidth="1.4"
    strokeLinejoin="round"
  />
);

const SeedBundleHero = ({ count = 0, ownedCount = 0 }) => {
  "use memo";

  const uid = useId().replace(/:/g, '');
  const ids = {
    pink: `sb-pink-${uid}`,
    seed: `sb-seed-${uid}`,
    wood: `sb-wood-${uid}`,
    post: `sb-post-${uid}`,
    shadow: `sb-shadow-${uid}`,
    star: `sb-star-${uid}`,
  };

  const reducedMotion = useReducedMotion();
  const controls = useAnimationControls();

  const [, backCount, frontCount] = tierOf(count);
  const packets = [...rowOf(backCount, 135, 'b'), ...rowOf(frontCount, 158, 'f')];
  const crateW = Math.max(frontCount, 2) * PACKET_STEP + 48;
  const crateX = CX - crateW / 2;

  // 이름표 폭 — 씨앗 낱알 + "씨앗" + 숫자. 자릿수가 늘면 판도 같이 넓어진다

  useEffect(() => {
    if (reducedMotion) return;
    controls.start('in');
  }, [controls, reducedMotion, packets.length]);

  const handleTap = () => {
    vibrate({ duration: 5 });
    if (reducedMotion) return;
    controls.start('hop');
  };

  const packetVariants = {
    out: { y: 22, opacity: 0 },
    in: (i) => ({
      y: 0,
      opacity: 1,
      transition: { type: 'spring', stiffness: 380, damping: 16, delay: 0.12 + i * 0.05 },
    }),
    hop: (i) => ({
      y: [0, -15, 0],
      opacity: 1,
      transition: { duration: 0.46, delay: i * 0.035, ease: [0.3, 0, 0.3, 1] },
    }),
  };

  const allOwned = count === 0 && ownedCount > 0;

  return (
    <div
      className="
        relative w-full h-[341px] flex-shrink-0 z-[1] overflow-hidden
        bg-[linear-gradient(180deg,var(--farm-sky-100)_0%,var(--farm-sky-200)_34%,var(--farm-canvas)_100%)]
      "
    >
      {/* 상자 뒤의 은은한 빛 — 하늘 그라디언트 위에서 그림이 떠 보이게 한다 */}
      <div
        aria-hidden
        className="
          absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full
          bg-[radial-gradient(circle,rgba(255,255,255,0.9)_0%,rgba(255,255,255,0)_68%)] dark:opacity-[0.07]
        "
      />

      <motion.button
        type="button"
        onClick={handleTap}
        whileTap={reducedMotion ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 420, damping: 16 }}
        aria-label={allOwned ? '이 단어장의 씨앗을 모두 갖고 있어요' : `포장된 씨앗 ${count.toLocaleString('ko-KR')}개`}
        className={`absolute left-1/2 -translate-x-1/2 w-[300px] max-w-[84%] ${ownedCount > 0 ? 'bottom-[44px]' : 'bottom-[24px]'}`}
      >
        <svg viewBox="0 0 320 250" fill="none" className="block w-full h-auto overflow-visible select-none">
          <defs>
            <linearGradient id={ids.pink} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFD3D6" /><stop offset="1" stopColor="#F4A0B4" />
            </linearGradient>
            <linearGradient id={ids.seed} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFD766" /><stop offset="1" stopColor="#EFA52B" />
            </linearGradient>
            <linearGradient id={ids.wood} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#C08650" /><stop offset="0.55" stopColor="#A66D3D" /><stop offset="1" stopColor="#8C5830" />
            </linearGradient>
            <linearGradient id={ids.post} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9A6236" /><stop offset="1" stopColor="#74471F" />
            </linearGradient>
            <radialGradient id={ids.shadow} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#3A1F2B" stopOpacity="0.28" /><stop offset="1" stopColor="#3A1F2B" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={ids.star} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFE27A" /><stop offset="1" stopColor="#F6B93B" />
            </linearGradient>
          </defs>

          {/* 바닥 그림자 — 상자가 떠오르면 살짝 줄어든다 */}
          <motion.ellipse
            cx={CX}
            cy="233"
            rx={crateW / 2 + 8}
            ry="10"
            fill={`url(#${ids.shadow})`}
            animate={reducedMotion ? undefined : { scaleX: [1, 0.9, 1], opacity: [1, 0.75, 1] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          />

          <motion.g
            animate={reducedMotion ? undefined : { y: [0, -7, 0] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            {/* 상자 안쪽 */}
            <rect x={crateX + 9} y="127" width={crateW - 18} height="44" rx="10" fill="#5E391D" />
            <rect x={crateX + 9} y="127" width={crateW - 18} height="14" rx="7" fill="#3F2410" fillOpacity="0.5" />

            {packets.map((p, i) => (
              <motion.g
                key={p.key}
                custom={i}
                variants={packetVariants}
                initial={reducedMotion ? false : 'out'}
                animate={controls}
              >
                <g transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
                  <Packet />
                </g>
              </motion.g>
            ))}

            {/* 상자 앞판 — 밭 흙과 이어지는 짙은 나무. 가운데는 개수 대신 새싹 문양(보석 상자와 같은 어휘) */}
            <rect x={crateX} y="150" width={crateW} height="76" rx="14" fill={`url(#${ids.wood})`} stroke="#6E4324" strokeWidth="1.6" />
            {/* 윗테 — 빛 받는 면 */}
            <path d={`M${crateX} 164Q${crateX} 150 ${crateX + 14} 150H${crateX + crateW - 14}Q${crateX + crateW} 150 ${crateX + crateW} 164V167H${crateX}Z`} fill="#D9A56B" />
            <path d={`M${crateX + 20} 156H${crateX + crateW - 20}`} stroke="#fff" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />
            {/* 널빤지 이음매 + 나뭇결 */}
            <path d={`M${crateX + 3} 186.5H${crateX + crateW - 3}M${crateX + 3} 206.5H${crateX + crateW - 3}`} stroke="#6E4324" strokeOpacity="0.55" strokeWidth="1.8" />
            <path d={`M${crateX + 3} 188H${crateX + crateW - 3}M${crateX + 3} 208H${crateX + crateW - 3}`} stroke="#E0B07A" strokeOpacity="0.35" strokeWidth="1" />
            <path
              d={`M${crateX + 34} 176q14 -3 26 0M${crateX + crateW - 70} 197q16 3 30 0M${crateX + 44} 216q12 -2 22 0M${crateX + crateW - 58} 177q8 -2 16 0`}
              stroke="#7A4B28" strokeOpacity="0.4" strokeWidth="1.3" strokeLinecap="round"
            />
            {/* 아래쪽 그늘 */}
            <rect x={crateX + 1} y="212" width={crateW - 2} height="13" rx="6" fill="#5A3519" fillOpacity="0.22" />
            {/* 모서리 기둥 + 놋쇠 못 */}
            {[crateX + 7, crateX + crateW - 23].map((x) => (
              <g key={x}>
                <rect x={x} y="150.8" width="16" height="74.4" rx="6" fill={`url(#${ids.post})`} stroke="#6E4324" strokeWidth="1" />
                <rect x={x + 2.5} y="154" width="3" height="68" rx="1.5" fill="#fff" fillOpacity="0.18" />
                {[163, 213].map((cy) => (
                  <g key={cy}>
                    <circle cx={x + 8} cy={cy} r="3" fill="#F0C873" stroke="#B9842F" strokeWidth="0.8" />
                    <circle cx={x + 7.2} cy={cy - 0.8} r="1" fill="#fff" fillOpacity="0.7" />
                  </g>
                ))}
              </g>
            ))}
            {/* 새싹 문양 — 파 넣은 둥근 판에 놋쇠빛 새싹 */}
            <circle cx={CX} cy="190" r="19" fill="#7A4B28" />
            <circle cx={CX} cy="191" r="17" fill="#8F5C33" />
            <circle cx={CX} cy="190" r="19" stroke="#E3B26F" strokeOpacity="0.7" strokeWidth="1.4" />
            <path d={`M${CX} 201V188`} stroke="#F0C873" strokeWidth="2.6" strokeLinecap="round" />
            <path d={`M${CX} 189.5C${CX} 181 ${CX - 8.5} 178.5 ${CX - 13} 180C${CX - 12} 187 ${CX - 6.5} 191 ${CX} 189.5Z`} fill="#F0C873" />
            <path d={`M${CX} 189.5C${CX} 181 ${CX + 8.5} 178.5 ${CX + 13} 180C${CX + 12} 187 ${CX + 6.5} 191 ${CX} 189.5Z`} fill="#E3B059" />
            <path d={`M${CX - 10} 181.5C${CX - 7} 181.5 ${CX - 4} 183.5 ${CX - 2.5} 186`} stroke="#fff" strokeOpacity="0.5" strokeWidth="1.1" strokeLinecap="round" />

            {packets.length > 0 && (
              <motion.g
                animate={reducedMotion ? undefined : { opacity: [0.55, 1, 0.55], scale: [0.9, 1.08, 0.9] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Star x={crateX + crateW + 6} y={86} size={1.15} ids={ids} />
              </motion.g>
            )}
            {packets.length > 2 && (
              <motion.g
                animate={reducedMotion ? undefined : { opacity: [1, 0.5, 1], scale: [1.05, 0.88, 1.05] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Star x={crateX - 8} y={112} size={0.75} ids={ids} />
              </motion.g>
            )}
          </motion.g>
        </svg>
      </motion.button>

      {/* 이미 가진 단어 — 상자(살 것)와 섞지 않고 따로 말한다 */}
      {ownedCount > 0 && (
        <div className="absolute left-0 right-0 bottom-[12px] flex justify-center">
          <span className="flex items-center gap-[4px] h-[26px] px-[10px] rounded-full bg-status-success-100 dark:bg-status-success-dark text-[11.5px] font-[700] tracking-[-0.02em] text-status-success-600">
            <Plant size={13} weight="fill" />
            {allOwned
              ? `${ownedCount.toLocaleString('ko-KR')}개 모두 내 밭에 있어요`
              : `${ownedCount.toLocaleString('ko-KR')}개는 이미 내 밭에 있어요`}
          </span>
        </div>
      )}
    </div>
  );
};

export default SeedBundleHero;
