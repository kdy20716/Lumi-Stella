// 배틀 DOM 오버레이: 체력 상자, 메시지 창, 명령 메뉴 (싸우기/가방/루미/도망)
import { ITEMS, TYPE_COLORS } from '@shared/data';
import type { BattleView, CreatureView } from '@shared/types';
import { iconStyle } from './UI';
import { josa } from '@shared/josa';
import { sfx } from '../audio/Sfx';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };
const typeChip = (t: string) => `<span class="px-1.5 text-[11px] text-white rounded-sm" style="background:${TYPE_COLORS[t as keyof typeof TYPE_COLORS] ?? '#888'}">${t}</span>`;
const hpColor = (r: number) => (r > 0.5 ? '#5fc04a' : r > 0.2 ? '#f0c84a' : '#e0473b');

export interface BattleMenuHandlers { move: (i: number) => void; item: (id: string) => void; swap: (i: number) => void; run: () => void }

export class BattleUI {
  private root: HTMLDivElement;
  private foeBox: HTMLDivElement;
  private meBox: HTMLDivElement;
  private msg: HTMLDivElement;
  private menu: HTMLDivElement;
  private skip: (() => void) | null = null;
  view?: BattleView;

  constructor() {
    this.root = el('div', 'fixed inset-0 z-20 pointer-events-none');
    this.foeBox = el('div', 'absolute left-[4vw] top-[6vh] w-[min(360px,44vw)] px-panel !p-0 transition-opacity');
    this.meBox = el('div', 'absolute right-[4vw] bottom-[calc(150px+4vh)] w-[min(380px,46vw)] px-panel !p-0 transition-opacity');
    const bottom = el('div', 'absolute left-0 right-0 bottom-0 h-[150px] flex gap-2 p-2 pointer-events-auto');
    this.msg = el('div', 'px-panel flex-1 text-xl leading-relaxed whitespace-pre-wrap cursor-pointer');
    this.menu = el('div', 'px-panel w-[min(440px,48vw)] grid grid-cols-2 gap-2 content-center');
    bottom.append(this.msg, this.menu);
    this.root.append(this.foeBox, this.meBox, bottom);
    document.getElementById('ui')!.appendChild(this.root);
    this.msg.onclick = () => this.skip?.();
    this.menu.style.visibility = 'hidden';
  }

  private box(c: CreatureView, mine: boolean) {
    const r = c.hp / c.maxHp;
    return `<div class="flex items-center justify-between gap-2"><span class="text-xl">${c.name}</span>${typeChip(c.type)}<span class="ml-auto text-lg">Lv.${c.level}</span></div>
      <div class="flex items-center gap-2 mt-1"><span class="text-xs font-bold text-[#e0a43a]">HP</span>
        <div class="flex-1 h-3 bg-[#3b2414] border-2 border-[#3b2414] rounded-sm overflow-hidden"><div data-hp class="h-full transition-all duration-500" style="width:${r * 100}%;background:${hpColor(r)}"></div></div></div>
      ${mine ? `<div class="text-right text-base tabular-nums" data-hptext>${c.hp} / ${c.maxHp}</div>
        <div class="h-1.5 bg-[#3b2414]/40 mt-1"><div data-exp class="h-full bg-[#5aa8e0] transition-all duration-700" style="width:${(c.exp / c.expNext) * 100}%"></div></div>` : ''}`;
  }
  setView(v: BattleView) { this.view = v; this.setSide('foe', v.foe); this.setSide('me', v.me); }
  setSide(side: 'me' | 'foe', c: CreatureView) {
    const b = side === 'me' ? this.meBox : this.foeBox;
    b.innerHTML = this.box(c, side === 'me');
    b.style.opacity = '1';
    if (this.view) this.view[side] = c;
  }
  hp(side: 'me' | 'foe', hp: number, maxHp: number) {
    const b = side === 'me' ? this.meBox : this.foeBox, r = Math.max(0, hp / maxHp);
    const bar = b.querySelector('[data-hp]') as HTMLElement | null;
    if (bar) { bar.style.width = `${r * 100}%`; bar.style.background = hpColor(r); }
    const t = b.querySelector('[data-hptext]'); if (t) t.textContent = `${hp} / ${maxHp}`;
    if (this.view) this.view[side].hp = hp;
  }
  exp(exp: number, next: number, level: number) {
    const e = this.meBox.querySelector('[data-exp]') as HTMLElement | null; if (e) e.style.width = `${Math.min(100, (exp / next) * 100)}%`;
    if (this.view) { this.view.me.level = level; }
  }
  hideSide(side: 'me' | 'foe') { (side === 'me' ? this.meBox : this.foeBox).style.opacity = '0'; }

