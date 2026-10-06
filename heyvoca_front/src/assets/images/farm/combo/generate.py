#!/usr/bin/env python3
"""콤보 아이콘(번개 당근) SVG 생성기 — 단계 1·2·3.
사용: python3 gen.py <출력 폴더>
"""
import sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else '.'


def clay(fid, blur, scale, grain=0.05, spec=0.32, diff=1.18, elev=56):
    """클레이 질감 필터 — 알파를 흐려 만든 높이맵에 잔요철을 얹고 확산광·약한 반사광으로 볼록하게 만든다."""
    return f'''
  <filter id="{fid}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="h"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="11" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="na"/>
    <feComposite in="h" in2="na" operator="arithmetic" k1="{grain}" k2="1" k3="0" k4="0" result="hb"/>
    <feDiffuseLighting in="hb" surfaceScale="{scale}" diffuseConstant="{diff}" lighting-color="#ffffff" result="d">
      <feDistantLight azimuth="232" elevation="{elev}"/>
    </feDiffuseLighting>
    <feComposite in="SourceGraphic" in2="d" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>
    <feSpecularLighting in="hb" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="9" lighting-color="#fff6e8" result="s">
      <feDistantLight azimuth="232" elevation="48"/>
    </feSpecularLighting>
    <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
    <feComposite in="lit" in2="s2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="o"/>
    <feComposite in="o" in2="SourceAlpha" operator="in"/>
  </filter>'''


# 번개 당근 몸통 — 위가 넓고 아래로 뾰족해지는 지그재그
BOLT = 'M200 152 L334 152 L294 246 L374 246 L220 462 L250 318 L156 318 Z'
# 불꽃(뒤 배경) — 가운데 큰 혀 + 오른쪽 작은 혀
FLAME_OUT = ('M190 22 C232 70 300 98 352 152 C372 174 388 200 396 228 '
             'C410 206 418 178 412 148 C464 202 484 282 462 362 '
             'C438 448 356 502 256 502 C150 502 64 432 60 330 '
             'C56 242 108 184 134 122 C148 90 166 54 190 22 Z')
FLAME_IN_TR = 'translate(262 496) scale(0.7) translate(-256 -502)'


def leaf(cx, cy, rx, ry, rot, px, py):
    """잎 한 장 — 통통한 물방울 꼴 + 가운데 잎맥 홈. (px,py)는 회전축(줄기 뿌리)."""
    top = cy - ry
    bot = cy + ry
    d = (f'M{cx} {top} C{cx + rx * 1.25} {top + ry * 0.35} {cx + rx * 1.05} {bot - ry * 0.25} {cx} {bot + 14} '
         f'C{cx - rx * 1.05} {bot - ry * 0.25} {cx - rx * 1.25} {top + ry * 0.35} {cx} {top} Z')
    vein = f'M{cx} {top + 14} L{cx} {bot + 4}'
    return d, vein, f'rotate({rot} {px} {py})'


def sparkle(x, y, r):
    k = r * 0.22
    return (f'M{x} {y - r} C{x + k} {y - k} {x + k} {y - k} {x + r} {y} '
            f'C{x + k} {y + k} {x + k} {y + k} {x} {y + r} '
            f'C{x - k} {y + k} {x - k} {y + k} {x - r} {y} '
            f'C{x - k} {y - k} {x - k} {y - k} {x} {y - r} Z')


PAL = {
    1: dict(b0='#FFB648', b1='#F58A22', b2='#DC5F12', crease='#C2500C'),
    2: dict(b0='#FFC550', b1='#F9982A', b2='#E26A14', crease='#C4560E'),
    3: dict(b0='#FFE06A', b1='#F8C226', b2='#E09410', crease='#C27A08'),
}


