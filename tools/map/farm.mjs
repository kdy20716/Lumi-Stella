// 농장 맵 (56x42): 농가, 왼쪽 아래 낚시 연못과 부두, 닭 놀이터, 동쪽 길 → 마을. 나머지는 직접 일구는 빈 땅
import { ROW, WOOD } from '../art/tiles.mjs';
import { MapBuilder, G, D, Wt } from './lib.mjs';

export function buildFarm() {
  const m = new MapBuilder('farm', 56, 42, 20261103);
  const { W, H } = m;

  // 1. 연못 + 개울
  m.ellipse(11.5, 30.5, 6.2, 4.6, Wt);
  for (let y = 34; y < H; y++) { const x = 9 + Math.round(Math.sin(y * 0.7) * 0.6); m.setT(x, y, Wt); m.setT(x + 1, y, Wt); }
  m.reserve(3, 22, 20, H - 1);

  // 2. 길 (동쪽 끝이 마을로 이어짐)
  m.path(23, 12, 23, 20);
  m.path(19, 12, 28, 12);
  m.path(8, 20, W - 1, 20);
  m.path(12, 20, 12, 24);
  m.path(37, 21, 37, 23);
  m.roughen(D);

  // 3. 부두
  let dockTop = 0; for (let y = 22; y < H; y++) if (m.terrain[y][12] === Wt) { dockTop = y; break; }
  for (let y = dockTop; y < dockTop + 4; y++) for (const x of [12, 13]) m.setBridge(x, y, ROW.WOOD, y === dockTop + 3 ? WOOD.DOCK_POST : WOOD.DOCK_H);

  // 4. 농가 + 마당
  m.place('house', 20, 11, { w: 7, h: 4, force: true, props: { interact: 'door', doorCellX: 23 } });
  m.reserve(18, 4, 29, 13);
  m.place('well', 15, 11, { w: 2, h: 2, force: true }); m.reserve(14, 9, 17, 12);
  m.place('shipping_bin', 28, 11, { w: 2, force: true, props: { interact: 'ship' } }); m.reserve(27, 10, 30, 12);
  m.place('mailbox', 21, 13, { force: true, props: { interact: 'mail' } });
  m.place('lamp', 26, 13, { force: true }); m.place('lamp', 25, 18, { force: true }); m.place('lamp', 40, 19, { force: true });
  m.place('barrel', 18, 11, { force: true }); m.place('crate', 18, 10, { force: true });
  m.place('hay', 30, 10, { force: true });
  m.place('sign', 51, 18, { force: true, props: { interact: 'sign', text: '→ 별빛 마을\n(길을 따라 오른쪽으로 쭉 가세요)' } });
  m.place('sign', 14, 19, { force: true, props: { interact: 'sign', text: '은빛 연못 · 낚시 금지 구역 아님!' } });
  m.setBridge(23, 12, ROW.WOOD, WOOD.STEP0);

  // 5. 밭이 될 빈 땅: 농장 전체가 농지 (흙길 · 물 · 집 마당 제외는 시뮬레이션이 판정)
  //    잡초 · 돌 · 그루터기 · 안쪽 나무를 직접 치우고 괭이로 갈아 밭을 만든다
  m.plot('farm_zone', 2, 3, W - 4, H - 5, '*', 0);

  // 6. 닭 놀이터
  m.reserve(31, 13, 37, 17);
  m.place('hay', 33, 14, { force: true }); m.place('hay', 34, 14, { force: true });

  // 7. 숲 (동쪽 출구 비움) + 흩뿌리기
  m.forest((x, y) => x > W - 6 && y >= 18 && y <= 22);
  // 안쪽에 선 나무는 도끼로 벨 수 있음 (chop) — 숲 테두리 나무 · 쓰러진 통나무는 그대로
  const cut = { props: { chop: 1 } };
  m.scatter('oak', 16, cut); m.scatter('oak_apple', 5, cut); m.scatter('pine', 9, cut);
  m.scatter('bush', 6, { w: 2 }); m.scatter('bush_berry', 4, { w: 2 });
  m.scatter('rock', 26); m.scatter('rock_big', 5, { w: 2 }); m.scatter('stump', 12); m.scatter('log', 3, { w: 2 });
  m.scatter('tuft', 170, { block: false });
  m.flowers(26, (x, y) => x < 18 && y > 21);
  m.sprinkle(90);

  // 8. 스폰 / 웨이포인트 / 워프
  m.spawn('player', 23, 14); m.spawn('from_town', 53, 20);
  m.spawn('wp_gate', W - 1, 20); m.spawn('wp_house', 23, 14); m.spawn('wp_cross', 24, 21); m.spawn('wp_well', 16, 13);
  m.spawn('wp_dock', 12, dockTop + 2); m.spawn('wp_pond_e', 19, 27); m.spawn('wp_field_gate', 37, 22);
  m.spawn('wp_field_in', 39, 27); m.spawn('wp_bin', 29, 13);
  m.spawn('wp_east', 47, 21); m.spawn('wp_coop', 34, 16); m.spawn('wp_lamp', 41, 21); m.spawn('wp_meadow', 47, 12); m.spawn('wp_west', 9, 17);
  for (const [x, y, c] of [[33, 16, 'white'], [35, 15, 'brown'], [32, 17, 'white'], [36, 17, 'brown']]) m.spawn('chicken', x, y, { color: c });
  m.warp(W - 1, 19, 1, 4, 'town', 'from_farm');
  void G;
  return m;
}
