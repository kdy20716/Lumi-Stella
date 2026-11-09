// 3D 지형: 2D 타일맵(Tiled JSON)을 그대로 읽어서 높이가 있는 지형으로 바꿈
//  - 절벽 줄(타일셋 11번째 줄)의 벽 · 계단 · 턱 타일을 보고 칸마다 높이를 계산
//  - 벽 칸은 위쪽 땅을 앞으로 늘려 덮고, 높이 차이가 나는 모서리에 세로 벽(절벽 면)을 세움
//  - 계단 칸은 위아래를 잇는 경사로 → 걸어서 오르내림
//  좌표: 1칸 = 1 단위. x = 타일 x, z = 타일 y, y = 높이 (위쪽 +)
import * as THREE from 'three';
import type { TiledMap } from '@shared/sim/MapInfo';

const CLIFF_ROW = 11;
const WALL = new Set([0, 1, 2, 7, 8, 9, 10, 11]);   // 절벽 앞면 · 밑동
const STAIRS = 3;
const LEDGE = new Set([4, 5, 6]);
const SIDE_L = 13, SIDE_R = 14, TOP = 15;

/** 칸 하나의 네 모서리 높이 (북서 · 북동 · 남서 · 남동) */
export interface CellShape { nw: number; ne: number; sw: number; se: number; kind: 'flat' | 'wall' | 'stairs' | 'ledge'; runTop?: number; runBot?: number; runRows?: number; uvY?: number }

export class Heights {
  readonly cells: CellShape[];
  constructor(readonly w: number, readonly h: number, cells: CellShape[]) { this.cells = cells; }
  at(x: number, y: number) { return this.cells[Math.max(0, Math.min(this.h - 1, y)) * this.w + Math.max(0, Math.min(this.w - 1, x))]; }
  /** 월드 좌표(칸 단위)에서 지면 높이 (경사로는 보간) */
  sample(wx: number, wz: number) {
    const x = Math.floor(wx), z = Math.floor(wz);
    const c = this.at(x, z), fx = wx - x, fz = wz - z;
    const n = c.nw + (c.ne - c.nw) * fx, s = c.sw + (c.se - c.sw) * fx;
    return n + (s - n) * fz;
  }
}

