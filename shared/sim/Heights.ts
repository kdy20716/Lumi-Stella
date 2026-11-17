// 2.5D 지형 높이 계산 · 절벽 경계 판정 (서버/클라이언트 공용, Three.js 의존 없음)
import type { TiledMap } from './MapInfo';

export const CLIFF_ROW = 11;
export const CLIFF_WALL = new Set([0, 1, 2, 7, 8, 9, 10, 11]); // 절벽 앞면 · 밑동
export const CLIFF_STAIRS = 3;
export const CLIFF_LEDGE = new Set([4, 5, 6]);
export const CLIFF_SIDE_L = 13;
export const CLIFF_SIDE_R = 14;
export const CLIFF_TOP = 15;
export const CLIFF_RIM = new Set([...CLIFF_WALL, CLIFF_SIDE_L, CLIFF_SIDE_R, CLIFF_TOP]);
const HEIGHT_EPS = 0.01;

/** 타일셋 절벽 줄(11번째 줄) 칸 종류 반환 (-1 이면 절벽 타일 아님) */
export function cliffColAt(cliff: number[] | undefined, width: number, x: number, y: number): number {
  const g = cliff?.[y * width + x];
  if (!g) return -1;
  return Math.floor((g - 1) / 16) === CLIFF_ROW ? (g - 1) % 16 : -1;
}

export function isCliffRimCol(col: number): boolean {
  return CLIFF_RIM.has(col);
}

/** 칸 하나의 네 모서리 높이 (북서 · 북동 · 남서 · 남동) */
export interface CellShape {
  nw: number;
  ne: number;
  sw: number;
  se: number;
  kind: 'flat' | 'wall' | 'stairs' | 'ledge';
  runTop?: number;
  runBot?: number;
  runRows?: number;
  uvY?: number;
  openUnder?: boolean;
}

export interface ElevRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  h: number;
  openUnder?: boolean;
}

export interface RampRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** 올라가는 방향 ('N'=남→북, 'S'=북→남, 'E'=서→동, 'W'=동→서) */
  dir: 'N' | 'S' | 'E' | 'W';
  h0: number;
  h1: number;
  openUnder?: boolean;
}

export class Heights {
  readonly cells: CellShape[];
  constructor(readonly w: number, readonly h: number, cells: CellShape[]) { this.cells = cells; }

  at(x: number, y: number) {
    return this.cells[Math.max(0, Math.min(this.h - 1, y)) * this.w + Math.max(0, Math.min(this.w - 1, x))];
  }

  /** 칸 중심 평균 높이 */
  cellHeight(cx: number, cy: number): number {
    const c = this.at(cx, cy);
    return (c.nw + c.ne + c.sw + c.se) * 0.25;
  }

  /** 월드 좌표(칸 단위)에서 지면 높이 (경사로는 보간) */
  sample(wx: number, wz: number) {
    const x = Math.floor(wx), z = Math.floor(wz);
    const c = this.at(x, z), fx = wx - x, fz = wz - z;
    const n = c.nw + (c.ne - c.nw) * fx, s = c.sw + (c.se - c.sw) * fx;
    return n + (s - n) * fz;
  }

  /** 상하좌우로 맞닿은 두 칸 사이를 3D 높이 벽 없이 건널 수 있는지 */
  canCrossEdge(ax: number, ay: number, bx: number, by: number): boolean {
    if (ax < 0 || ay < 0 || bx < 0 || by < 0 || ax >= this.w || ay >= this.h || bx >= this.w || by >= this.h) return false;
    const a = this.cells[ay * this.w + ax], b = this.cells[by * this.w + bx];
    if (bx === ax + 1 && by === ay) return Math.abs(a.ne - b.nw) <= HEIGHT_EPS && Math.abs(a.se - b.sw) <= HEIGHT_EPS;
    if (bx === ax - 1 && by === ay) return Math.abs(a.nw - b.ne) <= HEIGHT_EPS && Math.abs(a.sw - b.se) <= HEIGHT_EPS;
    if (by === ay + 1 && bx === ax) return Math.abs(a.sw - b.nw) <= HEIGHT_EPS && Math.abs(a.se - b.ne) <= HEIGHT_EPS;
    if (by === ay - 1 && bx === ax) return Math.abs(a.nw - b.sw) <= HEIGHT_EPS && Math.abs(a.ne - b.se) <= HEIGHT_EPS;
    return false;
  }

  /** 셀 사각형 [x0..x1] × [y0..y1] 내부에 3D 절벽 벽(높이 단차)이 끼어 있는지 */
  spansCliffWall(x0: number, y0: number, x1: number, y1: number): boolean {
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx < x1; cx++) if (!this.canCrossEdge(cx, cy, cx + 1, cy)) return true;
    }
    for (let cy = y0; cy < y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) if (!this.canCrossEdge(cx, cy, cx, cy + 1)) return true;
    }
    return false;
  }
}

