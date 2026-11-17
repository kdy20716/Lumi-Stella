// 포켓몬 5세대 / 쯔꾸르 스타일 2.5D 실내 디오라마 · 3D 입체 가구 빌더 (Stage3D · Proto3D 공용)
import * as THREE from 'three';
import type { MapInfo, TiledObject } from '@shared/sim/MapInfo';
import { prop } from '@shared/sim/MapInfo';
import type { Heights } from '@shared/sim/Heights';

type GeoBuf = { pos: number[]; uv: number[]; col: number[] };

function newBuf(): GeoBuf {
  return { pos: [], uv: [], col: [] };
}

const _tmpCol = new THREE.Color();

function hexRgb(hex: number): [number, number, number] {
  _tmpCol.setHex(hex, THREE.SRGBColorSpace);
  return [_tmpCol.r, _tmpCol.g, _tmpCol.b];
}

function mulRgb([r, g, b]: [number, number, number], k: number): [number, number, number] {
  return [Math.min(1, r * k), Math.min(1, g * k), Math.min(1, b * k)];
}

function pushQuadCol(
  b: GeoBuf,
  p: [number, number, number][],
  uv: [number, number][],
  rgb: [number, number, number],
) {
  for (const i of [0, 1, 2, 0, 2, 3]) {
    b.pos.push(p[i][0], p[i][1], p[i][2]);
    b.uv.push(uv[i][0], uv[i][1]);
    b.col.push(rgb[0], rgb[1], rgb[2]);
  }
}

function pushTriCol(
  b: GeoBuf,
  p: [number, number, number][],
  uv: [number, number][],
  rgb: [number, number, number],
) {
  for (const i of [0, 1, 2]) {
    b.pos.push(p[i][0], p[i][1], p[i][2]);
    b.uv.push(uv[i][0], uv[i][1]);
    b.col.push(rgb[0], rgb[1], rgb[2]);
  }
}

function bufToMesh(b: GeoBuf, mat: THREE.Material): THREE.Mesh | null {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  return new THREE.Mesh(g, mat);
}

/** 6면 직육면체: 각 면은 음영 계수가 다르게 적용되고, 앞면·윗면 등은 선택적으로 스프라이트 UV 매핑 */
function pushBoxSolid(
  b: GeoBuf,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  baseHex: number,
  sides = { top: 1.08, bot: 0.55, front: 0.96, back: 0.65, left: 0.84, right: 0.72 },
) {
  const c = hexRgb(baseHex);
  const zUv: [number, number][] = [[0, 1], [0, 0], [1, 0], [1, 1]];
  // 앞(+Z)
  pushQuadCol(b, [[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]], zUv, mulRgb(c, sides.front));
  // 위(+Y)
  pushQuadCol(b, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], zUv, mulRgb(c, sides.top));
  // 왼(-X)
  pushQuadCol(b, [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], zUv, mulRgb(c, sides.left));
  // 오른(+X)
  pushQuadCol(b, [[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]], zUv, mulRgb(c, sides.right));
  // 뒤(-Z)
  pushQuadCol(b, [[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]], zUv, mulRgb(c, sides.back));
  // 아래(-Y)
  if (y0 > 0.02) {
    pushQuadCol(b, [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], zUv, mulRgb(c, sides.bot));
  }
}

/** 텍스처의 픽셀 사각형 [px0..px1] × [py0..py1] 을 수직 앞면(+Z)으로 배치 */
function pushTexRectFront(
  b: GeoBuf,
  imgW: number,
  imgH: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  px0: number,
  py0: number,
  px1: number,
  py1: number,
  shade = 1,
) {
  const u0 = px0 / imgW, u1 = px1 / imgW;
  const vT = 1 - py0 / imgH, vB = 1 - py1 / imgH;
  pushQuadCol(
    b,
    [[x0, y1, z], [x0, y0, z], [x1, y0, z], [x1, y1, z]],
    [[u0, vT], [u0, vB], [u1, vB], [u1, vT]],
    [shade, shade, shade],
  );
}

/** 텍스처의 픽셀 사각형 [px0..px1] × [py0..py1] 을 수평 윗면(+Y)으로 눕혀 배치 (위쪽 py0가 -Z(북), 아래쪽 py1가 +Z(남)) */
function pushTexRectTop(
  b: GeoBuf,
  imgW: number,
  imgH: number,
  x0: number,
  x1: number,
  y: number,
  z0: number,
  z1: number,
  px0: number,
  py0: number,
  px1: number,
  py1: number,
  shade = 1,
) {
  const u0 = px0 / imgW, u1 = px1 / imgW;
  const vN = 1 - py0 / imgH, vS = 1 - py1 / imgH;
  pushQuadCol(
    b,
    [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]],
    [[u0, vN], [u0, vS], [u1, vS], [u1, vN]],
    [shade, shade, shade],
  );
}

/** N각 원기둥(바렐 · 스툴 · 맷돌 · 전등갓 등)을 GeoBuf에 추가 */
function pushPrism(
  b: GeoBuf,
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  rBot: number,
  rTop: number,
  segs: number,
  colHex: number,
  capTop = true,
) {
  const c = hexRgb(colHex);
  const uv: [number, number][] = [[0, 1], [0, 0], [1, 0], [1, 1]];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const x0b = cx + Math.cos(a0) * rBot, z0b = cz + Math.sin(a0) * rBot;
    const x1b = cx + Math.cos(a1) * rBot, z1b = cz + Math.sin(a1) * rBot;
    const x0t = cx + Math.cos(a0) * rTop, z0t = cz + Math.sin(a0) * rTop;
    const x1t = cx + Math.cos(a1) * rTop, z1t = cz + Math.sin(a1) * rTop;
    const mid = (a0 + a1) * 0.5;
    // 남(+Z)·서(-X)쪽을 살짝 밝게, 동·북쪽을 어둡게 입체 음영
    const shade = 0.72 + 0.28 * Math.max(-0.6, Math.sin(mid) * 0.7 - Math.cos(mid) * 0.3);
    pushQuadCol(b, [[x1t, y1, z1t], [x1b, y0, z1b], [x0b, y0, z0b], [x0t, y1, z0t]], uv, mulRgb(c, shade));
    if (capTop) {
      pushTriCol(
        b,
        [[cx, y1, cz], [x1t, y1, z1t], [x0t, y1, z0t]],
        [[0.5, 0.5], [0, 0], [1, 0]],
        mulRgb(c, 1.06),
      );
    }
  }
}

const roomSideCache = new WeakMap<HTMLImageElement | HTMLCanvasElement, { trimHex: number; sideTex: THREE.CanvasTexture }>();

