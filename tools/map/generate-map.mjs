#!/usr/bin/env node
// 맵 생성기 → Tiled 호환 JSON (client/public/assets/maps/*.json) + 지방 데이터 (shared/data/region.json)
// Tiled 에디터로 열어서 수정 가능 (단, 다시 생성하면 덮어씀)
//   실행: npm run gen:map
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { buildFarm } from './farm.mjs';
import { buildTown } from './town.mjs';
import { buildRoute1 } from './route1.mjs';
import { buildWindvale } from './windvale.mjs';
import { buildInterior, INTERIOR_IDS } from './interiors.mjs';
import { buildRegion } from './gen-world.mjs';
import { ROOMS } from '../art/interior.mjs';
import { pos } from './region-graph.mjs';
import { buildLayouts } from './build-layout.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '../../client/public/assets/maps');
const quiet = process.argv.includes('--quiet');
const log = console.log;
if (quiet) console.log = () => {};

// 옛 생성물 정리 (지워진 맵이 남지 않게)
for (const f of readdirSync(DIR)) if (f.endsWith('.json')) unlinkSync(join(DIR, f));

buildFarm().write(join(DIR, 'farm.json'));
buildTown().write(join(DIR, 'town.json'));
buildRoute1().write(join(DIR, 'route1.json'));
buildWindvale().write(join(DIR, 'windvale.json'));
for (const id of INTERIOR_IDS) buildInterior(id).write(join(DIR, `${id}.json`));

const { builders, data } = buildRegion();
/** 걸어서 닿지 않는 보물은 뺌 (나무 · 절벽에 갇힌 자리) */
function pruneLoot(b) {
  const W = b.W, H = b.H, P = (o, k) => o.properties.find((p) => p.name === k)?.value;
  const pass = new Set(); for (const o of b.objects) if (P(o, 'skill') || ['glint', 'tuft', 'tallgrass', 'stairs_up', 'cave_hole', 'portal'].includes(o.type)) pass.add(P(o, 'cellY') * W + P(o, 'cellX'));
  const blocked = (x, y) => x < 0 || y < 0 || x >= W || y >= H || ((b.blocked[y][x] || (b.terrain[y][x] === 2 && !b.bridge[y * W + x])) && !pass.has(y * W + x));
  const st = b.spawns.find((q) => q.name === 'player') ?? b.spawns[0]; if (!st) return;
  const seen = new Uint8Array(W * H), q = [[Math.floor(st.x / 16), Math.floor(st.y / 16)]];
  while (q.length) { const [x, y] = q.pop(); if (blocked(x, y) || seen[y * W + x]) continue; seen[y * W + x] = 1; q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); }
  b.objects = b.objects.filter((o) => { if (P(o, 'interact') !== 'loot') return true; const cx = P(o, 'cellX'), cy = P(o, 'cellY'); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (seen[(cy + dy) * W + cx + dx]) return true; b.blocked[cy][cx] = false; return false; });
}
for (const b of builders) { pruneLoot(b); b.write(join(DIR, `${b.name}.json`)); }
// 텍스트 레이아웃으로 직접 설계한 맵(tools/map/layouts)이 생성 맵을 덮어씀
await buildLayouts(DIR);

// 맵 목록 · 메타 (이름 / 종류 / 휴대폰 지도 좌표)
const meta = {
  farm: { name: '별빛 농장', kind: 'farm', biome: 'meadow', x: pos.farm[0], y: pos.farm[1], tier: 1 },
  ...data.maps,
};
meta.town = { ...meta.town, name: '별빛 마을' };
meta.route1 = { ...meta.route1, name: '1번 도로 · 산들길 (1/2)' };
for (const id of INTERIOR_IDS) meta[id] = { ...(meta[id] ?? { kind: 'room', biome: 'room', x: 0, y: 0, tier: 1 }), name: meta[id]?.name ?? ROOMS[id].name, interior: true };
const outdoor = ['farm', 'town', 'route1', 'windvale', ...builders.map((b) => b.name)];
const ids = [...outdoor, ...INTERIOR_IDS];
for (const id of Object.keys(meta)) if (!ids.includes(id)) delete meta[id];

const region = { ids, interior: INTERIOR_IDS, maps: meta, grass: data.grass, fish: data.fish, forage: data.forage, trainers: data.trainers, npcs: data.npcs, hands: data.hands };
writeFileSync(join(HERE, '../../shared/data/region.json'), JSON.stringify(region));
console.log = log;
console.log(`✔ 맵 ${ids.length}개 (바깥 ${outdoor.length} · 실내 ${INTERIOR_IDS.length}) · 트레이너 ${Object.keys(data.trainers).length} · 주민 ${Object.keys(data.npcs).length}`);
