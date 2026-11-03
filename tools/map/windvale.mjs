// 바람골 마을 (50x40): 루미 쉼터(회복), 상점(별빛 병·상처약), 바람골 도장(관장 세나), 풍차, 작은 분수 연못
import { MapBuilder, G, S, Wt } from './lib.mjs';
import { ADV_BUILDINGS } from '../art/adventure.mjs';
import { BUILDINGS } from '../art/town.mjs';

const ALL = { ...BUILDINGS, ...ADV_BUILDINGS };
const cells = (key) => { const b = ALL[key]; return { w: Math.round(b.w / 16), h: Math.ceil((b.wallH + 7) / 16), door: Math.floor((b.doorX + 7) / 16) }; };

export function buildWindvale() {
  const m = new MapBuilder('windvale', 50, 40, 9090);
  const { W, H } = m;

  m.ellipse(25, 24, 3.6, 2.4, Wt, 0.02);
  m.reserve(20, 20, 30, 28);
  m.path(0, 19, 44, 19, 2, S);                 // 서쪽 입구 → 동쪽
  m.path(8, 15, 44, 15, 2, S);                 // 건물 앞 거리
  m.path(8, 15, 8, 33, 2, S);
  m.path(8, 33, 42, 33, 2, S);
  m.path(42, 15, 42, 34, 2, S);
  for (let y = 20; y <= 28; y++) for (let x = 19; x <= 31; x++) { const dx = (x + 0.5 - 25) / 6.5, dy = (y + 0.5 - 24) / 4.6; if (dx * dx + dy * dy <= 1 && m.terrain[y][x] !== Wt) { const ix = (x + 0.5 - 25) / 4.4, iy = (y + 0.5 - 24) / 3.2; if (ix * ix + iy * iy > 1) m.setT(x, y, S); } }

  const build = (key, cx, cy, interact) => { const c = cells(key); m.place(key, cx, cy, { w: c.w, h: c.h, force: true, props: { interact, doorCellX: cx + c.door } }); m.reserve(cx - 1, cy - c.h - 3, cx + c.w, cy); return cx + c.door; };
  const centerDoor = build('center', 10, 14, 'center');
  const shopDoor = build('shop_w', 18, 14, 'shop:windvale');
  const gymDoor = build('gym', 26, 14, 'gym');
  build('windmill', 36, 14, 'windmill');
  const homeA = build('house_b', 12, 32, 'home:villager');
  build('house_c', 30, 32, 'home:leader');

  for (const [x, y] of [[21, 22], [28, 26]]) m.place('bench', x, y, { w: 2, force: true, props: { interact: 'bench' } });
  for (const [x, y] of [[13, 17], [23, 17], [34, 17], [11, 21], [39, 21], [14, 35], [36, 35]]) m.place('lamp', x, y, { force: true });
  for (const [x, y] of [[centerDoor - 3, 16], [centerDoor + 2, 16], [shopDoor + 2, 16], [gymDoor - 3, 16], [gymDoor + 3, 16]]) m.place('planter', x, y, { force: true });
  m.place('sign', 2, 17, { force: true, props: { interact: 'sign', text: '바람골 마을\n바람과 풍차의 마을 · 루미 쉼터 있음' } });
  m.place('sign', 46, 18, { force: true, props: { interact: 'sign', text: '→ 2번 도로 (공사 중)\n다음 모험은 곧 열려요!' } });
  m.place('hay', 40, 12, { force: true }); m.place('barrel', 41, 12, { force: true });

  m.forest((x, y) => x < 5 && y >= 17 && y <= 22, 0.1);
  m.scatter('oak', 10); m.scatter('pine', 6); m.scatter('bush', 8, { w: 2 }); m.scatter('bush_berry', 4, { w: 2 });
  m.scatter('tuft', 40, { block: false });
  m.flowers(30, (x, y) => m.terrain[y][x] === G && !m.blocked[y][x]);
  m.sprinkle(40);

  m.spawn('player', 2, 19); m.spawn('from_route1', 2, 19); m.spawn('wp_gate', 0, 19);
  m.spawn('wp_center', centerDoor + 1, 16); m.spawn('wp_shop', shopDoor + 1, 16); m.spawn('wp_gym', gymDoor + 1, 16);
  m.spawn('wp_plaza', 25, 21); m.spawn('wp_home_v', homeA, 33); m.spawn('wp_mill', 38, 16);
  m.spawn('windmill_hub', 38, 7);
  m.warp(0, 18, 1, 4, 'route1', 'from_windvale');
  void S;
  return m;
}
