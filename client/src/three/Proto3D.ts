// 3D 시험판 (?3d): 포켓몬 4세대(디아루가 · 펄기아)식 화면
//  - 비스듬히 내려다보는 원근 카메라 + 높이가 있는 3D 지형 + 2D 캐릭터 · 나무 빌보드 + 상자형 건물
//  - 지금 쓰는 2D 타일맵 · 그림을 그대로 읽어서 3D 로 세움 (맵 파일을 새로 만들 필요 없음)
//  - 게임 진행 · 서버 연결 없이 맵을 걸어 다니며 "느낌"만 확인하는 용도
import * as THREE from 'three';
import { MapInfo, prop, type TiledMap, type TiledObject } from '@shared/sim/MapInfo';
import { INTERIOR_OF } from '@shared/types';
import { RUN_SPEED, WALK_SPEED, type CharacterMeta, type Manifest } from '../config';
import { touch } from '../ui/Touch';
import { buildTerrainMesh, computeHeights, type Heights } from './Terrain';
import region from '@shared/data/region.json';
import { NPCS } from '@shared/data';

const T = 16;
type Dir = 'down' | 'left' | 'right' | 'up';
type MapWithProps = TiledMap & { properties?: { name: string; value: string | number | boolean }[] };

// ── 불러오기 ─────────────────────────────────────────────
const imgCache = new Map<string, Promise<HTMLImageElement>>();
const loadImg = (src: string) => {
  let p = imgCache.get(src);
  if (!p) { p = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(`그림을 못 불러옴: ${src}`)); i.src = src; }); imgCache.set(src, p); }
  return p;
};
const texCache = new Map<string, THREE.Texture>();
/** 픽셀 그림용 텍스처 (보간 없음) */
function pixelTex(img: HTMLImageElement | HTMLCanvasElement, key?: string) {
  if (key && texCache.has(key)) return texCache.get(key)!;
  const t = new THREE.Texture(img);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  if (key) texCache.set(key, t);
  return t;
}

// ── 빌보드 (서 있는 2D 그림) ────────────────────────────
//  카메라를 향해 똑바로 선 판. 카메라가 45° 로 내려다보면 2D 3/4 시점 그림과 같은 비율로 보임
class Billboard {
  readonly mesh: THREE.Mesh;
  private tex: THREE.Texture;
  constructor(base: THREE.Texture, readonly fw: number, readonly fh: number, readonly cols: number, readonly rows: number, originY: number, originX = 0.5) {
    this.tex = base.clone(); this.tex.needsUpdate = true;
    this.tex.repeat.set(1 / cols, 1 / rows);
    // 기준점(발밑 = 위에서 originY 위치)이 원점(땅)에 오도록 판을 옮김 → 그 아래 부분은 땅에 묻힘
    const g = new THREE.PlaneGeometry(fw / T, fh / T);
    g.translate((0.5 - originX) * fw / T, (originY - 0.5) * fh / T, 0);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.setFrame(0);
  }
  setFrame(i: number) {
    const c = i % this.cols, r = Math.floor(i / this.cols);
    this.tex.offset.set(c / this.cols, 1 - (r + 1) / this.rows);
  }
}

// ── 캐릭터 (플레이어 · NPC 공용) ─────────────────────────
class Actor {
  readonly bb: Billboard;
  readonly shadow: THREE.Mesh;
  x = 0; y = 0; dir: Dir = 'down'; anim = 'idle';
  private t = 0;
  constructor(readonly meta: CharacterMeta, tex: THREE.Texture, shadowTex: THREE.Texture, rows: number) {
    this.bb = new Billboard(tex, meta.frameWidth, meta.frameHeight, meta.columns, rows, meta.originY, meta.originX);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
  }
  play(anim: string, dir: Dir) { if (anim !== this.anim || dir !== this.dir) this.t = 0; this.anim = anim; this.dir = dir; }
  update(dt: number, hts: Heights) {
    const a = this.meta.anims[`${this.anim}-${this.dir}`] ?? this.meta.anims[`idle-${this.dir}`];
    this.t += dt;
    if (a) { const n = a.end - a.start + 1; this.bb.setFrame(a.start + (Math.floor((this.t / 1000) * a.fps) % n)); }
    const h = hts.sample(this.x / T, this.y / T);
    this.bb.mesh.position.set(this.x / T, h, this.y / T);
    this.shadow.position.set(this.x / T, h + 0.03, this.y / T - 0.02);
  }
}

// ── 맵 하나를 3D 로 ─────────────────────────────────────
interface Built { group: THREE.Group; info: MapInfo; hts: Heights; interior: boolean; waterTex: THREE.Texture[]; waterMat?: THREE.MeshBasicMaterial; sway: { tex: THREE.Texture; frames: number }[]; buildings: (TiledObject & { door: [number, number] })[]; actors: Actor[]; tall: Tall[] }

