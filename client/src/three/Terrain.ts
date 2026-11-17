// 3D 지형: 2D 타일맵(Tiled JSON)을 그대로 읽어서 높이가 있는 지형으로 바꿈
//  - 절벽 줄(타일셋 11번째 줄)의 벽 · 계단 · 턱 타일을 보고 칸마다 높이를 계산
//  - 벽 칸은 위쪽 땅을 앞으로 늘려 덮고, 높이 차이가 나는 모서리에 세로 벽(절벽 면)을 세움
//  - 계단 칸은 위아래를 잇는 경사로 → 걸어서 오르내림
//  좌표: 1칸 = 1 단위. x = 타일 x, z = 타일 y, y = 높이 (위쪽 +)
import * as THREE from 'three';
import { Heights, computeHeights, type CellShape } from '@shared/sim/Heights';

export { Heights, computeHeights, type CellShape };

type GeoBuf = { pos: number[]; uv: number[]; col: number[] };

function pushQuad(b: GeoBuf, p: number[][], uv: number[][], shade: number) {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    b.pos.push(...p[i]);
    b.uv.push(...uv[i]);
    b.col.push(shade, shade, shade);
  }
}

function makeTerrainSubMesh(b: GeoBuf, tex: THREE.Texture) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  return new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({
      map: tex,
      vertexColors: true,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 2,
      polygonOffsetUnits: 2,
    }),
  );
}

/** 지형 메시: 윗면(바닥 그림) + 높이 차이 모서리의 세로 면 */
export function buildTerrainMesh(hts: Heights, groundTex: THREE.Texture, faceTex: THREE.Texture, faceUV: [number, number, number, number]) {
  const W = hts.w, H = hts.h;
  const top: GeoBuf = { pos: [], uv: [], col: [] };
  const art: GeoBuf = { pos: [], uv: [], col: [] };   // 바닥 그림의 절벽 부분을 세로 면에
  const gen: GeoBuf = { pos: [], uv: [], col: [] };   // 일반 절벽 무늬
  const u = (x: number) => x / W, v = (y: number) => 1 - y / H;   // 바닥 캔버스 UV (flipY)

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = hts.at(x, y);
    // 윗면: 벽 칸은 위쪽 땅 그림을 빌려 씀
    const sy = c.kind === 'wall' || c.kind === 'ledge' ? Math.max(0, c.uvY ?? y) : y;
    pushQuad(top, [[x, c.nw, y], [x, c.sw, y + 1], [x + 1, c.se, y + 1], [x + 1, c.ne, y]],
      [[u(x), v(sy)], [u(x), v(sy + 1)], [u(x + 1), v(sy + 1)], [u(x + 1), v(sy)]], c.kind === 'stairs' ? 0.96 : 1);
  }

  // 세로 면: 칸의 각 변에서 이웃보다 높으면 그 차이만큼 벽을 세움
  const EPS = 0.01;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = hts.at(x, y);
    if (c.openUnder) continue;
    const sides: { nb: CellShape | null; a: [number, number]; b: [number, number]; ha: number; hb: number; na: number; nbh: number; dir: 's' | 'n' | 'e' | 'w' }[] = [];
    const S = y < H - 1 ? hts.at(x, y + 1) : null, N = y > 0 ? hts.at(x, y - 1) : null;
    const E = x < W - 1 ? hts.at(x + 1, y) : null, Wn = x > 0 ? hts.at(x - 1, y) : null;
    if (S) sides.push({ nb: S, a: [x + 1, y + 1], b: [x, y + 1], ha: c.se, hb: c.sw, na: S.ne, nbh: S.nw, dir: 's' });
    if (N) sides.push({ nb: N, a: [x, y], b: [x + 1, y], ha: c.nw, hb: c.ne, na: N.sw, nbh: N.se, dir: 'n' });
    if (E) sides.push({ nb: E, a: [x + 1, y], b: [x + 1, y + 1], ha: c.ne, hb: c.se, na: E.nw, nbh: E.sw, dir: 'e' });
    if (Wn) sides.push({ nb: Wn, a: [x, y + 1], b: [x, y], ha: c.sw, hb: c.nw, na: Wn.se, nbh: Wn.ne, dir: 'w' });
    for (const s of sides) {
      if (s.ha <= s.na + EPS && s.hb <= s.nbh + EPS) continue;
      const lo1 = Math.min(s.na, s.ha), lo2 = Math.min(s.nbh, s.hb);
      const p = [[s.a[0], s.ha, s.a[1]], [s.a[0], lo1, s.a[1]], [s.b[0], lo2, s.b[1]], [s.b[0], s.hb, s.b[1]]];
      const shade = s.dir === 's' ? 0.92 : s.dir === 'n' ? 0.55 : 0.72;
      // 남쪽(카메라 쪽) 면이고 원래 2D 절벽 그림이 있는 칸이면 그 그림을 그대로 붙임
      if (s.dir === 's' && (c.kind === 'wall' || c.kind === 'ledge') && c.runTop != null && c.runBot != null) {
        const span = c.runTop - c.runBot || 1, y0 = (c.uvY ?? y) + 1, rows = c.runRows ?? 1;
        const vy = (hh: number) => v(y0 + ((c.runTop! - hh) / span) * rows);
        pushQuad(art, p, [[u(s.a[0]), vy(s.ha)], [u(s.a[0]), vy(lo1)], [u(s.b[0]), vy(lo2)], [u(s.b[0]), vy(s.hb)]], shade);
      } else {
        const [u0, v0, u1, v1] = faceUV;   // 절벽 면 타일 하나를 면 전체에
        pushQuad(gen, p, [[u0, v0], [u0, v1], [u1, v1], [u1, v0]], shade * 0.9);
      }
    }
  }

  const group = new THREE.Group();
  group.add(makeTerrainSubMesh(top, groundTex), makeTerrainSubMesh(art, groundTex), makeTerrainSubMesh(gen, faceTex));
  return group;
}

