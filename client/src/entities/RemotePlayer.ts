import Phaser from 'phaser';
import type { Dir } from '@shared/types';
import type { CharacterMeta } from '../config';
import { Character } from './Character';

/** 다른 접속자: 서버 스냅샷을 버퍼링 → 약간 과거 시점으로 선형 보간(Entity Interpolation) */
export class RemotePlayer extends Character {
  private buf: { t: number; x: number; y: number; dir: Dir; anim: string }[] = [];
  private static DELAY = 110; // ms: 보간 지연 (스냅샷 15Hz 기준 1~2개 버퍼)

  constructor(scene: Phaser.Scene, sheet: string, x: number, y: number, meta: CharacterMeta, readonly id: string, name: string, zoom: number) {
    super(scene, sheet, x, y, meta);
    this.label = scene.add.text(x, y, name, { fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '8px', color: '#ffe58a', stroke: '#3b2414', strokeThickness: 2, resolution: zoom }).setOrigin(0.5, 1);
  }

  push(x: number, y: number, dir: Dir, anim: string) {
    this.buf.push({ t: performance.now(), x, y, dir, anim });
    if (this.buf.length > 20) this.buf.shift();
  }

  tick() {
    const renderT = performance.now() - RemotePlayer.DELAY;
    while (this.buf.length >= 2 && this.buf[1].t <= renderT) this.buf.shift();
    const a = this.buf[0], b = this.buf[1];
    if (a && b) {
      const k = Phaser.Math.Clamp((renderT - a.t) / Math.max(1, b.t - a.t), 0, 1);
      this.setPosition(Phaser.Math.Linear(a.x, b.x, k), Phaser.Math.Linear(a.y, b.y, k));
    } else if (a) {
      // 스냅샷이 끊기면 Lerp로 부드럽게 수렴
      this.setPosition(this.x + (a.x - this.x) * 0.2, this.y + (a.y - this.y) * 0.2);
    }
    const cur = b ?? a;
    if (cur && !this.busy) this.play(['walk', 'run', 'idle'].includes(cur.anim) ? cur.anim : 'idle', cur.dir);
    this.update();
  }
}
