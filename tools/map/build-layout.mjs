#!/usr/bin/env node
// 텍스트 레이아웃 → 맵 파일 (Tiled JSON)
//   node tools/map/build-layout.mjs lumina      (tools/map/layouts/lumina.mjs → client/public/assets/maps/lumina.json)
//   node tools/map/build-layout.mjs              (layouts 폴더의 전부)
// 글자 판에 쓰는 기호는 각 레이아웃 파일 맨 위 설명을 보세요.
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { readdirSync } from 'node:fs';
import { MapBuilder, G, D, Wt, S } from './lib.mjs';
import { BUILDINGS as TOWN_B } from '../art/town.mjs';
import { ADV_BUILDINGS } from '../art/adventure.mjs';
import { districtOf, CITY_FACILITY } from './style-kit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LAYOUTS = join(HERE, 'layouts');
const MAPS = join(HERE, '../../client/public/assets/maps');
const ART = { ...TOWN_B, ...ADV_BUILDINGS };
/** 그림이 있는 건물의 칸 크기 · 문 위치 (맵 생성기와 같은 계산) */
const artCells = (key) => { const b = ART[key]; return b && { w: Math.round(b.w / 16), h: Math.ceil((b.wallH + 7) / 16), door: Math.floor((b.doorX + 7) / 16) }; };
const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