async function buildMap(id: string, man: Manifest, maps: Record<string, MapWithProps>): Promise<Built> {
  const raw = maps[id];
  const info = new MapInfo(raw);
  const W = raw.width, H = raw.height;
  const group = new THREE.Group();
  const interior = String(prop(raw, 'interior', '')) === 'true';
  const biome = String(prop(raw, 'biome', ''));
  const biomes = (man as Manifest & { biomes?: Record<string, { tileset: string }> }).biomes ?? {};
  const tilesetImg = await loadImg(biomes[biome]?.tileset ?? man.tileset.path);

  // 1) 바닥 그림: 2D 와 똑같이 타일 레이어를 한 장의 캔버스에 그림
  const cv = document.createElement('canvas'); cv.width = W * T; cv.height = H * T;
  const cx = cv.getContext('2d')!;
  const bg = String(prop(raw, 'bg', ''));
  if (bg && man.images[bg]) cx.drawImage(await loadImg(man.images[bg].path), 0, 0);
  const off = Number(prop(raw, 'groundOffset', 8));
  const drawLayer = (name: string, o: number, oy = o) => {
    const l = raw.layers.find((x) => x.name === name); if (!l?.data) return;
    l.data.forEach((g0, i) => {
      const g = g0 & 0x1fffffff; if (!g) return;
      const sx = ((g - 1) % 16) * T, sy = Math.floor((g - 1) / 16) * T;
      cx.drawImage(tilesetImg, sx, sy, T, T, (i % W) * T + o, Math.floor(i / W) * T + oy, T, T);
    });
  };
  // 바닥 레이어는 반 칸 밀려 있어서(오토타일) 맨 왼쪽 · 위쪽 가장자리가 비므로 겹쳐 그려 메움
  if (off) { drawLayer('Ground', off - T, off - T); drawLayer('Ground', off - T, off); drawLayer('Ground', off, off - T); }
  drawLayer('Ground', off); drawLayer('Decor', 0); drawLayer('Bridge', 0); drawLayer('Cliff', 0);
  // 도시: 차도 · 인도 · 횡단보도 · 광장 바닥을 칸마다 직접 그림 (2D 타일셋엔 없는 무늬)
  const surface = String(prop(raw, 'surface', ''));
  const surf = surface ? surface.split('|') : null;
  if (surf) paintUrban(cx, surf);
  const groundTex = pixelTex(cv);

  // 2) 지형 (실내는 바닥 + 뒷벽)
  const spawn = info.spawns.get('player') ?? info.spawns.get('entry');
  let hts: Heights;
  if (interior) {
    // 맨 위의 완전히 막힌 줄 = 뒷벽 → 세로로 세움
    let k = 0; while (k < H && Array.from({ length: W }, (_, x) => info.isBlocked(x, k)).every(Boolean)) k++;
    k = Math.min(k, 4);
    hts = computeHeights({ ...raw, layers: raw.layers.filter((l) => l.name !== 'Cliff') }, undefined);
    const floor = new THREE.PlaneGeometry(W, H - k);
    const fuv = floor.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < fuv.count; i++) fuv.setY(i, fuv.getY(i) * ((H - k) / H));
    const fm = new THREE.Mesh(floor, new THREE.MeshBasicMaterial({ map: groundTex, alphaTest: 0.5 }));
    fm.rotation.x = -Math.PI / 2; fm.position.set(W / 2, 0, k + (H - k) / 2);
    const wall = new THREE.PlaneGeometry(W, k);
    const wuv = wall.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < wuv.count; i++) wuv.setY(i, 1 - (1 - wuv.getY(i)) * (k / H));
    const wm = new THREE.Mesh(wall, new THREE.MeshBasicMaterial({ map: groundTex, color: 0xf2f2f2 }));
    wm.position.set(W / 2, k / 2, k);
    group.add(fm, wm);
  } else {
    hts = computeHeights(raw, spawn ? { x: spawn.x / T, y: spawn.y / T } : undefined);
    // 일반 절벽 무늬: 타일셋 11번째 줄의 절벽 앞면 타일
    const faceTex = pixelTex(tilesetImg, `ts:${biome}`);
    const fu = 1 * T / tilesetImg.width, fv = 11 * T / tilesetImg.height;
    group.add(buildTerrainMesh(hts, groundTex, faceTex, [fu, 1 - fv, fu + T / tilesetImg.width, 1 - fv - T / tilesetImg.height]));
  }

  // 3) 물: 바닥 그림의 빈 곳 아래에서 출렁임
  const waterTex: THREE.Texture[] = [];
  let waterMat: THREE.MeshBasicMaterial | undefined;
  const cave = String(prop(raw, 'cave', '')) === 'true';
  if (cave) group.add(makeCaveWalls(info, W, H, groundTex));
  if (surf) group.add(makeCaveWalls(info, W, H, groundTex, 1.3, (x, y) => surf[y]?.[x] === 'x'));   // 도시 외벽
  if (!interior && !cave) {
    const wk = man.images[`water_${biome}0`] ? `water_${biome}` : 'water';
    for (let f = 0; f < 4; f++) {
      const im = man.images[`${wk}${f}`]; if (!im) continue;
      const t = pixelTex(await loadImg(im.path)).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W, H); t.needsUpdate = true;
      waterTex.push(t);
    }
    if (waterTex.length) {
      waterMat = new THREE.MeshBasicMaterial({ map: waterTex[0] });
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(W, H), waterMat);
      wm.rotation.x = -Math.PI / 2; wm.position.set(W / 2, -0.12, H / 2);
      group.add(wm);
    }
  }

  // 4) 물건: 건물은 상자, 나머지는 서 있는 그림
  const sway: Built['sway'] = [];
  const swayTex = new Map<string, THREE.Texture>();
  const buildings: Built['buildings'] = [];
  const tall: Tall[] = [];
  const shadowTex = pixelTex(await loadImg(man.images.shadow.path), 'shadow');
  for (const o of info.objects) {
    // 비전 기술 장애물: 그림이 생기기 전까지 비슷한 그림을 빌려 씀 (가시덩굴 = 덤불을 짙게)
    const ALIAS: Record<string, string> = { vine: 'bush', boulder: 'rock_big' };
    const type = man.images[o.type] || man.spritesheets[o.type] ? o.type : ALIAS[o.type] ?? o.type;
    const cellX = Number(prop(o, 'cellX', 0)), cellY = Number(prop(o, 'cellY', 0)), cellW = Number(prop(o, 'cellW', 1)), cellH = Number(prop(o, 'cellH', 1));
    const im = man.images[type], sh = man.spritesheets[type];
    const base = hts.at(cellX, cellY).sw;
    const isBuilding = !!man.buildings?.[type] || type === 'house';
    if (type === 'vend' || type === 'tlight') { group.add(makeStreetProp(type, o.x / T, o.y / T, base)); continue; }
    if (String(prop(o, 'blockout', '')) === '1') {
      // 그림이 아직 없는 건물(고층 빌딩 · 백화점 · 아파트) → 층수만큼 솟은 회색 상자
      const t = makeBlockout(o, type, cellX, cellY, cellW, cellH, base);
      group.add(t.mesh); tall.push(t);
      // 들어갈 수 있는 도시형 시설 (센터 · 마트 · 체육관): 1층 가운데 문
      if (prop(o, 'interact', '') || prop(o, 'interior', '')) buildings.push(Object.assign(o, { door: [Number(prop(o, 'doorCellX', cellX + Math.floor(cellW / 2))), cellY + 1] as [number, number] }));
      continue;
    }
    if (im && isBuilding && im.h / T > cellH) {
      const bimg = await loadImg(im.path);
      const tex = pixelTex(bimg, `img:${type}`);
      group.add(makeBuilding(bimg, tex, type, cellX, cellY, cellW, cellH, base, man.buildings?.[type]?.chimneyX));
      const doorX = Number(prop(o, 'doorCellX', cellX + (man.buildings?.[type]?.doorCell ?? Math.floor(cellW / 2))));
      buildings.push(Object.assign(o, { door: [doorX, cellY + 1] as [number, number] }));
      continue;
    }
    // 동서남북의 탑: 납작한 그림 대신 진짜 돌탑 (팔각 기둥 + 톱니 난간 + 빛받이 수정)
    if (type === 'spire') {
      const cx = cellX + cellW / 2, cz = cellY + 1 - cellH / 2, y0 = hts.sample(cx, Math.min(H - 0.01, cellY + 0.5));
      const g = new THREE.Group();
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 96; const c2 = cv.getContext('2d')!;
      c2.fillStyle = '#8e94aa'; c2.fillRect(0, 0, 64, 96);
      for (let r = 0; r < 16; r++) for (let k = 0; k < 9; k++) { c2.fillStyle = (r * 7 + k * 3) % 5 === 0 ? '#6a6e84' : (r + k) % 3 === 0 ? '#a6acc0' : '#8e94aa'; c2.fillRect(k * 8 - (r % 2 ? 4 : 0), r * 6, 7, 5); }
      c2.fillStyle = '#3a3c4c'; for (const yy of [30, 62]) c2.fillRect(0, yy, 64, 3);
      const st = new THREE.CanvasTexture(cv); st.magFilter = THREE.NearestFilter; st.minFilter = THREE.NearestFilter; st.colorSpace = THREE.SRGBColorSpace;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.5, 6.4, 8), new THREE.MeshBasicMaterial({ map: st })); body.position.y = 3.2; g.add(body);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.2, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0x6a6e84 })); rim.position.y = 6.6; g.add(rim);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; const m2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xa6acc0 })); m2.position.set(Math.cos(a) * 1.15, 7.05, Math.sin(a) * 1.15); g.add(m2); }
      const gem = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1, 4), new THREE.MeshBasicMaterial({ color: 0x8aecff })); gem.position.y = 7.5; g.add(gem);
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.3), new THREE.MeshBasicMaterial({ color: 0x1c1826 })); door.position.set(0, 0.66, 1.44); door.rotation.x = -0.07; g.add(door);
      const ao = new THREE.Mesh(new THREE.CircleGeometry(2, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false })); ao.rotation.x = -Math.PI / 2; ao.position.y = 0.03; g.add(ao);
      g.position.set(cx, y0, cz); group.add(g);
      continue;
    }
    let bb: Billboard | null = null;
    if (sh) {
      const img = await loadImg(sh.path);
      let t = swayTex.get(type);
      if (!t) { t = pixelTex(img, `sheet:${type}`); swayTex.set(type, t); }
      bb = new Billboard(t, sh.frameWidth, sh.frameHeight, sh.frames, Math.max(1, Math.round(img.height / sh.frameHeight)), sh.originY);
      bb.setFrame(Number(prop(o, 'frameOffset', 0)) % sh.frames);
      if (sh.frames > 1 && type !== 'fence') sway.push({ tex: (bb.mesh.material as THREE.MeshBasicMaterial).map!, frames: sh.frames });
    } else if (im) {
      const t = pixelTex(await loadImg(im.path), `img:${type}`);
      bb = new Billboard(t, im.w, im.h, 1, 1, im.originY);
    }
    if (!bb) continue;
    if (o.type === 'vine' && type !== 'vine') (bb.mesh.material as THREE.MeshBasicMaterial).color.set(0x6a8a4a);
    const gx = o.x / T, gz = o.y / T;
    bb.mesh.position.set(gx, hts.sample(gx, Math.min(H - 0.01, gz - 0.01)), gz);
    group.add(bb.mesh);
    if (['oak', 'oak_apple', 'pine', 'oak_autumn', 'pine_snow', 'palm', 'rock', 'bush', 'lamp'].includes(type)) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(type.startsWith('oak') || type === 'pine' ? 2.2 : 1, type.startsWith('oak') || type === 'pine' ? 0.8 : 0.4), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.45, depthWrite: false }));
      s.rotation.x = -Math.PI / 2; s.position.set(gx, bb.mesh.position.y + 0.02, gz - 0.1);
      group.add(s);
    }
  }

  // 5) 이 맵에 사는 사람만 (일정표에 이 맵이 있는 주민을 그 자리에) — 다른 마을 주민을 빌려 오지 않음
  const actors: Actor[] = [];
  for (const n of Object.values(NPCS)) {
    const at = (n.schedule ?? []).map((e) => e.map === id && info.spawnList.find((s) => s.name === e.to)).find(Boolean);
    const meta = at && man.characters[n.sprite]; if (!at || !meta) continue;
    const img = await loadImg(meta.path);
    const a = new Actor(meta, pixelTex(img, `char:${n.sprite}`), shadowTex, Math.round(img.height / meta.frameHeight));
    a.x = at.x; a.y = at.y + 5; a.play('idle', 'down');
    group.add(a.bb.mesh, a.shadow); actors.push(a);
  }
  // 마을 텃밭: 옅은 흙빛 바닥 + 나무 말뚝
  for (const z of info.farmZones) {
    if (id === 'farm') break;
    const y0 = hts.sample(z.x + z.w / 2, z.y + z.h / 2) + 0.03;
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.h), new THREE.MeshBasicMaterial({ color: 0x7a5230, transparent: true, opacity: 0.45, depthWrite: false }));
    soil.rotation.x = -Math.PI / 2; soil.position.set(z.x + z.w / 2, y0, z.y + z.h / 2); group.add(soil);
    const post = new THREE.BoxGeometry(0.16, 0.5, 0.16), pm = new THREE.MeshBasicMaterial({ color: 0x8a5a32 });
    const put = (x: number, zz: number) => { const p = new THREE.Mesh(post, pm); p.position.set(x, y0 + 0.25, zz); group.add(p); };
    for (let i = 0; i <= z.w; i++) { put(z.x + i, z.y); put(z.x + i, z.y + z.h); }
    for (let j = 1; j < z.h; j++) { put(z.x, z.y + j); put(z.x + z.w, z.y + j); }
  }
  return { group, info, hts, interior, waterTex, waterMat, sway, buildings, actors, tall };
}

