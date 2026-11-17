// 동굴 층 레이아웃 (셀룰러 오토마타 + 연결 보장). 맵(충돌)과 아트(배경 그림)가 같은 결과를 쓰도록 결정적.
import { rng } from '../art/lib/img.mjs';
import { CHAMBERS, MAZES } from './region-spec.mjs';

export const CAVE_W = 40, CAVE_H = 30;
const hashStr = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** 동굴/탑/방별 다양한 크기 프리셋 (세로 긴 수직굴·넓은 공동·작은 암굴·미로 등) */
const CAVE_SIZES = [
  [36, 46], // 높은 Y축 등반형 동굴
  [52, 32], // 가로로 긴 공동
  [44, 38], // 정사각에 가까운 대형 동굴
  [32, 30], // 아담한 소굴
  [38, 48], // 깊은 수직 탑/굴
  [56, 30], // 광산 터널형
  [42, 36], // 균형형 동굴
];
const PICK_SIZE = {
  coronet_1f: [44, 42], coronet_2f: [38, 46], coronet_3f: [36, 48], coronet_deep: [40, 34],
  stark_1f: [42, 34], stark_2f: [38, 44],
  iron_1f: [50, 30], iron_2f: [44, 38], iron_deep: [34, 34],
  victory_1f: [46, 38], victory_2f: [40, 46], victory_3f: [38, 48],
  wayward_1f: [48, 34], wayward_2f: [44, 40], wayward_deep: [32, 30],
  ice_cave: [46, 38], sea_cave: [42, 32], sea_cave_deep: [34, 34],
  underground: [54, 30], underground_deep: [40, 36],
  star_maze: [48, 36], spire_n_2f: [36, 44], spire_e_2f: [46, 34], spire_s_2f: [38, 46], spire_w_2f: [44, 38],
  master_hall: [40, 34], stella_nest: [38, 36],
};

/** 동굴 노드의 출구 순서 (입구/아래층 계단이 먼저) — 맵과 아트가 같은 순서를 써야 함 */
export const caveExits = (node) => [...node.links].sort((x, y) => (x.type === 'mouthBack' || x.type === 'stairsDown' ? -1 : 0) - (y.type === 'mouthBack' || y.type === 'stairsDown' ? -1 : 0));

