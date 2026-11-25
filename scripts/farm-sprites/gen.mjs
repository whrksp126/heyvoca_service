// 농장 스프라이트 생성: node gen.mjs [crop|item] [id...]  (기본: 전부, 이미 있으면 건너뜀. --force 로 재생성)
// 키는 heyvoca_admin/.env 의 OPENAI_API_KEY 를 파일에서 읽는다(출력하지 않음).
import fs from 'node:fs'; import path from 'node:path'; import sharp from 'sharp';
const here = path.dirname(new URL(import.meta.url).pathname);
const env = fs.readFileSync(path.join(here, '../../../heyvoca_admin/.env'), 'utf8');
const KEY = (env.match(/^OPENAI_API_KEY=(.*)$/m) || [])[1]?.replace(/["']/g, '').trim();
const MODEL = process.env.IMG_MODEL || 'gpt-image-2.6-sunburst';
const OUT = path.join(here, '../../heyvoca_front/src/assets/farm2');
const jobs = JSON.parse(fs.readFileSync(path.join(here, 'jobs.json'), 'utf8'));
const STYLE = 'Mobile casual 2.5D game asset in EXACTLY the same art style, colors, outline weight and soft shading as the reference images ' +
  '(warm earthy browns, fresh yellow-green, soft top-left light, gentle highlight, small soft shadow). Isometric 2:1 game view (classic cozy farm game), soft volume and depth, chunky rounded cute shapes. ' +
  'Single object only, centered, fully visible, transparent background, no text, no ground plane except a tiny contact shadow. Not pixel art.';
const args = process.argv.slice(2); const force = args.includes('--force');
const [kind, ...ids] = args.filter(a => !a.startsWith('--'));

async function edit(prompt, size, bg = 'transparent', extraRefs = []) {
  const fd = new FormData();
  fd.append('model', MODEL); fd.append('prompt', prompt); fd.append('size', size);
  fd.append('background', bg); fd.append('quality', process.env.IMG_QUALITY || 'medium');
  for (const r of [...jobs.refs, ...extraRefs]) fd.append('image[]', new Blob([fs.readFileSync(path.join(here, r))], { type: 'image/png' }), path.basename(r));
  const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd });
  const j = await res.json(); if (!res.ok) throw new Error(j.error?.message || res.status); if (j.usage) fs.appendFileSync(path.join(here, "usage.log"), JSON.stringify({ model: MODEL, size, usage: j.usage }) + "\n");
  return Buffer.from(j.data[0].b64_json, 'base64');
}
// 투명 여백 잘라내고 긴 변 기준 축소 → 바닥 중앙 앵커가 이미지 하단 중앙이 되게
const finish = (buf, file, max = 256) => sharp(buf).trim().resize(max, max, { fit: 'inside', withoutEnlargement: true }).png().toFile(file);

// 불투명 픽셀이 있는 열 구간 → 작은 틈(<12px)은 합치고 큰 순 4개를 x순으로
async function objectRuns(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const runs = []; let st = -1, gap = 0;
  for (let x = 0; x <= info.width; x++) {
    let on = false; if (x < info.width) for (let y = 0; y < info.height; y++) if (data[(y * info.width + x) * 4 + 3] > 20) { on = true; break; }
    if (on) { if (st < 0) st = x; gap = 0; } else if (st >= 0 && ++gap >= 12) { runs.push([st, x - gap + 1]); st = -1; gap = 0; }
  }
  if (st >= 0) runs.push([st, info.width]);
  return runs.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 4).sort((a, b) => a[0] - b[0]);
}
async function crop(id, desc) {
  const files = [0, 1, 2, 3].map(i => path.join(OUT, `${id}_${i}.png`));
  if (!force && files.every(f => fs.existsSync(f))) return console.log('skip', id);
  const cached = path.join(OUT, `_sheet_${id}.png`);
  const sheet = !force && fs.existsSync(cached) ? fs.readFileSync(cached) : await edit(`${STYLE} A horizontal sprite sheet of 4 equally spaced growth stages of a ${desc}, left to right: ` +
    '1) seed mound with tiny seed, 2) small sprout, 3) leafy young plant, 4) fully grown with harvest. Match the carrot stage references in size progression.', '1536x1024');
  fs.writeFileSync(path.join(OUT, `_sheet_${id}.png`), sheet);
  const runs = await objectRuns(sheet);
  if (runs.length !== 4) throw new Error(`단계 4개를 못 찾음(${runs.length}) — _sheet_${id}.png 확인`);
  // 단계 간 크기 비율 유지: 가장 큰 단계 높이를 192px 로 맞추는 같은 배율을 모두에 적용
  const parts = [];
  for (const [l, r] of runs) parts.push(await sharp(await sharp(sheet).extract({ left: l, top: 0, width: r - l, height: 1024 }).toBuffer()).trim().toBuffer({ resolveWithObject: true }));
  const k = Math.min(1, 192 / Math.max(...parts.map(p => p.info.height)));
  for (let i = 0; i < 4; i++) await sharp(parts[i].data).resize(Math.max(1, Math.round(parts[i].info.width * k))).png().toFile(files[i]);
  console.log('ok', id);
}
async function item(id, desc) {
  const file = path.join(OUT, `${id}.png`); if (!force && fs.existsSync(file)) return console.log('skip', id);
  const big = /2x2/.test(desc);
  await finish(await edit(`${STYLE} The object: ${desc}.`, '1024x1024'), file, big ? 384 : 224); console.log('ok', id);
}
// 밭 재료: 다듬기 없이 그대로 축소(타일·9분할용)
async function tile(id, t) {
  const file = path.join(OUT, `${id}.png`); if (!force && fs.existsSync(file)) return console.log('skip', id);
  const buf = await edit(t.raw ? t.prompt : `${STYLE.replace('Single object only, centered, fully visible, transparent background, no text, no ground plane except a tiny contact shadow.', '')} ${t.prompt}`, t.size || '1024x1024', t.bg || 'transparent', (t.refs || []).map(r => '../../heyvoca_front/src/assets/farm2/' + r));
  fs.writeFileSync(path.join(OUT, `_sheet_${id}.png`), buf);
  if (t.sheet) return console.log('ok sheet', id);
  await sharp(buf).resize(t.max, t.max).png().toFile(file); console.log('ok', id);
}
if (!KEY) throw new Error('OPENAI_API_KEY 없음');
fs.mkdirSync(OUT, { recursive: true });
for (const [k, map, fn] of [['crop', jobs.crops, crop], ['item', jobs.items, item], ['tile', jobs.tiles || {}, tile]]) {
  if (kind && kind !== k) continue;
  for (const [id, desc] of Object.entries(map)) if (!ids.length || ids.includes(id)) {
    try { await fn(id, desc); } catch (e) { console.error('FAIL', id, e.message); }
  }
}
