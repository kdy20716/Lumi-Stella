// DOM 오버레이 UI: 로딩 / 타이틀 / HUD(시계·골드·에너지) / 손에 든 도구 / 대화창 / 토스트 / 힌트 / 하루 전환 / 채팅
import { ITEMS, NPCS, RECIPES, SPECIES, TYPE_COLORS } from '@shared/data';
import { illustHtml } from './Illust';
import { serverUrl } from '../net/serverUrl';
import { josa } from '@shared/josa';
import { creator, emoteWheel, invitePrompt, mailbox } from './Social';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';
import { type CreatureInst, type InventorySlot, type PlayerState, type ShopDef, type WorldTime } from '@shared/types';

const root = () => document.getElementById('ui')!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e;
};
let ICON_IDS: string[] = [];
export const setIconIds = (ids: string[]) => { ICON_IDS = ids; };
export const iconStyle = (id: string, size = 48) => {
  const i = Math.max(0, ICON_IDS.indexOf(id));
  return `background-size:${ICON_IDS.length * size}px ${size}px;background-position:-${i * size}px 0;width:${size}px;height:${size}px`;
};
const SEASON_KO: Record<string, string> = { spring: '봄', summer: '여름', fall: '가을', winter: '겨울' };
const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
export const formatTime = (m: number) => {
  const h = Math.floor(m / 60) % 24, mm = m % 60;
  return `${h < 12 ? '오전' : '오후'} ${((h + 11) % 12) + 1}:${String(mm).padStart(2, '0')}`;
};

// ── 로딩 ────────────────────────────────────────────────
const loading = {
  node: null as HTMLDivElement | null, bar: null as HTMLDivElement | null,
  show() {
    if (this.node) return;
    this.node = el('div', 'fixed inset-0 flex flex-col items-center justify-center gap-6 bg-[#14201a] text-[#f3dfb4] z-50 transition-opacity duration-500');
    this.node.innerHTML = `<div class="text-4xl px-outline text-[#ffe58a] tracking-widest">루미 스텔라</div>
      <div class="w-72 h-5 border-4 border-[#5e3620] bg-[#3b2414]"><div class="h-full bg-[#7cc45a] w-0 transition-all"></div></div>
      <div class="text-sm opacity-70">픽셀을 심는 중...</div>`;
    this.bar = this.node.querySelector('div > div > div');
    document.body.appendChild(this.node);
  },
  progress(v: number) { if (this.bar) this.bar.style.width = `${Math.round(v * 100)}%`; },
  done() { const n = this.node; if (!n) return; n.style.opacity = '0'; setTimeout(() => n.remove(), 500); this.node = null; },
};

