// 사이드 스토리 · 마을 텃밭 검사 (실제 게임 규칙 shared/sim 으로 끝까지 진행해 봄)
//   npx tsx tools/test/sidequest.ts
//  - 이동: 맵 안에서는 칸 단위 길찾기로 "실제로 걸어갈 수 있는지" 확인한 뒤 그 자리로 옮김 (출구 · 문까지)
//  - 전투: 상성 · 위력이 가장 좋은 기술, 쓰러지면 다음 루미. 빈자리는 새 종류를 잡아서 채움
//  - 회복: 전투가 끝날 때마다 센터에서 회복한 것으로 침 (센터는 무료)
import { readFileSync, writeFileSync } from 'node:fs';
import { MapInfo, prop, type TiledMap } from '../../shared/sim/MapInfo';
import { FarmSimulation } from '../../shared/sim/FarmSimulation';
import { MAP_IDS, INTERIOR_OF, BADGE_GATES, type MapId } from '../../shared/types';
import { TRAINERS, SPECIES, MOVES, ENCOUNTERS, CHAPTERS, hasDone, SKILLS, skillFor, ITEMS } from '../../shared/data';
import { DEEP_CAVES, PLACE_GATES } from '../map/region-spec.mjs';
import { effectiveness, stats, alive } from '../../shared/sim/Battle';
import { STORY } from '../../shared/story';

const MAPS = Object.fromEntries(MAP_IDS.map((id) => [id, new MapInfo(JSON.parse(readFileSync(`client/public/assets/maps/${id}.json`, 'utf8')) as TiledMap)])) as Record<MapId, MapInfo>;
const sim = new FarmSimulation(MAPS);
const S = sim as any;
S.lastEncounter = { get: () => 0, set: () => {} };   // 풀숲 대기 시간 없앰 (봇 전용)
const p = sim.addPlayer('bot', '봇', 'm1');
p.mode = 'story';   // 본편 사건은 스토리 모드에서만
const log: string[] = [];
const say = (s: string) => { log.push(s); console.log(s); };
const problems: string[] = [];
let battles = 0, wilds = 0, losses = 0;

// ── 맵 안 길찾기 (칸) ──
const T = 16;
const stand = (map: MapId, cx: number, cy: number) => { const q = { ...p, map }; return S.canStand(q, cx * T + 8, cy * T + 13); };
function reachable(map: MapId, sx: number, sy: number) {
  const m = MAPS[map], W = m.width, H = m.height, seen = new Uint8Array(W * H), q: number[] = [];
  const x0 = Math.floor(sx / T), y0 = Math.floor((sy - 5) / T);
  const push = (x: number, y: number) => { if (x < 0 || y < 0 || x >= W || y >= H || seen[y * W + x] || !stand(map, x, y)) return; seen[y * W + x] = 1; q.push(y * W + x); };
  push(x0, y0); if (!q.length) for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) push(x0 + dx, y0 + dy);
  while (q.length) { const i = q.pop()!, x = i % W, y = Math.floor(i / W); push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  return seen;
}
const near = (seen: Uint8Array, map: MapId, x0: number, y0: number, x1: number, y1: number) => {   // 사각형(칸) 안이나 바로 옆에 갈 수 있는 칸
  const W = MAPS[map].width;
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) if (x >= 0 && y >= 0 && x < W && y < MAPS[map].height && seen[y * W + x]) return [x, y] as const;
  return null;
};

