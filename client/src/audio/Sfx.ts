// 효과음: 파일 없이 WebAudio 로 바로 합성 (8비트 게임기 느낌)
//  - 첫 클릭/키 입력 때 오디오가 켜짐 (브라우저 자동재생 정책)
type Wave = OscillatorType;
interface Tone { f: number; f2?: number; t: number; d: number; w?: Wave; v?: number }

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = (() => { try { return localStorage.getItem('sf:mute') === '1'; } catch { return false; } })();
let noiseBuf: AudioBuffer | null = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.32; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => ac(), { once: false, passive: true });

function tone({ f, f2, t, d, w = 'square', v = 0.5 }: Tone) {
  const c = ac(); if (!c || !master || muted) return;
  const o = c.createOscillator(), g = c.createGain();
  const t0 = c.currentTime + t;
  o.type = w; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + d);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g).connect(master); o.start(t0); o.stop(t0 + d + 0.02);
}
function noise(t: number, d: number, v = 0.4, lp = 2400, hp = 0) {
  const c = ac(); if (!c || !master || !noiseBuf || muted) return;
  const s = c.createBufferSource(); s.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
  const g = c.createGain(); const t0 = c.currentTime + t;
  g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  let node: AudioNode = s.connect(f);
  if (hp) { const h = c.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp; node = node.connect(h); }
  node.connect(g).connect(master); s.start(t0); s.stop(t0 + d + 0.02);
}
const seq = (notes: number[], step: number, w: Wave = 'square', v = 0.35, len = step * 0.9) => notes.forEach((f, i) => f && tone({ f, t: i * step, d: len, w, v }));
const N = (n: string) => { const m = /^([A-G])(#?)(\d)$/.exec(n)!; const i = 'C D EF G A B'.indexOf(m[1]) + (m[2] ? 1 : 0); return 440 * 2 ** ((i - 9) / 12 + (Number(m[3]) - 4)); };

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
  step: () => noise(0, 0.05, 0.08, 900),
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
  setMuted(m: boolean) { muted = m; try { localStorage.setItem('sf:mute', m ? '1' : '0'); } catch { /* 무시 */ } if (master) master.gain.value = m ? 0 : 0.32; },
};
