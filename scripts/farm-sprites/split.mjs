// 동작 시트 → 프레임 PNG: node split.mjs chicken 2 4  (행마다 개체 감지, 기준선 유지, 같은 배율)
import fs from 'node:fs'; import sharp from 'sharp';
const [id, R, C] = [process.argv[2], +process.argv[3], +process.argv[4]];
const dir = new URL('../../heyvoca_front/src/assets/farm2/', import.meta.url).pathname;
const sheet = fs.readFileSync(dir + `_sheet_${id}_sheet.png`); const { width, height } = await sharp(sheet).metadata();
const rh = Math.floor(height / R); const frames = [];
for (let r = 0; r < R; r++) {
  const row = await sharp(sheet).extract({ left: 0, top: r * rh, width, height: rh }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = row; const on = x => { for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 20) return true; return false; };
  let runs = [], st = -1, gap = 0;
  for (let x = 0; x <= info.width; x++) { const o = x < info.width && on(x); if (o) { if (st < 0) st = x; gap = 0; } else if (st >= 0 && ++gap >= 10) { runs.push([st, x - gap + 1]); st = -1; gap = 0; } }
  runs = runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, C).sort((a, b) => a[0] - b[0]);
  for (const [l, rr] of runs) frames.push(await sharp(sheet).extract({ left: Math.max(0, l - 4), top: r * rh, width: Math.min(width, rr + 4) - Math.max(0, l - 4), height: rh }).png().toBuffer());
}
const k = 200 / rh; // 행 높이 → 200px 같은 배율, 기준선(행 아래쪽) 유지
for (let i = 0; i < frames.length; i++) { const m = await sharp(frames[i]).metadata(); await sharp(frames[i]).resize(Math.round(m.width * k), 200).png().toFile(dir + `${id}_f${i}.png`); }
console.log(id, 'frames', frames.length);
