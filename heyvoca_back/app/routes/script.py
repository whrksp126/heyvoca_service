"""글자 밭 API — 일본어(히라가나/가타카나)·영어(알파벳) 문자 학습.

2026-09 재설계: 글자를 **단어 하나처럼** 다룬다 — 기존 UserVoca + FSRS + 농장 v2
(UserVocaGame, 작물 XP·단계 성장) + `/study/log`를 그대로 쓴다. 글자는 서점 구매 없이
모두 무료로 제공한다.

기존(레벨 0~5 자체 간격 반복 테이블) 구현은 폐기했다 — `UserScriptProgress` 테이블은
DB 에는 남아 있지만(탈퇴 삭제 체인은 유지) 더 이상 쓰지 않는다.

핵심 설계:
  - 글자 = 사용자 커스텀 단어(voca_id=None)처럼 `UserVoca` 행 하나. word=글자,
    voca_meanings=[한글 발음(+로마자/영문명)] — 정본은 `app/services/script_chars.py`
    (프론트 정적 JSON의 서버 사본, 클라이언트 body로 글자 목록을 받지 않는다).
  - 각 스크립트(hiragana/katakana/alphabet)마다 사용자당 전용 `UserVocaBook`
    (`book_kind='script'`, `script_key=<script>`)을 하나 두고, 그 안에 모든 글자를
    `UserVocaBookMap`으로 매핑한다.
  - **격리가 핵심.** 이 단어장은 일반 '단어장' 목록/추천/농장 집계에 절대 섞이지
    않는다 — `UserVocaBook.book_kind == 'script'` 인 단어장을 그 경로들에서 전부
    제외해야 한다(`app/utils/script_scope.py`, 각 호출부 주석 참고). `/study/log`는
    예외 없이 그대로 태운다 — 글자도 FSRS·농장 성장(XP·단계)이 정상적으로 적용돼야
    한다.
  - **복습 예정일·시듦/썩음 없음(2026-09-30 결정).** 글자는 작물(씨앗→새싹→이파리→
    당근) 단계·XP 로만 관리하고, 농장의 건강 축(THIRSTY/WILTED/CRITICAL/ROTTEN)과
    FSRS 예정일 기반 "오늘 할 일" 개념은 적용하지 않는다 — `/script/progress`는
    health 를 항상 `FRESH`로 고정해 내려주고(`_plant_item`/`compute_health` 재사용을
    끊었다), `due`/`due_count` 필드 자체를 뺐다. `mode=review` 세션도 FSRS 예정일이
    아니라 **XP(숙달도) 낮은 글자 우선 + 최근 오답 글자 우선 + 동률 무작위**로 구성한다.
    `/study/log`가 내부적으로 갱신하는 FSRS·`UserVocaGame.rot_due_at`/`health_state`
    (farm_v2/answer.py, watering.py의 감쇠 재계산)는 막지 않는다 — 그 값들이 실제로
    화면에 노출되는 지점(`/script/progress`, `/script/session`)에서만 무시한다.
    감쇠 스케줄러·헬스 계산·알림 쪽 적용 지점은 이 파일 하단 커밋 메시지/작업 보고 참고.
"""

import datetime as dt
import json
import logging
import random
from uuid import UUID

from flask import Blueprint, jsonify, g, request

from app import db
from app.models.models import (
    HealthState, UserStudyLog, UserStudySession, UserVoca, UserVocaBook,
    UserVocaBookMap, UserVocaGame, VisualStage,
)
from app.utils.jwt_utils import jwt_required
from app.utils.db_lock import begin_user_tx
from app.utils.script_scope import BOOK_KIND_SCRIPT
from app.services.script_chars import (
    SCRIPT_CHOICES, SCRIPT_LANG, BOOK_NAME, get_chars, meaning_for,
)

script_bp = Blueprint('script', __name__, url_prefix='/script')

_log = logging.getLogger(__name__)

