// 캐릭터 스프라이트 생성기: 파츠(머리/헤어/몸/팔/다리/도구)를 포즈 데이터로 조합 → 48x48 프레임
// 애니메이션: idle / walk / run / hoe(작업) / axe(벌목) / water(물주기) / interact(상호작용)
import { Img, mix, darken, lighten } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

export const FW = 48, FH = 48;
const OX = 8, OY = 8; // 32x32 디자인 좌표 → 48x48 프레임 오프셋
export const FEET_Y = 30 + OY; // 발바닥 y (프레임 기준)
export const DIRS = ['down', 'left', 'right', 'up'];

// ── 포즈 정의 ───────────────────────────────────────────
const idle = (dir) => [0, 0, 0, 0, 1, 1, 1, 1].map((bob, i) => ({ bob, blink: i === 6 }));
const walk = (dir) => dir === 'side'
  ? [{ s: 2 }, { s: 0, bob: 1 }, { s: -2 }, { s: 0, bob: 1 }]
  : [{ liftL: 1, armL: -1, armR: 1 }, { bob: 1 }, { liftR: 1, armL: 1, armR: -1 }, { bob: 1 }];
const run = (dir) => dir === 'side'
  ? [{ s: 3, bob: -1, liftN: 1, lean: 1 }, { s: 2, lean: 1 }, { s: 0, bob: 1, lean: 1 }, { s: -3, bob: -1, liftF: 1, lean: 1 }, { s: -2, lean: 1 }, { s: 0, bob: 1, lean: 1 }]
  : [{ liftL: 2, armL: -2, armR: 2, bob: -1 }, { liftL: 1, armL: -1, armR: 1 }, { bob: 1 }, { liftR: 2, armL: 2, armR: -2, bob: -1 }, { liftR: 1, armL: 1, armR: -1 }, { bob: 1 }];

function swing(kind) {
  return (dir) => {
    if (dir === 'down') return [
      { grip: [16, 9], tip: [15, 0], kind, raise: true },
      { grip: [16, 7], tip: [17, -3], kind, raise: true, bob: -1 },
      { grip: [16, 17], tip: [16, 27], kind, bob: 1 },
      { grip: [16, 21], tip: [16, 33], kind, bob: 1, dust: [[16, 34], 1] },
      { grip: [16, 21], tip: [16, 33], kind, bob: 1, dust: [[16, 34], 2] },
    ];
    if (dir === 'up') return [
      { grip: [16, 12], tip: [16, 1], kind, behind: true, raise: true },
      { grip: [16, 10], tip: [16, -2], kind, behind: true, raise: true, bob: -1 },
      { grip: [16, 17], tip: [16, 2], kind, behind: true, bob: 1 },
      { grip: [16, 19], tip: [16, 0], kind, behind: true, bob: 1, dust: [[16, 0], 1] },
      { grip: [16, 19], tip: [16, 0], kind, behind: true, bob: 1, dust: [[16, 0], 2] },
    ];
    return [ // side(left)
      { grip: [17, 13], tip: [22, 2], kind, raise: true },
      { grip: [15, 10], tip: [13, -2], kind, raise: true, bob: -1 },
      { grip: [12, 17], tip: [3, 13], kind, lean: 1 },
      { grip: [11, 21], tip: [1, 29], kind, bob: 1, lean: 1, dust: [[1, 31], 1] },
      { grip: [11, 21], tip: [1, 29], kind, bob: 1, lean: 1, dust: [[1, 31], 2] },
    ];
  };
}
const water = (dir) => [0, 1, 2, 3].map((f) => ({ can: { dir, tilt: f > 0, f } }));
const interact = (dir) => dir === 'side'
  ? [{ reach: [12, 20] }, { reach: [8, 20], bob: 1 }, { reach: [8, 21], bob: 1 }, { reach: [12, 21] }]
  : dir === 'down'
    ? [{ reachL: [13, 23], reachR: [18, 23] }, { reachL: [14, 25], reachR: [17, 25], bob: 1 }, { reachL: [14, 25], reachR: [17, 25], bob: 1 }, { reachL: [13, 23], reachR: [18, 23] }]
    : [{ reachL: [13, 15], reachR: [18, 15] }, { reachL: [14, 13], reachR: [17, 13], bob: 1 }, { reachL: [14, 13], reachR: [17, 13], bob: 1 }, { reachL: [13, 15], reachR: [18, 15] }];

