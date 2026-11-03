// 마을 건물(파라미터식) + 마을 소품: 벤치, 화분, 게시판, 가판대, 카페 테이블, 모루, 오리
import { Img, mix, darken, lighten, withAlpha, hash2 } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const O = P.outline;
const ramp = (base) => ({ d2: darken(base, 0.45), d1: darken(base, 0.25), base, l1: lighten(base, 0.18), l2: lighten(base, 0.36) });

/**
 * 파라미터식 건물 생성기
 * @param o.w 가로(px) o.h 세로(px) o.wallH 벽 높이 o.wall 'plank'|'plaster'|'stone'
 */
export function buildBuilding(o) {
  const { w: W, h: H, wallH } = o;
  const t = new Img(W, H), glow = new Img(W, H);
  const r = ramp(o.roof), wc = ramp(o.wallColor);
  const wallBot = H - 7, wallTop = wallBot - wallH;
  const wx0 = 4, wx1 = W - 5;
  // ── 벽 ──
  for (let y = wallTop; y < wallBot; y++) for (let x = wx0; x <= wx1; x++) {
    let c;
    if (o.wall === 'plank') {
      const row = (y - wallTop) % 5;
      c = row === 4 ? wc.d1 : row === 0 ? wc.l1 : wc.base;
      if (row !== 4 && hash2(x, y, 4) < 0.06) c = wc.d1;
      if (row !== 4 && (x + Math.floor((y - wallTop) / 5) * 7) % 23 === 0) c = wc.d1;
    } else if (o.wall === 'stone') {
      const row = Math.floor((y - wallTop) / 5), ry = (y - wallTop) % 5;
      const bx = (x + (row % 2) * 5) % 10;
      c = ry === 4 || bx === 9 ? wc.d2 : ry === 0 || bx === 0 ? wc.l1 : wc.base;
      if (ry > 0 && ry < 4 && bx > 0 && bx < 9 && hash2(Math.floor((x + (row % 2) * 5) / 10), row, 9) < 0.3) c = wc.d1;
    } else {
      c = hash2(x, y, 5) < 0.05 ? wc.d1 : wc.base;
      if (y - wallTop < 2) c = wc.l1;
    }
    t.set(x, y, c);
  }
  if (o.wall === 'plaster') { // 하프팀버(목조 골조)
    const b = P.wood.d1;
    for (const x of [wx0, wx0 + Math.floor((wx1 - wx0) / 3), wx0 + Math.floor((2 * (wx1 - wx0)) / 3), wx1 - 2]) t.rect(x, wallTop, 3, wallH, b);
    t.rect(wx0, wallTop + 2, wx1 - wx0 + 1, 3, b); t.rect(wx0, wallBot - 3, wx1 - wx0 + 1, 3, b);
  } else {
    for (const x0 of [wx0, wx1 - 3]) { t.rect(x0, wallTop, 4, wallH, P.wood.base); t.rect(x0, wallTop, 1, wallH, P.wood.l1); t.rect(x0 + 3, wallTop, 1, wallH, P.wood.d1); }
  }
  // 기초석
  for (let x = wx0 - 1; x <= wx1 + 1; x += 6) { t.rect(x, wallBot, 6, 5, P.stone.base); t.rect(x, wallBot, 6, 1, P.stone.l2); t.rect(x + 5, wallBot, 1, 5, P.stone.d1); }
  t.rect(wx0 - 1, wallBot + 4, wx1 - wx0 + 3, 1, P.stone.d2);
  t.rect(wx0, wallTop, wx1 - wx0 + 1, 3, withAlpha('#2b1810', 0.5));

  // ── 창문 ──
  const win = (x0, y0, ww = 16, wh = 13) => {
    t.rect(x0 - 2, y0 - 2, ww + 4, wh + 4, o.trim ?? '#f2e6cf'); t.rect(x0 + ww + 1, y0 - 2, 1, wh + 4, darken(o.trim ?? '#f2e6cf', 0.2));
    for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) { const v = (x + y) % 9; t.set(x0 + x, y0 + y, v < 2 ? P.glass.l1 : y < 5 ? P.glass.base : P.glass.d1); }
    t.vline(x0 + Math.floor(ww / 2) - 1, y0, wh, o.trim ?? '#f2e6cf'); t.hline(x0, y0 + Math.floor(wh / 2), ww, o.trim ?? '#f2e6cf');
    glow.rect(x0, y0, ww, wh, '#ffcf6e'); glow.rect(x0, y0, ww, 4, '#ffe7a6'); glow.vline(x0 + Math.floor(ww / 2) - 1, y0, wh, '#d9a24a'); glow.hline(x0, y0 + Math.floor(wh / 2), ww, '#d9a24a');
    if (o.flowerBox) {
      t.rect(x0 - 3, y0 + wh + 1, ww + 6, 4, '#8c4f2c'); t.rect(x0 - 3, y0 + wh + 1, ww + 6, 1, '#b06a3c');
      const cols = ['#ff7aa8', '#ffd65a', '#ffffff', '#b78cff'];
      for (let i = 0; i < Math.floor(ww / 3) + 2; i++) { const fx = x0 - 2 + i * 3; t.set(fx, y0 + wh, P.leaf.base); t.set(fx, y0 + wh - 1, cols[(i + x0) % 4]); }
    }
  };
  for (const x of o.windows ?? []) win(x, wallTop + (o.winY ?? 12));
  // ── 문 ──
  const dx0 = o.doorX, dw = 14, dy0 = wallBot - 24;
  t.rect(dx0 - 2, dy0 - 3, dw + 4, wallBot - dy0 + 3, o.trim ?? '#f2e6cf');
  if (o.openDoor) {
    t.rect(dx0, dy0, dw, wallBot - dy0, '#3a2014');
    for (let y = dy0 + 6; y < wallBot; y++) for (let x = dx0 + 1; x < dx0 + dw - 1; x++) if (hash2(x, y, 3) < 0.4) t.set(x, y, mix('#ff8a3a', '#3a2014', (wallBot - y) / 24));
    glow.rect(dx0, dy0 + 4, dw, wallBot - dy0 - 4, '#ff9a4a');
  } else {
    const dc = ramp(o.doorColor ?? '#7a4a2a');
    t.rect(dx0, dy0, dw, wallBot - dy0, dc.base);
    for (let x = dx0 + 1; x < dx0 + dw; x += 4) t.rect(x, dy0 + 1, 3, wallBot - dy0 - 1, dc.l1);
    t.rect(dx0 + 2, dy0 + 3, dw - 4, 6, P.glass.base); t.rect(dx0 + 2, dy0 + 3, 4, 2, P.glass.l1);
    glow.rect(dx0 + 2, dy0 + 3, dw - 4, 6, '#ffcf6e');
    t.rect(dx0 + dw - 3, dy0 + 13, 2, 2, P.gold.l1);
  }
  // ── 차양(어닝) ──
  if (o.awning) {
    const [a, b] = o.awning, ax0 = o.awningX0 ?? wx0 + 4, ax1 = o.awningX1 ?? wx1 - 4, ay = wallTop + (o.awningY ?? 4);
    for (let y = 0; y < 8; y++) for (let x = ax0; x <= ax1; x++) {
      const stripe = Math.floor((x - ax0) / 4) % 2 ? a : b;
      t.set(x, ay + y, y < 1 ? lighten(stripe, 0.25) : y > 5 ? darken(stripe, 0.15) : stripe);
    }
    for (let x = ax0; x <= ax1; x++) { const k = (x - ax0) % 4; if (k === 1 || k === 2) t.set(x, ay + 8, Math.floor((x - ax0) / 4) % 2 ? darken(a, 0.2) : darken(b, 0.2)); }
    t.rect(ax0, ay + 9, ax1 - ax0 + 1, 2, withAlpha('#2b1810', 0.35));
  }
  // ── 간판 ──
  if (o.sign) {
    const sx = o.signX ?? dx0 - 5, sy = dy0 - 16, sw = 24;
    t.rect(sx, sy, sw, 12, P.wood.base); t.rect(sx, sy, sw, 1, P.wood.l2); t.rect(sx, sy + 11, sw, 1, P.wood.d2); t.rect(sx + sw - 1, sy, 1, 12, P.wood.d1);
    drawSignIcon(t, sx + sw / 2, sy + 6, o.sign);
  }
  // ── 지붕 ──
  const roofTop = 6, roofBot = wallTop + 3;
  for (let y = roofTop; y < roofBot; y++) {
    const tt = (y - roofTop) / (roofBot - roofTop), inset = Math.round(14 * (1 - tt));
    const x0 = 1 + inset, x1 = W - 2 - inset;
    for (let x = x0; x <= x1; x++) {
      const row = Math.floor((y - roofTop) / 5), ry = (y - roofTop) % 5, bx = (x + (row % 2) * 4) % 8;
      let c = ry === 4 ? r.d2 : ry === 3 ? r.d1 : ry === 0 ? r.l1 : r.base;
      if (o.roofStyle === 'slate') { c = ry === 4 ? r.d2 : ry === 0 ? r.l1 : r.base; if (bx === 7 && ry < 4) c = r.d2; }
      else { if (bx === 7 && ry < 4) c = r.d1; if (ry === 1 && bx < 3) c = r.l2; }
      if (x > x1 - 3) c = mix(c, r.d2, 0.55);
      if (x < x0 + 2) c = mix(c, r.l2, 0.3);
      t.set(x, y, c);
    }
  }
  t.rect(15, roofTop - 3, W - 30, 4, r.d1); t.rect(15, roofTop - 3, W - 30, 1, r.l1);
  t.rect(0, roofBot - 1, W, 3, P.wood.d1); t.rect(0, roofBot - 1, W, 1, P.wood.l1);
  if (o.chimneyX !== undefined) {
    const cx0 = o.chimneyX;
    for (let y = 0; y < 22; y++) for (let x = 0; x < 9; x++) { const row = Math.floor(y / 4), bx = (x + (row % 2) * 3) % 6; let c = y % 4 === 3 || bx === 5 ? P.stone.d1 : P.stone.base; if (x === 0) c = P.stone.l1; if (x === 8) c = P.stone.d2; t.set(cx0 + x, y, c); }
    t.rect(cx0 - 1, 0, 11, 2, P.stone.l1);
  }
  if (o.clock) { // 회관 시계
    const cx = Math.floor(W / 2), cy = roofTop + 14;
    t.circle(cx, cy, 8, '#f2e6cf'); t.circle(cx, cy, 6.5, '#fff8ec'); t.vline(cx, cy - 5, 5, P.ink); t.hline(cx, cy, 4, P.ink);
    for (const [ddx, ddy] of [[0, -6], [6, 0], [0, 6], [-6, 0]]) t.set(cx + ddx, cy + ddy, P.wood.d1);
  }
  if (o.flag) { const fx = W - 22; t.vline(fx, 0, 14, '#5a5a6a'); t.rect(fx + 1, 0, 8, 5, '#d8473b'); t.rect(fx + 1, 2, 8, 1, '#ffd65a'); }
  if (o.dormer) {
    const dmx = Math.floor(W / 2) - 10, dmy = roofTop + 8;
    t.rect(dmx + 3, dmy + 6, 14, 11, wc.base); t.rect(dmx + 5, dmy + 8, 10, 7, P.glass.d1); t.rect(dmx + 5, dmy + 8, 10, 3, P.glass.base); t.vline(dmx + 10, dmy + 8, 7, '#f2e6cf');
    for (let y = 0; y < 8; y++) { const half = 2 + y * 1.4; t.hline(Math.round(dmx + 10 - half), dmy - 1 + y, Math.round(half * 2), y < 2 ? r.l1 : r.base); }
    glow.rect(dmx + 5, dmy + 8, 10, 7, '#ffcf6e');
  }
  t.outline(O, 0.55);
  return { img: t, glow, cellW: Math.round(W / 16), cellH: Math.ceil((wallH + 7) / 16), doorCell: Math.floor((dx0 + dw / 2) / 16) };
}

