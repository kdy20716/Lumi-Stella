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

const PASSABLE_OBJECTS = new Set(['spawn', 'warp', 'farm_zone', 'tallgrass', 'tuft', 'glint', 'stairs_up', 'attic_stairs_up', 'attic_stairs_down', 'cave_hole', 'portal', 'light', 'ice_tile', 'arrow_pad', 'warp_pad', 'switch_btn', 'gatehouse', 'cycle_gate', 'pair_card', 'rail_switch', 'quiz_pad', 'prism', 'rune_pad', 'rune_demo', 'snow_reset']);

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
  readonly cycleZones: { x: number; y: number; w: number; h: number }[] = [];
  readonly warps: WarpDef[] = [];
  /** 2.5D: 아래로만 뛰어내리는 턱 · 계단 · 절벽 윗면 칸 (y * width + x) */
  readonly ledges = new Set<number>();
  readonly stairs = new Set<number>();
  readonly cliffRim = new Set<number>();
  readonly iceCells = new Set<number>();
  readonly arrowPads = new Map<number, { id: number; dir: 'up' | 'down' | 'left' | 'right'; altDir?: 'up' | 'down' | 'left' | 'right'; railGroup?: string; steps: number }>();
  readonly warpPads = new Map<number, { id: number; toX: number; toY: number; color: string }>();
  readonly switchBtns = new Map<number, { id: number; gateId: string; color: string }>();
  readonly snowballs = new Map<number, { id: number }>();
  readonly snowResets = new Map<number, { id: number; color: string }>();
  readonly pairCards = new Map<number, { id: number; gateId: string; pairKey: string; color: string }>();
  readonly railSwitches = new Map<number, { id: number; railGroup: string; gateId: string; color: string }>();
  readonly quizPads = new Map<number, { id: number; gateId: string; num: number; correct: boolean; q: string; color: string }>();
  readonly prisms = new Map<number, { id: number; gateId: string; rot: number; color: string }>();
  readonly laserSources: { id: number; x: number; y: number; dir: 'up' | 'down' | 'left' | 'right'; gateId: string; color: string }[] = [];
  readonly laserTargets = new Map<number, { id: number; gateId: string; color: string }>();
  readonly runePads = new Map<number, { id: number; gateId: string; runeIdx: number; seq: number[]; color: string }>();
  readonly runeDemos = new Map<number, { id: number; gateId: string; seq: number[]; color: string }>();
  readonly heights: Heights;
  readonly name: string;
  /** 맵 속성 (biome · battleBg · cave · title …) */
  readonly props: Record<string, string> = {};

  constructor(map: TiledMap) {
    this.width = map.width; this.height = map.height; this.tile = map.tilewidth;
    this.name = String(map.properties?.find((p) => p.name === 'name')?.value ?? 'farm');
    const czRaw = map.properties?.find((p) => p.name === 'cycleZones')?.value;
    if (typeof czRaw === 'string' && czRaw.trim()) {
      try { const cz = JSON.parse(czRaw); if (Array.isArray(cz)) this.cycleZones.push(...cz); } catch { /* ignore */ }
    } else if (Array.isArray(czRaw)) {
      this.cycleZones.push(...(czRaw as { x: number; y: number; w: number; h: number }[]));
    }
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
      const cx = prop<number | undefined>(o, 'cellX', undefined), cy = prop<number | undefined>(o, 'cellY', undefined);
      if (cx == null || cy == null) continue;
      const cw = prop(o, 'cellW', 1), ch = prop(o, 'cellH', 1);
      if (o.type === 'ice_tile' || o.type === 'arrow_pad' || o.type === 'warp_pad' || o.type === 'switch_btn'
        || o.type === 'snowball' || o.type === 'snow_reset' || o.type === 'pair_card' || o.type === 'rail_switch'
        || o.type === 'quiz_pad' || o.type === 'prism' || o.type === 'laser_src' || o.type === 'laser_dst'
        || o.type === 'rune_pad' || o.type === 'rune_demo') {
        for (let yy = cy - ch + 1; yy <= cy; yy++) for (let xx = cx; xx < cx + cw; xx++) {
          if (!this.inBounds(xx, yy)) continue;
          const idx = yy * this.width + xx;
          if (o.type === 'ice_tile') this.iceCells.add(idx);
          else if (o.type === 'arrow_pad') {
            const alt = prop(o, 'altDir', '') as string;
            const rg = prop(o, 'railGroup', '') as string;
            this.arrowPads.set(idx, {
              id: o.id, dir: prop(o, 'dir', 'up') as 'up' | 'down' | 'left' | 'right',
              altDir: alt ? (alt as 'up' | 'down' | 'left' | 'right') : undefined,
              railGroup: rg || undefined,
              steps: Number(prop(o, 'steps', 3)) || 3,
            });
          } else if (o.type === 'warp_pad') this.warpPads.set(idx, { id: o.id, toX: Number(prop(o, 'toX', xx)), toY: Number(prop(o, 'toY', yy)), color: String(prop(o, 'color', '#48c8ff')) });
          else if (o.type === 'switch_btn') this.switchBtns.set(idx, { id: o.id, gateId: String(prop(o, 'gateId', 'g1')), color: String(prop(o, 'color', '#ff6470')) });
          else if (o.type === 'snowball') this.snowballs.set(idx, { id: o.id });
          else if (o.type === 'snow_reset') this.snowResets.set(idx, { id: o.id, color: String(prop(o, 'color', '#58d8ff')) });
          else if (o.type === 'pair_card') this.pairCards.set(idx, { id: o.id, gateId: String(prop(o, 'gateId', 'g1')), pairKey: String(prop(o, 'pairKey', 'a')), color: String(prop(o, 'color', '#ff88b8')) });
          else if (o.type === 'rail_switch') this.railSwitches.set(idx, { id: o.id, railGroup: String(prop(o, 'railGroup', 'rg1')), gateId: String(prop(o, 'gateId', '')), color: String(prop(o, 'color', '#ffaa33')) });
          else if (o.type === 'quiz_pad') this.quizPads.set(idx, { id: o.id, gateId: String(prop(o, 'gateId', 'q1')), num: Number(prop(o, 'num', 1)), correct: !!prop(o, 'correct', false), q: String(prop(o, 'q', '')), color: String(prop(o, 'color', '#ff8a48')) });
          else if (o.type === 'prism') this.prisms.set(idx, { id: o.id, gateId: String(prop(o, 'gateId', 'lm1')), rot: Number(prop(o, 'rot', 0)) % 4, color: String(prop(o, 'color', '#48f0ff')) });
          else if (o.type === 'laser_src') this.laserSources.push({ id: o.id, x: xx, y: yy, dir: prop(o, 'dir', 'right') as 'up' | 'down' | 'left' | 'right', gateId: String(prop(o, 'gateId', 'lm1')), color: String(prop(o, 'color', '#48f0ff')) });
          else if (o.type === 'laser_dst') this.laserTargets.set(idx, { id: o.id, gateId: String(prop(o, 'gateId', 'lm1')), color: String(prop(o, 'color', '#48f0ff')) });
          else if (o.type === 'rune_pad') {
            const seq = String(prop(o, 'seq', '0,1,2,3')).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
            this.runePads.set(idx, { id: o.id, gateId: String(prop(o, 'gateId', 'sm_rune')), runeIdx: Number(prop(o, 'runeIdx', 0)), seq, color: String(prop(o, 'color', '#b874ff')) });
          } else if (o.type === 'rune_demo') {
            const seq = String(prop(o, 'seq', '0,1,2,3')).split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
            this.runeDemos.set(idx, { id: o.id, gateId: String(prop(o, 'gateId', 'sm_rune')), seq, color: String(prop(o, 'color', '#ffe478')) });
          }
        }
      }
      if (PASSABLE_OBJECTS.has(o.type)) continue;
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
  isIce(x: number, y: number) { return this.inBounds(x, y) && this.iceCells.has(y * this.width + x); }
  arrowAt(x: number, y: number) { return this.inBounds(x, y) ? this.arrowPads.get(y * this.width + x) : undefined; }
  warpPadAt(x: number, y: number) { return this.inBounds(x, y) ? this.warpPads.get(y * this.width + x) : undefined; }
  switchAt(x: number, y: number) { return this.inBounds(x, y) ? this.switchBtns.get(y * this.width + x) : undefined; }
  snowballAt(x: number, y: number) { return this.inBounds(x, y) ? this.snowballs.get(y * this.width + x) : undefined; }
  snowResetAt(x: number, y: number) { return this.inBounds(x, y) ? this.snowResets.get(y * this.width + x) : undefined; }
  pairCardAt(x: number, y: number) { return this.inBounds(x, y) ? this.pairCards.get(y * this.width + x) : undefined; }
  railSwitchAt(x: number, y: number) { return this.inBounds(x, y) ? this.railSwitches.get(y * this.width + x) : undefined; }
  quizPadAt(x: number, y: number) { return this.inBounds(x, y) ? this.quizPads.get(y * this.width + x) : undefined; }
  prismAt(x: number, y: number) { return this.inBounds(x, y) ? this.prisms.get(y * this.width + x) : undefined; }
  runePadAt(x: number, y: number) { return this.inBounds(x, y) ? this.runePads.get(y * this.width + x) : undefined; }
  runeDemoAt(x: number, y: number) { return this.inBounds(x, y) ? this.runeDemos.get(y * this.width + x) : undefined; }
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
  inCycleZone(px: number, py: number) {
    const tx = Math.floor(px / this.tile), ty = Math.floor(py / this.tile);
    return this.cycleZones.some((z) => tx >= z.x && ty >= z.y && tx < z.x + z.w && ty < z.y + z.h);
  }
  isTillable(x: number, y: number) {
    if (this.isBlocked(x, y) || this.isCliffRim(x, y) || this.terrainAt(x, y) === '2') return false;
    return this.farmZones.some((z) => x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h);
  }
}
