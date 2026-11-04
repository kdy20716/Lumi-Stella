// 월드 오브젝트: 농가, 나무, 덤불, 바위, 울타리, 출하상자, 우체통, 허수아비, 우물, 가로등 등
import { Img, mix, darken, lighten, withAlpha, hash2, fbm, vnoise, rng } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const O = P.outline;

/** 잎 덩어리 셰이딩: 마스크 함수 + 좌상단 광원 + 노이즈 클러스터 */
function foliage(img, cx, cy, rx, ry, pal, seed, { shift = 0, bumpy = 0.18 } = {}) {
  const levels = [pal.d2, pal.d1, pal.base, pal.l1, pal.l2, pal.l3 ?? pal.l2];
  for (let y = Math.floor(cy - ry - 3); y <= cy + ry + 3; y++) for (let x = Math.floor(cx - rx - 3); x <= cx + rx + 3; x++) {
    const sx = x - (shift * (cy + ry - y)) / (2 * ry); // 상단일수록 더 흔들림
    const dx = (sx + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const ang = Math.atan2(dy, dx);
    const bump = (vnoise(ang * 2.2 + 10, seed, 100, seed) - 0.5) * bumpy * 2 + Math.sin(ang * 7 + seed) * 0.05;
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > 1 + bump) continue;
    // 광원(좌상단)
    const light = (-dx * 0.55 - dy * 0.8) * 0.5 + 0.5; // 0..1
    const cl = fbm(sx / 5, y / 5, 50, seed + 3, 2);
    let v = light * 0.75 + cl * 0.55 - 0.18 - Math.max(0, r - 0.75) * 0.9;
    let idx = v < 0.18 ? 0 : v < 0.34 ? 1 : v < 0.52 ? 2 : v < 0.68 ? 3 : v < 0.82 ? 4 : 5;
    // 잎 하이라이트 점묘
    if (hash2(Math.round(sx), y, seed) < 0.06 && idx >= 2) idx = Math.min(5, idx + 1);
    if (hash2(Math.round(sx), y, seed + 1) < 0.05 && idx <= 3) idx = Math.max(0, idx - 1);
    img.set(x, y, levels[idx]);
  }
}

export function buildOak({ fruit = null, frames = 4, seed = 3, pal = P.leaf } = {}) {
  const W = 48, H = 64, img = new Img(W * frames, H);
  const shifts = [0, 1, 0, -1];
  for (let f = 0; f < frames; f++) {
    const t = new Img(W, H);
    // 줄기 + 뿌리
    const b = P.bark;
    t.rect(20, 40, 8, 21, b.base); t.rect(20, 40, 2, 21, b.l1); t.rect(26, 40, 2, 21, b.d1);
    t.rect(17, 58, 14, 3, b.base); t.rect(16, 60, 16, 1, b.d1); t.rect(18, 57, 3, 2, b.l1); t.rect(28, 57, 2, 3, b.d1);
    for (let y = 42; y < 58; y += 4) t.px?.(0, 0, 0);
    for (let y = 42; y < 58; y += 3) { t.set(23 + (y % 2), y, b.d1); t.set(24 + (y % 2), y + 1, b.d2); }
    t.set(22, 50, b.d2); t.set(22, 51, b.d2); t.set(25, 46, b.l1);
    // 가지
    t.line(21, 42, 15, 34, b.base); t.line(27, 41, 33, 33, b.d1);
    // 수관 (여러 덩어리)
    const s = shifts[f % 4];
    foliage(t, 24, 30, 15, 10, pal, seed + 11, { shift: s });
    foliage(t, 14, 24, 11, 10, pal, seed + 1, { shift: s });
    foliage(t, 34, 24, 11, 10, pal, seed + 2, { shift: s });
    foliage(t, 24, 15, 13, 11, pal, seed + 3, { shift: s });
    if (fruit) {
      const r = rng(seed * 99);
      for (let k = 0; k < 9; k++) {
        const fx = 10 + Math.floor(r() * 28), fy = 10 + Math.floor(r() * 24);
        if (t.alpha(fx, fy) === 0) continue;
        t.rect(fx, fy, 2, 2, fruit); t.set(fx, fy, lighten(fruit, 0.5)); t.set(fx + 1, fy + 1, darken(fruit, 0.3));
      }
    }
    t.outline(O, 0.5);
    img.blit(t, f * W, 0);
  }
  return img;
}

