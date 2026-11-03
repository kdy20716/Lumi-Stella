// 루미(오리지널 몬스터) 파라메트릭 픽셀아트 생성기
// 한 종 = 32x32 프레임 × [정면 2, 측면(왼쪽) 2, 뒷면 2] = 192x32 시트
// 배틀 화면에서는 같은 프레임을 정수배 확대해서 사용
import { Img, mix, darken, lighten } from './lib/img.mjs';
import { P } from './lib/palette.mjs';

const O = P.outline;
export const CF = 32;
export const CVIEWS = ['down', 'left', 'up'];

const tone = (d, b, l) => ({ d, b, l });

/** 음영 타원: 좌상단 광원 */
function sEll(t, cx, cy, rx, ry, pal, { rim = true } = {}) {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, r = dx * dx + dy * dy;
    if (r > 1) continue;
    let c = pal.b;
    if (rim && dx * 0.6 + dy * 0.8 > 0.62) c = pal.d;
    else if (dx * 0.5 + dy * 0.7 < -0.55 && r > 0.25) c = pal.l;
    t.set(x, y, c);
  }
}
function tri(t, a, b, c, col) {
  const minY = Math.floor(Math.min(a[1], b[1], c[1])), maxY = Math.ceil(Math.max(a[1], b[1], c[1]));
  const minX = Math.floor(Math.min(a[0], b[0], c[0])), maxX = Math.ceil(Math.max(a[0], b[0], c[0]));
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const p = [x + 0.5, y + 0.5];
    const d1 = s(p, a, b), d2 = s(p, b, c), d3 = s(p, c, a);
    const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos)) t.set(x, y, col);
  }
}
function star(t, cx, cy, r, pal) {
  tri(t, [cx, cy - r], [cx - r * 0.6, cy + r * 0.7], [cx + r * 0.6, cy + r * 0.7], pal.b);
  tri(t, [cx - r, cy - r * 0.2], [cx + r, cy - r * 0.2], [cx, cy + r * 0.45], pal.b);
  t.set(Math.round(cx), Math.round(cy - r * 0.3), pal.l); t.set(Math.round(cx - 1), Math.round(cy), pal.l);
}

