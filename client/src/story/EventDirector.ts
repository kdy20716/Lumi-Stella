// 본편 사건 감독 (shared/data/chapters.json)
//  - 맵에 들어오면 이 맵에서 일어날 다음 사건을 찾아서: 대사 → 승부(있으면) → 승리 뒤 대사 → 다음 사건
//  - 진행(깃발) · 보상 · 막힌 길은 권한자(서버/로컬 시뮬레이션)가 검증하고, 여기서는 연출만
import { CHAPTERS, nextEvent, type CastDef, type StoryEvent } from '@shared/data';
import { rivalOf } from '@shared/story';
import { DIR_VEC } from '@shared/types';
import { TILE } from '../config';
import { music } from '../audio/Music';
import { ui } from '../ui/UI';
import { showCredits } from '../ui/Credits';
import { captureMemory, loadMemories } from './Memories';
import { Actor, cellCenter } from './Actor';
import type { StoryHost } from './StoryDirector';

/** 성간단 쪽 인물 (사건 음악 · 위기 음악 판단용) */
export const VILLAIN_CAST = new Set(['boss', 'c1', 'c2', 'c3', 'c4', 'sci1', 'grunt_m', 'grunt_f', 'elite_m', 'elite_f']);

export class EventDirector {
  /** 엔딩 크레딧 뒤 내 집 앞으로 옮겨진 다음, 새 장면에서 에필로그를 이어서 */
  static pendingEpilogue = false;
  private busy = false;
  private actors: Actor[] = [];
  constructor(private h: StoryHost) {}

  private get me() { return this.h.auth.me; }
  private fill(s: string) { return s.replaceAll('{me}', this.me.name).replaceAll('{rival}', rivalOf(this.me.look).name); }
  private cast(id: string): CastDef {
    if (id === 'rival') { const r = rivalOf(this.me.look); return { name: r.name, title: '소꿉친구', sprite: r.look, color: r.look === 'rival_f' ? '#3fb07a' : '#2f68c0' }; }
    return CHAPTERS.cast[id] ?? { name: id, sprite: 'villager' };
  }
  private async lines(rows: string[][] | undefined) {
    for (const [who, ...pages] of rows ?? []) {
      const c = this.cast(who);
      await ui.dialogue.say({ name: c.name, title: c.title, sprite: c.sprite, color: c.color, pages: pages.map((t) => this.fill(t)) });
    }
  }
  /** 승부 상대를 주인공 앞(보는 방향 2칸)에 세움 */
  private standIn(id: string) {
    const c = this.cast(id), meta = this.h.manifest.characters[c.sprite]; if (!meta) return null;
    const [px, py] = this.h.player.cell(), [dx, dy] = DIR_VEC[this.h.player.dir];
    const grid = this.h.world.grid;
    const spot = [[px + dx * 2, py + dy * 2], [px + dx, py + dy], [px + 1, py], [px - 1, py], [px, py + 1]].find(([x, y]) => !grid.blocked(x, y)) ?? [px + dx, py + dy];
    const at = cellCenter(spot[0], spot[1]);
    const a = new Actor(this.h.scene, id, c.sprite, at.x, at.y, meta, grid, c.name, this.h.zoom);
    a.faceTo(this.h.player.x, this.h.player.y);
    this.actors.push(a);
    return a;
  }
  update(dt: number) { for (const a of this.actors) if (a.sprite.active) a.tick(dt); this.actors = this.actors.filter((a) => a.sprite.active); }

  /** 맵에 들어왔을 때 · 사건이나 승부가 끝났을 때 */
  check() {
    if (this.busy || this.me.mode !== 'story') return;   // 본편 사건은 스토리 모드에서만
    const ev = nextEvent({ ...this.me, map: this.h.mapId });
    if (ev) void this.run(ev);
  }

  private async run(ev: StoryEvent) {
    this.busy = true; this.h.lock();
    const ch = CHAPTERS.chapters.find((c) => c.n === ev.chapter);
    if (ch && !CHAPTERS.events.some((e) => e.chapter === ev.chapter && this.me.flags?.includes(e.id))) ui.banner.show(ch.title, '');
    await new Promise<void>((r) => this.h.scene.time.delayedCall(500, r));
    const foe = ev.battle ? this.standIn(ev.battle.cast) : null;
    // 사건 음악: 지정이 없으면 성간단 → 그림자 테마, 소꿉친구 → 라이벌 테마
    const speaker = ev.battle?.cast ?? ev.scene[0]?.[0] ?? '';
    const bgm = ev.bgm ?? (VILLAIN_CAST.has(speaker) ? 'villain' : speaker === 'rival' ? 'rival' : ev.ending ? 'league' : '');
    if (bgm) music.play(bgm);
    // 추억 사진 (엔딩 크레딧 양옆에 나옴)
    this.h.scene.time.delayedCall(350, () => captureMemory(this.h.scene, this.me.id, ev.id, `${ch?.title.split(' · ')[0] ?? ''} ${this.cast(speaker).name}`.trim()));
    await this.lines(ev.scene);
    const r = await this.h.auth.request({ kind: 'event', id: ev.id });
    if (!r.ok) { this.done(foe); return; }
    if (r.battle) {
      this.h.startBattle(r.battle, () => void this.afterBattle(ev, foe));
      return;
    }
    if (ev.afterBgm) music.play(ev.afterBgm);
    await this.lines(ev.after);
    if (ev.ending) { await this.ending(); return; }
    this.done(foe);
  }
  private async afterBattle(ev: StoryEvent, foe: Actor | null) {
    this.h.lock();
    if (this.me.flags?.includes(ev.id)) { if (ev.afterBgm) music.play(ev.afterBgm); await this.lines(ev.after); }
    this.done(foe);
  }
  private done(foe: Actor | null) {
    if (foe?.sprite.active) void foe.vanish();
    this.h.playMapMusic?.();
    this.busy = false; this.h.unlock();
    this.h.scene.time.delayedCall(400, () => this.check());   // 같은 곳에서 이어지는 사건
  }

