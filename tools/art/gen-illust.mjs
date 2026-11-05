#!/usr/bin/env node
// 대화창 일러스트를 Google Gemini 그림 AI 로 만들기 → client/public/assets/illust/<인물>.png
//
// 준비: 프로젝트 맨 위 .env 파일에  GEMINI_API_KEY=발급받은키   (https://aistudio.google.com/apikey)
// 실행: npm run gen:illust                      → 아직 없는 인물만 (이미 만든 건 건너뜀)
//       npm run gen:illust -- --only mom,rival_f   → 골라서
//       npm run gen:illust -- --force --only mom   → 다시 그리기
//       npm run gen:illust -- --dry               → API 를 부르지 않고 보낼 프롬프트만 출력 (확인용)
//       npm run gen:illust -- --model gemini-3-pro-image   → 모델 바꾸기 (기본: GEMINI_IMAGE_MODEL 또는 아래 DEFAULT_MODEL)
//
// 어떻게 일관성을 맞추나: 게임의 도트 초상(같은 머리 · 옷 색)을 참고 그림으로 같이 보내고,
// shared/data/illust.json 의 성격 · 포즈 · 표정을 글로 설명 → 모든 인물이 같은 화풍(STYLE)으로 나옴
// 배경은 흰색으로 그리게 하고, 게임이 불러올 때 테두리부터 흰 배경을 지워서 투명하게 씀 (client/src/ui/Illust.ts)
// 결과 목록: client/public/assets/illust/index.json (게임 · 테스트 페이지가 이걸 보고 그림/임시 SVG 를 고름)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LOOKS } from './looks.mjs';
import { buildPortrait } from './portrait.mjs';
import { Img } from './lib/img.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../..');
const OUT = join(ROOT, 'client/public/assets/illust');
const SPEC = JSON.parse(readFileSync(join(ROOT, 'shared/data/illust.json'), 'utf8'));
const DEFAULT_MODEL = 'gemini-3.1-flash-image';   // 안 되면 --model 로 바꾸기 (예: gemini-nano-banana-2.1, gemini-2.5-flash-image)

// ── .env 읽기 (dotenv 없이) ──
for (const f of ['.env', '.env.local']) {
  const p = join(ROOT, f); if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) { const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"#]*)"?\s*$/.exec(line); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); }
}
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes('--dry'), FORCE = args.includes('--force');
const MODEL = opt('--model') ?? process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;
const ONLY = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const KEY = process.env.GEMINI_API_KEY;
if (!DRY && !KEY) { console.error('✖ GEMINI_API_KEY 가 없어요. 프로젝트 맨 위 .env 파일에 GEMINI_API_KEY=키 를 넣어 주세요. (확인만 하려면 --dry)'); process.exit(1); }

const POSE = {
  wave: 'raising one hand and waving warmly at the viewer',
  cross: 'arms crossed firmly over the chest',
  hips: 'one hand on the hip, confident stance',
  think: 'one hand on the chin, thinking',
  cheer: 'one fist pumped up in the air, excited',
  point: 'pointing a finger straight at the viewer, challenging',
  clasp: 'both hands clasped together in front of the chest',
  behind: 'both hands held behind the back, relaxed and dignified',
};
const FACE = { smile: 'a bright smile', grin: 'a big toothy grin', calm: 'a calm, slight smile', smug: 'a confident smirk', gentle: 'a soft, gentle smile with kind eyes', serious: 'a serious, focused expression' };
const STYLE = 'High-quality anime visual-novel character illustration for a cozy original monster-collecting farm RPG. Waist-up bust portrait, body turned slightly toward the viewer, clean crisp lineart, soft cel shading with gentle highlights, vibrant warm palette, expressive large eyes. Single character only, centered, head near the top with a little margin. Plain flat pure white background (#FFFFFF), no shadow on the background, no text, no logo, no border, no watermark. Original character design (not from any existing franchise).';

function prompt(id) {
  const s = SPEC[id], L = LOOKS[id];
  const extras = [L.glasses && 'wears round glasses', L.beard && 'has a beard', L.hat && `wears a ${L.hat} hat`, `hair style: ${L.hairStyle}`, `outfit: ${L.outfit} with ${L.sleeves} sleeves`].filter(Boolean).join(', ');
  return `${STYLE}\nCharacter: ${s.persona}. ${extras}.\nPose: ${POSE[s.pose] ?? POSE.wave}. Expression: ${FACE[s.face] ?? FACE.smile}.\nThe attached small pixel-art portrait is the in-game sprite of this exact character: keep the same hair color, skin tone, outfit colors and accessories, but redraw it as a detailed high-resolution illustration (do not keep the pixel style).`;
}
/** 도트 초상을 4배로 키운 PNG (참고 그림) */
function referencePng(id) {
  const p = buildPortrait(LOOKS[id]), k = 4, big = new Img(p.w * k, p.h * k);
  for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) { const s = (Math.floor(y / k) * p.w + Math.floor(x / k)) * 4, d = (y * big.w + x) * 4; for (let c = 0; c < 4; c++) big.d[d + c] = p.d[s + c]; if (!big.d[d + 3]) { big.d[d] = big.d[d + 1] = big.d[d + 2] = 255; big.d[d + 3] = 255; } }
  return Buffer.from(big.toPNG()).toString('base64');
}