def build(tier):
    p = PAL[tier]
    parts = []
    parts.append(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>{clay('clayBolt', 13, 11, elev=60)}{clay('clayLeaf', 8, 9, grain=0.04)}{clay('claySpark', 4, 5, grain=0.02, spec=0.2, diff=1.2, elev=62)}{clay('clayFlame', 20, 15, grain=0.06, spec=0.22)}{clay('clayFlameIn', 15, 12, grain=0.06, spec=0.22)}
  <linearGradient id="gBolt" x1="0.15" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="{p['b0']}"/><stop offset="0.5" stop-color="{p['b1']}"/><stop offset="1" stop-color="{p['b2']}"/>
  </linearGradient>
  <linearGradient id="gLeaf" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#C6E23E"/><stop offset="0.55" stop-color="#96C81C"/><stop offset="1" stop-color="#5E9E08"/>
  </linearGradient>
  <linearGradient id="gFlameOut" x1="0.2" y1="0" x2="0.75" y2="1">
    <stop offset="0" stop-color="#FF9A7E"/><stop offset="0.55" stop-color="#F56E55"/><stop offset="1" stop-color="#DC4A3A"/>
  </linearGradient>
  <linearGradient id="gFlameIn" x1="0.2" y1="0" x2="0.75" y2="1">
    <stop offset="0" stop-color="#FFB25E"/><stop offset="0.6" stop-color="#FA8A34"/><stop offset="1" stop-color="#E8641C"/>
  </linearGradient>
  <linearGradient id="gFlameSolo" x1="0.2" y1="0" x2="0.75" y2="1">
    <stop offset="0" stop-color="#FFAE92"/><stop offset="0.55" stop-color="#F7806A"/><stop offset="1" stop-color="#E25A48"/>
  </linearGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="soft3" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="ao" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <clipPath id="cFlame"><path d="{FLAME_OUT}"/></clipPath>
  <clipPath id="cBolt"><path d="{BOLT}" stroke="#000" stroke-width="48" stroke-linejoin="round"/></clipPath>
</defs>
<g transform="translate(256 256) scale(0.965) translate(-256 -262)">''')

    # ── 뒤 불꽃 ──
    if tier == 2:
        parts.append(f'<g filter="url(#clayFlame)"><path d="{FLAME_OUT}" fill="url(#gFlameSolo)" stroke="url(#gFlameSolo)" stroke-width="10" stroke-linejoin="round"/></g>')
    if tier == 3:
        parts.append(f'<g filter="url(#clayFlame)"><path d="{FLAME_OUT}" fill="url(#gFlameOut)" stroke="url(#gFlameOut)" stroke-width="10" stroke-linejoin="round"/></g>')
        parts.append(f'<g transform="{FLAME_IN_TR}"><path d="{FLAME_OUT}" fill="#9E2A1E" opacity="0.30" filter="url(#ao)" transform="translate(6 10)"/></g>')
        parts.append(f'<g filter="url(#clayFlameIn)"><g transform="{FLAME_IN_TR}"><path d="{FLAME_OUT}" fill="url(#gFlameIn)" stroke="url(#gFlameIn)" stroke-width="10" stroke-linejoin="round"/></g></g>')

    body_tr = {1: 'translate(-9 12)', 2: 'translate(262 296) scale(0.93) translate(-262 -256)', 3: 'translate(262 296) scale(0.93) translate(-262 -256)'}[tier]
    # ── 번개 당근이 불꽃 위에 드리우는 그림자(불꽃 밖으로는 새지 않게 자른다) ──
    if tier > 1:
        parts.append(f'<g clip-path="url(#cFlame)"><g transform="{body_tr}"><path d="{BOLT}" fill="#7A1E10" stroke="#7A1E10" stroke-width="48" stroke-linejoin="round" opacity="0.30" filter="url(#ao)" transform="translate(7 12)"/></g></g>')
    parts.append(f'<g transform="{body_tr}">')

    # ── 잎 ──
    leaves = [
        leaf(270, 78, 30, 40, -40, 268, 150),
        leaf(270, 78, 30, 40, 40, 268, 150),
        leaf(268, 62, 33, 46, 0, 268, 150),
    ]
    for d, vein, tr in leaves:
        parts.append(f'<g transform="{tr}"><g filter="url(#clayLeaf)"><path d="{d}" fill="url(#gLeaf)"/>'
                     f'<path d="{vein}" stroke="#5E9E08" stroke-width="5" stroke-linecap="round" opacity="0.55" fill="none"/></g></g>')

    # ── 번개 당근 ──
    parts.append(f'<g filter="url(#clayBolt)"><path d="{BOLT}" fill="url(#gBolt)" stroke="url(#gBolt)" stroke-width="48" stroke-linejoin="round"/></g>')
    # 당근 주름 + 잎 밑 그늘 + 넓은 하이라이트 (몸통 안으로 자른다)
    parts.append(f'''<g clip-path="url(#cBolt)">
  <ellipse cx="268" cy="132" rx="62" ry="16" fill="{p['crease']}" opacity="0.38" filter="url(#soft)"/>
  <path d="M196 204 q34 12 70 6" stroke="{p['crease']}" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.42" filter="url(#soft3)"/>
  <path d="M256 292 q36 12 76 2" stroke="{p['crease']}" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.38" filter="url(#soft3)"/>
  <path d="M238 380 q20 8 42 2" stroke="{p['crease']}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.34" filter="url(#soft3)"/>
  <path d="M206 172 L300 172" stroke="#FFFFFF" stroke-width="20" stroke-linecap="round" opacity="0.20" filter="url(#soft)"/>
  <path d="M222 190 L196 290" stroke="#FFFFFF" stroke-width="16" stroke-linecap="round" opacity="0.14" filter="url(#soft)"/>
</g>''')

    parts.append('</g>')
    # ── 반짝임(3단계) ──
    if tier == 3:
        for x, y, r in [(92, 96, 30), (440, 70, 20), (452, 452, 16)]:
            parts.append(f'<path d="{sparkle(x, y, r)}" fill="#FFF3CF" stroke="#FFF3CF" stroke-width="6" stroke-linejoin="round" filter="url(#claySpark)"/>')
    parts.append('</g></svg>')
    return '\n'.join(parts)


for t in (1, 2, 3):
    with open(os.path.join(OUT, f'combo-{t}.svg'), 'w') as f:
        f.write(build(t))
print('ok')
