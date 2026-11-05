// 휴대폰 지도: 루미나 지방 전체 (지도 좌표 360×240 → 그림 720×480)
//   지형 높낮이 음영(3단 + 디더) · 바이옴 경계 디더 · 물 깊이 띠 · 해안 거품 · 숲/산/사구/갈대/도시 스탬프 · 곡선 도로
//   마을 표시(핀)와 안개는 UI 에서 그림 (가 본 곳에 따라 달라지므로)
import { Img, mix, darken, lighten, rgba, hash2 } from './lib/img.mjs';
import { sfbm } from './worldmap.mjs';
import { buildGraph, CHAINS } from '../map/region-graph.mjs';
import { WORLD_W, WORLD_H, ROUTES } from '../map/region-spec.mjs';

const S = 2;
/** 바이옴 지면: [어두움, 기본, 밝음] */
const LAND = {
  meadow: ['#4c9440', '#66b04a', '#88cc5e'],
  forest: ['#2e6a36', '#3d8340', '#549c4a'],
  beach: ['#c8ae6c', '#dbc486', '#ecdca4'],
  rocky: ['#86765e', '#a08e72', '#bcac90'],
  snow: ['#bccbdc', '#dce6f0', '#f6f9fc'],
  desert: ['#cca25a', '#dfbe7c', '#f0d8a0'],
  swamp: ['#4a6a46', '#5e8056', '#76986a'],
  volcano: ['#54393a', '#6c4c46', '#866456'],
  city: ['#5e9a4c', '#7cb05e', '#9cc67a'],
  distortion: ['#463a6a', '#5a4c86', '#7464a2'],
};
const SHORE = { snow: '#f2f6fa', volcano: '#4e3c3a', distortion: '#8a7ab0', swamp: '#9a9a6a' };
const SAND = '#ead598', SAND_D = '#d2b97c';
const SEA = ['#86ccec', '#5aa8dc', '#3f8bc6', '#2f70aa', '#275e94'];   // 얕음 → 깊음
const FOAM = '#f0fbff';
const ROAD_OUT = '#8e6a40', ROAD = '#f7e8c0', LANE = '#e6f6ff';
const OUT = '#20303a';
const ISLANDS = new Set(['iron', 'fullmoon', 'newmoon', 'paradise', 'battle', 'crown']);
const ISLE_R = { crown: 24, battle: 9 };   // 북동쪽 리그 섬은 크게

// 4×4 베이어 디더 (0..1)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