// ── 타이틀 ──────────────────────────────────────────────
export interface TitleHandle { close: () => void; error: (m: string) => void; busy: (m: string) => void; setUser: (name: string | null) => void }
const title = {
  show(o: { onGoogle: (mode: 'public' | 'story') => void; onLogout: () => void }): TitleHandle & { url: () => string } {
    const n = el('div', 'fixed inset-0 z-40 flex flex-col items-center justify-center pointer-events-auto vignette');
    // 서버 주소는 화면에 보이지 않음: VITE_SERVER_URL → ?server= → 같은 PC 2567 (net/serverUrl.ts)
    const defUrl = serverUrl();
    n.innerHTML = `
      <button data-a="logout" class="hidden absolute top-4 right-4 px-btn text-base !py-1.5">로그아웃</button>
      <div class="title-float flex flex-col items-center mb-8">
        <div class="text-[64px] leading-none text-[#ffe58a] px-outline tracking-[0.12em]" style="text-shadow:-4px 0 #3b2414,4px 0 #3b2414,0 -4px #3b2414,0 4px #3b2414,4px 4px #3b2414,6px 8px 0 rgba(0,0,0,.35)">루미 스텔라</div>
        <div class="mt-2 text-3xl text-[#bff0e0] px-outline tracking-[0.3em]">별빛의 씨앗</div>
        <div class="mt-2 text-sm text-[#fff8ec] px-outline tracking-[0.35em] opacity-90">LUMI STELLA · SEEDS OF STARLIGHT</div>
      </div>
      <div class="px-panel flex flex-col items-center gap-3 w-[min(380px,92cqw)]">
        <div data-c="user" class="text-sm text-[#8a5a32] min-h-5">로그인 상태 확인 중...</div>
        <button data-a="google" class="px-btn green text-xl w-full flex items-center justify-center gap-2"><span class="inline-flex w-7 h-7 rounded-full bg-white text-[#4285f4] font-bold items-center justify-center text-lg">G</span><span data-c="gtext">멀티 플레이</span></button>
        <div class="-mt-2 text-[11px] text-[#8a5a32]">접속한 모든 사람과 같은 서버에서 함께해요 · 자유 모험</div>
        <button data-a="solo" class="px-btn text-xl w-full">스토리 모드</button>
        <div class="-mt-2 text-[11px] text-[#8a5a32] text-center">혼자서 본편 이야기를 엔딩까지 — 루미 · 배지 · 아이템은 멀티와 이어져요<br>친구와 메시지는 되지만 초대는 할 수 없어요</div>
        <div data-e class="text-[#c8453c] text-sm min-h-5 text-center"></div>
      </div>
      <div class="absolute bottom-4 text-xs text-[#fff8ec] opacity-80 px-outline">로그인하면 모험이 자동 저장돼요 · WASD 이동 · E 상호작용 · Tab 감정표현 · H 도움말</div>`;
    root().appendChild(n);
    const q = <T extends HTMLElement>(s: string) => n.querySelector<T>(s)!;
    const url = () => defUrl;
    const close = () => { n.style.transition = 'opacity .4s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 400); };
    const err = q<HTMLDivElement>('[data-e]');
    q<HTMLButtonElement>('[data-a=google]').onclick = () => { sfx.play('confirm'); err.textContent = ''; o.onGoogle('public'); };
    q<HTMLButtonElement>('[data-a=solo]').onclick = () => { sfx.play('confirm'); err.textContent = ''; o.onGoogle('story'); };
    q<HTMLButtonElement>('[data-a=logout]').onclick = () => o.onLogout();
    return {
      close, url,
      error: (m) => { err.style.color = '#c8453c'; err.textContent = m; },
      busy: (m) => { err.style.color = '#2f7a3a'; err.textContent = m; },
      setUser: (name) => {
        q('[data-c=user]').textContent = name ? `${name} 님으로 로그인됨 · 아래 버튼을 눌러 시작해요` : '로그인하면 진행상황이 자동 저장돼요';
        q('[data-c=gtext]').textContent = '멀티 플레이';
        q('[data-a=logout]').classList.toggle('hidden', !name);
      },
    };
  },
};

// ── HUD ────────────────────────────────────────────────
const hud = {
  node: null as HTMLDivElement | null,
  mount() {
    const n = el('div', 'absolute top-3 right-3 flex flex-col items-end gap-2');
    n.innerHTML = `
      <div class="px-panel min-w-[230px] text-lg leading-tight">
        <div class="flex items-center justify-between gap-3"><span data-h="date"></span><span data-h="weather" class="px-icon" style=""></span></div>
        <div class="flex items-center justify-between gap-3 text-2xl"><span data-h="time"></span></div>
        <div class="mt-1 flex items-center justify-end gap-2 bg-[#e6cb93] px-2 py-0.5 border-2 border-[#a8683a]"><span class="px-icon" style="${iconStyle('gold', 24)}"></span><span data-h="gold" class="text-xl tabular-nums"></span></div>
      </div>`;
    root().appendChild(n);
    this.node = n;
  },
  time(t: WorldTime) {
    if (!this.node) return;
    (this.node.querySelector('[data-h=date]') as HTMLElement).textContent = `${SEASON_KO[t.season]} ${t.day}일 (${WEEK[(t.day - 1) % 7]})`;
    (this.node.querySelector('[data-h=time]') as HTMLElement).textContent = formatTime(t.minutes);
    (this.node.querySelector('[data-h=weather]') as HTMLElement).setAttribute('style', iconStyle(t.weather === 'rain' ? 'rain' : 'sun', 32));
  },
  gold(g: number) { const n = this.node?.querySelector('[data-h=gold]'); if (n) n.textContent = `${g.toLocaleString()}G`; },
  energy(v: number, max: number) {
    const n = document.querySelector('[data-h=energy]') as HTMLElement | null;
    if (n) { n.style.height = `${(v / max) * 100}%`; n.style.filter = v / max < 0.2 ? 'hue-rotate(-80deg)' : ''; }
  },
};

// 손에 든 도구 표시 (아래 핫바 대신 — 도구는 휴대폰 › 가방에서 고름)
const hotbar = {
  node: null as HTMLDivElement | null,
  onClick: () => {},
  mount() {
    if (this.node) return;
    this.node = el('div', 'held-badge');
    this.node.title = '휴대폰(R) › 가방에서 바꾸기';
    this.node.onclick = () => this.onClick();
    root().appendChild(this.node);
  },
  render(all: InventorySlot[], selected: number) {
    if (!this.node) return;
    const s = all[selected]; const it = s?.itemId ? ITEMS[s.itemId] : null;
    this.node.innerHTML = it
      ? `<span class="px-icon" style="${iconStyle(it.icon, 32)}"></span><div><div class="nm">${it.name}${it.type !== 'tool' ? ` <span class="q">×${s.quantity}</span>` : ''}</div><div class="sub">Space 사용 · R › 가방에서 바꾸기</div></div>`
      : '<span class="px-icon" style="opacity:.4;' + iconStyle('craft', 32) + '"></span><div><div class="nm">빈손</div><div class="sub">R › 가방에서 골라 손에 들기</div></div>';
  },
};

// ── 예/아니오 선택창 ───────────────────────────────────
export const confirmBox = {
  node: null as HTMLDivElement | null,
  get open() { return !!this.node; },
  show(text: string, onYes: () => void, o: { yes?: string; no?: string; onNo?: () => void } = {}) {
    this.close();
    const n = el('div', 'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[min(460px,92cqw)] pointer-events-auto toast-in');
    n.innerHTML = `<div class="px-panel text-center"><div class="text-xl leading-relaxed whitespace-pre-wrap mb-3">${text}</div>
      <div class="flex gap-3 justify-center"><button data-c="no" class="px-btn text-base">${o.no ?? '아니요'}</button><button data-c="yes" class="px-btn green text-base">${o.yes ?? '네'}</button></div></div>`;
    n.querySelector<HTMLButtonElement>('[data-c=yes]')!.onclick = () => { this.close(); onYes(); };
    n.querySelector<HTMLButtonElement>('[data-c=no]')!.onclick = () => { this.close(); o.onNo?.(); };
    root().appendChild(n); this.node = n;
  },
  close() { this.node?.remove(); this.node = null; },
};

// ── 대화창 ─────────────────────────────────────────────
const dialogue = {
  node: null as HTMLDivElement | null, pages: [] as string[], page: 0, typing: 0, full: '', shown: 0, onClose: null as (() => void) | null,
  get open() { return !!this.node; },
  /** 하단 대화창. sprite(=인물 id)가 있으면 오른쪽에 흉상 일러스트 + 이름표 */
  show(o: { name: string; title?: string; sprite?: string; color?: string; pages: string[]; hearts?: number }, onClose?: () => void) {
    this.close(false);
    this.pages = o.pages.map(josa); this.page = 0; this.onClose = onClose ?? null;
    const n = el('div', 'fixed left-1/2 -translate-x-1/2 bottom-3 w-[min(980px,97cqw)] z-30 pointer-events-auto dlg-in');
    const hearts = o.hearts !== undefined ? `<div class="flex gap-0.5 justify-center mt-1">${Array.from({ length: 5 }, (_, i) => `<span class="px-icon" style="${iconStyle('heart', 14)};${i < o.hearts! ? '' : 'filter:grayscale(1) opacity(.45)'}"></span>`).join('')}</div>` : '';
    // 오른쪽 위: 성격에 맞는 포즈의 벡터 일러스트 (대화창 뒤에서 상반신이 올라옴) + 이름표
    const ill = o.sprite ? illustHtml(o.sprite) : '';
    const portrait = o.sprite ? `<div class="dlg-ill" style="--pc:${o.color ?? '#a8683a'}">${ill || `<img src="assets/portraits/${o.sprite}.png" alt="" onerror="this.style.display='none'">`}</div>` : '';
    const tag = o.sprite ? `<div class="dlg-tag"><div class="dlg-name" style="background:${o.color ?? '#a8683a'}">${o.name}</div>${hearts}</div>` : '';
    n.innerHTML = `${portrait}<div class="px-panel relative flex gap-4 items-stretch min-h-[178px] ${o.sprite ? 'pr-[230px]' : ''}">
      <div class="flex-1 flex flex-col min-w-0">
        ${!o.sprite && o.name ? `<div class="self-start -mt-1 mb-1 px-3 py-0.5 text-white text-base px-outline" style="background:${o.color ?? '#a8683a'}">${o.name}</div>` : ''}
        ${o.title ? `<div class="text-sm text-[#8a5a32]">${o.title}</div>` : ''}
        <div data-d="text" class="text-[22px] leading-relaxed whitespace-pre-wrap flex-1"></div>
        <div class="self-end text-[#a8683a] bob text-lg">▼</div>
      </div>${tag}</div>`;
    n.onclick = () => this.advance();
    root().appendChild(n);
    this.node = n;
    this.type();
  },
  /** 컷신용: 대화가 끝날 때까지 기다림 */
  say(o: { name: string; title?: string; sprite?: string; color?: string; pages: string[]; hearts?: number }): Promise<void> {
    return new Promise((res) => this.show(o, res));
  },
  type() {
    this.full = this.pages[this.page] ?? ''; this.shown = 0;
    clearInterval(this.typing);
    const t = this.node!.querySelector('[data-d=text]') as HTMLElement;
    this.typing = window.setInterval(() => {
      this.shown++; t.textContent = this.full.slice(0, this.shown);
      if (this.shown % 3 === 1 && this.full[this.shown - 1]?.trim()) sfx.play('talk');
      if (this.shown >= this.full.length) clearInterval(this.typing);
    }, 30);
  },
  /** 반환값: 대화가 끝났으면 true */
  advance(): boolean {
    if (!this.node) return true;
    if (this.shown < this.full.length) { this.shown = this.full.length; (this.node.querySelector('[data-d=text]') as HTMLElement).textContent = this.full; clearInterval(this.typing); return false; }
    sfx.play('blip');
    this.page++;
    if (this.page >= this.pages.length) { this.close(); return true; }
    this.type(); return false;
  },
  close(fire = true) {
    clearInterval(this.typing);
    this.node?.remove(); this.node = null;
    const cb = this.onClose; this.onClose = null;
    if (fire) cb?.();
  },
};

// ── 토스트 / 힌트 / 하루 전환 / 채팅 / 도움말 ─────────────
const toast = {
  node: null as HTMLDivElement | null,
  mount() { this.node = el('div', 'absolute left-4 bottom-24 flex flex-col gap-2 items-start'); this.node.dataset.ui = 'toast'; root().appendChild(this.node); },
  push(text: string, icon?: string) {
    if (!this.node) return;
    const t = el('div', 'toast-in flex items-center gap-2 px-3 py-2 bg-[#fff8ec] border-4 border-[#a8683a] shadow-[0_4px_0_rgba(0,0,0,.3)] text-base');
    t.innerHTML = `${icon ? `<span class="px-icon" style="${iconStyle(icon, 32)}"></span>` : ''}<span>${josa(text)}</span>`;
    if (icon) sfx.play(icon === 'gold' ? 'coin' : 'pickup');
    this.node.appendChild(t);
    while (this.node.children.length > 5) this.node.firstElementChild?.remove();
    setTimeout(() => { t.style.transition = 'opacity .5s, transform .5s'; t.style.opacity = '0'; t.style.transform = 'translateX(-20px)'; setTimeout(() => t.remove(), 500); }, 3800);
  },
};

const hint = {
  node: null as HTMLDivElement | null,
  mount() { this.node = el('div', 'absolute left-1/2 -translate-x-1/2 bottom-[96px] px-3 py-1 bg-[#3b2414]/85 text-[#fff8ec] text-base opacity-0 transition-opacity'); root().appendChild(this.node); },
  set(text: string | null) {
    if (!this.node) return;
    if (text) { this.node.innerHTML = text; this.node.style.opacity = '1'; } else this.node.style.opacity = '0';
  },
};

const transition = {
  async run(text: string, sub: string, mid: () => void) {
    const n = el('div', 'fixed inset-0 z-30 bg-[#0b0d18] flex flex-col items-center justify-center gap-3 text-[#fff8ec] opacity-0 transition-opacity duration-700 pointer-events-auto');
    n.innerHTML = `<div class="text-4xl px-outline text-[#ffe58a]">${text}</div><div class="text-lg opacity-90">${sub}</div>`;
    root().appendChild(n);
    await new Promise((r) => requestAnimationFrame(() => { n.style.opacity = '1'; setTimeout(r, 800); }));
    mid();
    await new Promise((r) => setTimeout(r, 1600));
    n.style.opacity = '0';
    setTimeout(() => n.remove(), 800);
  },
};

const chat = {
  node: null as HTMLDivElement | null, input: null as HTMLInputElement | null, onSend: (_t: string) => {},
  get typing() { return document.activeElement === this.input; },
  mount() {
    const n = el('div', 'absolute left-4 top-4 w-[340px] flex flex-col gap-1');
    n.dataset.ui = 'chat';
    n.innerHTML = `<div data-c="log" class="flex flex-col gap-0.5 text-sm text-white px-outline max-h-[200px] overflow-hidden"></div>
      <input data-c="in" maxlength="80" placeholder="메시지 입력 후 Enter (Esc 취소)" class="pointer-events-auto hidden w-full px-2 py-1 bg-[#fff8ec]/90 border-2 border-[#a8683a] outline-none text-sm font-[inherit]" />`;
    root().appendChild(n);
    this.node = n; this.input = n.querySelector('[data-c=in]');
    this.input!.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = this.input!.value.trim(); if (v) this.onSend(v); this.input!.value = ''; this.toggle(false); }
      if (e.key === 'Escape') this.toggle(false);
    });
  },
  toggle(on: boolean) { if (!this.input) return; this.input.classList.toggle('hidden', !on); if (on) this.input.focus(); else this.input.blur(); },
  add(name: string, text: string, color = '#ffe58a') {
    const log = this.node?.querySelector('[data-c=log]'); if (!log) return;
    const line = el('div', 'toast-in'); line.innerHTML = `<span style="color:${color}">${name}</span>: ${text.replace(/</g, '&lt;')}`;
    log.appendChild(line); while (log.children.length > 8) log.firstElementChild?.remove();
    setTimeout(() => { line.style.transition = 'opacity 1s'; line.style.opacity = '0.0'; }, 12000);
  },
};