// ── 부위 ────────────────────────────────────────────────
function ears(t, c, hx, hy, r, view, f) {
  const a = c.accent ?? c.pal, pal = c.pal;
  const mir = (fn) => { fn(-1); if (view !== 'left') fn(1); };
  const sideShift = view === 'left' ? 2 : 0;
  switch (c.ears) {
    case 'long': mir((s) => { const ex = hx + s * 3.2 + sideShift; sEll(t, ex, hy - r - 3, 1.9, 5.2, pal); if (view !== 'up') t.vline(Math.round(ex), Math.round(hy - r - 5), 5, c.earInner ?? '#ffb8c8'); }); break;
    case 'pointy': mir((s) => { const ex = hx + s * 4.2 + sideShift; tri(t, [ex - 2.6, hy - r + 3], [ex + s * 0.8, hy - r - 5], [ex + 2.6, hy - r + 3], pal.b); if (view !== 'up') tri(t, [ex - 1.2, hy - r + 2], [ex + s * 0.6, hy - r - 2.5], [ex + 1.2, hy - r + 2], c.earInner ?? '#3a2418'); }); break;
    case 'floppy': mir((s) => { // 강아지: 잎사귀 모양으로 늘어진 귀
      const ex = hx + s * (r - 0.5) + sideShift; sEll(t, ex, hy - 1, 2.2, 4.2, a);
      t.line(ex, hy - 4, ex, hy + 2, a.d);
    }); if (view !== 'up') { t.line(hx + sideShift, hy - r + 1, hx + sideShift + 1, hy - r - 3, P.bark.l1); sEll(t, hx + sideShift + 2.5, hy - r - 3.5, 2, 1.3, a); sEll(t, hx + sideShift - 1.5, hy - r - 3, 1.6, 1.1, a); } break;
    case 'catdrop': mir((s) => { // 고양이: 끝이 물방울인 뾰족 귀
      const ex = hx + s * 4.3 + sideShift; tri(t, [ex - 2.8, hy - r + 3], [ex + s * 0.6, hy - r - 4], [ex + 2.8, hy - r + 3], pal.b);
      if (view !== 'up') tri(t, [ex - 1.3, hy - r + 2], [ex + s * 0.5, hy - r - 1.5], [ex + 1.3, hy - r + 2], '#ffc8d8');
      sEll(t, ex + s * 0.6, hy - r - 4.5, 1.4, 1.6, a);
    }); break;
    case 'flamelong': mir((s) => { // 토끼: 끝에 불꽃이 피는 긴 귀
      const ex = hx + s * 3 + sideShift; sEll(t, ex, hy - r - 1.5, 1.9, 4.2, pal);
      if (view !== 'up') t.vline(Math.round(ex), Math.round(hy - r - 3), 4, '#ffd0b0');
      tri(t, [ex - 2.2, hy - r - 4], [ex + s * 0.4 + (f ? 0.6 : -0.6), hy - r - 9], [ex + 2.2, hy - r - 4], '#ff9a3a');
      tri(t, [ex - 1, hy - r - 4.5], [ex + (f ? 0.4 : -0.4), hy - r - 7.5], [ex + 1, hy - r - 4.5], '#ffd65a');
    }); break;
    case 'round': mir((s) => { sEll(t, hx + s * 5 + sideShift, hy - r + 1.5, 2.6, 2.6, pal); if (view !== 'up') t.set(Math.round(hx + s * 5 + sideShift), Math.round(hy - r + 1.5), c.belly); }); break;
    case 'drop': mir((s) => { const ex = hx + s * 5.2 + sideShift; sEll(t, ex, hy - r + 1, 2.4, 2.4, a); tri(t, [ex - 2, hy - r], [ex + s * 1.5, hy - r - 5], [ex + 2, hy - r], a.b); t.set(Math.round(ex - 1), Math.round(hy - r), a.l); }); break;
    case 'antler': mir((s) => {
      const bx = hx + s * 2.5 + sideShift, by = hy - r + 1;
      t.line(bx, by, bx + s * 2, by - 5, P.bark.l1); t.line(bx + s * 2, by - 3, bx + s * 4, by - 4, P.bark.l1);
      sEll(t, bx + s * 2.5, by - 6.5, 2.2, 1.6, a); sEll(t, bx + s * 4.8, by - 5, 1.6, 1.2, a);
    }); break;
    case 'crest': for (const [dx, h] of [[-3, 4], [0, 6], [3, 4]]) { const x = hx + dx + sideShift; tri(t, [x - 2, hy - r + 2], [x + (f ? 0.6 : -0.6), hy - r - h], [x + 2, hy - r + 2], a.b); t.set(Math.round(x), Math.round(hy - r - 1), a.l); } break;
    case 'feather': for (const dx of [-2, 0, 2]) { const x = hx + dx + sideShift; t.line(x, hy - r + 1, x + dx * 0.5, hy - r - 3 - (dx === 0 ? 2 : 0), a.b); t.set(Math.round(x + dx * 0.5), Math.round(hy - r - 3 - (dx === 0 ? 2 : 0)), a.l); } break;
    case 'antenna': mir((s) => { const bx = hx + s * 2 + sideShift; t.line(bx, hy - r + 1, bx + s * 2, hy - r - 4, pal.d); sEll(t, bx + s * 2, hy - r - 5, 1.5, 1.5, a); t.set(Math.round(bx + s * 2), Math.round(hy - r - 5.5), '#fffbe0'); }); break;
    case 'horn': { tri(t, [hx - 4 + sideShift, hy - r + 2], [hx - 5 + sideShift, hy - r - 3], [hx - 2 + sideShift, hy - r + 1], a.d); if (view !== 'left') tri(t, [hx + 4, hy - r + 2], [hx + 5, hy - r - 3], [hx + 2, hy - r + 1], a.d); star(t, hx + sideShift, hy - r - 2.5, 3.2, a); break; }
    case 'cap': { const cy = hy - r * 0.35; sEll(t, hx + sideShift * 0.5, cy, r + 3.2, r * 0.75, a); for (const [dx, dy] of [[-3, -1], [2, -2], [4, 1], [-1, 1]]) { if (view === 'up' && dy > 0) continue; t.rect(Math.round(hx + dx + sideShift * 0.5), Math.round(cy + dy), 2, 1, '#fff6ea'); } t.hline(Math.round(hx - r - 2), Math.round(cy + r * 0.62), Math.round(2 * r + 4), a.d); break; }
    case 'lilypad': { sEll(t, hx + sideShift * 0.5, hy - r + 0.5, r - 0.5, 2.4, a); t.line(hx, hy - r + 0.5, hx + 3, hy - r - 1, a.d); sEll(t, hx - 2 + sideShift * 0.5, hy - r - 1.5, 1.8, 1.4, tone('#d65a86', '#ff8fb1', '#ffd0e0')); break; }
  }
}