# 단어장 카드 표시용 — 일반 '단어장' 탭에는 노출되지 않으므로 장식일 뿐이다.
_BOOK_COLOR = {
    'hiragana': {'main': 'var(--secondary-mint-500)', 'sub': 'var(--secondary-mint-200)',
                 'background': 'var(--secondary-mint-100)'},
    'katakana': {'main': 'var(--secondary-blue-500)', 'sub': 'var(--secondary-blue-200)',
                 'background': 'var(--secondary-blue-100)'},
    'alphabet': {'main': 'var(--secondary-purple-500)', 'sub': 'var(--secondary-purple-200)',
                 'background': 'var(--secondary-purple-100)'},
}

_MAX_SESSION_CHARS = 200
_DEFAULT_REVIEW_LIMIT = 20


def _fail(where: str):
    _log.error('%s 오류', where, exc_info=True)
    return jsonify({'code': 500, 'message': '서버 오류가 발생했습니다.'}), 500


def _bad_request(message: str):
    return jsonify({'code': 400, 'message': message}), 400


def _validate_script(value):
    if value not in SCRIPT_CHOICES:
        raise ValueError('script는 hiragana|katakana|alphabet 중 하나여야 합니다.')
    return value


def _get_script_book(user_id, script):
    return (
        db.session.query(UserVocaBook)
        .filter(
            UserVocaBook.user_id == user_id,
            UserVocaBook.book_kind == BOOK_KIND_SCRIPT,
            UserVocaBook.script_key == script,
        )
        .first()
    )


def _heal_script_games(user_id, book_id) -> int:
    """글자 작물의 건강·단계를 바로잡는다(멱등) — 이 글자장(book_id)의 UserVocaGame 만.

    2026-10 이전에는 농장 부패 스캔(`farm_v2/watering._candidate_query`)이 글자를 제외하지
    않아 글자 작물이 ROTTEN 이 됐고, 부패 작물은 `growth.next_stage` 가 성장을 막아
    visual_stage 가 심은 씨앗에 멈춘 채 stability 기반 XP 만 계속 올랐다(상세 시트에서 씨앗
    칸에 398 XP 가 찍히는 모순). 스캔은 이제 글자를 제외하므로, 여기서는 이미 망가진 행만
    되돌린다: 건강은 FRESH 로, 단계는 stability 가 가리키는 단계까지(내려가지는 않는다).
    성장 보상(보석·삽 등)은 소급 지급하지 않는다. 고칠 행이 없으면 쓰기 없이 끝난다.
    """
    from app.services.game.farm_v2 import growth

    def _scan():
        return (
            db.session.query(UserVocaGame, UserVoca)
            .join(UserVoca, UserVoca.id == UserVocaGame.user_voca_id)
            .join(UserVocaBookMap, UserVocaBookMap.user_voca_id == UserVoca.id)
            .filter(
                UserVocaBookMap.user_voca_book_id == book_id,
                UserVocaGame.user_id == user_id,
                UserVocaGame.visual_stage != VisualStage.UNPLANTED_SEED,
            )
            .all()
        )

    def _fixes(rows):
        out = []
        for game, uv in rows:
            want_stage = growth.stage_from_stability(growth._stability(growth.load_fsrs_state(uv)))
            stage_up = (want_stage is not None and game.visual_stage != VisualStage.GOLDEN
                        and VisualStage.rank(want_stage) > VisualStage.rank(game.visual_stage))
            bad_health = game.health_state not in (HealthState.FRESH, HealthState.GOLDEN)
            if stage_up or bad_health:
                out.append((game, want_stage if stage_up else None, bad_health))
        return out

    if not _fixes(_scan()):
        return 0

    now = dt.datetime.utcnow()
    try:
        begin_user_tx(user_id)
        fixes = _fixes(_scan())   # 잠금 뒤 다시 계산 — 그 사이 정답 반영을 덮어쓰지 않도록
        for game, want_stage, bad_health in fixes:
            if want_stage is not None:
                game.visual_stage = want_stage
                if VisualStage.rank(want_stage) > VisualStage.rank(game.highest_stage or ''):
                    game.highest_stage = want_stage
            if bad_health:
                game.health_state = HealthState.FRESH
                game.health_changed_at = now
                game.protection_days = 0
                game.rot_due_at = None
            game.updated_at = now
        db.session.commit()
        if fixes:
            _log.info('글자 작물 보정 user=%s book=%s %d건', user_id, book_id, len(fixes))
        return len(fixes)
    except Exception:
        db.session.rollback()
        _log.error('글자 작물 보정 실패', exc_info=True)
        return 0


