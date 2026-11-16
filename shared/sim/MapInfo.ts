// Tiled JSON → 시뮬레이션용 정적 맵 정보 (서버/클라이언트 공용, Phaser 의존 없음)
import { CLIFF_ROW, Heights, computeHeights, isCliffRimCol } from './Heights';

export interface TiledProperty { name: string; type: string; value: string | number | boolean }
export interface TiledObject { id: number; name: string; type: string; x: number; y: number; width: number; height: number; properties?: TiledProperty[] }
export interface TiledLayer { name: string; type: 'tilelayer' | 'objectgroup'; width?: number; height?: number; data?: number[]; objects?: TiledObject[] }
export interface TiledMap { width: number; height: number; tilewidth: number; layers: TiledLayer[]; properties?: TiledProperty[] }

export const prop = <T = string | number>(o: { properties?: TiledProperty[] }, name: string, def?: T): T =>
  ((o.properties?.find((p) => p.name === name)?.value as T) ?? (def as T));

export interface WarpDef { x: number; y: number; w: number; h: number; to: string; spawn: string; ferry?: boolean }
export interface PlotDef { name: string; x: number; y: number; w: number; h: number; crop: string; stage: number; watered: boolean }

const PASSABLE_OBJECTS = new Set(['spawn', 'warp', 'farm_zone', 'tallgrass', 'tuft', 'glint', 'stairs_up', 'attic_stairs_up', 'attic_stairs_down', 'cave_hole', 'portal', 'light']);

export class MapInfo {
  readonly width: number;
  readonly height: number;
  readonly tile: number;
  readonly blocked: Uint8Array;     // 정적 충돌
  readonly terrain: string[];       // 행별 문자열: 0 잔디, 1 흙길, 2 물
  readonly objects: TiledObject[];
  readonly spawns: Map<string, { x: number; y: number }> = new Map();
  readonly spawnList: TiledObject[] = [];
  readonly plots: PlotDef[] = [];
  readonly farmZones: PlotDef[] = [];
  readonly warps: WarpDef[] = [];
  /** 2.5D: 아래로만 뛰어내리는 턱 · 계단 · 절벽 윗면 칸 (y * width + x) */
  readonly ledges = new Set<number>();
  readonly stairs = new Set<number>();
  readonly cliffRim = new Set<number>();
  readonly heights: Heights;
  readonly name: string;
  /** 맵 속성 (biome · battleBg · cave · title …) */
  readonly props: Record<string, string> = {};