/** 절벽 타일 → 칸별 높이 */
export function computeHeights(map: TiledMap, spawn?: { x: number; y: number }): Heights {
  const W = map.width, H = map.height;
  const cliff = map.layers.find((l) => l.name === 'Cliff')?.data ?? [];
  const kindAt = (x: number, y: number): number => {
    const g = cliff[y * W + x]; if (!g) return -1;
    const row = Math.floor((g - 1) / 16), col = (g - 1) % 16;
    return row === CLIFF_ROW ? col : -1;
  };
  const isTrans = (x: number, y: number) => { const k = kindAt(x, y); return WALL.has(k) || k === STAIRS || LEDGE.has(k); };

  // 1) 벽이 아닌 칸끼리 이어진 덩어리(같은 높이의 땅)
  const comp = new Int32Array(W * H).fill(-1);
  let nComp = 0;
  const blocks = (x: number, y: number, dx: number, dy: number) => {
    const k = kindAt(x, y), k2 = kindAt(x + dx, y + dy);
    // 옆면 · 윗변 타일: 그 바깥쪽은 아래 땅 (이어지지 않음)
    if ((k === SIDE_L && dx < 0) || (k === SIDE_R && dx > 0) || (k === TOP && dy < 0)) return true;
    if ((k2 === SIDE_L && dx > 0) || (k2 === SIDE_R && dx < 0) || (k2 === TOP && dy > 0)) return true;
    // 옆면 타일의 위쪽 끝(모서리): 바로 위가 같은 옆면이 아니면 바깥 땅
    const side = (a: number) => a === SIDE_L || a === SIDE_R;
    if (side(k) && dy < 0 && !(side(k2) || k2 === TOP)) return true;
    if (side(k2) && dy > 0 && !(side(k) || k === TOP)) return true;
    return false;
  };
  for (let y0 = 0; y0 < H; y0++) for (let x0 = 0; x0 < W; x0++) {
    if (comp[y0 * W + x0] >= 0 || isTrans(x0, y0)) continue;
    const id = nComp++, q = [[x0, y0]];
    comp[y0 * W + x0] = id;
    while (q.length) {
      const [x, y] = q.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || comp[ny * W + nx] >= 0 || isTrans(nx, ny) || blocks(x, y, dx, dy)) continue;
        comp[ny * W + nx] = id; q.push([nx, ny]);
      }
    }
  }

  // 2) 세로로 이어진 벽 줄: 위(북) 덩어리가 아래(남)보다 벽 길이만큼 높음
  interface Run { x: number; y0: number; y1: number; delta: number; north: number; south: number }
  const runs: Run[] = [];
  const edges: { a: number; b: number; d: number }[] = [];   // h[a] = h[b] + d
  for (let x = 0; x < W; x++) {
    let y = 0;
    while (y < H) {
      if (!isTrans(x, y)) { y++; continue; }
      const y0 = y; let delta = 0;
      while (y < H && isTrans(x, y)) { delta += LEDGE.has(kindAt(x, y)) ? 0.5 : 1; y++; }
      const y1 = y - 1;
      const north = y0 > 0 ? comp[(y0 - 1) * W + x] : -1, south = y1 < H - 1 ? comp[(y1 + 1) * W + x] : -1;
      runs.push({ x, y0, y1, delta, north, south });
      if (north >= 0 && south >= 0 && north !== south) edges.push({ a: north, b: south, d: delta });
    }
  }

  // 3) 덩어리 높이 풀기: 시작 위치 덩어리 = 0
  const hComp = new Float32Array(nComp).fill(NaN);
  const start = spawn ? comp[Math.floor(spawn.y) * W + Math.floor(spawn.x)] : -1;
  const solveFrom = (c: number) => {
    hComp[c] = 0;
    const q = [c];
    while (q.length) {
      const cur = q.shift()!;
      for (const e of edges) {
        if (e.b === cur && Number.isNaN(hComp[e.a])) { hComp[e.a] = hComp[cur] + e.d; q.push(e.a); }
        else if (e.a === cur && Number.isNaN(hComp[e.b])) { hComp[e.b] = hComp[cur] - e.d; q.push(e.b); }
      }
    }
  };
  if (start >= 0) solveFrom(start);
  for (let c = 0; c < nComp; c++) if (Number.isNaN(hComp[c])) solveFrom(c);
  // 가장 낮은 땅이 0 이 되게
  let min = Infinity; for (const v of hComp) min = Math.min(min, v);
  if (!Number.isFinite(min)) min = 0;
  for (let c = 0; c < nComp; c++) hComp[c] -= min;

  // 4) 칸 모양
  const cells: CellShape[] = new Array(W * H);
  for (let i = 0; i < W * H; i++) { const c = comp[i], v = c >= 0 ? hComp[c] : 0; cells[i] = { nw: v, ne: v, sw: v, se: v, kind: 'flat' }; }
  for (const r of runs) {
    const bot = r.south >= 0 ? hComp[r.south] : r.north >= 0 ? hComp[r.north] - r.delta : 0;
    const top = r.north >= 0 ? hComp[r.north] : bot + r.delta;
    const n = r.y1 - r.y0 + 1;
    for (let y = r.y0; y <= r.y1; y++) {
      const k = kindAt(r.x, y), c = cells[y * W + r.x];
      c.runTop = top; c.runBot = bot; c.runRows = n; c.uvY = r.y0 - 1;
      if (k === STAIRS) {
        // 계단: 위에서 아래로 내려가는 경사로
        const a = top - ((y - r.y0) / n) * (top - bot), b = top - ((y - r.y0 + 1) / n) * (top - bot);
        Object.assign(c, { nw: a, ne: a, sw: b, se: b, kind: 'stairs' });
      } else {
        // 벽 · 턱: 위쪽 땅을 그대로 늘려 덮음 (세로 면은 아래에서 따로 세움)
        Object.assign(c, { nw: top, ne: top, sw: top, se: top, kind: LEDGE.has(k) ? 'ledge' : 'wall' });
      }
    }
  }
  return new Heights(W, H, cells);
}

