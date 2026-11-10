// 작물 성장단계 스프라이트, 아이템 아이콘, DOM UI용 9-slice 패널
import { Img, mix, darken, lighten, hash2 } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const O = P.outline;
export const CROP_IDS = ['parsnip', 'cauliflower', 'tomato', 'pumpkin', 'lumi_herb', 'fire_pepper', 'iron_bean'];
export const CROP_STAGES = 5; // 0=씨앗 … 4=수확가능

function leaf(t, x, y, dx, dy, len, pal) {
  // (x,y)에서 방향 (dx,dy)로 뻗는 잎: 가운데 굵고 끝 뾰족
  for (let i = 0; i < len; i++) {
    const px = Math.round(x + dx * i), py = Math.round(y + dy * i);
    const w = i === 0 || i === len - 1 ? 0 : i < len / 2 ? 1 : 1;
    t.set(px, py, i < len / 2 ? pal.base : pal.l1);
    if (w) { t.set(px + (Math.abs(dy) > Math.abs(dx) ? 1 : 0), py + (Math.abs(dy) > Math.abs(dx) ? 0 : 1), pal.d1); }
  }
  t.set(Math.round(x + dx * (len - 1)), Math.round(y + dy * (len - 1)), pal.l2);
}

const L = P.leaf;
function seedMound(t) {
  t.ellipse(8, 26, 5, 2, P.soil.l1); t.hline(5, 27, 6, P.soil.d1);
  t.set(6, 25, '#e8d5a8'); t.set(9, 26, '#e8d5a8'); t.set(10, 25, '#d9c08a'); t.set(7, 26, '#d9c08a');
}
function sprout(t) { t.vline(8, 23, 4, L.d1); leaf(t, 8, 23, -1, -0.6, 3, L); leaf(t, 8, 23, 1, -0.6, 3, L); }