export function buildPine({ frames = 4, seed = 7, snow = false } = {}) {
  const W = 40, H = 72, img = new Img(W * frames, H);
  const shifts = [0, 1, 0, -1];
  for (let f = 0; f < frames; f++) {
    const t = new Img(W, H), pal = P.pine, b = P.bark;
    t.rect(17, 54, 6, 15, b.base); t.rect(17, 54, 2, 15, b.l1); t.rect(21, 54, 2, 15, b.d1); t.rect(15, 67, 10, 2, b.d1);
    const tiers = [[60, 18, 12], [48, 15, 11], [36, 12, 10], [24, 9, 9], [14, 6, 8]];
    tiers.forEach(([by, hw, h], ti) => {
      for (let y = by - h; y <= by; y++) {
        const tt = (y - (by - h)) / h; const half = Math.round(2 + (hw - 2) * tt);
        const sh = Math.round((shifts[f % 4] * (5 - ti)) / 4);
        for (let x = 20 - half; x <= 19 + half; x++) {
          const edge = (x - (20 - half)) / (2 * half);
          let c = edge < 0.25 ? pal.l1 : edge < 0.55 ? pal.base : edge < 0.85 ? pal.d1 : pal.d2;
          if (y >= by - 1 && hash2(x, y, seed) < 0.6) c = pal.d2;
          if (hash2(x, y, seed + ti) < 0.08) c = pal.l2;
          if (snow && (y - (by - h) < 3 + (hash2(x, ti, 5) < 0.5 ? 1 : 0) || (edge < 0.4 && hash2(x, y, 9) < 0.35))) c = edge < 0.5 ? '#ffffff' : '#dce8f4';
          if (y === by && (x + ti) % 3 === 0) continue; // 들쭉날쭉한 아랫단
          t.set(x + sh, y, c);
        }
      }
    });
    t.set(20, 5, pal.l2); t.set(19, 6, pal.l1);
    t.outline(O, 0.5);
    img.blit(t, f * W, 0);
  }
  return img;
}

export function buildBush({ berries = false, seed = 5 } = {}) {
  const t = new Img(32, 26);
  foliage(t, 16, 15, 14, 9, P.leaf, seed, { bumpy: 0.12 });
  foliage(t, 10, 11, 8, 6, P.leaf, seed + 1, { bumpy: 0.12 });
  foliage(t, 21, 10, 8, 6, P.leaf, seed + 2, { bumpy: 0.12 });
  if (berries) {
    const r = rng(seed * 7);
    for (let k = 0; k < 8; k++) { const x = 5 + Math.floor(r() * 22), y = 6 + Math.floor(r() * 14); if (t.alpha(x, y)) { t.set(x, y, '#8f3cc4'); t.set(x + 1, y, '#5d2386'); t.set(x, y - 1, '#c58af0'); } }
  } else {
    const r = rng(seed * 7);
    for (let k = 0; k < 6; k++) { const x = 5 + Math.floor(r() * 22), y = 6 + Math.floor(r() * 14); if (t.alpha(x, y)) { t.set(x, y, '#fff1f5'); t.set(x + 1, y, '#ff9cbc'); } }
  }
  t.outline(O, 0.5);
  return t;
}

export function buildRock(big = false) {
  const s = P.stone;
  const t = new Img(big ? 32 : 16, big ? 24 : 16);
  const [cx, cy, rx, ry] = big ? [16, 14, 13, 9] : [8, 9, 6, 5];
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    const r = Math.sqrt(dx * dx + dy * dy) + (vnoise(x / 3, y / 3, 50, big ? 4 : 2) - 0.5) * 0.25;
    if (r > 1) continue;
    const light = -dx * 0.5 - dy * 0.9;
    let c = light > 0.55 ? s.l2 : light > 0.15 ? s.l1 : light > -0.35 ? s.base : light > -0.7 ? s.d1 : s.d2;
    if (hash2(x, y, 3) < 0.06) c = s.d1;
    t.set(x, y, c);
  }
  if (big) { t.line(12, 9, 16, 14, s.d1); t.line(16, 14, 15, 18, s.d1); t.set(13, 9, s.d2); t.rect(20, 8, 3, 2, '#6f9a5a'); t.rect(21, 7, 2, 1, '#8fbf6f'); }
  else { t.set(6, 7, s.d1); t.set(7, 8, s.d1); }
  t.outline(O, 0.5);
  return t;
}

export function buildStump() {
  const t = new Img(16, 16), b = P.bark;
  t.rect(2, 7, 12, 7, b.base); t.rect(2, 7, 3, 7, b.l1); t.rect(11, 7, 3, 7, b.d1);
  t.rect(1, 12, 14, 2, b.d1); t.rect(0, 13, 3, 1, b.base); t.rect(13, 13, 3, 1, b.d2);
  t.ellipse(8, 7, 6, 3, '#d8a56a'); t.ellipse(8, 7, 4, 2, '#c08850'); t.ellipse(8, 7, 2, 1, '#d8a56a'); t.set(8, 7, '#a06c3a');
  t.vline(6, 10, 3, b.d1); t.vline(9, 9, 4, b.d2);
  t.outline(O, 0.5);
  return t;
}