def _build_progress_items(book_id, script):
    """(book_id) 안의 글자들 — 성장 단계(visual_stage)·XP만 담는다.

    2026-09-30 결정: 글자는 농장의 건강 축(시듦/썩음)과 FSRS 예정일 기반 "복습 예정"
    개념을 쓰지 않는다 — `health`는 항상 `FRESH`로 고정한다(`_plant_item`/
    `compute_health`처럼 FSRS due_at으로 상태를 계산하는 경로를 의도적으로 타지 않는다).
    `/study/log`가 내부적으로 `UserVocaGame.rot_due_at`/`health_state`를 계속 갱신하고
    농장 감쇠 재계산(`farm_v2/watering.compute_rot_state`, `/farm/*` 조회마다 실행)도
    이 행들을 걸러내지 않고 그대로 지나가지만, 그 결과는 여기서 무시한다 — 농장 쪽
    집계·목록은 이미 book_kind='script'를 전부 제외하므로 사용자에게는 보이지 않는다.
    """
    from app.services.game.farm_v2 import growth, xp as xp_mod

    rows = (
        db.session.query(UserVoca, UserVocaGame)
        .join(UserVocaBookMap, UserVocaBookMap.user_voca_id == UserVoca.id)
        .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
        .filter(UserVocaBookMap.user_voca_book_id == book_id)
        .all()
    )

    items = []
    learned_count = 0
    for uv, game in rows:
        stage = (game.visual_stage if game else None) or VisualStage.UNPLANTED_SEED
        fsrs_state = growth.load_fsrs_state(uv)
        if stage != VisualStage.UNPLANTED_SEED:
            learned_count += 1
        items.append({
            'char':         uv.word,
            'user_voca_id': uv.id,
            'stage':        stage,
            # 글자는 시들지도 썩지도 않는다(사용자 결정) — 항상 정상으로 고정.
            'health':       HealthState.FRESH,
            'xp':           xp_mod.xp_of(stage, fsrs_state),
        })

    # 정본(app/services/script_chars.py) 순서로 정렬 — 학습 화면의 표시 순서와 맞춘다.
    order = {e['char']: i for i, e in enumerate(get_chars(script))}
    items.sort(key=lambda it: order.get(it['char'], len(order)))

    return items, learned_count


def _progress_payload(user_id, script):
    book = _get_script_book(user_id, script)
    if book is None:
        return {'book_id': None, 'items': [], 'learned_count': 0}
    _heal_script_games(user_id, book.id)
    items, learned_count = _build_progress_items(book.id, script)
    return {
        'book_id': str(book.id),
        'items': items,
        'learned_count': learned_count,
    }