const DRAW = {
  parsnip: [seedMound, sprout,
    (t) => { t.vline(8, 21, 6, L.d1); leaf(t, 8, 22, -1, -0.8, 5, L); leaf(t, 8, 22, 1, -0.8, 5, L); leaf(t, 8, 21, 0, -1, 4, L); },
    (t) => { leaf(t, 8, 25, -1, -1, 7, L); leaf(t, 8, 25, 1, -1, 7, L); leaf(t, 8, 25, -0.3, -1, 8, L); leaf(t, 8, 25, 0.4, -1, 8, L); t.ellipse(8, 26, 3, 1.5, '#efe0b8'); },
    (t) => { leaf(t, 8, 22, -1, -1, 7, L); leaf(t, 8, 22, 1, -1, 7, L); leaf(t, 8, 22, -0.3, -1, 9, L); leaf(t, 8, 22, 0.4, -1, 9, L);
      t.ellipse(8, 25, 4, 3.5, '#f3e6c4'); t.rect(6, 23, 3, 2, '#fff8e6'); t.hline(5, 27, 7, '#cdb78a'); t.vline(8, 28, 2, '#cdb78a'); t.hline(5, 22, 7, L.d1); },
  ],
  cauliflower: [seedMound, sprout,
    (t) => { for (const [dx, dy] of [[-1, -0.4], [1, -0.4], [-0.5, -1], [0.5, -1]]) leaf(t, 8, 25, dx, dy, 5, L); },
    (t) => { t.ellipse(8, 22, 6, 4, L.d1); t.ellipse(8, 21, 5, 3, L.base); for (const [dx, dy] of [[-1, -0.3], [1, -0.3], [-0.6, -1], [0.6, -1]]) leaf(t, 8, 24, dx, dy, 7, L); },
    (t) => { t.ellipse(8, 22, 7, 5, L.d1); for (const [dx, dy] of [[-1, -0.2], [1, -0.2], [-1, 0.3], [1, 0.3]]) leaf(t, 8, 24, dx, dy, 8, L);
      t.ellipse(8, 20, 5, 4, '#f6f0dc'); for (const [x, y] of [[6, 18], [9, 19], [7, 21], [10, 21], [5, 20]]) { t.set(x, y, '#ffffff'); t.set(x + 1, y + 1, '#d9cfae'); } },
  ],
  tomato: [seedMound, sprout,
    (t) => { t.vline(8, 18, 9, L.d1); leaf(t, 8, 22, -1, -0.5, 4, L); leaf(t, 8, 20, 1, -0.5, 4, L); leaf(t, 8, 18, -0.6, -1, 3, L); t.vline(11, 14, 13, P.wood.l1); },
    (t) => { t.vline(11, 8, 19, P.wood.l1); t.vline(8, 12, 15, L.d1); for (let y = 13; y < 26; y += 3) { leaf(t, 8, y, -1, -0.4, 5, L); leaf(t, 8, y + 1, 1, -0.4, 4, L); } t.set(6, 18, '#ffd65a'); t.set(5, 22, '#ffd65a'); },
    (t) => { t.vline(11, 6, 21, P.wood.l1); t.vline(8, 10, 17, L.d1); for (let y = 11; y < 26; y += 3) { leaf(t, 8, y, -1, -0.4, 5, L); leaf(t, 8, y + 1, 1, -0.4, 4, L); }
      for (const [x, y] of [[5, 15], [9, 19], [5, 22], [10, 13]]) { t.ellipse(x + 1, y + 1, 2, 2, '#d8473b'); t.set(x, y, '#ff8a7a'); t.set(x + 1, y - 1, L.l1); } },
  ],
  pumpkin: [seedMound, sprout,
    (t) => { leaf(t, 8, 25, -1, -0.4, 5, L); leaf(t, 8, 25, 1, -0.4, 5, L); t.ellipse(5, 22, 3, 2, L.base); t.ellipse(11, 22, 3, 2, L.l1); },
    (t) => { t.ellipse(8, 24, 7, 3, L.d1); t.ellipse(4, 21, 3.5, 3, L.base); t.ellipse(12, 21, 3.5, 3, L.l1); t.ellipse(8, 19, 3.5, 3, L.base); t.set(11, 25, '#ffd65a'); t.set(12, 25, '#e09a2a'); },
    (t) => { t.ellipse(3, 21, 3, 2.5, L.base); t.ellipse(13, 20, 3, 2.5, L.l1);
      t.ellipse(8, 24, 7, 5, '#d9741f'); for (const x of [5, 8, 11]) t.vline(x, 20, 9, '#b25a14'); t.ellipse(6, 22, 2, 1.5, '#f2a64a'); t.set(5, 21, '#ffd08a');
      t.rect(8, 17, 2, 3, P.bark.base); t.set(9, 17, P.bark.l1); },
  ],
  lumi_herb: [seedMound, sprout,
    (t) => { for (const [dx, dy] of [[-1, -0.7], [1, -0.7], [-0.3, -1], [0.4, -1]]) leaf(t, 8, 25, dx, dy, 4, L); },
    (t) => { for (const [dx, dy] of [[-1, -0.5], [1, -0.5], [-0.6, -1], [0.6, -1], [0, -1]]) leaf(t, 8, 26, dx, dy, 6, L); t.set(8, 20, '#bff0e0'); },
    (t) => { for (const [dx, dy] of [[-1, -0.4], [1, -0.4], [-0.7, -1], [0.7, -1], [-0.2, -1], [0.3, -1]]) leaf(t, 8, 26, dx, dy, 7, L);
      for (const [x, y] of [[3, 22], [13, 22], [5, 19], [11, 19], [8, 18]]) { t.set(x, y, '#8ff0dc'); t.set(x, y - 1, '#e8fff8'); } },
  ],
  fire_pepper: [seedMound, sprout,
    (t) => { t.vline(8, 20, 7, L.d1); leaf(t, 8, 23, -1, -0.5, 4, L); leaf(t, 8, 21, 1, -0.5, 4, L); leaf(t, 8, 20, 0, -1, 3, L); },
    (t) => { t.vline(8, 16, 11, L.d1); for (let y = 16; y < 26; y += 3) { leaf(t, 8, y, -1, -0.3, 5, L); leaf(t, 8, y + 1, 1, -0.3, 5, L); } t.set(5, 20, '#fff4f0'); t.set(11, 18, '#fff4f0'); },
    (t) => { t.vline(8, 14, 13, L.d1); for (let y = 14; y < 26; y += 3) { leaf(t, 8, y, -1, -0.3, 5, L); leaf(t, 8, y + 1, 1, -0.3, 5, L); }
      for (const [x, y] of [[4, 18], [11, 16], [5, 23], [12, 21]]) { t.vline(x, y, 4, '#e0402a'); t.vline(x + 1, y, 3, '#ff6a3a'); t.set(x, y - 1, L.base); t.set(x + 1, y, '#ffd08a'); } },
  ],
  iron_bean: [seedMound, sprout,
    (t) => { t.vline(10, 14, 13, P.wood.l1); t.vline(8, 20, 7, L.d1); leaf(t, 8, 22, -1, -0.5, 4, L); leaf(t, 8, 20, 1, -0.8, 3, L); },
    (t) => { t.vline(10, 6, 21, P.wood.l1); for (let y = 8; y < 26; y += 3) { t.set(9 + ((y / 3) % 2), y, L.d1); leaf(t, 10, y, -1, -0.3, 4, L); leaf(t, 10, y + 1, 1, -0.3, 3, L); } },
    (t) => { t.vline(10, 4, 23, P.wood.l1); for (let y = 6; y < 26; y += 3) { leaf(t, 10, y, -1, -0.3, 4, L); leaf(t, 10, y + 1, 1, -0.3, 3, L); }
      for (const [x, y] of [[5, 10], [12, 13], [6, 18], [12, 21], [5, 23]]) { t.vline(x, y, 5, '#7a8aa8'); t.vline(x + 1, y + 1, 3, '#b8c8e0'); t.set(x + 1, y + 2, '#ffffff'); } },
  ],
};

export function buildCrops() {
  const img = new Img(16 * CROP_STAGES, 32 * CROP_IDS.length);
  CROP_IDS.forEach((id, r) => {
    DRAW[id].forEach((fn, s) => { const t = new Img(16, 32); fn(t); t.outline(O, 0.55); img.blit(t, s * 16, r * 32); });
  });
  return img;
}

