"""
user_skill_profile 백필 — 기존 user_study_log 를 시간순으로 재생해 θ·유형별·실수 유형별 집계를 만든다(이슈 #16).

정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §2, 규칙: app/services/skill_level.py

멱등 — 매번 초기 θ(가입 수준)에서 처음부터 다시 계산해 (user_id, lang) 행을 덮어쓴다.
b: 로그의 example_hash → 예문 score, 없으면 voca_id → 단어 등급 대표값(사전 언어별).
실수 유형은 과거 로그에 없으므로 '보기 고르기형 오답 = wrong_choice' 만 센다.

사용법(컨테이너 안):
  docker exec heyvoca_back_local python3 jobs/backfill_skill_profile.py            # dry-run(요약만)
  docker exec heyvoca_back_local python3 jobs/backfill_skill_profile.py --apply
  docker exec heyvoca_back_local python3 jobs/backfill_skill_profile.py --apply --user-id <uuid>
"""

import argparse
import os
import sys
from collections import defaultdict
from uuid import UUID

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app, db
from app.models.models import (
    User, UserStudyLog, UserSkillProfile, VocaExampleMeta, VocaExampleJaMeta, VocaLabel, VocaJa,
)
from app.services import skill_level as S
from app.utils.dict_lang import use_dict_lang

_CHOICE = ('multipleChoice', 'reverseMultipleChoice', 'multipleChoiceListening',
           'fillInTheBlank', 'cardMatch', 'cardMatchListening')


def _lookups(lang):
    """(hash → score, voca_id → 단어 점수) — 해당 언어 사전에서 한 번에."""
    if lang == 'ja':
        ex = dict(db.session.query(VocaExampleJaMeta.sentence_hash, VocaExampleJaMeta.score)
                  .filter(VocaExampleJaMeta.sentence_hash.isnot(None)).all())
        words = {vid: S.word_rank_score(S.JLPT_RANK.get(j or '', 6))
                 for vid, j in db.session.query(VocaJa.voca_id, VocaJa.jlpt).all()}
    else:
        ex = dict(db.session.query(VocaExampleMeta.sentence_hash, VocaExampleMeta.score)
                  .filter(VocaExampleMeta.sentence_hash.isnot(None), VocaExampleMeta.score.isnot(None)).all())
        words = {vid: S.word_rank_score(S.CEFR_NAMES.index(c) + 1)
                 for vid, c in db.session.query(VocaLabel.voca_id, VocaLabel.cefr).all() if c in S.CEFR_NAMES}
    db.session.expunge_all()
    return ex, words


def run(apply, user_id=None):
    lookups = {}
    for lang in ('en', 'ja'):
        with use_dict_lang(lang):
            lookups[lang] = _lookups(lang)
        print(f'[{lang}] 예문 score {len(lookups[lang][0])}개 / 단어 점수 {len(lookups[lang][1])}개')

    q = (db.session.query(UserStudyLog.user_id, UserStudyLog.dict_lang, UserStudyLog.question_type,
                          UserStudyLog.was_correct, UserStudyLog.example_hash, UserStudyLog.voca_id)
         .filter(UserStudyLog.dict_lang.in_(('en', 'ja'))))
    if user_id:
        q = q.filter(UserStudyLog.user_id == UUID(user_id))
    q = q.order_by(UserStudyLog.user_id, UserStudyLog.dict_lang, UserStudyLog.created_at, UserStudyLog.id)

    level_ids = dict(db.session.query(User.id, User.level_id).all())
    profiles = {}
    n_logs = 0
    for uid, lang, qt, ok, h, vid in q.yield_per(5000):
        if not S.counts_for_skill(qt):
            continue
        n_logs += 1
        key = (uid, lang)
        prof = profiles.get(key)
        if prof is None:
            prof = profiles[key] = {'theta': S.initial_theta(level_ids.get(uid)), 'answers': 0,
                                    'type_stats': {}, 'error_stats': {}}
        ex_scores, word_scores = lookups[lang]
        b = ex_scores.get(h) if h else None
        if b is None and vid is not None:
            b = word_scores.get(vid)
        err = 'wrong_choice' if (not ok and qt in _CHOICE) else None
        profiles[key] = S.apply_answer(prof, question_type=qt, was_correct=bool(ok), item_score=b, error_type=err)

    print(f'로그 {n_logs}건 → 프로필 {len(profiles)}개')
    dist = defaultdict(int)
    for p in profiles.values():
        dist[S.cefr_name(S.score_to_cefr(p['theta']))] += 1
    print('θ 구간 분포:', dict(sorted(dist.items())))
    if not apply:
        print('[dry-run] DB 변경 없음 — --apply 로 반영')
        return
    eq = db.session.query(UserSkillProfile)
    if user_id:
        eq = eq.filter(UserSkillProfile.user_id == UUID(user_id))
    existing = {(r.user_id, r.lang): r for r in eq.all()}
    # 재생할 로그가 없어진 프로필(글자 학습만 한 사용자 등)은 지운다 — 다시 돌려도 같은 결과(멱등).
    for key, row in existing.items():
        if key not in profiles:
            db.session.delete(row)
    for (uid, lang), p in profiles.items():
        row = existing.get((uid, lang))
        if row is None:
            row = UserSkillProfile(user_id=uid, lang=lang)
            db.session.add(row)
        row.theta, row.answers = p['theta'], p['answers']
        row.type_stats, row.error_stats = p['type_stats'], p['error_stats']
    db.session.commit()
    print(f'반영 {len(profiles)}개')


def main():
    ap = argparse.ArgumentParser(description='user_skill_profile 백필(dry-run 기본)')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--user-id', default=None)
    args = ap.parse_args()
    app = create_app()
    with app.app_context():
        run(args.apply, args.user_id)


if __name__ == '__main__':
    main()