/** 절벽 타일 → 칸별 높이 */
export function computeHeights(map: TiledMap, spawn?: { x: number; y: number }): Heights {
  const W = map.width, H = map.height;
  const cliff = map.layers.find((l) => l.name === 'Cliff')?.data ?? [];
  const kindAt = (x: number, y: number): number => cliffColAt(cliff, W, x, y);
  const isTrans = (x: number, y: number) => {
    const k = kindAt(x, y);
    return CLIFF_WALL.has(k) || k === CLIFF_STAIRS || CLIFF_LEDGE.has(k);
  };

  // 1) 벽이 아닌 칸끼리 이어진 덩어리(같은 높이의 땅)
  const comp = new Int32Array(W * H).fill(-1);
  let nComp = 0;
  const blocks = (x: number, y: number, dx: number, dy: number) => {
    const k = kindAt(x, y), k2 = kindAt(x + dx, y + dy);
    // 옆면 · 윗변 타일: 그 바깥쪽은 아래 땅 (이어지지 않음)
    if ((k === CLIFF_SIDE_L && dx < 0) || (k === CLIFF_SIDE_R && dx > 0) || (k === CLIFF_TOP && dy < 0)) return true;
    if ((k2 === CLIFF_SIDE_L && dx > 0) || (k2 === CLIFF_SIDE_R && dx < 0) || (k2 === CLIFF_TOP && dy > 0)) return true;
    // 옆면 타일의 위쪽 끝(모서리): 바로 위가 같은 옆면이 아니면 바깥 땅
    const side = (a: number) => a === CLIFF_SIDE_L || a === CLIFF_SIDE_R;
    if (side(k) && dy < 0 && !(side(k2) || k2 === CLIFF_TOP)) return true;
    if (side(k2) && dy > 0 && !(side(k) || k === CLIFF_TOP)) return true;
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
      while (y < H && isTrans(x, y)) { delta += CLIFF_LEDGE.has(kindAt(x, y)) ? 0.5 : 1; y++; }
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
      if (k === CLIFF_STAIRS) {
        // 계단: 위에서 아래로 내려가는 경사로
        const a = top - ((y - r.y0) / n) * (top - bot), b = top - ((y - r.y0 + 1) / n) * (top - bot);
        Object.assign(c, { nw: a, ne: a, sw: b, se: b, kind: 'stairs' });
      } else {
        // 벽 · 턱: 위쪽 땅을 그대로 늘려 덮음 (세로 면은 아래에서 따로 세움)
        Object.assign(c, { nw: top, ne: top, sw: top, se: top, kind: CLIFF_LEDGE.has(k) ? 'ledge' : 'wall' });
      }
    }
  }
  const parseList = <T,>(name: string): T[] => {
    const raw = map.properties?.find((p) => p.name === name)?.value;
    if (Array.isArray(raw)) return raw as T[];
    if (typeof raw === 'string' && raw.trim()) {
      try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return [];
  };
  for (const e of parseList<ElevRect>('elevs')) {
    const x0 = Math.max(0, Math.floor(e.x0)), y0 = Math.max(0, Math.floor(e.y0));
    const x1 = Math.min(W - 1, Math.floor(e.x1)), y1 = Math.min(H - 1, Math.floor(e.y1));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      Object.assign(cells[y * W + x], { nw: e.h, ne: e.h, sw: e.h, se: e.h, kind: 'flat' as const, openUnder: !!e.openUnder });
    }
  }
  for (const r of parseList<RampRect>('ramps')) {
    const rx0 = Math.floor(r.x0), ry0 = Math.floor(r.y0), rx1 = Math.floor(r.x1), ry1 = Math.floor(r.y1);
    const spanY = Math.max(1, ry1 - ry0 + 1), spanX = Math.max(1, rx1 - rx0 + 1);
    const x0 = Math.max(0, rx0), y0 = Math.max(0, ry0), x1 = Math.min(W - 1, rx1), y1 = Math.min(H - 1, ry1);
    const lerp = (t: number) => r.h0 + (r.h1 - r.h0) * t;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      let nw = r.h0, ne = r.h0, sw = r.h0, se = r.h0;
      if (r.dir === 'N') { nw = ne = lerp((ry1 + 1 - y) / spanY); sw = se = lerp((ry1 - y) / spanY); }
      else if (r.dir === 'S') { nw = ne = lerp((y - ry0) / spanY); sw = se = lerp((y + 1 - ry0) / spanY); }
      else if (r.dir === 'E') { nw = sw = lerp((x - rx0) / spanX); ne = se = lerp((x + 1 - rx0) / spanX); }
      else { ne = se = lerp((rx1 - x) / spanX); nw = sw = lerp((rx1 + 1 - x) / spanX); }
      Object.assign(cells[y * W + x], { nw, ne, sw, se, kind: 'flat' as const, openUnder: !!r.openUnder });
    }
  }
  return new Heights(W, H, cells);
}
