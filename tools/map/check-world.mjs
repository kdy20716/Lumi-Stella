// 월드 연결 검사: node tools/map/check-world.mjs [--md 파일]
//  region.json + 실제 맵 파일(Warps · Objects)을 읽어서
//  1) 모든 마을에 센터 · 상점 · 체육관이 있는지  2) 막다른 맵 · 고립된 맵  3) 마을 사이 길 수  4) 한쪽 방향 출구 · 없는 도착 지점
//  5) 마을 규모(크기 · 건물 수)  를 표로 출력. 파일은 아무것도 바꾸지 않음
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DISTRICTS, districtKey, CITY_FACILITY } from './style-kit.mjs';
import { ROW, TILESET_COLS } from '../art/tiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAPS = join(ROOT, 'client/public/assets/maps');
const region = JSON.parse(readFileSync(join(ROOT, 'shared/data/region.json'), 'utf8'));
const INTERIOR_OF = { house: 'home', store: 'in_store', cafe: 'in_cafe', hall: 'in_lab', smithy: 'in_smithy', house_a: 'in_house_a', house_b: 'in_house_b', house_c: 'in_house_c', center: 'in_center', shop_w: 'in_shop_w', gym: 'in_gym', windmill: 'in_windmill' };
const BUILDINGS = new Set(Object.keys(INTERIOR_OF).concat(['inn', 'tower', 'dept', 'apart', 'factory']));   // tower · dept · apart = 그림 없는 블록아웃 건물

const meta = region.maps;
const name = (id) => meta[id]?.name ?? id;
const kind = (id) => meta[id]?.kind ?? '?';
const isOutdoor = (id) => !meta[id]?.interior && kind(id) !== 'room';
const prop = (o, k) => o.properties?.find((p) => p.name === k)?.value;

// ── 맵 읽기 ──
const maps = {};
const files = readdirSync(MAPS).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
for (const id of files) {
  const raw = JSON.parse(readFileSync(join(MAPS, `${id}.json`), 'utf8'));
  const layer = (n) => raw.layers.find((l) => l.name === n);
  const warps = (layer('Warps')?.objects ?? []).map((w) => ({ to: prop(w, 'to'), spawn: prop(w, 'spawn'), ferry: String(prop(w, 'ferry') ?? '') === '1' }));
  const spawns = new Set((layer('Spawns')?.objects ?? []).map((s) => s.name));
  const objs = layer('Objects')?.objects ?? [];
  const blds = objs.filter((o) => BUILDINGS.has(o.type));
  const doors = blds.map((o) => ({ type: o.type, to: prop(o, 'interior') ?? INTERIOR_OF[o.type], interact: prop(o, 'interact') ?? '' })).filter((d) => d.to);
  // 물 칸 (바닥 타일 중 물이 낀 칸) · 풀밭 비율 (도시 바닥 무늬가 있으면 그걸로)
  const ground = layer('Ground')?.data ?? [];
  // 가장자리에 닿은 물(바다)은 빼고, 안쪽에 고인 물(호수 · 연못 · 분수)만 셈
  const W0 = raw.width, H0 = raw.height, isW = ground.map((g) => !!g && Math.floor((g - 1) / TILESET_COLS) === ROW.GRASS_WATER);
  const sea = new Uint8Array(isW.length), qs = [];
  for (let i = 0; i < isW.length; i++) { const x = i % W0, y = Math.floor(i / W0); if (isW[i] && (x === 0 || y === 0 || x === W0 - 1 || y === H0 - 1)) { sea[i] = 1; qs.push(i); } }
  while (qs.length) { const i = qs.pop(), x = i % W0; for (const j of [i - 1, i + 1, i - W0, i + W0]) if (j >= 0 && j < isW.length && !sea[j] && isW[j] && Math.abs((j % W0) - x) <= 1) { sea[j] = 1; qs.push(j); } }
  const water = isW.filter((w, i) => w && !sea[i]).length;
  const surf = String(raw.properties?.find((p) => p.name === 'surface')?.value ?? '');
  const grass = surf ? (surf.match(/g/g)?.length ?? 0) / surf.replace(/\|/g, '').length : null;
  maps[id] = { id, w: raw.width, h: raw.height, warps, spawns, blds, doors, objs, water, grass };
}