// ── 아이템 아이콘 16x16 ─────────────────────────────────
function fish(t, b, l, d, stripe = false, whisker = false) {
  t.ellipse(7, 8, 5.5, 3, b); t.ellipse(6, 7, 3.5, 1.5, l);
  t.line(12, 8, 15, 5, b); t.line(12, 8, 15, 11, b); t.line(13, 8, 15, 8, d);
  t.set(4, 7, '#1e1424'); t.hline(4, 10, 6, d);
  if (stripe) t.hline(3, 8, 9, '#ff8ab0');
  if (whisker) { t.line(2, 8, 0, 10, d); t.line(2, 9, 1, 11, d); }
}
/** 루미볼 (오리지널 디자인): 유리 구슬 + 잎 모양 금속 마개 + 별빛 심지 */
export function lumiBall(t, ox, oy, r, glass, cap, core) {
  const g = { base: glass, l: lighten(glass, 0.35), d: darken(glass, 0.3) }, c = { base: cap, l: lighten(cap, 0.35), d: darken(cap, 0.35) };
  const cx = ox + r, cy = oy + r + 2;
  t.circle(cx, cy, r, g.d); t.circle(cx - 0.5, cy - 0.5, r - 1, g.base); t.circle(cx - 1.5, cy - 1.5, Math.max(1, r - 3), g.l);
  t.set(cx - Math.round(r * 0.5), cy - Math.round(r * 0.55), '#ffffff');
  // 별빛 심지
  t.set(cx, cy, core); t.set(cx + 1, cy, core); t.set(cx, cy + 1, core); t.set(cx - 1, cy, lighten(core, 0.5)); t.set(cx, cy - 1, lighten(core, 0.5));
  // 잎 모양 마개
  const top = cy - r; t.rect(cx - 2, top - 1, 5, 2, c.base); t.hline(cx - 2, top - 1, 5, c.l); t.set(cx + 2, top, c.d);
  t.line(cx, top - 1, cx + 2, top - 3, c.base); t.set(cx + 3, top - 3, c.l); t.set(cx + 1, top - 3, c.l);
}
function flask(t, liquid, cork, shape = 'round') {
  const l = { base: liquid, l: lighten(liquid, 0.4), d: darken(liquid, 0.3) };
  if (shape === 'round') { t.circle(8, 10, 4.5, '#e8f4f8'); t.circle(8, 10.5, 3.5, l.base); t.rect(5, 11, 6, 2, l.d); t.set(6, 8, '#ffffff'); t.set(7, 9, l.l); }
  else { t.rect(4, 7, 8, 8, '#e8f4f8'); t.rect(5, 9, 6, 5, l.base); t.hline(5, 13, 6, l.d); t.set(5, 8, '#ffffff'); t.set(6, 10, l.l); }
  t.rect(7, 3, 3, 4, '#e8f4f8'); t.rect(7, 2, 3, 2, cork); t.set(7, 2, lighten(cork, 0.3));
}
function tri3(t) { t.set(8, 3, '#fff4b0'); t.set(7, 4, '#ffd65a'); t.set(9, 4, '#ffd65a'); }
export const ICONS = ['hoe', 'watering_can', 'axe', 'seeds_parsnip', 'seeds_cauliflower', 'seeds_tomato', 'seeds_pumpkin', 'parsnip', 'cauliflower', 'tomato', 'pumpkin', 'gold', 'energy', 'sun', 'rain', 'heart', 'coffee', 'bread', 'cake',
  'pickaxe', 'rod', 'lumi_ball', 'super_ball', 'hyper_ball', 'star_ball', 'potion', 'super_potion', 'max_potion', 'atk_tonic', 'def_tonic', 'badge_wind', 'fish_crucian', 'fish_trout', 'fish_catfish', 'fish_rainbow',
  'berry', 'wild_mushroom', 'dandelion', 'herb', 'stone', 'copper_ore', 'iron_ore', 'star_shard', 'lumi',
  'badge_water', 'badge_leaf', 'badge_earth', 'badge_flame', 'badge_light', 'badge_normal', 'badge_star',
  'seeds_lumi_herb', 'seeds_fire_pepper', 'seeds_iron_bean', 'lumi_herb', 'fire_pepper', 'iron_bean', 'craft',
  'hammer', 'wood', 'fiber', 'fence_wood', 'crate_wood', 'barrel_wood', 'scarecrow', 'lamp_post', 'planter_box', 'origin_ball', 'ocarina',
  'quick_ball', 'moon_ball', 'tide_ball', 'leaf_ball', 'ember_ball', 'repeat_ball', 'heavy_ball'];
