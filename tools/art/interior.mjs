// 건물 실내: 방 배경(벽지·바닥·벽 장식을 한 장으로) + Y-정렬 가구 스프라이트 + 방 레이아웃(맵 생성기와 공유)
import { Img, mix, darken, lighten, hash2 } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const O = P.outline;
const T = 16;
const ramp = (base) => ({ d2: darken(base, 0.42), d1: darken(base, 0.22), base, l1: lighten(base, 0.16), l2: lighten(base, 0.32) });

// ── 방 배경 ─────────────────────────────────────────────
function drawFloor(t, x0, y0, w, h, f) {
  const c = ramp(f.color);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let col = c.base;
    if (f.kind === 'wood' || f.kind === 'woodDark') {
      const row = Math.floor((y - y0) / 6), ry = (y - y0) % 6;
      const seam = (x + row * 37 + (row % 3) * 11) % 48;
      col = ry === 5 ? c.d1 : ry === 0 ? c.l1 : seam === 0 ? c.d1 : hash2(x >> 2, row, 7) < 0.25 ? mix(c.base, c.d1, 0.35) : c.base;
      if (ry > 0 && ry < 5 && hash2(x, y, 3) < 0.04) col = c.l1;
    } else if (f.kind === 'tile') {
      const a = f.color2 ?? lighten(f.color, 0.18);
      const cx = Math.floor((x - x0) / 8), cy = Math.floor((y - y0) / 8), gx = (x - x0) % 8, gy = (y - y0) % 8;
      col = (cx + cy) % 2 ? f.color : a;
      if (gx === 7 || gy === 7) col = darken(col, 0.18);
      else if (gx === 0 || gy === 0) col = lighten(col, 0.08);
    } else if (f.kind === 'stone') {
      const row = Math.floor((y - y0) / 8), ry = (y - y0) % 8, bx = (x - x0 + (row % 2) * 6) % 12;
      col = ry === 7 || bx === 11 ? c.d2 : ry === 0 || bx === 0 ? c.l1 : hash2(Math.floor((x - x0 + (row % 2) * 6) / 12), row, 5) < 0.35 ? c.d1 : c.base;
    } else if (f.kind === 'carpet') {
      col = hash2(x, y, 11) < 0.08 ? c.d1 : hash2(x, y, 12) < 0.05 ? c.l1 : c.base;
    }
    t.set(x, y, col);
  }
}

function drawWallpaper(t, x0, y0, w, h, wall) {
  const c = ramp(wall.color), acc = wall.accent ?? c.d1;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    let col = c.base;
    const lx = x - x0, ly = y - y0;
    if (wall.pattern === 'stripe') col = lx % 8 < 3 ? mix(c.base, acc, 0.45) : c.base;
    else if (wall.pattern === 'dots') col = (lx % 8 === 3 && ly % 8 === 3) || (lx % 8 === 7 && ly % 8 === 7) ? acc : c.base;
    else if (wall.pattern === 'plank') { col = lx % 7 === 6 ? c.d1 : lx % 7 === 0 ? c.l1 : c.base; if (hash2(lx, ly >> 3, 2) < 0.05) col = c.d1; }
    else if (wall.pattern === 'stone') { const row = Math.floor(ly / 6), bx = (lx + (row % 2) * 5) % 10; col = ly % 6 === 5 || bx === 9 ? c.d2 : ly % 6 === 0 || bx === 0 ? c.l1 : c.base; }
    else if (wall.pattern === 'tile') col = ly % 6 === 5 || lx % 6 === 5 ? c.d1 : ly % 6 === 0 ? c.l1 : c.base;
    else if (wall.pattern === 'diamond') col = (lx + ly) % 10 === 0 || (lx - ly + 100) % 10 === 0 ? acc : c.base;
    // 위쪽 그늘 → 아래로 밝아짐
    if (ly < 3) col = darken(col, 0.18 - ly * 0.05);
    t.set(x, y, col);
  }
  // 웨인스코팅(하단 패널)
  if (wall.wainscot) {
    const wc = ramp(wall.wainscot);
    const top = y0 + h - 14;
    for (let y = top; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t.set(x, y, y === top ? wc.l2 : y === top + 1 ? wc.d1 : (x - x0) % 12 === 0 ? wc.d1 : (x - x0) % 12 === 1 ? wc.l1 : wc.base);
  }
}

