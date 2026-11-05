// 모험 요소 에셋: 풀숲, 광석 바위, 배틀 배경, 풍차, 루미 쉼터/도장 건물 옵션, 루미볼 투척 스프라이트
import { lumiBall } from './items.mjs';
import { Img, mix, darken, lighten, withAlpha, hash2, fbm, rng } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const O = P.outline;

/** 풀숲(조우 지대) 16x16 × 3프레임 흔들림 */
export function buildTallGrass() {
  const img = new Img(16 * 3, 16);
  const g = { d2: '#1f5a2a', d1: '#2f7a35', b: '#3f9a3e', l1: '#5fbf4f', l2: '#8fdc6a' };
  [0, 1, -1].forEach((sh, f) => {
    const t = new Img(16, 16);
    const blade = (x, h, c, lean) => { for (let i = 0; i < h; i++) { const xx = x + Math.round(((sh + lean) * i) / h * 1.6); t.set(xx, 15 - i, i >= h - 2 ? g.l2 : c); t.set(xx + 1, 15 - i, i < 2 ? g.d2 : c === g.b ? g.d1 : c); } };
    for (const [x, h, c, l] of [[0, 11, g.d1, -1], [2, 13, g.b, 0], [4, 10, g.l1, 0], [6, 14, g.b, 1], [8, 12, g.d1, 0], [10, 13, g.l1, 1], [12, 11, g.b, 1], [13, 9, g.d1, 1], [3, 8, g.d1, -1], [9, 9, g.b, 0]]) blade(x, h, c, l);
    t.outline(O, 0.7);
    img.blit(t, f * 16, 0);
  });
  return img;
}

/** 광석 바위: 'stone' | 'copper' | 'iron' | 'star' */
export function buildOreRock(kind) {
  const s = P.stone, t = new Img(16, 16);
  const gem = { copper: ['#c9733a', '#f0a060', '#8a4a20'], iron: ['#a8b0c8', '#e0e8f8', '#6a7088'], star: ['#8a7ae8', '#fff4b0', '#5a4ab8'], stone: null }[kind];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = (x + 0.5 - 8) / 6.8, dy = (y + 0.5 - 9.5) / 5.6, r = Math.sqrt(dx * dx + dy * dy) + (hash2(x, y, 4) - 0.5) * 0.12;
    if (r > 1) continue;
    const light = -dx * 0.5 - dy * 0.9;
    t.set(x, y, light > 0.55 ? s.l2 : light > 0.15 ? s.l1 : light > -0.35 ? s.base : light > -0.7 ? s.d1 : s.d2);
  }
  if (gem) for (const [x, y] of [[5, 7], [9, 9], [7, 11], [10, 6]]) { t.rect(x, y, 2, 2, gem[0]); t.set(x, y, gem[1]); t.set(x + 1, y + 1, gem[2]); }
  else { t.line(6, 7, 9, 10, s.d1); }
  t.outline(O, 0.5);
  return t;
}

/** 배틀 배경 240x135: 'grass' | 'water' | 'town' */
export function buildBattleBg(kind) {
  const W = 240, H = 135, t = new Img(W, H);
  const sky = kind === 'water' ? ['#8fd0f0', '#d8f0ff'] : kind === 'town' ? ['#f2c89a', '#fff0d8'] : ['#7ac0f0', '#d0ecff'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) t.put(x, y, mix(sky[0], sky[1], Math.min(1, y / 70)));
  // 구름
  const R = rng(kind.length * 7);
  for (let k = 0; k < 5; k++) { const cx = R() * W, cy = 12 + R() * 25; for (let i = 0; i < 4; i++) t.ellipse(cx + i * 7 - 10, cy + (i % 2) * 2, 8, 4, '#ffffff'); }
  // 먼 산/숲
  for (let x = 0; x < W; x++) {
    const h1 = 58 + Math.sin(x / 23) * 6 + Math.sin(x / 9) * 2;
    for (let y = Math.floor(h1); y < 80; y++) t.put(x, y, mix('#8ab8a0', '#6a9a80', (y - h1) / 20));
    const h2 = 68 + Math.sin(x / 13 + 2) * 4 + (hash2(x >> 2, 1, 3) - 0.5) * 4;
    for (let y = Math.floor(h2); y < 85; y++) t.put(x, y, '#4f8a5a');
  }
  // 땅
  const ground = kind === 'water' ? ['#3a86bf', '#57a6d8'] : kind === 'town' ? ['#c9b08a', '#ddc8a0'] : ['#6ab84a', '#8fd06a'];
  for (let y = 80; y < H; y++) for (let x = 0; x < W; x++) {
    const n = fbm(x / 10, y / 6, 24, 9, 2);
    t.put(x, y, n > 0.55 ? ground[1] : ground[0]);
    if (kind === 'water' && hash2(x, y, 2) < 0.02) t.put(x, y, '#e2f6ff');
  }
  // 발판 (적: 오른쪽 위, 아군: 왼쪽 아래)
  const plat = kind === 'water' ? ['#4a9a5a', '#6ac06a', '#2f6a3a'] : ['#5aa83f', '#86c95b', '#3a7a30'];
  for (const [cx, cy, rx, ry] of [[172, 86, 46, 11], [62, 122, 58, 13]]) {
    t.ellipse(cx, cy + 3, rx, ry, plat[2]);
    t.ellipse(cx, cy, rx, ry, plat[0]);
    t.ellipse(cx - 6, cy - 2, rx - 14, ry - 4, plat[1]);
  }
  return t;
}

