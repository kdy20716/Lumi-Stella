#!/usr/bin/env node
// 농장 맵 생성기 → Tiled 호환 JSON (client/public/assets/maps/farm.json)
//   - Ground: 듀얼그리드 오토타일 (잔디/흙길/물), 반 타일(-8px) 오프셋
//   - Decor / Bridge / Collision: 셀 정렬 타일 레이어
//   - Objects / Spawns / FarmPlots: 오브젝트 레이어
// Tiled 에디터로 열어서 수정 가능 (단, 다시 생성하면 덮어씀)
//   실행: npm run gen:map
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rng } from '../art/lib/img.mjs';
import { ROW, DECOR, WOOD, MISC, TILESET_COLS } from '../art/tiles.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../client/public/assets/maps/farm.json');
const W = 56, H = 42, T = 16;
const R = rng(20261103);
const G = 0, D = 1, Wt = 2; // grass, dirt, water
const terrain = Array.from({ length: H }, () => new Array(W).fill(G));
const blocked = Array.from({ length: H }, () => new Array(W).fill(false));
const reserved = Array.from({ length: H }, () => new Array(W).fill(false)); // 오브젝트 배치 금지 영역
const decor = new Array(W * H).fill(0);
const bridge = new Array(W * H).fill(0);
const objects = [], spawns = [], plots = [];
let oid = 1;

const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const setT = (x, y, v) => { if (inb(x, y)) terrain[y][x] = v; };
const reserve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inb(x, y)) reserved[y][x] = true; };
const gid = (row, col) => row * TILESET_COLS + col + 1;

// ── 1. 연못 ────────────────────────────────────────────
const pond = { cx: 11.5, cy: 30.5, rx: 6.2, ry: 4.6 };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dx = (x + 0.5 - pond.cx) / pond.rx, dy = (y + 0.5 - pond.cy) / pond.ry;
  const wob = Math.sin(Math.atan2(dy, dx) * 3 + 1) * 0.08;
  if (dx * dx + dy * dy < 1 + wob) setT(x, y, Wt);
}
// 작은 개울(연못 → 남쪽 숲)
for (let y = 34; y < H; y++) { const x = 9 + Math.round(Math.sin(y * 0.7) * 0.6); setT(x, y, Wt); setT(x + 1, y, Wt); }
reserve(3, 22, 20, H - 1);

// ── 2. 길 ──────────────────────────────────────────────
const path = (x0, y0, x1, y1, wdt = 2) => {
  const xs = Math.min(x0, x1), xe = Math.max(x0, x1), ys = Math.min(y0, y1), ye = Math.max(y0, y1);
  for (let y = ys; y <= ye + (y0 === y1 ? wdt - 1 : 0); y++) for (let x = xs; x <= xe + (x0 === x1 ? wdt - 1 : 0); x++) { if (terrain[y]?.[x] !== Wt) setT(x, y, D); reserved[y][x] = true; }
};
path(23, 12, 23, 20);           // 집 앞 → 교차로
path(19, 12, 28, 12);           // 집 앞 마당
path(8, 20, W - 1, 20);         // 동서 큰길 (동쪽 끝 = 마을 출구)
path(12, 20, 12, 24);           // 연못 부두 가는 길
path(37, 21, 37, 23);           // 밭 입구
// 길 가장자리 자연스럽게
for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
  if (terrain[y][x] !== G) continue;
  const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => terrain[y + dy][x + dx] === D).length;
  if (n >= 2 && R() < 0.35) { terrain[y][x] = D; reserved[y][x] = true; }
}

// ── 3. 부두 ────────────────────────────────────────────
let dockTop = 0; for (let y = 22; y < H; y++) if (terrain[y][12] === Wt) { dockTop = y; break; }
for (let y = dockTop; y < dockTop + 4; y++) for (const x of [12, 13]) {
  bridge[y * W + x] = gid(ROW.WOOD, y === dockTop + 3 ? WOOD.DOCK_POST : WOOD.DOCK_H);
}

