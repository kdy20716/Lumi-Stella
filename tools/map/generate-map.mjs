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
for (const b of builders) b.write(join(DIR, `${b.name}.json`));
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

const region = { ids, interior: INTERIOR_IDS, maps: meta, grass: data.grass, fish: data.fish, forage: data.forage, trainers: data.trainers, npcs: data.npcs };
writeFileSync(join(HERE, '../../shared/data/region.json'), JSON.stringify(region));
console.log = log;
console.log(`✔ 맵 ${ids.length}개 (바깥 ${outdoor.length} · 실내 ${INTERIOR_IDS.length}) · 트레이너 ${Object.keys(data.trainers).length} · 주민 ${Object.keys(data.npcs).length}`);