/** 풍차 날개 64x64 (회전 스프라이트) */
export function buildWindmillBlades() {
  const t = new Img(64, 64), w = P.plank;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let d = 3; d < 30; d++) for (let o = -1; o <= 1; o++) t.set(32 + ca * d - sa * o, 32 + sa * d + ca * o, w.d1);
    for (let d = 10; d < 30; d++) for (let o = 1; o <= 7; o++) {
      const c = (d % 4 === 0 || o === 7) ? w.d1 : o < 3 ? '#fff4e0' : '#f2e2c8';
      t.set(32 + ca * d - sa * o, 32 + sa * d + ca * o, c);
    }
  }
  t.circle(32, 32, 4, P.wood.d1); t.circle(32, 32, 2, P.gold.base);
  t.outline(O, 0.5);
  return t;
}

/** 던지는 별빛 병 12x12 */
export function buildJar() {
  // 던지는 루미볼 (12x14) — 아이콘과 같은 디자인
  const t = new Img(12, 14);
  lumiBall(t, 1, 1, 5, '#5ec8b8', '#c9733a', '#ffd65a');
  t.outline(O, 0.5);
  return t;
}

/** 출현 이펙트용 반짝임 8x8 */
export function buildSparkle() {
  const t = new Img(8, 8);
  t.vline(3, 0, 8, '#fff4b0'); t.hline(0, 3, 8, '#fff4b0'); t.rect(2, 2, 3, 3, '#ffd65a'); t.set(3, 3, '#ffffff');
  return t;
}

export const ADV_BUILDINGS = {
  center: { w: 96, h: 104, wallH: 48, wall: 'plaster', wallColor: '#fbf2ec', roof: '#e0475b', doorX: 41, windows: [12, 70], awning: ['#e0475b', '#fff1dc'], awningY: 3, sign: 'heart', signX: 36, flowerBox: true, trim: '#fff8f4' },
  inn: { w: 96, h: 104, wallH: 48, wall: 'plank', wallColor: '#e8c89a', roof: '#3a5a8a', doorX: 41, windows: [12, 70], awning: ['#3a5a8a', '#fff1dc'], awningY: 3, sign: 'moon', signX: 36, flowerBox: true, chimneyX: 72 },
  gym: { w: 176, h: 160, wallH: 64, wall: 'stone', wallColor: '#a8c8c8', roof: '#2a7a7a', roofStyle: 'slate', doorX: 81, windows: [16, 96], sign: 'star', signX: 52, flag: true, trim: '#e8f4f4' },
  windmill: { w: 64, h: 112, wallH: 72, wall: 'plaster', wallColor: '#f2e6cf', roof: '#7a4a2a', doorX: 25, windows: [24], winY: 14 },
  shop_w: { w: 96, h: 104, wallH: 48, wall: 'plank', wallColor: '#8ab8d8', roof: '#3a6ab0', doorX: 41, windows: [12, 70], awning: ['#3a6ab0', '#fff1dc'], awningY: 3, sign: 'seed', signX: 36, flowerBox: true },
};
