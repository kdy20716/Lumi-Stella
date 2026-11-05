// 지형 타일셋: 잔디/흙/물 오토타일(듀얼그리드 16종), 경작지(4비트 16종), 장식 타일
import { Img, mix, darken, lighten, withAlpha, hash2, fbm, vnoise } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

export const T = 16;
export const TILESET_COLS = 16;
// 타일셋 행 정의 (맵 생성기와 게임 코드가 공유)
export const ROW = { GRASS: 0, DIRT: 1, GRASS_DIRT: 2, GRASS_WATER: 3, TILLED: 4, TILLED_WET: 5, DECOR: 6, WOOD: 7, MISC: 8, STONE: 9, GRASS_STONE: 10, CLIFF: 11 };
export const TILESET_ROWS = 12;
/** 2.5D 높낮이: 절벽 앞면(왼끝 · 가운데 · 오른끝 · 변형) · 계단 · 턱(한 방향 뛰어내리기) */
export const CLIFF = { FACE_L: 0, FACE: 1, FACE_R: 2, STAIRS: 3, LEDGE_L: 4, LEDGE: 5, LEDGE_R: 6, FACE2: 7, BASE_L: 8, BASE: 9, BASE_R: 10, BASE2: 11, SHADE: 12 };
export const DECOR = { FLOWER0: 0, FLOWER_COUNT: 6, PEBBLE0: 6, CLOVER0: 8, MUSHROOM: 10, LEAVES: 11, DAISY: 12, STONES: 13, GRASS_DARK: 14, PATCH: 15 };
export const WOOD = { DOCK_H: 0, DOCK_POST: 1, PORCH: 2, STEP0: 3, STEP1: 4, BRIDGE_TOP: 5, BRIDGE_MID: 6, BRIDGE_BOT: 7 };
export const MISC = { COLLIDE: 0, TILE_CURSOR: 1 };

const wrap = (v, p) => ((v % p) + p) % p;

/** 64x64 반복 잔디 텍스처 */
function grassTexture() {
  const S = 64, g = P.grass, img = new Img(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x / 8, y / 8, 8, 11, 3);
    const m = vnoise(x / 4, y / 4, 16, 5) * 0.22;
    const v = n + m - 0.11;
    img.put(x, y, v < 0.33 ? g.d1 : v < 0.64 ? g.base : g.l1);
  }
  // 잔디 잎 스트로크 (주기적으로 배치)
  for (let k = 0; k < 150; k++) {
    const x = Math.floor(hash2(k, 1, 77) * S), y = Math.floor(hash2(k, 2, 77) * S);
    const big = hash2(k, 3, 77) < 0.35;
    const put = (dx, dy, c) => img.put(wrap(x + dx, S), wrap(y + dy, S), c);
    put(0, 1, g.d1); put(0, 0, g.l2);
    if (big) { put(-1, 1, g.l1); put(1, 1, g.l1); put(-1, 2, g.d1); put(1, 2, g.d1); put(0, -1, g.l3); }
    else put(1, 1, g.d1);
  }
  // 아주 어두운 점(깊이감)
  for (let k = 0; k < 60; k++) {
    const x = Math.floor(hash2(k, 9, 13) * S), y = Math.floor(hash2(k, 8, 13) * S);
    img.put(x, y, g.d2); img.put(wrap(x + 1, S), y, g.d1);
  }
  return img;
}

function dirtTexture() {
  const S = 64, d = P.dirt, img = new Img(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = fbm(x / 8, y / 8, 8, 21, 3) + vnoise(x / 2, y / 2, 32, 4) * 0.15 - 0.07;
    img.put(x, y, n < 0.38 ? d.d1 : n < 0.64 ? d.base : d.l1);
  }
  for (let k = 0; k < 40; k++) {
    const x = Math.floor(hash2(k, 1, 31) * S), y = Math.floor(hash2(k, 2, 31) * S);
    const put = (dx, dy, c) => img.put(wrap(x + dx, S), wrap(y + dy, S), c);
    if (hash2(k, 3, 31) < 0.5) { put(0, 0, d.l2); put(1, 0, d.l1); put(0, 1, d.peb); put(1, 1, d.d2); }
    else { put(0, 0, d.l2); put(0, 1, d.d2); }
  }
  return img;
}

