"""
example_blank_check.py — 빈칸 계열 문제(fillInTheBlank / fillInTheBlankTyping)의 예문 적격 판정.

배경(2026-11-23): 표제어 `give a call` 인데 예문 강조가 `give her old friend a call` 이라
빈칸 입력 정답이 그 전체가 돼 버려, 표제어만 외운 사용자는 맞힐 수 없었다. 강조 구간이
표제어보다 넓은 예문이 사전에 0.5% 있다. 데이터와 별개로 출제 단계에서 막는다.

판정 규칙 — `highlight_matches_headword(headword, highlight)`:
  1. 표제어를 토큰으로 쪼갠다. 자리표시(`~`, sb, sth, someone, something, one's, oneself …)는
     매칭 대상에서 빼고 '자리표시 칸 수'로만 센다. 괄호 안 `(=동의어)`·`(↔반의어)` 는 버리고,
     그 밖의 괄호 토큰(`(be) used to`)은 선택 토큰이다. `a/b` 는 대안, `a-b` 는 통째 또는 부분.
  2. 강조 구간을 토큰으로 쪼갠다. 강조 토큰은 표제어 토큰과 **순서대로** 하나씩 대응해야 하고,
     대응은 '같거나 활용형'(규칙 -s/-es/-ed/-ing/-er/-est/-ly + 불규칙 표)일 때만 인정한다.
  3. 대응 못 한 강조 토큰은 자리표시 칸 수만큼만 허용한다(`take one's time` → `take his time`).
     그 밖의 군더더기(`give her old friend a call`, `woke up` ← wake)는 부적격.
표제어 토큰이 강조에 다 안 나와도(`look forward to` → `looking forward`) 부적격이 아니다 — 문제는
'강조가 표제어보다 넓은 것'이다.

영어 전용(일본어 경로는 이 판정을 쓰지 않는다). 순수 함수 — DB·spaCy 의존 없음.
"""

import re
import unicodedata
from functools import lru_cache
from typing import List, Optional, Tuple

_TAG_RE = re.compile(r'<[^>]+>')
_PAREN_RE = re.compile(r'\(([^)]*)\)')
_TOKEN_STRIP = re.compile(r"^[^\w]+|[^\w]+$")

_PLACEHOLDERS = {
    '~', '～', 'sb', 'sth', 's.o.', 's.t.', 'so', 'someone', 'somebody', 'something',
    "one's", 'ones', 'oneself', 'o.s.', "someone's", "somebody's", "sb's", "sth's",
    'a', 'b',  # 'have A strapped to B' 같은 변수 — 단독 대문자 A/B 만(아래에서 원문 대소문자로 판정)
}
_PLACEHOLDERS_LOWER_ONLY = _PLACEHOLDERS - {'a', 'b', 'so'}
# 대소문자 구분이 필요한 변수형(표제어 원문에서 'A'/'B' 로 쓴 것만 자리표시)
_UPPER_VARS = {'A', 'B', 'C'}
# 동사·동명사 자리표시: 'afford to do', 'make a point of -ing'
_VERB_SLOTS = {'-ing', 'ing', '-ed', 'v', 'v-ing', 'do', 'doing'}
_POSSESSIVES = {'my', 'your', 'his', 'her', 'its', 'our', 'their', "one's", 'ones'}