/** 건물 그림 분석 결과 (그림 한 장에서 벽 · 지붕 · 처마 위치를 찾아냄) */
interface BldShape {
  data: ImageData; w: number; h: number;
  wallL: number; wallR: number;          // 벽 좌우 (px)
  roofTop: number; roofBottom: number;   // 지붕 위 · 아래 줄 (px). 지붕이 없으면 roofBottom = 벽 시작
  eaveL: number; eaveR: number;          // 처마 (지붕 맨 아래 줄) 좌우
  topL: number; topR: number;            // 지붕 꼭대기 줄 좌우 → 용마루 길이
  pitched: boolean;                      // 경사 지붕을 찾았는지 (못 찾으면 평지붕 + 앞면 장식판)
}
const shapeCache = new Map<HTMLImageElement, BldShape>();
function analyzeBuilding(img: HTMLImageElement): BldShape {
  const hit = shapeCache.get(img); if (hit) return hit;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0);
  const data = cx.getImageData(0, 0, w, h);
  const span: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    let L = -1, R = -1;
    for (let x = 0; x < w; x++) if (data.data[(y * w + x) * 4 + 3] > 128) { if (L < 0) L = x; R = x; }
    span.push([L, R]);
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[Math.floor(a.length / 2)];
  const low = span.slice(Math.floor(h * 0.65)).filter(([L]) => L >= 0);
  const wallL = med(low.map((s) => s[0])), wallR = med(low.map((s) => s[1]));
  const wallW = wallR - wallL + 1;
  let roofTop = span.findIndex(([L, R]) => L >= 0 && R - L + 1 >= wallW * 0.5);
  if (roofTop < 0) roofTop = 0;
  // 지붕 = 위가 좁고 아래로 갈수록 넓어지는 사다리꼴. 폭이 벽 폭만큼 꽉 차는 첫 줄(처마 들보)부터 벽
  let roofBottom = -1;
  for (let y = roofTop + 1; y < h - 3; y++) if (span[y][0] >= 0 && span[y][0] <= wallL + 1 && span[y][1] >= wallR - 1) { roofBottom = y; break; }
  const eave = [wallL, wallR];
  const topW = span[roofTop][1] - span[roofTop][0] + 1;
  // 지붕 줄마다 빈틈 없이 꽉 차 있어야 경사 지붕 (체육관처럼 탑 두 개 사이가 빈 그림은 평지붕으로)
  const filled = (yy: number) => { const [L, R] = span[yy]; if (L < 0) return false; let n = 0; for (let x = L; x <= R; x++) if (data.data[(yy * w + x) * 4 + 3] > 128) n++; return n >= (R - L + 1) * 0.85; };
  let roofSolid = true; for (let y = roofTop; y < roofBottom; y++) if (!filled(y)) { roofSolid = false; break; }
  const pitched = roofSolid && roofBottom - roofTop >= 8 && roofBottom < h - 8 && topW < wallW - 4;
  let s: BldShape;
  if (pitched) {
    s = { data, w, h, wallL, wallR, roofTop, roofBottom, eaveL: eave[0], eaveR: eave[1], topL: span[roofTop][0], topR: span[roofTop][1], pitched };
  } else {
    // 평지붕: 아래에서부터 벽 폭이 꽉 찬 줄까지를 벽 상자로, 그 위는 앞면 장식판(탑 · 돔 등)
    const solid = (yy: number) => { let n = 0; for (let x = wallL; x <= wallR; x++) if (data.data[(yy * w + x) * 4 + 3] > 128) n++; return n >= wallW * 0.92; };
    let y = h - 1; while (y > 0 && !solid(y)) y--;   // 맨 아래 계단처럼 덜 찬 줄은 건너뜀
    while (y > 0 && solid(y - 1)) y--;
    s = { data, w, h, wallL, wallR, roofTop, roofBottom: y, eaveL: wallL, eaveR: wallR, topL: wallL, topR: wallR, pitched };
  }
  shapeCache.set(img, s);
  return s;
}

/** 한 줄에서 가장 많이 쓰인 색 (창문 · 문을 빼고 벽 바탕색을 얻는 용도) */
function rowMode(s: BldShape, y: number, x0: number, x1: number) {
  const cnt = new Map<number, number>(); let best = 0, bestN = 0;
  for (let x = x0; x <= x1; x++) {
    const i = (y * s.w + x) * 4, d = s.data.data;
    if (d[i + 3] < 128) continue;
    const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    const n = (cnt.get(k) ?? 0) + 1; cnt.set(k, n);
    if (n > bestN) { bestN = n; best = k; }
  }
  return bestN ? `#${best.toString(16).padStart(6, '0')}` : '';
}

/** 옆벽 · 뒷벽 그림: 앞벽의 줄별 바탕색(띠 무늬 · 토대 · 처마 밑 장식)을 이어 칠하고, 양 끝에 앞벽 모서리 기둥을 그대로 복사 */
function sideWallTex(s: BldShape, widthPx: number, key: string) {
  const hit = texCache.get(key); if (hit) return hit;
  const y0 = s.roofBottom, hh = s.h - y0;
  const cv = document.createElement('canvas'); cv.width = Math.max(8, widthPx); cv.height = Math.max(1, hh);
  const cx = cv.getContext('2d')!;
  for (let y = 0; y < hh; y++) { const c = rowMode(s, y0 + y, s.wallL, s.wallR); if (c) { cx.fillStyle = c; cx.fillRect(0, y, cv.width, 1); } }
  const src = document.createElement('canvas'); src.width = s.w; src.height = s.h; src.getContext('2d')!.putImageData(s.data, 0, 0);
  const post = 3;
  cx.drawImage(src, s.wallL, y0, post, hh, 0, 0, post, hh);
  cx.drawImage(src, s.wallR - post + 1, y0, post, hh, cv.width - post, 0, post, hh);
  return pixelTex(cv, key);
}

/** 건물: 4세대처럼 벽 네 면이 다 막힌 상자 + 처마가 튀어나온 경사 지붕(앞 · 뒤 경사면 + 양옆 삼각 경사면)
 *  - 앞벽 · 앞 지붕 = 원래 2D 그림, 옆벽 · 뒷벽 = 앞벽 무늬로 만든 그림, 옆 지붕 = 지붕 그림 가운데를 늘려 씀
 *  - 해는 왼쪽 위: 왼쪽 면은 조금, 오른쪽 · 뒤쪽 면은 더 어둡게 */