// ── 4. 오브젝트 배치 헬퍼 ───────────────────────────────
// 오브젝트 좌표: 앵커 셀 (cx, cy) = 발이 닿는 셀(가장 아래, 왼쪽). w = 점유 셀 너비
function place(type, cx, cy, { w = 1, h = 1, block = true, props = {}, force = false } = {}) {
  if (!force) for (let y = cy - h + 1; y <= cy; y++) for (let x = cx; x < cx + w; x++) if (!inb(x, y) || blocked[y][x] || reserved[y][x] || terrain[y][x] !== G) return false;
  if (block) for (let y = cy - h + 1; y <= cy; y++) for (let x = cx; x < cx + w; x++) if (inb(x, y)) blocked[y][x] = true;
  objects.push({
    id: oid++, name: type, type, x: (cx + w / 2) * T, y: (cy + 1) * T, width: 0, height: 0, rotation: 0, visible: true, point: true,
    properties: [{ name: 'cellX', type: 'int', value: cx }, { name: 'cellY', type: 'int', value: cy }, { name: 'cellW', type: 'int', value: w },
      ...Object.entries(props).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : 'string', value }))],
  });
  return true;
}
const spawn = (name, cx, cy, props = {}) => spawns.push({ id: oid++, name, type: 'spawn', x: cx * T + 8, y: cy * T + 8, width: 0, height: 0, rotation: 0, visible: true, point: true, properties: Object.entries(props).map(([n, v]) => ({ name: n, type: 'string', value: String(v) })) });

// ── 5. 농가 + 마당 ─────────────────────────────────────
place('house', 20, 11, { w: 7, h: 4, force: true, props: { doorCellX: 23, doorCellY: 11 } });
reserve(18, 4, 29, 13);
place('well', 15, 11, { w: 2, h: 2, force: true }); reserve(14, 9, 17, 12);
place('shipping_bin', 28, 11, { w: 2, force: true, props: { interact: 'ship' } }); reserve(27, 10, 30, 12);
place('mailbox', 21, 13, { force: true, props: { interact: 'mail' } });
place('lamp', 26, 13, { force: true });
place('lamp', 25, 18, { force: true });
place('lamp', 40, 19, { force: true });
place('barrel', 18, 11, { force: true }); place('crate', 18, 10, { force: true });
place('hay', 30, 10, { force: true });
place('sign', 51, 18, { force: true, props: { interact: 'sign', text: '→ 별빛 마을' } });
place('sign', 14, 19, { force: true, props: { interact: 'sign', text: '은빛 연못 · 낚시 금지 구역 아님!' } });
// 현관 징검돌
decor[12 * W + 23] = 0; bridge[12 * W + 23] = gid(ROW.WOOD, WOOD.STEP0);

// ── 6. 울타리 밭 ───────────────────────────────────────
const F = { x0: 30, y0: 23, x1: 46, y1: 35 };
reserve(F.x0, F.y0, F.x1, F.y1);
for (let x = F.x0; x <= F.x1; x++) for (const y of [F.y0, F.y1]) {
  if (y === F.y0 && (x === 37 || x === 38)) continue; // 입구
  place('fence', x, y, { force: true });
}
for (let y = F.y0 + 1; y < F.y1; y++) for (const x of [F.x0, F.x1]) place('fence', x, y, { force: true });
place('scarecrow', 38, 29, { force: true });
// 초기 경작지 + 작물 (시뮬레이션이 읽는 데이터)
const plot = (name, x, y, w, h, crop, stage, watered = 0) => plots.push({ id: oid++, name, type: 'plot', x: x * T, y: y * T, width: w * T, height: h * T, rotation: 0, visible: true, properties: [{ name: 'crop', type: 'string', value: crop }, { name: 'stage', type: 'int', value: stage }, { name: 'watered', type: 'int', value: watered }] });
plot('parsnips', 32, 25, 5, 3, 'parsnip', 4);
plot('cauliflower', 40, 25, 5, 3, 'cauliflower', 3, 1);
plot('tomatoes', 32, 31, 4, 3, 'tomato', 4);
plot('pumpkins', 41, 31, 4, 3, 'pumpkin', 2);
plot('tilled', 36, 31, 4, 2, '', 0);
plot('farm_zone', F.x0 + 1, F.y0 + 1, F.x1 - F.x0 - 1, F.y1 - F.y0 - 1, '*', 0);

