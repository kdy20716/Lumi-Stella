// 마을마다 다른 루미 센터 간호사 (도트 외형). 이름 · 성격 · 일러스트 설명은 shared/data/illust.json 의 nurse_<마을>
//   일러스트(assets/illust/nurse_<마을>.png)가 아직 없으면 대화창에는 이 외형으로 그린 벡터 그림이 대신 나와요
import { SKINS, tone } from './lib/palette.mjs';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const mul = (h, f) => { const n = parseInt(h.slice(1), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => (f < 1 ? v * f : v + (255 - v) * (f - 1))); return hex(c.reduce((a, v) => (a << 8) | Math.max(0, Math.min(255, Math.round(v))), 0)); };
const T = (b) => tone(mul(b, 0.7), b, mul(b, 1.35));
const DARK = tone('#22202a', '#3a3644', '#5a5668'), BROWN = tone('#3a2214', '#5c3820', '#80522f'), WHITE = tone('#c8c8cc', '#f0f0f0', '#ffffff');

// [피부, 머리색, 머리 모양, 옷(유니폼)색, 아래색, 옷 종류, 포인트색, 소매, 신발, 모자]
const N = {
  town:     ['light', '#7a4a2a', 'bun',      '#f2b8c6', '#fff1dc', 'apron',    '#e0475b', 'short', BROWN],
  windvale: ['light', '#e8d08a', 'ponytail', '#a8dcc0', '#f4f4ee', 'apron',    '#3f8a5f', 'short', BROWN],
  harbor:   ['pale',  '#3ab0c0', 'long',     '#f4f4f0', '#22305a', 'dress',    '#d8473b', 'long',  DARK],
  maple:    ['light', '#a84a2a', 'ponytail', '#e8d8b8', '#7a2a3a', 'vest',     '#8a2f3f', 'long',  BROWN],
  bloom:    ['pale',  '#f2a8c0', 'bob',      '#c8b0e8', '#f4f0f8', 'apron',    '#ffd65a', 'short', BROWN],
  forge:    ['tan',   '#a8502a', 'bob',      '#8a7a4a', '#5a4a2a', 'overalls', '#e8892e', 'short', DARK],
  mist:     ['pale',  '#a8a8b0', 'long',     '#3a8a8a', '#3a3a4a', 'dress',    '#7a5aa8', 'long',  DARK],
  ember:    ['tan',   '#e8604a', 'bob',      '#f4f0ea', '#4a3a3a', 'shirt',    '#d8473b', 'short', DARK],
  pinecone: ['light', '#2f4a2f', 'long',     '#6a7a3a', '#efe6d2', 'vest',     '#3f6a3a', 'long',  BROWN],
  lumina:   ['pale',  '#ead08a', 'long',     '#f4f8fa', '#2a3a4a', 'dress',    '#3ac0d0', 'long',  WHITE],
  summit:   ['pale',  '#8ac8f0', 'ponytail', '#c8e4f8', '#f4f8fc', 'dress',    '#5a94c8', 'long',  WHITE],
  shell:    ['brown', '#e8c88a', 'long',     '#f08a8a', '#f4e8d0', 'shirt',    '#ffd65a', 'short', BROWN],
  sand:     ['tan',   '#1f1a22', 'long',     '#f4ecdc', '#c9a24a', 'dress',    '#f0c84a', 'long',  BROWN],
  canyon:   ['tan',   '#1f1a1a', 'bob',      '#b8603a', '#4a3a2a', 'vest',     '#3a3a3a', 'short', DARK],
  moon:     ['pale',  '#2a2f6a', 'long',     '#2a3a6a', '#f2f0ea', 'dress',    '#d8d8e8', 'long',  DARK],
  frost:    ['pale',  '#ecece8', 'ponytail', '#f4f4f8', '#4a6a8a', 'vest',     '#8ab0e0', 'long',  DARK],
  cape:     ['light', '#e8b85a', 'bun',      '#22305a', '#22305a', 'dress',    '#c99a2a', 'long',  DARK],
  crown:    ['light', '#2a1d22', 'bun',      '#6a3a8a', '#efe6d0', 'dress',    '#e8c04a', 'long',  DARK],
};

export const NURSE_TOWNS = Object.keys(N);
export const STAFF_LOOKS = Object.fromEntries(Object.entries(N).map(([town, [skin, hair, hs, shirt, pants, outfit, accent, sleeves, shoes]]) => [
  `nurse_${town}`,
  { skin: SKINS[skin], hair: T(hair), hairStyle: hs, shirt: T(shirt), pants: T(pants), shoes, outfit, sleeves, accent: T(accent) },
]));

// 성간단 (본편 악당). 일러스트(assets/illust/villain_* · grunt_*)의 색에 맞춘 도트 외형
//   [피부, 머리색, 머리 모양, 윗옷, 아래옷, 옷 종류, 포인트색, 소매, 신발, 모자]
const V = {
  villain_boss:  ['light', '#1a1a22', 'short',    '#1f2a44', '#1a1a22', 'vest',     '#c0303a', 'long',  DARK],
  villain_c1:    ['tan',   '#d8302a', 'ponytail', '#3a3a30', '#2a2a24', 'vest',     '#e8702a', 'short', DARK],
  villain_c2:    ['pale',  '#c8c0e0', 'short',    '#5a2a8a', '#2a2a36', 'vest',     '#5ae0e0', 'long',  DARK],
  villain_c3:    ['tan',   '#3a2a1a', 'bald',     '#3a3a40', '#2a2a30', 'overalls', '#7a7a80', 'long',  DARK],
  villain_c4:    ['pale',  '#6ac0c0', 'long',     '#3a2a7a', '#4a3a8a', 'dress',    '#c8b0ff', 'long',  DARK],
  villain_sci1:  ['light', '#5a5a5a', 'spiky',    '#8a8a90', '#2a2a2a', 'vest',     '#e8502a', 'long',  DARK],
  grunt_m:       ['light', '#1a1a2a', 'spiky',    '#222228', '#222228', 'shirt',    '#d84a3a', 'short', DARK],
  grunt_f:       ['light', '#1a1a1a', 'bun',      '#222228', '#222228', 'shirt',    '#c8c8d0', 'short', DARK],
  grunt_elite_m: ['light', '#3a2a1a', 'bald',     '#2a2228', '#2a2228', 'vest',     '#b02a2a', 'long',  DARK],
  grunt_elite_f: ['light', '#14141a', 'ponytail', '#2a2228', '#2a2228', 'vest',     '#b02a2a', 'long',  DARK],
};
export const VILLAIN_LOOKS = Object.fromEntries(Object.entries(V).map(([id, [skin, hair, hs, shirt, pants, outfit, accent, sleeves, shoes]]) => [
  id, { skin: SKINS[skin], hair: T(hair), hairStyle: hs, shirt: T(shirt), pants: T(pants), shoes, outfit, sleeves, accent: T(accent), beard: id === 'villain_c3' ? false : undefined, glasses: id === 'villain_c2' || id === 'villain_sci1' },
]));
