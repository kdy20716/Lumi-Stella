// 포켓몬 4·5세대 감성의 특화 도로/대교/도시 관문/자전거 도로 생성기
// - 초반 풀숲 도로(route1~3)는 자연 감성을 유지하고,
// - 중·후반 도시 진입로·해안·협곡 대교·14번 자전거 도로를 Y축 고가·현수교·게이트하우스로 재구성함
import { G, D, Wt, S, T } from './lib.mjs';
import { ROW } from '../art/tiles.mjs';

export const SPECIAL_ROUTE_IDS = new Set([
  'route4b', 'route9c', 'route10b', 'route11b', 'route11c',
  'route13b', 'route14', 'route14b', 'route14c',
  'route19b', 'route20', 'route21b', 'route24b',
]);

const P = (o, k) => o?.properties?.find((p) => p.name === k)?.value;

function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** 생성된 맵의 워프·트레이너·상자·표지판 메타데이터는 보존하고 지형만 초기화 */
function resetForSpecial(m) {
  const { W, H } = m;
  const preservedTrainers = m.spawns
    .filter((s) => s.name.startsWith('trainer:'))
    .map((s) => ({ name: s.name, props: Object.fromEntries((s.properties ?? []).map((p) => [p.name, p.value])) }));
  const preservedChests = m.objects
    .filter((o) => P(o, 'interact') === 'loot')
    .map((o) => ({ type: o.type, props: Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value])) }));
  const preservedSigns = m.objects
    .filter((o) => o.type === 'sign')
    .map((o) => ({ text: P(o, 'text') ?? '' }));

  m.spawns = m.spawns.filter((s) => s.name === 'player' || s.name.startsWith('from_'));
  m.objects = [];
  m.terrain = Array.from({ length: H }, () => Array(W).fill(G));
  m.blocked = Array.from({ length: H }, () => Array(W).fill(false));
  m.decor = new Array(W * H).fill(0);
  m.bridge = new Array(W * H).fill(0);
  m.cliff = new Array(W * H).fill(0);
  m._elevs = [];
  m._ramps = [];
  m._cycleZones = [];
  m._surf = null;
  // 기본 잔디 영역을 투명('g')으로 두고 포장 부분만 덮어씀
  m.paintSurface(0, 0, W - 1, H - 1, 'g');

  // 바깥쪽 워프 정보 파싱
  const exits = m.warps.map((w) => {
    const x0 = Math.round(w.x / T), y0 = Math.round(w.y / T);
    const ww = Math.max(1, Math.round(w.width / T)), wh = Math.max(1, Math.round(w.height / T));
    const side = x0 === 0 ? 'W' : x0 + ww >= W ? 'E' : y0 === 0 ? 'N' : 'S';
    return { side, to: P(w, 'to'), x0, y0, ww, wh, cx: x0 + Math.floor(ww / 2), cy: y0 + Math.floor(wh / 2) };
  });

  // 2칸 두께 외곽 나무 기본 차단 제거 후 직접 정돈
  return { exits, preservedTrainers, preservedChests, preservedSigns };
}

function carveRect(m, x0, y0, x1, y1, tile = S, surf = null) {
  for (let y = Math.max(0, y0); y <= Math.min(m.H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(m.W - 1, x1); x++) {
      m.terrain[y][x] = tile;
      m.blocked[y][x] = tile === Wt && m.bridge[y * m.W + x] === 0;
    }
  }
  if (surf) m.paintSurface(x0, y0, x1, y1, surf);
}

function carveRiver(m, x0, y0, x1, y1) {
  for (let y = Math.max(0, y0); y <= Math.min(m.H - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(m.W - 1, x1); x++) {
      m.terrain[y][x] = Wt;
      m.blocked[y][x] = m.bridge[y * m.W + x] === 0;
    }
  }
}

