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
  leader_frost: ['cross', 'calm'], leader_summit: ['think', 'serious'], elite1: ['cross', 'smug'], elite2: ['hips', 'smug'], elite3: ['think', 'serious'], elite4: ['point', 'serious'], champion: ['point', 'smug'], warden: ['cross', 'serious'],
};
export const personaOf = (id: string): [Pose, Face] => PERSONA[id] ?? (/^[mf]\d$/.test(id) ? ['wave', 'smile'] : (['wave', 'smile'] as [Pose, Face]));

let LOOKS: Record<string, Look> | null = null;
let loading: Promise<void> | null = null;
/** 그림 AI 로 만든 일러스트 목록 (tools/art/gen-illust.mjs 가 씀). 없으면 아래 SVG 를 임시로 씀 */
export let AI_ILLUST: { ids: string[]; files: Record<string, string>; model?: string; updatedAt?: string } = { ids: [], files: {} };
export function loadLooks() {
  loading ??= Promise.all([
    fetch('assets/looks.json').then((r) => r.json()).then((j) => { LOOKS = j as Record<string, Look>; }).catch(() => { LOOKS = {}; }),
    fetch('assets/illust/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.ids) AI_ILLUST = { files: {}, ...j }; }).catch(() => {}),
  ]).then(() => undefined);
  return loading;
}
export const hasAiIllust = (id: string) => AI_ILLUST.ids.includes(id);

// ── AI 그림: 흰 배경을 지워서 투명하게 (옷의 흰 부분 보존 + 갇힌 배경 구멍 제거) ──
const cutCache = new Map<string, string>();
const cutting = new Map<string, Promise<string>>();
function cutBackground(src: string): Promise<string> {
  const hit = cutCache.get(src); if (hit) return Promise.resolve(hit);
  let p = cutting.get(src);
  if (!p) {
    p = new Promise<string>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 720 / img.naturalHeight);
        const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const g = cv.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, w, h);
        const im = g.getImageData(0, 0, w, h), d = im.data;

        // 이미 투명한 PNG라면 추가 처리 없이 바로 사용
        let hasTrans = false;
        for (let i = 3; i < d.length; i += 16) { if (d[i] === 0) { hasTrans = true; break; } }
        if (hasTrans) { cutCache.set(src, src); resolve(src); return; }

        const isBg = (i: number) => {
          const r = d[i], gg = d[i + 1], b = d[i + 2];
          return Math.min(r, gg, b) > 228 && (Math.max(r, gg, b) - Math.min(r, gg, b)) < 24;
        };

        const seen = new Uint8Array(w * h), q: number[] = [];
        const push = (x: number, y: number) => { const k = y * w + x; if (seen[k] || !isBg(k * 4)) return; seen[k] = 1; q.push(k); };

        // 1. 위쪽, 왼쪽, 오른쪽 테두리 및 양쪽 아래 모서리만 시드로 지정 (중앙 아래 옷 부분 절대 제외!)
        for (let x = 0; x < w; x++) push(x, 0);
        for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
        const cornerW = Math.round(w * 0.1);
        for (let x = 0; x < cornerW; x++) push(x, h - 1);
        for (let x = w - cornerW; x < w; x++) push(x, h - 1);

        while (q.length) {
          const k = q.pop()!, x = k % w, y = (k / w) | 0;
          if (x > 0) push(x - 1, y);
          if (x < w - 1) push(x + 1, y);
          if (y > 0) push(x, y - 1);
          if (y < h - 1) push(x, y + 1);
        }

        // 2. 닫힌 배경 영역 탐색 (팔 안쪽 등 순수 흰색 평탄 영역만 선별 제거)
        const unreached = new Uint8Array(w * h);
        for (let k = 0; k < w * h; k++) { if (!seen[k] && isBg(k * 4)) unreached[k] = 1; }
        const visited = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const k = y * w + x;
            if (unreached[k] && !visited[k]) {
              let count = 0, sumR = 0, sumG = 0, sumB = 0;
              let touchesBottom = false;
              const compQ = [k], compPixels: number[] = [];
              visited[k] = 1;
              while (compQ.length) {
                const ck = compQ.pop()!, cx = ck % w, cy = (ck / w) | 0;
                compPixels.push(ck); count++;
                if (cy >= h - 15) touchesBottom = true;
                const ci = ck * 4;
                sumR += d[ci]; sumG += d[ci + 1]; sumB += d[ci + 2];
                const nbrs = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
                for (const [nx, ny] of nbrs) {
                  if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                    const nk = ny * w + nx;
                    if (unreached[nk] && !visited[nk]) { visited[nk] = 1; compQ.push(nk); }
                  }
                }
              }
              const avgR = sumR / count, avgG = sumG / count, avgB = sumB / count;
              if (count > 600 && avgR > 253 && avgG > 253 && avgB > 253 && !touchesBottom) {
                for (const pk of compPixels) seen[pk] = 1;
              }
            }
          }
        }

        // 3. 배경 픽셀 투명화
        for (let k = 0; k < w * h; k++) { if (seen[k]) d[k * 4 + 3] = 0; }

        // 4. 가장자리 부드럽게 (안티앨리어싱 헤일로 완화)
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
          const k = y * w + x; if (seen[k]) continue;
          if (seen[k - 1] || seen[k + 1] || seen[k - w] || seen[k + w]) {
            const i = k * 4, l = (d[i] + d[i + 1] + d[i + 2]) / 3;
            const diff = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
            if (l > 210 && diff < 20) d[i + 3] = Math.round(255 * Math.max(0.15, (255 - l) / 45));
          }
        }
        g.putImageData(im, 0, 0);
        const url = cv.toDataURL('image/png'); cutCache.set(src, url); resolve(url);
      };
      img.onerror = () => resolve(src);
      img.src = src;
    });
    cutting.set(src, p);
  }
  return p;
}
export function getIllustSrc(id: string): string {
  const f = (AI_ILLUST.files as Record<string, any>)?.[id];
  let fileName = `${id}.png`;
  if (typeof f === 'string') {
    fileName = f.replace(/^\/?(assets\/illust\/)?/, '');
  } else if (typeof f === 'object' && f !== null && f.png) {
    fileName = String(f.png).replace(/^\/?(assets\/illust\/)?/, '');
  }
  return `assets/illust/${fileName}`;
}