@script_bp.route('/ensure', methods=['POST'])
@jwt_required
def ensure_script():
    """POST /script/ensure {script}

    해당 사용자에게 이 스크립트의 글자 단어장이 없으면 만들고(멱등), 있으면 정본
    글자 목록과 비교해 빠진 글자만 채운다(추후 정본이 늘어나도 자연히 따라잡음).
    응답 모양은 `/script/progress`와 같다.
    """
    body = request.get_json(silent=True) or {}
    script = body.get('script')
    try:
        _validate_script(script)
    except ValueError as e:
        return _bad_request(str(e))

    user_id = UUID(g.user_id)
    lang = SCRIPT_LANG[script]
    now = dt.datetime.utcnow()

    try:
        begin_user_tx(user_id)

        book = _get_script_book(user_id, script)
        if book is None:
            book = UserVocaBook(
                user_id=user_id, bookstore_id=None,
                color=json.dumps(_BOOK_COLOR[script], ensure_ascii=False),
                name=BOOK_NAME[script], total_word_cnt=0, memorized_word_cnt=0,
                voca_list=None, updated_at=now,
                language=lang, book_kind=BOOK_KIND_SCRIPT, script_key=script,
            )
            db.session.add(book)
            db.session.flush()

        existing_words = {
            w for (w,) in db.session.query(UserVoca.word)
            .join(UserVocaBookMap, UserVocaBookMap.user_voca_id == UserVoca.id)
            .filter(UserVocaBookMap.user_voca_book_id == book.id)
            .all()
        }

        added = 0
        for entry in get_chars(script):
            char = entry['char']
            if char in existing_words:
                continue
            meaning = meaning_for(script, entry)
            uv = UserVoca(
                user_id=user_id, voca_id=None, word=char,
                voca_meanings=json.dumps([meaning], ensure_ascii=False),
                voca_examples=json.dumps([], ensure_ascii=False),
                data=None, dict_lang=lang,
            )
            db.session.add(uv)
            db.session.flush()
            db.session.add(UserVocaBookMap(
                user_voca_book_id=book.id, user_voca_id=uv.id, level=None,
                voca_meanings=uv.voca_meanings, voca_examples=uv.voca_examples,
                memory_status=None,
            ))
            added += 1

        if added:
            book.total_word_cnt = (book.total_word_cnt or 0) + added
            book.updated_at = now

        db.session.commit()
    except Exception:
        db.session.rollback()
        return _fail('글자 밭 준비')

    return jsonify({'code': 200, 'data': _progress_payload(user_id, script)}), 200


@script_bp.route('/progress', methods=['GET'])
@jwt_required
def get_progress():
    """GET /script/progress?script=hiragana

    응답: {code:200, data:{book_id, items:[{char,user_voca_id,stage,health,xp}],
                           learned_count}}

    아직 `/script/ensure`를 부르지 않은 스크립트는 book_id=null, items=[] (모두 미학습).
    stage는 농장 v2 visual_stage(단어 목록/단어장 상세와 같은 값 — `UserVocaGame.visual_stage`).
    health는 항상 `FRESH`(2026-09-30 결정 — 글자는 시들지도 썩지도 않는다), 복습 예정일
    개념(due/due_count)은 없다 — 복습은 `/script/session?mode=review`가 XP·최근 오답
    기준으로 알아서 고른다.
    """
    script = request.args.get('script')
    try:
        _validate_script(script)
    except ValueError as e:
        return _bad_request(str(e))

    user_id = UUID(g.user_id)
    try:
        return jsonify({'code': 200, 'data': _progress_payload(user_id, script)}), 200
    except Exception:
        return _fail('글자 밭 진행도 조회')


class _ScriptSessionItem:
    """`_serialize_recommend_item`(app/routes/study.py)이 기대하는 최소 속성 집합.

    글자는 사전(voca_id) 참조가 없는 사용자 커스텀 단어와 동일하게 다룬다 — concept/
    puzzle/example 관련 필드는 전부 빈 값(글자 자체에는 예문 조립 문제가 없다).
    """
    __slots__ = (
        'user_voca_id', 'user_voca_book_id', 'voca_id', 'word', 'meanings',
        'concept_ids', 'meaning_concepts', 'examples', 'example_puzzles', 'fsrs_state',
        'dict_lang',
    )

    def __init__(self, uv, book_id, fsrs_state):
        self.user_voca_id = uv.id
        self.user_voca_book_id = book_id
        self.voca_id = None
        # study._build_sentence_question_payload 가 item.dict_lang 을 읽는다(없으면 AttributeError→500).
        self.dict_lang = getattr(uv, 'dict_lang', None) or 'en'
        self.word = uv.word
        try:
            self.meanings = json.loads(uv.voca_meanings) if uv.voca_meanings else []
        except (TypeError, ValueError):
            self.meanings = []
        self.concept_ids = []
        self.meaning_concepts = []
        self.examples = []
        self.example_puzzles = []
        self.fsrs_state = fsrs_state