function makeBuilding(img: HTMLImageElement, tex: THREE.Texture, key: string, cellX: number, cellY: number, cellW: number, cellH: number, base: number, chimneyX?: number | null) {
  const s = analyzeBuilding(img);
  const { w, h } = s;
  const grp = new THREE.Group();
  const D = cellH;
  const sx0 = cellX + cellW / 2 - w / T / 2;            // 그림 왼쪽 끝의 월드 x
  const X = (px: number) => sx0 + px / T;
  const U = (px: number) => px / w, V = (py: number) => 1 - py / h;
  const z1 = cellY + 1, z0 = z1 - D, y0 = base;
  const wx0 = X(s.wallL), wx1 = X(s.wallR + 1);
  const Hw = (h - s.roofBottom) / T, y1 = y0 + Hw;

  type Buf = { pos: number[]; uv: number[]; col: number[] };
  const mk = (): Buf => ({ pos: [], uv: [], col: [] });
  const quad = (b: Buf, p: number[][], q: number[][], c: number) => { for (const i of [0, 1, 2, 0, 2, 3]) { b.pos.push(...p[i]); b.uv.push(...q[i]); b.col.push(c, c, c); } };
  const tri = (b: Buf, p: number[][], q: number[][], c: number) => { for (const i of [0, 1, 2]) { b.pos.push(...p[i]); b.uv.push(...q[i]); b.col.push(c, c, c); } };
  const toMesh = (b: Buf, map: THREE.Texture, alpha = true) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map, vertexColors: true, alphaTest: alpha ? 0.5 : 0, side: THREE.DoubleSide }));
  };

  // ── 벽 상자 ──
  const front = mk(), sides = mk();
  const fv0 = V(s.h), fv1 = V(s.roofBottom);
  quad(front, [[wx0, y1, z1], [wx0, y0, z1], [wx1, y0, z1], [wx1, y1, z1]], [[U(s.wallL), fv1], [U(s.wallL), fv0], [U(s.wallR + 1), fv0], [U(s.wallR + 1), fv1]], 1);
  const sideTex = sideWallTex(s, Math.round(D * T), `side:${key}:${D}`);
  const backTex = sideWallTex(s, s.wallR - s.wallL + 1, `back:${key}`);
  quad(sides, [[wx0, y1, z0], [wx0, y0, z0], [wx0, y0, z1], [wx0, y1, z1]], [[0, 1], [0, 0], [1, 0], [1, 1]], 0.82);   // 왼쪽 (해 쪽)
  quad(sides, [[wx1, y1, z1], [wx1, y0, z1], [wx1, y0, z0], [wx1, y1, z0]], [[0, 1], [0, 0], [1, 0], [1, 1]], 0.66);   // 오른쪽
  const back = mk();
  quad(back, [[wx1, y1, z0], [wx1, y0, z0], [wx0, y0, z0], [wx0, y1, z0]], [[0, 1], [0, 0], [1, 0], [1, 1]], 0.6);
  grp.add(toMesh(sides, sideTex, false), toMesh(back, backTex, false));

  const roof = mk();
  if (s.pitched) {
    // ── 경사 지붕 ──
    const ov = 0.28;                                   // 앞뒤 처마 길이
    const ex0 = X(s.eaveL) - 0.14, ex1 = X(s.eaveR + 1) + 0.14;   // 좌우 처마 (벽보다 살짝 튀어나옴)
    const zf = z1 + ov, zb = z0 - ov, zc = (z0 + z1) / 2;
    const rp = (s.roofBottom - s.roofTop) / T;         // 그림 속 지붕 높이 (칸)
    // 세로 보정 45° 화면에서 앞 경사면의 화면 높이 = 솟은 높이 + 깊이 → 그림 속 지붕 높이와 같아지게
    const R = Math.max(0.6, rp - (zf - zc));
    const yr = y1 + R;
    let rx0 = X(s.topL), rx1 = X(s.topR + 1);
    if (rx1 - rx0 < 0.2) { const m = (rx0 + rx1) / 2; rx0 = m - 0.1; rx1 = m + 0.1; }
    const vT = V(s.roofTop), vB = V(s.roofBottom);
    // 앞 경사면 (원래 지붕 그림)
    quad(roof, [[rx0, yr, zc], [ex0, y1, zf], [ex1, y1, zf], [rx1, yr, zc]], [[U(s.topL), vT], [U(s.eaveL), vB], [U(s.eaveR + 1), vB], [U(s.topR + 1), vT]], 1);
    // 뒤 경사면 (거의 안 보임, 같은 그림)
    quad(roof, [[rx1, yr, zc], [ex1, y1, zb], [ex0, y1, zb], [rx0, yr, zc]], [[U(s.topR + 1), vT], [U(s.eaveR + 1), vB], [U(s.eaveL), vB], [U(s.topL), vT]], 0.62);
    // 양옆 삼각 경사면: 지붕 그림 가운데 띠(기와 줄무늬)를 씀
    const um = U((s.topL + s.topR) / 2), du = 6 / w;
    tri(roof, [[ex0, y1, zb], [ex0, y1, zf], [rx0, yr, zc]], [[um - du, vB], [um + du, vB], [um, vT]], 0.8);
    tri(roof, [[ex1, y1, zf], [ex1, y1, zb], [rx1, yr, zc]], [[um - du, vB], [um + du, vB], [um, vT]], 0.64);
    // 처마 밑 그늘 (아래에서 보이는 판 - 벽과 지붕 사이 틈 막기)
    quad(roof, [[ex0, y1, zb], [ex0, y1, zf], [ex1, y1, zf], [ex1, y1, zb]], [[um - du, vB], [um - du, vB], [um + du, vB], [um + du, vB]], 0.35);
    // 굴뚝: 그림의 굴뚝 위치에 작은 상자
    if (chimneyX != null) {
      const cxw = X(chimneyX), cz = zc + 0.35, cw = 0.42, ch = R * 0.75 + 0.7;
      const cy0 = y1 + R * (1 - (cz - zc) / (zf - zc)) - 0.2;
      const cu = U(chimneyX), cvv = V(Math.max(0, s.roofTop - 3));
      const c = mk();
      const box = (x0: number, x1: number, zA: number, zB: number, ya: number, yb: number) => {
        const q = [[cu, cvv], [cu, cvv], [cu, cvv], [cu, cvv]];
        quad(c, [[x0, yb, zB], [x0, ya, zB], [x1, ya, zB], [x1, yb, zB]], q, 0.95);
        quad(c, [[x0, yb, zA], [x0, ya, zA], [x0, ya, zB], [x0, yb, zB]], q, 0.8);
        quad(c, [[x1, yb, zB], [x1, ya, zB], [x1, ya, zA], [x1, yb, zA]], q, 0.65);
        quad(c, [[x0, yb, zA], [x0, yb, zB], [x1, yb, zB], [x1, yb, zA]], q, 0.5);
      };
      box(cxw - cw / 2, cxw + cw / 2, cz - cw / 2, cz + cw / 2, cy0, cy0 + ch);
      grp.add(toMesh(c, tex, false));
    }
  } else {
    // ── 평지붕 + 앞면 장식판 (체육관 · 풍차처럼 경사 지붕이 아닌 그림) ──
    const topC = rowMode(s, s.roofBottom + 1, s.wallL, s.wallR) || '#888888';
    const flat = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0, D), new THREE.MeshBasicMaterial({ color: new THREE.Color(topC).multiplyScalar(0.85) }));
    flat.rotation.x = -Math.PI / 2; flat.position.set((wx0 + wx1) / 2, y1 + 0.001, (z0 + z1) / 2);
    grp.add(flat);
    // 벽 위로 솟은 부분(탑 · 돔 · 깃발)은 앞벽 위에 서 있는 판으로
    if (s.roofBottom > 0) {
      const top = (s.roofBottom - Math.max(0, s.roofTop - 10)) / T;
      const ty = Math.max(0, s.roofTop - 10);
      quad(roof, [[X(0), y1 + top, z1], [X(0), y1, z1], [X(w), y1, z1], [X(w), y1 + top, z1]], [[0, V(ty)], [0, V(s.roofBottom)], [1, V(s.roofBottom)], [1, V(ty)]], 1);
    }
  }
  grp.add(toMesh(front, tex), toMesh(roof, tex));

  // 바닥 그늘: 건물 둘레가 땅에 붙어 보이게
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0 + 0.5, D + 0.45), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  ao.rotation.x = -Math.PI / 2; ao.position.set((wx0 + wx1) / 2 + 0.12, y0 + 0.015, (z0 + z1) / 2 + 0.1);
  grp.add(ao);
  return grp;
}

