#!/usr/bin/env node
/**
 * 스토어 스크린샷 합성 — slides.json(제목·부제·원본 캡처)을 template.html 에 얹어 PNG 로 굽는다.
 *
 *   node build.mjs 2026-10-ko
 *     → <set>/ios-65/      1242x2688  (App Store APP_IPHONE_65)
 *       <set>/play-phone/  1242x2208  (Play phoneScreenshots·7/10인치 공용)
 *       <set>/play-feature/feature.png 1024x500 (Play featureGraphic)
 *
 * 원본 캡처(<set>/src/*.png)는 로컬 데모 계정으로 414x896@3x 로 찍은 앱 화면이다(실사용자 데이터 없음).
 * 의존: playwright-core(없으면 PLAYWRIGHT_DIR=<node_modules 가 있는 폴더>) + 설치된 Chromium(`npx playwright install chromium`). CHROME 로 실행 파일 지정 가능.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const set = process.argv[2];
if (!set) { console.error('사용: node build.mjs <세트폴더>'); process.exit(1); }
const dir = path.join(here, set);
const slides = JSON.parse(fs.readFileSync(path.join(dir, 'slides.json'), 'utf8'));

let chromium;
try {
  // ESM 은 NODE_PATH 를 안 본다 — 다른 곳에 설치했다면 PLAYWRIGHT_DIR(그 node_modules 를 가진 폴더)로 지정.
  ({ chromium } = process.env.PLAYWRIGHT_DIR
    ? createRequire(path.join(process.env.PLAYWRIGHT_DIR, 'x.js'))('playwright-core')
    : await import('playwright-core'));
} catch {
  console.error('playwright-core 가 없습니다. PLAYWRIGHT_DIR 로 설치 위치를 지정하거나 `npm i --no-save playwright-core` 후 실행하세요.');
  process.exit(1);
}
function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  // 최신 버전부터, 실행 파일이 실제로 있는 것(폴더만 남은 버전이 있다)
  for (const d of fs.readdirSync(base).filter((x) => /^chromium-\d+$/.test(x)).sort().reverse()) {
    for (const sub of ['chrome-mac', 'chrome-mac-arm64']) {
      const exe = path.join(base, d, sub, 'Chromium.app/Contents/MacOS/Chromium');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

const SIZES = [
  { out: 'ios-65', w: 414, h: 896, phoneTop: 268 },     // ×3 = 1242x2688
  { out: 'play-phone', w: 414, h: 736, phoneTop: 238 }, // ×3 = 1242x2208
];

const b = await chromium.launch({ executablePath: chromePath() });
const page = await b.newPage({ deviceScaleFactor: 3 });
const tpl = pathToFileURL(path.join(here, 'template.html')).href;
for (const s of SIZES) {
  fs.mkdirSync(path.join(dir, s.out), { recursive: true });
  await page.setViewportSize({ width: s.w, height: s.h });
  for (const [i, sl] of slides.entries()) {
    await page.goto(tpl);
    await page.evaluate(({ sl, s, img }) => {
      document.documentElement.style.setProperty('--w', `${s.w}px`);
      document.documentElement.style.setProperty('--h', `${s.h}px`);
      document.documentElement.style.setProperty('--phoneTop', `${s.phoneTop}px`);
      document.getElementById('t').innerHTML = sl.title;
      document.getElementById('s').textContent = sl.sub;
      document.getElementById('img').src = img;
    }, { sl, s, img: pathToFileURL(path.join(dir, 'src', sl.src)).href });
    await page.waitForFunction(() => document.getElementById('img').complete && document.fonts.status === 'loaded');
    const file = path.join(dir, s.out, `${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
}

// Play 피처 그래픽 1024x500
fs.mkdirSync(path.join(dir, 'play-feature'), { recursive: true });
await page.setViewportSize({ width: 1024, height: 500 });
await page.goto(pathToFileURL(path.join(here, 'feature.html')).href);
await page.evaluate((img) => { document.getElementById('img').src = img; }, pathToFileURL(path.join(dir, 'src', slides[0].src)).href);
await page.waitForFunction(() => document.getElementById('img').complete);
// deviceScaleFactor 3 이면 3072px 이 되므로 1배율 페이지로 다시 찍는다
const p1 = await b.newPage({ deviceScaleFactor: 1, viewport: { width: 1024, height: 500 } });
await p1.goto(pathToFileURL(path.join(here, 'feature.html')).href);
await p1.evaluate((img) => { document.getElementById('img').src = img; }, pathToFileURL(path.join(dir, 'src', slides[0].src)).href);
await p1.waitForFunction(() => document.getElementById('img').complete && document.fonts.status === 'loaded');
await p1.screenshot({ path: path.join(dir, 'play-feature', 'feature.png') });
console.log(path.join(dir, 'play-feature', 'feature.png'));
await b.close();