/** 응답 JSON 어디에 있든 이미지(base64) 를 찾아 꺼냄 (generateContent · Interactions 둘 다) */
function findImage(o) {
  if (!o || typeof o !== 'object') return null;
  const mime = o.mimeType ?? o.mime_type;
  if (typeof o.data === 'string' && typeof mime === 'string' && mime.startsWith('image/')) return { data: o.data, mime };
  for (const v of Object.values(o)) { const r = findImage(v); if (r) return r; }
  return null;
}
async function callGenerateContent(text, ref) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text }, { inline_data: { mime_type: 'image/png', data: ref } }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:4' } } }) });
}
async function callInteractions(text, ref) {
  return fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
    body: JSON.stringify({ model: MODEL, input: [{ type: 'text', text }, { type: 'image', mime_type: 'image/png', data: ref }], response_format: { type: 'image', mime_type: 'image/png', aspect_ratio: '3:4' } }) });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let api = process.env.GEMINI_API_STYLE === 'interactions' ? 'interactions' : 'generate';
async function generate(id) {
  const text = prompt(id), ref = referencePng(id);
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try { res = await (api === 'generate' ? callGenerateContent(text, ref) : callInteractions(text, ref)); }
    catch (e) { throw new Error(`인터넷 연결 실패 (${e.cause?.code ?? e.message}) — 방화벽 · 프록시를 확인하세요`); }
    const body = await res.text();
    if (res.ok) {
      let json; try { json = JSON.parse(body); } catch { throw new Error('응답이 JSON 이 아니에요'); }
      const img = findImage(json);
      if (!img) throw new Error(`이미지가 없는 응답 (안전 필터 등): ${body.slice(0, 300)}`);
      return img;
    }
    // 이 방식(엔드포인트)을 모르는 모델이면 다른 방식으로 한 번 바꿔 봄
    if ((res.status === 404 || res.status === 400) && attempt === 0) { api = api === 'generate' ? 'interactions' : 'generate'; console.log(`  ↻ ${res.status} → ${api} 방식으로 다시 시도`); continue; }
    if (res.status === 429 || res.status >= 500) { const w = 4000 * 2 ** attempt; console.log(`  … ${res.status}, ${w / 1000}초 후 다시`); await sleep(w); continue; }
    throw new Error(`API 오류 ${res.status}: ${body.slice(0, 400)}`);
  }
  throw new Error('여러 번 시도했지만 실패');
}

const ids = (ONLY ?? Object.keys(SPEC)).filter((id) => { if (!SPEC[id] || !LOOKS[id]) { console.warn(`? 모르는 인물: ${id}`); return false; } return true; });
mkdirSync(OUT, { recursive: true });
const indexPath = join(OUT, 'index.json');
const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { ids: [], files: {} };
index.files ??= {};
let made = 0, failed = 0;
console.log(`🎨 Gemini 일러스트 — 모델 ${MODEL} · ${ids.length}명${DRY ? ' (dry: API 호출 안 함)' : ''}`);
for (const id of ids) {
  const done = index.ids.includes(id) && existsSync(join(OUT, index.files[id] ?? `${id}.png`));
  if (done && !FORCE) { console.log(`· ${id} 이미 있음 (다시 그리려면 --force)`); continue; }
  if (DRY) { console.log(`\n── ${id} (${SPEC[id].name}) ──\n${prompt(id)}`); continue; }
  process.stdout.write(`▶ ${id} (${SPEC[id].name}) … `);
  try {
    const img = await generate(id);
    const ext = img.mime.includes('png') ? 'png' : img.mime.includes('webp') ? 'webp' : 'jpg';
    const file = `${id}.${ext}`;
    writeFileSync(join(OUT, file), Buffer.from(img.data, 'base64'));
    if (!index.ids.includes(id)) index.ids.push(id);
    index.files[id] = file; index.model = MODEL; index.updatedAt = new Date().toISOString();
    writeFileSync(indexPath, JSON.stringify(index, null, 1));
    console.log(`✔ ${file}`); made++;
    await sleep(1500);
  } catch (e) { console.log(`✖ ${e.message}`); failed++; }
}
console.log(`\n완료: 새로 ${made}장 · 실패 ${failed} — 확인: npm run dev 후 http://localhost:5173/?illust`);
