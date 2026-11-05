import Phaser from 'phaser';
import { DIR_VEC, type Dir } from '@shared/types';
import { RUN_SPEED, TILE, WALK_SPEED, type CharacterMeta } from '../config';
import type { Grid } from '../world/Grid';
import { Character } from './Character';

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

  /** 타일 한 칸씩 이동 (4세대 휴대용 RPG 방식): 칸 중앙 → 다음 칸 중앙. 키를 누르고 있으면 끊김 없이 이어서 걸음 */
  private target: { x: number; y: number } | null = null;
  private turnT = 0;
  private lastHeld: 'x' | 'y' = 'x';
  move(dt: number, input: MoveInput, others: { x: number; y: number }[] = []) {
    if (this.busy) { this.moving = false; return; }
    const speed = input.run ? RUN_SPEED : WALK_SPEED;
    let budget = (speed * dt) / 1000;
    // 원하는 방향 (4방향): 두 축을 같이 누르면 마지막에 새로 누른 축 우선
    let dx = Math.sign(input.vx), dy = Math.sign(input.vy);
    if (dx && dy) { if (this.lastHeld === 'x') dx = 0; else dy = 0; }
    else if (dx) this.lastHeld = 'y'; else if (dy) this.lastHeld = 'x';
    const want: Dir | null = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : dy < 0 ? 'up' : null;
    const info = this.grid.info;
    const occupied = (cx: number, cy: number) => others.some((o) => Math.floor(o.x / TILE) === cx && Math.floor((o.y - 3) / TILE) === cy);
    for (let guard = 0; guard < 3 && budget > 0; guard++) {
      if (!this.target) {
        const [cx, cy] = this.cell();
        const c = { x: cx * TILE + 8, y: cy * TILE + 13 };
        // 칸 중앙에 있지 않으면(워프 · 밀려남 등) 먼저 중앙으로 맞춤
        if (Math.abs(this.x - c.x) > 0.5 || Math.abs(this.y - c.y) > 0.5) { this.target = c; continue; }
        if (!want) { this.moving = false; this.turnT = 0; break; }
        // 멈춘 채로 다른 방향을 톡 누르면 제자리에서 방향만 바꿈
        if (want !== this.dir && !this.moving) { this.dir = want; this.turnT = 0.01; this.play('idle', want); break; }
        if (this.turnT > 0 && !this.moving) { this.turnT += dt; if (this.turnT < 90) break; }
        this.turnT = 0;
        this.dir = want;
        const [vx, vy] = DIR_VEC[want];
        const nx = cx + vx, ny = cy + vy;
        // 2.5D 턱: 위에서 똑바로 아래로 → 뛰어내림 · 아래나 옆에서는 못 들어감
        if (info.isLedge(nx, ny) && !info.isLedge(cx, cy)) {
          if (want === 'down') { this.hop(ny); return; }
          this.bump(); break;
        }
        const t = { x: nx * TILE + 8, y: ny * TILE + 13 };
        if (!this.grid.canStand(t.x, t.y) || occupied(nx, ny)) { this.bump(); break; }
        this.target = t;
      }
      const tx = this.target.x - this.x, ty = this.target.y - this.y, d = Math.hypot(tx, ty);
      if (d <= budget) { this.setPosition(this.target.x, this.target.y); budget -= d; this.target = null; this.moving = !!want; if (!want) break; }
      else { this.setPosition(this.x + (tx / d) * budget, this.y + (ty / d) * budget); budget = 0; this.moving = true; }
    }
    if (this.moving) {
      this.play(input.run ? 'run' : 'walk', this.dir);
      this.dust += dt;
      if (input.run && this.dust > 160) { this.dust = 0; this.kickDust(); }
    } else this.play('idle', this.dir);
  }
  /** 막힌 칸으로 걸으려 할 때: 제자리 걸음 */
  private bump() { this.moving = false; }
  /** 순간이동 직후 등: 진행 중인 한 칸 이동 취소 */
  stopStep() { this.target = null; this.moving = false; }

  /** 턱 넘어 뛰어내리기: 턱 칸을 지나 그 아래 칸에 착지 (포물선) */
  hopping = false;
  onHop?: () => void;
  private hop(ledgeRow: number) {
    this.busy = true; this.hopping = true; this.moving = true;
    this.target = null;
    const x = this.x, y0 = this.y, y1 = (ledgeRow + 1) * TILE + 13;
    this.play('walk', 'down');
    this.onHop?.();
    const st = { t: 0 };
    this.scene.tweens.add({ targets: st, t: 1, duration: 380, ease: 'Linear',
      onUpdate: () => { this.setPosition(x, y0 + (y1 - y0) * st.t - Math.sin(Math.PI * st.t) * 9); this.shadow.setPosition(x, y0 + (y1 - y0) * st.t); },
      onComplete: () => { this.setPosition(x, y1); this.busy = false; this.hopping = false; this.kickDust(); this.kickDust(); } });
  }

  private kickDust() {
    const p = this.scene.add.circle(this.x + Phaser.Math.Between(-3, 3), this.y - 1, Phaser.Math.Between(2, 3), 0xe8d0a0, 0.7).setDepth(this.y - 1);
    this.scene.tweens.add({ targets: p, y: p.y - 5, alpha: 0, scale: 1.8, duration: 380, onComplete: () => p.destroy() });
  }
}
