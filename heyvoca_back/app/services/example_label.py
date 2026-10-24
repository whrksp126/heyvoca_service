"""
example_label.py — 예문 라벨 v2(난이도 cefr/score + 문법 태그) 계산 규칙 단일 소스 (이슈 #16).

정본: heyvoca_service/docs/LEVEL_AND_MEANING_CONTRACT.md §1
채우는 job: jobs/label_examples_v2.py (영어 voca_example_meta / 일본어 voca_example_ja_meta)

점수(0~100)는 문장 맥락만 본다 — 목표 단어 구간은 빼고(목표 단어는 FSRS 가 따로 다룬다):
  어휘   : 내용어 등급(1=A1 … 6=C2)의 상위 80% 분위수 → (r-1)*15, 최고 등급이 그보다 높으면 +3/등급
  희귀어 : C1 이상 내용어 1개당 +4 (최대 12)
  길이   : 기준 길이(en 6단어, ja 8토큰) 초과 1개당 +1.5 (최대 18)
  문법   : 태그 가중치 합(최대 20)
구간(A1 0–19 / A2 20–34 / B1 35–54 / B2 55–74 / C1 75–89 / C2 90–100)은 skill_level.score_to_cefr 와 같다.
"""

import math
import re
from typing import Dict, List, Optional, Sequence, Tuple

from app.services.skill_level import score_to_cefr

LABEL_VER = 2

_LEX_STEP = 15.0
_MAX_OVER_STEP = 3.0
_RARE_STEP, _RARE_CAP = 4.0, 12.0
_LEN_STEP, _LEN_CAP = 1.5, 18.0
_GRAMMAR_CAP = 20.0

