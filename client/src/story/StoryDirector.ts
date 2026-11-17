// 프롤로그 컷신 감독: 15살 생일 아침 → 친구와 마을까지 경주 → 엄마(생일 선물 휴대폰) → 가로등 아래 친구 → 마을회관 이장님 → 루미 선택 → 첫 대결
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
  /** 이 맵의 원래 배경음악으로 */
  playMapMusic?(): void;
}
const label = (t: string) => `<b class="text-[#ffe58a]">E</b> ${t}`;
const MOM = { name: '엄마', sprite: 'mom', color: '#c0705a' };
const MAYOR = { name: '오 이장', title: '별빛 마을 이장', sprite: 'mayor', color: '#8a2f3f' };
/** 한 번만 보여 주는 연출 (집에 들어갔다 나와도 다시 나오지 않게). 새로고침해도 기억 */
const seen = (key: string) => { try { return localStorage.getItem(`sf:seen:${key}`) === '1'; } catch { return false; } };
const markSeen = (key: string) => { try { localStorage.setItem(`sf:seen:${key}`, '1'); } catch { /* 저장 불가 */ } };
const seenNow = new Set<string>();

/** 저장 초기화 시 이미 본 컷신 플래그(`sf:seen:*`, 메모리 캐시)도 깨끗이 비움 */
export function clearStorySeen() {
  seenNow.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith('sf:seen:')) localStorage.removeItem(k);
    }
  } catch { /* 무시 */ }
}

export class StoryDirector {
  private actors: Actor[] = [];
  private busy = false;
  constructor(private h: StoryHost) {}
  getActors() { return this.actors; }