def _recent_wrong_user_voca_ids(user_id, uv_ids) -> set:
    """`uv_ids` 중 **가장 최근 학습 로그**가 오답이었던 것들.

    mode=review 우선순위 신호(최근 오답 우선)로만 쓴다 — 복습 예정일 개념이 없으므로
    "지금 몇 시인가"가 아니라 "최근에 틀렸는가"가 복습 우선순위의 대체 신호다.
    """
    if not uv_ids:
        return set()
    rows = (
        db.session.query(UserStudyLog.user_voca_id, UserStudyLog.was_correct)
        .filter(UserStudyLog.user_id == user_id, UserStudyLog.user_voca_id.in_(list(uv_ids)))
        .order_by(UserStudyLog.created_at.desc())
        .all()
    )
    latest = {}
    for vid, was_correct in rows:
        latest.setdefault(vid, bool(was_correct))
    return {vid for vid, correct in latest.items() if not correct}


# ── 복습 응용 문제용 "배운 글자로만 된 실제 단어" (2026-10) ──────────────────────────────
# 일한 사전(heyvoca_dict_ja)에서 읽기(VocaJa.reading)의 모든 글자가 사용자가 이미 심은 가나
# 집합에 들어가는 2~3글자(요음은 한 글자로 센다) 단어를 고른다. 후보 목록은 사전이 바뀌기
# 전까지 같으므로 프로세스 메모리에 한 번만 읽어 둔다(상용어/JLPT 단어만, 수천 건).
_WORD_UNITS = (2, 3)
_WORD_BANK_LIMIT = 30
_ja_word_candidates = {}   # script -> [(voca_id, word, reading, units, rank)]


def _kana_units(reading, char_set):
    """읽기를 글자 단위로 자른다 — 요음(きゃ 등 2자 단위)을 먼저 맞춘다. 글자장에 없는 글자가 있으면 None."""
    units, i = [], 0
    while i < len(reading):
        two = reading[i:i + 2]
        if len(two) == 2 and two in char_set:
            units.append(two)
            i += 2
        elif reading[i] in char_set:
            units.append(reading[i])
            i += 1
        else:
            return None
    return units


def _load_word_candidates(script):
    if script in _ja_word_candidates:
        return _ja_word_candidates[script]
    from sqlalchemy import func, or_
    from app.models.models import Voca, VocaJa
    from app.utils.dict_lang import use_dict_lang

    char_set = {e['char'] for e in get_chars(script)}
    with use_dict_lang('ja'):
        rows = (
            db.session.query(Voca.id, Voca.word, VocaJa.reading, VocaJa.jlpt, VocaJa.common,
                             VocaJa.freq_rank)
            .join(VocaJa, VocaJa.voca_id == Voca.id)
            .filter(
                or_(Voca.is_active.is_(None), Voca.is_active.is_(True)),
                func.char_length(VocaJa.reading).between(2, 6),
                or_(VocaJa.common.is_(True), VocaJa.jlpt.isnot(None)),
            )
            .all()
        )
    jlpt_rank = {'N5': 0, 'N4': 1, 'N3': 2, 'N2': 3, 'N1': 4}
    out, seen = [], set()
    for vid, word, reading, jlpt, common, freq in rows:
        if not reading or reading in seen:
            continue
        units = _kana_units(reading, char_set)
        if not units or not (_WORD_UNITS[0] <= len(units) <= _WORD_UNITS[1]):
            continue
        seen.add(reading)
        rank = (jlpt_rank.get(jlpt, 5), 0 if common else 1, freq or 10 ** 6)
        out.append((vid, word, reading, units, rank))
    out.sort(key=lambda r: r[4])
    _ja_word_candidates[script] = out
    return out


