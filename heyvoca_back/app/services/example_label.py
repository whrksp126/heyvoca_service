"""
example_label.py — 예문 라벨 v2(난이도 cefr/score + 문법 태그) 계산 규칙 단일 소스 (이슈 #16).

정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §1
채우는 job: jobs/label_examples_v2.py (영어 voca_example_meta / 일본어 voca_example_ja_meta)

점수(0~100)는 문장 맥락만 본다 — 목표 단어 구간은 빼고(목표 단어는 FSRS 가 따로 다룬다):
  기본점 + 내용어 등급(1=A1 … 6=C2) 분위수·최고 등급 초과분 + 희귀어 수 + 기준 길이 초과분 + 문법 태그 가중치.
  언어별 계수는 COMPOSE(2026-10-25 사람 판정 표본으로 보정).
구간(A1 0–19 / A2 20–34 / B1 35–54 / B2 55–74 / C1 75–89 / C2 90–100)은 skill_level.score_to_cefr 와 같다.
"""

import math
import re
from typing import Dict, List, Optional, Sequence, Tuple

from app.services.skill_level import score_to_cefr

LABEL_VER = 2

# 합성 파라미터(언어별) — 2026-10-25 사람 판정 표본(언어별 180문장, 구간별 30)으로 보정.
#   b0: 기본점(문장이면 A1 끝자락에서 시작 — 사람 판정에서 A1 은 아주 짧은 기초 문장뿐이었다)
#   q: 내용어 등급 분위수, lex: (분위수 등급−1)당 점수, over: 최고 등급 초과분 1등급당,
#   rare: C1 이상 내용어 1개당(rare_cap 까지), len: 기준 길이 초과 1개당(len_cap 까지),
#   gram: 문법 가중치 합에 곱하는 비율(gram_cap 까지)
# 처음 값(b0 0·lex 15·rare 4·gram 1.0/20)은 어휘 한 단계가 구간 하나를 넘겨 B2 문장이 C2 로 갔다
# (표본 정확 일치 en 27%·ja 26% → 보정 후 en 63%·ja 63%, 인접 포함 99%·97%).
COMPOSE = {
    'en': dict(b0=18.0, q=0.7, lex=7.0, over=3.0, rare=0.0, rare_cap=0.0, base_len=6, len=1.5, len_cap=25.0,
               gram=0.4, gram_cap=10.0),
    'ja': dict(b0=17.0, q=0.7, lex=7.0, over=3.0, rare=2.0, rare_cap=8.0, base_len=8, len=2.0, len_cap=25.0,
               gram=0.6, gram_cap=10.0),
}

# ── 영어 ────────────────────────────────────────────────────────────────
CEFR_RANK = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6}

EN_GRAMMAR_WEIGHT = {
    'present_simple': 0, 'past_simple': 1, 'negation': 1, 'question': 1, 'imperative': 0,
    'progressive': 2, 'future': 2, 'modal': 3, 'comparative': 3, 'gerund_inf': 3,
    'subordinate': 4, 'conditional': 5, 'perfect': 6, 'passive': 6, 'relative_clause': 6,
    'perfect_progressive': 4,   # perfect 에 더해 가산
}


def zipf_to_rank(zipf: Optional[float]) -> int:
    """워드리스트에 없는 단어의 등급 추정. 추정만으로는 C2(6)를 주지 않는다 —
    파생어·복합어(hiker, website)가 빈도만 낮아 C2 로 잡히는 일이 많았다."""
    if zipf is None:
        return 5
    if zipf >= 5.3:
        return 1
    if zipf >= 4.7:
        return 2
    if zipf >= 4.0:
        return 3
    if zipf >= 3.3:
        return 4
    return 5


# 파생어 → 어근(워드리스트 등급을 빌려 온다). 접두어가 붙으면 +1.
_EN_SUFFIXES = ('ers', 'er', 'ings', 'ing', 'ed', 'ly', 'ness', 'ment', 'ful', 'less', 'able', 's')
_EN_PREFIXES = ('un', 're', 'dis', 'mis', 'over', 'pre', 'non')


