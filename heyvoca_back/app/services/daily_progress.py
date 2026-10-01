"""공유 일일 학습 진행도 계산 헬퍼.

POST /user_study_history 의 데일리 미션 판정과 daily_progress 응답 필드 생성에 사용.
/study/today-summary, /study/review-schedule 라우트와 동일한 기준을 공유한다.
"""

import json
from uuid import UUID

from app import db
from app.models.models import UserStudyLog
from app.utils.dict_lang import get_dict_lang
from app.utils.script_scope import script_user_voca_ids_subquery


def get_today_new_done(user_id: UUID) -> tuple:
    """오늘(logical day) 신규 학습 단어 수와 복습 완료 수를 반환.

    /study/today-summary 라우트와 동일 기준:
    - state_before가 new/없음인 로그의 distinct user_voca_id → 신규.
    - 오늘 학습한 단어 중 신규가 아닌 것 → 복습 완료.

    글자 밭(book_kind='script') 학습 로그는 제외한다 — '오늘 새 씨앗 N개' 데일리
    미션·홈 카드는 일반 단어 기준이라, 글자를 세면 글자만 풀어도 미션이 채워진다.

    Returns:
        (new_done: int, reviews_done: int)
    """
    from app.services.study_day import logical_day_start_utc
    day_start_utc = logical_day_start_utc()
    script_ids = script_user_voca_ids_subquery(user_id)

    rows = (
        db.session.query(UserStudyLog.user_voca_id, UserStudyLog.state_before)
        .filter(
            UserStudyLog.user_id == user_id,
            # 현재 학습 언어 기준(today-summary 와 동일). 풀(get_review_due)도 언어 한정.
            UserStudyLog.dict_lang == get_dict_lang(),
            UserStudyLog.created_at >= day_start_utc,
            ~UserStudyLog.user_voca_id.in_(script_ids),
        )
        .all()
    )

    new_ids: set = set()
    studied_ids: set = set()
    for vid, state_before in rows:
        studied_ids.add(vid)
        is_new = False
        if not state_before:
            is_new = True
        else:
            try:
                st = json.loads(state_before)
                if not st or st.get('state') in ('new', None):
                    is_new = True
            except Exception:
                is_new = False
        if is_new:
            new_ids.add(vid)

    new_done = len(new_ids)
    reviews_done = len(studied_ids - new_ids)
    return new_done, reviews_done


def get_review_due(user_id: UUID) -> int:
    """복습 잔여 수(overdue + today) 반환.

    /study/review-schedule 라우트와 동일 기준:
    - build_candidate_pool 에서 bucket이 'overdue' 또는 'today'인 항목 수.
    - 풀은 Redis 30초 캐시를 거치므로 반복 호출 비용 낮음.

    조회 실패 시 0 반환 (미션 판정이 보수적으로 동작하지 않도록 폴백).
    """
    from app.services.recommend.pool import build_candidate_pool
    try:
        pool = build_candidate_pool(user_id, None)
    except Exception:
        return 0

    return sum(1 for it in pool if it.bucket in ('overdue', 'today'))


def get_card_review_remaining(user_id: UUID) -> int:
    """홈 '오늘 할 일' 카드의 복습 줄(시듦·돌봄) 남은 대상 수 — 데일리 미션 복습 충족 판정용.

    `/farm/today-tasks` 와 `/study/recommend?task_bucket=` 이 쓰는 공유 헬퍼
    (get_task_bucket_ids)를 그대로 호출하므로 카드의 '남은 것'과 정의가 갈리지 않는다.
    조회 실패 시 0(미션 판정이 영원히 막히지 않게 보수적으로 폴백).
    """
    import datetime as dt
    from app.services.game.farm_v2.query import get_task_bucket_ids
    try:
        now = dt.datetime.utcnow()
        wilted = get_task_bucket_ids(user_id, 'wilted', now)
        care = get_task_bucket_ids(user_id, 'care', now)
        return len(set(wilted) | set(care))
    except Exception:
        return 0
