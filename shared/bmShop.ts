import { STORY } from './story';
import { ALL_PLAYER_LOOKS } from './types';

export type BmCategory = 'theme' | 'outfit' | 'lumi' | 'bubble' | 'item';

export interface ChatBubbleDef {
  id: string;
  name: string;
  desc: string;
  bgTop: string;
  bgBottom: string;
  borderOuter: string;
  borderInner: string;
  textColor: string;
  badgeColor: string;
  ornament: 'wood' | 'sakura' | 'star' | 'mint' | 'neon' | 'crown';
}

/** 채팅 말풍선 디자인 (기본 + 상점 구매 스킨) */
export const CHAT_BUBBLES: Record<string, ChatBubbleDef> = {
  default: {
    id: 'default',
    name: '별빛 원목 말풍선 (기본)',
    desc: '따뜻한 양피지와 금빛 테두리가 어우러진 기본 말풍선입니다.',
    bgTop: '#fffdf7',
    bgBottom: '#f4e0be',
    borderOuter: '#3b2414',
    borderInner: '#d49a45',
    textColor: '#3b2414',
    badgeColor: '#e0a43a',
    ornament: 'wood',
  },
  bubble_sakura: {
    id: 'bubble_sakura',
    name: '봄꽃 벚꽃 말풍선',
    desc: '화사한 분홍빛 벚꽃잎 장식이 달린 사랑스러운 말풍선입니다.',
    bgTop: '#fff4f8',
    bgBottom: '#ffd0e2',
    borderOuter: '#9e2a52',
    borderInner: '#ff7aa8',
    textColor: '#4a1228',
    badgeColor: '#ff5c8a',
    ornament: 'sakura',
  },
  bubble_starlight: {
    id: 'bubble_starlight',
    name: '별빛 은하수 말풍선',
    desc: '밤하늘 은하수와 반짝이는 별빛 테두리가 빛나는 신비로운 말풍선입니다.',
    bgTop: '#1c2347',
    bgBottom: '#11162e',
    borderOuter: '#ffe066',
    borderInner: '#6b7fd8',
    textColor: '#fff9e6',
    badgeColor: '#ffe066',
    ornament: 'star',
  },
  bubble_mint: {
    id: 'bubble_mint',
    name: '산들 민트 말풍선',
    desc: '바람골의 상쾌한 민트와 네잎클로버 장식이 담긴 청량한 말풍선입니다.',
    bgTop: '#f0fffb',
    bgBottom: '#bff5e4',
    borderOuter: '#1c6b54',
    borderInner: '#48c9a4',
    textColor: '#10382c',
    badgeColor: '#39b59a',
    ornament: 'mint',
  },
  bubble_neon: {
    id: 'bubble_neon',
    name: '빛누리 사이버 말풍선',
    desc: '빛누리 시티의 네온 마젠타·시안 프레임이 반짝이는 특별 말풍선입니다.',
    bgTop: '#231342',
    bgBottom: '#130926',
    borderOuter: '#00f0ff',
    borderInner: '#ff4df0',
    textColor: '#f6eeff',
    badgeColor: '#00f0ff',
    ornament: 'neon',
  },
  bubble_royal: {
    id: 'bubble_royal',
    name: '챔피언 황금 왕관 말풍선',
    desc: '순금 프레임과 루비 왕관 문양이 새겨진 최고급 로열 말풍선입니다.',
    bgTop: '#3d1e4d',
    bgBottom: '#21102b',
    borderOuter: '#ffd23f',
    borderInner: '#ff4d6d',
    textColor: '#fff6cc',
    badgeColor: '#ffd23f',
    ornament: 'crown',
  },
};

/** 루미 치장 아이템이 직접 그려진 기본 스타팅 루미 3종 (새록 · 찰랑 · 모락) */
export const STARTER_LUMI_IDS = ['saerok', 'chalang', 'morak'] as const;
export const STARTER_LUMI_SET = new Set<string>(STARTER_LUMI_IDS);

