// 동굴 층 레이아웃 (셀룰러 오토마타 + 연결 보장). 맵(충돌)과 아트(배경 그림)가 같은 결과를 쓰도록 결정적.
import { rng } from '../art/lib/img.mjs';
import { CHAMBERS, MAZES } from './region-spec.mjs';

export const CAVE_W = 40, CAVE_H = 30;
const hashStr = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/** 동굴 노드의 출구 순서 (입구/아래층 계단이 먼저) — 맵과 아트가 같은 순서를 써야 함 */
export const caveExits = (node) => [...node.links].sort((x, y) => (x.type === 'mouthBack' || x.type === 'stairsDown' ? -1 : 0) - (y.type === 'mouthBack' || y.type === 'stairsDown' ? -1 : 0));

/**
 * @param id 맵 id (시드)
 * @param exits [{ to, type }] — 첫 번째는 아래쪽 입구, 나머지는 위쪽에 퍼뜨림
 * @returns { W, H, wall[y][x], points: [{ to, type, x, y, edge }] }  edge=true 면 맵 가장자리 출입구(워프), 아니면 계단(맵 안)
 */
export function caveLayout(id, exits) {
  if (CHAMBERS.has(id)) return chamberLayout(id, exits);
  if (MAZES.has(id)) return mazeLayout(id, exits);
  const W = CAVE_W, H = CAVE_H, R = rng(hashStr(id));
  let wall = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x < 2 || y < 3 || x >= W - 2 || y >= H - 2 ? true : R() < 0.46)));
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
  for (const p of pts.slice(1).concat(pts.length === 1 ? [{ x: Math.floor(W / 2) + 6, y: 8 }] : [])) {
    let x = start.x, y = start.y;
    for (let s = 0; s < 400 && (Math.abs(x - p.x) > 0 || Math.abs(y - p.y) > 0); s++) {
      carve(x, y);
      if (R() < 0.35) { x += R() < 0.5 ? 1 : -1; }
      else if (Math.abs(x - p.x) > Math.abs(y - p.y)) x += Math.sign(p.x - x);
      else y += Math.sign(p.y - y);
      x = Math.max(3, Math.min(W - 4, x)); y = Math.max(4, Math.min(H - 4, y));
    }
    carve(p.x, p.y);
  }
  // 넓은 방 몇 개
  for (let r = 0; r < 4; r++) { const cx = 6 + Math.floor(R() * (W - 12)), cy = 7 + Math.floor(R() * (H - 14)); for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 3; x <= cx + 3; x++) wall[y][x] = false; }
  // 입구에서 닿지 않는 바닥은 메움
  const seen = Array.from({ length: H }, () => new Array(W).fill(false));
  const q = [[start.x, start.y]]; seen[start.y][start.x] = true;
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !wall[ny][nx] && !seen[ny][nx]) { seen[ny][nx] = true; q.push([nx, ny]); } } }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!seen[y][x]) wall[y][x] = true;
  // 가장자리 출입구: 벽을 뚫어 맵 끝까지 통로
  for (const p of pts) if (p.edge) { if (p.y > H / 2) { for (let y = p.y; y < H; y++) wall[y][p.x] = false; p.y = H - 1; } else { for (let y = 0; y <= p.y; y++) wall[y][p.x] = false; p.y = 0; } }
  return { W, H, wall, points: pts };
}

/** 방 하나: 가운데 둥근 방 + 아래쪽 입구에서 올라오는 복도 */
function chamberLayout(id, exits) {
  const W = CAVE_W, H = CAVE_H, cx = W / 2, cy = 13;
  const wall = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => { const dx = (x + 0.5 - cx) / 10.5, dy = (y + 0.5 - cy) / 6.5; return dx * dx + dy * dy > 1; }));
  for (let y = cy; y <= H - 3; y++) for (let x = cx - 1; x <= cx; x++) wall[y][x] = false;
  const pts = exits.map((e, i) => ({ ...e, x: Math.floor(cx), y: i === 0 ? H - 3 : 8, edge: false }));
  return { W, H, wall, points: pts };
}
/** 미로: 격자 미로(되돌아가기 방식)를 2칸 너비 길로 펼침. 입구는 아래 가운데, 막다른 길이 많음 */
function mazeLayout(id, exits) {
  const W = CAVE_W, H = CAVE_H, R = rng(hashStr(id) ^ 0x5a17);
  const wall = Array.from({ length: H }, () => new Array(W).fill(true));
  const GW = 12, GH = 8, X0 = 3, Y0 = 4, STEP = 3;   // 칸 하나 = 2×2 바닥 + 1칸 벽
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
  { const rx = Math.max(X0, Math.min(W - 9, X0 + far[0] * STEP - 2)), ry = Math.max(Y0, Math.min(H - 10, Y0 + far[1] * STEP - 2)); for (let y = ry; y < ry + 6; y++) for (let x = rx; x < rx + 6; x++) wall[y][x] = false; }
  // 입구: 아래 가운데 칸에서 맵 아래쪽으로
  const ex = X0 + sx * STEP, ey = H - 3;
  for (let y = Y0 + sy * STEP; y <= ey; y++) { wall[y][ex] = false; wall[y][ex + 1] = false; }
  const pts = exits.map((e, i) => ({ ...e, x: i === 0 ? ex : X0 + (i % GW) * STEP, y: i === 0 ? ey : Y0, edge: false }));
  return { W, H, wall, points: pts };
}
