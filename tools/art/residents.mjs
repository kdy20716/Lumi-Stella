// 마을 주민 외형: 마을마다 그 마을에만 사는 주민 2명 (res_<마을>_1, res_<마을>_2)
//   다른 마을 주민이나 별빛 마을 인물(하나 · 준이 · 박 할아버지 …)을 빌려 쓰지 않게, 동네 종류와 지형에 맞춰 옷을 정함
//   도시 = 정장 · 셔츠 / 공업 도시 = 작업복 · 모자 / 항구 = 선원풍 / 눈 마을 = 털모자 · 긴 옷 …
import { SKINS, tone } from './lib/palette.mjs';
import { TOWNS } from '../map/region-spec.mjs';
import { districtKey } from '../map/style-kit.mjs';

const hex = (n) => `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
const scale = (h, f) => { const n = parseInt(h.slice(1), 16); return hex(((n >> 16) * f << 16) | (((n >> 8) & 255) * f << 8) | ((n & 255) * f)); };
const shade = (h, f) => { const n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; return f < 1 ? scale(h, f) : `#${[r, g, b].map((v) => Math.min(255, Math.round(v + (255 - v) * (f - 1)))).map((v) => v.toString(16).padStart(2, '0')).join('')}`; };
const T = (b) => tone(shade(b, 0.7), b, shade(b, 1.35));
const hashStr = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed) => () => { seed = (Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return seed / 4294967296; };
const pick = (R, a) => a[Math.floor(R() * a.length)];

const HAIR = ['#2a1d18', '#3d2b22', '#5a2e1a', '#86452a', '#1f1a2e', '#a8602f', '#b8b8be', '#d8a85a', '#4a4070'];
const SHOES = { brown: tone('#3a2214', '#5c3820', '#80522f'), dark: tone('#22202a', '#3a3644', '#5a5668') };

/** 동네 · 지형별 옷 규칙: shirt/pants 색 후보, 옷 종류, 모자, 소매 */
const THEME = {
  city: { shirt: ['#3a4a6a', '#5a6270', '#2e3440', '#e8e4dc', '#6a3a4a', '#4a6a8a'], pants: ['#22262e', '#2e3440', '#3a3f4a'], outfit: [['vest', 'shirt'], ['dress', 'shirt']], hat: [null], sleeves: 'long', glasses: 0.5, shoes: 'dark' },
  worker: { shirt: ['#c06a1f', '#5a6a7a', '#8a3a2a', '#6a6a5a'], pants: ['#2a3a5a', '#3d3d4e', '#4a3a2a'], outfit: [['overalls', 'apron'], ['apron', 'overalls']], hat: ['cap', 'beanie', null], sleeves: 'short', glasses: 0.1, shoes: 'dark' },
  sea: { shirt: ['#f2f0ea', '#2a4a7a', '#2f8f8a', '#d8473b'], pants: ['#1f2a4a', '#2a3a64', '#e8e0cc'], outfit: [['vest', 'shirt'], ['dress', 'shirt']], hat: ['cap', 'straw', null], sleeves: 'short', glasses: 0.1, shoes: 'brown' },
  snow: { shirt: ['#8a2f3f', '#2f5a7a', '#6a4a2a', '#4a6a5a'], pants: ['#2a2a36', '#3a2a22'], outfit: [['vest', 'shirt'], ['dress', 'vest']], hat: ['beanie'], sleeves: 'long', glasses: 0.2, shoes: 'dark' },
  desert: { shirt: ['#e8d0a0', '#c9a24a', '#d8775a', '#f2e6cf'], pants: ['#8a6a4a', '#6a5440'], outfit: [['vest', 'shirt'], ['dress', 'shirt']], hat: ['straw', null], sleeves: 'short', glasses: 0.1, shoes: 'brown' },
  forest: { shirt: ['#3f7a3f', '#6a4a2a', '#8a6a3a', '#2f5a3a'], pants: ['#4a3a2a', '#3d3d2e'], outfit: [['vest', 'overalls'], ['dress', 'apron']], hat: ['beanie', null], sleeves: 'long', glasses: 0.15, shoes: 'brown' },
  volcano: { shirt: ['#8a2a1a', '#3a3036', '#c06a1f', '#5a3a3a'], pants: ['#2a1e24', '#3e2e36'], outfit: [['vest', 'apron'], ['dress', 'shirt']], hat: [null, 'cap'], sleeves: 'short', glasses: 0.15, shoes: 'dark' },
  swamp: { shirt: ['#5a6a3a', '#4a5a4a', '#6a6a4a'], pants: ['#3a3a2a', '#2a3a2a'], outfit: [['vest', 'overalls'], ['dress', 'shirt']], hat: ['straw', null], sleeves: 'long', glasses: 0.3, shoes: 'brown' },
  rocky: { shirt: ['#7a6a5a', '#5a4a3a', '#8a5a3a', '#4a5a6a'], pants: ['#3a3a3a', '#4a3a2a'], outfit: [['vest', 'shirt'], ['dress', 'vest']], hat: ['cap', null], sleeves: 'long', glasses: 0.2, shoes: 'dark' },
  meadow: { shirt: ['#f0d27a', '#7ab0d8', '#e09ab4', '#8ac07a', '#d8775a'], pants: ['#3a64a0', '#4a3a5e', '#5a4234'], outfit: [['shirt', 'vest'], ['dress', 'shirt']], hat: ['straw', null], sleeves: 'short', glasses: 0.15, shoes: 'brown' },
  beach: { shirt: ['#f2f0ea', '#5ab8b0', '#ffb05a', '#7ab0d8'], pants: ['#3a64a0', '#e8e0cc'], outfit: [['shirt', 'vest'], ['dress', 'shirt']], hat: ['straw', 'cap'], sleeves: 'short', glasses: 0.1, shoes: 'brown' },
};
const themeOf = (t) => {
  const d = districtKey(t.id);
  if (d === 'metro') return THEME.city;
  if (d === 'industrial') return THEME.worker;
  if (d === 'port') return THEME.sea;
  return THEME[t.biome] ?? THEME.meadow;
};

export const RESIDENT_LOOKS = {};
for (const t of TOWNS) {
  if (districtKey(t.id) === 'home') continue;   // 별빛 마을은 손으로 만든 주민
  const th = themeOf(t), R = rng(hashStr(t.id));
  for (const k of [1, 2]) {
    const fem = k === 2;
    const [o1, o2] = th.outfit[fem ? 1 : 0];
    RESIDENT_LOOKS[`res_${t.id}_${k}`] = {
      skin: pick(R, [SKINS.light, SKINS.tan, SKINS.brown, SKINS.pale]),
      hair: T(pick(R, HAIR)),
      hairStyle: fem ? pick(R, ['long', 'bob', 'bun', 'ponytail']) : pick(R, ['short', 'short', 'spiky', 'bald']),
      beard: !fem && R() < 0.25,
      glasses: R() < th.glasses,
      shirt: T(pick(R, th.shirt)),
      pants: T(pick(R, th.pants)),
      shoes: SHOES[th.shoes],
      outfit: R() < 0.6 ? o1 : o2,
      sleeves: th.sleeves,
      hat: pick(R, th.hat) ?? undefined,
      accent: T(pick(R, ['#c44a3a', '#3a64b0', '#f0c84a', '#3f8a5f', '#8a4a6a', '#e8892e'])),
    };
  }
}