// ── 7. 닭 놀이터 ───────────────────────────────────────
reserve(31, 13, 37, 17);
place('hay', 33, 14, { force: true }); place('hay', 34, 14, { force: true });

// ── 8. 숲 테두리 (빽빽한 나무) ─────────────────────────
const borderTree = (x, y) => {
  if (!inb(x, y) || reserved[y][x] || terrain[y][x] !== G || blocked[y][x]) return;
  const type = R() < 0.55 ? 'pine' : (R() < 0.2 ? 'oak_apple' : 'oak');
  place(type, x, y, { props: { frameOffset: Math.floor(R() * 4) } });
};
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
  if (edge > (y < 6 ? 4 : 3)) continue;
  const exitGap = x > W - 6 && y >= 18 && y <= 22;
  if (exitGap) continue;
  const top = y < 6 ? 0.25 : 0;
  const p = (edge === 0 ? 0.95 : edge === 1 ? 0.7 : edge === 2 ? 0.4 : 0.15) + top;
  if ((x + y * 3) % 2 === 0 && R() < p) borderTree(x, y);
}
// 가장자리 막기 (나무 틈새 포함)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.min(x, y, W - 1 - x, H - 1 - y) === 0 && !(x === W - 1 && y >= 20 && y <= 21)) blocked[y][x] = true;

// ── 9. 흩어진 나무/덤불/바위 ──────────────────────────
const scatter = (type, count, opts = {}) => {
  let n = 0, tries = 0;
  while (n < count && tries++ < 4000) {
    const x = 3 + Math.floor(R() * (W - 6)), y = 4 + Math.floor(R() * (H - 8));
    // 주변 1칸 여유
    let ok = true;
    for (let yy = y - 1; yy <= y + 1 && ok; yy++) for (let xx = x - 1; xx <= x + (opts.w ?? 1); xx++) if (!inb(xx, yy) || blocked[yy][xx] || reserved[yy][xx] || terrain[yy][xx] !== G) ok = false;
    if (!ok) continue;
    if (place(type, x, y, { ...opts, props: { frameOffset: Math.floor(R() * 4), ...(opts.props ?? {}) } })) n++;
  }
};
scatter('oak', 12); scatter('oak_apple', 4); scatter('pine', 6);
scatter('bush', 10, { w: 2 }); scatter('bush_berry', 5, { w: 2 });
scatter('rock', 10); scatter('rock_big', 4, { w: 2 }); scatter('stump', 6); scatter('log', 4, { w: 2 });
scatter('tuft', 70, { block: false });

// ── 10. 장식 타일 (꽃밭 클러스터) ─────────────────────
for (let k = 0; k < 26; k++) {
  const cx = 3 + Math.floor(R() * (W - 6)), cy = 4 + Math.floor(R() * (H - 8));
  const kind = Math.floor(R() * 7);
  for (let i = 0; i < 6; i++) {
    const x = cx + Math.floor(R() * 4) - 1, y = cy + Math.floor(R() * 3) - 1;
    if (!inb(x, y) || terrain[y][x] !== G || blocked[y][x] || (reserved[y][x] && !(x < 18 && y > 21))) continue;
    if (bridge[y * W + x]) continue;
    const col = kind < 6 ? DECOR.FLOWER0 + kind : DECOR.DAISY;
    decor[y * W + x] = gid(ROW.DECOR, R() < 0.8 ? col : DECOR.CLOVER0 + Math.floor(R() * 2));
  }
}
for (let i = 0; i < 90; i++) {
  const x = Math.floor(R() * W), y = Math.floor(R() * H);
  if (terrain[y][x] === G && !blocked[y][x] && !decor[y * W + x]) decor[y * W + x] = gid(ROW.DECOR, [DECOR.PEBBLE0, DECOR.PEBBLE0 + 1, DECOR.CLOVER0, DECOR.CLOVER0 + 1, DECOR.GRASS_DARK, DECOR.MUSHROOM, DECOR.LEAVES, DECOR.STONES][Math.floor(R() * 8)]);
  else if (terrain[y][x] === D && !decor[y * W + x] && R() < 0.4) decor[y * W + x] = gid(ROW.DECOR, DECOR.PATCH);
}

