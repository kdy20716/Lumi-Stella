// 전설 · 환상 루미의 큰 그림 (배틀용 96px) + 필드용 32px 시트
//   모양을 0..96 설계 좌표로 정의하고 원하는 크기로 래스터 → 부위마다 윗왼쪽 빛 · 아랫오른쪽 그림자 · 외곽선
//   별무리: 별의 제단을 지키는 전설 (밤하늘 갑옷 · 별빛 수정 뿔 · 성좌 날개)
//   온누리: 별빛의 씨앗에서 태어난 환상 (진주빛 용 · 새싹 금관 · 일곱 속성 구슬 후광)
import { Img, mix, rgba, hash2 } from './lib/img.mjs';

const D = 96;
// ── 도형 (설계 좌표) ───────────────────────────────────
const ell = (cx, cy, rx, ry, rot = 0) => (x, y) => { const c = Math.cos(rot), s = Math.sin(rot), dx = x - cx, dy = y - cy; const u = (dx * c + dy * s) / rx, v = (-dx * s + dy * c) / ry; return u * u + v * v <= 1; };
const poly = (pts) => (x, y) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const cap = (x1, y1, x2, y2, r1, r2) => (x, y) => { const vx = x2 - x1, vy = y2 - y1, L = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / L)); return Math.hypot(x - x1 - t * vx, y - y1 - t * vy) <= r1 + (r2 - r1) * t; };
const chain = (pts, r0, r1) => { const n = pts.length - 1; const parts = []; for (let i = 0; i < n; i++) parts.push(cap(...pts[i], ...pts[i + 1], r0 + (r1 - r0) * (i / n), r0 + (r1 - r0) * ((i + 1) / n))); return (x, y) => parts.some((f) => f(x, y)); };
const any = (...fs) => (x, y) => fs.some((f) => f(x, y));
const move = (f, dx, dy) => (x, y) => f(x - dx, y - dy);

/** 부위 하나를 그림: 마스크 → 4단 음영 (빛은 왼쪽 위) */
function paint(t, N, shape, pal, { band = null } = {}) {
  const k = D / N, m = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (shape((x + 0.5) * k, (y + 0.5) * k)) m[y * N + x] = 1;
  const at = (x, y) => x >= 0 && y >= 0 && x < N && y < N && m[y * N + x];
  const w = N >= 64 ? 2 : 1;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!m[y * N + x]) continue;
    let c = pal[1];
    if (!at(x + w, y + w) || !at(x + 1, y + 1)) c = pal[0];
    else if (!at(x - 1, y - 1)) c = pal[3] ?? pal[2];
    else if (!at(x - w - 1, y - w - 1) || !at(x - w, y)) c = pal[2];
    if (band) c = band(x * k, y * k, c) ?? c;
    t.put(x, y, rgba(c));
  }
}
/** 굵기 있는 선 (설계 좌표) */
function stroke(t, N, pts, c, wd = 1) {
  const k = N / D;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) * k * 2) + 1;
    for (let j = 0; j <= n; j++) {
      const x = (x1 + ((x2 - x1) * j) / n) * k, y = (y1 + ((y2 - y1) * j) / n) * k;
      for (let a = 0; a < wd; a++) for (let b = 0; b < wd; b++) t.put(Math.floor(x) + a, Math.floor(y) + b, rgba(c));
    }
  }
}
const dotAt = (t, N, x, y, c, r = 0) => { const k = N / D, X = Math.floor(x * k), Y = Math.floor(y * k); for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + 0.5) t.put(X + i, Y + j, rgba(c)); };
const starAt = (t, N, x, y, c, s = 1) => { const k = N / D, X = Math.floor(x * k), Y = Math.floor(y * k); t.put(X, Y, rgba('#ffffff')); for (let i = 1; i <= s; i++) for (const [dx, dy] of [[i, 0], [-i, 0], [0, i], [0, -i]]) t.put(X + dx, Y + dy, rgba(c)); };

