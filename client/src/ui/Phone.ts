// 휴대폰 (R · 지도는 M): 화면 오른쪽에 뜨는 루미폰. 지도 · 나의 루미 · 가방 · 도감 · 제작 노트 · 배지 · 친구 · 설정 · 도움말을 모두 여기서.
//   - 폰이 열려 있어도 걸어 다닐 수 있음 (지도만 가로 화면으로 넓어짐)
//   - Esc: 앱 → 홈 → 닫기 / M: 열기·닫기 / P: 나의 루미 / H: 도움말
import { ITEMS, RECIPES, SPECIES, NPCS, TYPE_COLORS } from '@shared/data';
import { MAP_META, type CreatureInst, type MapMeta, type PlayerState, type WorldTime } from '@shared/types';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { iconStyle, formatTime } from './UI';
import type { AdminCmd } from '@shared/protocol';
import type { AdminReply } from '../net/Authority';

export type PhoneApp = 'home' | 'map' | 'party' | 'bag' | 'dex' | 'recipes' | 'badges' | 'friends' | 'settings' | 'help' | 'bug' | 'admin';

export interface PhoneCtx {
  me(): PlayerState;
  time(): WorldTime;
  /** 지도에서 표시할 현재 위치 (실내면 건물이 있는 바깥 맵) + 친구 농장 표시 */
  here(): { id: string; owner: string };
  mapUnlocked(): boolean;
  roster(): { id: string; name: string; where: string; me?: boolean }[];
  online(): boolean;
  storage(): string;
  canSave(): boolean;
  setPartner(index: number): void;
  save(): void;
  reset(): void;
  toTitle(): void;
  /** 손에 든 가방 칸 */
  held(): number;
  /** 가방 칸을 눌렀을 때 할 수 있는 일 */
  bagActions(slot: number): { label: string; run: () => void; primary?: boolean }[];
  /** 버그 신고 (멀티 전용) · 관리자 (서버가 확인한 관리자만 화면에 나옴 — 실제 권한 검사는 서버) */
  report(text: string): boolean;
  isAdmin(): boolean;
  admin(cmd: AdminCmd): Promise<AdminReply>;
}

const APPS: { id: Exclude<PhoneApp, 'home'>; name: string; bg: string; glyph: () => string }[] = [
  { id: 'map', name: '지도', bg: 'linear-gradient(160deg,#6fc3e8,#2f7ab8)', glyph: () => '<span class="ph-emoji">🗺️</span>' },
  { id: 'party', name: '나의 루미', bg: 'linear-gradient(160deg,#ffd27a,#e8892e)', glyph: () => `<span class="px-icon" style="${iconStyle('lumi', 40)}"></span>` },
  { id: 'bag', name: '가방', bg: 'linear-gradient(160deg,#e8a86a,#a8683a)', glyph: () => `<span class="px-icon" style="${iconStyle('lumi_ball', 40)}"></span>` },
  { id: 'dex', name: '도감', bg: 'linear-gradient(160deg,#f2706a,#b83a3a)', glyph: () => '<span class="ph-emoji">📖</span>' },
  { id: 'recipes', name: '제작 노트', bg: 'linear-gradient(160deg,#9ad27a,#3f8a3e)', glyph: () => `<span class="px-icon" style="${iconStyle('potion', 40)}"></span>` },
  { id: 'badges', name: '배지', bg: 'linear-gradient(160deg,#c8a8ff,#6a4ab8)', glyph: () => `<span class="px-icon" style="${iconStyle('badge_star', 40)}"></span>` },
  { id: 'friends', name: '친구', bg: 'linear-gradient(160deg,#ffb0c8,#d0547a)', glyph: () => `<span class="px-icon" style="${iconStyle('heart', 40)}"></span>` },
  { id: 'settings', name: '설정', bg: 'linear-gradient(160deg,#c8d0dc,#6a7486)', glyph: () => '<span class="ph-emoji">⚙️</span>' },
  { id: 'help', name: '도움말', bg: 'linear-gradient(160deg,#fff0a8,#d8b03a)', glyph: () => '<span class="ph-emoji">❔</span>' },
  { id: 'bug', name: '버그 신고', bg: 'linear-gradient(160deg,#ffb27a,#d8573a)', glyph: () => '<span class="ph-emoji">🐞</span>' },
];
const ADMIN_APP = { id: 'admin' as const, name: '관리자', bg: 'linear-gradient(160deg,#4a4a5a,#14141c)', glyph: () => '<span class="ph-emoji">🛡️</span>' };
const TITLE: Record<PhoneApp, string> = { home: '', map: '루미나 지방 지도', party: '나의 루미', bag: '가방', dex: '루미 도감', recipes: '제작 노트', badges: '배지 케이스', friends: '친구', settings: '설정', help: '도움말', bug: '버그 신고', admin: '관리자 (admin)' };

