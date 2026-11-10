// 자동 플레이 검사: 봇이 실제 게임 규칙(shared/sim)으로 처음부터 챔피언까지 플레이해 보고, 막히는 곳과 레벨 흐름을 보고
//   npx tsx tools/test/playthrough.ts [--md 결과.md]
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
const top = () => Math.max(...p.party.map((c) => c.level));
const avg = () => Math.round(p.party.reduce((a, c) => a + c.level, 0) / p.party.length);
const partyStr = () => p.party.map((c) => `${SPECIES[c.species].name}${c.level}`).join(' ');

/** 풀숲(또는 동굴)에서 레벨 올리기 · 새 루미 잡기 */
function grind(map: MapId, untilTop: number, maxBattles = 400) {
  const m = MAPS[map];
  if (!ENCOUNTERS.grass[map]) return false;
  const seen = reachable(map, p.x, p.y);
  const grass = m.objects.filter((o) => o.type === 'tallgrass').map((o) => [Math.floor(o.x / T), Math.floor(o.y / T) - 1]).find(([x, y]) => seen[y * m.width + x]);
  const cave = m.props.cave === 'true';
  const at = grass ?? (cave ? [Math.floor(p.x / T), Math.floor((p.y - 5) / T)] : null);
  if (!at) return false;
  let n = 0;
  while (top() < untilTop && n++ < maxBattles) {
    p.x = at[0] * T + 8; p.y = at[1] * T + 13;
    const r = sim.apply('bot', { kind: 'encounter' } as any); if (!r.ok) return false;
    wilds++;
    const end = fight(r, true);
    if (end === 'lose') losses++;
    // 약한 루미도 경험치를 받게: 선두를 가장 낮은 루미로 돌려가며
    const low = p.party.reduce((b, c, i) => (c.level < p.party[b].level ? i : b), 0);
    if (low) sim.apply('bot', { kind: 'setPartner', index: low } as any);
  }
  return top() >= untilTop;
}
function shop() {
  S.time.minutes = 12 * 60;
  const want = Math.min(20, Math.floor(p.gold / 200));
  if (want > 0) sim.apply('bot', { kind: 'buy', shop: 'windvale', itemId: 'lumi_ball', qty: want } as any);
}

/** 가 본 곳 중 야생 레벨이 목표에 가장 맞는 풀숲에서 훈련 */
function train(target: number) {
  if (top() >= target) return;
  const back = { map: p.map, inst: p.inst, x: p.x, y: p.y, ret: p.ret };
  const fields = p.visited.filter((id) => ENCOUNTERS.grass[id as MapId]).map((id) => {
    const rows = [...ENCOUNTERS.grass[id as MapId].day]; const hi = Math.max(...rows.map((r: any) => r[2]));
    return { id: id as MapId, hi };
  }).sort((a, b) => Math.abs(a.hi - target) - Math.abs(b.hi - target));
  for (const f of fields) { if (travel(f.id) && grind(f.id, target)) return; Object.assign(p, back); }
  Object.assign(p, back);
}

// ── 프롤로그 (이야기 연출은 손으로 확인했으니 단계만 진행) ──
S.relocate(p, 'town', '', MAPS.town.spawns.get('player')!.x, MAPS.town.spawns.get('player')!.y);
for (const st of [STORY.RACE, STORY.PHONE, STORY.MEET]) sim.apply('bot', { kind: 'story', step: st } as any);
S.relocate(p, 'in_lab', '', MAPS.in_lab.spawns.get('player')!.x, MAPS.in_lab.spawns.get('player')!.y);
sim.apply('bot', { kind: 'story', step: STORY.HALL } as any);
sim.apply('bot', { kind: 'chooseStarter', species: ENCOUNTERS.starters[0] } as any);
say(`프롤로그: 파트너 ${partyStr()} · 라이벌 대결 ${fight(sim.apply('bot', { kind: 'rivalBattle' } as any))}`);
const lab = MAPS.in_lab.warps.findIndex((w) => w.to === '@exit'); if (lab >= 0) take({ kind: 'warp', index: lab, to: 'town', at: [0, 0] });

// ── 본편: 관장 8명 → 사천왕 → 챔피언 ──
const goals = Object.values(TRAINERS).filter((t: any) => t.badge || ['elite1', 'elite2', 'elite3', 'elite4', 'champion'].includes(t.id))
  .sort((a: any, b: any) => (a.badge ? 0 : 1) - (b.badge ? 0 : 1) || Math.max(...a.team.map((x: any) => x[1])) - Math.max(...b.team.map((x: any) => x[1])) || a.id.localeCompare(b.id));
