#!/usr/bin/env node
// 도감 확장 데이터 생성: tools/art/dex.mjs 의 35계열 → shared/data/creatures.json (기존 15종은 그대로 두고 덮어쓰기)
//   실행: node tools/data/gen-dex.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEX_LINES, lineIds } from '../art/dex.mjs';

const PATH = fileURLToPath(new URL('../../shared/data/creatures.json', import.meta.url));
const all = JSON.parse(readFileSync(PATH, 'utf8'));
// 타입별 기술 (약 → 강)
const MOVES = {
  풀: ['leaf_toss', 'vine_whip', 'photosynth', 'spore_burst'], 물: ['bubble', 'water_gun', 'aqua_veil', 'wave_ride'], 불: ['ember', 'flame_tail', 'heatwave'],
  땅: ['sand_throw', 'rock_throw', 'quake'], 바람: ['peck', 'gust', 'whirlwind'], 빛: ['flash', 'healing_light', 'starlight', 'meteor'], 노말: ['quick_attack', 'puff_up', 'rollout'],
};
// 타입별 능력치 성향 [hp, atk, def, spd]
const BIAS = { 풀: [1.05, 0.95, 1.05, 0.95], 물: [1.1, 0.95, 1, 0.95], 불: [0.95, 1.15, 0.9, 1], 땅: [1.05, 1.05, 1.15, 0.75], 바람: [0.9, 1, 0.85, 1.25], 빛: [0.95, 1.05, 0.95, 1.05], 노말: [1.15, 1, 0.95, 0.9] };
const TOTAL = [290, 405, 520];
const DESC = [
  (n, k) => `${k}의 어린 모습. 아직 서툴지만 호기심이 가득하다.`,
  (n, k) => `${k}가 한 번 진화한 모습. 몸이 단단해지고 자신감이 붙었다.`,
  (n, k) => `${k}의 마지막 모습. 땅과 하늘의 별빛을 품어 위엄이 넘친다.`,
];
let n = 0;
for (const [type, lines] of Object.entries(DEX_LINES)) lines.forEach((L, i) => {
  const [names, kind, , , , , , , , helps] = L;
  const ids = lineIds(type, i), mv = MOVES[type];
  const lv1 = 16 + (i % 3) * 2, lv2 = 32 + (i % 4) * 3;
  ids.forEach((id, st) => {
    const b = BIAS[type], tot = TOTAL[st] + ((i * 7 + st * 3) % 20), sum = b.reduce((a, c) => a + c, 0);
    const [hp, atk, def, spd] = b.map((x) => Math.round((tot * x) / sum));
    const learnset = [[1, 'tackle'], [1, 'growl'], [5, mv[0]], [11, mv[1]], [19, mv[2] ?? mv[1]], [28, mv[3] ?? mv[2] ?? mv[1]]];
    if (st >= 1) learnset.push([lv1, mv[Math.min(mv.length - 1, 2)]]);
    if (st === 2) learnset.push([lv2, mv[mv.length - 1]]);
    all[id] = {
      id, name: names[st], type, base: { hp, atk, def, spd }, catchRate: [0.45, 0.22, 0.08][st], expYield: [62, 145, 230][st],
      learnset: learnset.filter((x, k, arr) => arr.findIndex((y) => y[0] === x[0] && y[1] === x[1]) === k).sort((a, c) => a[0] - c[0]),
      description: DESC[st](names[st], kind), helps, kind,
      ...(st < 2 ? { evolves: { to: ids[st + 1], level: st === 0 ? lv1 : lv2 } } : {}),
    };
    n++;
  });
});
writeFileSync(PATH, JSON.stringify(all, null, 2) + '\n');
console.log(`✔ 루미 ${Object.keys(all).length}종 (새로 ${n}종)`);
