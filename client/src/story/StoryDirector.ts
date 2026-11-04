// 프롤로그 컷신 감독: 15살 생일 아침 → 친구와 마을까지 경주 → 엄마(휴대폰) → 가로등 아래 친구 → 마을회관 이장님 → 루미 선택 → 첫 대결
// 단계(story)는 권한자(서버/로컬 시뮬레이션)가 저장하고, 여기서는 그 단계에 맞는 연출만 한다.
import Phaser from 'phaser';
import { ENCOUNTERS, SPECIES } from '@shared/data';
import { RIVAL_PICK, STORY, rivalOf } from '@shared/story';
import type { BattleUpdate, Dir, MapId } from '@shared/types';
import { TILE, type Manifest } from '../config';
import { sfx } from '../audio/Sfx';
import type { Player } from '../entities/Player';
import { facingFromVector } from '../entities/Character';
import type { Authority } from '../net/Authority';
import { ui } from '../ui/UI';
import type { World } from '../world/World';
import { Actor, cellCenter } from './Actor';

export interface StoryHost {
  scene: Phaser.Scene; player: Player; world: World; auth: Authority; manifest: Manifest; zoom: number; mapId: MapId;
  lock(): void; unlock(): void;
  startBattle(update: BattleUpdate, after?: () => void): void;
}
const label = (t: string) => `<b class="text-[#ffe58a]">E</b> ${t}`;
const MOM = { name: '엄마', sprite: 'mom', color: '#c0705a' };
const MAYOR = { name: '오 이장', title: '별빛 마을 이장', sprite: 'mayor', color: '#8a2f3f' };

export class StoryDirector {
  private actors: Actor[] = [];
  private busy = false;
  constructor(private h: StoryHost) {}

