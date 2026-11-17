#!/usr/bin/env node
// 길 검수: 맵마다 '이상한 길'을 찾아 표로 보여 줌
//   · 끊긴 길 조각: 출구 · 문 어디에도 이어지지 않는 길 덩어리
//   · 막힌 길: 길 칸 위에 물건이 놓여 지나갈 수 없음
//   · 못 가는 출구 · 문: 시작 지점에서 걸어서 닿지 않음 (비전 기술 장애물은 치운 것으로 봄)
//   실행: node tools/map/check-paths.mjs [맵id]
import { readFileSync } from 'node:fs';
const DIR = new URL('../../client/public/assets/maps/', import.meta.url);
const region = JSON.parse(readFileSync(new URL('../../shared/data/region.json', import.meta.url), 'utf8'));
const only = process.argv[2];
const SKILL = new Set(['vine', 'crack_rock', 'climb_wall']), PASS = new Set(['tuft', 'tallgrass', 'stairs_up', 'portal', 'cave_hole', 'ice_tile', 'arrow_pad', 'warp_pad', 'switch_btn']);

function runGimmickBfs(W, H, col, objs, startX, startY) {
  const P = (o, k) => o.properties?.find((p) => p.name === k)?.value;
  const objAt = new Map();
  const ice = new Uint8Array(W * H);
  const warps = new Map();
  const arrows = new Map();
  const switches = new Map();
  const gates = new Map();
  for (const o of objs) {
    const cx = P(o, 'cellX'), cy = P(o, 'cellY'), w = P(o, 'cellW') ?? 1, h = P(o, 'cellH') ?? 1;
    if (cx == null) continue;
    for (let y = cy - h + 1; y <= cy; y++) for (let x = cx; x < cx + w; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const idx = y * W + x;
      if (o.type === 'ice_tile') ice[idx] = 1;
      else if (o.type === 'warp_pad') warps.set(idx, [Number(P(o, 'toX') ?? x), Number(P(o, 'toY') ?? y)]);
      else if (o.type === 'arrow_pad') arrows.set(idx, [P(o, 'dir') ?? 'up', Number(P(o, 'steps') ?? 3)]);
      else if (o.type === 'switch_btn') switches.set(idx, String(P(o, 'gateId') ?? ''));
      else if (o.type === 'gate_bar') {
        const gid = String(P(o, 'gateId') ?? '');
        if (!gates.has(gid)) gates.set(gid, []);
        gates.get(gid).push([x, y]);
      }
      if (!PASS.has(o.type)) objAt.set(idx, o);
    }
  }
  const openGates = new Set();
  const blocked = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    const i = y * W + x;
    if (!col[i]) return false;
    const o = objAt.get(i);
    if (!o) return true;
    if (o.type === 'gate_bar') return !openGates.has(String(P(o, 'gateId') ?? ''));
    return !(SKILL.has(o.type) || PASS.has(o.type));
  };

  const seen = new Uint8Array(W * H), q = [];
  const push = (x, y) => { if (blocked(x, y) || seen[y * W + x]) return; seen[y * W + x] = 1; q.push([x, y]); };
  push(startX, startY);

  while (q.length) {
    const [x, y] = q.pop();
    const idx = y * W + x;
    if (warps.has(idx)) { const [tx, ty] = warps.get(idx); push(tx, ty); }
    if (switches.has(idx)) {
      const gid = switches.get(idx);
      if (!openGates.has(gid)) {
        openGates.add(gid);
        for (const [gx, gy] of gates.get(gid) ?? []) push(gx, gy);
      }
    }
    if (arrows.has(idx)) {
      const [dir, steps] = arrows.get(idx);
      const [dx, dy] = dir === 'right' ? [1, 0] : dir === 'down' ? [0, 1] : dir === 'left' ? [-1, 0] : [0, -1];
      let cx = x, cy = y;
      for (let s = 0; s < steps; s++) {
        if (blocked(cx + dx, cy + dy)) break;
        cx += dx; cy += dy; push(cx, cy);
      }
      continue;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (blocked(nx, ny)) continue;
      if (ice[ny * W + nx]) {
        // 빙판 미끄럼 시뮬레이션: 벽이나 일반 바닥까지 직선 미끄럼
        let ix = nx, iy = ny;
        while (ice[iy * W + ix] && !blocked(ix + dx, iy + dy)) {
          seen[iy * W + ix] = 1;
          ix += dx; iy += dy;
        }
        push(ix, iy);
      } else {
        push(nx, ny);
      }
    }
  }
  return { seen, P, objAt };
}

