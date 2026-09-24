"""가나 → 헵번식 로마자 (읽기는 순수 가나이므로 사전 테이블로 결정론적 변환).

pykakasi 는 ティ→tei, トゥ 등 외래어 소형 가나 조합을 틀리게 읽어 자체 구현한다.
장음: ー 는 직전 모음 반복(コーヒー→koohii), おう/えい 등은 표기 그대로(wapuro식 헵번).
ん 은 n(모음·y 앞은 n'), 촉음 っ 는 다음 자음 중복(ch 앞은 t: まっちゃ→matcha).
"""
import re

_DIGRAPH = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo', 'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho', 'しぇ': 'she',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho', 'ちぇ': 'che', 'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo', 'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo', 'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo', 'じぇ': 'je', 'ぢゃ': 'ja', 'ぢゅ': 'ju', 'ぢょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo', 'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'てぃ': 'ti', 'でぃ': 'di', 'とぅ': 'tu', 'どぅ': 'du', 'てゅ': 'tyu', 'でゅ': 'dyu',
    'ふぁ': 'fa', 'ふぃ': 'fi', 'ふぇ': 'fe', 'ふぉ': 'fo', 'ふゅ': 'fyu',
    'うぃ': 'wi', 'うぇ': 'we', 'うぉ': 'wo', 'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo', 'ゔゅ': 'vyu',
    'つぁ': 'tsa', 'つぃ': 'tsi', 'つぇ': 'tse', 'つぉ': 'tso', 'いぇ': 'ye', 'くぁ': 'kwa', 'ぐぁ': 'gwa',
    'すぃ': 'si', 'ずぃ': 'zi', 'きぇ': 'kye', 'ひぇ': 'hye', 'にぇ': 'nye', 'りぇ': 'rye',
}
_MONO = dict(zip(
    'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをん'
    'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽゔぁぃぅぇぉゃゅょゎ',
    ['a', 'i', 'u', 'e', 'o', 'ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so', 'ta', 'chi', 'tsu', 'te', 'to',
     'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho', 'ma', 'mi', 'mu', 'me', 'mo', 'ya', 'yu', 'yo',
     'ra', 'ri', 'ru', 're', 'ro', 'wa', 'i', 'e', 'o', 'n',
     'ga', 'gi', 'gu', 'ge', 'go', 'za', 'ji', 'zu', 'ze', 'zo', 'da', 'ji', 'zu', 'de', 'do',
     'ba', 'bi', 'bu', 'be', 'bo', 'pa', 'pi', 'pu', 'pe', 'po', 'vu', 'a', 'i', 'u', 'e', 'o', 'ya', 'yu', 'yo', 'wa']))
_WIDE = str.maketrans('ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ０１２３４５６７８９',
                      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')


def kata2hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


def to_romaji(kana):
    s = kata2hira(kana).translate(_WIDE)
    out = []
    i = 0
    sokuon = False
    prev_n = False
    while i < len(s):
        two, one = s[i:i + 2], s[i]
        if two in _DIGRAPH:
            r, i = _DIGRAPH[two], i + 2
        elif one in ('っ',):
            sokuon, i = True, i + 1
            continue
        elif one == 'ー':
            prev_n = False
            v = next((c for c in reversed(''.join(out)) if c in 'aeiou'), '')
            out.append(v)
            i += 1
            continue
        elif one in _MONO:
            r, i = _MONO[one], i + 1
        else:  # 가운뎃점·영숫자·기호 등
            r, i = ('' if one in '・＝=' else ' ' if one in '　 ' else one), i + 1
        if sokuon:
            if r[:1] and r[0] not in 'aeiou':
                out.append('t' if r.startswith('ch') else r[0])
            sokuon = False
        if prev_n and r[:1] in ('a', 'i', 'u', 'e', 'o', 'y'):
            out[-1] = "n'"  # 헵번: 모음·y 앞의 ん 은 n' (かんい→kan'i)
        out.append(r)
        prev_n = one == 'ん' and two not in _DIGRAPH
    return re.sub(r'\s+', ' ', ''.join(out)).strip()