/** 외부 결제 링크(PayPal 등)로 구매하는 유료 캐쉬 충전 상품 */
export interface BmCashPack {
  id: string;
  name: string;
  baseCash: number;
  bonusCash: number;
  totalCash: number;
  priceKrw: number;
  priceUsd: number;
  badge?: string;
  desc: string;
}

export type BmUnlockReq =
  | { kind: 'story'; step: number; label: string }
  | { kind: 'badge'; badge: string; label: string }
  | { kind: 'champion'; label: string };

export interface BmProduct {
  id: string;
  category: BmCategory;
  name: string;
  desc: string;
  /** 캐쉬 가격 (1,300 캐쉬 ≈ $1.00 / 5,000 캐쉬 ≈ $4.00) */
  priceKrw: number;
  priceUsd?: number;
  /** 반복 구매 가능 소모품/이용권 여부 */
  repeatable?: boolean;
  town: string;
  unlock: BmUnlockReq;
  previewColor: string;
  accentColor: string;
}

export interface UiThemeDef {
  id: string;
  name: string;
  desc: string;
  bg: string;
  panel: string;
  panelAlt: string;
  border: string;
  borderBright: string;
  accent: string;
  text: string;
  textDim: string;
}

/** 기본 UI 디자인(시골 나무 감성) + 캐쉬 상점 해금 UI 테마 정의 */
export const UI_THEMES: Record<string, UiThemeDef> = {
  rural: {
    id: 'rural', name: '별빛 시골 원목 (기본)', desc: '따뜻한 농장 감성의 기본 나무 UI입니다.',
    bg: '#3b2416', panel: '#5c3a24', panelAlt: '#f2e0be', border: '#8c5a37', borderBright: '#f5b942',
    accent: '#4e8c3e', text: '#fff7e6', textDim: '#d8c29d',
  },
  ui_starlight: {
    id: 'ui_starlight', name: '별빛 야경 테마', desc: '밤하늘과 은하수 별빛이 담긴 감성 UI.',
    bg: '#161b33', panel: '#232c52', panelAlt: '#e8ecf8', border: '#5468b8', borderBright: '#ffe066',
    accent: '#7d8cff', text: '#f4f7ff', textDim: '#b4c0ea',
  },
  ui_breeze: {
    id: 'ui_breeze', name: '바람골 민트 파스텔', desc: '산들바람처럼 산뜻한 민트·클라우드 UI.',
    bg: '#1c3b36', panel: '#2b5951', panelAlt: '#eefaf7', border: '#66b8aa', borderBright: '#a8f5e6',
    accent: '#39b59a', text: '#f0fffc', textDim: '#b3e0d7',
  },
  ui_ocean: {
    id: 'ui_ocean', name: '물결항 딥 마린', desc: '항구의 푸른 파도와 진주 테두리 UI.',
    bg: '#102942', panel: '#1a4269', panelAlt: '#ebf5ff', border: '#3e88c2', borderBright: '#72e6ff',
    accent: '#1e9ce0', text: '#eef8ff', textDim: '#9bc9e8',
  },
  ui_autumn: {
    id: 'ui_autumn', name: '단풍골 메이플 클래식', desc: '가을 단풍과 따스한 테라코타 UI.',
    bg: '#421c14', panel: '#692d20', panelAlt: '#fff1e6', border: '#c45b3b', borderBright: '#ffb347',
    accent: '#d9532f', text: '#fff5ee', textDim: '#e8b9a5',
  },
  ui_forge: {
    id: 'ui_forge', name: '쇳불 스틸 브라스', desc: '정밀한 강철 리벳과 황동빛 인더스트리얼 UI.',
    bg: '#23272e', panel: '#373e4a', panelAlt: '#edf0f5', border: '#8793a8', borderBright: '#e8ba56',
    accent: '#d49a35', text: '#f4f6fa', textDim: '#aeb7c4',
  },
  ui_ember: {
    id: 'ui_ember', name: '잿빛 볼케이노 글로우', desc: '용암의 붉은 불씨가 반짝이는 강렬한 다크 UI.',
    bg: '#291212', panel: '#471d1a', panelAlt: '#fff0eb', border: '#b83728', borderBright: '#ff7b33',
    accent: '#ef4444', text: '#fff2ee', textDim: '#e2a89f',
  },
  ui_cyber: {
    id: 'ui_cyber', name: '빛누리 네온 다크', desc: '시티 팝 스타일의 네온 마젠타·시안 UI.',
    bg: '#130e24', panel: '#21183d', panelAlt: '#f2ecff', border: '#8c3dff', borderBright: '#00f0ff',
    accent: '#e639b6', text: '#fbf7ff', textDim: '#c2a8eb',
  },
  ui_frost: {
    id: 'ui_frost', name: '서리 눈꽃 크리스탈', desc: '투명한 얼음 결정과 은빛 글래스 UI.',
    bg: '#1c2f45', panel: '#2c4869', panelAlt: '#f4faff', border: '#80bfff', borderBright: '#ffffff',
    accent: '#56aef5', text: '#f7fbff', textDim: '#bdd9f5',
  },
  ui_royal: {
    id: 'ui_royal', name: '별마루 로열 골드', desc: '챔피언의 품격이 담긴 로열 벨벳 & 순금 UI.',
    bg: '#24142b', panel: '#3b2147', panelAlt: '#fff9ea', border: '#b38632', borderBright: '#ffe375',
    accent: '#f0b83a', text: '#fffaf0', textDim: '#dfc590',
  },
};