// ── 연결 그래프 (워프 + 건물 문) ──
const edges = {};   // id → Map(to → 종류)
const addE = (a, b, t) => { (edges[a] ??= new Map()).set(b, edges[a].get(b) ?? t); };
for (const m of Object.values(maps)) {
  for (const w of m.warps) if (w.to && w.to !== '@exit') addE(m.id, w.to, w.ferry ? '배' : '길');
  for (const d of m.doors) { addE(m.id, d.to, '문'); addE(d.to, m.id, '문'); }
}
const problems = { missingMap: [], missingSpawn: [], oneWay: [] };
for (const m of Object.values(maps)) for (const w of m.warps) {
  if (!w.to || w.to === '@exit') continue;
  if (!maps[w.to]) { problems.missingMap.push(`${m.id} → ${w.to}`); continue; }
  if (w.spawn && !maps[w.to].spawns.has(w.spawn)) problems.missingSpawn.push(`${m.id} → ${w.to} (도착 지점 '${w.spawn}' 없음)`);
  if (isOutdoor(w.to) && !maps[w.to].warps.some((x) => x.to === m.id)) problems.oneWay.push(`${m.id} → ${w.to}`);
}

// ── 도달 가능 (별빛 마을에서 출발) ──
const reach = new Set(['town']); const q = ['town'];
while (q.length) { const a = q.shift(); for (const b of edges[a]?.keys() ?? []) if (!reach.has(b)) { reach.add(b); q.push(b); } }
const inRegion = new Set(region.ids);
const isolated = region.ids.filter((id) => !reach.has(id));
const orphanFiles = files.filter((f) => !inRegion.has(f));
const missingFiles = region.ids.filter((id) => !maps[id]);

// ── 막다른 맵: 바깥 이웃이 하나뿐인 바깥 맵 ──
const outNbrs = (id) => [...new Set([...(edges[id]?.keys() ?? [])].filter((b) => isOutdoor(b) && b !== id))];
const deadEnds = region.ids.filter((id) => isOutdoor(id) && maps[id] && outNbrs(id).length <= 1)
  .map((id) => ({ id, kind: kind(id), to: outNbrs(id)[0] ?? '-' }));

// ── 마을 시설 ──
const towns = region.ids.filter((id) => kind(id) === 'town');
const facility = towns.map((id) => {
  const m = maps[id]; const types = m.blds.map((b) => b.type);
  const center = types.includes('center') || (id === 'town' && false);
  const shop = types.some((t) => t === 'store' || t === 'shop_w');
  const gym = types.includes('gym');
  const gymTo = m.doors.find((d) => d.type === 'gym')?.to ?? '';
  return { id, center, shop, gym, gymTo, nBld: m.blds.length, size: `${m.w}×${m.h}`, area: m.w * m.h, exits: outNbrs(id).length, tier: meta[id].tier };
});

// ── 마을 사이 길 수: 도로 맵만 지나서 갈 수 있는 서로 다른 길 ──
const isRouteLike = (id) => ['route', 'cave', 'area'].includes(kind(id));
const pairs = new Map();
for (const t of towns) {
  for (const first of outNbrs(t)) {
    if (kind(first) === 'town') { const k = [t, first].sort().join('|'); pairs.set(k, (pairs.get(k) ?? new Set()).add(`직접`)); continue; }
    if (!isRouteLike(first)) continue;
    // first 에서 출발해 마을을 만날 때까지 (도로 · 동굴 · 구역만 지나서)
    const seen = new Set([t, first]); const qq = [first];
    while (qq.length) {
      const a = qq.shift();
      for (const b of outNbrs(a)) {
        if (seen.has(b)) continue; seen.add(b);
        if (kind(b) === 'town') { if (b !== t) { const k = [t, b].sort().join('|'); pairs.set(k, (pairs.get(k) ?? new Set()).add(first)); } continue; }
        if (isRouteLike(b)) qq.push(b);
      }
    }
  }
}
// 같은 길을 양쪽에서 세지 않게: 마을 쌍마다 "그 마을에서 나가는 서로 다른 출구 수" 중 작은 쪽
const pairRows = [...pairs.entries()].map(([k, s]) => {
  const [a, b] = k.split('|');
  const fromA = [...s].filter((x) => outNbrs(a).includes(x) || x === '직접').length;
  const fromB = [...s].filter((x) => outNbrs(b).includes(x) || x === '직접').length;
  return { a, b, n: Math.max(1, Math.min(fromA || 1, fromB || 1)) };
}).sort((p, q2) => meta[p.a].tier - meta[q2.a].tier);