function tail(t, c, bx, by, bw, view, f) {
  const a = c.accent ?? c.pal, pal = c.pal;
  const x = view === 'up' ? bx : view === 'left' ? bx + bw + 1.5 : bx + bw + 0.5;
  const y = view === 'up' ? by + 1 : by - 2;
  const flick = f ? 1 : 0;
  switch (c.tail) {
    case 'fluffy': sEll(t, x, y + 1, 3, 3, tone(darken(c.belly, 0.15), c.belly, '#ffffff')); break;
    case 'stub': sEll(t, x, y + 2, 1.8, 1.6, pal); break;
    case 'leaf': tri(t, [x - 1, y + 3], [x + 4, y - 4 - flick], [x + 3, y + 3], a.b); t.line(x, y + 2, x + 3, y - 3 - flick, a.d); break;
    case 'flame': {
      const h = c.bigTail ? 9 : 6;
      tri(t, [x - 2.5, y + 3], [x + 1.5 + flick, y - h], [x + 3.5, y + 3], tone(0, '#e8642e', 0).b);
      tri(t, [x - 1, y + 3], [x + 1 - flick * 0.5, y - h + 3], [x + 2.5, y + 3], '#ffd65a');
      t.set(Math.round(x + 0.5), Math.round(y + 1), '#fff4b0'); break;
    }
    case 'fin': tri(t, [x - 1, y + 3], [x + 4, y - 2 + flick], [x + 4, y + 5 - flick], a.b); t.line(x + 1, y + 2, x + 3, y + 1, a.l); break;
    case 'feathers': for (const dy of [-1, 1, 3]) t.line(x - 1, y + 2, x + 3, y + dy - flick, a.d === undefined ? pal.d : pal.d); break;
    case 'star': t.line(x - 2, y + 3, x + 2, y - 1, pal.b); star(t, x + 3, y - 2 - flick, 3, c.accent); break;
    case 'curlleaf': t.line(x - 1, y + 2, x + 2, y - 2, pal.b); t.line(x + 2, y - 2, x + 1, y - 4, pal.b); sEll(t, x + 2, y - 5 - flick, 2.2, 1.5, a); break;
    case 'watertail': t.line(x - 1, y + 3, x + 3, y, pal.b); t.line(x + 3, y, x + 3, y - 3 - flick, pal.b); sEll(t, x + 3, y - 4 - flick, 1.8, 2, a); t.set(Math.round(x + 2), Math.round(y - 5 - flick), '#ffffff'); break;
    case 'flamepuff': sEll(t, x, y + 1, 3, 3, tone('#e8642e', '#ff9a4a', '#ffd08a')); t.set(Math.round(x), Math.round(y - 2 - flick), '#ffd65a'); t.set(Math.round(x - 1), Math.round(y - 1), '#fff4b0'); break;
    case 'glowbulb': sEll(t, x, y + 2, 2.5, 2.5, tone('#e0b830', '#fff27a', '#fffde0')); break;
  }
}

function face(t, c, hx, hy, view, f, blink) {
  if (view === 'up') return;
  const ink = '#1e1424';
  const eyes = view === 'left' ? [hx - 3] : [hx - 3, hx + 3];
  const ey = Math.round(hy + (c.eyeY ?? 0));
  for (const ex0 of eyes) {
    const ex = Math.round(ex0);
    if (blink || c.eyes === 'sleepy') { t.hline(ex - 1, ey + 1, 2, ink); continue; }
    if (c.eyes === 'big') { t.rect(ex - 1, ey - 1, 3, 3, ink); t.set(ex - 1, ey - 1, '#ffffff'); t.set(ex + 1, ey + 1, c.eyeColor ?? '#4a3a8a'); }
    else { t.rect(ex - 1, ey - 1, 2, 3, ink); t.set(ex - 1, ey - 1, '#ffffff'); t.set(ex, ey + 1, c.eyeColor ?? '#5a3a6a'); }
  }
  const cheek = c.cheeks ?? '#ff9cb0';
  if (view === 'left') t.set(Math.round(hx - 2), ey + 2, cheek);
  else { t.set(Math.round(hx - 5), ey + 2, cheek); t.set(Math.round(hx + 5), ey + 2, cheek); }
  const mx = view === 'left' ? Math.round(hx - 5) : Math.round(hx);
  if (c.mouth === 'beak') { t.rect(mx - (view === 'left' ? 2 : 1), ey + 2, 2, 2, '#f2a93a'); t.set(mx - (view === 'left' ? 2 : 1), ey + 2, '#ffd27a'); }
  else if (c.mouth === 'smile') { t.hline(mx - 2, ey + 3, 4, darken(c.pal.d, 0.3)); t.set(mx - 2, ey + 2, darken(c.pal.d, 0.3)); t.set(mx + 1, ey + 2, darken(c.pal.d, 0.3)); }
  else if (c.mouth !== 'none') { t.set(mx - 1, ey + 3, '#6a2a3a'); t.set(mx, ey + 3, '#6a2a3a'); if (f) t.set(mx, ey + 4, '#e86a7a'); }
}