  /** 엔딩: 크레딧(양옆에 추억 사진) → 내 집 앞으로 → 에필로그 */
  private async ending() {
    music.play('ending');
    const mem = loadMemories(this.me.id).sort((a, b) => a.t - b.t);   // 찍은 순서대로
    await showCredits(this.me.name, CHAPTERS.chapters.map((c) => c.title), mem.map((m) => ({ img: m.img, caption: m.caption })));
    EventDirector.pendingEpilogue = true;
    const r = await this.h.auth.request({ kind: 'epilogue' });
    if (!r.ok) { EventDirector.pendingEpilogue = false; this.busy = false; this.h.unlock(); this.h.playMapMusic?.(); }
  }

  /** 에필로그: 집 문 앞까지 걸어가 "엄마! 다녀왔어!" → 카메라가 집에서 천천히 멀어지며 페이드 아웃 → 집 안에서 이어서 */
  async epilogue() {
    EventDirector.pendingEpilogue = false;
    this.busy = true; this.h.lock();
    const sc = this.h.scene, p = this.h.player, cam = sc.cameras.main;
    music.play('homecoming');
    cam.fadeIn(1200);
    await new Promise<void>((r) => sc.time.delayedCall(1400, r));
    // 문 앞까지 한 칸 걸어감
    p.play('walk', 'up');
    await new Promise<void>((r) => sc.tweens.addCounter({ from: p.y, to: p.y - 14, duration: 650, onUpdate: (t) => { p.setPosition(p.x, t.getValue() ?? p.y); p.update(); }, onComplete: () => { p.play('idle', 'up'); r(); } }));
    await ui.dialogue.say({ name: this.me.name, sprite: this.me.look, pages: ['엄마! 다녀왔어!'] });
    await ui.dialogue.say({ name: '엄마', sprite: 'mom', color: '#c0705a', pages: ['어머, 우리 챔피언 왔구나! 어서 들어오렴. 오늘 저녁은 네가 좋아하는 걸로 잔뜩 했어.'] });
    // 집 안으로 들어가는 모습 → 카메라는 집에서 멀어지며 하늘 쪽으로
    sc.tweens.add({ targets: p.sprite, alpha: 0, duration: 700 });
    cam.stopFollow();
    sc.tweens.add({ targets: cam, zoom: cam.zoom * 0.45, scrollY: cam.scrollY - 140, duration: 7000, ease: 'Sine.easeInOut' });
    await new Promise<void>((r) => sc.time.delayedCall(4200, r));
    cam.fadeOut(2800, 0, 0, 0);
    await new Promise<void>((r) => sc.time.delayedCall(3000, r));
    await showEnd();
    // 집 안에서 다시 시작 (클리어 후에도 모험은 계속)
    const house = this.h.world.info.objects.find((o) => o.type === 'house');
    p.sprite.setAlpha(1);
    this.busy = false;
    if (house) { const r = await this.h.auth.request({ kind: 'enter', objectId: house.id }); if (r.ok) return; }
    cam.fadeIn(800); this.h.unlock(); this.h.playMapMusic?.();
  }

  /** 막힌 길 안내 (권한자가 'event:<id>' 로 거절했을 때) */
  static gateMessage(reason: string) {
    const id = reason.slice(6);
    return CHAPTERS.events.find((e) => e.id === id)?.gate?.msg ?? '지금은 들어갈 수 없다.';
  }
}
export const tileOf = (v: number) => Math.floor(v / TILE);

/** 검은 화면에 '끝' 글씨가 잠깐 떠올랐다 사라짐 */
function showEnd(): Promise<void> {
  return new Promise((done) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;align-items:center;justify-content:center;flex-direction:column;color:#f4ecd8;font-family:Galmuri11,Galmuri9,sans-serif;opacity:0;transition:opacity 1.4s';
    el.innerHTML = '<div style="font-size:30px;color:#ffe58a;letter-spacing:.3em">루미 스텔라</div><div style="margin-top:14px;font-size:18px;letter-spacing:.5em">— 끝 —</div>';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => { el.remove(); done(); }, 1500); }, 3600);
  });
}
