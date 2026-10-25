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


def test_accepted_swaps_constituents_before_predicate():
    orders = SM.accepted_orders(['나는', '보통', '7시에', '아침을', '먹는다'])
    assert orders[0] == ['나는', '보통', '7시에', '아침을', '먹는다']
    assert all(o[-1] == '먹는다' for o in orders)
    assert len(orders) == 24                                  # 묶음 4개 → 4!
    assert all(sorted(o) == sorted(orders[0]) for o in orders)


def _ok(answer_ko, user_ko):
    """프론트 채점과 같은 방식: 사용자가 고른 어절 순서가 accepted 중 하나와 같은가."""
    head, tiles = SM.split_prefix(SM.ko_tiles(answer_ko))
    user = SM.ko_tiles(user_ko)
    assert user[:len(head)] == head
    return user[len(head):] in SM.accepted_orders(tiles)


def test_qa3_free_order_with_modifier_chunks():
    ans = '정전 동안 엘리베이터의 키패드가 작동을 멈췄다.'
    assert _ok(ans, '엘리베이터의 키패드가 정전 동안 작동을 멈췄다')    # QA 3차 오판 사례
    assert _ok(ans, '작동을 정전 동안 엘리베이터의 키패드가 멈췄다')
    assert _ok(ans, ans)
    # 서술어가 끝이 아님
    assert not _ok(ans, '정전 동안 엘리베이터의 키패드가 멈췄다 작동을')
    # 관형어(-의)가 꾸밈 대상과 떨어짐
    assert not _ok(ans, '엘리베이터의 정전 동안 키패드가 작동을 멈췄다')
    # 조사 없는 명사 + 후치 어절(정전 동안)이 떨어짐
    assert not _ok(ans, '정전 엘리베이터의 키패드가 동안 작동을 멈췄다')


def test_chunk_rules():
    _, mov, pred = SM.chunk_tiles(SM.ko_tiles('나는 공원에서 책을 읽고 있다'))
    assert pred == ['읽고', '있다'] and len(mov) == 3                 # 보조용언은 서술어 묶음
    _, mov, _ = SM.chunk_tiles(SM.ko_tiles('작동하는 기계를 그가 고쳤다'))
    assert ['작동하는', '기계를'] in mov                               # 관형형은 다음 어절과 한 묶음
    fixed, mov, _ = SM.chunk_tiles(SM.ko_tiles('밥을 먹고 학교에 갔다'))
    assert fixed == [['밥을'], ['먹고']] and mov == [['학교에']]        # 종속절은 순서 고정
    assert SM.accepted_orders(SM.ko_tiles('밥을 먹고 학교에 갔다')) == [SM.ko_tiles('밥을 먹고 학교에 갔다')]


def test_many_chunks_prefill_more():
    ko = '그는 내가 어제 산 책을 친구에게 빌려줬다'               # 7어절이지만 묶음 5개 → 앞 묶음 미리 채움
    head, tiles = SM.split_prefix(SM.ko_tiles(ko))
    assert head == ['그는'] and len(SM.accepted_orders(tiles)) <= 24


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


def test_translate_quota_farm_is_real_question():
    from app.services.recommend import composer as C
    from app.constants.question_types import QUESTION_TYPE_TIER
    assert QUESTION_TYPE_TIER['sentenceTranslate'] == 3
    enriched = [{'_item': _translate_item(i, 1.0), 'suggested_question_type': 'multipleChoice',
                 'tier_target': 1, 'tier_shown': 1} for i in range(10)]
    enriched[0]['suggested_question_type'] = 'cardMatch'
    C._apply_translate_quota(enriched, full_recommend=True)
    swapped = [e for e in enriched if e['suggested_question_type'] == 'sentenceTranslate']
    assert len(swapped) == 2
    # 실전 문제 — tier 진행에 반영(tier_target 유지, tier_shown = 이 유형의 tier)
    assert all(e['tier_target'] == 1 and e['tier_shown'] == 3 for e in swapped)
    assert enriched[0]['suggested_question_type'] == 'cardMatch'                      # 세트형은 안 바꿈
    # 그 밖 경로(자유 설정 테스트 등)는 몫을 보장하지 않는다
    free = [{'_item': _translate_item(i, 1.0), 'suggested_question_type': 'multipleChoice',
             'tier_target': None, 'tier_shown': None} for i in range(10)]
    C._apply_translate_quota(free, full_recommend=False)
    assert all(e['suggested_question_type'] == 'multipleChoice' for e in free)


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
