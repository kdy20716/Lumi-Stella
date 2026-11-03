// 작물 성장단계 스프라이트, 아이템 아이콘, DOM UI용 9-slice 패널
import { Img, mix, darken, lighten, hash2 } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const O = P.outline;
export const CROP_IDS = ['parsnip', 'cauliflower', 'tomato', 'pumpkin'];
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
};

export function buildCrops() {
  const img = new Img(16 * CROP_STAGES, 32 * CROP_IDS.length);
  CROP_IDS.forEach((id, r) => {
    DRAW[id].forEach((fn, s) => { const t = new Img(16, 32); fn(t); t.outline(O, 0.55); img.blit(t, s * 16, r * 32); });
  });
  return img;
}

// ── 아이템 아이콘 16x16 ─────────────────────────────────
export const ICONS = ['hoe', 'watering_can', 'axe', 'seeds_parsnip', 'seeds_cauliflower', 'seeds_tomato', 'seeds_pumpkin', 'parsnip', 'cauliflower', 'tomato', 'pumpkin', 'gold', 'energy', 'sun', 'rain', 'heart', 'coffee', 'bread', 'cake'];
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
    heart: (t) => { const h = '#e0475b'; t.rect(3, 4, 4, 4, h); t.rect(9, 4, 4, 4, h); t.rect(4, 7, 8, 3, h); t.rect(5, 10, 6, 2, h); t.rect(7, 12, 2, 1, h); t.rect(4, 5, 2, 1, '#ff9fb0'); },
  };
  const seedCol = { parsnip: '#e6d29a', cauliflower: '#9fd06a', tomato: '#e0574b', pumpkin: '#e8892e' };
  ICONS.forEach((id, i) => {
    const t = new Img(16, 16);
    if (draw[id]) draw[id](t);
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