const rows = [];
for (const id of region.ids) {
  if (only && id !== only) continue;
  const isInt = region.interior.includes(id);
  const m = JSON.parse(readFileSync(new URL(`${id}.json`, DIR), 'utf8')), W = m.width, H = m.height;
  const L = (n) => m.layers.find((l) => l.name === n);
  const terr = String(m.properties.find((p) => p.name === 'terrain').value).split('|');
  const col = L('Collision').data.map((g) => !!g), cliff = L('Cliff')?.data ?? [];
  const sp = L('Spawns').objects;
  const start = isInt ? (sp.find((s) => s.name === 'entry') ?? sp[0]) : (sp.find((s) => s.name === 'player') ?? sp[0]);
  const { seen, P, objAt } = runGimmickBfs(W, H, col, L('Objects').objects, Math.floor(start.x / 16), Math.floor(start.y / 16));
  const near = (x0, y0, x1, y1) => { for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H && seen[y * W + x]) return true; return false; };

  if (isInt) {
    const badTrainers = sp.filter((s) => s.name.startsWith('trainer:') && !near(Math.floor(s.x / 16), Math.floor(s.y / 16), Math.floor(s.x / 16), Math.floor(s.y / 16))).map((s) => s.name);
    if (badTrainers.length) rows.push({ id, name: region.maps[id]?.name ?? id, badWarps: badTrainers, badDoors: [], stray: [], onPath: 0, where: [], unreachPath: 0, lostLoot: [], score: badTrainers.length * 10 });
    continue;
  }

  const isPath = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (terr[y][x] === '1' || terr[y][x] === '3');
  const cave = m.properties.some((p) => p.name === 'cave');
  const badWarps = L('Warps').objects.filter((w) => !near(w.x / 16, w.y / 16, (w.x + w.width) / 16 - 1, (w.y + w.height) / 16 - 1)).map((w) => P(w, 'to'));
  const doors = L('Objects').objects.filter((o) => P(o, 'doorCellX') != null && !P(o, 'blockout') || ['center', 'gym', 'inn', 'shop_w', 'store'].includes(o.type));
  const badDoors = doors.filter((o) => { const dx = P(o, 'doorCellX') ?? P(o, 'cellX'), cy = P(o, 'cellY'); return !seen[(cy + 1) * W + dx]; }).map((o) => o.type);
  // 길 덩어리
  const comp = new Int32Array(W * H).fill(-1), comps = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isPath(x, y) || comp[y * W + x] >= 0) continue;
    const c = { n: 0, edge: false, door: false, x, y, walk: 0 }, st = [[x, y]]; comp[y * W + x] = comps.length;
    while (st.length) { const [a, b] = st.pop(); c.n++; if (a === 0 || b === 0 || a === W - 1 || b === H - 1) c.edge = true; if (seen[b * W + a]) c.walk++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = a + dx, ny = b + dy; if (isPath(nx, ny) && comp[ny * W + nx] < 0) { comp[ny * W + nx] = comps.length; st.push([nx, ny]); } } }
    comps.push(c);
  }
  for (const o of L('Objects').objects) { const dx = P(o, 'doorCellX'); if (dx == null) continue; const cy = P(o, 'cellY'); for (let d = 1; d <= 3; d++) { const k = comp[(cy + d) * W + dx]; if (k >= 0) { comps[k].door = true; break; } } }
  for (const w of L('Warps').objects) for (let y = w.y / 16 - 1; y <= (w.y + w.height) / 16; y++) for (let x = w.x / 16 - 1; x <= (w.x + w.width) / 16; x++) { const k = x >= 0 && y >= 0 && x < W && y < H ? comp[y * W + x] : -1; if (k >= 0) comps[k].edge = true; }
  const main = Math.max(0, ...comps.map((c) => c.n));
  const stray = cave ? [] : comps.filter((c) => c.n < main && !c.edge && !c.door && c.n >= 2);
  // 길 위에 놓인 물건 (계단 · 절벽 줄 제외)
  let onPath = 0; const where = [];
  if (!cave) for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (!isPath(x, y) || !col[i] || cliff[i]) continue; const o = objAt.get(i); if (!o || SKILL.has(o.type) || PASS.has(o.type) || (P(o, 'cellW') ?? 1) * (P(o, 'cellH') ?? 1) >= 4 || P(o, 'interact') || o.type === 'spire') continue; onPath++; if (where.length < 4) where.push(`${o.type}@${x},${y}`); }
  const lostLoot = L('Objects').objects.filter((o) => P(o, 'interact') === 'loot' && !near(P(o, 'cellX'), P(o, 'cellY'), P(o, 'cellX'), P(o, 'cellY'))).map((o) => `${o.type}@${P(o, 'cellX')},${P(o, 'cellY')}`);
  const unreachPath = cave ? 0 : comps.filter((c) => c.n >= 6 && c.walk === 0).length;
  const score = lostLoot.length * 5 + badWarps.length * 10 + badDoors.length * 6 + stray.length * 2 + onPath + unreachPath * 4;
  if (score) rows.push({ id, name: region.maps[id]?.name ?? id, badWarps, badDoors, stray: stray.map((c) => `${c.n}칸@${c.x},${c.y}`), onPath, where, unreachPath, lostLoot, score });
}
rows.sort((a, b) => b.score - a.score);
console.log('| 맵 | 못 가는 출구 | 못 가는 문 | 끊긴 길 조각 | 길 위 물건 | 닿지 않는 길 | 닿지 않는 보물 |\n|---|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.name} (${r.id}) | ${r.badWarps.join(' ') || '-'} | ${r.badDoors.join(' ') || '-'} | ${r.stray.slice(0, 5).join(' ') || '-'}${r.stray.length > 5 ? ` 외 ${r.stray.length - 5}` : ''} | ${r.onPath ? `${r.onPath} (${r.where.join(' ')})` : '-'} | ${r.unreachPath || '-'} | ${r.lostLoot.join(' ') || '-'} |`);
console.log(`\n문제 있는 맵 ${rows.length}곳`);