export function buildLog() {
  const t = new Img(32, 16), b = P.bark;
  t.rect(2, 5, 26, 8, b.base); t.rect(2, 5, 26, 2, b.l1); t.rect(2, 11, 26, 2, b.d1);
  for (let x = 4; x < 26; x += 5) { t.set(x, 8, b.d1); t.set(x + 1, 9, b.d2); }
  t.ellipse(28, 9, 3, 4, '#d8a56a'); t.ellipse(28, 9, 2, 2, '#b98048'); t.set(28, 9, '#d8a56a');
  t.rect(9, 4, 3, 1, '#6aa84f'); t.set(10, 3, '#8fcf5e');
  t.outline(O, 0.5);
  return t;
}

/** 울타리 4프레임: 0=기둥, 1=오른쪽 연결, 2=왼쪽 연결, 3=양쪽 */
export function buildFence() {
  const W = 16, H = 24, img = new Img(W * 4, H), w = P.wood;
  for (let f = 0; f < 4; f++) {
    const t = new Img(W, H);
    const rail = (x0, x1) => { for (const y of [9, 15]) { t.rect(x0, y, x1 - x0, 2, w.l1); t.rect(x0, y + 1, x1 - x0, 1, w.base); } };
    if (f === 1 || f === 3) rail(10, 16);
    if (f === 2 || f === 3) rail(0, 6);
    t.rect(6, 5, 4, 18, w.base); t.rect(6, 5, 1, 18, w.l2); t.rect(9, 5, 1, 18, w.d1);
    t.rect(6, 4, 4, 1, w.l1); t.set(6, 4, null); t.rect(6, 4, 4, 1, w.l2);
    t.rect(6, 21, 4, 1, w.d2);
    t.set(7, 10, w.d1); t.set(8, 16, w.d1);
    t.outline(O, 0.5);
    img.blit(t, f * W, 0);
  }
  return img;
}