// 도구 등급 아이콘 (구리 · 강철 · 별빛): 기본 도구 그림의 쇠 부분을 등급 색으로 바꿈
export const TOOL_TIERS = { copper: ['#8a4a20', '#c8743a', '#f0a868'], iron: ['#4a5a70', '#9aaec4', '#e4eef8'], star: ['#8a6a10', '#e8b830', '#fff2a0'] };
for (const base of ['hoe', 'watering_can', 'axe', 'pickaxe', 'rod']) for (const tier of Object.keys(TOOL_TIERS)) ICONS.push(`${base}_${tier}`);
function badge(t, d, l, sym) { for (let y = 1; y < 15; y++) { const hw = Math.round(6 - Math.abs(y - 7.5) * 0.35); for (let x = 8 - hw; x < 8 + hw; x++) t.set(x, y, (x + y) % 5 === 0 ? l : y < 8 ? l : d); } t.outline('#2a1b14', 0.6); sym(t); }
export function buildIcons() {
  const img = new Img(16 * ICONS.length, 16);
  const m = P.metal, w = P.wood;
  const draw = {
    hoe: (t) => { t.line(3, 13, 11, 5, w.l1); t.line(4, 13, 12, 5, w.base); t.rect(10, 2, 4, 3, m.base); t.rect(10, 2, 4, 1, m.l2); t.rect(13, 5, 1, 3, m.d1); },
    watering_can: (t) => { t.rect(3, 6, 8, 7, '#5e97b8'); t.rect(3, 6, 8, 1, '#9fd0e8'); t.rect(10, 6, 1, 7, '#3f6c8a'); t.line(11, 8, 14, 5, '#5e97b8'); t.set(14, 4, '#9fd0e8'); t.line(4, 5, 8, 3, '#3f6c8a'); t.line(8, 3, 10, 6, '#3f6c8a'); },
    axe: (t) => { t.line(3, 14, 10, 4, w.l1); t.line(4, 14, 11, 4, w.base); t.rect(9, 2, 5, 5, m.base); t.rect(9, 2, 5, 1, m.l2); t.vline(13, 2, 5, m.l1); t.rect(9, 6, 5, 1, m.d1); },
    gold: (t) => { t.circle(8, 8, 6, P.gold.base); t.circle(7.5, 7.5, 4.5, P.gold.l1); t.vline(8, 5, 6, P.gold.d1); t.hline(6, 6, 4, P.gold.d1); t.hline(6, 10, 4, P.gold.d1); },
    energy: (t) => { const c = '#ffd65a'; t.line(10, 1, 5, 8, c); t.line(11, 1, 6, 8, c); t.hline(5, 8, 7, c); t.line(10, 8, 6, 15, c); t.line(11, 8, 7, 15, '#e09a2a'); },
    sun: (t) => { t.circle(8, 8, 4, '#ffd65a'); t.circle(7.5, 7.5, 2.5, '#fff1a8'); for (const [x, y] of [[8, 1], [8, 14], [1, 8], [14, 8], [3, 3], [13, 3], [3, 13], [13, 13]]) t.set(x, y, '#ffb347'); },
    rain: (t) => { t.ellipse(8, 6, 6, 3.5, '#c9d6e8'); t.ellipse(6, 5, 3, 2.5, '#eef4fb'); for (const [x, y] of [[4, 11], [8, 12], [12, 11], [6, 14], [10, 15]]) { t.set(x, y, '#5aa8e0'); t.set(x, y + 1, '#3f8fc8'); } },
    coffee: (t) => { t.rect(3, 6, 8, 8, '#fff8ec'); t.rect(3, 6, 8, 1, '#ffffff'); t.rect(4, 7, 6, 2, '#6b3e22'); t.rect(10, 13, 1, 1, '#d9cbb3'); t.rect(11, 8, 2, 4, '#fff8ec'); t.set(12, 9, '#d9cbb3'); t.rect(2, 14, 11, 1, '#d9cbb3'); t.set(5, 3, '#c9c0b4'); t.set(6, 2, '#c9c0b4'); t.set(8, 4, '#c9c0b4'); t.set(8, 3, '#c9c0b4'); },
    bread: (t) => { t.ellipse(8, 9, 6.5, 4.5, '#c9853f'); t.ellipse(7.5, 8, 5.5, 3, '#e0a65a'); for (const x of [5, 8, 11]) t.line(x, 6, x - 1, 10, '#a8692c'); t.set(5, 7, '#f6d28e'); },
    cake: (t) => { t.rect(3, 8, 10, 6, '#f6e6c8'); t.rect(3, 8, 10, 2, '#ff9cbc'); t.set(4, 10, '#ff9cbc'); t.set(8, 10, '#ff9cbc'); t.set(11, 10, '#ff9cbc'); t.rect(3, 11, 10, 1, '#e8a0b0'); t.rect(7, 4, 2, 4, '#d8473b'); t.set(7, 4, '#ff8a7a'); t.vline(8, 2, 2, P.leaf.base); },
    pickaxe: (t) => { t.line(4, 14, 10, 5, w.l1); t.line(5, 14, 11, 5, w.base); t.line(4, 5, 8, 3, m.base); t.line(8, 3, 13, 4, m.base); t.line(13, 4, 14, 8, m.base); t.set(4, 6, m.d1); t.set(14, 9, m.d1); t.set(8, 2, m.l2); },
    rod: (t) => { t.line(3, 14, 13, 2, '#c8a070'); t.line(4, 14, 6, 11, '#7a2a2a'); t.set(13, 2, '#ff5a5a'); t.line(13, 3, 13, 9, '#eef6ff'); t.rect(12, 10, 3, 3, '#ff5a5a'); t.set(12, 10, '#ffffff'); },
    lumi_ball: (t) => lumiBall(t, 2, 2, 5, '#5ec8b8', '#c9733a', '#ffd65a'),
    super_ball: (t) => lumiBall(t, 2, 2, 5, '#5a8ae8', '#a8b0c8', '#fff4b0'),
    hyper_ball: (t) => lumiBall(t, 2, 2, 5, '#9a5ae0', '#ffd65a', '#ff9cbc'),
    quick_ball: (t) => { lumiBall(t, 2, 2, 5, '#f0d030', '#3a6ab0', '#ffffff'); t.line(9, 6, 6, 10, '#3a2a10'); t.line(6, 10, 9, 10, '#3a2a10'); t.line(9, 10, 6, 14, '#3a2a10'); },
    moon_ball: (t) => { lumiBall(t, 2, 2, 5, '#2a2440', '#8a80c8', '#ffe58a'); t.set(10, 7, '#ffe58a'); t.set(11, 8, '#ffe58a'); t.set(10, 9, '#ffe58a'); },
    tide_ball: (t) => { lumiBall(t, 2, 2, 5, '#2f7fc8', '#bfe6ff', '#ffffff'); t.hline(4, 11, 3, '#bfe6ff'); t.hline(8, 12, 3, '#bfe6ff'); },
    leaf_ball: (t) => { lumiBall(t, 2, 2, 5, '#4fae4a', '#8a5a2a', '#e0ffe0'); t.set(5, 11, '#c8f0a0'); t.set(9, 12, '#c8f0a0'); },
    ember_ball: (t) => { lumiBall(t, 2, 2, 5, '#e0522a', '#3a2a2a', '#ffd65a'); t.set(5, 11, '#ffb04a'); t.set(9, 12, '#ffb04a'); t.set(7, 13, '#ffd65a'); },
    repeat_ball: (t) => { lumiBall(t, 2, 2, 5, '#c84a6a', '#f0e0c0', '#ffffff'); t.hline(4, 9, 7, '#f0e0c0'); t.hline(4, 12, 7, '#f0e0c0'); },
    heavy_ball: (t) => { lumiBall(t, 2, 2, 5, '#5a6270', '#2a2e38', '#9aaec4'); t.rect(5, 11, 5, 2, '#2a2e38'); t.set(6, 11, '#9aaec4'); },
    star_ball: (t) => { lumiBall(t, 2, 2, 5, '#2a3a8a', '#e8e8f8', '#ffd65a'); t.set(5, 9, '#fff4b0'); t.set(10, 12, '#fff4b0'); t.set(9, 8, '#ffffff'); },
    potion: (t) => flask(t, '#5fc86a', P.wood.base),
    super_potion: (t) => flask(t, '#4a9ae8', P.wood.base),
    max_potion: (t) => { flask(t, '#ffc83a', P.gold.base); t.set(12, 4, '#fff4b0'); t.set(3, 6, '#fff4b0'); },
    atk_tonic: (t) => { flask(t, '#e0402a', '#5a3a2a', 'square'); t.line(9, 10, 7, 12, '#ffd08a'); },
    def_tonic: (t) => { flask(t, '#7a8aa8', '#5a3a2a', 'square'); t.rect(7, 10, 3, 3, '#d8e4ee'); },
    lumi_herb: (t) => { for (const [dx, dy] of [[-1, -1], [1, -1], [0, -1.4], [-0.5, -1.2]]) { for (let i = 0; i < 6; i++) t.set(8 + dx * i * 0.9, 13 + dy * i * 1.3, i > 3 ? '#9af0dc' : '#3fae8a'); } t.set(4, 6, '#e8fff8'); t.set(12, 6, '#e8fff8'); t.set(8, 4, '#ffffff'); },
    fire_pepper: (t) => { for (let i = 0; i < 9; i++) { const x = 6 + Math.round(Math.sin(i / 3) * 2), y = 5 + i, w = i < 6 ? 2 : 1; t.rect(x - w + 1, y, w * 2, 1, i < 2 ? '#ff6a3a' : '#e0402a'); } t.set(6, 7, '#ffd08a'); t.set(6, 8, '#ffb08a'); t.rect(5, 3, 3, 2, P.leaf.base); t.set(7, 2, P.leaf.d1); t.set(8, 1, P.leaf.d1); },
    iron_bean: (t) => { for (let i = 0; i < 10; i++) { const x = 3 + i, y = 4 + i; t.rect(x - 1, y - 1, 3, 3, '#7a8aa8'); } for (let i = 0; i < 9; i++) t.set(3 + i, 3 + i, '#b8c8e0'); for (const k of [2, 5, 8]) { t.set(3 + k, 4 + k, '#e8f0ff'); t.set(4 + k, 4 + k, '#d8e4ee'); } t.rect(1, 2, 2, 2, P.leaf.base); },
    origin_ball: (t) => { t.circle(8, 8, 6.5, '#2a1b14'); for (let y = 2; y <= 14; y++) for (let x = 2; x <= 14; x++) { const d = Math.hypot(x - 8, y - 8); if (d > 6) continue; t.set(x, y, y < 8 ? (d < 3.5 ? '#fff4b0' : '#c8a8ff') : '#fffaf0'); } t.hline(2, 8, 13, '#2a1b14'); t.circle(8, 8, 2, '#2a1b14'); t.circle(8, 8, 1.2, '#ffd65a'); t.set(5, 4, '#ffffff'); t.set(11, 5, '#ffe58a'); t.set(6, 11, '#e0c8ff'); },
    ocarina: (t) => { t.ellipse(8, 9, 6, 4.5, '#2a1b14'); t.ellipse(8, 9, 5, 3.5, '#5ac8b8'); t.ellipse(7, 8, 3, 1.6, '#9ae8d8'); t.rect(12, 4, 3, 4, '#2a1b14'); t.rect(12, 5, 2, 3, '#5ac8b8'); for (const [x, y] of [[5, 10], [8, 11], [10, 9]]) t.set(x, y, '#1e4a44'); t.set(4, 8, '#ffe58a'); },
    hammer: (t) => { t.line(4, 14, 9, 6, w.l1); t.line(5, 14, 10, 6, w.base); t.rect(7, 2, 7, 4, m.base); t.hline(7, 2, 7, m.l2); t.hline(7, 5, 7, m.d1); t.rect(13, 3, 1, 2, m.l1); },
    wood: (t) => { for (const [y, x0] of [[10, 2], [7, 4]]) { t.rect(x0, y, 10, 4, w.base); t.hline(x0, y, 10, w.l1); t.hline(x0, y + 3, 10, w.d1); t.ellipse(x0 + 10, y + 2, 1.6, 2, '#e8c890'); t.set(x0 + 10, y + 2, w.base); } },
    fiber: (t) => { for (const [dx, c] of [[-3, '#7ab84a'], [0, '#9ad06a'], [3, '#5e9a3e']]) t.line(8 + dx, 14, 8 + dx * 0.4, 3, c); t.hline(5, 9, 7, '#c8a868'); t.hline(5, 10, 7, '#a88848'); },
    fence_wood: (t) => { for (const x of [3, 11]) { t.rect(x, 4, 3, 11, w.base); t.vline(x, 4, 11, w.l1); t.set(x + 1, 3, w.base); } t.rect(2, 7, 13, 2, w.l1); t.rect(2, 11, 13, 2, w.base); t.hline(2, 8, 13, w.d1); },
    crate_wood: (t) => { t.rect(2, 4, 12, 10, w.base); t.rect(2, 4, 12, 1, w.l2); t.rect(2, 13, 12, 1, w.d1); t.line(3, 5, 12, 12, w.l1); t.line(3, 12, 12, 5, w.l1); t.rect(2, 4, 1, 10, w.d1); t.rect(13, 4, 1, 10, w.d1); },
    barrel_wood: (t) => { t.ellipse(8, 9, 5, 6, w.base); t.rect(4, 4, 9, 1, w.l1); for (const y of [5, 12]) t.hline(3, y, 11, m.d1); t.vline(6, 4, 10, w.l1); t.vline(10, 4, 10, w.d1); },
    scarecrow: (t) => { t.vline(8, 6, 9, w.d1); t.hline(3, 8, 11, w.base); t.circle(8, 4, 2.5, '#f0d8a0'); t.rect(5, 1, 7, 2, '#c8a040'); t.rect(6, 7, 5, 4, '#c8503a'); t.set(7, 4, '#3b2414'); t.set(9, 4, '#3b2414'); },
    lamp_post: (t) => { t.vline(8, 6, 9, '#4a4a58'); t.rect(6, 14, 5, 1, '#2a2a34'); t.rect(5, 2, 7, 4, '#c88a3a'); t.rect(6, 3, 5, 2, '#ffe58a'); t.hline(5, 1, 7, '#6a4a2a'); },
    planter_box: (t) => { t.rect(3, 9, 10, 5, P.stone.base); t.hline(3, 9, 10, P.stone.l1); t.hline(3, 13, 10, P.stone.d1); for (const [x, c] of [[5, '#f49ac0'], [8, '#f6e05a'], [11, '#ffffff']]) { t.vline(x, 5, 4, '#4f9a45'); t.set(x, 4, c); t.set(x - 1, 5, c); t.set(x + 1, 5, c); } },
    craft: (t) => { t.rect(2, 9, 12, 4, P.wood.l1); t.hline(2, 9, 12, P.wood.l2); t.rect(3, 13, 2, 2, P.wood.d1); t.rect(11, 13, 2, 2, P.wood.d1); t.ellipse(6, 8, 3, 1.5, '#a8a0a0'); t.line(7, 7, 9, 3, P.wood.d1); t.circle(11, 6, 2, '#5ec8b8'); t.set(10, 5, '#ffffff'); },
    badge_water: (t) => badge(t, '#2f6ac0', '#7ab8f0', (t) => { t.line(8, 4, 5, 9, '#ffffff'); t.line(8, 4, 11, 9, '#ffffff'); t.ellipse(8, 10, 3, 2, '#ffffff'); }),
    badge_leaf: (t) => badge(t, '#3f8a3e', '#86c95b', (t) => { t.ellipse(8, 8, 2, 4, '#ffffff'); t.line(8, 5, 8, 12, '#3f8a3e'); }),
    badge_earth: (t) => badge(t, '#8a5a2a', '#c99a62', (t) => { t.rect(5, 7, 6, 5, '#ffffff'); t.line(5, 7, 8, 4, '#ffffff'); t.line(11, 7, 8, 4, '#ffffff'); }),
    badge_flame: (t) => badge(t, '#c03a1a', '#ff8a4a', (t) => { t.ellipse(8, 10, 3, 3, '#ffd65a'); t.line(8, 4, 6, 9, '#ffd65a'); t.line(8, 4, 10, 9, '#ffd65a'); t.set(8, 10, '#ffffff'); }),
    badge_light: (t) => badge(t, '#c9921e', '#ffe08a', (t) => { t.circle(8, 8, 2, '#ffffff'); for (const [x, y] of [[8, 4], [8, 12], [4, 8], [12, 8]]) t.set(x, y, '#ffffff'); }),
    badge_normal: (t) => badge(t, '#7a8a9a', '#d8e4ee', (t) => { t.line(8, 4, 8, 12, '#ffffff'); t.line(4, 8, 12, 8, '#ffffff'); t.line(5, 5, 11, 11, '#ffffff'); t.line(11, 5, 5, 11, '#ffffff'); }),
    badge_star: (t) => badge(t, '#4a3a8a', '#a88ae0', (t) => { t.line(8, 4, 6, 11, '#ffd65a'); t.line(8, 4, 10, 11, '#ffd65a'); t.line(4, 7, 12, 7, '#ffd65a'); t.line(4, 7, 10, 11, '#ffd65a'); t.line(12, 7, 6, 11, '#ffd65a'); }),
    badge_wind: (t) => { t.circle(8, 8, 6, '#3ab0a8'); t.circle(8, 8, 4, '#7ad8d0'); t.line(5, 7, 11, 6, '#ffffff'); t.line(5, 9, 10, 9, '#ffffff'); t.line(6, 11, 9, 11, '#ffffff'); t.set(8, 3, '#ffd65a'); },
    berry: (t) => { for (const [x, y] of [[5, 8], [9, 7], [7, 11], [11, 10]]) { t.circle(x, y, 2.2, '#8f3cc4'); t.set(x - 1, y - 1, '#c58af0'); } t.line(7, 3, 8, 6, P.leaf.d1); t.rect(8, 3, 3, 2, P.leaf.base); },
    wild_mushroom: (t) => { t.rect(7, 8, 3, 6, '#f1e3c8'); t.ellipse(8, 7, 5.5, 3.5, '#c9763b'); t.set(6, 5, '#f2b080'); t.set(10, 6, '#fff2dc'); t.hline(4, 9, 9, '#8a4a20'); },
    dandelion: (t) => { t.vline(8, 7, 8, P.leaf.d1); t.set(7, 12, P.leaf.base); t.set(9, 11, P.leaf.base); t.circle(8, 5, 3.5, '#ffd65a'); t.circle(8, 5, 1.5, '#e0a43a'); t.set(6, 3, '#fff4b0'); },
    herb: (t) => { for (const [dx, dy] of [[-1, -1], [1, -1], [0, -1.4]]) { for (let i = 0; i < 6; i++) t.set(8 + dx * i * 0.8, 13 + dy * i * 1.4, i > 3 ? '#9ae06a' : '#4fae4a'); } t.rect(6, 12, 5, 2, '#d8c8a0'); t.hline(6, 12, 5, '#b8a070'); },
    stone: (t) => { t.ellipse(8, 9, 5.5, 4.5, P.stone.base); t.ellipse(7, 8, 3.5, 2.5, P.stone.l1); t.set(6, 7, P.stone.l2); t.hline(5, 12, 6, P.stone.d1); },
    copper_ore: (t) => { t.ellipse(8, 9, 5.5, 4.5, P.stone.d1); for (const [x, y] of [[6, 8], [9, 7], [8, 10]]) { t.rect(x, y, 2, 2, '#c9733a'); t.set(x, y, '#f0a060'); } },
    iron_ore: (t) => { t.ellipse(8, 9, 5.5, 4.5, P.stone.d1); for (const [x, y] of [[6, 8], [9, 7], [8, 10]]) { t.rect(x, y, 2, 2, '#a8b0c8'); t.set(x, y, '#e0e8f8'); } },
    star_shard: (t) => { t.line(8, 2, 5, 9, '#8a7ae8'); t.line(8, 2, 11, 9, '#8a7ae8'); t.line(5, 9, 8, 14, '#5a4ab8'); t.line(11, 9, 8, 14, '#5a4ab8'); t.rect(7, 5, 2, 6, '#c8c0ff'); t.set(7, 5, '#ffffff'); t.set(12, 3, '#fff4b0'); t.set(3, 12, '#fff4b0'); },
    lumi: (t) => { t.circle(8, 9, 5, '#ffd65a'); t.circle(7, 8, 3, '#fff4b0'); t.set(6, 8, '#1e1424'); t.set(9, 8, '#1e1424'); tri3(t); },
    fish_crucian: (t) => fish(t, '#b8a060', '#e8d090', '#7a6a3a'),
    fish_trout: (t) => fish(t, '#7a9a8a', '#c8e0d0', '#4a6a5a', true),
    fish_catfish: (t) => fish(t, '#6a5a4a', '#a89070', '#3a3028', false, true),
    fish_rainbow: (t) => fish(t, '#8a9ad8', '#ffb0d0', '#5a6aa8', true),
    heart: (t) => { const h = '#e0475b'; t.rect(3, 4, 4, 4, h); t.rect(9, 4, 4, 4, h); t.rect(4, 7, 8, 3, h); t.rect(5, 10, 6, 2, h); t.rect(7, 12, 2, 1, h); t.rect(4, 5, 2, 1, '#ff9fb0'); },
  };
  const seedCol = { parsnip: '#e6d29a', cauliflower: '#9fd06a', tomato: '#e0574b', pumpkin: '#e8892e', lumi_herb: '#5ec8b8', fire_pepper: '#e0402a', iron_bean: '#7a8aa8' };
  const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  ICONS.forEach((id, i) => {
    const t = new Img(16, 16);
    const tm = /^(hoe|watering_can|axe|pickaxe|rod)_(copper|iron|star)$/.exec(id);
    if (tm) {
      draw[tm[1]]?.(t);
      const pal = TOOL_TIERS[tm[2]].map(hexRgb);
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const k = (y * 16 + x) * 4; if (!t.d[k + 3]) continue;
        const [r, g, b] = [t.d[k], t.d[k + 1], t.d[k + 2]];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), lum = (r + g + b) / 3;
        const metal = tm[1] === 'watering_can' ? b > r + 20 : tm[1] === 'rod' ? r > 150 && g > 120 && r > b + 40 : mx - mn < 36 && lum > 70;
        if (!metal) continue;
        const c = pal[lum > 190 ? 2 : lum > 120 ? 1 : 0];
        t.d[k] = c[0]; t.d[k + 1] = c[1]; t.d[k + 2] = c[2];
      }
      if (tm[2] === 'star') { t.set(2, 2, '#fff8c0'); t.set(1, 2, '#ffd65a'); t.set(3, 2, '#ffd65a'); t.set(2, 1, '#ffd65a'); t.set(2, 3, '#ffd65a'); }
    } else if (draw[id]) draw[id](t);
    else if (id.startsWith('seeds_')) {
      const c = seedCol[id.slice(6)];
      t.rect(3, 3, 10, 12, '#efe3c4'); t.rect(3, 3, 10, 1, '#fff8e6'); t.rect(12, 3, 1, 12, '#c9b48a'); t.hline(3, 2, 10, '#c9b48a');
      t.rect(5, 6, 6, 6, c); t.rect(5, 6, 6, 1, lighten(c, 0.35)); t.set(7, 8, '#fff8e6'); t.set(9, 10, darken(c, 0.3));
    } else {
      // 수확물: 작물 시트 마지막 단계 열매 부분을 아이콘용으로 다시 그림
      const pr = {
        parsnip: (t) => { t.ellipse(8, 9, 4, 3.5, '#f3e6c4'); t.rect(6, 7, 3, 2, '#fff8e6'); t.line(8, 12, 9, 15, '#cdb78a'); leaf(t, 8, 6, -1, -1, 4, L); leaf(t, 8, 6, 1, -1, 4, L); leaf(t, 8, 6, 0, -1, 5, L); },
        cauliflower: (t) => { t.ellipse(8, 10, 6, 4, L.base); t.ellipse(8, 8, 5, 4, '#f6f0dc'); for (const [x, y] of [[6, 6], [9, 7], [7, 9], [10, 9]]) t.set(x, y, '#ffffff'); },
        tomato: (t) => { t.circle(8, 9, 5, '#d8473b'); t.circle(7, 8, 3, '#e8665a'); t.set(6, 6, '#ffb0a6'); t.rect(7, 3, 3, 2, L.base); t.set(6, 4, L.l1); t.set(10, 4, L.d1); },
        pumpkin: (t) => { t.ellipse(8, 10, 6.5, 5, '#d9741f'); for (const x of [5, 8, 11]) t.vline(x, 6, 9, '#b25a14'); t.ellipse(6, 8, 2, 1.5, '#f2a64a'); t.rect(8, 3, 2, 3, P.bark.base); },
      };
      pr[id]?.(t);
    }
    t.outline(O, 0.5);
    img.blit(t, i * 16, 0);
  });
  return img;
}