  private get me() { return this.h.auth.me; }
  private get rival() { const r = rivalOf(this.me.look); return { ...r, sprite: r.look, color: r.look === 'rival_f' ? '#3fb07a' : '#2f68c0' }; }
  private wait(ms: number) { return new Promise<void>((r) => this.h.scene.time.delayedCall(ms, r)); }
  private spawn(id: string, sheet: string, name: string, cx: number, cy: number, face: Dir = 'down') {
    const c = cellCenter(cx, cy);
    const a = new Actor(this.h.scene, id, sheet, c.x, c.y, this.h.manifest.characters[sheet], this.h.world.grid, name, this.h.zoom);
    a.face(face); this.actors.push(a);
    return a;
  }
  private wp(name: string) { const p = this.h.world.info.spawns.get(name); return p ? [Math.floor(p.x / TILE), Math.floor(p.y / TILE)] as [number, number] : null; }
  private async step(n: number) { await this.h.auth.request({ kind: 'story', step: n }); }
  private say(who: { name: string; sprite?: string; color?: string; title?: string }, pages: string[]) { return ui.dialogue.say({ ...who, pages }); }
  /** 주인공을 칸까지 걷게 함 (컷신 중) */
  private walkPlayer(cx: number, cy: number): Promise<void> {
    const p = this.h.player, [sx, sy] = p.cell();
    const path = this.h.world.grid.findPath(sx, sy, cx, cy) ?? [];
    return new Promise((res) => {
      const tick = (_t: number, dt: number) => {
        const n = path[0];
        if (!n) { this.h.scene.events.off('update', tick); p.play('idle', p.dir); res(); return; }
        const t = cellCenter(n[0], n[1]), dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), s = (62 * dt) / 1000;
        if (d <= s) { p.setPosition(t.x, t.y); path.shift(); } else p.setPosition(p.x + (dx / d) * s, p.y + (dy / d) * s);
        p.play('walk', facingFromVector(dx, dy, p.dir)); p.update();
      };
      this.h.scene.events.on('update', tick);
    });
  }

  update(dt: number) { for (const a of this.actors) if (a.sprite.active) a.tick(dt); this.actors = this.actors.filter((a) => a.sprite.active); }

  /** 씬이 시작될 때: 이 장소·단계에 맞는 장면 */
  begin() {
    const st = this.me.story, map = this.h.mapId, own = this.me.inst === this.me.id;
    if (st >= STORY.DONE || !this.me.look) return;
    if (map === 'home' && own && st === STORY.HOME) void this.rivalVisit();
    else if (map === 'farm' && own && st === STORY.RACE) void this.rivalRunsAhead();
    else if (map === 'town' && st === STORY.RACE) void this.momScene();
    else if (map === 'town' && st === STORY.PHONE) this.rivalAtLamp();
    else if (map === 'town' && st === STORY.MEET) this.rivalAtHall();
    else if (map === 'in_lab' && (st === STORY.MEET || st === STORY.HALL)) void this.hallScene();
  }

  /** 배우에게 말 걸기 */
  interaction(fx: number, fy: number): { label: string; run: () => void } | null {
    const a = this.actors.find((x) => x.sprite.active && Math.hypot(x.x - fx, x.y - fy) < 15);
    if (!a || this.busy) return null;
    return { label: label(`${a.name}에게 말 걸기`), run: () => void this.talkTo(a) };
  }
  private async talkTo(a: Actor) {
    a.faceTo(this.h.player.x, this.h.player.y);
    const st = this.me.story;
    if (a.id === 'rival' && st === STORY.PHONE) await this.meetAtLamp(a);
    else if (a.id === 'rival') await this.say(this.rival, ['빨리 들어와! 이장님이 기다리고 계셔!']);
    else if (a.id === 'mom') await this.say(MOM, ['다녀오렴! 무리하지 말고~']);
  }

  // ── 1. 내 방: 친구가 찾아옴 ───────────────────────────
  private async rivalVisit() {
    this.busy = true; this.h.lock();
    const r = this.rival, name = this.me.name;
    await this.wait(900);
    sfx.play('door');
    const e = this.wp('entry')!;
    const a = this.spawn('rival', r.look, r.name, e[0], e[1], 'up');
    const [px, py] = this.h.player.cell();
    await a.walkTo(px + 1, py + 1);
    a.faceTo(this.h.player.x, this.h.player.y);
    this.h.player.play('idle', facingFromVector(a.x - this.h.player.x, a.y - this.h.player.y, 'down'));
    a.showEmote(1, 900); sfx.play('surprise');
    await this.wait(500);
    await this.say(r, [
      `${name}! 일어났어? 잘 잤어? 헤헤, 어제 너무 설레서 나는 한숨도 못 잤어!`,
      '오늘이 무슨 날인지 설마 잊은 건 아니지? 드디어 우리도 열다섯 살! 마을의 떳떳한 일원이 되는 날이잖아!',
      '굼뜨고 있을 시간이 없어! 마을까지 누가 먼저 도착하는지 승부야!',
      '그럼 먼저 간다~! 슝!',
    ]);
    sfx.play('dash');
    await a.walkTo(e[0], e[1] + 1, true);
    await a.vanish();
    sfx.play('door');
    await this.step(STORY.RACE);
    ui.toast.push('마을은 농장 오른쪽(동쪽) 길 끝에 있어요. 서둘러요!', 'heart');
    this.busy = false; this.h.unlock();
  }

  /** 농장: 저 앞에서 달려가는 친구 */
  private async rivalRunsAhead() {
    const r = this.rival, g = this.wp('wp_gate'); if (!g) return;
    const [px, py] = this.h.player.cell();
    const a = this.spawn('rival', r.look, r.name, px + 6, py + 3, 'right');
    a.say('먼저 간다~!', this.h.zoom);
    await a.walkTo(g[0], g[1], true);
    await a.vanish();
  }

  // ── 2. 마을 입구: 엄마 ────────────────────────────────
  private async momScene() {
    this.busy = true; this.h.lock();
    const name = this.me.name;
    const [px, py] = this.h.player.cell();
    const m = this.spawn('mom', 'mom', '엄마', px + 6, py, 'left');
    await this.wait(400);
    await this.say(MOM, [`${name}~!`]);
    await m.walkTo(px + 1, py);
    m.faceTo(this.h.player.x, this.h.player.y);
    this.h.player.play('idle', 'right');
    await this.say(MOM, [
      `${name}, 휴대폰 놓고 가면 어떻게 해!`,
      '급한 건 알겠지만, 놓치는 건 없는지 꼭 한 번 더 확인하렴.',
      '…우리 아이가 벌써 열다섯 살이라니. 오늘부터는 어엿한 별빛 마을의 일원이구나.',
      '멋진 여행이 너를 기다리고 있을 거라고, 엄마는 굳게 믿고 있단다!',
    ]);
    sfx.play('item');
    ui.toast.push(`${name}은(는) 휴대폰을 받았다!`, 'heart');
    await this.step(STORY.PHONE);
    await this.say(MOM, ['참, 그 애는 호수 왼쪽 가로등 밑에서 너를 기다리고 있더라. 어서 가 보렴!']);
    this.busy = false; this.h.unlock();
    await m.walkTo(px + 3, py - 4);
    m.face('down');
  }

  // ── 3. 호수 왼쪽 가로등 아래 친구 ──────────────────────
  private lampCell(): [number, number] {
    const lamps = this.h.world.objects.filter((o) => o.type === 'lamp');
    const lake = this.h.world.info.spawns.get('wp_lake_w');
    const l = lake ? lamps.sort((a, b) => Math.hypot(a.sprite.x - lake.x, a.sprite.y - lake.y) - Math.hypot(b.sprite.x - lake.x, b.sprite.y - lake.y))[0] : lamps[0];
    return l ? [l.cellX, l.cellY + 1] : [19, 23];
  }
  private rivalAtLamp() {
    const [cx, cy] = this.lampCell();
    const a = this.spawn('rival', this.rival.look, this.rival.name, cx, cy, 'down');
    a.walkTo(cx, cy).then(() => a.face('down'));   // 막힌 칸이면 가장 가까운 빈칸으로
    this.h.scene.time.addEvent({ delay: 2600, loop: true, callback: () => { if (a.sprite.active && this.me.story === STORY.PHONE) a.showEmote(1, 900); } });
  }
  private async meetAtLamp(a: Actor) {
    this.busy = true; this.h.lock();
    await this.say(this.rival, [
      `늦었잖아, ${this.me.name}! 이번 경주는 내 승리야. 헤헤.`,
      '자, 이장님을 만나러 가자! 마을회관은 광장 북쪽에 있는 제일 큰 건물이야!',
    ]);
    await this.step(STORY.MEET);
    this.busy = false; this.h.unlock();
    const d = this.wp('wp_lab');
    if (d) { sfx.play('dash'); await a.walkTo(d[0], d[1], true); await a.vanish(); sfx.play('door'); }
  }
  private rivalAtHall() {
    const d = this.wp('wp_lab'); if (!d) return;
    this.spawn('rival', this.rival.look, this.rival.name, d[0] + 1, d[1], 'down');
  }

  // ── 4. 마을회관: 이장님 → 루미 선택 → 첫 대결 ─────────
  private async hallScene() {
    this.busy = true; this.h.lock();
    const r = this.rival, name = this.me.name;
    const mw = this.wp('wp_mayor') ?? [8, 6], rw = this.wp('wp_rival') ?? [6, 7];
    const mayor = this.spawn('mayor', 'mayor', '오 이장', mw[0], mw[1], 'down');
    const rival = this.spawn('rival', r.look, r.name, rw[0], rw[1], 'right');
    await this.wait(500);
    await this.walkPlayer(mw[0], mw[1] + 1);
    this.h.player.play('idle', 'up');
    if (this.me.story === STORY.MEET) {
      rival.faceTo(this.h.player.x, this.h.player.y);
      await this.say(r, [`이장님! ${name}도 왔어요!`]);
      mayor.showEmote(5, 1200);
      await this.say(MAYOR, [
        `오오, 어서 오너라 ${name}. 오늘로 열다섯 살이 되었구나. 진심으로 축하한다!`,
        '우리 별빛 마을에는 오래된 전통이 있단다. 열다섯 살이 되면, 제 발로 세상을 걸을 수 있는 마을의 떳떳한 일원으로 인정받지.',
        '혼자서도 밭을 일구고, 이웃을 돕고, 먼 길을 떠날 수 있는 나이라는 뜻이란다. 그 증표로 이장이 \'루미\'를 한 마리씩 맡기는 것이 이 마을의 오랜 약속이지.',
        '루미는 하늘의 별빛이 땅에 내려와 깃든 정령들이란다. 마음이 통하는 사람 곁에서 밭일도, 낚시도, 채광도 도와주고…',
        '함께 풀숲을 헤치고, 다른 루미와 겨루며 같이 강해진단다. 평생의 친구가 되어 줄 게다.',
        '그리고 잊지 말거라. 별빛 마을 트레이너는 남의 손에 기대지 않는단다. 밭에서 약초를 길러 회복약을 달이고, 바위에서 광석을 캐 루미볼을 직접 만들지.',
        '집에 작업대를 마련해 두었단다. 처음엔 루미볼과 회복약 정도겠지만, 배지를 모을수록 민수와 한별 박사가 더 좋은 제작법을 가르쳐 줄 게다.',
        '그리고 이 세상에는 우리 별빛 마을 말고도 많은 마을이 있단다. 바람이 머무는 바람골, 그 너머 바다 마을과 산 마을… 아직 너희가 가 보지 못한 곳들이지.',
        '자, 휴대폰을 잠깐 줘 보겠니? …옳지, 지도 기능을 넣어 두었단다.',
      ]);
      sfx.play('phone');
      await this.step(STORY.HALL);
      ui.toast.push('휴대폰에 지도가 추가됐다! (M 키)', 'heart');
      await this.say(MAYOR, ['M 키를 누르면 지도를 볼 수 있지. 지금은 우리 마을 근처만 보이겠지만, 네가 걸어간 만큼 넓어질 게다.', '그럼 이제, 너와 함께할 루미를 골라 보거라!']);
    } else if (!this.me.party.length) {
      await this.say(MAYOR, ['돌아왔구나. 자, 함께할 루미를 골라 보거라!']);
    }
    if (!this.me.party.length) {
      const id = await new Promise<string>((res) => ui.starter.show(ENCOUNTERS.starters, res, '오 이장: "셋 다 훌륭한 아이들이란다. 마음이 가는 아이를 골라 보렴."'));
      sfx.play('confirm');
      await this.h.auth.request({ kind: 'chooseStarter', species: id });
      await this.say(MAYOR, [`${SPECIES[id].name}(이)로구나! 좋은 눈을 가졌어. 벌써 너를 잘 따르는구나.`]);
    }
    // 친구도 루미 선택: 언제나 주인공에게 상성이 불리한 아이
    const mine = this.me.party[0]?.species ?? 'saerok', theirs = RIVAL_PICK[mine] ?? 'kongkong';
    rival.faceTo(mayor.x, mayor.y);
    await this.say(r, [`그럼 난… 이 아이로 할래! ${SPECIES[theirs].name}!`]);
    rival.showEmote(2, 1600);
    for (let i = 0; i < 3; i++) { sfx.play('hop'); await rival.hop(1); }
    rival.faceTo(this.h.player.x, this.h.player.y);
    await this.say(r, ['우와아~! 드디어 나도 루미랑 함께야! 여행이 너무너무 기대돼!', `${name}!`, '첫 여행의 시작은… 너와의 대결이야!!!']);
    const res = await this.h.auth.request({ kind: 'rivalBattle' });
    if (!res.battle) { this.busy = false; this.h.unlock(); return; }
    sfx.play('encounter');
    this.h.startBattle(res.battle, () => void this.afterBattle(rival, mayor));
  }

  private async afterBattle(rival: Actor, mayor: Actor) {
    this.h.lock();
    rival.faceTo(this.h.player.x, this.h.player.y);
    await this.wait(300);
    await this.say(this.rival, ['칫, 분하다!', '다음에는 완벽한 승리로 되갚아 주겠어. 기대해도 좋아!']);
    const e = this.wp('entry');
    sfx.play('dash');
    if (e) await rival.walkTo(e[0], e[1] + 1, true);
    await rival.vanish(); sfx.play('door');
    mayor.faceTo(this.h.player.x, this.h.player.y);
    await this.say(MAYOR, [
      '허허, 둘 다 훌륭한 승부였다. 루미와 마음이 잘 맞는구나.',
      `${this.me.name}, 이제 너는 별빛 마을의 떳떳한 일원이란다. 동쪽 1번 도로를 따라가면 바람골 마을이 나오지.`,
      '마음껏 걷고, 키우고, 만나고 오너라. 너의 모험을 시작하거라!',
    ]);
    sfx.play('win');
    ui.banner.show('모험의 시작!', '1번 도로가 열렸어요 · P: 나의 루미 · M: 지도');
    this.busy = false; this.h.unlock();
    await mayor.walkTo(mayor.cell()[0] - 3, mayor.cell()[1] - 1);
    mayor.face('down');
  }
}