export function buildRegionMap() {
  const g = buildGraph(), nodes = Object.values(g).filter((n) => n.kind !== 'room');
  const farm = { id: 'farm', x: 24, y: 206, biome: 'meadow', kind: 'farm', links: [] };
  const all = [...nodes, farm];
  // 도로 · 연결 선분 (지형 모양을 정함 — 기존 맵 좌표와 맞도록 예전 지도와 같은 규칙)
  const segs = [];
  // 도로 하나 = 구간 맵 여러 개를 잇는 꺾은선
  const routeLine = (n) => { const ids = CHAINS[n]; return [g[g[ids[0]].ends[0]], ...ids.map((id) => g[id]), g[g[ids[ids.length - 1]].ends[1]]].filter(Boolean); };
  for (const [n] of ROUTES) { const L = routeLine(n); for (let i = 0; i < L.length - 1; i++) segs.push([L[i], L[i + 1]]); }
  for (const n of nodes) for (const l of n.links) if (g[l.to] && g[l.to].kind !== 'room' && (l.type === 'edge' || l.type === 'mouth' || l.type === 'stairsUp')) segs.push([n, g[l.to]]);
  segs.push([farm, g.town]);
  // 섬은 따로: 본토 계산에서 빼고 섬마다 둥글게 (경계가 끊기지 않도록 min 으로 합침)
  const isIsle = (n) => ISLANDS.has(n.id) || (n.attach && ISLANDS.has(n.attach[0]));
  const mainNodes = all.filter((n) => !isIsle(n)), isles = all.filter(isIsle);
  const landSegs = segs.filter(([a, b]) => a && b && !isIsle(a) && !isIsle(b));
  const segDist = (px, py, a, b) => { const vx = b.x - a.x, vy = b.y - a.y, L = vx * vx + vy * vy || 1; const u = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / L)); return Math.hypot(px - a.x - u * vx, py - a.y - u * vy); };

  const W = WORLD_W * S, H = WORLD_H * S;
  const land = new Float32Array(W * H);        // >0 물(값=깊이), <=0 땅(값=안쪽 깊이)
  const road = new Float32Array(W * H);        // 가장 가까운 연결선까지 거리 (지도 단위)
  const bio = new Array(W * H), bio2 = new Array(W * H), edge = new Float32Array(W * H);
  const nearest = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wx = (x + 0.5) / S, wy = (y + 0.5) / S, i = y * W + x;
    let best = null, bd = 1e9, bestAll = null, ba = 1e9;
    for (const n of mainNodes) { const d = Math.hypot(wx - n.x, wy - n.y); if (d < bd) { bd = d; best = n; } }
    let sd = 1e9; for (const [a, b] of landSegs) sd = Math.min(sd, segDist(wx, wy, a, b));
    const nz = (sfbm(wx, wy, 40, 11, 4) - 0.5) * 26;
    let L = Math.min(bd - 21, sd - 17) + nz;   // 땅을 넉넉하게: 하나의 큰 대륙처럼
    for (const n of isles) { const d = Math.hypot(wx - n.x, wy - n.y); const li = d - (ISLE_R[n.id] ?? 10) + nz * 0.4; if (li < L) L = li; if (d < ba) { ba = d; bestAll = n; } }
    if (ba < bd) best = bestAll;
    for (const [a, b] of segs) sd = Math.min(sd, segDist(wx, wy, a, b));
    land[i] = L; road[i] = sd; nearest[i] = best;
    // 바이옴: 좌표를 노이즈로 흔든 뒤 가장 가까운 두 곳 → 경계가 구불구불
    const jx = wx + (sfbm(wx, wy, 16, 21, 3) - 0.5) * 18, jy = wy + (sfbm(wx, wy, 16, 22, 3) - 0.5) * 18;
    let b1 = null, b2 = null, d1 = 1e9, d2 = 1e9;
    for (const n of all) {
      const d = Math.hypot(jx - n.x, jy - n.y) * (n.kind === 'town' ? 0.9 : 1);
      const bb = biomeOf(n);
      if (d < d1) { if (b1 !== bb) { d2 = d1; b2 = b1; } d1 = d; b1 = bb; } else if (d < d2 && bb !== b1) { d2 = d; b2 = bb; }
    }
    bio[i] = b1; bio2[i] = b2 ?? b1; edge[i] = d2 - d1;
  }
  // 하나의 큰 대륙: 바깥 바다와 이어지지 않은 안쪽 물은 땅으로 메움 (호수는 아래에서 따로 팜)
  {
    const ocean = new Uint8Array(W * H), q = [];
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (land[y * W + x] > 0) { ocean[y * W + x] = 1; q.push(y * W + x); }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (land[y * W + x] > 0 && !ocean[y * W + x]) { ocean[y * W + x] = 1; q.push(y * W + x); }
    while (q.length) { const i = q.pop(), x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X < 0 || Y < 0 || X >= W || Y >= H) continue; const j = Y * W + X; if (!ocean[j] && land[j] > 0) { ocean[j] = 1; q.push(j); } } }
    for (let i = 0; i < W * H; i++) if (land[i] > 0 && !ocean[i]) land[i] = -6 - Math.min(14, land[i]);
  }
  // 호수 (세 호수 · 별빛 마을 호수): 땅 위에 물을 다시 파냄
  const lakes = nodes.filter((n) => n.tpl === 'lake').map((n) => [n.x, n.y, 6.5]);
  lakes.push([g.town.x, g.town.y + 4, 3.2]);
  for (const [lx, ly, r] of lakes) for (let y = Math.floor((ly - r - 3) * S); y < (ly + r + 3) * S; y++) for (let x = Math.floor((lx - r - 4) * S); x < (lx + r + 4) * S; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const wx = (x + 0.5) / S, wy = (y + 0.5) / S;
    const d = Math.hypot((wx - lx) / 1.25, wy - ly) + (sfbm(wx, wy, 6, 31, 2) - 0.5) * 2.4;
    const v = r - d; const i = y * W + x;
    if (v > -2.2 && land[i] <= 0) land[i] = v > 0 ? Math.min(6, v * 1.3) : Math.max(land[i], v);
  }
  const sm = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  const towns = all.filter((n) => n.kind === 'town' || n.kind === 'farm');
  const townDist = (wx, wy) => { let d = 1e9; for (const n of towns) d = Math.min(d, Math.hypot(wx - n.x, wy - n.y)); return d; };

  // ── 산 마스크: 바위 · 눈 · 화산 바이옴 + 별마루산 능선, 길 · 마을 · 바닷가는 낮게 (계곡) ──
  const MW = { rocky: 1, snow: 0.9, volcano: 0.85, distortion: 0.35 };
  let mt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, wx = (x + 0.5) / S, wy = (y + 0.5) / S;
    if (land[i] > 0) continue;
    const k = Math.min(1, edge[i] / 6);
    let w = (MW[bio[i]] ?? 0) * (0.5 + 0.5 * k) + (MW[bio2[i]] ?? 0) * (0.5 - 0.5 * k);
    const rr = Math.max(0, 1 - Math.abs(wx - (192 + Math.sin(wy / 9) * 5)) / 17);
    w = Math.max(w, rr * rr * (3 - 2 * rr) * sm(48, 60, wy) * (1 - sm(114, 126, wy)) * 1.1);
    w *= sm(1.5, 7, road[i]) * sm(4, 11, townDist(wx, wy)) * sm(0.5, 6, -land[i]);
    mt[i] = w;
  }
  // 부드럽게 (가로 · 세로 상자 흐림 두 번)
  const blur = (a, r) => { const o = new Float32Array(a.length); for (let y = 0; y < H; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += a[y * W + Math.max(0, Math.min(W - 1, x))]; for (let x = 0; x < W; x++) { o[y * W + x] = acc / (2 * r + 1); acc += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } } const o2 = new Float32Array(a.length); for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += o[Math.max(0, Math.min(H - 1, y)) * W + x]; for (let y = 0; y < H; y++) { o2[y * W + x] = acc / (2 * r + 1); acc += o[Math.min(H - 1, y + r + 1) * W + x] - o[Math.max(0, y - r) * W + x]; } } return o2; };
  mt = blur(blur(mt, 4), 3);
  // ── 높이: 날카로운 능선 노이즈 (산) + 낮은 언덕 ──
  const E = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, wx = (x + 0.5) / S, wy = (y + 0.5) / S;
    const r1 = 1 - Math.abs(2 * sfbm(wx, wy, 15, 7, 4) - 1), r2 = 1 - Math.abs(2 * sfbm(wx + 40, wy, 7, 9, 3) - 1);
    const ridged = r1 * r1 * 0.7 + r2 * r2 * 0.3;
    E[i] = mt[i] * (0.35 + ridged * 0.95) + sfbm(wx, wy, 26, 4, 3) * 0.12 + Math.min(20, -land[i]) * 0.004;
  }
  const shadeAt = (i, k) => { const gx = E[Math.min(W * H - 1, i + 1)] - E[Math.max(0, i - 1)], gy = E[Math.min(W * H - 1, i + W)] - E[Math.max(0, i - W)]; return 0.5 - (gx * 1.1 + gy) * k; };

  const ROCK = ['#3e3048', '#5a4a64', '#7a6884', '#9e8ea6', '#c4b8c8'];
  const SNOWC = ['#7f93b4', '#a8bad6', '#cfdcee', '#eef3fa', '#ffffff'];
  const ASH = ['#2e2224', '#4a3432', '#664a42', '#86644e', '#a8805e'];
  const tone5 = (pal, l, x, y) => { const q = Math.max(0, Math.min(0.999, l + (bayer(x, y) - 0.5) * 0.22)); return pal[Math.floor(q * pal.length)]; };

  const t = new Img(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, L = land[i], wy = (y + 0.5) / S;
    let c;
    if (L > 0) {
      // 물: 얕은 청록 → 깊은 남색 + 띠 사이 디더
      const bands = [1.6, 5, 10, 17];
      let k = 0; while (k < bands.length && L > bands[k]) k++;
      const lo = k ? bands[k - 1] : 0, hi = bands[k] ?? lo + 8;
      const f = (L - lo) / (hi - lo);
      c = SEA[k];
      if (k < SEA.length - 1 && f > 0.6 && bayer(x, y) < (f - 0.6) / 0.4 * 0.5) c = SEA[k + 1];
      if (L < 0.9) c = FOAM;
    } else {
      const b = bio[i];
      const m = mt[i] + (bayer(x, y) - 0.5) * 0.08;
      if (m > 0.3) {
        // 산: 5단 음영 (왼쪽 위 빛) · 높은 곳은 눈
        const l = shadeAt(i, 15);
        const snowLine = b === 'snow' ? 0.2 : wy < 92 && Math.abs((x + 0.5) / S - 192) < 22 ? 0.62 : 0.95;
        c = tone5(b === 'volcano' ? ASH : E[i] > snowLine ? SNOWC : ROCK, l, x, y);
      } else {
        const pal = LAND[(edge[i] < 3.5 && bayer(x, y) > 0.5 + (edge[i] / 3.5) * 0.5) ? bio2[i] : b] ?? LAND.meadow;
        const q = shadeAt(i, 10) + (bayer(x, y) - 0.5) * 0.3 - m * 0.4;
        c = q < 0.32 ? pal[0] : q > 0.7 ? pal[2] : pal[1];
        if (L > -2.4) c = SHORE[b] ?? (L > -1.1 ? SAND : (bayer(x, y) < 0.5 ? SAND : SAND_D));
      }
    }
    t.put(x, y, rgba(c));
  }
  // 해안선 테두리 + 얕은 바다 반짝임
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (land[i] <= 0) continue;
    if (land[i] <= 1.6 && (land[i - 1] <= 0 || land[i + 1] <= 0 || land[i - W] <= 0 || land[i + W] <= 0)) t.put(x, y, rgba(mix(SEA[1], OUT, 0.35)));
    else if (land[i] < 6 && hash2(x, y, 81) < 0.012) t.put(x, y, rgba('#c8f0ff'));
  }
  for (let gy = 6; gy < H - 6; gy += 13) for (let gx = 6; gx < W - 6; gx += 19) {
    const x = gx + Math.floor(hash2(gx, gy, 5) * 12), y = gy + Math.floor(hash2(gx, gy, 6) * 8);
    if (land[y * W + x] < 9 || hash2(gx, gy, 7) < 0.3) continue;
    const wc = rgba(lighten(SEA[3], 0.2));
    t.put(x, y, wc); t.put(x + 1, y - 1, wc); t.put(x + 2, y - 1, wc); t.put(x + 3, y, wc);
  }

  const inLand = (x, y, m = 0) => x >= 0 && y >= 0 && x < W && y < H && land[y * W + x] < -m;
  const B = (x, y) => bio[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const nearRoad = (x, y, m) => road[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))] < m;
  const nearTown = (x, y, r) => townDist(x / S, y / S) < r;

  // ── 강: 산에서 바다 쪽(해안까지 거리가 줄어드는 쪽)으로 굽이쳐 흐름 ──
  const river = new Uint8Array(W * H);
  const srcs = []; let rivers = 0;
  for (let gy = 10; gy < H - 10; gy += 9) for (let gx = 10; gx < W - 10; gx += 9) {
    const x = gx + Math.floor(hash2(gx, gy, 91) * 9), y = gy + Math.floor(hash2(gx, gy, 92) * 9), i = y * W + x;
    if (mt[i] > 0.36 && land[i] < -6 && srcs.every(([a, b]) => Math.hypot(a - x, b - y) > 60)) srcs.push([x, y]);
  }
  srcs.sort((a, b) => hash2(a[0], a[1], 93) - hash2(b[0], b[1], 93));
  for (const [sx, sy] of srcs) {
    if (rivers >= 9) break;
    let x = sx, y = sy, dx = 0, dy = 0;
    const pts = [];
    for (let k = 0; k < 900; k++) {
      const xi = Math.round(x), yi = Math.round(y), i = yi * W + xi;
      if (xi < 2 || yi < 2 || xi >= W - 2 || yi >= H - 2) break;
      pts.push([x, y]);
      if (land[i] > 0.6) break;
      let gx = land[i + 2] - land[i - 2], gy = land[i + 2 * W] - land[i - 2 * W];
      const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
      const wob = Math.sin(k / 11 + sx) * 0.55 + (sfbm(x / S, y / S, 9, 95, 2) - 0.5) * 1.2;
      dx = dx * 0.55 + (gx - gy * wob) * 0.45; dy = dy * 0.55 + (gy + gx * wob) * 0.45;
      const dl = Math.hypot(dx, dy) || 1; x += dx / dl; y += dy / dl;
    }
    if (pts.length < 40) continue;
    rivers++;
    pts.forEach(([px, py], k) => {
      const r = 0.7 + Math.min(1.1, k / 260);
      for (let j = -2; j <= 2; j++) for (let ii = -2; ii <= 2; ii++) {
        const d = Math.hypot(ii, j); if (d > r + 0.9) continue;
        const X = Math.round(px + ii), Y = Math.round(py + j); if (X < 0 || Y < 0 || X >= W || Y >= H || land[Y * W + X] > 0) continue;
        t.put(X, Y, rgba(d > r ? '#2f6a98' : d < r * 0.45 && (k + X) % 7 < 3 ? '#a8e2f8' : '#58b0e2')); river[Y * W + X] = 1;
      }
    });
  }
  if (process.env.MAPDBG) console.log("rivers", rivers, "sources", srcs.length);
  const nearRiver = (x, y) => { for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if (river[(Math.max(0, Math.min(H - 1, y + j))) * W + Math.max(0, Math.min(W - 1, x + i))]) return true; return false; };

  // ── 숲 지붕 (빽빽한 나무 덩어리) · 바이옴 소품: 아래쪽부터 그려 자연스럽게 겹침 ──
  const stamps = [];
  const step = 4;
  for (let gy = 2; gy < H - 2; gy += step) for (let gx = 2; gx < W - 2; gx += step) {
    const x = gx + Math.floor(hash2(gx, gy, 41) * step), y = gy + Math.floor(hash2(gx, gy, 42) * step);
    if (!inLand(x, y, 2.6) || nearRoad(x, y, 2.6) || nearTown(x, y, 7.5) || nearRiver(x, y)) continue;
    const i = y * W + x, b = B(x, y), r = hash2(gx, gy, 43), r2 = hash2(gx, gy, 44), m = mt[i];
    const wx = x / S, wy = y / S;
    const dense = nearest[i]?.id === 'eterna_forest';
    const patch = sfbm(wx, wy, 18, 47, 3);
    if (m > 0.34) { if ((b === 'snow' || b === 'rocky') && m < 0.5 && r < 0.25) stamps.push(['pine', x, y, b === 'snow']); continue; }
    if (b === 'forest' || dense) { if (r < 0.92) stamps.push(r2 < 0.22 ? ['pine', x, y, false] : ['canopy', x, y, 'forest', 2.4 + r2 * 1.4]); }
    else if (b === 'meadow' || b === 'city') { if ((patch > 0.56 && r < 0.85) || (m > 0.12 && r < 0.5)) stamps.push(['canopy', x, y, 'meadow', 2.2 + r2 * 1.3]); else if (r < 0.025) stamps.push(['flowers', x, y]); }
    else if (b === 'snow') { if (patch > 0.5 && r < 0.6) stamps.push(['pine', x, y, true]); }
    else if (b === 'desert') { if (r < 0.05) stamps.push(['dune', x, y]); else if (r < 0.07) stamps.push(['cactus', x, y]); }
    else if (b === 'swamp') { if (patch > 0.52 && r < 0.7) stamps.push(['canopy', x, y, 'swamp', 2.2 + r2]); else if (r < 0.1) stamps.push(['reeds', x, y]); else if (r < 0.14) stamps.push(['puddle', x, y]); }
    else if (b === 'beach') { if (r < 0.04) stamps.push(['palm', x, y]); }
    else if (b === 'distortion') { if (r < 0.12) stamps.push(['crystal', x, y]); }
    else if (b === 'volcano') { if (r < 0.06) stamps.push(['boulder', x, y]); }
  }
  stamps.sort((a, b) => a[2] - b[2]);
  for (const s of stamps) STAMP[s[0]](t, ...s.slice(1), B);

  // ── 도로: 도로 노드를 지나는 구불구불한 곡선 (숲 위로 길이 나 있도록 나무 다음에) ──
  const curve = (pts, seed) => {
    const p = [pts[0]];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const off = (hash2(k, seed, 3) - 0.5) * Math.min(10, len * 0.22);
      p.push({ x: (a.x + b.x) / 2 - (dy / len) * off, y: (a.y + b.y) / 2 + (dx / len) * off }, b);
    }
    const out = [];
    for (let k = 0; k < p.length - 1; k++) {
      const p0 = p[k - 1] ?? p[k], p1 = p[k], p2 = p[k + 1], p3 = p[k + 2] ?? p2;
      const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * S * 2));
      for (let j = 0; j < n; j++) {
        const u = j / n, u2 = u * u, u3 = u2 * u;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        out.push([f(p0.x, p1.x, p2.x, p3.x) * S, f(p0.y, p1.y, p2.y, p3.y) * S]);
      }
    }
    out.push([pts[pts.length - 1].x * S, pts[pts.length - 1].y * S]);
    return out;
  };
  const roads = [], trails = [], lanes = [];
  for (const [n] of ROUTES) roads.push(curve(routeLine(n), n));
  roads.push(curve([farm, g.town], 99));
  const routeIds = new Set(Object.values(CHAINS).flat());
  const seen = new Set();
  for (const n of nodes) for (const l of n.links) {
    const m = g[l.to]; if (!m || m.kind === 'room') continue;
    const key = [n.id, m.id].sort().join('|'); if (seen.has(key)) continue; seen.add(key);
    if (l.type === 'dock') { lanes.push(curve([n, m], seen.size)); continue; }
    if (routeIds.has(n.id) && (m.kind === 'town' || routeIds.has(m.id))) continue;
    if (routeIds.has(m.id) && (n.kind === 'town')) continue;
    if (l.type === 'edge' || l.type === 'mouth' || l.type === 'stairsUp') trails.push(curve([n, m], seen.size));
  }
  const dot = (x, y, r, c) => { const cc = rgba(c); for (let j = -Math.ceil(r); j <= r; j++) for (let i = -Math.ceil(r); i <= r; i++) if (i * i + j * j <= r * r + 0.3) t.put(Math.round(x + i), Math.round(y + j), cc); };
  const onWater = (x, y) => { const i = Math.round(y) * W + Math.round(x); return land[i] > 0.4; };
  for (const pts of roads) pts.forEach(([x, y]) => { if (!onWater(x, y)) dot(x, y, 1.9, ROAD_OUT); });
  for (const pts of trails) pts.forEach(([x, y], k) => { if (!onWater(x, y) && k % 5 < 3) dot(x, y, 1.4, ROAD_OUT); });
  for (const pts of roads) pts.forEach(([x, y], k) => { if (!onWater(x, y)) dot(x, y, 1, ROAD); else if (k % 6 < 2) dot(x, y, 0.8, LANE); });
  for (const pts of trails) pts.forEach(([x, y], k) => { if (!onWater(x, y) && k % 5 < 3) dot(x, y, 0.5, ROAD); });
  for (const pts of lanes) pts.forEach(([x, y], k) => { if (k % 7 < 2 && onWater(x, y)) dot(x, y, 0.8, LANE); });

  // ── 마을 · 도시 · 동굴 · 랜드마크 ──
  const marks = [];
  for (const n of towns) {
    const city = ['lumina', 'forge', 'crown'].includes(n.id);
    const R = city ? 11 : 6.5;
    marks.push(['plaza', Math.round(n.x * S), Math.round(n.y * S), R * S, city]);
    const count = city ? 20 : 6;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + hash2(k, n.x, 71) * 0.6, d = (city ? 4 + (k % 3) * 3 : 4.4) + hash2(k, n.y, 72) * 1.2;
      const x = Math.round((n.x + Math.cos(a) * d) * S), y = Math.round((n.y + Math.sin(a) * d * 0.72) * S);
      if (inLand(x, y, 1)) marks.push(city ? ['block', x, y, k] : ['house', x, y, k + n.x]);
    }
  }
  for (const n of nodes) if (n.kind === 'cave' && n.floor === 1) marks.push(['cave', Math.round(n.x * S), Math.round(n.y * S)]);
  if (g.stark_1f) marks.push(['volcano', Math.round(g.stark_1f.x * S), Math.round((g.stark_1f.y + 2) * S)]);
  if (g.altar) for (const [dx, dy] of [[-4, 0], [4, 0], [-2, -3], [2, -3]]) marks.push(['pillar', Math.round((g.altar.x + dx) * S), Math.round((g.altar.y + dy) * S)]);
  marks.sort((a, b) => (a[0] === 'plaza' ? -1 : 0) - (b[0] === 'plaza' ? -1 : 0) || a[2] - b[2]);
  for (const s of marks) STAMP[s[0]](t, ...s.slice(1), B);

  // ── 가장자리 구름 (그림 지도 느낌) ──
  const clouds = [];
  const per = 2 * (W + H);
  for (let k = 0; k < 34; k++) {
    const u = (k + hash2(k, 1, 101) * 0.6) / 34 * per;
    let x, y;
    if (u < W) { x = u; y = 0; } else if (u < W + H) { x = W; y = u - W; } else if (u < 2 * W + H) { x = 2 * W + H - u; y = H; } else { x = 0; y = per - u; }
    const inset = 6 + hash2(k, 2, 102) * 26;
    x += x <= 0 ? inset : x >= W ? -inset : 0; y += y <= 0 ? inset : y >= H ? -inset : 0;
    if (towns.some((n) => Math.hypot(n.x * S - x, n.y * S - y) < 44)) continue;
    clouds.push([x, y, 10 + hash2(k, 3, 103) * 14, k]);
  }
  for (const [cx, cy, r, k] of clouds) cloud(t, cx, cy, r, k);
  // 나침반 (오른쪽 바다)
  compass(t, 690, 300, land, W);
  // 가장자리 살짝 어둡게 (화면 안쪽으로 시선)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e < 10) t.put(x, y, rgba(darken(t.get(x, y), (10 - e) * 0.022)));
  }
  return t;
}

