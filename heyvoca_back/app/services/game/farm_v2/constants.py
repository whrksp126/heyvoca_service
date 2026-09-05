"""당근 농장 V2 튜닝 상수.

숫자를 한곳에 모으는 이유는 이 값들이 **밸런싱 대상**이기 때문이다.
로직 사이에 흩어 두면 조정할 때마다 여러 파일을 뒤져야 하고, 어떤 값이
기획서의 어느 항목에서 왔는지 추적이 끊긴다. 각 상수에 기획 절 번호를 적어 둔다.
"""

# ── 성장 단계 임계값 (기획 5.1) ──
#
# 전부 **다음 복습 간격(일)** 하나로 잰다. 목표 기억률 0.9 에서 간격(일) = FSRS stability 라
# (fsrs/core.py `_next_interval`) 아래 값은 그대로 "다음 복습이 며칠 뒤인가"로 읽힌다.
# 화면에 `5일 이상`처럼 그 숫자를 그대로 적을 수 있어야 하므로 여기가 단일 소스다.
#
# 예전에는 새싹만 축이 달랐다 — "심은 날보다 늦은 학습일에 예정 복습을 또 맞히기"라는
# 행동 조건이라 화면에 적을 숫자가 없었고, 온보딩은 없는 기준(`1일 이상`)을 지어내
# "심자마자 새싹"으로 읽혔다(첫 정답 stability 가 3.13 일이라 이미 1일을 넘는다).
# 그 조건이 막으려던 것 — 같은 날 여러 번 맞혀 올라가는 것 — 은 stability 가 이미 막는다.
# 같은 날 다시 맞히면 경과일이 0 이라 3.13 → 3.14 로 사실상 오르지 않는다(실측).
#
# 실측 간격 진행(전부 Good): 3 → 9 → 24 → 61 → 143 → 316 일
#                (Good/Hard): 3 → 5 → 13 → 33 →  44 →  98 일
# 그래서 복습 회차마다 한 단계씩 오르도록 5 / 15 / 60 / 180 을 잡았다.
#
# 암기 상태(미학습·단기·중기·장기)와 **같은 경계를 쓴다**. 이름만 다르다(시안 vocabooks §2) —
# 단기 = 심은 씨앗·새싹, 중기 = 이파리, 장기 = 당근. 그래서 값도 같은 파일에서 가져온다.
# 여기 숫자를 다시 적으면 단어장 배지와 밭의 작물이 같은 단어를 다르게 부르게 된다.
from app.services.fsrs.thresholds import (
    STABILITY_SPROUT as STAGE_SPROUT_DAYS,   # 새싹:   다음 복습 5일 이상
    STABILITY_SHORT as STAGE_LEAF_DAYS,      # 이파리: 다음 복습 15일 이상
    STABILITY_MEDIUM as STAGE_CARROT_DAYS,   # 당근:   다음 복습 60일 이상
)

# ── 황금 당근 조건 (기획 10.2) ──
GOLDEN_MIN_STABILITY_DAYS = 180.0   # 조건 2
GOLDEN_RECENT_SCHEDULED   = 3       # 조건 3 — 최근 3회 예정 복습 정답
GOLDEN_MIN_CORRECT_REVIEWS = 6      # 조건 4 — 누적 정답 복습
GOLDEN_NO_AGAIN_RECENT    = 2       # 조건 5 — 최근 2회 중 Again 없음
GOLDEN_MIN_NEXT_INTERVAL_DAYS = 180.0   # 조건 6
# 10.5 악용 방지 — 너무 빠른 응답은 독립 회상으로 세지 않는다
GOLDEN_MIN_ANSWER_MS = 1500
# 답을 미리 보여주는 유형은 황금 판정의 독립 회상 횟수에서 제외한다(10.5).
# cardMatch 계열은 정답 후보가 화면에 전부 나와 있다.
GOLDEN_EXCLUDED_QUESTION_TYPES = frozenset({'cardMatch', 'cardMatchListening'})