export interface LumiCoordDef {
  id: string;
  name: string;
  kind: 'ribbon' | 'scarf' | 'goggles' | 'flower' | 'helmet' | 'cape' | 'shades' | 'earmuff' | 'crown';
  primary: string;
  secondary: string;
}

/** 파트너 루미 전용 코디 액세서리 정의 */
export const LUMI_COORDS: Record<string, LumiCoordDef> = {
  lumi_ribbon: { id: 'lumi_ribbon', name: '별빛 실크 리본', kind: 'ribbon', primary: '#ff5c8a', secondary: '#ffe066' },
  lumi_scarf: { id: 'lumi_scarf', name: '바람골 하늘 머플러', kind: 'scarf', primary: '#56c2ff', secondary: '#ffffff' },
  lumi_goggles: { id: 'lumi_goggles', name: '물결 탐험 물안경', kind: 'goggles', primary: '#2d8cff', secondary: '#a8f0ff' },
  lumi_flower: { id: 'lumi_flower', name: '단풍 꽃잎 화관', kind: 'flower', primary: '#ff7058', secondary: '#77dd66' },
  lumi_helmet: { id: 'lumi_helmet', name: '쇳불 황동 고글모', kind: 'helmet', primary: '#d49a35', secondary: '#4d5563' },
  lumi_cape: { id: 'lumi_cape', name: '잿빛 불꽃 망토', kind: 'cape', primary: '#e63928', secondary: '#ffb703' },
  lumi_shades: { id: 'lumi_shades', name: '네온 스타 선글라스', kind: 'shades', primary: '#1f1638', secondary: '#00f0ff' },
  lumi_earmuff: { id: 'lumi_earmuff', name: '서리 눈꽃 귀마개', kind: 'earmuff', primary: '#e8f6ff', secondary: '#7cc6fe' },
  lumi_crown: { id: 'lumi_crown', name: '챔피언 미니 왕관', kind: 'crown', primary: '#ffd23f', secondary: '#ff4d6d' },
};

export const BM_OUTFITS = [
  'bm_starlight', 'bm_wind', 'bm_sailor', 'bm_maple', 'bm_smith',
  'bm_ember', 'bm_idol', 'bm_winter', 'bm_royal',
] as const;
export const BM_LOOK_IDS = new Set<string>(BM_OUTFITS);

const U_MAYOR: BmUnlockReq = { kind: 'story', step: STORY.DONE, label: '별빛 마을 이장(프롤로그) 완료 시 해금' };
const uBadge = (badge: string, who: string): BmUnlockReq => ({ kind: 'badge', badge, label: `${who} 격파 시 해금` });
const U_CHAMP: BmUnlockReq = { kind: 'champion', label: '루미 리그 챔피언 격파 시 해금' };