const help = {
  node: null as HTMLDivElement | null,
  toggle() {
    if (this.node) { this.node.remove(); this.node = null; return; }
    const n = el('div', 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-panel text-lg leading-relaxed pointer-events-auto min-w-[420px]');
    n.innerHTML = `<div class="text-2xl mb-2 text-[#8a5a32]">조작법</div>
      <table class="w-full"><tbody>
      ${[['WASD / 방향키', '이동 (Shift 달리기)'], ['Space / 좌클릭', '손에 든 도구 사용 · 씨앗 · 낚시'], ['E / 우클릭', '대화 · 수확 · 출하 · 잡초 뽑기 · 조사'], ['R', '휴대폰 홈 화면 (가방에서 도구 바꾸기)'], ['M', '지도 바로 열기'], ['P', '휴대폰 › 나의 루미'], ['H', '도움말'], ['Esc', '휴대폰 뒤로 · 닫기 / 일시정지'], ['Enter', '채팅'], ['Tab', '감정표현 휠 (톡 누르고 클릭 · 누른 채 고르고 떼기)'], ['L', '접속자 목록 접기']]
        .map(([k, v]) => `<tr><td class="pr-6 text-[#a8683a]">${k}</td><td>${v}</td></tr>`).join('')}
      </tbody></table>
      <div class="mt-3 text-sm text-[#8a5a32]">모험: 마을회관 한별 박사님께 파트너 루미를 받고, 풀숲에서 야생 루미를 만나 루미볼로 잡아요. 트레이너와 눈이 마주치면 배틀! 도장 8곳을 돌아 배지를 모으면 루미나 리그로.<br>자급자족: 밭에 <b>루미풀·불꽃고추·단단콩</b>을 키우고, 채석장에서 <b>돌·구리·철</b>을 캐서 집 <b>작업대</b>에서 회복약 · 도핑약 · 루미볼을 직접 만들어요. 배지를 모을수록 민수(볼 공방)와 한별 박사(연구소)가 새 제작법을 가르쳐 줘요.<br>집: 옷장에서 외형 변경, 침대에서 잠, 식탁에 음식을 차려 친구와 같이 먹기. 농장 우편함에서 친구 초대!</div>`;
    n.onclick = () => this.toggle();
    root().appendChild(n); this.node = n;
  },
};

// ── 상점 ───────────────────────────────────────────────
const shop = {
  node: null as HTMLDivElement | null,
  /** 상점 또는 작업대 창이 열려 있으면 true (둘 다 이동·도구를 막는 창) */
  get open() { return !!this.node || craft.open; },
  show(def: ShopDef, gold: number, onBuy: (itemId: string, qty: number) => void, keeper?: { sprite: string; name: string }) {
    this.close();
    const n = el('div', 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(640px,94cqw)] pointer-events-auto toast-in');
    n.innerHTML = `<div class="px-panel">
      <div class="flex items-center gap-4 mb-3">
        ${keeper ? `<div class="portrait shrink-0" style="width:84px;height:84px;background-image:url(assets/characters/${keeper.sprite}.png);background-size:${384 * 3}px auto;background-position:-${9 * 3}px -${8 * 3}px"></div>` : ''}
        <div class="flex-1"><div class="text-2xl text-[#8a5a32]">${def.name}</div><div class="text-base">${def.greeting}</div></div>
        <div class="flex items-center gap-1 bg-[#e6cb93] px-2 py-1 border-2 border-[#a8683a]"><span class="px-icon" style="${iconStyle('gold', 24)}"></span><span data-s="gold" class="text-xl">${gold.toLocaleString()}G</span></div>
      </div>
      <div class="flex flex-col gap-2 max-h-[46cqh] overflow-y-auto pr-1">
        ${def.items.map((it) => { const d = ITEMS[it.itemId]; return `<div class="flex items-center gap-3 bg-[#fff8ec]/70 border-2 border-[#d8b67c] px-2 py-1">
          <span class="px-icon shrink-0" style="${iconStyle(d.icon, 40)}"></span>
          <div class="flex-1 min-w-0"><div class="text-lg">${d.name}</div><div class="text-xs text-[#8a5a32] truncate">${d.description}</div></div>
          <div class="text-lg tabular-nums w-16 text-right">${it.price}G</div>
          <button data-buy="${it.itemId}" data-q="1" class="px-btn text-sm !px-3 !py-1">1개</button>
          <button data-buy="${it.itemId}" data-q="5" class="px-btn green text-sm !px-3 !py-1">5개</button>
        </div>`; }).join('')}
      </div>
      <div class="mt-3 flex justify-between items-center text-sm text-[#8a5a32]"><span>영업시간 ${String(def.open).replace(/(\d+)(\d\d)$/, '$1:$2')} ~ ${String(def.close).replace(/(\d+)(\d\d)$/, '$1:$2')}</span><button data-close class="px-btn text-base !py-1">닫기 (Esc)</button></div>
    </div>`;
    n.querySelectorAll<HTMLButtonElement>('[data-buy]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); onBuy(b.dataset.buy!, Number(b.dataset.q)); }; });
    n.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => this.close();
    root().appendChild(n); this.node = n;
  },
  gold(g: number) { const e = this.node?.querySelector('[data-s=gold]'); if (e) e.textContent = `${g.toLocaleString()}G`; },
  close() { this.node?.remove(); this.node = null; craft.close(); },
};


// ── 작업대 제작 ─────────────────────────────────────────
// 작물·채집물·광석 → 루미볼 · 회복약 · 도핑약. 배우지 않은 제작법은 누구에게 배우는지 알려 줌
interface CraftArgs { title: string; sub: string; me: () => PlayerState; onCraft: (id: string, times: number) => void; keeper?: { sprite: string; name: string }; teacher?: string }
const craft = {
  node: null as HTMLDivElement | null,
  args: null as CraftArgs | null,
  get open(): boolean { return !!this.node; },
  show(a: CraftArgs) { this.close(); this.args = a; this.render(); },
  refresh() { if (this.node) this.render(); },
  render() {
    const a = this.args!; const me = a.me();
    const have = (id: string) => me.inventory.reduce((n, s) => n + (s.itemId === id ? s.quantity : 0), 0);
    const list = Object.values(RECIPES).sort((x, y) => Number(!!y.starter) - Number(!!x.starter) || (x.badges ?? 0) - (y.badges ?? 0))
      .filter((r) => !a.teacher || r.teacher === a.teacher || me.recipes.includes(r.id));
    const rows = list.map((r) => {
      const out = ITEMS[r.out]; const known = me.recipes.includes(r.id);
      const mats = Object.entries(r.in).map(([id, n]) => { const h = have(id); return `<span class="inline-flex items-center gap-0.5 ${h >= n ? '' : 'text-[#c8453c]'}"><span class="px-icon" style="${iconStyle(ITEMS[id].icon, 20)}"></span>${ITEMS[id].name} ${h}/${n}</span>`; }).join(' ');
      const can = known && Object.entries(r.in).every(([id, n]) => have(id) >= n);
      const lock = r.teacher ? `${NPCS[r.teacher]?.name ?? '공방'}에게 배우기 · 배지 ${r.badges ?? 0}개 필요` : '';
      return `<div class="flex items-center gap-3 border-2 px-2 py-1 ${known ? 'bg-[#fff8ec]/70 border-[#d8b67c]' : 'bg-[#e8dcc4]/60 border-[#c8b08a] opacity-80'}">
        <span class="px-icon shrink-0" style="${iconStyle(out.icon, 40)}${known ? '' : ';filter:grayscale(1) brightness(.7)'}"></span>
        <div class="flex-1 min-w-0"><div class="text-lg">${known ? out.name : '???'} ${r.qty > 1 ? `<span class="text-sm">×${r.qty}</span>` : ''}</div>
          <div class="text-xs text-[#5a3a22] flex flex-wrap gap-x-2">${known ? mats : `🔒 ${lock}`}</div></div>
        ${known ? `<button data-c="${r.id}" data-t="1" class="px-btn ${can ? 'green' : ''} text-sm !px-3 !py-1" ${can ? '' : 'disabled style="opacity:.5"'}>만들기</button>
        <button data-c="${r.id}" data-t="5" class="px-btn text-sm !px-3 !py-1" ${Object.entries(r.in).every(([id, n]) => have(id) >= n * 5) ? '' : 'disabled style="opacity:.5"'}>×5</button>` : ''}
      </div>`;
    }).join('');
    const n = this.node ?? el('div', 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(680px,94cqw)] pointer-events-auto toast-in');
    n.innerHTML = `<div class="px-panel">
      <div class="flex items-center gap-4 mb-3">
        ${a.keeper ? `<div class="portrait shrink-0" style="width:84px;height:84px;background-image:url(assets/characters/${a.keeper.sprite}.png);background-size:${384 * 3}px auto;background-position:-${9 * 3}px -${8 * 3}px"></div>` : `<span class="px-icon shrink-0" style="${iconStyle('craft', 64)}"></span>`}
        <div class="flex-1"><div class="text-2xl text-[#8a5a32]">${a.title}</div><div class="text-base">${a.sub}</div></div>
      </div>
      <div class="flex flex-col gap-2 max-h-[52cqh] overflow-y-auto pr-1">${rows}</div>
      <div class="mt-3 flex justify-between items-center text-sm text-[#8a5a32]"><span>재료는 농사 · 채집 · 채광으로 모아요</span><button data-close class="px-btn text-base !py-1">닫기 (Esc)</button></div>
    </div>`;
    n.querySelectorAll<HTMLButtonElement>('[data-c]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); if (b.disabled) return; a.onCraft(b.dataset.c!, Number(b.dataset.t)); }; });
    n.querySelector<HTMLButtonElement>('[data-close]')!.onclick = () => this.close();
    if (!this.node) { root().appendChild(n); this.node = n; }
  },
  close() { this.node?.remove(); this.node = null; this.args = null; },
};

// ── 접속자 목록 (멀티플레이) ────────────────────────────
const roster = {
  node: null as HTMLDivElement | null, collapsed: false,
  mount() {
    if (this.node) return;
    this.node = el('div', 'absolute right-3 top-[150px] min-w-[190px] px-3 py-2 bg-[#3b2414]/80 text-[#fff8ec] text-sm pointer-events-auto cursor-pointer');
    this.node.onclick = () => { this.collapsed = !this.collapsed; this.node!.querySelector('[data-r=list]')?.classList.toggle('hidden', this.collapsed); };
    root().appendChild(this.node);
  },
  render(players: { id: string; name: string; where: string; me?: boolean }[]) {
    if (!this.node) return;
    this.node.innerHTML = `<div class="flex justify-between gap-3"><span class="text-[#ffe58a]">접속 중 ${players.length}명</span><span class="opacity-60">L</span></div>
      <div data-r="list" class="mt-1 flex flex-col gap-0.5 ${this.collapsed ? 'hidden' : ''}">${players.map((p) =>
        `<div class="flex justify-between gap-3"><span>${p.me ? '★ ' : ''}${p.name.replace(/</g, '&lt;')}</span><span class="opacity-75">${p.where.replace(/</g, '&lt;')}</span></div>`).join('')}</div>`;
  },
  toggle() { this.node?.click(); },
};

// ── 지역 이름 배너 ─────────────────────────────────────
const banner = {
  show(title: string, sub = '') {
    const n = el('div', 'absolute left-1/2 top-[18%] -translate-x-1/2 flex flex-col items-center transition-all duration-700 opacity-0');
    n.innerHTML = `<div class="text-4xl text-[#ffe58a] px-outline tracking-widest">${title}</div>${sub ? `<div class="text-base text-[#fff8ec] px-outline mt-1">${sub}</div>` : ''}`;
    root().appendChild(n);
    requestAnimationFrame(() => { n.style.opacity = '1'; n.style.transform = 'translate(-50%, -6px)'; });
    setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 800); }, 2600);
  },
};

