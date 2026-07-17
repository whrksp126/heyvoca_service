"""푸시 알림 멘트 카탈로그 + 카테고리 분류 + 메시지 선택.

분기 로직은 heyvoca_front/src/utils/homeGreeting.jsx 의 기준을 참고했지만
문구는 푸시 전용으로 새로 작성. 손실 회피(streak 끊김, 암기 하락) 트리거에 집중.
"""

import random


CATEGORIES = (
    'streak_emergency', 'danger', 'warning', 'light',
    'safe_review_done', 'new_only', 'empty',
)

URGENT_CATEGORIES = {'streak_emergency', 'danger'}


MESSAGES = {
    'streak_emergency': [
        ("{name}님, {streak}일 연속 학습이 끊길 위기예요! 🔥",
         "지금 단어 1개만 봐도 streak 유지! '{word}' 어땠죠?"),
        ("아깝다... {streak}일 쌓은 기록이 0이 되기 직전 ⏰",
         "오늘 복습 {n}개만 마치면 내일도 함께해요!"),
        ("{name}님의 {streak}일 streak, 사라지면 다시 못 만들어요 💔",
         "지금 1분만 투자해서 지켜내세요!"),
    ],
    'danger': [
        ("⚠️ 단어 {n}개의 기억이 흐려지고 있어요",
         "{name}님, '{word}' 같은 단어들이 곧 잊혀져요. 지금 잡으면 5분이면 끝!"),
        ("암기 상태 {n}개가 하락 직전이에요 📉",
         "그동안 외운 게 아까우니까... 잠깐 들러서 물 한 번 줄까요?"),
        ("'{word}' 외 {n}개 단어가 {name}님을 기다려요",
         "오래 두면 처음부터 다시 외워야 해요. 지금이 골든타임!"),
    ],
    'warning': [
        ("오늘 복습 {n}개, 지금이 딱 좋아요 ✨",
         "{name}님, '{word}' 기억나시나요? {n}개 중 하나예요."),
        ("기억이 흐려지기 전에 — 단어 {n}개 🍀",
         "5분이면 다 끝나요. 미루면 내일은 더 늘어요!"),
        ("'{word}' 외 {n}개가 복습 대기 중",
         "조금씩 꾸준히! 오늘 몫만 챙기면 충분해요."),
    ],
    'light': [
        ("오늘은 가볍게 {n}개만 💫",
         "{name}님, '{word}' 하나만 다시 봐도 90초면 끝!"),
        ("딱 {n}개 단어가 오늘의 미션이에요",
         "쉬는 시간에 쓱 — 부담 없이 헤이보카 열어볼까요?"),
    ],
    'safe_review_done': [
        ("오늘 복습 완료! {name}님 진짜 멋져요 🎉",
         "장기 기억으로 가는 중이에요. 내일도 함께해요!"),
        ("{streak}일 연속 학습 완료 — 이게 진짜 실력이에요 🏆",
         "쉬는 동안 헤이보카가 다음 단어들 준비해둘게요!"),
    ],
    'new_only': [
        ("아직 안 만난 단어들이 기다려요 📚",
         "{name}님, 새 단어 한 번 만나볼까요? 3분만 투자해요!"),
        ("오늘은 새 단어로 가볍게 시작해봐요",
         "단어장 열고 첫 카드만 넘겨도 출석!"),
    ],
    'empty': [
        ("{name}님 단어장이 비어있어요 🌱",
         "서점에서 마음에 드는 단어장 하나 골라볼까요?"),
        ("뭐부터 외워야 할지 모를 땐 서점으로!",
         "레벨별로 추천 단어장이 준비되어 있어요."),
    ],
}


def classify_user(ctx: dict, time_slot: str) -> str:
    """ctx 키: review_due, total_cards, state_stats, streak, today_completed, sample_voca_word.

    time_slot in {'1pm','4pm','9pm','11pm'}.
    streak_emergency는 streak 유지가 위험한 시간대(9pm 이후)에만 발동.
    """
    review_due = int(ctx.get('review_due') or 0)
    total_cards = int(ctx.get('total_cards') or 0)
    state_stats = ctx.get('state_stats') or {}
    streak = int(ctx.get('streak') or 0)
    today_completed = bool(ctx.get('today_completed'))

    if total_cards == 0:
        return 'empty'

    if (
        time_slot in ('9pm', '11pm')
        and streak >= 3
        and not today_completed
    ):
        return 'streak_emergency'

    if review_due >= 20:
        return 'danger'
    if 5 <= review_due < 20:
        return 'warning'
    if 1 <= review_due <= 4:
        return 'light'

    new_cnt = int(state_stats.get('new') or 0)
    review_cnt = int(state_stats.get('review') or 0)
    if new_cnt > 0 and review_cnt == 0:
        return 'new_only'

    return 'safe_review_done'