export function buildHouse() {
  const W = 112, H = 120;
  const t = new Img(W, H);
  const r = P.roof, w = P.wood, s = P.stone;
  const wallTop = 62, wallBot = 108, wx0 = 10, wx1 = 101;
  // 벽 (가로 판자)
  for (let y = wallTop; y < wallBot; y++) for (let x = wx0; x <= wx1; x++) {
    const row = (y - wallTop) % 5;
    let c = row === 4 ? '#8a5a36' : row === 0 ? '#e4b77e' : '#cf9a62';
    if (row !== 4 && hash2(x, y, 4) < 0.07) c = '#bb8752';
    if (row !== 4 && (x + Math.floor((y - wallTop) / 5) * 7) % 23 === 0) c = '#9c6a40';
    t.set(x, y, c);
  }
  // 모서리 기둥
  for (const x0 of [wx0, wx1 - 4]) { t.rect(x0, wallTop, 5, wallBot - wallTop, w.base); t.rect(x0, wallTop, 1, wallBot - wallTop, w.l1); t.rect(x0 + 4, wallTop, 1, wallBot - wallTop, w.d1); }
  // 기초석
  for (let x = wx0 - 1; x <= wx1 + 1; x += 6) {
    const off = (x / 6) % 2 ? 0 : 3;
    t.rect(x, wallBot, 6, 5, s.base); t.rect(x, wallBot, 6, 1, s.l2); t.rect(x + 5, wallBot, 1, 5, s.d1);
  }
  t.rect(wx0 - 1, wallBot + 4, wx1 - wx0 + 3, 1, s.d2);
  // 처마 그림자
  t.rect(wx0, wallTop, wx1 - wx0 + 1, 3, withAlpha('#3b2213', 0.55));
  // 문
  const dx0 = 48, dw = 16, dy0 = 76;
  t.rect(dx0 - 2, dy0 - 3, dw + 4, wallBot - dy0 + 3, '#f2e6cf'); t.rect(dx0 - 2, dy0 - 3, dw + 4, 1, '#ffffff'); t.rect(dx0 + dw + 1, dy0 - 3, 1, wallBot - dy0 + 3, '#c9b89a');
  t.rect(dx0, dy0, dw, wallBot - dy0, '#7a4a2a');
  for (let x = dx0 + 1; x < dx0 + dw; x += 4) t.rect(x, dy0 + 1, 3, wallBot - dy0 - 1, '#94603a');
  t.rect(dx0 + 2, dy0 + 3, 12, 8, '#5b3520'); t.rect(dx0 + 3, dy0 + 4, 10, 6, P.glass.base); t.rect(dx0 + 3, dy0 + 4, 4, 2, P.glass.l1); t.vline(dx0 + 8, dy0 + 4, 6, '#5b3520');
  t.rect(dx0 + 12, dy0 + 18, 2, 2, P.gold.l1); t.set(dx0 + 13, dy0 + 19, P.gold.d1);
  t.rect(dx0, wallBot - 1, dw, 1, '#4a2c18');
  // 창문 (좌/우)
  const windowAt = (x0, y0) => {
    t.rect(x0 - 2, y0 - 2, 20, 18, '#f2e6cf'); t.rect(x0 - 2, y0 - 2, 20, 1, '#ffffff'); t.rect(x0 + 17, y0 - 2, 1, 18, '#c9b89a');
    t.rect(x0, y0, 16, 14, P.glass.d1);
    for (let y = 0; y < 14; y++) for (let x = 0; x < 16; x++) { const v = (x + y) % 9; t.set(x0 + x, y0 + y, v < 2 ? P.glass.l1 : y < 5 ? P.glass.base : P.glass.d1); }
    t.vline(x0 + 7, y0, 14, '#f2e6cf'); t.hline(x0, y0 + 6, 16, '#f2e6cf');
    // 덧문
    for (const sx of [x0 - 7, x0 + 18]) { t.rect(sx, y0 - 2, 5, 18, '#3f7a5a'); for (let y = y0; y < y0 + 15; y += 3) t.hline(sx + 1, y, 3, '#2c5a42'); t.vline(sx, y0 - 2, 18, '#5a9c76'); }
    // 화분 상자 + 꽃
    t.rect(x0 - 3, y0 + 15, 22, 5, '#8c4f2c'); t.rect(x0 - 3, y0 + 15, 22, 1, '#b06a3c'); t.rect(x0 - 3, y0 + 19, 22, 1, '#5e321b');
    const cols = ['#ff7aa8', '#ffd65a', '#ffffff', '#ff6a4d'];
    for (let i = 0; i < 7; i++) { const fx = x0 - 1 + i * 3; t.set(fx, y0 + 14, P.leaf.base); t.set(fx + 1, y0 + 14, P.leaf.d1); t.set(fx, y0 + 13, cols[i % 4]); t.set(fx + 1, y0 + 13, darken(cols[i % 4], 0.15)); t.set(fx, y0 + 12, lighten(cols[i % 4], 0.3)); }
  };
  windowAt(22, 78); windowAt(74, 78);
  // 문 옆 등불
  t.rect(40, 74, 4, 6, '#3a2a22'); t.rect(41, 75, 2, 4, P.glass.warm); t.rect(40, 73, 4, 1, '#5a4535');

  // 지붕 (앞쪽 경사면 + 슁글)
  const roofTop = 14, roofBot = 64;
  for (let y = roofTop; y < roofBot; y++) {
    const tt = (y - roofTop) / (roofBot - roofTop);
    const inset = Math.round(16 * (1 - tt));
    const x0 = 2 + inset, x1 = W - 3 - inset;
    for (let x = x0; x <= x1; x++) {
      const row = Math.floor((y - roofTop) / 6), ry = (y - roofTop) % 6;
      const bx = (x + (row % 2) * 4) % 8;
      let c = ry === 5 ? r.d2 : ry === 4 ? r.d1 : ry === 0 ? r.l1 : r.base;
      if (bx === 7 && ry < 5) c = r.d1;
      if (ry === 1 && bx < 3) c = r.l2;
      if (hash2(x, y, 8) < 0.05 && ry > 0 && ry < 4) c = r.l1;
      // 측면 그라데이션 (오른쪽 어둡게)
      if (x > x1 - 3) c = mix(c, r.d2, 0.6);
      if (x < x0 + 2) c = mix(c, r.l2, 0.3);
      t.set(x, y, c);
    }
  }
  // 용마루 + 처마끝
  t.rect(18, roofTop - 3, W - 37, 4, r.d1); t.rect(18, roofTop - 3, W - 37, 1, r.l1);
  t.rect(1, roofBot - 1, W - 2, 3, w.d1); t.rect(1, roofBot - 1, W - 2, 1, w.l1);
  // 지붕창 (도머)
  const dmx = 44, dmy = 26;
  t.rect(dmx, dmy + 6, 24, 18, '#cf9a62'); for (let y = dmy + 6; y < dmy + 24; y += 4) t.hline(dmx, y, 24, '#a87443');
  for (let y = 0; y < 10; y++) { const half = 3 + y * 1.5; t.hline(Math.round(dmx + 12 - half), dmy - 2 + y, Math.round(half * 2), y < 2 ? r.l1 : y % 3 === 2 ? r.d1 : r.base); }
  t.rect(dmx + 5, dmy + 10, 14, 11, '#f2e6cf'); t.rect(dmx + 7, dmy + 12, 10, 8, P.glass.d1); t.rect(dmx + 7, dmy + 12, 10, 3, P.glass.base); t.set(dmx + 8, dmy + 13, P.glass.l1); t.vline(dmx + 12, dmy + 12, 8, '#f2e6cf');
  t.rect(dmx, dmy + 23, 24, 1, r.d2);
  // 굴뚝
  const cx0 = 80;
  for (let y = 0; y < 30; y++) for (let x = 0; x < 11; x++) {
    const row = Math.floor(y / 4), bx = (x + (row % 2) * 3) % 6;
    let c = y % 4 === 3 || bx === 5 ? s.d1 : s.base; if (x === 0) c = s.l1; if (x === 10) c = s.d2;
    t.set(cx0 + x, 2 + y, c);
  }
  t.rect(cx0 - 1, 1, 13, 3, s.l1); t.rect(cx0 - 1, 3, 13, 1, s.d1);
  t.outline(O, 0.55);
  // 야간 창문 발광 오버레이
  const glow = new Img(W, H);
  for (const [x0, y0] of [[22, 78], [74, 78]]) { glow.rect(x0, y0, 16, 14, '#ffcf6e'); glow.rect(x0, y0, 16, 5, '#ffe7a6'); glow.vline(x0 + 7, y0, 14, '#d9a24a'); glow.hline(x0, y0 + 6, 16, '#d9a24a'); }
  glow.rect(dmx + 7, dmy + 12, 10, 8, '#ffcf6e'); glow.vline(dmx + 12, dmy + 12, 8, '#d9a24a');
  glow.rect(dx0 + 3, dy0 + 4, 10, 6, '#ffcf6e'); glow.vline(dx0 + 8, dy0 + 4, 6, '#d9a24a');
  glow.rect(41, 75, 2, 4, '#fff2b8');
  return { img: t, glow, door: { x: dx0 + dw / 2, y: wallBot } };
}