def _script_word_bank(script, learned_chars, focus_chars):
    """배운 글자로만 된 실제 단어 최대 30개 — 이번 세션 글자(focus)가 들어간 단어를 앞에 둔다.

    응답: [{word, reading, units, meaning, voca_id}] — 뜻은 첫 번째 뜻 하나. 가나 스크립트가
    아니거나 사전 조회가 실패하면 빈 목록(프론트가 무의미 조합으로 채운다).
    """
    if script not in ('hiragana', 'katakana') or not learned_chars:
        return []
    try:
        cands = _load_word_candidates(script)
    except Exception:
        _log.warning('글자 단어 후보 조회 실패', exc_info=True)
        return []
    learned = set(learned_chars)
    focus = set(focus_chars)
    usable = [c for c in cands if all(u in learned for u in c[3])]
    # 쉬운 단어 위주로 앞 120개 안에서 섞는다 — 매 세션 같은 단어만 나오지 않게
    with_focus = [c for c in usable if focus & set(c[3])]
    others = [c for c in usable if not (focus & set(c[3]))]
    picked = random.sample(with_focus[:120], min(len(with_focus[:120]), _WORD_BANK_LIMIT))
    if len(picked) < _WORD_BANK_LIMIT:
        picked += random.sample(others[:120], min(len(others[:120]), _WORD_BANK_LIMIT - len(picked)))
    if not picked:
        return []

    from app.models.models import VocaMeaning, VocaMeaningMap
    from app.utils.dict_lang import use_dict_lang
    meanings = {}
    try:
        with use_dict_lang('ja'):
            for vid, meaning in (
                db.session.query(VocaMeaningMap.voca_id, VocaMeaning.meaning)
                .join(VocaMeaning, VocaMeaning.id == VocaMeaningMap.meaning_id)
                .filter(VocaMeaningMap.voca_id.in_([c[0] for c in picked]))
                .order_by(VocaMeaningMap.voca_id, VocaMeaning.id)
                .all()
            ):
                meanings.setdefault(vid, meaning)
    except Exception:
        _log.warning('글자 단어 뜻 조회 실패', exc_info=True)
    return [
        {'voca_id': vid, 'word': word, 'reading': reading, 'units': units,
         'meaning': meanings.get(vid)}
        for vid, word, reading, units, _rank in picked
        if meanings.get(vid)
    ]


