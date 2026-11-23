// 포켓몬 스타일 시네마틱 시각 연출 엔진
//  1) 8대 체육관 관장 · 사천왕 4인 · 챔피언 · 라이벌 · 성간단 간부/총수 개별 전용 VS 컷인 연출
//  2) 전설·환상 루미 3종(별무리 · 스텔라 · 제네시스) 개별 전용 강림 시네마틱
//  3) 위치/환경별(풀숲 · 동굴 · 물/낚시 · 설원 · 화산 · 우주/제단 · 트레이너) 포켓몬식 조우 전환
//  4) 상호작용 화면 연출(회복센터 6구슬 · PC 모니터 부팅 · 보물상자 빛줄기 · 관문 개방) + 지역 입장 명판
import { illustHtml } from '../ui/Illust';
import { sfx } from '../audio/Sfx';

export type EncounterEnv = 'grass' | 'cave' | 'water' | 'snow' | 'volcano' | 'cosmic' | 'town';
export type InteractFxKind = 'heal' | 'pc' | 'chest' | 'gate' | 'badge' | 'warp';

export interface BattleIntroOpts {
  kind: 'wild' | 'trainer';
  env: EncounterEnv;
  fromFish?: boolean;
  foeSpecies: string;
  foeName: string;
  foeLegend?: 'legend' | 'myth';
  trainer?: {
    id?: string;
    name: string;
    title: string;
    sprite: string;
    portrait?: string;
  };
}

interface BossTheme {
  theme: string;
  accent: string;
  accent2: string;
  bg: string;
  badgeText: string;
  quote: string;
  icon: string;
  particleKind: 'wind' | 'bubble' | 'leaf' | 'spark' | 'flame' | 'laser' | 'ice' | 'star' | 'crown' | 'glitch';
}