function compass(t, cx, cy, land, W) {
  for (let y = cy - 14; y <= cy + 14; y++) for (let x = cx - 14; x <= cx + 14; x++) if (land[y * W + x] <= 0) return;
  t.ellipse(cx, cy, 9, 9, rgba('#20303a')); t.ellipse(cx, cy, 8, 8, rgba('#e8f2f8')); t.ellipse(cx, cy, 6, 6, rgba('#c8dcea'));
  for (let k = 1; k <= 11; k++) { t.put(cx, cy - k, rgba(k < 7 ? '#e0473b' : '#20303a')); if (k < 6) { t.put(cx - 1, cy - k + 1, rgba('#b8302a')); t.put(cx + 1, cy - k + 1, rgba('#f07060')); } }
  for (let k = 1; k <= 8; k++) { t.put(cx, cy + k, rgba('#4a5a6a')); t.put(cx - k, cy, rgba('#4a5a6a')); t.put(cx + k, cy, rgba('#4a5a6a')); }
  t.put(cx, cy, rgba('#ffe58a'));
  // N
  const N = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 1], [2, 2], [3, 0], [3, 1], [3, 2], [3, 3]];
  for (const [x, y] of N) t.put(cx - 1 + x, cy - 17 + y, rgba('#f8fbff'));
}