# ── 불규칙 활용 ───────────────────────────────────────────────────────────────
# base: (과거, 과거분사 ...) — 'a/b' 로 여러 형태. 현재분사·3인칭은 규칙 생성으로 커버.
_IRREGULAR_VERBS = """
be: am is are was were been being
have: has had having
do: does did done doing
go: goes went gone going
say: said
make: made
take: took taken
come: came
see: saw seen
know: knew known
get: got gotten
give: gave given
find: found
think: thought
tell: told
become: became
show: showed shown
leave: left
feel: felt
put: put
bring: brought
begin: began begun
keep: kept
hold: held
write: wrote written
stand: stood
hear: heard
let: let
mean: meant
set: set
meet: met
run: ran
pay: paid
sit: sat
speak: spoke spoken
lie: lay lain
lead: led
read: read
grow: grew grown
lose: lost
fall: fell fallen
send: sent
build: built
understand: understood
draw: drew drawn
break: broke broken
spend: spent
cut: cut
rise: rose risen
drive: drove driven
buy: bought
wear: wore worn
choose: chose chosen
eat: ate eaten
fly: flew flown
forget: forgot forgotten
sell: sold
catch: caught
teach: taught
throw: threw thrown
win: won
sing: sang sung
swim: swam swum
drink: drank drunk
ring: rang rung
sleep: slept
wake: woke woken waked
steal: stole stolen
hide: hid hidden
hit: hit
hurt: hurt
shake: shook shaken
shut: shut
strike: struck stricken
swear: swore sworn
tear: tore torn
bear: bore borne
beat: beat beaten
bend: bent
bet: bet
bind: bound
bite: bit bitten
bleed: bled
blow: blew blown
breed: bred
burn: burnt burned
burst: burst
cast: cast
cling: clung
cost: cost
creep: crept
deal: dealt
dig: dug
dive: dove dived
dream: dreamt dreamed
feed: fed
fight: fought
flee: fled
forgive: forgave forgiven
freeze: froze frozen
hang: hung hanged
kneel: knelt
lay: laid
lend: lent
light: lit lighted
quit: quit quitted
ride: rode ridden
seek: sought
shine: shone shined
shoot: shot
shrink: shrank shrunk
slide: slid
spin: spun
split: split
spread: spread
spring: sprang sprung
stick: stuck
sting: stung
sweep: swept
swing: swung
undergo: underwent undergone
upset: upset
withdraw: withdrew withdrawn
wind: wound
sew: sewed sewn
sow: sowed sown
saw: sawed sawn
learn: learnt learned
spell: spelt spelled
spill: spilt spilled
smell: smelt smelled
spoil: spoilt spoiled
mistake: mistook mistaken
overcome: overcame
overtake: overtook overtaken
undertake: undertook undertaken
foresee: foresaw foreseen
rebuild: rebuilt
redo: redid redone
rewrite: rewrote rewritten
retell: retold
rethink: rethought
unwind: unwound
withhold: withheld
uphold: upheld
outdo: outdid outdone
overdo: overdid overdone
override: overrode overridden
undo: undid undone
mislead: misled
misunderstand: misunderstood
broadcast: broadcast
forecast: forecast
input: input
output: output
fit: fit fitted
get: gotten
lie: lied lying
die: died dying
tie: tied tying
bid: bid
rid: rid
shed: shed
slit: slit
thrust: thrust
wed: wed wedded
weave: wove woven
weep: wept
wring: wrung
forbid: forbade forbad forbidden
stride: strode stridden
dwell: dwelt
fling: flung
strew: strewn strewed
awake: awoke awoken
hamstring: hamstrung
rive: rove riven rived
misgive: misgave misgiven
behold: beheld
beseech: besought
bespeak: bespoke bespoken
smite: smote smitten
slay: slew slain
slink: slunk
stink: stank stunk
strive: strove striven
sink: sank sunk
drink: drank drunk
run: ran
"""

# 명사·형용사 불규칙
_IRREGULAR_OTHER = """
child: children
man: men
woman: women
foot: feet
tooth: teeth
goose: geese
mouse: mice
person: people persons
ox: oxen
wife: wives
life: lives
knife: knives
leaf: leaves
half: halves
wolf: wolves
shelf: shelves
self: selves
thief: thieves
loaf: loaves
calf: calves
elf: elves
scarf: scarves
good: better best well
well: better best
bad: worse worst
ill: worse worst
badly: worse worst
far: further farther furthest farthest
little: less least
much: more most
many: more most
old: elder eldest
late: latter last
I: me my mine myself
he: him his himself
she: her hers herself
it: its itself
we: us our ours ourselves
you: your yours yourself yourselves
they: them their theirs themselves
this: these
that: those
analysis: analyses
crisis: crises
basis: bases
thesis: theses
phenomenon: phenomena
criterion: criteria
datum: data
medium: media
bacterium: bacteria
curriculum: curricula
nucleus: nuclei
stimulus: stimuli
cactus: cacti
fungus: fungi
index: indices
appendix: appendices
a: an
an: a
no: none
not: n't
will: would
can: could cannot
shall: should
may: might
must: must
"""


def _load(table: str):
    fwd = {}
    for line in table.strip().splitlines():
        if ':' not in line:
            continue
        base, forms = line.split(':', 1)
        base = base.strip().lower()
        for f in forms.split():
            fwd.setdefault(base, set()).add(f.lower())
    return fwd


_IRR = {}
for _tbl in (_IRREGULAR_VERBS, _IRREGULAR_OTHER):
    for _b, _fs in _load(_tbl).items():
        _IRR.setdefault(_b, set()).update(_fs)
