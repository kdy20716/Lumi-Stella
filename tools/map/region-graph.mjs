// 지역 설계(region-spec) → 맵 노드 + 연결(출구) 계산. 맵 생성기와 아트 생성기가 함께 씀 (결정적)
import { TOWNS, ROUTES as ROUTES_V1, ROUTES_V2, PLACES, GYMS, DEEP_CAVES } from './region-spec.mjs';

/** 기존 도로 + 확장 도로 (확장 도로 노드는 맨 뒤에 추가해 기존 맵 · 이름 생성 순서를 그대로 둠) */
const ROUTES = [...ROUTES_V1, ...ROUTES_V2];
const V2 = new Set(ROUTES_V2.map((r) => r[0]));

const ROUTE_POS = { route18: [196, 34], route19: [244, 46], route23: [308, 128], route24: [300, 98], route25: [40, 104], route26: [64, 130] };
const pos = {};
for (const t of TOWNS) pos[t.id] = [t.x, t.y];
for (const p of PLACES) pos[p.id] = [p.x, p.y];
pos.farm = [24, 206];
for (const [n, a, b] of ROUTES) {
  const id = `route${n}`;
  if (n === 1) { pos[id] = [62, 198]; continue; }
  if (ROUTE_POS[id]) { pos[id] = ROUTE_POS[id]; continue; }
}
for (const [n, a, b] of ROUTES) { const id = `route${n}`; if (!pos[id]) pos[id] = [Math.round((pos[a][0] + pos[b][0]) / 2), Math.round((pos[a][1] + pos[b][1]) / 2)]; }

// ── 도로를 2~3구간 맵으로 나누기 ──────────────────────
const SEG = ['', 'b', 'c'];
/** 도로 번호 → 구간 맵 id 목록 (A 쪽 → B 쪽 순서) */
export const CHAINS = {};
for (const [n, a, b] of ROUTES) {
  const d = Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]);
  const k = n === 1 ? 2 : d > 48 ? 3 : 2;
  CHAINS[n] = Array.from({ length: k }, (_, i) => `route${n}${SEG[i]}`);
}
// 이어지는 두 도로(18→19 처럼 끝이 다른 도로)는 하나의 긴 길로 보고 함께 배치
const isRoute = (x) => /^route\d+$/.test(x);
const LINES = [];
{
  const used = new Set();
  for (const r of ROUTES) {
    if (used.has(r[0])) continue;
    if (isRoute(r[1])) continue;   // 앞쪽 도로에서 이어서 처리
    const line = [r]; used.add(r[0]);
    let cur = r;
    while (isRoute(cur[2])) { const nx = ROUTES.find((q) => `route${q[0]}` === cur[2]); if (!nx || used.has(nx[0])) break; line.push(nx); used.add(nx[0]); cur = nx; }
    LINES.push(line);
  }
  for (const r of ROUTES) if (!used.has(r[0])) LINES.push([r]);
}
/** 도로 번호 → [시작 티어 비율, 끝 비율] (이어진 길 안에서의 위치) */
export const LINE_T = {};
for (const line of LINES) {
  const pa = pos[line[0][1]], pb = pos[line[line.length - 1][2]];
  const pts = [pa, ...line.map((r) => pos[`route${r[0]}`]), pb];
  const seg = []; let L = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(l); L += l; }
  const at = (t) => { let d = t * L; for (let i = 0; i < seg.length; i++) { if (d <= seg[i] || i === seg.length - 1) { const u = seg[i] ? d / seg[i] : 0; return [Math.round(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u), Math.round(pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u)]; } d -= seg[i]; } return pb; };
  const all = line.flatMap((r) => CHAINS[r[0]]);
  all.forEach((id, j) => { pos[id] = at((j + 1) / (all.length + 1)); });
  let j = 0;
  for (const r of line) { const k = CHAINS[r[0]].length; LINE_T[r[0]] = { from: line[0][1], to: line[line.length - 1][2], i0: j, n: all.length }; j += k; }
}
/** 도로 끝이 다른 도로면 그 도로의 맞닿은 구간 */
const routeEnd = (end, fromRoute) => {
  const m = /^route(\d+)$/.exec(end); if (!m) return end;
  const n = Number(m[1]), spec = ROUTES.find((r) => r[0] === n);
  return spec[1] === fromRoute ? CHAINS[n][0] : CHAINS[n][CHAINS[n].length - 1];
};