function extractRoomColors(
  bgImg: HTMLImageElement | HTMLCanvasElement | null,
  kTiles: number,
  W: number,
  T = 16,
): { trimHex: number; sideTex: THREE.Texture | null } {
  if (!bgImg) return { trimHex: 0x3a2418, sideTex: null };
  const hit = roomSideCache.get(bgImg);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  cv.width = bgImg.width;
  cv.height = bgImg.height;
  const cx = cv.getContext('2d')!;
  cx.drawImage(bgImg, 0, 0);

  const px = cx.getImageData(2, 2, 1, 1).data;
  const trimHex = (px[0] << 16) | (px[1] << 8) | px[2];

  // 뒷벽 타일(x=1..W-2) 중 창문/그림이 없는 가장 무늬가 단정한 벽지 슬라이스(16px × k*16px) 선택
  const wh = Math.max(16, kTiles * T);
  let bestCol = 1;
  let bestScore = Infinity;
  for (let col = 1; col < Math.max(2, W - 1); col++) {
    const imgData = cx.getImageData(col * T, 4, T, Math.max(8, wh - 16)).data;
    // 세로 중심 대역의 색상 분산(무늬가 단순한 순수 벽지일수록 낮음)
    let rSum = 0, gSum = 0, bSum = 0, cnt = imgData.length / 4;
    for (let i = 0; i < imgData.length; i += 4) { rSum += imgData[i]; gSum += imgData[i + 1]; bSum += imgData[i + 2]; }
    const rm = rSum / cnt, gm = gSum / cnt, bm = bSum / cnt;
    let varSum = 0;
    for (let i = 0; i < imgData.length; i += 4) {
      varSum += Math.abs(imgData[i] - rm) + Math.abs(imgData[i + 1] - gm) + Math.abs(imgData[i + 2] - bm);
    }
    const avgVar = varSum / cnt;
    if (avgVar < bestScore) {
      bestScore = avgVar;
      bestCol = col;
    }
  }

  const sideCv = document.createElement('canvas');
  sideCv.width = T;
  sideCv.height = wh;
  const scx = sideCv.getContext('2d')!;
  scx.drawImage(cv, bestCol * T, 0, T, wh, 0, 0, T, wh);
  const sideTex = new THREE.CanvasTexture(sideCv);
  sideTex.magFilter = THREE.NearestFilter;
  sideTex.minFilter = THREE.NearestFilter;
  sideTex.colorSpace = THREE.SRGBColorSpace;
  sideTex.wrapS = THREE.RepeatWrapping;
  sideTex.wrapT = THREE.ClampToEdgeWrapping;

  const res = { trimHex, sideTex };
  roomSideCache.set(bgImg, res);
  return res;
}

/**
 * 2.5D 실내 디오라마 방 전체(바닥 · 북/좌/우 3D 벽 · 문 컷어웨이 앞턱 · 3D 벽난로)를 생성한다.
 * 바닥 여백 테두리(0..1, W-1..W)를 평면에서 깎아내고 실제 수직 3D 벽면으로 감싸 쯔꾸르/5세대풍 미니어처 룸을 구현한다.
 */