def en_word_rank(lemma: str, text: str, rank_lookup: Dict[str, int], zipf_lookup: Dict[str, float]) -> int:
    r = rank_lookup.get(lemma) or rank_lookup.get(text)
    if r:
        return r
    cands = []
    for w in {lemma, text}:
        for suf in _EN_SUFFIXES:
            if w.endswith(suf) and len(w) - len(suf) >= 3:
                root = w[:-len(suf)]
                for x in (root, root + 'e', root[:-1] if len(root) > 3 and root[-1] == root[-2] else None,
                          root[:-1] + 'y' if root.endswith('i') else None):
                    if x and rank_lookup.get(x):
                        cands.append(rank_lookup[x])
        for pre in _EN_PREFIXES:
            if w.startswith(pre) and len(w) - len(pre) >= 4:
                root = w[len(pre):]
                rr = rank_lookup.get(root)
                if rr is None:
                    for suf in ('ed', 'ing', 's', 'ly', 'able'):
                        if root.endswith(suf) and rank_lookup.get(root[:-len(suf)]):
                            rr = rank_lookup[root[:-len(suf)]]
                            break
                if rr:
                    cands.append(min(6, rr + 1))
    if cands:
        return min(cands)
    return zipf_to_rank(zipf_lookup.get(lemma) or zipf_lookup.get(text))