/** 두 위치 사이 방향: a 에서 b 쪽 출구가 붙을 변 */
export const sideOf = (a, b) => { const dx = pos[b][0] - pos[a][0], dy = pos[b][1] - pos[a][1]; return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N'); };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** 노드: id → { id, kind, name, biome, tier, x, y, links: [{ to, type, side? }] } */
export function buildGraph() {
  const nodes = {};
  const add = (n) => { nodes[n.id] = { links: [], ...n, x: pos[n.id][0], y: pos[n.id][1] }; return nodes[n.id]; };
  for (const t of TOWNS) add({ ...t, kind: 'town' });
  const addRoute = ([n, a, b, name, biome, opt]) => {
    const ids = CHAINS[n], k = ids.length;
    const ends = [routeEnd(a, `route${n}`), routeEnd(b, `route${n}`)];
    ids.forEach((id, i) => add({ id, kind: 'route', num: n, seg: i, segs: k, name: `${n}번 도로 · ${name}${k > 1 ? ` (${i + 1}/${k})` : ''}`, biome, tier: 1, existing: id === 'route1',
      ...(V2.has(n) ? { v2: true, need: i === 0 ? opt?.need : undefined } : {}),
      ends: [i === 0 ? ends[0] : ids[i - 1], i === k - 1 ? ends[1] : ids[i + 1]] }));
  };
  for (const r of ROUTES_V1) addRoute(r);
  for (const p of PLACES) add({ ...p });
  for (const r of ROUTES_V2) addRoute(r);
  const linked = (x, y) => x.links.some((l) => l.to === y.id);
  // 도로 구간 연결 (티어는 양 끝 사이를 고르게)
  for (const [n, a, b] of ROUTES_V1) linkRoute(n, a, b);
  // 랜드마크 부착
  for (const p of PLACES) if (p.attach) link(nodes[p.attach[0]], nodes[p.id], p.attach[1]);
  // 리그 섬: 등대곶 ↔ 왕관 시티 정기선
  link(nodes.cape, nodes.crown, 'dock');
  // 확장 도로는 맨 나중에 연결 (기존 맵의 출구 순서가 바뀌지 않게)
  for (const [n, a, b] of ROUTES_V2) linkRoute(n, a, b);
  // 깊은 동굴: 부모 동굴 쪽 연결은 맵 생성 뒤에 덧붙임 (부모 동굴 모양이 바뀌지 않게)
  for (const d of DEEP_CAVES) nodes[d.id] = { ...d, kind: 'cave', v2: true, deep: true, links: [{ to: d.parent, type: 'stairsDown' }] };
  return nodes;

  function linkRoute(n, a, b) {
    const ids = CHAINS[n], k = ids.length;
    const lt = LINE_T[n], ta = nodes[lt.from]?.tier ?? 1, tb = nodes[lt.to]?.tier ?? ta;
    ids.forEach((id, i) => { nodes[id].tier = Math.max(1, Math.round(ta + ((tb - ta) * (lt.i0 + i + 1)) / (lt.n + 1))); });
    for (let i = 0; i < k - 1; i++) link(nodes[ids[i]], nodes[ids[i + 1]], 'side');
    for (const [r, endRaw] of [[nodes[ids[0]], a], [nodes[ids[k - 1]], b]]) {
      const e = nodes[routeEnd(endRaw, `route${n}`)];
      if (linked(r, e)) continue;
      if (e.kind === 'cave') { link(r, e, 'mouth'); continue; }   // 도로 끝이 동굴이면 도로에 동굴 입구
      if (e.tpl === 'island') { link(r, e, 'dock'); continue; }   // 섬은 배로
      link(r, e, 'side');
    }
  }

  function link(a, b, type) {
    if (type === 'side' || type === 'edge') {
      const s = sideOf(a.id, b.id);
      a.links.push({ to: b.id, type: 'edge', side: s }); b.links.push({ to: a.id, type: 'edge', side: OPP[s] });
    } else if (type === 'mouth') { a.links.push({ to: b.id, type: 'mouth', side: sideOf(a.id, b.id) }); b.links.push({ to: a.id, type: 'mouthBack' }); }
    else if (type === 'stairs') { a.links.push({ to: b.id, type: 'stairsUp' }); b.links.push({ to: a.id, type: 'stairsDown' }); }
    else if (type === 'dock') { a.links.push({ to: b.id, type: 'dock' }); b.links.push({ to: a.id, type: 'dock' }); }
    else if (type === 'door') { a.links.push({ to: b.id, type: 'door' }); b.links.push({ to: a.id, type: 'doorBack' }); }
    else if (type === 'portal') { a.links.push({ to: b.id, type: 'portal' }); b.links.push({ to: a.id, type: 'portal' }); }
  }
}
export { GYMS, pos };