# 불규칙의 활용형(예: went) 이 다시 규칙 접미사를 붙이는 일은 없지만, 과거분사끼리도 서로 대응해야 하므로
# '같은 어휘소 묶음'(base + 모든 불규칙형)을 만든다.
_FAMILY = {}
for _b, _fs in _IRR.items():
    _grp = {_b} | _fs
    for _w in _grp:
        _FAMILY.setdefault(_w, set()).update(_grp)


def _regular_forms(w: str) -> set:
    """규칙 활용 생성: -s/-es/-ies/-ed/-ied/-d/-ing/-ying/자음 겹침/-er/-est/-r/-st/-ier/-iest/-ly/-ily."""
    out = {w}
    if not w.isalpha() or len(w) < 2:
        return out
    vowels = 'aeiou'
    out |= {w + 's', w + 'es', w + 'ed', w + 'ing', w + 'er', w + 'est', w + 'ly', w + "'s", w + 'ers'}
    if w.endswith('e'):
        out |= {w + 'd', w[:-1] + 'ing', w + 'r', w + 'st', w[:-1] + 'ly', w + 'rs'}
        if w.endswith('le'):
            out.add(w[:-2] + 'ly')
        if w.endswith('ue'):
            out.add(w[:-2] + 'uly')
    if w.endswith('y') and len(w) > 2 and w[-2] not in vowels:
        s = w[:-1]
        out |= {s + 'ies', s + 'ied', s + 'ier', s + 'iest', s + 'ily', s + 'iness'}
    if w.endswith('y'):
        out.add(w[:-1] + 'ing')
        out.add(w[:-1] + 'ies')
    if w.endswith('ic'):
        out.add(w + 'ally')
    if w.endswith('ful'):
        out.add(w + 'ly')
    if (len(w) >= 3 and w[-1] not in vowels + 'wxy' and w[-2] in vowels
            and (w[-3] not in vowels or w[-3:-1] in ('ua', 'ui'))) \
            or (len(w) == 3 and w[-1] not in vowels + 'wxy'):
        out |= {w + w[-1] + 'ed', w + w[-1] + 'ing', w + w[-1] + 'er', w + w[-1] + 'est', w + w[-1] + 'y'}
    if w.endswith(('s', 'x', 'z', 'ch', 'sh', 'o')):
        out.add(w + 'es')
    if w.endswith(('man', 'woman')):
        out.add(w[:-3] + 'men')
    if w.endswith('f'):
        out |= {w[:-1] + 'ves'}
    if w.endswith('fe'):
        out |= {w[:-2] + 'ves'}
    if w.endswith('ing') and len(w) > 4:
        out.add(w[:-3])
        out.add(w[:-3] + 'e')
    return out


_PREFIXES = ('over', 'under', 'mis', 'out', 're', 'fore', 'with', 'up', 'down', 'be', 'for', 'inter', 'out')


def _prefixed_family(w: str) -> set:
    """overrun → over+run 처럼 접두사가 붙은 불규칙 동사의 활용형 묶음."""
    for pre in _PREFIXES:
        if w.startswith(pre) and len(w) - len(pre) >= 3:
            base = w[len(pre):]
            if base in _FAMILY:
                return {pre + x for x in _FAMILY[base]}
    return set()


@lru_cache(maxsize=8192)
def _forms_of(w: str) -> frozenset:
    out = set(_regular_forms(w))
    fam = _FAMILY.get(w) or _prefixed_family(w)
    out |= fam
    for x in list(fam):
        out |= _regular_forms(x)
    return frozenset(out)


def forms_match(head: str, tok: str) -> bool:
    """tok 가 head 와 같거나 head 의 활용형(또는 그 반대)인가. 소문자 단일 토큰 기준."""
    if head == tok:
        return True
    if head in _POSSESSIVES and tok in _POSSESSIVES:
        return True
    for suf in ("n't", "'s", "'ll", "'d", "'re", "'ve", "'m"):
        if tok.endswith(suf) and len(tok) > len(suf) + 1 and forms_match(head, tok[:-len(suf)]):
            return True
    if tok in _forms_of(head) or head in _forms_of(tok):
        return True
    # 둘 다 어떤 어휘소의 활용형인 경우(예: 과거 vs 과거분사, 'tired' vs 'tires')
    for h in _forms_of(head):
        if h == tok:
            return True
    return False


# ── 토큰화 ────────────────────────────────────────────────────────────────────

def _norm_token(t: str) -> str:
    t = t.replace('’', "'").replace('`', "'")
    t = ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')
    t = _TOKEN_STRIP.sub('', t).lower()
    return t.replace('.', '')