export const ANIMS = [
  { key: 'idle', gen: idle, fps: 6, repeat: -1 },
  { key: 'walk', gen: walk, fps: 8, repeat: -1 },
  { key: 'run', gen: run, fps: 13, repeat: -1 },
  { key: 'hoe', gen: swing('hoe'), fps: 14, repeat: 0 },
  { key: 'axe', gen: swing('axe'), fps: 14, repeat: 0 },
  { key: 'water', gen: water, fps: 7, repeat: 0 },
  { key: 'interact', gen: interact, fps: 9, repeat: 0 },
];

// ── 그리기 ──────────────────────────────────────────────
class Painter {
  constructor(img, ox, oy) { this.img = img; this.ox = ox; this.oy = oy; this.dy = 0; this.dx = 0; }
  px(x, y, c) { this.img.set(this.ox + x + this.dx, this.oy + y + this.dy, c); }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / n), y = Math.round(y0 + ((y1 - y0) * i) / n);
      this.px(x, y, c); if (w > 1) { if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) this.px(x, y + 1, c); else this.px(x + 1, y, c); }
    }
  }
}

function arm(p, from, to, look, { sleeveCol, side = false } = {}) {
  const [x0, y0] = from, [x1, y1] = to;
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const sleeveLen = look.sleeves === 'long' ? 0.8 : 0.5;
  const vertical = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t);
    const c = t <= sleeveLen ? (sleeveCol ?? look.shirt.b) : (t > 0.92 ? look.skin.b : look.skin.b);
    const c2 = t <= sleeveLen ? look.shirt.d : look.skin.d;
    p.px(x, y, c);
    if (vertical) p.px(x + 1, y, side ? darken(c, 0.22) : c2); else p.px(x, y + 1, c2);
  }
}

function drawLegsFront(p, look, pose, back = false) {
  const { pants, shoes, skin } = look;
  const lL = pose.liftL ?? 0, lR = pose.liftR ?? 0;
  if (look.outfit === 'dress') {
    for (const [x, lift] of [[13, lL], [17, lR]]) {
      p.rect(x, 26, 2, 3 - lift, skin.b); p.px(x + 1, 26, skin.d);
      p.rect(x - 1 + (x > 15 ? 1 : 0), 29 - lift, 3, 2, shoes.b); p.px(x - 1 + (x > 15 ? 1 : 0), 29 - lift, shoes.l);
    }
    return;
  }
  p.rect(12, 24, 8, 2, pants.b); p.px(19, 24, pants.d); p.px(19, 25, pants.d);
  for (const [x, lift] of [[12, lL], [17, lR]]) {
    const h = 3 - lift;
    p.rect(x, 26, 3, h, pants.b); p.px(x + 2, 26, pants.d); p.rect(x + 2, 26, 1, h, pants.d);
    if (!back) p.px(x, 26, pants.l);
    p.rect(x, 29 - lift, 3, 2, shoes.b); p.rect(x, 29 - lift, 2, 1, shoes.l); p.px(x + 2, 30 - lift, shoes.d);
  }
}

