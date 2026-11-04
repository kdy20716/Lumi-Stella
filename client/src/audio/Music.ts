// 배경음악: 파일 없이 WebAudio 로 실시간 합성하는 작은 시퀀서
//  - 휴대용 게임기 시절 RPG 느낌: 펄스파 리드 · 금관 · 현악 패드 · 삼각파 베이스 · 노이즈 드럼 + 스테레오 에코
//  - 곡은 tracks.ts 에 악보(문자열)로 들어 있음. 모두 이 게임을 위해 새로 쓴 곡
//  - 맵/시간/배틀 종류에 맞춰 곡을 고르고(trackFor), 바뀔 때는 짧게 페이드
import { audioOut } from './Sfx';
import { TRACKS, type Track, type Part, type Inst } from './tracks';

const NOTE = /^([A-G])(#|b)?(\d)$/;
const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const midi = (n: string) => { const m = NOTE.exec(n); if (!m) return null; return 12 * (Number(m[3]) + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const hz = (m: number) => 440 * 2 ** ((m - 69) / 12);

// ── 화음 ────────────────────────────────────────────────
const QUAL: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], sus4: [0, 5, 7], dim: [0, 3, 6], aug: [0, 4, 8], add9: [0, 4, 7, 14],
};
function chord(name: string) {
  const m = /^([A-G])(#|b)?(maj7|m7|sus4|dim|aug|add9|m|7)?$/.exec(name);
  if (!m) throw new Error(`화음 표기 오류: ${name}`);
  const root = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return { root, tones: QUAL[m[3] ?? ''] };
}

interface Ev { t: number; d: number; m: number; inst: Inst; v: number; pan: number; drum?: string }

/** 악보 → 이벤트 (단위: 16분음표 칸) */
function parseSeq(seq: string, part: Part, out: Ev[]) {
  let t = 0;
  for (const tok of seq.split(/[\s|]+/).filter(Boolean)) {
    const [n, d0] = tok.split(':'); const d = Number(d0 ?? 1);
    if (n !== '-' && n !== 'r') {
      for (const one of n.split('+')) { const m = midi(one); if (m === null) throw new Error(`음표 표기 오류: ${tok}`); out.push({ t, d, m: m + 12 * (part.oct ?? 0), inst: part.inst, v: part.vol ?? 1, pan: part.pan ?? 0 }); }
    }
    t += d;
  }
  return t;
}

/** 화음 진행으로 반주 자동 생성 (베이스 · 아르페지오 · 패드 · 스탭) */
function genPart(track: Track, part: Part, out: Ev[]) {
  const prog = (track.chords ?? '').split(/\s+/).filter(Boolean).map((c) => { const [n, d] = c.split(':'); return { ...chord(n), d: Number(d ?? 16) }; });
  let t = 0;
  const o = part.oct ?? 0, v = part.vol ?? 1, pan = part.pan ?? 0, inst = part.inst;
  const push = (tt: number, d: number, m: number, vv = v) => out.push({ t: tt, d, m: m + 12 * o, inst, v: vv, pan });
  for (const c of prog) {
    const bass = 36 + c.root, mid = 60 + c.root;
    const tones = c.tones.map((x) => mid + x);
    switch (part.gen) {
      case 'bass-half': for (let i = 0; i < c.d; i += 8) push(t + i, Math.min(8, c.d - i), i % 16 ? bass + 7 : bass); break;
      case 'bass-8': for (let i = 0; i < c.d; i += 2) push(t + i, 2, i % 4 === 2 ? bass + 12 : bass, i % 4 ? v * 0.8 : v); break;
      case 'bass-pump': for (let i = 0; i < c.d; i += 4) { push(t + i, 2, bass); if (i + 3 < c.d) push(t + i + 3, 1, bass + 12, v * 0.7); } break;
      case 'bass-walk': { const w = [0, 7, 12, 7, 0, 4, 7, 9]; for (let i = 0, k = 0; i < c.d; i += 2, k++) push(t + i, 2, bass + (c.tones[1] === 3 && w[k % 8] === 4 ? 3 : c.tones[1] === 3 && w[k % 8] === 9 ? 10 : w[k % 8]), k % 2 ? v * 0.75 : v); break; }
      case 'bass-gallop': for (let i = 0; i < c.d; i += 4) { push(t + i, 1, bass); push(t + i + 1, 1, bass, v * 0.7); push(t + i + 2, 2, i % 8 ? bass + 7 : bass + 12, v * 0.85); } break;
      case 'arp16': { const seq = [...tones, tones[0] + 12, ...tones.slice(1).reverse()]; for (let i = 0; i < c.d; i++) push(t + i, 1, seq[i % seq.length], v * (i % 4 ? 0.7 : 1)); break; }
      case 'arp8': { const seq = [tones[0], tones[1], tones[2], tones[1]]; for (let i = 0; i < c.d; i += 2) push(t + i, 2, seq[(i / 2) % 4] + 12, v * ((i / 2) % 2 ? 0.75 : 1)); break; }
      case 'pad': for (const m of tones.slice(0, 4)) push(t, c.d, m); break;
      case 'stab': for (let i = 0; i < c.d; i += 8) for (const m of tones.slice(0, 3)) { push(t + i + 0, 1, m); push(t + i + 3, 1, m, v * 0.8); } break;
      case 'offbeat': for (let i = 2; i < c.d; i += 4) for (const m of tones.slice(0, 3)) push(t + i, 1, m + 12, v * 0.8); break;
    }
    t += c.d;
  }
  return t;
}

function compile(track: Track) {
  const evs: Ev[] = [];
  const len = track.bars * 16;
  for (const part of track.parts) {
    const n = part.gen ? genPart(track, part, evs) : parseSeq(part.seq ?? '', part, evs);
    if (n !== len && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) console.warn(`[music] ${track.id}: 파트 길이 ${n} ≠ ${len}`, part.inst, part.gen ?? '');
  }
  if (track.drums?.length) {
    for (let b = 0; b < track.bars; b++) {
      const pat = track.drums[b % track.drums.length];
      for (let i = 0; i < 16; i++) { const ch = pat[i]; if (ch && ch !== '.') evs.push({ t: b * 16 + i, d: 1, m: 0, inst: 'drum', v: 1, pan: 0, drum: ch }); }
    }
  }
  evs.sort((a, b) => a.t - b.t);
  return { evs, len };
}

// ── 악기 ────────────────────────────────────────────────
const waves = new Map<string, PeriodicWave>();
function pulse(c: BaseAudioContext, duty: number) {
  const k = `p${duty}:${c.sampleRate}:${(c as { __id?: number }).__id ??= Math.random()}`; if (waves.has(k)) return waves.get(k)!;
  const n = 32, re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 1; i < n; i++) im[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
  const w = c.createPeriodicWave(re, im); waves.set(k, w); return w;
}
function organWave(c: BaseAudioContext) {
  const k = `organ:${(c as { __id?: number }).__id ??= Math.random()}`;
  if (waves.has(k)) return waves.get(k)!;
  const re = new Float32Array(8), im = new Float32Array([0, 1, 0.5, 0.33, 0.2, 0.1, 0.05, 0.03]);
  const w = c.createPeriodicWave(re, im); waves.set(k, w); return w;
}

const VOL: Record<Inst, number> = { lead: 0.16, lead2: 0.13, pulse: 0.07, brass: 0.11, strings: 0.06, bass: 0.26, sbass: 0.12, bell: 0.14, flute: 0.16, pluck: 0.15, organ: 0.07, drum: 1 };
const SEND: Partial<Record<Inst, number>> = { lead: 0.25, lead2: 0.2, bell: 0.45, flute: 0.35, pluck: 0.3, pulse: 0.2, strings: 0.2, organ: 0.35, brass: 0.15 };

class Engine {
  private c: BaseAudioContext; private bus: GainNode; private filter: BiquadFilterNode; private delay: DelayNode; private send: GainNode; private noise: AudioBuffer;
  private timer = 0; private cur: { track: Track; evs: Ev[]; len: number; step: number; t0: number; idx: number; loopN: number } | null = null;
  private voices: AudioScheduledSourceNode[] = [];
  volume = 0.55;
  constructor(o: { ctx: BaseAudioContext; out: AudioNode; noise: AudioBuffer }) {
    this.c = o.ctx; this.noise = o.noise;
    this.bus = this.c.createGain(); this.bus.gain.value = 0;
    this.filter = this.c.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.frequency.value = 18000;
    this.bus.connect(this.filter).connect(o.out);
    // 스테레오 에코 (리버브 대용)
    this.send = this.c.createGain(); this.send.gain.value = 1;
    this.delay = this.c.createDelay(1); this.delay.delayTime.value = 0.21;
    const fb = this.c.createGain(); fb.gain.value = 0.32;
    const dl = this.c.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2600;
    const wet = this.c.createGain(); wet.gain.value = 0.35;
    const pan = this.c.createStereoPanner(); pan.pan.value = 0.35;
    this.send.connect(this.delay).connect(dl).connect(fb).connect(this.delay);
    dl.connect(wet).connect(pan).connect(this.bus);
  }

  play(track: Track, night = false) {
    this.stopVoices(0.4);
    const { evs, len } = compile(track);
    const bpm = track.bpm * (night && track.night !== false ? 0.92 : 1);
    const step = 60 / bpm / 4;
    const now = this.c.currentTime + 0.08;
    this.cur = { track, evs, len, step, t0: now, idx: 0, loopN: 0 };
    this.delay.delayTime.setValueAtTime(Math.min(0.9, step * 3), now);
    const g = this.bus.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(this.volume, now + 0.5);
    this.filter.frequency.setTargetAtTime(night && track.night !== false ? 2200 : 18000, now, 0.4);
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.pump(), 25);
    this.pump();
  }
  /** 끝내기 (페이드 아웃) */
  stop(fade = 0.6) {
    clearInterval(this.timer); this.cur = null;
    const now = this.c.currentTime, g = this.bus.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + fade);
    this.stopVoices(fade);
  }
  /** 오프라인 렌더링용: 정해진 길이만큼 한 번에 예약 */
  renderAll(track: Track, seconds: number) {
    const { evs, len } = compile(track); const step = 60 / track.bpm / 4;
    this.bus.gain.value = this.volume; this.delay.delayTime.value = Math.min(0.9, step * 3);
    for (let t0 = 0.05; t0 < seconds; t0 += len * step) { for (const e of evs) { const at = t0 + e.t * step; if (at < seconds) this.note(e, at, e.d * step); } if (track.once) break; }
  }
  setVolume(v: number) { this.volume = v; if (this.cur) this.bus.gain.setTargetAtTime(v, this.c.currentTime, 0.05); }
  get playing() { return this.cur?.track.id ?? null; }

  private stopVoices(after: number) {
    const t = this.c.currentTime + after;
    for (const v of this.voices) { try { v.stop(t); } catch { /* 이미 멈춤 */ } }
    this.voices = [];
  }

  private pump() {
    const s = this.cur; if (!s) return;
    const until = this.c.currentTime + 0.18;
    for (;;) {
      if (s.idx >= s.evs.length) {
        if (s.track.once) { const end = s.t0 + s.len * s.step; if (until >= end) { const cb = this.onEnd; this.cur = null; clearInterval(this.timer); window.setTimeout(() => cb?.(), Math.max(0, (end - this.c.currentTime) * 1000)); } return; }
        s.idx = 0; s.loopN++; s.t0 += s.len * s.step;
      }
      const e = s.evs[s.idx]; const at = s.t0 + e.t * s.step;
      if (at > until) break;
      if (at >= this.c.currentTime - 0.02) this.note(e, at, e.d * s.step);
      s.idx++;
    }
    // 끝난 보이스 정리
    if (this.voices.length > 400) this.voices = this.voices.slice(-200);
  }
  onEnd: (() => void) | null = null;

  private out(inst: Inst, panV: number, at: number) {
    const g = this.c.createGain(); g.gain.value = 0;
    const p = this.c.createStereoPanner(); p.pan.value = panV;
    g.connect(p).connect(this.bus);
    const sv = SEND[inst]; if (sv) { const sg = this.c.createGain(); sg.gain.value = sv; p.connect(sg).connect(this.send); }
    void at; return g;
  }
  private env(g: GainNode, at: number, d: number, peak: number, a: number, sus: number, rel: number, decay = 0.12) {
    const gg = g.gain;
    gg.setValueAtTime(0.0001, at); gg.linearRampToValueAtTime(peak, at + a);
    gg.setTargetAtTime(peak * sus, at + a, decay);
    gg.setValueAtTime(peak * sus, at + Math.max(a, d));
    gg.setTargetAtTime(0.0001, at + Math.max(a, d), rel / 3);
    return at + Math.max(a, d) + rel;
  }
  private osc(type: OscillatorType | PeriodicWave, f: number, at: number, end: number, detune = 0) {
    const o = this.c.createOscillator();
    if (type instanceof PeriodicWave) o.setPeriodicWave(type); else o.type = type;
    o.frequency.setValueAtTime(f, at); o.detune.value = detune; o.start(at); o.stop(end + 0.05); this.voices.push(o);
    return o;
  }
  private vibrato(o: OscillatorNode, at: number, d: number, depth = 12) {
    if (d < 0.28) return;
    const l = this.c.createOscillator(), lg = this.c.createGain();
    l.frequency.value = 5.6; lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(depth, at + Math.min(0.35, d * 0.6));
    l.connect(lg).connect(o.detune); l.start(at); l.stop(at + d + 0.3); this.voices.push(l);
  }

  private note(e: Ev, at: number, d: number) {
    if (e.inst === 'drum') { this.drum(e.drum!, at); return; }
    const f = hz(e.m), vol = VOL[e.inst] * e.v;
    const g = this.out(e.inst, e.pan, at);
    switch (e.inst) {
      case 'lead': case 'lead2': case 'pulse': {
        const end = this.env(g, at, d * 0.92, vol, 0.006, e.inst === 'pulse' ? 0.55 : 0.75, 0.07);
        const o = this.osc(pulse(this.c, e.inst === 'lead' ? 0.25 : e.inst === 'lead2' ? 0.5 : 0.125), f, at, end);
        if (e.inst !== 'pulse') this.vibrato(o, at, d);
        o.connect(g); break;
      }
      case 'brass': {
        const lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
        lp.frequency.setValueAtTime(500, at); lp.frequency.linearRampToValueAtTime(3600, at + 0.04); lp.frequency.setTargetAtTime(1800, at + 0.05, 0.15);
        const end = this.env(g, at, d * 0.9, vol, 0.025, 0.8, 0.09);
        for (const dt of [-7, 7]) { const o = this.osc('sawtooth', f, at, end, dt); o.connect(lp); if (dt > 0) this.vibrato(o, at, d, 8); }
        lp.connect(g); break;
      }
      case 'strings': {
        const lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
        const end = this.env(g, at, d, vol, Math.min(0.18, d * 0.4), 0.9, 0.35, 0.3);
        for (const dt of [-9, 0, 9]) this.osc('sawtooth', f, at, end, dt).connect(lp);
        lp.connect(g); break;
      }
      case 'organ': {
        const end = this.env(g, at, d, vol, 0.08, 0.9, 0.4, 0.3);
        this.osc(organWave(this.c), f, at, end).connect(g); this.osc('sine', f / 2, at, end).connect(g); break;
      }
      case 'bass': {
        const lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        const end = this.env(g, at, d * 0.85, vol, 0.004, 0.7, 0.04, 0.09);
        this.osc('triangle', f, at, end).connect(lp);
        const sq = this.c.createGain(); sq.gain.value = 0.12; this.osc(pulse(this.c, 0.5), f, at, end).connect(sq).connect(lp);
        lp.connect(g); break;
      }
      case 'sbass': {
        const lp = this.c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 4;
        lp.frequency.setValueAtTime(1600, at); lp.frequency.setTargetAtTime(420, at, 0.06);
        const end = this.env(g, at, d * 0.85, vol, 0.004, 0.8, 0.04);
        this.osc('sawtooth', f, at, end).connect(lp); lp.connect(g); break;
      }
      case 'bell': {
        const end = at + Math.max(0.6, d * 1.6);
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.004); g.gain.setTargetAtTime(0.0001, at + 0.01, Math.max(0.15, d * 0.45));
        this.osc('sine', f, at, end).connect(g);
        const h = this.c.createGain(); h.gain.setValueAtTime(0.35, at); h.gain.setTargetAtTime(0.0001, at, 0.08); this.osc('sine', f * 4, at, end).connect(h).connect(g);
        const h2 = this.c.createGain(); h2.gain.value = 0.18; this.osc('triangle', f * 2, at, end).connect(h2).connect(g); break;
      }
      case 'pluck': {
        const end = at + Math.max(0.25, d * 0.9);
        g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(vol, at + 0.003); g.gain.setTargetAtTime(0.0001, at + 0.01, 0.09);
        this.osc('triangle', f, at, end).connect(g);
        const h = this.c.createGain(); h.gain.setValueAtTime(0.5, at); h.gain.setTargetAtTime(0.0001, at, 0.03); this.osc('sine', f * 3, at, end).connect(h).connect(g); break;
      }
      case 'flute': {
        const end = this.env(g, at, d * 0.95, vol, 0.05, 0.85, 0.12, 0.2);
        const o = this.osc('triangle', f, at, end); this.vibrato(o, at, d, 10); o.connect(g);
        const s2 = this.c.createGain(); s2.gain.value = 0.25; this.osc('sine', f * 2, at, end).connect(s2).connect(g); break;
      }
    }
  }

  private drum(k: string, at: number) {
    const c = this.c;
    const g = c.createGain(); g.connect(this.bus);
    const noise = (dur: number, type: BiquadFilterType, freq: number, vol: number) => {
      const s = c.createBufferSource(); s.buffer = this.noise; const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
      const ng = c.createGain(); ng.gain.setValueAtTime(vol, at); ng.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      s.connect(f).connect(ng).connect(g); s.start(at); s.stop(at + dur + 0.02); this.voices.push(s);
    };
    const thump = (f0: number, f1: number, dur: number, vol: number, type: OscillatorType = 'sine') => {
      const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
      const og = c.createGain(); og.gain.setValueAtTime(vol, at); og.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      o.connect(og).connect(g); o.start(at); o.stop(at + dur + 0.02); this.voices.push(o);
    };
    switch (k) {
      case 'k': thump(150, 42, 0.16, 0.5); break;                                   // 킥
      case 's': noise(0.14, 'bandpass', 1900, 0.32); thump(220, 140, 0.07, 0.18, 'triangle'); break; // 스네어
      case 'S': noise(0.1, 'bandpass', 2400, 0.16); break;                           // 약한 스네어(고스트)
      case 'h': noise(0.035, 'highpass', 7500, 0.09); break;                         // 닫힌 하이햇
      case 'o': noise(0.18, 'highpass', 6500, 0.08); break;                          // 열린 하이햇
      case 't': thump(180, 90, 0.2, 0.32); break;                                    // 탐
      case 'T': thump(120, 60, 0.26, 0.34); break;                                   // 낮은 탐
      case 'c': noise(0.9, 'highpass', 5200, 0.12); break;                           // 심벌
      case 'x': noise(0.05, 'bandpass', 900, 0.14); break;                           // 셰이커/림
    }
  }
}