/** 맵 경계 바깥을 넉넉히 연장해 카메라 가장자리에서 검은 빈공간(끊김)이 보이지 않게 하는 외곽 지형 스커트 */
export function buildOuterSkirt(
  hts: Heights,
  groundTex: THREE.Texture,
  faceTex: THREE.Texture,
  faceUV: [number, number, number, number],
  opts?: { cave?: boolean; margin?: number; isWall?: (bx: number, by: number) => boolean },
) {
  const W = hts.w, H = hts.h;
  const M = opts?.margin ?? 22;
  const wallBump = (bx: number, by: number) => (!opts?.cave ? 0 : !opts.isWall || opts.isWall(bx, by) ? 1.6 : 0);
  const top: GeoBuf = { pos: [], uv: [], col: [] };
  const cliff: GeoBuf = { pos: [], uv: [], col: [] };
  const u = (x: number) => x / W, v = (y: number) => 1 - y / H;
  const inside = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H;

  const sampleCorners = (x: number, y: number) => {
    const bx = Math.max(0, Math.min(W - 1, x)), by = Math.max(0, Math.min(H - 1, y));
    if (inside(x, y)) return hts.at(bx, by);
    const c = hts.at(bx, by);
    const bump = wallBump(bx, by);
    let nw = c.nw, ne = c.ne, sw = c.sw, se = c.se;
    if (x < 0 && y < 0) nw = ne = sw = se = hts.at(0, 0).nw;
    else if (x >= W && y < 0) nw = ne = sw = se = hts.at(W - 1, 0).ne;
    else if (x < 0 && y >= H) nw = ne = sw = se = hts.at(0, H - 1).sw;
    else if (x >= W && y >= H) nw = ne = sw = se = hts.at(W - 1, H - 1).se;
    else if (x < 0) { ne = nw = c.nw; se = sw = c.sw; }
    else if (x >= W) { nw = ne = c.ne; sw = se = c.se; }
    else if (y < 0) { sw = nw = c.nw; se = ne = c.ne; }
    else { nw = sw = c.sw; ne = se = c.se; }
    return { nw: nw + bump, ne: ne + bump, sw: sw + bump, se: se + bump, bx, by, base: c };
  };

  const EPS = 0.01;
  const [u0, v0, u1, v1] = faceUV;
  for (let y = -M; y < H + M; y++) for (let x = -M; x < W + M; x++) {
    if (inside(x, y)) continue;
    const sc = sampleCorners(x, y) as { nw: number; ne: number; sw: number; se: number; bx: number; by: number; base: CellShape };
    const sy = sc.base.kind === 'wall' || sc.base.kind === 'ledge' ? Math.max(0, sc.base.uvY ?? sc.by) : sc.by;
    const bx = sc.bx;
    pushQuad(
      top,
      [[x, sc.nw, y], [x, sc.sw, y + 1], [x + 1, sc.se, y + 1], [x + 1, sc.ne, y]],
      [[u(bx), v(sy)], [u(bx), v(sy + 1)], [u(bx + 1), v(sy + 1)], [u(bx + 1), v(sy)]],
      opts?.cave ? 0.78 : 1,
    );

    const sides: { nx: number; ny: number; a: [number, number]; b: [number, number]; ha: number; hb: number; dir: 's' | 'n' | 'e' | 'w' }[] = [
      { nx: x, ny: y + 1, a: [x + 1, y + 1], b: [x, y + 1], ha: sc.se, hb: sc.sw, dir: 's' },
      { nx: x, ny: y - 1, a: [x, y], b: [x + 1, y], ha: sc.nw, hb: sc.ne, dir: 'n' },
      { nx: x + 1, ny: y, a: [x + 1, y], b: [x + 1, y + 1], ha: sc.ne, hb: sc.se, dir: 'e' },
      { nx: x - 1, ny: y, a: [x, y + 1], b: [x, y], ha: sc.sw, hb: sc.nw, dir: 'w' },
    ];
    for (const s of sides) {
      if (s.nx < -M || s.nx >= W + M || s.ny < -M || s.ny >= H + M) continue;
      const nb = sampleCorners(s.nx, s.ny);
      const na = s.dir === 's' ? nb.ne : s.dir === 'n' ? nb.sw : s.dir === 'e' ? nb.nw : nb.se;
      const nbh = s.dir === 's' ? nb.nw : s.dir === 'n' ? nb.se : s.dir === 'e' ? nb.sw : nb.ne;
      if (s.ha <= na + EPS && s.hb <= nbh + EPS) continue;
      const lo1 = Math.min(na, s.ha), lo2 = Math.min(nbh, s.hb);
      const p = [[s.a[0], s.ha, s.a[1]], [s.a[0], lo1, s.a[1]], [s.b[0], lo2, s.b[1]], [s.b[0], s.hb, s.b[1]]];
      const shade = (s.dir === 's' ? 0.92 : s.dir === 'n' ? 0.55 : 0.72) * (opts?.cave ? 0.65 : 0.9);
      pushQuad(cliff, p, [[u0, v0], [u0, v1], [u1, v1], [u1, v0]], shade);
    }
  }

  const group = new THREE.Group();
  group.add(makeTerrainSubMesh(top, groundTex));
  if (cliff.pos.length) group.add(makeTerrainSubMesh(cliff, faceTex));
  return group;
}
