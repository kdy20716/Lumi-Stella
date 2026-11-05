// 루미나 지방 확장 아트: 바이옴 타일셋 · 새 나무/소품 · 동굴 배경 · 배틀 배경 · 지방 지도
import { Img, mix, darken, lighten, hash2, fbm, vnoise, rng, rgba } from './lib/img.mjs';
import { P } from './lib/palette.mjs';
import { sfbm } from './worldmap.mjs';
import { ROW } from './tiles.mjs';
import { buildGraph } from '../map/region-graph.mjs';
import { caveLayout, caveExits } from '../map/cavegen.mjs';
import { WORLD_W, WORLD_H, ROUTES } from '../map/region-spec.mjs';

const O = P.outline;
const T = 16;

// ── 색 변환 (HSL) ───────────────────────────────────────
function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
}
const isGreen = ([h, s]) => h >= 62 && h <= 165 && s > 0.18;
const isBrown = ([h, s, l]) => h >= 14 && h <= 50 && s > 0.2 && l > 0.2;
const isBlue = ([h, s]) => h >= 185 && h <= 235 && s > 0.3;

/** 바이옴별 변환: [잔디, 흙길, 물] 각각 hsl → hsl (원래 밝기 l 을 0..1 로 받아 새 색) */
const remapL = (l, lo, hi) => lo + (hi - lo) * Math.max(0, Math.min(1, (l - 0.2) / 0.55));
export const BIOME_TINT = {
  forest: { grass: ([h, s, l]) => [h + 6, s * 0.95, l * 0.86], dirt: ([h, s, l]) => [h - 4, s * 0.9, l * 0.86] },
  beach: { grass: ([h, s, l]) => [h - 22, s * 0.82, l * 1.06], dirt: ([, s, l]) => [42, s * 0.75, remapL(l, 0.62, 0.86)] },
  rocky: { grass: ([h, s, l]) => [h - 30, s * 0.42, l * 0.98], dirt: ([, s, l]) => [30, s * 0.28, l * 0.92] },
  snow: { grass: ([, , l]) => [208, 0.32, remapL(l, 0.74, 0.97)], dirt: ([, , l]) => [215, 0.16, remapL(l, 0.56, 0.74)], water: ([h, s, l]) => [h - 6, s * 0.55, Math.min(0.9, l * 1.18)] },
  desert: { grass: ([, , l]) => [40, 0.58, remapL(l, 0.6, 0.84)], dirt: ([, , l]) => [28, 0.52, remapL(l, 0.46, 0.66)], water: ([h, s, l]) => [h - 20, s * 0.9, l * 1.05] },
  swamp: { grass: ([h, s, l]) => [h - 28, s * 0.62, l * 0.8], dirt: ([h, s, l]) => [h - 2, s * 0.7, l * 0.68], water: ([, s, l]) => [168, s * 0.55, l * 0.72] },
  volcano: { grass: ([, , l]) => [14, 0.12, remapL(l, 0.2, 0.42)], dirt: ([, , l]) => [10, 0.38, remapL(l, 0.26, 0.42)], water: ([h, s, l]) => [h + 8, s * 0.7, l * 0.7] },
  city: { grass: ([h, s, l]) => [h + 2, s * 1.02, l * 1.03] },
  distortion: { grass: ([, s, l]) => [272, s * 0.5, remapL(l, 0.22, 0.46)], dirt: ([, , l]) => [250, 0.18, remapL(l, 0.3, 0.5)], water: ([, s, l]) => [285, s * 0.8, l * 0.62] },
};
const SKIP_ROWS = new Set([ROW.WOOD, ROW.TILLED, ROW.TILLED_WET, ROW.MISC]);
const DIRT_ROWS = new Set([ROW.DIRT, ROW.GRASS_DIRT, ROW.DECOR]);

function recolor(img, fn) {
  const out = img.clone();
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const c = img.get(x, y); if (!c[3]) continue;
    const n = fn(toHsl(c), x, y); if (!n) continue;
    out.put(x, y, [...fromHsl([n[0], Math.min(1, n[1]), Math.min(1, n[2])]), c[3]]);
  }
  return out;
}
export function biomeTileset(ts, biome) {
  const t = BIOME_TINT[biome];
  return recolor(ts, (hsl, x, y) => {
    const row = Math.floor(y / T);
    if (SKIP_ROWS.has(row)) return null;
    if (isGreen(hsl)) return t.grass?.(hsl) ?? null;
    if (t.dirt && DIRT_ROWS.has(row) && isBrown(hsl)) return t.dirt(hsl);
    return null;
  });
}
export const biomeWater = (img, biome) => (BIOME_TINT[biome].water ? recolor(img, (hsl) => (isBlue(hsl) || hsl[1] < 0.25 ? BIOME_TINT[biome].water(hsl) : null)) : null);
/** 덤불/풀 같은 오브젝트도 바이옴 색으로 (눈·사막·화산·뒤집힌 세계) */
export const biomeObject = (img, biome) => recolor(img, (hsl) => (isGreen(hsl) ? BIOME_TINT[biome].grass(hsl) : null));

