import Phaser from 'phaser';
import { DIR_VEC, type Dir } from '@shared/types';
import { RUN_SPEED, TILE, WALK_SPEED, type CharacterMeta } from '../config';
import type { Grid } from '../world/Grid';
import { Character } from './Character';

/** vx · vy: -1 ~ 1 (키보드는 -1/0/1, 모바일 조이스틱은 연속값). 대각선도 가능 */
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

  /** 발밑 상자(좌우 5px · 높이 5px)가 걸치는 칸 중 2.5D 턱(ledge)이 있는지 */
  private overlapsLedge(px: number, py: number) {
    const info = this.grid.info;
    const x0 = Math.floor((px - 5) / TILE), x1 = Math.floor((px + 5 - 0.01) / TILE);
    const y0 = Math.floor((py - 5) / TILE), y1 = Math.floor((py - 0.01) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (info.isLedge(x, y)) return true;
    return false;
  }

  /**
   * 자유 이동: 8방향(대각선 포함), 대각선은 속도를 맞춰서 더 빠르지 않게.
   * 축별로 따로 충돌 검사해서 벽을 따라 미끄러짐.
   * 턱(ledge)은 위에서 아래로만 뛰어내릴 수 있고, 아래나 옆에서는 못 올라감.
   */
  move(dt: number, input: MoveInput, others: { x: number; y: number }[] = []) {
    if (this.busy) { this.moving = false; return; }
    let { vx, vy } = input;
    const len = Math.hypot(vx, vy);
    if (len < 0.05) { this.moving = false; this.play('idle', this.dir); return; }
    vx /= len; vy /= len;   // 방향만 사용: 조이스틱을 살짝 밀어도 걷는 속도는 일정

    // 보는 방향 (그림은 4방향): 대각선이면 보던 축을 유지하고, 다른 축이 확실히 더 크면 바꿈
    const ax = Math.abs(vx), ay = Math.abs(vy), wasH = this.dir === 'left' || this.dir === 'right';
    const horizontal = ax > 0.01 && ay > 0.01 ? (wasH ? ax >= ay * 0.6 : ax > ay * 1.6) : ax >= ay;
    const dir: Dir = horizontal ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');

    const totalDist = ((input.run ? RUN_SPEED : WALK_SPEED) * dt) / 1000;
    const solid = (nx: number, ny: number) => {
      if (!this.grid.canStand(nx, ny)) return true;
      // 다른 사람과 겹치지 않기 (이미 겹쳐 있으면 멀어지는 쪽으로는 이동 허용)
      return others.some((o) => {
        const dx = Math.abs(o.x - nx), dy = Math.abs(o.y - ny);
        return dx < 9 && dy < 7 && (dx < Math.abs(o.x - this.x) || dy < Math.abs(o.y - this.y));
      });
    };

    // 한 프레임 이동량이 커도 3D 절벽 경계를 뛰어넘지 않도록 <= 4px 단위로 나눠서 검사
    const steps = Math.max(1, Math.ceil(totalDist / 4));
    const subDist = totalDist / steps;
    let moved = false;

    for (let s = 0; s < steps; s++) {
      const onLedge = this.overlapsLedge(this.x, this.y);
      const stepX = vx * subDist;
      if (stepX) {
        const nx = this.x + stepX;
        if (!solid(nx, this.y) && (onLedge || !this.overlapsLedge(nx, this.y))) {
          this.setPosition(nx, this.y); moved = true;
        } else if (!vy && !this.grid.canStand(nx, this.y) && (onLedge || !this.overlapsLedge(nx, this.y))) {
          // 1칸 폭 계단·문으로 걸어들어갈 때 몸 중심이 해당 칸에 걸쳐 있으면 모서리 살짝 비켜줌
          const cx = Math.floor(this.x / TILE), cy = Math.floor((this.y - 2.5) / TILE);
          const tcx = Math.floor((nx + (stepX > 0 ? 5 - 0.01 : -5)) / TILE);
          const ty = cy * TILE + 10.5;
          if ((tcx === cx || this.grid.canStep(cx, cy, tcx, cy)) && this.grid.canStand(nx, ty) && (onLedge || !this.overlapsLedge(nx, ty))) {
            const dy = ty - this.y;
            const nudge = Math.sign(dy) * Math.min(Math.abs(stepX), Math.abs(dy));
            if (nudge && !solid(this.x, this.y + nudge) && (onLedge || !this.overlapsLedge(this.x, this.y + nudge))) { this.setPosition(this.x, this.y + nudge); moved = true; }
          }
        }
      }

      const curOnLedge = this.overlapsLedge(this.x, this.y);
      const stepY = vy * subDist;
      if (stepY) {
        const ny = this.y + stepY;
        const ledgeAhead = !curOnLedge && this.overlapsLedge(this.x, ny);
        if (ledgeAhead) {
          // 위에서 아래로 곧장 걸어가면 뛰어내림 (착지 칸이 비어 있을 때만)
          const cx = Math.floor(this.x / TILE), row = Math.floor((ny - 0.01) / TILE);
          if (stepY > 0 && dir === 'down' && this.grid.info.isLedge(cx, row) && this.grid.canStand(cx * TILE + 8, (row + 1) * TILE + 13)) { this.hop(row, cx); return; }
        } else if (!solid(this.x, ny)) {
          this.setPosition(this.x, ny); moved = true;
        } else if (!vx && !this.grid.canStand(this.x, ny)) {
          // 세로 이동 시 1칸 폭 계단·다리에 살짝 걸치면 가운데로 부드럽게 비켜줌
          const cx = Math.floor(this.x / TILE), cy = Math.floor((this.y - 2.5) / TILE);
          const tcy = Math.floor((ny + (stepY > 0 ? -0.01 : -5)) / TILE);
          const tx = cx * TILE + TILE / 2;
          if ((tcy === cy || this.grid.canStep(cx, cy, cx, tcy)) && this.grid.canStand(tx, ny) && (curOnLedge || !this.overlapsLedge(tx, ny))) {
            const dx = tx - this.x;
            const nudge = Math.sign(dx) * Math.min(Math.abs(stepY), Math.abs(dx));
            if (nudge && !solid(this.x + nudge, this.y) && (curOnLedge || !this.overlapsLedge(this.x + nudge, this.y))) { this.setPosition(this.x + nudge, this.y); moved = true; }
          }
        }
      }
    }

    this.moving = moved;
    if (moved) {
      this.play(input.run ? 'run' : 'walk', dir);
      this.dust += dt;
      if (input.run && this.dust > 135) { this.dust = 0; this.kickDust(); }
    } else this.play('idle', dir);
  }
  /** 순간이동 직후 등: 이동 상태 초기화 */
  stopStep() { this.moving = false; }

  /** 턱 넘어 뛰어내리기: 턱 칸을 지나 그 아래 칸 가운데에 착지 (포물선) */
  hopping = false;
  onHop?: () => void;
  onDust?: (x: number, y: number) => void;
  private hop(ledgeRow: number, cx: number) {
    this.busy = true; this.hopping = true; this.moving = true;
    const x0 = this.x, x1 = cx * TILE + 8, y0 = this.y, y1 = (ledgeRow + 1) * TILE + 13;
    this.play('walk', 'down');
    this.onHop?.();
    const st = { t: 0 };
    this.scene.tweens.add({ targets: st, t: 1, duration: 380, ease: 'Linear',
      onUpdate: () => {
        const x = x0 + (x1 - x0) * st.t, y = y0 + (y1 - y0) * st.t;
        const lift = Math.sin(Math.PI * st.t) * 9;
        this.sprite.setData('groundY', y);
        this.sprite.setData('lift', lift);
        this.setPosition(x, y - lift);
        this.shadow.setPosition(x, y);
      },
      onComplete: () => {
        this.sprite.setData('groundY', undefined);
        this.sprite.setData('lift', 0);
        this.setPosition(x1, y1);
        this.busy = false; this.hopping = false; this.kickDust(); this.kickDust();
      } });
  }

  private kickDust() {
    const [vx, vy] = DIR_VEC[this.dir];
    this.onDust?.(this.x - vx * 5, this.y - vy * 3);
    const p = this.scene.add.circle(this.x - vx * 5 + Phaser.Math.Between(-3, 3), this.y - 1, Phaser.Math.Between(1, 2), 0xe8d0a0, 0.55).setDepth(this.y - 1);
    this.scene.tweens.add({ targets: p, y: p.y - 4, alpha: 0, scale: 1.5, duration: 320, onComplete: () => p.destroy() });
  }
}