/** 2~4차선 도시/도로 아스팔트 + 선택적 양옆 인도('w') + 가로등 배치 */
function addBoulevard(m, x0, y0, x1, y1, axis = 'ns', { sidewalk = true, lamps = true, roadTile = S } = {}) {
  const lane = axis === 'ns' ? 'v' : 'h';
  carveRect(m, x0, y0, x1, y1, roadTile, lane);
  if (sidewalk) {
    if (axis === 'ns') {
      if (x0 - 1 >= 1) carveRect(m, x0 - 1, y0, x0 - 1, y1, S, 'w');
      if (x1 + 1 <= m.W - 2) carveRect(m, x1 + 1, y0, x1 + 1, y1, S, 'w');
    } else {
      if (y0 - 1 >= 1) carveRect(m, x0, y0 - 1, x1, y0 - 1, S, 'w');
      if (y1 + 1 <= m.H - 2) carveRect(m, x0, y1 + 1, x1, y1 + 1, S, 'w');
    }
  }
  if (lamps) {
    if (axis === 'ns') {
      for (let y = y0 + 2; y <= y1 - 2; y += 7) {
        if (x0 - 2 >= 1 && m.terrain[y]?.[x0 - 2] === G && !m.blocked[y][x0 - 2]) m.place('lamp', x0 - 2, y, { block: true });
        if (x1 + 2 <= m.W - 2 && m.terrain[y]?.[x1 + 2] === G && !m.blocked[y][x1 + 2]) m.place('lamp', x1 + 2, y, { block: true });
      }
    } else {
      for (let x = x0 + 2; x <= x1 - 2; x += 7) {
        if (y0 - 2 >= 1 && m.terrain[y0 - 2]?.[x] === G && !m.blocked[y0 - 2][x]) m.place('lamp', x, y0 - 2, { block: true });
        if (y1 + 2 <= m.H - 2 && m.terrain[y1 + 2]?.[x] === G && !m.blocked[y1 + 2][x]) m.place('lamp', x, y1 + 2, { block: true });
      }
    }
  }
}

function addTallGrass(m, x0, y0, x1, y1, R, density = 0.78) {
  for (let y = Math.max(2, y0); y <= Math.min(m.H - 3, y1); y++) {
    for (let x = Math.max(2, x0); x <= Math.min(m.W - 3, x1); x++) {
      if (m.terrain[y][x] === G && !m.blocked[y][x] && R() < density) m.place('tallgrass', x, y, { block: false });
    }
  }
}

function isProtectedZone(m, x, y, exits) {
  if (m.terrain[y]?.[x] !== G || m.blocked[y]?.[x]) return true;
  if (m.objects.some((o) => P(o, 'cellX') === x && P(o, 'cellY') === y)) return true;
  for (const e of exits) {
    if (Math.abs(x - e.cx) <= 2 && Math.abs(y - e.cy) <= 2) return true;
  }
  return false;
}

