import Phaser from 'phaser';
import type { Dir } from '@shared/types';
import { DEPTH } from '../config';

/** 플레이어 뒤를 졸졸 따라다니는 파트너 루미 (발자취 큐를 따라감) */
export class Partner {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  private trail: { x: number; y: number }[] = [];
  private dir: Dir = 'down';
  private hopT = 0;
  species: string;
  emote?: Phaser.GameObjects.Sprite;

  constructor(private scene: Phaser.Scene, species: string, x: number, y: number) {
    this.species = species;
    this.shadow = scene.add.image(x, y, 'shadow').setScale(0.42, 0.45).setDepth(DEPTH.cursor - 1).setAlpha(0.85);
    this.sprite = scene.add.sprite(x, y, `lumi_${species}`, 0).setOrigin(0.5, 30 / 32);
    this.sprite.play(`lumi_${species}:down`);
    for (let i = 0; i < 12; i++) this.trail.push({ x, y });
  }
  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  setSpecies(species: string) {
    if (species === this.species) return;
    this.species = species;
    this.sprite.setTexture(`lumi_${species}`, 0);
    this.play();
    this.poof();
  }
  teleport(x: number, y: number) { this.trail = Array.from({ length: 12 }, () => ({ x, y })); this.sprite.setPosition(x, y); }

  private play() {
    const v = this.dir === 'right' ? 'left' : this.dir;
    this.sprite.setFlipX(this.dir === 'right');
    this.sprite.play(`lumi_${this.species}:${v}`, true);
  }

  /** 기쁨 점프 + 감정 말풍선 (도움을 줄 때) */
  cheer(emote = 4) {
    this.scene.tweens.add({ targets: this.sprite, y: this.sprite.y - 6, duration: 140, yoyo: true, repeat: 1, ease: 'Quad.Out' });
    this.emote?.destroy();
    const e = this.scene.add.sprite(this.x, this.y - 22, 'emotes', emote).setOrigin(0.5, 1).setDepth(DEPTH.overlay - 1).setScale(0);
    this.emote = e;
    this.scene.tweens.add({ targets: e, scale: 1, duration: 160, ease: 'Back.Out' });
    this.scene.time.delayedCall(1400, () => { if (this.emote === e) { this.scene.tweens.add({ targets: e, scale: 0, duration: 120, onComplete: () => e.destroy() }); this.emote = undefined; } });
  }
  poof() {
    for (let i = 0; i < 6; i++) {
      const s = this.scene.add.image(this.x, this.y - 8, 'sparkle').setDepth(DEPTH.overlay - 2);
      const a = (i / 6) * Math.PI * 2;
      this.scene.tweens.add({ targets: s, x: s.x + Math.cos(a) * 12, y: s.y + Math.sin(a) * 10, alpha: 0, scale: 0.4, duration: 450, onComplete: () => s.destroy() });
    }
  }

  update(dt: number, leader: { x: number; y: number }, moving: boolean) {
    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(leader.x - last.x, leader.y - last.y) > 2) { this.trail.push({ x: leader.x, y: leader.y }); if (this.trail.length > 12) this.trail.shift(); }
    // 플레이어와 약 14px 떨어진 발자취 지점으로 이동
    const target = this.trail[Math.max(0, this.trail.length - 8)];
    const dx = target.x - this.x, dy = target.y - this.y, d = Math.hypot(dx, dy);
    const far = Math.hypot(leader.x - this.x, leader.y - this.y);
    if (far > 120) this.teleport(leader.x, leader.y + 2);
    else if (d > 1) {
      const step = Math.min(d, (Math.max(60, d * 6) * dt) / 1000);
      this.sprite.setPosition(this.x + (dx / d) * step, this.y + (dy / d) * step);
      const nd: Dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      if (nd !== this.dir) { this.dir = nd; }
      this.play();
      this.sprite.anims.timeScale = moving ? 1.6 : 1;
    } else {
      this.hopT += dt;
      this.sprite.anims.timeScale = 0.6;
      // 멈춰 있으면 플레이어 쪽을 바라봄
      const fx = leader.x - this.x, fy = leader.y - this.y;
      const nd: Dir = Math.abs(fx) > Math.abs(fy) ? (fx < 0 ? 'left' : 'right') : fy < 0 ? 'up' : 'down';
      if (nd !== this.dir && Math.hypot(fx, fy) > 4) { this.dir = nd; this.play(); }
    }
    this.sprite.setDepth(this.sprite.y - 0.5);
    this.shadow.setPosition(this.x, this.y - 1);
    this.emote?.setPosition(this.x, this.y - 22);
  }
  destroy() { this.sprite.destroy(); this.shadow.destroy(); this.emote?.destroy(); }
}
