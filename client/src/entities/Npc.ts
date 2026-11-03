import Phaser from 'phaser';
import { hhmmToMinutes, type NpcDef, type NpcScheduleEntry } from '@shared/data';
import type { Dir, Weather } from '@shared/types';
import { TILE, type CharacterMeta } from '../config';
import type { Grid } from '../world/Grid';
import { Character, facingFromVector } from './Character';

type State = 'walk' | 'idle' | 'talk' | 'gone';
const cellCenter = (cx: number, cy: number) => ({ x: cx * TILE + 8, y: cy * TILE + 13 });

/** 스케줄 기반 NPC: 시간대별 목적지(웨이포인트)로 A* 이동 → 서 있기/배회/작업/퇴장 */
export class Npc extends Character {
  state: State = 'idle';
  hearts = 0;
  met = false;
  talkedToday = false;
  private path: [number, number][] = [];
  private entryIdx = -1;
  private entry?: NpcScheduleEntry;
  private home = { x: 0, y: 0 };
  private timer = 0;
  private waitT = 0;
  private resumeState: State = 'idle';
  private greeting = false;

  constructor(scene: Phaser.Scene, readonly def: NpcDef, meta: CharacterMeta, private grid: Grid,
    private waypoints: Map<string, { x: number; y: number }>, zoom: number) {
    super(scene, def.sprite, 0, 0, meta);
    this.label = scene.add.text(0, 0, def.name, { fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '8px', color: '#fff8ec', stroke: '#3b2414', strokeThickness: 2, resolution: zoom })
      .setOrigin(0.5, 1).setAlpha(0);
  }

  private wp(name: string) { const p = this.waypoints.get(name); return p ? { cx: Math.floor(p.x / TILE), cy: Math.floor(p.y / TILE) } : { cx: 24, cy: 21 }; }
  cell(): [number, number] { return [Math.floor(this.x / TILE), Math.floor((this.y - 3) / TILE)]; }

  private activeIndex(minutes: number) {
    let idx = -1;
    this.def.schedule.forEach((e, i) => { if (hhmmToMinutes(e.time) <= minutes) idx = i; });
    return idx;
  }

  /** 새 날/게임 시작 시: 현재 시간의 스케줄 위치에 바로 배치 */
  resetForDay(minutes: number) {
    this.talkedToday = false;
    const idx = Math.max(0, this.activeIndex(minutes));
    const e = this.def.schedule[idx];
    this.entryIdx = idx; this.entry = e;
    const { cx, cy } = this.wp(e.to);
    const c = cellCenter(cx, cy);
    this.home = c;
    this.setPosition(c.x, c.y);
    this.path = [];
    this.sprite.setVisible(true).setAlpha(1); this.shadow.setVisible(true);
    if (e.idle === 'leave') this.vanish(false);
    else this.arrive();
  }

  private goTo(cx: number, cy: number) {
    const [sx, sy] = this.cell();
    const p = this.grid.findPath(sx, sy, cx, cy);
    if (p && p.length) { this.path = p; this.state = 'walk'; }
    else this.arrive();
  }

  private arrive() {
    this.state = 'idle';
    this.timer = 600 + Math.random() * 1500;
    const e = this.entry;
    if (!e) return;
    if (e.idle === 'stand' && e.face) this.play('idle', e.face);
    else this.play('idle', this.dir);
    if (e.idle === 'leave') this.vanish(true);
  }