/** 블록아웃 건물 (그림이 생기기 전 규모 확인용): 층마다 창문 띠가 있는 상자 + 옥상 난간 · 1층 입구 · 이름판
 *  한 층 = 0.75칸. 플레이어를 가리면 반투명해짐 (Tall.mats 로 투명도 조절) */
interface Tall { mesh: THREE.Group; x0: number; x1: number; z0: number; z1: number; h: number; mats: THREE.MeshBasicMaterial[]; faded: boolean }
const FLOOR_H = 0.75;
function blockoutTex(kind: string, color: string, wCells: number, floors: number, front: boolean, label: string, key: string, accent = '') {
  const hit = texCache.get(key); if (hit) return hit;
  const fh = 12, lobby = 16, Wp = Math.max(16, Math.round(wCells * 16)), Hp = floors * fh + lobby - fh;
  // 2배 해상도로 그림: 무늬는 같고 이름판 글자만 또렷해짐
  const cv = document.createElement('canvas'); cv.width = Wp * 2; cv.height = Hp * 2;
  const cx = cv.getContext('2d')!; cx.scale(2, 2);
  const base = new THREE.Color(color), dark = base.clone().multiplyScalar(0.72), glass = kind === 'apart' ? '#5f7c93' : '#4e6f8c', glassHi = '#8fb1cc';
  cx.fillStyle = `#${base.getHexString()}`; cx.fillRect(0, 0, Wp, Hp);
  // 층 띠 + 창문
  for (let f = 0; f < floors - 1; f++) {
    const y = f * fh;
    cx.fillStyle = `#${dark.getHexString()}`; cx.fillRect(0, y + fh - 1, Wp, 1);
    if (kind === 'factory') {   // 공장: 층마다 위쪽 가로 띠창
      cx.fillStyle = glass; cx.fillRect(3, y + 2, Wp - 6, 3); cx.fillStyle = glassHi; cx.fillRect(3, y + 2, Wp - 6, 1);
      for (let x = 3; x < Wp - 3; x += 8) { cx.fillStyle = `#${dark.getHexString()}`; cx.fillRect(x, y + 2, 1, 3); }
      continue;
    }
    const step = kind === 'apart' ? 10 : 6, ww = kind === 'apart' ? 6 : 4;
    for (let x = 3; x + ww <= Wp - 3; x += step) {
      cx.fillStyle = glass; cx.fillRect(x, y + 3, ww, 6);
      cx.fillStyle = glassHi; cx.fillRect(x, y + 3, ww, 1);
      if (kind === 'apart') { cx.fillStyle = `#${dark.getHexString()}`; cx.fillRect(x - 1, y + 9, ww + 2, 1); }
    }
  }
  // 1층(로비): 앞면엔 유리문 + 이름판
  const ly = Hp - lobby;
  cx.fillStyle = `#${dark.getHexString()}`; cx.fillRect(0, ly, Wp, 2);
  if (front && kind === 'factory') {   // 공장 정면: 큰 셔터문 두 개
    for (const fx of [0.3, 0.7]) { const dw = Math.min(22, Math.floor(Wp * 0.22)), dx = Math.floor(Wp * fx - dw / 2); cx.fillStyle = '#5d5e62'; cx.fillRect(dx, ly + 2, dw, lobby - 2); cx.fillStyle = '#6f7075'; for (let yy = ly + 4; yy < Hp; yy += 3) cx.fillRect(dx, yy, dw, 1); }
    if (label) { cx.font = 'bold 7px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; const tw = Math.min(Wp - 4, cx.measureText(label).width + 6); cx.fillStyle = 'rgba(20,24,32,.85)'; cx.fillRect(Wp / 2 - tw / 2, ly - 9, tw, 9); cx.fillStyle = '#fff6d8'; cx.fillText(label, Wp / 2, ly - 4.5, Wp - 6); }
  } else if (front && accent) {
    // 도시형 시설 (센터 · 마트 · 호텔 · 체육관): 1층 전면 유리 + 색 띠 차양 + 색 이름판
    cx.fillStyle = accent; cx.fillRect(0, ly - 4, Wp, 6);
    cx.fillStyle = 'rgba(255,255,255,.35)'; cx.fillRect(0, ly - 4, Wp, 1);
    cx.fillStyle = glass; cx.fillRect(3, ly + 4, Wp - 6, lobby - 5);
    cx.fillStyle = glassHi; cx.fillRect(3, ly + 4, Wp - 6, 1);
    for (let x = 3; x < Wp - 3; x += 12) { cx.fillStyle = `#${dark.getHexString()}`; cx.fillRect(x, ly + 4, 1, lobby - 5); }
    const dw = Math.min(16, Wp - 8), dx = Math.floor(Wp / 2 - dw / 2);
    cx.fillStyle = '#2f3d4a'; cx.fillRect(dx, ly + 5, dw, lobby - 5); cx.fillStyle = glassHi; cx.fillRect(dx + 1, ly + 6, dw / 2 - 2, lobby - 7); cx.fillRect(dx + dw / 2 + 1, ly + 6, dw / 2 - 2, lobby - 7);
    if (label) {
      cx.font = 'bold 8px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const tw = Math.min(Wp - 4, cx.measureText(label).width + 8), py = Math.max(1, ly - 16);
      cx.fillStyle = accent; cx.fillRect(Wp / 2 - tw / 2, py, tw, 11);
      cx.fillStyle = '#ffffff'; cx.fillRect(Wp / 2 - tw / 2, py, tw, 1);
      cx.fillStyle = '#ffffff'; cx.fillText(label, Wp / 2, py + 6, Wp - 6);
    }
  } else if (front) {
    const dw = Math.min(16, Wp - 8), dx = Math.floor(Wp / 2 - dw / 2);
    cx.fillStyle = '#3b4b5a'; cx.fillRect(dx, ly + 4, dw, lobby - 4);
    cx.fillStyle = glassHi; cx.fillRect(dx + 1, ly + 5, dw - 2, 1);
    for (let x = 3; x < dx - 6; x += 9) { cx.fillStyle = glass; cx.fillRect(x, ly + 5, 6, 7); }
    for (let x = dx + dw + 3; x < Wp - 6; x += 9) { cx.fillStyle = glass; cx.fillRect(x, ly + 5, 6, 7); }
    if (label) {
      cx.font = 'bold 7px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      const tw = Math.min(Wp - 4, cx.measureText(label).width + 6);
      cx.fillStyle = 'rgba(20,24,32,.85)'; cx.fillRect(Wp / 2 - tw / 2, ly - 9, tw, 9);
      cx.fillStyle = '#fff6d8'; cx.fillText(label, Wp / 2, ly - 4.5, Wp - 6);
    }
  } else for (let x = 3; x + 4 <= Wp - 3; x += 6) { cx.fillStyle = glass; cx.fillRect(x, ly + 5, 4, 6); }
  return pixelTex(cv, key);
}
function makeBlockout(o: TiledObject, kind: string, cellX: number, cellY: number, cellW: number, cellH: number, base: number): Tall {
  const floors = Math.max(1, Number(prop(o, 'floors', 3))), color = String(prop(o, 'color', '#c8c8c8')), label = String(prop(o, 'label', ''));
  const h = floors * FLOOR_H + 0.25;
  const grp = new THREE.Group();
  const geo = new THREE.BoxGeometry(cellW, h, cellH);
  const mk = (tex: THREE.Texture | null, shade: number, col = color) => new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(tex ? '#ffffff' : col).multiplyScalar(shade), transparent: true, opacity: 1 });
  const accent = String(prop(o, 'accent', ''));
  const key = `bo:${kind}:${color}:${floors}:${accent}`;
  const front = blockoutTex(kind, color, cellW, floors, true, label, `${key}:f:${cellW}:${label}`, accent);
  const side = blockoutTex(kind, color, cellH, floors, false, '', `${key}:s:${cellH}`);
  const back = blockoutTex(kind, color, cellW, floors, false, '', `${key}:b:${cellW}`);
  // BoxGeometry 면 순서: +x(오른쪽) -x(왼쪽) +y(옥상) -y(바닥) +z(앞) -z(뒤)
  const roofCol = `#${new THREE.Color(color).multiplyScalar(0.62).getHexString()}`;
  const mats = [mk(side, 0.68), mk(side, 0.86), mk(null, 1, roofCol), mk(null, 0.5), mk(front, 1), mk(back, 0.6)];
  const box = new THREE.Mesh(geo, mats);
  box.position.set(cellX + cellW / 2, base + h / 2, cellY + 1 - cellH / 2);
  grp.add(box);
  // 옥상 난간 · 기계실 · (방송국) 안테나
  const rim = mk(null, 0.8, color);
  const parapet = (w: number, d: number, x: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.25, d), rim); m.position.set(x, base + h + 0.12, z); grp.add(m); };
  const cx = cellX + cellW / 2, cz = cellY + 1 - cellH / 2;
  parapet(cellW, 0.15, cx, cellY + 1 - 0.075); parapet(cellW, 0.15, cx, cellY + 1 - cellH + 0.075);
  parapet(0.15, cellH, cellX + 0.075, cz); parapet(0.15, cellH, cellX + cellW - 0.075, cz);
  const mats2 = [rim];
  if (floors >= 8) { const room = new THREE.Mesh(new THREE.BoxGeometry(Math.min(3, cellW * 0.35), 0.8, Math.min(2, cellH * 0.4)), mk(null, 0.7, color)); room.position.set(cx + cellW * 0.15, base + h + 0.4, cz - cellH * 0.1); grp.add(room); mats2.push(room.material as THREE.MeshBasicMaterial); }
  // 공장 굴뚝: 지붕 뒤쪽에 줄지어 선 원기둥 (위쪽 빨강 · 흰 띠)
  const chim = Number(prop(o, 'chimney', 0));
  for (let i = 0; i < chim; i++) {
    const ch = 3.2 + i * 0.4, cxp = cellX + (cellW * (i + 1)) / (chim + 1), czp = cellY + 1 - cellH * 0.7;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, ch, 10), mk(null, 0.95, '#8d5a46')); body.position.set(cxp, base + h + ch / 2, czp); grp.add(body); mats2.push(body.material as THREE.MeshBasicMaterial);
    for (const [k, col] of [[0, '#d24a3a'], [1, '#eeeeea']] as const) { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 10), mk(null, 1, col)); band.position.set(cxp, base + h + ch - 0.2 - k * 0.38, czp); grp.add(band); mats2.push(band.material as THREE.MeshBasicMaterial); }
  }
  if (String(prop(o, 'antenna', '')) === '1') {
    const am = mk(null, 0.9, '#d84a3a');
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.18, 4, 0.18), am); a.position.set(cx - cellW * 0.2, base + h + 2, cz); grp.add(a); mats2.push(am);
  }
  // 바닥 그늘
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(cellW + 0.6, cellH + 0.5), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
  ao.rotation.x = -Math.PI / 2; ao.position.set(cx + 0.15, base + 0.015, cz + 0.1); grp.add(ao);
  return { mesh: grp, x0: cellX, x1: cellX + cellW, z0: cellY + 1 - cellH, z1: cellY + 1, h, mats: [...mats, ...mats2], faded: false };
}