export function buildInteriorRoom3D(
  info: MapInfo,
  groundTex: THREE.Texture,
  bgImg: HTMLImageElement | HTMLCanvasElement | null,
  kRows: number,
  tileSize = 16,
  hts?: Heights,
): THREE.Group {
  const W = info.width, H = info.height;
  const k = Math.max(1, Math.min(4, kRows));
  const grp = new THREE.Group();
  const { trimHex, sideTex } = extractRoomColors(bgImg, k, W, tileSize);

  const x0 = 1, x1 = Math.max(2, W - 1), z0 = k, z1 = Math.max(k + 1, H - 1);
  const innerW = x1 - x0, innerD = z1 - z0;
  const doorCols = Array.from({ length: W }, (_, x) => x).filter((x) => x > 0 && x < W - 1 && !info.isBlocked(x, H - 1));

  // 1) 안쪽 바닥(단차·경사로 지원) + 문턱 바닥
  const floorBuf = newBuf();
  const sideStepBuf = newBuf();
  const u = (x: number) => x / W;
  const v = (z: number) => 1 - z / H;
  let hasElev = false;
  if (hts) {
    for (let z = z0; z < z1 && !hasElev; z++) for (let x = x0; x < x1; x++) {
      const c = hts.at(x, z);
      if (Math.abs(c.nw) > 0.01 || Math.abs(c.ne) > 0.01 || Math.abs(c.sw) > 0.01 || Math.abs(c.se) > 0.01) { hasElev = true; break; }
    }
  }
  if (!hasElev || !hts) {
    pushQuadCol(
      floorBuf,
      [[x0, 0, z0], [x0, 0, z1], [x1, 0, z1], [x1, 0, z0]],
      [[u(x0), v(z0)], [u(x0), v(z1)], [u(x1), v(z1)], [u(x1), v(z0)]],
      [1, 1, 1],
    );
  } else {
    const EPS = 0.01;
    const zUv: [number, number][] = [[0, 1], [0, 0], [1, 0], [1, 1]];
    const wallRgb = mulRgb(hexRgb(trimHex), 1.35);
    const stepCol = (f: number) => mulRgb(wallRgb, f);
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      const c = hts.at(x, z);
      pushQuadCol(
        floorBuf,
        [[x, c.nw, z], [x, c.sw, z + 1], [x + 1, c.se, z + 1], [x + 1, c.ne, z]],
        [[u(x), v(z)], [u(x), v(z + 1)], [u(x + 1), v(z + 1)], [u(x + 1), v(z)]],
        [1, 1, 1],
      );
      const nbS = z + 1 < z1 ? hts.at(x, z + 1) : { nw: 0, ne: 0, sw: 0, se: 0 };
      const nbN = z - 1 >= z0 ? hts.at(x, z - 1) : { nw: 0, ne: 0, sw: 0, se: 0 };
      const nbE = x + 1 < x1 ? hts.at(x + 1, z) : { nw: 0, ne: 0, sw: 0, se: 0 };
      const nbW = x - 1 >= x0 ? hts.at(x - 1, z) : { nw: 0, ne: 0, sw: 0, se: 0 };
      if (c.sw > nbS.nw + EPS || c.se > nbS.ne + EPS) {
        const lo1 = Math.min(nbS.nw, c.sw), lo2 = Math.min(nbS.ne, c.se);
        pushQuadCol(sideStepBuf, [[x, c.sw, z + 1], [x, lo1, z + 1], [x + 1, lo2, z + 1], [x + 1, c.se, z + 1]], zUv, stepCol(0.95));
      }
      if (c.ne > nbN.se + EPS || c.nw > nbN.sw + EPS) {
        const lo1 = Math.min(nbN.se, c.ne), lo2 = Math.min(nbN.sw, c.nw);
        pushQuadCol(sideStepBuf, [[x + 1, c.ne, z], [x + 1, lo1, z], [x, lo2, z], [x, c.nw, z]], zUv, stepCol(0.65));
      }
      if (c.se > nbE.sw + EPS || c.ne > nbE.nw + EPS) {
        const lo1 = Math.min(nbE.sw, c.se), lo2 = Math.min(nbE.nw, c.ne);
        pushQuadCol(sideStepBuf, [[x + 1, c.se, z + 1], [x + 1, lo1, z + 1], [x + 1, lo2, z], [x + 1, c.ne, z]], zUv, stepCol(0.76));
      }
      if (c.nw > nbW.ne + EPS || c.sw > nbW.se + EPS) {
        const lo1 = Math.min(nbW.ne, c.nw), lo2 = Math.min(nbW.se, c.sw);
        pushQuadCol(sideStepBuf, [[x, c.nw, z], [x, lo1, z], [x, lo2, z + 1], [x, c.sw, z + 1]], zUv, stepCol(0.84));
      }
    }
  }
  for (const dx of doorCols) {
    pushQuadCol(
      floorBuf,
      [[dx, 0, H - 1], [dx, 0, H], [dx + 1, 0, H], [dx + 1, 0, H - 1]],
      [[u(dx), v(H - 1)], [u(dx), v(H)], [u(dx + 1), v(H)], [u(dx + 1), v(H - 1)]],
      [0.95, 0.95, 0.95],
    );
  }
  const fMesh = bufToMesh(floorBuf, new THREE.MeshBasicMaterial({ map: groundTex, vertexColors: true, alphaTest: 0.45 }));
  if (fMesh) grp.add(fMesh);
  const stMesh = bufToMesh(sideStepBuf, new THREE.MeshBasicMaterial({ vertexColors: true }));
  if (stMesh) grp.add(stMesh);

  // 2) 북쪽(뒷) 벽
  const backBuf = newBuf();
  pushQuadCol(
    backBuf,
    [[x0, k, z0], [x0, 0, z0], [x1, 0, z0], [x1, k, z0]],
    [[u(x0), v(0)], [u(x0), v(k)], [u(x1), v(k)], [u(x1), v(0)]],
    [0.97, 0.97, 0.97],
  );
  const bMesh = bufToMesh(backBuf, new THREE.MeshBasicMaterial({ map: groundTex, vertexColors: true }));
  if (bMesh) grp.add(bMesh);

  // 3) 왼쪽·오른쪽 3D 내벽 (창문/그림 없는 순수 벽지+웨인스코팅 슬라이스 타일 단위 배치로 1px 모레 현상 방지)
  if (sideTex) {
    const lb = newBuf();
    const rb = newBuf();
    for (let zi = z0; zi < z1; zi++) {
      pushQuadCol(lb, [[x0, k, zi + 1], [x0, 0, zi + 1], [x0, 0, zi], [x0, k, zi]], [[0.06, 1], [0.06, 0], [0.94, 0], [0.94, 1]], [0.86, 0.86, 0.86]);
      pushQuadCol(rb, [[x1, k, zi], [x1, 0, zi], [x1, 0, zi + 1], [x1, k, zi + 1]], [[0.06, 1], [0.06, 0], [0.94, 0], [0.94, 1]], [0.76, 0.76, 0.76]);
    }
    const sMatL = new THREE.MeshBasicMaterial({ map: sideTex, vertexColors: true });
    const sMatR = new THREE.MeshBasicMaterial({ map: sideTex, vertexColors: true });
    const lm = bufToMesh(lb, sMatL);
    const rm = bufToMesh(rb, sMatR);
    if (lm) grp.add(lm);
    if (rm) grp.add(rm);
  }

  // 4) 벽 윗면 프레임 들보(디오라마 단면) + 남쪽(앞) 낮은 컷어웨이 턱 + 문설주 (Z-fighting 방지용 0.015 오프셋)
  const trimBuf = newBuf();
  const beamW = 0.46;
  const wallGap = 0.015;
  // 북쪽 윗 들보 (뒷벽 상단 y=k 위로 깔끔히 얹힘)
  pushBoxSolid(trimBuf, x0 - beamW, x1 + beamW, k, k + 0.08, z0 - beamW, z0 + 0.01, trimHex, {
    top: 1.0, bot: 0.5, front: 1.0, back: 0.6, left: 0.75, right: 0.75,
  });
  pushBoxSolid(trimBuf, x0 - beamW, x1 + beamW, 0, k, z0 - beamW, z0 - wallGap, trimHex, {
    top: 0.95, bot: 0.4, front: 0.9, back: 0.55, left: 0.72, right: 0.72,
  });
  // 왼쪽 벽체 단면 + 상단 림 캡
  pushBoxSolid(trimBuf, x0 - beamW, x0 - wallGap, 0, k, z0, z1 + 0.36, trimHex, {
    top: 0.95, bot: 0.4, front: 0.85, back: 0.55, left: 0.72, right: 0.82,
  });
  pushBoxSolid(trimBuf, x0 - beamW, x0 + 0.01, k, k + 0.08, z0 - beamW, z1 + 0.36, trimHex, {
    top: 1.0, bot: 0.4, front: 0.85, back: 0.6, left: 0.72, right: 0.84,
  });
  // 오른쪽 벽체 단면 + 상단 림 캡
  pushBoxSolid(trimBuf, x1 + wallGap, x1 + beamW, 0, k, z0, z1 + 0.36, trimHex, {
    top: 0.95, bot: 0.4, front: 0.85, back: 0.55, left: 0.78, right: 0.68,
  });
  pushBoxSolid(trimBuf, x1 - 0.01, x1 + beamW, k, k + 0.08, z0 - beamW, z1 + 0.36, trimHex, {
    top: 1.0, bot: 0.4, front: 0.85, back: 0.6, left: 0.80, right: 0.68,
  });
  // 남쪽(앞) 낮은 컷어웨이 턱 (문 위치는 비움)
  const frontH = 0.42;
  const segments: Array<[number, number]> = [];
  let sx = x0;
  for (const dx of doorCols.sort((a, b) => a - b)) {
    if (dx > sx) segments.push([sx, dx]);
    sx = dx + 1;
  }
  if (sx < x1) segments.push([sx, x1]);
  for (const [a, b] of segments) {
    const segL = a === x0 ? a - beamW : a;
    const segR = b === x1 ? b + beamW : b;
    pushBoxSolid(trimBuf, segL, segR, 0, frontH, z1 + wallGap, z1 + 0.38, trimHex, {
      top: 1.05, bot: 0.4, front: 0.72, back: 0.92, left: 0.84, right: 0.84,
    });
  }

  // 실내 내부 칸막이·미로 벽(가구나 전자문이 아닌 막힌 칸)을 입체 벽체로 돌출
  const objCells = new Set<number>();
  for (const o of info.objects) {
    const cx = Number(prop(o, 'cellX', -1)), cy = Number(prop(o, 'cellY', -1));
    const cw = Number(prop(o, 'cellW', 1)), ch = Number(prop(o, 'cellH', 1));
    if (cx < 0) continue;
    for (let yy = cy - ch + 1; yy <= cy; yy++) for (let xx = cx; xx < cx + cw; xx++) {
      objCells.add(yy * W + xx);
    }
  }
  for (let py = z0; py < z1; py++) for (let px = x0; px < x1; px++) {
    if (!info.isBlocked(px, py) || objCells.has(py * W + px)) continue;
    pushBoxSolid(trimBuf, px + 0.02, px + 0.98, 0, 1.35, py + 0.02, py + 0.98, trimHex, {
      top: 1.12, bot: 0.4, front: 0.88, back: 0.65, left: 0.74, right: 0.74,
    });
  }

  const trimMesh = bufToMesh(
    trimBuf,
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  if (trimMesh) grp.add(trimMesh);

  // 5) 바닥-벽 경계 소프트 앰비언트 오클루전(깊이감)
  const aoMat = new THREE.MeshBasicMaterial({ color: 0x090507, transparent: true, opacity: 0.26, depthWrite: false });
  const aoN = new THREE.Mesh(new THREE.PlaneGeometry(innerW, 0.26), aoMat);
  aoN.rotation.x = -Math.PI / 2;
  aoN.position.set(x0 + innerW / 2, 0.008, z0 + 0.13);
  const aoL = new THREE.Mesh(new THREE.PlaneGeometry(0.22, innerD), aoMat);
  aoL.rotation.x = -Math.PI / 2;
  aoL.position.set(x0 + 0.11, 0.009, z0 + innerD / 2);
  const aoR = new THREE.Mesh(new THREE.PlaneGeometry(0.22, innerD), aoMat);
  aoR.rotation.x = -Math.PI / 2;
  aoR.position.set(x1 - 0.11, 0.009, z0 + innerD / 2);
  grp.add(aoN, aoL, aoR);

  return grp;
}