function drawTorsoFront(p, look, back = false) {
  const { shirt, pants, skin } = look;
  p.rect(12, 18, 8, 6, shirt.b);
  p.rect(13, 18, 6, 1, shirt.l); p.rect(19, 18, 1, 6, shirt.d);
  p.rect(12, 23, 8, 1, shirt.d);
  if (!back) { p.px(15, 18, skin.b); p.px(16, 18, skin.b); p.px(15, 19, shirt.d); p.px(16, 19, shirt.d); }
  if (look.outfit === 'overalls') {
    p.rect(13, 21, 6, 3, pants.b); p.rect(13, 21, 6, 1, pants.l);
    p.rect(13, 18, 1, 3, pants.b); p.rect(18, 18, 1, 3, pants.d);
    if (!back) { p.px(13, 21, P.gold.l1); p.px(18, 21, P.gold.base); }
    else { p.line(13, 18, 18, 23, pants.d); p.line(18, 18, 13, 23, pants.b); }
  } else if (look.outfit === 'apron') {
    if (!back) { p.rect(13, 20, 6, 7, '#efe6d2'); p.rect(13, 20, 6, 1, '#fffaf0'); p.rect(18, 20, 1, 7, '#cfc3a8'); p.px(14, 19, '#efe6d2'); p.px(17, 19, '#efe6d2'); }
    else { p.rect(12, 22, 8, 1, '#efe6d2'); p.px(15, 23, '#efe6d2'); p.px(16, 23, '#cfc3a8'); }
  } else if (look.outfit === 'vest') {
    const a = look.accent;
    p.rect(12, 18, 2, 6, a.b); p.rect(18, 18, 2, 6, a.d); if (back) p.rect(12, 18, 8, 6, a.b);
    if (!back) { p.px(13, 20, P.gold.l1); p.px(13, 22, P.gold.l1); }
  } else if (look.outfit === 'dress') {
    p.rect(11, 23, 10, 3, shirt.b); p.rect(12, 22, 8, 1, shirt.b);
    p.rect(11, 25, 10, 1, shirt.d); p.rect(20, 23, 1, 3, shirt.d); p.rect(12, 23, 2, 1, shirt.l);
    p.rect(12, 21, 8, 1, look.accent?.b ?? shirt.d);
  }
  if (look.outfit !== 'dress' && look.outfit !== 'overalls') { p.rect(12, 23, 8, 1, look.belt ?? darken(pants.d, 0.2)); if (!back) p.px(15, 23, P.gold.base); }
}

function drawHeadFront(p, look, pose) {
  const { skin } = look;
  p.rect(11, 8, 10, 10, skin.b);
  p.px(11, 8, null); // 모서리
  for (const [x, y] of [[11, 8], [20, 8], [11, 17], [20, 17]]) p.img.clear(p.ox + x + p.dx, p.oy + y + p.dy);
  p.rect(20, 9, 1, 8, skin.d); p.rect(12, 17, 8, 1, skin.d);
  p.px(12, 11, skin.l); p.px(13, 11, skin.l);
  // 귀
  p.px(10, 13, skin.b); p.px(21, 13, skin.d); p.px(10, 14, skin.d); p.px(21, 14, skin.d);
  const eye = look.eye ?? P.ink;
  if (pose.blink) { p.px(13, 14, eye); p.px(18, 14, eye); p.px(12, 14, skin.d); p.px(19, 14, skin.d); }
  else {
    p.px(13, 13, eye); p.px(13, 14, eye); p.px(18, 13, eye); p.px(18, 14, eye);
    p.px(12, 13, mix(skin.b, '#ffffff', 0.5)); p.px(17, 13, mix(skin.b, '#ffffff', 0.5));
  }
  const blush = mix(skin.b, '#ff6f73', 0.38);
  p.px(12, 15, blush); p.px(19, 15, blush);
  p.px(15, 16, mix(skin.d, '#a3473f', 0.4)); p.px(16, 16, mix(skin.d, '#a3473f', 0.25));
  if (look.glasses) { const g = '#3b2b25'; p.rect(12, 12, 3, 1, g); p.rect(17, 12, 3, 1, g); p.rect(12, 15, 3, 1, g); p.rect(17, 15, 3, 1, g); p.px(12, 13, g); p.px(12, 14, g); p.px(19, 13, g); p.px(19, 14, g); p.px(15, 13, g); p.px(16, 13, g); }
  if (look.beard) { const b = look.beardColor ?? look.hair; p.rect(11, 15, 10, 3, b.b); p.rect(12, 18, 8, 1, b.b); p.rect(13, 19, 6, 1, b.d); p.rect(20, 15, 1, 3, b.d); p.px(15, 16, skin.d); p.px(16, 16, skin.d); p.px(14, 15, b.l); }
}