// ── 11. 스폰 & 웨이포인트 ──────────────────────────────
spawn('player', 23, 14);
spawn('wp_house', 23, 14); spawn('wp_cross', 24, 21); spawn('wp_well', 16, 13);
spawn('wp_dock', 12, dockTop + 2); spawn('wp_pond_e', 19, 27); spawn('wp_field_gate', 37, 22);
spawn('wp_field_in', 39, 27); spawn('wp_bin', 29, 13); spawn('wp_exit', W - 1, 20);
spawn('wp_east', 47, 21); spawn('wp_coop', 34, 16); spawn('wp_lamp', 41, 21); spawn('wp_meadow', 47, 12); spawn('wp_west', 9, 17);
spawn('chicken', 33, 16, { color: 'white' }); spawn('chicken', 35, 15, { color: 'brown' }); spawn('chicken', 32, 17, { color: 'white' }); spawn('chicken', 36, 17, { color: 'brown' });

// ── 12. 충돌 + 지면 레이어 계산 ───────────────────────
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terrain[y][x] === Wt && !bridge[y * W + x]) blocked[y][x] = true;
const collision = blocked.flat().map((b) => (b ? gid(ROW.MISC, MISC.COLLIDE) : 0));

const cell = (x, y) => terrain[Math.min(H - 1, Math.max(0, y))][Math.min(W - 1, Math.max(0, x))];
const ground = [];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  // 표시 타일 (i,j) 는 월드에서 -8px 오프셋 → 코너 = 셀 (i-1,j-1),(i,j-1),(i-1,j),(i,j)... 에 맞추기 위해 (i,j)~(i+1,j+1) 사용하고 +8px 오프셋
  const c = [cell(i, j), cell(i + 1, j), cell(i, j + 1), cell(i + 1, j + 1)];
  if (c.includes(Wt)) { const idx = c.reduce((a, v, k) => a | ((v === Wt ? 1 : 0) << (3 - k)), 0); ground.push(gid(ROW.GRASS_WATER, idx)); }
  else if (c.includes(D)) { const idx = c.reduce((a, v, k) => a | ((v === D ? 1 : 0) << (3 - k)), 0); ground.push(idx === 15 ? gid(ROW.DIRT, (i % 4) + (j % 4) * 4) : gid(ROW.GRASS_DIRT, idx)); }
  else ground.push(gid(ROW.GRASS, (i % 4) + (j % 4) * 4));
}

// ── 13. Tiled JSON 출력 ───────────────────────────────
const tileLayer = (id, name, data, extra = {}) => ({ id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data, ...extra });
const objLayer = (id, name, objs) => ({ id, name, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: objs });
const map = {
  type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
  width: W, height: H, tilewidth: T, tileheight: T, infinite: false, nextlayerid: 8, nextobjectid: oid,
  properties: [{ name: 'groundOffset', type: 'int', value: 8 }, { name: 'terrain', type: 'string', value: terrain.map((r) => r.join('')).join('|') }],
  tilesets: [{ firstgid: 1, name: 'tileset', image: '../tiles/tileset.png', imagewidth: TILESET_COLS * T, imageheight: 9 * T, tilewidth: T, tileheight: T, columns: TILESET_COLS, tilecount: TILESET_COLS * 9, margin: 0, spacing: 0 }],
  layers: [
    tileLayer(1, 'Ground', ground, { offsetx: 8, offsety: 8 }),
    tileLayer(2, 'Decor', decor),
    tileLayer(3, 'Bridge', bridge),
    tileLayer(4, 'Collision', collision, { visible: false }),
    objLayer(5, 'Objects', objects),
    objLayer(6, 'Spawns', spawns),
    objLayer(7, 'FarmPlots', plots),
  ],
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(map));
const counts = objects.reduce((a, o) => ((a[o.type] = (a[o.type] ?? 0) + 1), a), {});
console.log(`✔ 맵 생성 완료 ${W}x${H} → ${OUT}`);
console.log('  오브젝트:', JSON.stringify(counts));