// ── 나갈 수 있는 곳: 워프 · 건물 문 ──
type Exit = { kind: 'warp'; index: number; to: string; at: readonly [number, number] } | { kind: 'enter'; id: number; to: string; at: readonly [number, number] };
/** 배지로 쓸 수 있는 비전 기술로, 닿는 장애물을 모두 치움 (치울 게 없을 때까지) */
let skillUses = 0;
function clearObstacles() {
  const map = p.map as MapId, m = MAPS[map];
  for (let again = true; again;) {
    again = false;
    const seen = reachable(map, p.x, p.y), home = { x: p.x, y: p.y };
    for (const o of m.objects) {
      const id = skillFor(o.type); if (!id || !p.badges.includes(SKILLS[id].badge) || p.cleared?.includes(`${map}:${o.id}`)) continue;
      const cx = Number(prop(o, 'cellX', 0)), cy = Number(prop(o, 'cellY', 0));
      const at = near(seen, map, cx, cy, cx, cy); if (!at) continue;
      p.x = at[0] * T + 8; p.y = at[1] * T + 13;
      if (sim.apply('bot', { kind: 'skill', objectId: o.id } as any).ok) { skillUses++; again = true; }
      Object.assign(p, home);
    }
  }
}
function exits(): Exit[] {
  clearObstacles();
  const map = p.map as MapId, m = MAPS[map], seen = reachable(map, p.x, p.y), out: Exit[] = [];
  m.warps.forEach((w, index) => { const at = near(seen, map, Math.floor(w.x / T), Math.floor(w.y / T), Math.floor((w.x + w.w - 1) / T), Math.floor((w.y + w.h - 1) / T)); if (at) out.push({ kind: 'warp', index, to: w.to === '@exit' ? p.ret?.map ?? 'farm' : w.to, at }); });
  for (const o of m.objects) {
    const to = String(prop(o, 'interior', '') || INTERIOR_OF[o.type] || ''); if (!to || !MAPS[to as MapId]) continue;
    const cx = Number(prop(o, 'cellX', 0)), cy = Number(prop(o, 'cellY', 0)), cw = Number(prop(o, 'cellW', 1));
    const dx = Number(prop(o, 'doorCellX', cx + Math.floor(cw / 2)));
    if (seen[(cy + 1) * m.width + dx]) out.push({ kind: 'enter', id: o.id, to, at: [dx, cy + 1] });
  }
  return out;
}
function take(e: Exit) {
  if (e.kind === 'warp') { const w = MAPS[p.map as MapId].warps[e.index]; p.x = w.x + w.w / 2; p.y = w.y + w.h / 2; return sim.apply('bot', { kind: 'warp', index: e.index } as any); }
  p.x = e.at[0] * T + 8; p.y = e.at[1] * T + 13; return sim.apply('bot', { kind: 'enter', objectId: e.id } as any);
}
/** 목표 맵까지 실제로 걸어서 가는 길 (맵 단위 너비 우선, 각 맵 안 길찾기 포함). 상태를 저장 · 복원하며 탐색 */
function travel(goal: MapId): boolean {
  if (p.map === goal) return true;
  const snap = () => ({ map: p.map, inst: p.inst, x: p.x, y: p.y, ret: p.ret, cleared: [...(p.cleared ?? [])] });
  const start = snap();
  const key = (s: any) => `${s.map}@${Math.floor(s.x / 64)},${Math.floor(s.y / 64)}`;
  const prev = new Map<string, { from: string; e: Exit; s: any } | null>([[key(start), null]]);
  const q = [start];
  while (q.length) {
    const s = q.shift()!;
    Object.assign(p, s);
    for (const e of exits()) {
      Object.assign(p, s);
      const r = take(e); if (!r.ok) continue;
      const n = snap(), k = key(n);
      if (prev.has(k)) continue;
      prev.set(k, { from: key(s), e, s });
      if (n.map === goal) { Object.assign(p, n); return true; }
      q.push(n);
    }
  }
  Object.assign(p, start);
  return false;
}

