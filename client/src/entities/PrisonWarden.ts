// 별빛 교도소 경찰 감시관 AI:
//  1) PATROL: 지정 경로 순찰 (파란/노란 경계 시야각)
//  2) SUSPICIOUS ('?' 띄우고 제자리 정지): 플레이어 포착 시 즉시 멈춰 '?' 표시, 3초 경과 또는 더 가까워지면 CHASE 전환!
//     (3초 안에 시야 밖/벽 뒤로 숨으면 의심이 가라앉고 순찰 복귀!)
//  3) CHASE ('!' 띄우고 빠른 추격): 붉은 경고 시야각 + 맹렬한 속도로 플레이어를 향해 전력 질주! 접촉 시 체포(지하 5층 원점 복귀)
import Phaser from 'phaser';
import type { Dir } from '@shared/types';
import { DEPTH, TILE, type CharacterMeta } from '../config';
import { Character } from './Character';

export type WardenState = 'patrol' | 'suspicious' | 'chase';

export interface WardenConeData {
  ox: number;
  oy: number;
  points: { x: number; y: number }[];
  state: WardenState;
  alerted: boolean;
  suspicionRatio: number;
}

const SIGHT_RANGE_PX = 4.9 * TILE;       // 시야 거리 (~78px)
const CLOSE_CHASE_PX = 2.15 * TILE;      // 이 거리 이내로 가까워지면 3초 안 기다리고 즉시 '!' 추격!
const CATCH_PX = 13.5;                   // 실제 체포 접촉 반경
const HALF_FOV = (35 * Math.PI) / 180;
const CONE_RAYS = 15;
const SUSPICION_MAX_MS = 3000;           // 마주쳤을 때 '?' 상태로 버틸 수 있는 시간 (3초!)
const CHASE_SPEED = 112;                 // 추격 질주 속도 (플레이어 걷기보다 빠르고, 달리기와 아슬아슬한 스릴!)
const CHASE_LOSE_MS = 3400;              // 시야에서 완전히 놓친 뒤 추격 포기까지

export class PrisonWarden extends Character {
  private readonly waypoints: { x: number; y: number }[];
  private readonly patrolSpeed: number;
  private readonly isWall: (tx: number, ty: number) => boolean;
  private wpIdx = 1;
  private waitMs = 0;
  private facingRad = 0;

  aiState: WardenState = 'patrol';
  suspicionMs = 0;
  private loseSightMs = 0;
  private lastSeenX = 0;
  private lastSeenY = 0;
  private emoteShownState: WardenState = 'patrol';

  private coneGfx: Phaser.GameObjects.Graphics;
  private gaugeGfx: Phaser.GameObjects.Graphics;
  private coneData: WardenConeData;

  constructor(
    scene: Phaser.Scene,
    sheet: string,
    meta: CharacterMeta,
    route: [number, number][],
    speed: number,
    isWall: (tx: number, ty: number) => boolean,
    zoom: number,
  ) {
    const start = route[0] ?? [9, 6];
    const sx = start[0] * TILE + 8;
    const sy = start[1] * TILE + 12;
    super(scene, sheet, sx, sy, meta);
    this.waypoints = route.map(([cx, cy]) => ({ x: cx * TILE + 8, y: cy * TILE + 12 }));
    this.patrolSpeed = Math.max(26, speed);
    this.isWall = isWall;
    if (this.waypoints.length > 1) {
      this.facingRad = Math.atan2(this.waypoints[1].y - sy, this.waypoints[1].x - sx);
      this.dir = this.dirFromAngle(this.facingRad);
      this.play('walk', this.dir, false);
    }
    this.label = scene.add.text(sx, sy - 26, '👮 경찰 감시관', {
      fontFamily: 'Galmuri9, Galmuri11, sans-serif',
      fontSize: '7px',
      color: '#93c5fd',
      stroke: '#0f172a',
      strokeThickness: 2,
      resolution: zoom,
    }).setOrigin(0.5, 1).setDepth(DEPTH.ui);
    this.coneGfx = scene.add.graphics().setDepth(DEPTH.cursor - 2);
    this.gaugeGfx = scene.add.graphics().setDepth(DEPTH.overlay + 4);
    this.coneData = { ox: sx, oy: sy - 4, points: [], state: 'patrol', alerted: false, suspicionRatio: 0 };
    this.recomputeCone();
  }

  private dirFromAngle(rad: number): Dir {
    const c = Math.cos(rad), s = Math.sin(rad);
    if (Math.abs(c) >= Math.abs(s)) return c >= 0 ? 'right' : 'left';
    return s >= 0 ? 'down' : 'up';
  }

  private raycastDist(ox: number, oy: number, ang: number, maxDist: number): number {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const step = 3.5;
    for (let d = step; d <= maxDist; d += step) {
      const px = ox + dx * d;
      const py = oy + dy * d;
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (this.isWall(tx, ty)) return Math.max(0, d - step * 0.5);
    }
    return maxDist;
  }

