import Phaser from 'phaser';
import { hhmmToMinutes, type NpcDef, type NpcScheduleEntry } from '@shared/data';
import type { Dir, MapId, Weather } from '@shared/types';
import { TILE, type CharacterMeta } from '../config';
import type { Grid } from '../world/Grid';
import { Character, facingFromVector } from './Character';

type State = 'walk' | 'idle' | 'talk' | 'gone';
const cellCenter = (cx: number, cy: number) => ({ x: cx * TILE + 8, y: cy * TILE + 13 });
/** 건물 실내 → 바깥 맵에서 그 건물 문 앞 웨이포인트 */
const DOOR_WP: Partial<Record<MapId, string>> = { in_store: 'wp_store', in_cafe: 'wp_cafe', in_lab: 'wp_lab', in_smithy: 'wp_smithy', in_center: 'wp_center', in_shop_w: 'wp_shop' };

/** 맵 전환(씬 재시작)에도 유지되는 NPC 기억: 만남 여부, 호감도, 마지막으로 대화한 날 */
const MEMORY = new Map<string, { met: boolean; hearts: number; talkedDay: number }>();

/**
 * 스케줄 기반 NPC (여러 맵을 오감)
 *  - 스케줄 항목의 map 이 현재 씬의 맵이면: 웨이포인트로 A* 이동 → 서 있기/배회/작업/연주/퇴장
 *  - 다른 맵이면: 이 맵의 출입구(wp_gate)로 걸어가 사라짐 → 그 맵 씬에서는 출입구에서 등장
 */
export class Npc extends Character {
  state: State = 'idle';
  private path: [number, number][] = [];
  private entryIdx = -1;
  private entry?: NpcScheduleEntry;
  private home = { x: 0, y: 0 };
  private timer = 0;
  private waitT = 0;
  private resumeState: State = 'idle';
  private greeting = false;
  private exiting = false;   // 다른 맵으로 가는 중(출입구에서 사라짐)
  private vanishAt?: { x: number; y: number };

  constructor(scene: Phaser.Scene, readonly def: NpcDef, meta: CharacterMeta, private grid: Grid,
    private waypoints: Map<string, { x: number; y: number }>, zoom: number, private mapId: MapId) {
    super(scene, def.sprite, 0, 0, meta);
    this.label = scene.add.text(0, 0, def.name, { fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '8px', color: '#fff8ec', stroke: '#3b2414', strokeThickness: 2, resolution: zoom })
      .setOrigin(0.5, 1).setAlpha(0);
    if (!MEMORY.has(def.id)) MEMORY.set(def.id, { met: false, hearts: 0, talkedDay: -1 });
  }

  private get mem() { return MEMORY.get(this.def.id)!; }
  get hearts() { return this.mem.hearts; }
  talkedOn(day: number) { return this.mem.talkedDay === day; }

  private wp(name: string) { const p = this.waypoints.get(name); return p ? { cx: Math.floor(p.x / TILE), cy: Math.floor(p.y / TILE) } : null; }
  /** 다른 맵으로 오가는 출입구: 그 맵이 이 맵의 건물 실내면 그 건물 문 앞, 아니면 맵 출입구(wp_gate) */
  private gate(other?: MapId) { const d = other ? DOOR_WP[other] : undefined; return (d && this.wp(d)) || this.wp('wp_gate') || { cx: 0, cy: 20 }; }
  cell(): [number, number] { return [Math.floor(this.x / TILE), Math.floor((this.y - 3) / TILE)]; }
  private entryMap(e?: NpcScheduleEntry): MapId { return (e?.map ?? 'farm') as MapId; }

  private activeIndex(minutes: number) {
    let idx = -1;
    this.def.schedule.forEach((e, i) => { if (hhmmToMinutes(e.time) <= minutes) idx = i; });
    return idx;
  }