/** 64x64 반복 돌바닥(조약돌 포장) 텍스처: 주기적 지터 격자 보로노이 */
function stoneTexture() {
  const S = 64, C = 8, N = S / C, img = new Img(S, S), st = P.stone;
  const pts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([i * C + 1.5 + hash2(i, j, 51) * 5, j * C + 1.5 + hash2(i, j, 52) * 5, hash2(i, j, 53)]);
  const tones = ['#9a9ca6', '#a9aab2', '#8e909c', '#b3b2b0', '#a39f98'];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const [px, py, r] of pts) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const d = Math.hypot(x + 0.5 - (px + ox), y + 0.5 - (py + oy));
      if (d < d1) { d2 = d1; d1 = d; best = [px + ox, py + oy, r]; } else if (d < d2) d2 = d;
    }
    let c;
    if (d2 - d1 < 1.1) c = '#6b6a6e';
    else {
      c = tones[Math.floor(best[2] * tones.length)];
      const dx = x + 0.5 - best[0], dy = y + 0.5 - best[1];
      if (dx + dy < -3.2) c = lighten(c, 0.28); else if (dx + dy > 3) c = darken(c, 0.16);
      if (d2 - d1 < 2 && dy > 0) c = darken(c, 0.12);
    }
    img.put(x, y, c);
  }
  void st;
  return img;
}

/** 듀얼그리드 코너 → 지형 판정 함수. 1 = 상대 지형(흙/물) */
function cornerField(idx, seed, amp = 0.42) {
  const tl = (idx >> 3) & 1, tr = (idx >> 2) & 1, bl = (idx >> 1) & 1, br = idx & 1;
  return (px, py) => {
    const u = (px + 0.5) / T, v = (py + 0.5) / T;
    const cu = Math.min(1, Math.max(0, u)), cv = Math.min(1, Math.max(0, v));
    const top = tl + (tr - tl) * cu, bot = bl + (br - bl) * cu;
    const f = top + (bot - top) * cv;
    const n = (fbm(px / 4, py / 4, 4, seed, 2) - 0.5) * amp;
    return f + n > 0.5 ? 1 : 0;
  };
}