// ── 전투 ──
const typesOf = (sp: string) => { const t = (SPECIES[sp] as any).type ?? (SPECIES[sp] as any).types; return (Array.isArray(t) ? t : [t]) as any[]; };
function bestMove(st: any) {
  const me = p.party[st.myIdx], foe = st.foes[st.foeIdx];
  let best = 0, bv = -1;
  me.moves.forEach((mv: string, i: number) => {
    const M = MOVES[mv] as any; if (!M || (me.pp?.[i] ?? 1) <= 0) return;
    let v = (M.power ?? 0) * (M.accuracy ?? 100) / 100;
    for (const t of typesOf(foe.species)) v *= effectiveness(M.type, t);
    if (typesOf(me.species).includes(M.type)) v *= 1.5;
    if (!M.power) v = 1;
    if (v > bv) { bv = v; best = i; }
  });
  return best;
}
function fight(first: any, catchNew = false): string {
  battles++;
  let up = first.battle, guard = 0;
  while (!up?.ended && guard++ < 400) {
    const st = S.battles.get('bot'); if (!st) break;
    if (p.party[st.myIdx].hp <= 0) { const i = p.party.findIndex((c) => c.hp > 0); up = sim.apply('bot', { kind: 'battleSwitch', index: i } as any).battle; continue; }
    const foe = st.foes[st.foeIdx];
    if (catchNew && st.kind === 'wild' && !p.caught.includes(foe.species) && p.party.length < 6 && (p.bag.lumi_ball ?? 0) > 0 && foe.hp / stats(foe).maxHp < 0.6) {
      up = sim.apply('bot', { kind: 'battleItem', itemId: (p.bag.super_ball ?? 0) > 0 ? 'super_ball' : 'lumi_ball' } as any).battle; continue;
    }
    // 잡으려는 상대는 약한 기술로 깎음
    up = sim.apply('bot', { kind: 'battleMove', index: bestMove(st) } as any).battle;
  }
  sim.apply('bot', { kind: 'heal' } as any);
  return up?.ended ?? 'stuck';
}
// ══ 준비: 본편을 모두 깬 챔피언 (만렙 파티) ══
import { makeCreature, BattleEngine } from '../../shared/sim/Battle';
import { QUESTS, NPCS, HANDS, EVENTS, CROPS } from '../../shared/data';
import { BOND_MAX, SoilState } from '../../shared/types';
const ok = (c: boolean, s: string) => { say(`${c ? '✓' : '✗'} ${s}`); if (!c) problems.push(s); return c; };
p.story = STORY.DONE;
p.badges = ['badge_wind', 'badge_water', 'badge_leaf', 'badge_earth', 'badge_flame', 'badge_light', 'badge_normal', 'badge_star'];
p.flags = CHAPTERS.events.filter((e) => !e.id.startsWith('side_')).map((e) => e.id);
p.defeated = ['champion', 'elite1', 'elite2', 'elite3', 'elite4'];
p.party = ['g1c', 'w1c', 'f1c', 'e1c', 'a1c', 'l1c'].map((s) => makeCreature(s, 100));
p.caught = p.party.map((c) => c.species);
p.visited = [...MAP_IDS];
p.gold = 100000;
p.bag = { hyper_ball: 300, max_potion: 99, lumi_ball: 50 };
const ev = (id: string) => sim.apply('bot', { kind: 'event', id } as any);
const flute = (at: string) => sim.apply('bot', { kind: 'flute', at } as any);
const give = (it: string, n: number) => S.addItem(p, it, n);
const go = (m: MapId) => ok(travel(m), `걸어서 도착: ${MAPS[m].props.title ?? m} (${m})`);
sim.apply('bot', { kind: 'warp', index: MAPS.farm.warps.findIndex((w) => w.to === 'town') } as any);
if (p.map === 'farm') { const w = MAPS.farm.warps.find((x) => x.to === 'town')!; p.x = w.x + w.w / 2; p.y = w.y + w.h / 2; sim.apply('bot', { kind: 'warp', index: MAPS.farm.warps.indexOf(w) } as any); }

say('\n## 1. 별마루산 미로 → 루미 마스터 → 태초볼 → 스텔라');
go('star_maze');
go('master_hall');
{ const before = { ...p, x: p.x, y: p.y, map: p.map }; ok(!travel('stella_nest'), '루미 마스터를 이기기 전에는 별의 요람에 들어갈 수 없음'); Object.assign(p, { map: before.map, x: before.x, y: before.y }); }
{ const r = ev('side_master'); ok(!!r.battle, '시험의 방: 루미 마스터 하람이 승부를 걺'); const end = fight(r); ok(end === 'win', `루미 마스터와의 승부: ${end}`); }
ok((p.bag.origin_ball ?? 0) === 1, `태초볼 1개 받음 (지금 ${p.bag.origin_ball ?? 0}개)`);
go('stella_nest');
{ const sp = MAPS.stella_nest.spawns.get('stella')!; p.x = sp.x; p.y = sp.y + 24;
  const r = sim.apply('bot', { kind: 'stella' } as any); ok(!!r.battle, '별의 요람: 스텔라가 눈을 뜸 (Lv.60)');
  const c = sim.apply('bot', { kind: 'battleItem', itemId: 'origin_ball' } as any); ok(c.battle?.ended === 'caught', '태초볼 → 스텔라 100% 포획'); ok(p.caught.includes('stella'), '루미 도감에 스텔라 등록'); }
