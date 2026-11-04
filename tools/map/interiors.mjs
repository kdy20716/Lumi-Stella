// 건물 실내 맵 (방 배경은 tools/art/interior.mjs 가 그린 한 장 이미지, 여기서는 충돌/가구/스폰/출구)
import { MapBuilder } from './lib.mjs';
import { ROOMS, FURN } from '../art/interior.mjs';

const EXTERNAL = { barrel: { w: 1, h: 1 }, crate: { w: 1, h: 1 }, anvil: { w: 1, h: 1 }, cafe_table: { w: 2, h: 1 } };

export function buildInterior(id) {
  const s = ROOMS[id];
  const m = new MapBuilder(id, s.W, s.H, 7);
  m.noGround = true;
  // 벽: 위 3줄, 양옆, 아래 (문 칸 제외)
  for (let y = 0; y < s.H; y++) for (let x = 0; x < s.W; x++) {
    const wall = y < 3 || x === 0 || x === s.W - 1 || (y === s.H - 1 && x !== s.door);
    if (wall) m.blocked[y][x] = true;
  }
  for (const [type, cx, cy, props = {}] of s.furn) {
    const f = FURN[type] ?? EXTERNAL[type];
    m.place(type, cx, cy, { w: f.w, h: f.h, force: true, props });
  }
  for (const [name, cx, cy, props] of s.spawns) m.spawn(name, cx, cy, props);
  m.spawn('player', s.door, s.H - 2);
  for (const [cx, cy] of s.lights ?? []) m.spawn('light', cx, cy);
  m.warp(s.door, s.H - 1, 1, 1, s.exitTo?.[0] ?? '@exit', s.exitTo?.[1] ?? '');
  m.props.push({ name: 'interior', type: 'string', value: 'true' }, { name: 'bg', type: 'string', value: `room_${id}` }, { name: 'title', type: 'string', value: s.name });
  return m;
}
export const INTERIOR_IDS = Object.keys(ROOMS);