/** 캐쉬 상점 전체 카탈로그 (마을 이장 / 관장 진행에 따라 해금 · 현금 카드 결제 전용) */
export const BM_PRODUCTS: readonly BmProduct[] = [
  // ── UI 디자인 (9종) ─────────────────────────────────
  {
    id: 'ui_starlight', category: 'theme', name: '별빛 야경 UI',
    desc: '시골 나무 UI를 반짝이는 밤하늘과 별빛 인디고 테마로 바꿉니다.',
    priceKrw: 2900, town: '별빛 마을', unlock: U_MAYOR, previewColor: '#232c52', accentColor: '#ffe066',
  },
  {
    id: 'ui_breeze', category: 'theme', name: '바람골 민트 UI',
    desc: '바람골의 상쾌한 민트와 구름빛 파스텔 인터페이스로 바꿉니다.',
    priceKrw: 2900, town: '바람골 마을', unlock: uBadge('badge_wind', '바람골 관장 세나'), previewColor: '#2b5951', accentColor: '#a8f5e6',
  },
  {
    id: 'ui_ocean', category: 'theme', name: '물결항 딥 마린 UI',
    desc: '푸른 바다와 아쿠아 진주 테두리로 꾸민 항구 감성 UI.',
    priceKrw: 3500, town: '물결항', unlock: uBadge('badge_water', '물결항 관장 파도'), previewColor: '#1a4269', accentColor: '#72e6ff',
  },
  {
    id: 'ui_autumn', category: 'theme', name: '단풍골 메이플 UI',
    desc: '가을 단풍잎이 연상되는 따뜻한 테라코타 & 앰버 UI.',
    priceKrw: 3500, town: '단풍골', unlock: uBadge('badge_leaf', '단풍골 관장 단비'), previewColor: '#692d20', accentColor: '#ffb347',
  },
  {
    id: 'ui_forge', category: 'theme', name: '쇳불 스틸 브라스 UI',
    desc: '강철 프레임과 황동 포인트가 돋보이는 모던 UI.',
    priceKrw: 3900, town: '쇳불 도시', unlock: uBadge('badge_earth', '쇳불 관장 무쇠'), previewColor: '#373e4a', accentColor: '#e8ba56',
  },
  {
    id: 'ui_ember', category: 'theme', name: '잿빛 볼케이노 UI',
    desc: '활화산 불꽃이 타오르는 붉은빛 다크 UI.',
    priceKrw: 3900, town: '잿빛 마을', unlock: uBadge('badge_flame', '잿빛 관장 화련'), previewColor: '#471d1a', accentColor: '#ff7b33',
  },
  {
    id: 'ui_cyber', category: 'theme', name: '빛누리 네온 다크 UI',
    desc: '대도시 네온사인을 옮겨 놓은 사이버펑크 UI.',
    priceKrw: 4500, town: '빛누리 시티', unlock: uBadge('badge_light', '빛누리 관장 샛별'), previewColor: '#21183d', accentColor: '#00f0ff',
  },
  {
    id: 'ui_frost', category: 'theme', name: '서리 눈꽃 크리스탈 UI',
    desc: '설원의 맑은 얼음빛을 담은 화이트·블루 크리스탈 UI.',
    priceKrw: 4500, town: '서리 마을', unlock: uBadge('badge_normal', '서리 관장 설아'), previewColor: '#2c4869', accentColor: '#80bfff',
  },
  {
    id: 'ui_royal', category: 'theme', name: '별마루 로열 골드 UI',
    desc: '별마루 성좌와 황금 왕관 문양의 최고급 프리미엄 UI.',
    priceKrw: 5900, town: '별마루 마을', unlock: uBadge('badge_star', '별마루 관장 천문'), previewColor: '#3b2147', accentColor: '#ffe375',
  },

  // ── 트레이너 의상 (9종) ─────────────────────────────
  {
    id: 'bm_starlight', category: 'outfit', name: '별빛 스웨터 & 베레모',
    desc: '별빛 마을 기념 특별 에디션 코디. 2D/2.5D/멀티에서 모두 반영됩니다.',
    priceKrw: 2900, town: '별빛 마을', unlock: U_MAYOR, previewColor: '#3b4a8c', accentColor: '#ffd966',
  },
  {
    id: 'bm_wind', category: 'outfit', name: '바람골 스카이 코디',
    desc: '바람골의 맑은 하늘을 닮은 가벼운 모험가 셋업.',
    priceKrw: 3500, town: '바람골 마을', unlock: uBadge('badge_wind', '바람골 관장 세나'), previewColor: '#56b5d6', accentColor: '#f5f0e0',
  },
  {
    id: 'bm_sailor', category: 'outfit', name: '물결항 마린 세일러',
    desc: '바다 내음이 물씬 풍기는 화이트 & 네이비 세일러 복장.',
    priceKrw: 3500, town: '물결항', unlock: uBadge('badge_water', '물결항 관장 파도'), previewColor: '#1d4d8c', accentColor: '#e6f5ff',
  },
  {
    id: 'bm_maple', category: 'outfit', name: '단풍골 숲지킴이 망토',
    desc: '단풍잎 브로치가 달린 포근한 에메랄드 숲 코디.',
    priceKrw: 3900, town: '단풍골', unlock: uBadge('badge_leaf', '단풍골 관장 단비'), previewColor: '#3d6e47', accentColor: '#e0663e',
  },
  {
    id: 'bm_smith', category: 'outfit', name: '쇳불 장인 레더 에이프런',
    desc: '고글 헤드밴드와 가죽 앞치마가 멋스러운 장인 의상.',
    priceKrw: 3900, town: '쇳불 도시', unlock: uBadge('badge_earth', '쇳불 관장 무쇠'), previewColor: '#7a4928', accentColor: '#e0a93a',
  },
  {
    id: 'bm_ember', category: 'outfit', name: '잿빛 불꽃 스파이크 재킷',
    desc: '뜨거운 열정처럼 빛나는 크림슨 레드 라이더 재킷.',
    priceKrw: 4500, town: '잿빛 마을', unlock: uBadge('badge_flame', '잿빛 관장 화련'), previewColor: '#a82820', accentColor: '#ffaa33',
  },
  {
    id: 'bm_idol', category: 'outfit', name: '빛누리 네온 무대 의상',
    desc: '빛누리 스타처럼 화려한 퍼플 & 네온 시안 스페셜 슈트.',
    priceKrw: 4900, town: '빛누리 시티', unlock: uBadge('badge_light', '빛누리 관장 샛별'), previewColor: '#6b36b8', accentColor: '#5cf2ff',
  },
  {
    id: 'bm_winter', category: 'outfit', name: '서리 스노우 파카',
    desc: '눈 오는 날에도 끄떡없는 폭신한 아크틱 파카 코디.',
    priceKrw: 4900, town: '서리 마을', unlock: uBadge('badge_normal', '서리 관장 설아'), previewColor: '#e3f0ff', accentColor: '#569cd6',
  },
  {
    id: 'bm_royal', category: 'outfit', name: '챔피언 황금 왕관 정장',
    desc: '루미 리그 정복자만 입을 수 있는 전설의 금빛 왕관 의상.',
    priceKrw: 5900, town: '왕관 시티', unlock: U_CHAMP, previewColor: '#3a224a', accentColor: '#ffd23f',
  },

  // ── 기본 루미 3종(새록·찰랑·모락) 전용 치장 아이템 (9종) ──────────────
  {
    id: 'lumi_ribbon', category: 'lumi', name: '별빛 실크 리본',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 머리 위에 핑크 골드 실크 리본이 그려진 전용 모습으로 바뀝니다.',
    priceKrw: 1900, town: '별빛 마을', unlock: U_MAYOR, previewColor: '#ff5c8a', accentColor: '#ffe066',
  },
  {
    id: 'lumi_scarf', category: 'lumi', name: '바람골 하늘 머플러',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 폭신한 하늘색 머플러를 두른 전용 모습으로 바뀝니다.',
    priceKrw: 1900, town: '바람골 마을', unlock: uBadge('badge_wind', '바람골 관장 세나'), previewColor: '#56c2ff', accentColor: '#ffffff',
  },
  {
    id: 'lumi_goggles', category: 'lumi', name: '물결 탐험 물안경',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 이마에 시원한 블루 탐험가 물안경을 쓴 전용 모습으로 바뀝니다.',
    priceKrw: 2500, town: '물결항', unlock: uBadge('badge_water', '물결항 관장 파도'), previewColor: '#2d8cff', accentColor: '#a8f0ff',
  },
  {
    id: 'lumi_flower', category: 'lumi', name: '단풍 꽃잎 화관',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 단풍골 야생화로 엮은 싱그러운 꽃화관을 쓴 전용 모습으로 바뀝니다.',
    priceKrw: 2500, town: '단풍골', unlock: uBadge('badge_leaf', '단풍골 관장 단비'), previewColor: '#ff7058', accentColor: '#77dd66',
  },
  {
    id: 'lumi_helmet', category: 'lumi', name: '쇳불 황동 고글모',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 번쩍이는 황동 안전 고글 모자를 쓴 전용 모습으로 바뀝니다.',
    priceKrw: 2900, town: '쇳불 도시', unlock: uBadge('badge_earth', '쇳불 관장 무쇠'), previewColor: '#d49a35', accentColor: '#4d5563',
  },
  {
    id: 'lumi_cape', category: 'lumi', name: '잿빛 불꽃 히어로 망토',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 어깨에 펄럭이는 붉은 영웅 망토를 두른 전용 모습으로 바뀝니다.',
    priceKrw: 3500, town: '잿빛 마을', unlock: uBadge('badge_flame', '잿빛 관장 화련'), previewColor: '#e63928', accentColor: '#ffb703',
  },
  {
    id: 'lumi_shades', category: 'lumi', name: '네온 스타 선글라스',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 빛누리 아이돌처럼 시크한 네온 선글라스를 쓴 전용 모습으로 바뀝니다.',
    priceKrw: 3500, town: '빛누리 시티', unlock: uBadge('badge_light', '빛누리 관장 샛별'), previewColor: '#1f1638', accentColor: '#00f0ff',
  },
  {
    id: 'lumi_earmuff', category: 'lumi', name: '서리 눈꽃 귀마개',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 추운 설원에서도 포근한 흰색 눈꽃 귀마개를 쓴 전용 모습으로 바뀝니다.',
    priceKrw: 3500, town: '서리 마을', unlock: uBadge('badge_normal', '서리 관장 설아'), previewColor: '#e8f6ff', accentColor: '#7cc6fe',
  },
  {
    id: 'lumi_crown', category: 'lumi', name: '챔피언 미니 왕관',
    desc: '[기본 루미 3종(새록·찰랑·모락) 전용] 황금 보석 왕관을 쓴 전용 모습으로 바뀝니다.',
    priceKrw: 4900, town: '별마루 마을', unlock: uBadge('badge_star', '별마루 관장 천문'), previewColor: '#ffd23f', accentColor: '#ff4d6d',
  },

  // ── 채팅 말풍선 스킨 (5종) ──────────────────────────────
  {
    id: 'bubble_sakura', category: 'bubble', name: '봄꽃 벚꽃 말풍선',
    desc: '채팅을 칠 때 분홍빛 벚꽃 테두리와 꽃잎 장식이 달린 예쁜 말풍선이 나타납니다.',
    priceKrw: 1900, town: '별빛 마을', unlock: { kind: 'story', step: 0, label: '언제나 구매 가능' }, previewColor: '#ffd0e2', accentColor: '#ff5c8a',
  },
  {
    id: 'bubble_starlight', category: 'bubble', name: '별빛 은하수 말풍선',
    desc: '밤하늘 은하수 배경과 황금 별빛 테두리로 꾸며진 감성 말풍선입니다.',
    priceKrw: 2500, town: '별빛 마을', unlock: { kind: 'story', step: 0, label: '언제나 구매 가능' }, previewColor: '#1c2347', accentColor: '#ffe066',
  },
  {
    id: 'bubble_mint', category: 'bubble', name: '산들 민트 말풍선',
    desc: '산뜻한 민트 그라데이션과 새싹 장식이 돋보이는 말풍선입니다.',
    priceKrw: 2500, town: '바람골 마을', unlock: { kind: 'story', step: 0, label: '언제나 구매 가능' }, previewColor: '#bff5e4', accentColor: '#1c6b54',
  },
  {
    id: 'bubble_neon', category: 'bubble', name: '빛누리 사이버 말풍선',
    desc: '화려한 시안·마젠타 네온 테두리가 빛나는 사이버펑크 말풍선입니다.',
    priceKrw: 2900, town: '빛누리 시티', unlock: { kind: 'story', step: 0, label: '언제나 구매 가능' }, previewColor: '#231342', accentColor: '#00f0ff',
  },
  {
    id: 'bubble_royal', category: 'bubble', name: '챔피언 황금 왕관 말풍선',
    desc: '순금 테두리와 왕관 보석 장식이 빛나는 최고급 황금 말풍선입니다.',
    priceKrw: 3500, town: '왕관 시티', unlock: { kind: 'story', step: 0, label: '언제나 구매 가능' }, previewColor: '#3d1e4d', accentColor: '#ffd23f',
  },

  // ── 캐쉬 소모품 · 특별 이용권 (반복 구매 · 즉시 사용) ───────────────────
  {
    id: 'star_candy', category: 'item', name: '별빛 사탕 (Lv.+1)',
    desc: '포켓몬의 이상한 사탕처럼 원하는 루미의 레벨을 즉시 1 올려 줍니다. 구매 후 상점·가방에서 바로 적용 가능! (1개 ≈ $1.00)',
    priceKrw: 1300, priceUsd: 1.00, repeatable: true,
    town: '상시 판매', unlock: { kind: 'story', step: 0, label: '언제나 구매 가능' },
    previewColor: '#2d8cff', accentColor: '#ffe066',
  },
  {
    id: 'name_ticket', category: 'item', name: '닉네임 변경권',
    desc: '트레이너 닉네임을 원하는 새 이름으로 즉시 변경할 수 있는 특별 변경권입니다. 구매 후 상점·가방에서 바로 사용! (1장 ≈ $4.00)',
    priceKrw: 5000, priceUsd: 4.00, repeatable: true,
    town: '상시 판매', unlock: { kind: 'story', step: 0, label: '언제나 구매 가능' },
    previewColor: '#e8a838', accentColor: '#fff4d2',
  },
];