// ── 공개 API ────────────────────────────────────────────
let engine: Engine | null = null;
let musicOn = (() => { try { return localStorage.getItem('sf:music') !== '0'; } catch { return true; } })();
let want: { id: string; night: boolean } | null = null;
let resumeAfterJingle: { id: string; night: boolean } | null = null;

function ensure() {
  if (engine) return engine;
  const o = audioOut(); if (!o) return null;
  engine = new Engine(o);
  return engine;
}
function start(id: string, night: boolean) {
  const e = ensure(); if (!e || !musicOn) return;
  const t = TRACKS[id]; if (!t) return;
  e.onEnd = null;
  e.play(t, night);
}
// 브라우저 자동재생 정책: 첫 입력 때 원하던 곡을 시작
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { if (want && !engine?.playing && musicOn) start(want.id, want.night); }, { passive: true });

export const music = {
  /** 곡 재생 (같은 곡·같은 밤낮이면 이어서) */
  play(id: string, night = false) {
    if (want?.id === id && want.night === night && engine?.playing === id) return;
    want = { id, night }; resumeAfterJingle = null;
    start(id, night);
  },
  /** 짧은 곡을 한 번 연주한 뒤 원래 곡으로 */
  jingle(id: string) {
    const e = ensure(); const t = TRACKS[id]; if (!e || !t || !musicOn) return;
    resumeAfterJingle = want;
    e.play(t);
    e.onEnd = () => { const r = resumeAfterJingle; resumeAfterJingle = null; if (r) { want = r; start(r.id, r.night); } };
  },
  stop() { want = null; engine?.stop(); },
  get on() { return musicOn; },
  setOn(v: boolean) {
    musicOn = v; try { localStorage.setItem('sf:music', v ? '1' : '0'); } catch { /* 무시 */ }
    if (!v) engine?.stop(0.3); else if (want) start(want.id, want.night);
  },
  get current() { return want?.id ?? null; },
};