function extrasBehind(t, c, bx, by, bw, bh, view, f) {
  const ex = c.extras ?? [];
  if (ex.includes('wings')) {
    const w = c.accent?.b && c.wingPal ? c.wingPal : c.pal;
    const flap = f ? -1 : 1;
    if (view !== 'left') for (const s of [-1, 1]) tri(t, [bx + s * (bw - 1), by - 3], [bx + s * (bw + 6), by - 6 + flap * 2], [bx + s * (bw + 3), by + 2], w.l);
    else tri(t, [bx + 2, by - 4], [bx + 9, by - 8 + flap * 2], [bx + 7, by + 1], w.l);
  }
  if (ex.includes('clearwings')) {
    const flap = f ? -1 : 1;
    for (const s of view === 'left' ? [1] : [-1, 1]) { sEll(t, bx + s * (bw + 3), by - 5 + flap, 3.5, 2.2, tone('#a8d8f0', '#d8f2ff', '#ffffff'), { rim: false }); }
  }
}

function extrasFront(t, c, bx, by, bw, bh, hx, hy, r, view, f) {
  const ex = c.extras ?? [];
  if (ex.includes('shell')) {
    const s = c.accent;
    if (view === 'down') { sEll(t, bx, by + 1, bw + 1, bh - 1, s); sEll(t, bx, by + 2, bw - 2, bh - 2, tone(darken(c.belly, 0.2), c.belly, lighten(c.belly, 0.3))); }
    else { sEll(t, bx + (view === 'left' ? 1 : 0), by - 1, bw + 1.5, bh + 1, s); for (const [dx, dy] of [[-3, -2], [2, -3], [0, 1], [4, 1]]) t.set(Math.round(bx + dx), Math.round(by + dy), s.d); t.line(bx - 4, by - 1, bx + 4, by - 1, s.d); }
  }
  if (ex.includes('moss')) for (const [dx, dy] of [[-3, -r + 1], [3, -r + 2], [-1, -r]]) { const mx = hx + dx, my = hy + dy; sEll(t, mx, my, 2, 1.3, c.accent, { rim: false }); }
  if (ex.includes('mane') && view !== 'up') { for (let i = -4; i <= 4; i += 2) tri(t, [hx + i - 1.5, hy + r - 2], [hx + i, hy + r + 3], [hx + i + 1.5, hy + r - 2], c.belly); }
  if (ex.includes('collar') && view !== 'up') for (const dx of [-3, 0, 3]) sEll(t, hx + dx - (view === 'left' ? 1 : 0), hy + r - 0.5, 2, 1.3, c.accent);
  if (ex.includes('spots') && view !== 'down') for (const [dx, dy] of [[-2, -2], [2, -1], [0, 1]]) t.rect(Math.round(bx + dx), Math.round(by + dy), 2, 1, '#ffd65a');
  if (ex.includes('whiskers') && view === 'down') for (const sx of [-1, 1]) { t.hline(Math.round(hx + sx * 5.5) - (sx < 0 ? 1 : 0), Math.round(hy + 2), 2, '#ffffff'); t.set(Math.round(hx + sx * 6.5), Math.round(hy + 3), '#ffffff'); }
  if (ex.includes('glow') && view !== 'up') { sEll(t, bx, by + 1, bw - 2, bh - 1.5, tone('#e0b830', '#fff27a', '#fffde0'), { rim: false }); }
  if (ex.includes('stars')) for (const [dx, dy] of [[-9, -10], [9, -6], [-8, 2]]) { const tw = (f + dx) % 2 === 0; t.set(16 + dx, 14 + dy, tw ? '#fff4b0' : '#ffd65a'); if (tw) { t.set(16 + dx + 1, 14 + dy, '#ffd65a'); t.set(16 + dx, 14 + dy + 1, '#ffd65a'); } }
}