/** 동굴 기믹 배치 도우미 (빙판 · 워프패드 · 가속패드 · 스위치+비밀금고) */
function addCaveGimmicks(id, W, H, wall, pts, R) {
  const gimmicks = [];
  let vaultChest = null;
  const nearPt = (x, y, minD = 4) => pts.some((p) => Math.hypot(p.x - x, p.y - y) < minD);
  const open = [];
  for (let y = 4; y < H - 4; y++) for (let x = 3; x < W - 3; x++) {
    if (!wall[y][x] && !nearPt(x, y, 4)) open.push([x, y]);
  }
  const hasClearSpot = (cx, cy) => {
    if (wall[cy]?.[cx]) return false;
    let openN = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!wall[cy + dy]?.[cx + dx]) openN++;
    return openN >= 3;
  };

  // 1) 얼음 굴 / 북쪽 탑: 미끄럼 빙판 + 정지 바위 여백
  if (id.includes('ice') || id === 'spire_n_2f') {
    const cands = open.filter(([x, y]) => x >= 5 && x <= W - 11 && y >= 6 && y <= H - 10 && !nearPt(x + 3, y + 2, 5));
    if (cands.length) {
      const [rx, ry] = cands[Math.floor(R() * cands.length)];
      for (let yy = ry - 1; yy <= ry + 5; yy++) for (let xx = rx - 1; xx <= rx + 6; xx++) wall[yy][xx] = false;
      gimmicks.push({ type: 'ice_tile', x: rx, y: ry + 4, w: 6, h: 5 });
    }
  }

  // 2) 스위치 + 잠긴 보물 금고 (승리의 길 · 땅속 통로 · 무쇠섬 · 동쪽 탑 · 바다 깊은 굴)
  if (['victory_2f', 'underground', 'iron_2f', 'spire_e_2f', 'sea_cave_deep'].includes(id)) {
    const swCands = open.filter(([x, y]) => hasClearSpot(x, y));
    let vault = null;
    for (let y = 5; y < H - 6 && !vault; y++) for (let x = 4; x < W - 6 && !vault; x++) {
      if (nearPt(x + 1, y + 1, 5)) continue;
      let allW = true;
      for (let yy = y - 1; yy <= y + 2 && allW; yy++) for (let xx = x - 1; xx <= x + 3; xx++) if (!wall[yy]?.[xx]) allW = false;
      if (allW && !wall[y + 3]?.[x + 1] && !nearPt(x + 1, y + 3, 4)) vault = [x, y];
    }
    if (vault && swCands.length) {
      const [vx, vy] = vault;
      for (let yy = vy; yy <= vy + 1; yy++) for (let xx = vx; xx <= vx + 2; xx++) wall[yy][xx] = false;
      wall[vy + 2][vx + 1] = false;
      gimmicks.push({ type: 'gate_bar', x: vx + 1, y: vy + 2, w: 1, h: 1, gateId: 'cv1', color: '#ff6470' });
      vaultChest = [vx + 1, vy];
      const farSw = [...swCands].sort((a, b) => Math.hypot(b[0] - vx, b[1] - vy) - Math.hypot(a[0] - vx, a[1] - vy));
      const [sx, sy] = farSw[Math.floor(R() * Math.min(8, farSw.length))];
      gimmicks.push({ type: 'switch_btn', x: sx, y: sy, w: 1, h: 1, gateId: 'cv1', color: '#ff6470' });
    }
  }

  // 3) 쌍방향 워프 패드 (헤매는 동굴 · 별마루산 · 서쪽 탑 · 별마루 미로)
  if (['wayward_2f', 'coronet_2f', 'spire_w_2f', 'star_maze'].includes(id)) {
    const clear = open.filter(([x, y]) => hasClearSpot(x, y));
    if (clear.length >= 6) {
      const p1 = clear[Math.floor(R() * Math.min(clear.length / 3, 12))];
      const far = clear.filter((p) => Math.hypot(p[0] - p1[0], p[1] - p1[1]) >= 12);
      if (far.length) {
        const p2 = far[Math.floor(R() * far.length)];
        gimmicks.push(
          { type: 'warp_pad', x: p1[0], y: p1[1], w: 1, h: 1, toX: p2[0], toY: p2[1], color: '#58d8ff' },
          { type: 'warp_pad', x: p2[0], y: p2[1], w: 1, h: 1, toX: p1[0], toY: p1[1], color: '#58d8ff' },
        );
      }
    }
  }

  // 4) 화살표 가속 패드 (화산 · 남쪽 탑 · 정상 동굴)
  if (['stark_2f', 'spire_s_2f', 'coronet_3f'].includes(id)) {
    const clear = open.filter(([x, y]) => y >= 8 && y <= H - 8 && !wall[y - 3]?.[x] && !wall[y - 2]?.[x] && !wall[y - 1]?.[x] && hasClearSpot(x, y));
    if (clear.length) {
      const [ax, ay] = clear[Math.floor(R() * clear.length)];
      gimmicks.push({ type: 'arrow_pad', x: ax, y: ay, w: 1, h: 1, dir: 'up', steps: 3 });
    }
  }

  return { gimmicks, vaultChest };
}

/**
 * @param id 맵 id (시드)
 * @param exits [{ to, type }] — 첫 번째는 아래쪽 입구, 나머지는 위쪽에 퍼뜨림
 * @returns { W, H, wall[y][x], points: [{ to, type, x, y, edge }], gimmicks, vaultChest }
 */