export function buildTileset() {
  const rows = TILESET_ROWS;
  const img = new Img(TILESET_COLS * T, rows * T);
  const grass = grassTexture(), dirt = dirtTexture(), stone = stoneTexture();
  const at = (col, row) => [col * T, row * T];

  // Row 0/1: 잔디/흙 16 변형 (4x4 조각 = 64px 주기 반복으로 패턴 반복이 눈에 안 띔)
  for (let i = 0; i < 16; i++) {
    const sx = (i % 4) * T, sy = Math.floor(i / 4) * T;
    let [x, y] = at(i, ROW.GRASS); img.blit(grass, x, y, { sx, sy, sw: T, sh: T });
    [x, y] = at(i, ROW.DIRT); img.blit(dirt, x, y, { sx, sy, sw: T, sh: T });
    [x, y] = at(i, ROW.STONE); img.blit(stone, x, y, { sx, sy, sw: T, sh: T });
  }

  // Row 10: 잔디↔돌길 전이 (깔끔한 연석 느낌: 노이즈 약하게)
  for (let idx = 0; idx < 16; idx++) {
    const [ox, oy] = at(idx, ROW.GRASS_STONE);
    const F0 = cornerField(idx, 17, 0.16);
    const F = (px, py) => F0(px, py);
    const gsx = (idx % 4) * T, gsy = Math.floor(idx / 4) * T;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      if (F(px, py)) {
        let c = stone.get(gsx + px, gsy + py);
        const edge = !F(px, py - 1) || !F(px - 1, py) || !F(px + 1, py) || !F(px, py + 1);
        if (edge) c = rgbArr(!F(px, py - 1) ? '#5d5c62' : '#76757c');
        img.put(ox + px, oy + py, c);
      } else {
        let c = grass.get(gsx + px, gsy + py);
        if (F(px, py + 1)) c = rgbArr(P.grass.l2);
        else if (F(px - 1, py) || F(px + 1, py) || F(px, py - 1)) c = rgbArr(P.grass.d1);
        img.put(ox + px, oy + py, c);
      }
    }
  }

  // Row 2: 잔디↔흙 전이
  for (let idx = 0; idx < 16; idx++) {
    const [ox, oy] = at(idx, ROW.GRASS_DIRT);
    const F = cornerField(idx, 3);
    const gsx = (idx % 4) * T, gsy = Math.floor(idx / 4) * T;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const isDirt = F(px, py);
      if (isDirt) {
        let c = dirt.get(gsx + px, gsy + py);
        const up = F(px, py - 1) === 0, up2 = F(px, py - 2) === 0;
        const side = F(px - 1, py) === 0 || F(px + 1, py) === 0;
        if (up) c = rgbArr(P.dirt.d2); else if (side || up2) c = rgbArr(mix(c, P.dirt.d2, 0.55));
        img.put(ox + px, oy + py, c);
      } else {
        let c = grass.get(gsx + px, gsy + py);
        const down = F(px, py + 1) === 1;
        const near = F(px - 1, py) || F(px + 1, py) || F(px, py - 1);
        if (down) c = rgbArr(P.grass.l2);
        else if (near) c = rgbArr(P.grass.d1);
        img.put(ox + px, oy + py, c);
      }
    }
  }

  // Row 3: 잔디↔물 전이 (물 영역은 투명 → 아래 애니메이션 물 레이어가 비침)
  for (let idx = 0; idx < 16; idx++) {
    const [ox, oy] = at(idx, ROW.GRASS_WATER);
    const F = cornerField(idx, 9);
    const gsx = (idx % 4) * T, gsy = Math.floor(idx / 4) * T;
    for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
      const isWater = F(px, py);
      if (!isWater) {
        let c = grass.get(gsx + px, gsy + py);
        const adj = F(px + 1, py) || F(px - 1, py) || F(px, py + 1) || F(px, py - 1);
        const adj2 = F(px + 2, py) || F(px - 2, py) || F(px, py + 2);
        if (adj) c = rgbArr(P.grass.d2); else if (adj2) c = rgbArr(P.grass.d1);
        img.put(ox + px, oy + py, c);
      } else {
        // 물가 둑(위쪽 땅 아래로 흙 절벽), 거품 라인
        const land1 = F(px, py - 1) === 0, land2 = F(px, py - 2) === 0, land3 = F(px, py - 3) === 0;
        const sideLand = F(px - 1, py) === 0 || F(px + 1, py) === 0 || F(px, py + 1) === 0;
        if (land1) img.put(ox + px, oy + py, P.dirt.d1);
        else if (land2) img.put(ox + px, oy + py, P.dirt.d2);
        else if (land3) img.put(ox + px, oy + py, withAlpha(P.water.foam, 0.65));
        else if (sideLand) img.put(ox + px, oy + py, withAlpha(P.water.foam, 0.55));
        else if (F(px - 2, py) === 0 || F(px + 2, py) === 0 || F(px, py + 2) === 0 || F(px, py - 4) === 0)
          img.put(ox + px, oy + py, withAlpha(P.water.deep, 0.35));
      }
    }
  }

  // Row 4/5: 경작지 (N=1 E=2 S=4 W=8 연결 비트)
  for (const [row, pal, seed] of [[ROW.TILLED, P.soil, 5], [ROW.TILLED_WET, P.wet, 6]]) {
    for (let mask = 0; mask < 16; mask++) {
      const [ox, oy] = at(mask, row);
      const N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
      for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
        const dN = N ? 99 : py, dS = S ? 99 : T - 1 - py, dW = W ? 99 : px, dE = E ? 99 : T - 1 - px;
        const d = Math.min(dN, dS, dW, dE);
        // 둥근 모서리
        const cornerCut = (!N && !W && px + py < 2) || (!N && !E && (T - 1 - px) + py < 2) ||
          (!S && !W && px + (T - 1 - py) < 2) || (!S && !E && (T - 1 - px) + (T - 1 - py) < 2);
        if (cornerCut) continue;
        const n = vnoise(px / 2.5, py / 2.5, 6.4, seed + mask) ;
        let c = (py % 4 === 1) ? pal.d1 : (py % 4 === 2 ? pal.base : (n > 0.55 ? pal.l1 : pal.base));
        if (n < 0.18) c = pal.d1;
        if (hash2(px, py, seed * 7 + mask) < 0.04) c = pal.l2;
        if (d === 0) c = pal.d2;
        else if (d === 1) c = (dN === 1 || dW === 1) ? pal.l2 : pal.d1;
        img.put(ox + px, oy + py, c);
      }
    }
  }

  // Row 6: 장식 (꽃, 자갈, 클로버, 버섯 등) - 투명 배경 위
  const decor = (col, fn) => { const t = new Img(T, T); fn(t); t.outline(P.outline, 0.35); const [x, y] = at(col, ROW.DECOR); img.blit(t, x, y); };
  const flower = (t, x, y, c) => {
    t.set(x, y + 2, P.leaf.d1); t.set(x - 1, y + 3, P.leaf.base); t.set(x, y + 3, P.leaf.d1);
    t.set(x - 1, y, c); t.set(x + 1, y, c); t.set(x, y - 1, lighten(c, 0.3)); t.set(x, y + 1, darken(c, 0.2));
    t.set(x, y, '#ffd84a');
  };
  for (let i = 0; i < DECOR.FLOWER_COUNT; i++) decor(DECOR.FLOWER0 + i, (t) => {
    const c = P.flowers[i];
    const pts = [[4, 5], [10, 3], [7, 10], [12, 11], [3, 12]];
    pts.forEach(([x, y], k) => { if (k < 3 + (i % 3)) flower(t, x, y, k === 4 ? P.flowers[(i + 2) % 6] : c); });
  });
  for (let i = 0; i < 2; i++) decor(DECOR.PEBBLE0 + i, (t) => {
    const pts = i ? [[4, 4], [11, 9], [6, 12]] : [[9, 5], [4, 10]];
    for (const [x, y] of pts) { t.rect(x, y, 3, 2, P.stone.base); t.set(x, y, P.stone.l2); t.hline(x, y + 2, 3, P.stone.d1); }
  });
  for (let i = 0; i < 2; i++) decor(DECOR.CLOVER0 + i, (t) => {
    const pts = i ? [[4, 4], [10, 7], [5, 11], [12, 12]] : [[6, 6], [11, 11]];
    for (const [x, y] of pts) {
      t.set(x, y, P.grass.l2); t.set(x + 1, y, P.grass.l1); t.set(x, y + 1, P.grass.l1); t.set(x + 1, y + 1, P.grass.base);
      t.set(x - 1, y + 1, P.grass.l2); t.set(x + 1, y - 1, P.grass.l3);
    }
  });
  decor(DECOR.MUSHROOM, (t) => {
    for (const [x, y, c] of [[5, 7, '#d8473b'], [10, 10, '#c9763b']]) {
      t.rect(x, y + 2, 2, 3, '#f1e3c8'); t.rrect(x - 2, y, 6, 3, c); t.set(x - 1, y, lighten(c, 0.4)); t.set(x + 1, y + 1, '#fff');
    }
  });
  decor(DECOR.LEAVES, (t) => {
    for (const [x, y, c] of [[3, 4, '#d9862f'], [10, 6, '#c55a2b'], [6, 11, '#e3b23c']]) { t.rect(x, y, 3, 2, c); t.set(x + 1, y - 1, c); t.set(x + 3, y + 1, darken(c, 0.3)); }
  });
  decor(DECOR.DAISY, (t) => { for (const [x, y] of [[4, 4], [11, 6], [7, 11], [13, 12], [2, 10]]) flower(t, x, y, '#ffffff'); });
  decor(DECOR.STONES, (t) => {
    t.rrect(3, 7, 6, 5, P.stone.base, 1); t.hline(4, 7, 4, P.stone.l2); t.hline(4, 11, 4, P.stone.d1);
    t.rrect(9, 10, 4, 3, P.stone.d1, 1); t.set(10, 10, P.stone.l1);
  });
  decor(DECOR.GRASS_DARK, (t) => {
    for (const [x, y] of [[3, 6], [8, 4], [12, 9], [5, 12], [10, 13]]) {
      t.vline(x, y, 3, P.grass.d1); t.set(x - 1, y + 1, P.grass.d1); t.set(x + 1, y + 1, P.grass.d2); t.set(x, y - 1, P.grass.l1);
    }
  });
  decor(DECOR.PATCH, (t) => { // 흙 위 잡초
    for (const [x, y] of [[5, 6], [10, 10]]) { t.set(x, y, P.grass.l1); t.set(x - 1, y + 1, P.grass.base); t.set(x + 1, y + 1, P.grass.base); t.set(x, y + 1, P.grass.d1); }
  });

  // Row 7: 목재 (부두, 현관, 징검돌, 다리)
  const wood = (col, fn) => { const t = new Img(T, T); fn(t); const [x, y] = at(col, ROW.WOOD); img.blit(t, x, y); };
  const planksH = (t, y0 = 0, h = T) => {
    for (let y = y0; y < y0 + h; y++) for (let x = 0; x < T; x++) {
      const r = (y - y0) % 4;
      let c = r === 3 ? P.plank.d1 : r === 0 ? P.plank.l2 : P.plank.base;
      if (r !== 3 && hash2(x, y, 3) < 0.12) c = P.plank.l1;
      if (r !== 3 && (x + Math.floor((y - y0) / 4) * 5) % 11 === 0) c = P.plank.d1;
      t.put(x, y, c);
    }
  };
  wood(WOOD.DOCK_H, (t) => planksH(t));
  wood(WOOD.DOCK_POST, (t) => { planksH(t, 0, 8); t.rect(2, 8, 3, 8, P.wood.d1); t.rect(11, 8, 3, 8, P.wood.d1); t.vline(2, 8, 8, P.wood.base); t.vline(11, 8, 8, P.wood.base); t.rect(2, 14, 3, 2, withAlpha(P.water.foam, 0.6)); t.rect(11, 14, 3, 2, withAlpha(P.water.foam, 0.6)); });
  wood(WOOD.PORCH, (t) => { for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { const r = x % 4; t.put(x, y, r === 3 ? P.wood.d1 : r === 0 ? P.wood.l2 : P.wood.l1); } });
  for (let s = 0; s < 2; s++) wood(WOOD.STEP0 + s, (t) => {
    const pts = s ? [[3, 3, 5, 4], [9, 8, 5, 5]] : [[4, 4, 8, 7]];
    for (const [x, y, w, h] of pts) { t.rrect(x, y + 1, w, h, P.stone.d1, 1); t.rrect(x, y, w, h, P.stone.base, 1); t.hline(x + 1, y, w - 2, P.stone.l2); t.set(x + 1, y + 1, P.stone.l1); }
    t.outline(P.outline, 0.4);
  });
  wood(WOOD.BRIDGE_TOP, (t) => { planksV(t); t.rect(0, 0, T, 3, P.wood.d1); t.hline(0, 0, T, P.wood.l1); });
  wood(WOOD.BRIDGE_MID, (t) => planksV(t));
  wood(WOOD.BRIDGE_BOT, (t) => { planksV(t); t.rect(0, 13, T, 3, P.wood.d2); });

  // Row 11: 2.5D 절벽 · 계단 · 턱
  {
    const R = { d2: '#3e332c', d1: '#5e4e42', base: '#806e5c', l1: '#a08c74', l2: '#bcaa8e' };
    const G = P.grass;
    const face = (col, { l = false, r = false, seed = 0, base = false } = {}) => {
      const [ox, oy] = at(col, ROW.CLIFF);
      for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
        // 끝 모서리는 둥글게 깎음
        if ((l && px + py < 2) || (r && (T - 1 - px) + py < 2)) continue;
        let c;
        if (!base && py < 3) c = py === 0 ? G.l2 : hash2(px, py, 31 + seed) < 0.3 ? G.l1 : G.base;      // 위 잔디 처마
        else if (!base && py === 3) c = R.d2;                                                // 처마 그림자
        else if (base && py >= 13) c = py === 15 ? '#221a14' : py === 14 ? '#2e241c' : R.d2;  // 땅에 닿는 그늘
        else {
          const st = (py + (base ? 0 : -4) + 16) % 4;                                         // 지층
          c = st === 0 ? R.l1 : st === 3 ? R.d1 : (hash2(px >> 1, py, 37 + seed) < 0.2 ? R.l2 : R.base);
          if (hash2(px, (py - 4) >> 2, 41 + seed) < 0.12) c = R.d2;                           // 세로 금
        }
        if ((l && px === 0) || (r && px === T - 1)) c = !base && py < 3 ? G.d1 : R.d2;        // 옆 끝선
        if (base && !l && !r && py < 13) c = mix(c, '#000000', py / 40);                    // 아래로 갈수록 어둡게
        else if (l && px === 1 && py > 3) c = R.l1; else if (r && px === T - 2 && py > 3) c = R.d1;
        img.put(ox + px, oy + py, c);
      }
    };
    face(CLIFF.FACE_L, { l: true }); face(CLIFF.FACE); face(CLIFF.FACE_R, { r: true }); face(CLIFF.FACE2, { seed: 5 });
    face(CLIFF.BASE_L, { l: true, base: true }); face(CLIFF.BASE, { base: true }); face(CLIFF.BASE_R, { r: true, base: true }); face(CLIFF.BASE2, { seed: 9, base: true });
    // 절벽 아래 땅에 드리우는 그늘 (반투명)
    { const [ox, oy] = at(CLIFF.SHADE, ROW.CLIFF); for (let py = 0; py < 6; py++) for (let px = 0; px < T; px++) img.put(ox + px, oy + py, withAlpha('#0e1408', 0.34 - py * 0.055)); }
    // 계단: 돌 4단 + 양옆 난간
    { const [ox, oy] = at(CLIFF.STAIRS, ROW.CLIFF); const S = P.stone;
      for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
        const k = py % 4;
        let c = k === 0 ? S.l2 : k === 1 ? S.l1 : k === 2 ? S.base : S.d1;
        if (px === 0 || px === T - 1) c = S.d2; else if (px === 1) c = S.l1; else if (px === T - 2) c = S.d1;
        img.put(ox + px, oy + py, c);
      } }
    // 턱: 칸 아래쪽에 잔디 처마 + 흙 단면 (위는 투명 → 아래 잔디가 비침)
    const ledge = (col, l, r) => {
      const [ox, oy] = at(col, ROW.CLIFF);
      for (let py = 8; py < T; py++) for (let px = 0; px < T; px++) {
        if ((l && px + (py - 8) < 2) || (r && (T - 1 - px) + (py - 8) < 2)) continue;
        let c = py === 8 ? G.l2 : py <= 10 ? (hash2(px, py, 51) < 0.3 ? G.l1 : G.base) : py === 11 ? '#3a2a1a' : py <= 13 ? (hash2(px, py, 53) < 0.25 ? '#9a7a50' : '#7a5c3a') : withAlpha('#1a1208', py === 14 ? 0.45 : 0.22);
        if ((l && px === 0) || (r && px === T - 1)) c = py <= 10 ? G.d1 : '#3a2a1a';
        img.put(ox + px, oy + py, c);
      }
    };
    ledge(CLIFF.LEDGE_L, true, false); ledge(CLIFF.LEDGE, false, false); ledge(CLIFF.LEDGE_R, false, true);
  }

  // Row 8: 기타 (충돌 마커, 커서)
  { const [x, y] = at(MISC.COLLIDE, ROW.MISC); img.rect(x, y, T, T, withAlpha('#ff3355', 0.45)); }
  return img;
}

