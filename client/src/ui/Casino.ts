// 별빛 카지노 모달 UI (밤 18:00 ~ 새벽 2시 전용 · 서버 권한 골드 베팅 3종 게임)
import type { ActionResult, CasinoGame, CasinoOutcome } from '@shared/types';
import { sfx } from '../audio/Sfx';

const root = () => document.getElementById('ui')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const BETS = [50, 100, 300, 500, 1000] as const;
const SLOT_SYMBOLS = ['🍒', '🍋', '🔔', '🍀', '💎', '⭐'] as const;
const DICE_GLYPHS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'] as const;
const cardName = (v: number) => (v === 1 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v));

export interface CasinoOpts {
  initialGame?: CasinoGame;
  gold: () => number;
  onBet: (game: CasinoGame, bet: number, pick?: string) => Promise<ActionResult>;
  onClose?: () => void;
}

export const casinoModal = {
  node: null as HTMLDivElement | null,
  opts: null as CasinoOpts | null,
  game: 'slot' as CasinoGame,
  bet: 100,
  dicePick: 'odd' as 'odd' | 'even' | 'seven' | 'double',
  cardPick: 'high' as 'high' | 'low' | 'same',
  busy: false,
  spinTimer: 0 as number,
  sessionNet: 0,
  lastOutcome: null as CasinoOutcome | null,
  errorText: '',

  get open() { return !!this.node; },

  show(opts: CasinoOpts) {
    this.close(false);
    this.opts = opts;
    this.game = opts.initialGame ?? 'slot';
    this.busy = false;
    this.lastOutcome = null;
    this.errorText = '';
    const g = opts.gold();
    if (g > 0 && g < this.bet) this.bet = Math.max(10, Math.min(10000, g >= 50 ? 50 : g));

    sfx.play('menu');
    const n = document.createElement('div');
    n.dataset.casinoModal = '1';
    n.className = 'fixed inset-0 z-40 flex items-center justify-center bg-[#090612]/78 pointer-events-auto toast-in';
    n.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    n.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (ev.target === n && !this.busy) this.close();
    });
    root().appendChild(n);
    this.node = n;
    this.render();
  },

  refreshGold(gold: number) {
    if (!this.node) return;
    const el = this.node.querySelector<HTMLElement>('[data-cas-gold]');
    if (el) el.textContent = `${gold.toLocaleString()}G`;
  },

  close(notify = true) {
    window.clearInterval(this.spinTimer);
    this.spinTimer = 0;
    const prevOpts = this.opts;
    this.node?.remove();
    this.node = null;
    this.busy = false;
    this.opts = null;
    if (notify) {
      try { sfx.play('tap'); } catch { /* 무시 */ }
      prevOpts?.onClose?.();
    }
  },

  cardBadgeHtml(v: number, tone: 'dealer' | 'player') {
    const suit = tone === 'dealer' ? '♠' : '♥';
    const col = tone === 'dealer' ? '#1e2438' : '#c82842';
    return `<div style="width:68px;height:96px;border-radius:10px;background:#fffaf0;border:3px solid #d4a438;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;box-shadow:0 4px 0 rgba(0,0,0,.35);color:${col};font-weight:800">
      <span style="font-size:13px">${suit}</span>
      <span style="font-size:28px;line-height:1">${cardName(v)}</span>
      <span style="font-size:11px;opacity:.7">${tone === 'dealer' ? '딜러' : '내 카드'}</span>
    </div>`;
  },

  render() {
    const n = this.node;
    const o = this.opts;
    if (!n || !o) return;
    const gold = o.gold();
    const effectiveBet = Math.max(10, Math.min(10000, this.bet));
    const canAfford = gold >= effectiveBet;
    const out = this.lastOutcome;

    const betPills = BETS.map((amt) => `<button data-cbet="${amt}" ${this.busy ? 'disabled' : ''} style="padding:5px 10px;border-radius:8px;border:2px solid ${this.bet === amt ? '#ffd65a' : '#6e4568'};background:${this.bet === amt ? 'linear-gradient(#f0b83a,#c9821a)' : '#2b1636'};color:${this.bet === amt ? '#241208' : '#f7e4bc'};font-weight:700;font-size:12px;cursor:pointer">${amt.toLocaleString()}G</button>`).join('');
    const allInAmt = Math.max(10, Math.min(10000, gold));

    let gameBody = '';
    if (this.game === 'slot') {
      const r = out?.game === 'slot' && out.reels ? out.reels : ['🍒', '⭐', '💎'];
      gameBody = `
        <div style="display:flex;justify-content:center;gap:12px;margin:10px 0">
          ${r.map((sym, i) => `<div data-cas-reel="${i}" style="width:76px;height:84px;border-radius:12px;background:linear-gradient(180deg,#120e1e,#221a34,#120e1e);border:3px solid #d4a438;box-shadow:inset 0 0 10px rgba(255,214,90,.25);display:flex;align-items:center;justify-content:center;font-size:38px">${sym}</div>`).join('')}
        </div>
        <div style="text-align:center;font-size:11px;color:#e7cfa8;margin-bottom:8px">
          ⭐⭐⭐ 10배 · 💎💎💎 7배 · 같은 그림 3개 4배 · ⭐/💎/🍒 2페어 2배
        </div>
        <button data-cplay ${this.busy || !canAfford ? 'disabled' : ''} class="px-btn text-base w-full" style="background:linear-gradient(#f0b83a,#c8781a);color:#231204;opacity:${!canAfford ? '0.55' : '1'}">
          ${this.busy ? '🎰 릴 회전 중…' : `🎰 레버 당기기 (-${effectiveBet.toLocaleString()}G)`}
        </button>`;
    } else if (this.game === 'dice') {
      const d = out?.game === 'dice' && out.dice ? out.dice : [3, 4];
      const picks: { id: 'odd' | 'even' | 'seven' | 'double'; label: string; sub: string }[] = [
        { id: 'odd', label: '홀수 (ODD)', sub: '2배' },
        { id: 'even', label: '짝수 (EVEN)', sub: '2배' },
        { id: 'seven', label: '행운의 7', sub: '5배' },
        { id: 'double', label: '더블 (같은 눈)', sub: '5배' },
      ];
      gameBody = `
        <div style="display:flex;justify-content:center;align-items:center;gap:18px;margin:10px 0">
          <div data-cas-die="0" style="width:68px;height:68px;border-radius:14px;background:#fff8ec;border:3px solid #d4a438;color:#2a1828;display:flex;align-items:center;justify-content:center;font-size:46px">${DICE_GLYPHS[d[0]]}</div>
          <span style="font-size:22px;color:#ffd65a;font-weight:800">+</span>
          <div data-cas-die="1" style="width:68px;height:68px;border-radius:14px;background:#fff8ec;border:3px solid #d4a438;color:#2a1828;display:flex;align-items:center;justify-content:center;font-size:46px">${DICE_GLYPHS[d[1]]}</div>
          <span style="font-size:20px;color:#fff8ec;font-weight:800">= <span data-cas-dsum>${d[0] + d[1]}</span></span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:10px">
          ${picks.map((pk) => `<button data-cdice="${pk.id}" ${this.busy ? 'disabled' : ''} style="padding:7px 8px;border-radius:8px;border:2px solid ${this.dicePick === pk.id ? '#ffd65a' : '#6e4568'};background:${this.dicePick === pk.id ? '#522248' : '#251430'};color:#fff8ec;font-size:12px;font-weight:700;cursor:pointer">${pk.label} <span style="color:#ffd65a">· ${pk.sub}</span></button>`).join('')}
        </div>
        <button data-cplay ${this.busy || !canAfford ? 'disabled' : ''} class="px-btn text-base w-full" style="background:linear-gradient(#58b878,#2f8a52);color:#fff;opacity:${!canAfford ? '0.55' : '1'}">
          ${this.busy ? '🎲 주사위 굴리는 중…' : `🎲 주사위 굴리기 (-${effectiveBet.toLocaleString()}G)`}
        </button>`;
    } else {
      const c = out?.game === 'highlow' && out.cards ? out.cards : [7, 10];
      const picks: { id: 'high' | 'low' | 'same'; label: string }[] = [
        { id: 'high', label: '▲ 높다 (HIGH · 2배)' },
        { id: 'low', label: '▼ 낮다 (LOW · 2배)' },
        { id: 'same', label: '＝ 같다 (SAME · 8배)' },
      ];
      gameBody = `
        <div style="display:flex;justify-content:center;align-items:center;gap:18px;margin:10px 0">
          ${this.cardBadgeHtml(c[0], 'dealer')}
          <span style="font-size:20px;color:#ffd65a;font-weight:800">VS</span>
          <div data-cas-card2>${this.cardBadgeHtml(c[1], 'player')}</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:10px">
          ${picks.map((pk) => `<button data-chigh="${pk.id}" ${this.busy ? 'disabled' : ''} style="padding:7px 4px;border-radius:8px;border:2px solid ${this.cardPick === pk.id ? '#ffd65a' : '#6e4568'};background:${this.cardPick === pk.id ? '#522248' : '#251430'};color:#fff8ec;font-size:11px;font-weight:700;cursor:pointer">${pk.label}</button>`).join('')}
        </div>
        <button data-cplay ${this.busy || !canAfford ? 'disabled' : ''} class="px-btn text-base w-full" style="background:linear-gradient(#e06078,#a82442);color:#fff;opacity:${!canAfford ? '0.55' : '1'}">
          ${this.busy ? '🃏 카드 뒤집는 중…' : `🃏 카드 승부하기 (-${effectiveBet.toLocaleString()}G)`}
        </button>`;
    }

    const resultBanner = this.errorText
      ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#4a1622;border:2px solid #e85868;color:#ffd8dc;font-size:12px;text-align:center;font-weight:700">${esc(this.errorText)}</div>`
      : out
        ? `<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:${out.win ? '#163d28' : '#421622'};border:2px solid ${out.win ? '#6ee08a' : '#e85868'};color:${out.win ? '#c8ffd8' : '#ffd2d8'};font-size:13px;text-align:center;font-weight:700">
            ${esc(out.summary)}<br>
            <span style="font-size:12px;color:${out.win ? '#ffe58a' : '#ff9aa8'}">${out.win ? `+${out.payout.toLocaleString()}G 획득! (순수익 ${out.net >= 0 ? `+${out.net.toLocaleString()}` : out.net.toLocaleString()}G)` : `-${out.bet.toLocaleString()}G 차감`}</span>
          </div>`
        : `<div style="margin-top:8px;padding:7px 10px;border-radius:8px;background:#241430;border:1px solid #5c3a62;color:#dcc8ea;font-size:12px;text-align:center">베팅 금액을 고른 뒤 게임을 시작하세요!</div>`;

    n.innerHTML = `<div style="width:min(460px,95cqw);background:linear-gradient(180deg,#2d1838,#1b0e24);border:4px solid #d4a438;border-radius:16px;padding:16px;color:#fff8ec;box-shadow:0 16px 40px rgba(0,0,0,.65)">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:2px solid #5d3668;padding-bottom:8px">
        <div>
          <div style="font-size:18px;font-weight:800;color:#ffe58a">🎰 별빛 카지노</div>
          <div style="font-size:11px;color:#d6b8ec">🌙 밤 6시 ~ 새벽 2시 한정 영업</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:800;color:#ffd65a">보유 <span data-cas-gold>${gold.toLocaleString()}G</span></div>
            <div style="font-size:11px;color:${this.sessionNet >= 0 ? '#7ce896' : '#ff8a96'}">오늘 손익 ${this.sessionNet >= 0 ? `+${this.sessionNet.toLocaleString()}` : this.sessionNet.toLocaleString()}G</div>
          </div>
          <button data-cclose ${this.busy ? 'disabled' : ''} style="width:30px;height:30px;border-radius:8px;border:2px solid #8a5678;background:#3a1c42;color:#fff8ec;font-weight:800;cursor:pointer">×</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:10px 0">
        <button data-ctab="slot" ${this.busy ? 'disabled' : ''} style="padding:7px 4px;border-radius:8px;border:2px solid ${this.game === 'slot' ? '#ffd65a' : '#5d3668'};background:${this.game === 'slot' ? '#6b1d40' : '#241430'};color:#fff8ec;font-weight:700;font-size:12px;cursor:pointer">🎰 별빛 슬롯</button>
        <button data-ctab="dice" ${this.busy ? 'disabled' : ''} style="padding:7px 4px;border-radius:8px;border:2px solid ${this.game === 'dice' ? '#ffd65a' : '#5d3668'};background:${this.game === 'dice' ? '#6b1d40' : '#241430'};color:#fff8ec;font-weight:700;font-size:12px;cursor:pointer">🎲 루미 주사위</button>
        <button data-ctab="highlow" ${this.busy ? 'disabled' : ''} style="padding:7px 4px;border-radius:8px;border:2px solid ${this.game === 'highlow' ? '#ffd65a' : '#5d3668'};background:${this.game === 'highlow' ? '#6b1d40' : '#241430'};color:#fff8ec;font-weight:700;font-size:12px;cursor:pointer">🃏 하이·로우</button>
      </div>

      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:7px 8px;border-radius:10px;background:#1e1028;border:1px solid #522e5c;margin-bottom:6px">
        <span style="font-size:11px;color:#e7cfa8;margin-right:2px">베팅:</span>
        ${betPills}
        ${gold >= 10 ? `<button data-cbet="${allInAmt}" ${this.busy ? 'disabled' : ''} style="padding:5px 8px;border-radius:8px;border:2px solid ${this.bet === allInAmt && !BETS.includes(this.bet as 50) ? '#ffd65a' : '#944a2a'};background:#4e1f1c;color:#ffe58a;font-weight:700;font-size:11px;cursor:pointer">올인(${allInAmt.toLocaleString()}G)</button>` : ''}
      </div>

      ${!canAfford ? '<div style="font-size:12px;color:#ff9aa8;text-align:center;margin-bottom:4px">⚠ 보유 골드가 베팅액보다 부족해요!</div>' : ''}
      ${gameBody}
      ${resultBanner}
    </div>`;

    n.querySelector<HTMLButtonElement>('[data-cclose]')?.addEventListener('click', () => this.close());
    n.querySelectorAll<HTMLButtonElement>('[data-ctab]').forEach((b) => {
      b.onclick = () => { if (this.busy) return; sfx.play('tap'); this.game = b.dataset.ctab as CasinoGame; this.errorText = ''; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-cbet]').forEach((b) => {
      b.onclick = () => { if (this.busy) return; sfx.play('tap'); this.bet = Number(b.dataset.cbet ?? 100); this.errorText = ''; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-cdice]').forEach((b) => {
      b.onclick = () => { if (this.busy) return; sfx.play('tap'); this.dicePick = b.dataset.cdice as typeof this.dicePick; this.render(); };
    });
    n.querySelectorAll<HTMLButtonElement>('[data-chigh]').forEach((b) => {
      b.onclick = () => { if (this.busy) return; sfx.play('tap'); this.cardPick = b.dataset.chigh as typeof this.cardPick; this.render(); };
    });
    n.querySelector<HTMLButtonElement>('[data-cplay]')?.addEventListener('click', () => { void this.playRound(); });
  },

  async playRound() {
    if (this.busy || !this.opts) return;
    const bet = Math.max(10, Math.min(10000, this.bet));
    if (this.opts.gold() < bet) {
      sfx.play('error');
      this.errorText = `골드가 부족해요! (${bet.toLocaleString()}G 필요)`;
      this.render();
      return;
    }

    this.busy = true;
    this.errorText = '';
    const pick = this.game === 'dice' ? this.dicePick : this.game === 'highlow' ? this.cardPick : undefined;
    sfx.play('tap');
    this.render();

    // 짧은 슬롯·주사위 회전 연출
    window.clearInterval(this.spinTimer);
    let step = 0;
    this.spinTimer = window.setInterval(() => {
      step++;
      if (!this.node) return;
      if (this.game === 'slot') {
        for (let i = 0; i < 3; i++) {
          const el = this.node.querySelector<HTMLElement>(`[data-cas-reel="${i}"]`);
          if (el) el.textContent = SLOT_SYMBOLS[(step + i * 2) % SLOT_SYMBOLS.length];
        }
      } else if (this.game === 'dice') {
        const d0 = this.node.querySelector<HTMLElement>('[data-cas-die="0"]');
        const d1 = this.node.querySelector<HTMLElement>('[data-cas-die="1"]');
        const a = 1 + (step % 6), b = 1 + ((step + 3) % 6);
        if (d0) d0.textContent = DICE_GLYPHS[a];
        if (d1) d1.textContent = DICE_GLYPHS[b];
      }
    }, 65);

    const [res] = await Promise.all([
      this.opts.onBet(this.game, bet, pick),
      new Promise<void>((r) => setTimeout(r, 340)),
    ]);

    window.clearInterval(this.spinTimer);
    this.spinTimer = 0;
    this.busy = false;
    if (!this.node) return;

    const outcome = res.data?.casino;
    if (!res.ok || !outcome) {
      sfx.play('error');
      this.errorText =
        res.reason === 'casino-closed' ? '🌙 밤 영업 시간이 끝나 카지노가 닫혔어요!' :
        res.reason === 'gold' ? '보유 골드가 부족해요!' :
        res.reason === 'wrong-map' ? '카지노 안에서만 이용할 수 있어요!' :
        '게임을 진행할 수 없어요.';
      this.render();
      return;
    }

    this.lastOutcome = outcome;
    this.sessionNet += outcome.net;
    sfx.play(outcome.win ? (outcome.multiplier >= 4 ? 'win' : 'coin') : 'error');
    this.render();
  },
};