const DECOR = {
  window(t, x, y) { // 2칸: 하늘이 보이는 창 + 커튼
    const fx = x + 4, fy = y + 9, fw = 24, fh = 22;
    t.rect(fx - 2, fy - 2, fw + 4, fh + 4, P.wood.d1); t.rect(fx - 2, fy - 2, fw + 4, 1, P.wood.l1);
    for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) t.set(fx + i, fy + j, mix('#9fd6f0', '#e6f6ff', j / fh));
    t.rect(fx + 3, fy + 4, 6, 2, '#ffffff'); t.rect(fx + 15, fy + 9, 5, 2, '#ffffff');
    t.rect(fx + fw / 2 - 1, fy, 2, fh, P.wood.base); t.rect(fx, fy + fh / 2 - 1, fw, 2, P.wood.base);
    t.rect(fx - 3, fy + fh + 1, fw + 6, 3, P.wood.l1); t.hline(fx - 3, fy + fh + 3, fw + 6, P.wood.d1);
    for (const cx of [fx - 4, fx + fw]) { t.rect(cx, fy - 3, 4, fh + 2, '#d8605a'); t.vline(cx + 1, fy - 3, fh + 2, '#ee8a7a'); t.vline(cx + 3, fy - 3, fh + 2, '#a8403a'); }
    t.rect(fx - 5, fy - 5, fw + 10, 2, P.wood.d2);
  },
  fireplace(t, x, y) { // 2칸 벽난로 (아래쪽은 걸레받이까지)
    const s = P.stone;
    t.rect(x + 1, y + 10, 30, 38, s.base);
    for (let j = 0; j < 38; j += 5) for (let i = 0; i < 30; i += 8) { const o = (j / 5) % 2 ? 4 : 0; t.hline(x + 1, y + 10 + j, 30, s.d1); t.vline(x + 1 + ((i + o) % 30), y + 10 + j, 5, s.d1); }
    t.rect(x, y + 8, 32, 4, P.wood.base); t.hline(x, y + 8, 32, P.wood.l2); t.hline(x, y + 11, 32, P.wood.d2);
    t.rect(x + 7, y + 24, 18, 24, '#1e1418');
    for (let i = 0; i < 18; i++) { const hgt = 8 + Math.round(Math.sin(i * 1.3) * 3 + hash2(i, 1, 4) * 4); for (let j = 0; j < hgt; j++) t.set(x + 7 + i, y + 47 - j, j > hgt - 3 ? '#ffe08a' : j > hgt * 0.5 ? '#ff9a3a' : '#e8502e'); }
    t.rect(x + 9, y + 44, 14, 3, P.bark.d1); t.rect(x + 10, y + 44, 12, 1, P.bark.l1);
    t.rect(x + 4, y + 3, 4, 5, '#d8b06a'); t.rect(x + 22, y + 2, 5, 6, '#7aa0d8'); t.rect(x + 13, y + 4, 6, 4, '#e07a8a');
  },
  clock(t, x, y) { t.rect(x + 5, y + 10, 6, 12, P.wood.base); t.circle(x + 8, y + 13, 3, '#fff8ec'); t.set(x + 8, y + 12, O); t.set(x + 9, y + 13, O); t.rect(x + 7, y + 18, 2, 3, P.gold.base); t.hline(x + 5, y + 10, 6, P.wood.l1); },
  painting(t, x, y) { t.rect(x + 2, y + 10, 12, 10, P.gold.d1); t.rect(x + 3, y + 11, 10, 8, '#8fcdee'); t.rect(x + 3, y + 16, 10, 3, P.grass.base); t.circle(x + 10, y + 13, 1, '#fff0a0'); t.rect(x + 5, y + 14, 2, 2, P.leaf.d1); },
  painting2(t, x, y) { t.rect(x + 3, y + 8, 26, 16, P.wood.d1); t.rect(x + 4, y + 9, 24, 14, '#f6d8a8'); for (let i = 0; i < 24; i++) t.set(x + 4 + i, y + 16 + Math.round(Math.sin(i / 3) * 2), '#e07a58'); t.rect(x + 4, y + 18, 24, 5, '#4f9a5f'); t.circle(x + 22, y + 13, 2, '#fff4c0'); },
  shelf(t, x, y) { t.rect(x + 2, y + 18, 28, 2, P.wood.base); t.hline(x + 2, y + 20, 28, P.wood.d1); const cols = ['#d8473b', '#7fc0de', '#f0c84a', '#7cc45a', '#b78cff']; for (let i = 0; i < 5; i++) { const h = 4 + (i % 2) * 2; t.rect(x + 4 + i * 5, y + 18 - h, 4, h, cols[i]); t.set(x + 4 + i * 5, y + 18 - h, lighten(cols[i], 0.4)); } },
  menu(t, x, y) { t.rect(x + 2, y + 6, 28, 22, P.wood.base); t.rect(x + 4, y + 8, 24, 18, '#2e3a34'); for (let i = 0; i < 4; i++) { t.hline(x + 7, y + 11 + i * 4, 12 + (i % 2) * 4, '#e8e0d0'); t.rect(x + 23, y + 11 + i * 4, 2, 1, '#ffd65a'); } },
  toolrack(t, x, y) { t.rect(x + 2, y + 10, 28, 3, P.wood.base); const tools = [[5, P.metal.l1], [12, P.metal.base], [19, P.metal.d1], [26, P.metal.l1]]; for (const [tx, c] of tools) { t.vline(x + tx, y + 12, 14, P.wood.l1); t.rect(x + tx - 2, y + 24, 5, 3, c); } },
  chart(t, x, y) { t.rect(x + 2, y + 6, 28, 22, '#f4f4f8'); t.rect(x + 2, y + 6, 28, 2, '#3a8ab0'); for (let i = 0; i < 6; i++) t.rect(x + 5 + i * 4, y + 24 - (i * 3) % 12 - 3, 3, (i * 3) % 12 + 3, ['#7cc45a', '#5aa8e0', '#e8502e'][i % 3]); t.hline(x + 4, y + 25, 24, '#5a6273'); },
  banner(t, x, y) { t.rect(x + 6, y + 4, 20, 34, '#2a8a8a'); t.rect(x + 6, y + 4, 20, 2, '#7ad8d0'); for (let i = 0; i < 10; i++) { t.set(x + 6 + i, y + 38 + Math.floor(i / 2), '#2a8a8a'); t.set(x + 25 - i, y + 38 + Math.floor(i / 2), '#2a8a8a'); } t.circle(x + 16, y + 18, 6, '#e8f6f4'); for (let a = 0; a < 3; a++) t.line(x + 16, y + 18, x + 16 + Math.round(Math.cos(a * 2.1) * 6), y + 18 + Math.round(Math.sin(a * 2.1) * 6), '#2a8a8a'); },
  gear(t, x, y) { const cx = x + 16, cy = y + 22; for (let a = 0; a < 16; a++) { const r = a % 2 ? 13 : 11; t.line(cx, cy, cx + Math.round(Math.cos(a * Math.PI / 8) * r), cy + Math.round(Math.sin(a * Math.PI / 8) * r), P.wood.d1); } t.circle(cx, cy, 9, P.wood.base); t.circle(cx, cy, 3, P.wood.d2); },
  ladder(t, x, y) { t.vline(x + 4, y, 48, P.wood.d1); t.vline(x + 11, y, 48, P.wood.d1); for (let j = 4; j < 48; j += 6) t.hline(x + 4, y + j, 8, P.wood.l1); },
  poster(t, x, y) { t.rect(x + 3, y + 8, 10, 14, '#fff1dc'); t.circle(x + 8, y + 13, 3, '#e07a8a'); t.hline(x + 5, y + 19, 6, '#8a7a6a'); t.set(x + 8, y + 8, '#d8473b'); },
  heartsign(t, x, y) { t.rect(x + 2, y + 6, 28, 18, '#fff0f4'); t.rect(x + 2, y + 6, 28, 2, '#e07a8a'); const h = '#e0475b'; t.rect(x + 11, y + 11, 4, 4, h); t.rect(x + 17, y + 11, 4, 4, h); t.rect(x + 12, y + 14, 8, 3, h); t.rect(x + 14, y + 17, 4, 2, h); },
};