function drawHairFront(p, look, back = false) {
  const h = look.hair, st = look.hairStyle;
  if (st === 'bald') {
    p.rect(10, 11, 2, 4, h.b); p.rect(20, 11, 2, 4, h.d); if (back) { p.rect(11, 13, 10, 3, h.b); p.rect(11, 15, 10, 1, h.d); }
    p.px(14, 9, look.skin.l); p.px(15, 9, look.skin.l); return;
  }
  if (st === 'bun') { p.rect(13, 4, 6, 4, h.b); p.rect(14, 3, 4, 1, h.b); p.rect(14, 4, 2, 1, h.l); p.rect(18, 5, 1, 3, h.d); }
  if (back) {
    p.rect(11, 7, 10, 10, h.b); p.rect(10, 8, 12, 8, h.b);
    p.rect(12, 7, 8, 1, h.b); p.rect(13, 8, 4, 1, h.l); p.rect(12, 9, 2, 3, h.l);
    p.rect(21, 9, 1, 7, h.d); p.rect(11, 16, 10, 1, h.d);
    p.px(14, 12, h.d); p.px(14, 13, h.d); p.px(17, 10, h.d); p.px(17, 11, h.d); p.px(16, 14, h.d); p.px(12, 14, h.d); p.px(19, 13, h.d); p.px(18, 15, h.d); p.px(15, 16, h.b); p.px(16, 16, h.b);
    p.rect(14, 17, 4, 1, look.skin.d);
    if (st === 'long') { p.rect(11, 16, 10, 7, h.b); p.rect(20, 16, 1, 7, h.d); p.rect(11, 22, 10, 1, h.d); p.px(14, 18, h.d); p.px(17, 20, h.d); }
    if (st === 'bob') { p.rect(10, 15, 12, 3, h.b); p.rect(10, 17, 12, 1, h.d); }
    if (st === 'ponytail') { p.rect(14, 16, 4, 6, h.b); p.rect(15, 16, 1, 5, h.l); p.rect(14, 21, 4, 1, h.d); p.rect(14, 15, 4, 1, look.accent?.b ?? '#e05a5a'); }
    if (st === 'spiky') { p.px(12, 6, h.b); p.px(15, 5, h.b); p.px(15, 6, h.b); p.px(18, 6, h.b); p.px(20, 7, h.b); }
    return;
  }
  p.rect(12, 7, 8, 1, h.b); p.rect(11, 8, 10, 3, h.b); p.rect(10, 9, 1, 4, h.b); p.rect(21, 9, 1, 4, h.d);
  p.rect(13, 8, 4, 1, h.l); p.px(12, 9, h.l); p.px(14, 7, h.l);
  p.rect(12, 10, 8, 1, h.d);
  if (st === 'bob' || st === 'long') {
    p.rect(11, 11, 10, 1, h.b); p.px(14, 11, h.d); p.px(17, 11, h.d);
    const bottom = st === 'long' ? 22 : 16;
    p.rect(10, 11, 2, bottom - 11, h.b); p.rect(20, 11, 2, bottom - 11, h.b); p.rect(21, 11, 1, bottom - 11, h.d);
    p.px(11, 12, h.d); p.px(20, 12, h.d); p.rect(10, bottom - 1, 2, 1, h.d); p.rect(20, bottom - 1, 2, 1, h.d);
  } else {
    for (const x of [11, 12, 13, 17, 18, 19, 20]) p.px(x, 11, h.b);
    p.px(11, 12, h.b); p.px(20, 12, h.d); p.px(13, 11, h.d); p.px(17, 11, h.d);
    if (st === 'spiky') { p.px(12, 6, h.b); p.px(15, 5, h.l); p.px(15, 6, h.b); p.px(16, 6, h.b); p.px(19, 6, h.b); p.px(21, 8, h.b); p.px(10, 8, h.b); }
    if (st === 'ponytail') { p.rect(22, 12, 1, 5, h.b); p.px(22, 17, h.d); }
  }
}

