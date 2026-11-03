import Phaser from 'phaser';
import { DEPTH, TILE } from '../config';
import type { Grid } from '../world/Grid';

/** 닭: 근처를 종종걸음 배회하다가 모이를 쪼고, 플레이어가 뛰어오면 도망 */
export class Chicken {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  private target: { x: number; y: number } | null = null;
  private timer = Math.random() * 2000;
  private view: 'down' | 'side' | 'up' = 'down';

  constructor(private scene: Phaser.Scene, private key: string, x: number, y: number, private grid: Grid, private home = { x, y }) {
    this.shadow = scene.add.image(x, y, 'shadow').setScale(0.32, 0.35).setDepth(DEPTH.cursor - 1);
    this.sprite = scene.add.sprite(x, y, key, 0).setOrigin(0.5, 15 / 16);
    this.sprite.play(`${key}:idle-down`);
  }

  update(dt: number, player: { x: number; y: number; running: boolean }) {
    const s = this.sprite;
    const dp = Math.hypot(player.x - s.x, player.y - s.y);
    if (player.running && dp < 28 && (!this.target || this.timer > 0)) {
      // 놀라서 도망
      const a = Math.atan2(s.y - player.y, s.x - player.x);
      this.target = { x: s.x + Math.cos(a) * 30, y: s.y + Math.sin(a) * 30 };
      this.timer = 0;
      if (Math.random() < 0.02) this.flap();
    }
    if (this.target) {
      const dx = this.target.x - s.x, dy = this.target.y - s.y, d = Math.hypot(dx, dy);
      const sp = (player.running && dp < 40 ? 70 : 24) * dt / 1000;
      if (d < 1.5) { this.target = null; this.timer = 800 + Math.random() * 2500; this.playIdle(); }
      else {
        const nx = s.x + (dx / d) * sp, ny = s.y + (dy / d) * sp;
        if (this.grid.canStand(nx, ny, 3, 3)) s.setPosition(nx, ny); else { this.target = null; this.timer = 500; }
        this.view = Math.abs(dx) > Math.abs(dy) ? 'side' : dy < 0 ? 'up' : 'down';
        s.setFlipX(this.view === 'side' && dx > 0);
        s.play(`${this.key}:walk-${this.view}`, true);
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (Math.random() < 0.45) { s.play(`${this.key}:peck-${this.view === 'up' ? 'down' : this.view}`); s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.playIdle()); this.timer = 1200 + Math.random() * 1500; }
        else {
          const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 28;
          let tx = s.x + Math.cos(a) * r, ty = s.y + Math.sin(a) * r;
          if (Math.hypot(tx - this.home.x, ty - this.home.y) > 4 * TILE) { tx = this.home.x + (Math.random() - 0.5) * 24; ty = this.home.y + (Math.random() - 0.5) * 24; }
          this.target = { x: tx, y: ty };
        }
      }
    }
    s.setDepth(s.y);
    this.shadow.setPosition(s.x, s.y - 1);
  }
  private playIdle() { this.sprite.play(`${this.key}:idle-${this.view}`, true); }
  private flap() { this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 4, duration: 120, yoyo: true }); }
}

/** 낮에 날아다니는 나비 / 밤에 반짝이는 반딧불 */
export class Butterfly {
  readonly sprite: Phaser.GameObjects.Sprite;
  private t = Math.random() * 1000;
  private base: { x: number; y: number };
  private vx = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 8);
  constructor(scene: Phaser.Scene, x: number, y: number, private bounds: { w: number; h: number }) {
    this.base = { x, y };
    this.sprite = scene.add.sprite(x, y, 'butterfly', 0).play(`butterfly:${Math.floor(Math.random() * 4)}`).setDepth(DEPTH.overlay - 20);
  }
  update(dt: number, visible: number) {
    this.t += dt;
    this.base.x += (this.vx * dt) / 1000;
    if (this.base.x < 40 || this.base.x > this.bounds.w - 40) this.vx *= -1;
    this.sprite.setPosition(this.base.x + Math.sin(this.t / 700) * 10, this.base.y + Math.sin(this.t / 260) * 5 + Math.cos(this.t / 900) * 8);
    this.sprite.setFlipX(this.vx > 0).setAlpha(visible);
  }
}

/** 호수의 오리: 물 위를 천천히 떠다니다 가끔 자맥질 */
export class Duck {
  readonly sprite: Phaser.GameObjects.Sprite;
  private target: { x: number; y: number } | null = null;
  private timer = Math.random() * 3000;
  private diving = 0;
  constructor(private scene: Phaser.Scene, x: number, y: number, private isWater: (px: number, py: number) => boolean) {
    this.sprite = scene.add.sprite(x, y, 'duck', 0).setOrigin(0.5, 15 / 16);
  }
  update(dt: number, player: { x: number; y: number }) {
    const s = this.sprite;
    this.timer -= dt;
    if (this.diving > 0) { this.diving -= dt; s.setFrame(this.diving > 600 ? 2 : 3); if (this.diving <= 0) s.setFrame(0); }
    else if (this.target) {
      const dx = this.target.x - s.x, dy = this.target.y - s.y, d = Math.hypot(dx, dy), sp = (12 * dt) / 1000;
      if (d < 1) this.target = null;
      else { s.setPosition(s.x + (dx / d) * sp, s.y + (dy / d) * sp); s.setFlipX(dx > 0); }
      s.setFrame(Math.floor(this.scene.time.now / 400) % 2);
    } else if (this.timer <= 0) {
      if (Math.random() < 0.25) this.diving = 1200;
      else {
        // 플레이어가 가까우면 멀어지는 쪽으로
        const away = Math.hypot(player.x - s.x, player.y - s.y) < 40;
        for (let i = 0; i < 6; i++) {
          const a = away ? Math.atan2(s.y - player.y, s.x - player.x) + (Math.random() - 0.5) : Math.random() * Math.PI * 2;
          const tx = s.x + Math.cos(a) * 24, ty = s.y + Math.sin(a) * 16;
          if (this.isWater(tx, ty) && this.isWater(tx + 6, ty) && this.isWater(tx - 6, ty)) { this.target = { x: tx, y: ty }; break; }
        }
      }
      this.timer = 1500 + Math.random() * 3500;
    }
    s.setDepth(s.y);
  }
}