/** 도장 순서 (ROADMAP 2-2) */
const BADGES: [string, string, string, string][] = [
  ['badge_wind', '바람골 마을', '세나', '바람'], ['badge_water', '물결항', '파도', '물'], ['badge_leaf', '단풍골', '단비', '풀'], ['badge_earth', '쇳불 도시', '무쇠', '땅'],
  ['badge_flame', '잿빛 마을', '화련', '불'], ['badge_light', '빛누리 시티', '샛별', '빛'], ['badge_star', '별마루 마을', '천문', '혼합'], ['badge_normal', '서리 마을', '설아', '노말'],
];
const HELPS: Record<string, string> = { farm: '아침마다 밭 6칸 물주기', fish: '희귀 물고기 ↑ · 물뿌리개 무료', mine: '광석 +1 · 곡괭이 에너지 절약', forage: '채집물 2배', energy: '도구 에너지 −1', exp: '경험치 +25%' };
const SEASON_KO: Record<string, string> = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
const esc = (s: string) => s.replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
const typeChip = (t: string) => `<span class="ph-chip" style="background:${TYPE_COLORS[t as keyof typeof TYPE_COLORS] ?? '#8a7aa8'}">${t}</span>`;
const maxHpOf = (c: CreatureInst) => { const b = SPECIES[c.species].base, L = c.level; return Math.floor((b.hp * 2 * L) / 100) + L + 10; };
const countItem = (p: PlayerState, id: string) => p.inventory.reduce((n, s) => n + (s.itemId === id ? s.quantity : 0), 0) + (p.bag[id] ?? 0);