// ── DOM UI 9-slice ──────────────────────────────────────
export function buildPanel() {
  // 24x24, 테두리 8px: 나무 프레임 + 양피지 내부
  const t = new Img(24, 24);
  const fill = '#f3dfb4', fillD = '#e6cb93';
  t.rect(0, 0, 24, 24, '#5e3620');
  t.rect(1, 1, 22, 22, '#a8683a'); t.rect(1, 1, 22, 1, '#d29457'); t.rect(1, 1, 1, 22, '#c4844a');
  t.rect(1, 22, 22, 1, '#6e4024'); t.rect(22, 1, 1, 22, '#7a4a2a');
  t.rect(3, 3, 18, 18, '#6e4024');
  t.rect(4, 4, 16, 16, fill); t.rect(4, 4, 16, 1, '#c79f63'); t.rect(4, 4, 1, 16, '#d8b67c');
  for (let y = 5; y < 20; y++) for (let x = 5; x < 20; x++) if (hash2(x, y, 3) < 0.05) t.set(x, y, fillD);
  for (const [x, y] of [[2, 2], [21, 2], [2, 21], [21, 21]]) { t.set(x, y, P.gold.l1); }
  return t;
}
export function buildSlot() {
  const t = new Img(18, 18);
  t.rect(0, 0, 18, 18, '#6e4024'); t.rect(1, 1, 16, 16, '#c99a62'); t.rect(1, 1, 16, 1, '#a8743f'); t.rect(1, 1, 1, 16, '#b07c46');
  t.rect(2, 16, 15, 1, '#e3be86'); t.rect(16, 2, 1, 15, '#dcb47c');
  return t;
}
export function buildSlotActive() {
  const t = new Img(18, 18);
  t.rect(0, 0, 18, 18, '#d8473b'); t.rect(1, 1, 16, 16, '#ff7a5a'); t.rect(2, 2, 14, 14, '#f0c98e'); t.rect(2, 2, 14, 1, '#d2a467');
  return t;
}
