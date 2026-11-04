// 휴대폰 지도 (지역 전체 240×160). 아직 열리지 않은 곳은 구름으로 덮음 — 왼쪽 아래 '별빛 마을' 일대만 공개
import { Img, mix, darken, lighten, hash2 } from './lib/img.mjs';
// 부드러운 값 노이즈 (bilinear + smoothstep)
const sm = (t) => t * t * (3 - 2 * t);
function vn(x, y, per, seed) {
  const gx = Math.floor(x / per), gy = Math.floor(y / per), fx = sm(x / per - gx), fy = sm(y / per - gy);
  const h = (i, j) => hash2(gx + i, gy + j, seed);
  return (h(0, 0) * (1 - fx) + h(1, 0) * fx) * (1 - fy) + (h(0, 1) * (1 - fx) + h(1, 1) * fx) * fy;
}
export const sfbm = (x, y, per, seed, oct = 4) => fbm(x, y, per, seed, oct);
const fbm = (x, y, per, seed, oct = 4) => { let s = 0, a = 0.55, t = 0; for (let o = 0; o < oct; o++) { s += vn(x, y, per / 2 ** o, seed + o * 17) * a; t += a; a *= 0.5; } return s / t; };
import { P } from './lib/palette.mjs';

export const MAP_W = 240, MAP_H = 160;
/** 지도 위 장소 좌표 (클라이언트 마커와 공유) */
export const PLACES = {
  farm: [26, 128], town: [50, 122], route1: [74, 120], windvale: [98, 116],
  locked: [[150, 112], [196, 70], [120, 52], [52, 40], [200, 128]],
};
/** 공개 구역 (왼쪽 아래): 이 안만 구름 없음 */
const OPEN = { x0: 6, y0: 92, x1: 116, y1: 154 };

export function buildWorldMap() {
  const t = new Img(MAP_W, MAP_H);
  const sea = P.water, g = P.grass;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    // 섬 모양: 중앙이 높고 가장자리는 바다
    const nx = (x - MAP_W / 2) / (MAP_W / 2), ny = (y - MAP_H / 2) / (MAP_H / 2);
    const hgt = (fbm(x, y, 48, 3) - 0.5) * 1.1 + 0.62 - (nx * nx * 0.75 + ny * ny * 0.8);
    let c;
    if (hgt < 0.18) c = hgt < 0.1 ? sea.deep : sea.d1;
    else if (hgt < 0.22) c = P.sand.base;
    else if (hgt < 0.55) c = (hash2(x, y, 3) < 0.08 ? g.d1 : hgt < 0.4 ? g.base : g.l1);
    else if (hgt < 0.66) c = P.leaf.d1;                 // 숲
    else c = hgt < 0.78 ? P.stone.base : P.stone.l2;    // 산
    if (hgt >= 0.55 && hgt < 0.66 && (x + y * 3) % 5 === 0) c = P.leaf.d2;
    if (hgt >= 0.66 && (x - y) % 7 === 0) c = P.stone.d1;
    t.set(x, y, c);
  }
  // 강
  for (let i = 0; i < 260; i++) { const x = 180 - i * 0.55 + Math.sin(i / 14) * 6, y = 20 + i * 0.5; for (let k = 0; k < 2; k++) t.set(Math.round(x) + k, Math.round(y), sea.base); }
  // 우리 마을 일대: 길 + 호수 + 밭
  const road = P.dirt.l1;
  for (let x = PLACES.farm[0]; x <= PLACES.windvale[0]; x++) { const y = Math.round(126 - (x - 26) * 0.14 + Math.sin(x / 9) * 1.5); t.set(x, y, road); t.set(x, y + 1, P.dirt.base); }
  t.ellipse(PLACES.town[0], PLACES.town[1] + 1, 5, 3, sea.base); t.ellipse(PLACES.town[0] - 1, PLACES.town[1], 2, 1, sea.l2);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) t.set(PLACES.farm[0] - 8 + i * 2, PLACES.farm[1] - 4 + j * 2, j % 2 ? P.soil.base : P.leaf.l1);
  // 마을 아이콘 (지붕)
  const house = (x, y, roof) => { t.rect(x - 2, y - 1, 5, 3, '#f4e8d0'); for (let i = 0; i < 4; i++) t.rect(x - 3 + i, y - 2 - i, 7 - i * 2, 1, roof); };
  house(PLACES.town[0] - 6, PLACES.town[1] - 4, P.roof.base); house(PLACES.town[0] + 6, PLACES.town[1] - 5, '#3f8fb5'); house(PLACES.town[0], PLACES.town[1] - 7, P.roof.l1);
  house(PLACES.farm[0] + 4, PLACES.farm[1] - 8, P.roof.base);
  house(PLACES.windvale[0] - 4, PLACES.windvale[1] - 4, '#2a8a8a'); house(PLACES.windvale[0] + 4, PLACES.windvale[1] - 3, '#e8892e');
  for (let a = 0; a < 4; a++) t.line(PLACES.windvale[0], PLACES.windvale[1] - 10, PLACES.windvale[0] + Math.round(Math.cos(a * 1.57 + 0.4) * 4), PLACES.windvale[1] - 10 + Math.round(Math.sin(a * 1.57 + 0.4) * 4), '#fff8ec');
  // 1번 도로 풀숲
  for (let i = 0; i < 14; i++) t.set(66 + (i * 5) % 18, 114 + (i * 3) % 9, P.grass.d2);
  // 잠긴 다른 마을 자리 (구름 아래 실루엣)
  for (const [x, y] of PLACES.locked) { house(x, y, '#6a6a7a'); house(x + 6, y + 1, '#6a6a7a'); }
  // 구름 (공개 구역 밖)
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const inOpen = x >= OPEN.x0 && x <= OPEN.x1 && y >= OPEN.y0 && y <= OPEN.y1;
    const dEdge = inOpen ? 0 : Math.max(OPEN.x0 - x, x - OPEN.x1, OPEN.y0 - y, y - OPEN.y1);
    if (inOpen) continue;
    const n = fbm(x, y, 22, 9, 3);
    const a = Math.min(0.93, 0.5 + Math.min(dEdge, 12) / 24 + (n - 0.5) * 0.6);
    const cloud = n > 0.6 ? '#ffffff' : n > 0.5 ? '#f1f4fa' : n > 0.44 ? '#dfe5ef' : '#c9d1e0';
    t.set(x, y, mix(t.get(x, y), cloud, a));
  }
  // 테두리
  for (let x = 0; x < MAP_W; x++) { t.set(x, 0, darken('#8c5a33', 0)); t.set(x, MAP_H - 1, '#6b4024'); }
  for (let y = 0; y < MAP_H; y++) { t.set(0, y, '#8c5a33'); t.set(MAP_W - 1, y, '#6b4024'); }
  void lighten;
  return t;
}
