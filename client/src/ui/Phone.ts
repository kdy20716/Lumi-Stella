// 휴대폰 (R · 지도는 M): 화면 오른쪽에 뜨는 루미폰. 지도 · 나의 루미 · 가방 · 도감 · 제작 노트 · 배지 · 친구 · 설정 · 도움말을 모두 여기서.
//   - 폰이 열려 있어도 걸어 다닐 수 있음 (지도만 가로 화면으로 넓어짐)
//   - Esc: 앱 → 홈 → 닫기 / M: 열기·닫기 / P: 나의 루미 / H: 도움말
import { BM_ALL_TOTAL_KRW, BM_CASH_PACK_MAP, BM_CASH_PACKS, BM_PRODUCT_MAP, BM_PRODUCTS, CHAT_BUBBLES, STARTER_LUMI_IDS, STARTER_LUMI_SET, UI_THEMES, formatCash, formatKrw, formatUsd, isBmUnlocked, remainingBmCostKrw, type BmCashPack, type BmCategory, type BmProduct } from '@shared/bmShop';
import { ITEMS, MOVES, RECIPES, REGION_MAPS, SPECIES, NPCS, TYPE_COLORS } from '@shared/data';
import { expToNext, maxPp, ppLeft, stats } from '@shared/sim/Battle';
import { formatBanUntil, formatMuteRemaining } from '@shared/sim/antiCheat';
import { lifeDexSummary } from '@shared/sim/lifeDex';
import { getStoryGuide } from '@shared/storyGuide';
import { MAP_META, type CreatureInst, type MapId, type MapMeta, type PlayerState, type WorldTime } from '@shared/types';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { renderLifeDexApp, type LifeDexSubTab } from './LifeDexView';
import { lumiCoordBadgeHtml, lumiSheetUrl } from './LumiCoord';
import { lookPortrait } from './Social';
import { iconStyle, formatTime } from './UI';
import type { AdminCmd } from '@shared/protocol';
import type { AdminReply } from '../net/Authority';
import type { PgSystemTestResult } from '../net/bmApi';

export type PhoneApp = 'home' | 'messages' | 'journal' | 'map' | 'party' | 'bag' | 'dex' | 'shop' | 'recipes' | 'badges' | 'friends' | 'settings' | 'help' | 'bug' | 'admin';

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
  partySwap?(a: number, b: number): void;
  boxSwap?(partyIndex: number, boxIndex: number): Promise<boolean>;
  boxDeposit?(partyIndex: number): Promise<boolean>;
  boxWithdraw?(boxIndex: number): Promise<boolean>;
  boxRelease?(boxIndex: number): Promise<boolean>;
  useBagItem?(itemId: string, partyIndex: number): Promise<boolean>;
  fastTravel?(to: MapId): Promise<boolean>;
  escapeCave?(): Promise<boolean>;
  inCave?(): boolean;
  save(): void;
  reset(): void;
  toTitle(): void;
  /** 손에 든 가방 칸 */
  held(): number;
  /** 가방 칸을 눌렀을 때 할 수 있는 일 */
  bagActions(slot: number): { label: string; run: () => void; primary?: boolean }[];
  /** 버그·유저 신고 · 관리자 (서버가 확인한 관리자만 화면에 나옴 — 실제 권한 검사는 서버) */
  report(text: string, extra?: { kind?: 'bug' | 'user'; targetUid?: string; targetName?: string }): boolean;
  markNoticesRead?(): void;
  isAdmin(): boolean;
  admin(cmd: AdminCmd): Promise<AdminReply>;
  /** 캐쉬 충전 외부 PG 이동 · 캐쉬로 상점 상품 구매 · 코스메틱 적용 · 어드민 PG 점검 */
  buyCashPack?(pack: BmCashPack): void;
  buyBm?(product: BmProduct): Promise<boolean>;
  equipBm?(category: BmCategory, itemId: string): void;
  previewBm?(category: BmCategory | '', itemId: string): void;
  changeName?(newName: string): Promise<{ ok: boolean; name?: string; error?: string }>;
  useCandy?(partyIndex: number): Promise<boolean>;
  buyAllBmCash?(): Promise<{ ok: boolean; error?: string; boughtCount?: number }>;
  testPgSystem?(): Promise<PgSystemTestResult>;
  claimDexMilestone?(milestoneId: string): Promise<boolean>;
  setHungerMode?(off: boolean): Promise<boolean>;
}

const APPS: { id: Exclude<PhoneApp, 'home'>; name: string; bg: string; glyph: () => string }[] = [
  { id: 'messages', name: '메시지', bg: 'linear-gradient(160deg,#ff8080,#c82838)', glyph: () => '<span class="ph-emoji">📨</span>' },
  { id: 'journal', name: '모험 수첩', bg: 'linear-gradient(160deg,#7ec89a,#2d7a54)', glyph: () => '<span class="ph-emoji">🧭</span>' },
  { id: 'map', name: '지도', bg: 'linear-gradient(160deg,#6fc3e8,#2f7ab8)', glyph: () => '<span class="ph-emoji">🗺️</span>' },
  { id: 'party', name: '나의 루미', bg: 'linear-gradient(160deg,#ffd27a,#e8892e)', glyph: () => `<span class="px-icon" style="${iconStyle('lumi', 40)}"></span>` },
  { id: 'bag', name: '가방', bg: 'linear-gradient(160deg,#e8a86a,#a8683a)', glyph: () => `<span class="px-icon" style="${iconStyle('lumi_ball', 40)}"></span>` },
  { id: 'dex', name: '도감', bg: 'linear-gradient(160deg,#f2706a,#b83a3a)', glyph: () => '<span class="ph-emoji">📖</span>' },
  { id: 'shop', name: '상점', bg: 'linear-gradient(160deg,#ffe066,#d4881c)', glyph: () => '<span class="ph-emoji">💳</span>' },
  { id: 'recipes', name: '제작 노트', bg: 'linear-gradient(160deg,#9ad27a,#3f8a3e)', glyph: () => `<span class="px-icon" style="${iconStyle('potion', 40)}"></span>` },
  { id: 'badges', name: '배지', bg: 'linear-gradient(160deg,#c8a8ff,#6a4ab8)', glyph: () => `<span class="px-icon" style="${iconStyle('badge_star', 40)}"></span>` },
  { id: 'friends', name: '친구', bg: 'linear-gradient(160deg,#ffb0c8,#d0547a)', glyph: () => `<span class="px-icon" style="${iconStyle('heart', 40)}"></span>` },
  { id: 'settings', name: '설정', bg: 'linear-gradient(160deg,#c8d0dc,#6a7486)', glyph: () => '<span class="ph-emoji">⚙️</span>' },
  { id: 'help', name: '도움말', bg: 'linear-gradient(160deg,#fff0a8,#d8b03a)', glyph: () => '<span class="ph-emoji">❔</span>' },
  { id: 'bug', name: '신고하기', bg: 'linear-gradient(160deg,#ffb27a,#d8573a)', glyph: () => '<span class="ph-emoji">🚨</span>' },
];
const ADMIN_APP = { id: 'admin' as const, name: '관리자', bg: 'linear-gradient(160deg,#4a4a5a,#14141c)', glyph: () => '<span class="ph-emoji">🛡️</span>' };
const TITLE: Record<PhoneApp, string> = { home: '', messages: '메시지 · 벌금 고지서', journal: '모험 수첩', map: '루미나 지방 지도', party: '나의 루미 · PC 보관함', bag: '가방', dex: '도감 (루미 · 생활)', shop: '캐쉬 상점', recipes: '제작 · 요리 노트', badges: '배지 케이스', friends: '친구', settings: '설정', help: '도움말', bug: '유저 · 버그 신고', admin: '관리자 (admin)' };

