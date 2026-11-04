// 지역 설계(region-spec) → 맵 노드 + 연결(출구) 계산. 맵 생성기와 아트 생성기가 함께 씀 (결정적)
import { TOWNS, ROUTES, PLACES, GYMS } from './region-spec.mjs';

const ROUTE_POS = { route18: [196, 34], route19: [256, 40], route23: [308, 128], route24: [310, 88], route25: [40, 104], route26: [64, 130] };
const pos = {};
for (const t of TOWNS) pos[t.id] = [t.x, t.y];
for (const p of PLACES) pos[p.id] = [p.x, p.y];
pos.farm = [24, 206];
for (const [n, a, b] of ROUTES) {
  const id = `route${n}`;
  if (n === 1) { pos[id] = [66, 198]; continue; }
  if (ROUTE_POS[id]) { pos[id] = ROUTE_POS[id]; continue; }
}
for (const [n, a, b] of ROUTES) { const id = `route${n}`; if (!pos[id]) pos[id] = [Math.round((pos[a][0] + pos[b][0]) / 2), Math.round((pos[a][1] + pos[b][1]) / 2)]; }

/** 두 위치 사이 방향: a 에서 b 쪽 출구가 붙을 변 */
export const sideOf = (a, b) => { const dx = pos[b][0] - pos[a][0], dy = pos[b][1] - pos[a][1]; return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'E' : 'W') : (dy > 0 ? 'S' : 'N'); };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** 노드: id → { id, kind, name, biome, tier, x, y, links: [{ to, type, side? }] } */
export function buildGraph() {
  const nodes = {};
  const add = (n) => { nodes[n.id] = { links: [], ...n, x: pos[n.id][0], y: pos[n.id][1] }; return nodes[n.id]; };
  for (const t of TOWNS) add({ ...t, kind: 'town' });
  for (const [n, a, b, name, biome] of ROUTES) {
    const ta = nodes[a]?.tier ?? 1, tb = nodes[b]?.tier ?? ta;
    add({ id: `route${n}`, kind: 'route', num: n, name: `${n}번 도로 · ${name}`, biome, tier: Math.max(1, Math.round((ta + tb) / 2)), existing: n === 1, ends: [a, b] });
  }
  for (const p of PLACES) add({ ...p });
  // 도로 끝 연결 (도로 노드 티어는 양 끝이 다 생긴 뒤 보정)
  for (const [n, a, b] of ROUTES) {
    const r = nodes[`route${n}`];
    r.tier = Math.max(1, Math.round(((nodes[a]?.tier ?? 1) + (nodes[b]?.tier ?? 1)) / 2));
    for (const end of [a, b]) {
      const e = nodes[end];
      if (e.kind === 'cave') { link(r, e, 'mouth'); continue; }   // 도로 끝이 동굴이면 도로에 동굴 입구
      if (e.tpl === 'island') { link(r, e, 'dock'); continue; }   // 섬은 배로
      const s = sideOf(r.id, end);
      r.links.push({ to: end, type: 'edge', side: s });
      e.links.push({ to: r.id, type: 'edge', side: OPP[s] });
    }
  }
  // 랜드마크 부착
  for (const p of PLACES) if (p.attach) link(nodes[p.attach[0]], nodes[p.id], p.attach[1]);
  return nodes;

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