export function caveLayout(id, exits) {
  if (CHAMBERS.has(id)) return chamberLayout(id, exits);
  if (MAZES.has(id)) return mazeLayout(id, exits);
  const [W, H] = PICK_SIZE[id] ?? CAVE_SIZES[hashStr(id) % CAVE_SIZES.length];
  const R = rng(hashStr(id));
  let wall = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x < 2 || y < 3 || x >= W - 2 || y >= H - 2 ? true : R() < 0.45)));
  for (let it = 0; it < 5; it++) {
    wall = wall.map((row, y) => row.map((_, x) => {
      if (x < 2 || y < 3 || x >= W - 2 || y >= H - 2) return true;
      let n = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (wall[y + dy][x + dx]) n++;
      return n >= 5;
    }));
  }
  // 출입구 위치
  const pts = exits.map((e, i) => {
    if (i === 0) return { ...e, x: Math.floor(W / 2), y: H - 3, edge: e.type === 'mouthBack' || e.type === 'mouth' };
    const k = exits.length - 1, j = i - 1;
    const x = Math.round(6 + ((W - 12) * (k === 1 ? 0.5 : j / Math.max(1, k - 1))) + (R() - 0.5) * 4);
    const edge = e.type === 'mouth' || e.type === 'mouthBack';
    return { ...e, x: Math.max(4, Math.min(W - 5, x)), y: edge ? 4 : 5 + Math.floor(R() * 3), edge };
  });
  // 굴 파기: 입구 → 각 지점까지 비틀거리는 2칸 너비 길
  const carve = (x, y) => { for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) if (y + dy < H - 2 && y + dy >= 3 && x + dx >= 2 && x + dx < W - 2) wall[y + dy][x + dx] = false; };
  const start = pts[0];
  for (const p of pts.slice(1).concat(pts.length === 1 ? [{ x: Math.floor(W / 2) + 5, y: 7 }] : [])) {
    let x = start.x, y = start.y;
    for (let s = 0; s < 500 && (Math.abs(x - p.x) > 0 || Math.abs(y - p.y) > 0); s++) {
      carve(x, y);
      if (R() < 0.35) { x += R() < 0.5 ? 1 : -1; }
      else if (Math.abs(x - p.x) > Math.abs(y - p.y)) x += Math.sign(p.x - x);
      else y += Math.sign(p.y - y);
      x = Math.max(3, Math.min(W - 4, x)); y = Math.max(4, Math.min(H - 4, y));
    }
    carve(p.x, p.y);
  }
  // 넓은 방 몇 개
  for (let r = 0; r < 5; r++) { const cx = 6 + Math.floor(R() * (W - 12)), cy = 7 + Math.floor(R() * (H - 14)); for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 3; x++) wall[y][x] = false; }
  // 입구에서 닿지 않는 바닥은 메움
  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  const q = [[start.x, start.y]]; seen[start.y][start.x] = true;
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !wall[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = true; q.push([nx, ny]); } } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y][x]) wall[y][x] = true;
  // 가장자리 출입구: 벽을 뚫어 맵 끝까지 통로
  for (const p of pts) if (p.edge) { if (p.y > H / 2) { for (let y = p.y; y < H; y++) wall[y][p.x] = false; p.y = H - 1; } else { for (let y = 0; y <= p.y; y++) wall[y][p.x] = false; p.y = 0; } }
  const { gimmicks, vaultChest } = addCaveGimmicks(id, W, H, wall, pts, R);
  return { W, H, wall, points: pts, gimmicks, vaultChest };
}