/** 방 배경 한 장: 바깥 어둠 + 위쪽 벽(3칸) + 양옆/아래 벽 + 바닥 + 러그 + 벽 장식 + 문 */
export function buildRoom(spec) {
  const { W, H } = spec;
  const t = new Img(W * T, H * T);
  t.rect(0, 0, W * T, H * T, '#120d10');
  const fx0 = T, fy0 = 3 * T, fw = (W - 2) * T, fh = (H - 4) * T;
  drawFloor(t, fx0, fy0, fw, fh + T, spec.floor);
  // 러그
  for (const [rx, ry, rw, rh, col] of spec.rugs ?? []) {
    const c = ramp(col);
    for (let y = ry * T + 2; y < (ry + rh) * T - 2; y++) for (let x = rx * T + 2; x < (rx + rw) * T - 2; x++) {
      const ex = Math.min(x - rx * T - 2, (rx + rw) * T - 3 - x), ey = Math.min(y - ry * T - 2, (ry + rh) * T - 3 - y), e = Math.min(ex, ey);
      t.set(x, y, e === 0 ? c.d1 : e === 2 ? c.l2 : e < 5 ? c.l1 : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? c.base : mix(c.base, c.d1, 0.25));
    }
  }
  // 위쪽 벽
  drawWallpaper(t, T, 4, (W - 2) * T, 3 * T - 8, spec.wall);
  const bb = P.wood; // 걸레받이
  t.rect(T, 3 * T - 4, (W - 2) * T, 4, bb.base); t.hline(T, 3 * T - 4, (W - 2) * T, bb.l2); t.hline(T, 3 * T - 1, (W - 2) * T, bb.d2);
  // 바닥 그늘 (벽 아래·옆)
  for (let x = fx0; x < fx0 + fw; x++) for (let k = 0; k < 4; k++) t.set(x, fy0 + k, mix(t.get(x, fy0 + k), '#000000', 0.28 - k * 0.07));
  for (let y = fy0; y < (H - 1) * T; y++) for (let k = 0; k < 3; k++) { t.set(fx0 + k, y, mix(t.get(fx0 + k, y), '#000000', 0.2 - k * 0.06)); }
  // 벽 장식
  for (const [kind, dx] of spec.decor ?? []) DECOR[kind]?.(t, dx * T, 0);
  // 벽 윗면 (어두운 테두리)
  const top = spec.trim ?? '#3a2418', topL = lighten(top, 0.25);
  const beam = (x, y, w, h) => { t.rect(x, y, w, h, top); };
  beam(0, 0, W * T, 4); t.hline(T, 3, (W - 2) * T, topL);
  beam(0, 0, T, H * T); beam((W - 1) * T, 0, T, H * T);
  t.vline(T - 1, 3, H * T - 3 - T, topL); t.vline((W - 1) * T, 3, H * T - 3 - T, topL);
  beam(0, (H - 1) * T, W * T, T); t.hline(T - 1, (H - 1) * T, (W - 2) * T + 2, topL);
  // 문: 아래 벽에 1칸 틈 + 문지방 + 발매트
  const d = spec.door;
  drawFloor(t, d * T, (H - 1) * T, T, T, { ...spec.floor, color: darken(spec.floor.color, 0.25) });
  for (let y = (H - 1) * T + 6; y < H * T; y++) for (let x = d * T; x < (d + 1) * T; x++) t.set(x, y, mix(t.get(x, y), '#120d10', Math.min(1, (y - (H - 1) * T - 6) / 9)));
  t.vline(d * T, (H - 1) * T, T, topL); t.vline((d + 1) * T - 1, (H - 1) * T, T, topL);
  const mat = ramp('#a8523a');
  t.rect(d * T + 1, (H - 2) * T + 6, 14, 9, mat.base); t.rect(d * T + 1, (H - 2) * T + 6, 14, 1, mat.l1);
  for (let x = d * T + 2; x < d * T + 15; x += 3) t.vline(x, (H - 2) * T + 8, 6, mat.d1);
  return t;
}

// ── 가구 스프라이트 ─────────────────────────────────────
const W_ = P.wood;
function sheen(t) { t.outline(O, 0.55); return t; }