export function buildShippingBin() {
  const t = new Img(32, 28), w = P.wood;
  t.rect(2, 10, 28, 16, w.base);
  for (let y = 10; y < 26; y += 4) { t.hline(2, y, 28, w.l1); t.hline(2, y + 3, 28, w.d1); }
  t.rect(2, 10, 3, 16, w.d1); t.rect(27, 10, 3, 16, w.d1); t.rect(2, 10, 1, 16, w.l2);
  t.rect(1, 5, 30, 6, '#7a4a2a'); t.rect(1, 5, 30, 1, '#b97a46'); t.rect(1, 10, 30, 1, '#4a2c18');
  t.rect(14, 7, 4, 5, P.metal.base); t.set(15, 8, P.metal.l2); t.rect(14, 11, 4, 1, P.metal.d1);
  // 넘쳐 보이는 농산물
  t.rect(6, 4, 4, 2, '#e3a33a'); t.rect(10, 3, 3, 3, '#d8473b'); t.set(11, 3, '#ff8a7a'); t.rect(20, 4, 4, 2, '#8fcf5e');
  t.rect(2, 26, 28, 1, w.d2);
  t.outline(O, 0.55);
  return t;
}

export function buildMailbox() {
  const t = new Img(16, 32);
  t.rect(7, 14, 3, 16, P.wood.base); t.vline(7, 14, 16, P.wood.l1); t.vline(9, 14, 16, P.wood.d1);
  t.rrect(2, 5, 12, 10, '#5d8fb5', 2); t.rect(3, 5, 9, 2, '#8ab9da'); t.rect(2, 13, 12, 2, '#3f6a8c');
  t.rect(2, 8, 2, 6, '#2f4f6a');
  t.rect(13, 3, 2, 7, '#d8473b'); t.rect(13, 3, 2, 1, '#ff7a6a');
  t.rect(5, 30, 7, 1, P.wood.d2);
  t.outline(O, 0.55);
  return t;
}

export function buildScarecrow() {
  const t = new Img(24, 36);
  t.rect(11, 12, 2, 23, P.wood.base); t.vline(11, 12, 23, P.wood.l1);
  t.rect(3, 15, 18, 2, P.wood.d1);
  // 옷
  t.rect(7, 14, 10, 10, '#7d5aa8'); t.rect(7, 14, 10, 1, '#a585d0'); t.rect(16, 14, 1, 10, '#56407a');
  t.rect(9, 17, 3, 3, '#c9a34a'); t.rect(13, 20, 3, 3, '#5f9a4a');
  t.rect(3, 15, 4, 4, '#7d5aa8'); t.rect(17, 15, 4, 4, '#56407a');
  for (const x of [2, 21]) { t.set(x, 16, '#e3be62'); t.set(x, 18, '#e3be62'); t.set(x, 17, '#b8913f'); }
  t.rect(8, 24, 8, 2, '#e3be62'); for (let x = 8; x < 16; x += 2) t.set(x, 26, '#b8913f');
  // 머리 (자루)
  t.rrect(7, 5, 10, 9, '#e8d5a8', 2); t.rect(15, 6, 2, 7, '#c8b080');
  t.rect(9, 8, 2, 2, '#3a2a22'); t.rect(13, 8, 2, 2, '#3a2a22'); t.hline(10, 11, 4, '#3a2a22'); t.set(9, 10, '#3a2a22'); t.set(14, 10, '#3a2a22');
  // 모자
  t.rect(4, 4, 16, 2, '#6a4a2a'); t.rect(7, 0, 10, 4, '#7d5a32'); t.rect(8, 0, 4, 1, '#a07a4a'); t.rect(7, 3, 10, 1, '#c8453c');
  t.outline(O, 0.55);
  return t;
}