export const phone = {
  node: null as HTMLDivElement | null,
  app: 'home' as PhoneApp,
  ctx: null as PhoneCtx | null,
  confirmReset: false,
  bagPick: '' as string,
  unfold: false,
  unfoldTimer: 0,
  get open() { return !!this.node; },
  setCtx(c: PhoneCtx) { this.ctx = c; },

  toggle(app?: PhoneApp) { if (this.node && (!app || app === this.app)) this.close(); else this.show(app ?? this.app); },
  show(app: PhoneApp = 'home') {
    if (!this.ctx) return;
    const fresh = !this.node;
    // 지도 앱은 폴더블처럼 펼쳐지며 열림
    this.unfold = app === 'map' && (fresh || this.app !== 'map');
    this.app = app; this.confirmReset = false; this.bagPick = '';
    if (fresh) {
      sfx.play('phone_open');
      const n = document.createElement('div');
      n.className = 'ph-wrap pointer-events-auto';
      document.getElementById('ui')!.appendChild(n); this.node = n;
    } else sfx.play('tap');
    this.render();
  },
  go(app: PhoneApp) { this.show(app); },
  /** Esc: 앱이면 홈으로, 홈이면 닫기 */
  back() { if (!this.node) return false; if (this.app !== 'home') this.show('home'); else this.close(); return true; },
  close() { if (!this.node) return; sfx.play('phone_close'); const n = this.node; this.node = null; n.classList.add('ph-out'); setTimeout(() => n.remove(), 180); },
  refresh() { if (this.node) this.render(); },
  /** 시계만 갱신 (매 10분) */
  tick(t: WorldTime) { const s = this.node?.querySelector('[data-ph=clock]'); if (s) s.textContent = formatTime(t.minutes); },

  render() {
    const n = this.node!, c = this.ctx!, me = c.me(), t = c.time();
    const wide = this.app === 'map';
    // 같은 앱을 다시 그릴 때는 스크롤 위치 유지 (가방 · 도감 등)
    const prev = n.querySelector<HTMLElement>('.ph-content'), keep = prev && n.dataset.app === this.app ? prev.scrollTop : 0;
    n.dataset.app = this.app;
    n.classList.toggle('ph-wide', wide);
    if (this.unfold) {
      this.unfold = false;
      n.classList.remove('ph-unfold'); void n.offsetWidth; n.classList.add('ph-unfold');
      sfx.play('unfold');
      clearTimeout(this.unfoldTimer); this.unfoldTimer = window.setTimeout(() => { n.classList.remove('ph-unfold'); n.querySelector('.ph-fold')?.remove(); }, 1400);
    }
    const unfolding = n.classList.contains('ph-unfold');
    n.innerHTML = `<div class="ph-body">
      <div class="ph-speaker"></div>
      <div class="ph-screen ${this.app === 'home' ? 'ph-wall' : ''}">
        <div class="ph-status"><span data-ph="clock">${formatTime(t.minutes)}</span><span>${SEASON_KO[t.season]} ${t.day}일 ${t.weather === 'rain' ? '☂' : '☀'}</span><span class="ph-gold"><span class="px-icon" style="${iconStyle('gold', 16)}"></span>${me.gold.toLocaleString()}G</span></div>
        ${this.app === 'home' ? '' : `<div class="ph-head"><button data-ph="back" class="ph-back" title="뒤로 (Esc)">‹</button><span>${TITLE[this.app]}</span><button data-ph="x" class="ph-back" title="닫기 (R)">×</button></div>`}
        <div class="ph-content">${this.body(me)}</div>
        <button data-ph="home" class="ph-homebar" title="홈"></button>
      </div></div>${unfolding ? '<div class="ph-fold"><i class="front"></i><i class="back"></i></div>' : ''}`;
    n.querySelector<HTMLButtonElement>('[data-ph=back]')?.addEventListener('click', () => this.back());
    n.querySelector<HTMLButtonElement>('[data-ph=x]')?.addEventListener('click', () => this.close());
    n.querySelector<HTMLButtonElement>('[data-ph=home]')!.onclick = () => (this.app === 'home' ? this.close() : this.show('home'));
    n.querySelectorAll<HTMLButtonElement>('[data-app]').forEach((b) => { b.onclick = () => this.show(b.dataset.app as PhoneApp); });
    const content = n.querySelector<HTMLElement>('.ph-content'); if (content && keep) content.scrollTop = keep;
    this.wire(n, me);
    if (this.app === 'map') this.drawFog(n, me);
  },

  body(me: PlayerState): string {
    switch (this.app) {
      case 'home': return this.home(me);
      case 'map': return this.mapApp(me);
      case 'party': return this.partyApp(me);
      case 'bag': return this.bagApp(me);
      case 'dex': return this.dexApp(me);
      case 'recipes': return this.recipeApp(me);
      case 'badges': return this.badgeApp(me);
      case 'friends': return this.friendApp();
      case 'settings': return this.settingsApp();
      case 'help': return HELP_HTML;
      case 'bug': return this.bugApp();
      case 'admin': return this.adminApp();
    }
  },

  // ── 버그 신고 ──
  bugApp() {
    if (!this.ctx!.online()) return '<div class="ph-empty">버그 신고는 멀티플레이(구글 로그인)에서 보낼 수 있어요.<br>혼자 하기 중이라면 개발자에게 직접 알려 주세요!</div>';
    return `<div class="ph-card ph-col"><b>🐞 무엇이 이상했나요?</b><div class="ph-small">어디서 · 무엇을 하다가 · 어떻게 됐는지 적어 주면 고치기 쉬워요. (지금 위치는 자동으로 함께 보내져요)</div>
      <textarea data-bug class="ph-input" rows="6" maxlength="500" placeholder="예) 바람골 도장 앞 계단에서 위로 올라가면 캐릭터가 멈춰요"></textarea>
      <div class="ph-acts"><button data-bugsend class="ph-btn">신고 보내기</button></div>${this.bugSent ? '<div class="ph-small" style="color:#2f8a3a">✔ 신고를 보냈어요. 고마워요!</div>' : ''}</div>`;
  },
  bugSent: false,
  newReports: 0,
  // ── 관리자 ── (목록 · 버튼은 화면일 뿐, 모든 명령은 서버가 관리자 계정인지 확인한 뒤 처리)
  adminTab: 'users' as 'users' | 'reports',
  adminData: null as null | AdminReply,
  adminMsg: '',
  adminLoading: false,
  adminApp() {
    if (!this.ctx!.isAdmin()) return '<div class="ph-empty">권한이 없어요.</div>';
    const d = this.adminData;
    const tabs = `<div class="ph-tabs"><button data-atab="users" class="${this.adminTab === 'users' ? 'on' : ''}">접속 유저</button><button data-atab="reports" class="${this.adminTab === 'reports' ? 'on' : ''}">버그 신고${this.newReports ? ` (${this.newReports})` : ''}</button><button data-arefresh>↻</button></div>`;
    const msg = this.adminMsg ? `<div class="ph-small" style="margin:4px 0">${esc(this.adminMsg)}</div>` : '';
    if (!d) return `${tabs}${msg}<div class="ph-empty">불러오는 중…</div>`;
    if (this.adminTab === 'reports') {
      const list = (d.reports ?? []).map((r) => `<div class="ph-card ph-col ${r.resolved ? 'ph-dim' : ''}"><b>${esc(r.name)}</b> <span class="ph-small">${new Date(r.at).toLocaleString('ko-KR')}</span><div class="ph-small">${esc(r.where)}</div><div style="white-space:pre-wrap">${esc(r.text)}</div>${r.resolved ? '<span class="ph-small">✔ 처리됨</span>' : `<div class="ph-acts"><button data-resolve="${esc(r.id)}" class="ph-btn sm">처리 완료</button></div>`}</div>`).join('');
      return `${tabs}${msg}${list || '<div class="ph-empty">신고가 없어요</div>'}`;
    }
    const items = Object.values(ITEMS).map((it) => `<option value="${it.id}">${esc(it.name)}</option>`).join('');
    const users = (d.users ?? []).map((u) => `<div class="ph-card ph-col"><b>${esc(u.name)}</b> <span class="ph-small">${esc(u.mapName)} · ${u.gold.toLocaleString()}G · 배지 ${u.badges} · ${esc(u.world)}</span>
      <div class="ph-small">${esc(u.party || '루미 없음')}</div><div class="ph-small" style="opacity:.6">${esc(u.uid)}</div>
      <div class="ph-acts"><button data-aop="goto" data-uid="${esc(u.uid)}" class="ph-btn sm">가기</button><button data-aop="bring" data-uid="${esc(u.uid)}" class="ph-btn sm">데려오기</button><button data-aop="kick" data-uid="${esc(u.uid)}" class="ph-btn sm ghost">강퇴</button><button data-aop="ban" data-uid="${esc(u.uid)}" class="ph-btn sm ghost">밴</button></div>
      <div class="ph-acts"><select data-gi="${esc(u.uid)}" class="ph-input sm">${items}</select><input data-gq="${esc(u.uid)}" class="ph-input sm" type="number" min="1" max="999" value="1" style="width:60px"><button data-aop="give" data-uid="${esc(u.uid)}" class="ph-btn sm">지급</button></div>
      <div class="ph-acts"><input data-gg="${esc(u.uid)}" class="ph-input sm" type="number" value="1000" style="width:90px"><button data-aop="gold" data-uid="${esc(u.uid)}" class="ph-btn sm">골드 ±</button></div></div>`).join('');
    const bans = (d.bans ?? []).map((b) => `<div class="ph-card ph-col ph-dim"><b>${esc(b.name)}</b> <span class="ph-small">${esc(b.reason)}</span><div class="ph-acts"><button data-aop="unban" data-uid="${esc(b.uid)}" class="ph-btn sm">밴 해제</button></div></div>`).join('');
    return `${tabs}${msg}${users || '<div class="ph-empty">접속한 유저가 없어요</div>'}${bans ? `<div class="ph-sec">정지된 계정</div>${bans}` : ''}`;
  },
  async adminLoad() {
    const r = await this.ctx!.admin(this.adminTab === 'reports' ? { op: 'reports' } : { op: 'users' });
    this.adminData = r.ok ? r : this.adminData; if (!r.ok) this.adminMsg = r.message ?? '실패';
    if (this.adminTab === 'reports') this.newReports = 0;
    if (this.app === 'admin') this.render();
  },
  async adminRun(cmd: AdminCmd) {
    const r = await this.ctx!.admin(cmd);
    this.adminMsg = r.message ?? (r.ok ? '완료' : '실패');
    await this.adminLoad();
  },
  /** 새 버그 신고가 오면 관리자 휴대폰 아이콘에 숫자 */
  onReport() { this.newReports++; if (this.app === 'admin' && this.adminTab === 'reports') void this.adminLoad(); else if (this.app === 'home') this.refresh(); },

  home(me: PlayerState) {
    const lead = me.party[0];
    const sp = lead ? SPECIES[lead.species] : null;
    return `<div class="ph-hello">
        ${sp ? `<span class="lumi-icon lumi-bounce" style="background-image:url(assets/lumi/${lead!.species}.png);width:56px;height:56px;background-size:336px 56px"></span>` : '<span class="ph-emoji" style="font-size:34px">✨</span>'}
        <div><div class="ph-name">${esc(me.name)}</div><div class="ph-sub">${sp ? `파트너 ${sp.name} · Lv.${lead!.level}` : '아직 파트너가 없어요'} · 배지 ${me.badges.length}/8</div></div>
      </div>
      <div class="ph-grid">${[...APPS, ...(this.ctx!.isAdmin() ? [ADMIN_APP] : [])].map((a) => `<button data-app="${a.id}" class="ph-app"><span class="ph-tile" style="background:${a.bg}">${a.glyph()}</span><span class="ph-label">${a.name}</span>${a.id === 'admin' && this.newReports ? `<i class="ph-badge">${this.newReports}</i>` : ''}</button>`).join('')}</div>
      <div class="ph-foot">R 닫기 · M 지도 · Esc 뒤로</div>`;
  },

  // ── 지도 ──
  mapApp(me: PlayerState) {
    if (!this.ctx!.mapUnlocked()) return '<div class="ph-empty">아직 지도 앱이 없어요.<br>마을회관에서 이장님을 만나면 설치해 주실 거예요!</div>';
    const { id: here, owner } = this.ctx!.here();
    const seen = new Set([...(me.visited ?? []), here]);
    const places = Object.entries(MAP_META).filter(([id, m]) => (!m.interior && m.kind !== 'room') || (id === here && m.x > 0));
    const known = places.filter(([id]) => seen.has(id));
    const towns = places.filter(([, m]) => m.kind === 'town').length, knownTowns = known.filter(([, m]) => m.kind === 'town').length;
    const gymType: Record<string, string> = { windvale: '바람', harbor: '물', maple: '풀', forge: '땅', ember: '불', lumina: '빛', summit: '혼합', frost: '노말' };
    const pin = (id: string, m: MapMeta) => {
      const cur = id === here;
      const town = m.kind === 'town' || m.kind === 'farm';
      const name = m.name.split(' · ')[0];
      if (m.kind === 'route' && !cur) return '';
      const style = `left:${(m.x / 360) * 100}%;top:${(m.y / 240) * 100}%`;
      if (town) {
        const ring = id === 'crown' ? '#f0c84a' : gymType[id] ? (TYPE_COLORS[gymType[id] as keyof typeof TYPE_COLORS] ?? '#a88ad8') : '#fff8ec';
        return `<div class="ph-pin town ${cur ? 'cur' : ''}" style="${style}" data-tip="${esc(name)}${gymType[id] ? ` · ${gymType[id]} 도장` : id === 'crown' ? ' · 루미 리그' : ''}">
          <span class="dot" style="--ring:${ring}"></span><span class="lbl">${esc(name)}</span>${cur ? '<span class="here">▼</span>' : ''}</div>`;
      }
      return `<div class="ph-pin spot ${m.kind} ${cur ? 'cur' : ''}" style="${style}" data-tip="${esc(name)}"><span class="dot"></span>${cur ? `<span class="lbl">${esc(name)}</span><span class="here">▼</span>` : ''}</div>`;
    };
    return `<div class="ph-map">
        <img src="assets/ui/worldmap.png" alt="">

        <canvas width="360" height="240"></canvas>
        ${known.map(([id, m]) => pin(id, m)).join('')}
        <div class="ph-tip" hidden></div>
      </div>
      <div class="ph-mapbar"><span>📍 <b>${esc(MAP_META[here as keyof typeof MAP_META]?.name ?? '?')}${esc(owner)}</b></span><span>마을 ${knownTowns}/${towns} · 가 본 곳 ${known.length}/${places.length}</span></div>`;
  },
  /** 안개: 구름 무늬(3단 + 디더 가장자리), 가 본 곳 주변만 걷힘 */
  drawFog(n: HTMLElement, me: PlayerState) {
    const cv = n.querySelector<HTMLCanvasElement>('.ph-map canvas'); if (!cv) return;
    const g = cv.getContext('2d')!, W = 360, H = 240, img = g.createImageData(W, H);
    const { id: here } = this.ctx!.here();
    const seen = new Set([...(me.visited ?? []), here]);
    // 각 칸은 '가장 가까운 장소'를 따름: 가 본 곳이 더 가까우면 걷힘 → 모두 가 보면 바다까지 전부 보임
    const pts = Object.entries(MAP_META).filter(([, m]) => m.x > 0 && m.kind !== 'room');
    const vis = pts.filter(([id]) => seen.has(id)).map(([, m]) => [m.x, m.y] as const);
    const unv = pts.filter(([id]) => !seen.has(id)).map(([, m]) => [m.x, m.y] as const);
    const B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const tones = [[184, 196, 216], [214, 222, 236], [236, 241, 249], [250, 252, 255]];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let dv = 1e9, du = 1e9;
      for (const [px, py] of vis) dv = Math.min(dv, Math.hypot(x - px, (y - py) * 1.1));
      for (const [px, py] of unv) du = Math.min(du, Math.hypot(x - px, (y - py) * 1.1));
      // 가 본 곳에서 너무 멀면(바다 끝) 아직 안개, 경계는 8칸에 걸쳐 디더
      const wob = 5 * Math.sin(x / 9 + Math.sin(y / 7) * 1.8) * Math.cos(y / 11 - x / 23) + 2.5 * Math.sin((x + y * 1.3) / 4.7);   // 구름 경계를 구불구불하게
      const open = Math.min((du - dv + wob) / 8 + 0.5, (34 - dv + wob) / 8 + 0.5);
      const b = (B[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      const fog = unv.length ? 1 - Math.max(0, Math.min(1, open)) : 0;
      const i = (y * W + x) * 4;
      if (fog <= 0 || fog < b * 0.9) { img.data[i + 3] = 0; continue; }
      const v = 0.5 + 0.28 * Math.sin(x / 11 + Math.sin(y / 15) * 2.2) * Math.cos(y / 12 - x / 33) + 0.16 * Math.sin((x * 0.7 + y) / 6.5) + 0.08 * Math.sin(x / 3.1 - y / 4.3);
      const edge = fog < 0.55;
      const k = edge ? 0 : v < 0.38 ? 1 : v < 0.62 ? 2 : 3;
      const [r, gg, bb] = tones[k];
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 250;
    }
    g.putImageData(img, 0, 0);
  },

  // ── 나의 루미 ──
  partyApp(me: PlayerState) {
    if (!me.party.length) return '<div class="ph-empty">아직 파트너가 없어요.<br>별빛 마을 <b>마을회관</b>의 한별 박사님을 찾아가 보세요!</div>';
    return `<div class="ph-list">${me.party.map((c, i) => {
      const sp = SPECIES[c.species], max = maxHpOf(c), r = Math.max(0, c.hp / max);
      return `<div class="ph-card ${i === 0 ? 'lead' : ''}">
        <span class="lumi-icon" style="background-image:url(assets/lumi/${c.species}.png);width:48px;height:48px;background-size:288px 48px"></span>
        <div class="flex-1 min-w-0">
          <div class="ph-row"><b>${i === 0 ? '★ ' : ''}${sp.name}</b>${typeChip(sp.type)}<span class="ml-auto">Lv.${c.level}</span></div>
          <div class="ph-hp"><i style="width:${r * 100}%;background:${r > 0.5 ? '#5fc04a' : r > 0.2 ? '#f0c84a' : '#e0473b'}"></i></div>
          <div class="ph-row ph-small"><span>HP ${c.hp}/${max}</span><span class="ml-auto">${sp.kind}</span></div>
          <div class="ph-small ph-help1">🌱 ${HELPS[sp.helps] ?? ''}</div>
          ${i > 0 ? `<button data-partner="${i}" class="ph-btn sm">함께 걷기</button>` : '<div class="ph-small ph-ok">함께 걷는 중</div>'}
        </div></div>`;
    }).join('')}</div>
    <div class="ph-foot">보관함 ${me.box.length}마리 · 파티는 최대 6마리</div>`;
  },

  // ── 가방 ──
  bagApp(me: PlayerState) {
    const c = this.ctx!, held = c.held();
    // 칸 키: 's:<가방 칸>' (소지품) · 'b:<아이템>' (모험 가방)
    // 도구는 아래에 내구도 막대 (초록 → 노랑 → 빨강)
    const durBar = (key: string, id: string) => {
      const max = ITEMS[id]?.durability; if (!max || !key.startsWith('s:')) return '';
      const cur = me.inventory[Number(key.slice(2))]?.dur ?? max, r = Math.max(0, Math.min(1, cur / max));
      return `<em class="ph-dur"><u style="width:${Math.round(r * 100)}%;background:${r > 0.5 ? '#5ec85a' : r > 0.2 ? '#e8c03a' : '#e0473b'}"></u></em>`;
    };
    const cell = (key: string, id: string, q: number, on = false) => `<button class="ph-cell ${this.bagPick === key ? 'on' : ''} ${on ? 'held' : ''}" data-item="${key}" title="${esc(ITEMS[id]?.name ?? id)}"><span class="px-icon" style="${iconStyle(ITEMS[id]?.icon ?? id, 32)}"></span>${q > 1 ? `<b>${q}</b>` : ''}${on ? '<i>✋</i>' : ''}${durBar(key, id)}</button>`;
    const groups: [string, (t: string) => boolean][] = [['도구', (t) => t === 'tool'], ['씨앗', (t) => t === 'seed'], ['작물 · 재료 · 음식', (t) => t === 'crop' || t === 'material' || t === 'food'], ['설치물', (t) => t === 'placeable'], ['중요한 물건', (t) => t === 'key']];
    const slots = me.inventory.map((s, i) => ({ s, i })).filter(({ s }) => s.itemId && s.quantity > 0 && ITEMS[s.itemId]);
    const used = slots.length;
    const sec = groups.map(([name, f]) => { const list = slots.filter(({ s }) => f(ITEMS[s.itemId!].type)); return list.length ? `<div class="ph-sec">${name} <span>${list.length}칸</span></div><div class="ph-cells">${list.map(({ s, i }) => cell(`s:${i}`, s.itemId!, s.quantity, i === held)).join('')}</div>` : ''; }).join('');
    const adv = Object.entries(me.bag).filter(([, q]) => q > 0);
    // 선택한 아이템 설명 + 할 수 있는 일
    let detail = '<span class="ph-small">아이템을 누르면 설명과 할 수 있는 일이 나와요</span>';
    if (this.bagPick) {
      const [kind, v] = this.bagPick.split(':');
      const id = kind === 's' ? me.inventory[Number(v)]?.itemId : v;
      const it = id ? ITEMS[id] : null;
      if (it) {
        const acts = kind === 's' ? c.bagActions(Number(v)) : [];
        const dur = kind === 's' && it.durability ? ` · 내구도 ${me.inventory[Number(v)]?.dur ?? it.durability}/${it.durability}` : '';
        detail = `<b>${it.name}</b> <span class="ph-small">보유 ${countItem(me, it.id)}개${it.sellPrice ? ` · 출하 ${it.sellPrice}G` : ''}${dur}</span><br>${esc(it.description)}
          ${acts.length ? `<div class="ph-acts">${acts.map((a, k) => `<button data-act="${k}" class="ph-btn sm ${a.primary ? '' : 'ghost'}">${esc(a.label)}</button>`).join('')}</div>` : kind === 'b' ? '<div class="ph-small" style="margin-top:4px">배틀 중 가방에서 써요</div>' : ''}`;
      } else this.bagPick = '';
    }
    const h = me.inventory[held]?.itemId ? ITEMS[me.inventory[held].itemId!] : null;
    return `<div class="ph-heldbar">✋ 손에 든 것: <b>${h ? h.name : '없음'}</b><span>Space · 좌클릭으로 사용</span></div>
      ${sec || '<div class="ph-none">소지품이 비어 있어요. 마을 소라네 루미 마트에서 도구를 사 보세요!</div>'}
      <div class="ph-sec">모험 가방 <span>배틀에서 사용</span></div>
      <div class="ph-cells">${adv.map(([id, q]) => cell(`b:${id}`, id, q)).join('') || '<div class="ph-none">비어 있어요</div>'}</div>
      <div class="ph-detail">${detail}</div>
      <div class="ph-foot">소지품 ${used}/${me.inventory.length}칸</div>`;
  },

  // ── 도감 ──
  dexApp(me: PlayerState) {
    const all = Object.values(SPECIES);
    const seen = new Set(me.seen), caught = new Set(me.caught);
    const goal = all.filter((sp) => sp.legend !== 'myth'), done = goal.filter((sp) => caught.has(sp.id)).length;
    return `<div class="ph-dexhead"><span>본 루미 <b>${seen.size}</b></span><span>잡은 루미 <b>${caught.size}</b></span><span>완성 <b>${done}/${goal.length}</b></span></div>
      ${done >= goal.length ? '<div class="ph-heldbar">🏆 루미 도감 완성! 루미 리그의 루미 마스터가 다시 기다리고 있어요.</div>' : ''}
      <div class="ph-dex">${all.map((sp, i) => {
        const s = seen.has(sp.id) || caught.has(sp.id), c = caught.has(sp.id);
        return `<div class="ph-dexcell ${s ? '' : 'unk'}" title="${s ? `${sp.name} · ${sp.type} · ${esc(sp.description)}` : '아직 만나지 못한 루미'}">
          <span class="no">${String(i + 1).padStart(3, '0')}</span>
          <span class="lumi-icon" style="background-image:url(assets/lumi/${sp.id}.png);width:40px;height:40px;background-size:240px 40px;${s ? '' : 'filter:brightness(0) opacity(.35)'}"></span>
          <span class="nm">${s ? sp.name : '???'}</span>${sp.legend ? `<span class="ph-small" style="color:${sp.legend === 'myth' ? '#d0547a' : '#6a4ab8'}">${sp.legend === 'myth' ? '환상' : '전설'}</span>` : ''}${c ? `<span class="ball px-icon" style="${iconStyle('lumi_ball', 14)}"></span>` : ''}</div>`;
      }).join('')}</div>
      <div class="ph-foot">생활 도감(농사 · 채광 · 낚시)은 다음 업데이트에서 추가돼요</div>`;
  },

  // ── 제작 노트 ──
  recipeApp(me: PlayerState) {
    const list = Object.values(RECIPES).sort((x, y) => Number(!!y.starter) - Number(!!x.starter) || (x.badges ?? 0) - (y.badges ?? 0));
    return `<div class="ph-list">${list.map((r) => {
      const out = ITEMS[r.out], known = me.recipes.includes(r.id);
      const ok = known && Object.entries(r.in).every(([id, q]) => countItem(me, id) >= q);
      const mats = Object.entries(r.in).map(([id, q]) => { const h = countItem(me, id); return `<span class="${h >= q ? '' : 'ph-bad'}"><span class="px-icon" style="${iconStyle(ITEMS[id].icon, 16)}"></span>${ITEMS[id].name} ${h}/${q}</span>`; }).join('');
      return `<div class="ph-card ${known ? '' : 'locked'}">
        <span class="px-icon" style="${iconStyle(out.icon, 36)}${known ? '' : ';filter:grayscale(1) brightness(.6)'}"></span>
        <div class="flex-1 min-w-0"><div class="ph-row"><b>${known ? out.name : '???'}</b>${r.qty > 1 ? `<span class="ph-small">×${r.qty}</span>` : ''}${ok ? '<span class="ml-auto ph-ok">제작 가능</span>' : ''}</div>
          <div class="ph-mats">${known ? mats : `🔒 ${NPCS[r.teacher ?? '']?.name ?? '공방'}에게 배우기 · 배지 ${r.badges ?? 0}개`}</div></div></div>`;
    }).join('')}</div>
    <div class="ph-foot">제작은 집 작업대 · 민수의 볼 공방 · 한별 연구소에서</div>`;
  },

  // ── 배지 ──
  badgeApp(me: PlayerState) {
    const has = new Set(me.badges);
    return `<div class="ph-badges">${BADGES.map(([id, town, leader, type], i) => {
      const got = has.has(id);
      return `<div class="ph-badge ${got ? 'got' : ''}"><span class="px-icon" style="${iconStyle(ITEMS[id]?.icon ?? id, 32)}${got ? '' : ';filter:brightness(0) opacity(.3)'}"></span>
        <span class="nm">${got ? ITEMS[id]?.name ?? '' : `${i + 1}번째`}</span><span class="ph-small">${town}<br>${leader} · ${type}</span></div>`;
    }).join('')}</div>
    <div class="ph-progress"><i style="width:${(me.badges.length / 8) * 100}%"></i><span>${me.badges.length} / 8</span></div>
    <div class="ph-foot">배지 8개를 모으면 왕관 시티 루미 리그에 도전할 수 있어요</div>`;
  },

  // ── 친구 ──
  friendApp() {
    const list = this.ctx!.roster();
    return `<div class="ph-sec">${this.ctx!.online() ? '접속 중' : '혼자 하기'} <span>${list.length}명</span></div>
      <div class="ph-list">${list.map((p) => `<div class="ph-card"><span class="ph-avatar">${p.me ? '★' : esc(p.name.slice(0, 1))}</span><div class="flex-1 min-w-0"><b>${esc(p.name)}</b><div class="ph-small">${esc(p.where)}</div></div></div>`).join('')}</div>
      <div class="ph-foot">내 농장 우편함에서 친구를 농장 · 집으로 초대할 수 있어요</div>`;
  },

  // ── 설정 ──
  settingsApp() {
    const c = this.ctx!;
    if (this.confirmReset) return `<div class="ph-empty">정말 처음부터 다시 시작할까요?<br><span class="ph-bad">캐릭터 · 가방 · 루미 · 농장이 모두 지워져요.</span></div>
      <div class="ph-stack"><button data-set="yes" class="ph-btn danger">네, 초기화할게요</button><button data-set="no" class="ph-btn">아니요</button></div>`;
    const sw = (k: string, label: string, on: boolean) => `<button data-set="${k}" class="ph-switch ${on ? 'on' : ''}"><span>${label}</span><i></i></button>`;
    return `<div class="ph-stack">
        ${sw('sound', '효과음', !sfx.muted)}${sw('steps', '발소리', sfx.stepsOn)}${sw('music', '배경음악', music.on)}
      </div>
      <div class="ph-sec">저장 <span>${esc(c.storage())}</span></div>
      <div class="ph-stack">
        ${c.canSave() ? '<button data-set="save" class="ph-btn">지금 저장하기</button>' : '<div class="ph-small" style="text-align:center">서버에 자동으로 저장되고 있어요</div>'}
        <button data-set="reset" class="ph-btn danger">저장 초기화</button>
        <button data-set="title" class="ph-btn ghost">타이틀로</button>
      </div>`;
  },

  wire(n: HTMLElement, me: PlayerState) {
    // 버그 신고
    n.querySelector<HTMLButtonElement>('[data-bugsend]')?.addEventListener('click', () => {
      const ta = n.querySelector<HTMLTextAreaElement>('[data-bug]'); const text = ta?.value.trim() ?? '';
      if (!text) { sfx.play('error'); return; }
      if (this.ctx!.report(text)) { sfx.play('confirm'); this.bugSent = true; this.render(); setTimeout(() => { this.bugSent = false; }, 30000); }
    });
    n.querySelector<HTMLTextAreaElement>('[data-bug]')?.addEventListener('keydown', (e) => e.stopPropagation());
    // 관리자
    if (this.app === 'admin') {
      if (!this.adminData && !this.adminLoading) { this.adminLoading = true; void this.adminLoad().finally(() => { this.adminLoading = false; }); }
      n.querySelectorAll<HTMLButtonElement>('[data-atab]').forEach((b) => { b.onclick = () => { this.adminTab = b.dataset.atab as 'users' | 'reports'; this.adminData = null; this.render(); }; });
      n.querySelector<HTMLButtonElement>('[data-arefresh]')?.addEventListener('click', () => { this.adminMsg = ''; void this.adminLoad(); });
      n.querySelectorAll<HTMLButtonElement>('[data-resolve]').forEach((b) => { b.onclick = () => void this.adminRun({ op: 'resolve', id: b.dataset.resolve! }); });
      n.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.ph-input').forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
      n.querySelectorAll<HTMLButtonElement>('[data-aop]').forEach((b) => {
        b.onclick = () => {
          const op = b.dataset.aop!, uid = b.dataset.uid!;
          if ((op === 'kick' || op === 'ban') && !window.confirm(`${op === 'ban' ? '이용 정지' : '강퇴'}할까요?`)) return;
          if (op === 'give') { const it = n.querySelector<HTMLSelectElement>(`[data-gi="${CSS.escape(uid)}"]`)?.value ?? ''; const q = Number(n.querySelector<HTMLInputElement>(`[data-gq="${CSS.escape(uid)}"]`)?.value ?? 1); void this.adminRun({ op: 'give', uid, itemId: it, qty: q }); return; }
          if (op === 'gold') { const a = Number(n.querySelector<HTMLInputElement>(`[data-gg="${CSS.escape(uid)}"]`)?.value ?? 0); void this.adminRun({ op: 'gold', uid, amount: a }); return; }
          void this.adminRun({ op: op as 'goto' | 'bring' | 'kick' | 'ban' | 'unban', uid });
        };
      });
    }
    const c = this.ctx!;
    n.querySelectorAll<HTMLButtonElement>('[data-partner]').forEach((b) => { b.onclick = () => { sfx.play('confirm'); c.setPartner(Number(b.dataset.partner)); }; });
    n.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) => { b.onclick = () => { sfx.play('tap'); this.bagPick = this.bagPick === b.dataset.item ? '' : b.dataset.item!; this.render(); }; });
    n.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
      b.onclick = () => {
        const [kind, v] = this.bagPick.split(':'); if (kind !== 's') return;
        const act = c.bagActions(Number(v))[Number(b.dataset.act)];
        act?.run(); this.render();
      };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((b) => {
      b.onclick = () => {
        sfx.play('tap');
        const k = b.dataset.set;
        if (k === 'sound') sfx.setMuted(!sfx.muted);
        else if (k === 'steps') sfx.setSteps(!sfx.stepsOn);
        else if (k === 'music') music.setOn(!music.on);
        else if (k === 'save') c.save();
        else if (k === 'reset') this.confirmReset = true;
        else if (k === 'no') this.confirmReset = false;
        else if (k === 'yes') { this.close(); c.reset(); return; }
        else if (k === 'title') { this.close(); c.toTitle(); return; }
        this.render();
      };
    });
    const tip = n.querySelector<HTMLDivElement>('.ph-tip');
    if (tip) n.querySelectorAll<HTMLElement>('.ph-pin').forEach((p) => {
      p.onmouseenter = () => { tip.hidden = false; tip.textContent = p.dataset.tip ?? ''; tip.style.left = p.style.left; tip.style.top = p.style.top; };
      p.onmouseleave = () => { tip.hidden = true; };
    });
    void me;
  },
};

