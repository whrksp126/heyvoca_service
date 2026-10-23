#!/usr/bin/env node
/**
 * screenshots.mjs — 스토어 스크린샷 조회·다운로드·업로드 CLI (의존성 0).
 *
 * asc.mjs / play.mjs 와 같은 자격증명을 쓴다(env 로만):
 *   ASC_KEY_ID, ASC_ISSUER_ID, (선택) ASC_KEY_PATH, ASC_BUNDLE_ID
 *   PLAY_SA_JSON (기본 ~/other/secrets/play/service-account.json), PLAY_PKG
 * 다른 워커가 asc.mjs/play.mjs 를 고치는 중일 수 있어 인증 헬퍼를 복제해 별도 파일로 둔다.
 *
 * 사용:
 *   node screenshots.mjs list                         두 스토어의 현재 스크린샷 요약
 *   node screenshots.mjs download --out <dir>         현재 스크린샷을 <dir>/{ios,android}/ 로 저장
 *   node screenshots.mjs upload-ios --dir <dir> --locale ko --display APP_IPHONE_67 [--yes]
 *       <dir> 안 *.png 를 이름순으로, 해당 로케일·기기 세트를 **교체**한다(기존 삭제 후 업로드).
 *       대상 버전은 편집 가능한 버전(PREPARE_FOR_SUBMISSION 등) — 게시된 버전은 Apple 이 막는다.
 *   node screenshots.mjs upload-play --dir <dir> --lang ko-KR --type phoneScreenshots [--yes]
 *       type: phoneScreenshots | sevenInchScreenshots | tenInchScreenshots | featureGraphic
 *       edit 하나에서 deleteall → upload → commit(changesInReviewBehavior=ERROR_IF_IN_REVIEW).
 *
 * 안전 규율: list/download 는 읽기 전용. upload-* 는 `--yes` 없으면 계획만 출력한다.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const cmd = argv[0];
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const YES = argv.includes('--yes');
function die(msg) { console.error(msg); process.exit(1); }

// ---------- App Store Connect ----------
const BUNDLE_ID = process.env.ASC_BUNDLE_ID || 'com.ghmate.heyvoca';
const ASC = 'https://api.appstoreconnect.apple.com';

function ascToken() {
  const keyId = process.env.ASC_KEY_ID; const issuer = process.env.ASC_ISSUER_ID;
  if (!keyId || !issuer) die('ASC_KEY_ID / ASC_ISSUER_ID env 가 필요합니다(README 참고).');
  const keyPath = process.env.ASC_KEY_PATH || path.join(os.homedir(), '.appstoreconnect', 'private_keys', `AuthKey_${keyId}.p8`);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'ES256', kid: keyId, typ: 'JWT' });
  const body = b64({ iss: issuer, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' });
  const sig = crypto.createSign('SHA256').update(`${head}.${body}`)
    .sign({ key: fs.readFileSync(keyPath, 'utf8'), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  return `${head}.${body}.${sig}`;
}

async function asc(pathname, init = {}) {
  const res = await fetch(pathname.startsWith('http') ? pathname : `${ASC}${pathname}`, {
    ...init, headers: { Authorization: `Bearer ${ascToken()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) { /* noop */ }
  if (!res.ok) throw new Error(`ASC ${res.status} ${pathname}\n  ${json?.errors?.map((e) => `${e.title}: ${e.detail}`).join(' / ') || text.slice(0, 300)}`);
  return json;
}

async function ascVersions() {
  const app = (await asc(`/v1/apps?filter[bundleId]=${encodeURIComponent(BUNDLE_ID)}&limit=1`))?.data?.[0];
  if (!app) die(`앱 없음: ${BUNDLE_ID}`);
  const r = await asc(`/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=5`);
  return (r?.data || []).map((v) => ({ id: v.id, version: v.attributes.versionString, state: v.attributes.appVersionState || v.attributes.appStoreState }));
}