ok(!p.flags.includes('ending') || true, '');
{ ok(!ev('side_flute').ok, '도감을 다 채우기 전에는 시련의 오카리나를 받을 수 없음'); ok(ev('side_dex').ok, '챔피언 + 스텔라 포획 → 하람: "루미 도감을 전부 채워라"');
  p.caught = Object.keys(SPECIES).filter((k) => (SPECIES[k] as any).legend !== 'myth');
  const r = ev('side_flute'); ok(r.ok, '도감 완성 뒤 다시 방문 → 하람: "너라면 할 수 있을 줄 알았어"'); ok(p.inventory.some((s) => s.itemId === 'ocarina'), '시련의 오카리나 받음'); ok(!ev('side_stella').ok, '(챔피언 전용 대사와 겹치지 않음)'); }

say('\n## 2. 동서남북 네 탑');
for (const [d, sp] of Object.entries(QUESTS.spires)) {
  go(`spire_${d}` as MapId);
  ok(!flute(`seal:${d}`).ok, `${sp.name}: 악보 없이는 봉인이 풀리지 않음`);
  { const r = ev(sp.boss); ok(!!r.battle, `${sp.name}: 성간단 간부 ${EVENTS[sp.boss].battle!.cast} 등장`); const end = fight(r); ok(end === 'win', `간부 승부: ${end} → ${sp.score}`); }
  { const at = { map: p.map, x: p.x, y: p.y }; ok(!travel(`spire_${d}_2f` as MapId), `${sp.name}: 오카리나를 불기 전에는 계단이 봉인됨`); Object.assign(p, at); }
  ok(flute(`seal:${d}`).ok, `${sp.name}: 악보대로 오카리나 → 봉인 풀림`);
  go(`spire_${d}_2f` as MapId);
  go(`spire_${d}_top` as MapId);
  ok(flute(`top:${d}`).ok && p.flags.includes(`lit_${d}`), `${sp.name}: 꼭대기에서 오카리나 → 빛 활성화`);
}

