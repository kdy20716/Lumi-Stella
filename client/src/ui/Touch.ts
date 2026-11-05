// 모바일 터치 컨트롤러: 가로 화면 양손 조작
//  왼손: 조이스틱(이동, 대각선 가능) · 달리기 / 오른손: A(대화 · 조사 = E) · B(도구 사용 = Space) · 휴대폰(R) · 지도(M) · 감정표현(Tab)
//  터치 기기이면서 화면이 작을 때(폭 기준)만 보이고, 세로로 들면 "가로로 돌려 주세요" 안내
//  데스크톱은 전체화면이어도 화면이 크기 때문에 보이지 않음

/** 이 폭(px) 이하의 가로 화면이면 컨트롤러를 보임. 가로로 든 휴대폰은 보통 640~930px */
export const TOUCH_MAX_WIDTH = 960;
/** 세로로 든 휴대폰(폭이 이 값 이하)이면 "가로로 돌려 주세요" 안내를 보임 */
export const TOUCH_MAX_PORTRAIT_WIDTH = 520;

export const touch = {
  /** 조이스틱 값 (-1 ~ 1, 원 안으로 제한). 대각선이면 둘 다 0 이 아님 */
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
        <div class="tc-stick" data-stick><div class="tc-knob" data-knob></div></div>
        <button class="tc-small tc-run" data-run>달리기</button>
      </div>
      <div class="tc-right">
        <div class="tc-top"><button class="tc-small" data-k="Tab">😊</button><button class="tc-small" data-k="m">지도</button><button class="tc-small" data-k="r">📱</button></div>
        <div class="tc-ab"><button class="tc-btn b" data-k=" ">B<small>도구</small></button><button class="tc-btn a" data-k="e">A<small>대화</small></button></div>
      </div>
      <div class="tc-rotate">📱↻<br>가로로 돌려서 양손으로 플레이해 주세요!</div>`;
    document.body.appendChild(n); this.node = n;
    // 화면 크기가 바뀔 때(회전, 창 크기 변경, 전체화면)마다 다시 판단
    window.addEventListener('resize', () => this.refresh());
    window.addEventListener('orientationchange', () => this.refresh());
    this.refresh();

    // 조이스틱: 판 위에 손가락을 올리고 끌면 그 방향으로 (판 밖으로 나가도 계속 따라감)
    const stick = n.querySelector<HTMLElement>('[data-stick]')!, knob = n.querySelector<HTMLElement>('[data-knob]')!;
    let id: number | null = null;
    const DEAD = 0.18;
    const fromPoint = (x: number, y: number) => {
      const r = stick.getBoundingClientRect(), R = r.width * 0.36;   // 손잡이가 움직일 수 있는 반지름
      const dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2), d = Math.hypot(dx, dy);
      const mag = Math.min(1, d / R);
      if (mag < DEAD) { this.vx = 0; this.vy = 0; } else { this.vx = (dx / d) * mag; this.vy = (dy / d) * mag; }
      const k = d > R ? R / d : 1;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    const end = () => { id = null; this.vx = 0; this.vy = 0; knob.style.transform = ''; stick.classList.remove('active'); };
    const find = (list: TouchList) => { for (let i = 0; i < list.length; i++) if (list[i].identifier === id) return list[i]; return null; };
    stick.addEventListener('touchstart', (e) => { e.preventDefault(); if (id !== null) return; const t = e.changedTouches[0]; id = t.identifier; stick.classList.add('active'); fromPoint(t.clientX, t.clientY); }, { passive: false });
    stick.addEventListener('touchmove', (e) => { e.preventDefault(); const t = find(e.touches); if (t) fromPoint(t.clientX, t.clientY); }, { passive: false });
    stick.addEventListener('touchend', (e) => { e.preventDefault(); if (find(e.changedTouches)) end(); }, { passive: false });
    stick.addEventListener('touchcancel', (e) => { if (find(e.changedTouches)) end(); });

    const runBtn = n.querySelector<HTMLButtonElement>('[data-run]')!;
    runBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.run = !this.run; runBtn.classList.toggle('on', this.run); }, { passive: false });
    n.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); b.classList.add('down'); this.onKey?.(b.dataset.k!); if (navigator.vibrate) navigator.vibrate(8); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); b.classList.remove('down'); }, { passive: false });
    });
  },
  /** 대화 · 상점 등 화면이 열렸을 때도 A 는 그대로 동작 (대화 넘기기) */
  setVisible(v: boolean) { this.wanted = v; this.refresh(); },
  /** 휴대폰 크기 화면인가: 가로 화면은 폭 960px 이하, 세로 화면은 폭 520px 이하 */
  shapeOk(): boolean {
    const w = window.innerWidth, h = window.innerHeight;
    if (!w || !h) return false;
    return w > h ? w <= TOUCH_MAX_WIDTH : w <= TOUCH_MAX_PORTRAIT_WIDTH;
  },
  /** 터치 기기 + 휴대폰 크기 + 화면이 열려 있을 때만 컨트롤러 표시 */
  refresh() {
    if (!this.node) return;
    const small = this.shapeOk();
    this.node.style.display = small && this.wanted ? '' : 'none';
    document.body.classList.toggle('tc-on', small);
    if (!small) { this.vx = 0; this.vy = 0; }
  },
};
