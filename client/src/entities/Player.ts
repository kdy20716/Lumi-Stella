import Phaser from 'phaser';
import { DIR_VEC } from '@shared/types';
import { RUN_SPEED, TILE, WALK_SPEED, type CharacterMeta } from '../config';
import type { Grid } from '../world/Grid';
import { Character, facingFromVector } from './Character';

export interface MoveInput { vx: number; vy: number; run: boolean }

/** 로컬 플레이어: 클라이언트 예측 이동 (Client-side Prediction) + AABB 타일 충돌 */
export class Player extends Character {
  private dust = 0;
  moving = false;

  constructor(scene: Phaser.Scene, sheet: string, x: number, y: number, meta: CharacterMeta, private grid: Grid) {
    super(scene, sheet, x, y, meta);
  }

  cell(): [number, number] { return [Math.floor(this.x / TILE), Math.floor((this.y - 3) / TILE)]; }
  facingCell(): [number, number] { const [cx, cy] = this.cell(); const [dx, dy] = DIR_VEC[this.dir]; return [cx + dx, cy + dy]; }

  move(dt: number, input: MoveInput, others: { x: number; y: number }[] = []) {
    if (this.busy) { this.moving = false; return; }
    let { vx, vy } = input;
    const len = Math.hypot(vx, vy);
    if (len > 0) { vx /= len; vy /= len; }
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    const step = (speed * dt) / 1000;
    // NPC 와 겹치는 쪽으로는 못 가지만, 이미 겹쳤을 때 빠져나가는 건 허용
    const blockedByOthers = (x: number, y: number) => others.some((o) =>
      Math.abs(o.x - x) < 9 && Math.abs(o.y - y) < 5 && Math.hypot(o.x - x, o.y - y) < Math.hypot(o.x - this.x, o.y - this.y));
    const ok = (x: number, y: number) => this.grid.canStand(x, y) && !blockedByOthers(x, y);
    let nx = this.x, ny = this.y;
    // 축 분리 이동 → 벽을 따라 미끄러짐 + 모서리 걸림 보정
    if (vx) { const tx = nx + vx * step; if (ok(tx, ny)) nx = tx; else if (!vy) ny += this.nudge(nx, ny, vx * step, 0, ok); }
    if (vy) { const ty = ny + vy * step; if (ok(nx, ty)) ny = ty; else if (!vx) nx += this.nudge(nx, ny, 0, vy * step, ok); }
    this.moving = len > 0;
    this.setPosition(nx, ny);
    this.dir = facingFromVector(vx, vy, this.dir);
    if (len > 0) {
      this.play(input.run ? 'run' : 'walk', this.dir);
      this.dust += dt;
      if (input.run && this.dust > 160) { this.dust = 0; this.kickDust(); }
    } else this.play('idle', this.dir);
  }

  /** 모서리에 살짝 걸렸을 때 옆으로 비껴가기 (코너 보정): 수직 방향 오프셋 반환 */
  private nudge(x: number, y: number, dx: number, dy: number, ok: (x: number, y: number) => boolean) {
    for (const off of [3, -3, 5, -5, 7, -7]) {
      if (dx && ok(x, y + off) && ok(x + dx, y + off)) return Math.sign(off) * 0.9;
      if (dy && ok(x + off, y) && ok(x + off, y + dy)) return Math.sign(off) * 0.9;
    }
    return 0;
  }

  private kickDust() {
    const p = this.scene.add.circle(this.x + Phaser.Math.Between(-3, 3), this.y - 1, Phaser.Math.Between(2, 3), 0xe8d0a0, 0.7).setDepth(this.y - 1);
    this.scene.tweens.add({ targets: p, y: p.y - 5, alpha: 0, scale: 1.8, duration: 380, onComplete: () => p.destroy() });
  }
}