function drawHeadSide(p, look, pose) {
  const { skin } = look, h = look.hair, st = look.hairStyle;
  p.rect(11, 8, 10, 9, skin.b); p.rect(12, 17, 6, 1, skin.d);
  for (const [x, y] of [[11, 8], [20, 8], [20, 16]]) p.img.clear(p.ox + x + p.dx, p.oy + y + p.dy);
  p.px(11, 16, skin.d);
  p.px(10, 14, skin.b); p.px(10, 15, skin.d); // 코
  p.px(12, 11, skin.l);
  const eye = look.eye ?? P.ink;
  if (pose.blink) p.px(12, 14, eye); else { p.px(12, 13, eye); p.px(12, 14, eye); p.px(13, 13, mix(skin.b, '#fff', 0.45)); }
  p.px(13, 15, mix(skin.b, '#ff6f73', 0.38));
  p.px(11, 16, mix(skin.d, '#a3473f', 0.35));
  if (look.glasses) { const g = '#3b2b25'; p.rect(11, 12, 3, 1, g); p.rect(11, 15, 3, 1, g); p.px(13, 13, g); p.px(13, 14, g); p.rect(14, 13, 3, 1, g); }
  if (look.beard) { const b = look.beardColor ?? look.hair; p.rect(11, 15, 7, 3, b.b); p.rect(12, 18, 5, 1, b.d); p.px(10, 16, b.b); p.px(11, 16, skin.d); p.px(13, 15, b.l); }
  if (st === 'bald') { p.rect(17, 11, 4, 4, h.b); p.rect(20, 11, 1, 4, h.d); p.px(16, 13, skin.d); p.px(14, 9, skin.l); return; }
  if (st === 'bun') { p.rect(16, 4, 5, 4, h.b); p.rect(17, 4, 2, 1, h.l); p.rect(20, 5, 1, 3, h.d); }
  // 윗머리 + 뒷머리
  p.rect(12, 7, 8, 1, h.b); p.rect(11, 8, 10, 3, h.b); p.rect(21, 9, 1, 6, h.d);
  p.rect(15, 11, 6, 5, h.b); p.rect(17, 16, 3, 1, h.d); p.rect(20, 11, 1, 5, h.d); p.px(18, 12, h.l); p.px(19, 14, h.d);
  p.px(11, 11, h.b); p.px(12, 11, h.b); p.px(11, 12, h.d);
  p.rect(13, 8, 4, 1, h.l); p.px(12, 9, h.l); p.px(15, 7, h.l);
  p.rect(12, 10, 3, 1, h.d);
  p.px(16, 13, skin.b); p.px(16, 14, skin.d); p.px(17, 14, skin.d); // 귀
  if (st === 'long') { p.rect(16, 15, 5, 8, h.b); p.rect(20, 15, 1, 8, h.d); p.rect(16, 22, 5, 1, h.d); p.px(18, 18, h.l); }
  if (st === 'bob') { p.rect(15, 15, 6, 2, h.b); p.rect(15, 16, 6, 1, h.d); }
  if (st === 'ponytail') { p.rect(21, 11, 2, 7, h.b); p.px(22, 18, h.d); p.px(21, 10, look.accent?.b ?? '#e05a5a'); p.px(21, 11, look.accent?.b ?? '#e05a5a'); }
  if (st === 'spiky') { p.px(13, 6, h.b); p.px(16, 6, h.b); p.px(19, 6, h.b); p.px(21, 8, h.b); p.px(22, 10, h.d); }
}

function drawHat(p, look, dir) {
  if (!look.hat) return;
  if (look.hat === 'straw') {
    const s = { d: '#a8822f', b: '#e3be62', l: '#f5dc8d' }, band = look.accent?.b ?? '#c8453c';
    if (dir === 'side') { p.rect(6, 10, 17, 1, s.b); p.rect(7, 11, 15, 1, s.d); p.rect(12, 5, 8, 5, s.b); p.rect(13, 5, 4, 1, s.l); p.rect(12, 8, 8, 1, band); p.rect(19, 5, 1, 5, s.d); }
    else { p.rect(7, 10, 18, 1, s.b); p.rect(8, 11, 16, 1, s.d); p.rect(11, 5, 10, 5, s.b); p.rect(12, 5, 5, 1, s.l); p.rect(11, 8, 10, 1, band); p.rect(20, 5, 1, 5, s.d); }
  } else if (look.hat === 'cap') {
    const c = look.accent;
    if (dir === 'side') { p.rect(12, 6, 9, 4, c.b); p.rect(13, 6, 4, 1, c.l); p.rect(7, 10, 6, 1, c.d); p.rect(12, 10, 9, 1, c.d); }
    else if (dir === 'up') { p.rect(11, 6, 10, 5, c.b); p.rect(12, 6, 5, 1, c.l); p.rect(11, 10, 10, 1, c.d); p.rect(14, 9, 4, 1, '#f4ead4'); }
    else { p.rect(11, 6, 10, 4, c.b); p.rect(12, 6, 5, 1, c.l); p.rect(10, 10, 12, 2, c.d); p.rect(11, 10, 10, 1, c.b); p.px(15, 7, '#f4ead4'); p.px(16, 7, '#f4ead4'); }
  } else if (look.hat === 'beanie') {
    const c = look.accent;
    const x0 = dir === 'side' ? 11 : 10, w = dir === 'side' ? 11 : 12;
    p.rect(x0 + 1, 5, w - 2, 2, c.b); p.rect(x0, 7, w, 3, c.b); p.rect(x0, 9, w, 2, c.l);
    for (let x = x0; x < x0 + w; x += 2) p.px(x, 10, c.d);
    p.px(x0 + Math.floor(w / 2), 4, '#f4ead4'); p.px(x0 + Math.floor(w / 2) - 1, 4, '#f4ead4');
  }
}

