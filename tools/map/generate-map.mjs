#!/usr/bin/env node
// 맵 생성기 → Tiled 호환 JSON (client/public/assets/maps/*.json)
// Tiled 에디터로 열어서 수정 가능 (단, 다시 생성하면 덮어씀)
//   실행: npm run gen:map
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildFarm } from './farm.mjs';
import { buildTown } from './town.mjs';
import { buildRoute1 } from './route1.mjs';
import { buildWindvale } from './windvale.mjs';
import { buildInterior, INTERIOR_IDS } from './interiors.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../client/public/assets/maps');
buildFarm().write(join(DIR, 'farm.json'));
buildTown().write(join(DIR, 'town.json'));
buildRoute1().write(join(DIR, 'route1.json'));
buildWindvale().write(join(DIR, 'windvale.json'));
for (const id of INTERIOR_IDS) buildInterior(id).write(join(DIR, `${id}.json`));
