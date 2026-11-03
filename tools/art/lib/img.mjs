// 의존성 없는 픽셀 이미지 + PNG 인코더 (Node 내장 zlib만 사용)
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/** '#rrggbb' | '#rrggbbaa' | [r,g,b,a] → [r,g,b,a] */
export function rgba(c) {
  if (Array.isArray(c)) return c.length === 4 ? c : [...c, 255];
  const h = c.replace('#', '');
  const n = parseInt(h.slice(0, 6), 16);
  const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export function mix(a, b, t) {
  const A = rgba(a), B = rgba(b);
  return A.map((v, i) => Math.round(v + (B[i] - v) * t));
}
export const darken = (c, t) => { const A = rgba(c); return [A[0] * (1 - t), A[1] * (1 - t), A[2] * (1 - t), A[3]].map(Math.round); };
export const lighten = (c, t) => mix(c, '#ffffff', t).map((v, i) => (i === 3 ? rgba(c)[3] : v));
export const withAlpha = (c, a) => { const A = rgba(c); return [A[0], A[1], A[2], Math.round(a * 255)]; };

export class Img {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.d = new Uint8ClampedArray(w * h * 4);
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x, y) {
    if (!this.inb(x, y)) return [0, 0, 0, 0];
    const i = (y * this.w + x) * 4; const d = this.d;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }
  alpha(x, y) { return this.inb(x, y) ? this.d[(y * this.w + x) * 4 + 3] : 0; }
  /** 알파 블렌딩으로 픽셀 찍기 */
  set(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inb(x, y) || c == null) return;
    const [r, g, b, a] = rgba(c);
    const i = (y * this.w + x) * 4; const d = this.d;
    if (a >= 255 || d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; return; }
    if (a === 0) return;
    const sa = a / 255, da = d[i + 3] / 255, oa = sa + da * (1 - sa);
    d[i] = (r * sa + d[i] * da * (1 - sa)) / oa;
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / oa;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / oa;
    d[i + 3] = oa * 255;
  }
  /** 블렌딩 없이 덮어쓰기 (투명 지우기 포함) */
  put(x, y, c) {
    if (!this.inb(x, y)) return;
    const [r, g, b, a] = rgba(c); const i = (y * this.w + x) * 4;
    this.d[i] = r; this.d[i + 1] = g; this.d[i + 2] = b; this.d[i + 3] = a;
  }
  clear(x, y) { this.put(x, y, [0, 0, 0, 0]); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  hline(x, y, w, c) { this.rect(x, y, w, 1, c); }
  vline(x, y, h, c) { this.rect(x, y, 1, h, c); }
  line(x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }
  circle(cx, cy, r, c) { this.ellipse(cx, cy, r, r, c); }
  /** 모서리 1px 깎은 사각형 */
  rrect(x, y, w, h, c, r = 1) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const cx = i < r ? r - i : i >= w - r ? i - (w - 1 - r) : 0;
      const cy = j < r ? r - j : j >= h - r ? j - (h - 1 - r) : 0;
      if (cx + cy > r) continue;
      this.set(x + i, y + j, c);
    }
  }
  /** 다른 이미지 합성 (flipX 지원) */
  blit(src, dx, dy, { flipX = false, sx = 0, sy = 0, sw = src.w, sh = src.h, tint = null, alphaMul = 1 } = {}) {
    for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
      const px = src.get(sx + (flipX ? sw - 1 - i : i), sy + j);
      if (px[3] === 0) continue;
      let c = px;
      if (tint) c = mix(px, tint[0], tint[1]);
      if (alphaMul !== 1) c = [c[0], c[1], c[2], Math.round(c[3] * alphaMul)];
      this.set(dx + i, dy + j, c);
    }
  }
  clone() { const o = new Img(this.w, this.h); o.d.set(this.d); return o; }
  /**
   * 선택적 외곽선(sel-out): 투명 픽셀 중 불투명 이웃이 있으면 이웃 색을 어둡게 해서 칠함
   * base: 외곽선 기준 어두운 색, 이웃색과 섞어 자연스러운 라인
   */
  outline(base = '#2a1b14', t = 0.55, { diag = false, region = null } = {}) {
    const src = this.clone();
    const [x0, y0, x1, y1] = region ?? [0, 0, this.w, this.h];
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const n8 = [...n4, [1, 1], [-1, 1], [1, -1], [-1, -1]];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      if (src.alpha(x, y) > 0) continue;
      let best = null;
      for (const [dx, dy] of diag ? n8 : n4) {
        const nx = x + dx, ny = y + dy;
        if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
        const p = src.get(nx, ny);
        if (p[3] > 160) { best = p; break; }
      }
      if (best) this.put(x, y, mix(darken(best, 0.62), base, t));
    }
    return this;
  }
  toPNG() {
    const { w, h, d } = this;
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) {
      raw[y * (w * 4 + 1)] = 0;
      Buffer.from(d.buffer, d.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
    }
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
  save(path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, this.toPNG()); return this; }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return c ^ 0xffffffff; }

// ── 결정론적 랜덤 & 노이즈 ───────────────────────────────
export function hash2(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return ((h >>> 0) % 100000) / 100000;
}
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
/** 주기적(타일러블) 밸류 노이즈 */
export function vnoise(x, y, period, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const P = (a) => ((a % period) + period) % period;
  const s = (t) => t * t * (3 - 2 * t);
  const v00 = hash2(P(xi), P(yi), seed), v10 = hash2(P(xi + 1), P(yi), seed);
  const v01 = hash2(P(xi), P(yi + 1), seed), v11 = hash2(P(xi + 1), P(yi + 1), seed);
  const a = v00 + (v10 - v00) * s(fx), b = v01 + (v11 - v01) * s(fx);
  return a + (b - a) * s(fy);
}
export function fbm(x, y, period, seed = 0, oct = 3) {
  let v = 0, amp = 0.5, f = 1, tot = 0;
  for (let o = 0; o < oct; o++) { v += vnoise(x * f, y * f, period * f, seed + o * 31) * amp; tot += amp; amp *= 0.5; f *= 2; }
  return v / tot;
}