function planksV(t) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const r = y % 5;
    let c = r === 4 ? P.plank.d1 : r === 0 ? P.plank.l2 : P.plank.base;
    if (x === 0 || x === T - 1) c = P.wood.d1;
    if (r !== 4 && hash2(x, y, 9) < 0.1) c = P.plank.l1;
    t.put(x, y, c);
  }
  t.vline(1, 0, T, P.wood.l1); t.vline(T - 2, 0, T, P.wood.d2);
}

const rgbArr = (c) => (typeof c === 'string' ? hexToArr(c) : c);
function hexToArr(h) { const n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255]; }

/** 물 애니메이션 텍스처: 64x64, 4프레임 가로 배치 (TileSprite용) */
export function buildWater() {
  const S = 64, frames = 4, w = P.water;
  const img = new Img(S * frames, S);
  for (let f = 0; f < frames; f++) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ph = f / frames;
      const n = fbm(x / 16 + ph, y / 16, 4, 41, 2);
      const n2 = vnoise(x / 8 - ph * 2, y / 4, 8, 7);
      let c = n < 0.42 ? w.d1 : n < 0.62 ? w.base : w.l1;
      if (n2 > 0.78 && n > 0.45) c = w.l2;
      if (n < 0.3) c = w.deep;
      img.put(f * S + x, y, c);
    }
    // 반짝이는 물결선
    for (let k = 0; k < 18; k++) {
      const bx = Math.floor(hash2(k, 1, 91) * S), by = Math.floor(hash2(k, 2, 91) * S);
      const off = Math.round(Math.sin((f / frames) * Math.PI * 2 + k) * 2);
      const len = 3 + Math.floor(hash2(k, 3, 91) * 3);
      for (let i = 0; i < len; i++) img.put(f * S + wrap(bx + i + off, S), by, i === 1 ? w.foam : w.l2);
    }
  }
  return img;
}
