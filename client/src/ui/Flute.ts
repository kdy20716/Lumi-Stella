// 시련의 오카리나: 악보에 적힌 순서대로 네 구멍(↑ ← → ↓)을 눌러 연주
//  - 방향키 · WASD · 화면 버튼. 틀리면 처음부터 다시. Esc · 그만두기 로 닫음
//  - 조건(오카리나 · 악보 소지)은 권한자가 따로 검증하고, 여기서는 연주만
const ARROW = ['↑', '←', '→', '↓'];
const FREQ = [783.99, 523.25, 659.25, 440];   // 솔 · 도 · 미 · 라
const KEYS: Record<string, number> = { ArrowUp: 0, w: 0, W: 0, ArrowLeft: 1, a: 1, A: 1, ArrowRight: 2, d: 2, D: 2, ArrowDown: 3, s: 3, S: 3 };

let ctx: AudioContext | null = null;
function tone(f: number, dur = 0.42, type: OscillatorType = 'sine', vol = 0.16) {
  try {
    ctx ??= new AudioContext();
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
    o.type = type; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.04); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.05); g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.8);
    o.connect(g).connect(ctx.destination); o2.connect(g2).connect(ctx.destination);
    o.start(t); o.stop(t + dur + 0.05); o2.start(t); o2.stop(t + dur + 0.05);
  } catch { /* 소리를 낼 수 없는 환경: 조용히 */ }
}

/** 악보대로 끝까지 불면 true, 그만두면 false */
export function playFlute(title: string, notes: number[], color = '#ffe58a'): Promise<boolean> {
  return new Promise((done) => {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(8,6,16,.72);display:flex;align-items:center;justify-content:center;font-family:Galmuri11,Galmuri9,sans-serif;color:#3b2414;opacity:0;transition:opacity .3s';
    el.innerHTML = `<div data-card style="background:#f4ecd8;border:3px solid #3b2414;box-shadow:0 10px 0 rgba(0,0,0,.35);padding:18px 20px 16px;width:min(440px,92vw);text-align:center">
      <div style="font-size:13px;opacity:.7">시련의 오카리나</div>
      <div style="font-size:18px;margin:2px 0 12px">${title}</div>
      <div data-score style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;background:#fffaf0;border:2px solid #c9b48a;padding:12px 8px;margin-bottom:6px"></div>
      <div data-msg style="font-size:13px;min-height:20px;margin-bottom:10px">악보에 적힌 순서대로 불어 보자.</div>
      <div style="display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(2,48px);gap:6px;justify-content:center;margin-bottom:12px">
        <span></span><button data-n="0" class="px-btn" style="font-size:20px">↑</button><span></span>
        <button data-n="1" class="px-btn" style="font-size:20px">←</button><button data-n="3" class="px-btn" style="font-size:20px">↓</button><button data-n="2" class="px-btn" style="font-size:20px">→</button>
      </div>
      <div style="font-size:12px;opacity:.7;margin-bottom:8px">방향키 · WASD · 버튼으로 연주</div>
      <button data-x class="px-btn" style="font-size:14px">그만두기</button></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    const score = el.querySelector('[data-score]') as HTMLElement, msg = el.querySelector('[data-msg]') as HTMLElement, card = el.querySelector('[data-card]') as HTMLElement;
    let at = 0, locked = false;
    const draw = () => {
      score.innerHTML = notes.map((n, i) => `<span style="display:inline-flex;width:34px;height:38px;align-items:center;justify-content:center;font-size:20px;border:2px solid ${i < at ? '#3b2414' : '#c9b48a'};background:${i < at ? color : i === at ? '#fff' : '#f4ecd8'};${i === at ? 'box-shadow:0 0 0 2px #3b2414 inset' : ''}">${ARROW[n]}</span>`).join('');
    };
    draw();
    const finish = (ok: boolean) => {
      removeEventListener('keydown', key, true);
      el.style.opacity = '0'; setTimeout(() => { el.remove(); done(ok); }, 320);
    };
    const press = (n: number) => {
      if (locked) return;
      if (n === notes[at]) {
        tone(FREQ[n]); at++; draw();
        if (at >= notes.length) {
          locked = true; msg.textContent = '♪ 선율이 맑게 울려 퍼진다…';
          notes.forEach((k, i) => setTimeout(() => tone(FREQ[k] * 2, 0.5, 'triangle', 0.08), 500 + i * 170));
          setTimeout(() => finish(true), 600 + notes.length * 170 + 500);
        }
      } else {
        tone(140, 0.3, 'sawtooth', 0.1); at = 0; draw();
        msg.textContent = '삐익— 음이 어긋났다. 처음부터 다시!';
        card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(0)' }], { duration: 220 });
      }
    };
    const key = (e: KeyboardEvent) => {
      e.stopPropagation(); e.preventDefault();
      if (e.key === 'Escape') { if (!locked) finish(false); return; }
      const n = KEYS[e.key]; if (n !== undefined && !e.repeat) press(n);
    };
    addEventListener('keydown', key, true);
    el.querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) => { b.onclick = () => press(Number(b.dataset.n)); });
    (el.querySelector('[data-x]') as HTMLButtonElement).onclick = () => { if (!locked) finish(false); };
  });
}