  /** 씬 시작 / 새 날: 현재 시간의 스케줄 위치에 바로 배치 */
  resetForDay(minutes: number) {
    const idx = Math.max(0, this.activeIndex(minutes));
    const e = this.def.schedule[idx];
    this.entryIdx = idx; this.entry = e; this.path = []; this.exiting = false;
    const here = this.entryMap(e) === this.mapId;
    const target = here ? this.wp(e.to) : null;
    if (!here || !target || e.idle === 'leave') {
      // 이 맵에 없음: 나중에 등장할 위치 기억
      const p = here && target ? target : this.gate(this.entryMap(e));
      this.vanishAt = cellCenter(p.cx, p.cy);
      this.setPosition(this.vanishAt.x, this.vanishAt.y);
      this.vanish(false);
      return;
    }
    const c = cellCenter(target.cx, target.cy);
    this.home = c; this.setPosition(c.x, c.y);
    this.show();
    this.arrive();
  }

  private show() {
    this.state = 'idle';
    this.sprite.setVisible(true).setAlpha(1); this.shadow.setVisible(true).setAlpha(1);
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
    if (this.exiting) { this.vanish(true); return; }
    const e = this.entry; if (!e) return;
    if ((e.idle === 'stand' || e.idle === 'perform') && e.face) this.play('idle', e.face);
    else this.play('idle', this.dir);
    if (e.idle === 'leave') this.vanish(true);
  }

