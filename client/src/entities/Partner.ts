import Phaser from 'phaser';
import { STARTER_LUMI_SET } from '@shared/bmShop';
import type { Dir } from '@shared/types';
import { DEPTH } from '../config';

/** 플레이어 뒤를 졸졸 따라다니는 파트너 루미 (발자취 큐를 따라감) */
/** 플레이어(약 26px) 대비 루미 그림(약 29px)을 절반 키로 */
export const PARTNER_SCALE = 0.48;

export class Partner {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  private trail: { x: number; y: number }[] = [];
  private dir: Dir = 'down';
  private hopT = 0;
  species: string;
  coordId = '';
  coordSprite?: Phaser.GameObjects.Image;
  emote?: Phaser.GameObjects.Sprite;

  constructor(private scene: Phaser.Scene, species: string, x: number, y: number, coordId = '') {
    this.species = species;
    this.coordId = coordId;
    this.shadow = scene.add.image(x, y, 'shadow').setScale(0.3, 0.32).setDepth(DEPTH.cursor - 1).setAlpha(0.85);
    const key = this.sheetKey();
    // 필드에서는 플레이어 키의 절반 정도 (배틀 · 휴대폰 그림은 원래 크기)
    this.sprite = scene.add.sprite(x, y, key, 0).setOrigin(0.5, 30 / 32).setScale(PARTNER_SCALE);
    this.sprite.play(`${key}:down`);
    for (let i = 0; i < 12; i++) this.trail.push({ x, y });
  }
  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }

  /** 기본 스타팅 루미 3종(새록·찰랑·모락)은 치장이 직접 그려진 전용 스프라이트 시트를 사용 */
  private sheetKey(): string {
    if (this.coordId && STARTER_LUMI_SET.has(this.species)) {
      const k = `lumi_${this.species}_${this.coordId}`;
      if (this.scene.textures.exists(k)) return k;
    }
    return `lumi_${this.species}`;
  }

  setCoord(coordId = '') {
    if (coordId === this.coordId) return;
    this.coordId = coordId;
    const key = this.sheetKey();
    this.sprite.setTexture(key, 0);
    this.play();
  }

  setSpecies(species: string) {
    if (species === this.species) return;
    this.species = species;
    const key = this.sheetKey();
    this.sprite.setTexture(key, 0);
    this.play();
    this.poof();
  }
  teleport(x: number, y: number) { this.trail = Array.from({ length: 12 }, () => ({ x, y })); this.sprite.setPosition(x, y); }

  private play() {
    const v = this.dir === 'right' ? 'left' : this.dir;
    const key = this.sheetKey();
    this.sprite.setFlipX(this.dir === 'right');
    if (this.scene.anims.exists(`${key}:${v}`)) {
      this.sprite.play(`${key}:${v}`, true);
    }
  }

  /** 기쁨 점프 + 감정 말풍선 (도움을 줄 때) */
  cheer(emote = 4) {
    const st = { t: 0 };
    const y0 = this.sprite.y;
    this.scene.tweens.add({ targets: st, t: 1, duration: 140, yoyo: true, repeat: 1, ease: 'Quad.Out',
      onUpdate: () => {
        const lift = st.t * 4;
        this.sprite.setData('groundY', y0);
        this.sprite.setData('lift', lift);
        this.sprite.y = y0 - lift;
      },
      onComplete: () => { this.sprite.setData('groundY', undefined); this.sprite.setData('lift', 0); this.sprite.y = y0; } });
    this.emote?.destroy();
    const e = this.scene.add.sprite(this.x, this.y - 12, 'emotes', emote).setOrigin(0.5, 1).setDepth(DEPTH.overlay - 1).setScale(0);
    e.setData('groundY', this.sprite.y);
    this.emote = e;
    this.scene.tweens.add({ targets: e, scale: 1, duration: 160, ease: 'Back.Out' });
    this.scene.time.delayedCall(1400, () => { if (this.emote === e) { this.scene.tweens.add({ targets: e, scale: 0, duration: 120, onComplete: () => e.destroy() }); this.emote = undefined; } });
  }
  poof() {
    for (let i = 0; i < 6; i++) {
      const s = this.scene.add.image(this.x, this.y - 5, 'sparkle').setDepth(DEPTH.overlay - 2);
      const a = (i / 6) * Math.PI * 2;
      this.scene.tweens.add({ targets: s, x: s.x + Math.cos(a) * 12, y: s.y + Math.sin(a) * 10, alpha: 0, scale: 0.4, duration: 450, onComplete: () => s.destroy() });
    }
  }

  update(dt: number, leader: { x: number; y: number }, moving: boolean) {
    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(leader.x - last.x, leader.y - last.y) > 2) { this.trail.push({ x: leader.x, y: leader.y }); if (this.trail.length > 12) this.trail.shift(); }
    // 플레이어와 약 12px 떨어진 발자취 지점으로 이동
    const target = this.trail[Math.max(0, this.trail.length - 7)];
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
    if (this.coordSprite) {
      const gy = this.sprite.getData('groundY') as number | undefined;
      const lift = (this.sprite.getData('lift') as number | undefined) ?? 0;
      this.coordSprite.setPosition(this.x, this.sprite.y).setFlipX(this.dir === 'right').setDepth(this.sprite.depth + 0.1);
      this.coordSprite.setData('groundY', gy);
      this.coordSprite.setData('lift', lift);
    }
    this.shadow.setPosition(this.x, this.y - 1);
    if (this.emote) {
      this.emote.setPosition(this.x, this.y - 12);
      this.emote.setData('groundY', this.sprite.y);
    }
  }
  destroy() { this.sprite.destroy(); this.coordSprite?.destroy(); this.shadow.destroy(); this.emote?.destroy(); }
}
