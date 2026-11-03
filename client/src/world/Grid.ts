import { MapInfo } from '@shared/sim/MapInfo';
import { TILE } from '../config';

/** 충돌 그리드: 정적(맵) + 동적(제거된 오브젝트 해제 등) */
export class Grid {
  readonly w: number; readonly h: number;
  private cells: Uint8Array;
  constructor(readonly info: MapInfo) {
    this.w = info.width; this.h = info.height;
    this.cells = new Uint8Array(info.blocked);
  }
  blocked(cx: number, cy: number) { return cx < 0 || cy < 0 || cx >= this.w || cy >= this.h || this.cells[cy * this.w + cx] === 1; }
  setBlocked(cx: number, cy: number, v: boolean) { if (cx >= 0 && cy >= 0 && cx < this.w && cy < this.h) this.cells[cy * this.w + cx] = v ? 1 : 0; }

  /** 발 위치(px,py) 기준 AABB(가로 10 × 세로 5)가 막힌 칸과 겹치는지 */
  canStand(px: number, py: number, hw = 5, hh = 5) {
    const x0 = Math.floor((px - hw) / TILE), x1 = Math.floor((px + hw - 0.01) / TILE);
    const y0 = Math.floor((py - hh) / TILE), y1 = Math.floor((py - 0.01) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.blocked(x, y)) return false;
    return true;
  }

  /** 8방향 A* (모서리 끼어가기 금지). 셀 좌표 경로 반환 */
  findPath(sx: number, sy: number, tx: number, ty: number, maxNodes = 4000): [number, number][] | null {
    if (this.blocked(tx, ty)) {
      const alt = this.nearestOpen(tx, ty); if (!alt) return null; [tx, ty] = alt;
    }
    const W = this.w, key = (x: number, y: number) => y * W + x;
    const g = new Map<number, number>(), from = new Map<number, number>();
    const open: { k: number; f: number }[] = [];
    const h = (x: number, y: number) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
    const sk = key(sx, sy); g.set(sk, 0); open.push({ k: sk, f: h(sx, sy) });
    const closed = new Set<number>();
    let n = 0;
    while (open.length && n++ < maxNodes) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const { k } = open.splice(bi, 1)[0];
      if (closed.has(k)) continue; closed.add(k);
      const cx = k % W, cy = (k / W) | 0;
      if (cx === tx && cy === ty) {
        const path: [number, number][] = []; let c: number | undefined = k;
        while (c !== undefined && c !== sk) { path.push([c % W, (c / W) | 0]); c = from.get(c); }
        return path.reverse();
      }
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (this.blocked(nx, ny)) continue;
        if (dx && dy && (this.blocked(cx + dx, cy) || this.blocked(cx, cy + dy))) continue;
        const nk = key(nx, ny), ng = g.get(k)! + (dx && dy ? 1.414 : 1);
        if (ng < (g.get(nk) ?? Infinity)) { g.set(nk, ng); from.set(nk, k); open.push({ k: nk, f: ng + h(nx, ny) }); }
      }
    }
    return null;
  }
  nearestOpen(cx: number, cy: number): [number, number] | null {
    for (let r = 1; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!this.blocked(cx + dx, cy + dy)) return [cx + dx, cy + dy];
    return null;
  }
}
