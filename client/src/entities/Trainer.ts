import Phaser from 'phaser';
import type { Dir, TrainerDef } from '@shared/types';
import { TILE, type CharacterMeta } from '../config';
import type { Grid } from '../world/Grid';
import { Character, facingFromVector } from './Character';
import { Partner } from './Partner';

/**
 * 길 위의 트레이너: 바라보는 방향으로 sight 칸 안에 플레이어가 들어오면
 * "!" → 플레이어 앞까지 걸어옴 → 대사 → 배틀
 */
export class Trainer extends Character {
  readonly home: { x: number; y: number };
  approaching = false;
  private lookT = 0;
  readonly buddy?: Partner;

  constructor(scene: Phaser.Scene, readonly def: TrainerDef, meta: CharacterMeta, x: number, y: number, readonly face: Dir, private grid: Grid, zoom: number) {
    super(scene, def.sprite, x, y, meta);
    this.home = { x, y };
    this.play('idle', face);
    this.label = scene.add.text(x, y, `${def.title} ${def.name}`, { fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '8px', color: '#ffe58a', stroke: '#3b2414', strokeThickness: 2, resolution: zoom }).setOrigin(0.5, 1).setAlpha(0);
  }

  cell(): [number, number] { return [Math.floor(this.x / TILE), Math.floor((this.y - 3) / TILE)]; }

  /** 시선 안에 플레이어 셀이 있는지 (중간에 막힌 칸 없음) */
  sees(px: number, py: number): boolean {
    if (this.def.sight <= 0) return false;
    const [cx, cy] = this.cell();
    const pcx = Math.floor(px / TILE), pcy = Math.floor((py - 3) / TILE);
    const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.dir];
    for (let i = 1; i <= this.def.sight; i++) {
      const x = cx + dx * i, y = cy + dy * i;
      if (x === pcx && y === pcy) return true;
      if (this.grid.blocked(x, y)) return false;
    }
    return false;
  }

  /** 플레이어 앞까지 걸어오기 → 도착 시 콜백 */
  approach(px: number, py: number, onArrive: () => void) {
    this.approaching = true;
    this.showEmote(1, 900);
    const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[this.dir];
    // 플레이어 바로 앞 칸
    const tx = this.x + (Math.abs(dx) ? px - this.x - dx * 14 : 0);
    const ty = this.y + (Math.abs(dy) ? py - this.y - dy * 14 : 0);
    const dist = Math.hypot(tx - this.x, ty - this.y);
    this.scene.time.delayedCall(700, () => {
      this.play('walk', this.dir);
      this.scene.tweens.add({
        targets: this.sprite, x: tx, y: ty, duration: Math.max(150, (dist / 70) * 1000),
        onUpdate: () => this.update(),
        onComplete: () => { this.play('idle', this.dir); onArrive(); },
      });
    });
  }

  faceTo(px: number, py: number) { this.play('idle', facingFromVector(px - this.x, py - this.y, this.dir)); }
  returnHome() {
    this.scene.tweens.add({ targets: this.sprite, x: this.home.x, y: this.home.y, duration: 500, onUpdate: () => this.update(), onComplete: () => { this.play('idle', this.face); this.approaching = false; } });
  }

  tick(dt: number, player: { x: number; y: number }) {
    const near = Math.hypot(player.x - this.x, player.y - this.y) < 40;
    this.label?.setAlpha(Phaser.Math.Linear(this.label.alpha, near ? 1 : 0, 0.15));
    // 가끔 두리번 (시선 방향은 원래 방향으로 복귀)
    this.lookT += dt;
    if (!this.approaching && this.def.sight > 0 && this.lookT > 3500) {
      this.lookT = 0;
      if (this.dir === this.face && Math.random() < 0.3) {
        const others: Dir[] = (['down', 'left', 'right', 'up'] as Dir[]).filter((d) => d !== this.face);
        this.play('idle', Phaser.Utils.Array.GetRandom(others));
        this.scene.time.delayedCall(900, () => { if (!this.approaching) this.play('idle', this.face); });
      }
    }
    this.update();
  }
}