/** 중요한 승부 전에는 가장 센 루미를 선두로 */
const leadStrongest = () => { const i = p.party.reduce((b, c, k) => (c.level > p.party[b].level ? k : b), 0); if (i) sim.apply('bot', { kind: 'setPartner', index: i } as any); };
const route: MapId[] = [];
/** 이길 때까지: 지면 훈련하고 다시 (최대 8번) */
function battleUntilWin(start: () => any, label: string, lv: number): boolean {
  const at = p.map as MapId;
  train(lv - 2);
  if (!travel(at)) { say(`✗ ${label}: 훈련 뒤 돌아갈 길 없음`); return false; }
  let tries = 0, end = '';
  while (tries++ < 8) {
    leadStrongest();
    const r = start();
    if (!r.ok) { end = `시작 못 함(${r.reason})`; break; }
    if (!r.battle) { end = 'win'; break; }
    end = fight(r);
    if (end === 'win') break;
    losses++;
    shop(); train(top() + 3);
    if (!travel(at)) { end = '돌아갈 길 없음'; break; }
  }
  say(`${end === 'win' ? '✓' : '✗'} ${label} (Lv${lv}) — ${end}, ${tries}번째 · 파티 ${partyStr()} · 배지 ${p.badges.length}`);
  return end === 'win';
}
/** 본편 사건: 조건이 맞은 것부터 순서대로 그 장소로 가서 진행 */
function doEvents(): boolean {
  for (;;) {
    const ev = CHAPTERS.events.find((e) => !e.id.startsWith('side_') && !p.flags.includes(e.id) && e.needs.every((k) => hasDone(p, k)));
    if (!ev) return true;
    if (!travel(ev.map)) { problems.push(`사건 ${ev.id}: ${ev.map} 에 갈 수 없음 (지금 ${p.map}, 배지 ${p.badges.length})`); say(`✗ 사건 ${ev.id}: 길 없음`); return false; }
    const lv = ev.battle ? Math.max(...ev.battle.team.map((t) => t[1])) : 0;
    const ok = ev.battle ? battleUntilWin(() => sim.apply('bot', { kind: 'event', id: ev.id } as any), `사건 ${ev.id}`, lv) : sim.apply('bot', { kind: 'event', id: ev.id } as any).ok;
    if (!ev.battle) say(`${ok ? '·' : '✗'} 사건 ${ev.id}${ok ? '' : ' 진행 못 함'}`);
    if (!ok || !p.flags.includes(ev.id)) { problems.push(`사건 ${ev.id} 를 끝내지 못함`); return false; }
  }
}
let stuck = false;
for (const g of goals as any[]) {
  if (!doEvents()) { stuck = true; break; }
  const lv = Math.max(...g.team.map((x: any) => x[1]));
  if (!travel(g.map)) { problems.push(`${g.title} ${g.name}(${g.map}) 에 갈 수 없음 — 배지 ${p.badges.length}개`); say(`✗ ${g.name}: 길 없음`); stuck = true; break; }
  for (const t of Object.values(TRAINERS) as any[]) if (t.map === g.map && t.id !== g.id && !p.defeated.includes(t.id) && !/사천왕|챔피언/.test(t.title)) { const r = sim.apply('bot', { kind: 'trainer', trainerId: t.id } as any); if (r.ok) fight(r); }
  if (!battleUntilWin(() => sim.apply('bot', { kind: 'trainer', trainerId: g.id } as any), `${g.title} ${g.name}`, lv)) { problems.push(`${g.title} ${g.name} 을(를) 이기지 못함`); stuck = true; break; }
  route.push(g.map);
  shop();
}
if (!stuck) doEvents();
const ended = p.flags.includes('ending');
// ── 비전 기술 지역 탐험: 깊은 동굴 · 숨은 지역에 실제로 들어가 광석 캐기 ──
const explore: string[] = [];
if (ended) {
  S.time.minutes = 12 * 60; p.gold += 5000; sim.apply('bot', { kind: 'buy', shop: 'general', itemId: 'pickaxe', qty: 1 } as any);
  const hasPick = p.inventory.some((x) => x.itemId === 'pickaxe');
  for (const d of [...DEEP_CAVES.map((x) => x.id), ...Object.keys(PLACE_GATES)] as MapId[]) {
    const before = skillUses;
    if (!travel(d)) { problems.push(`비전 기술 지역 ${d} 에 갈 수 없음`); explore.push(`✗ ${d}: 길 없음`); continue; }
    // 들어온 곳에서 닿는 광석을 모두 캐 봄
    let got = 0; const seen = reachable(d, p.x, p.y), home = { x: p.x, y: p.y };
    if (hasPick) for (const o of MAPS[d].objects.filter((x) => prop(x, 'mine', ''))) {
      const cx = Number(prop(o, 'cellX', 0)), cy = Number(prop(o, 'cellY', 0)); const at = near(seen, d, cx, cy, cx, cy); if (!at) continue;
      p.x = at[0] * T + 8; p.y = at[1] * T + 13; p.energy = p.maxEnergy;
      if (sim.apply('bot', { kind: 'mine', objectId: o.id } as any).ok) got++;
      Object.assign(p, home);
    }
    explore.push(`✓ ${d}: 들어감 · 비전 기술 ${skillUses - before}번 · 광석 ${got}개 캠`);
  }
  // 광석이 몇 분 뒤 다시 생기는지
  const back = (S.oreBack as Map<string, number>).size; S.respawnOres(Date.now() + 10 * 60_000);
  explore.push(`광석 다시 생김: 캔 ${back}개 중 ${back - (S.oreBack as Map<string, number>).size}개 (3분 뒤)`);
  for (const e of explore) say(e);
}
if (ended) { const r = sim.apply('bot', { kind: 'epilogue' } as any); say(`${r.ok && p.map === 'farm' ? '·' : '✗'} 에필로그: 내 집 앞 (${p.map})`); }
const won = p.defeated.includes('champion');
const out = [
  '# 자동 플레이 결과', '',
  `결과: ${ended ? '엔딩까지 클리어' : won ? '챔피언까지 (엔딩 사건 안 봄)' : '끝까지 가지 못함'} · 사건 ${p.flags.length}/${CHAPTERS.events.length} · 전투 ${battles}번 (야생 ${wilds}) · 패배 ${losses}번 · 잡은 종류 ${p.caught.length}`,
  `마지막 파티: ${partyStr()} · 비전 기술 ${skillUses}번 사용`, '', '## 진행', '', ...log.map((l) => `- ${l}`), '', '## 막힌 곳', '', ...(problems.length ? problems.map((x) => `- ${x}`) : ['- 없음']),
];
const md = process.argv.indexOf('--md'); if (md > 0) writeFileSync(process.argv[md + 1], out.join('\n') + '\n');
console.log(out.slice(0, 4).join('\n'));