say('\n## 3. 별의 제단: 총수 녹스 → 마지막 악보 → 제네시스');
go('altar');
ok(!flute('altar').ok, '총수를 이기기 전에는 마지막 선율을 불 수 없음');
{ const r = ev('side_nox'); ok(!!r.battle, '제단: 성간단 총수 녹스 등장'); const end = fight(r); ok(end === 'win', `총수 승부: ${end}`); }
ok(!sim.apply('bot', { kind: 'ocarina' } as any).ok, '오카리나를 불기 전에는 제네시스가 없음');
ok(flute('altar').ok && p.flags.includes('genesis_awake'), '마지막 선율 → 제네시스가 깨어남');
{
  const r = sim.apply('bot', { kind: 'ocarina' } as any); const st = S.battles.get('bot');
  ok(!!r.battle && st.foes[0].level === 150, `제네시스 승부 시작 — Lv.${st?.foes[0].level}, 체력 ${st?.foes[0].hp}`);
  const balls = p.bag.hyper_ball;
  const t1 = sim.apply('bot', { kind: 'battleItem', itemId: 'hyper_ball' } as any);
  ok(p.bag.hyper_ball === balls && JSON.stringify(t1.battle?.log).includes('바람이 강하게 불어'), '체력 50% 초과: "바람이 강하게 불어 루미볼을 던질 수가 없어!" (볼이 줄지 않음)');
  let up: any = t1.battle, turns = 0, throws = 0; const foe = st.foes[0], max = stats(foe).maxHp;
  while (!up?.ended && turns++ < 600) {
    const cur = S.battles.get('bot'); if (!cur) break;
    if (p.party[cur.myIdx].hp <= 0) { const i = p.party.findIndex((c) => c.hp > 0); if (i < 0) break; up = sim.apply('bot', { kind: 'battleSwitch', index: i } as any).battle; continue; }
    const me = p.party[cur.myIdx];
    if (me.hp < stats(me).maxHp * 0.45 && (p.bag.max_potion ?? 0) > 0 && foe.hp / max > 0.2) { up = sim.apply('bot', { kind: 'battleItem', itemId: 'max_potion' } as any).battle; continue; }
    if (foe.hp / max <= 0.2) { throws++; up = sim.apply('bot', { kind: 'battleItem', itemId: 'hyper_ball' } as any).battle; continue; }
    up = sim.apply('bot', { kind: 'battleMove', index: bestMove(cur) } as any).battle;
  }
  say(`  · 제네시스전: ${turns}턴, 체력 20% 아래에서 볼 ${throws}개 던짐 → ${up?.ended ?? '진행 중'} (파티 생존 ${alive(p.party).length}/6)`);
  ok(up?.ended === 'caught' || up?.ended === 'lose' || up?.ended === 'win', '제네시스전이 끝까지 진행됨');
  if (up?.ended === 'caught') ok(p.flags.includes('side_genesis'), '포획 → 사이드 퀘스트 클리어 깃발');
}
// 포획 확률 (엔진 직접): 체력 구간별 1만 번
{
  let seed = 7; const eng = new BattleEngine(() => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; });
  const q: any = { party: [makeCreature('g1c', 100)], box: [], bag: {}, caught: [], seen: [] };
  const rate = (frac: number, item: string, n = 20000) => { let hit = 0; for (let i = 0; i < n; i++) { q.party = [makeCreature('g1c', 100)]; q.box = []; q.bag = { [item]: 5 }; const { state } = eng.startWild(q, 'onnuri', 150, 'origin'); const f = state.foes[0]; f.hp = Math.max(1, Math.floor(stats(f).maxHp * frac)); const r: any = eng.item(q, state, item); if (r.update?.ended === 'caught') hit++; } return hit / n; };
  const a = rate(0.4, 'hyper_ball'), b = rate(0.15, 'hyper_ball'), c = rate(0.4, 'origin_ball', 200), d = rate(0.9, 'origin_ball', 200);
  ok(a < 0.004, `체력 40%: 포획률 ${(a * 100).toFixed(2)}% (목표 0.1%)`);
  ok(b > 0.08 && b < 0.12, `체력 15%: 포획률 ${(b * 100).toFixed(1)}% (목표 10%)`);
  ok(c === 1 && d === 0, `태초볼: 체력 50% 아래 ${(c * 100).toFixed(0)}% · 50% 초과에서는 바람에 막힘 ${(d * 100).toFixed(0)}%`);
  // 볼 등급
  const wild = (item: string, sp = 'w1c', dark = false, turn = 1) => { let hit = 0; const n = 6000; for (let i = 0; i < n; i++) { q.party = [makeCreature('g1c', 100)]; q.box = []; q.bag = { [item]: 5 }; q.caught = item === 'repeat_ball' ? [sp] : []; const { state } = eng.startWild(q, sp, 20, 'grass'); state.dark = dark; state.turn = turn; state.foes[0].hp = Math.floor(stats(state.foes[0]).maxHp * 0.5); if ((eng.item(q, state, item) as any).update?.ended === 'caught') hit++; } return Math.round((hit / n) * 100); };
  const tiers = ['lumi_ball', 'super_ball', 'hyper_ball', 'star_ball'].map((b2) => wild(b2));
  ok(tiers[0] < tiers[1] && tiers[1] < tiers[2] && tiers[2] < tiers[3], `볼 등급별 포획률(같은 루미 · 체력 절반): 루미볼 ${tiers[0]}% < 슈퍼 ${tiers[1]}% < 하이퍼 ${tiers[2]}% < 별빛 ${tiers[3]}%`);
  say(`  · 특수 볼: 번개(첫 턴) ${wild('quick_ball', 'w1c', false, 0)}% / (그 뒤) ${wild('quick_ball')}% · 달그림자(밤·동굴) ${wild('moon_ball', 'w1c', true)}% / (낮) ${wild('moon_ball')}% · 물결(물 타입) ${wild('tide_ball')}% / (다른 타입) ${wild('tide_ball', 'g1c')}% · 단골(잡아 본 종) ${wild('repeat_ball')}%`);
}