// 버전 → 로케일 → 기기 세트 → 스크린샷
async function ascTree(versionId) {
  const out = [];
  const locs = (await asc(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?limit=50`))?.data || [];
  for (const l of locs) {
    const sets = (await asc(`/v1/appStoreVersionLocalizations/${l.id}/appScreenshotSets?limit=50`))?.data || [];
    const loc = { id: l.id, locale: l.attributes.locale, sets: [] };
    for (const s of sets) {
      const shots = (await asc(`/v1/appScreenshotSets/${s.id}/appScreenshots?limit=50`))?.data || [];
      loc.sets.push({
        id: s.id, display: s.attributes.screenshotDisplayType,
        shots: shots.map((x) => ({
          id: x.id, name: x.attributes.fileName,
          w: x.attributes.imageAsset?.width, h: x.attributes.imageAsset?.height,
          url: x.attributes.imageAsset?.templateUrl
            ?.replace('{w}', x.attributes.imageAsset.width).replace('{h}', x.attributes.imageAsset.height)
            .replace('{f}', 'png').replace('{c}', ''),
          state: x.attributes.assetDeliveryState?.state,
        })),
      });
    }
    out.push(loc);
  }
  return out;
}

// ---------- Google Play ----------
const PKG = process.env.PLAY_PKG || 'com.ghmate.heyvoca';
const PLAY = 'https://androidpublisher.googleapis.com/androidpublisher/v3';
const PLAY_UP = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3';
const PLAY_TYPES = ['phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots', 'featureGraphic', 'icon'];
let playTok = null;

async function playToken() {
  if (playTok) return playTok;
  const p = process.env.PLAY_SA_JSON || path.join(os.homedir(), 'other', 'secrets', 'play', 'service-account.json');
  const sa = JSON.parse(fs.readFileSync(p, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = b64({ alg: 'RS256', typ: 'JWT' });
  const body = b64({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(sa.private_key).toString('base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) die(`Play 토큰 실패: ${j.error_description || j.error}`);
  return (playTok = j.access_token);
}

async function play(url, init = {}) {
  const res = await fetch(url.startsWith('http') ? url : `${PLAY}${url}`, {
    ...init, headers: { Authorization: `Bearer ${await playToken()}`, ...(init.body && !init.headers ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (_) { /* noop */ }
  if (!res.ok) throw new Error(`Play ${res.status} ${url}\n  ${json?.error?.message || text.slice(0, 300)}`);
  return json;
}

async function withEdit(fn, { commit = false } = {}) {
  const edit = await play(`/applications/${PKG}/edits`, { method: 'POST', body: '{}' });
  try {
    const r = await fn(edit.id);
    if (commit) await play(`/applications/${PKG}/edits/${edit.id}:commit?changesInReviewBehavior=ERROR_IF_IN_REVIEW`, { method: 'POST' });
    else await play(`/applications/${PKG}/edits/${edit.id}`, { method: 'DELETE' });
    return r;
  } catch (e) {
    await play(`/applications/${PKG}/edits/${edit.id}`, { method: 'DELETE' }).catch(() => {});
    throw e;
  }
}

async function playTree() {
  return withEdit(async (eid) => {
    const listings = (await play(`/applications/${PKG}/edits/${eid}/listings`))?.listings || [];
    const out = [];
    for (const l of listings) {
      const types = {};
      for (const t of PLAY_TYPES) {
        types[t] = (await play(`/applications/${PKG}/edits/${eid}/listings/${l.language}/${t}`))?.images || [];
      }
      out.push({ lang: l.language, title: l.title, types });
    }
    return out;
  });
}

// ---------- commands ----------
async function cmdList({ download } = {}) {
  const outDir = download ? opt('out') : null;
  if (download && !outDir) die('--out <dir> 필요');
  const get = async (url, file) => {
    const r = await fetch(url); if (!r.ok) throw new Error(`다운로드 실패 ${r.status} ${url}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  };

  if (!argv.includes('--play-only')) {
    const vs = await ascVersions();
    console.log('== App Store ==');
    for (const v of vs.slice(0, argv.includes('--all-versions') ? 5 : 1)) {
      console.log(`버전 ${v.version} (${v.state})`);
      for (const loc of await ascTree(v.id)) {
        for (const s of loc.sets) {
          console.log(`  ${loc.locale} ${s.display}: ${s.shots.length}장 ${s.shots.map((x) => `${x.w}x${x.h}`).join(' ')}`);
          if (outDir) for (const [i, x] of s.shots.entries()) {
            await get(x.url, path.join(outDir, 'ios', v.version, loc.locale, s.display, `${String(i + 1).padStart(2, '0')}.png`));
          }
        }
      }
    }
  }
  if (!argv.includes('--ios-only')) {
    console.log('== Google Play ==');
    for (const l of await playTree()) {
      console.log(`  ${l.lang} "${l.title}"`);
      for (const [t, imgs] of Object.entries(l.types)) {
        if (!imgs.length) continue;
        console.log(`    ${t}: ${imgs.length}장`);
        if (outDir) for (const [i, img] of imgs.entries()) {
          await get(`${img.url}=s0`, path.join(outDir, 'android', l.lang, t, `${String(i + 1).padStart(2, '0')}.png`));
        }
      }
    }
  }
  if (outDir) console.log(`저장: ${outDir}`);
}

function pngs(dir) {
  if (!dir || !fs.existsSync(dir)) die(`--dir 없음: ${dir}`);
  const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => path.join(dir, f));
  if (!files.length) die(`이미지 없음: ${dir}`);
  return files;
}

