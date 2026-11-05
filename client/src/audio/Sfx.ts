// 효과음: 파일 없이 WebAudio 로 바로 합성 (8비트 게임기 느낌)
//  - 첫 클릭/키 입력 때 오디오가 켜짐 (브라우저 자동재생 정책)
type Wave = OscillatorType;
interface Tone { f: number; f2?: number; t: number; d: number; w?: Wave; v?: number }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;   // 최종 출력 (효과음 버스 + 음악 버스)
let sfxBus: GainNode | null = null;
let muted = (() => { try { return localStorage.getItem('sf:mute') === '1'; } catch { return false; } })();
let noiseBuf: AudioBuffer | null = null;
let stepsOn = (() => { try { return localStorage.getItem('sf:steps') !== '0'; } catch { return true; } })();
/** 발소리 전용 음량 (효과음 버스 안에서 한 번 더 줄임) */
let stepBus: GainNode | null = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = muted ? 0 : 0.32; sfxBus.connect(master);
    stepBus = ctx.createGain(); stepBus.gain.value = 1.9; stepBus.connect(sfxBus);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => ac(), { once: false, passive: true });

function tone({ f, f2, t, d, w = 'square', v = 0.5 }: Tone) {
  const c = ac(); if (!c || !sfxBus || muted) return;
  const o = c.createOscillator(), g = c.createGain();
  const t0 = c.currentTime + t;
  o.type = w; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(sfxBus); o.start(t0); o.stop(t0 + d + 0.02);
}
function noise(t: number, d: number, v = 0.4, lp = 2400, hp = 0) {
  const c = ac(); if (!c || !sfxBus || !noiseBuf || muted) return;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = c.createGain(); const t0 = c.currentTime + t;
  g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  let node: AudioNode = s.connect(f);
  if (hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; node = node.connect(h); }
  node.connect(g).connect(sfxBus); s.start(t0); s.stop(t0 + d + 0.02);
}
const seq = (notes: number[], step: number, w: Wave = 'square', v = 0.35, len = step * 0.9) => notes.forEach((f, i) => f && tone({ f, t: i * step, d: len, w, v }));
const N = (n: string) => { const m = /^([A-G])(#?)(\d)$/.exec(n)!; const i = 'C D EF G A B'.indexOf(m[1]) + (m[2] ? 1 : 0); return 440 * 2 ** ((i - 9) / 12 + (Number(m[3]) - 4)); };

/** 필터 노이즈 한 번 (대역 통과 · 저역 · 고역 · 짧은 어택) — 발소리 · 생활 효과음용 */
interface Burst { t?: number; d: number; v: number; bp?: number; q?: number; lp?: number; hp?: number; a?: number; bus?: GainNode | null }
function burst({ t = 0, d, v, bp, q = 1, lp, hp, a = 0.003, bus }: Burst) {
  const c = ac(); const out = bus ?? sfxBus; if (!c || !out || !noiseBuf || muted) return;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  // 같은 노이즈의 다른 부분을 써서 매번 결이 조금씩 다르게
  const off = Math.random() * (noiseBuf.duration - d - 0.05);
  let node: AudioNode = s;
  if (bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = bp; f.Q.value = q; node = node.connect(f); }
  if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; node = node.connect(f); }
  if (hp) { const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp; node = node.connect(f); }
  const g = c.createGain(); const t0 = c.currentTime + t;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  node.connect(g).connect(out); s.start(t0, Math.max(0, off)); s.stop(t0 + d + 0.02);
}
/** 짧은 음 (발소리 버스로 보낼 수 있는 버전) */
function ping(f: number, f2: number | undefined, t: number, d: number, w: Wave, v: number, bus?: GainNode | null) {
  const c = ac(); const out = bus ?? sfxBus; if (!c || !out || muted) return;
  const o = c.createOscillator(), g = c.createGain(); const t0 = c.currentTime + t;
  o.type = w; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(out); o.start(t0); o.stop(t0 + d + 0.02);
}

// ── 발소리: 바닥 재질별 (내 캐릭터만 재생) ─────────────
export type Surface = 'dirt' | 'grass' | 'tallgrass' | 'stone' | 'wood' | 'tile' | 'sand' | 'snow' | 'water' | 'cave' | 'ice';
/** p: 음높이 배율, v: 음량 배율 (걸음마다 조금씩 다르게) */
const STEPS: Record<Surface, (p: number, v: number, b: GainNode | null) => void> = {
  // 흙: 둔한 "툭" + 짧은 마찰
  dirt: (p, v, b) => { burst({ d: 0.07, v: 0.22 * v, lp: 650 * p, bus: b }); ping(95 * p, 60 * p, 0, 0.05, 'triangle', 0.1 * v, b); },
  // 잔디: 부드러운 "삭"
  grass: (p, v, b) => { burst({ d: 0.06, v: 0.1 * v, hp: 1500 * p, lp: 5200, a: 0.008, bus: b }); burst({ t: 0.018, d: 0.04, v: 0.06 * v, hp: 2200 * p, lp: 6000, bus: b }); },
  // 풀숲: "사사삭" 세 겹 (조금 크게)
  tallgrass: (p, v, b) => { for (let i = 0; i < 3; i++) burst({ t: i * 0.032 + Math.random() * 0.01, d: 0.075, v: (0.13 - i * 0.025) * v, hp: 2000 * p + i * 400, lp: 7500, a: 0.01, bus: b }); },
  // 돌길: 딱딱한 "톡"
  stone: (p, v, b) => { burst({ d: 0.03, v: 0.24 * v, bp: 2300 * p, q: 2.5, bus: b }); ping(820 * p, 520 * p, 0, 0.025, 'sine', 0.05 * v, b); },
  // 나무 바닥 · 부두: 속이 빈 "통"
  wood: (p, v, b) => { ping(170 * p, 120 * p, 0, 0.075, 'triangle', 0.16 * v, b); burst({ d: 0.04, v: 0.12 * v, bp: 950 * p, q: 1.5, bus: b }); },
  // 실내 타일: 매끈한 "탁"
  tile: (p, v, b) => { burst({ d: 0.022, v: 0.16 * v, bp: 3400 * p, q: 2, bus: b }); ping(1250 * p, undefined, 0, 0.015, 'sine', 0.035 * v, b); },
  // 모래: 사각사각 잘게 부서짐
  sand: (p, v, b) => { for (let i = 0; i < 4; i++) burst({ t: i * 0.013, d: 0.03, v: 0.08 * v, hp: 1400 * p, lp: 4800, bus: b }); },
  // 눈: 뽀드득 (압축음 + 높은 끽)
  snow: (p, v, b) => { burst({ d: 0.1, v: 0.16 * v, bp: 1150 * p, q: 0.9, a: 0.02, bus: b }); burst({ t: 0.03, d: 0.05, v: 0.07 * v, bp: 2600 * p, q: 3, bus: b }); ping(1900 * p, 1500 * p, 0.02, 0.03, 'sine', 0.018 * v, b); },
  // 얕은 물 · 늪: 찰방
  water: (p, v, b) => { burst({ d: 0.13, v: 0.13 * v, hp: 500, lp: 3200 * p, a: 0.006, bus: b }); ping(520 * p, 240 * p, 0.01, 0.08, 'sine', 0.05 * v, b); },
  // 동굴: 돌 소리 + 짧은 메아리 두 번
  cave: (p, v, b) => { for (const [t, k] of [[0, 1], [0.09, 0.35], [0.18, 0.14]] as const) { burst({ t, d: 0.035, v: 0.2 * v * k, bp: 1700 * p, q: 2, bus: b }); ping(300 * p, 200 * p, t, 0.03, 'triangle', 0.06 * v * k, b); } },
  // 얼음: 높은 "틱"
  ice: (p, v, b) => { ping(2300 * p, 2000 * p, 0, 0.022, 'sine', 0.05 * v, b); burst({ d: 0.02, v: 0.1 * v, hp: 3800, bus: b }); },
};

const SOUNDS: Record<string, () => void> = {
  // UI
  blip: () => tone({ f: 880, t: 0, d: 0.04, v: 0.18 }),
  talk: () => tone({ f: 520 + Math.random() * 90, t: 0, d: 0.035, w: 'triangle', v: 0.22 }),
  menu: () => { tone({ f: 660, t: 0, d: 0.05, v: 0.2 }); tone({ f: 990, t: 0.05, d: 0.06, v: 0.2 }); },
  confirm: () => seq([N('C5'), N('E5'), N('G5')], 0.05, 'square', 0.22),
  cancel: () => tone({ f: 500, f2: 260, t: 0, d: 0.12, v: 0.2 }),
  error: () => { tone({ f: 180, t: 0, d: 0.09, w: 'sawtooth', v: 0.2 }); tone({ f: 150, t: 0.1, d: 0.12, w: 'sawtooth', v: 0.2 }); },
  open: () => { noise(0, 0.08, 0.15, 3000, 600); tone({ f: 330, f2: 660, t: 0, d: 0.12, w: 'triangle', v: 0.25 }); },
  // 필드
  hoe: () => { noise(0, 0.12, 0.35, 700); tone({ f: 110, f2: 60, t: 0, d: 0.1, w: 'triangle', v: 0.35 }); },
  water: () => { for (let i = 0; i < 4; i++) noise(i * 0.05, 0.08, 0.12, 4500, 1500); },
  axe: () => { noise(0, 0.07, 0.4, 2600); tone({ f: 240, f2: 120, t: 0, d: 0.08, w: 'square', v: 0.25 }); },
  pick: () => { tone({ f: 1500, t: 0, d: 0.05, w: 'square', v: 0.2 }); noise(0, 0.1, 0.3, 5000, 1200); },
  pickup: () => seq([N('E5'), N('B5')], 0.06, 'square', 0.25),
  plant: () => { noise(0, 0.08, 0.2, 1200); tone({ f: 400, f2: 600, t: 0.04, d: 0.08, w: 'triangle', v: 0.2 }); },
  coin: () => { tone({ f: N('B5'), t: 0, d: 0.06, v: 0.25 }); tone({ f: N('E6'), t: 0.06, d: 0.16, v: 0.25 }); },
  door: () => { noise(0, 0.15, 0.25, 800); tone({ f: 180, f2: 120, t: 0.02, d: 0.15, w: 'triangle', v: 0.3 }); },
  warp: () => tone({ f: 300, f2: 900, t: 0, d: 0.25, w: 'triangle', v: 0.2 }),
  splash: () => { noise(0, 0.3, 0.3, 3000, 400); tone({ f: 600, f2: 200, t: 0, d: 0.2, w: 'sine', v: 0.2 }); },
  bite: () => seq([N('A5'), N('A5')], 0.08, 'square', 0.3),
  emote: () => tone({ f: 700, f2: 1100, t: 0, d: 0.1, w: 'triangle', v: 0.25 }),
  eat: () => { for (let i = 0; i < 3; i++) noise(i * 0.12, 0.06, 0.25, 1600); },
  sleep: () => seq([N('G4'), N('E4'), N('C4')], 0.22, 'triangle', 0.25, 0.3),
  phone: () => seq([N('E6'), N('C6'), N('E6'), N('G6')], 0.07, 'square', 0.18),
  item: () => seq([N('C5'), N('E5'), N('G5'), N('C6')], 0.09, 'square', 0.25),
  surprise: () => tone({ f: 900, f2: 1400, t: 0, d: 0.12, w: 'square', v: 0.25 }),
  hop: () => tone({ f: 300, f2: 700, t: 0, d: 0.1, w: 'square', v: 0.18 }),
  dash: () => { noise(0, 0.2, 0.2, 2000, 400); tone({ f: 800, f2: 200, t: 0, d: 0.2, w: 'triangle', v: 0.15 }); },
  // 생활 · 상호작용
  door_wood: () => { ping(150, 205, 0, 0.22, 'sawtooth', 0.05); burst({ d: 0.12, v: 0.18, lp: 700 }); burst({ t: 0.2, d: 0.08, v: 0.22, lp: 500 }); ping(110, 70, 0.2, 0.08, 'triangle', 0.2); },
  door_bell: () => { burst({ d: 0.08, v: 0.12, lp: 900 }); for (const [f, t] of [[N('A6'), 0], [N('E7'), 0.05], [N('A6'), 0.13]] as const) ping(f, undefined, t, 0.45, 'sine', 0.09); },
  door_auto: () => { burst({ d: 0.32, v: 0.14, hp: 900, lp: 5200, a: 0.12 }); ping(880, 1320, 0.02, 0.06, 'sine', 0.06); ping(1320, undefined, 0.09, 0.08, 'sine', 0.05); },
  cave_enter: () => { burst({ d: 0.6, v: 0.18, lp: 420, a: 0.15 }); ping(140, 90, 0.05, 0.4, 'triangle', 0.08); },
  stairs: () => { for (let i = 0; i < 4; i++) { burst({ t: i * 0.09, d: 0.05, v: 0.32, bp: 1500 - i * 150, q: 2 }); } },
  page: () => { burst({ d: 0.06, v: 0.16, hp: 2200, lp: 7000, a: 0.01 }); burst({ t: 0.08, d: 0.05, v: 0.1, hp: 2600, lp: 7000, a: 0.01 }); },
  mailbox: () => { ping(1400, 900, 0, 0.03, 'square', 0.1); burst({ d: 0.05, v: 0.2, bp: 2600, q: 3 }); ping(600, 500, 0.06, 0.05, 'square', 0.06); },
  ship: () => { burst({ d: 0.06, v: 0.14, bp: 1200 }); ping(120, 70, 0.08, 0.14, 'triangle', 0.3); burst({ t: 0.08, d: 0.12, v: 0.25, lp: 500 }); },
  chest: () => { ping(210, 260, 0, 0.14, 'sawtooth', 0.04); burst({ d: 0.1, v: 0.12, lp: 800 }); ping(150, 110, 0.12, 0.06, 'triangle', 0.18); },
  bed: () => { burst({ d: 0.35, v: 0.22, lp: 1400, a: 0.08 }); burst({ t: 0.25, d: 0.3, v: 0.15, lp: 1100, a: 0.08 }); },
  craft_bench: () => { for (const t of [0, 0.14, 0.28]) { ping(1500, 1200, t, 0.03, 'square', 0.12); burst({ t, d: 0.05, v: 0.2, bp: 3000, q: 2 }); } ping(N('G6'), undefined, 0.46, 0.35, 'sine', 0.14); ping(N('C7'), undefined, 0.5, 0.4, 'sine', 0.1); },
  craft_fire: () => { burst({ d: 0.5, v: 0.22, lp: 1300, a: 0.12 }); burst({ t: 0.1, d: 0.3, v: 0.12, bp: 2500, q: 1 }); ping(90, 60, 0, 0.4, 'triangle', 0.14); ping(N('E6'), undefined, 0.55, 0.3, 'sine', 0.12); },
  craft_lab: () => { for (const [f, t] of [[1200, 0], [1600, 0.08], [1200, 0.16], [2000, 0.24]] as const) ping(f, undefined, t, 0.05, 'square', 0.08); burst({ t: 0.05, d: 0.35, v: 0.06, bp: 500, q: 4, a: 0.05 }); ping(N('C7'), undefined, 0.38, 0.3, 'sine', 0.12); },
  harvest: () => { burst({ d: 0.05, v: 0.2, lp: 1800 }); ping(320, 880, 0.02, 0.09, 'sine', 0.22); ping(N('E6'), undefined, 0.1, 0.08, 'square', 0.08); },
  forage: () => { burst({ d: 0.08, v: 0.12, hp: 1800, lp: 6000, a: 0.01 }); ping(760, 1100, 0.07, 0.05, 'triangle', 0.18); },
  rock_break: () => { burst({ d: 0.28, v: 0.4, lp: 1600 }); ping(130, 50, 0, 0.2, 'triangle', 0.3); for (let i = 0; i < 3; i++) burst({ t: 0.08 + i * 0.05, d: 0.04, v: 0.15, bp: 2500 + i * 600, q: 3 }); },
  sparkle: () => { for (const [f, t] of [[N('E6'), 0], [N('B6'), 0.06], [N('E7'), 0.12]] as const) ping(f, undefined, t, 0.2, 'sine', 0.1); },
  cast: () => { burst({ d: 0.22, v: 0.14, hp: 900, lp: 4000, a: 0.06 }); ping(950, 320, 0, 0.22, 'sine', 0.06); },
  plop: () => { ping(900, 280, 0, 0.08, 'sine', 0.2); burst({ t: 0.02, d: 0.12, v: 0.1, hp: 600, lp: 3000 }); },
  reel: () => { for (let i = 0; i < 10; i++) burst({ t: i * 0.035, d: 0.02, v: 0.28, bp: 3200, q: 3 }); },
  fish_catch: () => { burst({ d: 0.25, v: 0.25, hp: 400, lp: 3500 }); seq([0, N('C5'), N('E5'), N('G5'), N('C6')], 0.07, 'square', 0.2); },
  fish_lose: () => { burst({ d: 0.3, v: 0.2, hp: 300, lp: 2200 }); ping(400, 180, 0.05, 0.25, 'triangle', 0.15); },
  potion: () => { ping(600, 1400, 0, 0.06, 'sine', 0.18); burst({ t: 0.06, d: 0.15, v: 0.08, bp: 3000, q: 2 }); seq([0, N('G6'), N('C7')], 0.06, 'sine', 0.1); },
  bin_lid: () => { ping(260, 200, 0, 0.06, 'square', 0.06); burst({ d: 0.05, v: 0.14, lp: 900 }); },
  sit: () => { burst({ d: 0.12, v: 0.12, lp: 900, a: 0.02 }); ping(140, 110, 0.02, 0.08, 'triangle', 0.08); },
  heal_machine: () => { for (let i = 0; i < 4; i++) ping(N('C6') * (1 + i * 0.26), undefined, i * 0.1, 0.09, 'triangle', 0.12); },
  shop_buy: () => { ping(N('A6'), undefined, 0, 0.1, 'sine', 0.12); ping(N('E7'), undefined, 0.07, 0.25, 'sine', 0.12); burst({ d: 0.05, v: 0.1, bp: 3000, q: 3 }); },
  piano: () => seq([N('C5'), N('E5'), N('G5'), N('E5'), N('C6')], 0.12, 'triangle', 0.18, 0.2),
  phone_open: () => { ping(N('C6'), undefined, 0, 0.05, 'sine', 0.1); ping(N('G6'), undefined, 0.05, 0.08, 'sine', 0.1); burst({ d: 0.04, v: 0.06, bp: 4000, q: 3 }); },
  phone_close: () => { ping(N('G6'), undefined, 0, 0.05, 'sine', 0.08); ping(N('C6'), undefined, 0.05, 0.07, 'sine', 0.08); },
  roar: () => { ping(140, 70, 0, 0.9, 'sawtooth', 0.16); ping(210, 95, 0.02, 0.85, 'square', 0.07); burst({ d: 0.9, v: 0.3, lp: 900, a: 0.08 }); ping(420, 180, 0.1, 0.6, 'sawtooth', 0.05); },
  unfold: () => { burst({ d: 0.05, v: 0.12, bp: 2400, q: 3 }); ping(420, 640, 0.05, 0.18, 'triangle', 0.07); burst({ t: 0.42, d: 0.04, v: 0.2, bp: 3200, q: 4 }); ping(1320, undefined, 0.44, 0.05, 'square', 0.06); },
  horn: () => { for (const [f, t, d] of [[196, 0, 0.55], [247, 0.05, 0.5], [196, 0.75, 0.9], [247, 0.8, 0.85]] as const) ping(f, f * 0.99, t, d, 'sawtooth', 0.05); burst({ d: 1.2, v: 0.06, lp: 500, a: 0.3 }); },
  waves: () => { for (let i = 0; i < 3; i++) burst({ t: i * 0.5, d: 0.6, v: 0.12, lp: 900, hp: 150, a: 0.25 }); },
  ocarina: () => { const notes = [N('D5'), N('F5'), N('A5'), N('D6'), N('C6'), N('A5'), N('G5'), N('A5')]; notes.forEach((f, i) => ping(f, undefined, i * 0.32, 0.36, 'sine', 0.13)); notes.forEach((f, i) => ping(f * 2, undefined, i * 0.32 + 0.01, 0.2, 'sine', 0.02)); },
  tap: () => { burst({ d: 0.015, v: 0.08, bp: 4200, q: 3 }); ping(1800, undefined, 0, 0.015, 'sine', 0.03); },
  // 배틀
  encounter: () => { for (let i = 0; i < 6; i++) tone({ f: i % 2 ? 660 : 880, t: i * 0.06, d: 0.05, v: 0.22 }); },
  hit: () => { noise(0, 0.12, 0.45, 1800); tone({ f: 160, f2: 60, t: 0, d: 0.12, w: 'square', v: 0.3 }); },
  superHit: () => { noise(0, 0.22, 0.55, 3200); tone({ f: 220, f2: 50, t: 0, d: 0.22, w: 'sawtooth', v: 0.35 }); },
  weakHit: () => noise(0, 0.08, 0.25, 900),
  buff: () => seq([N('C5'), N('G5'), N('C6')], 0.06, 'triangle', 0.25),
  debuff: () => seq([N('C6'), N('G5'), N('C5')], 0.06, 'triangle', 0.25),
  heal: () => seq([N('C5'), N('E5'), N('G5'), N('C6'), N('E6')], 0.07, 'triangle', 0.25),
  faint: () => tone({ f: 500, f2: 60, t: 0, d: 0.5, w: 'square', v: 0.25 }),
  throw: () => tone({ f: 300, f2: 1200, t: 0, d: 0.3, w: 'triangle', v: 0.2 }),
  shake: () => { tone({ f: 200, t: 0, d: 0.05, v: 0.2 }); tone({ f: 160, t: 0.08, d: 0.05, v: 0.2 }); },
  catch: () => seq([N('G4'), N('C5'), N('E5'), N('G5'), 0, N('E5'), N('G5')], 0.1, 'square', 0.28),
  levelup: () => seq([N('C5'), N('D5'), N('E5'), N('G5'), N('C6')], 0.08, 'square', 0.28),
  win: () => seq([N('G4'), N('C5'), N('E5'), N('G5'), 0, N('E5'), N('G5'), N('C6')], 0.11, 'square', 0.28),
  send: () => tone({ f: 400, f2: 1000, t: 0, d: 0.15, w: 'triangle', v: 0.25 }),
};

export type SfxName = keyof typeof SOUNDS;
export const sfx = {
  play(name: string) { try { SOUNDS[name]?.(); } catch { /* 오디오 미지원 */ } },
  get muted() { return muted; },
  /** 내 캐릭터 발소리 (run: 달리기면 조금 크고 높게) */
  step(surface: Surface, run = false) {
    if (!stepsOn || muted) return;
    try { const c = ac(); if (!c || !stepBus) return; STEPS[surface]?.((1 + (Math.random() - 0.5) * 0.12) * (run ? 1.05 : 1), (0.9 + Math.random() * 0.2) * (run ? 1.25 : 1), stepBus); } catch { /* 오디오 미지원 */ }
  },
  get stepsOn() { return stepsOn; },
  setSteps(on: boolean) { stepsOn = on; try { localStorage.setItem('sf:steps', on ? '1' : '0'); } catch { /* 무시 */ } },
  setMuted(m: boolean) { muted = m; try { localStorage.setItem('sf:mute', m ? '1' : '0'); } catch { /* 무시 */ } if (sfxBus) sfxBus.gain.value = m ? 0 : 0.32; },
};

/** 음악 모듈이 같은 오디오 컨텍스트를 쓰도록 (첫 입력 전에는 null) */
export const audioOut = () => { const c = ac(); return c && master ? { ctx: c, out: master, noise: noiseBuf! } : null; };
