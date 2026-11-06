// 소셜 UI: 캐릭터 만들기(남/여 4종) · Tab 감정표현 휠 · 우편함 초대 · 받은 초대 알림
import { uiScale } from './Scale';
import { EMOTES, PLAYER_LOOKS } from '@shared/types';

const root = () => document.getElementById('ui')!;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 캐릭터 시트 첫 프레임(정면) 초상: 시트 가로 384px (48px × 8칸) */
export const lookPortrait = (look: string, scale = 3, w = 30, h = 40) =>
  `width:${w * scale}px;height:${h * scale}px;background-image:url(assets/characters/${look}.png);background-size:${384 * scale}px auto;background-position:-${9 * scale}px -${2 * scale}px;background-repeat:no-repeat;image-rendering:pixelated`;
/** 감정표현 아이콘 (emotes.png 16px × 8칸) */
export const emoteIcon = (id: number, size = 48) =>
  `display:inline-block;width:${size}px;height:${size}px;background-image:url(assets/fx/emotes.png);background-size:${size * 8}px ${size}px;background-position:-${id * size}px 0;image-rendering:pixelated`;

// ── 캐릭터 만들기 ─────────────────────────────────────
const LOOK_NAMES: Record<string, string> = { m1: '갈색 머리 · 멜빵', m2: '삐죽머리 · 모자', m3: '금발 · 안경', m4: '털모자 · 셔츠', f1: '긴 머리 · 원피스', f2: '포니테일 · 멜빵', f3: '단발 · 안경', f4: '올림머리 · 밀짚모자' };
export const creator = {
  node: null as HTMLDivElement | null,
  get open() { return !!this.node; },
  show(o: { title: string; sub: string; name: string; look?: string; askName: boolean; onDone: (look: string, name: string) => void; onCancel?: () => void }) {
    this.close();
    let gender: 'male' | 'female' = o.look?.startsWith('f') ? 'female' : 'male';
    let look = o.look && /^[mf][1-4]$/.test(o.look) ? o.look : gender === 'male' ? 'm1' : 'f1';
    const n = el('div', 'fixed inset-0 z-40 flex items-center justify-center bg-[#0b0d18]/70 pointer-events-auto toast-in');
    n.innerHTML = `<div class="px-panel w-[min(760px,96cqw)]">
      <div class="text-center text-2xl text-[#8a5a32]">${o.title}</div>
      <div class="text-center text-sm mb-3">${o.sub}</div>
      ${o.askName ? `<div class="flex items-center justify-center gap-2 mb-3"><span>이름</span><input data-c="name" maxlength="10" value="${esc(o.name)}" class="w-48 px-3 py-1.5 bg-[#fff8ec] border-2 border-[#a8683a] outline-none font-[inherit] text-lg text-center" /></div>` : ''}
      <div class="flex justify-center gap-2 mb-3">
        <button data-g="male" class="px-btn text-base !py-1.5">👦 남자</button>
        <button data-g="female" class="px-btn text-base !py-1.5">👧 여자</button>
      </div>
      <div data-c="grid" class="grid grid-cols-4 gap-3"></div>
      <div class="flex justify-center gap-3 mt-4">
        ${o.onCancel ? '<button data-c="cancel" class="px-btn text-lg">취소</button>' : ''}
        <button data-c="ok" class="px-btn green text-xl">이 모습으로 시작!</button>
      </div></div>`;
    const grid = n.querySelector<HTMLDivElement>('[data-c=grid]')!;
    const render = () => {
      n.querySelectorAll<HTMLButtonElement>('[data-g]').forEach((b) => { b.classList.toggle('green', b.dataset.g === gender); });
      grid.innerHTML = PLAYER_LOOKS[gender].map((id) => `
        <button data-look="${id}" class="flex flex-col items-center gap-1 p-2 bg-[#fff8ec] border-4 ${id === look ? 'border-[#e0a43a] -translate-y-1' : 'border-[#d8b67c]'} hover:border-[#e0a43a] transition-all">
          <span class="${id === look ? 'lumi-bounce' : ''}" style="${lookPortrait(id)}"></span>
          <span class="text-xs text-[#8a5a32]">${LOOK_NAMES[id]}</span>
        </button>`).join('');
      grid.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((b) => { b.onclick = () => { look = b.dataset.look!; render(); }; });
    };
    n.querySelectorAll<HTMLButtonElement>('[data-g]').forEach((b) => { b.onclick = () => { gender = b.dataset.g as 'male' | 'female'; look = PLAYER_LOOKS[gender][0]; render(); }; });
    n.querySelector<HTMLButtonElement>('[data-c=ok]')!.onclick = () => {
      const name = o.askName ? (n.querySelector<HTMLInputElement>('[data-c=name]')!.value.trim() || o.name) : o.name;
      this.close(); o.onDone(look, name);
    };
    const cancel = n.querySelector<HTMLButtonElement>('[data-c=cancel]');
    if (cancel) cancel.onclick = () => { this.close(); o.onCancel?.(); };
    n.querySelector('input')?.addEventListener('keydown', (e) => e.stopPropagation());
    render();
    root().appendChild(n); this.node = n;
  },
  close() { this.node?.remove(); this.node = null; },
};