/** 워프와 연결된 안전한 보행 가능 칸들을 BFS로 수집해 트레이너·보물·채집·나무 배치 */
function populateSafely(m, R, { exits, preservedTrainers, preservedChests, preservedSigns }, { biome, trees, signTexts = [] }) {
  const { W, H, terrain, blocked } = m;
  const blockedTile = (x, y) => !m.inb(x, y) || blocked[y][x] || (terrain[y][x] === Wt && m.bridge[y * W + x] === 0);
  const start = exits[0] ? [exits[0].cx, Math.max(1, Math.min(H - 2, exits[0].cy + (exits[0].side === 'N' ? 1 : exits[0].side === 'S' ? -1 : 0)))] : [Math.floor(W / 2), Math.floor(H / 2)];

  const seen = new Uint8Array(W * H);
  const q = [start];
  seen[start[1] * W + start[0]] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (blockedTile(nx, ny) || seen[ny * W + nx]) continue;
      seen[ny * W + nx] = 1; q.push([nx, ny]);
    }
  }

  // 연결된 진입 워프 앞에 안전하게 기본 player 스폰 위치 재정렬 (강·절벽 위 스폰 방지)
  const ps = m.spawns.find((s) => s.name === 'player');
  if (ps && exits[0]) {
    const e0 = exits[0];
    const sx = Math.max(2, Math.min(m.W - 3, e0.cx + (e0.side === 'W' ? 2 : e0.side === 'E' ? -2 : 0)));
    const sy = Math.max(2, Math.min(m.H - 3, e0.cy + (e0.side === 'N' ? 2 : e0.side === 'S' ? -2 : 0)));
    ps.x = (sx + 0.5) * T;
    ps.y = (sy + 0.5) * T;
  }

  // 연결된 빈 잔디/흙 칸 모으기
  const safeGrass = [], safeSide = [];
  const objOcc = new Set();
  for (const o of m.objects) {
    const cx = P(o, 'cellX'), cy = P(o, 'cellY'), w = P(o, 'cellW') ?? 1, h = P(o, 'cellH') ?? 1;
    if (cx == null || cy == null) continue;
    for (let y = cy - h + 1; y <= cy; y++) for (let x = cx; x < cx + w; x++) objOcc.add(`${x},${y}`);
  }
  const elevRects = m._elevs ?? [];
  const rampRects = m._ramps ?? [];
  const onHigh = (x, y) => elevRects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1)
    || rampRects.some((r) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);

  for (let y = 2; y <= H - 3; y++) for (let x = 2; x <= W - 3; x++) {
    if (!seen[y * W + x] || objOcc.has(`${x},${y}`) || onHigh(x, y)) continue;
    if (exits.some((e) => Math.abs(x - e.cx) <= 2 && Math.abs(y - e.cy) <= 2)) continue;
    if (terrain[y][x] === G && m.bridge[y * W + x] === 0) safeGrass.push([x, y]);
    else if (terrain[y][x] === D) safeSide.push([x, y]);
  }

  // 바깥 테두리 나무/바위 숲 (다리·도로·워프 보호)
  const avoidTree = (x, y) => {
    if (terrain[y][x] !== G || blocked[y][x] || m.bridge[y * W + x] > 0 || onHigh(x, y) || objOcc.has(`${x},${y}`)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = terrain[y + dy]?.[x + dx];
      if (t === S || t === D || t === Wt) return true;
    }
    return exits.some((e) => Math.hypot(x - e.cx, y - e.cy) <= 4);
  };
  m.forest(avoidTree, 0.14, trees);

  // 꽃 · 바위 · 덤불 장식 (길을 막지 않는 잔디 칸만)
  const decoPool = biome === 'desert' ? ['cactus', 'rock'] : biome === 'snow' ? ['rock', 'pine_snow'] : biome === 'swamp' ? ['reeds', 'tuft'] : ['bush', 'bush_berry', 'tuft'];
  for (const [x, y] of safeGrass) {
    if (avoidTree(x, y) || m.blocked[y][x]) continue;
    if (R() < 0.045) {
      const tp = decoPool[Math.floor(R() * decoPool.length)];
      m.place(tp, x, y, { block: tp !== 'tuft' && tp !== 'reeds' });
      objOcc.add(`${x},${y}`);
    }
  }

  // 안내 표지판 배치 (첫 입구 주변 잔디)
  const signSpots = exits.map((e) => [
    Math.max(2, Math.min(W - 3, e.cx + (e.side === 'N' || e.side === 'S' ? 3 : e.side === 'W' ? 3 : -3))),
    Math.max(2, Math.min(H - 3, e.cy + (e.side === 'E' || e.side === 'W' ? 3 : e.side === 'N' ? 3 : -3))),
  ]);
  for (let i = 0; i < Math.min(preservedSigns.length, 2); i++) {
    const txt = signTexts[i] ?? preservedSigns[i].text;
    const cand = signSpots[i];
    const spot = cand && !blockedTile(cand[0], cand[1]) && m.terrain[cand[1]][cand[0]] === G && !objOcc.has(`${cand[0]},${cand[1]}`)
      ? cand
      : safeGrass.find(([x, y]) => !objOcc.has(`${x},${y}`));
    if (spot && txt) { m.place('sign', spot[0], spot[1], { block: true, props: { text: txt } }); objOcc.add(`${spot[0]},${spot[1]}`); }
  }

  // 보물상자(chest) 배치 (도달 가능한 잔디 코너 우선)
  const lootSpots = safeGrass.filter(([x, y]) => !objOcc.has(`${x},${y}`) && seen[y * W + x]);
  for (let i = 0; i < preservedChests.length && lootSpots.length; i++) {
    const idx = Math.floor(((i + 0.5) / Math.max(1, preservedChests.length)) * lootSpots.length);
    const [cx, cy] = lootSpots.splice(Math.min(idx, lootSpots.length - 1), 1)[0];
    m.place(preservedChests[i].type, cx, cy, { block: true, props: preservedChests[i].props });
    objOcc.add(`${cx},${cy}`);
  }

  // 트레이너 스폰 배치 (도로 가장자리 또는 안전 잔디에 상호작용 가능하게 배치)
  const trainerCands = safeGrass.filter(([x, y]) => {
    if (objOcc.has(`${x},${y}`) || m.blocked[y][x]) return false;
    // 인접 1칸 이상 보행 가능해야 함
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !blockedTile(x + dx, y + dy) && !m.blocked[y + dy]?.[x + dx]);
  });
  for (let i = 0; i < preservedTrainers.length && trainerCands.length; i++) {
    const pickIdx = Math.floor(((i + 0.4) / Math.max(1, preservedTrainers.length)) * trainerCands.length);
    const [tx, ty] = trainerCands.splice(Math.min(pickIdx, trainerCands.length - 1), 1)[0];
    m.spawn(preservedTrainers[i].name, tx, ty, preservedTrainers[i].props);
    objOcc.add(`${tx},${ty}`);
  }

  // 채집(forage) 포인트 10개
  const foragePool = [...safeGrass, ...safeSide].filter(([x, y]) => !objOcc.has(`${x},${y}`));
  for (let i = 0; i < Math.min(10, foragePool.length); i++) {
    const [fx, fy] = foragePool[Math.floor((i * foragePool.length) / 10)];
    m.spawn('forage', fx, fy);
  }
}