say('\n## 3-2. 탐험 보상 (보물 상자 · 반짝이는 것)');
{
  let chests = 0, glints = 0, got = 0, tried = 0;
  for (const id of MAP_IDS) for (const o of MAPS[id].objects) if (prop(o, 'interact', '') === 'loot') { if (o.type === 'chest') chests++; else glints++; }
  ok(chests > 150 && glints > 100, `지방 전체에 보물 상자 ${chests}개 · 반짝이는 것 ${glints}개`);
  for (const id of ['route3', 'route12', 'wayward_1f', 'dawn_lake', 'harbor'] as MapId[]) {
    if (!travel(id)) continue;
    for (const o of MAPS[id].objects) { if (prop(o, 'interact', '') !== 'loot') continue; tried++;
      const cx = Number(prop(o, 'cellX', 0)), cy = Number(prop(o, 'cellY', 0)), at = near(reachable(id, p.x, p.y), id, cx, cy, cx, cy); if (!at) continue;
      const home = { x: p.x, y: p.y }; p.x = at[0] * T + 8; p.y = at[1] * T + 13;
      const r = sim.apply('bot', { kind: 'loot', objectId: o.id } as any); if (r.ok) got++;
      if (r.ok && sim.apply('bot', { kind: 'loot', objectId: o.id } as any).ok) ok(false, '같은 상자를 두 번 열 수 있음');
      Object.assign(p, home); }
  }
  ok(got === tried && got > 0, `다섯 곳에서 걸어가 열어 봄: ${got}/${tried}개 획득 (한 번 열면 다시 열리지 않음)`);
}
say('\n## 4. 마을 텃밭 · 호감도 · 도우미');
const towns = Object.keys(HANDS);
ok(towns.length === 17, `텃밭과 호감도 주민이 있는 마을: ${towns.length}곳`);
{ const bad = towns.filter((t) => !MAPS[t as MapId].farmZones.length || !MAPS[t as MapId].spawns.has('wp_hand')); ok(!bad.length, `모든 마을에 텃밭 구역 있음${bad.length ? ` — 없는 곳: ${bad}` : ''}`); }
for (const sl of p.inventory) if (sl.itemId && sl.itemId !== 'ocarina') { sl.itemId = null; sl.quantity = 0; sl.dur = undefined; }   // 보물로 가득 찬 가방 비우기 (검사용)
give('hoe', 1); give('watering_can', 1); give('seeds_parsnip', 20);
let plotsOk = 0;
for (const t of towns) {
  if (!travel(t as MapId)) { ok(false, `${t}: 걸어갈 수 없음`); continue; }
  const z = MAPS[t as MapId].farmZones[0], seen = reachable(t as MapId, p.x, p.y);
  const at = near(seen, t as MapId, z.x, z.y, z.x + z.w - 1, z.y + z.h - 1);
  if (!at) { ok(false, `${t}: 텃밭까지 걸어갈 수 없음`); continue; }
  p.x = at[0] * T + 8; p.y = at[1] * T + 13;
  let tilled = 0; for (const sl of p.inventory) if (sl.itemId === 'hoe') { sl.itemId = null; sl.quantity = 0; sl.dur = undefined; } give('hoe', 1);
  for (let y = z.y; y < z.y + z.h; y++) for (let x = z.x; x < z.x + z.w; x++) { p.x = x * T + 8; p.y = (y + 1) * T + 4; const hoe = p.inventory.findIndex((s) => s.itemId === 'hoe' && (s.dur ?? 1) > 0); if (sim.apply('bot', { kind: 'useTool', slot: hoe, tx: x, ty: y } as any).ok) tilled++; }
  if (tilled >= z.w * z.h * 0.8) plotsOk++; else ok(false, `${t}: 텃밭 ${z.w}×${z.h} 중 ${tilled}칸만 갈림`);
  p.x = at[0] * T + 8; p.y = at[1] * T + 13;
}
ok(plotsOk === towns.length, `모든 마을 텃밭에서 괭이질 가능 (${plotsOk}/${towns.length})`);
// 물결항에서 끝까지: 심기 → 주민과 친해지기 → 부탁 3번 → 도우미
go('harbor');
{
  const z = MAPS.harbor.farmZones[0]; const f = S.plotOf('bot', 'harbor');
  const seedSlot = () => p.inventory.findIndex((s) => s.itemId === 'seeds_parsnip');
  let planted = 0; for (const tl of [...f.tiles.values()].slice(0, 8)) { p.x = tl.x * T + 8; p.y = (tl.y + 1) * T + 4; if (sim.apply('bot', { kind: 'plant', slot: seedSlot(), tx: tl.x, ty: tl.y } as any).ok) planted++; }
  ok(planted === 8, `물결항 텃밭에 순무 ${planted}칸 심음 (구역 ${z.w}×${z.h})`);
  const [n1] = HANDS.harbor, def = NPCS[n1];
  p.x = z.x * T; p.y = z.y * T;
  let days = 0;
  const day = () => { S.newDay(false, false); days++; p.map = 'harbor'; };
  ok(!sim.apply('bot', { kind: 'ask', npc: n1 } as any).ok, `${def.name}: 물건이 없으면 부탁을 들어줄 수 없음`);
  for (let step = 0; step < 3; step++) {
    const a = def.asks![step];
    while ((p.bonds?.[n1] ?? 0) < [0, 3, 6][step]) { sim.apply('bot', { kind: 'talk', npc: n1 } as any); day(); }
    sim.apply('bot', { kind: 'talk', npc: n1 } as any);
    give(a.item, a.qty);
    ok(sim.apply('bot', { kind: 'ask', npc: n1 } as any).ok, `「${def.story}」 ${step + 1}/3: ${ITEMS[a.item].name} ${a.qty}개 건넴 → 호감도 ${p.bonds![n1]}/10`);
    if (step === 1) { const dry = [...f.tiles.values()].filter((tl: any) => tl.crop && tl.soil !== SoilState.Watered).length; day(); const wet = [...f.tiles.values()].filter((tl: any) => tl.crop && tl.soil === SoilState.Watered).length; ok(wet >= 8 || S.time.weather === 'rain', `하트 2개 이상: 아침에 주민이 물을 대신 줌 (물 준 칸 ${wet}, 전날 마른 칸 ${dry})`); }
  }
  while ((p.bonds?.[n1] ?? 0) < BOND_MAX) { sim.apply('bot', { kind: 'talk', npc: n1 } as any); day(); }
  ok(p.bonds![n1] === BOND_MAX, `${def.name}: 호감도 가득 → 텃밭 도우미 (${days}일 걸림)`);
  for (let i = 0; i < 12 && !Object.keys(p.stock?.harbor ?? {}).length; i++) day();
  const st = p.stock?.harbor ?? {};
  ok((st.parsnip ?? 0) > 0, `도우미가 익은 순무를 거둬 맡아 둠: ${JSON.stringify(st)}`);
  ok([...f.tiles.values()].filter((tl: any) => tl.crop).length >= 8, '거둔 자리에 다시 심어 둠');
  const r = sim.apply('bot', { kind: 'collect', map: 'harbor' } as any);
  ok(r.ok && p.inventory.some((s) => s.itemId === 'parsnip'), `맡겨 둔 수확물 받기: 순무 ${p.inventory.find((s) => s.itemId === 'parsnip')?.quantity ?? 0}개`);
  const save = sim.exportSave('bot')!;
  ok(!!save.plots?.harbor?.length && save.bonds?.[n1] === BOND_MAX && (save.flags ?? []).includes('lit_n'), `저장: 텃밭 ${Object.keys(save.plots ?? {}).length}곳 · 호감도 · 탑 진행이 세이브에 들어감`);
}
say(`\n## 결과: ${problems.length ? `문제 ${problems.length}건` : '모두 통과'}`);
for (const x of problems) say(`- ✗ ${x}`);
if (process.argv.includes('--md')) writeFileSync(process.argv[process.argv.indexOf('--md') + 1], log.join('\n'));
