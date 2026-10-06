#!/usr/bin/env python3
"""콤보 아이콘(번개) SVG 생성기 — 단계 구분 없이 하나.
사용: python3 generate.py [출력 폴더] [--png]
  --png  크롬 헤드리스로 combo.svg 를 combo.png(512px, 투명 배경)로 굽는다.

화면에는 구운 PNG 를 쓴다(SVG 필터는 WebView 마다 결과·비용이 달라서).
모양은 각진 번개 한 개 — 옆면(두께) + 앞면 + 모서리 하이라이트 + 작은 반짝임 둘.
재질은 다른 농장 에셋과 같은 클레이 결(알파 높이맵 + 잔요철 + 확산광·약한 반사광)을 쓴다.
"""
import sys, os, subprocess, tempfile

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
OUT = ARGS[0] if ARGS else os.path.dirname(os.path.abspath(__file__))
BAKE = '--png' in sys.argv
PNG_SIZE = 512
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'


def clay(fid, blur, scale, grain=0.05, spec=0.32, diff=1.18, elev=56, exp=9, speck=0.8):
    """클레이 질감 필터 — 알파를 흐려 만든 높이맵에 잔요철을 얹고 확산광·약한 반사광으로 볼록하게 만든 뒤, 고운 알갱이(speck)를 입힌다.
    그늘은 붉은 쪽을 덜 깎아(dw) 노랑이 올리브색으로 죽지 않고 주황으로 익게 한다."""
    return f'''
  <filter id="{fid}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="{blur}" result="h"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="11" result="n"/>
    <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="na"/>
    <feComposite in="h" in2="na" operator="arithmetic" k1="{grain}" k2="1" k3="0" k4="0" result="hb"/>
    <feDiffuseLighting in="hb" surfaceScale="{scale}" diffuseConstant="{diff}" lighting-color="#ffffff" result="d">
      <feDistantLight azimuth="232" elevation="{elev}"/>
    </feDiffuseLighting>
    <feColorMatrix in="d" type="matrix" values="0.42 0 0 0 0.58  0 0.74 0 0 0.26  0 0 1 0 0  0 0 0 1 0" result="dw"/>
    <feComposite in="SourceGraphic" in2="dw" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit"/>
    <feSpecularLighting in="hb" surfaceScale="{scale}" specularConstant="{spec}" specularExponent="{exp}" lighting-color="#fff6e8" result="s">
      <feDistantLight azimuth="232" elevation="48"/>
    </feSpecularLighting>
    <feComposite in="s" in2="SourceAlpha" operator="in" result="s2"/>
    <feComposite in="lit" in2="s2" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="o"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="5" result="f"/>
    <feColorMatrix in="f" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 {speck}" result="fg"/>
    <feBlend in="fg" in2="o" mode="soft-light" result="t"/>
    <feComposite in="t" in2="SourceAlpha" operator="in"/>
  </filter>'''


# 번개 앞면 — 위가 넓고 아래로 길게 뾰족해지는 각진 지그재그
BOLT = 'M222 40 L384 40 L312 206 L418 206 L168 484 L220 310 L100 310 Z'
JOIN = 14            # 모서리를 살짝만 굴리는 외곽선 두께(클레이 느낌은 남기되 각은 살린다)
DEPTH = (20, 26)     # 옆면이 빠지는 방향·깊이(오른쪽 아래)
STEPS = 13           # 옆면을 채우는 겹 수
TILT = 9             # 전체 기울기(도)


def sparkle(x, y, r):
    k = r * 0.2
    return (f'M{x} {y - r} C{x + k} {y - k} {x + k} {y - k} {x + r} {y} '
            f'C{x + k} {y + k} {x + k} {y + k} {x} {y + r} '
            f'C{x - k} {y + k} {x - k} {y + k} {x - r} {y} '
            f'C{x - k} {y - k} {x - k} {y - k} {x} {y - r} Z')