export function buildWell() {
  const t = new Img(32, 44), s = P.stone, w = P.wood, r = P.roof;
  // 돌 원통
  t.rect(4, 26, 24, 14, s.base);
  for (let y = 26; y < 40; y += 4) for (let x = 4; x < 28; x += 6) { const o = ((y / 4) % 2) * 3; const bw = Math.min(5, 27 - (x + o)); if (bw <= 0) continue; t.rect(x + o, y, bw, 3, s.l1); t.set(x + o, y, s.l2); t.hline(x + o, y + 3, Math.min(6, 28 - (x + o)), s.d1); }
  t.rect(4, 26, 24, 1, s.l2); t.rect(25, 26, 3, 14, s.d1);
  t.ellipse(16, 26, 12, 4, s.d1); t.ellipse(16, 26, 9, 2.5, '#1d3550'); t.hline(12, 26, 6, P.water.d1);
  // 기둥 + 지붕
  t.rect(5, 10, 2, 17, w.base); t.rect(25, 10, 2, 17, w.d1);
  t.hline(6, 15, 20, w.d1); t.rect(14, 15, 4, 5, '#7a6a5a'); t.vline(16, 20, 5, '#d8c8a8');
  t.rect(13, 23, 6, 4, w.base); t.hline(13, 23, 6, w.l1);
  for (let y = 0; y < 11; y++) { const half = 4 + y * 1.3; t.hline(Math.round(16 - half), 1 + y, Math.round(half * 2), y < 2 ? r.l1 : y % 3 === 2 ? r.d1 : r.base); }
  t.hline(1, 11, 30, r.d2);
  t.outline(O, 0.55);
  return t;
}

export function buildLamp() {
  const t = new Img(16, 44);
  t.rect(7, 12, 2, 30, '#3a3a46'); t.vline(7, 12, 30, '#5a5a6a');
  t.rect(5, 40, 6, 3, '#3a3a46'); t.hline(5, 40, 6, '#6a6a7a');
  t.rect(4, 3, 8, 10, '#2e2e38'); t.rect(5, 5, 6, 6, P.glass.warm); t.rect(5, 5, 3, 2, '#fff2b8'); t.vline(8, 5, 6, '#2e2e38');
  t.rect(3, 2, 10, 2, '#454555'); t.rect(6, 0, 4, 2, '#454555');
  t.outline(O, 0.55);
  return t;
}

export function buildSign() {
  const t = new Img(24, 24), w = P.wood;
  t.rect(11, 12, 2, 11, w.d1);
  t.rect(2, 3, 20, 10, w.base); t.rect(2, 3, 20, 1, w.l2); t.rect(2, 12, 20, 1, w.d1); t.rect(21, 3, 1, 10, w.d1);
  t.hline(5, 6, 14, w.d2); t.hline(5, 9, 10, w.d2);
  t.outline(O, 0.55);
  return t;
}

export function buildBarrel() {
  const t = new Img(16, 20), w = P.wood;
  t.rrect(2, 3, 12, 16, w.base, 2);
  for (let x = 3; x < 13; x += 3) t.vline(x, 4, 14, w.d1);
  t.rect(2, 3, 3, 16, w.l1); t.rect(11, 4, 3, 14, w.d1);
  for (const y of [5, 15]) t.hline(2, y, 12, P.metal.d1);
  t.ellipse(8, 4, 5, 1.6, w.l2); t.hline(5, 4, 6, w.d1);
  t.outline(O, 0.55);
  return t;
}

export function buildCrate() {
  const t = new Img(16, 18), w = P.wood;
  t.rect(1, 3, 14, 14, w.l1); t.rect(1, 3, 14, 1, w.l2); t.rect(14, 3, 1, 14, w.d1); t.rect(1, 16, 14, 1, w.d1);
  t.rect(3, 5, 10, 10, w.base); t.line(3, 5, 12, 14, w.l1); t.line(3, 6, 11, 14, w.l2);
  t.outline(O, 0.55);
  return t;
}

export function buildHay() {
  const t = new Img(16, 16);
  t.rrect(1, 3, 14, 12, '#d9b44a', 2); t.rect(1, 3, 14, 3, '#efd57a'); t.rect(1, 12, 14, 3, '#b08a2f');
  for (let x = 2; x < 14; x += 2) { t.set(x, 7, '#b08a2f'); t.set(x + 1, 9, '#efd57a'); }
  t.vline(5, 3, 12, '#8a5a32'); t.vline(10, 3, 12, '#8a5a32');
  t.outline(O, 0.55);
  return t;
}