// ── Tab 감정표현 휠 ───────────────────────────────────
export const emoteWheel = {
  node: null as HTMLDivElement | null, cx: 0, cy: 0, sel: -1,
  get open() { return !!this.node; },
  show(cx: number, cy: number, onPick: (emote: number) => void) {
    this.close();
    this.cx = cx; this.cy = cy; this.sel = -1;
    const R = 104;
    const n = el('div', 'fixed z-40 pointer-events-auto');
    n.style.left = `${cx / uiScale()}px`; n.style.top = `${cy / uiScale()}px`;   // #ui 가 축소돼 있으면 그 좌표로
    const items = EMOTES.map((e, i) => {
      const a = -Math.PI / 2 + (i / EMOTES.length) * Math.PI * 2;
      return `<button data-i="${i}" class="absolute flex flex-col items-center -translate-x-1/2 -translate-y-1/2 transition-transform" style="left:${Math.cos(a) * R}px;top:${Math.sin(a) * R}px">
        <span data-b class="flex items-center justify-center w-[68px] h-[68px] rounded-full bg-[#fff8ec] border-4 border-[#a8683a] shadow-[0_4px_0_rgba(0,0,0,.35)]"><span style="${emoteIcon(e.id, 48)}"></span></span>
        <span class="text-xs text-white px-outline mt-0.5">${e.name}</span></button>`;
    }).join('');
    n.innerHTML = `<div class="absolute -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#3b2414]/45 border-4 border-[#fff8ec]/30"></div>
      <div data-c="center" class="absolute -translate-x-1/2 -translate-y-1/2 w-[86px] h-[86px] rounded-full bg-[#3b2414]/85 border-4 border-[#e0a43a] flex items-center justify-center text-center text-sm text-[#fff8ec] leading-tight">감정<br>표현</div>${items}`;
    n.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => {
      b.onmouseenter = () => this.highlight(Number(b.dataset.i));
      b.onclick = () => { const id = EMOTES[Number(b.dataset.i)].id; this.close(); onPick(id); };
    });
    // 바깥 클릭 · 창 포커스 잃음 → 닫기 (휠이 화면에 남아 고정되는 문제 방지)
    n.querySelector<HTMLDivElement>('div')!.onclick = (ev) => { if (ev.target === ev.currentTarget) this.close(); };
    this.onBlur = () => this.close(); window.addEventListener('blur', this.onBlur);
    root().appendChild(n); this.node = n;
  },
  onBlur: null as null | (() => void),
  /** 마우스 위치 → 방향으로 칸 선택 */
  move(mx: number, my: number) {
    if (!this.node) return;
    const dx = mx - this.cx, dy = my - this.cy;
    if (Math.hypot(dx, dy) < 34) { this.highlight(-1); return; }
    let a = Math.atan2(dy, dx) + Math.PI / 2; if (a < 0) a += Math.PI * 2;
    this.highlight(Math.round(a / ((Math.PI * 2) / EMOTES.length)) % EMOTES.length);
  },
  highlight(i: number) {
    if (!this.node || this.sel === i) return;
    this.sel = i;
    this.node.querySelectorAll<HTMLButtonElement>('[data-i]').forEach((b) => {
      const on = Number(b.dataset.i) === i;
      b.style.transform = `translate(-50%,-50%) scale(${on ? 1.22 : 1})`;
      b.querySelector<HTMLElement>('[data-b]')!.style.borderColor = on ? '#e0a43a' : '#a8683a';
    });
    const c = this.node.querySelector<HTMLDivElement>('[data-c=center]')!;
    c.innerHTML = i >= 0 ? `<span style="${emoteIcon(EMOTES[i].id, 40)}"></span>` : '감정<br>표현';
  },
  /** Tab 을 떼면 선택된 감정 반환 */
  release(): number | null { const i = this.sel; this.close(); return i >= 0 ? EMOTES[i].id : null; },
  close() { this.node?.remove(); this.node = null; this.sel = -1; if (this.onBlur) { window.removeEventListener('blur', this.onBlur); this.onBlur = null; } },
};