export const BM_PRODUCT_MAP: Record<string, BmProduct> = Object.fromEntries(
  BM_PRODUCTS.map((p) => [p.id, p]),
);

/** 외부 PayPal 결제로 판매하는 캐쉬 패키지 */
export const BM_CASH_PACKS: BmCashPack[] = [
  {
    id: 'cash_1500', name: '별빛 캐쉬 1,500', baseCash: 1500, bonusCash: 0, totalCash: 1500, priceKrw: 1500, priceUsd: 1.19,
    desc: '가볍게 시작하는 소액 캐쉬 충전 패키지.',
  },
  {
    id: 'cash_5000', name: '별빛 캐쉬 5,000', baseCash: 5000, bonusCash: 250, totalCash: 5250, priceKrw: 5000, priceUsd: 3.99,
    badge: '+5%', desc: 'UI 디자인·코디 1~2종을 구매할 수 있는 실속 패키지.',
  },
  {
    id: 'cash_10000', name: '별빛 캐쉬 10,000', baseCash: 10000, bonusCash: 1000, totalCash: 11000, priceKrw: 10000, priceUsd: 7.99,
    badge: '인기 +10%', desc: '가장 많이 찾는 패키지 (+1,000 보너스 캐쉬).',
  },
  {
    id: 'cash_30000', name: '별빛 캐쉬 30,000', baseCash: 30000, bonusCash: 4500, totalCash: 34500, priceKrw: 30000, priceUsd: 22.99,
    badge: '+15%', desc: '원하는 마을 세트(UI+의상+루미 코디)를 넉넉히 구매.',
  },
  {
    id: 'cash_50000', name: '별빛 캐쉬 50,000', baseCash: 50000, bonusCash: 10000, totalCash: 60000, priceKrw: 50000, priceUsd: 38.99,
    badge: '+20%', desc: '프리미엄 컬렉션을 폭넓게 수집하는 대용량 패키지.',
  },
  {
    id: 'cash_100000', name: '별빛 캐쉬 100,000', baseCash: 100000, bonusCash: 25000, totalCash: 125000, priceKrw: 100000, priceUsd: 74.99,
    badge: '최고 +25%', desc: '상점 전체 품목을 여유롭게 구매할 수 있는 스페셜 패키지.',
  },
];