  private get me() { return this.h.auth.me; }
  private get rival() { const r = rivalOf(this.me.look); return { ...r, sprite: r.look, color: r.look === 'rival_f' ? '#3fb07a' : '#2f68c0' }; }
  private wait(ms: number) { return new Promise<void>((r) => this.h.scene.time.delayedCall(ms, r)); }
  private spawn(id: string, sheet: string, name: string, cx: number, cy: number, face: Dir = 'down') {
    const [ox, oy] = this.h.world.grid.blocked(cx, cy) ? (this.h.world.grid.nearestOpen(cx, cy) ?? [cx, cy]) : [cx, cy];
    const c = cellCenter(ox, oy);
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
    const [tx, ty] = this.h.world.grid.blocked(cx, cy) ? (this.h.world.grid.nearestOpen(cx, cy) ?? [cx, cy]) : [cx, cy];
    const path = this.h.world.grid.findPath(sx, sy, tx, ty) ?? [[tx, ty]];
    return new Promise((res) => {
      let done = false;
      const finish = () => { if (done) return; done = true; this.h.scene.events.off('update', tick); p.play('idle', p.dir); res(); };
      const tick = (_t: number, dt: number) => {
        const n = path[0];
        if (!n) { finish(); return; }
        const t = cellCenter(n[0], n[1]), dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy), s = (62 * dt) / 1000;
        if (d <= s) { p.setPosition(t.x, t.y); path.shift(); } else p.setPosition(p.x + (dx / d) * s, p.y + (dy / d) * s);
        p.play('walk', facingFromVector(dx, dy, p.dir)); p.update();
      };
      this.h.scene.events.on('update', tick);
      this.h.scene.time.delayedCall(Math.max(2500, path.length * 450), () => {
        if (!done) { const t = cellCenter(tx, ty); p.setPosition(t.x, t.y); p.update(); finish(); }
      });
    });
  }

  update(dt: number) {
    for (const a of this.actors) if (a.sprite.active) a.tick(dt);
    this.actors = this.actors.filter((a) => a.sprite.active);
    if (!this.busy && this.h.mapId === 'town' && this.me.story === STORY.PHONE) {
      const rv = this.actors.find((a) => a.id === 'rival' && a.sprite.active);
      if (rv && (Math.hypot(this.h.player.x - rv.x, this.h.player.y - rv.y) < 44 || this.h.player.x >= rv.x - 8)) {
        void this.meetAtLamp(rv);
      }
    }
  }

  /** 씬이 시작될 때: 이 장소·단계에 맞는 장면 */
  begin() {
    const st = this.me.story, map = this.h.mapId, own = this.me.inst === this.me.id;
    if (st >= STORY.DONE || !this.me.look) return;
    if (map === 'home_2f' && own && st === STORY.HOME) {
      void this.wakeTvScene();
      return;
    }
    if (map === 'home' && own && st === STORY.HOME) void this.rivalVisit();
    else if (map === 'farm' && own && st === STORY.RACE) void this.rivalRunsAhead();
    else if (map === 'town' && (st === STORY.RACE || st === STORY.HOME)) void this.momScene();
    else if (map === 'town' && st === STORY.PHONE) this.rivalAtLamp();
    else if (map === 'town' && st === STORY.MEET) this.rivalAtHall();
    else if (map === 'in_lab' && (st === STORY.MEET || st === STORY.HALL || st === STORY.PHONE || st === STORY.RACE)) void this.hallScene();
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
    else if (a.id === 'rival') await this.say(this.rival, ['빨리 내려가서 마을로 출발하자! 이장님이 기다리고 계셔!']);
    else if (a.id === 'mom') await this.say(MOM, ['다녀오렴! 무리하지 말고~']);
  }

  // ── 0. 2층 내 방: 포켓몬 스타일 TV 뉴스(산맥 먹구름 → 0.5초 전설 루미 실루엣 → 뉴스 캐스터 마무리 → 화면 축소) 후 라이벌과 대화 ──
  private async wakeTvScene() {
    const key = `wake2f:${this.me.id}`;
    if (seenNow.has(key) || seen(key)) return;
    seenNow.add(key); markSeen(key);
    this.busy = true; this.h.lock();
    const r = this.rival, name = this.me.name;
    const [px, py] = this.h.player.cell();
    this.h.player.play('idle', 'up');

    // TV 화면이 줄어들었을 때 주인공과 라이벌이 나란히 서서 TV를 보고 있는 모습이 드러나도록 미리 배치
    const st = this.wp('from_1f') ?? [8, 7];
    const a = this.spawn('rival', r.look, r.name, px + 1, py, 'up');

    await this.playTvNewsIntro();

    await this.wait(250);
    a.showEmote(1, 900); sfx.play('surprise');
    a.faceTo(this.h.player.x, this.h.player.y);
    this.h.player.play('idle', facingFromVector(a.x - this.h.player.x, a.y - this.h.player.y, 'right'));
    await this.say(r, [
      `방금 뉴스 특보 봤어, ${name}?! 별마루산 먹구름 속에서 잠깐 비친 그 거대한 실루엣… 전설의 루미가 분명해!`,
      '헤헤, 어제 너무 설레서 아침 일찍부터 네 방에 올라와서 같이 티비 보고 있었잖아!',
      '드디어 우리도 열다섯 살! 마을의 떳떳한 일원, 루미 트레이너가 되는 날이야!',
      '티비만 보고 있을 시간이 없어! 마을회관까지 누가 먼저 도착하는지 승부야! 나 먼저 내려간다~! 슝!',
    ]);
    sfx.play('dash');
    await a.walkTo(st[0] + 1, st[1], true);
    await a.vanish();
    sfx.play('stairs');
    await this.step(STORY.RACE);
    ui.toast.push('오른쪽 아래 계단으로 1층에 내려가 밖으로 나가자! 마을은 농장 동쪽 길 끝에 있어요.', 'heart');
    this.busy = false; this.h.unlock();
  }

  /** 포켓몬스터 오프닝 스타일 TV 특별 뉴스 연출:
   *  1) 별마루산 산맥을 덮치는 검은 먹구름
   *  2) 번개와 함께 0.5초간 비치는 전설의 루미 거대 실루엣
   *  3) 뉴스 스튜디오 캐스터의 클로징 멘트
   *  4) 뉴스 화면이 점점 작아지며 2층 방 TV 앞에 나란히 서 있는 주인공과 라이벌이 나타남
   */
  private playTvNewsIntro(): Promise<void> {
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      Object.assign(wrap.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '38',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(6, 8, 16, 0.92)',
        transition: 'background 1.1s ease',
        pointerEvents: 'auto',
      });

      const tvBox = document.createElement('div');
      Object.assign(tvBox.style, {
        position: 'relative',
        width: 'min(860px, 92vw)',
        aspectRatio: '16 / 10',
        background: '#1c1824',
        border: '10px solid #3a2a20',
        outline: '4px solid #7a5438',
        borderRadius: '18px',
        boxShadow: '0 24px 80px rgba(0,0,0,0.85), inset 0 0 24px rgba(0,0,0,0.9)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transformOrigin: '50% 24%',
        transition: 'transform 1.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease 0.95s',
      });

      const cv = document.createElement('canvas');
      cv.width = 320;
      cv.height = 180;
      Object.assign(cv.style, {
        width: '100%',
        height: '100%',
        imageRendering: 'pixelated',
        display: 'block',
      });

      const badge = document.createElement('div');
      Object.assign(badge.style, {
        position: 'absolute',
        top: '14px',
        left: '16px',
        padding: '4px 10px',
        background: 'rgba(210, 38, 38, 0.92)',
        border: '2px solid #ffe58a',
        borderRadius: '6px',
        color: '#fff',
        fontFamily: 'Galmuri11, Galmuri9, sans-serif',
        fontSize: '13px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
      });
      badge.textContent = '🔴 LIVE · 루미나 뉴스 특보';

      const subBox = document.createElement('div');
      Object.assign(subBox.style, {
        position: 'absolute',
        left: '14px',
        right: '14px',
        bottom: '14px',
        padding: '10px 14px',
        background: 'rgba(14, 18, 34, 0.92)',
        border: '2px solid #7aaee0',
        borderRadius: '8px',
        color: '#f4f8ff',
        fontFamily: 'Galmuri11, Galmuri9, sans-serif',
        fontSize: '14px',
        lineHeight: '1.45',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
      });

      tvBox.append(cv, badge, subBox);
      wrap.appendChild(tvBox);
      document.body.appendChild(wrap);

      const ctx = cv.getContext('2d')!;
      const startAt = performance.now();
      let thunderPlayed = false;
      let shrinking = false;
      let finished = false;
      let rafId = 0;

      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(rafId);
        wrap.remove();
        resolve();
      };

      const drawMountainScene = (elapsed: number, showSilhouette: boolean, flashAlpha: number) => {
        const W = cv.width, H = cv.height;
        // 1) 어두운 폭풍 하늘
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, showSilhouette ? '#2a1f4a' : '#121528');
        sky.addColorStop(0.6, showSilhouette ? '#4b3278' : '#242b4a');
        sky.addColorStop(1, '#1a2030');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, W, H);

        // 2) 멀리 보이는 산맥 능선
        ctx.fillStyle = '#1e2538';
        ctx.beginPath();
        ctx.moveTo(0, 130);
        for (const [x, y] of [[40, 96], [85, 114], [135, 74], [168, 56], [205, 82], [255, 68], [295, 102], [320, 90]]) {
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fill();

        // 산맥 눈 덮인 봉우리 하이라이트
        ctx.fillStyle = showSilhouette ? '#9ab0e8' : '#435274';
        ctx.beginPath();
        ctx.moveTo(135, 74); ctx.lineTo(168, 56); ctx.lineTo(192, 74); ctx.lineTo(168, 68); ctx.closePath();
        ctx.fill();

        // 3) 전설의 루미 거대 실루엣 (딱 0.5초간 먹구름과 번개 속에서 비침)
        if (showSilhouette) {
          ctx.save();
          // 번개 줄기
          ctx.strokeStyle = '#fff6b0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(198, 8); ctx.lineTo(186, 32); ctx.lineTo(194, 36); ctx.lineTo(176, 66);
          ctx.stroke();

          // 신비한 후광
          const aura = ctx.createRadialGradient(164, 52, 4, 164, 52, 54);
          aura.addColorStop(0, 'rgba(255, 230, 128, 0.65)');
          aura.addColorStop(0.5, 'rgba(155, 120, 255, 0.3)');
          aura.addColorStop(1, 'rgba(20, 16, 40, 0)');
          ctx.fillStyle = aura;
          ctx.fillRect(100, 0, 128, 110);

          // 거대한 날개 + 뿔 달린 전설의 루미 검은 실루엣
          ctx.fillStyle = '#090612';
          // 왼쪽 거대 날개
          ctx.beginPath();
          ctx.moveTo(156, 52); ctx.lineTo(106, 22); ctx.lineTo(118, 46); ctx.lineTo(102, 58); ctx.lineTo(132, 64); ctx.lineTo(154, 62);
          ctx.closePath(); ctx.fill();
          // 오른쪽 거대 날개
          ctx.beginPath();
          ctx.moveTo(172, 52); ctx.lineTo(222, 22); ctx.lineTo(210, 46); ctx.lineTo(226, 58); ctx.lineTo(196, 64); ctx.lineTo(174, 62);
          ctx.closePath(); ctx.fill();
          // 몸통 · 머리 · 별의 왕관 뿔 실루엣
          ctx.beginPath();
          ctx.arc(164, 46, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(155, 40); ctx.lineTo(148, 22); ctx.lineTo(160, 36);
          ctx.moveTo(173, 40); ctx.lineTo(180, 22); ctx.lineTo(168, 36);
          ctx.moveTo(164, 35); ctx.lineTo(164, 17);
          ctx.strokeStyle = '#090612';
          ctx.lineWidth = 4;
          ctx.stroke();

          // 실루엣 안에서 빛나는 황금빛 눈과 가슴의 별빛 코어
          ctx.fillStyle = '#ffe58a';
          ctx.fillRect(159, 44, 3, 2);
          ctx.fillRect(166, 44, 3, 2);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(163, 55, 3, 3);
          ctx.restore();
        }

        // 4) 산맥을 덮치는 거대한 어두운 먹구름 떼 (시간에 따라 산으로 몰려듦)
        const drift = Math.min(28, (elapsed / 1000) * 12);
        const clouds = [
          [55 + drift, 42, 46, 18, '#141726'],
          [115 + drift * 0.8, 34, 58, 22, '#101220'],
          [210 - drift * 0.9, 38, 62, 22, '#111424'],
          [158, 26 + Math.min(12, drift * 0.4), 68, 20, showSilhouette ? 'rgba(18, 16, 34, 0.55)' : '#0d101d'],
          [85 + drift, 62, 54, 16, 'rgba(16, 19, 32, 0.88)'],
          [230 - drift, 60, 56, 16, 'rgba(16, 19, 32, 0.88)'],
        ] as const;
        for (const [cx, cy, rx, ry, col] of clouds) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // 앞쪽 침엽수 숲 실루엣
        ctx.fillStyle = '#0d131d';
        ctx.fillRect(0, 126, W, H - 126);
        for (let x = 8; x < W; x += 18) {
          const h = 16 + ((x * 7) % 10);
          ctx.beginPath();
          ctx.moveTo(x - 8, 128); ctx.lineTo(x, 128 - h); ctx.lineTo(x + 8, 128);
          ctx.closePath(); ctx.fill();
        }

        if (flashAlpha > 0) {
          ctx.fillStyle = `rgba(255, 250, 220, ${flashAlpha})`;
          ctx.fillRect(0, 0, W, H);
        }
      };

      const drawStudioScene = (elapsed: number) => {
        const W = cv.width, H = cv.height;
        // 뉴스 스튜디오 배경
        ctx.fillStyle = '#1b2848';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#263a66';
        for (let x = 0; x < W; x += 32) ctx.fillRect(x, 0, 16, H);

        // 스튜디오 뒤쪽 자료 화면 (별마루산 먹구름 사진)
        ctx.fillStyle = '#0f1424';
        ctx.fillRect(34, 22, 112, 64);
        ctx.strokeStyle = '#7aaee0';
        ctx.lineWidth = 2;
        ctx.strokeRect(34, 22, 112, 64);
        ctx.fillStyle = '#28334e';
        ctx.beginPath();
        ctx.moveTo(36, 84); ctx.lineTo(68, 52); ctx.lineTo(92, 42); ctx.lineTo(120, 60); ctx.lineTo(144, 84);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffe066';
        ctx.fillRect(88, 36, 3, 2); ctx.fillRect(93, 36, 3, 2);

        // 뉴스 캐스터 (도트풍 아나운서)
        const bob = Math.floor(elapsed / 180) % 2;
        const talk = Math.floor(elapsed / 140) % 2;
        // 정장 어깨·몸통
        ctx.fillStyle = '#2d4678';
        ctx.fillRect(176, 68 + bob, 48, 42);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(194, 68 + bob, 12, 24);
        ctx.fillStyle = '#d8473b';
        ctx.fillRect(198, 72 + bob, 4, 20);
        // 얼굴·머리
        ctx.fillStyle = '#f5d0b0';
        ctx.fillRect(184, 38 + bob, 32, 28);
        ctx.fillStyle = '#3b2418';
        ctx.fillRect(182, 32 + bob, 36, 12);
        ctx.fillRect(182, 36 + bob, 6, 16);
        ctx.fillRect(212, 36 + bob, 6, 16);
        // 눈·입
        ctx.fillStyle = '#1e1424';
        ctx.fillRect(191, 49 + bob, 4, 4);
        ctx.fillRect(205, 49 + bob, 4, 4);
        ctx.fillStyle = '#c8453c';
        ctx.fillRect(197, 58 + bob, 6, talk ? 4 : 2);

        // 뉴스 데스크
        ctx.fillStyle = '#e8eef8';
        ctx.fillRect(0, 104, W, 76);
        ctx.fillStyle = '#3b5fa8';
        ctx.fillRect(0, 104, W, 8);
        ctx.fillStyle = '#ffd65a';
        ctx.fillRect(130, 114, 60, 14);
        ctx.fillStyle = '#1b2848';
        ctx.font = 'bold 9px Galmuri9, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LUMINA NEWS', 160, 124);
      };

      const tick = (now: number) => {
        if (finished) return;
        const elapsed = now - startAt;

        // 0 ~ 1700ms: 산맥에 어두운 먹구름이 몰려옴
        // 1700 ~ 2200ms (정확히 0.5초 = 500ms): 번개와 함께 전설의 루미 실루엣 등장!
        // 2200 ~ 2800ms: 실루엣이 사라지고 먹구름에 덮인 산맥
        // 2800 ~ 5000ms: 뉴스 캐스터가 뉴스를 마무리함
        // 5000 ~ 6250ms: 화면이 점점 줄어들며(Zoom-out) TV를 보고 있는 주인공과 라이벌이 나타남
        if (elapsed < 2800) {
          const showSilhouette = elapsed >= 1700 && elapsed < 2200;
          if (showSilhouette && !thunderPlayed) {
            thunderPlayed = true;
            sfx.play('roar');
          }
          const flash = elapsed >= 1700 && elapsed < 1820 ? (1820 - elapsed) / 120 * 0.75 : 0;
          drawMountainScene(elapsed, showSilhouette, flash);
          subBox.innerHTML = showSilhouette
            ? '『앗…! 방금 별마루산 먹구름 사이로 <b>거대한 전설의 루미 실루엣</b>이 포착되었습니다!』'
            : '『긴급 특보입니다! 지금 별마루산 산맥 정상 일대를 거대한 먹구름이 뒤덮고 있습니다…』';
        } else {
          badge.textContent = '📺 루미나 뉴스 스튜디오';
          badge.style.background = 'rgba(42, 96, 184, 0.92)';
          drawStudioScene(elapsed);
          subBox.innerHTML = '<b>뉴스 캐스터</b>: 『이상, 별마루산 특보였습니다. 오늘 첫 여정을 떠나는 신입 트레이너 여러분, 힘찬 하루 되십시오!』';
        }

        // 스캔라인 효과
        ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        for (let y = 0; y < cv.height; y += 3) ctx.fillRect(0, y, cv.width, 1);

        if (elapsed >= 5000 && !shrinking) {
          shrinking = true;
          sfx.play('tap');
          wrap.style.background = 'rgba(6, 8, 16, 0)';
          tvBox.style.transform = 'translate(0, -16vh) scale(0.08)';
          tvBox.style.opacity = '0';
        }

        if (elapsed >= 6300) {
          finish();
          return;
        }
        rafId = requestAnimationFrame(tick);
      };

      rafId = requestAnimationFrame(tick);
    });
  }

  // ── 1. 내 집 1층: (혹시 1층에서 시작했을 때 폴백) TV 시청 중 친구가 찾아옴 ──
  private async rivalVisit() {
    this.busy = true; this.h.lock();
    const r = this.rival, name = this.me.name;
    this.h.player.play('idle', 'up');
    await this.wait(600);
    await this.say({ name: '📺 TV 특별방송', color: '#3a6a9a' }, [
      '『지금 루미나 지방의 루미 리그 특별 중계와 함께, 달빛호수에서 포착된 신비한 별빛 루미 특집 방송이 진행 중입니다!』',
    ]);
    sfx.play('door');
    const e = this.wp('entry')!;
    const a = this.spawn('rival', r.look, r.name, e[0], e[1], 'up');
    const [px, py] = this.h.player.cell();
    await a.walkTo(px + 1, py);
    a.face('up');
    await this.wait(300);
    await this.say(r, [`우와, ${name}! 너도 이 특별방송 보고 있었구나!`]);
    a.faceTo(this.h.player.x, this.h.player.y);
    this.h.player.play('idle', facingFromVector(a.x - this.h.player.x, a.y - this.h.player.y, 'down'));
    a.showEmote(1, 900); sfx.play('surprise');
    await this.wait(400);
    await this.say(r, [
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
    const key = `runAhead:${this.me.id}`;
    if (seenNow.has(key) || seen(key)) return;
    seenNow.add(key); markSeen(key);
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
      `${name}, 잠깐! 그렇게 뛰어가 버리면 어떡하니~ 오늘의 주인공한테 줄 게 있었는데!`,
      '…우리 아이가 벌써 열다섯 살이라니. 오늘부터는 어엿한 별빛 마을의 일원이구나.',
      '자, 열다섯 살 생일 축하해! 엄마가 준비한 선물이야. 짜잔~ 너만의 휴대폰!',
      '먼 길을 떠나도 지도도 보고, 루미도 챙기고, 엄마한테 연락도 할 수 있도록 말이야. 헤헤, 엄마가 몰래 아껴 둔 용돈으로 산 거란다.',
      '멋진 여행이 너를 기다리고 있을 거라고, 엄마는 굳게 믿고 있단다!',
    ]);
    sfx.play('item');
    ui.banner.show('생일 선물!', '엄마에게 휴대폰을 받았다 · R: 휴대폰 홈 화면');
    ui.toast.push(`${name}은(는) 생일 선물로 휴대폰을 받았다! (R 키로 열기)`, 'heart');
    await this.step(STORY.PHONE);
    await this.say(MOM, ['참, 그 애는 호수 왼쪽 가로등 밑에서 너를 기다리고 있더라. 어서 가 보렴!']);
    this.rivalAtLamp();   // 씬을 다시 불러오지 않아도 친구가 바로 가로등 아래에 보이도록
    this.busy = false; this.h.unlock();
    await m.walkTo(Math.max(1, px - 1), py);
    await m.vanish();
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
    if (this.me.story === STORY.MEET || this.me.story === STORY.PHONE || this.me.story === STORY.RACE) {
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
        '오, 어머니께 생일 선물로 휴대폰을 받았구나! 잠깐 줘 보겠니? …옳지, 지도 기능을 넣어 두었단다.',
      ]);
      sfx.play('phone');
      await this.step(STORY.HALL);
      ui.toast.push('휴대폰에 지도 앱이 추가됐다! (M 키로 바로 열기)', 'heart');
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
    ui.banner.show('모험의 시작!', '1번 도로가 열렸어요 · R: 휴대폰 · M: 지도');
    this.busy = false; this.h.unlock();
    await mayor.walkTo(mayor.cell()[0] - 3, mayor.cell()[1] - 1);
    mayor.face('down');
  }
}
