// 모바일 터치 컨트롤러: 가로 화면 양손 조작
//  왼손: 십자키(이동) · 달리기 / 오른손: A(대화 · 조사 = E) · B(도구 사용 = Space) · 휴대폰(R) · 지도(M) · 감정표현(Tab)
//  터치 기기에서만 보이고, 세로로 들면 "가로로 돌려 주세요" 안내
export const touch = {
  vx: 0, vy: 0, run: false,
  enabled: false,
  wanted: true,
  onKey: null as null | ((key: string) => void),
  node: null as HTMLDivElement | null,

  /** 터치 기기면 컨트롤러를 붙임 (한 번만) */
  mount() {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    if (!coarse || this.node) return;
    this.enabled = true;
    const n = document.createElement('div');
    n.className = 'tc-root';
    n.innerHTML = `
      <div class="tc-left">
        <div class="tc-pad" data-pad>
          <button class="tc-d up" data-d="0,-1">▲</button><button class="tc-d left" data-d="-1,0">◀</button>
          <span class="tc-mid"></span>
          <button class="tc-d right" data-d="1,0">▶</button><button class="tc-d down" data-d="0,1">▼</button>
        </div>
        <button class="tc-small tc-run" data-run>달리기</button>
      </div>
      <div class="tc-right">
        <div class="tc-top"><button class="tc-small" data-k="Tab">😊</button><button class="tc-small" data-k="m">지도</button><button class="tc-small" data-k="r">📱</button></div>
        <div class="tc-ab"><button class="tc-btn b" data-k=" ">B<small>도구</small></button><button class="tc-btn a" data-k="e">A<small>대화</small></button></div>
      </div>
      <div class="tc-rotate">📱↻<br>가로로 돌려서 양손으로 플레이해 주세요!</div>`;
    document.body.appendChild(n); this.node = n;
    // 화면 비율이 바뀔 때(회전, 창 크기 변경)마다 다시 판단
    window.addEventListener('resize', () => this.refresh());
    window.addEventListener('orientationchange', () => this.refresh());
    this.refresh();
    // 십자키: 손가락이 있는 방향 (미끄러져도 따라감)
    const pad = n.querySelector<HTMLElement>('[data-pad]')!;
    const fromPoint = (x: number, y: number) => {
      const r = pad.getBoundingClientRect(), dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) { this.vx = 0; this.vy = 0; return; }
      if (Math.abs(dx) > Math.abs(dy)) { this.vx = Math.sign(dx); this.vy = 0; } else { this.vx = 0; this.vy = Math.sign(dy); }
      pad.dataset.dir = `${this.vx},${this.vy}`;
    };
    const end = () => { this.vx = 0; this.vy = 0; pad.dataset.dir = ''; };
    pad.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; fromPoint(t.clientX, t.clientY); }, { passive: false });
    pad.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.touches[0]; fromPoint(t.clientX, t.clientY); }, { passive: false });
    pad.addEventListener('touchend', (e) => { e.preventDefault(); end(); }, { passive: false });
    pad.addEventListener('touchcancel', end);
    const runBtn = n.querySelector<HTMLButtonElement>('[data-run]')!;
    runBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.run = !this.run; runBtn.classList.toggle('on', this.run); }, { passive: false });
    n.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('down'); this.onKey?.(b.dataset.k!); if (navigator.vibrate) navigator.vibrate(8); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('down'); }, { passive: false });
    });
  },
  /** 대화 · 상점 등 화면이 열렸을 때도 A 는 그대로 동작 (대화 넘기기) */
  setVisible(v: boolean) { this.wanted = v; this.refresh(); },
  /** 모바일 비율: 가로로 긴 휴대폰(약 1.9 이상) 또는 세로로 긴 휴대폰(약 0.6 이하). 데스크톱 · 태블릿 비율은 제외 */
  shapeOk(): boolean {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return false;
    const r = w / h;
    return r >= 1.9 || r <= 0.6;
  },
  /** 터치 기기 + 모바일 비율 + 화면이 열려 있을 때만 컨트롤러 표시 */
  refresh() {
    if (!this.node) return;
    const shape = this.shapeOk();
    this.node.style.display = shape && this.wanted ? '' : 'none';
    document.body.classList.toggle('tc-on', shape);
  },
};
