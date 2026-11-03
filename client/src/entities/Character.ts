import Phaser from 'phaser';
import type { Dir } from '@shared/types';
import { DEPTH, type CharacterMeta } from '../config';

/** 스프라이트 + 그림자 + 방향/애니메이션 상태를 가진 캐릭터 공통 베이스 */
export class Character {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Image;
  dir: Dir = 'down';
  anim = 'idle';
  /** 일회성 애니메이션(도구 등) 재생 중이면 true */
  busy = false;
  emote?: Phaser.GameObjects.Sprite;
  label?: Phaser.GameObjects.Text;

  constructor(protected scene: Phaser.Scene, readonly sheet: string, x: number, y: number, meta: CharacterMeta) {
    this.shadow = scene.add.image(x, y, 'shadow').setScale(0.55, 0.6).setDepth(DEPTH.cursor - 1).setAlpha(0.9);
    this.sprite = scene.add.sprite(x, y, sheet, 0).setOrigin(meta.originX, meta.originY);
    this.play('idle', 'down');
  }
  get x() { return this.sprite.x; }
  get y() { return this.sprite.y; }
  setPosition(x: number, y: number) { this.sprite.setPosition(x, y); }

  play(anim: string, dir: Dir = this.dir, ignoreIfPlaying = true) {
    this.anim = anim; this.dir = dir;
    this.sprite.play(`${this.sheet}:${anim}-${dir}`, ignoreIfPlaying);
  }
  /** 일회성 애니메이션 → 완료 시 콜백, 지정 프레임에서 impact 콜백 */
  playOnce(anim: string, dir: Dir, onImpact?: () => void, impactFrame = 3, onDone?: () => void) {
    this.busy = true;
    this.play(anim, dir, false);
    let fired = false;
    const upd = (a: Phaser.Animations.Animation, f: Phaser.Animations.AnimationFrame) => {
      if (!fired && a.frames.indexOf(f) >= impactFrame) { fired = true; onImpact?.(); }
    };
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, upd);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.sprite.off(Phaser.Animations.Events.ANIMATION_UPDATE, upd);
      if (!fired) onImpact?.();
      this.scene.time.delayedCall(90, () => { this.busy = false; this.play('idle', this.dir); onDone?.(); });
    });
  }

  showEmote(index: number, duration = 1600) {
    this.emote?.destroy();
    const e = this.scene.add.sprite(this.x, this.y - 34, 'emotes', index).setOrigin(0.5, 1).setDepth(DEPTH.overlay - 1).setScale(0);
    this.emote = e;
    this.scene.tweens.add({ targets: e, scale: 1, duration: 160, ease: 'Back.Out' });
    if (duration > 0) this.scene.time.delayedCall(duration, () => { if (this.emote === e) this.hideEmote(); });
  }
  hideEmote() {
    const e = this.emote; this.emote = undefined;
    if (e) this.scene.tweens.add({ targets: e, scale: 0, duration: 120, onComplete: () => e.destroy() });
  }

  update() {
    this.sprite.setDepth(this.sprite.y);
    this.shadow.setPosition(this.sprite.x, this.sprite.y - 1);
    if (this.emote) this.emote.setPosition(this.sprite.x, this.sprite.y - 33 + Math.sin(this.scene.time.now / 250) * 1);
    if (this.label) this.label.setPosition(this.sprite.x, this.sprite.y - 36).setDepth(DEPTH.overlay - 2);
  }
  destroy() { this.sprite.destroy(); this.shadow.destroy(); this.emote?.destroy(); this.label?.destroy(); }
}

export const facingFromVector = (vx: number, vy: number, current: Dir): Dir => {
  if (!vx && !vy) return current;
  if (Math.abs(vx) > Math.abs(vy) + 0.01) return vx < 0 ? 'left' : 'right';
  if (Math.abs(vy) > Math.abs(vx) + 0.01) return vy < 0 ? 'up' : 'down';
  // 대각선: 현재 방향 유지 가능하면 유지
  if ((current === 'left' && vx < 0) || (current === 'right' && vx > 0) || (current === 'up' && vy < 0) || (current === 'down' && vy > 0)) return current;
  return vx < 0 ? 'left' : 'right';
};
