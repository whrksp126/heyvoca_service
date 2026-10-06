// src/components/takeTest/rewards/achievement.js
//
// 업적 캐릭터 그림과 레벨 등급 색 — 학습 결과 업적 슬라이드가 쓴다.
import InviteKing from '../../../assets/images/HeyCharacter/InviteKing.png';
import AttendanceKing from '../../../assets/images/HeyCharacter/AttendanceKing.png';
import NoryeokKing from '../../../assets/images/HeyCharacter/NoryeokKing.png';
import WordKing from '../../../assets/images/HeyCharacter/WordKing.png';
import PerseveranceKing from '../../../assets/images/HeyCharacter/PerseveranceKing.png';
import ReadingKing from '../../../assets/images/HeyCharacter/ReadingKing.png';
import MemorizedKing from '../../../assets/images/HeyCharacter/MemorizedKing.png';

// 업적 타입과 이미지 매핑
export const ACHIEVEMENT_IMAGES = {
  '초대왕': InviteKing,
  '출석왕': AttendanceKing,
  '노력왕': NoryeokKing,
  '단어왕': WordKing,
  '끈기왕': PerseveranceKing,
  '독서왕': ReadingKing,
  '암기왕': MemorizedKing, // 암기왕 = 연속 정답 콤보 최고치 (콤보왕 폐지 후 통합)
};

/**
 * 레벨 → 등급. 0~2 동 / 3~5 은 / 6~9 금 / 10 이상 무지개.
 * bg 는 메달 면, color 는 테두리 게이지 · 레벨 글자(그라데이션을 못 쓰는 자리)의 단색이다.
 */
export const achievementTier = (level) => {
  if (level >= 10) return { key: 'rainbow', color: '#CD8DFF', bg: 'linear-gradient(135deg, var(--primary-main-600) 0%, #CD8DFF 50%, #74D5FF 100%)' };
  if (level >= 6) return { key: 'gold', color: '#F2D252', bg: '#F2D252' };
  if (level >= 3) return { key: 'silver', color: '#C0C0C0', bg: '#C0C0C0' };
  return { key: 'bronze', color: '#D3A686', bg: '#D3A686' };
};