/** 4방향 워프 좌표에 맞춰 남북(ns) 또는 동서(ew) 진입로 자동 연결 */
function connectWarps(m, exits, targetX, targetY, w = 4, tile = S, surf = null) {
  for (const e of exits) {
    if (e.side === 'N') {
      const x0 = Math.min(e.x0, targetX), x1 = Math.max(e.x0 + e.ww - 1, targetX + w - 1);
      carveRect(m, e.x0, 0, e.x0 + e.ww - 1, 3, tile, surf);
      carveRect(m, x0, 2, x1, 4, tile, surf);
    } else if (e.side === 'S') {
      const x0 = Math.min(e.x0, targetX), x1 = Math.max(e.x0 + e.ww - 1, targetX + w - 1);
      carveRect(m, e.x0, m.H - 4, e.x0 + e.ww - 1, m.H - 1, tile, surf);
      carveRect(m, x0, m.H - 5, x1, m.H - 3, tile, surf);
    } else if (e.side === 'W') {
      const y0 = Math.min(e.y0, targetY), y1 = Math.max(e.y0 + e.wh - 1, targetY + w - 1);
      carveRect(m, 0, e.y0, 3, e.y0 + e.wh - 1, tile, surf);
      carveRect(m, 2, y0, 4, y1, tile, surf);
    } else {
      const y0 = Math.min(e.y0, targetY), y1 = Math.max(e.y0 + e.wh - 1, targetY + w - 1);
      carveRect(m, m.W - 4, e.y0, m.W - 1, e.y0 + e.wh - 1, tile, surf);
      carveRect(m, m.W - 5, y0, m.W - 3, y1, tile, surf);
    }
  }
}