// ── 도로 규모 ──
const routes = region.ids.filter((id) => kind(id) === 'route');
const routeNums = new Set(routes.map((r) => r.match(/^route(\d+)/)[1]));
const avg = (a) => Math.round(a.reduce((s, x) => s + x, 0) / a.length);

// ── 출력 ──
const out = [];
const p = (s = '') => out.push(s);
const yes = (b) => (b ? 'O' : '**X**');
p('# 루미나 지방 연결 검사 결과');
p();
p(`맵 ${region.ids.length}개 (마을 ${towns.length} · 도로 구간 ${routes.length} (도로 ${routeNums.size}개) · 동굴 ${region.ids.filter((i) => kind(i) === 'cave').length} · 구역 ${region.ids.filter((i) => kind(i) === 'area').length} · 실내 ${region.ids.filter((i) => kind(i) === 'room').length})`);
p();
p('## 1. 마을 시설 (센터 · 상점 · 체육관)');
p();
p('| 마을 | 단계 | 크기(칸) | 건물 수 | 출구 수 | 센터 | 상점 | 체육관 |');
p('|---|---|---|---|---|---|---|---|');
for (const f of facility) p(`| ${name(f.id)} (${f.id}) | ${f.tier} | ${f.size} | ${f.nBld} | ${f.exits} | ${yes(f.center)} | ${yes(f.shop)} | ${f.gym ? `O (${f.gymTo})` : '-'} |`);
p();
p(`센터 없는 마을: ${facility.filter((f) => !f.center).map((f) => name(f.id)).join(', ') || '없음'}`);
p(`상점 없는 마을: ${facility.filter((f) => !f.shop).map((f) => name(f.id)).join(', ') || '없음'}`);
p(`체육관 있는 마을: ${facility.filter((f) => f.gym).length}곳 (${facility.filter((f) => f.gym).map((f) => name(f.id)).join(', ')})`);
p();
p('## 2. 고립된 맵 · 막다른 맵');
p();
p(`별빛 마을에서 갈 수 없는 맵: ${isolated.length ? isolated.map((i) => `${name(i)}(${i})`).join(', ') : '없음'}`);
p(`region.json 에 없는 맵 파일: ${orphanFiles.join(', ') || '없음'}`);
p(`region.json 에는 있는데 파일이 없는 맵: ${missingFiles.join(', ') || '없음'}`);
p();
p('| 막다른 맵 | 종류 | 유일한 이웃 | 판정 |');
p('|---|---|---|---|');
for (const d of deadEnds) {
  const ok = ['cave', 'area', 'farm'].includes(d.kind);
  p(`| ${name(d.id)} (${d.id}) | ${d.kind} | ${name(d.to)} | ${ok ? '정상 (끝 지점)' : '**확인 필요**'} |`);
}
p();
p('## 3. 마을 사이 길 수');
p();
p('| 마을 A | 마을 B | 서로 다른 길 |');
p('|---|---|---|');
for (const r of pairRows) p(`| ${name(r.a)} | ${name(r.b)} | ${r.n === 1 ? '1 (한 길뿐)' : r.n} |`);
p();
p(`마을 쌍 ${pairRows.length}개 중 길이 하나뿐인 곳: ${pairRows.filter((r) => r.n === 1).length}개`);
p(`출구가 2개 이하인 마을: ${facility.filter((f) => f.exits <= 2).map((f) => `${name(f.id)}(${f.exits})`).join(', ')}`);
p();
p('## 4. 출구 오류');
p();
p(`없는 맵으로 가는 출구: ${problems.missingMap.join(', ') || '없음'}`);
p(`도착 지점이 없는 출구: ${problems.missingSpawn.length}개${problems.missingSpawn.length ? `\n  - ${problems.missingSpawn.slice(0, 20).join('\n  - ')}` : ''}`);
p(`돌아오는 길이 없는 출구: ${problems.oneWay.length}개${problems.oneWay.length ? `\n  - ${problems.oneWay.slice(0, 20).join('\n  - ')}` : ''}`);
p();
p('## 5. 규모');
p();
const tArea = facility.map((f) => f.area), rArea = routes.map((r) => maps[r].w * maps[r].h);
p(`마을 평균 크기 ${avg(tArea)}칸² (가장 큰 곳 ${name(facility.reduce((a, b) => (a.area > b.area ? a : b)).id)})`);
p(`도로 구간 평균 크기 ${avg(rArea)}칸² · 도로 하나당 평균 ${(routes.length / routeNums.size).toFixed(1)}구간`);
const cities = facility.filter((f) => meta[f.id].biome === 'city' || ['forge'].includes(f.id));
p(`도시(빛누리 · 왕관 · 쇳불) 건물 수: ${cities.map((f) => `${name(f.id)} ${f.nBld}채`).join(', ')}`);


