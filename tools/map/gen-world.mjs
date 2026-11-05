// 루미나 지방 생성기: 마을 · 도로 · 랜드마크 지역 · 동굴 층 + 데이터(야생 루미 · 트레이너 · 주민)
import { MapBuilder, G, D, Wt, S } from './lib.mjs';
import { ROW, WOOD } from '../art/tiles.mjs';
import { BUILDINGS } from '../art/town.mjs';
import { ADV_BUILDINGS } from '../art/adventure.mjs';
import { rng } from '../art/lib/img.mjs';
import { buildGraph, GYMS } from './region-graph.mjs';
import { caveLayout, caveExits } from './cavegen.mjs';

const ALL_B = { ...BUILDINGS, ...ADV_BUILDINGS };
const cells = (key) => { const b = ALL_B[key]; return { w: Math.round(b.w / 16), h: Math.ceil((b.wallH + 7) / 16), door: Math.floor((b.doorX + 7) / 16) }; };
const hashStr = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

// ── 바이옴별 소품 ───────────────────────────────────────
const TREES = {
  meadow: ['oak', 'pine', 'oak_apple'], forest: ['pine', 'oak', 'pine', 'oak_autumn'], beach: ['palm', 'palm', 'oak'], rocky: ['pine', 'pine', 'dead_tree'],
  snow: ['pine_snow'], desert: ['cactus', 'palm', 'dead_tree'], swamp: ['dead_tree', 'oak', 'pine'], volcano: ['dead_tree', 'dead_tree', 'pine'], city: ['oak', 'oak_apple'],
  distortion: ['dead_tree'],
};
const SCATTER = {
  meadow: [['bush', 6, 2], ['bush_berry', 4, 2], ['rock', 3, 1]], forest: [['bush', 6, 2], ['stump', 4, 1], ['bush_berry', 4, 2]], beach: [['rock', 6, 1], ['bush', 2, 2]],
  rocky: [['rock', 8, 1], ['rock_big', 5, 2]], snow: [['rock', 5, 1], ['rock_big', 2, 2]], desert: [['rock', 6, 1], ['rock_big', 3, 2]],
  swamp: [['reeds', 10, 1], ['stump', 4, 1]], volcano: [['rock_big', 6, 2], ['rock', 6, 1]], city: [['bush', 4, 2], ['planter', 4, 1]], distortion: [['rock_big', 4, 2]],
};
const BATTLE_BG = { meadow: 'grass', forest: 'grass', swamp: 'grass', beach: 'water', rocky: 'grass', snow: 'snow', desert: 'sand', volcano: 'sand', city: 'town', distortion: 'cave' };

// ── 야생 루미 ───────────────────────────────────────────
const POOLS = {
  meadow: ['kongkong', 'poreureu', 'posil'], forest: ['posil', 'ikkigom', 'poreureu'], beach: ['pongpong', 'mallang', 'poreureu', 'kongkong'],
  rocky: ['jagal', 'ikkigom', 'busit', 'kongkong'], snow: ['kongkong', 'ikkigom', 'mallang'], desert: ['jagal', 'busit', 'poreureu'],
  swamp: ['pongpong', 'mallang', 'posil'], volcano: ['busit', 'jagal'], city: ['kongkong', 'poreureu'], distortion: ['astra', 'banjjak'],
  // 동굴 테마
  rock: ['jagal', 'ikkigom', 'banjjak'], crystal: ['banjjak', 'jagal'], lava: ['busit', 'jagal'], ice: ['mallang', 'kongkong', 'ikkigom'],
  dark: ['banjjak', 'ikkigom'], mine: ['jagal', 'ikkigom', 'busit'], sea: ['pongpong', 'mallang'],
};
const RARE = { forest: 'saerok', swamp: 'saerok', beach: 'chalang', sea: 'chalang', volcano: 'morak', lava: 'morak' };
function encounterTable(pool, tier, rareKey) {
  const base = 2 + tier * 5;
  const day = pool.map((sp, i) => [sp, Math.max(2, base - 2), base + 2, 30 - i * 6]);
  const night = [['banjjak', Math.max(2, base - 1), base + 2, 26], ...pool.slice(0, 3).map((sp, i) => [sp, Math.max(2, base - 2), base + 2, 22 - i * 5])];
  if (RARE[rareKey] && tier >= 5) { day.push([RARE[rareKey], base, base + 2, 3]); night.push([RARE[rareKey], base, base + 2, 3]); }
  if (tier >= 7) night.push(['astra', base + 2, base + 4, 2]);
  return { day, night };
}
const FISH_ITEMS = (tier) => [['fish_crucian', 30], ['fish_trout', 25], ['fish_catfish', 15 + tier], ['fish_rainbow', 5 + tier * 2]];

// ── 트레이너 / 주민 ─────────────────────────────────────
const CLASSES = {
  meadow: [['소녀', 'lass'], ['소년', 'juni'], ['곤충소년', 'bugkid']], forest: [['곤충소년', 'bugkid'], ['나무꾼', 'woodcutter'], ['소녀', 'lass']],
  beach: [['수영선수', 'swimmer'], ['낚시꾼', 'fisher'], ['소녀', 'lass']], rocky: [['등산가', 'hiker'], ['광부', 'miner'], ['소년', 'juni']],
  snow: [['스키어', 'skier'], ['등산가', 'hiker']], desert: [['탐험가', 'explorer'], ['등산가', 'hiker']], swamp: [['낚시꾼', 'fisher'], ['연구원', 'researcher']],
  volcano: [['불꽃쟁이', 'explorer'], ['광부', 'miner']], city: [['신사', 'gentleman'], ['숙녀', 'lady']], cave: [['등산가', 'hiker'], ['광부', 'miner'], ['탐험가', 'explorer']],
};
/** 도장 속성 말투: 별마루 도장은 새 속성 없이 여러 속성 혼합 팀 */
const typeTalk = (t) => (t === '혼합' ? '여러 속성을 섞은' : `${t ?? ''} 타입`);
const NAMES = ['도현', '서연', '지호', '하은', '민준', '수아', '예준', '지유', '시우', '채원', '주원', '윤서', '건우', '다인', '우진', '나은', '선우', '소율', '현우', '아린', '태민', '가은', '로운', '세아', '준서', '하율', '은호', '서진', '이안', '보민', '재윤', '라희', '동하', '유진', '시안', '태오', '나래', '한빛', '보람', '슬기'];
const LINES = {
  intro: [['눈이 마주쳤으니 승부다!'], ['내 루미 실력 좀 볼래?'], ['여기를 지나가려면 나를 이겨야 해!'], ['오늘 컨디션 최고야. 덤벼!'], ['너도 리그를 목표로 하는구나?']],
  defeat: [['으윽, 졌다...'], ['대단한걸!'], ['다음엔 안 질 거야!'], ['역시 강하네...']],
  after: [['더 강해져서 다시 올게.'], ['이 길 끝에 멋진 곳이 있어.'], ['루미랑 더 친해져야겠다.']],
};
const VILLAGER_LOOKS = ['villager', 'hana', 'mio', 'teo', 'juni', 'park', 'lass', 'woodcutter', 'lady', 'gentleman', 'researcher'];