/** 잔디 덤불 3프레임 흔들림 */
export function buildTuft() {
  const img = new Img(16 * 4, 16), g = P.grass;
  [0, 1, 0, -1].forEach((sh, f) => {
    const t = new Img(16, 16);
    const blade = (x, h, c, lean) => { for (let i = 0; i < h; i++) { const xx = x + Math.round((sh + lean) * (i / h) * 1.5); t.set(xx, 14 - i, i === h - 1 ? g.l3 : c); } };
    blade(4, 7, g.l1, -1); blade(6, 10, g.l2, 0); blade(8, 8, g.base, 0); blade(9, 11, g.l1, 1); blade(11, 7, g.base, 1); blade(5, 5, g.d1, -1); blade(10, 6, g.d1, 1); blade(7, 6, g.l2, 0);
    t.hline(4, 15, 8, g.d2);
    t.outline(O, 0.7);
    img.blit(t, f * 16, 0);
  });
  return img;
}

export function buildButterfly() {
  const cols = [['#ffd65a', '#e09a2a'], ['#ffffff', '#c9d6f0'], ['#ff8fb1', '#d65a86'], ['#7fd3ff', '#3f8fc8']];
  const img = new Img(8 * 2, 8 * cols.length);
  cols.forEach(([a, b], ci) => {
    for (let f = 0; f < 2; f++) {
      const t = new Img(8, 8);
      if (f === 0) { t.rect(1, 2, 3, 3, a); t.rect(4, 2, 3, 3, a); t.set(1, 4, b); t.set(6, 4, b); t.rect(2, 5, 1, 1, b); t.set(5, 5, b); }
      else { t.rect(2, 2, 2, 3, a); t.rect(4, 2, 2, 3, a); t.set(3, 4, b); }
      t.vline(3, 2, 4, '#3a2a22'); t.vline(4, 2, 4, '#3a2a22');
      img.blit(t, f * 8, ci * 8);
    }
  });
  return img;
}

/** 닭: 16x16, 행 = [down, side, up], 열 = idle0 idle1 walk0 walk1 peck0 peck1 */
export function buildChicken(white = true) {
  const body = white ? { d: '#c9c0b4', b: '#f4efe6', l: '#ffffff' } : { d: '#8a4f2a', b: '#b8743f', l: '#d89a5e' };
  const img = new Img(16 * 6, 16 * 3);
  const comb = '#e0473b', beak = '#f2a93a';
  const drawSide = (t, f) => {
    const step = f === 2 ? 1 : f === 3 ? -1 : 0, peck = f >= 4;
    t.ellipse(9, 10, 5, 3.5, body.b); t.rect(6, 8, 6, 2, body.l); t.ellipse(12, 9, 2, 2.5, body.d); // 꼬리
    t.rect(13, 6, 2, 2, body.b);
    const hy = peck ? (f === 4 ? 9 : 11) : 4, hx = peck ? 3 : 4;
    t.rect(hx, hy, 4, 4, body.b); t.rect(hx, hy, 3, 1, body.l); t.set(hx + 1, hy + 1, '#241812');
    t.set(hx - 1, hy + 2, beak); t.set(hx + 1, hy - 1, comb); t.set(hx + 2, hy - 1, comb); t.set(hx + 1, hy + 3, comb);
    if (!peck) t.rect(hx + 2, hy + 3, 2, 3, body.b);
    t.vline(8 + step, 13, 2, beak); t.vline(10 - step, 13, 2, beak);
    t.rect(8, 10, 4, 2, body.d);
  };
  const drawFront = (t, f, up) => {
    const step = f === 2 ? 1 : f === 3 ? -1 : 0, peck = f >= 4;
    t.ellipse(8, 10, 4.5, 3.5, body.b); t.rect(5, 8, 3, 3, body.l); t.rect(10, 9, 2, 3, body.d);
    const hy = peck && !up ? 7 : 4;
    t.rect(6, hy, 4, 4, body.b); t.rect(6, hy, 2, 1, body.l);
    t.set(7, hy - 1, comb); t.set(8, hy - 1, comb);
    if (!up) { t.set(6, hy + 1, '#241812'); t.set(9, hy + 1, '#241812'); t.set(7, hy + 2, beak); t.set(8, hy + 2, beak); t.set(8, hy + 3, comb); }
    else { t.rect(6, 12, 4, 2, body.d); t.set(7, 13, body.l); }
    t.vline(6, 13 - (step > 0 ? 1 : 0), 2, beak); t.vline(9, 13 - (step < 0 ? 1 : 0), 2, beak);
  };
  for (let r = 0; r < 3; r++) for (let f = 0; f < 6; f++) {
    const t = new Img(16, 16);
    if (r === 1) drawSide(t, f); else drawFront(t, f, r === 2);
    if (f === 1 && r !== 1) { /* 숨쉬기 */ }
    t.outline(O, 0.5);
    img.blit(t, f * 16, r * 16);
  }
  return img;
}

export function buildShadow() {
  const t = new Img(32, 12);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 32; x++) {
    const dx = (x + 0.5 - 16) / 16, dy = (y + 0.5 - 6) / 6; const r = dx * dx + dy * dy;
    if (r < 1) t.put(x, y, [32, 22, 40, Math.round(110 * (r < 0.55 ? 1 : (1 - r) / 0.45))]);
  }
  return t;
}

