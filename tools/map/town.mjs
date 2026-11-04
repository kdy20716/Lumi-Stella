// 별빛 마을 맵 (60x44): 중앙 호수 + 돌길 광장, 루미 마트·카페·마을회관(연구소)·볼 공방·주택, 시장 가판대, 부두
import { ROW, WOOD } from '../art/tiles.mjs';
import { BUILDINGS } from '../art/town.mjs';
import { MapBuilder, G, S, Wt } from './lib.mjs';

const cells = (key) => { const b = BUILDINGS[key]; return { w: Math.round(b.w / 16), h: Math.ceil((b.wallH + 7) / 16), door: Math.floor((b.doorX + 7) / 16) }; };

export function buildTown() {
  const m = new MapBuilder('town', 60, 44, 777);
  const { W, H } = m;
  const lake = { cx: 31, cy: 23, rx: 8.5, ry: 5.2 };

  // 1. 호수 + 둘레 돌길 광장 (호수와 돌길 사이엔 잔디 둑)
  m.ellipse(lake.cx, lake.cy, lake.rx, lake.ry, Wt, 0.06);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x + 0.5 - lake.cx, dy = y + 0.5 - lake.cy;
    const outer = (dx / (lake.rx + 4.2)) ** 2 + (dy / (lake.ry + 4.2)) ** 2;
    const inner = (dx / (lake.rx + 1.6)) ** 2 + (dy / (lake.ry + 1.6)) ** 2;
    if (outer <= 1 && inner > 1) { m.setT(x, y, S); m.reserved[y][x] = true; }
    if (inner <= 1) m.reserved[y][x] = true;
  }

  // 2. 거리: 서쪽 입구(농장) → 광장, 북쪽 상점가, 남쪽 주택가, 동쪽 시장
  m.path(0, 20, 20, 20, 2, S);              // 입구 도로
  m.path(5, 13, 54, 13, 2, S);              // 북쪽 상점가
  m.path(8, 37, 50, 37, 2, S);              // 남쪽 주택가
  m.path(30, 28, 30, 37, 3, S);             // 광장 → 남쪽 거리
  m.path(30, 14, 30, 16, 3, S);             // 상점가 → 광장
  m.path(41, 21, W - 1, 21, 2, S);          // 광장 → 시장 → 동쪽 출구(1번 도로)
  m.path(5, 13, 5, 21, 2, S);               // 입구 → 상점가
  m.path(8, 22, 8, 37, 2, S);               // 서쪽 골목
  m.path(50, 13, 50, 37, 2, S);             // 동쪽 골목

  // 3. 부두 (남쪽 둑 → 호수 안으로)
  let bottom = 0; for (let y = H - 1; y > 0; y--) if (m.terrain[y][31] === Wt) { bottom = y; break; }
  for (let y = bottom - 3; y <= bottom + 1; y++) for (const x of [31, 32]) { m.setBridge(x, y, ROW.WOOD, WOOD.DOCK_H); m.reserved[y][x] = true; if (m.terrain[y][x] !== Wt) m.setT(x, y, G); }

  // 4. 건물 (북쪽 상점가, 문 앞 셀 = y 13)
  const build = (key, cx, cy, interact) => {
    const c = cells(key);
    m.place(key, cx, cy, { w: c.w, h: c.h, force: true, props: { interact, doorCellX: cx + c.door } });
    m.reserve(cx - 1, cy - c.h - 3, cx + c.w, cy);
    return cx + c.door;
  };
  const storeDoor = build('store', 7, 12, 'shop:general');
  const cafeDoor = build('cafe', 16, 12, 'shop:cafe');
  const hallDoor = build('hall', 24, 12, 'hall');
  const smithDoor = build('smithy', 35, 12, 'smithy');
  const homeA = build('house_a', 43, 12, 'home:mayor');
  // 남쪽 주택가 (문 앞 셀 = y 37)
  const homeB = build('house_b', 12, 36, 'home:luna');
  const homeC = build('house_c', 20, 36, 'home:teo');
  const homeD = build('house_a', 38, 36, 'home:sora');
  const homeE = build('house_c', 44, 36, 'home:mio');

  // 5. 소품
  m.place('anvil', smithDoor + 2, 14, { force: true, props: { interact: 'smithy' } });
  m.place('cafe_table', cafeDoor - 3, 15, { w: 2, force: true }); m.place('cafe_table', cafeDoor + 2, 15, { w: 2, force: true });
  m.place('board', 2, 17, { w: 2, force: true, props: { interact: 'board' } });
  m.place('sign', 1, 23, { force: true, props: { interact: 'sign', text: '← 별빛 농장' } });
  m.place('stall', 52, 19, { w: 3, force: true, props: { interact: 'shop:market' } });
  m.place('stall_b', 52, 24, { w: 3, force: true, props: { interact: 'shop:market' } });
  for (const [x, y] of [[24, 16], [37, 16], [22, 30], [38, 30]]) m.place('bench', x, y, { w: 2, force: true, props: { interact: 'bench' } });
  for (const [x, y] of [[19, 22], [43, 22], [27, 16], [34, 16], [27, 31], [34, 31], [12, 20], [47, 20], [10, 38], [48, 38]]) m.place('lamp', x, y, { force: true });
  for (const [x, y] of [[storeDoor - 3, 14], [storeDoor + 2, 14], [hallDoor - 3, 14], [hallDoor + 3, 14], [homeA + 2, 14], [homeB + 2, 39], [homeC - 2, 39], [homeD + 2, 39], [homeE + 2, 39]]) m.place('planter', x, y, { force: true });
  m.place('barrel', smithDoor - 3, 12, { force: true }); m.place('crate', smithDoor - 2, 12, { force: true });

  // 6. 숲 테두리 (서쪽 입구 비움) + 자연
  m.forest((x, y) => (x < 6 && y >= 17 && y <= 24) || (x > W - 6 && y >= 19 && y <= 24), 0.1);
  m.place('sign', W - 4, 19, { force: true, props: { interact: 'sign', text: '→ 1번 도로 · 산들길\n풀숲에는 야생 루미가 살아요. 파트너 없이 들어가지 마세요!' } });
  m.scatter('oak', 14); m.scatter('oak_apple', 4); m.scatter('pine', 4);
  m.scatter('bush', 10, { w: 2 }); m.scatter('bush_berry', 4, { w: 2 });
  m.scatter('rock', 4); m.scatter('tuft', 50, { block: false });
  m.flowers(34, (x, y) => m.terrain[y][x] === G && !m.blocked[y][x]);
  m.sprinkle(50);

  // 7. 스폰 / 웨이포인트 / 워프
  m.spawn('player', 3, 20); m.spawn('from_farm', 2, 20); m.spawn('wp_gate', 0, 20);
  m.spawn('wp_store', storeDoor + 1, 14); m.spawn('wp_cafe', cafeDoor + 1, 14); m.spawn('wp_hall', hallDoor, 15);
  m.spawn('wp_smithy', smithDoor + 1, 15); m.spawn('wp_market', 53, 22); m.spawn('wp_board', 4, 18);
  m.spawn('wp_lake_n', 31, 15); m.spawn('wp_lake_s', 30, 31); m.spawn('wp_lake_w', 19, 24); m.spawn('wp_lake_e', 43, 24);
  m.spawn('wp_pier', 31, bottom - 3); m.spawn('wp_bench_n', 25, 17); m.spawn('wp_bench_s', 23, 31);
  m.spawn('wp_plaza_e', 46, 21); m.spawn('wp_south', 30, 38); m.spawn('wp_entrance', 6, 21);
  m.spawn('wp_home_mayor', homeA, 13); m.spawn('wp_home_luna', homeB, 37); m.spawn('wp_home_teo', homeC, 37);
  m.spawn('wp_home_sora', homeD, 37); m.spawn('wp_home_mio', homeE, 37);
  for (const [x, y] of [[27, 21], [34, 24], [30, 25], [36, 21]]) m.spawn('duck', x, y);
  m.warp(0, 19, 1, 4, 'farm', 'from_town');
  m.warp(W - 1, 19, 1, 5, 'route1', 'from_town');
  m.spawn('from_route1', W - 3, 21); m.spawn('wp_gate_e', W - 1, 21); m.spawn('wp_lab', hallDoor + 2, 14);
  return m;
}