// ── 도구 ───────────────────────────────────────────────
function drawTool(p, kind, grip, tip) {
  const handle = P.wood;
  p.line(grip[0], grip[1], tip[0], tip[1], handle.l1);
  const dx = tip[0] - grip[0], dy = tip[1] - grip[1];
  const vertical = Math.abs(dy) >= Math.abs(dx);
  const [tx, ty] = tip;
  const m = P.metal;
  if (kind === 'hoe') {
    if (vertical) { const s = Math.sign(dy) || 1; p.rect(tx - 2, ty, 4, 2, m.base); p.rect(tx - 2, ty, 4, 1, m.l2); p.px(tx + 1, ty + s, m.d1); p.rect(tx - 2, ty + (s > 0 ? 2 : -1), 4, 1, m.d1); }
    else { const s = Math.sign(dx) || 1; p.rect(tx - (s > 0 ? 0 : 1), ty, 2, 4, m.base); p.px(tx, ty, m.l2); p.rect(tx - (s > 0 ? 0 : 1), ty + 3, 2, 1, m.d1); }
  } else if (kind === 'axe') {
    if (vertical) { p.rect(tx - 3, ty - 1, 4, 4, m.base); p.rect(tx - 3, ty - 1, 1, 4, m.l2); p.rect(tx, ty - 1, 1, 4, m.d1); p.px(tx + 1, ty, handle.d1); }
    else { const s = Math.sign(dx) || 1; p.rect(tx - 1, ty - 3, 3, 4, m.base); p.rect(tx - 1, ty - 3, 3, 1, m.l2); p.px(s < 0 ? tx - 1 : tx + 1, ty - 2, m.l2); p.rect(tx - 1, ty, 3, 1, m.d1); }
  }
}

function drawDust(p, at, size) {
  const [x, y] = at, c = mix(P.dirt.l2, '#ffffff', 0.25), c2 = P.dirt.l1;
  p.px(x - 2 - size, y, c); p.px(x + 2 + size, y, c); p.px(x - 1 - size, y - 1, c2); p.px(x + 1 + size, y - 1, c2);
  if (size > 1) { p.px(x - 4, y - 2, c); p.px(x + 4, y - 2, c); p.px(x, y - 2, c2); }
}

function drawCan(p, dir, tilt, f, behind) {
  const m = { d: '#3f6c8a', b: '#5e97b8', l: '#9fd0e8' };
  const drop = (x, y) => { p.px(x, y, P.water.l2); p.px(x, y + 1, P.water.base); };
  if (dir === 'down') {
    p.rect(12, 20, 7, 5, m.b); p.rect(12, 20, 7, 1, m.l); p.rect(18, 20, 1, 5, m.d); p.rect(12, 24, 7, 1, m.d);
    p.line(14, 19, 16, 19, m.d); p.px(13, 20, m.d);
    const sx = 17, sy = 25; const ex = tilt ? 20 : 19, ey = tilt ? 29 : 28;
    p.line(sx, sy, ex, ey, m.b); p.px(ex, ey, m.l); p.px(ex + 1, ey, m.d);
    if (tilt) { const o = f % 3; drop(ex, ey + 2 + o); drop(ex - 1, ey + 5 - o); drop(ex + 1, ey + 6 + (o % 2)); }
  } else if (dir === 'side') {
    p.rect(5, 19, 7, 5, m.b); p.rect(5, 19, 7, 1, m.l); p.rect(11, 19, 1, 5, m.d); p.rect(5, 23, 7, 1, m.d);
    p.line(7, 18, 10, 18, m.d);
    const ex = tilt ? 1 : 1, ey = tilt ? 25 : 22;
    p.line(5, 21, ex, ey, m.b); p.px(ex, ey, m.l); p.px(ex - 1, ey, m.d);
    if (tilt) { const o = f % 3; drop(0, ey + 2 + o); drop(1, ey + 5 - o); drop(-1, ey + 6 + (o % 2)); }
  } else {
    p.rect(12, 12, 7, 5, m.b); p.rect(12, 12, 7, 1, m.l); p.rect(18, 12, 1, 5, m.d);
    if (tilt) { const o = f % 3; drop(15, 5 + o); drop(17, 3 - o + 1); drop(13, 6 + (o % 2)); }
  }
}

