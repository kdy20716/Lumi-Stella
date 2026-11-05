// 대화창 일러스트: 인게임은 2D 도트지만, 대화창 오른쪽 위에는 매끈한 벡터(SVG) 일러스트 흉상
//  - 외형 색(머리 · 피부 · 옷)은 도트 캐릭터와 같은 정의(assets/looks.json)를 씀 → 어떤 해상도에서도 선명
//  - 인물마다 성격에 맞는 포즈와 표정 (손 흔들기 · 팔짱 · 허리에 손 · 턱 괴고 생각 · 주먹 쥐고 응원 · 손가락으로 가리키기 · 두 손 모으기)
type Tone = { d: string; b: string; l: string };
interface Look { skin: Tone; hair: Tone; hairStyle: string; shirt: Tone; pants: Tone; outfit: string; sleeves: string; accent: Tone; beard?: boolean; glasses?: boolean; hat?: string }
export type Pose = 'wave' | 'cross' | 'hips' | 'think' | 'cheer' | 'point' | 'clasp' | 'behind';
export type Face = 'smile' | 'grin' | 'calm' | 'smug' | 'gentle' | 'serious';

/** 성격 → 포즈 · 표정 */
const PERSONA: Record<string, [Pose, Face]> = {
  player: ['wave', 'smile'], rival_m: ['point', 'grin'], rival_f: ['point', 'grin'], mom: ['clasp', 'gentle'], mayor: ['behind', 'gentle'],
  professor: ['think', 'calm'], nurse: ['clasp', 'smile'], hana: ['cheer', 'grin'], minsu: ['cross', 'serious'], sora: ['hips', 'smug'],
  park: ['behind', 'calm'], juni: ['cheer', 'grin'], luna: ['clasp', 'gentle'], teo: ['hips', 'grin'], mio: ['wave', 'smile'], doyun: ['think', 'calm'],
  bugkid: ['cheer', 'grin'], hiker: ['hips', 'grin'], lass: ['wave', 'smile'], fisher: ['behind', 'calm'], leader: ['hips', 'smug'], villager: ['wave', 'smile'],
  woodcutter: ['cross', 'grin'], miner: ['cross', 'serious'], swimmer: ['cheer', 'grin'], skier: ['point', 'grin'], explorer: ['think', 'smile'], researcher: ['think', 'calm'],
  gentleman: ['behind', 'calm'], lady: ['clasp', 'gentle'], ace_m: ['point', 'smug'], ace_f: ['hips', 'smug'],
  leader_harbor: ['hips', 'grin'], leader_maple: ['clasp', 'gentle'], leader_forge: ['cross', 'serious'], leader_ember: ['point', 'grin'], leader_lumina: ['hips', 'smug'],
  leader_frost: ['cross', 'calm'], leader_summit: ['think', 'serious'], elite1: ['cross', 'smug'], elite2: ['hips', 'smug'], elite3: ['think', 'serious'], elite4: ['point', 'serious'], champion: ['point', 'smug'],
};
const personaOf = (id: string): [Pose, Face] => PERSONA[id] ?? (/^[mf]\d$/.test(id) ? ['wave', 'smile'] : (['wave', 'smile'] as [Pose, Face]));

let LOOKS: Record<string, Look> | null = null;
let loading: Promise<void> | null = null;
export function loadLooks() {
  loading ??= fetch('assets/looks.json').then((r) => r.json()).then((j) => { LOOKS = j as Record<string, Look>; }).catch(() => { LOOKS = {}; });
  return loading;
}