  private vanish(fade: boolean) {
    this.state = 'gone';
    this.vanishAt = { x: this.x, y: this.y };
    const done = () => { this.sprite.setVisible(false); this.shadow.setVisible(false); this.label?.setAlpha(0); this.hideEmote(); };
    if (fade) this.scene.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 600, onComplete: done }); else done();
  }

  beginTalk(px: number, py: number, day: number) {
    this.resumeState = this.state === 'talk' ? this.resumeState : this.state;
    this.state = 'talk';
    const dir = facingFromVector(px - this.x, py - this.y, this.dir);
    if (!this.busy) this.play('idle', dir);
    this.greeting = false; this.hideEmote();
    const m = this.mem;
    if (m.talkedDay !== day) { m.talkedDay = day; m.hearts = Math.min(5, m.hearts + 1); }
  }
  endTalk() {
    this.state = this.resumeState === 'walk' && this.path.length ? 'walk' : 'idle';
    this.timer = 1200;
    this.showEmote(2, 1300);
  }

  pickLines(minutes: number, weather: Weather): string[] {
    const d = this.def.dialogue;
    if (!this.mem.met) { this.mem.met = true; return d.first; }
    const r = Math.random();
    if (weather === 'rain' && r < 0.45) return [Phaser.Utils.Array.GetRandom(d.rain)];
    const pool = minutes < 11 * 60 ? d.morning : minutes < 17 * 60 ? d.afternoon : d.evening;
    return [Phaser.Utils.Array.GetRandom(r < 0.65 ? pool : d.random)];
  }

  updateNpc(dt: number, minutes: number, day: number, player: { x: number; y: number }, talkable: boolean) {
    // 스케줄 전환
    const idx = this.activeIndex(minutes);
    if (idx !== this.entryIdx && idx >= 0 && this.state !== 'talk') {
      const prevMap = this.entryMap(this.entry);
      this.entryIdx = idx; this.entry = this.def.schedule[idx];
      const nextMap = this.entryMap(this.entry);
      if (nextMap === this.mapId) {
        if (this.state === 'gone') {
          // 다른 맵에서 왔으면 출입구에서, 집에서 나오면 그 문 앞에서 등장
          const g = this.gate(prevMap); const from = prevMap !== this.mapId ? cellCenter(g.cx, g.cy) : (this.vanishAt ?? cellCenter(g.cx, g.cy));
          this.setPosition(from.x, from.y); this.show(); this.sprite.setAlpha(0);
          this.scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 400 });
        }
        this.exiting = false;
        const t = this.wp(this.entry.to);
        if (t) { this.home = cellCenter(t.cx, t.cy); this.goTo(t.cx, t.cy); }
      } else if (this.state !== 'gone') {
        // 다른 맵으로 이동: 출입구로 걸어가서 사라짐
        this.exiting = true;
        const g = this.gate(nextMap); this.goTo(g.cx, g.cy);
      }
    }
    if (this.state === 'gone') { this.update(); return; }

    const dPlayer = Math.hypot(player.x - this.x, player.y - this.y);
    if (this.state === 'walk') this.walk(dt, player);
    else if (this.state === 'idle' && !this.busy) this.idleBehaviour(dt);

    const near = dPlayer < 34;
    this.label?.setAlpha(Phaser.Math.Linear(this.label.alpha, near ? 1 : 0, 0.15));
    const talked = this.talkedOn(day);
    if (talkable && near && !talked && !this.emote && this.state !== 'talk') { this.showEmote(0, 0); this.greeting = true; }
    if (this.greeting && (!near || talked || this.state === 'talk')) { this.greeting = false; this.hideEmote(); }
    this.update();
  }

  private walk(dt: number, player: { x: number; y: number }) {
    const next = this.path[0];
    if (!next) { this.arrive(); return; }
    const t = cellCenter(next[0], next[1]);
    const dx = t.x - this.x, dy = t.y - this.y, dist = Math.hypot(dx, dy);
    const blocked = Math.hypot(player.x - t.x, player.y - t.y) < 10 && Math.hypot(player.x - this.x, player.y - this.y) < 20;
    if (blocked) {
      this.waitT += dt; this.play('idle', this.dir);
      if (this.waitT > 2500) { this.waitT = 0; this.showEmote(1, 900); const last = this.path[this.path.length - 1]; this.goTo(last[0], last[1]); }
      return;
    }
    this.waitT = 0;
    const step = (this.def.speed * (this.def.run ? 1.2 : 1) * dt) / 1000;
    if (dist <= step) { this.setPosition(t.x, t.y); this.path.shift(); }
    else this.setPosition(this.x + (dx / dist) * step, this.y + (dy / dist) * step);
    this.dir = facingFromVector(dx, dy, this.dir);
    this.play(this.def.run ? 'run' : 'walk', this.dir);
  }

  private idleBehaviour(dt: number) {
    const e = this.entry; if (!e) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    const hc = { cx: Math.floor(this.home.x / TILE), cy: Math.floor(this.home.y / TILE) };
    if (e.idle === 'wander') {
      const r = e.radius ?? 2;
      for (let i = 0; i < 8; i++) {
        const cx = hc.cx + Phaser.Math.Between(-r, r), cy = hc.cy + Phaser.Math.Between(-r, r);
        if (!this.grid.blocked(cx, cy)) { this.goTo(cx, cy); break; }
      }
      this.timer = 1800 + Math.random() * 3000;
    } else if (e.idle === 'work') {
      const d: Dir = e.face ?? Phaser.Utils.Array.GetRandom(['left', 'right', 'down'] as Dir[]);
      this.playOnce(e.work ?? 'water', d);
      this.timer = 2200 + Math.random() * 2400;
      if (!e.face && Math.random() < 0.3) this.scene.time.delayedCall(900, () => { if (this.state === 'idle') this.goTo(hc.cx + Phaser.Math.Between(-2, 2), hc.cy + Phaser.Math.Between(-1, 1)); });
    } else if (e.idle === 'perform') {
      // 연주: 음표 말풍선 + 리듬 타기
      this.showEmote(4, 1800);
      this.scene.tweens.add({ targets: this.sprite, scaleY: { from: 0.94, to: 1 }, duration: 260, yoyo: true, repeat: 3 });
      this.timer = 2600 + Math.random() * 1500;
    } else {
      if (Math.random() < 0.35) { const d = Phaser.Utils.Array.GetRandom(['left', 'right', 'down'] as Dir[]); this.play('idle', d); this.scene.time.delayedCall(1400, () => { if (this.state === 'idle' && this.entry?.face) this.play('idle', this.entry.face); }); }
      this.timer = 3000 + Math.random() * 4000;
    }
  }
}