const HELP_HTML = `<table class="ph-help"><tbody>
  ${[['WASD / 방향키', '이동 (Shift 달리기)'], ['Space / 좌클릭', '손에 든 도구 사용 · 씨앗 · 낚시'], ['E / 우클릭', '대화 · 수확 · 출하 · 잡초 뽑기 · 조사'], ['R', '휴대폰 홈 화면 (가방에서 도구 바꾸기)'], ['M', '지도 바로 열기'], ['P', '휴대폰 › 나의 루미'], ['H', '휴대폰 › 도움말'], ['Esc', '휴대폰 뒤로 · 닫기'], ['Enter', '채팅'], ['Tab', '감정표현 휠 (톡 누르고 클릭 · 누른 채 고르고 떼기)'], ['L', '접속자 목록 접기']]
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
  </tbody></table>
  <div class="ph-note"><b>내 농장 일구기</b>: 마을 소라네 루미 마트에서 괭이 · 물뿌리개 · 도끼 · 곡괭이 · 망치를 사요. 잡초는 E 로 뽑고, 안쪽 나무는 도끼로(5번), 돌은 곡괭이로 치운 뒤 괭이로 땅을 갈아요. 가방에서 씨앗을 누르면 주변 밭에 심고, 매일 물을 주면 자라요. 작업대에서 만든 울타리 · 상자는 가방에서 설치하고 망치로 부숴요.<br><b>모험 보급</b>: 루미풀 · 불꽃고추 · 단단콩과 돌 · 구리 · 철로 회복약 · 도핑약 · 루미볼을 만들어요.</div>`;