function bed(color = '#5a8ad0') {
  const t = new Img(32, 36), q = ramp(color);
  t.rect(1, 0, 30, 9, W_.base); t.rect(1, 0, 30, 2, W_.l2); t.rect(3, 3, 26, 4, W_.d1);
  t.rect(2, 8, 28, 26, '#f4efe6'); t.rect(4, 10, 11, 6, '#ffffff'); t.rect(17, 10, 11, 6, '#ffffff'); t.hline(4, 15, 11, '#d8d0c0'); t.hline(17, 15, 11, '#d8d0c0');
  t.rect(2, 17, 28, 17, q.base); t.hline(2, 17, 28, q.l2); t.hline(2, 18, 28, q.l1);
  for (let y = 20; y < 34; y += 4) for (let x = 4; x < 30; x += 6) t.rect(x, y, 2, 2, q.d1);
  t.rect(2, 33, 28, 1, q.d2); t.rect(1, 33, 2, 3, W_.d1); t.rect(29, 33, 2, 3, W_.d1);
  return sheen(t);
}
function wardrobe() {
  const t = new Img(32, 40);
  t.rect(1, 2, 30, 36, W_.base); t.rect(1, 2, 30, 2, W_.l2); t.rect(0, 0, 32, 3, W_.d1); t.hline(0, 0, 32, W_.l1);
  t.rect(3, 6, 12, 30, W_.l1); t.rect(17, 6, 12, 30, W_.l1); t.vline(16, 6, 30, W_.d2);
  for (const x of [5, 19]) { t.rect(x, 9, 8, 10, W_.base); t.rect(x, 22, 8, 11, W_.base); }
  t.rect(13, 20, 2, 4, P.gold.l1); t.rect(17, 20, 2, 4, P.gold.l1);
  t.rect(3, 37, 3, 3, W_.d2); t.rect(26, 37, 3, 3, W_.d2);
  // 거울 띠
  t.rect(22, 9, 5, 22, '#cfe8f2'); t.vline(23, 10, 8, '#ffffff');
  return sheen(t);
}
function bookshelf() {
  const t = new Img(32, 40);
  t.rect(1, 0, 30, 39, W_.d1); t.rect(1, 0, 30, 2, W_.l1); t.rect(3, 3, 26, 34, W_.d2);
  const cols = ['#a83c34', '#3f8fb5', '#e0a43a', '#4f9a5f', '#7d5aa8', '#e8e0d0', '#c06a1f'];
  for (let s = 0; s < 3; s++) {
    const by = 13 + s * 12;
    t.rect(3, by, 26, 2, W_.base);
    let x = 4; let i = s * 3;
    while (x < 28) { const w = 2 + (i % 3 === 0 ? 1 : 0), h = 7 + (i % 4 === 1 ? 2 : 0) - (i % 5 === 2 ? 2 : 0); const c = cols[i % cols.length]; t.rect(x, by - h, w, h, c); t.vline(x, by - h, h, lighten(c, 0.25)); x += w + (i % 6 === 4 ? 2 : 0); i++; }
  }
  return sheen(t);
}
function kitchen() {
  const t = new Img(48, 34);
  t.rect(0, 12, 48, 22, W_.l1); t.rect(0, 10, 48, 4, '#e8e0d0'); t.hline(0, 10, 48, '#ffffff'); t.hline(0, 13, 48, '#b8b0a0');
  for (const x of [2, 18, 34]) { t.rect(x, 16, 12, 15, W_.base); t.rect(x + 5, 22, 2, 2, P.gold.l1); }
  // 스토브
  t.rect(18, 4, 14, 8, P.metal.d1); t.circle(22, 8, 2, '#3a3a44'); t.circle(28, 8, 2, '#3a3a44'); t.rect(19, 4, 12, 1, P.metal.l1);
  t.rect(26, 1, 6, 6, '#d8473b'); t.rect(26, 1, 6, 1, '#ff8a7a'); t.rect(25, 3, 1, 2, '#7a2a2a');
  // 개수대 + 도마
  t.rect(36, 9, 10, 3, P.metal.l1); t.rect(38, 4, 2, 6, P.metal.base); t.rect(38, 4, 5, 2, P.metal.base);
  t.rect(4, 7, 10, 4, '#d8a86a'); t.rect(6, 6, 3, 2, '#e8473b'); t.rect(10, 6, 2, 2, '#7cc45a');
  return sheen(t);
}
function dtable() {
  const t = new Img(48, 30);
  t.rect(2, 4, 44, 18, '#f6efe0'); for (let x = 2; x < 46; x++) for (let y = 4; y < 22; y++) if ((Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0) t.set(x, y, '#e8705a');
  t.rect(2, 4, 44, 1, '#ffffff'); t.rect(2, 22, 44, 3, '#c95a48'); for (let x = 2; x < 46; x += 4) t.set(x, 25, '#c95a48');
  t.rect(4, 25, 3, 5, W_.d1); t.rect(41, 25, 3, 5, W_.d1);
  t.circle(24, 12, 3, '#fff8ec'); t.rect(23, 7, 2, 3, '#7cc45a'); t.set(24, 6, '#ff7aa8'); // 꽃병
  return sheen(t);
}
function chair(flip = false) {
  const t = new Img(16, 22);
  t.rect(3, 0, 3, 16, W_.base); t.vline(3, 0, 16, W_.l1); t.rect(3, 1, 3, 2, W_.l2);
  t.rect(3, 11, 10, 4, W_.l1); t.hline(3, 11, 10, W_.l2); t.rect(3, 15, 10, 2, W_.d1);
  t.rect(3, 17, 2, 5, W_.d1); t.rect(11, 17, 2, 5, W_.d1);
  t.rect(6, 9, 7, 3, '#e8705a');
  if (flip) { const f = new Img(16, 22); f.blit(t, 0, 0, { flipX: true }); return sheen(f); }
  return sheen(t);
}
function stool() { const t = new Img(16, 14); t.ellipse(8, 3, 6, 3, '#c95a48'); t.ellipse(8, 2, 6, 2, '#e8705a'); t.rect(4, 5, 2, 9, P.metal.d1); t.rect(10, 5, 2, 9, P.metal.d1); t.hline(4, 10, 8, P.metal.base); return sheen(t); }
function plant(kind = 0) {
  const t = new Img(16, 26), l = P.leaf;
  t.rect(4, 17, 8, 8, '#c06a3a'); t.rect(3, 16, 10, 3, '#d8804a'); t.hline(3, 16, 10, '#f0a060'); t.vline(10, 19, 6, '#9a4a2a');
  if (kind === 0) for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.45; for (let r = 0; r < 12 - Math.abs(i - 3); r++) t.set(8 + Math.round(Math.cos(a) * r), 16 + Math.round(Math.sin(a) * r), r > 6 ? l.l2 : r > 3 ? l.l1 : l.base); }
  else { t.circle(8, 9, 6, l.base); t.circle(7, 8, 4, l.l1); t.circle(6, 6, 2, l.l2); for (const [x, y] of [[4, 9], [10, 6], [9, 12]]) t.rect(x, y, 2, 2, '#ff7aa8'); }
  return sheen(t);
}
function sofa(color = '#4f9a5f') {
  const t = new Img(48, 26), q = ramp(color);
  t.rect(2, 2, 44, 12, q.base); t.hline(2, 2, 44, q.l2); t.rect(4, 4, 40, 8, q.l1);
  t.rect(0, 8, 6, 16, q.d1); t.rect(42, 8, 6, 16, q.d1); t.hline(0, 8, 6, q.l1); t.hline(42, 8, 6, q.l1);
  t.rect(6, 13, 36, 9, q.base); t.hline(6, 13, 36, q.l2); t.vline(24, 13, 9, q.d1);
  t.rect(6, 22, 36, 2, q.d2); t.rect(3, 24, 3, 2, W_.d2); t.rect(42, 24, 3, 2, W_.d2);
  t.rect(8, 6, 7, 6, '#f0c84a'); t.rect(33, 6, 7, 6, '#e8705a');
  return sheen(t);
}
function lampFloor() { const t = new Img(16, 34); t.rect(7, 10, 2, 22, P.metal.d1); t.rect(4, 31, 8, 3, P.metal.base); for (let y = 0; y < 10; y++) { const hw = 3 + Math.floor(y / 2); t.hline(8 - hw, y + 1, hw * 2, y < 2 ? '#fff4c0' : mix('#ffd88a', '#e8a04a', y / 10)); } return sheen(t); }
function counter(top = 'shop') {
  const t = new Img(64, 30);
  t.rect(0, 12, 64, 18, W_.base); for (let x = 0; x < 64; x += 8) t.vline(x, 14, 16, W_.d1); t.rect(0, 9, 64, 5, W_.l1); t.hline(0, 9, 64, W_.l2); t.hline(0, 13, 64, W_.d1);
  t.rect(0, 28, 64, 2, W_.d2);
  if (top === 'shop') { t.rect(6, 3, 10, 7, '#d8a86a'); t.rect(7, 4, 8, 2, '#f0c84a'); t.rect(44, 4, 12, 6, P.metal.base); t.rect(45, 5, 10, 2, '#7cc45a'); t.rect(47, 1, 6, 3, P.metal.d1); t.rect(26, 6, 5, 4, '#7fc0de'); t.rect(32, 5, 4, 5, '#e8705a'); }
  if (top === 'cafe') { t.rect(4, 0, 12, 10, P.metal.d1); t.rect(5, 1, 10, 3, P.metal.l1); t.rect(8, 6, 4, 3, '#5a3a2a'); t.rect(22, 5, 18, 5, '#e8e0d0'); t.circle(26, 5, 2, '#e8a0b0'); t.circle(32, 5, 2, '#f0c84a'); t.circle(37, 5, 2, '#a8602f'); t.rect(46, 6, 4, 4, '#fff8ec'); t.rect(52, 6, 4, 4, '#fff8ec'); t.set(47, 6, '#7a4a2a'); }
  if (top === 'heal') { t.rect(20, 0, 24, 10, '#f4f4f8'); t.rect(20, 0, 24, 2, '#ffffff'); for (let i = 0; i < 6; i++) { t.circle(24 + (i % 3) * 8, 4 + Math.floor(i / 3) * 4, 1, i % 2 ? '#e07a8a' : '#5aa8e0'); } t.rect(4, 4, 8, 6, '#e8a0b0'); t.rect(52, 3, 6, 7, '#7cc45a'); t.rect(0, 14, 64, 3, '#e07a8a'); }
  if (top === 'lab') { t.rect(4, 2, 14, 8, '#3a4a5a'); t.rect(5, 3, 12, 5, '#6ad8b0'); t.rect(40, 4, 6, 6, '#c9ecf6'); t.rect(48, 2, 4, 8, '#b78cff'); t.rect(26, 5, 8, 5, '#f4f4f8'); }
  return sheen(t);
}
function shelfGoods(seed = 0) {
  const t = new Img(32, 40);
  t.rect(0, 0, 32, 40, W_.d1); t.rect(2, 2, 28, 36, W_.d2); t.hline(0, 0, 32, W_.l1);
  const cols = ['#e8705a', '#f0c84a', '#7cc45a', '#7fc0de', '#e8a0b0', '#d8a86a', '#b78cff', '#fff8ec'];
  for (let s = 0; s < 3; s++) {
    const by = 12 + s * 12; t.rect(2, by, 28, 2, W_.base); t.hline(2, by, 28, W_.l1);
    for (let i = 0; i < 5; i++) { const c = cols[(i + s * 3 + seed) % cols.length], kind = (i + s + seed) % 3; const x = 3 + i * 5.4 | 0;
      if (kind === 0) { t.rect(x, by - 7, 4, 7, c); t.rect(x + 1, by - 9, 2, 2, darken(c, 0.2)); }
      else if (kind === 1) { t.rect(x, by - 5, 5, 5, c); t.hline(x, by - 5, 5, lighten(c, 0.3)); }
      else { t.circle(x + 2, by - 3, 2, c); t.set(x + 1, by - 4, lighten(c, 0.4)); } }
  }
  return sheen(t);
}
function forge() {
  const t = new Img(32, 42), b = ramp('#8a4a3a');
  t.rect(1, 6, 30, 36, b.base);
  for (let y = 6; y < 42; y += 5) { t.hline(1, y, 30, b.d1); for (let x = 1 + ((y / 5) % 2) * 4; x < 31; x += 8) t.vline(x, y, 5, b.d1); }
  t.rect(8, 0, 16, 7, b.d1); t.rect(10, 0, 12, 2, b.l1);
  t.rect(6, 20, 20, 16, '#1e1418'); t.ellipse(16, 30, 9, 5, '#e8502e'); t.ellipse(16, 30, 6, 3, '#ff9a3a'); t.ellipse(16, 30, 3, 1, '#ffe08a');
  t.rect(4, 18, 24, 2, b.l1);
  return sheen(t);
}
function labMachine() {
  const t = new Img(32, 38), m = P.metal;
  t.rect(1, 4, 30, 34, m.base); t.hline(1, 4, 30, m.l2); t.rect(1, 36, 30, 2, m.d2);
  t.rect(4, 8, 24, 12, '#1f2a36'); for (let i = 0; i < 22; i++) t.set(5 + i, 14 + Math.round(Math.sin(i / 2) * 3), '#6ad8b0');
  for (let i = 0; i < 4; i++) t.circle(7 + i * 6, 25, 1, ['#ff6a4d', '#ffd65a', '#7cc45a', '#5aa8e0'][i]);
  t.rect(4, 29, 24, 5, m.d1); for (let i = 0; i < 6; i++) t.rect(6 + i * 4, 30, 2, 3, m.l1);
  t.rect(12, 0, 2, 5, m.d1); t.circle(13, 1, 1, '#ff6a4d');
  return sheen(t);
}
function starterTable() {
  const t = new Img(48, 26);
  t.rect(1, 10, 46, 16, W_.d1); t.rect(1, 8, 46, 4, '#f4f4f8'); t.hline(1, 8, 46, '#ffffff'); t.rect(3, 14, 42, 10, W_.base);
  const orbs = [['#7cc45a', '#c3e57e'], ['#5aa8e0', '#c9ecf6'], ['#e8502e', '#ffd08a']];
  orbs.forEach(([c, l], i) => { const x = 10 + i * 14; t.ellipse(x, 9, 5, 2, '#c8c8d0'); t.circle(x, 4, 4, c); t.circle(x - 1, 3, 2, l); t.set(x - 2, 2, '#ffffff'); });
  return sheen(t);
}
function millstone() {
  const t = new Img(32, 30), s = P.stone;
  t.ellipse(16, 20, 15, 9, s.d1); t.ellipse(16, 18, 15, 9, s.base); t.ellipse(16, 17, 12, 7, s.l1);
  t.ellipse(16, 15, 9, 5, s.base); t.ellipse(16, 14, 9, 4, s.l2); t.circle(16, 14, 2, s.d2);
  t.rect(15, 0, 3, 14, W_.base); t.vline(15, 0, 14, W_.l1);
  for (let i = 0; i < 6; i++) t.set(8 + i * 3, 23 + (i % 2), '#f4ead0');
  return sheen(t);
}
function sacks() { const t = new Img(16, 18), c = ramp('#d8c090'); t.ellipse(8, 11, 7, 7, c.base); t.ellipse(7, 9, 5, 5, c.l1); t.rect(6, 2, 4, 4, c.d1); t.hline(5, 5, 6, c.d2); t.rect(5, 12, 6, 2, c.d1); return sheen(t); }
function piano() {
  const t = new Img(32, 34);
  t.rect(1, 0, 30, 24, '#2a1e24'); t.hline(1, 0, 30, '#4a3e44'); t.rect(3, 3, 26, 8, '#3a2e34'); t.rect(12, 4, 8, 5, '#f4efe6');
  t.rect(0, 20, 32, 6, '#fff8ec'); for (let x = 1; x < 32; x += 3) t.vline(x, 20, 6, '#c8c0b0'); for (let x = 2; x < 31; x += 6) { t.rect(x, 20, 2, 3, '#1e1418'); t.rect(x + 3, 20, 2, 3, '#1e1418'); }
  t.rect(2, 26, 3, 8, '#2a1e24'); t.rect(27, 26, 3, 8, '#2a1e24');
  return sheen(t);
}
function pillar() { const t = new Img(16, 42), s = P.stone; t.rect(3, 4, 10, 34, s.base); t.vline(4, 4, 34, s.l2); t.vline(11, 4, 34, s.d1); t.rect(1, 0, 14, 5, s.l1); t.hline(1, 0, 14, s.l2); t.rect(1, 37, 14, 5, s.d1); t.hline(1, 37, 14, s.base); return sheen(t); }
function tableSmall() { const t = new Img(32, 24); t.rect(1, 2, 30, 12, W_.l1); t.hline(1, 2, 30, W_.l2); t.rect(1, 14, 30, 3, W_.d1); t.rect(3, 17, 3, 7, W_.d1); t.rect(26, 17, 3, 7, W_.d1); t.rect(6, 5, 6, 5, '#fff8ec'); t.rect(20, 4, 5, 6, '#7fc0de'); return sheen(t); }
function healPad() { const t = new Img(32, 18); t.ellipse(16, 11, 15, 6, '#e8a0b0'); t.ellipse(16, 10, 13, 5, '#ffc8d4'); t.ellipse(16, 9, 8, 3, '#fff0f4'); t.rect(14, 6, 4, 6, '#e0475b'); t.rect(12, 8, 8, 2, '#e0475b'); return sheen(t); }