/** 도시 바닥 무늬 (칸 = 16px). a 차도 · h/v 가운데 점선 · z/y 횡단보도 · w 인도 · p 광장 · x 외벽 윗면. g(풀) · o(물)은 원래 그림 그대로 */
function paintUrban(cx: CanvasRenderingContext2D, surf: string[]) {
  const H = surf.length, W = surf[0]?.length ?? 0;
  const road = (c: string | undefined) => !!c && 'ahvzy'.includes(c);
  const noise = (x: number, y: number, i: number) => ((x * 73856093) ^ (y * 19349663) ^ (i * 83492791)) >>> 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = surf[y][x], px = x * 16, py = y * 16;
    if (c === 'g') continue;
    if (c === 'o') {
      // 분수 · 연못: 바닥 그림을 비워 물이 보이게 + 돌 테두리
      cx.clearRect(px, py, 16, 16);
      cx.fillStyle = '#8f8c86';
      if (surf[y - 1]?.[x] !== 'o') cx.fillRect(px, py, 16, 3);
      if (surf[y + 1]?.[x] !== 'o') cx.fillRect(px, py + 13, 16, 3);
      if (surf[y]?.[x - 1] !== 'o') cx.fillRect(px, py, 3, 16);
      if (surf[y]?.[x + 1] !== 'o') cx.fillRect(px + 13, py, 3, 16);
      continue;
    }
    if (road(c)) {
      cx.fillStyle = '#4b4e57'; cx.fillRect(px, py, 16, 16);
      for (let i = 0; i < 6; i++) { const n = noise(x, y, i); cx.fillStyle = i % 2 ? '#555864' : '#42454d'; cx.fillRect(px + (n % 15), py + ((n >>> 5) % 15), 1, 1); }
      cx.fillStyle = '#f2f2ee';
      if (c === 'h' && x % 2 === 0) cx.fillRect(px + 2, py + 7, 12, 2);
      if (c === 'v' && y % 2 === 0) cx.fillRect(px + 7, py + 2, 2, 12);
      if (c === 'z') { cx.fillRect(px + 2, py + 1, 4, 14); cx.fillRect(px + 10, py + 1, 4, 14); }
      if (c === 'y') { cx.fillRect(px + 1, py + 2, 14, 4); cx.fillRect(px + 1, py + 10, 14, 4); }
      continue;
    }
    if (c === 'w') {
      cx.fillStyle = '#cbc7bf'; cx.fillRect(px, py, 16, 16);
      cx.fillStyle = '#b3afa7'; cx.fillRect(px, py + 7, 16, 1); cx.fillRect(px, py + 15, 16, 1); cx.fillRect(px + (y % 2 ? 3 : 11), py, 1, 7); cx.fillRect(px + (y % 2 ? 11 : 3), py + 8, 1, 7);
      // 연석: 차도와 맞닿은 쪽
      cx.fillStyle = '#8f8c86';
      if (road(surf[y - 1]?.[x])) cx.fillRect(px, py, 16, 2);
      if (road(surf[y + 1]?.[x])) cx.fillRect(px, py + 14, 16, 2);
      if (road(surf[y]?.[x - 1])) cx.fillRect(px, py, 2, 16);
      if (road(surf[y]?.[x + 1])) cx.fillRect(px + 14, py, 2, 16);
      continue;
    }
    if (c === 'p') {
      cx.fillStyle = '#dcc9a6'; cx.fillRect(px, py, 16, 16);
      cx.fillStyle = (x + y) % 2 ? '#d0bb94' : '#e4d3b3'; cx.fillRect(px + 2, py + 2, 12, 12);
      cx.fillStyle = '#c4ad86'; cx.fillRect(px, py, 16, 1); cx.fillRect(px, py, 1, 16);
      continue;
    }
    if (c === 'd') {   // 자갈 · 흙 마당
      cx.fillStyle = '#8e826f'; cx.fillRect(px, py, 16, 16);
      for (let i = 0; i < 9; i++) { const n = noise(x, y, i + 9); cx.fillStyle = ['#7a6f5e', '#a3977f', '#6c6253'][i % 3]; cx.fillRect(px + (n % 14), py + ((n >>> 6) % 14), 2, 1 + (i % 2)); }
      continue;
    }
    if (c === 'x') {
      cx.fillStyle = '#9d9ca2'; cx.fillRect(px, py, 16, 16);
      cx.fillStyle = '#8a8990'; cx.fillRect(px, py + 15, 16, 1); cx.fillRect(px + (y % 2 ? 0 : 8), py + 8, 1, 7); cx.fillRect(px, py + 7, 16, 1);
    }
  }
}