def _strip_html(text: str) -> str:
    return _TAG_RE.sub('', text or '')


def _head_tokens(headword: str) -> Tuple[list, int]:
    """표제어 → (매칭 대상 토큰 목록, 자리표시 칸 수).

    각 원소: (alternatives:set[str], optional:bool). 자리표시는 목록에서 빠지고 칸 수로 셈한다.
    """
    text = (headword or '').replace('；', ';')
    text = text.split(';')[0].strip()
    # 괄호: '(=…)'·'(↔…)' 는 통째로 버리고, 나머지 괄호 토큰은 선택 토큰.
    optional_marks = []

    def _paren(m):
        inner = m.group(1).strip()
        if inner.startswith(('=', '↔', '≠')) or '↔' in inner or '=' in inner:
            return ' '
        optional_marks.append(inner)
        return ' \x00' + inner.replace(' ', '\x00') + ' '

    text = _PAREN_RE.sub(_paren, text)
    text = re.split(r'[↔=]', text)[0]
    tokens, slots = [], 0
    prev = ''
    for raw in text.split():
        optional = raw.startswith('\x00')
        raw = raw.replace('\x00', ' ').strip()
        for piece in raw.split():
            low = piece.lower().replace('’', "'")
            stripped = _TOKEN_STRIP.sub('', piece)
            is_slot = (low in _PLACEHOLDERS_LOWER_ONLY or stripped.lower() in _PLACEHOLDERS_LOWER_ONLY
                       or stripped in _UPPER_VARS or piece in ('~', '～', '...', '…')
                       or low in _VERB_SLOTS and (low != 'do' or prev == 'to'))
            prev = low
            if is_slot:
                slots += 1
                continue
            # 하이픈 복합어는 부분 토큰으로 펼친다(come-with → come with). 대안(a/b)은 한 칸의 대체.
            for part in re.split(r'-', piece):
                alts = {n for n in (_norm_token(a) for a in part.split('/')) if n}
                if alts:
                    tokens.append((alts, optional))
    return tokens, slots


def _hl_tokens(highlight: str) -> List[str]:
    text = _strip_html(highlight).replace('’', "'")
    out = []
    for raw in text.split():
        for part in raw.split('-'):
            n = _norm_token(part)
            if n:
                out.append(n)
    return out


def _tok_matches(alts: set, tok: str) -> bool:
    parts = [p for p in tok.split('/') if p] if '/' in tok else [tok]
    return any(forms_match(a, p) for a in alts for p in parts)


def _squash_letters(text: str) -> str:
    return re.sub(r'[^a-z]', '', _norm_token_full(text))


def _norm_token_full(text: str) -> str:
    text = ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')
    return text.lower()


def highlight_matches_headword(headword: str, highlight: str) -> bool:
    """강조 구간(highlight)이 표제어(headword)의 형태(활용형 포함)로만 이뤄졌는가. 모듈 docstring 참고."""
    head, slots = _head_tokens(headword)
    hl = _hl_tokens(highlight)
    if not hl:
        return False
    if not head:
        # 표제어가 전부 자리표시/기호라 비교할 게 없다 — 판정 불가이므로 막지 않는다(기존 동작).
        return True
    # 띄어쓰기만 다른 표기(seat belt / seatbelt, takeawalk / take a walk)는 글자열이 같으면 통과.
    sh, sl = _squash_letters(headword), _squash_letters(highlight)
    if sh and (sh == sl or (' ' not in headword.strip() or '-' in headword) and forms_match(sh, sl)):
        return True
    pos = 0
    extra = 0
    for tok in hl:
        hit = None
        for k in range(pos, len(head)):
            if _tok_matches(head[k][0], tok):
                hit = k
                break
        if hit is not None:
            pos = hit + 1
        else:
            extra += 1
            if extra > slots:
                return False
    return True


def extract_highlight(origin_html: str) -> Optional[str]:
    """origin 의 첫 강조 구간 텍스트(태그 제거). 강조가 없으면 None."""
    from app.services.fill_blank_typing import _TARGET_PAIR_RE
    m = _TARGET_PAIR_RE.search(origin_html or '')
    if not m:
        return None
    text = _strip_html(m.group(1)).strip()
    return text or None


def example_blank_ok(headword: str, origin_html: str) -> bool:
    """예문 origin 의 강조가 표제어 형태로만 이뤄졌는가(강조가 없으면 False)."""
    hl = extract_highlight(origin_html)
    if not hl:
        return False
    return highlight_matches_headword(headword, hl)