/** 도장 순서 */
const BADGES: [string, string, string, string][] = [
  ['badge_wind', '바람골 마을', '세나', '바람'], ['badge_water', '물결항', '파도', '물'], ['badge_leaf', '단풍골', '단비', '풀'], ['badge_earth', '쇳불 도시', '무쇠', '땅'],
  ['badge_flame', '잿빛 마을', '화련', '불'], ['badge_light', '빛누리 시티', '샛별', '빛'], ['badge_normal', '서리 마을', '설아', '노말'], ['badge_star', '별마루 마을', '천문', '혼합'],
];
const worldmapImg = new Image();
worldmapImg.src = 'assets/ui/worldmap.png';
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
  partyTab: 'party' as 'party' | 'box',
  inspectTarget: null as null | { where: 'party' | 'box'; index: number },
  swapBoxIdx: null as number | null,
  releaseConfirmIdx: null as number | null,
  mapPick: '' as string,
  shopTab: 'theme' as 'cash' | BmCategory,
  shopPreviewId: '' as string,
  shopDetailId: '' as string,
  dexMode: 'lumi' as 'lumi' | 'life',
  lifeDexTab: 'farm' as LifeDexSubTab,
  recipeTab: 'all' as 'all' | 'workbench' | 'kitchen',
  unfold: false,
  unfoldTimer: 0,
  get open() { return !!this.node; },
  setCtx(c: PhoneCtx) { this.ctx = c; },

  openBox() {
    this.partyTab = 'box';
    this.inspectTarget = null;
    this.swapBoxIdx = null;
    this.releaseConfirmIdx = null;
    this.show('party');
  },
  toggle(app?: PhoneApp) { if (this.node && (!app || app === this.app)) this.close(); else this.show(app ?? this.app); },
  show(app: PhoneApp = 'home') {
    if (!this.ctx) return;
    const fresh = !this.node;
    if (this.app === 'shop' && app !== 'shop') {
      this.shopPreviewId = '';
      this.shopDetailId = '';
      this.ctx.previewBm?.('', '');
    }
    // 지도 · 상점 앱은 폴더블폰이 넓게 펼쳐지며 열림
    const isFoldable = app === 'map' || app === 'shop';
    this.unfold = isFoldable && (fresh || this.app !== app);
    if (app === 'admin') this.adminData = null;
    if (app === 'messages') this.ctx.markNoticesRead?.();
    if (app !== 'party') { this.inspectTarget = null; this.swapBoxIdx = null; this.releaseConfirmIdx = null; }
    if (app !== 'map') this.mapPick = '';
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
  /** Esc: 상세 탭이면 목록으로, 앱이면 홈으로, 홈이면 닫기 */
  back() {
    if (!this.node) return false;
    if (this.app === 'shop' && this.shopDetailId) {
      sfx.play('tap');
      this.shopDetailId = '';
      this.render();
      return true;
    }
    if (this.app === 'party' && (this.inspectTarget || this.swapBoxIdx !== null)) {
      sfx.play('tap');
      this.inspectTarget = null;
      this.swapBoxIdx = null;
      this.releaseConfirmIdx = null;
      this.render();
      return true;
    }
    if (this.app !== 'home') this.show('home');
    else this.close();
    return true;
  },
  close() {
    if (!this.node) return;
    if (this.app === 'shop') {
      this.shopPreviewId = '';
      this.shopDetailId = '';
      this.ctx?.previewBm?.('', '');
    }
    sfx.play('phone_close');
    const n = this.node;
    this.node = null;
    n.classList.add('ph-out');
    setTimeout(() => n.remove(), 180);
  },
  refresh() { if (this.node) this.render(); },
  /** 시계만 갱신 (매 10분) */
  tick(t: WorldTime) { const s = this.node?.querySelector('[data-ph=clock]'); if (s) s.textContent = formatTime(t.minutes); },

  render() {
    const n = this.node!, c = this.ctx!, me = c.me(), t = c.time();
    const wide = this.app === 'map' || this.app === 'shop';
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
      case 'messages': return this.messagesApp(me);
      case 'journal': return this.journalApp(me);
      case 'map': return this.mapApp(me);
      case 'party': return this.partyApp(me);
      case 'bag': return this.bagApp(me);
      case 'dex': return this.dexApp(me);
      case 'shop': return this.shopApp(me);
      case 'recipes': return this.recipeApp(me);
      case 'badges': return this.badgeApp(me);
      case 'friends': return this.friendApp();
      case 'settings': return this.settingsApp();
      case 'help': return HELP_HTML;
      case 'bug': return this.bugApp();
      case 'admin': return this.adminApp(me);
    }
  },

  // ── 메시지 · 벌금 고지서 알림함 ──
  messagesApp(me: PlayerState) {
    const list = me.notices ?? [];
    if (!list.length) {
      return `<div class="ph-empty">도착한 메시지나 고지서가 없어요.<br><span class="ph-small">벌금 고지서나 관리자 안내가 오면 여기에 표시됩니다.</span></div>`;
    }
    return `<div class="ph-list">${list.map((ntc) => {
      const dt = new Date(ntc.at).toLocaleString('ko-KR');
      if (ntc.kind === 'fine') {
        return `<div class="ph-card ph-col ph-notice-fine">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
            <b style="color:#b91c1c;font-size:13px">${esc(ntc.title)}</b>
            <span class="ph-small" style="color:#7f1d1d">${esc(dt)}</span>
          </div>
          <div class="ph-fine-grid">
            <div class="ph-fine-cell">
              <div class="ph-small" style="color:#7f1d1d">보유 골드</div>
              <b style="color:#dc2626;font-size:14px">0G</b>
              ${typeof ntc.prevGold === 'number' ? `<div class="ph-small" style="opacity:.7">(기존 ${ntc.prevGold.toLocaleString('ko-KR')}G 몰수)</div>` : ''}
            </div>
            <div class="ph-fine-cell">
              <div class="ph-small" style="color:#7f1d1d">보유 캐쉬</div>
              <b style="color:#dc2626;font-size:14px">0원</b>
              ${typeof ntc.prevCash === 'number' ? `<div class="ph-small" style="opacity:.7">(기존 ${ntc.prevCash.toLocaleString('ko-KR')}원 몰수)</div>` : ''}
            </div>
          </div>
          <div class="ph-small" style="white-space:pre-wrap;color:#450a0a;line-height:1.45">${esc(ntc.body)}</div>
        </div>`;
      }
      return `<div class="ph-card ph-col">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <b>${esc(ntc.title)}</b>
          <span class="ph-small">${esc(dt)}</span>
        </div>
        <div class="ph-small" style="white-space:pre-wrap;line-height:1.45">${esc(ntc.body)}</div>
      </div>`;
    }).join('')}</div>`;
  },

  // ── 유저 · 버그 신고 ──
  reportKind: 'user' as 'user' | 'bug',
  bugApp() {
    if (!this.ctx!.online() && !this.ctx!.isAdmin()) return '<div class="ph-empty">신고 기능은 멀티플레이(구글 로그인)에서 보낼 수 있어요.<br>혼자 하기 중이라면 개발자에게 직접 알려 주세요!</div>';
    const roster = this.ctx!.roster();
    const userOpts = [
      '<option value="">(직접 닉네임 입력 또는 대상 없음)</option>',
      ...roster.map((r) => `<option value="${esc(r.id)}" data-rname="${esc(r.name)}">${esc(r.name)} (${esc(r.where)})</option>`),
    ].join('');
    return `<div class="ph-card ph-col">
      <b>🚨 신고하기</b>
      <div class="ph-tabs" style="margin:4px 0">
        <button data-rkind="user" class="${this.reportKind === 'user' ? 'on' : ''}">유저 신고</button>
        <button data-rkind="bug" class="${this.reportKind === 'bug' ? 'on' : ''}">버그 신고</button>
      </div>
      ${this.reportKind === 'user' ? `<div class="ph-col" style="gap:4px;margin-bottom:4px">
        <div class="ph-small">신고할 유저를 고르거나 닉네임을 적어 주세요. (관리자가 확인 후 채팅 금지 · 접속 금지 · 감옥 수감을 결정합니다)</div>
        <select data-bugtarget class="ph-input sm">${userOpts}</select>
        <input data-bugtname class="ph-input sm" type="text" maxlength="24" placeholder="대상 닉네임 (목록에 없을 때 직접 입력)">
      </div>` : '<div class="ph-small">어디서 · 무엇을 하다가 · 어떻게 됐는지 적어 주면 고치기 쉬워요. (지금 위치는 자동으로 함께 보내져요)</div>'}
      <textarea data-bug class="ph-input" rows="5" maxlength="500" placeholder="${this.reportKind === 'user' ? '예) 욕설/도배 또는 비정상 치트 사용이 의심돼요' : '예) 바람골 도장 앞 계단에서 위로 올라가면 캐릭터가 멈춰요'}"></textarea>
      <div class="ph-acts"><button data-bugsend class="ph-btn">신고 보내기</button></div>${this.bugSent ? '<div class="ph-small" style="color:#2f8a3a">✔ 신고를 보냈어요. 관리자가 확인 후 조치할 거예요!</div>' : ''}</div>`;
  },
  bugSent: false,
  newReports: 0,
  // ── 관리자 ── (목록 · 버튼은 화면일 뿐, 모든 명령은 서버가 관리자 계정인지 확인한 뒤 처리)
  adminTab: 'users' as 'users' | 'reports' | 'bm',
  adminData: null as null | AdminReply,
  adminMsg: '',
  adminLoading: false,
  adminUserQuery: '',
  adminSelUid: '',
  pendingNameInput: '',
  pgTestRes: null as null | PgSystemTestResult,
  pgTestBusy: false,
  adminApp(me: PlayerState) {
    if (!this.ctx!.isAdmin()) return '<div class="ph-empty">권한이 없어요.</div>';
    const d = this.adminData;
    const tabs = `<div class="ph-tabs">
      <button data-atab="users" class="${this.adminTab === 'users' ? 'on' : ''}">접속 유저</button>
      <button data-atab="reports" class="${this.adminTab === 'reports' ? 'on' : ''}">🚨 신고 내역${this.newReports ? ` (${this.newReports})` : ''}</button>
      <button data-atab="bm" class="${this.adminTab === 'bm' ? 'on' : ''}">💎 캐쉬·PG</button>
      <button data-arefresh>↻</button>
    </div>`;
    const msg = this.adminMsg ? `<div class="ph-small" style="margin:4px 0">${esc(this.adminMsg)}</div>` : '';
    if (this.adminTab === 'bm') {
      const remCost = remainingBmCostKrw(me);
      const stepsHtml = this.pgTestRes
        ? `<div class="ph-col" style="margin-top:6px;gap:4px">
            <div class="${this.pgTestRes.ok ? 'ph-ok' : 'ph-bad'}" style="font-weight:700">${this.pgTestRes.ok ? '✔ PayPal · 캐쉬 시스템 전체 점검 정상' : '✖ PayPal 설정/항목 확인 필요'} (모드: ${esc(this.pgTestRes.mode)})</div>
            ${this.pgTestRes.steps.map((s) => `<div class="ph-small" style="line-height:1.35"><b class="${s.ok ? 'ph-ok' : 'ph-bad'}">${s.ok ? '✔' : '✖'} ${esc(s.name)}</b><br>${esc(s.detail)}</div>`).join('')}
          </div>`
        : '<div class="ph-small">아래 버튼을 눌러 PayPal 실결제 링크 연동, OAuth 인증, 캐쉬 충전 및 상점 배송을 점검할 수 있어요.</div>';

      return `${tabs}${msg}
        <div class="ph-card ph-col">
          <b>💎 관리자 캐쉬 관리</b>
          <div class="ph-small">현재 보유: <b>${formatCash(me.cash ?? 0)}</b> · 미보유 상품 전부 구매 필요: <b>${formatCash(remCost)}</b> (전체 ${BM_PRODUCTS.length}종 합계 ${formatCash(BM_ALL_TOTAL_KRW)})</div>
          <div class="ph-acts" style="flex-wrap:wrap">
            <button data-admact="addcash" class="ph-btn sm">+1,000,000 캐쉬</button>
            <button data-admact="ensurecash" class="ph-btn sm">전 품목 캐쉬 채우기</button>
            <button data-admact="buyall" class="ph-btn sm">전 품목 일괄 구매</button>
            <button data-admact="resetbm" class="ph-btn sm ghost">상점·우편함 초기화</button>
          </div>
        </div>
        <div class="ph-card ph-col">
          <b>🅿️ PayPal 결제 연동 관리</b>
          <div class="ph-small">캐쉬 상품을 누르면 실제 PayPal 결제 URL로 바로 이동하고, 승인 완료 시 계정에 캐쉬가 즉시 지급됩니다.</div>
          <div class="ph-acts" style="flex-wrap:wrap">
            <button data-admtopup="cash_10000" class="ph-btn sm">🅿️ PayPal 결제창 열기</button>
            <button data-admpgtest class="ph-btn sm" ${this.pgTestBusy ? 'disabled' : ''}>${this.pgTestBusy ? '점검 중…' : '🛡️ PayPal 연동 점검 실행'}</button>
          </div>
          ${stepsHtml}
        </div>`;
    }
    if (!d) return `${tabs}${msg}<div class="ph-empty">불러오는 중…</div>`;
    if (this.adminTab === 'reports') {
      const list = (d.reports ?? []).map((r) => {
        const key = `rep_${r.id}`;
        const defaultUid = r.targetUid || r.uid;
        const targetSelector = r.targetUid && r.targetUid !== r.uid
          ? `<select data-rtarget="${esc(key)}" class="ph-input sm" style="flex:1">
              <option value="${esc(r.targetUid)}">피신고자: ${esc(r.targetName || r.targetUid)}</option>
              <option value="${esc(r.uid)}">신고자: ${esc(r.name)}</option>
            </select>`
          : `<input data-rtarget="${esc(key)}" type="hidden" value="${esc(defaultUid)}"><span class="ph-small">제재 대상: <b>${esc(r.targetName || r.name)}</b> (${esc(defaultUid)})</span>`;
        return `<div class="ph-card ph-col ${r.resolved ? 'ph-dim' : ''}">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
            <b>${r.kind === 'user' ? '🚨 유저 신고' : '🐞 버그 신고'} · ${esc(r.name)}</b>
            <span class="ph-small">${new Date(r.at).toLocaleString('ko-KR')}</span>
          </div>
          ${r.targetName ? `<div class="ph-small" style="color:#b91c1c;font-weight:700">🎯 신고 대상: ${esc(r.targetName)}${r.targetUid ? ` (${esc(r.targetUid)})` : ''}</div>` : ''}
          <div class="ph-small">${esc(r.where)}</div>
          <div style="white-space:pre-wrap;padding:4px 6px;background:rgba(0,0,0,0.05);border-radius:6px">${esc(r.text)}</div>
          <div class="ph-mod-box">
            <div class="ph-mod-row">${targetSelector}</div>
            <div class="ph-mod-row">
              <input data-mm="${esc(key)}" class="ph-input sm" type="number" min="1" max="10080" value="10" style="width:54px" title="채팅 금지 시간(분) - 접속 중일 때만 감소">
              <span class="ph-small">분</span>
              <button data-rop="mute" data-rkey="${esc(key)}" data-rid="${esc(r.id)}" class="ph-btn sm">🔇 채팅 금지</button>
              <button data-rop="unmute" data-rkey="${esc(key)}" data-rid="${esc(r.id)}" class="ph-btn sm ghost">해제</button>
            </div>
            <div class="ph-mod-row">
              <input data-bd="${esc(key)}" class="ph-input sm" type="number" min="1" max="3650" value="3" style="width:54px" title="접속 금지 기간(일) - 세상시간 기준">
              <span class="ph-small">일</span>
              <button data-rop="ban" data-rkey="${esc(key)}" data-rid="${esc(r.id)}" class="ph-btn sm danger">⛔ 접속 금지</button>
              <button data-rop="jail" data-rkey="${esc(key)}" data-rid="${esc(r.id)}" class="ph-btn sm" style="background:#7f1d1d;color:#fff">⛓️ 감옥 보내기</button>
            </div>
          </div>
          ${r.resolved ? '<span class="ph-small" style="margin-top:4px;color:#2f8a3a">✔ 처리 완료됨</span>' : `<div class="ph-acts" style="margin-top:4px"><button data-resolve="${esc(r.id)}" class="ph-btn sm ghost">✔ 처리 완료</button></div>`}
        </div>`;
      }).join('');
      return `${tabs}${msg}${list || '<div class="ph-empty">접수된 신고가 없어요</div>'}`;
    }
    const items = Object.values(ITEMS).map((it) => `<option value="${it.id}">${esc(it.name)}</option>`).join('');
    const maps = Object.entries(REGION_MAPS).map(([id, rm]) => `<option value="${esc(id)}">${esc(rm.name)} (${esc(id)})</option>`).join('');
    const allUsers = d.users ?? [];
    const q = this.adminUserQuery.trim().toLowerCase();
    const filtered = q ? allUsers.filter((u) => u.name.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q)) : allUsers;
    const sel = filtered.find((u) => u.uid === this.adminSelUid) ?? filtered[0] ?? null;
    if (sel) this.adminSelUid = sel.uid;

    const searchBar = `<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input data-usearch class="ph-input sm" type="text" placeholder="🔍 닉네임 검색 (예: 민초맛츄르, 민초맛츄르2)" value="${esc(this.adminUserQuery)}" style="flex:1">
      <span class="ph-small">${filtered.length}/${allUsers.length}명</span>
    </div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:6px;flex-wrap:wrap">
      <span class="ph-small">🕒 시각 조절:</span>
      <button data-atime="600" class="ph-btn sm ghost">☀️ 낮 10:00</button>
      <button data-atime="1200" class="ph-btn sm">🌙 밤 20:00</button>
    </div>`;

    const nameList = filtered.length
      ? `<div data-ulist style="max-height:140px;overflow-y:auto;display:flex;flex-direction:column;gap:3px;padding:3px;border:1px solid rgba(255,255,255,0.16);border-radius:6px;margin-bottom:6px">
          ${filtered.map((u) => {
            const on = sel?.uid === u.uid;
            const tags = `${u.jailed ? ' <span class="ph-tag-jail">수감</span>' : ''}${(u.muteRemainingSec ?? 0) > 0 ? ` <span class="ph-tag-mute">채금 ${esc(formatMuteRemaining(u.muteRemainingSec!))}</span>` : ''}`;
            return `<button data-usel="${esc(u.uid)}" class="ph-btn sm ${on ? '' : 'ghost'}" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:4px 8px;text-align:left">
              <span style="font-weight:700">${esc(u.name)}${tags}</span>
              <span class="ph-small" style="opacity:.85">${esc(u.mapName)}</span>
            </button>`;
          }).join('')}
        </div>`
      : '<div class="ph-empty" style="padding:12px 0">일치하는 닉네임의 유저가 없어요</div>';

    const selCard = sel
      ? `<div class="ph-card ph-col">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
            <b>👤 ${esc(sel.name)}${sel.jailed ? ' <span class="ph-tag-jail">⛓️ 수감 중</span>' : ''}</b>
            <span class="ph-small">${esc(sel.mapName)} · ${esc(sel.world)}</span>
          </div>
          <div class="ph-small">${sel.gold.toLocaleString()}G · ${formatCash(sel.cash ?? 0)} · 배지 ${sel.badges} · ${esc(sel.party || '루미 없음')}</div>
          ${(sel.muteRemainingSec ?? 0) > 0 ? `<div class="ph-small" style="color:#b45309;font-weight:700">🔇 채팅 금지 남음: ${esc(formatMuteRemaining(sel.muteRemainingSec!))} (접속 시간 기준)</div>` : ''}
          <div class="ph-small" style="opacity:.6">UID: ${esc(sel.uid)}</div>
          <div class="ph-acts"><button data-aop="goto" data-uid="${esc(sel.uid)}" class="ph-btn sm">가기</button><button data-aop="bring" data-uid="${esc(sel.uid)}" class="ph-btn sm">데려오기</button><button data-aop="kick" data-uid="${esc(sel.uid)}" class="ph-btn sm ghost">강퇴</button></div>
          <div class="ph-mod-box">
            <b class="ph-small" style="color:#991b1b">⚖️ 제재 · 처벌 관리</b>
            <div class="ph-mod-row">
              <input data-mm="${esc(sel.uid)}" class="ph-input sm" type="number" min="1" max="10080" value="10" style="width:56px" title="접속 중일 때만 시간이 흐르는 채팅 금지(분)">
              <span class="ph-small">분</span>
              <button data-aop="mute" data-uid="${esc(sel.uid)}" class="ph-btn sm">🔇 채팅 금지</button>
              <button data-aop="unmute" data-uid="${esc(sel.uid)}" class="ph-btn sm ghost">해제</button>
            </div>
            <div class="ph-mod-row">
              <input data-bd="${esc(sel.uid)}" class="ph-input sm" type="number" min="0" max="3650" value="3" style="width:56px" title="세상시간 기준 접속 금지 일수 (0=영구)">
              <span class="ph-small">일(0=영구)</span>
              <button data-aop="ban" data-uid="${esc(sel.uid)}" class="ph-btn sm danger">⛔ 접속 금지</button>
            </div>
            <div class="ph-mod-row">
              <button data-aop="jail" data-uid="${esc(sel.uid)}" class="ph-btn sm" style="background:#7f1d1d;color:#fff">⛓️ 감옥으로 보내기</button>
              ${sel.jailed ? `<button data-aop="unjail" data-uid="${esc(sel.uid)}" class="ph-btn sm">🔓 석방</button>` : ''}
            </div>
          </div>
          <div class="ph-acts"><select data-gi="${esc(sel.uid)}" class="ph-input sm">${items}</select><input data-gq="${esc(sel.uid)}" class="ph-input sm" type="number" min="1" max="999" value="1" style="width:56px"><button data-aop="give" data-uid="${esc(sel.uid)}" class="ph-btn sm">지급</button></div>
          <div class="ph-acts"><input data-gg="${esc(sel.uid)}" class="ph-input sm" type="number" value="1000" style="width:84px"><button data-aop="gold" data-uid="${esc(sel.uid)}" class="ph-btn sm">골드 ±</button><button data-aop="grantCash" data-uid="${esc(sel.uid)}" class="ph-btn sm">캐쉬 +100만</button></div>
          <div class="ph-acts"><select data-gm="${esc(sel.uid)}" class="ph-input sm">${maps}</select><button data-aop="warp" data-uid="${esc(sel.uid)}" class="ph-btn sm">장소 이동</button></div>
        </div>`
      : '';

    const bans = (d.bans ?? []).map((b) => `<div class="ph-card ph-col ph-dim">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:4px">
        <b>⛔ ${esc(b.name)}</b>
        <span class="ph-small" style="color:#991b1b">${esc(formatBanUntil(b.until))}</span>
      </div>
      <span class="ph-small">${esc(b.reason || '사유 없음')}</span>
      <div class="ph-acts"><button data-aop="unban" data-uid="${esc(b.uid)}" class="ph-btn sm">접속 금지 해제</button></div>
    </div>`).join('');
    return `${tabs}${msg}${searchBar}${nameList}${selCard}${bans ? `<div class="ph-sec">접속 금지된 계정 (${d.bans?.length ?? 0})</div>${bans}` : ''}`;
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
    const leadSheet = lead ? lumiSheetUrl(lead.species, me.lumiCoord) : '';
    const guide = getStoryGuide(me);
    const notices = me.notices ?? [];
    const unreadNotices = notices.filter((x) => !x.read);
    const latestUnread = unreadNotices[0];
    const pushBanner = latestUnread
      ? `<button data-app="messages" class="ph-push-banner" title="메시지함 열기">
          <span style="font-size:20px">${latestUnread.kind === 'fine' ? '⚖️' : '📨'}</span>
          <div style="min-width:0;flex:1">
            <div style="font-size:12px;font-weight:700">${esc(latestUnread.title)}</div>
            <div style="font-size:10px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${latestUnread.kind === 'fine' ? '벌금 집행으로 골드·캐쉬가 0원으로 초기화되었습니다 (눌러서 확인 ›)' : esc(latestUnread.body.split('\n')[0] ?? '')}</div>
          </div>
        </button>`
      : '';
    return `${pushBanner}<div class="ph-hello">
        ${sp ? `<span class="lumi-icon lumi-bounce" style="background-image:url(${leadSheet});width:56px;height:56px;background-size:336px 56px"></span>` : '<span class="ph-emoji" style="font-size:34px">✨</span>'}
        <div><div class="ph-name">${esc(me.name)}</div><div class="ph-sub">${sp ? `파트너 ${sp.name} · Lv.${lead!.level}` : '아직 파트너가 없어요'} · 배지 ${me.badges.length}/8${(me.evilStack ?? 0) > 0 ? ` · 😈 악행 ${me.evilStack}/100` : ''}</div></div>
      </div>
      <button data-app="journal" class="ph-quest-banner" title="모험 수첩 열기">
        <span class="ph-qb-tag">🧭 ${esc(guide.chapter)}</span>
        <span class="ph-qb-title">${esc(guide.title)} ›</span>
      </button>
      <div class="ph-grid">${[...APPS, ...(this.ctx!.isAdmin() ? [ADMIN_APP] : [])].map((a) => {
        const badge = a.id === 'admin' && this.newReports ? this.newReports : a.id === 'messages' && unreadNotices.length ? unreadNotices.length : 0;
        return `<button data-app="${a.id}" class="ph-app"><span class="ph-tile" style="background:${a.bg}">${a.glyph()}</span><span class="ph-label">${a.name}</span>${badge ? `<i class="ph-badge">${badge}</i>` : ''}</button>`;
      }).join('')}</div>
      <div class="ph-foot">R 닫기 · M 지도 · P 나의 루미 · Esc 뒤로</div>`;
  },

  // ── 모험 수첩 (스토리 · 퀘스트 가이드) ──
  journalApp(me: PlayerState) {
    const g = getStoryGuide(me);
    const targetName = MAP_META[g.targetMap]?.name ?? g.targetMap;
    const pct = Math.round((g.mainDone / Math.max(1, g.mainTotal)) * 100);
    const renderStep = (s: typeof g.steps[number]) => `<div class="ph-card ph-col ${s.current ? 'lead' : s.done ? 'ph-dim' : ''}" style="padding:7px 9px;gap:3px">
      <div class="ph-row" style="gap:6px">
        <span style="font-size:13px">${s.done ? '✅' : s.current ? '🧭' : '🔒'}</span>
        <b style="font-size:12px">${esc(s.chapter)}</b>
        ${s.current ? '<span class="ml-auto ph-ok" style="font-size:10px;font-weight:700">진행 중</span>' : s.done ? '<span class="ml-auto ph-small">완료</span>' : ''}
      </div>
      <div style="font-size:12px;font-weight:600;color:#4a2f1a">${esc(s.title)}</div>
      ${s.current ? `<div class="ph-small" style="line-height:1.4">${esc(s.detail)}</div>` : ''}
    </div>`;
    const mainList = g.steps.filter((s) => !s.side);
    const sideList = g.steps.filter((s) => s.side);
    return `<div class="ph-card ph-col lead" style="gap:5px">
        <div class="ph-row"><b>🧭 ${esc(g.chapter)}</b><span class="ml-auto ph-small">본편 ${g.mainDone}/${g.mainTotal} (${pct}%)</span></div>
        <div style="font-size:13px;font-weight:700;color:#2f6b3a">${esc(g.title)}</div>
        <div class="ph-small" style="line-height:1.45">${esc(g.detail)}</div>
        <div class="ph-progress" style="margin-top:2px"><i style="width:${pct}%"></i><span>${pct}%</span></div>
        <div class="ph-acts" style="margin-top:4px">
          ${this.ctx!.mapUnlocked() ? `<button data-app="map" class="ph-btn sm">🗺️ 지도에서 [${esc(targetName.split(' · ')[0])}] 보기</button>` : '<span class="ph-small">마을회관에서 지도 앱을 받으면 목표 핀이 보여요!</span>'}
        </div>
      </div>
      <div class="ph-sec">본편 여정 <span>${g.mainDone}/${g.mainTotal}</span></div>
      <div class="ph-list">${mainList.map(renderStep).join('')}</div>
      <div class="ph-sec" style="margin-top:8px">포스트게임 · 전설 여정 <span>${sideList.filter((s) => s.done).length}/${sideList.length}</span></div>
      <div class="ph-list">${sideList.map(renderStep).join('')}</div>`;
  },

  // ── 지도 (목표 ★ 핀 + 별바람 택시 빠른 이동 + 동굴 탈출) ──
  mapApp(me: PlayerState) {
    if (!this.ctx!.mapUnlocked()) return '<div class="ph-empty">아직 지도 앱이 없어요.<br>마을회관에서 이장님을 만나면 설치해 주실 거예요!</div>';
    const { id: here, owner } = this.ctx!.here();
    const guide = getStoryGuide(me);
    const seen = new Set([...(me.visited ?? []), here]);
    const places = Object.entries(MAP_META).filter(([id, m]) => (!m.interior && m.kind !== 'room') || (id === here && m.x > 0));
    const known = places.filter(([id]) => seen.has(id));
    const towns = places.filter(([, m]) => m.kind === 'town').length, knownTowns = known.filter(([, m]) => m.kind === 'town').length;
    const gymType: Record<string, string> = { windvale: '바람', harbor: '물', maple: '풀', forge: '땅', ember: '불', lumina: '빛', summit: '혼합', frost: '노말' };
    const inCave = !!this.ctx!.inCave?.();
    const flyable = (id: string, m: MapMeta) => id === 'farm' || (m.kind === 'town' && seen.has(id));
    const pin = (id: string, m: MapMeta) => {
      const cur = id === here;
      const town = m.kind === 'town' || m.kind === 'farm';
      const canFly = flyable(id, m);
      const picked = this.mapPick === id;
      const name = m.name.split(' · ')[0];
      if (m.kind === 'route' && !cur) return '';
      const style = `left:${(m.x / 360) * 100}%;top:${(m.y / 240) * 100}%`;
      if (town) {
        const ring = id === 'crown' ? '#f0c84a' : gymType[id] ? (TYPE_COLORS[gymType[id] as keyof typeof TYPE_COLORS] ?? '#a88ad8') : '#fff8ec';
        return `<div class="ph-pin town ${cur ? 'cur' : ''} ${picked ? 'picked' : ''}" ${canFly ? `data-mappick="${id}"` : ''} style="${style};${canFly ? 'cursor:pointer' : ''}" data-tip="${esc(name)}${gymType[id] ? ` · ${gymType[id]} 도장` : id === 'crown' ? ' · 루미 리그' : ''}${canFly ? ' (클릭: 빠른 이동)' : ''}">
          <span class="dot" style="--ring:${ring}"></span><span class="lbl">${esc(name)}</span>${cur ? '<span class="here">▼</span>' : ''}</div>`;
      }
      return `<div class="ph-pin spot ${m.kind} ${cur ? 'cur' : ''}" style="${style}" data-tip="${esc(name)}"><span class="dot"></span>${cur ? `<span class="lbl">${esc(name)}</span><span class="here">▼</span>` : ''}</div>`;
    };
    const goalMeta = MAP_META[guide.targetMap];
    const goalPin = goalMeta && goalMeta.x > 0
      ? `<div class="ph-pin goal" style="left:${(goalMeta.x / 360) * 100}%;top:${(goalMeta.y / 240) * 100}%" data-tip="★ 다음 목표: ${esc(guide.title)} (${esc(goalMeta.name.split(' · ')[0])})"><span class="goal-star">★</span></div>`
      : '';
    const pickMeta = this.mapPick ? MAP_META[this.mapPick] : null;
    const travelList = known.filter(([id, m]) => flyable(id, m)).sort((a, b) => (a[0] === 'farm' ? -1 : b[0] === 'farm' ? 1 : (a[1].tier ?? 0) - (b[1].tier ?? 0)));
    return `<div class="ph-map">
        <img src="assets/ui/worldmap.png" alt="">
        <canvas class="ph-map-bg" width="720" height="480"></canvas>
        <canvas class="ph-map-fog" width="360" height="240"></canvas>
        ${known.map(([id, m]) => pin(id, m)).join('')}
        ${goalPin}
        <div class="ph-tip" hidden></div>
      </div>
      <div class="ph-mapbar"><span>📍 <b>${esc(MAP_META[here as keyof typeof MAP_META]?.name ?? '?')}${esc(owner)}</b> · ★ ${esc(goalMeta?.name.split(' · ')[0] ?? '')}</span><span>마을 ${knownTowns}/${towns} · 탐험 ${known.length}/${places.length}</span></div>
      <div class="ph-flybar">
        ${inCave
          ? `<span class="ph-small">동굴 안에서는 택시를 부를 수 없어요.</span><button data-escape-cave class="ph-btn sm">🪢 동굴 탈출 (가까운 마을로)</button>`
          : pickMeta
            ? `<span>🕊️ <b>${esc(pickMeta.name.split(' · ')[0])}</b></span><div class="ph-acts"><button data-flyto="${this.mapPick}" class="ph-btn sm">별바람 택시로 이동</button><button data-mappick="" class="ph-btn sm ghost">취소</button></div>`
            : `<span class="ph-small">🕊️ 빠른 이동:</span><div class="ph-flychips">${travelList.map(([id, m]) => `<button data-flyto="${id}" class="ph-flychip ${id === here ? 'cur' : ''}" title="${esc(m.name)}으로 즉시 이동">${esc(m.name.split(' · ')[0])}</button>`).join('')}</div>`}
      </div>`;
  },
  /** 안개: 구름 무늬(3단 + 디더 가장자리), 가 본 곳 주변만 걷힘 */
  drawFog(n: HTMLElement, me: PlayerState) {
    const bg = n.querySelector<HTMLCanvasElement>('.ph-map canvas.ph-map-bg');
    if (bg) {
      const paintBg = () => { if (worldmapImg.complete && worldmapImg.naturalWidth > 0) bg.getContext('2d')?.drawImage(worldmapImg, 0, 0, 720, 480); };
      if (worldmapImg.complete && worldmapImg.naturalWidth > 0) paintBg();
      else worldmapImg.addEventListener('load', paintBg, { once: true });
    }
    const cv = n.querySelector<HTMLCanvasElement>('.ph-map canvas.ph-map-fog'); if (!cv) return;
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

  // ── 나의 루미 · PC 보관함 · 상세 정보 ──
  lumiSummary(me: PlayerState, c: CreatureInst, where: 'party' | 'box', idx: number) {
    const sp = SPECIES[c.species];
    if (!sp) return '<div class="ph-empty">루미 정보를 불러올 수 없어요.</div>';
    const st = stats(c), r = Math.max(0, Math.min(1, c.hp / st.maxHp));
    const nextExp = expToNext(c.level), expPct = c.level >= 100 ? 100 : Math.max(0, Math.min(100, Math.round((c.exp / nextExp) * 100)));
    const sheetUrl = lumiSheetUrl(c.species, where === 'party' && idx === 0 ? me.lumiCoord : '');
    const evo = sp.evolves ? `Lv.${sp.evolves.level} → ${SPECIES[sp.evolves.to]?.name ?? sp.evolves.to}` : '최종 단계';
    const catKo: Record<string, string> = { atk: '공격', heal: '회복', debuffAtk: '공격↓', debuffDef: '방어↓', buffDef: '방어↑' };
    const movesHtml = c.moves.map((mid, mi) => {
      const m = MOVES[mid]; if (!m) return '';
      const pp = ppLeft(c, mi), mp = maxPp(mid);
      return `<div class="ph-move">
        <div class="ph-row" style="gap:5px"><b>${esc(m.name)}</b>${typeChip(m.type)}<span class="ph-small">${catKo[m.category] ?? m.category}${m.power ? ` · 위력 ${m.power}` : ''}</span><span class="ml-auto ph-small">PP ${pp}/${mp}</span></div>
        <div class="ph-small" style="opacity:.82">${esc(m.description)}</div>
      </div>`;
    }).join('');
    return `<div class="ph-card ph-col lead" style="gap:6px">
      <div class="ph-row" style="gap:10px">
        <span class="lumi-icon lumi-bounce" style="background-image:url(${sheetUrl});width:60px;height:60px;background-size:360px 60px;flex-shrink:0"></span>
        <div class="flex-1 min-w-0">
          <div class="ph-row"><b>${esc(sp.name)}</b>${typeChip(sp.type)}<span class="ml-auto"><b>Lv.${c.level}</b></span></div>
          <div class="ph-small">${esc(sp.kind)} · ${where === 'party' ? `파티 ${idx + 1}번` : `PC 보관함 #${idx + 1}`}</div>
          <div class="ph-hp" style="margin-top:4px"><i style="width:${r * 100}%;background:${r > 0.5 ? '#5fc04a' : r > 0.2 ? '#f0c84a' : '#e0473b'}"></i></div>
          <div class="ph-row ph-small"><span>HP ${c.hp}/${st.maxHp}</span><span class="ml-auto">EXP ${c.level >= 100 ? 'MAX' : `${c.exp}/${nextExp}`}</span></div>
          <div class="ph-hp" style="height:4px;margin-top:2px;background:#2a3248"><i style="width:${expPct}%;background:#5aa8e8"></i></div>
        </div>
      </div>
      <div class="ph-stats">
        <div><span>체력</span><b>${st.maxHp}</b></div>
        <div><span>공격</span><b>${st.atk}</b></div>
        <div><span>방어</span><b>${st.def}</b></div>
        <div><span>스피드</span><b>${st.spd}</b></div>
      </div>
      <div class="ph-small">✨ <b>진화:</b> ${esc(evo)} · 🌱 <b>특기:</b> ${esc(HELPS[sp.helps] ?? '')}</div>
      <div class="ph-small" style="line-height:1.4;opacity:.9">${esc(sp.description)}</div>
      <div class="ph-sec" style="margin:2px 0 0">배운 기술 (${c.moves.length}/4)</div>
      <div class="ph-moves">${movesHtml || '<div class="ph-small">배운 기술 없음</div>'}</div>
      <div class="ph-acts" style="margin-top:4px"><button data-insp-close class="ph-btn sm ghost">‹ 목록으로</button></div>
    </div>`;
  },

  partyApp(me: PlayerState) {
    if (!me.party.length && !me.box.length) return '<div class="ph-empty">아직 파트너가 없어요.<br>별빛 마을 <b>마을회관</b>의 오 이장님을 찾아가 보세요!</div>';
    if (this.inspectTarget) {
      const list = this.inspectTarget.where === 'party' ? me.party : me.box;
      const target = list[this.inspectTarget.index];
      if (target) return this.lumiSummary(me, target, this.inspectTarget.where, this.inspectTarget.index);
      this.inspectTarget = null;
    }
    const tabs = `<div class="ph-tabs">
      <button data-ptab="party" class="${this.partyTab === 'party' ? 'on' : ''}">파티 (${me.party.length}/6)</button>
      <button data-ptab="box" class="${this.partyTab === 'box' ? 'on' : ''}">💻 PC 보관함 (${me.box.length})</button>
    </div>`;
    if (this.partyTab === 'box') {
      const boxHeader = `<div class="ph-heldbar">💻 PC 보관함 <b>${me.box.length}마리</b><span>파티 ${me.party.length}/6 · 상세/교체/꺼내기</span></div>`;
      if (!me.box.length) {
        return `${tabs}${boxHeader}<div class="ph-empty">PC 보관함이 비어 있어요.<br>파티가 6마리 가득 찬 상태에서 새 루미를 잡거나,<br>파티에서 <b>[보관]</b>을 누르면 여기에 안전하게 보관돼요!</div>`;
      }
      return `${tabs}${boxHeader}<div class="ph-list">${me.box.map((c, i) => {
        const sp = SPECIES[c.species], max = maxHpOf(c), r = Math.max(0, c.hp / max);
        const swapping = this.swapBoxIdx === i;
        const releasing = this.releaseConfirmIdx === i;
        return `<div class="ph-card ph-col" style="gap:5px">
          <div class="ph-row" style="gap:8px">
            <span class="lumi-icon" style="background-image:url(assets/lumi/${c.species}.png);width:44px;height:44px;background-size:264px 44px;flex-shrink:0"></span>
            <div class="flex-1 min-w-0">
              <div class="ph-row"><b>${sp?.name ?? c.species}</b>${sp ? typeChip(sp.type) : ''}<span class="ml-auto">Lv.${c.level}</span></div>
              <div class="ph-hp"><i style="width:${r * 100}%;background:${r > 0.5 ? '#5fc04a' : r > 0.2 ? '#f0c84a' : '#e0473b'}"></i></div>
              <div class="ph-row ph-small"><span>HP ${c.hp}/${max}</span><span class="ml-auto">${sp?.kind ?? ''}</span></div>
            </div>
          </div>
          <div class="ph-acts" style="flex-wrap:wrap">
            <button data-insp="box:${i}" class="ph-btn sm ghost">상세</button>
            ${me.party.length < 6 ? `<button data-box-out="${i}" class="ph-btn sm">파티로 꺼내기</button>` : ''}
            <button data-box-swapopen="${i}" class="ph-btn sm ${swapping ? '' : 'ghost'}">${swapping ? '교체 취소' : '파티와 교체'}</button>
            ${releasing
              ? `<button data-box-relyes="${i}" class="ph-btn sm" style="background:#c8453c;border-color:#7a201a">정말 놓아주기</button><button data-box-relno class="ph-btn sm ghost">취소</button>`
              : `<button data-box-rel="${i}" class="ph-btn sm ghost">놓아주기</button>`}
          </div>
          ${swapping ? `<div class="ph-swapbox"><div class="ph-small" style="margin-bottom:3px">어느 파티 루미와 바꿀까요?</div><div class="ph-acts" style="flex-wrap:wrap">${me.party.map((pc, pi) => `<button data-box-swap="${pi}:${i}" class="ph-btn sm ghost">${pi + 1}. ${esc(SPECIES[pc.species]?.name ?? pc.species)} Lv.${pc.level}</button>`).join('')}</div></div>` : ''}
        </div>`;
      }).join('')}</div>
      <div class="ph-foot">루미 센터 PC 단말기 · 휴대폰에서 언제든 관리할 수 있어요</div>`;
    }
    const candyCount = countItem(me, 'star_candy');
    return `${tabs}<div class="ph-list">${me.party.map((c, i) => {
      const sp = SPECIES[c.species], max = maxHpOf(c), r = Math.max(0, c.hp / max);
      const sheetUrl = lumiSheetUrl(c.species, i === 0 ? me.lumiCoord : '');
      return `<div class="ph-card ${i === 0 ? 'lead' : ''}">
        <span class="lumi-icon" style="background-image:url(${sheetUrl});width:48px;height:48px;background-size:288px 48px;cursor:pointer" data-insp="party:${i}" title="눌러서 상세 정보 보기"></span>
        <div class="flex-1 min-w-0">
          <div class="ph-row"><b>${i === 0 ? '★ ' : ''}${sp.name}</b>${typeChip(sp.type)}<span class="ml-auto">Lv.${c.level}</span></div>
          <div class="ph-hp"><i style="width:${r * 100}%;background:${r > 0.5 ? '#5fc04a' : r > 0.2 ? '#f0c84a' : '#e0473b'}"></i></div>
          <div class="ph-row ph-small"><span>HP ${c.hp}/${max}</span><span class="ml-auto">${sp.kind}</span></div>
          <div class="ph-small ph-help1">🌱 ${HELPS[sp.helps] ?? ''}</div>
          <div class="ph-acts" style="margin-top:3px;flex-wrap:wrap">
            <button data-insp="party:${i}" class="ph-btn sm ghost">상세</button>
            ${i > 0 ? `<button data-partner="${i}" class="ph-btn sm">대표</button>` : '<span class="ph-small ph-ok">★ 파트너</span>'}
            ${i > 0 ? `<button data-pswap="${i}:${i - 1}" class="ph-btn sm ghost" title="위로">▲</button>` : ''}
            ${i < me.party.length - 1 ? `<button data-pswap="${i}:${i + 1}" class="ph-btn sm ghost" title="아래로">▼</button>` : ''}
            ${me.party.length > 1 ? `<button data-box-in="${i}" class="ph-btn sm ghost">보관</button>` : ''}
            ${candyCount > 0 && c.level < 100 ? `<button data-usecandy="${i}" class="ph-btn sm">🍬 Lv.+1 (${candyCount})</button>` : ''}
          </div>
        </div></div>`;
    }).join('')}</div>
    <div class="ph-foot">보관함 ${me.box.length}마리 · 파티는 최대 6마리 (상세 버튼으로 기술 · 능력치 확인)</div>`;
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
        const fieldHealHtml = kind === 'b' && it.heal && me.party.length
          ? `<div class="ph-small" style="margin-top:6px;font-weight:700">💚 필드에서 바로 회복할 루미 선택:</div>
            <div class="ph-acts" style="flex-wrap:wrap;margin-top:4px">${me.party.map((pc, pi) => {
              const sp = SPECIES[pc.species], max = maxHpOf(pc), full = pc.hp >= max, ko = pc.hp <= 0;
              return `<button data-bagheal="${it.id}:${pi}" class="ph-btn sm ${full || ko ? 'ghost' : ''}" ${full || ko ? 'disabled' : ''}>${esc(sp?.name ?? pc.species)} ${pc.hp}/${max}${ko ? ' (기절)' : full ? ' (가득)' : ''}</button>`;
            }).join('')}</div>`
          : '';
        detail = `<b>${it.name}</b> <span class="ph-small">보유 ${countItem(me, it.id)}개${it.sellPrice ? ` · 출하 ${it.sellPrice}G` : ''}${dur}</span><br>${esc(it.description)}
          ${acts.length ? `<div class="ph-acts">${acts.map((a, k) => `<button data-act="${k}" class="ph-btn sm ${a.primary ? '' : 'ghost'}">${esc(a.label)}</button>`).join('')}</div>` : fieldHealHtml || (kind === 'b' ? '<div class="ph-small" style="margin-top:4px">배틀 중 가방에서 써요</div>' : '')}`;
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

  // ── 도감 (루미 도감 · 생활 도감 90종 & 마을 특산물) ──
  dexApp(me: PlayerState) {
    const all = Object.values(SPECIES);
    const seen = new Set(me.seen), caught = new Set(me.caught);
    const goal = all.filter((sp) => sp.legend !== 'myth'), done = goal.filter((sp) => caught.has(sp.id)).length;
    const lsum = lifeDexSummary(me);
    const modeTabs = `<div class="ph-tabs" style="margin-bottom:6px">
      <button data-dexmode="lumi" class="${this.dexMode === 'lumi' ? 'on' : ''}">🐾 루미 도감 (${caught.size}/${all.length})</button>
      <button data-dexmode="life" class="${this.dexMode === 'life' ? 'on' : ''}">🌿 생활 도감 (${lsum.total}/${lsum.max})</button>
    </div>`;
    if (this.dexMode === 'life') {
      return `${modeTabs}${renderLifeDexApp(me, this.lifeDexTab)}`;
    }
    return `${modeTabs}<div class="ph-dexhead"><span>본 루미 <b>${seen.size}</b></span><span>잡은 루미 <b>${caught.size}</b></span><span>완성 <b>${done}/${goal.length}</b></span></div>
      ${done >= goal.length ? '<div class="ph-heldbar">🏆 루미 도감 완성! 별의 요람에서 루미 마스터가 기다리고 있어요.</div>' : ''}
      <div class="ph-dex">${all.map((sp, i) => {
        const s = seen.has(sp.id) || caught.has(sp.id), c = caught.has(sp.id);
        return `<div class="ph-dexcell ${s ? '' : 'unk'}" title="${s ? `${sp.name} · ${sp.type} · ${esc(sp.description)}` : '??? — 아직 한 번도 겨뤄 보지 못한 루미'}">
          <span class="no">${String(i + 1).padStart(3, '0')}</span>
          <span class="lumi-icon" style="background-image:url(assets/lumi/${sp.id}.png);width:40px;height:40px;background-size:240px 40px;${s ? '' : 'filter:brightness(0)'}"></span>
          <span class="nm">${s ? sp.name : '???'}</span>${sp.legend && s ? `<span class="ph-small" style="color:${sp.legend === 'myth' ? '#d0547a' : '#6a4ab8'}">${sp.legend === 'myth' ? '환상' : '전설'}</span>` : ''}${c ? `<span class="ball px-icon" style="${iconStyle('lumi_ball', 14)}"></span>` : ''}</div>`;
      }).join('')}</div>
      <div class="ph-foot">상단 [🌿 생활 도감] 탭에서 농사·채광·낚시 90종과 마을 특산물을 확인하세요!</div>`;
  },

  // ── 제작 · 요리 노트 ──
  recipeApp(me: PlayerState) {
    const allList = Object.values(RECIPES).sort((x, y) => Number(!!y.starter) - Number(!!x.starter) || (x.badges ?? 0) - (y.badges ?? 0));
    const list = allList.filter((r) => this.recipeTab === 'all' ? true : this.recipeTab === 'kitchen' ? r.station === 'kitchen' : r.station !== 'kitchen');
    const rtabs = `<div class="ph-tabs" style="margin-bottom:6px">
      <button data-rtab="all" class="${this.recipeTab === 'all' ? 'on' : ''}">전체 (${allList.length})</button>
      <button data-rtab="workbench" class="${this.recipeTab === 'workbench' ? 'on' : ''}">🔨 공방 (${allList.filter((r) => r.station !== 'kitchen').length})</button>
      <button data-rtab="kitchen" class="${this.recipeTab === 'kitchen' ? 'on' : ''}">🍳 요리 (${allList.filter((r) => r.station === 'kitchen').length})</button>
    </div>`;
    return `${rtabs}<div class="ph-list">${list.map((r) => {
      const out = ITEMS[r.out];
      const known = me.recipes.includes(r.id) || (!!r.autoUnlockByBadge && me.badges.length >= (r.badges ?? 0));
      const ok = known && Object.entries(r.in).every(([id, q]) => countItem(me, id) >= q);
      const mats = Object.entries(r.in).map(([id, q]) => { const h = countItem(me, id); return `<span class="${h >= q ? '' : 'ph-bad'}"><span class="px-icon" style="${iconStyle(ITEMS[id].icon, 16)}"></span>${ITEMS[id].name} ${h}/${q}</span>`; }).join('');
      const isCook = r.station === 'kitchen';
      const lockMsg = r.autoUnlockByBadge
        ? `🔒 배지 ${r.badges ?? 0}개 달성 시 자동 해금`
        : `🔒 ${NPCS[r.teacher ?? '']?.name ?? '공방'}에게 배우기 · 배지 ${r.badges ?? 0}개`;
      const statBadge = known && out.food ? `<span class="ph-small" style="color:#2d7a44">🍚+${out.food}${out.partyHeal ? ` · 💚+${out.partyHeal}` : ''}</span>` : '';
      return `<div class="ph-card ${known ? '' : 'locked'}">
        <span class="px-icon" style="${iconStyle(out.icon, 36)}${known ? '' : ';filter:grayscale(1) brightness(.6)'}"></span>
        <div class="flex-1 min-w-0"><div class="ph-row" style="gap:4px"><b>${known ? out.name : '???'}</b>${r.qty > 1 ? `<span class="ph-small">×${r.qty}</span>` : ''}${isCook ? '<span class="ph-small" style="color:#b85a1c">🍳요리</span>' : ''}${statBadge}${ok ? '<span class="ml-auto ph-ok">제작 가능</span>' : ''}</div>
          <div class="ph-mats">${known ? mats : lockMsg}</div></div></div>`;
    }).join('')}</div>
    <div class="ph-foot">제작: 집 작업대 · 볼 공방 · 연구소 / 요리: 집 부엌 · 마을 모닥불</div>`;
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

  /** 말풍선 스킨 HTML 미리보기 생성 */
  bubblePreviewHtml(bubbleId: string, sampleText = '안녕! 반가워요 ✨', compact = false): string {
    const skin = CHAT_BUBBLES[bubbleId] ?? CHAT_BUBBLES.default;
    const pad = compact ? '3px 8px' : '6px 14px';
    const fs = compact ? '10px' : '12px';
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:${pad};border-radius:9px;background:linear-gradient(180deg,${skin.bgTop},${skin.bgBottom});border:2px solid ${skin.borderOuter};box-shadow:inset 0 0 0 1.5px ${skin.borderInner},0 2px 4px rgba(0,0,0,0.22);color:${skin.textColor};font-weight:700;font-size:${fs};white-space:nowrap">${esc(sampleText)}</span>`;
  },

  /** 상점 내 구매 확인 전용 상세 탭 (상세 내용물 이미지 + 가격/잔액 + 구매/취소 버튼) */
  shopDetailView(me: PlayerState, prod: BmProduct): string {
    const cash = me.cash ?? 0;
    const afterCash = cash - prod.priceKrw;
    const canAfford = afterCash >= 0;
    const baseLook = me.look || 'm1';

    let showcase = '';
    if (prod.category === 'outfit') {
      // 정면 · 측면 · 뒷면 3방향 큰 캐릭터 도트 프리뷰
      showcase = `<div style="display:flex;align-items:center;justify-content:center;gap:18px;padding:14px;background:linear-gradient(180deg,#fffaf0,#f3dfb4);border:2px solid #d8b67c;border-radius:12px">
        <div style="text-align:center"><span style="${lookPortrait(prod.id, 2)}"></span><div class="ph-small" style="margin-top:4px">정면 모습</div></div>
        <div style="text-align:center"><span style="display:inline-block;width:60px;height:80px;background-image:url(assets/characters/${prod.id}.png);background-size:768px auto;background-position:-18px -100px;background-repeat:no-repeat;image-rendering:pixelated"></span><div class="ph-small" style="margin-top:4px">측면 모습</div></div>
        <div style="text-align:center"><span style="display:inline-block;width:60px;height:80px;background-image:url(assets/characters/${prod.id}.png);background-size:768px auto;background-position:-18px -292px;background-repeat:no-repeat;image-rendering:pixelated"></span><div class="ph-small" style="margin-top:4px">뒷면 모습</div></div>
      </div>`;
    } else if (prod.category === 'lumi') {
      // 기본 스타팅 루미 3종(새록·찰랑·모락) 착용 모습 전체 상세 프리뷰
      const names: Record<string, string> = { saerok: '🌱 새록', chalang: '💧 찰랑', morak: '🔥 모락' };
      showcase = `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px;background:linear-gradient(180deg,#f4fbf0,#dfeed8);border:2px solid #8fc97a;border-radius:12px">
        <div class="ph-small" style="font-weight:700;color:#2f6a35">🌱💧🔥 기본 스타팅 루미 3종 전용 치장 적용 모습</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:20px">
          ${STARTER_LUMI_IDS.map((sp) => `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">
            <span class="lumi-icon lumi-bounce" style="display:inline-block;background-image:url(${lumiSheetUrl(sp, prod.id)});width:56px;height:56px;background-size:336px 56px;image-rendering:pixelated"></span>
            <span class="ph-small"><b>${names[sp]}</b></span>
          </div>`).join('')}
        </div>
      </div>`;
    } else if (prod.category === 'bubble') {
      showcase = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;background:linear-gradient(180deg,#2a3550,#182030);border:2px solid #6b7fd8;border-radius:12px">
        ${this.bubblePreviewHtml(prod.id, `${me.name}: 오늘도 별빛 마을에서 즐거운 하루 보내요! ✨`, false)}
        <span style="${lookPortrait(baseLook, 1.5)}"></span>
        <div class="ph-small" style="color:#d8e4ff">채팅 입력 시 캐릭터 머리 위에 표시되는 실제 말풍선 모습</div>
      </div>`;
    } else if (prod.category === 'theme') {
      const th = UI_THEMES[prod.id] ?? UI_THEMES.rural;
      showcase = `<div style="padding:12px;border-radius:12px;background:${th.bg};border:3px solid ${th.border};box-shadow:inset 0 0 0 2px ${th.borderBright}">
        <div style="padding:10px;border-radius:8px;background:${th.panel};color:${th.text};border:2px solid ${th.borderBright}">
          <div style="font-weight:700;font-size:13px;margin-bottom:4px">✨ ${esc(th.name)} 미리보기</div>
          <div style="font-size:11px;color:${th.textDim};margin-bottom:8px">${esc(th.desc)}</div>
          <div style="display:flex;gap:6px">
            <span style="padding:3px 10px;border-radius:6px;background:${th.accent};color:#fff;font-size:11px;font-weight:700">확인 버튼</span>
            <span style="padding:3px 10px;border-radius:6px;background:${th.panelAlt};color:#202438;font-size:11px">정보 패널</span>
          </div>
        </div>
      </div>`;
    } else {
      const iconId = prod.id === 'star_candy' ? 'star_candy' : 'name_ticket';
      const effectText = prod.id === 'star_candy'
        ? '원하는 루미의 레벨을 즉시 +1 올려 주며, 레벨업 기술 습득과 진화까지 바로 진행됩니다!'
        : '원하는 새 트레이너 닉네임으로 즉시 변경할 수 있습니다! (중복 시 자동 번호 부여)';
      showcase = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;background:linear-gradient(180deg,#fffdf6,#f3e2bc);border:2px solid #d49a35;border-radius:12px">
        <span class="px-icon lumi-bounce" style="${iconStyle(iconId, 56)}"></span>
        <div class="ph-small" style="text-align:center;font-weight:700;color:#5e3620">${esc(effectText)}</div>
      </div>`;
    }

    return `<div class="ph-card ph-col" style="padding:10px 12px;gap:8px">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2px dashed #d8b67c;padding-bottom:6px">
        <div>
          <span class="bm-lock">${prod.category === 'theme' ? 'UI 테마' : prod.category === 'outfit' ? '트레이너 의상' : prod.category === 'lumi' ? '기본 루미 3종 전용 치장' : prod.category === 'bubble' ? '채팅 말풍선' : '특별 아이템'}</span>
          <div style="font-size:15px;font-weight:700;margin-top:2px">${esc(prod.name)}</div>
        </div>
        <button data-bmcancel class="ph-btn sm ghost">‹ 목록으로</button>
      </div>
      ${showcase}
      <div class="ph-small" style="line-height:1.45">${esc(prod.desc)}</div>
      <div class="bm-pay-summary" style="flex-direction:column;align-items:stretch;gap:4px">
        <div style="display:flex;justify-content:space-between;font-size:12px"><span>상품 가격</span><b>💎 ${formatCash(prod.priceKrw)}${prod.priceUsd ? ` (≈ ${formatUsd(prod.priceUsd)})` : ''}</b></div>
        <div style="display:flex;justify-content:space-between;font-size:12px"><span>현재 보유 캐쉬</span><span>${formatCash(cash)}</span></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;border-top:1px solid #d8b67c;padding-top:4px">
          <span>구매 후 잔액</span>
          <b class="${canAfford ? 'ph-ok' : 'ph-bad'}">${canAfford ? formatCash(afterCash) : `캐쉬 부족 (${formatCash(Math.abs(afterCash))} 더 필요)`}</b>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:4px">
        <button data-bmcancel class="ph-btn ghost" style="flex:1">취소 (뒤로)</button>
        ${canAfford
          ? `<button data-bmconfirm="${prod.id}" class="ph-btn" style="flex:1.4">💎 구매하기 (즉시 적용)</button>`
          : `<button data-bmtab="cash" class="ph-btn" style="flex:1.4">💎 캐쉬 충전하러 가기</button>`}
      </div>
    </div>`;
  },

  // ── 캐쉬 상점 (폴더블 와이드 화면 · 클릭 시 미리보기 · 구매 버튼 클릭 시 상세 탭 확인) ──
  shopApp(me: PlayerState) {
    if (this.shopDetailId && BM_PRODUCT_MAP[this.shopDetailId]) {
      return this.shopDetailView(me, BM_PRODUCT_MAP[this.shopDetailId]);
    }

    const tabs = `<div class="ph-tabs" style="margin-bottom:4px">
      <button data-bmtab="cash" class="${this.shopTab === 'cash' ? 'on' : ''}">💎 캐쉬</button>
      <button data-bmtab="item" class="${this.shopTab === 'item' ? 'on' : ''}">🎁 아이템</button>
      <button data-bmtab="theme" class="${this.shopTab === 'theme' ? 'on' : ''}">UI</button>
      <button data-bmtab="outfit" class="${this.shopTab === 'outfit' ? 'on' : ''}">의상</button>
      <button data-bmtab="lumi" class="${this.shopTab === 'lumi' ? 'on' : ''}">루미</button>
      <button data-bmtab="bubble" class="${this.shopTab === 'bubble' ? 'on' : ''}">💬 말풍선</button>
    </div>`;
    const isAdmin = this.ctx!.isAdmin();
    const remCost = remainingBmCostKrw(me);
    const walletBar = `<div class="ph-card" style="margin-bottom:4px;padding:6px 8px">
      <div class="flex-1 min-w-0">
        <div class="ph-small"><b>💎 보유 캐쉬</b>: <span class="ph-ok">${formatCash(me.cash ?? 0)}</span>${isAdmin ? ' · 🛡️ 어드민 해금' : ''}</div>
      </div>
      ${this.shopTab !== 'cash' ? '<button data-bmtab="cash" class="ph-btn sm">+ 캐쉬 충전</button>' : ''}
    </div>`;
    const adminBanner = isAdmin && remCost > 0
      ? `<div class="ph-card ph-col" style="margin-bottom:4px">
          <div class="ph-small">관리자 전용 · 미보유 코스메틱 합계 ${formatCash(remCost)}</div>
          <div class="ph-acts"><button data-bmbuyall class="ph-btn sm">💎 미보유 전 상품 캐쉬 일괄 구매</button></div>
        </div>`
      : '';

    if (this.shopTab === 'cash') {
      const cashNotice = `<div class="ph-small" style="line-height:1.4">캐쉬 상품을 누르면 <b>실제 PayPal 결제 링크</b>로 바로 연결됩니다. 승인 완료 시 즉시 캐쉬가 지급돼요.</div>`;
      const packCards = BM_CASH_PACKS.map((pk) => `<div class="ph-card">
        <span class="bm-swatch" style="background:linear-gradient(135deg,#0070ba,#003087);color:#fff;font-size:18px">🅿️</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 flex-wrap"><b class="text-xs">${esc(pk.name)}</b>${pk.badge ? `<span class="bm-lock">${esc(pk.badge)}</span>` : ''}</div>
          <div class="ph-small" style="line-height:1.3">지급 <b>${formatCash(pk.totalCash)}</b> · ≈ ${formatKrw(pk.priceKrw)}</div>
        </div>
        <button data-bmpack="${pk.id}" class="bm-pay-pill">🅿️ ${formatUsd(pk.priceUsd)}</button>
      </div>`).join('');
      return `${tabs}${walletBar}${adminBanner}${cashNotice}<div class="ph-list">${packCards}</div>`;
    }

    if (this.shopTab === 'item') {
      const candyCount = countItem(me, 'star_candy');
      const ticketCount = countItem(me, 'name_ticket');
      const candyProd = BM_PRODUCT_MAP.star_candy;
      const ticketProd = BM_PRODUCT_MAP.name_ticket;

      const candyTargets = me.party.length
        ? `<div class="ph-acts" style="flex-wrap:wrap;margin-top:4px">${me.party.map((c, idx) => `<button data-usecandy="${idx}" class="ph-btn sm" ${candyCount < 1 || c.level >= 100 ? 'disabled' : ''}>🍬 ${esc(SPECIES[c.species].name)} Lv.${c.level}${c.level >= 100 ? ' (MAX)' : ` → Lv.${c.level + 1} 적용`}</button>`).join('')}</div>`
        : `<div class="ph-small" style="margin-top:4px">파트너 루미를 받은 뒤 바로 레벨업에 사용할 수 있어요.</div>`;

      const itemCards = `
        <div class="ph-card ph-col">
          <div style="display:flex;align-items:center;gap:8px;width:100%">
            <span class="bm-swatch" style="background:#eef7ff"><span class="px-icon" style="${iconStyle('star_candy', 28)}"></span></span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1 flex-wrap"><b class="text-xs">${esc(candyProd.name)}</b><span class="bm-lock">≈ $1.00</span><span class="ph-small">· 보유 ${candyCount}개</span></div>
              <div class="ph-small" style="line-height:1.3">${esc(candyProd.desc)}</div>
            </div>
            <button data-bmbuy="star_candy" class="bm-pay-pill">💎 ${candyProd.priceKrw.toLocaleString('ko-KR')} 구매</button>
          </div>
          ${candyTargets}
        </div>
        <div class="ph-card ph-col">
          <div style="display:flex;align-items:center;gap:8px;width:100%">
            <span class="bm-swatch" style="background:#fff6de"><span class="px-icon" style="${iconStyle('name_ticket', 28)}"></span></span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1 flex-wrap"><b class="text-xs">${esc(ticketProd.name)}</b><span class="bm-lock">≈ $4.00</span><span class="ph-small">· 보유 ${ticketCount}장</span></div>
              <div class="ph-small" style="line-height:1.3">${esc(ticketProd.desc)}</div>
            </div>
            <button data-bmbuy="name_ticket" class="bm-pay-pill">💎 ${ticketProd.priceKrw.toLocaleString('ko-KR')} 구매</button>
          </div>
          <div class="ph-small" style="margin-top:2px">현재 닉네임: <b>${esc(me.name)}</b> (멀티플레이 중복 시 2, 3… 자동 부여)</div>
          <div class="ph-acts" style="width:100%;margin-top:2px">
            <input data-nameinp class="ph-input sm" type="text" maxlength="10" placeholder="새 닉네임 입력 (현재: ${esc(me.name)})" value="${esc(this.pendingNameInput)}" style="flex:1">
            <button data-usename class="ph-btn sm" ${ticketCount < 1 ? 'disabled' : ''}>${ticketCount > 0 ? '티켓 1장 사용하여 변경' : '변경권 구매 필요'}</button>
          </div>
        </div>`;
      return `${tabs}${walletBar}<div class="ph-small" style="line-height:1.4;margin-bottom:4px">구매 버튼을 누르면 <b>상세 내용물 확인 창</b>이 열리며, 구매 즉시 그 자리에서 바로 사용할 수 있어요!</div><div class="ph-list">${itemCards}</div>`;
    }

    const owned = new Set(
      this.shopTab === 'theme' ? (me.ownedThemes ?? ['rural']) :
      this.shopTab === 'outfit' ? (me.ownedOutfits ?? []) :
      this.shopTab === 'bubble' ? (me.ownedBubbles ?? ['default']) :
      (me.ownedLumiCoords ?? []),
    );
    const curTheme = me.uiTheme ?? 'rural';
    const curLumi = me.lumiCoord ?? '';
    const curBubble = me.chatBubble ?? 'default';
    const leadSp = me.party[0]?.species ?? 'saerok';
    const previewStarter = STARTER_LUMI_SET.has(leadSp) ? leadSp : 'saerok';

    const tabList = BM_PRODUCTS.filter((p) => p.category === this.shopTab);
    const activePreviewProd = tabList.find((p) => p.id === this.shopPreviewId) ?? tabList[0];

    // 상단 실시간 미리보기 스테이지 (항목을 하나하나 눌러 적용 모습을 먼저 확인)
    let previewBox = '';
    if (activePreviewProd) {
      let pvVisual = '';
      if (activePreviewProd.category === 'outfit') {
        pvVisual = `<span style="${lookPortrait(activePreviewProd.id, 1.5)}"></span>`;
      } else if (activePreviewProd.category === 'lumi') {
        pvVisual = `<div style="display:flex;gap:8px;align-items:center">${STARTER_LUMI_IDS.map((sp) => `<span class="lumi-icon" style="display:inline-block;background-image:url(${lumiSheetUrl(sp, activePreviewProd.id)});width:40px;height:40px;background-size:240px 40px;image-rendering:pixelated"></span>`).join('')}</div>`;
      } else if (activePreviewProd.category === 'bubble') {
        pvVisual = this.bubblePreviewHtml(activePreviewProd.id, '안녕! 반가워요 ✨', true);
      } else {
        const th = UI_THEMES[activePreviewProd.id] ?? UI_THEMES.rural;
        pvVisual = `<span style="padding:6px 10px;border-radius:8px;background:${th.panel};color:${th.text};border:2px solid ${th.borderBright};font-size:11px;font-weight:700">${esc(th.name)}</span>`;
      }
      previewBox = `<div class="ph-card" style="background:rgba(255,248,236,0.95);border:2px solid #e0a43a;margin-bottom:5px;padding:6px 10px;gap:10px">
        ${pvVisual}
        <div class="flex-1 min-w-0">
          <div class="ph-small" style="color:#8a5a32;font-weight:700">🔍 미리보기 중: ${esc(activePreviewProd.name)}</div>
          <div class="ph-small" style="line-height:1.3">아래 목록을 하나씩 눌러 적용 모습을 먼저 확인하고, <b>[구매]</b>를 눌러 상세 창에서 구매하세요!</div>
        </div>
      </div>`;
    }

    const notice = this.shopTab === 'lumi'
      ? `<div class="ph-card" style="background:rgba(95,192,74,0.14);border-color:#5fc04a;padding:5px 8px;margin-bottom:4px"><div class="ph-small" style="line-height:1.3">🌱💧🔥 <b>기본 스타팅 루미 3종 (새록 · 찰랑 · 모락) 전용 치장 아이템</b> — 새록·찰랑·모락 스프라이트에 직접 그려진 전용 모습으로 적용됩니다!</div></div>`
      : '';

    let extra = '';
    if (this.shopTab === 'theme') {
      const r = UI_THEMES.rural;
      const on = curTheme === 'rural';
      extra = `<div class="ph-card ${on ? 'lead' : ''}">
        <span class="bm-swatch" style="background:linear-gradient(135deg,${r.panel},${r.border})"></span>
        <div class="flex-1 min-w-0"><b>${esc(r.name)}</b><div class="ph-small">${esc(r.desc)}</div></div>
        ${on ? '<span class="ph-ok">✔ 적용 중</span>' : '<button data-bmeq="theme:rural" class="ph-btn sm">적용하기</button>'}
      </div>`;
    } else if (this.shopTab === 'outfit') {
      const isBasic = !me.look.startsWith('bm_');
      const baseLook = me.look.startsWith('f') ? 'f1' : 'm1';
      extra = `<div class="ph-card ${isBasic ? 'lead' : ''}">
        <span class="bm-swatch" style="background:#f3dfb4"><span style="${lookPortrait(isBasic ? me.look : baseLook, 1)}"></span></span>
        <div class="flex-1 min-w-0"><b>기본 트레이너 의상</b><div class="ph-small">언제든 기본 의상(남/여)으로 즉시 돌아갈 수 있어요.</div></div>
        <div class="ph-acts">
          <button data-bmeq="outfit:m1" class="ph-btn sm ${me.look === 'm1' ? '' : 'ghost'}">남(기본)</button>
          <button data-bmeq="outfit:f1" class="ph-btn sm ${me.look === 'f1' ? '' : 'ghost'}">여(기본)</button>
        </div>
      </div>`;
    } else if (this.shopTab === 'lumi') {
      extra = `<div class="ph-card ${!curLumi ? 'lead' : ''}">
        <span class="bm-swatch" style="background:#eef5ea"><span class="lumi-icon" style="display:inline-block;background-image:url(assets/lumi/${previewStarter}.png);width:32px;height:32px;background-size:192px 32px"></span></span>
        <div class="flex-1 min-w-0"><b>기본 스타팅 루미 모습</b><div class="ph-small">현재 치장: ${curLumi ? esc(BM_PRODUCT_MAP[curLumi]?.name ?? curLumi) : '없음 (기본 모습)'}</div></div>
        ${curLumi ? '<button data-bmeq="lumi:" class="ph-btn sm ghost">치장 해제</button>' : '<span class="ph-ok">✔ 기본</span>'}
      </div>`;
    } else if (this.shopTab === 'bubble') {
      const d = CHAT_BUBBLES.default;
      const on = curBubble === 'default';
      extra = `<div class="ph-card ${on ? 'lead' : ''}">
        ${this.bubblePreviewHtml('default', '안녕!', true)}
        <div class="flex-1 min-w-0"><b>${esc(d.name)}</b><div class="ph-small">${esc(d.desc)}</div></div>
        ${on ? '<span class="ph-ok">✔ 적용 중</span>' : '<button data-bmeq="bubble:default" class="ph-btn sm">적용하기</button>'}
      </div>`;
    }

    const cards = tabList.map((p) => {
      const isOwned = owned.has(p.id);
      const u = isBmUnlocked(p, me, isAdmin);
      const isEq =
        (p.category === 'theme' && curTheme === p.id) ||
        (p.category === 'outfit' && me.look === p.id) ||
        (p.category === 'lumi' && curLumi === p.id) ||
        (p.category === 'bubble' && curBubble === p.id);
      const isPreview = activePreviewProd?.id === p.id;
      const thumb =
        p.category === 'outfit' ? `<span class="bm-swatch" style="background:#f3dfb4"><span style="${lookPortrait(p.id, 1)}"></span></span>` :
        p.category === 'lumi' ? `<span class="bm-swatch" style="background:#eef5ea">${lumiCoordBadgeHtml(p.id, 32, previewStarter)}</span>` :
        p.category === 'bubble' ? this.bubblePreviewHtml(p.id, '안녕♪', true) :
        `<span class="bm-swatch" style="background:linear-gradient(135deg,${p.previewColor},${p.accentColor})"></span>`;
      const action = isEq
        ? '<span class="ph-ok">✔ 적용 중</span>'
        : isOwned
          ? `<button data-bmeq="${p.category}:${p.id}" class="ph-btn sm">적용하기</button>`
          : !u.unlocked
            ? `<span class="bm-lock">🔒 ${esc(p.town)}</span>`
            : `<button data-bmbuy="${p.id}" class="bm-pay-pill">💎 ${p.priceKrw.toLocaleString('ko-KR')} 구매</button>`;
      return `<div data-bmpreview="${p.id}" class="ph-card ${isEq ? 'lead' : !u.unlocked && !isOwned ? 'locked' : ''}" style="cursor:pointer;${isPreview ? 'outline:2px solid #e0a43a;' : ''}">
        ${thumb}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1 flex-wrap"><b class="text-xs">${esc(p.name)}</b>${p.category === 'lumi' ? '<span class="bm-lock">기본 루미 3종 전용</span>' : `<span class="ph-small">· ${esc(p.town)}</span>`}</div>
          <div class="ph-small" style="line-height:1.3">${esc(u.unlocked || isOwned ? p.desc : u.reason)}</div>
        </div>
        ${action}
      </div>`;
    }).join('');
    return `${tabs}${walletBar}${adminBanner}${previewBox}${notice}<div class="ph-list">${extra}${cards}</div>`;
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
    const sfxPct = Math.round(sfx.volume * 100);
    const bgmPct = Math.round(music.volume * 100);
    return `<div class="ph-stack">
        ${sw('sound', '효과음', !sfx.muted)}
        <div class="ph-card" style="padding:8px 12px;display:flex;align-items:center;gap:8px">
          <span class="text-xs" style="min-width:74px">🔔 효과음 볼륨</span>
          <input data-phvol="sfx" type="range" min="0" max="100" value="${sfxPct}" style="flex:1;accent-color:#5fc04a" />
          <b data-phvollbl="sfx" class="text-xs" style="min-width:34px;text-align:right">${sfxPct}%</b>
        </div>
        ${sw('steps', '발소리', sfx.stepsOn)}
        ${sw('music', '배경음악', music.on)}
        <div class="ph-card" style="padding:8px 12px;display:flex;align-items:center;gap:8px">
          <span class="text-xs" style="min-width:74px">🎵 배경음 볼륨</span>
          <input data-phvol="music" type="range" min="0" max="100" value="${bgmPct}" style="flex:1;accent-color:#5fc04a" />
          <b data-phvollbl="music" class="text-xs" style="min-width:34px;text-align:right">${bgmPct}%</b>
        </div>
        ${sw('hunger', '포만감 보급 모드 (끄면 편한 모드)', !c.me().hungerOff)}
      </div>
      <div class="ph-sec">저장 <span>${esc(c.storage())}</span></div>
      <div class="ph-stack">
        ${c.canSave() ? '<button data-set="save" class="ph-btn">지금 저장하기</button>' : '<div class="ph-small" style="text-align:center">서버에 자동으로 저장되고 있어요</div>'}
        <button data-set="reset" class="ph-btn danger">저장 초기화</button>
        <button data-set="title" class="ph-btn ghost">타이틀로</button>
      </div>`;
  },

  wire(n: HTMLElement, me: PlayerState) {
    // 유저 · 버그 신고
    n.querySelectorAll<HTMLButtonElement>('[data-rkind]').forEach((b) => {
      b.onclick = () => { sfx.play('tap'); this.reportKind = b.dataset.rkind as 'user' | 'bug'; this.render(); };
    });
    n.querySelector<HTMLButtonElement>('[data-bugsend]')?.addEventListener('click', () => {
      const ta = n.querySelector<HTMLTextAreaElement>('[data-bug]'); const text = ta?.value.trim() ?? '';
      if (!text) { sfx.play('error'); return; }
      const sel = n.querySelector<HTMLSelectElement>('[data-bugtarget]');
      const inpName = n.querySelector<HTMLInputElement>('[data-bugtname]');
      const targetUid = this.reportKind === 'user' ? (sel?.value || undefined) : undefined;
      const selName = sel?.selectedOptions?.[0]?.dataset.rname || '';
      const targetName = this.reportKind === 'user' ? (selName || inpName?.value.trim() || undefined) : undefined;
      if (this.ctx!.report(text, { kind: this.reportKind, targetUid, targetName })) {
        sfx.play('confirm');
        this.bugSent = true;
        this.render();
        setTimeout(() => { this.bugSent = false; }, 30000);
      }
    });
    n.querySelector<HTMLTextAreaElement>('[data-bug]')?.addEventListener('keydown', (e) => e.stopPropagation());
    n.querySelector<HTMLInputElement>('[data-bugtname]')?.addEventListener('keydown', (e) => e.stopPropagation());
    // 관리자
    if (this.app === 'admin') {
      if (this.adminTab !== 'bm' && !this.adminData && !this.adminLoading) { this.adminLoading = true; void this.adminLoad().finally(() => { this.adminLoading = false; }); }
      n.querySelectorAll<HTMLButtonElement>('[data-atab]').forEach((b) => { b.onclick = () => { this.adminTab = b.dataset.atab as 'users' | 'reports' | 'bm'; if (this.adminTab !== 'bm') this.adminData = null; this.render(); }; });
      n.querySelector<HTMLButtonElement>('[data-arefresh]')?.addEventListener('click', () => { this.adminMsg = ''; void this.adminLoad(); });
      n.querySelectorAll<HTMLButtonElement>('[data-resolve]').forEach((b) => { b.onclick = () => void this.adminRun({ op: 'resolve', id: b.dataset.resolve! }); });
      n.querySelectorAll<HTMLInputElement | HTMLSelectElement>('.ph-input').forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
      // 신고 내역 카드 안의 직접 제재 버튼 (채팅 금지 분 · 접속 금지 일 · 감옥 보내기)
      n.querySelectorAll<HTMLButtonElement>('[data-rop]').forEach((b) => {
        b.onclick = () => {
          const op = b.dataset.rop!, rkey = b.dataset.rkey!;
          const targetEl = n.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-rtarget="${CSS.escape(rkey)}"]`);
          const uid = targetEl?.value ?? '';
          if (!uid) { this.adminMsg = '제재할 대상 UID가 없어요.'; this.render(); return; }
          if (op === 'mute') {
            const mins = Math.max(1, Number(n.querySelector<HTMLInputElement>(`[data-mm="${CSS.escape(rkey)}"]`)?.value ?? 10));
            void this.adminRun({ op: 'mute', uid, minutes: mins, reason: '신고 접수에 따른 채팅 금지' });
            return;
          }
          if (op === 'unmute') { void this.adminRun({ op: 'unmute', uid }); return; }
          if (op === 'ban') {
            const days = Math.max(1, Number(n.querySelector<HTMLInputElement>(`[data-bd="${CSS.escape(rkey)}"]`)?.value ?? 3));
            void this.adminRun({ op: 'ban', uid, days, reason: `신고 접수에 따른 ${days}일 접속 금지` });
            return;
          }
          if (op === 'jail') {
            void this.adminRun({ op: 'jail', uid, reason: '신고 접수에 따른 교도소 수감', fine: true });
            return;
          }
        };
      });
      const uSearch = n.querySelector<HTMLInputElement>('[data-usearch]');
      if (uSearch) {
        uSearch.addEventListener('input', () => {
          this.adminUserQuery = uSearch.value;
          const pos = uSearch.selectionStart ?? uSearch.value.length;
          this.render();
          const nextInp = this.node?.querySelector<HTMLInputElement>('[data-usearch]');
          if (nextInp) { nextInp.focus(); nextInp.setSelectionRange(pos, pos); }
        });
      }
      n.querySelectorAll<HTMLButtonElement>('[data-usel]').forEach((b) => {
        b.onclick = () => {
          sfx.play('tap');
          this.adminSelUid = b.dataset.usel ?? '';
          this.render();
        };
      });
      n.querySelectorAll<HTMLButtonElement>('[data-atime]').forEach((b) => {
        b.onclick = () => {
          sfx.play('tap');
          void this.adminRun({ op: 'setTime', minutes: Number(b.dataset.atime ?? 1200) });
        };
      });
      n.querySelectorAll<HTMLButtonElement>('[data-aop]').forEach((b) => {
        b.onclick = () => {
          const op = b.dataset.aop!, uid = b.dataset.uid!;
          if (op === 'kick' && !window.confirm('강퇴할까요?')) return;
          if (op === 'ban') {
            const days = Math.max(0, Number(n.querySelector<HTMLInputElement>(`[data-bd="${CSS.escape(uid)}"]`)?.value ?? 3));
            const label = days > 0 ? `${days}일 접속 금지` : '영구 이용 정지';
            if (!window.confirm(`${label}를 적용할까요?`)) return;
            void this.adminRun({ op: 'ban', uid, days, reason: `관리자 ${label}` });
            return;
          }
          if (op === 'mute') {
            const mins = Math.max(1, Number(n.querySelector<HTMLInputElement>(`[data-mm="${CSS.escape(uid)}"]`)?.value ?? 10));
            void this.adminRun({ op: 'mute', uid, minutes: mins, reason: `관리자 ${mins}분 채팅 금지` });
            return;
          }
          if (op === 'unmute') { void this.adminRun({ op: 'unmute', uid }); return; }
          if (op === 'jail') { void this.adminRun({ op: 'jail', uid, reason: '관리자 교도소 수감', fine: true }); return; }
          if (op === 'unjail') { void this.adminRun({ op: 'unjail', uid }); return; }
          if (op === 'give') { const it = n.querySelector<HTMLSelectElement>(`[data-gi="${CSS.escape(uid)}"]`)?.value ?? ''; const q = Number(n.querySelector<HTMLInputElement>(`[data-gq="${CSS.escape(uid)}"]`)?.value ?? 1); void this.adminRun({ op: 'give', uid, itemId: it, qty: q }); return; }
          if (op === 'gold') { const a = Number(n.querySelector<HTMLInputElement>(`[data-gg="${CSS.escape(uid)}"]`)?.value ?? 0); void this.adminRun({ op: 'gold', uid, amount: a }); return; }
          if (op === 'grantCash') { void this.adminRun({ op: 'grantCash', uid, amount: 1_000_000 }); return; }
          if (op === 'warp') { const mp = (n.querySelector<HTMLSelectElement>(`[data-gm="${CSS.escape(uid)}"]`)?.value ?? '') as MapId; void this.adminRun({ op: 'warp', uid, map: mp }); return; }
          void this.adminRun({ op: op as 'goto' | 'bring' | 'kick' | 'unban', uid });
        };
      });
      n.querySelectorAll<HTMLButtonElement>('[data-admact]').forEach((b) => {
        b.onclick = () => {
          const act = b.dataset.admact!;
          if (act === 'addcash') { void this.adminRun({ op: 'grantCash', uid: me.id, amount: 1_000_000 }); return; }
          if (act === 'ensurecash') { void this.adminRun({ op: 'grantCash', uid: me.id, amount: 0, mode: 'ensureAll' }); return; }
          if (act === 'resetbm') { void this.adminRun({ op: 'resetBm', uid: me.id }); return; }
          if (act === 'buyall') {
            void this.ctx!.buyAllBmCash?.().then((r) => {
              this.adminMsg = r.ok ? `전 상품(${r.boughtCount ?? 0}종) 캐쉬 구매 완료! 우편함을 확인하세요.` : r.error ?? '일괄 구매 실패';
              this.render();
            });
          }
        };
      });
      n.querySelector<HTMLButtonElement>('[data-admtopup]')?.addEventListener('click', (ev) => {
        const packId = (ev.currentTarget as HTMLButtonElement).dataset.admtopup ?? 'cash_10000';
        const pack = BM_CASH_PACK_MAP[packId] ?? BM_CASH_PACKS[2];
        if (pack) { sfx.play('tap'); this.ctx?.buyCashPack?.(pack); }
      });
      n.querySelector<HTMLButtonElement>('[data-admpgtest]')?.addEventListener('click', () => {
        if (!this.ctx?.testPgSystem) return;
        this.pgTestBusy = true;
        this.render();
        void this.ctx.testPgSystem().then((res) => {
          this.pgTestRes = res;
          this.adminMsg = res.ok ? '외부 PG · 캐쉬 시스템 점검 완료!' : res.error ?? '점검 항목을 확인하세요.';
        }).finally(() => {
          this.pgTestBusy = false;
          if (this.app === 'admin') this.render();
        });
      });
    }
    const c = this.ctx!;
    n.querySelectorAll<HTMLButtonElement>('[data-bmbuyall]').forEach((b) => {
      b.onclick = () => { sfx.play('tap'); void c.buyAllBmCash?.().then(() => this.render()); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-bmpack]').forEach((b) => {
      b.onclick = () => { const pk = BM_CASH_PACK_MAP[b.dataset.bmpack!]; if (pk) { sfx.play('tap'); c.buyCashPack?.(pk); } };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-bmtab]').forEach((b) => {
      b.onclick = () => {
        sfx.play('tap');
        this.shopTab = b.dataset.bmtab as 'cash' | BmCategory;
        this.shopDetailId = '';
        this.shopPreviewId = '';
        c.previewBm?.('', '');
        this.render();
      };
    });
    n.querySelectorAll<HTMLElement>('[data-bmpreview]').forEach((card) => {
      card.onclick = (ev) => {
        if ((ev.target as HTMLElement).closest('button')) return;
        const pid = card.dataset.bmpreview!;
        const prod = BM_PRODUCT_MAP[pid];
        if (!prod) return;
        sfx.play('tap');
        this.shopPreviewId = pid;
        c.previewBm?.(prod.category, prod.id);
        this.render();
      };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-bmbuy]').forEach((b) => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const prod = BM_PRODUCT_MAP[b.dataset.bmbuy!];
        if (!prod) return;
        sfx.play('tap');
        this.shopPreviewId = prod.id;
        c.previewBm?.(prod.category, prod.id);
        this.shopDetailId = prod.id;
        this.render();
      };
    });
    n.querySelector<HTMLButtonElement>('[data-bmcancel]')?.addEventListener('click', () => {
      sfx.play('tap');
      this.shopDetailId = '';
      this.render();
    });
    n.querySelectorAll<HTMLButtonElement>('[data-bmcancel]').forEach((b) => {
      b.onclick = () => {
        sfx.play('tap');
        this.shopDetailId = '';
        this.render();
      };
    });
    n.querySelector<HTMLButtonElement>('[data-bmconfirm]')?.addEventListener('click', (ev) => {
      const pid = (ev.currentTarget as HTMLButtonElement).dataset.bmconfirm!;
      const prod = BM_PRODUCT_MAP[pid];
      if (!prod) return;
      sfx.play('confirm');
      void c.buyBm?.(prod).then((ok) => {
        if (ok) this.shopDetailId = '';
        this.render();
      });
    });
    n.querySelectorAll<HTMLButtonElement>('[data-bmeq]').forEach((b) => {
      b.onclick = (ev) => {
        ev.stopPropagation();
        const [cat, id] = b.dataset.bmeq!.split(':');
        sfx.play('confirm');
        c.equipBm?.(cat as BmCategory, id ?? '');
      };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-usecandy]').forEach((b) => {
      b.onclick = () => {
        const idx = Number(b.dataset.usecandy ?? 0);
        void c.useCandy?.(idx).then(() => this.render());
      };
    });
    const nameInp = n.querySelector<HTMLInputElement>('[data-nameinp]');
    if (nameInp) {
      const syncVal = () => { this.pendingNameInput = nameInp.value; };
      nameInp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          syncVal();
          n.querySelector<HTMLButtonElement>('[data-usename]')?.click();
        }
      });
      nameInp.addEventListener('input', syncVal);
      nameInp.addEventListener('change', syncVal);
      nameInp.addEventListener('keyup', syncVal);
    }
    n.querySelector<HTMLButtonElement>('[data-usename]')?.addEventListener('click', () => {
      const inpEl = n.querySelector<HTMLInputElement>('[data-nameinp]');
      const val = (inpEl?.value || this.pendingNameInput).trim();
      if (!val) { sfx.play('error'); return; }
      void c.changeName?.(val).then((r) => {
        if (r?.ok) {
          this.pendingNameInput = '';
          this.adminData = null;
          this.render();
        }
      });
    });
    n.querySelectorAll<HTMLButtonElement>('[data-partner]').forEach((b) => { b.onclick = () => { sfx.play('confirm'); c.setPartner(Number(b.dataset.partner)); }; });
    n.querySelectorAll<HTMLButtonElement>('[data-ptab]').forEach((b) => {
      b.onclick = () => { sfx.play('tap'); this.partyTab = b.dataset.ptab as 'party' | 'box'; this.inspectTarget = null; this.swapBoxIdx = null; this.releaseConfirmIdx = null; this.render(); };
    });
    n.querySelectorAll<HTMLElement>('[data-insp]').forEach((b) => {
      b.onclick = () => { const [w, idx] = b.dataset.insp!.split(':'); sfx.play('tap'); this.inspectTarget = { where: w as 'party' | 'box', index: Number(idx) }; this.render(); };
    });
    n.querySelector<HTMLButtonElement>('[data-insp-close]')?.addEventListener('click', () => { sfx.play('tap'); this.inspectTarget = null; this.render(); });
    n.querySelectorAll<HTMLButtonElement>('[data-pswap]').forEach((b) => {
      b.onclick = () => { const [a, bb] = b.dataset.pswap!.split(':').map(Number); sfx.play('tap'); c.partySwap?.(a, bb); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-box-in]').forEach((b) => {
      b.onclick = () => { void c.boxDeposit?.(Number(b.dataset.boxIn)).then(() => this.render()); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-box-out]').forEach((b) => {
      b.onclick = () => { void c.boxWithdraw?.(Number(b.dataset.boxOut)).then(() => this.render()); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-box-swapopen]').forEach((b) => {
      b.onclick = () => { const idx = Number(b.dataset.boxSwapopen); sfx.play('tap'); this.swapBoxIdx = this.swapBoxIdx === idx ? null : idx; this.releaseConfirmIdx = null; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-box-swap]').forEach((b) => {
      b.onclick = () => { const [pi, bi] = b.dataset.boxSwap!.split(':').map(Number); void c.boxSwap?.(pi, bi).then((ok) => { if (ok) this.swapBoxIdx = null; this.render(); }); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-box-rel]').forEach((b) => {
      b.onclick = () => { sfx.play('tap'); this.releaseConfirmIdx = Number(b.dataset.boxRel); this.swapBoxIdx = null; this.render(); };
    });
    n.querySelector<HTMLButtonElement>('[data-box-relno]')?.addEventListener('click', () => { sfx.play('tap'); this.releaseConfirmIdx = null; this.render(); });
    n.querySelectorAll<HTMLButtonElement>('[data-box-relyes]').forEach((b) => {
      b.onclick = () => { void c.boxRelease?.(Number(b.dataset.boxRelyes)).then(() => { this.releaseConfirmIdx = null; this.render(); }); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-bagheal]').forEach((b) => {
      b.onclick = () => { const [itemId, pi] = b.dataset.bagheal!.split(':'); void c.useBagItem?.(itemId, Number(pi)).then(() => this.render()); };
    });
    n.querySelectorAll<HTMLElement>('[data-mappick]').forEach((el) => {
      el.onclick = () => { sfx.play('tap'); this.mapPick = el.dataset.mappick ?? ''; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-flyto]').forEach((b) => {
      b.onclick = () => { const to = b.dataset.flyto!; void c.fastTravel?.(to).then((ok) => { if (ok) this.close(); }); };
    });
    n.querySelector<HTMLButtonElement>('[data-escape-cave]')?.addEventListener('click', () => {
      void c.escapeCave?.().then((ok) => { if (ok) this.close(); });
    });
    n.querySelectorAll<HTMLButtonElement>('[data-item]').forEach((b) => { b.onclick = () => { sfx.play('tap'); this.bagPick = this.bagPick === b.dataset.item ? '' : b.dataset.item!; this.render(); }; });
    n.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
      b.onclick = () => {
        const [kind, v] = this.bagPick.split(':'); if (kind !== 's') return;
        const act = c.bagActions(Number(v))[Number(b.dataset.act)];
        act?.run(); this.render();
      };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-dexmode]').forEach((b) => {
      b.onclick = () => { sfx.play('tap'); this.dexMode = b.dataset.dexmode as 'lumi' | 'life'; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-ldextab]').forEach((b) => {
      b.onclick = () => { sfx.play('tap'); this.lifeDexTab = b.dataset.ldextab as LifeDexSubTab; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-dexclaim]').forEach((b) => {
      b.onclick = () => { const id = b.dataset.dexclaim!; void c.claimDexMilestone?.(id).then(() => this.render()); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-rtab]').forEach((b) => {
      b.onclick = () => { sfx.play('tap'); this.recipeTab = b.dataset.rtab as 'all' | 'workbench' | 'kitchen'; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-set]').forEach((b) => {
      b.onclick = () => {
        sfx.play('tap');
        const k = b.dataset.set;
        if (k === 'sound') sfx.setMuted(!sfx.muted);
        else if (k === 'steps') sfx.setSteps(!sfx.stepsOn);
        else if (k === 'music') music.setOn(!music.on);
        else if (k === 'hunger') { void c.setHungerMode?.(!me.hungerOff).then(() => this.render()); return; }
        else if (k === 'save') c.save();
        else if (k === 'reset') this.confirmReset = true;
        else if (k === 'no') this.confirmReset = false;
        else if (k === 'yes') { this.close(); c.reset(); return; }
        else if (k === 'title') { this.close(); c.toTitle(); return; }
        this.render();
      };
    });
    n.querySelectorAll<HTMLInputElement>('[data-phvol]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const v = Number(inp.value) / 100;
        const k = inp.dataset.phvol;
        if (k === 'sfx') sfx.setVolume(v);
        else if (k === 'music') music.setVolume(v);
        const lbl = n.querySelector<HTMLElement>(`[data-phvollbl="${k}"]`);
        if (lbl) lbl.textContent = `${Math.round(v * 100)}%`;
      });
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
  ${[['WASD / 방향키', '이동 (Shift 달리기 · B 자전거 타기/내리기)'], ['Space / 좌클릭', '손에 든 도구 사용 · 씨앗 · 낚시'], ['E / 우클릭', '대화 · 수확 · 출하 · 잡초 뽑기 · 조사'], ['R', '휴대폰 홈 화면 (가방에서 도구 바꾸기)'], ['M', '지도 바로 열기'], ['P', '휴대폰 › 나의 루미'], ['H', '휴대폰 › 도움말'], ['Esc', '휴대폰 뒤로 · 닫기'], ['Enter', '채팅'], ['Tab', '감정표현 휠 (톡 누르고 클릭 · 누른 채 고르고 떼기)'], ['L', '접속자 목록 접기']]
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}
  </tbody></table>
  <div class="ph-note"><b>내 농장 일구기</b>: 마을 소라네 루미 마트에서 괭이 · 물뿌리개 · 도끼 · 곡괭이 · 망치를 사요. 잡초는 E 로 뽑고, 안쪽 나무는 도끼로(5번), 돌은 곡괭이로 치운 뒤 괭이로 땅을 갈아요. 가방에서 씨앗을 누르면 주변 밭에 심고, 매일 물을 주면 자라요. 작업대에서 만든 울타리 · 상자는 가방에서 설치하고 망치로 부숴요.<br><b>모험 보급</b>: 루미풀 · 불꽃고추 · 단단콩과 돌 · 구리 · 철로 회복약 · 도핑약 · 루미볼을 만들어요.</div>`;