// ── 새 나무 · 소품 ──────────────────────────────────────
export const AUTUMN = { d2: '#7a2a14', d1: '#a8401c', base: '#d0642a', l1: '#e8903a', l2: '#f4b84a', l3: '#fcd878' };
export const PALM_LEAF = { d2: '#1f5a2c', d1: '#2f7a35', base: '#45984a', l1: '#69b852', l2: '#9ad466' };

export function buildPalm({ frames = 4 } = {}) {
  const W = 48, H = 64, img = new Img(W * frames, H);
  for (let f = 0; f < frames; f++) {
    const t = new Img(W, H), b = { base: '#a07a4a', l1: '#c09a62', d1: '#7a5a34' };
    // 휘어진 줄기 (마디)
    for (let y = 22; y < 62; y++) { const x = Math.round(22 + Math.sin((62 - y) / 26) * 6); t.rect(x, y, 5, 1, b.base); t.set(x, y, b.l1); t.set(x + 4, y, b.d1); if (y % 4 === 0) t.hline(x, y, 5, b.d1); }
    t.rect(19, 60, 12, 2, b.d1);
    const sw = [0, 1, 0, -1][f];
    const cx = 28, cy = 20;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI + (k / 6) * Math.PI + (k % 2 ? 0.12 : -0.08), len = 15 + (k % 3) * 3;
      for (let d = 0; d < len; d++) {
        const droop = (d / len) ** 2 * 9;
        const x = Math.round(cx + Math.cos(a) * d + (d / len) * sw * 2), y = Math.round(cy + Math.sin(a) * d * 0.55 + droop);
        const wdt = Math.max(1, Math.round(3 * (1 - d / len) + 1));
        for (let o = -wdt; o <= wdt; o++) t.set(x, y + o, o < 0 ? PALM_LEAF.l1 : o === 0 ? PALM_LEAF.base : PALM_LEAF.d1);
        if (d % 2 === 0) t.set(x, y + wdt + 1, PALM_LEAF.d2);
      }
    }
    for (const [x, y] of [[25, 22], [29, 23], [27, 25]]) { t.circle(x, y, 2, '#6a4a2a'); t.set(x - 1, y - 1, '#9a7a4a'); }
    t.outline(O, 0.5);
    img.blit(t, f * W, 0);
  }
  return img;
}
export function buildCactus() {
  const t = new Img(16, 32), c = { d: '#2f6a3a', b: '#4a9a4f', l: '#7ac46a' };
  const col = (x, y0, y1, w) => { for (let y = y0; y < y1; y++) for (let i = 0; i < w; i++) t.set(x + i, y, i === 0 ? c.l : i === w - 1 ? c.d : c.b); for (let i = 1; i < w - 1; i++) t.set(x + i, y0 - 1, c.l); };
  col(6, 6, 31, 5); col(1, 12, 20, 3); t.rect(3, 18, 3, 2, c.b); col(12, 9, 18, 3); t.rect(11, 16, 2, 2, c.b);
  for (let y = 8; y < 30; y += 3) { t.set(7, y, '#e8f0c0'); t.set(9, y + 1, '#e8f0c0'); }
  t.set(8, 4, '#ff7aa0'); t.set(7, 5, '#ff9ab8'); t.set(9, 5, '#ff9ab8');
  t.rect(5, 30, 7, 2, '#c9ab72');
  t.outline(O, 0.5);
  return t;
}
export function buildDeadTree() {
  const t = new Img(48, 64), b = { d: '#3a2a22', b: '#5a463a', l: '#7a6452' };
  t.rect(21, 30, 6, 31, b.b); t.vline(21, 30, 31, b.l); t.vline(26, 30, 31, b.d); t.rect(17, 58, 14, 3, b.d);
  const branch = (x0, y0, a, len, w) => { for (let d = 0; d < len; d++) { const x = Math.round(x0 + Math.cos(a) * d), y = Math.round(y0 + Math.sin(a) * d); for (let o = 0; o < w; o++) t.set(x, y + o, o ? b.d : b.l); } return [Math.round(x0 + Math.cos(a) * len), Math.round(y0 + Math.sin(a) * len)]; };
  const R = rng(41);
  const grow = (x, y, a, len, w, depth) => { const [ex, ey] = branch(x, y, a, len, w); if (depth > 0) { grow(ex, ey, a - 0.5 - R() * 0.3, len * 0.65, Math.max(1, w - 1), depth - 1); grow(ex, ey, a + 0.45 + R() * 0.3, len * 0.6, Math.max(1, w - 1), depth - 1); } };
  grow(24, 32, -Math.PI / 2, 12, 3, 3);
  grow(22, 40, -Math.PI * 0.85, 10, 2, 2);
  grow(26, 38, -Math.PI * 0.18, 10, 2, 2);
  t.outline(O, 0.5);
  return t;
}
export function buildReeds() {
  const t = new Img(16, 22);
  for (let k = 0; k < 6; k++) { const x = 2 + k * 2 + (k % 2), h = 12 + ((k * 5) % 7); for (let y = 0; y < h; y++) t.set(x + (y > h - 4 ? 0 : Math.round(Math.sin(y / 4 + k))), 21 - y, y > h - 4 ? '#7a5a34' : k % 2 ? '#6a8a3a' : '#88a84a'); t.rect(x, 21 - h - 3, 2, 4, '#8a5a2a'); t.set(x, 21 - h - 3, '#b07a42'); }
  t.outline(O, 0.45);
  return t;
}
export function buildCaveMouth() {
  const t = new Img(48, 44), s = P.stone;
  for (let y = 0; y < 44; y++) for (let x = 0; x < 48; x++) {
    const dx = (x + 0.5 - 24) / 23, dy = (y + 0.5 - 40) / 36;
    const r = dx * dx + dy * dy + (vnoise(x / 4, y / 4, 30, 6) - 0.5) * 0.3;
    if (r > 1 || y > 42) continue;
    const light = -dx * 0.6 - dy * 0.7;
    t.set(x, y, light > 0.55 ? s.l2 : light > 0.15 ? s.l1 : light > -0.25 ? s.base : s.d1);
    if (hash2(x >> 1, y >> 1, 4) < 0.07) t.set(x, y, s.d2);
  }
  // 입구 (아치 모양 어둠)
  for (let y = 16; y < 44; y++) for (let x = 14; x < 34; x++) { const dx = (x + 0.5 - 24) / 9.5, dy = (y + 0.5 - 44) / 27; if (dx * dx + dy * dy < 1) t.set(x, y, mix('#0c0a0e', '#2a2230', Math.max(0, (y - 30) / 20))); }
  t.rect(5, 6, 4, 2, '#6f9a5a'); t.rect(36, 10, 6, 2, '#6f9a5a'); t.rect(37, 9, 3, 1, '#8fbf6f');
  t.outline(O, 0.5);
  return t;
}
export function buildRuinPillar(broken = false) {
  const H = broken ? 24 : 42, t = new Img(16, H), s = { d: '#8a8478', b: '#b8b0a0', l: '#dcd4c2' };
  t.rect(3, 3, 10, H - 6, s.b); t.vline(4, 3, H - 6, s.l); t.vline(11, 3, H - 6, s.d); for (let y = 6; y < H - 4; y += 3) t.set(7, y, s.d);
  t.rect(1, H - 5, 14, 5, s.d); t.hline(1, H - 5, 14, s.b);
  if (broken) { for (let x = 3; x < 13; x++) for (let y = 0; y < 3 + (hash2(x, 1, 2) * 4) | 0; y++) t.clear(x, y + 3); t.rect(9, H - 3, 5, 3, s.b); }
  else { t.rect(1, 0, 14, 4, s.l); t.hline(1, 3, 14, s.d); }
  t.rect(4, H - 9, 3, 2, '#6f9a5a');
  t.outline(O, 0.5);
  return t;
}
export function buildAltarStone() {
  const t = new Img(48, 30), s = { d: '#7a7468', b: '#a8a090', l: '#d0c8b4' };
  t.rect(2, 14, 44, 14, s.b); t.hline(2, 14, 44, s.l); t.rect(2, 26, 44, 4, s.d);
  t.rect(8, 6, 32, 9, s.l); t.hline(8, 6, 32, '#f0e8d4'); t.rect(8, 13, 32, 2, s.d);
  for (const x of [12, 24, 36]) { t.circle(x, 20, 2, '#e0c870'); t.set(x, 19, '#fff4c0'); }
  t.circle(24, 3, 3, '#9ad8ff'); t.circle(23, 2, 1, '#ffffff');
  t.outline(O, 0.5);
  return t;
}
export function buildPortal() {
  const t = new Img(32, 40);
  for (let y = 0; y < 40; y++) for (let x = 0; x < 32; x++) {
    const dx = (x + 0.5 - 16) / 14, dy = (y + 0.5 - 22) / 18, r = Math.sqrt(dx * dx + dy * dy);
    if (r > 1) continue;
    const a = Math.atan2(dy, dx), sw = Math.sin(a * 3 + r * 9);
    t.set(x, y, r > 0.86 ? '#2a1a40' : sw > 0.4 ? '#c08af0' : sw > -0.2 ? '#7a4ac0' : '#3a2268');
  }
  t.circle(16, 22, 3, '#f4e0ff');
  return t;
}
export function buildStairsUp() {
  const t = new Img(32, 22), s = { d: '#6a6458', b: '#a8a090', l: '#d0c8b4' };
  for (let k = 0; k < 4; k++) { const y = 18 - k * 5, inset = k * 2; t.rect(inset, y, 32 - inset * 2, 4, s.b); t.hline(inset, y, 32 - inset * 2, s.l); t.hline(inset, y + 3, 32 - inset * 2, s.d); }
  t.outline(O, 0.4);
  return t;
}