/** 뭉게구름: 그림자 → 아래쪽 푸른 음영 → 흰 몸통 → 윗부분 밝게 */
function cloud(t, cx, cy, r, k) {
  const puffs = [];
  const n = 4 + Math.floor(hash2(k, 4, 104) * 3);
  for (let i = 0; i < n; i++) puffs.push([cx + (i - (n - 1) / 2) * r * 0.62 + (hash2(k, i, 105) - 0.5) * r * 0.3, cy + (hash2(k, i, 106) - 0.5) * r * 0.5 - Math.sin((i / (n - 1 || 1)) * Math.PI) * r * 0.35, r * (0.55 + hash2(k, i, 107) * 0.4)]);
  const sh = rgba('#1e3e6a60');
  for (const [x, y, rr] of puffs) for (let j = -Math.ceil(rr); j <= rr; j++) for (let i = -Math.ceil(rr); i <= rr; i++) if (i * i + j * j <= rr * rr) t.set(Math.round(x + i + 3), Math.round(y + j + 4), sh);
  for (const [x, y, rr] of puffs) for (let j = -Math.ceil(rr); j <= rr; j++) for (let i = -Math.ceil(rr); i <= rr; i++) {
    const d = i * i + j * j; if (d > rr * rr) continue;
    const X = Math.round(x + i), Y = Math.round(y + j), v = (j / rr) + bayer(X, Y) * 0.25;
    t.put(X, Y, rgba(d > (rr - 1) * (rr - 1) && j > 0 ? '#9ab8d8' : v > 0.45 ? '#cfe0f0' : v < -0.45 ? '#ffffff' : '#eef5fb'));
  }
}