// ── 스타터 선택 ────────────────────────────────────────
const typeChip = (t: string) => `<span class="px-2 text-xs text-white" style="background:${TYPE_COLORS[t as keyof typeof TYPE_COLORS] ?? '#888'}">${t}</span>`;
const HELP_TEXT: Record<string, string> = { farm: '농사 도우미: 아침마다 작물에 물을 줘요', fish: '낚시 도우미: 희귀 물고기↑, 물뿌리개 에너지 0', mine: '채광 도우미: 광석 +1, 곡괭이 에너지 절약', forage: '채집 도우미: 채집물 2배', energy: '응원단: 도구 에너지 -1', exp: '배움 도우미: 경험치 +25%' };
const starter = {
  show(ids: string[], onPick: (id: string) => void, sub = '한별 박사: "셋 다 좋은 아이들이라네. 마음이 가는 아이를 데려가게!"') {
    const n = el('div', 'fixed inset-0 z-30 flex items-center justify-center bg-[#0b0d18]/60 pointer-events-auto toast-in');
    n.innerHTML = `<div class="px-panel w-[min(900px,96cqw)]">
      <div class="text-center text-2xl text-[#8a5a32] mb-1">함께할 파트너 루미를 골라 주세요</div>
      <div class="text-center text-sm mb-4">${sub}</div>
      <div class="grid grid-cols-3 gap-4">${ids.map((id) => { const sp = SPECIES[id]; return `
        <button data-id="${id}" class="group flex flex-col items-center gap-2 p-3 bg-[#fff8ec] border-4 border-[#d8b67c] hover:border-[#e0a43a] hover:-translate-y-1 transition-all">
          <span class="lumi-icon xl " style="background-image:url(assets/lumi/${id}.png)"></span>
          <span class="text-2xl">${sp.name}</span>
          <span class="flex gap-2 items-center">${typeChip(sp.type)}<span class="text-xs text-[#8a5a32]">${sp.kind}</span></span>
          <span class="text-xs leading-snug text-left min-h-[48px]">${sp.description}</span>
          <span class="grid grid-cols-4 gap-1 text-[11px] w-full text-center">${(['hp', 'atk', 'def', 'spd'] as const).map((k) => `<span class="bg-[#efe3c4] py-0.5">${{ hp: '체력', atk: '공격', def: '방어', spd: '속도' }[k]}<br><b>${sp.base[k]}</b></span>`).join('')}</span>
          <span class="text-xs text-[#2f7a3a]">${HELP_TEXT[sp.helps]}</span>
        </button>`; }).join('')}</div>
      <div class="text-center text-xs mt-3 text-[#8a5a32]">상성: 풀 ▶ 물 ▶ 불 ▶ 풀</div></div>`;
    n.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((b) => { b.onmouseenter = () => sfx.play('blip'); b.onclick = () => { n.remove(); onPick(b.dataset.id!); }; });
    root().appendChild(n);
  },
};