/** 가구 정의: w × h(막는 칸 수) */
export const FURN = {
  bed: { w: 2, h: 2, build: () => bed() }, bed_pink: { w: 2, h: 2, build: () => bed('#e07a8a') }, bed_green: { w: 2, h: 2, build: () => bed('#4f9a5f') },
  wardrobe: { w: 2, h: 1, build: wardrobe }, bookshelf: { w: 2, h: 1, build: bookshelf }, kitchen: { w: 3, h: 1, build: kitchen },
  dtable: { w: 3, h: 2, build: dtable }, chair_l: { w: 1, h: 1, build: () => chair(false) }, chair_r: { w: 1, h: 1, build: () => chair(true) },
  stool: { w: 1, h: 1, build: stool }, plant: { w: 1, h: 1, build: () => plant(0) }, plant_b: { w: 1, h: 1, build: () => plant(1) },
  sofa: { w: 3, h: 1, build: () => sofa() }, sofa_red: { w: 3, h: 1, build: () => sofa('#a83c34') }, lamp_floor: { w: 1, h: 1, build: lampFloor },
  counter: { w: 4, h: 1, build: () => counter('shop') }, counter_cafe: { w: 4, h: 1, build: () => counter('cafe') },
  counter_heal: { w: 4, h: 1, build: () => counter('heal') }, counter_lab: { w: 4, h: 1, build: () => counter('lab') },
  shelf_goods: { w: 2, h: 1, build: () => shelfGoods(0) }, shelf_goods_b: { w: 2, h: 1, build: () => shelfGoods(3) },
  forge: { w: 2, h: 1, build: forge }, lab_machine: { w: 2, h: 1, build: labMachine }, starter_table: { w: 3, h: 1, build: starterTable },
  millstone: { w: 2, h: 2, build: millstone }, sacks: { w: 1, h: 1, build: sacks }, piano: { w: 2, h: 1, build: piano },
  pillar: { w: 1, h: 1, build: pillar }, table_small: { w: 2, h: 1, build: tableSmall }, heal_pad: { w: 2, h: 1, build: healPad },
};