export async function buildLayout(id) {
  const L = await import(pathToFileURL(join(LAYOUTS, `${id}.mjs`)).href);
  const rows = L.GRID.split('\n').filter((r) => r.length);
  const H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const at = (x, y) => rows[y]?.[x] ?? '#';
  const m = new MapBuilder(L.ID ?? id, W, H, hash(id));
  const warn = (s) => console.warn(`  ! ${id}: ${s}`);
  const kit = districtOf(L.ID ?? id);

  // 1) 땅. 2D 타일은 풀 · 돌길 · 물 세 가지뿐이라 포장된 곳은 모두 돌길, 3D 는 surface 속성으로 차도 · 인도 · 광장을 따로 그림
  const PAVED = new Set(['=', '-', 'h', 'v', 'z', 'y', ':', '%', '@', 'm', 'k', 'l', 'p']);
  const SURF = { ',': 'd', '-': 'a', h: 'h', v: 'v', z: 'z', y: 'y', '=': 'w', ':': 'p', '.': 'g', t: 'g', b: 'g', _: 'g', '%': 'x', '#': 'g', '~': 'o', '@': 'w' };
  const surface = [];
  const urban = String(L.PROPS?.urban ?? '') === 'true';
  for (let y = 0; y < H; y++) {
    let row = '';
    for (let x = 0; x < W; x++) {
      const c = at(x, y);
      // 소품 · 벤치는 주변 바닥을 이어받음 (광장 위 벤치 = 광장)
      const under = (cc) => { for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const n = at(x + dx, y + dy); if (SURF[n] && !'tb_@'.includes(n)) return SURF[n]; } return 'w'; };
      const sf = /[0-9]/.test(c) ? 'a' : /[A-Z]/.test(c) ? 'w' : SURF[c] ?? under(c);
      row += 'b_t'.includes(c) && urban ? (under(c) === 'g' ? 'g' : under(c)) : sf;
      if (c === '~') m.setT(x, y, Wt);
      else if (c === ',') m.setT(x, y, D);   // 자갈 · 흙 마당
      else if (/[0-9]/.test(c) || PAVED.has(c) || (urban && 'b_'.includes(c) && under(c) !== 'g')) m.setT(x, y, S);
      else m.setT(x, y, G);
      if (c !== '.' && c !== 't' && c !== 'l' && c !== 'p' && c !== 'b' && c !== '_') m.reserved[y][x] = true;
      if (c === '%') m.blocked[y][x] = true;   // 도시 외벽
    }
    surface.push(row);
  }
  if (urban) m.props.push({ name: 'surface', type: 'string', value: surface.join('|') });
  if (urban) m.noTidy = true;
  // 2) 가장자리 나무 (막힘): 두 칸마다 한 그루
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === '#') {
    m.blocked[y][x] = true;
    if ((x + y) % 2 === 0 && x % 2 === 0) m.place(!urban && y % 4 === 0 ? 'oak_apple' : 'oak', x, y, { force: true, props: { frameOffset: (x * 7 + y) % 4 } });
  }
  // 3) 건물: 같은 글자가 차지한 네모
  const boxes = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y); if (!/[A-Z]/.test(c)) continue;
    const b = (boxes[c] ??= { x0: x, y0: y, x1: x, y1: y });
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
  }
  // 일반 빌딩 목록 (@ 칸)
  for (const b of L.PLACED ?? []) {
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (at(x, y) !== '@') { warn(`PLACED (${b.x},${b.y}) ${b.w}×${b.h} 가 글자 판의 @ 칸과 맞지 않아요`); y = 1e9; break; }
    const { x, y, w, h, type, ...rest } = b;
    m.place(type, x, y + h - 1, { w, h, force: true, props: { doorCellX: x + Math.floor(w / 2), blockout: 1, ...rest } });
  }
  for (const [c, box] of Object.entries(boxes)) {
    const def = L.BUILDINGS?.[c]; if (!def) { warn(`건물 '${c}' 설명이 BUILDINGS 에 없어요`); continue; }
    const w = box.x1 - box.x0 + 1, h = box.y1 - box.y0 + 1;
    // 도시형 동네: 센터 · 상점 · 여관 · 체육관도 빌딩과 같은 상자 건물 (지붕 있는 시골집 그림을 쓰지 않음)
    const cityFac = kit.facility === 'city' && CITY_FACILITY[def.type];
    const art = cityFac ? null : artCells(def.type);
    if (art && (art.w !== w || art.h !== h)) warn(`'${c}'(${def.type}) 는 ${art.w}×${art.h}칸이어야 하는데 ${w}×${h}칸이에요`);
    const doorX = box.x0 + (art ? art.door : Math.floor(w / 2));
    const { type, spawn, ...rest } = def;
    const props = { doorCellX: doorX, ...(cityFac || {}), ...rest };
    if (!art) props.blockout = 1;   // 그림 없는 건물 → 3D 화면에서 상자로
    m.place(type, box.x0, box.y1, { w, h, force: true, props });
    if (spawn) m.spawn(spawn, doorX, box.y1 + 1);
  }
  // 4) 소품
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y);
    if (c === 't') m.place(!urban && (x + y) % 3 === 0 ? 'oak_apple' : 'oak', x, y, { force: true, props: { frameOffset: (x + y * 3) % 4 } });
    else if (c === 'l') m.place('lamp', x, y, { force: true });
    else if (c === 'p') m.place('planter', x, y, { force: true });
    else if (c === 'b') m.place('bench', x, y, { w: 2, force: true, props: { interact: 'bench' } });
    else if (c === 'm') m.place('vend', x, y, { force: true, props: { interact: 'vend' } });   // 자판기 (그림 전: 3D 상자)
    else if (c === 'k') m.place('tlight', x, y, { force: true });                               // 신호등
  }
  // 그 밖의 물건 (동굴 입구처럼 그림이 있는 큰 물건): { type, x, y(아래 줄), w, h, ...속성 }
  for (const o of L.OBJECTS ?? []) { const { type, x, y, w = 1, h = 1, ...props } = o; m.place(type, x, y, { w, h, force: true, props }); }
  // 따로 정한 워프 (동굴 입구 등): { x, y, w, h, to, spawn: [x, y] }
  for (const w of L.WARPS ?? []) {
    const { x: wx, y: wy, w: ww = 1, h: wh = 1, to, spawn, ...extra } = w;   // extra: { ferry: 1 } = 배 타는 곳
    for (let y = wy; y < wy + wh; y++) for (let x = wx; x < wx + ww; x++) m.blocked[y][x] = false;
    m.warp(wx, wy, ww, wh, to, `from_${m.name}`, extra);
    if (spawn) m.spawn(`from_${to}`, spawn[0], spawn[1]);
  }
  // 5) 출구: 가장자리의 같은 숫자 칸 묶음 = 워프 하나, 두 칸 안쪽에 도착 지점
  const exits = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = at(x, y); if (!/[0-9]/.test(c)) continue;
    const e = (exits[c] ??= { x0: x, y0: y, x1: x, y1: y });
    e.x0 = Math.min(e.x0, x); e.y0 = Math.min(e.y0, y); e.x1 = Math.max(e.x1, x); e.y1 = Math.max(e.y1, y);
  }
  for (const [d, e] of Object.entries(exits)) {
    const to = L.EXITS?.[d]; if (!to) { warn(`출구 '${d}' 의 목적지가 EXITS 에 없어요`); continue; }
    m.warp(e.x0, e.y0, e.x1 - e.x0 + 1, e.y1 - e.y0 + 1, to, `from_${m.name}`);
    const mx = Math.floor((e.x0 + e.x1) / 2), my = Math.floor((e.y0 + e.y1) / 2);
    const sx = e.x0 === 0 ? 2 : e.x1 === W - 1 ? W - 3 : mx, sy = e.y0 === 0 ? 2 : e.y1 === H - 1 ? H - 3 : my;
    m.spawn(`from_${to}`, sx, sy);
  }
  for (const [name, [x, y]] of Object.entries(L.SPAWNS ?? {})) m.spawn(name, x, y);
  const p = m.spawns.find((s) => s.name === L.PLAYER) ?? m.spawns[0];
  if (p) m.spawn('player', Math.floor(p.x / 16), Math.floor(p.y / 16));
  for (const [name, value] of Object.entries(L.PROPS ?? {})) m.props.push({ name, type: typeof value === 'number' ? 'int' : 'string', value });
  return m;
}

export async function buildLayouts(dir = MAPS, only) {
  const ids = only ? [only] : readdirSync(LAYOUTS).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4));
  for (const id of ids) (await buildLayout(id)).write(join(dir, `${id}.json`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await buildLayouts(MAPS, process.argv[2]);
