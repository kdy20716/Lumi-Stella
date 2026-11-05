// 맵 생성 공용 빌더 → Tiled 호환 JSON
//   Ground: 듀얼그리드 오토타일 (잔디/흙길/물/돌길), +8px 오프셋
//   Decor / Bridge / Collision: 셀 정렬 타일 레이어
//   Objects / Spawns / FarmPlots / Warps: 오브젝트 레이어
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { rng } from '../art/lib/img.mjs';
import { ROW, DECOR, MISC, CLIFF, TILESET_COLS, TILESET_ROWS } from '../art/tiles.mjs';

export const T = 16;
export const G = 0, D = 1, Wt = 2, S = 3; // 잔디, 흙길, 물, 돌길
export const gid = (row, col) => row * TILESET_COLS + col + 1;

export class MapBuilder {
  constructor(name, W, H, seed) {
    Object.assign(this, { name, W, H });
    this.R = rng(seed);
    this.terrain = Array.from({ length: H }, () => new Array(W).fill(G));
    this.blocked = Array.from({ length: H }, () => new Array(W).fill(false));
    this.reserved = Array.from({ length: H }, () => new Array(W).fill(false));
    this.decor = new Array(W * H).fill(0);
    this.bridge = new Array(W * H).fill(0);
    this.cliff = new Array(W * H).fill(0);   // 2.5D: 절벽 앞면 · 계단 · 턱
    this.objects = []; this.spawns = []; this.plots = []; this.warps = [];
    this.oid = 1;
    this.props = [];
  }
  inb(x, y) { return x >= 0 && y >= 0 && x < this.W && y < this.H; }
  setT(x, y, v) { if (this.inb(x, y)) this.terrain[y][x] = v; }
  reserve(x0, y0, x1, y1) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.inb(x, y)) this.reserved[y][x] = true; }
  setBridge(x, y, row, col) { if (this.inb(x, y)) this.bridge[y * this.W + x] = gid(row, col); }

  /** 2.5D 단: y <= faceY 는 윗단, 그 아래 두 줄이 절벽(위 · 아래 조각, 막힘) + 그 아래 그늘. 절벽을 지나는 길(흙 · 돌)은 계단 */
  terrace(faceY, x0 = 0, x1 = this.W - 1) {
    const f1 = faceY + 1, f2 = faceY + 2, { W } = this;
    if (!this.inb(0, f2)) return;
    const isPath = (x, y) => this.terrain[y][x] === D || this.terrain[y][x] === S;
    const kind = [];
    for (let x = x0; x <= x1; x++) {
      const water = this.terrain[f1][x] === Wt || this.terrain[f2][x] === Wt || this.bridge[f1 * W + x] || this.bridge[f2 * W + x];
      kind[x] = water ? '' : isPath(x, f1) || isPath(x, f2) ? 'stairs' : 'face';
    }
    const wall = (x) => kind[x] === 'face';
    for (let x = x0; x <= x1; x++) {
      if (!kind[x]) continue;
      for (const [y, top] of [[f1, true], [f2, false]]) {
        const i = y * W + x;
        this.reserved[y][x] = true; this.decor[i] = 0;
        if (kind[x] === 'stairs') { this.cliff[i] = gid(ROW.CLIFF, CLIFF.STAIRS); if (!isPath(x, y)) this.terrain[y][x] = S; continue; }
        const edgeL = !wall(x - 1), edgeR = !wall(x + 1), alt = (x * 7 + y) % 5 === 0;
        this.cliff[i] = gid(ROW.CLIFF, top ? (edgeL ? CLIFF.FACE_L : edgeR ? CLIFF.FACE_R : alt ? CLIFF.FACE2 : CLIFF.FACE) : (edgeL ? CLIFF.BASE_L : edgeR ? CLIFF.BASE_R : alt ? CLIFF.BASE2 : CLIFF.BASE));
        this.blocked[y][x] = true;
      }
      const s3 = (f2 + 1) * W + x;
      if (kind[x] === 'face' && this.inb(x, f2 + 1) && this.terrain[f2 + 1][x] !== Wt && !this.cliff[s3]) this.cliff[s3] = gid(ROW.CLIFF, CLIFF.SHADE);
    }
  }
  /** 턱: (x0..x1, y) 를 한 방향(아래로만) 뛰어내리는 턱으로. 양 끝 옆칸이 걸어 다닐 수 있어야 함 → 놓은 칸 수 */
  ledge(x0, x1, y) {
    const { W } = this;
    if (!this.inb(x0 - 1, y) || !this.inb(x1 + 1, y)) return 0;
    const ok = (x) => this.terrain[y][x] === G && !this.blocked[y][x] && !this.reserved[y][x] && !this.bridge[y * W + x] && !this.cliff[y * W + x];
    for (let x = x0; x <= x1; x++) if (!ok(x)) return 0;
    for (const x of [x0 - 1, x1 + 1]) if (this.blocked[y][x] || this.terrain[y][x] === Wt) return 0;
    for (const yy of [y - 1, y + 1]) for (let x = x0; x <= x1; x++) if (!this.inb(x, yy) || this.blocked[yy][x] || this.terrain[yy][x] === Wt) return 0;
    for (let x = x0; x <= x1; x++) { this.cliff[y * W + x] = gid(ROW.CLIFF, x === x0 ? CLIFF.LEDGE_L : x === x1 ? CLIFF.LEDGE_R : CLIFF.LEDGE); this.reserved[y][x] = true; this.decor[y * W + x] = 0; }
    return x1 - x0 + 1;
  }

  /** 사각 길 (수평이면 아래로 wdt, 수직이면 오른쪽으로 wdt 만큼 두께) */
  path(x0, y0, x1, y1, wdt = 2, type = D) {
    const xs = Math.min(x0, x1), xe = Math.max(x0, x1), ys = Math.min(y0, y1), ye = Math.max(y0, y1);
    for (let y = ys; y <= ye + (y0 === y1 ? wdt - 1 : 0); y++) for (let x = xs; x <= xe + (x0 === x1 ? wdt - 1 : 0); x++) {
      if (!this.inb(x, y)) continue;
      if (this.terrain[y][x] !== Wt) this.terrain[y][x] = type;
      this.reserved[y][x] = true;
    }
  }
  /** 길 가장자리를 자연스럽게 */
  roughen(type, prob = 0.35) {
    const t = this.terrain;
    for (let y = 1; y < this.H - 1; y++) for (let x = 1; x < this.W - 1; x++) {
      if (t[y][x] !== G) continue;
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => t[y + dy][x + dx] === type).length;
      if (n >= 2 && this.R() < prob) { t[y][x] = type; this.reserved[y][x] = true; }
    }
  }
  ellipse(cx, cy, rx, ry, type, wobble = 0.08) {
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const wob = Math.sin(Math.atan2(dy, dx) * 3 + 1) * wobble;
      if (dx * dx + dy * dy < 1 + wob) this.setT(x, y, type);
    }
  }

  /** 오브젝트 배치. 앵커 셀 (cx, cy) = 발이 닿는 가장 아래 왼쪽 셀, w×h 셀 점유 */
  place(type, cx, cy, { w = 1, h = 1, block = true, props = {}, force = false } = {}) {
    if (!force) for (let y = cy - h + 1; y <= cy; y++) for (let x = cx; x < cx + w; x++) if (!this.inb(x, y) || this.blocked[y][x] || this.reserved[y][x] || this.terrain[y][x] !== G) return false;
    if (block) for (let y = cy - h + 1; y <= cy; y++) for (let x = cx; x < cx + w; x++) if (this.inb(x, y)) this.blocked[y][x] = true;
    const p = { cellX: cx, cellY: cy, cellW: w, cellH: h, ...props };
    this.objects.push({
      id: this.oid++, name: type, type, x: (cx + w / 2) * T, y: (cy + 1) * T, width: 0, height: 0, rotation: 0, visible: true, point: true,
      properties: Object.entries(p).map(([name, value]) => ({ name, type: typeof value === 'number' ? 'int' : 'string', value })),
    });
    return true;
  }
  spawn(name, cx, cy, props = {}) {
    this.spawns.push({ id: this.oid++, name, type: 'spawn', x: cx * T + 8, y: cy * T + 8, width: 0, height: 0, rotation: 0, visible: true, point: true, properties: Object.entries(props).map(([n, v]) => ({ name: n, type: 'string', value: String(v) })) });
  }
  plot(name, x, y, w, h, crop, stage, watered = 0) {
    this.plots.push({ id: this.oid++, name, type: 'plot', x: x * T, y: y * T, width: w * T, height: h * T, rotation: 0, visible: true, properties: [{ name: 'crop', type: 'string', value: crop }, { name: 'stage', type: 'int', value: stage }, { name: 'watered', type: 'int', value: watered }] });
  }
  /** 다른 맵으로 넘어가는 영역 (셀 단위) */
  warp(x, y, w, h, to, spawn, extra = {}) {
    this.warps.push({ id: this.oid++, name: `to_${to}`, type: 'warp', x: x * T, y: y * T, width: w * T, height: h * T, rotation: 0, visible: true, properties: [{ name: 'to', type: 'string', value: to }, { name: 'spawn', type: 'string', value: spawn }, ...Object.entries(extra).map(([name, value]) => ({ name, type: 'string', value: String(value) }))] });
  }

  /** 숲 테두리: gap(x,y) 가 true 인 곳은 비움 */
  forest(gap = () => false, topExtra = 0.25, trees = null) {
    const { W, H } = this;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      if (edge > (y < 6 ? 4 : 3) || gap(x, y)) continue;
      const p = (edge === 0 ? 0.95 : edge === 1 ? 0.7 : edge === 2 ? 0.4 : 0.15) + (y < 6 ? topExtra : 0);
      if ((x + y * 3) % 2 === 0 && this.R() < p) {
        if (!this.inb(x, y) || this.reserved[y][x] || this.terrain[y][x] !== G || this.blocked[y][x]) continue;
        const type = trees ? trees[Math.floor(this.R() * trees.length)] : this.R() < 0.55 ? 'pine' : (this.R() < 0.2 ? 'oak_apple' : 'oak');
        this.place(type, x, y, { props: { frameOffset: Math.floor(this.R() * 4) } });
      }
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.min(x, y, W - 1 - x, H - 1 - y) === 0 && !gap(x, y)) this.blocked[y][x] = true;
  }
  scatter(type, count, opts = {}) {
    let n = 0, tries = 0;
    while (n < count && tries++ < 4000) {
      const x = 3 + Math.floor(this.R() * (this.W - 6)), y = 4 + Math.floor(this.R() * (this.H - 8));
      let ok = true;
      for (let yy = y - 1; yy <= y + 1 && ok; yy++) for (let xx = x - 1; xx <= x + (opts.w ?? 1); xx++) if (!this.inb(xx, yy) || this.blocked[yy][xx] || this.reserved[yy][xx] || this.terrain[yy][xx] !== G) ok = false;
      if (!ok) continue;
      if (this.place(type, x, y, { ...opts, props: { frameOffset: Math.floor(this.R() * 4), ...(opts.props ?? {}) } })) n++;
    }
  }
  flowers(clusters, allow = () => false) {
    const R = this.R;
    for (let k = 0; k < clusters; k++) {
      const cx = 3 + Math.floor(R() * (this.W - 6)), cy = 4 + Math.floor(R() * (this.H - 8)), kind = Math.floor(R() * 7);
      for (let i = 0; i < 6; i++) {
        const x = cx + Math.floor(R() * 4) - 1, y = cy + Math.floor(R() * 3) - 1;
        if (!this.inb(x, y) || this.terrain[y][x] !== G || this.blocked[y][x] || (this.reserved[y][x] && !allow(x, y)) || this.bridge[y * this.W + x]) continue;
        this.decor[y * this.W + x] = gid(ROW.DECOR, R() < 0.8 ? (kind < 6 ? DECOR.FLOWER0 + kind : DECOR.DAISY) : DECOR.CLOVER0 + Math.floor(R() * 2));
      }
    }
  }
  sprinkle(n) {
    const R = this.R, kinds = [DECOR.PEBBLE0, DECOR.PEBBLE0 + 1, DECOR.CLOVER0, DECOR.CLOVER0 + 1, DECOR.GRASS_DARK, DECOR.MUSHROOM, DECOR.LEAVES, DECOR.STONES];
    for (let i = 0; i < n; i++) {
      const x = Math.floor(R() * this.W), y = Math.floor(R() * this.H), k = y * this.W + x;
      if (this.terrain[y][x] === G && !this.blocked[y][x] && !this.decor[k]) this.decor[k] = gid(ROW.DECOR, kinds[Math.floor(R() * kinds.length)]);
      else if (this.terrain[y][x] === D && !this.decor[k] && R() < 0.4) this.decor[k] = gid(ROW.DECOR, DECOR.PATCH);
    }
  }

  build() {
    const { W, H, terrain, blocked, bridge } = this;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terrain[y][x] === Wt && !bridge[y * W + x]) blocked[y][x] = true;
    const collision = blocked.flat().map((b) => (b ? gid(ROW.MISC, MISC.COLLIDE) : 0));
    const cell = (x, y) => terrain[Math.min(H - 1, Math.max(0, y))][Math.min(W - 1, Math.max(0, x))];
    const mask = (c, v) => c.reduce((a, t, k) => a | ((t === v ? 1 : 0) << (3 - k)), 0);
    const ground = [];
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const c = [cell(i, j), cell(i + 1, j), cell(i, j + 1), cell(i + 1, j + 1)];
      const v = (i % 4) + (j % 4) * 4;
      if (c.includes(Wt)) ground.push(gid(ROW.GRASS_WATER, mask(c, Wt)));
      else if (c.includes(S)) { const m = mask(c, S); ground.push(m === 15 ? gid(ROW.STONE, v) : gid(ROW.GRASS_STONE, m)); }
      else if (c.includes(D)) { const m = mask(c, D); ground.push(m === 15 ? gid(ROW.DIRT, v) : gid(ROW.GRASS_DIRT, m)); }
      else ground.push(gid(ROW.GRASS, v));
    }
    const tileLayer = (id, name, data, extra = {}) => ({ id, name, type: 'tilelayer', width: W, height: H, x: 0, y: 0, opacity: 1, visible: true, data, ...extra });
    const objLayer = (id, name, objs) => ({ id, name, type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: objs });
    return {
      type: 'map', version: '1.10', tiledversion: '1.10.2', orientation: 'orthogonal', renderorder: 'right-down',
      width: W, height: H, tilewidth: T, tileheight: T, infinite: false, nextlayerid: 10, nextobjectid: this.oid,
      properties: [
        { name: 'name', type: 'string', value: this.name }, { name: 'groundOffset', type: 'int', value: 8 },
        { name: 'terrain', type: 'string', value: terrain.map((r) => r.join('')).join('|') }, ...this.props,
      ],
      tilesets: [{ firstgid: 1, name: 'tileset', image: '../tiles/tileset.png', imagewidth: TILESET_COLS * T, imageheight: TILESET_ROWS * T, tilewidth: T, tileheight: T, columns: TILESET_COLS, tilecount: TILESET_COLS * TILESET_ROWS, margin: 0, spacing: 0 }],
      layers: [
        tileLayer(1, 'Ground', this.noGround ? ground.map(() => 0) : ground, { offsetx: 8, offsety: 8 }),
        tileLayer(2, 'Decor', this.decor),
        tileLayer(3, 'Bridge', bridge),
        ...(this.cliff.some(Boolean) ? [tileLayer(9, 'Cliff', this.cliff)] : []),
        tileLayer(4, 'Collision', collision, { visible: false }),
        objLayer(5, 'Objects', this.objects),
        objLayer(6, 'Spawns', this.spawns),
        objLayer(7, 'FarmPlots', this.plots),
        objLayer(8, 'Warps', this.warps),
      ],
    };
  }
  write(path) {
    const map = this.build();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(map));
    const counts = this.objects.reduce((a, o) => ((a[o.type] = (a[o.type] ?? 0) + 1), a), {});
    console.log(`✔ ${this.name} ${this.W}x${this.H} → ${path}`);
    console.log('  오브젝트:', JSON.stringify(counts));
  }
}
