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
  /** 발이 땅에 닿는 프레임마다 호출 (발소리). 내 플레이어에만 있음 — 원격 플레이어 · NPC 는 소리 없음 */
  onStep?: (run: boolean) => void;

  constructor(scene: Phaser.Scene, sheet: string, x: number, y: number, meta: CharacterMeta, private grid: Grid) {
    super(scene, sheet, x, y, meta);
    // 걷기 4프레임 중 2·4번째, 달리기 6프레임 중 3·6번째가 발 닿는 순간 (tools/art/char.mjs 의 walk/run 포즈)
    //   프레임이 건너뛰어져도(느린 PC) 발 닿는 프레임을 지나쳤으면 한 번 울림
    let last = -1, lastAnim = '';
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, (a: Phaser.Animations.Animation, f: Phaser.Animations.AnimationFrame) => {
      const i = a.frames.indexOf(f), n = a.frames.length;
      const run = this.anim === 'run', contacts = run ? [2, 5] : this.anim === 'walk' ? [1, 3] : [];
      const prev = lastAnim === this.anim ? last : -1;
      last = i; lastAnim = this.anim;
      if (!this.moving || !this.onStep || !contacts.length) return;
      const steps = prev < 0 ? 1 : (i - prev + n) % n;
      for (let k = 1; k <= steps; k++) if (contacts.includes((prev + k + n) % n)) { this.onStep(run); break; }
    });
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
    // 2.5D 턱: 위에서 똑바로 아래로 걸어 들어가면 뛰어내림 · 아래나 옆에서는 못 들어감
    const info = this.grid.info;
    const cellOf = (x: number, y: number) => [Math.floor(x / TILE), Math.floor((y - 3) / TILE)] as const;
    const [ccx, ccy] = cellOf(nx, ny);
    const intoLedge = (x: number, y: number) => { const [cx2, cy2] = cellOf(x, y); return (cx2 !== ccx || cy2 !== ccy) && info.isLedge(cx2, cy2) && !info.isLedge(ccx, ccy); };
    if (vy > 0 && Math.abs(vx) < 0.5 && intoLedge(nx, ny + vy * step)) { this.hop(ccy + 1); return; }
    if (vx && intoLedge(nx + vx * step, ny)) vx = 0;
    if (vy && intoLedge(nx, ny + vy * step)) vy = 0;
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

  /** 턱 넘어 뛰어내리기: 턱 칸을 지나 그 아래 칸에 착지 (포물선) */
  hopping = false;
  onHop?: () => void;
  private hop(ledgeRow: number) {
    this.busy = true; this.hopping = true; this.moving = true;
    const x = this.x, y0 = this.y, y1 = (ledgeRow + 2) * TILE - 1;
    this.play('walk', 'down');
    this.onHop?.();
    const st = { t: 0 };
    this.scene.tweens.add({ targets: st, t: 1, duration: 380, ease: 'Linear',
      onUpdate: () => { this.setPosition(x, y0 + (y1 - y0) * st.t - Math.sin(Math.PI * st.t) * 9); this.shadow.setPosition(x, y0 + (y1 - y0) * st.t); },
      onComplete: () => { this.setPosition(x, y1); this.busy = false; this.hopping = false; this.kickDust(); this.kickDust(); } });
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