function feet(t, c, bx, view, f, bob) {
  if (c.legs === 'none') return;
  const d = c.pal.d;
  if (c.legs === 'bird') { for (const s of view === 'left' ? [0] : [-2, 2]) { t.vline(Math.round(bx + s), 26 + bob, 3, '#e09a2a'); t.hline(Math.round(bx + s - 1), 28, 3, '#e09a2a'); } return; }
  const pts = view === 'left' ? [[bx - 3, f ? -1 : 0], [bx + 3, f ? 0 : -1]] : [[bx - 4, f ? -1 : 0], [bx + 4, f ? 0 : -1]];
  for (const [x, lift] of pts) sEll(t, x, 27.5 + lift, 2.3, 1.7, tone(darken(d, 0.2), d, c.pal.b));
}

export function drawCreature(c, view, f) {
  const t = new Img(CF, CF);
  const bob = f ? 1 : 0;
  const r = c.head ?? 7, [bw, bh] = c.body ?? [6, 5];
  const side = view === 'left';
  if (c.extras?.includes('jelly')) {
    // 젤리: 한 덩어리 몸
    const cx = side ? 15 : 16, cy = 20 + bob * 0.5;
    const sq = f ? 0.6 : 0;
    sEll(t, cx, cy, 9 + sq, 8 - sq, c.pal);
    sEll(t, cx - 2, cy - 3, 3, 2, tone(c.pal.l, lighten(c.pal.l, 0.4), '#ffffff'), { rim: false });
    t.hline(cx - 6, 27, 12, c.pal.d);
    face(t, c, cx + (side ? -1 : 0), cy - 1, view, f, false);
    if (view === 'up') { t.set(cx + 2, cy - 4, '#ffffff'); }
    t.outline(O, 0.5);
    return t;
  }
  const bx = side ? 18 : 16, by = 22 + bob;
  const hx = side ? 13 : 16, hy = 13 + bob + (c.headY ?? 0);
  // 뒤쪽 레이어
  extrasBehind(t, c, bx, by, bw, bh, view, f);
  if (view !== 'up') tail(t, c, bx, by, bw, view, f);
  if (view === 'up' || side) ears(t, c, hx, hy, r, view, f);
  // 몸통
  sEll(t, bx, by, bw, bh, c.pal);
  if (view === 'down') sEll(t, bx, by + 1, bw - 2.2, bh - 1.8, tone(darken(c.belly, 0.12), c.belly, lighten(c.belly, 0.4)), { rim: false });
  if (side) sEll(t, bx - 2.5, by + 1, bw - 3, bh - 2, tone(darken(c.belly, 0.12), c.belly, c.belly), { rim: false });
  feet(t, c, bx, view, f, bob);
  if (view === 'up') tail(t, c, bx, by, bw, view, f);
  // 머리
  sEll(t, hx, hy, r + (c.headW ?? 0), r, c.pal);
  if (view === 'down' && c.faceMask) sEll(t, hx, hy + 2, r - 2.5, r - 3.5, tone(c.belly, c.belly, lighten(c.belly, 0.3)), { rim: false });
  extrasFront(t, c, bx, by, bw, bh, hx, hy, r, view, f);
  if (view === 'down') ears(t, c, hx, hy, r, view, f);
  face(t, c, hx, hy, view, f, false);
  if (c.ears === 'cap' && view === 'down') ears(t, c, hx, hy, r, view, f);
  t.outline(O, 0.5);
  return t;
}

