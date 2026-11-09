// 엔딩 크레딧: 가운데로 장(章) 제목과 만든 사람들이 천천히 올라가고,
//  양옆에는 그동안 찍어 둔 장면(추억 사진)이 왼쪽 · 오른쪽 번갈아 한 장씩 떠올랐다 사라짐. 클릭 · E · Space 로 빨리 넘김
export interface CreditScene { img: string; caption: string }
export function showCredits(hero: string, chapters: string[], scenes: CreditScene[] = []): Promise<void> {
  return new Promise((done) => {
    const el = document.createElement('div');
    el.className = 'fixed inset-0 z-[9999] overflow-hidden';
    el.style.cssText = 'background:#07060c;color:#f4ecd8;font-family:Galmuri11,Galmuri9,sans-serif;opacity:0;transition:opacity 1.2s';
    const rows = [
      `<div style="font-size:28px;color:#ffe58a;margin-bottom:12px">루미 스텔라</div>`,
      `<div style="opacity:.8;margin-bottom:64px">${hero}의 여행</div>`,
      ...chapters.map((t) => `<div style="margin:22px 0;font-size:16px">${t}</div>`),
      `<div style="margin-top:72px;opacity:.7">이야기 · 지도 · 루미</div><div style="margin:6px 0 28px">루미 스텔라 제작팀</div>`,
      `<div style="opacity:.7">일러스트</div><div style="margin:6px 0 28px">김도연</div>`,
      `<div style="opacity:.7">함께한 루미들</div><div style="margin:6px 0 28px">그리고, 당신</div>`,
      `<div style="margin-top:90px;font-size:20px;color:#ffe58a">감사합니다</div>`,
      `<div style="margin-top:18px;opacity:.75;font-size:13px">모험은 계속됩니다 — 별마루산 꼭대기, 별의 제단에서 별무리가 기다리고 있어요.</div>`,
    ];
    // 가운데 글은 좁게, 양옆은 사진 자리
    el.innerHTML = `<div data-c style="text-align:center;position:absolute;left:50%;top:100%;transform:translateX(-50%);width:min(360px,40vw);line-height:1.6">${rows.join('')}</div>
      <div data-p style="position:absolute;top:50%;width:min(30vw,420px);transition:opacity 1.4s, transform 1.4s;opacity:0"></div>`;
    document.body.appendChild(el);
    const box = el.querySelector('[data-c]') as HTMLElement, photo = el.querySelector('[data-p]') as HTMLElement;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    // 사진: 크레딧이 올라가는 동안 고르게 나눠서 한 장씩
    let shown = -1;
    const showPhoto = (i: number) => {
      const s = scenes[i]; if (!s) { photo.style.opacity = '0'; return; }
      const left = i % 2 === 0;
      photo.style.opacity = '0';
      setTimeout(() => {
        photo.style.left = left ? '4vw' : ''; photo.style.right = left ? '' : '4vw';
        photo.style.transform = `translateY(-50%) rotate(${left ? -2 : 2}deg)`;
        photo.innerHTML = `<div style="background:#f4ecd8;padding:8px 8px 4px;box-shadow:0 8px 24px rgba(0,0,0,.6)"><img src="${s.img}" style="width:100%;display:block;image-rendering:pixelated"><div style="color:#3b2414;font-size:12px;text-align:center;padding:4px 0 2px">${s.caption}</div></div>`;
        photo.style.opacity = '1';
      }, 600);
    };
    const H = () => box.offsetHeight + window.innerHeight;
    let y = 0, last = performance.now(), fast = false, raf = 0;
    const finish = () => { cancelAnimationFrame(raf); el.style.opacity = '0'; removeEventListener('keydown', key); setTimeout(() => { el.remove(); done(); }, 1200); };
    const key = (e: KeyboardEvent) => { if (['e', 'E', ' ', 'Enter', 'Escape'].includes(e.key)) fast = true; };
    addEventListener('keydown', key); el.addEventListener('pointerdown', () => { fast = true; });
    const tick = (t: number) => {
      y += ((t - last) / 1000) * (fast ? 420 : 34); last = t;
      box.style.transform = `translate(-50%, ${-y}px)`;
      const total = H();
      if (scenes.length) { const i = Math.min(scenes.length - 1, Math.floor((y / total) * scenes.length * 1.05)); if (i !== shown) { shown = i; showPhoto(i); } }
      if (y > total) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