// ── 방 레이아웃 (아트 + 맵 생성기 공용) ─────────────────
// furn: [type, cx, cy(맨 아래 칸), props]  /  spawns: [name, cx, cy, props]  /  lights: [cx, cy]
const WOOD = { kind: 'wood', color: '#b07a48' };
export const ROOMS = {
  home: { // 내 집: 침대·옷장·부엌·식탁 (친구 초대 공간)
    name: '나의 집', W: 15, H: 11, door: 7, wall: { color: '#ecd2a8', pattern: 'stripe', accent: '#e0b888', wainscot: '#b07a48' }, floor: WOOD,
    decor: [['window', 3], ['fireplace', 6], ['clock', 8], ['window', 10], ['painting', 13]],
    rugs: [[5, 6, 5, 3, '#a83c34']],
    furn: [['bed', 1, 4, { interact: 'bed' }], ['wardrobe', 4, 3, { interact: 'wardrobe' }], ['kitchen', 11, 3, { interact: 'kitchen' }],
      ['dtable', 10, 7, { interact: 'dtable' }], ['chair_l', 9, 7, { interact: 'dtable' }], ['chair_r', 13, 7, { interact: 'dtable' }],
      ['sofa', 3, 9], ['plant', 1, 9], ['lamp_floor', 13, 9], ['bookshelf', 1, 6]],
    spawns: [['entry', 7, 9], ['wake', 3, 5]], lights: [[7, 2], [13, 8]],
  },
  in_store: {
    name: '소라네 잡화점', W: 14, H: 10, door: 7, wall: { color: '#d8e8d0', pattern: 'dots', accent: '#a8c89a', wainscot: '#8c5a33' }, floor: { kind: 'tile', color: '#c9b08a', color2: '#e0caa0' },
    decor: [['window', 9], ['shelf', 11], ['poster', 1], ['clock', 2]],
    rugs: [[5, 6, 4, 2, '#3f8fb5']],
    furn: [['shelf_goods', 1, 3], ['shelf_goods_b', 3, 3], ['shelf_goods', 5, 3], ['counter', 8, 5, { interact: 'shop:general' }], ['sacks', 12, 8], ['plant_b', 1, 8], ['sacks', 12, 7]],
    spawns: [['wp_clerk', 10, 4], ['wp_gate', 7, 8], ['entry', 7, 8]], lights: [[10, 2]],
  },
  in_cafe: {
    name: '루나 카페', W: 14, H: 10, door: 7, wall: { color: '#6a4a3a', pattern: 'plank' }, floor: { kind: 'woodDark', color: '#8a5a3a' },
    decor: [['menu', 2], ['window', 6], ['painting2', 10], ['shelf', 12]],
    rugs: [],
    furn: [['counter_cafe', 1, 5, { interact: 'shop:cafe' }], ['table_small', 7, 6], ['table_small', 10, 6], ['table_small', 9, 8],
      ['stool', 6, 6], ['stool', 12, 6], ['stool', 8, 8], ['stool', 11, 8], ['plant', 12, 8], ['plant_b', 1, 8], ['piano', 11, 3, { interact: 'piano' }]],
    spawns: [['wp_clerk', 2, 4], ['wp_gate', 7, 8], ['entry', 7, 8]], lights: [[3, 3], [9, 6]],
  },
  in_lab: { // 마을회관 = 한별 박사의 루미 연구실
    name: '마을회관 · 루미 연구실', W: 16, H: 11, door: 8, wall: { color: '#e4ecf2', pattern: 'tile' }, floor: { kind: 'tile', color: '#c8d8e4', color2: '#e8f0f6' },
    decor: [['chart', 1], ['window', 4], ['window', 10], ['chart', 13]],
    rugs: [[6, 5, 5, 3, '#3a8ab0']],
    furn: [['lab_machine', 1, 3], ['bookshelf', 3, 3], ['starter_table', 7, 4, { interact: 'starter_table' }], ['bookshelf', 11, 3], ['lab_machine', 13, 3],
      ['counter_lab', 1, 7], ['plant', 14, 9], ['plant_b', 1, 9], ['table_small', 12, 7]],
    spawns: [['wp_prof', 12, 5], ['wp_mayor', 8, 6], ['wp_rival', 6, 7], ['wp_gate', 8, 9], ['entry', 8, 9]], lights: [[8, 2]],
  },
  in_smithy: {
    name: '민수의 대장간', W: 12, H: 9, door: 6, wall: { color: '#7a6a6a', pattern: 'stone' }, floor: { kind: 'stone', color: '#7a7480' },
    decor: [['toolrack', 5], ['toolrack', 8], ['window', 1]],
    rugs: [],
    furn: [['forge', 1, 4, { interact: 'smithy' }], ['anvil', 4, 5, { interact: 'smithy' }], ['barrel', 10, 3], ['crate', 9, 3], ['barrel', 10, 7], ['table_small', 7, 5]],
    spawns: [['wp_forge', 4, 6], ['wp_gate', 6, 7], ['entry', 6, 7]], lights: [[2, 3]],
  },
  in_house_a: {
    name: '이웃집', W: 12, H: 9, door: 6, wall: { color: '#e8d8c0', pattern: 'diamond', accent: '#d8b890', wainscot: '#8c5a33' }, floor: WOOD,
    decor: [['window', 2], ['painting', 5], ['clock', 6], ['window', 8]],
    rugs: [[4, 5, 4, 2, '#7d5aa8']],
    furn: [['bed_pink', 1, 4, { interact: 'nbed' }], ['bookshelf', 9, 3], ['table_small', 5, 6], ['chair_l', 4, 6], ['plant', 10, 7], ['lamp_floor', 1, 7]],
    spawns: [['entry', 6, 7]], lights: [[1, 6]],
  },
  in_house_b: {
    name: '이웃집', W: 12, H: 9, door: 6, wall: { color: '#c8dce8', pattern: 'stripe', accent: '#a8c4d8', wainscot: '#6b4024' }, floor: { kind: 'wood', color: '#a07050' },
    decor: [['window', 1], ['shelf', 4], ['window', 8], ['poster', 10]],
    rugs: [[3, 5, 6, 2, '#3f8a3e']],
    furn: [['bed_green', 9, 4, { interact: 'nbed' }], ['kitchen', 1, 3], ['sofa_red', 2, 7], ['plant_b', 10, 7], ['stool', 1, 6]],
    spawns: [['entry', 6, 7]], lights: [[5, 6]],
  },
  in_house_c: {
    name: '이웃집', W: 12, H: 9, door: 6, wall: { color: '#f0d8d8', pattern: 'dots', accent: '#e0b0b0', wainscot: '#8c5a33' }, floor: WOOD,
    decor: [['painting2', 1], ['window', 5], ['clock', 9], ['painting', 10]],
    rugs: [[3, 5, 5, 2, '#e0a43a']],
    furn: [['bed', 9, 4, { interact: 'nbed' }], ['piano', 1, 3, { interact: 'piano' }], ['bookshelf', 4, 3], ['table_small', 4, 6], ['plant', 1, 7], ['lamp_floor', 10, 7]],
    spawns: [['entry', 6, 7]], lights: [[10, 6]],
  },
  in_center: { // 바람골 루미 쉼터
    name: '루미 쉼터', W: 14, H: 10, door: 7, wall: { color: '#fbe4ea', pattern: 'stripe', accent: '#f4c8d4', wainscot: '#e8a0b0' }, floor: { kind: 'tile', color: '#f4dce4', color2: '#fff4f8' },
    decor: [['heartsign', 6], ['window', 2], ['window', 10], ['poster', 13]],
    rugs: [[5, 7, 4, 2, '#e07a8a']],
    furn: [['counter_heal', 5, 4, { interact: 'center' }], ['heal_pad', 1, 4], ['sofa_red', 1, 7], ['sofa', 10, 7], ['plant', 12, 4], ['plant_b', 1, 8]],
    spawns: [['wp_clerk', 7, 3], ['wp_gate', 7, 8], ['entry', 7, 8]], lights: [[7, 2]],
  },
  in_shop_w: {
    name: '바람골 상점', W: 12, H: 9, door: 6, wall: { color: '#e0d0a8', pattern: 'plank' }, floor: { kind: 'wood', color: '#b8885a' },
    decor: [['window', 7], ['shelf', 9], ['poster', 1]],
    rugs: [[4, 6, 4, 1, '#3f8fb5']],
    furn: [['shelf_goods_b', 1, 3], ['shelf_goods', 3, 3], ['counter', 6, 5, { interact: 'shop:windvale' }], ['sacks', 10, 7], ['plant', 1, 7]],
    spawns: [['wp_clerk', 8, 4], ['wp_gate', 6, 7], ['entry', 6, 7]], lights: [[8, 2]],
  },
  in_gym: { // 바람골 도장
    name: '바람골 도장', W: 14, H: 14, door: 7, wall: { color: '#c8d8e0', pattern: 'stone' }, floor: { kind: 'stone', color: '#9aa8b4' },
    decor: [['banner', 2], ['banner', 6], ['banner', 10]],
    rugs: [[4, 5, 7, 6, '#2a8a8a']],
    furn: [['pillar', 2, 5], ['pillar', 11, 5], ['pillar', 2, 10], ['pillar', 11, 10], ['plant', 1, 12], ['plant', 12, 12]],
    spawns: [['trainer:sena', 7, 4, { face: 'down' }], ['wp_gate', 7, 12], ['entry', 7, 12]], lights: [[7, 7]],
  },
  in_windmill: {
    name: '풍차 안', W: 10, H: 10, door: 5, wall: { color: '#c8a070', pattern: 'plank' }, floor: { kind: 'wood', color: '#9a6a40' },
    decor: [['gear', 3], ['ladder', 7], ['window', 1]],
    rugs: [],
    furn: [['millstone', 4, 6, { interact: 'windmill' }], ['sacks', 1, 4], ['sacks', 2, 4], ['sacks', 1, 8], ['barrel', 8, 8], ['crate', 8, 5]],
    spawns: [['entry', 5, 8]], lights: [[5, 4]],
  },
};
// 바깥 건물(오브젝트 타입) → 실내 맵
export const INTERIOR_OF = { house: 'home', store: 'in_store', cafe: 'in_cafe', hall: 'in_lab', smithy: 'in_smithy', house_a: 'in_house_a', house_b: 'in_house_b', house_c: 'in_house_c', center: 'in_center', shop_w: 'in_shop_w', gym: 'in_gym', windmill: 'in_windmill' };