// ── 프레임 합성 ───────────────────────────────────────────
function drawFrame(img, fx, fy, look, dirName, pose) {
  const p = new Painter(img, fx + OX, fy + OY);
  const bob = pose.bob ?? 0;
  const side = dirName === 'left' || dirName === 'right';
  const view = side ? 'side' : dirName;

  if (view === 'down' || view === 'up') {
    const back = view === 'up';
    // 뒤쪽 레이어 (위를 볼 때 도구는 몸 뒤)
    if (pose.kind && pose.behind) { p.dy = bob; drawTool(p, pose.kind, pose.grip, pose.tip); if (pose.dust) drawDust(p, ...pose.dust); }
    if (pose.can && back) { p.dy = bob; drawCan(p, 'up', pose.can.tilt, pose.can.f); }
    p.dy = 0; drawLegsFront(p, look, pose, back);
    p.dy = bob; drawTorsoFront(p, look, back);
    const raised = pose.kind && pose.raise;
    const sL = [10, 18], sR = [20, 18];
    const drawArms = () => {
      if (pose.kind) { const g = pose.grip; arm(p, sL, [g[0] - 1, g[1]], look); arm(p, sR, [g[0], g[1]], look); }
      else if (pose.can) {
        if (back) { arm(p, sL, [12, 13], look); arm(p, sR, [19, 13], look); }
        else { arm(p, sL, [11, 21], look); arm(p, sR, [19, 21], look); }
      } else if (pose.reachL) { arm(p, sL, pose.reachL, look); arm(p, sR, pose.reachR, look); }
      else { arm(p, sL, [10, 22 + (pose.armL ?? 0)], look); arm(p, sR, [20, 22 + (pose.armR ?? 0)], look, { sleeveCol: look.shirt.b }); }
    };
    // 도구를 머리 위로 들 때: 팔/도구가 머리 뒤로 (얼굴 가리지 않게)
    if (raised && !back) { drawTool(p, pose.kind, pose.grip, pose.tip); }
    drawArms();
    if (back) { drawHeadBack(p, look); drawHairFront(p, look, true); }
    else { drawHeadFront(p, look, pose); drawHairFront(p, look, false); }
    drawHat(p, look, view);
    if (pose.kind && !pose.behind && !raised) { drawTool(p, pose.kind, pose.grip, pose.tip); if (pose.dust) drawDust(p, ...pose.dust); }
    if (pose.can && !back) drawCan(p, 'down', pose.can.tilt, pose.can.f);
  } else {
    // 측면(왼쪽 기준 작성, 오른쪽은 좌우반전)
    const s = pose.s ?? 0, lean = pose.lean ?? 0;
    p.dy = 0;
    drawLegsSide(p, look, s, pose);
    p.dy = bob; p.dx = -lean;
    drawTorsoSide(p, look);
    p.dx = -lean;
    drawHeadSide(p, look, pose);
    drawHat(p, look, 'side');
    p.dx = 0;
    const sh = [15 - lean, 18];
    if (pose.kind) {
      arm(p, sh, pose.grip, look, { side: true, sleeveCol: look.shirt.d });
      drawTool(p, pose.kind, pose.grip, pose.tip); if (pose.dust) drawDust(p, ...pose.dust);
    } else if (pose.can) {
      drawCan(p, 'side', pose.can.tilt, pose.can.f);
      arm(p, sh, [11, 20], look, { side: true, sleeveCol: look.shirt.d });
    } else if (pose.reach) arm(p, sh, pose.reach, look, { side: true, sleeveCol: look.shirt.d });
    else arm(p, sh, [15 + s, 23], look, { side: true, sleeveCol: look.shirt.d });
  }
}