// ── 별무리 (전설 · 빛) ─────────────────────────────────
const NIGHT = ['#141a4a', '#232c6e', '#3a4aa0', '#6a80d8'];
const NIGHT_FAR = ['#0c1032', '#161d52', '#24307a', '#3a4aa0'];
const CRYSTAL = ['#1f6a98', '#3ab4e0', '#8aecff', '#ffffff'];
const GOLD = ['#8a5a1a', '#d09a2a', '#ffd65a', '#fff6c0'];
function byeolmuri(N, f) {
  const t = new Img(N, N), up = f ? -2 : 0;
  // 먼 날개 (성좌 조각)
  // 어깨에서 부채꼴로 뻗은 날카로운 조각 날개
  const shard = (ox, oy, ang, len, wd) => { const a = ang * Math.PI / 180, c = Math.cos(a), s2 = Math.sin(a), px = -s2, py = c; return poly([[ox + px * wd, oy + py * wd], [ox + c * len * 0.72 + px * wd * 0.9, oy + s2 * len * 0.72 + py * wd * 0.9], [ox + c * len, oy + s2 * len + up], [ox - px * wd * 0.4, oy - py * wd * 0.4]]); };
  const farWing = any(...[-62, -44, -27, -10].map((a, i) => shard(60, 48, a, 46 - i * 4, 5)));
  paint(t, N, farWing, NIGHT_FAR);
  // 꼬리 (별 끝)
  paint(t, N, chain([[66, 62], [80, 71], [90, 63], [92, 50]], 6, 2), NIGHT);
  // 먼 다리
  paint(t, N, any(cap(70, 62, 75, 78, 7, 4), cap(75, 78, 73, 90, 4, 3)), NIGHT_FAR);
  paint(t, N, any(cap(45, 64, 43, 78, 5, 3.5), cap(43, 78, 41, 90, 3.5, 3)), NIGHT_FAR);
  // 몸통 · 가슴 갑옷
  paint(t, N, ell(56, 58, 20, 13, -0.15), NIGHT);
  paint(t, N, ell(42, 54, 10, 12, 0.2), ['#2a3478', '#3e4ea8', '#5e74d0', '#9ab0f4']);
  // 가까운 다리 (수정 발톱)
  paint(t, N, any(cap(60, 64, 64, 80, 8, 4.5), cap(64, 80, 60, 91, 4.5, 3.5)), NIGHT);
  paint(t, N, any(cap(36, 62, 32, 78, 6, 4), cap(32, 78, 30, 91, 4, 3.5)), NIGHT);
  for (const [x, y] of [[26, 92], [56, 92], [37, 92], [69, 91]]) paint(t, N, poly([[x, y - 3], [x + 4, y - 3], [x + 2, y + 1]]), CRYSTAL);
  // 목 · 머리
  paint(t, N, cap(42, 50, 32, 29, 9, 6), NIGHT);
  paint(t, N, poly([[20, 18], [34, 15], [41, 23], [37, 32], [22, 34], [10, 31], [7, 26]]), ['#1a2260', '#2e3a8a', '#4a5ec0', '#8aa0f0']);
  // 가까운 날개 (앞쪽, 더 밝게)
  const nearWing = any(...[-88, -74, -59, -44, -30].map((a, i) => shard(54, 48, a, 50 - i * 3, 5.5)));
  paint(t, N, nearWing, ['#1c2672', '#2e3e9e', '#4a62cc', '#90a8f4'], { band: (x, y, c) => (c === '#90a8f4' || c === '#4a62cc' ? (f ? '#9af0ff' : '#5ee8ff') : null) });
  // 목덜미 수정 갈기
  paint(t, N, any(poly([[40, 34], [48, 26], [44, 38]]), poly([[43, 40], [52, 33], [47, 44]]), poly([[46, 46], [56, 40], [50, 49]])), CRYSTAL);
  // 아래턱 (강한 턱선)
  paint(t, N, poly([[11, 31], [24, 33], [30, 38], [18, 37]]), ['#141a4a', '#232c6e', '#3a4aa0', '#6a80d8']);
  // 별빛 수정 뿔 (왕관)
  const crys = any(poly([[29, 17], [36, 0 + up], [39, 1 + up], [34, 19]]), poly([[34, 18], [48, 5 + up], [50, 8 + up], [37, 22]]), poly([[25, 17], [22, 4 + up], [26, 3 + up], [29, 17]]), poly([[40, 9 + up], [45, 0 + up], [47, 2 + up], [42, 11 + up]]));
  paint(t, N, crys, f ? ['#2a7ab0', '#4ad0f0', '#b0f6ff', '#ffffff'] : CRYSTAL);
  // 외곽선
  t.outline('#06081c', 0.72);
  // 세부: 성좌 선 · 별 · 눈 · 가슴 별 보석 · 목 줄무늬
  const big = N >= 64;
  if (big) {
    stroke(t, N, [[48, 54], [56, 51], [64, 56], [71, 53], [76, 58]], '#5ee8ff');
    for (const [x, y] of [[48, 54], [56, 51], [64, 56], [71, 53], [76, 58]]) dotAt(t, N, x, y, '#ffffff', 1);
    stroke(t, N, [[38, 44], [33, 33], [28, 27]], '#5ee8ff');
    stroke(t, N, [[12, 29], [22, 30], [32, 28]], '#5ee8ff');
    for (let i = 0; i < 26; i++) { const x = 56 + hash2(i, 1, 7) * 38, y = 4 + hash2(i, 2, 7) * 48; if (farWing(x, y - up) || nearWing(x, y - up)) dotAt(t, N, x, y, hash2(i, 3, 7) < 0.25 ? '#ffe58a' : '#ffffff'); }
    starAt(t, N, 92, 48, '#ffe58a', 2);
  }
  // 가슴 보석
  paint(t, N, poly([[42, 47], [45, 52], [42, 58], [39, 52]]), f ? ['#c08a1a', '#ffd65a', '#fff6c0', '#ffffff'] : GOLD);
  // 눈 (빛나는 시안)
  stroke(t, N, [[19, 22], [26, 21]], f ? '#ffffff' : '#8aecff', big ? 2 : 1);
  return t;
}