export const BM_CASH_PACK_MAP: Record<string, BmCashPack> = Object.fromEntries(
  BM_CASH_PACKS.map((p) => [p.id, p]),
);

/** USD 가격 표시 ($7.99) */
export function formatUsd(usd: number): string {
  return `$${Math.max(0, usd).toFixed(2)}`;
}

/** 전체 캐쉬 상점 상품(UI·의상·루미 코디) 합계 금액 */
export const BM_ALL_TOTAL_KRW = BM_PRODUCTS.reduce((sum, p) => sum + p.priceKrw, 0);

/** 어드민 계정에 기본 지급되는 테스트 캐쉬(전체 품목 반복 테스트 가능 금액) */
export const ADMIN_DEFAULT_CASH_KRW = Math.max(1_000_000, BM_ALL_TOTAL_KRW * 3);

/** 미보유 캐쉬 상품(영구 해금 코스메틱) 전부 구매 시 필요한 합계 계산 */
export function remainingBmCostKrw(player: {
  ownedThemes?: readonly string[];
  ownedOutfits?: readonly string[];
  ownedLumiCoords?: readonly string[];
  ownedBubbles?: readonly string[];
  mailItems?: readonly { productId: string }[];
}): number {
  const owned = new Set([
    ...(player.ownedThemes ?? []),
    ...(player.ownedOutfits ?? []),
    ...(player.ownedLumiCoords ?? []),
    ...(player.ownedBubbles ?? []),
    ...(player.mailItems ?? []).map((g) => g.productId),
  ]);
  return BM_PRODUCTS.reduce((sum, p) => (p.repeatable || owned.has(p.id) ? sum : sum + p.priceKrw), 0);
}

