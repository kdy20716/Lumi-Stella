// 1번 도로 '산들길' (72x34): 풀숲(야생 루미), 트레이너 4명, 강과 다리(낚시), 자갈 채석장(채광), 채집 지점
import { ROW, WOOD } from '../art/tiles.mjs';
import { MapBuilder, G, D, Wt } from './lib.mjs';

export function buildRoute1() {
  const m = new MapBuilder('route1', 72, 34, 4242);
  const { W, H } = m;

  // 강 (남북으로 흐름) + 남서쪽 작은 연못
  for (let y = 0; y < H; y++) { const x = 34 + Math.round(Math.sin(y * 0.35) * 1.2); for (let k = 0; k < 3; k++) m.setT(x + k, y, Wt); }
  m.ellipse(9, 29.5, 4.5, 2.6, Wt);
  m.reserve(30, 0, 40, H - 1);

  // 길
  m.path(0, 16, 16, 16);
  m.path(16, 9, 16, 17);
  m.path(16, 9, 46, 9);
  m.path(46, 9, 46, 22);
  m.path(46, 22, 60, 22);
  m.path(60, 16, 60, 23);
  m.path(60, 16, W - 1, 16);
  m.roughen(D, 0.25);

  // 다리 (강 위 9~10행)
  for (let x = 31; x <= 39; x++) for (const y of [9, 10]) if (m.terrain[y][x] === Wt) m.setBridge(x, y, ROW.WOOD, WOOD.DOCK_H);

  // 채석장 (북동쪽 흙바닥 + 광석)
  for (let y = 2; y <= 7; y++) for (let x = 49; x <= 59; x++) { m.setT(x, y, D); m.reserved[y][x] = true; }
  m.path(46, 9, 53, 9, 2);
  m.path(52, 7, 52, 9, 2);
  const ores = [['ore_stone', 50, 3], ['ore_stone', 53, 3], ['ore_copper', 56, 3], ['ore_stone', 58, 4], ['ore_copper', 51, 5], ['ore_iron', 55, 5], ['ore_stone', 57, 6], ['ore_iron', 49, 6], ['ore_star', 54, 2], ['ore_copper', 59, 6], ['ore_stone', 50, 7], ['ore_stone', 56, 7]];
  for (const [t, x, y] of ores) m.place(t, x, y, { force: true, props: { mine: t.slice(4) } });
  for (const [x, y] of [[48, 2], [60, 2], [48, 4], [60, 5]]) m.place('rock_big', x, y, { w: 2, force: true });
  m.place('sign', 51, 10, { force: true, props: { interact: 'sign', text: '자갈 채석장\n곡괭이로 바위를 깨면 광석이 나와요. 바위는 매일 다시 생겨요.' } });

  // 풀숲 패치 (야생 루미 출현)
  const grass = (x0, y0, x1, y1, holes = 0.12) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!m.inb(x, y) || m.terrain[y][x] !== G || m.reserved[y][x] || m.blocked[y][x]) continue;
      if (m.R() < holes) continue;
      m.place('tallgrass', x, y, { block: false, force: true });
      m.reserved[y][x] = true;
    }
  };
  grass(3, 19, 13, 25); grass(18, 11, 29, 15); grass(20, 2, 30, 6); grass(39, 12, 44, 20); grass(48, 24, 58, 30); grass(62, 5, 69, 12, 0.08);

  // 트레이너 (시선 방향으로 n칸 안에 들어오면 배틀)
  const trainer = (id, x, y, face) => { m.spawn(`trainer:${id}`, x, y, { face }); m.reserve(x, y, x, y); };
  trainer('minkyu', 9, 14, 'down');
  trainer('harin', 24, 7, 'down');
  trainer('yongsu', 38, 13, 'up');
  trainer('daecheol', 48, 15, 'left');

  // 표지판 / 채집 후보지
  m.place('sign', 3, 14, { force: true, props: { interact: 'sign', text: '1번 도로 · 산들길\n→ 바람골 마을\n풀숲을 지나면 야생 루미가 나타나요!' } });
  m.place('sign', 63, 14, { force: true, props: { interact: 'sign', text: '→ 바람골 마을' } });
  m.place('sign', 30, 12, { force: true, props: { interact: 'sign', text: '산들 개울 · 낚시하기 좋은 곳\n(낚싯대를 들고 물을 바라보세요)' } });

  // 숲 + 자연
  m.forest((x, y) => (x < 4 && y >= 14 && y <= 19) || (x > W - 5 && y >= 14 && y <= 19), 0.15);
  m.scatter('oak', 16); m.scatter('pine', 14); m.scatter('oak_apple', 4);
  m.scatter('bush', 8, { w: 2 }); m.scatter('bush_berry', 8, { w: 2 }); m.scatter('rock', 6); m.scatter('stump', 4);
  m.scatter('tuft', 60, { block: false });
  m.flowers(24);
  m.sprinkle(70);
  const fx = [], R = m.R;
  for (let k = 0, tries = 0; k < 16 && tries < 2000; tries++) {
    const x = 2 + Math.floor(R() * (W - 4)), y = 2 + Math.floor(R() * (H - 4));
    if (m.terrain[y][x] !== G || m.blocked[y][x] || m.reserved[y][x]) continue;
    m.spawn('forage', x, y); m.reserved[y][x] = true; fx.push([x, y]); k++;
  }

  // 스폰 / 워프
  m.spawn('player', 2, 16); m.spawn('from_town', 2, 16); m.spawn('from_route1b', W - 3, 16);
  m.spawn('wp_gate', 0, 16); m.spawn('wp_gate_e', W - 1, 16);
  m.warp(0, 15, 1, 4, 'town', 'from_route1');
  m.warp(W - 1, 15, 1, 4, 'route1b', 'from_route1');
  m.props.push({ name: 'battleBg', type: 'string', value: 'grass' });
  return m;
}