function drawHeadBack(p, look) {
  const { skin } = look;
  p.rect(11, 8, 10, 10, skin.b);
  for (const [x, y] of [[11, 8], [20, 8], [11, 17], [20, 17]]) p.img.clear(p.ox + x + p.dx, p.oy + y + p.dy);
  p.rect(20, 9, 1, 8, skin.d);
  p.px(10, 13, skin.b); p.px(21, 13, skin.d);
}

function drawTorsoSide(p, look) {
  const { shirt, pants } = look;
  p.rect(13, 18, 6, 6, shirt.b); p.rect(13, 18, 1, 5, shirt.l); p.rect(18, 18, 1, 6, shirt.d); p.rect(13, 23, 6, 1, shirt.d);
  p.rect(14, 18, 4, 1, shirt.l);
  if (look.outfit === 'overalls') { p.rect(13, 20, 3, 4, pants.b); p.rect(13, 20, 3, 1, pants.l); p.rect(15, 18, 1, 2, pants.d); }
  else if (look.outfit === 'apron') { p.rect(12, 20, 3, 7, '#efe6d2'); p.rect(12, 20, 1, 7, '#fffaf0'); p.rect(15, 21, 4, 1, '#cfc3a8'); }
  else if (look.outfit === 'vest') { p.rect(13, 18, 2, 6, look.accent.b); p.rect(17, 18, 2, 6, look.accent.d); }
  else if (look.outfit === 'dress') { p.rect(12, 23, 8, 3, shirt.b); p.rect(12, 25, 8, 1, shirt.d); p.rect(19, 23, 1, 3, shirt.d); p.rect(13, 21, 6, 1, look.accent?.b ?? shirt.d); }
  if (look.outfit !== 'dress' && look.outfit !== 'overalls') p.rect(13, 23, 6, 1, look.belt ?? darken(pants.d, 0.2));
}

function drawLegsSide(p, look, s, pose) {
  const { pants, shoes, skin } = look;
  const dress = look.outfit === 'dress';
  const legCol = dress ? skin : pants;
  if (!dress) { p.rect(13, 24, 6, 2, pants.b); p.rect(18, 24, 1, 2, pants.d); }
  const leg = (off, lift, far) => {
    const x = 14 + off, col = far ? darken(legCol.b, 0.18) : legCol.b;
    const top = dress ? 26 : 26;
    p.line(15, top, x + 1, 28 - lift, col, 2);
    p.rect(x, 26 + (Math.abs(off) > 1 ? 1 : 0), 3, 3 - lift - (Math.abs(off) > 1 ? 1 : 0), col);
    p.rect(x - 1, 29 - lift, 4, 2, far ? shoes.d : shoes.b);
    if (!far) { p.rect(x - 1, 29 - lift, 2, 1, shoes.l); }
  };
  leg(s, pose.liftF ?? 0, true);    // 먼 다리
  leg(-s, pose.liftN ?? 0, false);  // 가까운 다리
}

// ── 시트 생성 ───────────────────────────────────────────
export function buildCharacterSheet(look, { anims = ANIMS } = {}) {
  const maxF = Math.max(...anims.map((a) => a.gen('down').length));
  const rows = anims.length * 4;
  const img = new Img(maxF * FW, rows * FH);
  const meta = { frameWidth: FW, frameHeight: FH, originX: 0.5, originY: (FEET_Y + 0.5) / FH, columns: maxF, anims: {} };
  anims.forEach((a, ai) => {
    DIRS.forEach((dir, di) => {
      const view = dir === 'left' || dir === 'right' ? 'side' : dir;
      const poses = a.gen(view);
      const row = ai * 4 + di;
      poses.forEach((pose, fi) => {
        const fx = fi * FW, fy = row * FH;
        if (dir === 'right') {
          const tmp = new Img(FW, FH); drawFrame(tmp, 0, 0, look, 'left', pose); tmp.outline(P.outline, 0.5);
          img.blit(tmp, fx, fy, { flipX: true });
        } else {
          const tmp = new Img(FW, FH); drawFrame(tmp, 0, 0, look, dir, pose); tmp.outline(P.outline, 0.5);
          img.blit(tmp, fx, fy);
        }
      });
      meta.anims[`${a.key}-${dir}`] = { start: row * maxF, end: row * maxF + poses.length - 1, fps: a.fps, repeat: a.repeat };
    });
  });
  return { img, meta };
}