function drawSignIcon(t, cx, cy, kind) {
  cx = Math.round(cx); cy = Math.round(cy);
  if (kind === 'seed') { t.rect(cx - 3, cy - 4, 7, 8, '#efe3c4'); t.rect(cx - 2, cy - 2, 5, 4, '#7cc45a'); t.set(cx, cy - 1, '#fff8e6'); }
  if (kind === 'cup') { t.rect(cx - 4, cy - 2, 6, 5, '#fff8ec'); t.rect(cx - 3, cy - 2, 4, 1, '#7a4a2a'); t.vline(cx + 2, cy - 1, 2, '#fff8ec'); t.set(cx + 3, cy, '#fff8ec'); t.set(cx - 2, cy - 4, '#d9cbb3'); t.set(cx - 1, cy - 5, '#d9cbb3'); }
  if (kind === 'anvil') { t.rect(cx - 5, cy - 3, 10, 3, '#5a6273'); t.rect(cx - 2, cy, 4, 2, '#3c4250'); t.rect(cx - 4, cy + 2, 8, 2, '#3c4250'); t.set(cx - 5, cy - 3, '#a9b3c4'); }
  if (kind === 'star') { const c = '#ffd65a'; t.vline(cx, cy - 4, 9, c); t.hline(cx - 4, cy, 9, c); t.rect(cx - 2, cy - 2, 5, 5, c); }
  if (kind === 'heart') { const h = '#e0475b'; t.rect(cx - 4, cy - 3, 3, 3, h); t.rect(cx + 1, cy - 3, 3, 3, h); t.rect(cx - 3, cy - 1, 7, 2, h); t.rect(cx - 2, cy + 1, 5, 1, h); t.set(cx, cy + 2, h); }
}