/** 체육관 관장 8명 · 사천왕 4명 · 챔피언 · 라이벌 · 성간단 6인 — 전부 색다른 전용 테마! */
const BOSS_THEMES: Record<string, BossTheme> = {
  // ── 8대 체육관 관장 ──
  leader: {
    theme: 'wind', accent: '#38e8b8', accent2: '#b8fff0', bg: 'linear-gradient(135deg,#07282b,#146864 52%,#04181c)',
    badgeText: '바람골 도장 · 바람의 배지', quote: '상쾌한 돌풍처럼, 망설임 없이 정면 승부야!', icon: '🌪', particleKind: 'wind',
  },
  leader_harbor: {
    theme: 'water', accent: '#38c8ff', accent2: '#d6f6ff', bg: 'linear-gradient(135deg,#061c3a,#1468a8 52%,#041428)',
    badgeText: '물결항 도장 · 물결의 배지', quote: '거친 파도를 넘어온 실력, 바다 위에서 시험해 보지!', icon: '🌊', particleKind: 'bubble',
  },
  leader_maple: {
    theme: 'maple', accent: '#ff7a48', accent2: '#ffe47a', bg: 'linear-gradient(135deg,#2a1608,#7c3a18 48%,#2a4a1a)',
    badgeText: '단풍골 도장 · 단풍의 배지', quote: '붉게 흩날리는 단풍 속에서 숲의 숨결을 느껴 보렴.', icon: '🍁', particleKind: 'leaf',
  },
  leader_forge: {
    theme: 'forge', accent: '#ff9632', accent2: '#ffe0a0', bg: 'linear-gradient(135deg,#1d1410,#6e3a1a 50%,#181414)',
    badgeText: '쇳불 도장 · 대지의 배지', quote: '강철처럼 두드리고 단련한 루미로 정면에서 부딪쳐라!', icon: '⚒', particleKind: 'spark',
  },
  leader_ember: {
    theme: 'ember', accent: '#ff4824', accent2: '#ffdd54', bg: 'linear-gradient(135deg,#2b0806,#a82412 52%,#1c0606)',
    badgeText: '잿빛 도장 · 불꽃의 배지', quote: '화산의 열기마저 태워 버릴 뜨거운 승부를 시작하자!', icon: '🔥', particleKind: 'flame',
  },
  leader_lumina: {
    theme: 'lumina', accent: '#48f4ff', accent2: '#ffe448', bg: 'linear-gradient(135deg,#081228,#1c3270 50%,#140c30)',
    badgeText: '빛누리 도장 · 빛의 배지', quote: '눈부신 네온의 섬광보다 빠르게 승부를 가르겠어!', icon: '⚡', particleKind: 'laser',
  },
  leader_frost: {
    theme: 'frost', accent: '#8ee8ff', accent2: '#ffffff', bg: 'linear-gradient(135deg,#0c203a,#3a7eb4 52%,#0d2240)',
    badgeText: '서리 도장 · 서리의 배지', quote: '얼어붙은 빙정처럼 흔들리지 않는 마음을 보여 줘.', icon: '❄', particleKind: 'ice',
  },
  leader_summit: {
    theme: 'summit', accent: '#c084ff', accent2: '#ffe878', bg: 'linear-gradient(135deg,#120828,#48247c 52%,#0c0820)',
    badgeText: '별마루 도장 · 별빛의 배지', quote: '아홉 별의 궤도를 통과한 도전자여, 별빛의 뜻을 시험하마.', icon: '✦', particleKind: 'star',
  },

  // ── 루미 리그 사천왕 4명 & 챔피언 ──
  elite1: {
    theme: 'elite_wind', accent: '#64f4d0', accent2: '#ffffff', bg: 'linear-gradient(135deg,#072226,#1f6c74 52%,#0a1220)',
    badgeText: '루미 리그 · 제1사천왕', quote: '하늘을 가르는 질풍 앞에서 버틸 수 있겠나?', icon: '✦', particleKind: 'wind',
  },
  elite2: {
    theme: 'elite_water', accent: '#52b8ff', accent2: '#e2f4ff', bg: 'linear-gradient(135deg,#061430,#1b4d96 52%,#060c1e)',
    badgeText: '루미 리그 · 제2사천왕', quote: '심해처럼 깊고 냉철한 전략을 맛보게 해 주지.', icon: '✦', particleKind: 'bubble',
  },
  elite3: {
    theme: 'elite_fire', accent: '#ff5e2b', accent2: '#ffe46b', bg: 'linear-gradient(135deg,#2a0808,#9e2c14 52%,#160408)',
    badgeText: '루미 리그 · 제3사천왕', quote: '모든 도전을 재로 만드는 사천왕의 불꽃이다!', icon: '✦', particleKind: 'flame',
  },
  elite4: {
    theme: 'elite_forest', accent: '#78e864', accent2: '#fff2a0', bg: 'linear-gradient(135deg,#0c2410,#2e6e34 52%,#0a160c)',
    badgeText: '루미 리그 · 제4사천왕', quote: '생명의 조화가 빚어내는 최후의 관문이에요.', icon: '✦', particleKind: 'leaf',
  },
  champion: {
    theme: 'champion', accent: '#ffd84d', accent2: '#fff8d4', bg: 'linear-gradient(135deg,#1c0820,#7a1d3e 45%,#3c1858 80%,#12081c)',
    badgeText: '루미나 지방 · CHAMPION', quote: '별빛의 씨앗을 품은 트레이너여 — 전력으로 와라!', icon: '👑', particleKind: 'crown',
  },

  // ── 라이벌 & 성간단 ──
  rival_m: {
    theme: 'rival', accent: '#48a4ff', accent2: '#ffe878', bg: 'linear-gradient(135deg,#0a1e44,#2460b8 52%,#101828)',
    badgeText: 'RIVAL CLASH · 소꿉친구', quote: '네가 얼마나 강해졌는지 지금 바로 겨뤄 보자!', icon: '⚔', particleKind: 'spark',
  },
  rival_f: {
    theme: 'rival', accent: '#42e098', accent2: '#ffe878', bg: 'linear-gradient(135deg,#0a2e24,#1f8a64 52%,#0e1e20)',
    badgeText: 'RIVAL CLASH · 소꿉친구', quote: '이번엔 절대 지지 않을 거야! 준비됐지?', icon: '⚔', particleKind: 'leaf',
  },
  villain_boss: {
    theme: 'villain_boss', accent: '#d84cff', accent2: '#ff4878', bg: 'linear-gradient(135deg,#0c0416,#3a104e 50%,#140418)',
    badgeText: '성간단 총수 · ECLIPSE', quote: '별의 질서를 다시 쓰는 것은 오직 나뿐이다.', icon: '❖', particleKind: 'glitch',
  },
  villain_c1: {
    theme: 'villain_fire', accent: '#ff4838', accent2: '#ffb868', bg: 'linear-gradient(135deg,#1c060c,#6e1620 50%,#120410)',
    badgeText: '성간단 제1간부 · 홍염', quote: '방해꾼은 내 홍염으로 깨끗이 태워 주지!', icon: '❖', particleKind: 'flame',
  },
  villain_c2: {
    theme: 'villain_moon', accent: '#9878ff', accent2: '#e4d8ff', bg: 'linear-gradient(135deg,#100a24,#362666 50%,#0a0818)',
    badgeText: '성간단 제2간부 · 월영', quote: '달그림자 속에서 꼼짝 못 하게 만들어 주마.', icon: '❖', particleKind: 'star',
  },
  villain_c3: {
    theme: 'villain_steel', accent: '#90b4d8', accent2: '#e8f4ff', bg: 'linear-gradient(135deg,#141820,#3e4a5c 50%,#0e1218)',
    badgeText: '성간단 제3간부 · 태강', quote: '강철의 규율 앞에 무릎 꿇어라!', icon: '❖', particleKind: 'spark',
  },
  villain_c4: {
    theme: 'villain_nebula', accent: '#ff5cd6', accent2: '#9ce8ff', bg: 'linear-gradient(135deg,#1c0828,#6a2078 50%,#100824)',
    badgeText: '성간단 제4간부 · 성운', quote: '성운의 소용돌이에서 빠져나갈 수 있을까?', icon: '❖', particleKind: 'glitch',
  },
  villain_sci1: {
    theme: 'villain_sci', accent: '#3cf0ff', accent2: '#a8ff78', bg: 'linear-gradient(135deg,#081c28,#1a4e68 50%,#08141c)',
    badgeText: '성간단 병기 개발 수석', quote: '최신 광학 병기의 위력을 실험해 보지!', icon: '❖', particleKind: 'laser',
  },
};

interface LegendTheme {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  sprite: string;
  accent: string;
  accent2: string;
  bg: string;
  style: 'comet' | 'aurora' | 'genesis' | 'tidal';
}