/** 방 하나: 가운데 둥근 방 + 아래쪽 입구에서 올라오는 긴 수직 복도 (동굴/신전마다 크기 다름) */
function chamberLayout(id, exits) {
  const [W, H] = PICK_SIZE[id] ?? (id.endsWith('_top') ? [36, 34] : [32, 30]);
  const cx = Math.floor(W / 2), cy = Math.floor(H / 2) - 2;
  const rx = Math.max(9, Math.floor(W * 0.27)), ry = Math.max(6, Math.floor(H * 0.22));
  const wall = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; return dx * dx + dy * dy > 1; }));
  for (let y = cy; y <= H - 3; y++) for (let x = cx - 1; x <= cx; x++) wall[y][x] = false;
  const pts = exits.map((e, i) => ({ ...e, x: Math.floor(cx), y: i === 0 ? H - 3 : Math.max(5, cy - ry + 2), edge: false }));
  return { W, H, wall, points: pts, gimmicks: [], vaultChest: null };
}
/** 미로: 크기에 맞춰 동적 격자(2×2 통로)로 펼침. 가장 먼 막다른 방에 위층 계단 배치 */
function mazeLayout(id, exits) {
  const [W, H] = PICK_SIZE[id] ?? [44, 36];
  const R = rng(hashStr(id) ^ 0x5a17);
  const wall = Array.from({ length: H }, () => new Array(W).fill(true));
  const GW = Math.floor((W - 6) / 3), GH = Math.floor((H - 8) / 3), X0 = 3, Y0 = 4, STEP = 3;
  const open = (gx, gy) => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) wall[Y0 + gy * STEP + dy][X0 + gx * STEP + dx] = false; };
  const seen = Array.from({ length: GH }, () => new Array(GW).fill(false));
  const sx = Math.floor(GW / 2), sy = GH - 1;
  const stack = [[sx, sy]]; seen[sy][sx] = true; open(sx, sy);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, dx, dy]).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < GW && ny < GH && !seen[ny][nx]);
    if (!nb.length) { stack.pop(); continue; }
    const [nx, ny, dx, dy] = nb[Math.floor(R() * nb.length)];
    seen[ny][nx] = true; open(nx, ny);
    for (let k = 0; k < 2; k++) { const wx = X0 + x * STEP + (dx > 0 ? 2 : dx < 0 ? -1 : k), wy = Y0 + y * STEP + (dy > 0 ? 2 : dy < 0 ? -1 : k); wall[wy][wx] = false; }
    stack.push([nx, ny]);
  }
  // 가장 먼 막다른 칸에 넓은 방 (다음 층으로 가는 구멍 · 계단 자리)
  const dist = Array.from({ length: GH }, () => new Array(GW).fill(-1)); dist[sy][sx] = 0;
  const cellOpen = (ax, ay, bx, by) => !wall[Y0 + ay * STEP + (by > ay ? 2 : by < ay ? -1 : 0)][X0 + ax * STEP + (bx > ax ? 2 : bx < ax ? -1 : 0)];
  const q = [[sx, sy]]; let far = [sx, sy];
  while (q.length) { const [x, y] = q.shift(); if (dist[y][x] > dist[far[1]][far[0]]) far = [x, y];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || dist[ny][nx] >= 0 || !cellOpen(x, y, nx, ny)) continue; dist[ny][nx] = dist[y][x] + 1; q.push([nx, ny]); } }
  const fcx = Math.max(X0 + 1, Math.min(W - 6, X0 + far[0] * STEP)), fcy = Math.max(Y0 + 1, Math.min(H - 6, Y0 + far[1] * STEP));
  for (let y = Math.max(4, fcy - 2); y <= Math.min(H - 4, fcy + 2); y++) for (let x = Math.max(3, fcx - 2); x <= Math.min(W - 4, fcx + 2); x++) wall[y][x] = false;
  // 입구: 아래 가운데 칸에서 맵 아래쪽으로
  const ex = X0 + sx * STEP, ey = H - 3;
  for (let y = Y0 + sy * STEP; y <= ey; y++) { wall[y][ex] = false; wall[y][ex + 1] = false; }
  const pts = exits.map((e, i) => ({ ...e, x: i === 0 ? ex : i === 1 ? fcx : X0 + ((far[0] + i * 2) % GW) * STEP, y: i === 0 ? ey : i === 1 ? fcy : Y0, edge: false }));
  const { gimmicks, vaultChest } = addCaveGimmicks(id, W, H, wall, pts, R);
  return { W, H, wall, points: pts, gimmicks, vaultChest };
}
