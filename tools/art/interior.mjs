// 건물 실내: 방 배경(벽지·바닥·벽 장식을 한 장으로) + Y-정렬 가구 스프라이트 + 방 레이아웃(맵 생성기와 공유)
import { Img, mix, darken, lighten, hash2 } from './lib/img.mjs';
import { P } from './lib/palette.mjs';
import { buildWindvaleGym, BIG_GYM_LAYOUTS } from './gym-puzzles.mjs';

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
  banner(t, x, y, col = '#2a8a8a') { t.rect(x + 6, y + 4, 20, 34, col); t.rect(x + 6, y + 4, 20, 2, lighten(col, 0.45)); for (let i = 0; i < 10; i++) { t.set(x + 6 + i, y + 38 + Math.floor(i / 2), col); t.set(x + 25 - i, y + 38 + Math.floor(i / 2), col); } t.circle(x + 16, y + 18, 6, '#e8f6f4'); for (let a = 0; a < 3; a++) t.line(x + 16, y + 18, x + 16 + Math.round(Math.cos(a * 2.1) * 6), y + 18 + Math.round(Math.sin(a * 2.1) * 6), col); },
  stars(t, x, y) { for (let i = 0; i < 9; i++) { const sx = x + 2 + ((i * 11) % 28), sy = y + 8 + ((i * 7) % 22); t.set(sx, sy, '#fff4c0'); if (i % 3 === 0) { t.set(sx - 1, sy, '#ffe08a'); t.set(sx + 1, sy, '#ffe08a'); t.set(sx, sy - 1, '#ffe08a'); t.set(sx, sy + 1, '#ffe08a'); } } },
  ghostframe(t, x, y) { t.rect(x + 3, y + 6, 26, 24, P.gold.d1); t.rect(x + 5, y + 8, 22, 20, '#2a2238'); t.ellipse(x + 16, y + 18, 5, 6, '#9a90b8'); t.rect(x + 13, y + 16, 2, 2, '#1e1418'); t.rect(x + 18, y + 16, 2, 2, '#1e1418'); },
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
  // 수조 · 용암 · 빙판 특수 구역 ([x, y, w, h, kind])
  for (const [px, py, pw, ph, kind = 'water'] of spec.pools ?? []) {
    const colA = kind === 'lava' ? '#d84e24' : kind === 'ice' ? '#9ed8f2' : '#3278b8';
    const colB = kind === 'lava' ? '#f08234' : kind === 'ice' ? '#c8eeff' : '#4a96d6';
    const rim = kind === 'lava' ? '#6a2414' : kind === 'ice' ? '#669ec2' : '#244e7a';
    for (let y = py * T; y < (py + ph) * T; y++) for (let x = px * T; x < (px + pw) * T; x++) {
      const edge = x === px * T || y === py * T || x === (px + pw) * T - 1 || y === (py + ph) * T - 1;
      const wave = ((x + Math.floor(y / 2) * 3) % 10 < 3) && hash2(x >> 2, y >> 2, 13) < 0.45;
      t.set(x, y, edge ? rim : wave ? colB : colA);
    }
  }
  // 계단 / 경사로 발판 (2D·3D 공용 시인성)
  for (const [rx0, ry0, rx1, ry1, dir] of spec.ramps ?? []) {
    const stepCol = darken(spec.floor.color, 0.28), hiCol = lighten(spec.floor.color, 0.25);
    const xA = rx0 * T, xB = (rx1 + 1) * T, yA = ry0 * T, yB = (ry1 + 1) * T;
    if (dir === 'N' || dir === 'S') {
      for (let y = yA; y < yB; y += 5) { t.hline(xA + 1, y, xB - xA - 2, stepCol); t.hline(xA + 1, y + 1, xB - xA - 2, hiCol); }
      t.vline(xA, yA, yB - yA, stepCol); t.vline(xB - 1, yA, yB - yA, stepCol);
    } else {
      for (let x = xA; x < xB; x += 5) { t.vline(x, yA + 1, yB - yA - 2, stepCol); t.vline(x + 1, yA + 1, yB - yA - 2, hiCol); }
      t.hline(xA, yA, xB - xA, stepCol); t.hline(xA, yB - 1, xB - xA, stepCol);
    }
  }
  // 러그
  for (const [rx, ry, rw, rh, col] of spec.rugs ?? []) {
    const c = ramp(col);
    for (let y = ry * T + 2; y < (ry + rh) * T - 2; y++) for (let x = rx * T + 2; x < (rx + rw) * T - 2; x++) {
      const ex = Math.min(x - rx * T - 2, (rx + rw) * T - 3 - x), ey = Math.min(y - ry * T - 2, (ry + rh) * T - 3 - y), e = Math.min(ex, ey);
      t.set(x, y, e === 0 ? c.d1 : e === 2 ? c.l2 : e < 5 ? c.l1 : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? c.base : mix(c.base, c.d1, 0.25));
    }
  }
  // 바닥 발광 회로선 · 금장 테두리 라인 ([x0, y0, x1, y1, col])
  for (const [lx0, ly0, lx1, ly1, col] of spec.circuits ?? []) {
    const ax = Math.round((lx0 + 0.5) * T), ay = Math.round((ly0 + 0.5) * T);
    const bx = Math.round((lx1 + 0.5) * T), by = Math.round((ly1 + 0.5) * T);
    const glow = lighten(col, 0.35), dim = darken(col, 0.35);
    if (ay === by) {
      const s = Math.min(ax, bx), len = Math.abs(bx - ax) + 1;
      t.hline(s, ay - 2, len, dim); t.hline(s, ay - 1, len, col); t.hline(s, ay, len, glow); t.hline(s, ay + 1, len, col); t.hline(s, ay + 2, len, dim);
    } else if (ax === bx) {
      const s = Math.min(ay, by), len = Math.abs(by - ay) + 1;
      t.vline(ax - 2, s, len, dim); t.vline(ax - 1, s, len, col); t.vline(ax, s, len, glow); t.vline(ax + 1, s, len, col); t.vline(ax + 2, s, len, dim);
    }
  }
  // 대형 체육관 바닥 문장/엠블럼 ([cx, cy, radCells, col1, col2])
  for (const [ecx, ecy, rad, col1, col2 = '#fff4c0'] of spec.emblems ?? []) {
    const px = Math.round((ecx + 0.5) * T), py = Math.round((ecy + 0.5) * T), r = Math.round(rad * T);
    const rim = darken(col1, 0.3), hi = lighten(col1, 0.28);
    for (let y = py - r - 2; y <= py + r + 2; y++) for (let x = px - r - 2; x <= px + r + 2; x++) {
      const d = Math.hypot(x - px, y - py);
      if (d > r + 1) continue;
      if (d > r - 2) t.set(x, y, rim);
      else if (d > r - 5) t.set(x, y, col2);
      else if (d > r - 8) t.set(x, y, hi);
      else {
        const ang = Math.atan2(y - py, x - px);
        const spoke = Math.abs(Math.sin(ang * 4)) < 0.14 || d < r * 0.28;
        t.set(x, y, spoke ? col2 : d < r * 0.62 ? mix(col1, hi, 0.4) : col1);
      }
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
  for (const [kind, dx, arg] of spec.decor ?? []) DECOR[kind]?.(t, dx * T, 0, arg);
  // 벽 윗면 (어두운 테두리)
  const top = spec.trim ?? '#3a2418', topL = lighten(top, 0.25);
  const beam = (x, y, w, h) => { t.rect(x, y, w, h, top); };
  beam(0, 0, W * T, 4); t.hline(T, 3, (W - 2) * T, topL);
  beam(0, 0, T, H * T); beam((W - 1) * T, 0, T, H * T);
  t.vline(T - 1, 3, H * T - 3 - T, topL); t.vline((W - 1) * T, 3, H * T - 3 - T, topL);
  beam(0, (H - 1) * T, W * T, T); t.hline(T - 1, (H - 1) * T, (W - 2) * T + 2, topL);
  // 실내 내부 칸막이·미로 벽 ([x, y, w, h])
  for (const [wx, wy, ww, wh] of spec.walls ?? []) {
    t.rect(wx * T, wy * T, ww * T, wh * T, top);
    t.hline(wx * T, wy * T, ww * T, topL);
    t.hline(wx * T, (wy + wh) * T - 1, ww * T, darken(top, 0.35));
  }
  // 문: 아래 벽에 1칸 틈 + 문지방 + 발매트 (다락방 등 문 없는 실내는 벽 그대로 유지)
  if (!spec.noDoor) {
    const d = spec.door;
    drawFloor(t, d * T, (H - 1) * T, T, T, { ...spec.floor, color: darken(spec.floor.color, 0.25) });
    for (let y = (H - 1) * T + 6; y < H * T; y++) for (let x = d * T; x < (d + 1) * T; x++) t.set(x, y, mix(t.get(x, y), '#120d10', Math.min(1, (y - (H - 1) * T - 6) / 9)));
    t.vline(d * T, (H - 1) * T, T, topL); t.vline((d + 1) * T - 1, (H - 1) * T, T, topL);
    const mat = ramp('#a8523a');
    t.rect(d * T + 1, (H - 2) * T + 6, 14, 9, mat.base); t.rect(d * T + 1, (H - 2) * T + 6, 14, 1, mat.l1);
    for (let x = d * T + 2; x < d * T + 15; x += 3) t.vline(x, (H - 2) * T + 8, 6, mat.d1);
  }
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

function crystal(col = '#9ad8ff') { const t = new Img(16, 30), c = ramp(col); for (let y = 0; y < 26; y++) { const hw = y < 8 ? Math.floor(y / 2) + 1 : Math.max(1, 5 - Math.floor((y - 8) / 6)); for (let x = 8 - hw; x < 8 + hw; x++) t.set(x, y + 2, x < 7 ? c.l2 : x < 9 ? c.l1 : c.d1); } t.vline(6, 6, 10, '#ffffff'); t.ellipse(8, 28, 6, 2, darken(col, 0.5)); return sheen(t); }
function pedestal() { const t = new Img(32, 30), s = ramp('#e8e0c8'); t.rect(4, 10, 24, 16, s.base); t.vline(5, 10, 16, s.l2); t.vline(26, 10, 16, s.d1); t.rect(1, 24, 30, 6, s.d1); t.hline(1, 24, 30, s.l1); t.rect(2, 6, 28, 5, s.l1); t.hline(2, 6, 28, s.l2); t.circle(16, 3, 3, '#fff4c0'); t.circle(16, 3, 1, '#ffffff'); return sheen(t); }
function candle() { const t = new Img(16, 30), g = P.gold; t.rect(7, 8, 2, 18, g.d1); t.rect(3, 26, 10, 3, g.base); t.hline(2, 10, 12, g.base); for (const x of [2, 7, 12]) { t.rect(x, 4, 2, 6, '#f4efe6'); t.set(x, 2, '#ffd65a'); t.set(x, 3, '#ff9a3a'); t.set(x + 1, 2, '#fff4c0'); } return sheen(t); }
function statue(col = '#9aa8b4') { const t = new Img(16, 34), s = ramp(col); t.rect(2, 26, 12, 8, s.d1); t.hline(2, 26, 12, s.l1); t.ellipse(8, 18, 5, 8, s.base); t.ellipse(7, 16, 3, 5, s.l1); t.circle(8, 7, 4, s.base); t.set(6, 5, s.l2); t.rect(3, 4, 2, 4, s.d1); t.rect(11, 4, 2, 4, s.d1); return sheen(t); }

function workbench() {
  // 집 작업대: 원목 상판 + 막자사발 · 약병 · 루미볼 반제품
  const t = new Img(32, 30);
  t.rect(1, 8, 30, 8, W_.l1); t.hline(1, 8, 30, W_.l2); t.rect(1, 16, 30, 3, W_.d1);
  t.rect(2, 19, 3, 11, W_.d1); t.rect(27, 19, 3, 11, W_.d1); t.rect(5, 24, 22, 2, W_.base);
  t.ellipse(8, 7, 4, 2.5, '#a8a0a0'); t.ellipse(8, 6, 3, 1.5, '#6a8a4a'); t.line(10, 6, 13, 1, W_.d1);
  t.rect(16, 2, 3, 6, '#9ad8a0'); t.rect(16, 1, 3, 1, P.wood.base); t.set(16, 3, '#ffffff');
  t.rect(20, 3, 3, 5, '#ff9a8a'); t.rect(20, 2, 3, 1, P.wood.base); t.set(20, 4, '#ffffff');
  t.circle(26, 5, 2.5, '#8fe0d8'); t.rect(25, 1, 3, 2, '#c9733a'); t.set(25, 4, '#ffffff');
  t.rect(6, 20, 6, 4, '#c9a070'); t.rect(19, 20, 6, 4, '#c9a070');
  return sheen(t);
}
function atticStairsUp() {
  // 1층 → 2층 다락방 올라가는 원목 계단 (포켓몬/쯔꾸르 스타일 벽면 매립 계단)
  const t = new Img(16, 36);
  t.rect(0, 0, 16, 36, W_.d2);
  t.rect(1, 1, 14, 34, '#1b110d');
  // 양옆 난간 기둥
  t.rect(1, 1, 2, 34, W_.base); t.vline(2, 1, 34, W_.l1);
  t.rect(13, 1, 2, 34, W_.base); t.vline(13, 1, 34, W_.l1);
  t.rect(0, 0, 16, 2, W_.l1);
  for (let s = 0; s < 6; s++) {
    const sy = 5 + s * 5;
    const shade = s < 2 ? W_.d1 : s < 4 ? W_.base : W_.l1;
    t.rect(3, sy, 10, 3, shade);
    t.hline(3, sy, 10, lighten(shade, 0.18));
    t.rect(3, sy + 3, 10, 2, W_.d2);
  }
  return sheen(t);
}
function atticStairsDown() {
  // 2층 다락방 → 1층 내려가는 바닥 계단구 (포켓몬/쯔꾸르 스타일 난간 + 아래로 내려가는 디딤판)
  const t = new Img(16, 24);
  t.rect(1, 2, 14, 21, '#1b110d');
  // 위·오른쪽·아래 안전 난간 (왼쪽에서 걸어 들어오도록 왼쪽은 개방)
  t.rect(1, 0, 14, 3, W_.base); t.hline(1, 0, 14, W_.l2); t.hline(1, 2, 14, W_.d2);
  t.rect(13, 0, 2, 23, W_.base); t.vline(13, 0, 23, W_.l1);
  t.rect(1, 21, 14, 2, W_.d1); t.hline(1, 21, 14, W_.l1);
  // 왼쪽 난간 기둥 포스트
  t.rect(1, 0, 3, 4, W_.l1); t.rect(1, 19, 3, 4, W_.l1);
  // 서→동으로 내려가는 계단 디딤판
  for (let s = 0; s < 4; s++) {
    const sx = 2 + s * 3;
    const c = s === 0 ? W_.l1 : s === 1 ? W_.base : s === 2 ? W_.d1 : W_.d2;
    t.rect(sx, 4, 3, 16, c);
    t.vline(sx, 4, 16, lighten(c, 0.16));
  }
  return sheen(t);
}
function tvConsole() {
  // 거실 브라운관/와이드 TV + 원목 TV 장식장 (포켓몬/쯔꾸르 감성, 화면에 루미 리그 중계 방송)
  const t = new Img(32, 38);
  // 하단 원목 TV 캐비닛
  t.rect(1, 22, 30, 14, W_.base); t.hline(1, 22, 30, W_.l2); t.hline(1, 23, 30, W_.l1);
  t.rect(3, 25, 12, 9, W_.d1); t.rect(17, 25, 12, 9, W_.d1);
  t.rect(4, 26, 10, 3, '#3b2c34'); t.rect(5, 27, 4, 1, '#6ad8b0'); // 셋톱박스/게임기
  t.rect(18, 26, 10, 7, W_.base); t.set(19, 29, P.gold.l1);
  t.rect(2, 36, 3, 2, W_.d2); t.rect(27, 36, 3, 2, W_.d2);
  // 상단 TV 본체 베젤
  t.rect(2, 3, 28, 19, '#2e3440'); t.hline(2, 3, 28, '#5a6273'); t.rect(3, 4, 26, 17, '#3b4252');
  // TV 화면 (푸른 경기장 배경 + 두 루미가 대결하는 생생한 방송 장면)
  t.rect(4, 5, 21, 14, '#4fa8e0');
  t.rect(4, 5, 21, 5, '#8fd4ff');
  t.rect(4, 14, 21, 5, '#6ec468'); t.hline(4, 14, 21, '#9be28a');
  // 화면 속 경기장 라인 & 루미 실루엣 + 반짝 이펙트
  t.ellipse(14, 16, 7, 2, '#e8f6e0');
  t.circle(9, 13, 3, '#ff7a4d'); t.set(8, 12, '#ffe08a'); // 불꽃 루미
  t.circle(19, 12, 3, '#5ae0b0'); t.set(19, 11, '#ffffff'); // 바람/풀 루미
  t.set(14, 9, '#fff4c0'); t.set(13, 10, '#ffd65a'); t.set(15, 10, '#ffd65a'); // 격돌 스파크
  // 화면 유리 하이라이트
  t.line(5, 6, 8, 6, '#ffffff'); t.line(5, 7, 6, 7, '#ffffff');
  // 우측 스피커 그릴 & 전원 LED
  t.vline(27, 6, 8, '#1f242d'); t.set(27, 16, '#7cc45a'); t.set(27, 18, '#e8502e');
  // 받침 목
  t.rect(11, 21, 10, 2, '#232832');
  return sheen(t);
}
function studyDesk() {
  // 2층 다락방 책상: 스탠드 조명 · 펼쳐진 일기장 · 머그컵
  const t = new Img(32, 28);
  t.rect(1, 8, 30, 8, W_.base); t.rect(1, 8, 30, 2, W_.l2); t.rect(1, 16, 30, 3, W_.d1);
  t.rect(2, 19, 3, 9, W_.d1); t.rect(27, 19, 3, 9, W_.d1);
  t.rect(20, 19, 7, 7, W_.base); t.rect(21, 20, 5, 2, W_.l1); t.set(23, 21, P.gold.l1);
  // 책상 스탠드 & 일기장
  t.rect(4, 2, 6, 4, '#ffd65a'); t.hline(5, 2, 4, '#fff4c0'); t.rect(6, 6, 2, 3, W_.d2);
  t.rect(12, 6, 9, 5, '#fff8ec'); t.vline(16, 6, 5, '#c8a880'); t.hline(13, 8, 2, '#5a6273'); t.hline(17, 9, 3, '#5a6273');
  t.rect(24, 5, 4, 4, '#e07a8a'); t.hline(25, 5, 2, '#fff8ec');
  return sheen(t);
}
function slotMachine() {
  const t = new Img(16, 32);
  t.rect(2, 4, 11, 27, '#8c1d40'); t.hline(2, 4, 11, '#d8475b'); t.rect(2, 29, 11, 2, '#4e1024');
  t.rect(5, 1, 5, 3, P.gold.base); t.rect(6, 1, 3, 1, '#fff4c0'); // 상단 경광등
  t.rect(3, 6, 9, 9, '#181826'); t.rect(3, 6, 9, 1, P.gold.l1); // 네온 릴 화면
  for (let i = 0; i < 3; i++) {
    t.rect(4 + i * 3, 8, 2, 5, '#fff8ec');
    t.rect(4 + i * 3, 10, 2, 1, ['#e8475b', '#ffd65a', '#48d0ff'][i]);
  }
  t.rect(3, 17, 9, 4, '#2a1a2e'); t.rect(4, 18, 2, 2, '#ffd65a'); t.rect(7, 18, 2, 2, '#7cc45a'); t.rect(10, 18, 1, 2, '#ff6a4d');
  t.rect(4, 24, 7, 3, '#1e1418'); // 코인 배출구
  t.vline(13, 8, 9, P.metal.l1); t.circle(14, 7, 1.5, '#e8475b'); // 오른쪽 레버
  return sheen(t);
}
function casinoTable() {
  const t = new Img(48, 30);
  t.rect(2, 4, 44, 18, W_.d1); t.hline(2, 4, 44, P.gold.base); t.rect(4, 6, 40, 14, '#246b45');
  t.hline(4, 6, 40, '#348a5c'); t.rect(2, 22, 44, 3, W_.d2); t.hline(2, 22, 44, P.gold.d1);
  t.rect(4, 25, 3, 5, W_.d1); t.rect(41, 25, 3, 5, W_.d1);
  // 카드 · 주사위 · 칩 더미
  t.rect(10, 9, 5, 7, '#fff8ec'); t.rect(11, 11, 2, 2, '#e8475b');
  t.rect(16, 10, 5, 7, '#fff8ec'); t.rect(17, 12, 2, 2, '#2a2238');
  t.rect(25, 11, 4, 4, '#ffffff'); t.set(26, 12, '#1e1418'); t.set(27, 13, '#1e1418');
  t.rect(30, 10, 4, 4, '#ffffff'); t.set(31, 11, '#e8475b');
  t.circle(38, 12, 2, '#ffd65a'); t.circle(41, 14, 2, '#e8475b'); t.circle(39, 15, 2, '#48c8ff');
  return sheen(t);
}
function counterCasino() {
  const t = new Img(64, 30);
  t.rect(0, 12, 64, 18, '#5a1a2e'); for (let x = 0; x < 64; x += 8) t.vline(x, 14, 16, '#3a0e1d');
  t.rect(0, 9, 64, 5, P.gold.base); t.hline(0, 9, 64, '#fff2a0'); t.hline(0, 13, 64, P.gold.d1);
  t.rect(0, 28, 64, 2, '#2a0814');
  // 금화 트레이 · 카드 덱 · 네온 명패
  t.rect(6, 3, 12, 6, '#3a2448'); t.rect(7, 4, 10, 4, '#ffd65a');
  t.rect(24, 4, 16, 5, '#1a1224'); t.hline(26, 6, 12, '#ffd65a');
  t.rect(46, 4, 10, 5, '#e8475b'); t.rect(48, 2, 6, 2, '#fff8ec');
  return sheen(t);
}
function prisonBars() {
  const t = new Img(16, 28);
  // 쇠창살 (상단·하단 가로대 + 세로 강철봉 4개)
  t.rect(0, 2, 16, 3, '#3b4252'); t.hline(0, 2, 16, '#7a8499'); t.hline(0, 4, 16, '#1f2430');
  t.rect(0, 22, 16, 4, '#3b4252'); t.hline(0, 22, 16, '#646e82'); t.hline(0, 25, 16, '#1b1f29');
  for (const bx of [2, 6, 10, 13]) {
    t.rect(bx, 1, 2, 24, '#4c566a');
    t.vline(bx, 1, 24, '#9aa5bc');
    t.vline(bx + 1, 1, 24, '#252b38');
  }
  return sheen(t);
}
function prisonCot() {
  const t = new Img(32, 34);
  // 철제 간이 침대 + 회색 담요
  t.rect(1, 0, 30, 7, '#434c5e'); t.hline(1, 0, 30, '#818ca3');
  t.rect(2, 6, 28, 25, '#c8ced8'); t.rect(4, 8, 24, 6, '#e5e9f0'); t.hline(4, 13, 24, '#9aa5bc');
  t.rect(2, 15, 28, 16, '#5c677d'); t.hline(2, 15, 28, '#818ca3'); t.hline(2, 30, 28, '#343b4a');
  t.rect(1, 30, 3, 4, '#2e3440'); t.rect(28, 30, 3, 4, '#2e3440');
  return sheen(t);
}
function prisonOre() {
  const t = new Img(16, 18);
  // 감옥 탈옥용 채광 암석 (반짝이는 금·청옥 광맥이 박힌 부서지는 바위)
  t.ellipse(8, 11, 7, 6, '#555c6e');
  t.ellipse(7, 9, 6, 4, '#70798f');
  t.rect(4, 6, 6, 3, '#8b95ad');
  t.rect(3, 12, 10, 3, '#3b4252');
  // 반짝이는 광맥(금색/청록색)으로 채광 대상 시인성 강조
  t.rect(5, 7, 3, 2, '#ffd65a'); t.set(6, 7, '#fff7c2');
  t.rect(10, 10, 3, 2, '#5ce1e6'); t.set(11, 10, '#cffafe');
  t.rect(5, 11, 2, 2, '#ffaa3b');
  return sheen(t);
}
function prisonHatch() {
  const t = new Img(32, 18);
  // 북동쪽 비밀 탈출 해치 (녹색 신호등 + 사다리 구멍)
  t.rect(1, 1, 30, 16, '#3b4252'); t.hline(1, 1, 30, '#818ca3'); t.hline(1, 16, 30, '#1e2430');
  t.rect(4, 3, 24, 12, '#11161f');
  // 사다리 발판
  t.vline(10, 4, 10, '#8b95ad'); t.vline(21, 4, 10, '#8b95ad');
  for (const ry of [6, 9, 12]) t.hline(10, ry, 12, '#cbd5e1');
  // 탈출 표시 녹색 네온 램프
  t.rect(2, 2, 3, 3, '#22c55e'); t.set(3, 3, '#bbf7d0');
  t.rect(27, 2, 3, 3, '#22c55e'); t.set(28, 3, '#bbf7d0');
  t.hline(5, 2, 22, '#4ade80');
  return sheen(t);
}
function crackedWall() {
  const t = new Img(16, 26);
  // 금이 간 감옥 벽돌벽 (부수고 지나갈 수 있는 균열 + 미세한 황금 틈새빛)
  t.rect(0, 2, 16, 23, '#3c4354');
  t.hline(0, 2, 16, '#646f87'); t.hline(0, 24, 16, '#1a1e28');
  for (const y of [7, 13, 19]) t.hline(0, y, 16, '#232836');
  t.vline(7, 2, 6, '#232836'); t.vline(3, 8, 5, '#232836'); t.vline(12, 8, 5, '#232836'); t.vline(8, 14, 5, '#232836');
  // 굵은 지그재그 균열 + 부서진 모서리 강조
  t.line(8, 3, 5, 9, '#0f121a'); t.line(5, 9, 11, 15, '#0f121a'); t.line(11, 15, 6, 22, '#0f121a');
  t.line(9, 3, 6, 9, '#facc15'); t.line(6, 9, 12, 15, '#fbbf24'); t.line(12, 15, 7, 22, '#f59e0b');
  t.line(6, 12, 2, 15, '#0f121a'); t.line(10, 10, 14, 12, '#0f121a');
  return sheen(t);
}
function prisonExitWall() {
  const t = new Img(32, 28);
  // 1층 외벽 — 바깥 햇살·자유의 빛이 틈새로 쏟아져 들어오는 금이 간 외벽
  t.rect(0, 2, 32, 25, '#475064');
  t.hline(0, 2, 32, '#7b87a1'); t.hline(0, 26, 32, '#1d222e');
  for (const y of [8, 14, 20]) t.hline(0, y, 32, '#282f3f');
  // 중앙 큰 균열 + 눈부신 자유의 햇살/하늘빛
  t.line(16, 3, 12, 11, '#fde047'); t.line(12, 11, 19, 17, '#fef08a'); t.line(19, 17, 14, 25, '#fde047');
  t.line(15, 4, 11, 11, '#ffffff'); t.line(13, 11, 20, 17, '#ffffff'); t.line(18, 17, 15, 24, '#bae6fd');
  t.line(12, 11, 7, 15, '#fef08a'); t.line(19, 16, 25, 12, '#fef08a');
  t.rect(13, 11, 5, 5, '#fef9c3'); t.rect(14, 12, 3, 3, '#ffffff');
  return sheen(t);
}
function prisonStairsUp() {
  const t = new Img(16, 18);
  // 위층으로 올라가는 철제 계단 (노란 안전선 + 상승 화살표)
  t.rect(1, 1, 14, 16, '#2e3545');
  t.vline(1, 1, 16, '#64748b'); t.vline(14, 1, 16, '#64748b');
  for (let i = 0; i < 4; i++) {
    const sy = 3 + i * 3;
    t.rect(2, sy, 12, 2, i === 0 ? '#94a3b8' : '#64748b');
    t.hline(2, sy, 12, '#cbd5e1');
  }
  t.hline(2, 15, 12, '#facc15');
  // 상향 화살표
  t.set(7, 4, '#fde047'); t.set(8, 4, '#fde047');
  t.hline(6, 5, 4, '#fde047');
  t.rect(7, 6, 2, 4, '#facc15');
  return sheen(t);
}
function yardStone() {
  const t = new Img(16, 18);
  // 노역 채광장 대형 화강암 바위
  t.ellipse(8, 11, 7, 6, '#646c7a');
  t.ellipse(7, 9, 6, 4.5, '#8992a3');
  t.rect(4, 6, 6, 3, '#b5becf');
  t.rect(3, 13, 10, 3, '#434954');
  t.set(6, 8, '#dce3f0'); t.set(10, 10, '#c8d0e0');
  return sheen(t);
}
function yardWood() {
  const t = new Img(16, 18);
  // 노역장 통나무 더미
  for (const [cx, cy] of [[5, 13], [11, 13], [8, 9]]) {
    t.ellipse(cx, cy, 4, 3.5, '#7c4a24');
    t.ellipse(cx, cy - 0.5, 3, 2.5, '#a86736');
    t.ellipse(cx - 1, cy - 0.5, 1.5, 1.5, '#e2b582');
    t.set(cx - 1, cy - 0.5, '#a86736');
  }
  return sheen(t);
}
function prisonDeliver() {
  const t = new Img(32, 26);
  // 노역 납품함 (철제 프레임 + 나무 상자 + 녹색 납품 표지)
  t.rect(1, 5, 30, 20, '#6e4526'); t.hline(1, 5, 30, '#a86e40'); t.hline(1, 24, 30, '#3e2412');
  t.rect(2, 7, 28, 15, '#8d5a32');
  for (let y = 11; y < 22; y += 5) t.hline(2, y, 28, '#543218');
  // 철제 테두리 + 납품 클립보드
  t.rect(1, 4, 30, 2, '#475569'); t.hline(1, 4, 30, '#94a3b8');
  t.rect(11, 8, 10, 10, '#f8fafc'); t.rect(13, 6, 6, 3, '#475569');
  t.hline(13, 11, 6, '#16a34a'); t.hline(13, 14, 6, '#16a34a');
  t.rect(3, 8, 4, 4, '#22c55e'); t.set(4, 9, '#bbf7d0');
  t.rect(25, 8, 4, 4, '#f59e0b'); t.set(26, 9, '#fef08a');
  return sheen(t);
}

/** 가구 정의: w × h(막는 칸 수) */
export const FURN = {
  bed: { w: 2, h: 2, build: () => bed() }, bed_pink: { w: 2, h: 2, build: () => bed('#e07a8a') }, bed_green: { w: 2, h: 2, build: () => bed('#4f9a5f') },
  wardrobe: { w: 2, h: 1, build: wardrobe }, bookshelf: { w: 2, h: 1, build: bookshelf }, kitchen: { w: 3, h: 1, build: kitchen },
  dtable: { w: 3, h: 2, build: dtable }, chair_l: { w: 1, h: 1, build: () => chair(false) }, chair_r: { w: 1, h: 1, build: () => chair(true) },
  stool: { w: 1, h: 1, build: stool }, plant: { w: 1, h: 1, build: () => plant(0) }, plant_b: { w: 1, h: 1, build: () => plant(1) },
  sofa: { w: 3, h: 1, build: () => sofa() }, sofa_red: { w: 3, h: 1, build: () => sofa('#a83c34') }, lamp_floor: { w: 1, h: 1, build: lampFloor },
  counter: { w: 4, h: 1, build: () => counter('shop') }, counter_cafe: { w: 4, h: 1, build: () => counter('cafe') },
  counter_heal: { w: 4, h: 1, build: () => counter('heal') }, counter_lab: { w: 4, h: 1, build: () => counter('lab') },
  counter_casino: { w: 4, h: 1, build: counterCasino }, slot_machine: { w: 1, h: 1, build: slotMachine }, casino_table: { w: 3, h: 2, build: casinoTable },
  shelf_goods: { w: 2, h: 1, build: () => shelfGoods(0) }, shelf_goods_b: { w: 2, h: 1, build: () => shelfGoods(3) },
  forge: { w: 2, h: 1, build: forge }, lab_machine: { w: 2, h: 1, build: labMachine }, starter_table: { w: 3, h: 1, build: starterTable },
  millstone: { w: 2, h: 2, build: millstone }, sacks: { w: 1, h: 1, build: sacks }, piano: { w: 2, h: 1, build: piano },
  pillar: { w: 1, h: 1, build: pillar }, crystal: { w: 1, h: 1, build: () => crystal() }, crystal_red: { w: 1, h: 1, build: () => crystal('#ff8a6a') }, pedestal: { w: 2, h: 1, build: pedestal }, candle: { w: 1, h: 1, build: candle }, statue: { w: 1, h: 1, build: () => statue() }, table_small: { w: 2, h: 1, build: tableSmall }, heal_pad: { w: 2, h: 1, build: healPad }, workbench: { w: 2, h: 1, build: workbench },
  attic_stairs_up: { w: 1, h: 1, build: atticStairsUp }, attic_stairs_down: { w: 1, h: 1, build: atticStairsDown }, desk: { w: 2, h: 1, build: studyDesk }, tv: { w: 2, h: 1, build: tvConsole },
  prison_bars: { w: 1, h: 1, build: prisonBars }, prison_cot: { w: 2, h: 2, build: prisonCot }, prison_ore: { w: 1, h: 1, build: prisonOre }, prison_hatch: { w: 2, h: 1, build: prisonHatch },
  cracked_wall: { w: 1, h: 1, build: crackedWall }, prison_exit_wall: { w: 2, h: 1, build: prisonExitWall }, prison_stairs_up: { w: 1, h: 1, build: prisonStairsUp },
  yard_stone: { w: 1, h: 1, build: yardStone }, yard_wood: { w: 1, h: 1, build: yardWood }, prison_deliver: { w: 2, h: 1, build: prisonDeliver },
};

// ── 방 레이아웃 (아트 + 맵 생성기 공용) ─────────────────
// furn: [type, cx, cy(맨 아래 칸), props]  /  spawns: [name, cx, cy, props]  /  lights: [cx, cy]
const WOOD = { kind: 'wood', color: '#b07a48' };
export const ROOMS = {
  home: { // 내 집 1층: 거실(TV · 소파 · 벽난로) · 부엌 · 식탁 · 작업대 · 2층 다락방 계단 (포켓몬/쯔꾸르 스타일 북쪽 벽 밀착 배치, 창문·벽난로 가림 없음)
    name: '나의 집 (1층)', W: 15, H: 11, door: 7, wall: { color: '#ecd2a8', pattern: 'stripe', accent: '#e0b888', wainscot: '#b07a48' }, floor: WOOD,
    decor: [['window', 2], ['clock', 6], ['fireplace', 7], ['shelf', 11]],
    rugs: [[3, 5, 5, 3, '#a83c34']],
    furn: [
      ['attic_stairs_up', 1, 3], ['tv', 4, 3, { interact: 'tv' }], ['bookshelf', 9, 3], ['kitchen', 11, 3, { interact: 'kitchen' }],
      ['sofa', 3, 6], ['plant_b', 1, 6],
      ['dtable', 10, 7, { interact: 'dtable' }], ['chair_l', 9, 7, { interact: 'dtable' }], ['chair_r', 13, 7, { interact: 'dtable' }],
      ['plant', 1, 9], ['table_small', 2, 9],
      ['workbench', 10, 9, { interact: 'workbench' }], ['lamp_floor', 13, 9],
    ],
    warps: [[1, 3, 1, 1, 'home_2f', 'from_1f']],
    spawns: [['entry', 7, 9], ['from_2f', 2, 4]], lights: [[7, 2], [13, 8]],
  },
  home_2f: { // 내 집 2층 다락방: 침실 · TV · 옷장 · 책장 · 책상 · 1층 계단 (모든 키 큰 가구는 북쪽 벽 y=3에 밀착, 창문 가림 없음)
    name: '나의 집 (2층 다락방)', W: 12, H: 9, door: 6, noDoor: true,
    wall: { color: '#dfc092', pattern: 'plank', accent: '#c9a26d', wainscot: '#8c5a33' }, floor: WOOD,
    decor: [['window', 2], ['clock', 6], ['poster', 8]],
    rugs: [[3, 5, 5, 2, '#5878a8']],
    furn: [
      ['bed', 1, 4, { interact: 'bed' }], ['tv', 4, 3, { interact: 'tv' }], ['wardrobe', 7, 3, { interact: 'wardrobe' }], ['bookshelf', 9, 3],
      ['desk', 4, 6, { interact: 'sign', text: '다락방 내 책상.\n여행 일기장과 루미나 지방 지도가 정갈히 펼쳐져 있다.' }], ['chair_l', 3, 6],
      ['lamp_floor', 1, 7], ['attic_stairs_down', 9, 7], ['plant', 10, 7],
    ],
    warps: [[9, 7, 1, 1, 'home', 'from_2f']],
    spawns: [['wake', 4, 4], ['from_1f', 8, 7], ['entry', 8, 7]], lights: [[5, 2], [9, 6]],
  },
  in_store: {
    name: '소라네 루미 마트', W: 14, H: 10, door: 7, wall: { color: '#d8e8d0', pattern: 'dots', accent: '#a8c89a', wainscot: '#8c5a33' }, floor: { kind: 'tile', color: '#c9b08a', color2: '#e0caa0' },
    decor: [['window', 8], ['clock', 10], ['poster', 12]],
    rugs: [[5, 6, 4, 2, '#3f8fb5']],
    furn: [['shelf_goods', 1, 3], ['shelf_goods_b', 3, 3], ['shelf_goods', 5, 3], ['counter', 8, 5, { interact: 'shop:general' }], ['sacks', 12, 8], ['plant_b', 1, 8], ['sacks', 12, 7]],
    spawns: [['wp_clerk', 10, 4], ['wp_gate', 7, 8], ['entry', 7, 8]], lights: [[10, 2]],
  },
  in_cafe: {
    name: '루나 카페', W: 14, H: 10, door: 7, wall: { color: '#6a4a3a', pattern: 'plank' }, floor: { kind: 'woodDark', color: '#8a5a3a' },
    decor: [['menu', 2], ['window', 6], ['painting', 8], ['clock', 9]],
    rugs: [],
    furn: [['counter_cafe', 1, 5, { interact: 'shop:cafe' }], ['table_small', 7, 6], ['table_small', 10, 6], ['table_small', 9, 8],
      ['stool', 6, 6], ['stool', 12, 6], ['stool', 8, 8], ['stool', 11, 8], ['plant', 12, 8], ['plant_b', 1, 8], ['piano', 11, 3, { interact: 'piano' }]],
    spawns: [['wp_clerk', 2, 4], ['wp_gate', 7, 8], ['entry', 7, 8]], lights: [[3, 3], [9, 6]],
  },
  in_lab: { // 마을회관 = 한별 박사의 루미 연구실
    name: '마을회관 · 한별 연구소', W: 16, H: 11, door: 8, wall: { color: '#e4ecf2', pattern: 'tile' }, floor: { kind: 'tile', color: '#c8d8e4', color2: '#e8f0f6' },
    decor: [['window', 3], ['chart', 7], ['window', 11]],
    rugs: [[6, 5, 5, 3, '#3a8ab0']],
    furn: [['lab_machine', 1, 3, { interact: 'labcraft' }], ['bookshelf', 5, 3], ['starter_table', 7, 5, { interact: 'starter_table' }], ['bookshelf', 9, 3], ['lab_machine', 13, 3],
      ['counter_lab', 1, 7], ['plant', 14, 9], ['plant_b', 1, 9], ['table_small', 12, 7]],
    spawns: [['wp_prof', 12, 5], ['wp_mayor', 8, 6], ['wp_rival', 6, 7], ['wp_gate', 8, 9], ['entry', 8, 9]], lights: [[8, 2]],
  },
  in_smithy: {
    name: '민수의 볼 공방', W: 12, H: 9, door: 6, wall: { color: '#7a6a6a', pattern: 'stone' }, floor: { kind: 'stone', color: '#7a7480' },
    decor: [['window', 1], ['toolrack', 3], ['toolrack', 7], ['poster', 9]],
    rugs: [],
    furn: [['crate', 1, 3], ['barrel', 2, 3], ['forge', 5, 3, { interact: 'smithy' }], ['barrel', 9, 3], ['crate', 10, 3],
      ['anvil', 3, 5, { interact: 'smithy' }], ['table_small', 8, 6], ['sacks', 1, 7], ['barrel', 10, 7]],
    spawns: [['wp_forge', 5, 6], ['wp_gate', 6, 7], ['entry', 6, 7]], lights: [[5, 3], [8, 5]],
  },
  in_house_a: {
    name: '이웃집', W: 12, H: 9, door: 6, wall: { color: '#e8d8c0', pattern: 'diamond', accent: '#d8b890', wainscot: '#8c5a33' }, floor: WOOD,
    decor: [['window', 3], ['painting', 5], ['clock', 8]],
    rugs: [[4, 4, 4, 2, '#7d5aa8']],
    furn: [['bed_pink', 1, 4, { interact: 'nbed' }], ['tv', 6, 3, { interact: 'tv' }], ['bookshelf', 9, 3], ['table_small', 5, 5], ['chair_l', 4, 5], ['plant', 10, 7], ['lamp_floor', 1, 7]],
    spawns: [['wp_host', 8, 6], ['entry', 6, 7]], lights: [[1, 6]],
  },
  in_house_b: {
    name: '이웃집', W: 12, H: 9, door: 6, wall: { color: '#c8dce8', pattern: 'stripe', accent: '#a8c4d8', wainscot: '#6b4024' }, floor: { kind: 'wood', color: '#a07050' },
    decor: [['window', 4], ['painting', 6], ['window', 7], ['clock', 8]],
    rugs: [[3, 5, 6, 2, '#3f8a3e']],
    furn: [['bed_green', 9, 4, { interact: 'nbed' }], ['kitchen', 1, 3], ['tv', 5, 3, { interact: 'tv' }], ['sofa_red', 3, 6], ['plant_b', 10, 7], ['stool', 1, 6]],
    spawns: [['wp_host', 7, 5], ['entry', 6, 7]], lights: [[5, 6]],
  },
  in_house_c: {
    name: '이웃집', W: 12, H: 9, door: 6, wall: { color: '#f0d8d8', pattern: 'dots', accent: '#e0b0b0', wainscot: '#8c5a33' }, floor: WOOD,
    decor: [['window', 3], ['window', 7], ['clock', 6]],
    rugs: [[3, 5, 5, 2, '#e0a43a']],
    furn: [['bed', 9, 4, { interact: 'nbed' }], ['piano', 1, 3, { interact: 'piano' }], ['bookshelf', 5, 3], ['table_small', 4, 6], ['plant', 1, 7], ['lamp_floor', 10, 7]],
    spawns: [['wp_host', 7, 5], ['entry', 6, 7]], lights: [[10, 6]],
  },
  in_center: { // 루미 센터 (회복)
    name: '루미 센터', W: 14, H: 10, door: 7, wall: { color: '#fbe4ea', pattern: 'stripe', accent: '#f4c8d4', wainscot: '#e8a0b0' }, floor: { kind: 'tile', color: '#f4dce4', color2: '#fff4f8' },
    decor: [['heartsign', 6], ['window', 2], ['window', 10], ['poster', 12]],
    rugs: [[5, 7, 4, 2, '#e07a8a']],
    furn: [['counter_heal', 5, 4, { interact: 'center' }], ['lab_machine', 10, 4, { interact: 'pc' }], ['heal_pad', 1, 4], ['sofa_red', 2, 7], ['sofa', 9, 7], ['plant', 12, 4], ['plant_b', 1, 8]],
    spawns: [['wp_clerk', 7, 3], ['wp_gate', 7, 8], ['entry', 7, 8]], lights: [[7, 2]],
  },
  in_shop_w: {
    name: '바람골 상점', W: 12, H: 9, door: 6, wall: { color: '#e0d0a8', pattern: 'plank' }, floor: { kind: 'wood', color: '#b8885a' },
    decor: [['window', 6], ['shelf', 8], ['poster', 10]],
    rugs: [[4, 6, 4, 1, '#3f8fb5']],
    furn: [['shelf_goods_b', 1, 3], ['shelf_goods', 3, 3], ['counter', 6, 5, { interact: 'shop:windvale' }], ['sacks', 10, 7], ['plant', 1, 7]],
    spawns: [['wp_clerk', 8, 4], ['wp_gate', 6, 7], ['entry', 6, 7]], lights: [[8, 2]],
  },
  in_gym: buildWindvaleGym(),
  in_windmill: {
    name: '풍차 안', W: 10, H: 10, door: 5, wall: { color: '#c8a070', pattern: 'plank' }, floor: { kind: 'wood', color: '#9a6a40' },
    decor: [['gear', 3], ['ladder', 7], ['window', 1]],
    rugs: [],
    furn: [['millstone', 4, 6, { interact: 'windmill' }], ['sacks', 1, 4], ['sacks', 2, 4], ['sacks', 1, 8], ['barrel', 8, 8], ['crate', 8, 5]],
    spawns: [['entry', 5, 8]], lights: [[5, 4]],
  },
  in_casino: { // 별빛 카지노 (밤 18:00 ~ 02:00 전용)
    name: '별빛 카지노', W: 16, H: 11, door: 8,
    wall: { color: '#341d42', pattern: 'diamond', accent: '#d4a438', wainscot: '#4e1a2e' },
    floor: { kind: 'carpet', color: '#6b1d32' },
    trim: '#230e1c',
    decor: [['stars', 2], ['stars', 6], ['stars', 10], ['clock', 13]],
    rugs: [[2, 5, 12, 4, '#246644']],
    furn: [
      ['lamp_floor', 1, 4],
      ['slot_machine', 2, 4, { interact: 'casino:slot' }],
      ['slot_machine', 3, 4, { interact: 'casino:slot' }],
      ['slot_machine', 4, 4, { interact: 'casino:slot' }],
      ['counter_casino', 6, 4, { interact: 'casino:dealer' }],
      ['slot_machine', 11, 4, { interact: 'casino:slot' }],
      ['slot_machine', 12, 4, { interact: 'casino:slot' }],
      ['slot_machine', 13, 4, { interact: 'casino:slot' }],
      ['lamp_floor', 14, 4],
      ['casino_table', 3, 7, { interact: 'casino:dice' }],
      ['casino_table', 10, 7, { interact: 'casino:highlow' }],
      ['plant_b', 1, 9],
      ['sign', 6, 9, { text: '🎰 별빛 카지노 이용 안내\n· 영업시간: 밤 6시(18:00) ~ 새벽 2시\n· 슬롯머신 · 루미 주사위 · 하이로우 카드에 골드를 걸고 승부하세요!' }],
      ['plant_b', 14, 9],
    ],
    spawns: [['wp_clerk', 8, 3], ['wp_guest1', 2, 5], ['wp_guest2', 13, 5], ['wp_gate', 8, 9], ['entry', 8, 9]],
    lights: [[1, 4], [8, 3], [14, 4], [4, 7], [11, 7]],
  },
  in_prison: { // 별빛 교도소 · 지하 5층 (독방 시작: 금이 간 벽을 부수고 1층까지 탈옥 OR 독방에서 얌전히 대기해 노역 석방!)
    name: '별빛 교도소 · 지하 5층', W: 24, H: 16, door: 12, noDoor: true,
    wall: { color: '#2f3645', pattern: 'stone', accent: '#1b202b', wainscot: '#1f2430' },
    floor: { kind: 'tile', color: '#424959', color2: '#4b5366' },
    trim: '#12161f',
    decor: [['clock', 4], ['chart', 11], ['clock', 19]],
    rugs: [[2, 11, 4, 3, '#333b4a'], [20, 3, 2, 2, '#92400e']],
    walls: [
      // 남서 독방 벽 (동쪽 출구 (7, 12) 에 금이 간 벽 배치 — 쇠창살 겹침 없음!)
      [1, 9, 7, 1],
      [7, 10, 1, 2],
      [7, 13, 1, 2],
      // 중앙 보안 격벽 (y=6 금이 간 벽을 부숴 동쪽 계단 구역으로 돌파)
      [14, 3, 1, 3],
      [14, 7, 1, 8],
      // 은신처 기둥 (경찰 감시관 시야 차단)
      [10, 12, 1, 3],
      [10, 3, 1, 2],
      [18, 9, 1, 3],
    ],
    furn: [
      ['prison_cot', 1, 11],
      ['sign', 5, 10, { text: '⛓️ 별빛 교도소 (지하 5층)\n[탈옥 루트] 금이 간 벽(노란 균열)을 [E/Space]로 부수고 경찰 감시관을 피해 지상 1층 외벽까지 올라가 탈옥하세요!\n[성실 석방 루트] 벽을 부수지 않고 독방에 잠시 가만히 있으면 감시관이 노역 채광장으로 안내합니다.' }],
      ['cracked_wall', 7, 12, { interact: 'prison_wall' }],
      ['cracked_wall', 14, 6, { interact: 'prison_wall' }],
      ['prison_bars', 2, 3], ['prison_bars', 3, 3],
      ['crate', 11, 14], ['barrel', 17, 14],
      ['sign', 19, 3, { text: '🪜 지하 4층으로 올라가는 계단' }],
      ['prison_stairs_up', 21, 4, { interact: 'prison_up:in_prison_b4' }],
    ],
    spawns: [
      ['player', 3, 12],
      ['entry', 3, 12],
      ['warden:0', 9, 6, { route: '9,6;12,6;12,11;9,11', speed: 38 }],
      ['warden:1', 16, 12, { route: '16,12;21,12;21,7;16,7', speed: 42 }],
    ],
    lights: [[3, 11], [11, 8], [20, 5]],
  },
  in_prison_b4: { // 지하 4층
    name: '별빛 교도소 · 지하 4층', W: 24, H: 16, door: 12, noDoor: true,
    wall: { color: '#333b4d', pattern: 'stone', accent: '#1e2330', wainscot: '#222836' },
    floor: { kind: 'tile', color: '#474f61', color2: '#50596e' },
    trim: '#141822',
    decor: [['clock', 5], ['chart', 14]],
    rugs: [[1, 3, 3, 2, '#92400e']],
    walls: [
      [1, 9, 18, 1],
      [21, 9, 2, 1],
      [7, 12, 1, 3],
      [13, 12, 1, 3],
      [9, 3, 1, 3],
      [15, 3, 1, 3],
    ],
    furn: [
      ['cracked_wall', 19, 9, { interact: 'prison_wall' }],
      ['cracked_wall', 20, 9, { interact: 'prison_wall' }],
      ['crate', 8, 14], ['barrel', 14, 14],
      ['prison_bars', 18, 3], ['prison_bars', 19, 3],
      ['sign', 4, 3, { text: '🪜 지하 3층으로 올라가는 계단' }],
      ['prison_stairs_up', 2, 4, { interact: 'prison_up:in_prison_b3' }],
    ],
    spawns: [
      ['player', 2, 13],
      ['entry', 2, 13],
      ['warden:0', 6, 11, { route: '6,11;18,11', speed: 42 }],
      ['warden:1', 19, 6, { route: '19,6;5,6', speed: 44 }],
    ],
    lights: [[3, 12], [12, 11], [19, 8], [4, 5]],
  },
  in_prison_b3: { // 지하 3층
    name: '별빛 교도소 · 지하 3층', W: 24, H: 16, door: 12, noDoor: true,
    wall: { color: '#374054', pattern: 'stone', accent: '#202636', wainscot: '#252c3d' },
    floor: { kind: 'tile', color: '#4c5569', color2: '#566075' },
    trim: '#161b26',
    decor: [['chart', 6], ['clock', 17]],
    rugs: [[20, 12, 2, 2, '#92400e']],
    walls: [
      [8, 3, 1, 9],
      [8, 13, 1, 2],
      [15, 3, 1, 1],
      [15, 5, 1, 10],
      [4, 8, 2, 1],
      [11, 8, 2, 1],
      [18, 8, 2, 1],
    ],
    furn: [
      ['cracked_wall', 8, 12, { interact: 'prison_wall' }],
      ['cracked_wall', 15, 4, { interact: 'prison_wall' }],
      ['crate', 1, 13], ['barrel', 12, 14],
      ['sign', 19, 14, { text: '🪜 지하 2층으로 올라가는 계단' }],
      ['prison_stairs_up', 21, 13, { interact: 'prison_up:in_prison_b2' }],
    ],
    spawns: [
      ['player', 2, 4],
      ['entry', 2, 4],
      ['warden:0', 6, 12, { route: '6,12;6,5', speed: 44 }],
      ['warden:1', 10, 5, { route: '10,5;13,5;13,12;10,12', speed: 44 }],
      ['warden:2', 17, 12, { route: '17,12;17,5', speed: 46 }],
    ],
    lights: [[3, 5], [11, 7], [20, 12]],
  },
  in_prison_b2: { // 지하 2층
    name: '별빛 교도소 · 지하 2층', W: 24, H: 16, door: 12, noDoor: true,
    wall: { color: '#3c465c', pattern: 'stone', accent: '#242b3c', wainscot: '#293144' },
    floor: { kind: 'tile', color: '#515b70', color2: '#5c6780' },
    trim: '#181e2b',
    decor: [['clock', 4], ['chart', 11], ['clock', 19]],
    rugs: [[1, 3, 3, 2, '#92400e']],
    walls: [
      [1, 8, 6, 1],
      [8, 8, 8, 1],
      [17, 8, 6, 1],
      [5, 11, 1, 3],
      [14, 11, 1, 3],
      [6, 3, 1, 2],
      [15, 3, 1, 2],
    ],
    furn: [
      ['cracked_wall', 7, 8, { interact: 'prison_wall' }],
      ['cracked_wall', 16, 8, { interact: 'prison_wall' }],
      ['crate', 10, 14], ['barrel', 19, 3],
      ['sign', 4, 3, { text: '🪜 지하 1층으로 올라가는 계단' }],
      ['prison_stairs_up', 2, 4, { interact: 'prison_up:in_prison_b1' }],
    ],
    spawns: [
      ['player', 21, 13],
      ['entry', 21, 13],
      ['warden:0', 4, 10, { route: '4,10;19,10', speed: 46 }],
      ['warden:1', 19, 6, { route: '19,6;5,6', speed: 48 }],
    ],
    lights: [[20, 12], [11, 10], [11, 5], [3, 4]],
  },
  in_prison_b1: { // 지하 1층
    name: '별빛 교도소 · 지하 1층', W: 24, H: 16, door: 12, noDoor: true,
    wall: { color: '#424d66', pattern: 'stone', accent: '#283044', wainscot: '#2e374d' },
    floor: { kind: 'tile', color: '#58627a', color2: '#636e88' },
    trim: '#1a2130',
    decor: [['clock', 5], ['chart', 12], ['clock', 19]],
    rugs: [[20, 12, 2, 2, '#92400e']],
    walls: [
      [7, 3, 1, 9],
      [7, 13, 1, 2],
      [15, 3, 1, 1],
      [15, 5, 1, 10],
      [10, 8, 2, 1],
      [18, 8, 2, 1],
    ],
    furn: [
      ['cracked_wall', 7, 12, { interact: 'prison_wall' }],
      ['cracked_wall', 15, 4, { interact: 'prison_wall' }],
      ['prison_bars', 1, 13], ['crate', 12, 14],
      ['sign', 19, 14, { text: '🪜 지상 1층 (탈출 로비) 계단' }],
      ['prison_stairs_up', 21, 13, { interact: 'prison_up:in_prison_1f' }],
    ],
    spawns: [
      ['player', 2, 4],
      ['entry', 2, 4],
      ['warden:0', 5, 12, { route: '5,12;5,5', speed: 46 }],
      ['warden:1', 9, 5, { route: '9,5;13,5;13,12;9,12', speed: 46 }],
      ['warden:2', 17, 12, { route: '17,12;17,5', speed: 48 }],
    ],
    lights: [[3, 5], [11, 7], [20, 12]],
  },
  in_prison_1f: { // 지상 1층: 북쪽 금이 간 외벽을 부수면 드디어 탈옥 성공!
    name: '별빛 교도소 · 지상 1층', W: 24, H: 16, door: 12, noDoor: true,
    wall: { color: '#4e5b78', pattern: 'stone', accent: '#313b52', wainscot: '#38435c' },
    floor: { kind: 'tile', color: '#65708a', color2: '#737f9c' },
    trim: '#1e2638',
    decor: [['window', 3], ['chart', 8], ['window', 15], ['clock', 20]],
    rugs: [[10, 3, 4, 2, '#1f6a46']],
    walls: [
      [1, 9, 10, 1],
      [13, 9, 10, 1],
      [6, 12, 1, 3],
      [15, 12, 1, 3],
      [6, 4, 1, 2],
      [17, 4, 1, 2],
    ],
    furn: [
      ['cracked_wall', 11, 9, { interact: 'prison_wall' }],
      ['cracked_wall', 12, 9, { interact: 'prison_wall' }],
      ['sign', 9, 3, { text: '☀️ 지상 1층 외벽!\n빛이 새어 들어오는 금이 간 외벽을 [E/Space]로 부수면 탈옥 성공!' }],
      ['prison_exit_wall', 11, 3, { interact: 'prison_escape_wall' }],
      ['crate', 2, 14], ['barrel', 21, 3],
    ],
    spawns: [
      ['player', 21, 13],
      ['entry', 21, 13],
      ['warden:0', 4, 11, { route: '4,11;19,11', speed: 48 }],
      ['warden:1', 19, 7, { route: '19,7;4,7', speed: 48 }],
      ['warden:2', 9, 5, { route: '9,5;15,5', speed: 46 }],
    ],
    lights: [[11, 4], [5, 7], [18, 7], [12, 12]],
  },
  in_prison_yard: { // 별빛 교도소 노역 채광장: 성실하게 돌·나무 채집 → 석판·나무판 100개씩 제작·납품 → 정식 석방!
    name: '별빛 교도소 · 노역 채광장', W: 28, H: 20, door: 14, noDoor: true,
    wall: { color: '#545f75', pattern: 'stone', accent: '#363e4f', wainscot: '#3f485c' },
    floor: { kind: 'stone', color: '#78726a' },
    trim: '#232836',
    decor: [['window', 3], ['clock', 13], ['window', 22]],
    rugs: [[10, 4, 8, 5, '#595046']],
    walls: [
      [1, 15, 11, 1],
      [16, 15, 11, 1],
    ],
    furn: [
      // 중앙 작업대 + 납품함 + 안내 표지판
      ['sign', 13, 4, { text: '⛏️ 성실 노역 석방 안내\n1. 서쪽에서 돌을 캐고, 동쪽에서 나무를 베세요 ([E/Space] 무한 채집).\n2. 중앙 작업대에서 석판·나무판을 제작하세요.\n3. 납품함에 석판 100개 + 나무판 100개를 납품하면 정식 석방됩니다!' }],
      ['workbench', 10, 7, { interact: 'prison_craft' }],
      ['prison_deliver', 16, 7, { interact: 'prison_deliver' }],
      // 서쪽 돌 채광 구역 (8개)
      ['yard_stone', 2, 5, { interact: 'yard_stone' }], ['yard_stone', 5, 5, { interact: 'yard_stone' }],
      ['yard_stone', 3, 8, { interact: 'yard_stone' }], ['yard_stone', 7, 8, { interact: 'yard_stone' }],
      ['yard_stone', 2, 11, { interact: 'yard_stone' }], ['yard_stone', 6, 11, { interact: 'yard_stone' }],
      ['yard_stone', 4, 13, { interact: 'yard_stone' }], ['yard_stone', 8, 13, { interact: 'yard_stone' }],
      // 동쪽 나무 벌목 구역 (8개)
      ['yard_wood', 20, 5, { interact: 'yard_wood' }], ['yard_wood', 24, 5, { interact: 'yard_wood' }],
      ['yard_wood', 19, 8, { interact: 'yard_wood' }], ['yard_wood', 23, 8, { interact: 'yard_wood' }],
      ['yard_wood', 21, 11, { interact: 'yard_wood' }], ['yard_wood', 25, 11, { interact: 'yard_wood' }],
      ['yard_wood', 19, 13, { interact: 'yard_wood' }], ['yard_wood', 24, 13, { interact: 'yard_wood' }],
      // 남쪽 독방 귀환 계단
      ['sign', 12, 17, { text: '🪜 지하 5층 독방으로 돌아가기' }],
      ['prison_stairs_up', 14, 18, { interact: 'prison_back_cell' }],
      ['crate', 1, 18], ['barrel', 26, 18],
    ],
    spawns: [
      ['player', 14, 16],
      ['entry', 14, 16],
      ['yard_guard', 14, 6],
    ],
    lights: [[5, 8], [14, 6], [22, 8], [14, 16]],
  },
};

// ── 루미나 지방 7대 도장: 기존 10배 면적 · 포켓몬 정통 퍼즐 맵 (tools/art/gym-puzzles.mjs) ──
for (const [town, g] of Object.entries(BIG_GYM_LAYOUTS)) {
  ROOMS[`gym_${town}`] = {
    name: g.name, W: g.W, H: g.H, door: g.door, wall: g.wall, floor: g.floor, trim: darken(g.col, 0.55),
    walls: g.walls, pools: g.pools, gimmicks: g.gimmicks, elevs: g.elevs, ramps: g.ramps,
    emblems: g.emblems, circuits: g.circuits,
    decor: [
      ['banner', 4, g.col],
      ['banner', Math.floor(g.W * 0.28), g.col],
      ['banner', Math.floor(g.W / 2), g.col],
      ['banner', Math.floor(g.W * 0.72), g.col],
      ['banner', g.W - 6, g.col],
    ],
    rugs: g.rugs, furn: g.furn,
    spawns: [...g.spawns, ['wp_gate', g.door, g.H - 2], ['entry', g.door, g.H - 2]],
    lights: g.lights,
  };
}
Object.assign(ROOMS, {
  league: { // 루미 리그: 긴 전당 — 사천왕 4명 → 챔피언
    name: '루미 리그 전당', W: 15, H: 34, door: 7, wall: { color: '#4a3a5a', pattern: 'diamond', accent: '#e0c870' }, floor: { kind: 'tile', color: '#5a4a6a', color2: '#6a5a7e' }, trim: '#1e1428',
    decor: [['banner', 1, '#a83c34'], ['stars', 5], ['banner', 6, '#e0b830'], ['stars', 9], ['banner', 11, '#3f8fc8']],
    rugs: [[6, 3, 3, 30, '#a83c34']],
    furn: [...[6, 12, 18, 24, 30].flatMap((y) => [['pillar', 3, y], ['pillar', 11, y]]), ['statue', 5, 9], ['statue', 9, 9], ['candle', 1, 15], ['candle', 13, 15], ['candle', 1, 27], ['candle', 13, 27]],
    spawns: [['trainer:elite1', 7, 27, { face: 'down' }], ['trainer:elite2', 7, 21, { face: 'down' }], ['trainer:elite3', 7, 15, { face: 'down' }], ['trainer:elite4', 7, 10, { face: 'down' }], ['trainer:champion', 7, 4, { face: 'down' }], ['wp_gate', 7, 32], ['entry', 7, 32]],
    lights: [[7, 4], [7, 10], [7, 15], [7, 21], [7, 27]],
  },
  tower: {
    name: '도전의 탑', W: 14, H: 14, door: 7, wall: { color: '#3a4a5a', pattern: 'tile' }, floor: { kind: 'tile', color: '#6a7a8a', color2: '#8090a0' }, trim: '#141c24',
    decor: [['banner', 2, '#e0b830'], ['chart', 6], ['banner', 10, '#e0b830']],
    rugs: [[3, 4, 8, 8, '#2a5a8a']],
    furn: [['pillar', 1, 5], ['pillar', 12, 5], ['pillar', 1, 10], ['pillar', 12, 10], ['plant', 1, 12], ['plant', 12, 12]],
    spawns: [['trainer:tower_1', 4, 9, { face: 'right' }], ['trainer:tower_2', 10, 7, { face: 'left' }], ['trainer:tower_3', 7, 4, { face: 'down' }], ['wp_gate', 7, 12], ['entry', 7, 12]], lights: [[7, 6], [7, 10]],
  },
  chateau: {
    name: '숲속 폐저택', W: 18, H: 12, door: 9, wall: { color: '#4a3a40', pattern: 'stripe', accent: '#3a2a30', wainscot: '#3a2418' }, floor: { kind: 'woodDark', color: '#5a3a2a' }, trim: '#140c0e',
    decor: [['window', 4], ['ghostframe', 7], ['clock', 10], ['window', 12]],
    rugs: [[6, 5, 6, 4, '#5a2030']],
    furn: [['bookshelf', 1, 3], ['piano', 15, 3, { interact: 'sign', text: '먼지 쌓인 피아노.\n건반 하나가 저절로 눌렸다… 띵.' }], ['dtable', 7, 6, { interact: 'sign', text: '식탁 위에 식은 차가 놓여 있다.\n방금 누군가 마신 것처럼 김이 오른다…' }], ['candle', 6, 6], ['candle', 10, 6],
      ['sofa_red', 2, 9], ['lamp_floor', 16, 9], ['bed', 15, 4, { interact: 'sign', text: '아무도 자지 않은 침대인데 이불이 따뜻하다.' }], ['plant_b', 1, 6]],
    spawns: [['trainer:chateau_ghost', 12, 9, { face: 'left' }], ['wp_gate', 9, 10], ['entry', 9, 10]], lights: [[6, 5], [10, 5], [16, 8]],
  },
  origin: { // 별의 제단 위 계단 → 태초의 방
    name: '태초의 방', W: 13, H: 12, door: 6, exitTo: ['altar', 'from_origin'], wall: { color: '#f4ecd8', pattern: 'diamond', accent: '#e0c870' }, floor: { kind: 'tile', color: '#f4efe0', color2: '#fffaf0' }, trim: '#6a5a3a',
    decor: [['stars', 1], ['stars', 4], ['stars', 7], ['stars', 10]],
    rugs: [[3, 4, 7, 6, '#e0b830']],
    furn: [['crystal', 2, 4], ['crystal', 10, 4], ['crystal_red', 2, 8], ['crystal_red', 10, 8],
      ['pedestal', 5, 5, { interact: 'sign', text: '빛나는 받침돌 위에 별가루가 소용돌이친다.\n여기서 처음으로 세상이 빚어졌다고 한다…' }]],
    spawns: [['entry', 6, 10], ['from_altar', 6, 10]], lights: [[6, 4], [3, 6], [9, 6]],
  },
});
// 바깥 건물(오브젝트 타입) → 실내 맵
export const INTERIOR_OF = { house: 'home', store: 'in_store', cafe: 'in_cafe', hall: 'in_lab', smithy: 'in_smithy', casino: 'in_casino', house_a: 'in_house_a', house_b: 'in_house_b', house_c: 'in_house_c', center: 'in_center', shop_w: 'in_shop_w', gym: 'in_gym', windmill: 'in_windmill' };