/** 대화창 · 테스트 페이지용: AI 그림이 있으면 그것(배경 지운 뒤 교체), 없으면 벡터 SVG */
export function illustHtml(id: string, pose?: Pose, face?: Face): string {
  if (!hasAiIllust(id)) return illustSvg(id, pose, face);
  const src = getIllustSrc(id);
  const ready = cutCache.get(src);
  if (!ready) void cutBackground(src).then((url) => document.querySelectorAll<HTMLImageElement>(`img[data-ill="${CSS.escape(id)}"]`).forEach((el) => { el.src = url; el.classList.remove('ill-wait'); }));
  return `<img class="ill-ai ${ready ? '' : 'ill-wait'}" data-ill="${id}" src="${ready ?? src}" alt="">`;
}
/** 미리 배경 지워 두기 (대화가 처음 뜰 때 깜빡이지 않게) */
export function warmIllust() { for (const id of AI_ILLUST.ids) void cutBackground(getIllustSrc(id)); }

const OL = '#3a2418';
const esc = (s: string) => s.replace(/[^#\w(),.% -]/g, '');

/** 인물 일러스트 SVG 문자열 (viewBox 240×300, 허리 위 흉상) */
export function illustSvg(id: string, pose?: Pose, face?: Face): string {
  if (id === 'warden') return wardenSvg();
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


/** 별빛 교도소 경찰 감시관 전용 벡터 흉상 (AI 일러스트 미생성 시 즉시 표시되는 고디테일 경찰 정복 일러스트) */
function wardenSvg(): string {
  const uid = `wd${Math.random().toString(36).slice(2, 7)}`;
  const ink = '#141a2b';
  const S = `stroke="${ink}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
  return `<svg class="ill-svg" viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg"><defs>
    <linearGradient id="${uid}sk" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#ffe8d4"/><stop offset=".6" stop-color="#f7cfb1"/><stop offset="1" stop-color="#dea684"/></linearGradient>
    <linearGradient id="${uid}nv" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#284b96"/><stop offset=".5" stop-color="#193470"/><stop offset="1" stop-color="#0d1e47"/></linearGradient>
    <linearGradient id="${uid}sh" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#bae0ff"/><stop offset=".55" stop-color="#74b4fb"/><stop offset="1" stop-color="#4585dc"/></linearGradient>
    <linearGradient id="${uid}gd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff4a8"/><stop offset=".5" stop-color="#f2bf38"/><stop offset="1" stop-color="#b57d14"/></linearGradient>
    <linearGradient id="${uid}vs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#334155"/><stop offset=".4" stop-color="#0f172a"/><stop offset="1" stop-color="#020617"/></linearGradient>
    <linearGradient id="${uid}hr" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#334155"/><stop offset=".55" stop-color="#182235"/><stop offset="1" stop-color="#0a101d"/></linearGradient>
    <linearGradient id="${uid}gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".5"/><stop offset="1" stop-color="#93c5fd" stop-opacity=".18"/></linearGradient>
  </defs><g class="ill-sway">
    <path d="M44 300 C42 246 50 202 82 188 L120 180 L158 188 C190 202 198 246 196 300 Z" fill="url(#${uid}sh)" ${S}/>
    <path d="M56 202 L86 188 L90 198 L62 212 Z" fill="url(#${uid}nv)" ${S}/>
    <path d="M184 202 L154 188 L150 198 L178 212 Z" fill="url(#${uid}nv)" ${S}/>
    <circle cx="84" cy="193" r="2.6" fill="url(#${uid}gd)" stroke="${ink}" stroke-width="1.4"/>
    <circle cx="156" cy="193" r="2.6" fill="url(#${uid}gd)" stroke="${ink}" stroke-width="1.4"/>
    <path d="M107 156 L107 186 Q120 196 133 186 L133 156 Z" fill="#dea684" ${S}/>
    <path d="M107 158 Q120 172 133 158 L133 169 Q120 179 107 169 Z" fill="#c68967"/>
    <path d="M104 176 L120 204 L136 176" fill="#dbeafe" ${S}/>
    <path d="M98 184 L112 204 L120 196 L104 178 Z" fill="#eff6ff" ${S}/>
    <path d="M142 184 L128 204 L120 196 L136 178 Z" fill="#eff6ff" ${S}/>
    <path d="M115 196 L125 196 L123 205 L127 254 L120 264 L113 254 L117 205 Z" fill="#0f2354" ${S}/>
    <rect x="115" y="222" width="10" height="3" rx="1" fill="url(#${uid}gd)" stroke="${ink}" stroke-width="1"/>
    <path d="M64 300 C64 252 68 210 88 188 L104 192 L114 238 L114 300 Z" fill="url(#${uid}nv)" ${S}/>
    <path d="M176 300 C176 252 172 210 152 188 L136 192 L126 238 L126 300 Z" fill="url(#${uid}nv)" ${S}/>
    <rect x="114" y="236" width="12" height="64" fill="#132959" ${S}/>
    <path d="M76 218 h24 v18 h-24 Z" fill="#152b5e" stroke="${ink}" stroke-width="2"/>
    <path d="M76 218 h24 l-3 6 h-18 Z" fill="#23458f" stroke="${ink}" stroke-width="1.8"/>
    <path d="M140 218 h24 v18 h-24 Z" fill="#152b5e" stroke="${ink}" stroke-width="2"/>
    <path d="M140 218 h24 l-3 6 h-18 Z" fill="#23458f" stroke="${ink}" stroke-width="1.8"/>
    <path d="M152 198 L160 202 L159 212 L152 216 L145 212 L144 202 Z" fill="url(#${uid}gd)" stroke="${ink}" stroke-width="1.8"/>
    <polygon points="152,202 153.8,206 158,206.4 154.8,209 155.8,213 152,210.8 148.2,213 149.2,209 146,206.4 150.2,206" fill="#fff9d6"/>
    <rect x="74" y="186" width="14" height="20" rx="4" fill="#1e293b" ${S}/>
    <path d="M77 192 h8 M77 196 h8 M77 200 h8" stroke="#64748b" stroke-width="1.4"/>
    <path d="M81 206 C75 214 83 220 77 228 C72 234 79 240 74 246" fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round"/>
    <rect x="64" y="280" width="112" height="16" fill="#0f172a" ${S}/>
    <rect x="110" y="278" width="20" height="20" rx="2" fill="#cbd5e1" ${S}/>
    <rect x="114" y="282" width="12" height="12" rx="1" fill="#334155"/>
    <rect x="72" y="276" width="18" height="22" rx="3" fill="#1e293b" ${S}/>
    <rect x="150" y="276" width="18" height="22" rx="3" fill="#1e293b" ${S}/>
    <ellipse cx="81" cy="118" rx="7" ry="11" fill="#ebb997" ${S}/>
    <ellipse cx="159" cy="118" rx="7" ry="11" fill="#ebb997" ${S}/>
    <path d="M82 98 C82 64 158 64 158 98 C158 134 146 158 120 166 C94 158 82 134 82 98 Z" fill="url(#${uid}sk)" ${S}/>
    <path d="M78 104 C77 82 88 76 120 76 C152 76 163 82 162 104 L156 114 L154 96 C144 88 134 90 126 98 L120 88 L111 98 C102 90 92 88 86 96 L84 114 Z" fill="url(#${uid}hr)" ${S}/>
    <path d="M90 107 L111 112 M150 107 L129 112" stroke="#0f172a" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M92 120 Q102 115 111 120 Q102 127 92 120 Z" fill="#ffffff" stroke="${ink}" stroke-width="2"/>
    <circle cx="102" cy="120" r="4.6" fill="#1e3a8a"/><circle cx="102" cy="120" r="2.2" fill="#090d16"/><circle cx="100" cy="118.4" r="1.4" fill="#ffffff"/>
    <path d="M129 120 Q138 115 148 120 Q138 127 129 120 Z" fill="#ffffff" stroke="${ink}" stroke-width="2"/>
    <circle cx="138" cy="120" r="4.6" fill="#1e3a8a"/><circle cx="138" cy="120" r="2.2" fill="#090d16"/><circle cx="136" cy="118.4" r="1.4" fill="#ffffff"/>
    <path d="M120 126 L118 136 L122 137" fill="none" stroke="#b97f5c" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M108 148 Q120 145 132 148" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="87" y="113" width="28" height="15" rx="3" fill="url(#${uid}gl)" stroke="#1e293b" stroke-width="2.6"/>
    <rect x="125" y="113" width="28" height="15" rx="3" fill="url(#${uid}gl)" stroke="#1e293b" stroke-width="2.6"/>
    <path d="M115 119 h10 M83 118 l4 1 M153 119 l4 -1" stroke="#1e293b" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M72 78 L64 48 C82 32 158 32 176 48 L168 78 Z" fill="url(#${uid}nv)" ${S}/>
    <path d="M73 74 C96 68 144 68 167 74 L165 86 C144 80 96 80 75 86 Z" fill="#0d1b3e" ${S}/>
    <path d="M75 80 C98 75 142 75 165 80" fill="none" stroke="url(#${uid}gd)" stroke-width="3.2"/>
    <path d="M74 84 C98 96 142 96 166 84 C162 98 144 103 120 103 C96 103 78 98 74 84 Z" fill="url(#${uid}vs)" ${S}/>
    <path d="M90 91 C106 96 128 96 146 91" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" opacity=".65"/>
    <path d="M120 43 L131 48 L129 63 L120 69 L111 63 L109 48 Z" fill="url(#${uid}gd)" stroke="${ink}" stroke-width="2.2"/>
    <polygon points="120,49 122.4,54.2 128,54.8 123.6,58.4 125,64 120,61 115,64 116.4,58.4 112,54.8 117.6,54.2" fill="#fffbeb"/>
    <path d="M52 222 C44 252 54 274 78 274 L156 254 C166 252 168 238 156 234 L82 252 C74 252 72 240 76 226 Z" fill="url(#${uid}sh)" ${S}/>
    <path d="M162 238 C168 242 170 250 164 256 L152 256 L150 238 Z" fill="url(#${uid}sk)" ${S}/>
    <path d="M188 222 C196 252 186 274 162 274 L84 256 C74 254 72 240 84 236 L158 252 C166 252 168 240 164 226 Z" fill="url(#${uid}sh)" ${S}/>
    <path d="M74 238 C68 242 66 250 72 256 L86 256 L88 238 Z" fill="url(#${uid}sk)" ${S}/>
    <path d="M74 244 h8 M74 249 h8" stroke="#c68967" stroke-width="1.6" stroke-linecap="round"/>
  </g></svg>`;
}