const OL = '#3a2418';
const esc = (s: string) => s.replace(/[^#\w(),.% -]/g, '');

/** 인물 일러스트 SVG 문자열 (viewBox 240×300, 허리 위 흉상) */
export function illustSvg(id: string, pose?: Pose, face?: Face): string {
  const L = LOOKS?.[id] ?? LOOKS?.villager;
  if (!L) return '';
  const [p0, f0] = personaOf(id); pose ??= p0; face ??= f0;
  const uid = `il${Math.random().toString(36).slice(2, 7)}`;
  const sk = L.skin, hr = L.hair, sh = L.shirt, pa = L.pants, ac = L.accent;
  const eyeCol = /^leader|elite|champion|ace/.test(id) ? ac.b : hr.d === '#9a9a9e' || L.hairStyle === 'bald' ? '#5a4a3a' : mixHex(hr.b, '#3a6ab0', 0.35);
  const longSleeve = L.sleeves === 'long';
  const arm = longSleeve ? `url(#${uid}sh)` : `url(#${uid}sk)`;
  const defs = `<defs>
    <linearGradient id="${uid}sk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${sk.l}"/><stop offset=".55" stop-color="${sk.b}"/><stop offset="1" stop-color="${sk.d}"/></linearGradient>
    <linearGradient id="${uid}hr" x1="0" y1="0" x2=".4" y2="1"><stop offset="0" stop-color="${hr.l}"/><stop offset=".45" stop-color="${hr.b}"/><stop offset="1" stop-color="${hr.d}"/></linearGradient>
    <linearGradient id="${uid}sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${sh.l}"/><stop offset=".5" stop-color="${sh.b}"/><stop offset="1" stop-color="${sh.d}"/></linearGradient>
    <linearGradient id="${uid}pa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${pa.l}"/><stop offset=".5" stop-color="${pa.b}"/><stop offset="1" stop-color="${pa.d}"/></linearGradient>
    <radialGradient id="${uid}ey" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="${mixHex(eyeCol, '#ffffff', 0.35)}"/><stop offset=".6" stop-color="${eyeCol}"/><stop offset="1" stop-color="${mixHex(eyeCol, '#000000', 0.45)}"/></radialGradient>
    <radialGradient id="${uid}bl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff7a8a" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a8a" stop-opacity="0"/></radialGradient>
  </defs>`;
  const S = `stroke="${OL}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;
  // ── 몸통 (어깨 ~ 허리) ──
  const torso = `<path d="M60 300 C58 250 64 214 92 200 L120 194 L148 200 C176 214 182 250 180 300 Z" fill="url(#${uid}sh)" ${S}/>`;
  let outfit = '';
  if (L.outfit === 'overalls') outfit = `<path d="M84 300 L86 236 L154 236 L156 300 Z" fill="url(#${uid}pa)" ${S}/><path d="M92 238 L98 202 M148 238 L142 202" stroke="${pa.d}" stroke-width="7"/><circle cx="96" cy="236" r="4" fill="${ac.l}" ${S}/><circle cx="144" cy="236" r="4" fill="${ac.l}" ${S}/><rect x="108" y="250" width="24" height="16" rx="3" fill="${pa.l}" ${S}/>`;
  else if (L.outfit === 'apron') outfit = `<path d="M88 300 L92 224 Q120 214 148 224 L152 300 Z" fill="${mixHex(ac.b, '#ffffff', 0.15)}" ${S}/><path d="M98 226 L108 200 M142 226 L132 200" stroke="${ac.d}" stroke-width="5"/>`;
  else if (L.outfit === 'vest') outfit = `<path d="M70 300 C70 250 76 220 96 204 L112 260 L106 300 Z" fill="url(#${uid}pa)" ${S}/><path d="M170 300 C170 250 164 220 144 204 L128 260 L134 300 Z" fill="url(#${uid}pa)" ${S}/>`;
  else if (L.outfit === 'dress') outfit = `<path d="M100 200 Q120 222 140 200" fill="none" stroke="${ac.b}" stroke-width="6"/><path d="M76 276 Q120 290 164 276" fill="none" stroke="${ac.d}" stroke-width="4"/>`;
  else outfit = `<path d="M104 198 L120 222 L136 198" fill="${sh.l}" ${S}/><circle cx="120" cy="240" r="3" fill="${ac.b}"/><circle cx="120" cy="262" r="3" fill="${ac.b}"/>`;
  const neck = `<path d="M108 178 L108 200 Q120 208 132 200 L132 178 Z" fill="${sk.d}" ${S}/>`;
  // ── 팔 · 손 (포즈) ──
  const hand = (x: number, y: number, r = 11) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#${uid}sk)" ${S}/>`;
  const limb = (d: string) => `<path d="${d}" fill="none" stroke="${OL}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${arm}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`;
  let armsBack = '', armsFront = '';
  switch (pose) {
    case 'wave': armsBack = limb('M78 214 Q62 254 74 300'); armsFront = limb('M164 212 Q196 196 198 150') + hand(200, 140, 12) + `<path d="M214 124 q8 4 6 14 M222 140 q6 6 0 14" stroke="${OL}" stroke-width="2.5" fill="none" opacity=".6"/>`; break;
    case 'cross': armsBack = limb('M78 214 Q66 250 78 270') + limb('M162 214 Q174 250 162 270'); armsFront = limb('M80 262 Q120 278 158 252') + limb('M160 264 Q120 282 82 252') + hand(156, 250, 10) + hand(84, 250, 10); break;
    case 'hips': armsFront = limb('M78 214 Q50 244 72 276') + hand(78, 278, 11) + limb('M162 214 Q190 244 168 276') + hand(162, 278, 11); break;
    case 'think': armsBack = limb('M78 214 Q66 254 78 300'); armsFront = limb('M160 214 Q178 250 150 252') + limb('M150 252 Q140 222 136 186') + hand(136, 180, 11); break;
    case 'cheer': armsBack = limb('M78 214 Q66 254 78 300'); armsFront = limb('M164 212 Q190 190 186 136') + `<circle cx="186" cy="128" r="14" fill="url(#${uid}sk)" ${S}/><path d="M178 124 h16 M178 131 h16" stroke="${sk.d}" stroke-width="2"/>`; break;
    case 'point': armsBack = limb('M78 214 Q66 254 78 300'); armsFront = limb('M162 214 Q196 222 214 190') + hand(216, 186, 10) + `<path d="M222 180 L236 166" stroke="${OL}" stroke-width="9" stroke-linecap="round"/><path d="M222 180 L236 166" stroke="${sk.b}" stroke-width="5" stroke-linecap="round"/>`; break;
    case 'clasp': armsFront = limb('M80 214 Q74 262 112 262') + limb('M160 214 Q166 262 128 262') + `<ellipse cx="120" cy="260" rx="16" ry="12" fill="url(#${uid}sk)" ${S}/><path d="M112 256 v8 M120 254 v10 M128 256 v8" stroke="${sk.d}" stroke-width="2"/>`; break;
    case 'behind': armsBack = limb('M78 214 Q70 252 92 288') + limb('M162 214 Q170 252 148 288'); break;
  }
  // ── 머리 ──
  const head = `<path d="M74 112 C74 64 166 64 166 112 C166 150 150 176 120 184 C90 176 74 150 74 112 Z" fill="url(#${uid}sk)" ${S}/>
    <ellipse cx="74" cy="122" rx="8" ry="12" fill="${sk.b}" ${S}/><ellipse cx="166" cy="122" rx="8" ry="12" fill="${sk.b}" ${S}/>`;
  const hairBack = hairBackOf(L.hairStyle, uid, S);
  const hairFront = hairFrontOf(L.hairStyle, uid, S, hr);
  // 눈 · 눈썹 · 입
  const eye = (cx: number, flip: number) => {
    if (face === 'smile' || face === 'gentle') return `<path d="M${cx - 13} ${126} Q${cx} ${112} ${cx + 13} ${126}" fill="none" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>`;
    const h = face === 'smug' ? 14 : 20;
    return `<ellipse cx="${cx}" cy="124" rx="11" ry="${h / 2 + 2}" fill="#ffffff" ${S}/>
      <ellipse cx="${cx + flip}" cy="${126}" rx="8" ry="${h / 2}" fill="url(#${uid}ey)"/><ellipse cx="${cx + flip}" cy="128" rx="3.5" ry="${h / 4}" fill="#1e1424"/>
      <circle cx="${cx + flip - 3}" cy="${120}" r="3" fill="#ffffff"/><circle cx="${cx + flip + 3}" cy="${131}" r="1.5" fill="#ffffff"/>
      ${face === 'smug' ? `<path d="M${cx - 13} 117 L${cx + 13} 118" stroke="${OL}" stroke-width="4" stroke-linecap="round"/>` : `<path d="M${cx - 12} 112 Q${cx} 106 ${cx + 12} 112" fill="none" stroke="${OL}" stroke-width="3.5" stroke-linecap="round"/>`}`;
  };
  const brows = face === 'serious' ? `<path d="M88 104 L110 110 M152 104 L130 110" stroke="${hr.d}" stroke-width="5" stroke-linecap="round"/>`
    : `<path d="M88 104 Q99 98 110 103 M130 103 Q141 98 152 104" fill="none" stroke="${hr.d}" stroke-width="4" stroke-linecap="round"/>`;
  const mouth = face === 'grin' ? `<path d="M106 150 Q120 168 134 150 Z" fill="#a8303a" ${S}/><path d="M110 152 L130 152" stroke="#ffffff" stroke-width="3"/>`
    : face === 'smug' ? `<path d="M108 154 Q124 160 134 148" fill="none" stroke="${OL}" stroke-width="3.5" stroke-linecap="round"/>`
    : face === 'serious' ? `<path d="M110 156 L130 155" stroke="${OL}" stroke-width="3.5" stroke-linecap="round"/>`
    : face === 'calm' ? `<path d="M110 153 Q120 158 130 153" fill="none" stroke="${OL}" stroke-width="3.5" stroke-linecap="round"/>`
    : `<path d="M106 150 Q120 164 134 150" fill="#e86a7a" ${S}/>`;
  const blush = `<ellipse cx="90" cy="144" rx="13" ry="7" fill="url(#${uid}bl)"/><ellipse cx="150" cy="144" rx="13" ry="7" fill="url(#${uid}bl)"/>`;
  const nose = `<path d="M119 136 q3 4 0 6" fill="none" stroke="${sk.d}" stroke-width="2.5" stroke-linecap="round"/>`;
  const beard = L.beard ? `<path d="M88 146 C92 186 148 186 152 146 C140 160 100 160 88 146 Z" fill="url(#${uid}hr)" ${S}/>` : '';
  const glasses = L.glasses ? `<g fill="rgba(200,230,255,.25)" stroke="#3a3a4a" stroke-width="3.5"><circle cx="99" cy="125" r="15"/><circle cx="141" cy="125" r="15"/><path d="M114 124 h12" /></g>` : '';
  const hat = L.hat === 'cap' ? `<path d="M74 92 C76 52 164 52 166 92 Z" fill="${ac.b}" ${S}/><path d="M120 86 C150 84 178 88 186 98 C160 100 136 98 120 96 Z" fill="${ac.d}" ${S}/>`
    : L.hat === 'beanie' ? `<path d="M72 98 C70 46 170 46 168 98 Z" fill="${ac.b}" ${S}/><rect x="70" y="88" width="100" height="14" rx="6" fill="${ac.d}" ${S}/><circle cx="120" cy="46" r="9" fill="${ac.l}" ${S}/>`
    : L.hat === 'straw' ? `<ellipse cx="120" cy="88" rx="66" ry="14" fill="#e8c878" ${S}/><path d="M86 86 C88 52 152 52 154 86 Z" fill="#f2d890" ${S}/><path d="M86 80 h68" stroke="${ac.b}" stroke-width="6"/>` : '';
  const eyes = eye(99, 1) + eye(141, -1);
  return `<svg class="ill-svg" viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg">${defs}
    <g class="ill-sway">${hairBack}${armsBack}${torso}${outfit}${neck}${head}${blush}${eyes}${brows}${nose}${mouth}${beard}${glasses}${hairFront}${hat}${armsFront}</g></svg>`;
}

function hairBackOf(style: string, uid: string, S: string) {
  const f = `url(#${uid}hr)`;
  switch (style) {
    case 'long': return `<path d="M66 110 C60 40 180 40 174 110 L182 236 Q120 252 58 236 Z" fill="${f}" ${S}/>`;
    case 'ponytail': return `<path d="M150 70 C206 70 204 170 176 214 C186 160 176 110 150 96 Z" fill="${f}" ${S}/>`;
    case 'bob': return `<path d="M64 112 C58 44 182 44 176 112 L178 168 Q120 180 62 168 Z" fill="${f}" ${S}/>`;
    case 'bun': return `<circle cx="120" cy="40" r="22" fill="${f}" ${S}/>`;
    default: return '';
  }
}
function hairFrontOf(style: string, uid: string, S: string, hr: Tone) {
  const f = `url(#${uid}hr)`;
  const shine = `<path d="M92 72 Q116 60 142 70" fill="none" stroke="${hr.l}" stroke-width="5" stroke-linecap="round" opacity=".8"/>`;
  switch (style) {
    case 'bald': return `<path d="M76 104 C70 120 72 132 76 140 M164 104 C170 120 168 132 164 140" stroke="${hr.b}" stroke-width="9" stroke-linecap="round" fill="none"/>`;
    case 'spiky': return `<path d="M70 112 L66 80 L84 86 L80 56 L102 70 L108 40 L124 64 L140 40 L144 70 L166 56 L160 86 L176 80 L170 112 C150 92 90 92 70 112 Z" fill="${f}" ${S}/>${shine}`;
    case 'long': case 'bob': return `<path d="M70 116 C64 52 176 52 170 116 C160 96 150 86 138 84 C132 98 112 104 92 100 C84 104 76 110 70 116 Z" fill="${f}" ${S}/>${shine}`;
    case 'ponytail': case 'bun': return `<path d="M70 114 C66 56 174 56 170 114 C156 92 140 84 122 88 C108 98 86 100 70 114 Z" fill="${f}" ${S}/><path d="M146 66 Q164 64 160 52" stroke="${hr.d}" stroke-width="6" fill="none"/>${shine}`;
    default: return `<path d="M70 116 C64 54 176 54 170 116 C162 96 146 88 132 92 L124 80 L110 94 C96 92 80 100 70 116 Z" fill="${f}" ${S}/>${shine}`;
  }
}
function mixHex(a: string, b: string, t: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) return a;
  const [x, y] = [p(a), p(b)];
  return esc('#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''));
}