def _has_var(template_pair, var):
    return any(('{' + var + '}') in t for t in template_pair)


def select_message(category: str, time_slot: str, ctx: dict) -> tuple:
    """카테고리 내 멘트 중 ctx에 맞는 후보를 골라 (title, body) 반환."""
    pool = list(MESSAGES.get(category) or MESSAGES['light'])
    if not ctx.get('sample_voca_word'):
        filtered = [p for p in pool if not _has_var(p, 'word')]
        if filtered:
            pool = filtered
    if not ctx.get('streak'):
        filtered = [p for p in pool if not _has_var(p, 'streak')]
        if filtered:
            pool = filtered

    title_tpl, body_tpl = random.choice(pool)
    fmt = {
        'name': ctx.get('display_name') or '회원',
        'n': ctx.get('review_due') or 0,
        'word': ctx.get('sample_voca_word') or '',
        'streak': ctx.get('streak') or 0,
    }
    return title_tpl.format(**fmt), body_tpl.format(**fmt)


# ──────────────────────────────────────────────
# '채팅으로 학습' 알림 문구 (실험실 기능, fcm.run_chat_reminder 전용)
# ──────────────────────────────────────────────

CHAT_TIME_SLOTS = ('morning', 'late_morning', 'afternoon', 'evening', 'night')

CHAT_MESSAGES = {
    'morning': [
        ("좋은 아침이에요 {name}님 ☀️",
         "오늘 단어 {n}개, 채팅으로 가볍게 풀어볼까요?"),
        ("눈 뜨자마자 단어 한 판 어때요? 👋",
         "{name}님을 위한 {n}개, 채팅으로 3분이면 끝나요."),
    ],
    'late_morning': [
        ("잠깐 쉬는 틈에 단어 {n}개 어때요? ☕",
         "채팅으로 톡톡 풀면 금방이에요, {name}님!"),
        ("오전 루틴에 단어 한 스푼 추가 🍯",
         "{n}개만 채팅으로 풀고 넘어가요."),
    ],
    'afternoon': [
        ("나른한 오후, 단어로 잠깐 깨워볼까요? 🌤️",
         "{name}님, {n}개가 채팅으로 기다리고 있어요."),
        ("오후 텀에 단어 {n}개 — 채팅이라 편해요",
         "눌러서 바로 풀어보세요!"),
    ],
    'evening': [
        ("이동 중에도 단어 {n}개, 채팅으로 🚶",
         "{name}님, 부담 없이 톡톡 풀어봐요."),
        ("저녁 전에 단어 {n}개 가볍게 정리해요",
         "채팅으로 후딱 — 오늘 몫 끝내볼까요?"),
    ],
    'night': [
        ("자기 전 마지막 단어 {n}개 🌙",
         "{name}님, 채팅으로 후딱 풀고 편히 주무세요."),
        ("오늘 하루 마무리는 단어로 ✨",
         "{n}개 남았어요, 채팅으로 가볍게 풀어봐요."),
    ],
}


def select_chat_message(time_slot: str, ctx: dict, n: int = None) -> tuple:
    """채팅 학습 알림 문구 선택 (title, body).

    n 미지정 시 ctx['review_due']를 사용. time_slot이 CHAT_TIME_SLOTS에 없으면
    'afternoon' 풀로 폴백.
    """
    pool = list(CHAT_MESSAGES.get(time_slot) or CHAT_MESSAGES['afternoon'])
    title_tpl, body_tpl = random.choice(pool)
    fmt = {
        'name': ctx.get('display_name') or '회원',
        'n': n if n is not None else (ctx.get('review_due') or 0),
    }
    return title_tpl.format(**fmt), body_tpl.format(**fmt)