  constructor(map: TiledMap) {
    this.width = map.width; this.height = map.height; this.tile = map.tilewidth;
    this.name = String(map.properties?.find((p) => p.name === 'name')?.value ?? 'farm');
    for (const pp of map.properties ?? []) if (pp.name !== 'terrain') this.props[pp.name] = String(pp.value);
    const col = map.layers.find((l) => l.name === 'Collision');
    this.blocked = new Uint8Array(this.width * this.height);
    col?.data?.forEach((g, i) => { if (g) this.blocked[i] = 1; });
    this.terrain = String(map.properties?.find((p) => p.name === 'terrain')?.value ?? '').split('|');
    this.objects = map.layers.find((l) => l.name === 'Objects')?.objects ?? [];
    for (const s of map.layers.find((l) => l.name === 'Spawns')?.objects ?? []) { this.spawnList.push(s); if (!this.spawns.has(s.name)) this.spawns.set(s.name, { x: s.x, y: s.y }); }
    for (const p of map.layers.find((l) => l.name === 'FarmPlots')?.objects ?? []) {
      const d: PlotDef = { name: p.name, x: p.x / this.tile, y: p.y / this.tile, w: p.width / this.tile, h: p.height / this.tile, crop: prop(p, 'crop', ''), stage: prop(p, 'stage', 0), watered: !!prop(p, 'watered', 0) };
      (d.crop === '*' ? this.farmZones : this.plots).push(d);
    }
    this.heights = computeHeights(map);
    const solidObj = new Uint8Array(this.width * this.height);
    for (const o of this.objects) {
      if (PASSABLE_OBJECTS.has(o.type)) continue;
      const cx = prop<number | undefined>(o, 'cellX', undefined), cy = prop<number | undefined>(o, 'cellY', undefined);
      if (cx == null || cy == null) continue;
      const cw = prop(o, 'cellW', 1), ch = prop(o, 'cellH', 1);
      for (let yy = cy - ch + 1; yy <= cy; yy++) for (let xx = cx; xx < cx + cw; xx++) {
        if (this.inBounds(xx, yy)) solidObj[yy * this.width + xx] = 1;
      }
    }
    const bridge = map.layers.find((l) => l.name === 'Bridge')?.data;
    const surface = this.props.surface?.split('|');
    // 타일셋 11번째 줄(0부터)이 절벽 줄: 3 = 계단, 4~6 = 턱, 나머지 벽·테두리는 2.5D에서 윗면 땅이므로 물·외곽·물건이 없으면 통행 허용
    map.layers.find((l) => l.name === 'Cliff')?.data?.forEach((g, i) => {
      if (!g) return;
      const row = Math.floor((g - 1) / 16), colIdx = (g - 1) % 16;
      if (row !== CLIFF_ROW) return;
      if (colIdx === 3) { this.stairs.add(i); return; }
      if (colIdx >= 4 && colIdx <= 6) { this.ledges.add(i); return; }
      if (!isCliffRimCol(colIdx)) return;
      this.cliffRim.add(i);
      const x = i % this.width, y = Math.floor(i / this.width);
      if (x > 0 && y > 0 && x < this.width - 1 && y < this.height - 1
        && (this.terrainAt(x, y) !== '2' || !!bridge?.[i])
        && surface?.[y]?.[x] !== 'x'
        && !solidObj[i]) {
        this.blocked[i] = 0;
      }
    });
    for (const w of map.layers.find((l) => l.name === 'Warps')?.objects ?? []) {
      this.warps.push({ x: w.x, y: w.y, w: w.width, h: w.height, to: prop(w, 'to', 'farm'), spawn: prop(w, 'spawn', 'player'), ferry: String(prop(w, 'ferry', '')) === '1' });
    }
  }
  isLedge(x: number, y: number) { return this.inBounds(x, y) && this.ledges.has(y * this.width + x); }
  isStairs(x: number, y: number) { return this.inBounds(x, y) && this.stairs.has(y * this.width + x); }
  isCliffRim(x: number, y: number) { return this.inBounds(x, y) && this.cliffRim.has(y * this.width + x); }
  canCrossEdge(ax: number, ay: number, bx: number, by: number) { return this.heights.canCrossEdge(ax, ay, bx, by); }
  spansCliffWall(x0: number, y0: number, x1: number, y1: number) { return this.heights.spansCliffWall(x0, y0, x1, y1); }
  inBounds(x: number, y: number) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  isBlocked(x: number, y: number) { return !this.inBounds(x, y) || this.blocked[y * this.width + x] === 1; }
  terrainAt(x: number, y: number) { return this.terrain[y]?.[x] ?? '0'; }
  /** 괭이질 가능한 칸: 농지 구역 안 + 막히지 않음 + 잔디/흙 */
  canStand(px: number, py: number, hw = 5, hh = 5) {
    const T = this.tile;
    const x0 = Math.floor((px - hw) / T), x1 = Math.floor((px + hw - 0.01) / T);
    const y0 = Math.floor((py - hh) / T), y1 = Math.floor((py - 0.01) / T);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) if (this.isBlocked(cx, cy)) return false;
    return !this.heights.spansCliffWall(x0, y0, x1, y1);
  }
  warpAt(px: number, py: number) { return this.warps.find((w) => px >= w.x && px < w.x + w.w && py >= w.y && py < w.y + w.h); }
  isTillable(x: number, y: number) {
    if (this.isBlocked(x, y) || this.isCliffRim(x, y) || this.terrainAt(x, y) === '2') return false;
    return this.farmZones.some((z) => x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h);
  }
}