/** 원화 표시 (₩2,900) */
export function formatKrw(krw: number): string {
  return `₩${Math.max(0, Math.round(krw)).toLocaleString('ko-KR')}`;
}

/** 게임 캐쉬 표시 (2,900 캐쉬) */
export function formatCash(cash: number): string {
  return `${Math.max(0, Math.round(cash)).toLocaleString('ko-KR')} 캐쉬`;
}

/** 플레이어의 스토리·관장 격파 진행도로 상점 품목 해금 여부 확인 (관리자는 전 품목 즉시 테스트 가능) */
export function isBmUnlocked(
  prod: BmProduct,
  player: { story: number; badges: readonly string[]; defeated: readonly string[]; isAdmin?: boolean },
  isAdmin = false,
): { unlocked: boolean; reason: string } {
  if (isAdmin || player.isAdmin) return { unlocked: true, reason: '' };
  const u = prod.unlock;
  if (u.kind === 'story') {
    return player.story >= u.step ? { unlocked: true, reason: '' } : { unlocked: false, reason: u.label };
  }
  if (u.kind === 'badge') {
    return player.badges.includes(u.badge) ? { unlocked: true, reason: '' } : { unlocked: false, reason: u.label };
  }
  return player.defeated.includes('champion') ? { unlocked: true, reason: '' } : { unlocked: false, reason: u.label };
}

/** 기본 외형 + 구매·해금한 캐쉬 의상 착용 가능 여부 */
export function isValidPlayerLook(look: string, ownedOutfits?: readonly string[]): boolean {
  if (look === 'player' || ALL_PLAYER_LOOKS.includes(look)) return true;
  return BM_LOOK_IDS.has(look) && (ownedOutfits?.includes(look) ?? false);
}