export const BUILDINGS = {
  store: { w: 112, h: 112, wallH: 50, wall: 'plank', wallColor: '#d6a467', roof: '#3f8a5f', doorX: 49, windows: [16, 80], awning: ['#d8473b', '#fff1dc'], awningX0: 12, awningX1: 99, awningY: 3, sign: 'seed', signX: 44, flowerBox: true, dormer: true },
  cafe: { w: 96, h: 108, wallH: 50, wall: 'plaster', wallColor: '#f2e3c8', roof: '#8a4a6a', doorX: 41, windows: [12, 70], awning: ['#2f8f8a', '#fff1dc'], awningY: 3, sign: 'cup', signX: 36, flowerBox: true, chimneyX: 70 },
  hall: { w: 144, h: 128, wallH: 58, wall: 'stone', wallColor: '#c9c3b6', roof: '#4a6a9a', roofStyle: 'slate', doorX: 65, windows: [14, 38, 92, 116], clock: true, flag: true, sign: 'star', signX: 60, trim: '#efe7d6' },
  smithy: { w: 96, h: 104, wallH: 48, wall: 'stone', wallColor: '#8c8a90', roof: '#4a4048', roofStyle: 'slate', doorX: 41, windows: [12], openDoor: true, chimneyX: 72, sign: 'anvil', signX: 62 },
  house_a: { w: 80, h: 96, wallH: 44, wall: 'plank', wallColor: '#8ab0c8', roof: '#b84a3a', doorX: 33, windows: [10, 58], flowerBox: true, chimneyX: 56, doorColor: '#3f6a8c' },
  house_b: { w: 80, h: 96, wallH: 44, wall: 'plaster', wallColor: '#f2c8c0', roof: '#2f7a72', doorX: 33, windows: [12, 56], flowerBox: true, doorColor: '#8a4a3a' },
  house_c: { w: 80, h: 96, wallH: 44, wall: 'plank', wallColor: '#c9a27a', roof: '#6a4a8a', doorX: 33, windows: [10, 58], chimneyX: 14, doorColor: '#4a6a3a', dormer: true },
};