  private canStandAt(px: number, py: number): boolean {
    const hw = 4.5, hh = 4.5;
    const x0 = Math.floor((px - hw) / TILE), x1 = Math.floor((px + hw) / TILE);
    const y0 = Math.floor((py - hh) / TILE), y1 = Math.floor((py - 0.5) / TILE);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.isWall(x, y)) return false;
    return true;
  }

  /** 시야선 + 시야각 내 플레이어 포착 여부 + 거리 반환 */
  private detectPlayer(px: number, py: number): { visible: boolean; dist: number } {
    const ox = this.x;
    const oy = this.y - 4;
    const ty = py - 4;
    const dist = Math.hypot(px - ox, ty - oy);
    if (dist <= 16) return { visible: true, dist };
    if (dist > SIGHT_RANGE_PX) return { visible: false, dist };
    const ang = Math.atan2(ty - oy, px - ox);
    let diff = ang - this.facingRad;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    // 추격 중에는 시야각이 넓어져 쫓기며 도망치는 긴박감 강화
    const fov = this.aiState === 'chase' ? HALF_FOV * 1.65 : HALF_FOV;
    if (Math.abs(diff) > fov) return { visible: false, dist };
    const clearDist = this.raycastDist(ox, oy, ang, dist);
    return { visible: clearDist >= dist - 5, dist };
  }

  private recomputeCone() {
    const ox = this.x;
    const oy = this.y - 4;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < CONE_RAYS; i++) {
      const t = i / (CONE_RAYS - 1);
      const ang = this.facingRad - HALF_FOV + t * HALF_FOV * 2;
      const d = this.raycastDist(ox, oy, ang, SIGHT_RANGE_PX);
      pts.push({ x: ox + Math.cos(ang) * d, y: oy + Math.sin(ang) * d });
    }
    const ratio = Math.min(1, this.suspicionMs / SUSPICION_MAX_MS);
    this.coneData = { ox, oy, points: pts, state: this.aiState, alerted: this.aiState === 'chase', suspicionRatio: ratio };

    this.coneGfx.clear();
    if (pts.length >= 2) {
      const fillCol = this.aiState === 'chase' ? 0xef4444 : this.aiState === 'suspicious' ? 0xf59e0b : 0x3b82f6;
      const lineCol = this.aiState === 'chase' ? 0xfef08a : this.aiState === 'suspicious' ? 0xfde047 : 0x93c5fd;
      const alpha = this.aiState === 'chase' ? 0.44 : this.aiState === 'suspicious' ? 0.36 : 0.24;
      this.coneGfx.fillStyle(fillCol, alpha);
      this.coneGfx.lineStyle(1, lineCol, 0.78);
      this.coneGfx.beginPath();
      this.coneGfx.moveTo(ox, oy);
      for (const p of pts) this.coneGfx.lineTo(p.x, p.y);
      this.coneGfx.closePath();
      this.coneGfx.fillPath();
      this.coneGfx.strokePath();
    }

    // '?' 의심 중 머리 위 3초 긴박 게이지 바
    this.gaugeGfx.clear();
    if (this.aiState === 'suspicious' && ratio > 0.02) {
      const bw = 20, bh = 3;
      const gx = this.x - bw / 2, gy = this.y - 36;
      this.gaugeGfx.fillStyle(0x0f172a, 0.85).fillRect(gx - 1, gy - 1, bw + 2, bh + 2);
      this.gaugeGfx.fillStyle(ratio > 0.65 ? 0xef4444 : 0xfacc15, 1).fillRect(gx, gy, Math.round(bw * ratio), bh);
    }
  }

  getConeData(): WardenConeData {
    return this.coneData;
  }

  resetPatrol() {
    const start = this.waypoints[0] ?? { x: this.x, y: this.y };
    this.setPosition(start.x, start.y);
    this.wpIdx = this.waypoints.length > 1 ? 1 : 0;
    this.waitMs = 0;
    this.aiState = 'patrol';
    this.suspicionMs = 0;
    this.loseSightMs = 0;
    this.emoteShownState = 'patrol';
    this.hideEmote();
    this.recomputeCone();
  }

  /** 매 프레임 AI 갱신: 상태 변화 이벤트('suspicious' | 'chase' | 'caught' | null) 반환 */
  tickAI(dt: number, px: number, py: number, frozen = false): 'suspicious' | 'chase' | 'caught' | null {
    let event: 'suspicious' | 'chase' | 'caught' | null = null;
    if (!frozen) {
      const det = this.detectPlayer(px, py);

      // 1) 이미 추격 중이라면 플레이어와 접촉 시 즉시 체포!
      if (det.dist <= CATCH_PX) {
        this.aiState = 'chase';
        this.showEmote(1, 1400);
        this.emoteShownState = 'chase';
        this.update();
        this.recomputeCone();
        return 'caught';
      }

      if (this.aiState === 'patrol') {
        if (det.visible) {
          this.lastSeenX = px;
          this.lastSeenY = py;
          this.facingRad = Math.atan2(py - this.y, px - this.x);
          this.dir = this.dirFromAngle(this.facingRad);
          if (det.dist <= CLOSE_CHASE_PX) {
            this.aiState = 'chase';
            this.suspicionMs = SUSPICION_MAX_MS;
            this.loseSightMs = 0;
            event = 'chase';
          } else {
            // 마주치면 제자리에 딱 멈추고 '?' 띄움!
            this.aiState = 'suspicious';
            this.suspicionMs = dt;
            event = 'suspicious';
          }
          this.play('idle', this.dir);
        } else {
          this.stepPatrol(dt);
        }
      } else if (this.aiState === 'suspicious') {
        // 제자리에 딱 멈춘 채 플레이어 쪽을 노려보며 3초 의심 게이지 충전!
        this.play('idle', this.dir);
        if (det.visible) {
          this.lastSeenX = px;
          this.lastSeenY = py;
          this.facingRad = Math.atan2(py - this.y, px - this.x);
          this.dir = this.dirFromAngle(this.facingRad);
          this.suspicionMs += dt;
          if (det.dist <= CLOSE_CHASE_PX || this.suspicionMs >= SUSPICION_MAX_MS) {
            this.aiState = 'chase';
            this.suspicionMs = SUSPICION_MAX_MS;
            this.loseSightMs = 0;
            event = 'chase';
          }
        } else {
          // 시야 밖으로 숨으면 의심이 빠르게 식어 순찰 복귀
          this.suspicionMs = Math.max(0, this.suspicionMs - dt * 1.45);
          if (this.suspicionMs <= 0) {
            this.aiState = 'patrol';
          }
        }
      } else if (this.aiState === 'chase') {
        if (det.visible) {
          this.lastSeenX = px;
          this.lastSeenY = py;
          this.loseSightMs = 0;
        } else {
          this.loseSightMs += dt;
        }
        // 플레이어(또는 마지막 목격 지점)를 향해 빠르게 전력 질주!
        const dx = this.lastSeenX - this.x;
        const dy = this.lastSeenY - this.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 3) {
          this.facingRad = Math.atan2(dy, dx);
          this.dir = this.dirFromAngle(this.facingRad);
          const step = (CHASE_SPEED * dt) / 1000;
          const mx = (dx / dist) * step;
          const my = (dy / dist) * step;
          const nx = this.x + mx;
          const ny = this.y + my;
          if (this.canStandAt(nx, ny)) {
            this.setPosition(nx, ny);
          } else if (Math.abs(mx) > 0.05 && this.canStandAt(nx, this.y)) {
            this.setPosition(nx, this.y);
          } else if (Math.abs(my) > 0.05 && this.canStandAt(this.x, ny)) {
            this.setPosition(this.x, ny);
          }
          this.play('run', this.dir);
        } else {
          this.play('idle', this.dir);
        }
        if (this.loseSightMs >= CHASE_LOSE_MS) {
          this.aiState = 'patrol';
          this.suspicionMs = 0;
          this.loseSightMs = 0;
        }
      }

      // 상태에 맞춰 '?' (frame 3) / '!' (frame 1) 감정표현 동기화
      if (this.aiState !== this.emoteShownState) {
        this.emoteShownState = this.aiState;
        if (this.aiState === 'suspicious') this.showEmote(3, 0);
        else if (this.aiState === 'chase') this.showEmote(1, 0);
        else this.hideEmote();
      }
      if (this.label) {
        this.label.setText(this.aiState === 'chase' ? '🚨 추격 중!' : this.aiState === 'suspicious' ? '❓ 누구냐?!' : '👮 경찰 감시관');
        this.label.setColor(this.aiState === 'chase' ? '#fca5a5' : this.aiState === 'suspicious' ? '#fde047' : '#93c5fd');
      }
    }

    this.update();
    if (this.label) this.label.setPosition(this.x, this.y - 26);
    this.recomputeCone();
    return event;
  }

  private stepPatrol(dt: number) {
    if (this.waypoints.length <= 1) {
      this.play('idle', this.dir);
      return;
    }
    if (this.waitMs > 0) {
      this.waitMs -= dt;
      this.play('idle', this.dir);
      if (this.waitMs <= 0) {
        this.wpIdx = (this.wpIdx + 1) % this.waypoints.length;
        const next = this.waypoints[this.wpIdx];
        this.facingRad = Math.atan2(next.y - this.y, next.x - this.x);
        this.dir = this.dirFromAngle(this.facingRad);
      }
      return;
    }
    const tgt = this.waypoints[this.wpIdx];
    const dx = tgt.x - this.x;
    const dy = tgt.y - this.y;
    const dist = Math.hypot(dx, dy);
    const step = (this.patrolSpeed * dt) / 1000;
    if (dist <= step) {
      this.setPosition(tgt.x, tgt.y);
      this.waitMs = 520;
      this.play('idle', this.dir);
    } else {
      this.facingRad = Math.atan2(dy, dx);
      this.dir = this.dirFromAngle(this.facingRad);
      const nx = this.x + (dx / dist) * step;
      const ny = this.y + (dy / dist) * step;
      if (this.canStandAt(nx, ny)) this.setPosition(nx, ny);
      else this.wpIdx = (this.wpIdx + 1) % this.waypoints.length;
      this.play('walk', this.dir);
    }
  }

  override destroy() {
    this.coneGfx.destroy();
    this.gaugeGfx.destroy();
    super.destroy();
  }
}