def _quantile(vals: Sequence[int], q: float) -> float:
    s = sorted(vals)
    if not s:
        return 0.0
    k = (len(s) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def compose_score(ranks: Sequence[int], length: int, grammar: Sequence[str],
                  weights: Dict[str, int], lang: str = 'en') -> int:
    """내용어 등급 리스트·길이·문법 태그 → 0~100 점수."""
    c = COMPOSE[lang]
    score = c['b0']
    if ranks:
        pq = _quantile(ranks, c['q'])
        score += (pq - 1) * c['lex']
        score += max(0.0, max(ranks) - pq) * c['over']
        score += min(c['rare_cap'], sum(1 for r in ranks if r >= 5) * c['rare'])
    score += min(c['len_cap'], max(0, length - c['base_len']) * c['len'])
    score += min(c['gram_cap'], c['gram'] * float(sum(weights.get(g, 0) for g in grammar)))
    return int(round(max(0.0, min(100.0, score))))


def en_grammar_tags(doc) -> List[str]:
    """spaCy Doc → 문법 태그(정렬된 distinct 리스트)."""
    tags = set()
    text = doc.text.strip()
    if text.endswith('?'):
        tags.add('question')
    for t in doc:
        dep, tag, lemma = t.dep_, t.tag_, t.lemma_.lower()
        if dep in ('auxpass', 'nsubjpass'):
            tags.add('passive')
        if dep == 'relcl':
            tags.add('relative_clause')
        if dep == 'neg':
            tags.add('negation')
        if dep == 'mark' and lemma in ('if', 'unless'):
            tags.add('conditional')
        elif dep == 'advcl' or (dep == 'mark' and lemma not in ('that',)):
            tags.add('subordinate')
        if tag == 'MD':
            tags.add('future' if lemma in ('will', 'shall') else 'modal')
        if tag in ('JJR', 'RBR', 'JJS', 'RBS'):
            tags.add('comparative')
        if dep == 'xcomp' or (tag == 'VBG' and dep in ('pcomp', 'csubj', 'dobj', 'nsubj')):
            tags.add('gerund_inf')
        if dep == 'aux' and lemma == 'have' and t.head.tag_ == 'VBN':
            tags.add('perfect')
        if dep == 'aux' and lemma == 'be' and t.head.tag_ == 'VBG':
            tags.add('progressive')
            if any(c.dep_ == 'aux' and c.lemma_.lower() == 'have' for c in t.head.children):
                tags.add('perfect_progressive')
    root = next((t for t in doc if t.dep_ == 'ROOT'), None)
    if root is not None and root.pos_ in ('VERB', 'AUX'):
        has_aux = any(c.dep_ in ('aux', 'auxpass') for c in root.children)
        has_subj = any(c.dep_ in ('nsubj', 'nsubjpass', 'expl') for c in root.children)
        if root.tag_ == 'VBD' and not has_aux:
            tags.add('past_simple')
        elif root.tag_ in ('VBZ', 'VBP') and not has_aux:
            tags.add('present_simple')
        elif root.tag_ == 'VB' and not has_subj and not has_aux:
            tags.add('imperative')
    return sorted(tags)


def en_features(doc, target_span: Tuple[Optional[int], Optional[int]],
                rank_lookup: Dict[str, int], zipf_lookup: Dict[str, float]) -> List[int]:
    """목표 단어 구간·기능어·고유명사·숫자를 뺀 내용어 등급 리스트."""
    t_start, t_end = target_span
    ranks = []
    for token in doc:
        if t_start is not None and t_start <= token.idx < t_end:
            continue
        if not token.is_alpha or token.is_stop or token.like_num or token.pos_ == 'PROPN':
            continue
        ranks.append(en_word_rank(token.lemma_.lower(), token.text.lower(), rank_lookup, zipf_lookup))
    return ranks


def label_en(doc, target_span: Tuple[Optional[int], Optional[int]], word_count: int,
             rank_lookup: Dict[str, int], zipf_lookup: Dict[str, float]) -> dict:
    """영어 예문 라벨. rank_lookup: 소문자 원형 → 등급(워드리스트/voca_label.cefr)."""
    ranks = en_features(doc, target_span, rank_lookup, zipf_lookup)
    grammar = en_grammar_tags(doc)
    score = compose_score(ranks, word_count, grammar, EN_GRAMMAR_WEIGHT, 'en')
    return {'cefr': score_to_cefr(score), 'score': score, 'grammar': grammar, '_ranks': ranks}


# ── 일본어 ──────────────────────────────────────────────────────────────
# JLPT → 등급(계약 §1: N5≈A1 … N1≈C1). JLPT 표시가 없는 단어(사전의 2/3 — 顔·東京·アプリ 같은 기초어도
# 포함)는 우리 예문 코퍼스 문서빈도로 추정한다(ja_df_rank). 빈도 자료·형태소 분석기가 없어서 쓰는 대용품.
JLPT_RANK = {'N5': 1, 'N4': 2, 'N3': 3, 'N2': 4, 'N1': 5}
# 문서빈도(전체 예문 중 그 표제어가 목표 단어 밖에서 나온 예문 수) → 등급. 2026-10 로컬 5.4만 문장 기준.
_JA_DF_STEPS = ((60, 1), (20, 2), (8, 3), (3, 4))

JA_GRAMMAR_WEIGHT = {
    'polite': 0, 'past': 1, 'nai_form': 2, 'te_form': 2, 'question': 1,
    'te_iru': 3, 'desire_tai': 2, 'volitional': 3, 'comparative': 3, 'quotation': 4,
    'giving_receiving': 4, 'conditional': 5, 'obligation': 5, 'passive_potential': 6,
    'causative': 7, 'keigo': 8,
}

# 조사·조동사·형식어 등 기능 토큰(등급 계산에서 뺀다). 리딩 토큰이 형태소 단위라 표층 그대로 비교.
JA_FUNCTION_TOKENS = frozenset("""
は が を に で と も の へ や か ね よ な わ ぞ さ から まで より ほど だけ しか ばかり など なら
ば たら て で た だ です ます まし ませ ん ない なかっ なく う よう たい たかっ れる られる れ られ せる させる
せ させ い いる い る ある あっ あり いま いた ござい でし だっ でしょ だろ じゃ ので のに けど けれど が
し つ こと もの ところ ほう そう よう みたい らしい くれ あげ もらい もらう くださ ください お ご
これ それ あれ この その あの ここ そこ あそこ どこ だれ 誰 何 なに なん どう こう そう ああ
私 僕 俺 あなた 彼 彼女 君 今 一 二 三 十 人 日 年 時 分 する し さ れ ・
だろう でしょう だろ でしょ って という じゃ じゃない よね かな かも わけ はず べき つもり
ましょう ましょ なさい ながら まま さえ なんて たち 達 ら ども がた 的 者 員 社 館 機 省 署 性 化 式 製 用 中 後 前 間
さん 様 ちゃん くん 新 準 未 不 非 無 大 小 超 約 各 第 等 ごと ずつ について によって により による として として
とか なんか しまう しまっ しまい ちゃう ちゃっ じゃう みる み いく いっ くる き こ ほしい
""".split())
_JA_SKIP_RE = re.compile(r'[0-9０-９A-Za-zＡ-Ｚａ-ｚ%％]')   # 숫자·로마자·기호가 섞인 토큰

_JA_PUNCT_RE = re.compile(r'^[\s、。，．！？!?「」『』（）()・…ー〜~,.\-"\'：:；;]+$')
_KANA_RE = re.compile(r'^[぀-ゟ]+$')
_KATA_RE = re.compile(r'^[゠-ヿー]+$')
_I_TO_U = dict(zip('いきぎしちにびみり', 'うくぐすつぬぶむる'))
_A_TO_U = dict(zip('わかがさたなばまら', 'うくぐすつぬぶむる'))   # ない·受身·使役 어간(覆わ→覆う)
_E_TO_U = dict(zip('えけげせてねべめれ', 'うくぐすつぬぶむる'))   # 가능·ば 어간(読め→読む)


def ja_lemma_candidates(surface: str) -> List[str]:
    """활용형 표층 → 사전형 후보(어간+る/う행, 형용사 어간+い, ます형 い단→う단)."""
    out = [surface]
    if not surface:
        return out
    out += [surface + 'る', surface + 'い', surface + 'う', surface + 'く', surface + 'す',
            surface + 'つ', surface + 'む', surface + 'ぶ', surface + 'ぐ', surface + 'ぬ']
    last = surface[-1]
    for table in (_I_TO_U, _A_TO_U, _E_TO_U):
        if last in table and len(surface) > 1:
            out.append(surface[:-1] + table[last])
    if last in 'っん' and len(surface) > 1:   # 促音便·撥音便(買っ→買う/走る/待つ, 読ん→読む/死ぬ/飛ぶ)
        out += [surface[:-1] + c for c in ('う', 'る', 'つ', 'む', 'ぬ', 'ぶ')]
    if last == 'い' and len(surface) > 1:     # イ音便(書い→書く, 泳い→泳ぐ)
        out += [surface[:-1] + 'く', surface[:-1] + 'ぐ']
    if last == 'く' and len(surface) > 1:     # 형용사 연용형(高く→高い)
        out.append(surface[:-1] + 'い')
    for end in ('かっ', 'かった', 'くて', 'ければ', 'くない', 'さ'):   # 형용사 과거·て형·명사형(白かっ→白い)
        if surface.endswith(end) and len(surface) > len(end):
            out.append(surface[:-len(end)] + 'い')
    if last == 'し' and len(surface) > 1:     # する동사(勉強し→勉強)
        out.append(surface[:-1])
    return out


def ja_grammar_tags(surfaces: Sequence[str]) -> List[str]:
    tags = set()
    joined = ''.join(surfaces)
    toks = list(surfaces)
    if joined.endswith(('?', '？', 'か。', 'か')):
        tags.add('question')
    if re.search(r'(ます|まし|ませ|です|でし|ござい)', joined):
        tags.add('polite')
    if any(t == 'た' or (t == 'だ' and i > 0 and toks[i - 1][-1:] in ('ん', 'い'))
           for i, t in enumerate(toks)) or 'でした' in joined or 'かった' in joined:
        tags.add('past')
    if re.search(r'(ない|なかっ|なく|ません)', joined):
        tags.add('nai_form')
    # て形: 'て' 토큰, 또는 음편(ん·い) 뒤 'で' — 조사 'で'(場所で)는 제외.
    te_idx = [i for i, t in enumerate(toks[:-1])
              if t == 'て' or (t == 'で' and i > 0 and toks[i - 1][-1:] in ('ん', 'い'))]
    if te_idx:
        tags.add('te_form')
    if any(toks[i + 1][:1] in ('い', 'お', 'る') or toks[i + 1].startswith('しま') for i in te_idx):
        tags.add('te_iru')
    if any(t in ('たい', 'たかっ', 'たく', 'たくない') for t in toks):
        tags.add('desire_tai')
    if 'ましょう' in joined or any(t in ('う', 'よう') and i > 0 and toks[i - 1] not in ('だろ', 'でしょ')
                                   and toks[i - 1][-1:] in 'おこごそとのぼもろよ' for i, t in enumerate(toks)):
        tags.add('volitional')
    if re.search(r'より|ほうが|方が|一番', joined):
        tags.add('comparative')
    if re.search(r'と(思|言|いう|考|聞)', joined) or any(t in ('って', 'という') for t in toks):
        tags.add('quotation')
    if re.search(r'て(あげ|くれ|もらい|もらう|もらっ|くださ|いただ)', joined):
        tags.add('giving_receiving')
    if any(t in ('ば', 'たら', 'なら', 'だら') for t in toks) or re.search(r'(たら|れば|なら)', joined):
        tags.add('conditional')
    if re.search(r'なければ|なくては|なきゃ|ないと(いけ|だめ|ダメ)', joined):
        tags.add('obligation')
    if any(t in ('れる', 'られる', 'れ', 'られ') for t in toks):
        tags.add('passive_potential')
    if any(t in ('せる', 'させる', 'させ') for t in toks) or re.search(r'させ', joined):
        tags.add('causative')
    if re.search(r'いらっしゃ|おっしゃ|召し上が|申し|参り|伺|拝見|存じ|お(.{1,4})になり|ござい', joined):
        tags.add('keigo')
    return sorted(tags)


def ja_df_rank(df: int) -> int:
    for floor, rank in _JA_DF_STEPS:
        if df >= floor:
            return rank
    return 5


def _target_skip(surfaces: Sequence[str], target_text: str) -> set:
    """표층을 이어 붙인 문자열에서 target_text 구간과 겹치는 토큰 번호."""
    skip = set()
    idx = ''.join(surfaces).find(target_text) if target_text else -1
    if idx >= 0:
        pos = 0
        for i, s_ in enumerate(surfaces):
            if pos < idx + len(target_text) and pos + len(s_) > idx:
                skip.add(i)
            pos += len(s_)
    return skip


def ja_match(surface: str, ja_lexicon: Dict[str, Tuple[Optional[int], str]]) -> Optional[Tuple[Optional[int], str]]:
    """표층 → (JLPT 등급|None, 표제어). 후보 중 가장 쉬운 표제어(활용형을 엉뚱한 희귀어로 잡는 것보다
    관대한 쪽이 낫다). JLPT 없는 표제어는 N3 정도로 보고 순서를 정한다."""
    hits = [ja_lexicon[c] for c in ja_lemma_candidates(surface) if c in ja_lexicon]
    if not hits:
        return None
    return min(hits, key=lambda h: (3.5 if h[0] is None else h[0]))


def ja_content_tokens(surfaces: Sequence[str], target_text: str) -> List[Tuple[int, str]]:
    """등급 계산 대상 토큰(목표 단어·기능어·문장부호·숫자/로마자 제외)."""
    skip = _target_skip(surfaces, target_text)
    return [(i, s) for i, s in enumerate(surfaces)
            if i not in skip and not _JA_PUNCT_RE.match(s) and s not in JA_FUNCTION_TOKENS
            and not _JA_SKIP_RE.search(s)]


def ja_lemma_df(token_rows, ja_lexicon) -> Dict[str, int]:
    """(surfaces, target_text) 반복자 → 표제어별 문서빈도(목표 단어 구간 밖에서 나온 예문 수)."""
    df: Dict[str, int] = {}
    for surfaces, target_text in token_rows:
        seen = set()
        for _i, s in ja_content_tokens(surfaces, target_text):
            hit = ja_match(s, ja_lexicon)
            if hit:
                seen.add(hit[1])
        for lemma in seen:
            df[lemma] = df.get(lemma, 0) + 1
    return df


def label_ja(tokens: Sequence[Sequence], target_text: str, ja_lexicon: Dict[str, Tuple[Optional[int], str]],
             lemma_df: Optional[Dict[str, int]] = None) -> dict:
    """일본어 예문 라벨.

    tokens: voca_example_ja.reading_tokens([[surface, reading|null, …], …])
    target_text: 목표 단어 표층(강조 태그 안) — 이 문자열을 이루는 토큰은 뺀다.
    ja_lexicon: 표기/읽기 → (JLPT 등급|None, 표제어 voca.word)
    lemma_df: ja_lemma_df 결과 — JLPT 없는 표제어의 등급 추정용(없으면 B2 로 본다)
    """
    surfaces = [str(t[0]) for t in tokens if t and t[0] is not None]
    content = [s for s in surfaces if not _JA_PUNCT_RE.match(s)]
    ranks, words, rare = [], [], 0
    for _i, s in ja_content_tokens(surfaces, target_text):
        hit = ja_match(s, ja_lexicon)
        if hit:
            r, lemma = hit
            if r is None:
                r = ja_df_rank((lemma_df or {}).get(lemma, 3))
            if lemma not in words:
                words.append(lemma)
        elif _KANA_RE.match(s) and len(s) <= 3:
            continue   # 사전에 없는 짧은 히라가나 = 활용 어미 조각일 가능성이 높다
        elif len(s) == 1:
            continue   # 사전에 없는 한 글자 = 접사(〜館·〜員)이거나 쪼개진 조각
        elif _KATA_RE.match(s):
            r = 3      # 사전에 없는 외래어·외국 이름
        else:
            r = 4
        if r >= 5:
            rare += 1
        ranks.append(r)
    grammar = ja_grammar_tags(surfaces)
    score = compose_score(ranks, len(content), grammar, JA_GRAMMAR_WEIGHT, 'ja')
    return {'cefr': score_to_cefr(score), 'score': score, 'grammar': grammar,
            'word_count': len(content), 'rare_count': rare, 'words': words, '_ranks': ranks}


def legacy_level(cefr: int) -> int:
    """기존 level(1~3) 호환값 — cefr 1–2→1, 3–4→2, 5–6→3."""
    return 1 if cefr <= 2 else (2 if cefr <= 4 else 3)