# ── 부패 유예 공식 (기획 6.2) ──
#   G = clamp(ceil(I × 0.5), 3, 30)
GRACE_RATIO   = 0.5
GRACE_MIN     = 3
GRACE_MAX     = 30
# 초기 단어(심은 씨앗·새싹)의 최소 유예. 간격이 1일이면 G 가 3일이라
# 첫 주에 썩어 버린다 — 이제 막 심은 단어에게 줄 결과가 아니다.
GRACE_MIN_EARLY = 5
# 상태 전이 비율 — D 로부터의 경과일
WILT_RATIO     = 0.25   # 시듦:      D + max(1, ceil(G × 0.25))
WILT_MIN_DAYS  = 1
CRITICAL_RATIO = 0.6    # 심한 시듦: D + max(2, ceil(G × 0.6))
CRITICAL_MIN_DAYS = 2

# ── 무료 긴급 급수 (기획 8.4) ──
EMERGENCY_WATER_DAYS = 1        # 한 번에 밀어 주는 일수
DEFAULT_DAILY_REVIEW_LIMIT = 60  # user_farm_setting 기본값

# ── 성장 단계 보상 (기획 8.2) — 단어당 각 단계 최초 1회 ──
REWARD_SPROUT_GEM      = 1   # 새싹 도달: 보석 1
REWARD_LEAF_SHOVEL     = 1   # 잎 도달:   새심기 삽 1
REWARD_CARROT_NUTRIENT = 1   # 당근 도달: 영양 회복제 1
REWARD_FIRST_GOLDEN_GEM = 3  # 첫 황금 당근: 보석 3 (10.4, 이후 개별 지급 없음)

# ── 아이템 보석 가격 (기획 8.2) ──
# (보석 가격, 지급 개수) — 상점 진열 순서 그대로
SHOVEL_PACKS = [
    ('shovel_5',  1, 5),
    ('shovel_18', 3, 18),
    ('shovel_55', 8, 55),
]
NUTRIENT_PACKS = [
    ('nutrient_10',  3, 10),
    ('nutrient_30',  8, 30),
    ('nutrient_100', 25, 100),
]
SHIELD_PACKS = [
    ('shield_1', 10, 1),
]

# ── 연속 학습일 (기획 11) ──
STREAK_MIN_CORRECT_WORDS = 5     # 11.1 — 하루 정답 완료 단어 5개
STREAK_RECOVERY_HOURS    = 48    # 11.3 — 보호권 없이 놓쳤을 때의 복구 창
# 11.4 마일스톤 — (연속일, 아이템 종류|'GEM', 수량). 한 번만 지급한다.
STREAK_MILESTONES = [
    (3,   'GEM',      1),
    (7,   'GEM',      3),
    (14,  'SHOVEL',   5),
    (30,  'NUTRIENT', 10),
    (50,  'GEM',      10),
    (100, 'SHIELD',   1),
    (365, 'GEM',      50),
]

# ── 복귀 미션 (기획 7.4) ──
COMEBACK_ABSENT_DAYS   = 30   # 이 이상 비우면 복귀 미션 대상
COMEBACK_WINDOW_DAYS   = 7    # 복귀 후 미션 유효 기간
COMEBACK_REQUIRED_DAYS = 3    # 연속 3일
COMEBACK_DAILY_WORDS   = 5    # 하루 최소 5개
COMEBACK_COURSE_MIN    = 10   # 하루 복구 코스 크기
COMEBACK_COURSE_MAX    = 20

# ── V2 전환 (기획 15) ──
MIGRATION_PROTECT_DAYS = 30           # 15.2 — 전환 후 추가 부패 보호
MIGRATION_SHOVEL_PER_MEDIUM = 10      # 15.3 — 중기 10개당 삽 1
MIGRATION_SHOVEL_MAX = 20
MIGRATION_NUTRIENT_PER_LONG = 10      # 장기 10개당 회복제 1
MIGRATION_NUTRIENT_MAX = 20
MIGRATION_GEM_AT_100_WORDS = 3
MIGRATION_GEM_AT_500_WORDS = 10