@script_bp.route('/session', methods=['GET'])
@jwt_required
def get_session():
    """GET /script/session?script=&mode=learn|review&chars=あ,い,...

    mode=learn: `chars`(콤마 구분, 최대 200개)로 지정한 글자만, 지정한 순서대로.
    mode=review: `chars` 없이 — 이미 심은(UNPLANTED_SEED가 아닌) 글자 중 **XP(숙달도)
                낮은 순 → 최근 오답 글자 우선 → 동률은 무작위** 로 최대 20개를 뽑는다.
                2026-09-30 결정: 글자는 FSRS 복습 예정일 개념을 쓰지 않는다(위 모듈
                docstring 참고) — 그래서 "예정일이 지난 것"이 아니라 이 대체 신호로
                복습 대상을 고른다.

    응답 items는 `/study/recommend`와 **같은 모양**(word_fields/examples_with_tokens
    포함, question_payload는 글자 특성상 항상 {})이라 프론트가 TakeTest를 그대로
    돌릴 수 있다. session_id는 `/study/sessions`와 같은 `UserStudySession`(test_type='test')
    이라 `/study/log`가 그대로 처리한다(콤보는 test_type이 quick/chat일 때만 적립되므로
    글자 학습은 콤보에 영향을 주지 않는다).
    """
    from app.services.fsrs.state import (
        parse_user_voca_data, get_fsrs_state, is_v1, migrate_v1_to_v2,
    )
    from app.services.game.farm_v2 import growth, xp as xp_mod
    from app.routes.study import _serialize_recommend_item

    script = request.args.get('script')
    mode = request.args.get('mode', 'learn')
    try:
        _validate_script(script)
    except ValueError as e:
        return _bad_request(str(e))
    if mode not in ('learn', 'review'):
        return _bad_request('mode는 learn|review 중 하나여야 합니다.')

    user_id = UUID(g.user_id)
    lang = SCRIPT_LANG[script]

    book = _get_script_book(user_id, script)
    if book is None:
        return jsonify({'code': 200, 'data': {'session_id': None, 'items': []}}), 200
    _heal_script_games(user_id, book.id)

    base_q = (
        db.session.query(UserVoca, UserVocaGame)
        .join(UserVocaBookMap, UserVocaBookMap.user_voca_id == UserVoca.id)
        .outerjoin(UserVocaGame, UserVocaGame.user_voca_id == UserVoca.id)
        .filter(UserVocaBookMap.user_voca_book_id == book.id)
    )

    if mode == 'learn':
        chars_param = request.args.get('chars') or ''
        chars = [c for c in chars_param.split(',') if c]
        if not chars:
            return _bad_request('mode=learn 에는 chars 가 1개 이상 필요합니다.')
        if len(chars) > _MAX_SESSION_CHARS:
            return _bad_request(f'chars는 한 번에 최대 {_MAX_SESSION_CHARS}개까지 가능합니다.')
        # **SQL IN이 아니라 Python에서 정확히 매칭한다.** MySQL utf8mb4_unicode_ci는
        # 탁점(濁点) 차이를 무시한다(か == が, き == ぎ 등 — word_resolve.py의
        # lookup_voca_ja 주석과 동일 함정) — `UserVoca.word.in_(chars)`로 걸렀다면
        # 요청하지 않은 탁음 글자까지 함께 뽑혀 학습·심기됐을 것이다. 책 하나가 최대
        # 104자라 전체를 읽어 Python dict로 정확 매칭해도 비용이 작다.
        by_word = {}
        for uv, game in base_q.all():
            by_word.setdefault(uv.word, (uv, game))
        rows = [by_word[c] for c in chars if c in by_word]
        if not rows:
            return _bad_request('chars 중 이 스크립트에 속한 글자가 없습니다.')
    else:
        candidates = [
            (uv, game) for uv, game in base_q.all()
            if game is not None and game.visual_stage != VisualStage.UNPLANTED_SEED
        ]
        wrong_ids = _recent_wrong_user_voca_ids(user_id, [uv.id for uv, _g in candidates])

        def _priority(pair):
            uv, game = pair
            fsrs_state = growth.load_fsrs_state(uv)
            xp_val = xp_mod.xp_of(game.visual_stage, fsrs_state)
            wrong_first = 0 if uv.id in wrong_ids else 1
            return (xp_val, wrong_first, random.random())

        candidates.sort(key=_priority)
        rows = candidates[:_DEFAULT_REVIEW_LIMIT]

    if not rows:
        return jsonify({'code': 200, 'data': {'session_id': None, 'items': []}}), 200

    session = UserStudySession(
        user_id=user_id, test_type='test',
        book_ids=json.dumps([str(book.id)], ensure_ascii=False),
    )
    try:
        db.session.add(session)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return _fail('글자 학습 세션 생성')

    items = []
    for uv, _game in rows:
        payload = parse_user_voca_data(uv.data)
        if is_v1(payload):
            payload = migrate_v1_to_v2(payload)
        fsrs_state = get_fsrs_state(payload) or {}

        item = _ScriptSessionItem(uv, book.id, fsrs_state)
        items.append(_serialize_recommend_item(
            item,
            suggested_question_type='multipleChoice',
            tier_target=None, tier_shown=None,
            reason='script', priority_bucket='script',
            lang=lang, ja_info={}, ja_tokens={},
        ))

    # 복습 응용 문제(조합 단어 읽기·듣고 고르기)용 실제 단어 — 복습에서만 내려준다.
    words = []
    if mode == 'review':
        learned_chars = [
            uv.word for uv, game in base_q.all()
            if game is not None and game.visual_stage != VisualStage.UNPLANTED_SEED
        ]
        words = _script_word_bank(script, learned_chars, [uv.word for uv, _g in rows])

    return jsonify({
        'code': 200,
        'data': {'session_id': str(session.id), 'items': items, 'words': words},
    }), 200