// ── 파티 / 도감 패널 (P) ──────────────────────────────
const party = {
  node: null as HTMLDivElement | null,
  get open() { return !!this.node; },
  toggle(p: PlayerState, onPartner: (i: number) => void) { if (this.node) this.close(); else this.show(p, onPartner); },
  show(p: PlayerState, onPartner: (i: number) => void) {
    this.close();
    const statsOf = (c: CreatureInst) => { const b = SPECIES[c.species].base, L = c.level; return { maxHp: Math.floor((b.hp * 2 * L) / 100) + L + 10 }; };
    const n = el('div', 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(760px,96cqw)] pointer-events-auto toast-in');
    n.innerHTML = `<div class="px-panel">
      <div class="flex items-center justify-between mb-2"><span class="text-2xl text-[#8a5a32]">나의 루미</span>
        <span class="text-sm">도감: 본 루미 ${p.seen.length} · 잡은 루미 ${p.caught.length} / ${Object.keys(SPECIES).length}</span></div>
      ${p.party.length ? '' : '<div class="text-center py-6">아직 파트너가 없어요. 별빛 마을 <b>마을회관</b>의 한별 박사님을 찾아가 보세요!</div>'}
      <div class="grid grid-cols-2 gap-2">${p.party.map((c, i) => { const sp = SPECIES[c.species], max = statsOf(c).maxHp, r = c.hp / max; return `
        <div class="flex items-center gap-2 p-2 bg-[#fff8ec] border-2 ${i === 0 ? 'border-[#e0a43a]' : 'border-[#d8b67c]'}">
          <span class="lumi-icon lg" style="background-image:url(assets/lumi/${c.species}.png);width:64px;height:64px;background-size:384px 64px"></span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2"><span class="text-lg">${i === 0 ? '★ ' : ''}${sp.name}</span>${typeChip(sp.type)}<span class="ml-auto">Lv.${c.level}</span></div>
            <div class="h-2.5 bg-[#3b2414] mt-1"><div class="h-full" style="width:${r * 100}%;background:${r > 0.5 ? '#5fc04a' : r > 0.2 ? '#f0c84a' : '#e0473b'}"></div></div>
            <div class="flex justify-between text-xs mt-0.5"><span>${c.hp}/${max}</span><span class="text-[#8a5a32]">${HELP_TEXT[sp.helps].split(':')[0]}</span></div>
            ${i > 0 ? `<button data-partner="${i}" class="px-btn text-xs !px-2 !py-0.5 mt-1">파트너로 함께 걷기</button>` : '<div class="text-xs text-[#2f7a3a] mt-1">함께 걷는 중 · ' + HELP_TEXT[sp.helps].split(': ')[1] + '</div>'}
          </div></div>`; }).join('')}</div>
      <div class="flex flex-wrap gap-3 items-center mt-3 text-sm">
        <span>가방:</span>${Object.entries(p.bag).filter(([, q]) => q > 0).map(([id, q]) => `<span class="flex items-center gap-1"><span class="px-icon" style="${iconStyle(ITEMS[id].icon, 24)}"></span>${ITEMS[id].name} ×${q}</span>`).join('') || '<span class="opacity-60">비어 있음</span>'}
        <span class="ml-auto">배지:</span>${p.badges.map((b) => `<span class="px-icon" title="${ITEMS[b].name}" style="${iconStyle(ITEMS[b].icon, 28)}"></span>`).join('') || '<span class="opacity-60">없음</span>'}
      </div>
      <div class="text-right text-xs mt-2 text-[#8a5a32]">P 또는 Esc 로 닫기 · 보관함 ${p.box.length}마리</div></div>`;
    n.querySelectorAll<HTMLButtonElement>('[data-partner]').forEach((b) => { b.onclick = () => { onPartner(Number(b.dataset.partner)); this.close(); }; });
    root().appendChild(n); this.node = n;
  },
  close() { this.node?.remove(); this.node = null; },
};