# ── 영어 ────────────────────────────────────────────────────────────────
CEFR_RANK = {'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6}

EN_GRAMMAR_WEIGHT = {
    'present_simple': 0, 'past_simple': 1, 'negation': 1, 'question': 1, 'imperative': 0,
    'progressive': 2, 'future': 2, 'modal': 3, 'comparative': 3, 'gerund_inf': 3,
    'subordinate': 4, 'conditional': 5, 'perfect': 6, 'passive': 6, 'relative_clause': 6,
    'perfect_progressive': 4,   # perfect 에 더해 가산
}
_EN_BASE_LEN = 6


def zipf_to_rank(zipf: Optional[float]) -> int:
    """워드리스트에 없는 단어의 등급 추정(voca_label.cefr_source=freq-est 와 같은 방향)."""
    if zipf is None:
        return 5
    if zipf >= 5.5:
        return 1
    if zipf >= 5.0:
        return 2
    if zipf >= 4.3:
        return 3
    if zipf >= 3.7:
        return 4
    if zipf >= 3.0:
        return 5
    return 6


def _quantile(vals: Sequence[int], q: float) -> float:
    s = sorted(vals)
    if not s:
        return 0.0
    k = (len(s) - 1) * q
    lo, hi = math.floor(k), math.ceil(k)
    return s[lo] + (s[hi] - s[lo]) * (k - lo)


def compose_score(ranks: Sequence[int], length: int, base_len: int,
                  grammar: Sequence[str], weights: Dict[str, int]) -> int:
    """내용어 등급 리스트·길이·문법 태그 → 0~100 점수."""
    score = 0.0
    if ranks:
        p80 = _quantile(ranks, 0.8)
        score += (p80 - 1) * _LEX_STEP
        score += max(0.0, max(ranks) - p80) * _MAX_OVER_STEP
        score += min(_RARE_CAP, sum(1 for r in ranks if r >= 5) * _RARE_STEP)
    score += min(_LEN_CAP, max(0, length - base_len) * _LEN_STEP)
    score += min(_GRAMMAR_CAP, float(sum(weights.get(g, 0) for g in grammar)))
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


def label_en(doc, target_span: Tuple[Optional[int], Optional[int]], word_count: int,
             rank_lookup: Dict[str, int], zipf_lookup: Dict[str, float]) -> dict:
    """영어 예문 라벨. rank_lookup: 소문자 원형 → 등급(워드리스트/voca_label.cefr)."""
    t_start, t_end = target_span
    ranks = []
    for token in doc:
        if t_start is not None and t_start <= token.idx < t_end:
            continue
        if not token.is_alpha or token.is_stop or token.pos_ == 'PROPN':
            continue
        lemma = token.lemma_.lower()
        r = rank_lookup.get(lemma) or rank_lookup.get(token.text.lower())
        if r is None:
            r = zipf_to_rank(zipf_lookup.get(lemma))
        ranks.append(r)
    grammar = en_grammar_tags(doc)
    score = compose_score(ranks, word_count, _EN_BASE_LEN, grammar, EN_GRAMMAR_WEIGHT)
    return {'cefr': score_to_cefr(score), 'score': score, 'grammar': grammar}


# ── 일본어 ──────────────────────────────────────────────────────────────
# JLPT → 등급(계약 §1: N5≈A1 … N1≈C1, 밖≈C2)
JLPT_RANK = {'N5': 1, 'N4': 2, 'N3': 3, 'N2': 4, 'N1': 5}
_JA_BASE_LEN = 8

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
""".split())

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


def label_ja(tokens: Sequence[Sequence], target_text: str, ja_lexicon: Dict[str, Tuple[int, str]]) -> dict:
    """일본어 예문 라벨.

    tokens: voca_example_ja.reading_tokens([[surface, reading|null, …], …])
    target_text: 목표 단어 표층(강조 태그 안) — 이 문자열을 이루는 토큰은 뺀다.
    ja_lexicon: 표기/읽기 → (등급, 표제어 voca.word)
    """
    surfaces = [str(t[0]) for t in tokens if t and t[0] is not None]
    content = [s for s in surfaces if not _JA_PUNCT_RE.match(s)]
    # 목표 단어 구간 제외 — 표층을 이어 붙인 문자열에서 target_text 구간과 겹치는 토큰.
    skip = set()
    joined = ''.join(surfaces)
    idx = joined.find(target_text) if target_text else -1
    if idx >= 0:
        pos = 0
        for i, s_ in enumerate(surfaces):
            if pos < idx + len(target_text) and pos + len(s_) > idx:
                skip.add(i)
            pos += len(s_)
    ranks, words, rare = [], [], 0
    for i, s in enumerate(surfaces):
        if i in skip or _JA_PUNCT_RE.match(s) or s in JA_FUNCTION_TOKENS:
            continue
        # 후보 중 가장 쉬운 표제어(활용형을 엉뚱한 희귀어로 잡는 것보다 관대한 쪽이 낫다)
        hits = [ja_lexicon[c] for c in ja_lemma_candidates(s) if c in ja_lexicon]
        hit = min(hits) if hits else None
        if hit:
            r, lemma = hit
            if lemma not in words:
                words.append(lemma)
        elif _KANA_RE.match(s) and len(s) <= 3:
            continue   # 사전에 없는 짧은 히라가나 = 활용 어미 조각일 가능성이 높다
        elif _KATA_RE.match(s):
            r = 4      # 사전에 없는 외래어
        elif s.isdigit():
            continue
        else:
            r = 5
        if r >= 5:
            rare += 1
        ranks.append(r)
    grammar = ja_grammar_tags(surfaces)
    score = compose_score(ranks, len(content), _JA_BASE_LEN, grammar, JA_GRAMMAR_WEIGHT)
    return {'cefr': score_to_cefr(score), 'score': score, 'grammar': grammar,
            'word_count': len(content), 'rare_count': rare, 'words': words}


def legacy_level(cefr: int) -> int:
    """기존 level(1~3) 호환값 — cefr 1–2→1, 3–4→2, 5–6→3."""
    return 1 if cefr <= 2 else (2 if cefr <= 4 else 3)
