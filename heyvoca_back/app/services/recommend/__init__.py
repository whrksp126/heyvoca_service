"""
recommend 패키지.

주요 공개 인터페이스:
  build_candidate_pool(user_id, book_ids) -> list[CandidateItem]
  compose(pool, count, type_)             -> dict
"""
from app.services.recommend.pool import build_candidate_pool, CandidateItem
from app.services.recommend.composer import compose

__all__ = ["build_candidate_pool", "CandidateItem", "compose"]