export function buildGlow(size = 128, color = [255, 214, 140]) {
  const t = new Img(size, size), c = size / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c) / c; if (d >= 1) continue;
    const a = Math.pow(1 - d, 2);
    t.put(x, y, [color[0], color[1], color[2], Math.round(a * 255)]);
  }
  return t;
}

export function buildCloudShadow() {
  const W = 256, H = 128, t = new Img(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2), dy = (y - H / 2) / (H / 2);
    const n = fbm(x / 40, y / 40, 50, 17, 3);
    const v = 1 - Math.sqrt(dx * dx + dy * dy) + (n - 0.5) * 0.9;
    if (v > 0.25) t.put(x, y, [20, 30, 60, Math.round(Math.min(1, (v - 0.25) * 3) * 255)]);
  }
  return t;
}

export function buildCursor() {
  const t = new Img(18, 18), c = '#fff8ec', d = '#2a1b14';
  for (const [x, y, sx, sy] of [[0, 0, 1, 1], [17, 0, -1, 1], [0, 17, 1, -1], [17, 17, -1, -1]]) {
    for (let i = 0; i < 5; i++) { t.set(x + sx * i, y, d); t.set(x, y + sy * i, d); }
    for (let i = 1; i < 4; i++) { t.set(x + sx * i, y + sy, c); t.set(x + sx, y + sy * i, c); }
  }
  return t;
}

/** 감정 말풍선 16x16: ... ! ♥ ? ♪ */
export function buildEmotes() {
  // 0 ... · 1 ! · 2 하트 · 3 ? · 4 음표 · 5 웃음 · 6 슬픔 · 7 화남
  const img = new Img(16 * 8, 16);
  for (let i = 0; i < 8; i++) {
    const t = new Img(16, 16);
    t.rrect(1, 1, 14, 11, '#fff8ec', 2); t.set(6, 12, '#fff8ec'); t.set(7, 12, '#fff8ec'); t.set(6, 13, '#fff8ec');
    t.hline(3, 11, 11, '#d9cbb3');
    const ink = '#2a1b14';
    if (i === 0) { for (const x of [4, 7, 10]) { t.rect(x, 6, 2, 2, ink); } }
    if (i === 1) { t.rect(7, 3, 2, 5, '#d8473b'); t.rect(7, 9, 2, 1, '#d8473b'); }
    if (i === 2) { const h = '#e0475b'; t.rect(4, 4, 3, 3, h); t.rect(9, 4, 3, 3, h); t.rect(5, 6, 6, 2, h); t.rect(6, 8, 4, 1, h); t.rect(7, 9, 2, 1, h); t.set(5, 5, '#ff9fb0'); }
    if (i === 3) { t.rect(6, 3, 4, 1, '#3f8fc8'); t.set(10, 4, '#3f8fc8'); t.set(10, 5, '#3f8fc8'); t.rect(8, 6, 2, 1, '#3f8fc8'); t.set(8, 7, '#3f8fc8'); t.set(8, 9, '#3f8fc8'); t.set(5, 4, '#3f8fc8'); }
    if (i === 4) { const m = '#7d5aa8'; t.rect(5, 7, 3, 2, m); t.vline(7, 3, 5, m); t.rect(8, 3, 3, 1, m); t.rect(10, 4, 1, 2, m); }
    if (i === 5) { // ^ ^ 웃는 눈 + 입 + 볼터치
      t.set(4, 5, ink); t.set(5, 4, ink); t.set(6, 5, ink); t.set(9, 5, ink); t.set(10, 4, ink); t.set(11, 5, ink);
      t.rect(6, 7, 4, 1, ink); t.rect(7, 8, 2, 1, '#e0475b'); t.set(3, 7, '#ff9fb0'); t.set(12, 7, '#ff9fb0');
    }
    if (i === 6) { // 슬픈 눈썹 + 눈물
      t.set(4, 4, ink); t.set(5, 5, ink); t.set(11, 4, ink); t.set(10, 5, ink); t.rect(5, 6, 1, 1, ink); t.rect(10, 6, 1, 1, ink);
      const w = '#5aa8e0'; t.set(4, 7, w); t.rect(4, 8, 1, 2, w); t.set(3, 9, w); t.rect(6, 9, 4, 1, ink); t.set(5, 8, ink); t.set(10, 8, ink);
    }
    if (i === 7) { // 💢 화남 마크: 네 모서리의 갈고리
      const r = '#d8473b', d = '#a8302a';
      for (const [x, y] of [[6, 2], [5, 3], [6, 3], [10, 2], [10, 3], [11, 3], [5, 7], [6, 7], [6, 8], [10, 7], [11, 7], [10, 8]]) t.set(x, y, r);
      for (const [x, y] of [[7, 4], [9, 4], [7, 6], [9, 6]]) t.set(x, y, d);
    }
    t.outline(O, 0.6);
    img.blit(t, i * 16, 0);
  }
  return img;
}