/** 생성 마을 주민 대사: 지형별 채집·제작 팁 + 루미나 지방 공통 이야기 */
const BIOME_TIP = {
  meadow: '이 근처 들판엔 민들레랑 산딸기가 많아. 만능 회복약에 산딸기가 들어간대.',
  forest: '숲에선 야생 버섯이 잘 나. 고급 회복약 재료라던데?',
  rocky: '바위가 많아서 철광석 캐기 좋아. 슈퍼 루미볼 재료가 다 여기 있지.',
  snow: '추운 데선 약초가 잘 안 자라. 회복약은 고향 밭에서 넉넉히 만들어 와.',
  beach: '바닷가 바위 밑엔 별가루 결정이 숨어 있기도 해. 전설의 볼 재료래.',
  swamp: '늪지대 풀숲은 깊어서 루미가 자주 튀어나와. 볼 많이 챙겨.',
  desert: '모래바람 불면 앞이 안 보여. 도핑약이라도 챙겨 가.',
  volcano: '화산 근처 흙은 뜨거워서 불꽃고추가 매콤하게 잘 자란다나 봐.',
  city: '도시 사람들은 다 사서 쓰지만, 손으로 만든 볼이 더 잘 잡힌다는 말도 있어.',
};
const TOWN_LORE = [
  '별빛 마을 트레이너들은 자기 밭에서 약을 만들어 다닌다며? 대단해.',
  '배지를 여덟 개 모으면 승리의 길을 지나 루미 리그에 도전할 수 있어.',
  '하늘에서 떨어진 \'별빛의 씨앗\'에서 첫 루미가 태어났다는 옛이야기, 들어 봤어?',
  '세 호수 깊은 곳엔 오래된 루미가 잠들어 있대. 함부로 다가가면 안 된대.',
  '루미 센터는 어느 마을이든 무료야. 그래도 먼 길엔 회복약이 최고지.',
  '도장 관장들은 배지를 줄 때마다 트레이너의 눈빛을 본대.',
];