// ── 동굴 배경 ───────────────────────────────────────────
const CAVE_THEME = {
  rock: { floor: '#7a6a5c', floor2: '#8c7c6a', wall: '#2a2228', face: '#5a4c44', rim: '#8a7a6c' },
  crystal: { floor: '#555474', floor2: '#68668a', wall: '#1c1830', face: '#3e3862', rim: '#7a74a8', gem: ['#8ae8ff', '#ff9ae0', '#c8a8ff'] },
  lava: { floor: '#4e3e3a', floor2: '#5e4a44', wall: '#1c1212', face: '#3e2a24', rim: '#6e4a3a', crack: '#ff7a2a' },
  ice: { floor: '#a8c8dc', floor2: '#c4dcea', wall: '#2e4a66', face: '#5a84a8', rim: '#a8d0ec' },
  dark: { floor: '#3e3a46', floor2: '#4a4654', wall: '#100e14', face: '#2a2632', rim: '#4e4858' },
  mine: { floor: '#7e684e', floor2: '#907a5c', wall: '#2a2018', face: '#4e3c2c', rim: '#7e6450', beam: true },
  sea: { floor: '#5e6e6c', floor2: '#6e8080', wall: '#1a262c', face: '#32464e', rim: '#5a7a80', puddle: '#3a8a9a' },
};
export function buildCaveBg(node) {
  const lay = caveLayout(node.id, caveExits(node));
  const { W, H, wall } = lay, th = CAVE_THEME[node.theme] ?? CAVE_THEME.rock;
  const t = new Img(W * T, H * T);
  const isW = (x, y) => x < 0 || y < 0 || x >= W || y >= H || wall[y][x];
  const seed = node.id.length * 13;
  for (let py = 0; py < H * T; py++) for (let px = 0; px < W * T; px++) {
    const cx = Math.floor(px / T), cy = Math.floor(py / T), lx = px % T, ly = py % T;
    let c;
    if (wall[cy][cx]) {
      const below = !isW(cx, cy + 1);
      if (below && ly >= 4) { // 남쪽 절벽면
        const st = Math.floor((py + Math.floor(hash2(cx, 0, seed) * 4)) / 4) % 2;
        c = mix(th.face, '#000000', 0.08 + (ly - 4) * 0.012 - st * 0.06);
        if (hash2(px >> 1, py >> 1, seed) < 0.08) c = darken(th.face, 0.25);
        if (ly === T - 1) c = darken(th.face, 0.4);
      } else {
        const n = fbm(px / 9, py / 9, 32, seed, 2);
        c = mix(th.wall, th.face, n * 0.35);
        const edgeN = !isW(cx, cy - 1) && ly < 2, edgeL = !isW(cx - 1, cy) && lx < 2, edgeR = !isW(cx + 1, cy) && lx > 13, edgeB = below && ly < 4;
        if (edgeN || edgeL || edgeR || edgeB) c = th.rim;
        if (th.gem && hash2(cx, cy, seed + 5) < 0.05 && Math.abs(lx - 8) < 3 - Math.abs(ly - 8) / 3) c = th.gem[Math.floor(hash2(cx, cy, 2) * 3)];
      }
    } else {
      const n = fbm(px / 7, py / 7, 28, seed + 1, 3);
      c = n > 0.58 ? th.floor2 : th.floor;
      if (hash2(px >> 1, py >> 1, seed + 2) < 0.025) c = darken(th.floor, 0.3);
      if (hash2(px >> 1, py >> 1, seed + 3) < 0.012) c = lighten(th.floor, 0.25);
      // 벽 근처 그늘
      let occ = 0;
      if (isW(cx, cy - 1)) occ = Math.max(occ, 1 - ly / 9);
      if (isW(cx - 1, cy)) occ = Math.max(occ, 1 - lx / 6);
      if (isW(cx + 1, cy)) occ = Math.max(occ, 1 - (T - 1 - lx) / 6);
      if (isW(cx, cy + 1)) occ = Math.max(occ, 1 - (T - 1 - ly) / 5);
      if (occ > 0) c = mix(c, '#000000', occ * 0.35);
      if (th.crack && vnoise(px / 3, py / 3, 40, seed + 7) > 0.83 && fbm(px / 20, py / 20, 30, seed + 8, 2) > 0.55) c = mix(th.crack, '#ffd08a', hash2(px, py, 1) * 0.5);
      if (th.puddle && fbm(px / 14, py / 14, 30, seed + 9, 2) > 0.66) c = mix(th.puddle, '#7ad0e0', hash2(px >> 2, py >> 2, 3) < 0.1 ? 0.6 : 0);
      if (node.theme === 'ice' && hash2(px, py, 9) < 0.01) c = '#ffffff';
      // 가장자리 출입구 쪽 어둠
      if (cy <= 1 || cy >= H - 2) c = mix(c, '#000000', cy <= 1 ? 1 - py / (2 * T) : (py - (H - 2) * T) / (2 * T));
    }
    t.put(px, py, rgba(c));
  }
  // 갱도 받침목
  if (th.beam) for (let k = 0; k < 14; k++) { const cx = 2 + Math.floor(hash2(k, 1, seed) * (W - 4)), cy = 3 + Math.floor(hash2(k, 2, seed) * (H - 6)); if (!wall[cy][cx] || isW(cx, cy + 1)) continue; t.rect(cx * T + 2, cy * T + 4, 3, 12, P.wood.base); t.rect(cx * T + 11, cy * T + 4, 3, 12, P.wood.base); t.rect(cx * T, cy * T + 3, 16, 3, P.wood.l1); }
  // 계단
  for (const p of lay.points) {
    if (p.edge) continue;
    const x0 = p.x * T, y0 = p.y * T;
    const up = p.type === 'stairsUp';
    const s = { d: darken(th.rim, 0.3), b: th.rim, l: lighten(th.rim, 0.3) };
    if (up) { for (let k = 0; k < 4; k++) { const y = y0 + 12 - k * 4, ins = k; t.rect(x0 + ins, y, T - ins * 2, 4, rgba(s.b)); t.hline(x0 + ins, y, T - ins * 2, rgba(s.l)); t.hline(x0 + ins, y + 3, T - ins * 2, rgba(s.d)); } t.rect(x0, y0 - 2, T, 3, rgba(darken(th.wall, 0.2))); }
    else { t.rect(x0, y0, T, T, rgba('#0a080c')); for (let k = 0; k < 3; k++) { const y = y0 + 3 + k * 4; t.rect(x0 + 2 + k, y, T - 4 - k * 2, 3, rgba(mix(th.rim, '#000000', 0.3 + k * 0.2))); } t.rect(x0 - 1, y0 - 1, T + 2, 2, rgba(s.l)); }
  }
  return t;
}
export function caveNodes() { return Object.values(buildGraph()).filter((n) => n.kind === 'cave'); }