// 쯔꾸르 / 포켓몬 게임 감성을 살리기 위해 실내 가구·소품은 어색한 3D 조형물 대신 정교한 픽셀아트 스프라이트(빌보드)로 렌더링한다.
const THREE_D_TYPES = new Set<string>([]);

export function hasInteriorProp3D(type: string): boolean {
  return THREE_D_TYPES.has(type);
}

/**
 * 실내 가구·소품 1개를 포켓몬 5세대 / 쯔꾸르풍 3D 입체 모델로 생성한다.
 * 기존 픽셀아트 텍스처(tex)를 3D 상자 윗면/앞면에 매핑하고 나무·돌·금속 두께/다리/바닥 그림자를 붙인다.
 */
export function makeInteriorProp3D(
  type: string,
  o: TiledObject,
  tex: THREE.Texture,
  imgW: number,
  imgH: number,
  roomW: number,
  shadowTex: THREE.Texture,
  tileSize = 16,
): THREE.Group | null {
  if (!THREE_D_TYPES.has(type)) return null;

  const cellX = Number(prop(o, 'cellX', 0));
  const cellY = Number(prop(o, 'cellY', 0));
  const cellW = Number(prop(o, 'cellW', 1));
  const cellH = Number(prop(o, 'cellH', 1));

  // 내벽과 Z-파이팅을 피하기 위한 미세 안쪽 여백
  const epsL = cellX <= 1 ? 0.04 : 0.02;
  const epsR = cellX + cellW >= roomW - 1 ? 0.04 : 0.02;
  const x0 = cellX + epsL;
  const x1 = cellX + cellW - epsR;
  const cx = (x0 + x1) * 0.5;
  const z1 = cellY + 1;
  const z0 = z1 - cellH;
  const cz = (z0 + z1) * 0.5;

  const grp = new THREE.Group();
  const texBuf = newBuf();
  const colBuf = newBuf();
  const glowBuf = newBuf();

  const WOOD_BASE = 0x8f5932;
  const WOOD_DARK = 0x5c361d;
  const WOOD_LIGHT = 0xb57947;
  const METAL = 0x7a8492;
  const METAL_DARK = 0x454b56;
  const STONE = 0x8e95a0;

  let shadowW = Math.max(0.75, cellW * 0.94);
  let shadowD = Math.max(0.55, cellH * 0.72);
  let addShadow = true;

  if (type === 'bed' || type === 'bed_pink' || type === 'bed_green') {
    const quiltHex = type === 'bed_pink' ? 0xd96e7e : type === 'bed_green' ? 0x4b935b : 0x5483c6;
    // 머리판 (벽 쪽 수직)
    pushBoxSolid(colBuf, x0 + 0.04, x1 - 0.04, 0.08, 1.04, z0 + 0.02, z0 + 0.22, WOOD_BASE);
    pushTexRectFront(texBuf, imgW, imgH, x0 + 0.06, x1 - 0.06, 0.48, 1.04, z0 + 0.225, 1, 0, imgW - 1, 9, 1);
    // 4개 침대 기둥 다리
    for (const lx of [x0 + 0.06, x1 - 0.20]) {
      for (const lz of [z0 + 0.06, z1 - 0.22]) {
        pushBoxSolid(colBuf, lx, lx + 0.14, 0, 0.24, lz, lz + 0.14, WOOD_DARK);
      }
    }
    // 침대 프레임 & 매트리스(수평으로 눕혀짐!)
    const mz0 = z0 + 0.22, mz1 = z1 - 0.10;
    pushBoxSolid(colBuf, x0 + 0.08, x1 - 0.08, 0.18, 0.34, mz0, mz1, WOOD_BASE);
    // 이불 & 베개 입체 상자
    pushBoxSolid(colBuf, x0 + 0.08, x1 - 0.08, 0.34, 0.56, mz0, mz0 + 0.48, 0xf2ece1);
    pushBoxSolid(colBuf, x0 + 0.08, x1 - 0.08, 0.32, 0.58, mz0 + 0.48, mz1, quiltHex);
    // 매트리스 윗면에 베개·이불 스프라이트 수평 매핑 (py 9..34 -> 위에서 아래로 눕힘)
    pushTexRectTop(texBuf, imgW, imgH, x0 + 0.08, x1 - 0.08, 0.585, mz0, mz1, 2, 9, imgW - 2, imgH - 2, 1);
    // 앞면 발치 이불 마감
    pushTexRectFront(texBuf, imgW, imgH, x0 + 0.08, x1 - 0.08, 0.32, 0.58, mz1 + 0.004, 2, 26, imgW - 2, 34, 0.95);
    // 발치 기둥 살짝 위 돌출
    pushBoxSolid(colBuf, x0 + 0.05, x0 + 0.19, 0.24, 0.64, mz1 - 0.04, mz1 + 0.08, WOOD_BASE);
    pushBoxSolid(colBuf, x1 - 0.19, x1 - 0.05, 0.24, 0.64, mz1 - 0.04, mz1 + 0.08, WOOD_BASE);
    shadowW = cellW * 0.96;
    shadowD = cellH * 0.88;
  } else if (type === 'wardrobe' || type === 'bookshelf' || type === 'shelf_goods' || type === 'shelf_goods_b' || type === 'lab_machine') {
    const hW = imgH / tileSize;
    const isMetal = type === 'lab_machine';
    const bodyHex = isMetal ? METAL : WOOD_BASE;
    const bz0 = z0 + 0.04, bz1 = z0 + 0.72;
    pushBoxSolid(colBuf, x0 + 0.04, x1 - 0.04, 0.06, hW, bz0, bz1, bodyHex);
    if (!isMetal) {
      pushBoxSolid(colBuf, x0 + 0.01, x1 - 0.01, hW - 0.14, hW + 0.04, bz0 - 0.02, bz1 + 0.04, WOOD_DARK);
    }
    pushTexRectFront(texBuf, imgW, imgH, x0 + 0.04, x1 - 0.04, 0.04, hW, bz1 + 0.008, 0, 0, imgW, imgH, 1);
    shadowD = 0.78;
  } else if (type === 'kitchen' || type.startsWith('counter')) {
    const baseHex = type === 'counter_heal' ? 0xf2dce4 : type === 'counter_lab' ? 0x4b596a : WOOD_BASE;
    const topHex = type === 'kitchen' || type === 'counter_heal' || type === 'counter_lab' ? 0xf2eee6 : WOOD_LIGHT;
    const bz0 = z0 + 0.08, bz1 = z0 + 0.84;
    // 하단 캐비닛 몸통
    pushBoxSolid(colBuf, x0 + 0.02, x1 - 0.02, 0, 0.82, bz0, bz1, baseHex);
    // 조리대 / 카운터 상판
    pushBoxSolid(colBuf, x0, x1, 0.82, 0.96, bz0 - 0.02, bz1 + 0.04, topHex);
    const pySplit = Math.round(imgH * 0.44);
    pushTexRectFront(texBuf, imgW, imgH, x0 + 0.02, x1 - 0.02, 0, 0.84, bz1 + 0.008, 0, pySplit, imgW, imgH, 1);
    // 상판 위 올라와 있는 냄비·수도꼭지·계산대·커피머신·모니터 (수직 컷아웃)
    const upH = Math.max(0.25, pySplit / tileSize);
    pushTexRectFront(texBuf, imgW, imgH, x0 + 0.02, x1 - 0.02, 0.94, 0.94 + upH, z0 + 0.42, 0, 0, imgW, pySplit, 1);
    shadowD = 0.86;
  } else if (type === 'piano') {
    const pDark = 0x2a1e24, pMid = 0x3b2c34;
    // 높은 뒤판 몸통
    pushBoxSolid(colBuf, x0 + 0.06, x1 - 0.06, 0.06, 1.56, z0 + 0.06, z0 + 0.52, pDark);
    pushBoxSolid(colBuf, x0 + 0.04, x1 - 0.04, 1.52, 1.62, z0 + 0.04, z0 + 0.56, pMid);
    pushTexRectFront(texBuf, imgW, imgH, x0 + 0.06, x1 - 0.06, 0.62, 1.54, z0 + 0.526, 1, 0, imgW - 1, 20, 1);
    // 앞으로 튀어나온 건반 받침대 + 흰/검은 건반
    pushBoxSolid(colBuf, x0 + 0.04, x1 - 0.04, 0.56, 0.76, z0 + 0.52, z0 + 0.90, pDark);
    pushTexRectTop(texBuf, imgW, imgH, x0 + 0.06, x1 - 0.06, 0.768, z0 + 0.54, z0 + 0.88, 0, 20, imgW, 26, 1);
    // 앞다리 2개
    pushBoxSolid(colBuf, x0 + 0.12, x0 + 0.28, 0, 0.56, z0 + 0.72, z0 + 0.86, pDark);
    pushBoxSolid(colBuf, x1 - 0.28, x1 - 0.12, 0, 0.56, z0 + 0.72, z0 + 0.86, pDark);
    shadowD = 0.9;
  } else if (type === 'dtable' || type === 'table_small' || type === 'desk' || type === 'workbench' || type === 'starter_table') {
    const tz0 = z0 + (cellH > 1 ? 0.18 : 0.10);
    const tz1 = z1 - (cellH > 1 ? 0.18 : 0.12);
    const legH = 0.56;
    const topH = 0.70;
    const tx0 = x0 + 0.06, tx1 = x1 - 0.06;

    // 4개 다리
    for (const lx of [tx0 + 0.06, tx1 - 0.20]) {
      for (const lz of [tz0 + 0.06, tz1 - 0.20]) {
        pushBoxSolid(colBuf, lx, lx + 0.14, 0, legH, lz, lz + 0.14, WOOD_DARK);
      }
    }

    if (type === 'dtable') {
      // 식탁 상판 + 체크 식탁보 덮개 + 중앙 꽃병
      pushBoxSolid(colBuf, tx0, tx1, legH - 0.08, topH, tz0, tz1, 0xc95a48);
      pushTexRectTop(texBuf, imgW, imgH, tx0, tx1, topH + 0.005, tz0, tz1, 2, 4, imgW - 2, 22, 1);
      pushTexRectFront(texBuf, imgW, imgH, tx0, tx1, legH - 0.08, topH, tz1 + 0.006, 2, 18, imgW - 2, 25, 0.96);
      // 중앙 꽃병 3D
      pushPrism(colBuf, cx, cz, topH, topH + 0.26, 0.14, 0.10, 8, 0xfff8ec);
      pushBoxSolid(colBuf, cx - 0.08, cx + 0.08, topH + 0.24, topH + 0.42, cz - 0.08, cz + 0.08, 0x7cc45a);
      pushBoxSolid(colBuf, cx - 0.07, cx + 0.07, topH + 0.40, topH + 0.52, cz - 0.07, cz + 0.07, 0xff7aa8);
    } else if (type === 'starter_table') {
      // 연구소 스타터 테이블 + 3D 빛나는 루미 볼 3개
      pushBoxSolid(colBuf, tx0 + 0.02, tx1 - 0.02, 0, legH, tz0 + 0.04, tz1 - 0.04, WOOD_BASE);
      pushBoxSolid(colBuf, tx0, tx1, legH, topH + 0.04, tz0, tz1, 0xf4f4f8);
      pushTexRectFront(texBuf, imgW, imgH, tx0, tx1, 0, topH + 0.04, tz1 + 0.006, 1, 8, imgW - 1, imgH, 1);
      const orbCols = [0x7cc45a, 0x5aa8e0, 0xe8502e];
      orbCols.forEach((col, i) => {
        const ox = tx0 + (tx1 - tx0) * ((i + 0.65) / 3.3);
        pushPrism(colBuf, ox, cz, topH + 0.04, topH + 0.14, 0.22, 0.18, 8, 0xc8c8d4);
        pushPrism(glowBuf, ox, cz, topH + 0.14, topH + 0.50, 0.20, 0.12, 8, col);
      });
    } else if (type === 'desk') {
      // 책상 + 서랍장 + 3D 스탠드 조명 + 일기장
      pushBoxSolid(colBuf, tx1 - 0.56, tx1 - 0.06, 0.06, legH, tz0 + 0.06, tz1 - 0.06, WOOD_BASE);
      pushBoxSolid(colBuf, tx0, tx1, legH, topH, tz0, tz1, WOOD_LIGHT);
      pushBoxSolid(colBuf, tx0, tx1, legH - 0.04, legH, tz0 + 0.02, tz1 - 0.02, WOOD_DARK);
      // 3D 스탠드 + 불빛 갓
      pushBoxSolid(colBuf, tx0 + 0.22, tx0 + 0.34, topH, topH + 0.24, cz - 0.06, cz + 0.06, METAL_DARK);
      pushPrism(glowBuf, tx0 + 0.28, cz, topH + 0.22, topH + 0.44, 0.22, 0.13, 8, 0xffd65a);
      // 펼쳐진 일기장
      pushBoxSolid(colBuf, cx - 0.22, cx + 0.24, topH, topH + 0.05, cz - 0.14, cz + 0.18, 0xfff8ec);
      // 머그컵
      pushPrism(colBuf, tx1 - 0.28, cz + 0.08, topH, topH + 0.18, 0.10, 0.10, 8, 0xe07a8a);
    } else if (type === 'workbench') {
      // 작업대 상판 + 하단 선반 + 절구·포션병
      pushBoxSolid(colBuf, tx0 + 0.08, tx1 - 0.08, 0.18, 0.26, tz0 + 0.08, tz1 - 0.08, WOOD_BASE);
      pushBoxSolid(colBuf, tx0, tx1, legH, topH + 0.02, tz0, tz1, WOOD_LIGHT);
      pushPrism(colBuf, tx0 + 0.38, cz + 0.05, topH + 0.02, topH + 0.22, 0.18, 0.22, 8, 0xa0a0a8);
      pushBoxSolid(colBuf, cx + 0.06, cx + 0.24, topH + 0.02, topH + 0.32, cz - 0.08, cz + 0.08, 0x80d8a0);
      pushBoxSolid(colBuf, cx + 0.32, cx + 0.50, topH + 0.02, topH + 0.28, cz, cz + 0.14, 0xff8a7a);
      pushPrism(glowBuf, tx1 - 0.32, cz - 0.04, topH + 0.02, topH + 0.24, 0.13, 0.10, 8, 0x7ae0d8);
    } else {
      // table_small
      pushBoxSolid(colBuf, tx0, tx1, legH, topH, tz0, tz1, WOOD_LIGHT);
      pushBoxSolid(colBuf, tx0 + 0.02, tx1 - 0.02, legH - 0.05, legH, tz0 + 0.02, tz1 - 0.02, WOOD_DARK);
      pushBoxSolid(colBuf, tx0 + 0.24, tx0 + 0.72, topH, topH + 0.04, cz - 0.16, cz + 0.16, 0xfff8ec);
      pushPrism(colBuf, tx1 - 0.34, cz, topH, topH + 0.24, 0.11, 0.11, 8, 0x7fc0de);
    }
    shadowW = (tx1 - tx0) * 1.02;
    shadowD = (tz1 - tz0) * 0.96;
  } else if (type === 'sofa' || type === 'sofa_red') {
    const sofaHex = type === 'sofa_red' ? 0xa83c34 : 0x4f9a5f;
    const armHex = type === 'sofa_red' ? 0x852d26 : 0x3b7848;
    // 네 다리
    for (const lx of [x0 + 0.10, x1 - 0.24]) {
      for (const lz of [z0 + 0.14, z1 - 0.24]) {
        pushBoxSolid(colBuf, lx, lx + 0.14, 0, 0.16, lz, lz + 0.14, WOOD_DARK);
      }
    }
    // 등받이
    pushBoxSolid(colBuf, x0 + 0.08, x1 - 0.08, 0.16, 0.96, z0 + 0.10, z0 + 0.36, sofaHex);
    // 방석 2개
    pushBoxSolid(colBuf, x0 + 0.28, cx - 0.02, 0.16, 0.46, z0 + 0.36, z1 - 0.12, sofaHex);
    pushBoxSolid(colBuf, cx + 0.02, x1 - 0.28, 0.16, 0.46, z0 + 0.36, z1 - 0.12, sofaHex);
    // 양쪽 팔걸이
    pushBoxSolid(colBuf, x0 + 0.04, x0 + 0.30, 0.16, 0.68, z0 + 0.12, z1 - 0.12, armHex);
    pushBoxSolid(colBuf, x1 - 0.30, x1 - 0.04, 0.16, 0.68, z0 + 0.12, z1 - 0.12, armHex);
    // 포인트 쿠션 2개
    pushBoxSolid(colBuf, x0 + 0.38, x0 + 0.72, 0.46, 0.76, z0 + 0.36, z0 + 0.56, 0xf0c84a);
    pushBoxSolid(colBuf, x1 - 0.72, x1 - 0.38, 0.46, 0.76, z0 + 0.36, z0 + 0.56, 0xe8705a);
    shadowD = 0.85;
  } else if (type === 'chair_l' || type === 'chair_r') {
    const cx0 = cx - 0.28, cx1 = cx + 0.28, cz0 = cz - 0.28, cz1 = cz + 0.28;
    // 4 다리
    for (const lx of [cx0, cx1 - 0.11]) {
      for (const lz of [cz0, cz1 - 0.11]) {
        pushBoxSolid(colBuf, lx, lx + 0.11, 0, 0.38, lz, lz + 0.11, WOOD_DARK);
      }
    }
    // 좌판 + 빨간 방석
    pushBoxSolid(colBuf, cx0, cx1, 0.38, 0.48, cz0, cz1, WOOD_LIGHT);
    pushBoxSolid(colBuf, cx0 + 0.06, cx1 - 0.06, 0.48, 0.54, cz0 + 0.06, cz1 - 0.06, 0xe8705a);
    // 등받이 (chair_l은 왼쪽, chair_r은 오른쪽 — 식탁을 마주보는 방향)
    if (type === 'chair_l') pushBoxSolid(colBuf, cx0, cx0 + 0.12, 0.48, 1.06, cz0, cz1, WOOD_BASE);
    else pushBoxSolid(colBuf, cx1 - 0.12, cx1, 0.48, 1.06, cz0, cz1, WOOD_BASE);
    shadowW = 0.72;
    shadowD = 0.65;
  } else if (type === 'stool') {
    for (const [lx, lz] of [[cx - 0.20, cz - 0.20], [cx + 0.10, cz - 0.20], [cx - 0.20, cz + 0.10], [cx + 0.10, cz + 0.10]]) {
      pushBoxSolid(colBuf, lx, lx + 0.09, 0, 0.44, lz, lz + 0.09, METAL_DARK);
    }
    pushPrism(colBuf, cx, cz, 0.44, 0.56, 0.32, 0.30, 10, 0xe8705a);
    shadowW = 0.68;
    shadowD = 0.62;
  } else if (type === 'forge') {
    // 민수의 볼 공방 용광로/화로: 깊은 벽돌 본체 + 굴뚝 + 아치형 화구 불빛 + 앞 돌받침
    const bx0 = x0 + 0.04, bx1 = x1 - 0.04;
    pushBoxSolid(colBuf, bx0, bx1, 0, 1.72, z0 + 0.04, z0 + 0.80, 0x8a4a3a);
    // 윗 굴뚝 스택 (벽을 타고 올라감)
    pushBoxSolid(colBuf, cx - 0.46, cx + 0.46, 1.72, 2.90, z0 + 0.04, z0 + 0.54, 0x6b382c);
    // 앞면 벽돌 무늬 매핑
    pushTexRectFront(texBuf, imgW, imgH, bx0, bx1, 0, 1.95, z0 + 0.808, 1, 6, imgW - 1, imgH, 1);
    // 앞쪽 돌받침 턱
    pushBoxSolid(colBuf, bx0 - 0.04, bx1 + 0.04, 0, 0.22, z0 + 0.78, z0 + 0.94, 0x5d5a60);
    // 불꽃 빛(noTint)
    pushBoxSolid(glowBuf, cx - 0.44, cx + 0.44, 0.34, 0.76, z0 + 0.76, z0 + 0.84, 0xff6220);
    pushBoxSolid(glowBuf, cx - 0.22, cx + 0.22, 0.42, 0.66, z0 + 0.80, z0 + 0.86, 0xffe066);
    shadowD = 0.92;
  } else if (type === 'anvil') {
    // 모루 나무 받침 + 강철 본체 + 왼쪽 뿔
    pushPrism(colBuf, cx, cz, 0, 0.36, 0.32, 0.30, 8, WOOD_DARK);
    pushBoxSolid(colBuf, cx - 0.24, cx + 0.24, 0.36, 0.52, cz - 0.16, cz + 0.16, METAL_DARK);
    pushBoxSolid(colBuf, cx - 0.36, cx + 0.32, 0.52, 0.72, cz - 0.18, cz + 0.18, METAL);
    pushBoxSolid(colBuf, cx - 0.48, cx - 0.34, 0.58, 0.69, cz - 0.10, cz + 0.10, METAL);
    shadowW = 0.82;
    shadowD = 0.68;
  } else if (type === 'crate') {
    const cx0 = cx - 0.40, cx1 = cx + 0.40, cz0 = cz - 0.40, cz1 = cz + 0.40;
    pushBoxSolid(colBuf, cx0, cx1, 0, 0.82, cz0, cz1, WOOD_BASE);
    pushTexRectFront(texBuf, imgW, imgH, cx0, cx1, 0, 0.82, cz1 + 0.005, 0, 0, imgW, imgH, 1);
    pushTexRectTop(texBuf, imgW, imgH, cx0, cx1, 0.825, cz0, cz1, 0, 0, imgW, imgH, 1.06);
    shadowW = 0.92;
    shadowD = 0.88;
  } else if (type === 'barrel') {
    pushPrism(colBuf, cx, cz, 0, 0.92, 0.36, 0.38, 10, WOOD_BASE);
    pushPrism(colBuf, cx, cz, 0.18, 0.26, 0.385, 0.385, 10, METAL_DARK, false);
    pushPrism(colBuf, cx, cz, 0.66, 0.74, 0.395, 0.395, 10, METAL_DARK, false);
    shadowW = 0.85;
    shadowD = 0.82;
  } else if (type === 'sacks') {
    pushPrism(colBuf, cx, cz, 0, 0.68, 0.40, 0.30, 8, 0xd4bb88);
    pushPrism(colBuf, cx, cz, 0.66, 0.74, 0.18, 0.18, 8, 0x9c7b48, false);
    pushPrism(colBuf, cx, cz, 0.72, 0.92, 0.18, 0.28, 8, 0xe0c898);
    shadowW = 0.85;
    shadowD = 0.8;
  } else if (type === 'millstone') {
    pushPrism(colBuf, cx, cz, 0, 0.34, 0.86, 0.84, 14, 0x7c828d);
    pushPrism(colBuf, cx, cz, 0.34, 0.72, 0.64, 0.62, 14, 0x9aa0aa);
    pushPrism(colBuf, cx, cz, 0.72, 1.75, 0.10, 0.10, 8, WOOD_BASE);
    shadowW = 1.85;
    shadowD = 1.65;
  } else if (type === 'attic_stairs_up') {
    // 1층 → 2층 다락방 올라가는 입체 원목 계단 + 난간 + 다락방 어두운 출입구
    pushBoxSolid(colBuf, x0 + 0.08, x1 - 0.08, 0, 1.62, z0 + 0.02, z0 + 0.12, 0x1a100c);
    // 양옆 계단 측판(난간)
    pushBoxSolid(colBuf, x0 + 0.02, x0 + 0.14, 0, 1.56, z0 + 0.02, z0 + 0.32, WOOD_DARK);
    pushBoxSolid(colBuf, x1 - 0.14, x1 - 0.02, 0, 1.56, z0 + 0.02, z0 + 0.32, WOOD_DARK);
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const syTop = 0.24 + i * 0.24;
      const sz1 = z1 - i * (0.86 / steps);
      const sz0 = z1 - (i + 1) * (0.86 / steps);
      pushBoxSolid(colBuf, x0 + 0.12, x1 - 0.12, Math.max(0, syTop - 0.24), syTop, sz0, sz1, WOOD_LIGHT);
      // 옆 난간 기둥 계단식 높이
      pushBoxSolid(colBuf, x0 + 0.02, x0 + 0.14, 0, syTop + 0.34, sz0, sz1, WOOD_BASE);
      pushBoxSolid(colBuf, x1 - 0.14, x1 - 0.02, 0, syTop + 0.34, sz0, sz1, WOOD_BASE);
    }
    addShadow = false;
  } else if (type === 'attic_stairs_down') {
    // 2층 → 1층 내려가는 바닥 계단구: 왼쪽(from_1f 방향)이 열려 있고 북·동·남 3면 원목 난간 + 서→동 내려가는 계단
    pushBoxSolid(colBuf, x0 + 0.06, x1 - 0.06, 0.004, 0.018, z0 + 0.08, z1 - 0.08, 0x160d09);
    for (let i = 0; i < 4; i++) {
      const sx0 = x0 + 0.08 + i * 0.19;
      const sx1 = sx0 + 0.17;
      const sh = 0.22 - i * 0.05;
      pushBoxSolid(colBuf, sx0, sx1, 0.02, sh, z0 + 0.14, z1 - 0.14, i === 0 ? WOOD_LIGHT : WOOD_BASE);
    }
    // 북·동·남 3면 안전 난간 + 코너 기둥 (왼쪽 입구는 열어 자연스러운 동선 확보)
    pushBoxSolid(colBuf, x0 + 0.02, x1 - 0.02, 0, 0.54, z0 + 0.02, z0 + 0.12, WOOD_DARK);
    pushBoxSolid(colBuf, x0 + 0.02, x1 - 0.02, 0, 0.54, z1 - 0.12, z1 - 0.02, WOOD_DARK);
    pushBoxSolid(colBuf, x1 - 0.12, x1 - 0.02, 0, 0.54, z0 + 0.02, z1 - 0.02, WOOD_BASE);
    pushBoxSolid(colBuf, x0, x0 + 0.15, 0, 0.62, z0, z0 + 0.15, WOOD_LIGHT);
    pushBoxSolid(colBuf, x0, x0 + 0.15, 0, 0.62, z1 - 0.15, z1, WOOD_LIGHT);
    addShadow = false;
  } else if (type === 'pillar') {
    pushBoxSolid(colBuf, cx - 0.42, cx + 0.42, 0, 0.30, cz - 0.42, cz + 0.42, 0x7a808b);
    pushPrism(colBuf, cx, cz, 0.30, 2.35, 0.30, 0.28, 8, STONE);
    pushBoxSolid(colBuf, cx - 0.44, cx + 0.44, 2.35, 2.65, cz - 0.44, cz + 0.44, 0xa2a9b5);
    shadowW = 1.05;
    shadowD = 0.9;
  } else if (type === 'pedestal') {
    pushBoxSolid(colBuf, x0 + 0.06, x1 - 0.06, 0, 0.34, z0 + 0.10, z1 - 0.10, 0xcbc2a8);
    pushBoxSolid(colBuf, x0 + 0.24, x1 - 0.24, 0.34, 1.05, z0 + 0.18, z1 - 0.18, 0xe8e0c8);
    pushBoxSolid(colBuf, x0 + 0.12, x1 - 0.12, 1.05, 1.24, z0 + 0.12, z1 - 0.12, 0xf2ebd6);
    pushPrism(glowBuf, cx, cz, 1.38, 1.66, 0.18, 0.02, 6, 0xfff099);
    shadowW = 1.9;
    shadowD = 1.0;
  } else if (type === 'crystal' || type === 'crystal_red') {
    const cHex = type === 'crystal_red' ? 0xff7b63 : 0x80d4ff;
    pushPrism(colBuf, cx, cz, 0, 0.28, 0.36, 0.28, 6, 0x4f5568);
    pushPrism(glowBuf, cx, cz, 0.24, 1.70, 0.28, 0.02, 6, cHex);
    pushPrism(glowBuf, cx - 0.20, cz + 0.10, 0.18, 0.95, 0.14, 0.02, 5, cHex);
    shadowW = 0.85;
    shadowD = 0.72;
  } else if (type === 'statue') {
    pushBoxSolid(colBuf, cx - 0.38, cx + 0.38, 0, 0.48, cz - 0.34, cz + 0.34, 0x7b8590);
    pushPrism(colBuf, cx, cz, 0.48, 1.48, 0.30, 0.24, 8, 0x9aa8b4);
    pushPrism(colBuf, cx, cz, 1.48, 1.92, 0.22, 0.18, 8, 0xb0beca);
    pushBoxSolid(colBuf, cx - 0.24, cx - 0.10, 1.88, 2.12, cz - 0.06, cz + 0.06, 0x8b99a6);
    pushBoxSolid(colBuf, cx + 0.10, cx + 0.24, 1.88, 2.12, cz - 0.06, cz + 0.06, 0x8b99a6);
    shadowW = 0.95;
    shadowD = 0.85;
  } else if (type === 'heal_pad') {
    pushBoxSolid(colBuf, x0 + 0.08, x1 - 0.08, 0, 0.06, z0 + 0.16, z1 - 0.16, 0xe8a0b0);
    pushPrism(glowBuf, cx, cz, 0.05, 0.09, 0.56, 0.56, 12, 0xffd2de);
    addShadow = false;
  } else if (type === 'candle') {
    pushPrism(colBuf, cx, cz, 0, 0.18, 0.28, 0.16, 8, 0xc89a34);
    pushPrism(colBuf, cx, cz, 0.18, 1.05, 0.06, 0.06, 6, 0xb08224);
    pushBoxSolid(colBuf, cx - 0.34, cx + 0.34, 0.96, 1.06, cz - 0.06, cz + 0.06, 0xd8aa3c);
    for (const dx of [-0.28, 0, 0.28]) {
      pushBoxSolid(colBuf, cx + dx - 0.06, cx + dx + 0.06, 1.06, 1.42, cz - 0.06, cz + 0.06, 0xf6f0e4);
      pushPrism(glowBuf, cx + dx, cz, 1.44, 1.62, 0.06, 0.01, 5, 0xffcc4d);
    }
    shadowW = 0.72;
    shadowD = 0.62;
  } else if (type === 'lamp_floor') {
    pushPrism(colBuf, cx, cz, 0, 0.08, 0.26, 0.22, 10, METAL_DARK);
    pushPrism(colBuf, cx, cz, 0.08, 1.48, 0.05, 0.05, 6, METAL);
    pushPrism(glowBuf, cx, cz, 1.42, 2.02, 0.36, 0.20, 8, 0xffe49c);
    shadowW = 0.7;
    shadowD = 0.6;
  } else if (type === 'plant' || type === 'plant_b') {
    // 3D 화분 + 교차 잎사귀 플레인(±32° 두 장)
    pushPrism(colBuf, cx, cz, 0, 0.52, 0.24, 0.32, 8, 0xc06a3a);
    pushPrism(colBuf, cx, cz, 0.46, 0.58, 0.34, 0.35, 8, 0xd8804a);
    pushPrism(colBuf, cx, cz, 0.56, 0.59, 0.28, 0.28, 8, 0x4b3222);
    const leafMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide });
    const lH = (imgH - 16) / tileSize;
    for (const ang of [-0.48, 0.48]) {
      const lb = newBuf();
      pushTexRectFront(lb, imgW, imgH, -0.5, 0.5, 0, lH, 0, 0, 0, imgW, imgH - 16, 1);
      const lm = bufToMesh(lb, leafMat);
      if (lm) {
        lm.position.set(cx, 0.54, cz);
        lm.rotation.y = ang;
        grp.add(lm);
      }
    }
    shadowW = 0.75;
    shadowD = 0.65;
  }

  const mSolid = bufToMesh(colBuf, new THREE.MeshBasicMaterial({ vertexColors: true }));
  if (mSolid) grp.add(mSolid);

  const mTex = bufToMesh(
    texBuf,
    new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide }),
  );
  if (mTex) grp.add(mTex);

  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.userData = { noTint: true };
  const mGlow = bufToMesh(glowBuf, glowMat);
  if (mGlow) grp.add(mGlow);

  if (addShadow) {
    const sm = new THREE.Mesh(
      new THREE.PlaneGeometry(shadowW, shadowD),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    sm.rotation.x = -Math.PI / 2;
    sm.position.set(cx, 0.015, cz + 0.02);
    grp.add(sm);
  }

  return grp;
}