export function buildRegion() {
  const nodes = buildGraph();
  const builders = [];
  const data = { maps: {}, grass: {}, fish: {}, forage: {}, trainers: {}, npcs: {}, rooms: [] };
  const R0 = rng(777);
  let nameIdx = 0;
  const nextName = () => NAMES[(nameIdx++) % NAMES.length];

  for (const n of Object.values(nodes)) {
    data.maps[n.id] = { name: n.name, kind: n.kind, biome: n.biome ?? n.theme ?? 'room', x: n.x, y: n.y, tier: n.tier ?? 1 };
    if (n.existing) continue;
    if (n.kind === 'town') builders.push(genTown(n));
    else if (n.kind === 'route') builders.push(genRoute(n));
    else if (n.kind === 'area') builders.push(genArea(n));
    else if (n.kind === 'cave') builders.push(genCave(n));
    else if (n.kind === 'room') data.rooms.push({ id: n.id, room: n.room, links: n.links });
  }
  // 체육관 실내 (도시마다 한 곳)
  for (const [town, g] of Object.entries(GYMS)) if (town !== 'windvale') data.rooms.push({ id: `gym_${town}`, room: 'gym', type: g.type, leader: `leader_${town}`, town });
  for (const r of data.rooms) data.maps[r.id] ??= { name: r.room === 'gym' ? `${nodes[r.town].name} 도장` : nodes[r.id]?.name ?? r.id, kind: 'room', biome: 'room', x: nodes[r.town ?? r.id]?.x ?? 0, y: nodes[r.town ?? r.id]?.y ?? 0, tier: nodes[r.town ?? r.id]?.tier ?? 1 };
  genLeaders();
  return { builders, data, nodes };

  // ── 공통 도우미 ──────────────────────────────────────
  function spread(n, len, lo, hi) { const out = []; for (let i = 0; i < n; i++) out.push(Math.round(lo + ((hi - lo) * (i + 1)) / (n + 1))); return out; }
  /** 변 위의 출구 위치 배정: side → [{link, p}] */
  function sidePositions(node, W, H, opts = {}) {
    const bySide = { N: [], S: [], E: [], W: [] };
    for (const l of node.links) if (l.type === 'edge') bySide[l.side].push(l);
    const res = [];
    for (const [side, ls] of Object.entries(bySide)) {
      if (!ls.length) continue;
      const len = side === 'N' || side === 'S' ? W : H;
      const hi = side === 'E' || side === 'W' ? (opts.maxY ?? len - 6) : len - 6;
      spread(ls.length, len, 5, hi).forEach((p, i) => res.push({ link: ls[i], side, p }));
    }
    return res;
  }
  function exitPoint(W, H, side, p) { return side === 'E' ? [W - 1, p] : side === 'W' ? [0, p] : side === 'N' ? [p, 0] : [p, H - 1]; }
  function inward(W, H, side, p, d) { return side === 'E' ? [W - 1 - d, p] : side === 'W' ? [d, p] : side === 'N' ? [p, d] : [p, H - 1 - d]; }
  /** 가장자리 출구: 워프 + 도착 스폰 + 길 시작 */
  function edgeExit(m, ex, pathType) {
    const { W, H } = m; const { side, p, link } = ex;
    if (side === 'E' || side === 'W') m.warp(side === 'E' ? W - 1 : 0, p - 1, 1, 4, link.to, `from_${m.name}`);
    else m.warp(p - 1, side === 'N' ? 0 : H - 1, 4, 1, link.to, `from_${m.name}`);
    const [sx, sy] = inward(W, H, side, p, 2);
    m.spawn(`from_${link.to}`, sx, sy);
    if (side === 'E' || side === 'W') m.path(Math.min(...[exitPoint(W, H, side, p)[0], inward(W, H, side, p, 5)[0]]), p, Math.max(exitPoint(W, H, side, p)[0], inward(W, H, side, p, 5)[0]), p, 2, pathType);
    else m.path(p, Math.min(exitPoint(W, H, side, p)[1], inward(W, H, side, p, 5)[1]), p, Math.max(exitPoint(W, H, side, p)[1], inward(W, H, side, p, 5)[1]), 2, pathType);
    return inward(W, H, side, p, 5);
  }
  function nearExit(exits, W, H) { return (x, y) => exits.some(({ side, p }) => (side === 'E' || side === 'W' ? Math.abs(y - p) <= 3 && (side === 'E' ? x > W - 7 : x < 6) : Math.abs(x - p) <= 3 && (side === 'N' ? y < 7 : y > H - 7))); }
  /** 두 점 사이 구불구불한 길 */
  function meander(m, a, b, R, type = D, wdt = 2) {
    const pts = [a];
    const k = 1 + Math.floor(R() * 2);
    for (let i = 1; i <= k; i++) { const t = i / (k + 1); pts.push([Math.round(a[0] + (b[0] - a[0]) * t + (R() - 0.5) * 8), Math.round(a[1] + (b[1] - a[1]) * t + (R() - 0.5) * 6)]); }
    pts.push(b);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = clampP(m, pts[i]), [x1, y1] = clampP(m, pts[i + 1]);
      m.path(x0, y0, x1, y0, wdt, type); m.path(x1, Math.min(y0, y1), x1, Math.max(y0, y1), wdt, type);
    }
    return pts.map((q) => clampP(m, q));
  }
  function clampP(m, [x, y]) { return [Math.max(3, Math.min(m.W - 5, x)), Math.max(4, Math.min(m.H - 5, y))]; }
  function grassPatches(m, R, n, near) {
    for (let k = 0; k < n; k++) {
      const [cx, cy] = near ? near[Math.floor(R() * near.length)] : [4 + Math.floor(R() * (m.W - 8)), 5 + Math.floor(R() * (m.H - 10))];
      const ox = cx + Math.floor((R() - 0.5) * 10), oy = cy + (R() < 0.5 ? -4 : 3) + Math.floor((R() - 0.5) * 3);
      const w = 3 + Math.floor(R() * 5), h = 2 + Math.floor(R() * 3);
      for (let y = oy; y < oy + h; y++) for (let x = ox; x < ox + w; x++) {
        if (!m.inb(x, y) || x < 2 || y < 3 || x > m.W - 3 || y > m.H - 3 || m.terrain[y][x] !== G || m.reserved[y][x] || m.blocked[y][x] || R() < 0.1) continue;
        m.place('tallgrass', x, y, { block: false, force: true }); m.reserved[y][x] = true;
      }
    }
  }
  function nature(m, biome, R, exits, density = 1) {
    m.forest(nearExit(exits, m.W, m.H), biome === 'forest' ? 0.35 : 0.15, TREES[biome] ?? TREES.meadow);
    const trees = TREES[biome] ?? TREES.meadow;
    for (let i = 0; i < Math.round(12 * density); i++) m.scatter(trees[i % trees.length], 1);
    for (const [t, c, w] of SCATTER[biome] ?? SCATTER.meadow) m.scatter(t, Math.round(c * density), { w });
    if (biome !== 'desert' && biome !== 'snow' && biome !== 'volcano' && biome !== 'distortion') { m.scatter('tuft', Math.round(40 * density), { block: false }); m.flowers(Math.round(14 * density)); }
    m.sprinkle(Math.round(50 * density));
  }
  function forageSpots(m, R, n) {
    for (let k = 0, tries = 0; k < n && tries < 3000; tries++) {
      const x = 3 + Math.floor(R() * (m.W - 6)), y = 4 + Math.floor(R() * (m.H - 8));
      if (m.terrain[y][x] !== G || m.blocked[y][x] || m.reserved[y][x]) continue;
      m.spawn('forage', x, y); m.reserved[y][x] = true; k++;
    }
  }
  function ores(m, R, n, tier) {
    const kinds = tier >= 7 ? ['ore_iron', 'ore_star', 'ore_copper', 'ore_stone'] : tier >= 4 ? ['ore_copper', 'ore_iron', 'ore_stone', 'ore_stone'] : ['ore_stone', 'ore_stone', 'ore_copper'];
    for (let k = 0, tries = 0; k < n && tries < 2000; tries++) {
      const x = 3 + Math.floor(R() * (m.W - 6)), y = 4 + Math.floor(R() * (m.H - 8));
      if (m.blocked[y][x] || m.reserved[y][x] || m.terrain[y][x] === Wt) continue;
      const t = kinds[Math.floor(R() * kinds.length)];
      m.place(t, x, y, { force: true, props: { mine: t.slice(4) } }); k++;
    }
  }
  /** 길 위 트레이너 (시선 3~4칸) */
  function trainers(m, node, R, path, count, cls) {
    const tier = node.tier;
    const pool = POOLS[node.biome] ?? POOLS[node.theme] ?? POOLS.meadow;
    for (let k = 0; k < count && path.length > 2; k++) {
      const [px, py] = path[1 + Math.floor((k + 0.5) * (path.length - 2) / count)] ?? path[1];
      const vertical = R() < 0.5;
      const ox = vertical ? 0 : (R() < 0.5 ? -3 : 3), oy = vertical ? (R() < 0.5 ? -3 : 3) : 0;
      let x = px + ox, y = py + oy;
      for (let t = 0; t < 8 && (!m.inb(x, y) || m.blocked[y][x] || m.terrain[y][x] === Wt); t++) { x += Math.sign(ox) * -1 || 0; y += Math.sign(oy) * -1 || 0; }
      if (!m.inb(x, y) || m.blocked[y][x] || m.terrain[y][x] === Wt) continue;
      const face = ox > 0 ? 'left' : ox < 0 ? 'right' : oy > 0 ? 'up' : 'down';
      const [title, sprite] = cls[Math.floor(R() * cls.length)];
      const id = `${m.name}_t${k}`;
      const n = 1 + Math.floor(R() * Math.min(3, 1 + tier / 3));
      const lv = 3 + tier * 5;
      data.trainers[id] = {
        id, name: nextName(), title, sprite, map: m.name, sight: 4,
        team: Array.from({ length: n }, (_, i) => [pool[Math.floor(R() * pool.length)], Math.max(2, lv - 2 + i)]), reward: 30 * lv,
        intro: LINES.intro[Math.floor(R() * LINES.intro.length)], defeat: LINES.defeat[Math.floor(R() * LINES.defeat.length)], after: LINES.after[Math.floor(R() * LINES.after.length)],
      };
      m.spawn(`trainer:${id}`, x, y, { face }); m.reserve(x, y, x, y);
    }
  }
  /** 동굴 입구 (바위 아치) */
  function caveMouth(m, link, hub, R) {
    const side = link.side ?? 'N';
    let x, y;
    if (side === 'N' || side === 'S') { x = Math.max(4, Math.min(m.W - 7, hub[0] + Math.floor((R() - 0.5) * 12))); y = side === 'N' ? 5 : m.H - 6; }
    else { x = side === 'W' ? 4 : m.W - 8; y = Math.max(6, Math.min(m.H - 7, hub[1] + Math.floor((R() - 0.5) * 6))); }
    for (let yy = y - 2; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 3; xx++) if (m.inb(xx, yy)) m.setT(xx, yy, G);
    m.place('cave_mouth', x, y, { w: 3, h: 2, force: true, props: { text: m.name } });
    m.blocked[y][x + 1] = false;                              // 가운데 입구 칸은 열어 둠
    m.warp(x + 1, y, 1, 1, link.to, `from_${m.name}`);
    m.spawn(`from_${link.to}`, x + 1, y + 1);
    m.reserve(x - 1, y - 2, x + 3, y + 1);
    meander(m, hub, [x + 1, y + 1], R, D, 2);
    m.place('sign', x + 3, y + 1, { force: true, props: { interact: 'sign', text: `${nodes[link.to].name}\n${nodes[link.to].desc ?? '어두운 동굴 입구다.'}` } });
  }
  /** 부두 (배 타기): 바다 쪽으로 다리 + 끝에 워프 */
  function dock(m, link, x, seaTop) {
    for (let y = seaTop - 1; y <= seaTop + 3; y++) { m.setBridge(x, y, ROW.WOOD, WOOD.DOCK_H); m.setBridge(x + 1, y, ROW.WOOD, WOOD.DOCK_H); m.reserved[y][x] = m.reserved[y][x + 1] = true; }
    m.warp(x, seaTop + 3, 2, 1, link.to, `from_${m.name}`, { ferry: 1 });
    m.spawn(`from_${link.to}`, x, seaTop - 2);
    m.place('sign', x - 1, seaTop - 2, { force: true, props: { interact: 'sign', text: `⛵ 정기선 선착장\n부두 끝까지 걸어가면 배를 타고 「${nodes[link.to].name}」(으)로 가요.` } });
  }
  function signAt(m, x, y, text) { if (m.inb(x, y) && !m.blocked[y][x]) m.place('sign', x, y, { force: true, props: { interact: 'sign', text } }); }
  function finish(m, node, R) {
    m.props.push({ name: 'biome', type: 'string', value: node.biome ?? 'meadow' }, { name: 'battleBg', type: 'string', value: BATTLE_BG[node.biome] ?? 'grass' }, { name: 'title', type: 'string', value: node.name });
    if (!m.spawns.some((s) => s.name === 'player')) { const f = m.spawns.find((s) => s.name.startsWith('from_')); if (f) m.spawn('player', Math.floor(f.x / 16), Math.floor(f.y / 16)); }
    void R;
  }
  function addEncounters(id, pool, tier, rareKey, water) {
    data.grass[id] = encounterTable(pool, tier, rareKey);
    if (water) data.fish[id] = { items: FISH_ITEMS(tier), lumi: [['pongpong', 2 + tier * 5, 4 + tier * 5, 12], ['mallang', 2 + tier * 5, 4 + tier * 5, 8], ...(tier >= 6 ? [['chalang', 3 + tier * 5, 5 + tier * 5, 2]] : [])] };
  }

  // ── 마을 ─────────────────────────────────────────────
  function genTown(n) {
    const R = rng(hashStr(n.id));
    const W = n.city ? 58 : 46, H = n.city ? 44 : 38;
    const m = new MapBuilder(n.id, W, H, hashStr(n.id));
    const coastal = n.coastal, seaTop = H - 7;
    if (coastal) { for (let y = seaTop - 2; y < H; y++) for (let x = 0; x < W; x++) m.setT(x, y, y >= seaTop ? Wt : D); }
    const cx = Math.floor(W / 2), cy = coastal ? Math.floor(H / 2) - 3 : Math.floor(H / 2);
    const exits = sidePositions(n, W, H, { maxY: coastal ? seaTop - 4 : H - 6 });
    if (coastal) for (const ex of exits) if (ex.side === 'S') for (let y = seaTop - 2; y < H; y++) for (let x = ex.p - 2; x <= ex.p + 3; x++) m.setT(x, y, D);   // 바다를 가로지르는 모래톱 길
    // 광장
    m.ellipse(cx, cy, n.city ? 9 : 7, n.city ? 4.5 : 3.6, S, 0.02);
    if (n.city) { m.ellipse(cx, cy, 2.2, 1.4, Wt, 0); }
    m.reserve(cx - 9, cy - 4, cx + 9, cy + 4);
    for (const ex of exits) { const inner = edgeExit(m, ex, S); m.path(inner[0], inner[1], cx, inner[1], 2, S); m.path(cx, Math.min(inner[1], cy), cx, Math.max(inner[1], cy), 2, S); }
    // 건물: 북쪽 줄 (쉼터·상점·도장·리그) / 남쪽 줄 (집)
    const north = ['center', 'shop_w', ...(n.gym ? ['gym'] : []), ...(n.league ? ['hall'] : [])];
    const south = n.city ? ['house_a', 'house_b', 'house_c', 'house_a'] : ['house_b', 'house_c', 'house_a'];
    const rowN = cy - 6, rowS = coastal ? Math.min(cy + 9, seaTop - 4) : cy + 9;
    const placeRow = (list, row) => {
      let left = cx - 3, right = cx + 3, side = 0;
      for (const key of list) {
        const c = cells(key); let x0;
        if (side % 2 === 0) { x0 = left - c.w; if (x0 < 3) { side++; } else { left = x0 - 2; } }
        if (side % 2 === 1) { x0 = right; if (x0 + c.w > W - 3) continue; right = x0 + c.w + 2; }
        side++;
        if (row - c.h < 3) continue;
        const interior = key === 'gym' ? `gym_${n.id}` : key === 'hall' ? 'league' : undefined;
        const interact = key === 'center' ? 'center' : key === 'shop_w' ? 'shop:windvale' : key === 'gym' ? 'gym' : key === 'hall' ? 'league' : `home:${n.id}`;
        const doorX = x0 + c.door;
        m.place(key, x0, row, { w: c.w, h: c.h, force: true, props: { interact, doorCellX: doorX, ...(interior ? { interior } : {}) } });
        m.reserve(x0 - 1, row - c.h - 2, x0 + c.w, row);
        m.path(doorX, Math.min(row + 1, cy), doorX, Math.max(row + 1, cy), 1, S);
        m.spawn(key === 'center' ? 'wp_center' : key === 'shop_w' ? 'wp_shop' : key === 'gym' ? 'wp_gym' : `wp_${key}_${doorX}`, doorX, row + 1);
      }
    };
    placeRow(north, rowN); placeRow(south, rowS);
    // 부두
    const docks = n.links.filter((l) => l.type === 'dock');
    docks.forEach((l, i) => dock(m, l, Math.round(W * (i + 1) / (docks.length + 1)) + 4, seaTop));
    if (coastal) m.path(cx, cy, cx, seaTop - 2, 2, S);
    // 동굴 입구 / 옆길
    for (const l of n.links.filter((x) => x.type === 'mouth')) caveMouth(m, l, [cx, cy], R);
    // 소품
    for (const [dx, dy] of [[-10, -3], [10, -3], [-10, 3], [10, 3]]) if (m.inb(cx + dx, cy + dy)) m.place('lamp', cx + dx, cy + dy, { force: true });
    m.place('bench', cx - 5, cy + 3, { w: 2, force: true, props: { interact: 'bench' } });
    signAt(m, cx + 4, cy + 3, `${n.name}\n${n.desc ?? ''}`);
    m.spawn('wp_npc1', cx - 4, cy); m.spawn('wp_npc2', cx + 5, cy - 1); m.spawn('wp_plaza', cx, cy + 1);
    // 2.5D: 북쪽 건물 줄은 한 단 높은 언덕 (문 앞 두 줄 아래가 절벽, 길이 지나는 곳은 계단)
    m.terrace(rowN + 2);
    nature(m, n.biome === 'city' ? 'city' : n.biome, R, exits, n.city ? 0.5 : 0.8);
    finish(m, n, R);
    // 주민 2명
    for (let k = 1; k <= 2; k++) {
      const id = `${n.id}_npc${k}`;
      const tip = k === 1 ? n.desc : `${n.links.filter((l) => l.type === 'edge').map((l) => nodes[l.to].name.split(' · ')[0]).join(', ')}(으)로 길이 이어져 있어.`;
      data.npcs[id] = { id, gen: true, name: nextName(), title: `${n.name} 주민`, sprite: VILLAGER_LOOKS[Math.floor(R() * VILLAGER_LOOKS.length)], speed: 34, color: '#7a8a5a',
        schedule: [{ time: 600, map: n.id, to: `wp_npc${k}`, idle: 'wander', radius: 3 }],
        dialogue: { first: [`어서 와, 트레이너! 여기는 ${n.name}이야.`, tip], morning: [tip, BIOME_TIP[n.biome] ?? BIOME_TIP.meadow], afternoon: [tip, BIOME_TIP[n.biome] ?? BIOME_TIP.meadow, TOWN_LORE[(k + n.tier) % TOWN_LORE.length]],
          evening: ['밤엔 풀숲에 다른 루미들이 나온대.', TOWN_LORE[(k * 3 + n.tier) % TOWN_LORE.length]], rain: ['비 오는 날은 물가 루미가 많아져.'],
          random: [n.gym ? `우리 마을 도장 관장은 ${typeTalk(GYMS[n.id]?.type)} 루미를 써. 단단히 준비해!` : '천천히 둘러보고 가!', TOWN_LORE[(k + n.tier * 2) % TOWN_LORE.length]] } };
    }
    if (coastal) addEncounters(n.id, POOLS.beach, n.tier, 'beach', true); else if (n.biome === 'swamp') addEncounters(n.id, POOLS.swamp, n.tier, 'swamp', true);
    return m;
  }

  // ── 도로 ─────────────────────────────────────────────
  function genRoute(n) {
    const R = rng(hashStr(n.id));
    const [a, b] = n.ends.map((e) => nodes[e]);
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const edgeSides = n.links.filter((l) => l.type === 'edge').map((l) => l.side);
    const horiz = edgeSides.filter((s) => s === 'E' || s === 'W').length >= edgeSides.filter((s) => s === 'N' || s === 'S').length;
    const L = Math.max(52, Math.min(96, Math.round(dist * 1.15)));
    const W = horiz ? L : 34, H = horiz ? 34 : L;
    const m = new MapBuilder(n.id, W, H, hashStr(n.id));
    const biome = n.biome;
    // 물: 해변은 긴 쪽 가장자리 바다, 늪은 웅덩이 여러 개, 그 밖엔 연못 하나
    let water = false;
    const exits = sidePositions(n, W, H);
    const usedSides = new Set(exits.map((e) => e.side));
    if (biome === 'beach') {
      const seaSide = horiz ? (usedSides.has('S') ? 'N' : 'S') : (usedSides.has('E') ? 'W' : 'E');
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = seaSide === 'S' ? H - 1 - y : seaSide === 'N' ? y : seaSide === 'E' ? W - 1 - x : x;
        const wob = Math.round(Math.sin((horiz ? x : y) / 6) * 1.5);
        if (d < 6 + wob) m.setT(x, y, Wt); else if (d < 9 + wob) m.setT(x, y, D);
      }
      water = true;
    } else if (biome === 'swamp') { for (let k = 0; k < 7; k++) m.ellipse(5 + R() * (W - 10), 6 + R() * (H - 12), 2 + R() * 2.5, 1.5 + R() * 1.5, Wt, 0.1); water = true; }
    else if (biome !== 'desert' && R() < 0.65) { m.ellipse(6 + R() * (W - 12), 6 + R() * (H - 12), 3 + R() * 3, 2 + R() * 2, Wt, 0.08); water = true; }
    // 출구 → 중심
    const hub = [Math.floor(W / 2) + Math.floor((R() - 0.5) * 6), Math.floor(H / 2) + Math.floor((R() - 0.5) * 4)];
    let path = [hub];
    for (const ex of exits) { const inner = edgeExit(m, ex, D); path = path.concat(meander(m, inner, hub, R, D, 2)); }
    m.roughen(D, 0.2);
    for (const l of n.links.filter((x) => x.type === 'mouth')) caveMouth(m, l, hub, R);
    for (const l of n.links.filter((x) => x.type === 'dock')) dock(m, l, Math.floor(W / 2), H - 7);
    // 풀숲 · 트레이너 · 소품
    grassPatches(m, R, biome === 'city' ? 2 : horiz ? 8 : 8, path);
    trainers(m, n, R, path, 2 + (n.tier >= 4 ? 1 : 0) + (R() < 0.4 ? 1 : 0), CLASSES[biome] ?? CLASSES.meadow);
    if (biome === 'rocky' || biome === 'volcano') ores(m, R, 7, n.tier);
    for (const ex of exits) { const [x, y] = inward(W, H, ex.side, ex.p, 4); signAt(m, x + (ex.side === 'N' || ex.side === 'S' ? 2 : 0), y + (ex.side === 'E' || ex.side === 'W' ? 2 : 0), `${n.name}\n→ ${nodes[ex.link.to].name}`); }
    nature(m, biome, R, exits);
    // 2.5D 턱: 아래로만 뛰어내릴 수 있는 짧은 턱 (길 · 풀숲 · 물은 피함)
    if (biome !== 'city') {
      const grass = new Set(m.objects.filter((o) => o.type === 'tallgrass').map((o) => `${o.properties.find((pp) => pp.name === 'cellX').value},${o.properties.find((pp) => pp.name === 'cellY').value}`));
      let placed = 0;
      for (let k = 0; k < 60 && placed < 3; k++) {
        const len = 5 + Math.floor(R() * 5), y = 5 + Math.floor(R() * (H - 11)), x0 = 3 + Math.floor(R() * (W - len - 6));
        let clear = true; for (let x = x0; x <= x0 + len - 1; x++) if (grass.has(`${x},${y}`) || grass.has(`${x},${y + 1}`)) clear = false;
        if (clear && m.ledge(x0, x0 + len - 1, y)) placed++;
      }
    }
    forageSpots(m, R, 10);
    finish(m, n, R);
    addEncounters(n.id, POOLS[biome] ?? POOLS.meadow, n.tier, biome, water);
    data.forage[n.id] = biome === 'beach' ? ['berry', 'herb'] : biome === 'desert' ? ['herb'] : ['berry', 'wild_mushroom', 'dandelion', 'herb'];
    return m;
  }

  // ── 랜드마크 지역 ────────────────────────────────────
  function genArea(n) {
    const R = rng(hashStr(n.id));
    const big = n.tpl === 'marsh' || n.tpl === 'forest_maze';
    const W = big ? 60 : 46, H = big ? 46 : 38;
    const m = new MapBuilder(n.id, W, H, hashStr(n.id));
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    const isle = n.tpl === 'island' || n.tpl === 'garden' || n.tpl === 'distortion';
    if (isle) { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m.setT(x, y, Wt); m.ellipse(cx, cy, W * 0.38, H * 0.36, n.tpl === 'distortion' ? S : G, 0.12); if (n.tpl !== 'distortion') { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x + 0.5 - cx) / (W * 0.38), dy = (y + 0.5 - cy) / (H * 0.36); const r = dx * dx + dy * dy; if (r > 0.72 && r < 1.1 && m.terrain[y][x] === G) m.setT(x, y, D); } } }
    const exits = sidePositions(n, W, H);
    const hub = [cx, cy + 3];
    for (const ex of exits) { const inner = edgeExit(m, ex, D); meander(m, inner, hub, R, n.tpl === 'altar' ? S : D, 2); }
    let water = isle;
    if (n.tpl === 'lake') { m.ellipse(cx, cy - 2, 11, 6.5, Wt, 0.1); m.ellipse(cx, cy - 2, 2.2, 1.6, G, 0); water = true; m.path(cx - 14, cy + 6, cx + 14, cy + 6, 2, D); m.place('sign', cx + 3, cy + 7, { force: true, props: { interact: 'sign', text: `${n.name}\n${n.desc}` } }); m.place('ruin_pillar', cx, cy - 2, { force: true, props: { interact: 'sign', text: '호수 한가운데 작은 섬에 오래된 돌기둥이 서 있다.\n물결이 기둥을 감싸며 빛난다…' } }); }
    if (n.tpl === 'altar') {
      for (let y = 4; y < H - 3; y++) for (let x = 4; x < W - 4; x++) m.setT(x, y, S);
      for (let a = 0; a < 10; a++) { const x = Math.round(cx + Math.cos((a / 10) * Math.PI * 2) * 12), y = Math.round(cy + Math.sin((a / 10) * Math.PI * 2) * 8); m.place(a % 3 === 1 ? 'ruin_broken' : 'ruin_pillar', x, y, { force: true }); }
      m.place('altar_stone', cx - 1, cy, { w: 3, force: true, props: { interact: 'altar', text: '별의 제단.\n아주 먼 옛날, 하늘에서 떨어진 첫 별빛의 씨앗이 이곳에 빛을 남겼다고 전해진다.' } });
    }
    if (n.tpl === 'marsh') { for (let k = 0; k < 18; k++) m.ellipse(4 + R() * (W - 8), 5 + R() * (H - 10), 1.5 + R() * 2.5, 1 + R() * 1.6, Wt, 0.15); water = true; }
    if (n.tpl === 'distortion') { for (let k = 0; k < 7; k++) m.ellipse(4 + R() * (W - 8), 4 + R() * (H - 8), 2 + R() * 3, 1.5 + R() * 2, Wt, 0.2); }
    if (n.tpl === 'park') { m.ellipse(cx - 8, cy - 4, 4, 2.5, Wt, 0.05); water = true; for (let x = cx - 12; x <= cx + 12; x += 2) for (const y of [cy - 9, cy + 9]) if (m.terrain[y][x] === G) m.place('fence', x, y, { force: true }); for (const [x, y] of [[cx + 4, cy - 3], [cx + 8, cy + 2], [cx - 4, cy + 4]]) m.place('bench', x, y, { w: 2, force: true, props: { interact: 'bench' } }); for (const [x, y] of [[cx - 10, cy], [cx + 11, cy - 4], [cx + 1, cy - 6]]) m.place('planter', x, y, { force: true }); m.place('sign', cx + 2, cy + 6, { force: true, props: { interact: 'sign', text: `${n.name}\n${n.desc}` } }); }
    if (n.tpl === 'garden') { m.flowers(120, () => true); m.place('sign', cx + 2, cy + 4, { force: true, props: { interact: 'sign', text: `${n.name}\n${n.desc}` } }); }
    if (n.tpl === 'battle') { m.ellipse(cx, cy, 9, 4.5, S, 0.02); }
    // 동굴 입구 · 부두 · 건물 · 계단 · 차원문
    for (const l of n.links) {
      if (l.type === 'mouth' || l.type === 'mouthBack') caveMouth(m, { ...l, side: l.side ?? 'N' }, hub, R);
      else if (l.type === 'dock') { const x = cx - 1; for (let y = H - 9; y < H - 1; y++) { m.setBridge(x, y, ROW.WOOD, WOOD.DOCK_H); m.setBridge(x + 1, y, ROW.WOOD, WOOD.DOCK_H); m.reserved[y][x] = m.reserved[y][x + 1] = true; } m.warp(x, H - 2, 2, 1, l.to, `from_${m.name}`, { ferry: 1 }); m.spawn(`from_${l.to}`, x, H - 10); meander(m, hub, [x, H - 10], R, D); m.place('sign', x + 2, H - 10, { force: true, props: { interact: 'sign', text: `⛵ 선착장 → ${nodes[l.to].name}` } }); }
      else if (l.type === 'door') {
        const key = l.to === 'tower' ? 'hall' : 'house_c', c = cells(key), x0 = cx - Math.floor(c.w / 2), row = cy - 3;
        m.place(key, x0, row, { w: c.w, h: c.h, force: true, props: { interact: 'enter', doorCellX: x0 + c.door, interior: l.to } });
        m.reserve(x0 - 1, row - c.h - 1, x0 + c.w, row); m.path(x0 + c.door, row + 1, x0 + c.door, hub[1], 1, n.tpl === 'battle' ? S : D);
      } else if (l.type === 'stairsUp') { const sy = n.tpl === 'altar' ? cy - 4 : 4; m.place('ruin_pillar', cx - 2, sy + 1, { force: true }); m.place('ruin_pillar', cx + 3, sy + 1, { force: true }); m.path(cx, sy + 1, cx, cy - 1, 2, S); m.warp(cx, sy, 2, 1, l.to, `from_${m.name}`); m.spawn(`from_${l.to}`, cx, sy + 2); m.place('stairs_up', cx, sy, { w: 2, block: false, force: true }); m.reserve(cx - 2, sy - 1, cx + 3, sy + 2); }
      else if (l.type === 'portal') { const x = W - 9, y = cy; m.place('portal', x, y, { w: 2, block: false, force: true }); m.warp(x, y, 2, 1, l.to, `from_${m.name}`); m.spawn(`from_${l.to}`, x, y + 2); m.path(hub[0], hub[1], x, hub[1], 2, S); m.path(x, Math.min(y, hub[1]), x, Math.max(y + 2, hub[1]), 2, S); }
    }
    if (n.tpl === 'battle') { const c = cells('center'); m.place('center', cx - 14, cy - 2, { w: c.w, h: c.h, force: true, props: { interact: 'center', doorCellX: cx - 14 + c.door } }); m.path(cx - 14 + c.door, cy - 1, cx - 14 + c.door, cy, 1, S); }
    if (n.tpl === 'forest_maze') { for (let k = 0; k < 10; k++) meander(m, [4 + Math.floor(R() * (W - 8)), 4 + Math.floor(R() * (H - 8))], hub, R, D, 1); }
    // 풀숲·트레이너
    const enc = !['park', 'altar', 'battle'].includes(n.tpl);
    if (enc) grassPatches(m, R, n.tpl === 'marsh' ? 22 : 9, null);
    if (n.tpl !== 'park' && n.tpl !== 'altar') trainers(m, n, R, [hub, [cx - 8, cy], [cx + 8, cy], [cx, cy - 6]], n.tpl === 'battle' ? 4 : 2, n.tpl === 'battle' ? [['에이스 트레이너', 'ace_m'], ['에이스 트레이너', 'ace_f']] : CLASSES[n.biome] ?? CLASSES.meadow);
    const density = n.tpl === 'forest_maze' ? 4 : n.tpl === 'garden' ? 0.6 : 1;
    if (n.tpl === 'forest_maze') for (let i = 0; i < 140; i++) m.scatter(R() < 0.6 ? 'pine' : 'oak', 1);
    if (!isle) nature(m, n.biome, R, exits, Math.min(density, 1.5)); else { m.scatter((TREES[n.biome] ?? TREES.meadow)[0], 10); m.scatter('tuft', 30, { block: false }); m.flowers(20, () => true); m.sprinkle(30); }
    if (n.biome === 'rocky') ores(m, R, 6, n.tier);
    forageSpots(m, R, 8);
    finish(m, n, R);
    if (enc) addEncounters(n.id, POOLS[n.biome] ?? POOLS.meadow, n.tier, n.biome, water);
    if (n.tpl === 'distortion') data.grass[n.id] = { day: [['astra', 50, 55, 10], ['banjjak', 45, 50, 30]], night: [['astra', 50, 55, 12], ['banjjak', 45, 50, 30]] };
    return m;
  }

  // ── 동굴 층 ──────────────────────────────────────────
  function genCave(n) {
    const R = rng(hashStr(n.id) ^ 99);
    const lay = caveLayout(n.id, caveExits(n));
    const m = new MapBuilder(n.id, lay.W, lay.H, hashStr(n.id));
    m.noGround = true;
    for (let y = 0; y < lay.H; y++) for (let x = 0; x < lay.W; x++) if (lay.wall[y][x]) m.blocked[y][x] = true;
    for (const p of lay.points) {
      if (p.edge) {
        m.warp(p.x, p.y, 1, 1, p.to, `from_${m.name}`);
        m.spawn(`from_${p.to}`, p.x, p.y === 0 ? 2 : lay.H - 3);
      } else {
        m.warp(p.x, p.y, 1, 1, p.to, `from_${m.name}`);
        const free = (x, y) => y >= 3 && y < lay.H - 2 && x >= 2 && x < lay.W - 2 && !lay.wall[y][x];
        const [sx, sy] = [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1]].map(([dx, dy]) => [p.x + dx, p.y + dy]).find(([x, y]) => free(x, y)) ?? [p.x, p.y];
        m.spawn(`from_${p.to}`, sx, sy);
      }
      m.reserve(p.x - 2, p.y - 2, p.x + 2, p.y + 2);
    }
    // 바위 · 광석 · 트레이너
    const floor = []; for (let y = 3; y < lay.H - 2; y++) for (let x = 2; x < lay.W - 2; x++) if (!lay.wall[y][x] && !m.reserved[y][x]) floor.push([x, y]);
    for (let k = 0; k < 8 && floor.length; k++) { const [x, y] = floor.splice(Math.floor(R() * floor.length), 1)[0]; const kinds = n.tier >= 7 ? ['ore_iron', 'ore_star', 'ore_copper'] : ['ore_stone', 'ore_copper', 'ore_iron']; const t = kinds[Math.floor(R() * kinds.length)]; m.place(t, x, y, { force: true, props: { mine: t.slice(4) } }); m.reserve(x, y, x, y); }
    trainers(m, { ...n, biome: n.theme }, R, floor.length ? [floor[0], floor[Math.floor(floor.length / 2)], floor[floor.length - 1]] : [], n.tier >= 5 ? 2 : 1, CLASSES.cave);
    m.props.push({ name: 'cave', type: 'string', value: 'true' }, { name: 'bg', type: 'string', value: `cave_${n.id}` }, { name: 'theme', type: 'string', value: n.theme }, { name: 'battleBg', type: 'string', value: 'cave' }, { name: 'title', type: 'string', value: n.name }, { name: 'biome', type: 'string', value: 'cave' });
    { const f = m.spawns.find((sp) => sp.name === `from_${lay.points[0].to}`); m.spawn('player', Math.floor(f.x / 16), Math.floor(f.y / 16)); }
    addEncounters(n.id, POOLS[n.theme] ?? POOLS.rock, n.tier, n.theme, n.theme === 'sea');
    return m;
  }

  // ── 관장 · 사천왕 · 챔피언 ───────────────────────────
  function genLeaders() {
    const order = ['harbor', 'maple', 'forge', 'ember', 'lumina', 'frost', 'summit'];
    order.forEach((town, i) => {
      const g = GYMS[town], lv = 14 + i * 6;
      data.trainers[`leader_${town}`] = {
        id: `leader_${town}`, name: g.name, title: `${nodes[town].name} 관장`, sprite: `leader_${town}`, map: `gym_${town}`, sight: 0,
        team: g.species.map((s, k) => [s, lv + k]), reward: 300 + i * 150, badge: g.badge,
        intro: [`${nodes[town].name} 도장에 잘 왔어. 나는 관장 ${g.name}.`, g.type === '혼합' ? '별자리처럼 여러 속성을 엮은 내 팀, 하나의 상성으로는 못 이길걸!' : `${g.type} 타입의 진짜 힘, 보여 줄게!`],
        defeat: [`…훌륭해. 이 「${g.badgeName}」를 받아.`], after: ['다음 도시의 관장은 더 강할 거야. 계속 나아가!'],
      };
      // 도장 관원 2명
      [['도장 관원', 'ace_m'], ['도장 관원', 'ace_f']].forEach(([title, sprite], k) => {
        const id = `gym_${town}_t${k + 1}`;
        data.trainers[id] = { id, name: nextName(), title, sprite, map: `gym_${town}`, sight: 3, team: [[g.species[k % g.species.length], lv - 4 + k], [g.species[(k + 1) % g.species.length], lv - 3 + k]], reward: 40 * lv,
          intro: [`관장님께 가려면 나부터 넘어야 해! ${typeTalk(g.type)} 힘을 보여 주지!`], defeat: ['관장님은 나보다 훨씬 강해!'], after: [g.type === '혼합' ? '관장님은 여러 속성을 섞어 써. 파티를 고르게 꾸려 와!' : `관장님은 ${g.type} 타입이야. 상성을 잘 생각해 봐.`] };
      });
    });
    const elites = [['elite1', '바람결', '사천왕', ['poreureu', 'busit', 'jagal'], 50], ['elite2', '물안개', '사천왕', ['mallang', 'pongpong', 'chalang'], 51], ['elite3', '화톳불', '사천왕', ['busit', 'morak', 'jagal'], 52], ['elite4', '숲그늘', '사천왕', ['posil', 'saerok', 'ikkigom'], 53], ['champion', '하람', '챔피언', ['astra', 'ikkigom', 'mallang', 'busit', 'banjjak'], 56]];
    elites.forEach(([id, name, title, team, lv], i) => {
      data.trainers[id] = { id, name, title, sprite: id, map: 'league', sight: 0, team: team.map((s, k) => [s, lv + k]), reward: 2000 + i * 500,
        requires: i === 0 ? [] : [elites[i - 1][0]],
        intro: id === 'champion' ? ['여기까지 온 걸 환영해. 나는 루미 리그 챔피언 하람.', '모든 걸 걸고, 최고의 승부를 하자!'] : [`나는 ${title} ${name}. 여기서 너의 여행은 끝이야!`],
        defeat: id === 'champion' ? ['…졌다. 오늘부터 네가 이 지방의 챔피언이야!'] : ['대단하군. 다음 방으로 가라.'], after: ['다음 방에서 더 강한 상대가 기다리고 있어.'] };
    });
    // 도전의 탑 · 폐저택
    [['tower_1', '에이스 트레이너', 'ace_m', ['ikkigom', 'busit', 'mallang'], 48], ['tower_2', '에이스 트레이너', 'ace_f', ['saerok', 'chalang', 'jagal'], 50], ['tower_3', '탑의 주인', 'gentleman', ['astra', 'morak', 'chalang', 'saerok'], 55]].forEach(([id, title, sprite, team, lv], i) => {
      data.trainers[id] = { id, name: nextName(), title, sprite, map: 'tower', sight: id === 'tower_3' ? 0 : 3, team: team.map((s, k) => [s, lv + k]), reward: 1500 + i * 500, requires: i === 0 ? [] : [`tower_${i}`],
        intro: [id === 'tower_3' ? '이 탑 꼭대기까지 올라온 건 오랜만이군. 전력으로 상대해 주지.' : '도전의 탑에 온 걸 환영해. 진짜 실력만이 통하는 곳이야!'], defeat: ['훌륭한 승부였어.'], after: ['또 도전하러 와!'] };
    });
    data.trainers.chateau_ghost = { id: 'chateau_ghost', name: '???', title: '창백한 소녀', sprite: 'lady', map: 'chateau', sight: 3, team: [['banjjak', 30], ['banjjak', 31], ['astra', 32]], reward: 900,
      intro: ['…여기서 나가고 싶어? 그럼 나랑 놀아 줘.'], defeat: ['…재밌었어. 또 와.'], after: ['(소녀는 어느새 사라지고 없다…)'] };
  }
}