// ── 종 정의 (색/형태만. 능력치·기술은 shared/data/creatures.json) ─────
export const SPECIES_ART = {
  // 스타터: 강아지(풀) · 고양이(물) · 토끼(불)
  saerok: { pal: tone('#7a5a3a', '#c99a62', '#ecc890'), belly: '#fff4dc', accent: tone('#2f7a3a', '#4fae4a', '#8fdc6a'), ears: 'floppy', tail: 'curlleaf', extras: ['collar'], faceMask: true, head: 7, body: [6, 5], cheeks: '#ff9c9c' },
  chalang: { pal: tone('#3a5a8a', '#6a8ec8', '#a8c8f0'), belly: '#eef6ff', accent: tone('#3f8fc8', '#7fd3ff', '#d8f4ff'), ears: 'catdrop', tail: 'watertail', extras: ['whiskers'], faceMask: true, cheeks: '#ffb0c8', eyeColor: '#3fb0d8' },
  morak: { pal: tone('#c9a08a', '#f6e2d2', '#fffaf4'), belly: '#ffffff', accent: tone('#e09a2a', '#ffd65a', '#fff4b0'), ears: 'flamelong', tail: 'flamepuff', extras: ['spots'], head: 7, headY: 3, body: [6, 5], cheeks: '#ff8a7a', eyeColor: '#e8642e' },
  kongkong: { pal: tone('#b8925a', '#e8c48a', '#fbe4b8'), belly: '#fff8ea', ears: 'round', tail: 'stub', head: 8, body: [7, 6], faceMask: true },
  poreureu: { pal: tone('#4a7ab8', '#7aaee0', '#b8dcf8'), belly: '#fff6dc', accent: tone('#c98a2a', '#f2b84a', '#ffe08a'), ears: 'feather', tail: 'feathers', extras: ['wings'], mouth: 'beak', legs: 'bird', head: 7, body: [5, 5] },
  posil: { pal: tone('#a8845a', '#e8c89a', '#fbe8c8'), belly: '#fff2dc', accent: tone('#a82a2a', '#e0473b', '#ff8a7a'), ears: 'cap', tail: 'none', head: 6, body: [5, 5], headY: 1 },
  jagal: { pal: tone('#5a7a3a', '#8aae5a', '#bcd88a'), belly: '#e8e0b0', accent: tone('#5f5f6a', '#8e909c', '#c0c2ca'), ears: 'none', tail: 'stub', extras: ['shell'], body: [8, 5], head: 6, headY: 2 },
  pongpong: { pal: tone('#2f7a4a', '#5ab86a', '#9ae08a'), belly: '#f0f8d0', accent: tone('#1f6a3a', '#3f9a4a', '#7fd06a'), ears: 'lilypad', eyes: 'big', mouth: 'smile', tail: 'none', head: 7, headW: 1, body: [7, 5], eyeY: -2 },
  banjjak: { pal: tone('#3a3a7a', '#5a5aaa', '#8a8ad8'), belly: '#fff6a0', accent: tone('#c9a23a', '#ffd65a', '#fff4b0'), ears: 'antenna', tail: 'glowbulb', extras: ['clearwings', 'glow'], head: 7, body: [5, 5], eyeColor: '#ffd65a' },
  busit: { pal: tone('#b85a1f', '#e8893a', '#ffbf6a'), belly: '#fff1dc', accent: tone('#e09a2a', '#ffd65a', '#fff4b0'), ears: 'pointy', tail: 'flame', bigTail: true, extras: ['mane'], faceMask: true, earInner: '#5a2a1a' },
  mallang: { pal: tone('#3a8aa8', '#6ad0e0', '#b8f4fa'), belly: '#e8fbff', extras: ['jelly'], legs: 'none', ears: 'none', tail: 'none', cheeks: '#ff9ccc' },
  ikkigom: { pal: tone('#5a3f2a', '#8a6440', '#b88a5a'), belly: '#d8c09a', accent: tone('#2f6a35', '#5dab4a', '#86c95b'), ears: 'round', tail: 'stub', extras: ['moss'], head: 7, body: [7, 6], faceMask: true },
  astra: { pal: tone('#2a2a6a', '#4a5ab8', '#8a9ae8'), belly: '#e8e0ff', accent: tone('#c99a2a', '#ffd65a', '#fff4b0'), wingPal: tone('#6a5ab8', '#a8a0f0', '#e0dcff'), ears: 'horn', tail: 'star', extras: ['wings', 'stars'], head: 7, body: [6, 5], eyeColor: '#ffd65a', faceMask: true },
};

export function buildCreatureSheet(cfg) {
  const img = new Img(CF * 6, CF);
  CVIEWS.forEach((v, vi) => { for (let f = 0; f < 2; f++) img.blit(drawCreature(cfg, v, f), (vi * 2 + f) * CF, 0); });
  return img;
}
