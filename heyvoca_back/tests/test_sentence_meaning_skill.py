"""이슈 #16 — 문장 뜻 맞추기 payload·사용자 수준(θ) 순수 함수 테스트."""
import random

from app.services import sentence_meaning as SM
from app.services import skill_level as S
from app.services.example_label import compose_score, ja_lemma_candidates, legacy_level


def _ex(origin, meaning, score=20):
    return {'origin': origin, 'meaning': meaning, 'hash': 'h' * 64, 'meta': {'score': score, 'cefr': 2}}


def test_tiles_and_usable():
    assert SM.ko_tiles('나는 <strong class="target-word">보통</strong> 7시에 아침을 먹는다.') == \
        ['나는', '보통', '7시에', '아침을', '먹는다']
    assert SM.meaning_usable(_ex('Hi there.', '안녕 친구'))
    assert not SM.meaning_usable(_ex('x', '한어절'))
    assert SM.meaning_usable(_ex('x', ' '.join(['가'] * 9)))      # 9~12어절은 앞부분 미리 채움
    assert not SM.meaning_usable(_ex('x', ' '.join(['가'] * 13)))


def test_long_translation_prefills_head():
    ko = '어제 저녁 우리 가족은 오랜만에 다 같이 근처 식당에서 맛있는 밥을 먹었다.'
    p = SM.build_meaning_payload(_ex('We ate dinner.', ko), lang='en', distractor_pool=[], rng=random.Random(0))
    tiles = SM.ko_tiles(ko)
    assert len(tiles) == 12
    assert p['prefix'] == ' '.join(tiles[:4])
    assert all(len(o) == SM.MAX_TILES for o in p['accepted'])
    assert p['accepted'][0] == tiles[4:]
    assert p['translation'].startswith('어제 저녁')


def test_accepted_swaps_only_josa_constituents_before_predicate():
    orders = SM.accepted_orders(['나는', '보통', '7시에', '아침을', '먹는다'])
    assert orders[0] == ['나는', '보통', '7시에', '아침을', '먹는다']
    assert all(o[-1] == '먹는다' for o in orders)
    assert 1 < len(orders) <= SM.MAX_ACCEPTED
    assert all(sorted(o) == sorted(orders[0]) for o in orders)


def test_distractors_never_share_stem_with_answer():
    answer = ['나는', '사과를', '먹었다']
    pool = [(20, '나도 사과가 좋아 먹었다'), (22, '그는 학교에 갔다 친구와')]
    out = SM.pick_distractors(answer, pool, 20, 4, random.Random(1))
    assert out and not any(SM._conflicts(d, answer) for d in out)


def test_payload_shape():
    p = SM.build_meaning_payload(_ex('I need new <strong class="target-word">socks</strong>.', '새 양말이 필요해.'),
                                 lang='en', distractor_pool=[(10, '그는 학교에 갔다')], rng=random.Random(0))
    assert p['type'] == 'sentenceTranslate' and p['sentence'] == 'I need new socks.'
    assert p['sentence_html'] == 'I need new <b>socks</b>.'
    texts = [t['text'] for t in p['tiles']]
    for w in p['accepted'][0]:
        assert w in texts
    assert p['translation'] == '새 양말이 필요해.'
    assert p['prefix'] == ''


def _translate_item(uid, stage_stability, ko='나는 보통 아침을 먹는다'):
    from app.services.recommend.pool import CandidateItem
    return CandidateItem(
        user_voca_id=uid, user_voca_book_id=None, word=f'w{uid}', meanings=['뜻'], examples=[],
        fsrs_state={'state': 'review', 'stability': stage_stability, 'retrievability': 0.9, 'next_review': None},
        bucket='review', word_length=3,
        example_pool=[{'origin': 'I eat.', 'meaning': ko, 'hash': f'{uid:064d}', 'meta': None}],
    )


def test_translate_quota_farm_and_free_test():
    from app.services.recommend import composer as C
    enriched = [{'_item': _translate_item(i, 1.0), 'suggested_question_type': 'multipleChoice',
                 'tier_target': 1, 'tier_shown': 1} for i in range(10)]
    enriched[0]['suggested_question_type'] = 'cardMatch'
    C._apply_translate_quota(enriched, full_recommend=True, allowed_types=None)
    swapped = [e for e in enriched if e['suggested_question_type'] == 'sentenceTranslate']
    assert len(swapped) == 2
    assert all(e['tier_target'] is None and e['tier_shown'] is None for e in swapped)  # tier 진행 영향 없음
    assert enriched[0]['suggested_question_type'] == 'cardMatch'                      # 세트형은 안 바꿈

    free = [{'_item': _translate_item(i, 1.0), 'suggested_question_type': 'multipleChoice',
             'tier_target': None, 'tier_shown': None} for i in range(10)]
    C._apply_translate_quota(free, full_recommend=False, allowed_types=['multipleChoice', 'sentenceTranslate'])
    assert sum(e['suggested_question_type'] == 'sentenceTranslate' for e in free) == 5
    # 칩에 없으면 손대지 않음
    other = [{'_item': _translate_item(i, 1.0), 'suggested_question_type': 'multipleChoice'} for i in range(4)]
    C._apply_translate_quota(other, full_recommend=False, allowed_types=['multipleChoice'])
    assert all(e['suggested_question_type'] == 'multipleChoice' for e in other)


def test_elo_moves_toward_result_and_target_is_p80():
    prof = {'theta': 30.0, 'answers': 0}
    up = S.apply_answer(prof, question_type='sentenceTranslate', was_correct=True, item_score=40)
    down = S.apply_answer(prof, question_type='sentenceTranslate', was_correct=False, item_score=40)
    assert up['theta'] > 30 > down['theta'] and up['answers'] == 1
    assert up['type_stats']['sentenceTranslate']['n'] == 1
    t = S.target_score_for(50, 'fillInTheBlank')
    assert abs(S.p_correct(50, t + S.QUESTION_TYPE_B_OFFSET['fillInTheBlank']) - 0.8) < 1e-6
    # 보정치 없는 유형·b 없음은 θ 불변, 집계만
    same = S.apply_answer(prof, question_type='scriptTrace', was_correct=True, item_score=40)
    assert same['theta'] == 30.0 and same['answers'] == 0
    assert not S.counts_for_skill('scriptTrace') and S.counts_for_skill('multipleChoice')


def test_bands_and_label_helpers():
    assert [S.score_to_cefr(x) for x in (0, 19, 20, 34, 35, 55, 75, 90, 100)] == [1, 1, 2, 2, 3, 4, 5, 6, 6]
    assert [legacy_level(c) for c in range(1, 7)] == [1, 1, 2, 2, 3, 3]
    assert compose_score([], 3, 6, [], {}) == 0
    assert compose_score([6, 6, 6], 30, 6, ['passive'], {'passive': 6}) > 90
    assert '書く' in ja_lemma_candidates('書き') and '覆う' in ja_lemma_candidates('覆わ')
