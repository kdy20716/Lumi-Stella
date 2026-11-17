import Phaser from 'phaser';
import { DIR_VEC, type Dir } from '@shared/types';
import { BIKE_SPEED, RUN_SPEED, TILE, WALK_SPEED, type CharacterMeta } from '../config';
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
  public slide: { vx: number; vy: number; mode: 'ice' | 'arrow'; remainPx: number; distPx: number } | null = null;
  public onSlideBlocked?: (x: number, y: number, vx: number, vy: number, distPx: number) => void;
  private stopGrace = 0;

  get isSliding() {
    return this.slide !== null;
  }

  startSlide(vx: number, vy: number, mode: 'ice' | 'arrow', remainPx = Infinity) {
    const len = Math.hypot(vx, vy) || 1;
    this.slide = { vx: vx / len, vy: vy / len, mode, remainPx, distPx: 0 };
  }

  stopSlide() {
    this.slide = null;
  }

  /** 타일·장애물 모서리에 살짝 겹쳐 끼었을 때 가장 가까운 통과 가능 좌표로 복구 */
  ensureUnstuck() {
    if (this.grid.canStand(this.x, this.y) && !this.overlapsLedge(this.x, this.y)) return;
    const dirs: [number, number][] = [
      [0, 1], [0, -1], [1, 0], [-1, 0],
      [0.707, 0.707], [-0.707, 0.707], [0.707, -0.707], [-0.707, -0.707],
    ];
    for (let r = 1; r <= 16; r++) {
      for (const [dx, dy] of dirs) {
        const nx = this.x + dx * r, ny = this.y + dy * r;
        if (this.grid.canStand(nx, ny) && !this.overlapsLedge(nx, ny)) {
          this.setPosition(nx, ny);
          return;
        }
      }
    }
    for (let r = 20; r <= 48; r += 4) {
      for (const [dx, dy] of dirs) {
        const nx = this.x + dx * r, ny = this.y + dy * r;
        if (this.grid.canStand(nx, ny) && !this.overlapsLedge(nx, ny)) {
          this.setPosition(nx, ny);
          return;
        }
      }
    }
  }

  move(dt: number, input: MoveInput, others: { x: number; y: number }[] = []) {
    if (this.busy) { this.moving = false; return; }
    this.ensureUnstuck();

    let { vx, vy } = input;
    let running = !!input.run;
    if (this.slide) {
      vx = this.slide.vx;
      vy = this.slide.vy;
      running = true;
    }

    const len = Math.hypot(vx, vy);
    if (len < 0.05) {
      this.moving = false;
      this.stopGrace = 0;
      this.play(this.riding ? 'bike_idle' : 'idle', this.dir);
      return;
    }
    vx /= len; vy /= len;   // 방향만 사용: 조이스틱을 살짝 밀어도 걷는 속도는 일정

    // 보는 방향 (그림은 4방향): 대각선이면 보던 축을 유지하고, 다른 축이 확실히 더 크면 바꿈
    const ax = Math.abs(vx), ay = Math.abs(vy), wasH = this.dir === 'left' || this.dir === 'right';
    const horizontal = ax > 0.01 && ay > 0.01 ? (wasH ? ax >= ay * 0.6 : ax > ay * 1.6) : ax >= ay;
    const dir: Dir = horizontal ? (vx > 0 ? 'right' : 'left') : (vy > 0 ? 'down' : 'up');

    let totalDist = (((this.riding ? BIKE_SPEED : running ? RUN_SPEED : WALK_SPEED)) * dt) / 1000;
    if (this.slide && Number.isFinite(this.slide.remainPx)) {
      totalDist = Math.min(totalDist, this.slide.remainPx);
    }

    const solid = (nx: number, ny: number) => {
      if (!this.grid.canStand(nx, ny)) return true;
      // 다른 사람과 겹치지 않기 (이미 겹쳐 있으면 멀어지는 쪽으로는 이동 허용)
      return others.some((o) => {
        const dx = Math.abs(o.x - nx), dy = Math.abs(o.y - ny);
        return dx < 9 && dy < 7 && (dx < Math.abs(o.x - this.x) || dy < Math.abs(o.y - this.y));
      });
    };

    const canOccupy = (nx: number, ny: number, wasOnLedge: boolean) =>
      !solid(nx, ny) && (wasOnLedge || !this.overlapsLedge(nx, ny));

    const findSlideSign = (
      axis: 'x' | 'y',
      targetPrimary: number,
      maxProbe: number,
      biasSign: number,
      wasOnLedge: boolean,
    ) => {
      const order = biasSign < 0 ? [-1, 1] : [1, -1];
      for (let d = 1; d <= maxProbe; d++) {
        for (const sgn of order) {
          const tx = axis === 'x' ? targetPrimary : this.x + sgn * d;
          const ty = axis === 'x' ? this.y + sgn * d : targetPrimary;
          if (canOccupy(tx, ty, wasOnLedge)) return { sgn, dist: d };
        }
      }
      return null;
    };

    // 한 프레임 이동량이 커도 3D 절벽 경계를 뛰어넘지 않도록 <= 3px 단위로 나눠서 검사
    const steps = Math.max(1, Math.ceil(totalDist / 3));
    const subDist = totalDist / steps;
    const startX = this.x, startY = this.y;
    let moved = false;

    for (let s = 0; s < steps; s++) {
      let stepMoved = false;
      const onLedge = this.overlapsLedge(this.x, this.y);
      const stepX = vx * subDist;
      if (Math.abs(stepX) > 1e-4) {
        const nx = this.x + stepX;
        if (canOccupy(nx, this.y, onLedge)) {
          this.setPosition(nx, this.y); moved = true; stepMoved = true;
        } else if (!this.slide) {
          // 1타일 입구나 사물 모서리에 걸치면 대각 입력 중에도 열린 쪽으로 부드럽게 비켜줌
          const cand = findSlideSign('x', nx, 8, vy, onLedge);
          if (cand) {
            const nudge = cand.sgn * Math.min(Math.abs(stepX) * 0.95, cand.dist);
            if (Math.abs(nudge) > 1e-4 && canOccupy(this.x, this.y + nudge, onLedge)) {
              this.setPosition(this.x, this.y + nudge);
              moved = true;
              stepMoved = true;
            }
          }
        }
      }

      const curOnLedge = this.overlapsLedge(this.x, this.y);
      const stepY = vy * subDist;
      if (Math.abs(stepY) > 1e-4) {
        const ny = this.y + stepY;
        const ledgeAhead = !curOnLedge && this.overlapsLedge(this.x, ny);
        if (ledgeAhead) {
          // 위에서 아래로 곧장 걸어가면 뛰어내림 (착지 칸이 비어 있을 때만)
          const cx = Math.floor(this.x / TILE), row = Math.floor((ny - 0.01) / TILE);
          if (stepY > 0 && dir === 'down' && this.grid.info.isLedge(cx, row) && this.grid.canStand(cx * TILE + 8, (row + 1) * TILE + 13)) {
            this.slide = null;
            this.hop(row, cx);
            return;
          }
        } else if (!solid(this.x, ny)) {
          this.setPosition(this.x, ny); moved = true; stepMoved = true;
        } else if (!this.slide) {
          const cand = findSlideSign('y', ny, 10, vx, curOnLedge);
          if (cand) {
            const nudge = cand.sgn * Math.min(Math.abs(stepY) * 0.95, cand.dist);
            if (Math.abs(nudge) > 1e-4 && canOccupy(this.x + nudge, this.y, curOnLedge)) {
              this.setPosition(this.x + nudge, this.y);
              moved = true;
              stepMoved = true;
            }
          }
        }
      }

      // 빙판·화살표 직선 미끄럼 중에는 타일 중심선으로 부드럽게 정렬해 1칸 통로 안착
      if (this.slide && stepMoved) {
        if (Math.abs(vx) < 0.25) {
          const tx = Math.floor(this.x / TILE) * TILE + TILE * 0.5;
          const dx = tx - this.x;
          if (Math.abs(dx) > 0.25) {
            const pull = Math.sign(dx) * Math.min(Math.abs(dx), subDist * 0.5);
            if (canOccupy(this.x + pull, this.y, this.overlapsLedge(this.x, this.y))) {
              this.setPosition(this.x + pull, this.y);
            }
          }
        } else if (Math.abs(vy) < 0.25) {
          const ty = Math.floor((this.y - 2) / TILE) * TILE + TILE * 0.6875;
          const dy = ty - this.y;
          if (Math.abs(dy) > 0.25) {
            const pull = Math.sign(dy) * Math.min(Math.abs(dy), subDist * 0.5);
            if (canOccupy(this.x, this.y + pull, this.overlapsLedge(this.x, this.y))) {
              this.setPosition(this.x, this.y + pull);
            }
          }
        }
      }
    }

    const actualDisp = Math.hypot(this.x - startX, this.y - startY);
    if (this.slide) {
      this.slide.distPx += actualDisp;
      if (Number.isFinite(this.slide.remainPx)) {
        this.slide.remainPx -= totalDist;
      }
      if (actualDisp < 0.06 || this.slide.remainPx <= 0.1) {
        const s = this.slide;
        this.slide = null;
        if (actualDisp < 0.06 && s.mode === 'ice' && this.onSlideBlocked) {
          this.onSlideBlocked(this.x, this.y, s.vx, s.vy, s.distPx);
        }
      }
    }

    const trulyMoved = moved && actualDisp > 0.08;
    if (trulyMoved) this.stopGrace = 65;
    else this.stopGrace = Math.max(0, this.stopGrace - dt);

    this.moving = trulyMoved;
    if (trulyMoved) {
      this.play(this.slide?.mode === 'ice' ? (this.riding ? 'bike_idle' : 'idle') : this.riding ? 'bike' : running ? 'run' : 'walk', dir);
      this.dust += dt;
      if ((running || this.riding) && !this.slide && this.dust > (this.riding ? 105 : 135)) { this.dust = 0; this.kickDust(); }
    } else if (this.stopGrace <= 0) {
      this.play(this.riding ? 'bike_idle' : 'idle', dir);
    }
  }
  /** 순간이동 직후 등: 이동 상태 초기화 */
  stopStep() { this.moving = false; this.slide = null; this.stopGrace = 0; }

  /** 자전거 탑승 여부 */
  riding = false;
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