  private vanish(fade: boolean) {
    this.state = 'gone';
    const done = () => { this.sprite.setVisible(false); this.shadow.setVisible(false); this.label?.setAlpha(0); this.hideEmote(); };
    if (fade) this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 600, onComplete: done }); else done();
  }

  beginTalk(px: number, py: number) {
    this.resumeState = this.state === 'talk' ? this.resumeState : this.state;
    this.state = 'talk';
    const dir = facingFromVector(px - this.x, py - this.y, this.dir);
    if (!this.busy) this.play('idle', dir);
    this.greeting = false; this.hideEmote();
  }
  endTalk() {
    this.state = this.resumeState === 'walk' && this.path.length ? 'walk' : 'idle';
    this.timer = 1200;
    this.showEmote(2, 1300);
  }

  pickLines(minutes: number, weather: Weather): string[] {
    const d = this.def.dialogue;
    if (!this.met) { this.met = true; return d.first; }
    const r = Math.random();
    if (weather === 'rain' && r < 0.45) return [Phaser.Utils.Array.GetRandom(d.rain)];
    const pool = minutes < 11 * 60 ? d.morning : minutes < 17 * 60 ? d.afternoon : d.evening;
    return [Phaser.Utils.Array.GetRandom(r < 0.65 ? pool : d.random)];
  }

  updateNpc(dt: number, minutes: number, player: { x: number; y: number }, talkable: boolean) {
    // 스케줄 전환
    const idx = this.activeIndex(minutes);
    if (idx !== this.entryIdx && idx >= 0 && this.state !== 'talk') {
      this.entryIdx = idx; this.entry = this.def.schedule[idx];
      if (this.state === 'gone') { // 퇴장 상태였다면 출구에서 재등장
        const ex = this.wp('wp_exit'); const c = cellCenter(ex.cx, ex.cy);
        this.setPosition(c.x, c.y); this.sprite.setVisible(true).setAlpha(1); this.shadow.setVisible(true).setAlpha(1);
      }
      const { cx, cy } = this.wp(this.entry.to);
      this.home = cellCenter(cx, cy);
      this.goTo(cx, cy);
    }
    if (this.state === 'gone') return;

    const dPlayer = Math.hypot(player.x - this.x, player.y - this.y);
    if (this.state === 'walk') this.walk(dt, player);
    else if (this.state === 'idle' && !this.busy) this.idleBehaviour(dt);

    // 근처에 오면 이름표 + 말 걸 수 있음 표시
    const near = dPlayer < 34;
    this.label?.setAlpha(Phaser.Math.Linear(this.label.alpha, near ? 1 : 0, 0.15));
    if (talkable && near && !this.talkedToday && !this.emote && this.state !== 'talk') { this.showEmote(0, 0); this.greeting = true; }
    if (this.greeting && (!near || this.talkedToday || this.state === 'talk')) { this.greeting = false; this.hideEmote(); }
    this.update();
  }

  private walk(dt: number, player: { x: number; y: number }) {
    const next = this.path[0];
    if (!next) { this.arrive(); return; }
    const t = cellCenter(next[0], next[1]);
    const dx = t.x - this.x, dy = t.y - this.y, dist = Math.hypot(dx, dy);
    // 플레이어가 길을 막으면 잠깐 대기
    const blocked = Math.hypot(player.x - t.x, player.y - t.y) < 10 && Math.hypot(player.x - this.x, player.y - this.y) < 20;
    if (blocked) {
      this.waitT += dt; this.play('idle', this.dir);
      if (this.waitT > 2500) { this.waitT = 0; this.showEmote(1, 900); this.goTo(this.path[this.path.length - 1][0], this.path[this.path.length - 1][1]); }
      return;
    }
    this.waitT = 0;
    const speed = this.def.speed * (this.def.run ? 1.2 : 1);
    const step = (speed * dt) / 1000;
    if (dist <= step) { this.setPosition(t.x, t.y); this.path.shift(); }
    else this.setPosition(this.x + (dx / dist) * step, this.y + (dy / dist) * step);
    this.dir = facingFromVector(dx, dy, this.dir);
    this.play(this.def.run ? 'run' : 'walk', this.dir);
  }

  private idleBehaviour(dt: number) {
    const e = this.entry; if (!e) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    if (e.idle === 'wander') {
      const r = e.radius ?? 2;
      const hc = { cx: Math.floor(this.home.x / TILE), cy: Math.floor(this.home.y / TILE) };
      for (let i = 0; i < 8; i++) {
        const cx = hc.cx + Phaser.Math.Between(-r, r), cy = hc.cy + Phaser.Math.Between(-r, r);
        if (!this.grid.blocked(cx, cy)) { this.goTo(cx, cy); break; }
      }
      this.timer = 1800 + Math.random() * 3000;
    } else if (e.idle === 'work') {
      const dirs: Dir[] = ['left', 'right', 'down'];
      const d = Phaser.Utils.Array.GetRandom(dirs);
      this.playOnce(e.work ?? 'water', d);
      this.timer = 2200 + Math.random() * 2400;
      if (Math.random() < 0.3) this.scene.time.delayedCall(900, () => { if (this.state === 'idle') this.goTo(Math.floor(this.home.x / TILE) + Phaser.Math.Between(-2, 2), Math.floor(this.home.y / TILE) + Phaser.Math.Between(-1, 1)); });
    } else {
      // 서 있기: 가끔 두리번
      if (Math.random() < 0.35) { const d = Phaser.Utils.Array.GetRandom(['left', 'right', 'down'] as Dir[]); this.play('idle', d); this.scene.time.delayedCall(1400, () => { if (this.state === 'idle' && this.entry?.face) this.play('idle', this.entry.face); }); }
      this.timer = 3000 + Math.random() * 4000;
    }
  }
}