/** 도시 소품 (그림 전 블록아웃): 자판기 · 신호등 */
function makeStreetProp(type: string, gx: number, gz: number, base: number) {
  const g = new THREE.Group();
  const box = (w: number, h: number, d: number, col: number, x: number, y: number, z: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: col })); m.position.set(x, y, z); g.add(m); return m; };
  if (type === 'vend') {
    box(0.8, 1.4, 0.6, 0xd8463a, gx, base + 0.7, gz - 0.35);
    box(0.62, 0.55, 0.02, 0xbfe3f2, gx, base + 0.95, gz - 0.04);
    box(0.62, 0.12, 0.02, 0x2a2a30, gx, base + 0.35, gz - 0.04);
  } else if (type === 'tlight') {
    box(0.12, 2.4, 0.12, 0x4a4d55, gx, base + 1.2, gz - 0.3);
    box(0.36, 0.9, 0.3, 0x2b2d33, gx, base + 2.3, gz - 0.3);
    box(0.18, 0.18, 0.02, 0xe0453a, gx, base + 2.56, gz - 0.14);
    box(0.18, 0.18, 0.02, 0x7a6a2a, gx, base + 2.3, gz - 0.14);
    box(0.18, 0.18, 0.02, 0x2a5a3a, gx, base + 2.04, gz - 0.14);
  }
  const ao = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
  ao.rotation.x = -Math.PI / 2; ao.position.set(gx + 0.1, base + 0.015, gz - 0.25); g.add(ao);
  return g;
}

/** 동굴 벽: 막힌 칸을 솟은 바위 덩어리로 (4세대 동굴처럼 벽이 높게 서 있음)
 *  윗면 = 그 칸의 바닥 그림, 앞면 · 옆면 = 같은 그림을 어둡게 */
function makeCaveWalls(info: MapInfo, W: number, H: number, tex: THREE.Texture, hgt = 1.6, isWall?: (x: number, y: number) => boolean) {
  const pos: number[] = [], uv: number[] = [], col: number[] = [];
  const quad = (p: number[][], q: number[][], c: number) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...p[i]); uv.push(...q[i]); col.push(c, c, c); } };
  const open = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (isWall ? !isWall(x, y) : !info.isBlocked(x, y));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (open(x, y)) continue;
    const u0 = x / W, u1 = (x + 1) / W, v0 = 1 - (y + 1) / H, v1 = 1 - y / H;
    const q = [[u0, v1], [u0, v0], [u1, v0], [u1, v1]];
    quad([[x, hgt, y], [x, hgt, y + 1], [x + 1, hgt, y + 1], [x + 1, hgt, y]], q, 0.8);
    if (open(x, y + 1)) quad([[x, hgt, y + 1], [x, 0, y + 1], [x + 1, 0, y + 1], [x + 1, hgt, y + 1]], q, 0.5);
    if (open(x - 1, y)) quad([[x, hgt, y], [x, 0, y], [x, 0, y + 1], [x, hgt, y + 1]], q, 0.38);
    if (open(x + 1, y)) quad([[x + 1, hgt, y + 1], [x + 1, 0, y + 1], [x + 1, 0, y], [x + 1, hgt, y]], q, 0.38);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }));
}

