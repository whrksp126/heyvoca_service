/*
  KST(한국 표준시, UTC+9) 기준 "오늘" 계산 — 단일 소스(2026-10-02).

  서버는 날짜 경계를 KST(TZ=Asia/Seoul)로 자른다(출석·연속 학습·오늘 할 일). 그런데 프론트가
  기기 로컬 시각(new Date().getDate() 등)으로 "오늘"을 판정하면 기기 시간대가 KST가 아니거나
  앱이 자정을 넘겨 백그라운드에 있었을 때 홈의 "오늘" 칸·요일 라벨이 어제 값으로 남는다.
  "오늘이 언제인가"는 항상 이 파일의 함수로 묻는다. 한국은 서머타임이 없어 고정 +9h 오프셋이 정확하다.
*/
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** KST 기준 오늘 날짜 키 'YYYY-MM-DD'. */
export const getKstToday = (now = new Date()) =>
  new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);

/** KST 기준 요일(0=일 … 6=토). */
export const getKstDow = (now = new Date()) =>
  new Date(now.getTime() + KST_OFFSET_MS).getUTCDay();

/** 다음 KST 자정까지 남은 ms(타이머용). */
export const msUntilNextKstMidnight = (now = new Date()) =>
  DAY_MS - ((now.getTime() + KST_OFFSET_MS) % DAY_MS);