// ── 낚시 찌 표시 ──────────────────────────────────────
const fishing = {
  node: null as HTMLDivElement | null,
  show(text: string) { if (!this.node) { this.node = el('div', 'absolute left-1/2 top-[30%] -translate-x-1/2 text-5xl px-outline text-[#ffe58a] transition-transform'); root().appendChild(this.node); } this.node.textContent = text; this.node.style.transform = 'translate(-50%,0) scale(1.2)'; setTimeout(() => { if (this.node) this.node.style.transform = 'translate(-50%,0) scale(1)'; }, 120); },
  hide() { this.node?.remove(); this.node = null; },
};

// ── 일시정지 메뉴 (Esc) ────────────────────────────────
const menu = {
  node: null as HTMLDivElement | null,
  get open() { return !!this.node; },
  show(o: { storage: string; canSave: boolean; onSave: () => void; onReset: () => void; onTitle: () => void }) {
    this.close();
    sfx.play('menu');
    const n = el('div', 'fixed inset-0 z-40 flex items-center justify-center bg-[#0b0d18]/55 pointer-events-auto toast-in');
    const render = (confirm = false) => {
      n.innerHTML = `<div class="px-panel w-[min(380px,92cqw)] flex flex-col gap-3 items-stretch">
        <div class="text-center text-2xl text-[#8a5a32]">일시정지</div>
        <div class="text-center text-xs text-[#8a5a32]">저장: ${o.storage}</div>
        ${confirm ? `<div class="text-center text-base">정말 처음부터 다시 시작할까요?<br><span class="text-sm text-[#c8453c]">캐릭터 · 가방 · 루미 · 농장이 모두 지워져요.</span></div>
          <button data-a="yes" class="px-btn text-lg" style="background:linear-gradient(#e8705a,#c8453c)">네, 초기화할게요</button>
          <button data-a="no" class="px-btn green text-lg">아니요</button>` : `
          <button data-a="resume" class="px-btn green text-lg">계속하기</button>
          ${o.canSave ? '<button data-a="save" class="px-btn text-lg">지금 저장하기</button>' : ''}
          <button data-a="sound" class="px-btn text-lg">효과음: ${sfx.muted ? '끔 🔇' : '켬 🔊'}</button>
          <button data-a="music" class="px-btn text-lg">배경음악: ${music.on ? '켬 🎵' : '끔 🔇'}</button>
          <button data-a="reset" class="px-btn text-lg" style="background:linear-gradient(#e8705a,#c8453c)">저장 초기화</button>
          <button data-a="title" class="px-btn text-base !py-1.5">타이틀로</button>`}
      </div>`;
      const on = (k: string, f: () => void) => { const b = n.querySelector<HTMLButtonElement>(`[data-a=${k}]`); if (b) b.onclick = () => { sfx.play('blip'); f(); }; };
      on('resume', () => this.close()); on('save', () => { o.onSave(); this.close(); });
      on('sound', () => { sfx.setMuted(!sfx.muted); render(); }); on('music', () => { music.setOn(!music.on); render(); }); on('reset', () => render(true));
      on('no', () => render()); on('yes', () => { this.close(); o.onReset(); }); on('title', () => { this.close(); o.onTitle(); });
    };
    render();
    root().appendChild(n); this.node = n;
  },
  close() { this.node?.remove(); this.node = null; },
};