/** 지형 메시: 윗면(바닥 그림) + 높이 차이 모서리의 세로 면 */
export function buildTerrainMesh(hts: Heights, groundTex: THREE.Texture, faceTex: THREE.Texture, faceUV: [number, number, number, number]) {
  const W = hts.w, H = hts.h;
  const top = { pos: [] as number[], uv: [] as number[], col: [] as number[] };
  const art = { pos: [] as number[], uv: [] as number[], col: [] as number[] };   // 바닥 그림의 절벽 부분을 세로 면에
  const gen = { pos: [] as number[], uv: [] as number[], col: [] as number[] };   // 일반 절벽 무늬
  const quad = (b: typeof top, p: number[][], uv: number[][], shade: number) => {
    // p: 4 꼭짓점 (반시계) → 삼각형 2개
    for (const i of [0, 1, 2, 0, 2, 3]) { b.pos.push(...p[i]); b.uv.push(...uv[i]); b.col.push(shade, shade, shade); }
  };
  const u = (x: number) => x / W, v = (y: number) => 1 - y / H;   // 바닥 캔버스 UV (flipY)

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = hts.at(x, y);
    // 윗면: 벽 칸은 위쪽 땅 그림을 빌려 씀
    const sy = c.kind === 'wall' || c.kind === 'ledge' ? Math.max(0, c.uvY ?? y) : y;
    quad(top, [[x, c.nw, y], [x, c.sw, y + 1], [x + 1, c.se, y + 1], [x + 1, c.ne, y]],
      [[u(x), v(sy)], [u(x), v(sy + 1)], [u(x + 1), v(sy + 1)], [u(x + 1), v(sy)]], c.kind === 'stairs' ? 0.96 : 1);
  }

  // 세로 면: 칸의 각 변에서 이웃보다 높으면 그 차이만큼 벽을 세움
  const EPS = 0.01;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = hts.at(x, y);
    const sides: { nb: CellShape | null; a: [number, number]; b: [number, number]; ha: number; hb: number; na: number; nbh: number; dir: 's' | 'n' | 'e' | 'w' }[] = [];
    const S = y < H - 1 ? hts.at(x, y + 1) : null, N = y > 0 ? hts.at(x, y - 1) : null;
    const E = x < W - 1 ? hts.at(x + 1, y) : null, Wn = x > 0 ? hts.at(x - 1, y) : null;
    if (S) sides.push({ nb: S, a: [x + 1, y + 1], b: [x, y + 1], ha: c.se, hb: c.sw, na: S.ne, nbh: S.nw, dir: 's' });
    if (N) sides.push({ nb: N, a: [x, y], b: [x + 1, y], ha: c.nw, hb: c.ne, na: N.sw, nbh: N.se, dir: 'n' });
    if (E) sides.push({ nb: E, a: [x + 1, y], b: [x + 1, y + 1], ha: c.ne, hb: c.se, na: E.nw, nbh: E.sw, dir: 'e' });
    if (Wn) sides.push({ nb: Wn, a: [x, y + 1], b: [x, y], ha: c.sw, hb: c.nw, na: Wn.se, nbh: Wn.ne, dir: 'w' });
    for (const s of sides) {
      if (s.ha <= s.na + EPS && s.hb <= s.nbh + EPS) continue;
      const lo1 = Math.min(s.na, s.ha), lo2 = Math.min(s.nbh, s.hb);
      const p = [[s.a[0], s.ha, s.a[1]], [s.a[0], lo1, s.a[1]], [s.b[0], lo2, s.b[1]], [s.b[0], s.hb, s.b[1]]];
      const shade = s.dir === 's' ? 0.92 : s.dir === 'n' ? 0.55 : 0.72;
      // 남쪽(카메라 쪽) 면이고 원래 2D 절벽 그림이 있는 칸이면 그 그림을 그대로 붙임
      if (s.dir === 's' && (c.kind === 'wall' || c.kind === 'ledge') && c.runTop != null && c.runBot != null) {
        const span = c.runTop - c.runBot || 1, y0 = (c.uvY ?? y) + 1, rows = c.runRows ?? 1;
        const vy = (hh: number) => v(y0 + ((c.runTop! - hh) / span) * rows);
        quad(art, p, [[u(s.a[0]), vy(s.ha)], [u(s.a[0]), vy(lo1)], [u(s.b[0]), vy(lo2)], [u(s.b[0]), vy(s.hb)]], shade);
      } else {
        const [u0, v0, u1, v1] = faceUV;   // 절벽 면 타일 하나를 면 전체에
        quad(gen, p, [[u0, v0], [u0, v1], [u1, v1], [u1, v0]], shade * 0.9);
      }
    }
  }

  const make = (b: typeof top, tex: THREE.Texture) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }));
  };
  const group = new THREE.Group();
  group.add(make(top, groundTex), make(art, groundTex), make(gen, faceTex));
  return group;
}