  /** 메시지 타자기 출력 → 클릭/키 입력 또는 시간 경과로 다음 */
  say(raw: string, hold = 700): Promise<void> {
    const text = josa(raw);
    this.menu.style.visibility = 'hidden';
    return new Promise((res) => {
      let i = 0; let done = false;
      const finish = () => { if (done) return; done = true; clearInterval(iv); clearTimeout(to); this.skip = null; res(); };
      const iv = window.setInterval(() => { i += 2; this.msg.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(iv); to = window.setTimeout(finish, hold); } }, 22);
      let to = 0;
      this.skip = () => { if (i < text.length) { i = text.length; this.msg.textContent = text; } else finish(); };
    });
  }
  advance() { this.skip?.(); }

  showMenu(h: BattleMenuHandlers) {
    const v = this.view!;
    this.msg.textContent = josa(`${v.me.name}은(는) 무엇을 할까?`);
    this.menu.style.visibility = 'visible';
    const main = () => {
      this.menu.className = 'px-panel w-[min(440px,48vw)] grid grid-cols-2 gap-2 content-center';
      this.menu.innerHTML = '';
      const btn = (label: string, cls: string, fn: () => void) => { const b = el('button', `px-btn ${cls} text-lg !py-2`, label); b.onclick = () => { sfx.play('blip'); fn(); }; this.menu.appendChild(b); };
      btn('싸우기', 'green', fight); btn('가방', '', bag); btn('루미', '', party); btn('도망', '', () => h.run());
    };
    const back = () => { const b = el('button', 'px-btn text-sm !py-1 col-span-2', '◀ 뒤로'); b.onclick = main; this.menu.appendChild(b); };
    const fight = () => {
      this.menu.innerHTML = '';
      v.me.moves.forEach((m, i) => {
        const b = el('button', 'text-left px-2 py-1.5 bg-[#fff8ec] border-2 border-[#a8683a] hover:-translate-y-0.5 transition-transform', `<div class="text-base">${m.name}</div><div class="flex gap-1 items-center text-[11px]">${typeChip(m.type)}<span class="text-[#8a5a32]">${m.power ? `위력 ${m.power}` : '변화'}</span></div>`);
        b.onclick = () => h.move(i); this.menu.appendChild(b);
      });
      back();
    };
    const bag = () => {
      this.menu.innerHTML = '';
      const items = Object.entries(v.bag).filter(([, n]) => n > 0);
      if (!items.length) this.menu.appendChild(el('div', 'col-span-2 text-center text-[#8a5a32]', '가방이 비었어요'));
      for (const [id, n] of items) {
        const d = ITEMS[id];
        const b = el('button', 'flex items-center gap-2 px-2 py-1 bg-[#fff8ec] border-2 border-[#a8683a] text-left', `<span class="px-icon shrink-0" style="${iconStyle(d.icon, 28)}"></span><span class="text-sm flex-1">${d.name}</span><span class="text-sm">×${n}</span>`);
        b.onclick = () => h.item(id); this.menu.appendChild(b);
      }
      back();
    };
    const party = () => {
      this.menu.innerHTML = '';
      v.party.forEach((c, i) => {
        const cur = c.uid === v.me.uid, dead = c.hp <= 0;
        const b = el('button', `flex items-center gap-2 px-2 py-1 bg-[#fff8ec] border-2 ${cur ? 'border-[#5fc04a]' : 'border-[#a8683a]'} text-left ${dead ? 'opacity-40' : ''}`,
          `<span class="lumi-icon" style="background-image:url(assets/lumi/${c.species}.png)"></span><span class="text-sm flex-1">${c.name} Lv.${c.level}</span><span class="text-xs tabular-nums">${c.hp}/${c.maxHp}</span>`);
        b.disabled = cur || dead;
        b.onclick = () => h.swap(i); this.menu.appendChild(b);
      });
      back();
    };
    main();
  }
  hideMenu() { this.menu.style.visibility = 'hidden'; }
  destroy() { this.root.remove(); }
}