// ── 오카리나 연출 (안개 · 별 · 하얀 빛) ─────────────────
const mythFx = () => {
  const n = el('div', 'fixed inset-0 z-50 pointer-events-none myth-fx');
  n.innerHTML = '<div class="myth-sky"></div><div class="myth-fog a"></div><div class="myth-fog b"></div><div class="myth-stars"></div><div class="myth-flash"></div>';
  root().appendChild(n);
  requestAnimationFrame(() => n.classList.add('on'));
  return {
    fog: () => n.classList.add('fog'),
    flash: () => n.classList.add('flash'),
    done: () => { n.classList.add('out'); setTimeout(() => n.remove(), 900); },
  };
};

// ── 정기선 (항구 ↔ 섬) ────────────────────────────────
const ferry = (dest: string) => new Promise<void>((resolve) => {
  const n = el('div', 'fixed inset-0 z-50 pointer-events-auto ferry-fx');
  n.innerHTML = `<div class="ferry-sea"></div><div class="ferry-boat">⛴️</div><div class="ferry-text">⛵ 정기선 출항!<span>${dest}(으)로 가는 중…</span></div>`;
  root().appendChild(n);
  sfx.play('horn'); setTimeout(() => sfx.play('waves'), 600);
  setTimeout(() => { n.classList.add('out'); setTimeout(() => { n.remove(); }, 500); resolve(); }, 2600);
});

let mounted = false;
export const ui = {
  confirm: confirmBox,
  creator, emoteWheel, mailbox, invitePrompt, menu, mythFx, ferry,
  loading, title, hud, hotbar, dialogue, toast, hint, transition, chat, help, shop, craft, roster, banner, starter, party, fishing,
  mountGame() { if (mounted) return; mounted = true; hud.mount(); hotbar.mount(); toast.mount(); hint.mount(); chat.mount(); },
};