// ── 장소 → 곡 ──────────────────────────────────────────
export interface PlaceInfo { id: string; kind: string; biome: string; tier: number; interior?: boolean }
export function trackFor(p: PlaceInfo): string {
  const id = p.id;
  if (id === 'farm' || id === 'town') return 'hometown';
  if (id === 'in_center') return 'center';
  if (id.startsWith('gym') || id === 'in_gym' || id === 'league' || id === 'tower') return 'gym';
  if (id === 'origin' || id === 'chateau' || id === 'altar' || id === 'distortion') return 'legend';
  if (p.interior || p.kind === 'room') return 'lab';
  if (p.kind === 'cave') return 'cave';
  if (p.kind === 'town') return p.biome === 'city' ? 'city' : p.biome === 'snow' ? 'snow' : p.biome === 'beach' ? 'harbor' : 'town';
  if (p.kind === 'area') return id.endsWith('_lake') || p.biome === 'forest' || p.biome === 'swamp' || p.biome === 'snow' ? 'mystic' : p.biome === 'beach' ? 'harbor' : 'route2';
  if (p.kind === 'route') return p.tier >= 4 || ['rocky', 'snow', 'desert', 'volcano'].includes(p.biome) ? 'route2' : 'route';
  return 'route';
}
/** 배틀 상대 → 곡 */
export function battleTrack(kind: 'wild' | 'trainer', title = '') {
  if (kind === 'wild') return 'battle_wild';
  if (/챔피언|사천왕/.test(title)) return 'battle_champion';
  if (/관장/.test(title)) return 'battle_leader';
  return 'battle_trainer';
}

/** (개발용) 곡을 오디오 버퍼로 렌더링 — 음량 점검·미리듣기 파일 만들 때 */
export async function renderOffline(id: string, seconds: number, rate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * rate), rate);
  const noise = ctx.createBuffer(1, rate / 2, rate); const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const master = ctx.createGain(); master.connect(ctx.destination);
  new Engine({ ctx, out: master, noise }).renderAll(TRACKS[id], seconds);
  return ctx.startRendering();
}
