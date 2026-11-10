// 제네시스 연출용 화면 효과 (DOM 오버레이): 짙은 안개 · 어둠 · 번개 → 안개가 걷히고 햇살
//  게임 화면 위에 덮지만 클릭은 통과. 끝나면 스스로 지워짐
export function stormFx() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden';
  el.innerHTML = `
    <div data-fog1 style="position:absolute;inset:-20% -60%;background:radial-gradient(ellipse at 30% 60%, rgba(96,98,128,.75), transparent 55%),radial-gradient(ellipse at 70% 40%, rgba(70,72,104,.7), transparent 50%);opacity:0;transition:opacity 4s;filter:blur(18px)"></div>
    <div data-fog2 style="position:absolute;inset:-20% -60%;background:radial-gradient(ellipse at 60% 70%, rgba(84,82,116,.7), transparent 50%),radial-gradient(ellipse at 20% 30%, rgba(58,56,92,.65), transparent 45%);opacity:0;transition:opacity 5s;filter:blur(24px)"></div>
    <div data-dark style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, rgba(14,10,30,.38) 0%, rgba(8,6,20,.7) 45%, rgba(2,1,8,.96) 85%);opacity:0;transition:opacity 3.5s"></div>
    <div data-bolt style="position:absolute;inset:0;background:#f4f0ff;opacity:0"></div>
    <div data-sun style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% -10%, rgba(255,244,190,.95) 0%, rgba(255,226,150,.45) 35%, transparent 70%);opacity:0;transition:opacity 3s"></div>`;
  // 게임 화면 위 · 대화창(UI) 아래에 깔림
  const uiRoot = document.getElementById('ui');
  if (uiRoot?.parentElement) uiRoot.parentElement.insertBefore(el, uiRoot); else document.body.appendChild(el);
  const q = (k: string) => el.querySelector(`[data-${k}]`) as HTMLElement;
  const drift = (n: HTMLElement, d: number, dir: number) => n.animate([{ transform: `translateX(${-8 * dir}%)` }, { transform: `translateX(${8 * dir}%)` }], { duration: d, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
  drift(q('fog1'), 9000, 1); drift(q('fog2'), 13000, -1);
  return {
    /** 안개가 짙게 깔리고 어두워짐 */
    gather() { q('dark').style.opacity = '1'; q('fog1').style.opacity = '1'; q('fog2').style.opacity = '1'; },
    /** 번개 한 번 (화면이 두 번 번쩍) */
    bolt() { q('bolt').animate([{ opacity: 0 }, { opacity: 0.95 }, { opacity: 0.1 }, { opacity: 0.8 }, { opacity: 0 }], { duration: 420 }); },
    /** 안개가 걷히고 햇살이 쏟아짐 */
    clear() { q('dark').style.opacity = '0'; q('fog1').style.opacity = '0'; q('fog2').style.opacity = '0'; q('sun').style.opacity = '1'; },
    /** 조금 옅게 (제네시스가 모습을 드러낼 때) */
    thin() { q('fog1').style.opacity = '0.45'; q('fog2').style.opacity = '0.35'; q('dark').style.opacity = '0.75'; },
    end(ms = 1500) { el.style.transition = `opacity ${ms}ms`; el.style.opacity = '0'; setTimeout(() => el.remove(), ms + 50); },
  };
}
/** 화면 가운데 큰 알림 (사이드 퀘스트 클리어) */
export function questClear(title: string, sub: string, ms = 5200) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:0;right:0;top:12%;z-index:60;pointer-events:none;text-align:center;font-family:Galmuri11,Galmuri9,sans-serif;opacity:0;transform:translateY(-12px);transition:opacity .9s, transform .9s';
  el.innerHTML = `<div style="display:inline-block;padding:14px 34px 12px;background:linear-gradient(#3b2414ee,#2a180cee);border:3px solid #ffe58a;box-shadow:0 8px 0 rgba(0,0,0,.35)">
    <div style="font-size:13px;color:#ffe58a;letter-spacing:.4em">— SIDE QUEST CLEAR —</div>
    <div style="font-size:30px;color:#fff8ec;margin:6px 0 4px;letter-spacing:.08em">${title}</div>
    <div style="font-size:14px;color:#f4ecd8">${sub}</div></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 1000); }, ms);
}
