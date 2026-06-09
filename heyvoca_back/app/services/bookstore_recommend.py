import json
import math
from typing import Dict, Iterable, List, Optional
from uuid import UUID

from sqlalchemy import text

from app import cache, db
from app.services.fsrs.state import get_fsrs_state, is_v1, migrate_v1_to_v2, parse_user_voca_data


LEVEL_LABELS: Dict[int, str] = {
    1: "초등",
    2: "중등",
    3: "고등",
    4: "대학생",
}

_MIN_ATTEMPTED_WORDS = 20
_MASTERY_REVIEW_REPS = 2
_MASTERY_STABILITY_DAYS = 21.0
_PROFILE_CACHE_TTL = 60 * 60
_RECOMMEND_CACHE_TTL = 10 * 60


def _empty_level_stats() -> Dict[int, dict]:
    return {
        level_id: {
            "total_words": 0,
            "attempted_words": 0,
            "mastered_words": 0,
            "mastery_rate": 0.0,
        }
        for level_id in LEVEL_LABELS
    }


def _safe_int(value, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _safe_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _load_fsrs_state(raw_data: Optional[str]) -> dict:
    payload = parse_user_voca_data(raw_data)
    if is_v1(payload):
        payload = migrate_v1_to_v2(payload)
    return get_fsrs_state(payload) or {}


def is_attempted_word(fsrs_state: dict) -> bool:
    state = str(fsrs_state.get("state") or "new").lower()
    reps = _safe_int(fsrs_state.get("reps"))
    return state != "new" or reps > 0


def is_mastered_word(fsrs_state: dict) -> bool:
    if not is_attempted_word(fsrs_state):
        return False
    reps = _safe_int(fsrs_state.get("reps"))
    stability = _safe_float(fsrs_state.get("stability"))
    return reps >= _MASTERY_REVIEW_REPS and stability >= _MASTERY_STABILITY_DAYS


def build_mastery_stats(rows: Iterable[dict]) -> Dict[int, dict]:
    mastery = _empty_level_stats()

    for row in rows:
        level_id = _safe_int(row.get("level_id"))
        if level_id not in mastery:
            continue

        stats = mastery[level_id]
        stats["total_words"] += 1

        fsrs_state = _load_fsrs_state(row.get("data"))
        if is_attempted_word(fsrs_state):
            stats["attempted_words"] += 1
        if is_mastered_word(fsrs_state):
            stats["mastered_words"] += 1

    for stats in mastery.values():
        attempted = stats["attempted_words"]
        stats["mastery_rate"] = round(
            (stats["mastered_words"] / attempted) if attempted > 0 else 0.0,
            4,
        )

    return mastery


def determine_official_level(mastery: Dict[int, dict], signup_level_id: int) -> dict:
    valid_stats = [
        (level_id, stats)
        for level_id, stats in mastery.items()
        if stats["attempted_words"] >= _MIN_ATTEMPTED_WORDS
    ]

    high_mastery_levels = [
        (level_id, stats) for level_id, stats in valid_stats if stats["mastery_rate"] >= 0.8
    ]
    if high_mastery_levels:
        level_id, stats = max(high_mastery_levels, key=lambda item: item[0])
        return {"level_id": level_id, "source": "mastery", "stats": stats}

    medium_mastery_levels = [
        (level_id, stats) for level_id, stats in valid_stats if stats["mastery_rate"] >= 0.5
    ]
    if medium_mastery_levels:
        level_id, stats = max(medium_mastery_levels, key=lambda item: item[0])
        return {"level_id": level_id, "source": "mastery", "stats": stats}

    if valid_stats:
        level_id, stats = max(
            valid_stats,
            key=lambda item: (item[1]["attempted_words"], item[0]),
        )
        return {"level_id": level_id, "source": "learning", "stats": stats}

    fallback_level = signup_level_id if signup_level_id in LEVEL_LABELS else 1
    return {
        "level_id": fallback_level,
        "source": "signup",
        "stats": mastery.get(fallback_level, _empty_level_stats()[fallback_level]),
    }


def build_target_mix(official_level_id: int, official_stats: dict) -> List[dict]:
    attempted = official_stats.get("attempted_words", 0)
    mastery_rate = official_stats.get("mastery_rate", 0.0)

    if attempted < _MIN_ATTEMPTED_WORDS:
        return [{"level_id": official_level_id, "weight": 1.0}]

    if mastery_rate < 0.6:
        if official_level_id > 1:
            return [
                {"level_id": official_level_id, "weight": 0.8},
                {"level_id": official_level_id - 1, "weight": 0.2},
            ]
        return [{"level_id": official_level_id, "weight": 1.0}]

    if mastery_rate < 0.8:
        if official_level_id < max(LEVEL_LABELS):
            return [
                {"level_id": official_level_id, "weight": 0.6},
                {"level_id": official_level_id + 1, "weight": 0.4},
            ]
        return [{"level_id": official_level_id, "weight": 1.0}]

    if official_level_id < max(LEVEL_LABELS):
        return [
            {"level_id": official_level_id, "weight": 0.3},
            {"level_id": official_level_id + 1, "weight": 0.7},
        ]
    return [{"level_id": official_level_id, "weight": 1.0}]


def _profile_cache_key(user_id: UUID) -> str:
    return f"bookstore:level-profile:{user_id}"


def derive_user_level_profile(user_id, signup_level_id: Optional[int] = None) -> dict:
    if isinstance(user_id, str):
        user_id = UUID(user_id)

    cache_key = _profile_cache_key(user_id)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    if signup_level_id is None:
        signup_level_id = db.session.execute(
            text("SELECT level_id FROM heyvoca_user.user WHERE id = :user_id"),
            {"user_id": user_id.bytes},
        ).scalar()

    signup_level_id = _safe_int(signup_level_id, 1)
    if signup_level_id not in LEVEL_LABELS:
        signup_level_id = 1

    rows = db.session.execute(
        text(
            """
            SELECT
                uv.id AS user_voca_id,
                MAX(bs.level_id) AS level_id,
                uv.data AS data
            FROM heyvoca_user.user_voca_book ub
            JOIN heyvoca_user.user_voca_book_map ubm
              ON ubm.user_voca_book_id = ub.id
            JOIN heyvoca_user.user_voca uv
              ON uv.id = ubm.user_voca_id
             AND uv.user_id = :user_id
            JOIN heyvoca_dict.bookstore bs
              ON bs.id = ub.bookstore_id
            WHERE ub.user_id = :user_id
              AND ub.bookstore_id IS NOT NULL
            GROUP BY uv.id, uv.data
            """
        ),
        {"user_id": user_id.bytes},
    ).mappings().all()

    mastery = build_mastery_stats(rows)
    official = determine_official_level(mastery, signup_level_id)
    official_level_id = official["level_id"]
    target_mix = build_target_mix(official_level_id, official["stats"])

    result = {
        "signup_level_id": signup_level_id,
        "official_level_id": official_level_id,
        "official_level_label": LEVEL_LABELS.get(official_level_id, "초등"),
        "source": official["source"],
        "target_mix": target_mix,
        "mastery": mastery,
    }

    cache.set(cache_key, result, timeout=_PROFILE_CACHE_TTL)
    return result


def level_distance_fit(target_level_id: int, book_level_id: int) -> float:
    distance = abs(target_level_id - book_level_id)
    if distance == 0:
        return 1.0
    if distance == 1:
        return 0.75
    if distance == 2:
        return 0.35
    return 0.1


def calc_level_fit(target_mix: List[dict], book_level_id: int) -> float:
    return round(
        sum(
            float(target.get("weight", 0.0))
            * level_distance_fit(_safe_int(target.get("level_id")), book_level_id)
            for target in target_mix
        ),
        4,
    )


def calc_popularity(downloads: int, max_downloads: int) -> float:
    downloads = max(0, _safe_int(downloads))
    max_downloads = max(0, _safe_int(max_downloads))
    if max_downloads <= 0:
        return 0.0
    return round(math.log(downloads + 1) / math.log(max_downloads + 1), 4)


def score_book(book: dict, target_mix: List[dict], max_downloads: int) -> dict:
    level_id = _safe_int(book.get("level_id"))
    level_fit = calc_level_fit(target_mix, level_id)
    popularity = calc_popularity(book.get("downloads"), max_downloads)
    owned_penalty = 1.0 if book.get("owned") else 0.0
    score = round((0.7 * level_fit) + (0.3 * popularity) - owned_penalty, 4)

    result = dict(book)
    result["level_fit"] = level_fit
    result["popularity"] = popularity
    result["score"] = score
    return result


def _normalize_color(raw_color):
    if isinstance(raw_color, str):
        try:
            return json.loads(raw_color)
        except (TypeError, ValueError):
            return raw_color
    return raw_color


def _recommend_cache_key(user_id: UUID, category: Optional[str], limit: int) -> str:
    category_part = category or "all"
    return f"bookstore:recommend:{user_id}:{category_part}:{limit}"


def recommend_bookstores_for_user(user_id, *, category: Optional[str] = None, limit: int = 12) -> dict:
    if isinstance(user_id, str):
        user_id = UUID(user_id)

    cache_key = _recommend_cache_key(user_id, category, limit)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    profile = derive_user_level_profile(user_id)

    owned_rows = db.session.execute(
        text(
            """
            SELECT DISTINCT bookstore_id
            FROM heyvoca_user.user_voca_book
            WHERE user_id = :user_id
              AND bookstore_id IS NOT NULL
            """
        ),
        {"user_id": user_id.bytes},
    ).all()
    owned_ids = {row[0] for row in owned_rows if row[0] is not None}

    where_parts = ["bs.hide = 'N'"]
    params = {}
    if category:
        where_parts.append("bs.category = :category")
        params["category"] = category

    rows = db.session.execute(
        text(
            f"""
            SELECT
                bs.id AS bookstore_id,
                bs.name AS bookstore_name,
                bs.downloads,
                bs.category,
                bs.color,
                bs.gem,
                bs.level_id,
                COALESCE(avb.word_count, 0) AS word_count
            FROM heyvoca_dict.bookstore bs
            JOIN heyvoca_dict.admin_voca_book avb
              ON bs.admin_voca_book_id = avb.id
            WHERE {' AND '.join(where_parts)}
            ORDER BY bs.id ASC
            """
        ),
        params,
    ).mappings().all()

    max_downloads = max((_safe_int(row["downloads"]) for row in rows), default=0)
    scored = []
    for row in rows:
        book = {
            "id": row["bookstore_id"],
            "name": row["bookstore_name"],
            "downloads": _safe_int(row["downloads"]),
            "category": row["category"],
            "color": _normalize_color(row["color"]),
            "gem": _safe_int(row["gem"]),
            "level_id": _safe_int(row["level_id"]),
            "level_label": LEVEL_LABELS.get(_safe_int(row["level_id"])),
            "vocaCount": _safe_int(row["word_count"]),
            "owned": row["bookstore_id"] in owned_ids,
        }
        scored.append(score_book(book, profile["target_mix"], max_downloads))

    scored.sort(
        key=lambda item: (
            -item["score"],
            -item["level_fit"],
            -item["downloads"],
            item["id"],
        )
    )

    result = {
        "user_level": profile,
        "recommendations": scored[:limit],
    }
    cache.set(cache_key, result, timeout=_RECOMMEND_CACHE_TTL)
    return result


def invalidate_bookstore_recommend_cache(user_id) -> None:
    try:
        redis_client = cache.cache._client  # type: ignore[attr-defined]
        patterns = [
            f"{cache.cache.key_prefix}bookstore:level-profile:{user_id}",
            f"{cache.cache.key_prefix}bookstore:recommend:{user_id}:*",
        ]
        keys = []
        for pattern in patterns:
            keys.extend(list(redis_client.scan_iter(pattern)))
        if keys:
            redis_client.delete(*keys)
    except Exception:
        pass
