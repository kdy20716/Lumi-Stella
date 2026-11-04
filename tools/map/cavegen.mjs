// 동굴 층 레이아웃 (셀룰러 오토마타 + 연결 보장). 맵(충돌)과 아트(배경 그림)가 같은 결과를 쓰도록 결정적.
import { rng } from '../art/lib/img.mjs';

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
