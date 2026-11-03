// 대화창 오른쪽에 뜨는 흉상 일러스트 (72×80, 화면에서 3배) — 캐릭터 외형(looks.mjs)에서 자동으로 그림
import { Img, mix, darken, lighten } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const W = 72, H = 80, CX = 36;
const O = P.outline;

/** 얼굴 윤곽: y → 반폭 (위는 타원, 아래는 턱으로 좁아짐) */
function faceHalf(y) {
  const top = 19, mid = 40, chin = 55;
  if (y < top || y > chin) return -1;
  if (y <= mid) { const t = (y - mid) / (mid - top); return Math.round(15.5 * Math.sqrt(Math.max(0, 1 - t * t))); }
  const t = (y - mid) / (chin - mid);
  return Math.round(15.5 - t * t * 9.5 - t * 1.5);
}

function hairMass(t, h, x0, x1, y0, y1, shine = true) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.set(x, y, h.b);
  if (shine) for (let x = x0 + 3; x < x0 + (x1 - x0) * 0.55; x++) t.set(x, y0 + 2 + Math.round(Math.abs(x - (x0 + x1) / 2) / 8), h.l);
}

export function buildPortrait(look) {
  const t = new Img(W, H);
  const sk = look.skin, h = look.hair, st = look.hairStyle, sh = look.shirt, acc = look.accent ?? sh;
  const eyeC = look.eye ?? mix(h.d, '#2a1b14', 0.45);

  // ── 뒷머리 ──
  if (st === 'long') { for (let y = 26; y < 76; y++) { const hw = y < 66 ? 21 : 21 - (y - 66) * 1.6; for (let x = CX - hw; x <= CX + hw; x++) t.set(Math.round(x), y, x < CX - 17 || x > CX + 17 ? h.d : h.b); } }
  if (st === 'bob') { for (let y = 26; y < 56; y++) for (let x = CX - 20; x <= CX + 20; x++) t.set(x, y, Math.abs(x - CX) > 17 ? h.d : h.b); for (let x = CX - 20; x <= CX + 20; x++) t.set(x, 55, h.d); }
  if (st === 'ponytail') { for (let y = 30; y < 72; y++) { const cx = 55 + Math.sin((y - 30) / 12) * 3, hw = 5 - Math.max(0, y - 58) / 4; for (let x = cx - hw; x <= cx + hw; x++) t.set(Math.round(x), y, x > cx + hw - 2 ? h.d : x < cx - hw + 2 ? h.l : h.b); } }

  // ── 몸통 (어깨) ──
  for (let y = 58; y < H; y++) {
    const hw = Math.min(30, 12 + (y - 58) * 2.4);
    for (let x = Math.round(CX - hw); x <= Math.round(CX + hw); x++) {
      const edge = Math.abs(x - CX) / hw;
      t.set(x, y, edge > 0.86 ? sh.d : x < CX - hw * 0.5 && y > 62 ? sh.l : sh.b);
    }
  }
  // 옷 디테일
  const o = look.outfit;
  if (o === 'overalls') { const pc = look.pants; for (let y = 66; y < H; y++) for (let x = CX - 10; x <= CX + 10; x++) t.set(x, y, x > CX + 7 ? pc.d : pc.b); t.rect(CX - 10, 66, 21, 1, pc.l); for (const x of [CX - 14, CX + 11]) { t.rect(x, 58, 4, 10, pc.b); t.rect(x, 58, 1, 10, pc.l); } t.rect(CX - 11, 68, 2, 2, P.gold.l1); t.rect(CX + 10, 68, 2, 2, P.gold.l1); }
  if (o === 'apron') { for (let y = 64; y < H; y++) for (let x = CX - 11; x <= CX + 11; x++) t.set(x, y, x > CX + 8 ? '#d8cfb8' : '#f4efe0'); for (const x of [CX - 12, CX + 10]) t.rect(x, 58, 2, 8, '#e8e0cc'); t.rect(CX - 5, 72, 10, 4, '#e0d6bc'); }
  if (o === 'vest') { for (let y = 60; y < H; y++) { const w = 8 + (y - 60) * 0.5; for (let x = 0; x < w; x++) { t.set(Math.round(CX - 9 - x), y, acc.b); t.set(Math.round(CX + 9 + x), y, acc.d); } } t.rect(CX - 1, 66, 2, 2, P.gold.l1); t.rect(CX - 1, 72, 2, 2, P.gold.l1); }
  if (o === 'dress') { for (let x = CX - 9; x <= CX + 9; x++) { t.set(x, 60, acc.b); t.set(x, 61, acc.l); } t.circle(CX, 66, 2, acc.b); }
  // 목 + 깃
  for (let y = 48; y < 62; y++) for (let x = CX - 6; x <= CX + 6; x++) t.set(x, y, y < 53 ? sk.d : x > CX + 3 ? sk.d : sk.b);
  if (o !== 'dress') { for (let i = 0; i < 6; i++) { t.set(CX - 7 + i, 58 + i, lighten(sh.b, 0.35)); t.set(CX + 7 - i, 58 + i, lighten(sh.b, 0.2)); } }

  // ── 얼굴 ──
  for (let y = 19; y <= 55; y++) {
    const hw = faceHalf(y); if (hw < 0) continue;
    for (let x = CX - hw; x <= CX + hw; x++) {
      let c = sk.b;
      if (x > CX + hw - 4 || y > 52) c = mix(sk.b, sk.d, 0.55);
      else if (x > CX + 6) c = mix(sk.b, sk.d, 0.18);
      if (x < CX - hw + 5 && y > 34 && y < 46) c = mix(c, sk.l, 0.5);
      t.set(x, y, c);
    }
  }
  // 귀
  for (const ex of [CX - 17, CX + 17]) { t.ellipse(ex, 39, 2.5, 4, sk.b); t.set(ex + (ex < CX ? 0 : 0), 39, sk.d); }
  // 눈썹
  const brow = h.d;
  for (let i = 0; i < 7; i++) { t.set(CX - 12 + i, 31 - (i > 2 && i < 6 ? 1 : 0), brow); t.set(CX + 6 + i, 31 - (i > 0 && i < 4 ? 1 : 0), brow); }
  // 눈 (흰자 + 홍채 + 동공 + 반짝임 + 속눈썹)
  for (const [ex, dir] of [[CX - 8, -1], [CX + 8, 1]]) {
    t.rrect(ex - 3, 35, 7, 7, '#fbf6ee', 2);
    t.rrect(ex - 2, 35, 5, 7, eyeC, 1);
    t.rect(ex - 1, 37, 3, 3, darken(eyeC, 0.45));
    t.rect(ex - 2, 40, 5, 1, lighten(eyeC, 0.25));
    t.rect(ex - 2, 36, 2, 2, '#ffffff'); t.set(ex + 1, 39, '#ffffff');
    t.rect(ex - 4, 34, 9, 1, O); t.set(ex + 4 * dir, 35, O); t.set(ex + 5 * dir, 34, O);
    t.rect(ex - 3, 42, 7, 1, mix(sk.b, sk.d, 0.6));
  }
  // 코 · 입 · 볼터치
  t.set(CX + 1, 45, sk.d); t.set(CX + 1, 46, sk.d); t.set(CX, 47, mix(sk.b, sk.d, 0.5));
  const lip = mix(sk.d, '#b3473f', 0.55);
  t.rect(CX - 3, 50, 7, 1, lip); t.set(CX - 4, 49, lip); t.set(CX + 4, 49, lip); t.rect(CX - 1, 51, 3, 1, mix(lip, '#e88a8a', 0.5));
  for (const bx of [CX - 10, CX + 10]) for (let dx = -3; dx <= 3; dx++) for (let dy = -1; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dy) * 2 < 4) t.set(bx + dx, 46 + dy, mix(t.get(bx + dx, 46 + dy), '#ff7a80', 0.35));
  // 수염
  if (look.beard) {
    const b = look.beardColor ?? h;
    for (let y = 44; y <= 58; y++) { const hw = Math.max(0, faceHalf(Math.min(y, 55)) + (y > 55 ? -2 : 0)); for (let x = CX - hw; x <= CX + hw; x++) { if (y < 48 && Math.abs(x - CX) < 9) continue; if (y >= 48 && y <= 51 && Math.abs(x - CX) < 5) continue; t.set(x, y, x > CX + hw - 3 ? b.d : (x + y) % 5 === 0 ? b.l : b.b); } }
    t.rect(CX - 5, 47, 11, 2, b.b); t.rect(CX - 3, 50, 7, 1, lip);
  }

  // ── 앞머리 ──
  if (st === 'bald') {
    for (const sx of [CX - 17, CX + 13]) hairMass(t, h, sx, sx + 4, 30, 40, false);
    t.rect(CX - 7, 22, 5, 2, lighten(sk.b, 0.3)); t.set(CX - 8, 24, lighten(sk.b, 0.3));
  } else {
    // 머리 윗부분 덩어리
    for (let y = 10; y <= 33; y++) for (let x = CX - 20; x <= CX + 20; x++) {
      const dx = (x - CX) / 19.5, dy = (y - 30) / 19; if (dx * dx + dy * dy > 1) continue;
      t.set(x, y, dx > 0.62 ? h.d : h.b);
    }
    // 앞머리 끝 (지그재그)
    const fringeY = st === 'bob' ? 30 : 27;
    for (let x = CX - 16; x <= CX + 16; x++) {
      const k = ((x - CX + 16) % 7);
      const len = st === 'bob' ? 1 : [3, 5, 6, 5, 3, 1, 0][k];
      for (let y = fringeY; y < fringeY + len; y++) t.set(x, y, k === 2 ? h.d : h.b);
    }
    // 옆머리
    const sideTo = st === 'long' ? 66 : st === 'bob' ? 52 : st === 'ponytail' || st === 'bun' ? 40 : 42;
    for (const [x0, x1] of [[CX - 19, CX - 15], [CX + 15, CX + 19]]) for (let y = 26; y <= sideTo; y++) for (let x = x0; x <= x1; x++) t.set(x, y, x === x0 || x === x1 ? h.d : h.b);
    // 하이라이트 띠 (윤기)
    for (let x = CX - 13; x <= CX + 6; x++) { const y = 15 + Math.round(((x - CX + 3) / 9) ** 2 * 2); t.set(x, y, h.l); if (x % 3) t.set(x, y + 1, h.l); }
    // 결 표현
    for (const lx of [CX - 9, CX - 2, CX + 6, CX + 12]) for (let y = 18; y < 27; y++) if ((y + lx) % 3 === 0) t.set(lx + Math.floor((y - 18) / 4), y, h.d);
    if (st === 'spiky') for (const [sx, top] of [[CX - 14, 9], [CX - 6, 4], [CX + 2, 3], [CX + 10, 6], [CX + 17, 13]]) for (let y = top; y < 16; y++) { const w = Math.round((y - top) * 0.6); for (let x = sx - w; x <= sx + w; x++) t.set(x, y, x > sx ? h.d : h.b); }
    if (st === 'bun') { t.circle(CX, 8, 8, h.b); t.circle(CX - 2, 6, 4, h.l); for (let y = 2; y < 15; y++) t.set(CX + 6, y, h.d); t.rect(CX - 6, 14, 12, 2, acc.b); }
    if (st === 'ponytail') t.rect(CX + 14, 22, 5, 4, acc.b);
  }

  // ── 모자 ──
  if (look.hat === 'straw') {
    const s = { d: '#a8822f', b: '#e3be62', l: '#f5dc8d' };
    t.ellipse(CX, 22, 33, 6, s.d); t.ellipse(CX, 21, 32, 5, s.b);
    for (let x = CX - 30; x < CX + 30; x += 3) t.set(x, 21, s.l);
    for (let y = 4; y <= 20; y++) { const hw = 15 - Math.max(0, 9 - y) * 0.9; for (let x = CX - hw; x <= CX + hw; x++) t.set(Math.round(x), y, x > CX + hw - 4 ? s.d : (x + y) % 4 === 0 ? s.l : s.b); }
    t.rect(CX - 15, 16, 31, 3, acc.b);
  } else if (look.hat === 'cap') {
    for (let y = 6; y <= 22; y++) { const hw = Math.min(19, 6 + (y - 6) * 1.6); for (let x = CX - hw; x <= CX + hw; x++) t.set(Math.round(x), y, x > CX + hw - 4 ? acc.d : acc.b); }
    t.ellipse(CX - 4, 23, 22, 3.5, acc.d); t.ellipse(CX - 4, 22, 21, 2.5, acc.b);
    t.rect(CX - 8, 9, 8, 2, lighten(acc.b, 0.3)); t.circle(CX, 13, 3, '#f4ead4'); t.set(CX, 6, acc.l);
  } else if (look.hat === 'beanie') {
    for (let y = 5; y <= 22; y++) { const hw = Math.min(20, 8 + (y - 5) * 1.5); for (let x = CX - hw; x <= CX + hw; x++) t.set(Math.round(x), y, y > 17 ? ((x % 3 === 0) ? acc.d : acc.l) : x > CX + hw - 4 ? acc.d : acc.b); }
    t.circle(CX, 4, 4, '#f4ead4'); t.circle(CX - 1, 3, 2, '#ffffff');
  }

  // ── 안경 ──
  if (look.glasses) {
    const g = '#3b2b25';
    for (const ex of [CX - 8, CX + 8]) for (let a = 0; a < 40; a++) { const r = a / 40 * Math.PI * 2; t.set(Math.round(ex + Math.cos(r) * 5.5), Math.round(38.5 + Math.sin(r) * 5), g); }
    t.rect(CX - 2, 37, 5, 1, g);
    for (const ex of [CX - 10, CX + 6]) t.set(ex, 35, '#ffffff');
  }
  t.outline(O, 0.5);
  return t;
}