const LEGEND_THEMES: Record<string, LegendTheme> = {
  byeolmuri: {
    id: 'byeolmuri',
    tag: '✦ LEGENDARY ENCOUNTER ✦',
    title: '전설의 루미 · 별무리',
    subtitle: '일곱 유성이 모여 별의 제단에 강림한다!',
    sprite: 'assets/lumi/big_byeolmuri.png',
    accent: '#ffe054',
    accent2: '#7ceeff',
    bg: 'radial-gradient(circle at 50% 45%, #2a2468 0%, #0d0d2e 55%, #040412 100%)',
    style: 'comet',
  },
  stella: {
    id: 'stella',
    tag: '✧ CELESTIAL AWAKENING ✧',
    title: '별의 요람 · 스텔라',
    subtitle: '잠들어 있던 찬란한 별빛이 오로라를 깨운다!',
    sprite: 'assets/lumi/big_stella.png',
    accent: '#ff8ae0',
    accent2: '#88f4ff',
    bg: 'radial-gradient(circle at 50% 42%, #3a1d5e 0%, #141944 55%, #060818 100%)',
    style: 'aurora',
  },
  onnuri: {
    id: 'onnuri',
    tag: '❖ MYTHICAL SINGULARITY ❖',
    title: '태초의 루미 · 제네시스',
    subtitle: '시공이 갈라지며 세상을 빚은 태초의 빛이 현현한다!',
    sprite: 'assets/lumi/big_onnuri.png',
    accent: '#fff2a6',
    accent2: '#d294ff',
    bg: 'radial-gradient(circle at 50% 50%, #3a2b66 0%, #140a24 52%, #020108 100%)',
    style: 'genesis',
  },
  haerang: {
    id: 'haerang',
    tag: '🌊 ABYSSAL LEGEND AWAKENING 🌊',
    title: '심해의 전설 · 해랑',
    subtitle: '세 조류가 하나로 모여 깊은 바다의 수호신이 깨어난다!',
    sprite: 'assets/lumi/big_haerang.png',
    accent: '#48e8ff',
    accent2: '#ffe278',
    bg: 'radial-gradient(circle at 50% 48%, #0e4a7a 0%, #072244 52%, #020b1c 100%)',
    style: 'tidal',
  },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function fxHost(): HTMLElement {
  return document.getElementById('ui') ?? document.body;
}

/** 보스/관장 테마 식별 (sprite / id / title 모두 매칭) */
export function resolveBossTheme(trainer?: BattleIntroOpts['trainer']): BossTheme | null {
  if (!trainer) return null;
  const keys = [trainer.portrait, trainer.sprite, trainer.id].filter(Boolean) as string[];
  for (const k of keys) {
    if (BOSS_THEMES[k]) return BOSS_THEMES[k];
  }
  if (trainer.id === 'sena') return BOSS_THEMES.leader;
  if (/챔피언|루미 마스터/.test(trainer.title)) return BOSS_THEMES.champion;
  if (/총수/.test(trainer.title)) return BOSS_THEMES.villain_boss;
  if (/소꿉친구/.test(trainer.title)) return BOSS_THEMES[trainer.sprite === 'rival_f' ? 'rival_f' : 'rival_m'];
  if (/사천왕/.test(trainer.title)) {
    if (/바람/.test(trainer.title)) return BOSS_THEMES.elite1;
    if (/물/.test(trainer.title)) return BOSS_THEMES.elite2;
    if (/불꽃/.test(trainer.title)) return BOSS_THEMES.elite3;
    return BOSS_THEMES.elite4;
  }
  if (/성간단/.test(trainer.title)) {
    if (/홍염/.test(trainer.name)) return BOSS_THEMES.villain_c1;
    if (/월영/.test(trainer.name)) return BOSS_THEMES.villain_c2;
    if (/태강/.test(trainer.name)) return BOSS_THEMES.villain_c3;
    if (/성운/.test(trainer.name)) return BOSS_THEMES.villain_c4;
    if (/전광/.test(trainer.name)) return BOSS_THEMES.villain_sci1;
  }
  return null;
}

/** 캔버스 기반 테마 파티클 연출 (관장·전설·환경별 고유 애니메이션) */
function mountParticleCanvas(parent: HTMLElement, mode: BossTheme['particleKind'] | LegendTheme['style'] | EncounterEnv, accent: string, accent2: string): () => void {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  parent.appendChild(cv);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(320, Math.round(window.innerWidth * dpr));
  const h = Math.max(240, Math.round(window.innerHeight * dpr));
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  const items = Array.from({ length: 56 }, (_, i) => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 8 * dpr,
    vy: (Math.random() - 0.5) * 8 * dpr,
    r: (3 + Math.random() * 8) * dpr,
    a: Math.random() * Math.PI * 2,
    va: (Math.random() - 0.5) * 0.2,
    col: i % 3 === 0 ? accent2 : accent,
    p: Math.random(),
  }));

  let raf = 0;
  const t0 = performance.now();
  const draw = (now: number) => {
    const dt = (now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;

    if (mode === 'wind') {
      // 회전 돌풍 궤적 + 초록 바람칼날
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3 * dpr;
      for (let k = 0; k < 6; k++) {
        const ang = dt * 5 + (k * Math.PI) / 3;
        const rad = (60 + k * 42) * dpr;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, ang, ang + 1.3);
        ctx.stroke();
      }
      for (const it of items) {
        it.x = (it.x + (16 + it.r) * dpr) % (w + 80);
        it.y = (it.y - 3 * dpr + h) % h;
        ctx.fillStyle = it.col;
        ctx.globalAlpha = 0.72;
        ctx.fillRect(it.x - 40, it.y, 44 * dpr, 2.2 * dpr);
      }
      ctx.restore();
    } else if (mode === 'bubble' || mode === 'water') {
      // 파도 물결 + 상승하는 물방울
      ctx.save();
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        ctx.strokeStyle = k % 2 ? accent2 : accent;
        ctx.lineWidth = 4 * dpr;
        ctx.globalAlpha = 0.4;
        const baseY = h * (0.25 + k * 0.2);
        for (let x = 0; x <= w; x += 24 * dpr) {
          const y = baseY + Math.sin(x * 0.012 + dt * 7 + k) * 20 * dpr;
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (const it of items) {
        it.y = (it.y - (5 + it.p * 7) * dpr + h) % h;
        const ox = Math.sin(dt * 5 + it.a) * 14 * dpr;
        ctx.strokeStyle = it.col;
        ctx.lineWidth = 2 * dpr;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(it.x + ox, it.y, it.r * 1.1, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (mode === 'leaf' || mode === 'grass') {
      // 휘날리는 단풍잎 / 초록 풀잎
      ctx.save();
      for (const it of items) {
        it.x = (it.x + (8 + it.p * 8) * dpr) % (w + 40);
        it.y = (it.y + (3 + Math.sin(dt * 4 + it.a) * 3) * dpr) % (h + 40);
        it.a += it.va;
        ctx.save();
        ctx.translate(it.x - 20, it.y - 20);
        ctx.rotate(it.a);
        ctx.fillStyle = it.col;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.ellipse(0, 0, it.r * 1.6, it.r * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    } else if (mode === 'flame' || mode === 'volcano') {
      // 치솟는 불기둥 + 불티
      ctx.save();
      for (const it of items) {
        it.y = (it.y - (8 + it.p * 11) * dpr + h) % h;
        it.x += Math.sin(dt * 8 + it.a) * 2.5 * dpr;
        ctx.fillStyle = it.col;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r * (0.6 + (it.y / h) * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (mode === 'laser') {
      // 교차하는 네온 레이저 빔 + 번개 스파크
      ctx.save();
      for (let k = 0; k < 8; k++) {
        const y = ((k * 130 + dt * 320 * (k % 2 ? 1 : -1)) % h + h) % h;
        ctx.strokeStyle = k % 2 ? accent : accent2;
        ctx.lineWidth = (2 + (k % 3)) * dpr;
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y + (k % 2 ? -90 : 90) * dpr);
        ctx.stroke();
      }
      // 중앙 번개 지그재그
      if (Math.sin(dt * 28) > 0.2) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5 * dpr;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        let lx = w * 0.15, ly = h * 0.1;
        ctx.moveTo(lx, ly);
        for (let s = 0; s < 8; s++) {
          lx += (w * 0.7) / 8;
          ly += (h * 0.8) / 8 + (Math.random() - 0.5) * 55 * dpr;
          ctx.lineTo(lx, ly);
        }
        ctx.stroke();
      }
      ctx.restore();
    } else if (mode === 'ice' || mode === 'snow') {
      // 서리 결정 + 다이아몬드 더스트
      ctx.save();
      for (const it of items) {
        it.x = (it.x - (5 + it.p * 5) * dpr + w) % w;
        it.y = (it.y + (5 + it.p * 6) * dpr) % h;
        it.a += 0.06;
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.a);
        ctx.strokeStyle = it.col;
        ctx.lineWidth = 1.8 * dpr;
        ctx.globalAlpha = 0.85;
        for (let b = 0; b < 3; b++) {
          ctx.rotate(Math.PI / 3);
          ctx.beginPath();
          ctx.moveTo(-it.r * 1.4, 0);
          ctx.lineTo(it.r * 1.4, 0);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    } else if (mode === 'spark') {
      // 용광로 쇳물 스파크 & 충격파
      ctx.save();
      for (const it of items) {
        it.x = (it.x + it.vx * 1.8 + w) % w;
        it.y = (it.y + it.vy * 1.8 + h) % h;
        ctx.strokeStyle = it.col;
        ctx.lineWidth = 2.5 * dpr;
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.moveTo(it.x, it.y);
        ctx.lineTo(it.x - it.vx * 3.2, it.y - it.vy * 3.2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (mode === 'comet') {
      // 전설 별무리: 7개 유성이 화면 외곽에서 중앙 초신성으로 수렴!
      ctx.save();
      const prog = Math.min(1, dt / 1.05);
      for (let k = 0; k < 7; k++) {
        const ang = (k / 7) * Math.PI * 2 + dt * 2.2;
        const dist = (1 - prog * 0.85) * Math.max(w, h) * 0.58;
        const x = cx + Math.cos(ang) * dist;
        const y = cy + Math.sin(ang) * dist;
        const tx = cx + Math.cos(ang - 0.35) * (dist + 110 * dpr);
        const ty = cy + Math.sin(ang - 0.35) * (dist + 110 * dpr);
        const grad = ctx.createLinearGradient(x, y, tx, ty);
        grad.addColorStop(0, k % 2 ? accent : accent2);
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 7 * dpr;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 6 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      // 배경 별빛
      for (const it of items) {
        ctx.fillStyle = it.col;
        ctx.globalAlpha = 0.4 + 0.5 * Math.sin(dt * 9 + it.a);
        ctx.fillRect(it.x, it.y, it.r * 0.5, it.r * 0.5);
      }
      ctx.restore();
    } else if (mode === 'aurora') {
      // 전설 스텔라: 회전하는 초승달 오로라 링 & 반짝이는 별꽃 가루
      ctx.save();
      for (let k = 0; k < 4; k++) {
        ctx.strokeStyle = k % 2 ? accent : accent2;
        ctx.lineWidth = (4 - k * 0.5) * dpr;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        const r = (90 + k * 58 + Math.sin(dt * 4 + k) * 14) * dpr;
        ctx.arc(cx, cy, r, dt * (k % 2 ? 2.4 : -2.1), dt * (k % 2 ? 2.4 : -2.1) + Math.PI * 1.45);
        ctx.stroke();
      }
      for (const it of items) {
        const ang = it.a + dt * 1.4;
        const dist = (60 + it.p * Math.min(w, h) * 0.46);
        const px = cx + Math.cos(ang) * dist;
        const py = cy + Math.sin(ang) * dist * 0.68;
        ctx.fillStyle = it.col;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(px, py, it.r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (mode === 'genesis') {
      // 태초의 루미 제네시스: 신성한 12방위 기하학 마법진 + 시공 균열
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(dt * 0.85);
      const R = Math.min(w, h) * (0.28 + Math.min(0.14, dt * 0.08));
      ctx.strokeStyle = accent;
      ctx.lineWidth = 3 * dpr;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      for (let k = 0; k < 12; k++) {
        const a1 = (k / 12) * Math.PI * 2;
        const a2 = ((k + 5) / 12) * Math.PI * 2;
        ctx.strokeStyle = k % 2 ? accent : accent2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a1) * R, Math.sin(a1) * R);
        ctx.lineTo(Math.cos(a2) * R, Math.sin(a2) * R);
        ctx.stroke();
      }
      ctx.restore();
      // 방사형 시공 균열선
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * dpr;
      ctx.globalAlpha = 0.5 + 0.4 * Math.sin(dt * 18);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + 0.3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 60 * dpr, cy + Math.sin(a) * 60 * dpr);
        ctx.lineTo(cx + Math.cos(a + 0.08) * 180 * dpr, cy + Math.sin(a + 0.08) * 180 * dpr);
        ctx.lineTo(cx + Math.cos(a - 0.04) * 340 * dpr, cy + Math.sin(a - 0.04) * 340 * dpr);
        ctx.stroke();
      }
      ctx.restore();
    } else if (mode === 'tidal') {
      // 물 전설 해랑: 3중 심해 조류 파동 링 + 솟구치는 진주 물보라 + 삼지창 빛줄기
      ctx.save();
      for (let k = 0; k < 5; k++) {
        const prog = ((dt * 0.9 + k * 0.22) % 1);
        const r = (48 + prog * Math.min(w, h) * 0.56);
        ctx.strokeStyle = k % 2 === 0 ? accent : accent2;
        ctx.lineWidth = (5.5 - prog * 3.5) * dpr;
        ctx.globalAlpha = (1 - prog) * 0.78;
        ctx.beginPath();
        ctx.ellipse(cx, cy + 12 * dpr, r, r * 0.56, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      // 솟구치는 파도 궤적 + 진주빛 거품 입자
      for (let k = 0; k < 3; k++) {
        ctx.strokeStyle = k === 1 ? accent2 : '#9cf8ff';
        ctx.lineWidth = (3.5 - k * 0.6) * dpr;
        ctx.globalAlpha = 0.72;
        ctx.beginPath();
        const baseY = h * (0.64 + k * 0.09);
        for (let x = 0; x <= w; x += 24 * dpr) {
          const wy = baseY + Math.sin(x * 0.012 + dt * (5 + k) + k * 1.4) * 26 * dpr;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.stroke();
      }
      for (const it of items) {
        const px = it.x + Math.sin(dt * 3 + it.a) * 22 * dpr;
        const py = (h - ((dt * (Math.abs(it.vy) * 180 + 140) + it.p * h) % (h + 40 * dpr)));
        ctx.fillStyle = it.col;
        ctx.globalAlpha = 0.88;
        ctx.beginPath();
        ctx.arc(px, py, it.r * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // star / crown / glitch / cosmic / cave / town
      ctx.save();
      if (mode === 'star' || mode === 'crown' || mode === 'cosmic') {
        ctx.translate(cx, cy);
        ctx.rotate(dt * 1.2);
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5 * dpr;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(w, h) * 0.3, 0, Math.PI * 2);
        ctx.stroke();
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 50 * dpr, Math.sin(a) * 50 * dpr);
          ctx.lineTo(Math.cos(a) * Math.min(w, h) * 0.46, Math.sin(a) * Math.min(w, h) * 0.46);
          ctx.stroke();
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      for (const it of items) {
        const ang = Math.atan2(it.y - cy, it.x - cx);
        const speed = (mode === 'glitch' ? 12 : 7) * dpr;
        it.x += Math.cos(ang) * speed;
        it.y += Math.sin(ang) * speed;
        if (it.x < 0 || it.x > w || it.y < 0 || it.y > h) {
          it.x = cx + (Math.random() - 0.5) * 90 * dpr;
          it.y = cy + (Math.random() - 0.5) * 90 * dpr;
        }
        ctx.fillStyle = it.col;
        ctx.globalAlpha = 0.85;
        if (mode === 'glitch') ctx.fillRect(it.x, it.y, it.r * 3.2, it.r * 0.55);
        else ctx.fillRect(it.x, it.y, it.r * 0.75, it.r * 0.75);
      }
      ctx.restore();
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}

/**
 * 포켓몬 스타일 배틀 진입 시네마틱 재생 (종료 시 배틀 씬으로 깔끔하게 이어짐)
 *  - 전설/환상 3종: 각각 전용 강림 컷신 (별무리 유성우 · 스텔라 오로라 · 제네시스 시공균열)
 *  - 8대 관장 · 사천왕 · 챔피언 · 라이벌 · 성간단: 각각 전용 속성 VS 컷인 + AI 일러스트!
 *  - 야생(풀숲 · 동굴 · 물/낚시 · 설원 · 화산 · 우주) & 일반 트레이너: 위치별 포켓몬식 와이프 전환!
 */
export async function playBattleIntro(opts: BattleIntroOpts): Promise<void> {
  const host = fxHost();
  const leg = LEGEND_THEMES[opts.foeSpecies];
  if (leg) {
    await runLegendaryIntro(host, leg);
    return;
  }
  const boss = opts.kind === 'trainer' ? resolveBossTheme(opts.trainer) : null;
  if (boss && opts.trainer) {
    await runBossVsIntro(host, opts.trainer, boss);
    return;
  }
  if (opts.kind === 'trainer' && opts.trainer) {
    await runTrainerEncounterWipe(host, opts.trainer);
    return;
  }
  const env: EncounterEnv = opts.fromFish ? 'water' : opts.env;
  await runLocationWildWipe(host, env, opts.fromFish);
}

async function runBossVsIntro(host: HTMLElement, trainer: NonNullable<BattleIntroOpts['trainer']>, theme: BossTheme) {
  const el = document.createElement('div');
  el.className = `cin-wrap cin-boss cin-theme-${theme.theme}`;
  el.style.setProperty('--ca', theme.accent);
  el.style.setProperty('--cb', theme.accent2);
  el.style.setProperty('--cbg', theme.bg);
  const pid = trainer.portrait ?? trainer.sprite;
  const art = illustHtml(pid) || `<img src="assets/portraits/${pid}.png" alt="" onerror="this.style.display='none'">`;
  el.innerHTML = `
    <div class="cin-strobe"></div>
    <div class="cin-shutter top"></div>
    <div class="cin-shutter bot"></div>
    <div class="cin-stage">
      <div class="cin-speedlines"></div>
      <div class="cin-vs-band">
        <div class="cin-badge-tag">${theme.icon} ${theme.badgeText}</div>
        <div class="cin-title">${trainer.title}</div>
        <div class="cin-name">${trainer.name}</div>
        <div class="cin-quote">“${theme.quote}”</div>
      </div>
      <div class="cin-vs-mark">VS</div>
      <div class="cin-portrait">${art}</div>
    </div>
    <div class="cin-flash-end"></div>`;
  host.appendChild(el);
  const stopCanvas = mountParticleCanvas(el.querySelector('.cin-stage')!, theme.particleKind, theme.accent, theme.accent2);
  sfx.play('encounter');
  requestAnimationFrame(() => el.classList.add('in'));
  await sleep(1650);
  el.classList.add('flash-out');
  await sleep(260);
  stopCanvas();
  el.remove();
}

async function runLegendaryIntro(host: HTMLElement, leg: LegendTheme) {
  const el = document.createElement('div');
  el.className = `cin-wrap cin-legend cin-leg-${leg.style}`;
  el.style.setProperty('--ca', leg.accent);
  el.style.setProperty('--cb', leg.accent2);
  el.style.setProperty('--cbg', leg.bg);
  el.innerHTML = `
    <div class="cin-leg-backdrop"></div>
    <div class="cin-leg-aura"></div>
    <div class="cin-leg-sprite"><img src="${leg.sprite}" alt="${leg.title}" /></div>
    <div class="cin-leg-plate">
      <div class="cin-leg-tag">${leg.tag}</div>
      <div class="cin-leg-title">${leg.title}</div>
      <div class="cin-leg-sub">${leg.subtitle}</div>
    </div>
    <div class="cin-flash-end"></div>`;
  host.appendChild(el);
  const stopCanvas = mountParticleCanvas(el, leg.style, leg.accent, leg.accent2);
  sfx.play('sparkle');
  requestAnimationFrame(() => el.classList.add('in'));
  await sleep(900);
  sfx.play('roar');
  el.classList.add('roar');
  await sleep(1050);
  el.classList.add('flash-out');
  await sleep(280);
  stopCanvas();
  el.remove();
}

async function runTrainerEncounterWipe(host: HTMLElement, trainer: NonNullable<BattleIntroOpts['trainer']>) {
  const el = document.createElement('div');
  el.className = 'cin-wrap cin-trainer-wipe';
  const pid = trainer.portrait ?? trainer.sprite;
  const art = illustHtml(pid) || '';
  el.innerHTML = `
    <div class="cin-strobe"></div>
    <div class="cin-diag a"></div>
    <div class="cin-diag b"></div>
    <div class="cin-tr-bar">
      <div class="cin-tr-vs">VS</div>
      <div class="cin-tr-info">
        <div class="cin-tr-title">${trainer.title}</div>
        <div class="cin-tr-name">${trainer.name}</div>
      </div>
      ${art ? `<div class="cin-tr-art">${art}</div>` : ''}
    </div>
    <div class="cin-flash-end"></div>`;
  host.appendChild(el);
  sfx.play('encounter');
  requestAnimationFrame(() => el.classList.add('in'));
  await sleep(980);
  el.classList.add('flash-out');
  await sleep(200);
  el.remove();
}

async function runLocationWildWipe(host: HTMLElement, env: EncounterEnv, fromFish?: boolean) {
  const META: Record<EncounterEnv, { label: string; accent: string; accent2: string }> = {
    grass: { label: '🌿 풀숲에서 야생 루미가 튀어나왔다!', accent: '#52e068', accent2: '#d8ff90' },
    cave: { label: '⛏ 어두운 동굴 그림자 속에서 나타났다!', accent: '#9888ff', accent2: '#ffd480' },
    water: { label: fromFish ? '🎣 낚싯대에 야생 루미가 걸렸다!' : '🌊 물보라를 일으키며 나타났다!', accent: '#38c8ff', accent2: '#d8f8ff' },
    snow: { label: '❄ 눈보라 너머에서 야생 루미가 나타났다!', accent: '#8ee8ff', accent2: '#ffffff' },
    volcano: { label: '🌋 뜨거운 화산재 속에서 튀어나왔다!', accent: '#ff5e2b', accent2: '#ffe468' },
    cosmic: { label: '✦ 뒤틀린 별빛 틈새에서 나타났다!', accent: '#c878ff', accent2: '#7ceeff' },
    town: { label: '✨ 야생 루미가 모습을 드러냈다!', accent: '#ffe066', accent2: '#ffffff' },
  };
  const m = META[env] ?? META.grass;
  const el = document.createElement('div');
  el.className = `cin-wrap cin-wild cin-wild-${env}`;
  el.style.setProperty('--ca', m.accent);
  el.style.setProperty('--cb', m.accent2);

  // 위치별 포켓몬 오리지널 와이프 지오메트리
  let pattern = '';
  if (env === 'grass') {
    // 클래식 포켓몬 지그재그 수평 블라인드 10단
    pattern = `<div class="cin-blinds">${Array.from({ length: 10 }, (_, i) => `<div class="cin-blind ${i % 2 ? 'r' : 'l'}" style="--i:${i}"></div>`).join('')}</div>`;
  } else if (env === 'cave') {
    // 동굴 나선형 암흑 아이리스
    pattern = `<div class="cin-vortex"></div><div class="cin-vortex v2"></div>`;
  } else if (env === 'water') {
    // 물결 파문 + 상승 수면 와이프
    pattern = `<div class="cin-water-wave"></div><div class="cin-water-ring r1"></div><div class="cin-water-ring r2"></div>`;
  } else if (env === 'snow') {
    // 서리 빙정 프리즈 와이프
    pattern = `<div class="cin-frost-frame"></div><div class="cin-frost-shards"></div>`;
  } else if (env === 'volcano') {
    // 화산 마그마 균열 와이프
    pattern = `<div class="cin-magma-veil"></div><div class="cin-magma-crack"></div>`;
  } else if (env === 'cosmic') {
    // 우주 프리즘 분할 와이프
    pattern = `<div class="cin-prism-veil"></div>`;
  } else {
    pattern = `<div class="cin-iris-wipe"></div>`;
  }

  el.innerHTML = `
    <div class="cin-strobe"></div>
    ${pattern}
    <div class="cin-wild-banner">${m.label}</div>
    <div class="cin-flash-end"></div>`;
  host.appendChild(el);
  const stopCanvas = mountParticleCanvas(el, env, m.accent, m.accent2);
  sfx.play('encounter');
  requestAnimationFrame(() => el.classList.add('in'));
  await sleep(820);
  el.classList.add('flash-out');
  await sleep(180);
  stopCanvas();
  el.remove();
}

/** 상호작용 화면 오버레이 연출 (회복센터 6구슬 · PC 모니터 부팅 · 보물상자 빛줄기 · 관문 개방 · 배지 획득) */
export function playInteractFx(kind: InteractFxKind, labelText = '') {
  const host = fxHost();
  const el = document.createElement('div');
  el.className = `ifx-wrap ifx-${kind}`;
  if (kind === 'heal') {
    el.innerHTML = `
      <div class="ifx-heal-veil"></div>
      <div class="ifx-heal-orbs">${Array.from({ length: 6 }, (_, i) => `<span style="--i:${i}"></span>`).join('')}</div>
      <div class="ifx-pill">💗 ${labelText || '루미들의 체력이 모두 회복되었습니다!'}</div>`;
  } else if (kind === 'pc') {
    el.innerHTML = `
      <div class="ifx-pc-scan"></div>
      <div class="ifx-pc-tag">💻 LUMI-NET PC SYSTEM CONNECTED</div>`;
  } else if (kind === 'chest') {
    el.innerHTML = `
      <div class="ifx-rays"></div>
      ${labelText ? `<div class="ifx-pill gold">✨ ${labelText}</div>` : ''}`;
  } else if (kind === 'gate') {
    el.innerHTML = `
      <div class="ifx-gate-pulse"></div>
      ${labelText ? `<div class="ifx-pill cyan">🔓 ${labelText}</div>` : ''}`;
  } else if (kind === 'badge') {
    el.innerHTML = `
      <div class="ifx-rays"></div>
      <div class="ifx-pill gold">🏅 ${labelText || '도장 배지를 손에 넣었다!'}</div>`;
  } else {
    el.innerHTML = `<div class="ifx-warp-ring"></div>`;
  }
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const dur = kind === 'heal' ? 1750 : kind === 'pc' ? 700 : kind === 'warp' ? 450 : 1250;
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, dur);
}

/** 포켓몬 DPPt / HGSS 스타일 지역 입장 명판 (바이옴별 아이콘 & 색상 바) */
let activePlate: HTMLDivElement | null = null;
export function showAreaPlate(title: string, sub: string, kind: string, biome: string, mapId = '') {
  activePlate?.remove();
  const isGym = mapId === 'in_gym' || mapId.startsWith('gym_');
  const isLeague = mapId === 'league';
  const isTower = mapId === 'tower';
  const isChateau = mapId === 'chateau';
  const isCasino = mapId === 'in_casino';
  const isCenter = mapId === 'in_center';
  const isShop = mapId === 'in_store' || mapId === 'in_shop_w';
  const isCafe = mapId === 'in_cafe';
  const isLab = mapId === 'in_lab';
  const isSmithy = mapId === 'in_smithy';
  const isOceanShrine = mapId === 'ocean_shrine';
  const isAltar = mapId === 'altar' || mapId === 'origin' || mapId === 'stella_nest' || biome === 'distortion';
  const theme = isOceanShrine
    ? { icon: '🌊', col: '#48e8ff', bg: 'linear-gradient(90deg,#0c2e4cf0,#081d34e0)' }
    : isLeague
    ? { icon: '👑', col: '#ffd84d', bg: 'linear-gradient(90deg,#301638f0,#1c0e28e0)' }
    : isGym
      ? { icon: '🏛', col: '#f0b840', bg: 'linear-gradient(90deg,#2c1e38f0,#1a1226e0)' }
      : isTower
        ? { icon: '🗼', col: '#a8d0ff', bg: 'linear-gradient(90deg,#1a2436f0,#101824e0)' }
        : isChateau
          ? { icon: '👻', col: '#b88cff', bg: 'linear-gradient(90deg,#201428f0,#120a18e0)' }
          : isCasino
            ? { icon: '🎰', col: '#ff6ba8', bg: 'linear-gradient(90deg,#301228f0,#1c0a18e0)' }
            : isCenter
              ? { icon: '💗', col: '#ff7ea8', bg: 'linear-gradient(90deg,#3a1828f0,#24101ae0)' }
              : isShop
                ? { icon: '🛒', col: '#62d4ff', bg: 'linear-gradient(90deg,#142e42f0,#0d1e2ce0)' }
                : isCafe
                  ? { icon: '☕', col: '#f4b878', bg: 'linear-gradient(90deg,#382214f0,#24160ce0)' }
                  : isLab
                    ? { icon: '🧪', col: '#78e8d0', bg: 'linear-gradient(90deg,#142c30f0,#0c1c20e0)' }
                    : isSmithy
                      ? { icon: '⚒', col: '#ff9648', bg: 'linear-gradient(90deg,#361c10f0,#22120ae0)' }
                      : isAltar
                        ? { icon: '✨', col: '#d8a8ff', bg: 'linear-gradient(90deg,#1a1038f0,#0c0820e0)' }
                        : kind === 'cave'
                          ? { icon: '💎', col: '#8ec0ff', bg: 'linear-gradient(90deg,#181c2ef0,#0e101ce0)' }
                          : biome === 'snow'
                            ? { icon: '❄️', col: '#8ceaff', bg: 'linear-gradient(90deg,#142e48f0,#0d1e32e0)' }
                            : biome === 'volcano'
                              ? { icon: '🌋', col: '#ff7040', bg: 'linear-gradient(90deg,#38140cf0,#220c08e0)' }
                              : biome === 'beach'
                                ? { icon: '🌊', col: '#48c8ff', bg: 'linear-gradient(90deg,#0f2d48f0,#0a1e30e0)' }
                                : biome === 'forest'
                                  ? { icon: '🌲', col: '#6cd460', bg: 'linear-gradient(90deg,#143018f0,#0c1e10e0)' }
                                  : kind === 'farm'
                                    ? { icon: '🌱', col: '#9ce05a', bg: 'linear-gradient(90deg,#243414f0,#18240ee0)' }
                                    : kind === 'town'
                                      ? { icon: '🏡', col: '#ffd45e', bg: 'linear-gradient(90deg,#342214f0,#20140ce0)' }
                                      : { icon: '🌿', col: '#78d868', bg: 'linear-gradient(90deg,#18301cf0,#102014e0)' };

  const el = document.createElement('div');
  el.className = 'area-plate';
  el.style.setProperty('--ap-col', theme.col);
  el.style.setProperty('--ap-bg', theme.bg);
  el.innerHTML = `
    <div class="area-plate-bar"></div>
    <div class="area-plate-icon">${theme.icon}</div>
    <div class="area-plate-body">
      <div class="area-plate-title">${title}</div>
      ${sub ? `<div class="area-plate-sub">${sub}</div>` : ''}
    </div>`;
  fxHost().appendChild(el);
  activePlate = el;
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => {
    el.classList.remove('in');
    el.classList.add('out');
    setTimeout(() => { if (activePlate === el) activePlate = null; el.remove(); }, 500);
  }, 2700);
}