// ── 소품 ───────────────────────────────────────────────
export function buildBench() {
  const t = new Img(32, 22), w = P.wood;
  t.rect(3, 2, 26, 3, w.l1); t.rect(3, 2, 26, 1, w.l2); t.rect(3, 6, 26, 2, w.base);
  t.rect(2, 11, 28, 3, w.l1); t.rect(2, 11, 28, 1, w.l2); t.rect(2, 14, 28, 1, w.d1);
  for (const x of [4, 26]) { t.rect(x, 2, 2, 18, '#3f3f4a'); t.vline(x, 2, 18, '#5a5a6a'); }
  t.outline(O, 0.55);
  return t;
}
export function buildPlanter() {
  const t = new Img(18, 22), s = P.stone;
  t.rect(1, 12, 16, 9, s.base); t.rect(1, 12, 16, 1, s.l2); t.rect(15, 12, 2, 9, s.d1); t.hline(1, 16, 16, s.d1);
  const cols = ['#ff7aa8', '#ffd65a', '#ffffff', '#ff6a4d', '#b78cff'];
  for (let i = 0; i < 9; i++) { const x = 2 + ((i * 7) % 14), y = 4 + ((i * 5) % 7); t.vline(x, y + 1, 12 - y, P.leaf.d1); t.set(x - 1, y + 3, P.leaf.base); t.rect(x - 1, y - 1, 3, 2, cols[i % 5]); t.set(x, y - 1, lighten(cols[i % 5], 0.4)); t.set(x, y, '#ffd84a'); }
  t.outline(O, 0.55);
  return t;
}
export function buildBoard() {
  const t = new Img(32, 34), w = P.wood;
  t.rect(4, 14, 3, 19, w.d1); t.rect(25, 14, 3, 19, w.d1);
  t.rect(1, 2, 30, 20, w.base); t.rect(1, 2, 30, 1, w.l2); t.rect(1, 21, 30, 1, w.d2); t.rect(3, 4, 26, 16, '#c9a06a');
  t.rect(1, 0, 30, 3, P.roof.base); t.rect(1, 0, 30, 1, P.roof.l1);
  for (const [x, y, c] of [[5, 6, '#fff8ec'], [14, 5, '#ffe58a'], [21, 7, '#cfe7f0'], [8, 12, '#ffd0d8']]) { t.rect(x, y, 7, 7, c); t.hline(x + 1, y + 2, 5, '#8a7a6a'); t.hline(x + 1, y + 4, 4, '#8a7a6a'); t.set(x + 3, y, '#d8473b'); }
  t.outline(O, 0.55);
  return t;
}
export function buildStall(colors = ['#e0a43a', '#fff1dc']) {
  const t = new Img(48, 46), w = P.wood;
  t.rect(4, 12, 2, 32, w.d1); t.rect(42, 12, 2, 32, w.d1);
  t.rect(2, 28, 44, 14, w.base); for (let x = 2; x < 46; x += 5) t.vline(x, 28, 14, w.d1); t.rect(2, 28, 44, 2, w.l2);
  // 진열 상자
  const goods = [['#d8473b', '#ff8a7a'], ['#e8892e', '#f2a64a'], ['#7cc45a', '#a8e07a'], ['#f3e6c4', '#fff8e6']];
  goods.forEach(([a, b], i) => { const x = 5 + i * 10; t.rect(x, 22, 9, 7, w.l1); t.rect(x, 22, 9, 1, w.l2); for (let k = 0; k < 5; k++) { t.rect(x + 1 + (k % 3) * 3, 19 + (k > 2 ? 2 : 0), 2, 2, a); t.set(x + 1 + (k % 3) * 3, 19 + (k > 2 ? 2 : 0), b); } });
  for (let y = 0; y < 10; y++) for (let x = 0; x < 48; x++) { const c = Math.floor(x / 6) % 2 ? colors[0] : colors[1]; if (y >= 2 + Math.abs(24 - x) / 12) t.set(x, y + 2, y < 3 ? lighten(c, 0.2) : y > 7 ? darken(c, 0.15) : c); }
  for (let x = 0; x < 48; x += 6) { t.set(x + 2, 12, darken(colors[0], 0.2)); t.set(x + 3, 12, darken(colors[0], 0.2)); }
  t.outline(O, 0.55);
  return t;
}
export function buildCafeTable() {
  const t = new Img(28, 34);
  const u = ['#2f8f8a', '#fff1dc'];
  t.vline(14, 6, 22, '#5a5a6a');
  for (let y = 0; y < 8; y++) { const half = 3 + y * 1.6; for (let x = Math.round(14 - half); x <= Math.round(14 + half); x++) t.set(x, y + 1, Math.floor((x + 1) / 4) % 2 ? u[0] : u[1]); }
  t.hline(1, 9, 27, darken(u[0], 0.3));
  t.ellipse(14, 25, 9, 3, '#d9c8a8'); t.ellipse(14, 24, 9, 2.5, '#f2e6cf'); t.rect(13, 27, 3, 5, '#5a5a6a');
  t.rect(10, 22, 3, 2, '#fff8ec'); t.set(11, 22, '#7a4a2a'); t.rect(16, 22, 3, 2, '#e8a0b0');
  t.outline(O, 0.55);
  return t;
}
export function buildAnvil() {
  const t = new Img(18, 16), m = P.metal;
  t.rect(4, 11, 10, 4, P.wood.base); t.rect(4, 11, 10, 1, P.wood.l1);
  t.rect(2, 4, 14, 4, m.d1); t.rect(2, 4, 14, 1, m.l1); t.rect(0, 5, 3, 2, m.d1); t.rect(6, 8, 6, 3, m.d2);
  t.outline(O, 0.55);
  return t;
}
/** 오리 16x16: [헤엄0, 헤엄1, 자맥질0, 자맥질1] (왼쪽 방향) */
export function buildDuck() {
  const img = new Img(16 * 4, 16);
  for (let f = 0; f < 4; f++) {
    const t = new Img(16, 16), bob = f === 1 ? 1 : 0;
    const ripple = withAlpha(P.water.foam, 0.7);
    if (f < 2) {
      t.ellipse(9, 11 + bob, 5, 3, '#f4efe6'); t.rect(7, 9 + bob, 6, 2, '#ffffff'); t.rect(12, 10 + bob, 2, 2, '#c9c0b4');
      t.rect(4, 5 + bob, 4, 5, '#2f7a4a'); t.rect(4, 5 + bob, 3, 1, '#4fa06a'); t.set(5, 6 + bob, P.ink); t.rect(2, 7 + bob, 2, 1, '#f2a93a');
      t.hline(3, 14, 12, ripple); t.set(2, 13, ripple); t.set(15, 13, ripple);
    } else {
      t.ellipse(9, 12, 4, 2, '#f4efe6'); t.rect(11, 9 + (f - 2), 3, 3, '#ffffff'); t.set(13, 8 + (f - 2), '#c9c0b4');
      t.hline(3, 14, 12, ripple); t.hline(5, 13, 3, ripple);
    }
    t.outline(O, 0.5);
    img.blit(t, f * 16, 0);
  }
  return img;
}
