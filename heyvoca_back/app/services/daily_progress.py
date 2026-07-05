"""공유 일일 학습 진행도 계산 헬퍼.

POST /user_study_history 의 데일리 미션 판정과 daily_progress 응답 필드 생성에 사용.
/study/today-summary, /study/review-schedule 라우트와 동일한 기준을 공유한다.
"""

import json
from uuid import UUID

from app import db
from app.models.models import UserStudyLog


def get_today_new_done(user_id: UUID) -> tuple:
    """오늘(logical day) 신규 학습 단어 수와 복습 완료 수를 반환.

    /study/today-summary 라우트와 동일 기준:
    - state_before가 new/없음인 로그의 distinct user_voca_id → 신규.
    - 오늘 학습한 단어 중 신규가 아닌 것 → 복습 완료.

    Returns:
        (new_done: int, reviews_done: int)
    """
    from app.services.study_day import logical_day_start_utc
    day_start_utc = logical_day_start_utc()

    rows = (
        db.session.query(UserStudyLog.user_voca_id, UserStudyLog.state_before)
        .filter(
            UserStudyLog.user_id == user_id,
            UserStudyLog.created_at >= day_start_utc,
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
