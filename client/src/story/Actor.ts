import Phaser from 'phaser';
import type { Dir } from '@shared/types';
import { TILE, type CharacterMeta } from '../config';
import { Character, facingFromVector } from '../entities/Character';
import type { Grid } from '../world/Grid';

export const cellCenter = (cx: number, cy: number) => ({ x: cx * TILE + 8, y: cy * TILE + 13 });

/** 컷신 배우: 스크립트대로 걷고/뛰고/폴짝이고/사라짐 */
export class Actor extends Character {
  private path: [number, number][] = [];
  private speed = 62;
  private running = false;
  private done?: () => void;

  constructor(scene: Phaser.Scene, readonly id: string, sheet: string, x: number, y: number, meta: CharacterMeta, private grid: Grid, readonly name: string, zoom: number) {
    super(scene, sheet, x, y, meta);
    this.label = scene.add.text(x, y, name, { fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '8px', color: '#fff8ec', stroke: '#3b2414', strokeThickness: 2, resolution: zoom }).setOrigin(0.5, 1);
  }
  cell(): [number, number] { return [Math.floor(this.x / TILE), Math.floor((this.y - 3) / TILE)]; }

  /** 칸까지 길찾기 이동 (막혀 있으면 순간이동) */
  walkTo(cx: number, cy: number, run = false): Promise<void> {
    const [sx, sy] = this.cell();
    const p = this.grid.findPath(sx, sy, cx, cy);
    this.running = run; this.speed = run ? 128 : 62;
    return new Promise((res) => {
      if (!p || !p.length) { const c = cellCenter(cx, cy); this.setPosition(c.x, c.y); res(); return; }
      this.path = p; this.done = res;
    });
  }
  face(dir: Dir) { this.play('idle', dir); }
  faceTo(x: number, y: number) { this.play('idle', facingFromVector(x - this.x, y - this.y, this.dir)); }
  /** 신나서 방방 */
  hop(times = 3): Promise<void> {
    return new Promise((res) => this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 7, duration: 130, yoyo: true, repeat: times - 1, ease: 'Quad.Out', onComplete: () => res() }));
  }
  vanish(): Promise<void> {
    return new Promise((res) => this.scene.tweens.add({ targets: [this.sprite, this.shadow, this.label].filter(Boolean), alpha: 0, duration: 350, onComplete: () => { this.destroy(); res(); } }));
  }
  tick(dt: number) {
    const next = this.path[0];
    if (next) {
      const t = cellCenter(next[0], next[1]);
      const dx = t.x - this.x, dy = t.y - this.y, dist = Math.hypot(dx, dy), step = (this.speed * dt) / 1000;
      if (dist <= step) { this.setPosition(t.x, t.y); this.path.shift(); }
      else this.setPosition(this.x + (dx / dist) * step, this.y + (dy / dist) * step);
      this.dir = facingFromVector(dx, dy, this.dir);
      this.play(this.running ? 'run' : 'walk', this.dir);
      if (!this.path.length) { this.play('idle', this.dir); const d = this.done; this.done = undefined; d?.(); }
    }
    if (this.sprite.active) this.update();
  }
}