// ── 배틀 배경 (동굴 · 눈 · 모래) ────────────────────────
export function buildBattleBg2(kind) {
  const W = 240, H = 135, t = new Img(W, H);
  const k = {
    cave: { sky: ['#1e1a22', '#3a3240'], far: '#2a2430', near: '#3a3238', ground: ['#5a4c44', '#6a5a50'], plat: ['#7a6a5c', '#9a8a78', '#4a3e36'] },
    snow: { sky: ['#a8c4e0', '#e8f2fa'], far: '#c8d8e8', near: '#e0eaf4', ground: ['#e4eef6', '#f6faff'], plat: ['#c8d8e8', '#ffffff', '#9ab0c8'] },
    sand: { sky: ['#f0b878', '#fde8c0'], far: '#d8a868', near: '#c89858', ground: ['#e2c88e', '#f0dca8'], plat: ['#d0b078', '#ecd09a', '#a88a5a'] },
    // 별의 제단 (산꼭대기 밤하늘) · 태초의 길 (오카리나로 열리는 구름 위 세계)
    summit: { sky: ['#0e1230', '#3a3a78'], far: '#4a4a7a', near: '#6a6890', ground: ['#8a86a0', '#a8a4bc'], plat: ['#b0aac4', '#d8d4e6', '#6a6488'] },
    origin: { sky: ['#f6d8f0', '#fff6e0'], far: '#e8e0ff', near: '#f4f0ff', ground: ['#fff8ec', '#ffffff'], plat: ['#f0e4c8', '#fffaf0', '#d8c8a0'] },
  }[kind];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t.put(x, y, rgba(mix(k.sky[0], k.sky[1], Math.min(1, y / 75))));
  if (kind === 'cave') for (let x = 0; x < W; x++) { const h = 10 + Math.sin(x / 7) * 4 + hash2(x >> 2, 3, 1) * 8; for (let y = 0; y < h; y++) t.put(x, y, rgba('#121014')); if (x % 23 === 5) for (let y = 0; y < h + 10; y++) t.put(x, y, rgba(mix('#121014', '#3a3240', y / (h + 10)))); }
  if (kind === 'snow') { const R = rng(5); for (let i = 0; i < 70; i++) t.set(Math.floor(R() * W), Math.floor(R() * 80), '#ffffff'); }
  if (kind === 'summit') { const R = rng(9); for (let i = 0; i < 110; i++) t.set(Math.floor(R() * W), Math.floor(R() * 70), R() < 0.2 ? '#ffe58a' : '#ffffff'); for (const px of [40, 200]) for (let y = 30; y < 82; y++) for (let x = px - 4; x < px + 4; x++) t.put(x, y, rgba(x < px - 2 ? '#d8d4e6' : '#9a96b4')); }
  if (kind === 'origin') { for (let r = 0; r < 6; r++) { const c = ['#ffb0c8', '#ffd08a', '#fff08a', '#b0f0c0', '#a8d8ff', '#d0b8ff'][r]; for (let x = 0; x < W; x++) { const y = Math.round(70 - Math.sqrt(Math.max(0, 1 - ((x - 120) / 130) ** 2)) * (60 - r * 3)); t.set(x, y, c); t.set(x, y + 1, c); } } const R = rng(13); for (let i = 0; i < 60; i++) t.set(Math.floor(R() * W), Math.floor(R() * 75), '#ffffff'); }
  for (let x = 0; x < W; x++) {
    const h1 = (kind === 'snow' ? 44 : 56) + Math.sin(x / 19) * (kind === 'snow' ? 12 : 6) + Math.sin(x / 7) * 2;
    for (let y = Math.floor(h1); y < 80; y++) t.put(x, y, rgba(kind === 'snow' && y < h1 + 4 ? '#ffffff' : k.far));
    const h2 = 68 + Math.sin(x / 11 + 2) * 4 + (hash2(x >> 2, 1, 3) - 0.5) * 3;
    for (let y = Math.floor(h2); y < 85; y++) t.put(x, y, rgba(k.near));
  }
  for (let y = 80; y < H; y++) for (let x = 0; x < W; x++) { const n = fbm(x / 10, y / 6, 24, 9, 2); t.put(x, y, rgba(n > 0.55 ? k.ground[1] : k.ground[0])); }
  for (const [cx, cy, rx, ry] of [[172, 86, 46, 11], [62, 122, 58, 13]]) { t.ellipse(cx, cy + 3, rx, ry, k.plat[2]); t.ellipse(cx, cy, rx, ry, k.plat[0]); t.ellipse(cx - 6, cy - 2, rx - 14, ry - 4, k.plat[1]); }
  return t;
}

// ── 휴대폰 지도: 루미나 지방 전체 (360×240) ──────────────
// 휴대폰 지도는 tools/art/regionmap.mjs (지형 음영 · 곡선 도로 · 스탬프)
export { buildRegionMap } from './regionmap.mjs';