// ── 우편함: 편지 + 친구 초대 ──────────────────────────
export interface MailPlayer { id: string; name: string; where: string; look: string }
export const mailbox = {
  node: null as HTMLDivElement | null,
  get open() { return !!this.node; },
  show(o: { online: boolean; isOwner: boolean; players: MailPlayer[]; invites: { from: string; name: string; where: 'farm' | 'home' }[];
    onLetter: () => void; onInvite: (id: string, where: 'farm' | 'home') => void; onAccept: (from: string) => void; onGoHome?: () => void }) {
    this.close();
    const n = el('div', 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(640px,94cqw)] pointer-events-auto toast-in');
    const inv = o.invites.map((i) => `<div class="flex items-center gap-2 bg-[#fff0d0] border-2 border-[#e0a43a] px-2 py-1"><span class="flex-1">💌 <b>${esc(i.name)}</b>님의 ${i.where === 'farm' ? '농장' : '집'} 초대장</span><button data-acc="${i.from}" class="px-btn green text-sm !px-3 !py-1">놀러 가기</button></div>`).join('');
    const list = !o.online ? '<div class="text-center py-4 text-[#8a5a32]">혼자 연습하기 중에는 친구를 초대할 수 없어요.<br>타이틀에서 <b>구글 로그인</b>으로 접속하면 함께 놀 수 있어요!</div>'
      : !o.isOwner ? '<div class="text-center py-3 text-[#8a5a32]">친구의 우편함이에요. 초대는 내 농장 우편함에서 보낼 수 있어요.<br><button data-c="home" class="px-btn green text-base !py-1 mt-2">🏡 내 농장으로 돌아가기</button></div>'
      : o.players.length === 0 ? '<div class="text-center py-4 text-[#8a5a32]">지금 접속한 친구가 없어요.</div>'
      : o.players.map((p) => `<div class="flex items-center gap-2 bg-[#fff8ec]/80 border-2 border-[#d8b67c] px-2 py-1">
          <span class="shrink-0 overflow-hidden" style="${lookPortrait(p.look || 'player', 1.2)}"></span>
          <div class="flex-1 min-w-0"><div class="text-lg">${esc(p.name)}</div><div class="text-xs text-[#8a5a32]">${esc(p.where)}</div></div>
          <button data-inv="${p.id}" data-w="farm" class="px-btn text-sm !px-3 !py-1">🌱 농장 초대</button>
          <button data-inv="${p.id}" data-w="home" class="px-btn green text-sm !px-3 !py-1">🏠 집 초대</button></div>`).join('');
    n.innerHTML = `<div class="px-panel">
      <div class="flex items-center justify-between mb-2"><span class="text-2xl text-[#8a5a32]">📮 우편함</span><button data-c="letter" class="px-btn text-sm !py-1">이장님의 편지 읽기</button></div>
      ${inv ? `<div class="flex flex-col gap-1.5 mb-3">${inv}</div>` : ''}
      <div class="text-base mb-1">친구에게 초대장 보내기</div>
      <div class="flex flex-col gap-1.5 max-h-[40cqh] overflow-y-auto">${list}</div>
      <div class="text-right mt-3"><button data-c="close" class="px-btn text-base !py-1">닫기 (Esc)</button></div></div>`;
    n.querySelectorAll<HTMLButtonElement>('[data-inv]').forEach((b) => { b.onclick = () => { o.onInvite(b.dataset.inv!, b.dataset.w as 'farm' | 'home'); b.disabled = true; b.textContent = '보냄 ✓'; }; });
    n.querySelectorAll<HTMLButtonElement>('[data-acc]').forEach((b) => { b.onclick = () => { this.close(); o.onAccept(b.dataset.acc!); }; });
    n.querySelector<HTMLButtonElement>('[data-c=letter]')!.onclick = () => { this.close(); o.onLetter(); };
    n.querySelector<HTMLButtonElement>('[data-c=close]')!.onclick = () => this.close();
    const home = n.querySelector<HTMLButtonElement>('[data-c=home]'); if (home) home.onclick = () => { this.close(); o.onGoHome?.(); };
    root().appendChild(n); this.node = n;
  },
  close() { this.node?.remove(); this.node = null; },
};

/** 받은 초대 알림 카드 (오른쪽 위) */
export const invitePrompt = {
  show(name: string, where: 'farm' | 'home', onAccept: () => void) {
    const n = el('div', 'fixed right-4 top-[96px] z-30 w-[300px] px-panel !p-0 pointer-events-auto toast-in');
    n.innerHTML = `<div class="text-base">💌 <b>${esc(name)}</b>님이 ${where === 'farm' ? '농장에 같이 농사 지으러' : '집에 밥 먹으러'} 오래요!</div>
      <div class="flex gap-2 mt-2 justify-end"><button data-c="no" class="px-btn text-sm !px-3 !py-1">나중에</button><button data-c="yes" class="px-btn green text-sm !px-3 !py-1">놀러 가기</button></div>
      <div class="text-[11px] text-[#8a5a32] mt-1">나중에 내 우편함에서도 받을 수 있어요</div>`;
    const close = () => n.remove();
    n.querySelector<HTMLButtonElement>('[data-c=yes]')!.onclick = () => { close(); onAccept(); };
    n.querySelector<HTMLButtonElement>('[data-c=no]')!.onclick = close;
    root().appendChild(n);
    setTimeout(close, 25000);
  },
};