const EDITABLE = new Set(['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'READY_FOR_REVIEW', 'INVALID_BINARY']);

async function cmdUploadIos() {
  const files = pngs(opt('dir'));
  const locale = opt('locale', 'ko'); const display = opt('display', 'APP_IPHONE_67');
  const vs = await ascVersions();
  const v = opt('version') ? vs.find((x) => x.version === opt('version')) : vs.find((x) => EDITABLE.has(x.state));
  if (!v) die(`편집 가능한 버전이 없습니다. 현재: ${vs.map((x) => `${x.version}(${x.state})`).join(', ')}\n  → 먼저 asc.mjs prepare 로 새 버전을 만드세요.`);
  const loc = (await ascTree(v.id)).find((l) => l.locale === locale);
  if (!loc) die(`로케일 ${locale} 없음`);
  const set = loc.sets.find((s) => s.display === display);
  console.log(`대상: ${v.version}(${v.state}) ${locale} ${display} — 기존 ${set?.shots.length || 0}장 삭제 → 새 ${files.length}장`);
  files.forEach((f) => console.log(`  ${path.basename(f)}`));
  if (!YES) { console.log('(--yes 없음: 계획만 출력)'); return; }

  let setId = set?.id;
  if (setId) for (const x of set.shots) await asc(`/v1/appScreenshots/${x.id}`, { method: 'DELETE' });
  else {
    setId = (await asc('/v1/appScreenshotSets', { method: 'POST', body: JSON.stringify({ data: {
      type: 'appScreenshotSets', attributes: { screenshotDisplayType: display },
      relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } },
    } }) })).data.id;
  }
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const res = (await asc('/v1/appScreenshots', { method: 'POST', body: JSON.stringify({ data: {
      type: 'appScreenshots', attributes: { fileName: path.basename(f), fileSize: buf.length },
      relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: setId } } },
    } }) })).data;
    for (const op of res.attributes.uploadOperations) {
      const r = await fetch(op.url, {
        method: op.method, headers: Object.fromEntries(op.requestHeaders.map((h) => [h.name, h.value])),
        body: buf.subarray(op.offset, op.offset + op.length),
      });
      if (!r.ok) throw new Error(`업로드 조각 실패 ${r.status} ${path.basename(f)}`);
    }
    const md5 = crypto.createHash('md5').update(buf).digest('hex');
    await asc(`/v1/appScreenshots/${res.id}`, { method: 'PATCH', body: JSON.stringify({ data: {
      type: 'appScreenshots', id: res.id, attributes: { uploaded: true, sourceFileChecksum: md5 },
    } }) });
    console.log(`  ✔ ${path.basename(f)}`);
  }
  console.log('완료 — 처리(COMPLETE)까지 수 분 걸린다. `list` 로 재조회.');
}

async function cmdUploadPlay() {
  const files = pngs(opt('dir'));
  const lang = opt('lang', 'ko-KR'); const type = opt('type', 'phoneScreenshots');
  if (!PLAY_TYPES.includes(type)) die(`type 은 ${PLAY_TYPES.join(' | ')}`);
  console.log(`대상: ${PKG} ${lang} ${type} — 기존 전부 삭제 → 새 ${files.length}장`);
  files.forEach((f) => console.log(`  ${path.basename(f)}`));
  if (!YES) { console.log('(--yes 없음: 계획만 출력)'); return; }
  await withEdit(async (eid) => {
    await play(`/applications/${PKG}/edits/${eid}/listings/${lang}/${type}`, { method: 'DELETE' });
    for (const f of files) {
      await play(`${PLAY_UP}/applications/${PKG}/edits/${eid}/listings/${lang}/${type}?uploadType=media`, {
        method: 'POST', headers: { 'Content-Type': 'image/png' }, body: fs.readFileSync(f),
      });
      console.log(`  ✔ ${path.basename(f)}`);
    }
  }, { commit: true });
  console.log('커밋 완료 — `list --play-only` 로 재조회.');
}

const CMDS = {
  list: () => cmdList(),
  download: () => cmdList({ download: true }),
  'upload-ios': cmdUploadIos,
  'upload-play': cmdUploadPlay,
};
if (!CMDS[cmd]) die('사용: node screenshots.mjs list | download --out <dir> | upload-ios ... | upload-play ...');
CMDS[cmd]().catch((e) => die(e.message));