def build():
    dx, dy = DEPTH
    side = ''.join(
        f'<path d="{BOLT}" transform="translate({dx * i / STEPS:.2f} {dy * i / STEPS:.2f})"/>'
        for i in range(STEPS, -1, -1))
    parts = [f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<defs>{clay('claySide', 10, 8, grain=0.09, spec=0.14, diff=1.12)}{clay('clayFace', 11, 8, grain=0.1, spec=0.24, diff=1.1, elev=64, exp=9)}{clay('claySpark', 4, 5, grain=0.02, spec=0.2, diff=1.2, elev=62, speck=0.25)}
  <linearGradient id="gFace" gradientUnits="userSpaceOnUse" x1="200" y1="40" x2="300" y2="484">
    <stop offset="0" stop-color="#FFDA3E"/><stop offset="0.45" stop-color="#FFB520"/><stop offset="1" stop-color="#F8800F"/>
  </linearGradient>
  <linearGradient id="gSide" gradientUnits="userSpaceOnUse" x1="200" y1="40" x2="320" y2="510">
    <stop offset="0" stop-color="#EC7A16"/><stop offset="0.5" stop-color="#DC5A0E"/><stop offset="1" stop-color="#BE420A"/>
  </linearGradient>
  <linearGradient id="gSheen" gradientUnits="userSpaceOnUse" x1="150" y1="40" x2="330" y2="330">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.8"/><stop offset="0.6" stop-color="#FFFFFF" stop-opacity="0.25"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </linearGradient>
  <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="soft2" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.6"/></filter>
  <clipPath id="cFace"><path d="{BOLT}" stroke="#000" stroke-width="{JOIN}" stroke-linejoin="round"/></clipPath>
</defs>
<g transform="rotate({TILT} 256 256) translate(256 256) scale(0.9) translate(-271 -276)">''']

    # ── 옆면(두께) ──
    parts.append(f'<g filter="url(#claySide)"><g fill="url(#gSide)" stroke="url(#gSide)" stroke-width="{JOIN}" stroke-linejoin="round">{side}</g></g>')
    # ── 앞면 ──
    parts.append(f'<g filter="url(#clayFace)"><path d="{BOLT}" fill="url(#gFace)" stroke="url(#gFace)" stroke-width="{JOIN}" stroke-linejoin="round"/></g>')
    # 앞면 안쪽 — 빛 받는 모서리 선 + 넓은 광택 + 아래 끝 그늘
    parts.append(f'''<g clip-path="url(#cFace)">
  <path d="M250 330 L418 206 L168 484 Z" fill="#E8560A" opacity="0.22" filter="url(#soft)"/>
  <path d="M228 62 L362 62 L326 150 L186 150 Z" fill="#FFFFFF" opacity="0.14" filter="url(#soft)"/>
  <path d="{BOLT}" fill="none" stroke="url(#gSheen)" stroke-width="9" stroke-linejoin="round" transform="translate(5 6)" filter="url(#soft2)"/>
</g>''')
    parts.append('</g>')
    # ── 반짝임 ──
    for x, y, r in [(452, 150, 32), (70, 416, 20)]:
        parts.append(f'<path d="{sparkle(x, y, r)}" fill="#FFEFB0" stroke="#FFEFB0" stroke-width="6" stroke-linejoin="round" filter="url(#claySpark)"/>')
    parts.append('</svg>')
    return '\n'.join(parts)


svg_path = os.path.join(OUT, 'combo.svg')
with open(svg_path, 'w') as f:
    f.write(build())

if BAKE:
    with tempfile.TemporaryDirectory() as tmp:
        page = os.path.join(tmp, 'bake.html')
        with open(page, 'w') as f:
            f.write(f'<!doctype html><html><body style="margin:0;background:transparent">'
                    f'<img src="file://{os.path.abspath(svg_path)}" width="{PNG_SIZE}" height="{PNG_SIZE}" style="display:block"></body></html>')
        subprocess.run([CHROME, '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1',
                        f'--window-size={PNG_SIZE},{PNG_SIZE}', '--default-background-color=00000000',
                        f'--screenshot={os.path.join(OUT, "combo.png")}', f'file://{page}'],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
print('ok')
