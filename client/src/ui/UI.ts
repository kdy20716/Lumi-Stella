// DOM 오버레이 UI: 로딩 / 타이틀 / HUD(시계·골드·에너지) / 핫바 / 대화창 / 토스트 / 힌트 / 하루 전환 / 채팅
import { ITEMS } from '@shared/data';
import type { InventorySlot, WorldTime } from '@shared/types';

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
    this.node.innerHTML = `<div class="text-4xl px-outline text-[#ffe58a] tracking-widest">별빛 농장</div>
      <div class="w-72 h-5 border-4 border-[#5e3620] bg-[#3b2414]"><div class="h-full bg-[#7cc45a] w-0 transition-all"></div></div>
      <div class="text-sm opacity-70">픽셀을 심는 중...</div>`;
    this.bar = this.node.querySelector('div > div > div');
    document.body.appendChild(this.node);
  },
  progress(v: number) { if (this.bar) this.bar.style.width = `${Math.round(v * 100)}%`; },
  done() { const n = this.node; if (!n) return; n.style.opacity = '0'; setTimeout(() => n.remove(), 500); this.node = null; },
};

// ── 타이틀 ──────────────────────────────────────────────
const title = {
  show(onSolo: () => void, onMulti: (url: string, name: string) => void) {
    const n = el('div', 'fixed inset-0 z-40 flex flex-col items-center justify-center pointer-events-auto vignette');
    const savedName = (() => { try { return localStorage.getItem('sf:name') ?? ''; } catch { return ''; } })();
    n.innerHTML = `
      <div class="title-float flex flex-col items-center mb-10">
        <div class="text-[64px] leading-none text-[#ffe58a] px-outline tracking-[0.15em]" style="text-shadow:-4px 0 #3b2414,4px 0 #3b2414,0 -4px #3b2414,0 4px #3b2414,4px 4px #3b2414,6px 8px 0 rgba(0,0,0,.35)">별빛 농장</div>
        <div class="mt-3 text-xl text-[#fff8ec] px-outline tracking-[0.4em]">STARLIGHT FARM</div>
      </div>
      <div class="px-panel flex flex-col items-center gap-4 min-w-[340px]">
        <button data-a="solo" class="px-btn green text-xl w-full">혼자 시작하기</button>
        <div class="w-full flex flex-col gap-2 text-sm">
          <input data-i="name" maxlength="10" placeholder="닉네임" value="${savedName}" class="w-full px-3 py-2 bg-[#fff8ec] border-2 border-[#a8683a] outline-none font-[inherit]" />
          <input data-i="url" placeholder="ws://localhost:2567" value="ws://${location.hostname || 'localhost'}:2567" class="w-full px-3 py-2 bg-[#fff8ec] border-2 border-[#a8683a] outline-none font-[inherit]" />
          <button data-a="multi" class="px-btn text-lg w-full">멀티플레이 접속</button>
          <div data-e class="text-[#c8453c] text-xs min-h-4"></div>
        </div>
      </div>
      <div class="absolute bottom-4 text-xs text-[#fff8ec] opacity-80 px-outline">WASD 이동 · Shift 달리기 · Space/클릭 도구 · E/우클릭 상호작용 · 1~0 슬롯 · H 도움말</div>`;
    root().appendChild(n);
    const close = () => { n.style.transition = 'opacity .4s'; n.style.opacity = '0'; setTimeout(() => n.remove(), 400); };
    n.querySelector<HTMLButtonElement>('[data-a=solo]')!.onclick = () => { close(); onSolo(); };
    n.querySelector<HTMLButtonElement>('[data-a=multi]')!.onclick = () => {
      const name = n.querySelector<HTMLInputElement>('[data-i=name]')!.value.trim() || '농부';
      try { localStorage.setItem('sf:name', name); } catch { /* 무시 */ }
      const url = n.querySelector<HTMLInputElement>('[data-i=url]')!.value.trim();
      (n.querySelector('[data-e]') as HTMLElement).textContent = '접속 중...';
      onMulti(url, name);
    };
    return { close, error: (m: string) => { (n.querySelector('[data-e]') as HTMLElement).textContent = m; } };
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
    const e = el('div', 'absolute right-4 bottom-4 flex flex-col items-center gap-1');
    e.innerHTML = `<div class="relative w-[30px] h-[170px] border-4 border-[#5e3620] bg-[#3b2414] shadow-[0_4px_0_rgba(0,0,0,.35)]">
      <div data-h="energy" class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#4f9a45] to-[#9bd165] transition-all duration-300"></div></div>
      <div class="px-icon" style="${iconStyle('energy', 32)}"></div>`;
    root().appendChild(e);
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

// ── 핫바 ───────────────────────────────────────────────
const hotbar = {
  node: null as HTMLDivElement | null, label: null as HTMLDivElement | null, selected: 0, labelTimer: 0,
  onSelect: (_i: number) => {},
  mount() {
    const wrap = el('div', 'absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2');
    this.label = el('div', 'px-3 py-1 bg-[#3b2414]/85 text-[#fff8ec] text-sm opacity-0 transition-opacity');
    const bar = el('div', 'px-panel flex gap-1 pointer-events-auto');
    wrap.append(this.label, bar);
    root().appendChild(wrap);
    this.node = bar;
  },
  render(slots: InventorySlot[], selected?: number) {
    if (!this.node) return;
    this.selected = selected ?? this.selected;
    selected = this.selected;
    this.node.innerHTML = '';
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];
    slots.forEach((s, i) => {
      const it = s.itemId ? ITEMS[s.itemId] : null;
      const d = el('div', `px-slot flex items-center justify-center cursor-pointer ${i === selected ? 'active' : ''}`);
      d.title = it ? `${it.name}\n${it.description}` : '';
      d.innerHTML = `<span class="absolute top-0.5 left-1 text-[10px] text-[#6e4024] opacity-70">${keys[i]}</span>` +
        (it ? `<span class="px-icon" style="${iconStyle(it.icon, 42)}"></span>${s.quantity > 1 || it.type !== 'tool' ? `<span class="absolute bottom-0 right-1 text-sm text-white px-outline">${s.quantity}</span>` : ''}` : '');
      d.onclick = () => this.onSelect(i);
      this.node!.appendChild(d);
    });
    const cur = slots[selected]?.itemId; const it = cur ? ITEMS[cur] : null;
    if (this.label) { this.label.textContent = it ? it.name : ''; this.label.style.opacity = it ? '1' : '0'; clearTimeout(this.labelTimer); this.labelTimer = window.setTimeout(() => { if (this.label) this.label.style.opacity = '0'; }, 1500); }
  },
};

// ── 대화창 ─────────────────────────────────────────────
const dialogue = {
  node: null as HTMLDivElement | null, pages: [] as string[], page: 0, typing: 0, full: '', shown: 0, onClose: null as (() => void) | null,
  get open() { return !!this.node; },
  show(o: { name: string; title?: string; sprite?: string; color?: string; pages: string[]; hearts?: number }, onClose?: () => void) {
    this.close(false);
    this.pages = o.pages; this.page = 0; this.onClose = onClose ?? null;
    const n = el('div', 'absolute left-1/2 -translate-x-1/2 bottom-[110px] w-[min(860px,94vw)] pointer-events-auto toast-in');
    const portrait = o.sprite ? `<div class="flex flex-col items-center gap-1 shrink-0">
        <div class="portrait" style="background-image:url(assets/characters/${o.sprite}.png);background-size:${384 * 4}px auto;background-position:-${9 * 4}px -${7 * 4}px"></div>
        <div class="px-2 py-0.5 text-white text-base px-outline" style="background:${o.color ?? '#a8683a'}">${o.name}</div>
        ${o.hearts !== undefined ? `<div class="flex gap-0.5">${Array.from({ length: 5 }, (_, i) => `<span class="px-icon" style="${iconStyle('heart', 16)};${i < o.hearts! ? '' : 'filter:grayscale(1) opacity(.45)'}"></span>`).join('')}</div>` : ''}
      </div>` : '';
    n.innerHTML = `<div class="px-panel flex gap-5 items-start min-h-[170px]">${portrait}
      <div class="flex-1 flex flex-col">
        ${o.title ? `<div class="text-sm text-[#8a5a32]">${o.title}</div>` : ''}
        <div data-d="text" class="text-xl leading-relaxed whitespace-pre-wrap min-h-[96px]"></div>
        <div class="self-end text-[#a8683a] bob text-lg">▼</div>
      </div></div>`;
    n.onclick = () => this.advance();
    root().appendChild(n);
    this.node = n;
    this.type();
  },
  type() {
    this.full = this.pages[this.page] ?? ''; this.shown = 0;
    clearInterval(this.typing);
    const t = this.node!.querySelector('[data-d=text]') as HTMLElement;
    this.typing = window.setInterval(() => {
      this.shown++; t.textContent = this.full.slice(0, this.shown);
      if (this.shown >= this.full.length) clearInterval(this.typing);
    }, 28);
  },
  /** 반환값: 대화가 끝났으면 true */
  advance(): boolean {
    if (!this.node) return true;
    if (this.shown < this.full.length) { this.shown = this.full.length; (this.node.querySelector('[data-d=text]') as HTMLElement).textContent = this.full; clearInterval(this.typing); return false; }
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
  mount() { this.node = el('div', 'absolute left-4 bottom-24 flex flex-col gap-2 items-start'); root().appendChild(this.node); },
  push(text: string, icon?: string) {
    if (!this.node) return;
    const t = el('div', 'toast-in flex items-center gap-2 px-3 py-2 bg-[#fff8ec] border-4 border-[#a8683a] shadow-[0_4px_0_rgba(0,0,0,.3)] text-base');
    t.innerHTML = `${icon ? `<span class="px-icon" style="${iconStyle(icon, 32)}"></span>` : ''}<span>${text}</span>`;
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
    n.innerHTML = `<div data-c="log" class="flex flex-col gap-0.5 text-sm text-white px-outline max-h-[200px] overflow-hidden"></div>
      <input data-c="in" maxlength="80" placeholder="Enter로 채팅" class="pointer-events-auto hidden w-full px-2 py-1 bg-[#fff8ec]/90 border-2 border-[#a8683a] outline-none text-sm font-[inherit]" />`;
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
      ${[['WASD / 방향키', '이동'], ['Shift', '달리기'], ['Space / 좌클릭', '도구 사용 · 씨앗 심기'], ['E / 우클릭', '대화 · 수확 · 출하 · 조사'], ['1~0, -, = / 휠', '핫바 선택'], ['Enter', '채팅 (멀티플레이)'], ['N', '(디버그) 다음 날로'], ['H', '도움말 닫기']]
        .map(([k, v]) => `<tr><td class="pr-6 text-[#a8683a]">${k}</td><td>${v}</td></tr>`).join('')}
      </tbody></table>
      <div class="mt-3 text-sm text-[#8a5a32]">팁: 괭이로 밭을 갈고 → 씨앗 심고 → 매일 물을 주면 자랍니다. 다 자란 작물은 E로 수확, 출하 상자에 넣으면 다음 날 골드!</div>`;
    n.onclick = () => this.toggle();
    root().appendChild(n); this.node = n;
  },
};

export const ui = { loading, title, hud, hotbar, dialogue, toast, hint, transition, chat, help, mountGame() { hud.mount(); hotbar.mount(); toast.mount(); hint.mount(); chat.mount(); } };