// ── 시작 ───────────────────────────────────────────────
export async function start(first = 'town') {
  document.getElementById('game')?.remove();
  const man = await (await fetch('assets/manifest.json')).json() as Manifest;
  const maps: Record<string, MapWithProps> = {};
  const getMap = async (id: string) => (maps[id] ??= await (await fetch(`assets/maps/${id}.json`)).json() as MapWithProps);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setClearColor(0x14201a);
  Object.assign(renderer.domElement.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', imageRendering: 'pixelated' });
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 400);
  const cam = { el: 45, fov: 20, dist: 30, pixel: false, stretch: true };
  // 확인용: ?dist=거리&el=각도 → 맵 전체를 내려다보는 화면 (지도 검수)
  { const q = new URLSearchParams(location.search), d = Number(q.get('dist')), e = Number(q.get('el')); if (d > 0) { cam.dist = d; camera.far = Math.max(400, d * 3); } if (e > 0) cam.el = e; }
  const resize = () => {
    renderer.setPixelRatio(cam.pixel ? 0.5 : Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    // 세로 보정: 2D 그림은 바닥과 앞면을 둘 다 1:1 로 그린 그림이라, 비스듬한 카메라로 보면 화면이 위아래로 눌려 보임
    //  → 화면 세로를 1/sin(각도) 만큼 늘려서 바닥 타일이 정사각형으로 보이게 (45° 에선 서 있는 그림도 원래 비율)
    const squash = cam.stretch ? 1 / Math.sin((cam.el * Math.PI) / 180) : 1;
    camera.aspect = (window.innerWidth / window.innerHeight) * squash; camera.fov = cam.fov; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize); resize();

  // 플레이어
  const pMeta = man.characters.m1;
  const pImg = await loadImg(pMeta.path);
  const shadowTex = pixelTex(await loadImg(man.images.shadow.path), 'shadow');
  const player = new Actor(pMeta, pixelTex(pImg, 'char:m1'), shadowTex, Math.round(pImg.height / pMeta.frameHeight));
  scene.add(player.bb.mesh, player.shadow);

  let cur: Built | null = null, curId = '';
  const back: { map: string; x: number; y: number }[] = [];
  let busy = false;
  /** 도착 지점이 워프 위여도 바로 되돌아가지 않게: 워프 밖으로 한 번 나가야 다시 작동 */
  let warpLock = true;
  const fade = document.createElement('div');
  Object.assign(fade.style, { position: 'fixed', inset: '0', background: '#000', opacity: '0', transition: 'opacity .25s', pointerEvents: 'none', zIndex: '5' });
  document.body.appendChild(fade);

  async function go(id: string, at?: { x: number; y: number } | string) {
    if (busy) return; busy = true;
    fade.style.opacity = '1'; await new Promise((r) => setTimeout(r, 250));
    try {
      const raw = await getMap(id);
      const b = await buildMap(id, man, { [id]: raw });
      if (cur) scene.remove(cur.group);
      cur = b; curId = id; scene.add(b.group);
      const sp = typeof at === 'string' ? b.info.spawns.get(at) ?? b.info.spawns.get('player') ?? b.info.spawns.get('entry') : at;
      const p = sp ?? b.info.spawns.get('player') ?? { x: raw.width * 8, y: raw.height * 8 };
      player.x = p.x; player.y = p.y + (typeof at === 'object' ? 0 : 5);
      warpLock = true;
      scene.background = new THREE.Color(b.interior || String(prop(raw, 'cave', '')) === 'true' ? 0x0d0a0c : 0x14201a);
      panel.querySelector<HTMLElement>('[data-c=where]')!.textContent = String(prop(raw, 'title', '') || NAMES[id] || regionMaps[id]?.name || id);
      history.replaceState(null, '', `?3d=${id}`);
    } catch (e) { console.error(e); }
    fade.style.opacity = '0'; busy = false;
  }

  // 입력
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === 'e' || e.key === 'E' || e.key === ' ') tryDoor(); });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => keys.clear());
  touch.mount(); touch.onKey = (k) => { if (k === 'e' || k === ' ') tryDoor(); };
  renderer.domElement.addEventListener('wheel', (e) => { cam.dist = Math.max(10, Math.min(120, cam.dist + Math.sign(e.deltaY) * 2)); }, { passive: true });

  function tryDoor() {
    if (!cur || busy) return;
    const px = player.x / T, py = player.y / T;
    const b = cur.buildings.find((o) => Math.hypot(o.door[0] + 0.5 - px, o.door[1] + 0.3 - py) < 1.4);
    if (!b) return;
    const to = String(prop(b, 'interior', '') || INTERIOR_OF[b.type] || '');
    if (!to) return;
    back.push({ map: curId, x: (b.door[0] + 0.5) * T, y: (b.door[1] + 0.9) * T });
    void go(to, 'entry');
  }

  // 화면 패널: 장소 이동 · 카메라 조절 (느낌 비교용)
  const NAMES: Record<string, string> = { town: '별빛 마을', home: '나의 집', farm: '별빛 농장', route1: '1번 도로', windvale: '바람골' };
  const KIND: Record<string, string> = { farm: '농장', town: '마을', route: '도로', cave: '동굴', area: '명소', room: '실내' };
  const regionMaps = (region as { maps: Record<string, { name: string; kind?: string }> }).maps;
  const ALL = [...Object.entries(regionMaps).map(([k, m]) => [k, `${KIND[m.kind ?? ''] ? `[${KIND[m.kind ?? '']}] ` : ''}${m.name} (${k})`] as [string, string]),
    ...(region as { interior: string[] }).interior.filter((k) => !regionMaps[k]).map((k) => [k, `[실내] ${k}`] as [string, string])];
  const panel = document.createElement('div');
  Object.assign(panel.style, { position: 'fixed', left: '10px', top: '10px', zIndex: '10', padding: '10px 12px', background: 'rgba(32,24,20,.85)', color: '#fff8ec', border: '3px solid #5e3620', borderRadius: '12px', fontFamily: 'Galmuri9, sans-serif', fontSize: '12px', lineHeight: '1.6', maxWidth: '260px' });
  panel.innerHTML = `<div style="font-size:15px;color:#ffe58a">3D 시험판 · <span data-c="where"></span></div>
    <div>${Object.entries(NAMES).map(([k, v]) => `<button data-go="${k}" style="margin:2px;padding:2px 6px;border:2px solid #a8683a;background:#fff8ec;color:#3b2414;border-radius:6px">${v}</button>`).join('')}</div>
    <select data-c="all" style="margin:2px 0 4px;max-width:236px;background:#fff8ec;color:#3b2414;border:2px solid #a8683a;border-radius:6px"><option value="">― 모든 장소 (${ALL.length}곳) ―</option>${ALL.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
    <label>카메라 각도 <input data-r="el" type="range" min="25" max="70" value="45"> <b data-v="el">45°</b></label><br>
    <label>시야(FOV) <input data-r="fov" type="range" min="5" max="60" value="20"> <b data-v="fov">20</b></label><br>
    <label><input data-r="stretch" type="checkbox" checked> 세로 보정 (찌그러짐 방지)</label><br>
    <label><input data-r="pixel" type="checkbox"> DS 도트 느낌 (낮은 해상도)</label>
    <div style="opacity:.75">WASD · 방향키 이동, Shift 달리기, E 문 열기, 휠 확대</div>`;
  document.body.appendChild(panel);
  panel.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) => { b.onclick = () => { back.length = 0; void go(b.dataset.go!); }; });
  const sel = panel.querySelector<HTMLSelectElement>('[data-c=all]')!;
  sel.onchange = () => { if (sel.value) { back.length = 0; void go(sel.value); sel.blur(); } };
  panel.querySelectorAll<HTMLInputElement>('[data-r]').forEach((r) => {
    r.oninput = () => {
      if (r.dataset.r === 'pixel') cam.pixel = r.checked;
      else if (r.dataset.r === 'stretch') cam.stretch = r.checked;
      else { (cam as Record<string, number | boolean>)[r.dataset.r!] = Number(r.value); panel.querySelector(`[data-v=${r.dataset.r}]`)!.textContent = r.dataset.r === 'el' ? `${r.value}°` : r.value; }
      resize();
    };
  });

  const at = new URLSearchParams(location.search).get('at')?.split(',').map(Number);
  await go(NAMES[first] || regionMaps[first] || (region as { interior: string[] }).interior.includes(first) ? first : 'town');
  // ?at=칸x,칸y : 시작 위치 지정 (확인용)
  if (at && at.length === 2 && at.every(Number.isFinite)) { player.x = (at[0] + 0.5) * T; player.y = (at[1] + 0.8) * T; }

  /** 카메라가 (0, gy, 0) 을 볼 때 화면 네 모서리가 땅(높이 gy)에 닿는 범위 → 맵 밖이 안 보이게 붙잡는 데 씀 */
  const tmpV = new THREE.Vector3();
  function frameOffsets(gy: number) {
    const el = (cam.el * Math.PI) / 180;
    camera.position.set(0, gy + Math.sin(el) * cam.dist, Math.cos(el) * cam.dist);
    camera.lookAt(0, gy, 0); camera.updateMatrixWorld();
    const hit = (nx: number, ny: number) => {
      tmpV.set(nx, ny, 0.5).unproject(camera).sub(camera.position).normalize();
      const t = tmpV.y < -1e-3 ? (0 - camera.position.y) / tmpV.y : 1e4;   // 가장 낮은 땅(높이 0) 기준 → 높은 길 위에 있어도 맵 밖이 안 보임
      return { x: camera.position.x + tmpV.x * t, z: camera.position.z + tmpV.z * t };
    };
    const tl = hit(-1, 1), tr = hit(1, 1), bl = hit(-1, -1);
    return { minX: tl.x, maxX: tr.x, minZ: tl.z, maxZ: bl.z };
  }

  // 루프
  let last = performance.now(), waterT = 0, swayT = 0;
  const camTarget = new THREE.Vector3(player.x / T, 0, player.y / T);
  const loop = (now: number) => {
    const dt = Math.min(50, now - last); last = now;
    if (cur) {
      // 이동: 막힌 칸 · 절벽(높이 차이) 은 못 지나감, 계단(경사로) 은 지나감
      const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
      let vx = k('d', 'arrowright') - k('a', 'arrowleft') + touch.vx, vy = k('s', 'arrowdown') - k('w', 'arrowup') + touch.vy;
      const len = Math.hypot(vx, vy);
      if (len > 0.05 && !busy) {
        vx /= len; vy /= len;
        const run = keys.has('shift') || touch.run;
        const dist = ((run ? RUN_SPEED : WALK_SPEED) * dt) / 1000;
        const ok = (nx: number, ny: number) => {
          if (!cur!.info.canStand(nx, ny)) return false;
          return Math.abs(cur!.hts.sample(nx / T, ny / T) - cur!.hts.sample(player.x / T, player.y / T)) < 0.3;
        };
        if (ok(player.x + vx * dist, player.y)) player.x += vx * dist;
        if (ok(player.x, player.y + vy * dist)) player.y += vy * dist;
        const dir: Dir = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'right' : 'left') : vy > 0 ? 'down' : 'up';
        player.play(run ? 'run' : 'walk', dir);
        // 워프 (길 끝 · 실내 출구)
        const w = cur.info.warpAt(player.x, player.y);
        if (!w) warpLock = false;
        else if (!warpLock) {
          warpLock = true;
          if (w.to === '@exit') { const r = back.pop(); void go(r?.map ?? 'farm', r ?? undefined); }
          else void go(w.to, w.spawn);
        }
      } else player.play('idle', player.dir);
      player.update(dt, cur.hts);
      // 플레이어를 가리는 높은 건물은 반투명하게 (건물이 플레이어보다 앞(남쪽)에 있고 화면에서 겹칠 때)
      { const px = player.x / T, pz = player.y / T;
        for (const b of cur.tall) {
          const hide = px > b.x0 - 0.5 && px < b.x1 + 0.5 && pz < b.z0 + 0.2 && pz > b.z0 - b.h - 1;
          if (hide !== b.faded) { b.faded = hide; for (const m of b.mats) { m.opacity = hide ? 0.32 : 1; m.depthWrite = !hide; } }
        } }
      for (const a of cur.actors) a.update(dt, cur.hts);

      waterT += dt; swayT += dt;
      if (cur.waterMat && cur.waterTex.length && waterT > 260) { waterT = 0; const i = (cur.waterTex.indexOf(cur.waterMat.map!) + 1) % cur.waterTex.length; cur.waterMat.map = cur.waterTex[i]; }
      if (swayT > 320) { swayT = 0; for (const s of cur.sway) s.tex.offset.x = (s.tex.offset.x + 1 / s.frames) % 1; }

      // 카메라: 플레이어를 부드럽게 따라감 (실내는 방 가운데 고정에 가깝게)
      const gy = player.bb.mesh.position.y;
      let tx = player.x / T, tz = player.y / T;
      // 화면 밖(맵 바깥)이 보이지 않게 카메라를 맵 안쪽에 붙잡음. 작은 실내는 방 가운데 고정 (4세대처럼)
      const W = cur.info.width, H = cur.info.height;
      const f = frameOffsets(gy);
      tx = W <= f.maxX - f.minX ? W / 2 : Math.max(-f.minX, Math.min(W - f.maxX, tx));
      tz = H <= f.maxZ - f.minZ ? (H - f.minZ - f.maxZ) / 2 : Math.max(-f.minZ, Math.min(H - f.maxZ, tz));
      camTarget.lerp(new THREE.Vector3(tx, gy, tz), 1 - Math.pow(0.001, dt / 1000));
      const el = (cam.el * Math.PI) / 180;
      camera.position.set(camTarget.x, camTarget.y + Math.sin(el) * cam.dist, camTarget.z + Math.cos(el) * cam.dist);
      camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
    }
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