// ── 6. 동네 스타일 (style-kit.mjs) ──
p();
p('## 6. 동네 스타일 (섞이면 안 되는 것)');
p();
p('| 마을 | 동네 | 어긋난 물건 | 시설 모양 | 안쪽 물 칸 | 풀밭 | 판정 |');
p('|---|---|---|---|---|---|---|');
const styleBad = [];
for (const id of towns) {
  const m = maps[id], dk = districtKey(id), kit = DISTRICTS[dk];
  const bad = {};
  for (const o of m.objs) if (kit.deny.includes(o.type)) bad[o.type] = (bad[o.type] ?? 0) + 1;
  const facs = m.objs.filter((o) => CITY_FACILITY[o.type]);
  const cityShaped = facs.filter((o) => String(prop(o, 'blockout') ?? '') === '1').length;
  const facOk = kit.facility === 'city' ? cityShaped === facs.length : cityShaped === 0;
  const waterOk = m.water <= kit.water * 2;   // 물 칸은 모서리 타일까지 세므로 2배 여유
  const grassOk = m.grass === null ? kit.grass >= 1 : m.grass <= kit.grass;
  const badTxt = Object.entries(bad).map(([t, n]) => `${t} ${n}`).join(', ');
  const ok = !badTxt && facOk && waterOk && grassOk;
  if (!ok) styleBad.push(name(id));
  p(`| ${name(id)} | ${kit.name} | ${badTxt || '-'} | ${facs.length ? (facOk ? (kit.facility === 'city' ? '도시형' : '마을형') : '**섞임**') : '-'} | ${waterOk ? m.water : `**${m.water}**`} | ${m.grass === null ? '-' : `${grassOk ? '' : '**'}${Math.round(m.grass * 100)}%${grassOk ? '' : '**'}`} | ${ok ? 'O' : '**고칠 것**'} |`);
}
p();
p(`스타일이 어긋난 마을: ${styleBad.length ? styleBad.join(', ') : '없음'}`);
// 주민: 한 외형은 한 마을에서만
const npcAt = {};
for (const n of Object.values(region.npcs ?? {})) { const mp = n.schedule?.[0]?.map; if (mp && kind(mp) === 'town') (npcAt[n.sprite] ??= new Set()).add(mp); }
const shared = Object.entries(npcAt).filter(([, s]) => s.size > 1);
p(`여러 마을에 같은 얼굴로 나오는 주민: ${shared.length ? shared.map(([sp, s]) => `${sp}(${[...s].map(name).join(' · ')})`).join(', ') : '없음'}`);

const text = out.join('\n');
console.log(text);
const mdAt = process.argv.indexOf('--md');
if (mdAt > 0 && process.argv[mdAt + 1]) writeFileSync(process.argv[mdAt + 1], text + '\n');