// ── 온누리 (환상 · 노말) ───────────────────────────────
const PEARL = ['#b8ac98', '#e8e0d0', '#fbf6ec', '#ffffff'];
const PEARL_D = ['#9a8e7a', '#cfc6b4', '#ece4d4', '#fbf6ec'];
const LEAF = ['#2a7a4a', '#4fb86a', '#9ae8a0', '#e0ffe0'];
const ORBS = ['#a8a090', '#5fae4a', '#3f8fc8', '#e8642e', '#b8864a', '#7ab8d8', '#e0b830'];
function onnuri(N, f) {
  const t = new Img(N, N), bob = f ? -1 : 0;
  // 일곱 속성 구슬 후광 (등 뒤로 반원)
  const orbPos = ORBS.map((_, i) => { const a = (-128 + i * 25) * (Math.PI / 180); return [60 + Math.cos(a) * 31, 50 + Math.sin(a) * 31 + bob]; });
  if (N >= 64) for (let i = 0; i < orbPos.length - 1; i++) stroke(t, N, [orbPos[i], orbPos[i + 1]], '#ffe58a');
  // 먼 날개 (빛의 잎)
  const vein = (x, y, c) => (Math.floor((x * 0.9 + y) / 3) % 4 === 0 ? mix(c, '#ffd0f0', 0.35) : null);
  for (const [r, l] of [[-0.45, 22], [-0.7, 25], [-0.95, 22]]) paint(t, N, ell(58 + Math.cos(r) * l * 0.55, 34 + Math.sin(r) * l * 0.9 + bob, l, 6.5, r), PEARL_D, { band: vein });
  // 뱀처럼 휘감긴 몸 (진주빛 비늘)
  const body = chain([[44, 46 + bob], [52, 57 + bob], [54, 67 + bob], [45, 75 + bob], [35, 81 + bob], [41, 89 + bob], [57, 91 + bob], [71, 85 + bob], [81, 75 + bob]], 10, 3);
  paint(t, N, body, PEARL, { band: (x, y, c) => (c === PEARL[1] && (x + y) % 11 < 1 ? '#f4e4c8' : null) });
  // 꼬리 끝: 새싹 불꽃
  paint(t, N, poly([[79, 76 + bob], [93, 62 + bob], [90, 72 + bob], [96, 71 + bob], [86, 82 + bob]]), LEAF);
  // 앞발 (금빛 발톱)
  paint(t, N, any(cap(43, 57 + bob, 35, 63 + bob, 3.2, 2.4), cap(48, 60 + bob, 42, 68 + bob, 3, 2.2)), PEARL);
  for (const [x, y] of [[32, 63], [39, 69]]) paint(t, N, ell(x, y + bob, 2.4, 2), GOLD);
  // 가까운 날개
  for (const [r, l] of [[-0.85, 26], [-1.1, 29], [-1.35, 25], [-1.6, 20]]) paint(t, N, ell(50 + Math.cos(r) * l * 0.62, 38 + Math.sin(r) * l * 0.95 + bob, l, 6.5, r), PEARL, { band: vein });
  // 목 · 머리 · 금빛 갈기
  paint(t, N, cap(44, 46 + bob, 37, 26 + bob, 7, 5), PEARL);
  paint(t, N, poly([[40, 14 + bob], [58, 9 + bob], [64, 16 + bob], [52, 21 + bob], [45, 23 + bob]]), GOLD);
  paint(t, N, poly([[25, 18 + bob], [38, 14 + bob], [46, 20 + bob], [44, 28 + bob], [33, 32 + bob], [21, 30 + bob], [13, 26 + bob], [15, 22 + bob]]), PEARL);
  // 새싹 금관 (가지 뿔)
  const crown = any(cap(34, 15 + bob, 30, 2 + bob, 1.6, 1), cap(31, 7 + bob, 24, 3 + bob, 1.2, 0.8), cap(40, 15 + bob, 46, 1 + bob, 1.6, 1), cap(44, 6 + bob, 52, 3 + bob, 1.2, 0.8));
  paint(t, N, crown, GOLD);
  for (const [x, y] of [[30, 2], [24, 3], [46, 1], [52, 3]]) paint(t, N, ell(x, y + bob, 2.6, 1.8), LEAF);
  // 구슬
  orbPos.forEach(([x, y], i) => paint(t, N, ell(x, y, 4.6, 4.6), [mix(ORBS[i], '#000000', 0.35), ORBS[i], mix(ORBS[i], '#ffffff', 0.45), '#ffffff']));
  t.outline('#2a2018', 0.7);
  // 세부: 씨앗 심장 · 금띠 · 눈
  paint(t, N, ell(45, 51 + bob, 4.4, 5.6), f ? ['#2f8a5a', '#7ae0a0', '#d8ffe0', '#ffffff'] : ['#8a6a1a', '#e0c040', '#fff0a0', '#ffffff']);
  if (N >= 64) {
    for (const [x, y] of [[53, 62], [46, 76], [44, 88], [66, 88]]) stroke(t, N, [[x - 4, y - 3 + bob], [x + 4, y + 3 + bob]], '#e0b040', 2);
    stroke(t, N, [[34, 22 + bob], [40, 24 + bob]], '#e0b040');
    for (let i = 0; i < 10; i++) dotAt(t, N, 20 + hash2(i, 4, 9) * 70, 6 + hash2(i, 5, 9) * 50 + bob, '#ffffff');
  }
  dotAt(t, N, 27, 22 + bob, '#ff5a9a', N >= 64 ? 1 : 0);
  return t;
}

const DRAW = { byeolmuri, onnuri };
export const LEGEND_ART = Object.keys(DRAW);
/** 배틀용 큰 그림: 96×96 두 프레임 (숨쉬기 · 빛) */
export function buildLegendBig(id) { const img = new Img(D * 2, D); for (let f = 0; f < 2; f++) img.blit(DRAW[id](D, f), f * D, 0); return img; }
/** 필드 · 휴대폰용 32px 시트 (아래 · 옆 · 위 각 2프레임 — 같은 정면 그림) */
export function buildLegendSmall(id, CF = 32) { const img = new Img(CF * 6, CF); for (let v = 0; v < 3; v++) for (let f = 0; f < 2; f++) img.blit(DRAW[id](CF, f), (v * 2 + f) * CF, 0); return img; }