export function applySpecialRoute(n, m) {
  if (!SPECIAL_ROUTE_IDS.has(n.id)) return false;
  const R = mulberry32(hashStr(n.id) ^ 0x51a7);
  const { W, H } = m;
  const meta = resetForSpecial(m);
  const { exits } = meta;

  if (n.id === 'route4b') {
    // 쇳불 강철 대교 (Forge Steel Viaduct): 남북 32x48 · Y축 강철 트러스교 + 북쪽 쇳불 도시 게이트하우스
    const rx0 = 15, rx1 = 18;
    carveRiver(m, 2, 16, W - 3, 30);
    addBoulevard(m, rx0, 0, rx1, 11, 'ns', { sidewalk: true, lamps: true });
    m.paintSurface(rx0, 4, rx1, 5, 'z');
    m.placeGatehouse(17, 7, 6, 'ns', 'gatehouse');
    carveRect(m, rx0, 35, rx1, H - 1, D);
    m.elevBridge(rx0, 11, rx1, 35, 'ns', { h: 2.3, rampLen: 4, style: 'steel', surfaceChar: 'v', roadTile: S });
    carveRect(m, 6, 36, 14, 43, D);
    addTallGrass(m, 4, 34, 13, 44, R, 0.72);
    addTallGrass(m, 20, 34, 28, 44, R, 0.72);
    addTallGrass(m, 5, 4, 12, 13, R, 0.55);
    connectWarps(m, exits, rx0, 0, 4, S);
    populateSafely(m, R, meta, {
      biome: 'rocky', trees: ['pine', 'dead_tree'],
      signTexts: ['북쪽: 쇳불 도시 — 강철 대교 횡단 구간', '남쪽: 4번 도로 자갈비탈 방면'],
    });
    return true;
  }

  if (n.id === 'route11b') {
    // 빛누리 대교 (Skyarrow Suspension Bridge): 동서 48x40 · 광활한 만(Bay)을 횡단하는 Y축 붉은 주탑 현수교
    const ry0 = 18, ry1 = 21;
    carveRiver(m, 9, 3, 38, H - 4);
    carveRect(m, 2, ry0, 6, ry1, S, 'h');
    carveRect(m, 41, ry0, W - 3, ry1, S, 'h');
    m.elevBridge(6, ry0, 41, ry1, 'ew', { h: 2.6, rampLen: 4, style: 'suspension', surfaceChar: 'h', roadTile: S });
    // 서쪽·동쪽 해안 전망 공원 & 갯바위 산책로
    carveRect(m, 2, 10, 7, 30, D);
    carveRect(m, W - 8, 10, W - 3, 30, D);
    addTallGrass(m, 2, 10, 7, 16, R, 0.7);
    addTallGrass(m, 2, 24, 7, 31, R, 0.7);
    addTallGrass(m, W - 8, 10, W - 3, 16, R, 0.7);
    addTallGrass(m, W - 8, 24, W - 3, 31, R, 0.7);
    connectWarps(m, exits, 0, ry0, 4, S, 'h');
    populateSafely(m, R, meta, {
      biome: 'meadow', trees: ['oak', 'pine'],
      signTexts: ['빛누리 대교 — 만 너머 빛누리 시티가 보입니다!', '서쪽: 11번 반딧불길 / 안개 마을 방면'],
    });
    return true;
  }

  if (n.id === 'route11c') {
    // 빛누리 서쪽 도시 가도 & 석조 운하교 (West Lumina Boulevard): 48x36
    const ry0 = 16, ry1 = 19;
    carveRiver(m, 14, 3, 25, H - 4);
    carveRect(m, 2, ry0, 11, ry1, D);
    addBoulevard(m, 28, ry0, W - 1, ry1, 'ew', { sidewalk: true, lamps: true });
    m.paintSurface(43, ry0, 44, ry1, 'y');
    m.placeGatehouse(41, 18, 6, 'ew', 'gatehouse');
    m.elevBridge(10, ry0, 29, ry1, 'ew', { h: 1.9, rampLen: 4, style: 'stone', surfaceChar: 'h', roadTile: S });
    // 서쪽 공원 산책로 & 풀숲
    carveRect(m, 3, 7, 10, 14, D);
    carveRect(m, 3, 22, 10, 29, D);
    addTallGrass(m, 3, 6, 11, 13, R, 0.75);
    addTallGrass(m, 3, 23, 11, 30, R, 0.75);
    connectWarps(m, exits, 0, ry0, 4, S, 'h');
    populateSafely(m, R, meta, {
      biome: 'meadow', trees: ['oak', 'oak_apple'],
      signTexts: ['동쪽: 빛누리 시티 서쪽 관문 — 백화점·빛누리 경기장', '서쪽: 빛누리 대교 방면'],
    });
    return true;
  }

  if (n.id === 'route9c') {
    // 모래바람 동쪽 관문로 (Eastern Desert Stone Bridge & Lumina Gate): 48x40
    const ry0 = 18, ry1 = 21;
    carveRiver(m, 21, 4, 32, H - 5);
    addBoulevard(m, 0, ry0, 17, ry1, 'ew', { sidewalk: true, lamps: true });
    m.paintSurface(3, ry0, 4, ry1, 'y');
    m.placeGatehouse(7, 20, 6, 'ew', 'gatehouse');
    carveRect(m, 36, ry0, W - 1, ry1, D);
    m.elevBridge(17, ry0, 36, ry1, 'ew', { h: 1.9, rampLen: 4, style: 'stone', surfaceChar: 'p', roadTile: S });
    carveRect(m, 36, 9, 44, 29, D);
    addTallGrass(m, 35, 8, 44, 15, R, 0.68);
    addTallGrass(m, 35, 24, 44, 32, R, 0.68);
    connectWarps(m, exits, 0, ry0, 4, S, 'h');
    populateSafely(m, R, meta, {
      biome: 'desert', trees: ['palm', 'cactus'],
      signTexts: ['서쪽: 빛누리 시티 동쪽 관문', '동쪽: 9번 도로 신기루길 / 모래바람 마을'],
    });
    return true;
  }

  if (n.id === 'route14' || n.id === 'route14b' || n.id === 'route14c') {
    // 14번 도로 — 포켓몬식 고가 자전거 도로(Cycling Road) + 아래쪽 도보/자연 우회로 (소프트락 방지!)
    const entryY = exits[0]?.y0 ?? Math.floor(H / 2) - 2;
    const isCenter = n.id === 'route14b';
    const upY0 = isCenter ? 8 : 7, upY1 = upY0 + 3;          // 상단 Y축 고가 자전거 도로 (4차선)
    const loY0 = isCenter ? 28 : Math.min(H - 8, 22), loY1 = loY0 + 3; // 하단 일반 자연/산책길

    // 동/서 입구 광장 (양 갈래로 자연스럽게 갈라짐)
    carveRect(m, 0, Math.min(upY0, entryY) - 1, 6, Math.max(loY1, entryY + 4), S, 'p');
    carveRect(m, W - 7, Math.min(upY0, entryY) - 1, W - 1, Math.max(loY1, entryY + 4), S, 'p');

    // 중앙 경관 강물 (하단 길엔 목재 다리로 안전 횡단, 상단엔 Y축 고가교로 횡단!)
    const rivX0 = isCenter ? 16 : n.id === 'route14c' ? 16 : 19;
    const rivX1 = isCenter ? 31 : n.id === 'route14c' ? 28 : 29;
    carveRiver(m, rivX0, 3, rivX1, H - 4);

    // ── 상단: 고가 자전거 도로 (Y축 +2.4~2.6, 자동 자전거 탑승 구역 + 가속 화살표 패드) ──
    const d0 = 7, d1 = W - 8;
    m.elevBridge(d0, upY0, d1, upY1, 'ew', {
      h: isCenter ? 2.6 : 2.3,
      rampLen: 4,
      style: 'steel',
      surfaceChar: 'h',
      roadTile: S,
    });
    // 자전거 도로 진입 전후 구간 포장 및 자동 탑승 구역 설정
    m.addCycleZone(d0, upY0, d1 - d0 + 1, upY1 - upY0 + 1);
    // 위쪽 차선(upY0): 서행/서쪽 방향 고속 가속 패드, 아래쪽 차선(upY1): 동쪽 방향 고속 가속 패드 (중간 2차선은 자유 주행!)
    for (let ax = d0 + 6; ax <= d1 - 7; ax += 8) {
      m.place('arrow_pad', ax, upY0, { block: false, force: true, props: { dir: 'left', steps: 4 } });
      m.place('arrow_pad', ax, upY1, { block: false, force: true, props: { dir: 'right', steps: 4 } });
    }

    // ── 관문 게이트하우스: 동쪽(route14c ↔ lumina), 서쪽(route14 ↔ summit) ──
    if (n.id === 'route14c') {
      addBoulevard(m, W - 8, entryY, W - 1, entryY + 3, 'ew', { sidewalk: false, lamps: true });
      m.placeGatehouse(W - 6, upY0 + 2, 6, 'ew', 'cycle_gate');
      m.paintSurface(W - 4, upY0, W - 3, upY1, 'y');
    } else if (n.id === 'route14') {
      addBoulevard(m, 0, entryY, 7, entryY + 3, 'ew', { sidewalk: false, lamps: true });
      m.placeGatehouse(5, upY0 + 2, 6, 'ew', 'cycle_gate');
      m.paintSurface(3, upY0, 4, upY1, 'y');
    }

    // ── 하단: 자연 아랫길(도보 우회로) + 목재 다리 + 풍성한 풀숲 ──
    carveRect(m, 5, loY0, W - 6, loY1, D);
    for (let y = loY0; y <= loY1; y++) for (let x = rivX0; x <= rivX1; x++) {
      m.setBridge(x, y, ROW.DIRT, 5);
      m.blocked[y][x] = false;
    }
    m.paintSurface(rivX0, loY0, rivX1, loY1, 'd');
    // 상/하 길 사이 완충 언덕 풀숲
    const midY0 = upY1 + 3, midY1 = loY0 - 2;
    if (midY1 >= midY0) {
      addTallGrass(m, 6, midY0, rivX0 - 2, midY1, R, 0.72);
      addTallGrass(m, rivX1 + 2, midY0, W - 7, midY1, R, 0.72);
    }
    addTallGrass(m, 6, loY1 + 2, rivX0 - 2, H - 4, R, 0.7);
    addTallGrass(m, rivX1 + 2, loY1 + 2, W - 7, H - 4, R, 0.7);

    connectWarps(m, exits, 0, entryY, 4, S, 'p');
    populateSafely(m, R, meta, {
      biome: 'meadow', trees: ['oak', 'oak_apple', 'pine'],
      signTexts: [
        '14번 자전거 도로 (위: 고가 자전거 전용 하이웨이 · 아래: 도보 자연 산책로)',
        n.id === 'route14c' ? '동쪽: 빛누리 시티 / B키로 자전거 탑승!' : n.id === 'route14' ? '서쪽: 별마루 마을 산기슭 관문' : '빛누리 ↔ 별마루 계곡 전망대 구간',
      ],
    });
    return true;
  }

  if (n.id === 'route20') {
    // 빛누리 북쪽 석조 개선가도 (Victory Stone Viaduct): 32x48
    const rx0 = 14, rx1 = 17;
    carveRiver(m, 2, 14, W - 3, 30);
    addBoulevard(m, rx0, 35, rx1, H - 1, 'ns', { sidewalk: true, lamps: true });
    m.paintSurface(rx0, H - 5, rx1, H - 4, 'z');
    m.placeGatehouse(16, H - 7, 6, 'ns', 'gatehouse');
    carveRect(m, rx0, 0, rx1, 11, D);
    m.elevBridge(rx0, 11, rx1, 35, 'ns', { h: 2.2, rampLen: 4, style: 'stone', surfaceChar: 'p', roadTile: S });
    addTallGrass(m, 4, 4, 11, 12, R, 0.7);
    addTallGrass(m, 20, 4, 27, 12, R, 0.7);
    addTallGrass(m, 4, 34, 11, 43, R, 0.6);
    connectWarps(m, exits, rx0, 0, 4, S);
    populateSafely(m, R, meta, {
      biome: 'rocky', trees: ['pine', 'dead_tree'],
      signTexts: ['북쪽: 20번 도전자의 길 · 승리 산길', '남쪽: 빛누리 시티 북쪽 개선 관문'],
    });
    return true;
  }

  if (n.id === 'route21b' || n.id === 'route24b') {
    // 해안 대교: route21b(등대곶 해안 석조가도) / route24b(동해안 목재 잔교 대교)
    const isCape = n.id === 'route21b';
    const rx0 = Math.floor(W / 2) - 2, rx1 = rx0 + 3;
    carveRiver(m, 2, 15, W - 3, 32);
    if (isCape) {
      addBoulevard(m, rx0, 0, rx1, 10, 'ns', { sidewalk: true, lamps: true });
      m.placeGatehouse(rx0 + 2, 6, 6, 'ns', 'gatehouse');
    } else {
      carveRect(m, rx0, 0, rx1, 11, D);
    }
    carveRect(m, rx0, 37, rx1, H - 1, D);
    m.elevBridge(rx0, 11, rx1, 37, 'ns', {
      h: isCape ? 2.0 : 1.8, rampLen: 4, style: isCape ? 'stone' : 'timber', surfaceChar: isCape ? 'p' : 'd', roadTile: S,
    });
    addTallGrass(m, 4, 34, rx0 - 3, 44, R, 0.68);
    addTallGrass(m, rx1 + 3, 34, W - 5, 44, R, 0.68);
    addTallGrass(m, 4, 4, rx0 - 3, 12, R, 0.65);
    connectWarps(m, exits, rx0, 0, 4, S);
    populateSafely(m, R, meta, {
      biome: isCape ? 'meadow' : 'beach', trees: isCape ? ['oak', 'pine'] : ['palm', 'oak'],
      signTexts: isCape ? ['북쪽: 등대곶 해안 대교 · 파도 전망구간'] : ['동쪽 해안 24번 도로 — 바다 위 해안 잔교'],
    });
    return true;
  }

  if (n.id === 'route10b') {
    // 안개 갈대습지 목재 잔교 (Mist Marsh Timber Boardwalk): 44x48
    const rx0 = 20, rx1 = 23;
    carveRiver(m, 4, 14, W - 5, 33);
    // 중간 습지 섬 2곳 (남쪽 해안에서 낮은 나무 다리로 안전하게 왕래 가능)
    carveRect(m, 9, 20, 17, 27, G);
    carveRect(m, 26, 19, 34, 27, G);
    for (let y = 27; y <= 35; y++) {
      for (const bx of [12, 13]) { m.setBridge(bx, y, ROW.DIRT, 5); m.blocked[y][bx] = false; }
      for (const bx of [29, 30]) { m.setBridge(bx, y, ROW.DIRT, 5); m.blocked[y][bx] = false; }
    }
    m.paintSurface(12, 27, 13, 35, 'd');
    m.paintSurface(29, 27, 30, 35, 'd');
    carveRect(m, rx0, 0, rx1, 11, D);
    carveRect(m, rx0, 36, rx1, H - 1, D);
    m.elevBridge(rx0, 11, rx1, 36, 'ns', { h: 1.2, rampLen: 3, style: 'timber', surfaceChar: 'd', roadTile: S });
    addTallGrass(m, 10, 21, 16, 25, R, 0.72);
    addTallGrass(m, 27, 20, 33, 25, R, 0.72);
    addTallGrass(m, 5, 35, 18, 44, R, 0.74);
    addTallGrass(m, 25, 3, 38, 12, R, 0.74);
    connectWarps(m, exits, rx0, 0, 4, D);
    populateSafely(m, R, meta, {
      biome: 'swamp', trees: ['dead_tree', 'pine'],
      signTexts: ['북쪽: 안개 마을 — 갈대 습지 목재 잔교', '습지 수풀 속 포켓몬에 주의하세요'],
    });
    return true;
  }

  if (n.id === 'route13b' || n.id === 'route19b') {
    // 13번 협곡 다리 / 19번 얼음 강변 고가 석조교 (동서 48xH 또는 남북)
    const horiz = W > H;
    const isSnow = n.id === 'route19b';
    if (horiz) {
      const ry0 = Math.floor(H / 2) - 2, ry1 = ry0 + 3;
      carveRiver(m, 14, 3, 33, H - 4);
      carveRect(m, 2, ry0, 10, ry1, D);
      carveRect(m, 37, ry0, W - 3, ry1, D);
      m.elevBridge(10, ry0, 37, ry1, 'ew', { h: 2.0, rampLen: 4, style: 'stone', surfaceChar: 'p', roadTile: S });
      addTallGrass(m, 3, 6, 12, ry0 - 3, R, 0.72);
      addTallGrass(m, 3, ry1 + 3, 12, H - 6, R, 0.72);
      addTallGrass(m, 35, 6, W - 5, ry0 - 3, R, 0.72);
      addTallGrass(m, 35, ry1 + 3, W - 5, H - 6, R, 0.72);
      connectWarps(m, exits, 0, ry0, 4, D);
    } else {
      const rx0 = Math.floor(W / 2) - 2, rx1 = rx0 + 3;
      carveRiver(m, 3, 15, W - 4, 32);
      carveRect(m, rx0, 2, rx1, 11, D);
      carveRect(m, rx0, 36, rx1, H - 3, D);
      m.elevBridge(rx0, 11, rx1, 36, 'ns', { h: 2.0, rampLen: 4, style: 'stone', surfaceChar: 'p', roadTile: S });
      addTallGrass(m, 4, 4, rx0 - 3, 13, R, 0.7);
      addTallGrass(m, rx1 + 3, 34, W - 5, H - 5, R, 0.7);
      connectWarps(m, exits, rx0, 0, 4, D);
    }
    populateSafely(m, R, meta, {
      biome: isSnow ? 'snow' : 'rocky',
      trees: isSnow ? ['pine_snow', 'pine'] : ['pine', 'dead_tree'],
      signTexts: [isSnow ? '19번 얼음 강변 — 설원 협곡 석조 고가교' : '13번 구름고개 — 산악 협곡 아치교'],
    });
    return true;
  }

  return false;
}