function biomeOf(n) {
  if (n.kind === 'cave') return n.theme === 'ice' ? 'snow' : n.theme === 'lava' ? 'volcano' : 'rocky';
  if (n.kind === 'farm') return 'meadow';
  return n.biome ?? 'meadow';
}

// ── 스탬프 그림 ───────────────────────────────────────
const C = (c) => rgba(c);
const px = (t, x, y, c) => t.put(x, y, C(c));
const STAMP = {
  canopy(t, x, y, kind, r) {
    const P = kind === 'swamp' ? ['#1e3426', '#3a5a40', '#4e7452', '#6a9068', '#8aac80'] : kind === 'meadow' ? ['#1a4426', '#2f7a36', '#45983f', '#68b84e', '#98d86a'] : ['#12321e', '#24622e', '#337a38', '#4e9a44', '#7cc05a'];
    const ri = Math.ceil(r + 1);
    for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) {
      const d = Math.hypot(i, j * 1.1); if (d > r + 0.8) continue;
      const X = x + i, Y = y - 2 + j;
      if (d > r) { t.put(X, Y, rgba(P[0])); continue; }
      const l = (-(i + j * 1.2) / (r * 2.2)) + 0.5 + bayer(X, Y) * 0.25;
      t.put(X, Y, rgba(l > 0.95 ? P[4] : l > 0.68 ? P[3] : l > 0.38 ? P[2] : P[1]));
    }
    t.put(x, y + Math.ceil(r) - 1, rgba(P[0]));
  },
  plaza(t, x, y, R, city) {
    const ry = R * 0.68;
    for (let j = -Math.ceil(ry) - 1; j <= ry + 1; j++) for (let i = -Math.ceil(R) - 1; i <= R + 1; i++) {
      const d = Math.hypot(i / R, j / ry); if (d > 1.06) continue;
      const X = x + i, Y = y + j;
      t.put(X, Y, rgba(d > 0.94 ? '#8a7c68' : city ? ((X + Y) % 6 === 0 ? '#b8b4ac' : '#cfcbc2') : (bayer(X, Y) < 0.2 ? '#cbbf9e' : '#dccfac')));
    }
  },

  tree(t, x, y, kind) {
    const pal = kind === 'swamp' ? ['#2a4a34', '#3e6448', '#56805a'] : ['#1f4e2c', '#2f7036', '#4c9a44'];
    const hl = kind === 'swamp' ? '#6e9a6a' : '#76bc5a';
    t.ellipse(x + 1, y + 1, 3, 1, C(darken(t.get(x, y + 1), 0.25)));    // 그림자
    px(t, x, y, '#5a3a22'); px(t, x, y - 1, '#5a3a22');
    t.ellipse(x, y - 4, 4, 4, C(OUT)); t.ellipse(x, y - 4, 3, 3, C(pal[1]));
    t.ellipse(x + 1, y - 3, 2, 2, C(pal[0])); t.ellipse(x - 1, y - 5, 1, 1, C(hl)); px(t, x - 2, y - 4, pal[2]);
  },
  pine(t, x, y, snow) {
    const pal = snow ? ['#3a5a5a', '#507a74', '#e8f0f6'] : ['#1a4a30', '#2a6a3a', '#3e8a46'];
    t.ellipse(x + 1, y + 1, 2, 1, C(darken(t.get(x, y + 1), 0.25)));
    px(t, x, y, '#4a3020');
    for (let k = 0; k < 7; k++) { const w = Math.floor(k / 2) + 1; for (let i = -w; i <= w; i++) px(t, x + i, y - 7 + k, i === -w || i === w ? OUT : i > 0 ? pal[0] : pal[1]); }
    px(t, x, y - 8, OUT);
    if (snow) { px(t, x, y - 7, pal[2]); px(t, x - 1, y - 5, pal[2]); px(t, x, y - 5, pal[2]); px(t, x - 2, y - 3, pal[2]); px(t, x - 1, y - 3, pal[2]); }
  },
  peak(t, x, y, h, snow) {
    const ash = snow === 'ash';
    const lit = ash ? '#8a6a5a' : '#c4b6a0', dark = ash ? '#4a3434' : '#7a6a5a', cap = '#f8fbff';
    for (let k = 0; k <= h; k++) {
      const w = Math.round((k / h) * h * 0.95);
      for (let i = -w; i <= w; i++) {
        const yy = y - h + k;
        let c = i < 0 ? lit : dark;
        if (i === -w || i === w || k === h) c = OUT;
        else if (snow === true && k < h * 0.42) c = i < 0 ? cap : '#c8d6e6';
        else if (ash && k < 2) c = '#e06a3a';
        px(t, x + i, yy, c);
      }
    }
  },
  boulder(t, x, y) { t.ellipse(x, y, 3, 2, C(OUT)); t.ellipse(x, y, 2, 1, C('#a49a8a')); px(t, x - 1, y - 1, '#cfc6b4'); },
  flowers(t, x, y) { const cs = ['#f6e05a', '#ffffff', '#f49ac0']; for (let k = 0; k < 3; k++) px(t, x + (k - 1) * 2, y + (k % 2), cs[(x + k) % 3]); },
  dune(t, x, y) { for (let i = -5; i <= 5; i++) { const yy = y - Math.round(Math.cos((i / 5) * 1.4) * 2); px(t, x + i, yy, '#f4e0aa'); px(t, x + i, yy + 1, '#c89a58'); } },
  cactus(t, x, y) { for (let k = 0; k < 6; k++) px(t, x, y - k, k ? '#4a8a44' : '#2a4a2a'); px(t, x - 1, y - 4, '#4a8a44'); px(t, x - 2, y - 4, '#4a8a44'); px(t, x - 2, y - 5, '#4a8a44'); px(t, x + 1, y - 2, '#4a8a44'); px(t, x + 2, y - 3, '#4a8a44'); px(t, x + 1, y - 5, '#76b05a'); },
  reeds(t, x, y) { for (const [dx, h] of [[-2, 4], [0, 6], [2, 5]]) for (let k = 0; k < h; k++) px(t, x + dx, y - k, k === h - 1 ? '#a8864a' : '#6a8a4a'); },
  puddle(t, x, y) { t.ellipse(x, y, 4, 2, C('#4a7a7a')); t.ellipse(x - 1, y, 2, 1, C('#6a9a96')); },
  palm(t, x, y) { for (let k = 0; k < 6; k++) px(t, x + (k > 3 ? 1 : 0), y - k, '#8a6a3a'); for (const [dx, dy] of [[-3, -6], [-2, -7], [-1, -7], [1, -7], [2, -7], [3, -6], [0, -8], [-3, -5], [3, -5]]) px(t, x + dx + 1, y + dy, '#3e8a3e'); },
  crystal(t, x, y) { for (let k = 0; k < 6; k++) { const w = k < 2 ? 0 : 1; for (let i = -w; i <= w; i++) px(t, x + i, y - 5 + k, i < 0 ? '#c8a8ff' : '#7a5ac8'); } px(t, x, y - 6, OUT); },
  volcano(t, x, y) {
    const h = 22;
    for (let k = 0; k <= h; k++) {
      const w = 3 + Math.round((k / h) * 17);
      for (let i = -w; i <= w; i++) {
        let c = i < -w / 3 ? '#8a5a4a' : i < w / 3 ? '#6a4038' : '#4a2c2a';
        if (i === -w || i === w || k === h) c = OUT;
        if (k < 2 && Math.abs(i) < w - 1) c = k === 0 ? '#ff9a3a' : '#e8502a';
        if (k > 2 && k < 9 && Math.abs(i + (k % 3) - 1) < 1 && hash2(i, k, 9) < 0.6) c = '#d8502a';   // 용암 줄기
        px(t, x + i, y - h + k, c);
      }
    }
    for (const [dx, dy, r] of [[-2, -27, 3], [3, -31, 3], [0, -36, 2]]) { t.ellipse(x + dx, y + dy, r, r - 1, C('#b0a8a8')); px(t, x + dx - 1, y + dy - 1, '#e0dcdc'); }
  },
  block(t, x, y, k) {
    const w = 3 + (k % 3), h = 3 + ((k * 7) % 4), roof = ['#5a6a8a', '#8a5a5a', '#6a8a9a', '#9a8a6a'][k % 4];
    t.rect(x - w, y - h - 1, w * 2 + 1, h + 2, C(OUT));
    t.rect(x - w + 1, y - h, w * 2 - 1, h, C('#e8e4dc')); t.rect(x - w + 1, y - h, w * 2 - 1, 1, C(roof));
    for (let i = -w + 2; i < w; i += 2) for (let j = y - h + 2; j < y - 1; j += 2) px(t, x + i, j, '#8ab4d4');
  },
  house(t, x, y, k) {
    const roof = ['#d0543a', '#3a8ab8', '#e0a03a', '#5a9a4a'][Math.floor(k) % 4];
    t.rect(x - 3, y - 2, 7, 4, C(OUT)); t.rect(x - 2, y - 1, 5, 2, C('#f6ead2')); px(t, x, y, '#6a4a2a');
    for (let i = 0; i < 3; i++) t.rect(x - 3 + i, y - 3 - i, 7 - i * 2, 1, C(i === 2 ? lighten(roof, 0.25) : roof));
    px(t, x - 4, y - 2, OUT); px(t, x + 4, y - 2, OUT);
  },
  cave(t, x, y) { t.ellipse(x, y, 5, 4, C(OUT)); t.ellipse(x, y + 1, 3, 3, C('#1a1414')); t.rect(x - 5, y + 1, 11, 2, C(OUT)); px(t, x - 3, y - 3, '#a89a88'); px(t, x + 3, y - 2, '#8a7a6a'); },
  pillar(t, x, y) { t.rect(x - 1, y - 6, 3, 7, C(OUT)); px(t, x, y - 5, '#f0ece0'); px(t, x, y - 4, '#d8d0c0'); px(t, x, y - 3, '#f0ece0'); px(t, x, y - 2, '#d8d0c0'); px(t, x, y - 1, '#c8c0b0'); },
};
