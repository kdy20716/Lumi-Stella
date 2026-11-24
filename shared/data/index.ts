import type { CropDef, ItemDef, LifeDexEntry, LifeDexMilestone, MapId, MoveDef, RecipeDef, ShopDef, SpeciesDef, TrainerDef, LumiType } from '../types';
import cropsJson from './crops.json';
import itemsJson from './items.json';
import npcsJson from './npcs.json';
import shopsJson from './shops.json';
import creaturesJson from './creatures.json';
import movesJson from './moves.json';
import trainersJson from './trainers.json';
import encountersJson from './encounters.json';
import regionJson from './region.json';
import recipesJson from './recipes.json';
import chaptersJson from './chapters.json';
import skillsJson from './skills.json';
import questsJson from './quests.json';
import dexJson from './dex.json';

export interface TownSpecialtyDef {
  name: string;
  crop: string;
  ore: string;
  fish: string;
  seed: string;
  seedPrice: number;
}
const RAW_DEX = dexJson as unknown as {
  entries: LifeDexEntry[];
  townSpecialties: Record<string, TownSpecialtyDef>;
  milestones: LifeDexMilestone[];
};
export const LIFE_DEX: LifeDexEntry[] = RAW_DEX.entries;
export const LIFE_DEX_BY_ITEM: Record<string, LifeDexEntry> = Object.fromEntries(LIFE_DEX.map((e) => [e.item, e]));
export const TOWN_SPECIALTIES: Record<string, TownSpecialtyDef> = RAW_DEX.townSpecialties;
export const LIFE_DEX_MILESTONES: LifeDexMilestone[] = RAW_DEX.milestones;

export const CROPS = cropsJson as unknown as Record<string, CropDef>;
export const ITEMS = itemsJson as unknown as Record<string, ItemDef>;
export const RECIPES = recipesJson as unknown as Record<string, RecipeDef>;
export const SPECIES = creaturesJson as unknown as Record<string, SpeciesDef>;
export const MOVES = movesJson as unknown as Record<string, MoveDef>;
/** 지방 맵 메타 (이름 · 종류 · 휴대폰 지도 좌표) */
export const REGION_MAPS = regionJson.maps as unknown as Record<string, { name: string; kind: string; biome: string; x: number; y: number; tier: number; interior?: boolean }>;

// 마을별 루미 마트: 기본 등급 마트 품목 + 그 마을의 특산 씨앗을 맨 위에 배치
const BASE_SHOPS = shopsJson as unknown as Record<string, ShopDef>;
const tierMartId = (town: string) => {
  const t = REGION_MAPS[town]?.tier ?? 2;
  return t <= 2 ? 'windvale' : t <= 4 ? 'mart2' : t <= 6 ? 'mart3' : 'mart4';
};
const BUILT_SHOPS: Record<string, ShopDef> = { ...BASE_SHOPS };
if (BUILT_SHOPS.windvale && !BUILT_SHOPS.windvale.items.some((x) => x.itemId === 'seeds_wind_wheat')) {
  BUILT_SHOPS.windvale = {
    ...BUILT_SHOPS.windvale,
    items: [{ itemId: 'seeds_wind_wheat', price: 35 }, ...BUILT_SHOPS.windvale.items],
  };
}
for (const [townId, meta] of Object.entries(REGION_MAPS)) {
  if (meta.kind !== 'town' || townId === 'town' || townId === 'windvale') continue;
  const base = BUILT_SHOPS[tierMartId(townId)];
  const spec = TOWN_SPECIALTIES[townId] ?? (townId === 'cape' ? TOWN_SPECIALTIES.crown : undefined);
  const items = spec && !base.items.some((x) => x.itemId === spec.seed)
    ? [{ itemId: spec.seed, price: spec.seedPrice }, ...base.items]
    : [...base.items];
  BUILT_SHOPS[`mart_${townId}`] = {
    ...base,
    id: `mart_${townId}`,
    name: `${meta.name} 루미 마트`,
    greeting: `${meta.name} 루미 마트예요! ${spec ? `우리 고장 특산 「${ITEMS[spec.seed]?.name ?? spec.seed}」도 준비되어 있어요.` : '먼 길 가기 전에 든든히 챙겨 가세요!'}`,
    items,
  };
}
export const SHOPS: Record<string, ShopDef> = BUILT_SHOPS;

export const TRAINERS = { ...(trainersJson as unknown as Record<string, TrainerDef>), ...(regionJson.trainers as unknown as Record<string, TrainerDef>) };
type Range = [string, number, number, number]; // [종, 최소Lv, 최대Lv, 가중치]
const ENC = encountersJson as unknown as {
  grass: Record<string, { day: Range[]; night: Range[] }>;
  fish: Record<string, { items: [string, number][]; lumi: Range[] }>;
  forage: Record<string, string[]>;
  ore: Record<string, [string, number, number, number][]>;
  starters: string[];
  typeChart: Record<LumiType, Partial<Record<LumiType, number>>>;
};

// 비경 7곳 희귀 씨앗 채집 테이블
const RARE_FORAGE: Record<string, string[]> = {
  dawn_lake: ['seeds_dawn_lotus', 'herb', 'berry'],
  valor_lake: ['seeds_sunset_berry', 'berry', 'herb'],
  acuity_lake: ['seeds_moon_mint', 'herb'],
  marsh: ['seeds_marsh_root', 'wild_mushroom', 'herb'],
  paradise: ['seeds_paradise_rose', 'dandelion', 'berry'],
  fullmoon: ['seeds_fullmoon_bloom', 'herb', 'berry'],
  newmoon: ['seeds_newmoon_truffle', 'wild_mushroom', 'herb'],
};

// 마을 · 도로 · 비경별 특산 물고기 출현 매핑
const SPECIAL_FISH_BY_PREFIX: [string, string, number][] = [
  ['windvale', 'fish_breeze_medaka', 42],
  ['route1', 'fish_breeze_medaka', 35],
  ['harbor', 'fish_silver_mackerel', 45],
  ['route2', 'fish_silver_mackerel', 38],
  ['maple', 'fish_yamame', 45],
  ['route3', 'fish_yamame', 38],
  ['route31', 'fish_yamame', 38],
  ['bloom', 'fish_cherry_mullet', 45],
  ['route5', 'fish_cherry_mullet', 38],
  ['forge', 'fish_mine_loach', 45],
  ['route4', 'fish_mine_loach', 38],
  ['underground', 'fish_mine_loach', 36],
  ['mist', 'fish_swamp_snakehead', 45],
  ['route10', 'fish_swamp_snakehead', 38],
  ['route28', 'fish_swamp_snakehead', 36],
  ['ember', 'fish_onsen_carp', 45],
  ['route6', 'fish_onsen_carp', 38],
  ['route7', 'fish_onsen_carp', 35],
  ['route7', 'fish_lava_fin', 24],
  ['pinecone', 'fish_lenok', 45],
  ['route12', 'fish_lenok', 38],
  ['route29', 'fish_lenok', 38],
  ['lumina', 'fish_neon_guppy', 45],
  ['route11', 'fish_neon_guppy', 38],
  ['route14', 'fish_neon_guppy', 38],
  ['summit', 'fish_star_minnow', 45],
  ['route13', 'fish_star_minnow', 38],
  ['route27', 'fish_star_minnow', 38],
  ['shell', 'fish_azure_bream', 45],
  ['route8', 'fish_azure_bream', 38],
  ['sand', 'fish_oasis_goby', 45],
  ['route9', 'fish_oasis_goby', 38],
  ['route23', 'fish_oasis_goby', 38],
  ['canyon', 'fish_torrent_perch', 45],
  ['route15', 'fish_torrent_perch', 38],
  ['route16', 'fish_torrent_perch', 34],
  ['route17', 'fish_torrent_perch', 38],
  ['moon', 'fish_moon_hairtail', 45],
  ['route25', 'fish_moon_hairtail', 38],
  ['route26', 'fish_moon_hairtail', 38],
  ['frost', 'fish_ice_smelt', 45],
  ['route18', 'fish_ice_smelt', 38],
  ['route19', 'fish_ice_smelt', 38],
  ['crown', 'fish_golden_carp', 45],
  ['cape', 'fish_golden_carp', 42],
  ['route21', 'fish_golden_carp', 38],
  ['route24', 'fish_golden_carp', 36],
  // 비경 10종
  ['dawn_lake', 'fish_dawn_sweetfish', 48],
  ['valor_lake', 'fish_sunset_goldfish', 48],
  ['acuity_lake', 'fish_moon_salmon', 48],
  ['sea_cave', 'fish_cave_eel', 46],
  ['route2', 'fish_cave_eel', 28],
  ['ocean_shrine', 'fish_cave_eel', 32],
  ['marsh', 'fish_marsh_sturgeon', 46],
  ['paradise', 'fish_koi', 48],
  ['fullmoon', 'fish_fullmoon_flounder', 48],
  ['newmoon', 'fish_newmoon_angler', 48],
  ['stark_', 'fish_lava_fin', 48],
  ['distortion', 'fish_sky_fish', 50],
  ['ocean_shrine', 'fish_sky_fish', 34],
];

const mergedFish: typeof ENC.fish = {};
for (const [mapId, tbl] of Object.entries({ ...(regionJson.fish as unknown as typeof ENC.fish), ...ENC.fish })) {
  mergedFish[mapId] = { items: tbl.items.map(([id, w]) => [id, w]), lumi: [...tbl.lumi] };
}
for (const mapId of Object.keys(REGION_MAPS)) {
  for (const [prefix, fishId, weight] of SPECIAL_FISH_BY_PREFIX) {
    const match = prefix.endsWith('_')
      ? mapId.startsWith(prefix)
      : mapId === prefix || (/^route\d+$/.test(prefix) && new RegExp(`^${prefix}[a-z]?$`).test(mapId)) || (prefix === 'sea_cave' && mapId === 'sea_cave_deep');
    if (!match) continue;
    mergedFish[mapId] ??= { items: [['fish_crucian', 30]], lumi: [] };
    if (!mergedFish[mapId].items.some(([id]) => id === fishId)) {
      mergedFish[mapId].items.unshift([fishId, weight]);
    }
  }
}

// 생성된 지방 데이터(야생 루미 · 낚시 · 채집)를 손으로 만든 데이터 위에 합침
export const ENCOUNTERS = {
  ...ENC,
  grass: { ...(regionJson.grass as unknown as typeof ENC.grass), ...ENC.grass },
  fish: mergedFish,
  forage: { ...(regionJson.forage as unknown as typeof ENC.forage), ...ENC.forage, ...RARE_FORAGE },
};
export const TYPE_COLORS: Record<LumiType, string> = { 노말: '#a8a090', 풀: '#5fae4a', 물: '#3f8fc8', 불: '#e8642e', 땅: '#b8864a', 바람: '#7ab8d8', 빛: '#e0b830' };

export interface NpcScheduleEntry {
  time: number;            // HHMM (600 = 6:00)
  map?: MapId;             // 목적지가 있는 맵 (기본 farm)
  to: string;              // 웨이포인트 이름 (맵 Spawns 레이어)
  idle: 'stand' | 'wander' | 'work' | 'leave' | 'perform';
  radius?: number;
  face?: 'down' | 'up' | 'left' | 'right';
  work?: 'water' | 'hoe';
}
export interface NpcDef {
  id: string; name: string; title: string; sprite: string; portrait?: string; speed: number; run?: boolean; color: string;
  schedule: NpcScheduleEntry[];
  dialogue: Record<'first' | 'morning' | 'afternoon' | 'evening' | 'rain' | 'random', string[]>;
  /** 친밀도(하트)별 대사: { "2": [...], "4": [...] } — 친해질수록 속마음을 털어놓음 */
  hearts?: Record<string, string[]>;
  /** 생성된 마을 주민 (자기 마을에만 있음) */
  gen?: boolean;
  /** 호감도 주민: 사는 마을 · 사이드 스토리 제목 · 부탁 세 번 · 도우미가 됐을 때 인사 */
  hand?: string; story?: string; full?: string[];
  asks?: { item: string; qty: number; ask: string[]; thanks: string[] }[];
}
export const NPCS = { ...(npcsJson as unknown as Record<string, NpcDef>), ...(regionJson.npcs as unknown as Record<string, NpcDef>) };

/** HHMM → 분 */
export const hhmmToMinutes = (t: number) => Math.floor(t / 100) * 60 + (t % 100);

/** 본편 스토리 사건 (chapters.json) */
export interface CastDef { name: string; title?: string; sprite: string; color?: string }
export interface StoryEvent {
  id: string; chapter: number; map: MapId; needs: string[]; ending?: boolean;
  /** 이 사건 전까지 막히는 곳 */
  gate?: { map: MapId; msg: string };
  /** 맵 안에서 특정 위치(칸 단위 중심·반경)에 다다랐을 때 발동 */
  spot?: { x: number; y: number; r: number };
  /** [말하는 사람(cast id · 'rival'), 대사…] */
  scene: string[][]; after?: string[][];
  battle?: { cast: string; rival?: boolean; team: [string, number][]; reward: number };
  give?: Record<string, number>;
  /** 사건이 시작될 때 걸어 들어오고, 끝나면 돌아서 나가는 인물 (cast id) */
  walkIn?: string;
  /** 사건이 끝난 뒤 화면에 뜨는 알림 */
  toast?: string;
  /** 사건 음악 · 승부 뒤 음악 (client/src/audio/tracks.ts 의 곡 id) */
  bgm?: string; afterBgm?: string;
}
export const CHAPTERS = chaptersJson as unknown as { cast: Record<string, CastDef>; chapters: { n: number; title: string; side?: boolean }[]; events: StoryEvent[] };
export const EVENTS: Record<string, StoryEvent> = Object.fromEntries(CHAPTERS.events.map((e) => [e.id, e]));
/** 깃발 · 이긴 트레이너 · 배지 중 하나라도 있으면 그 조건은 충족 */
/** 루미 도감 완성 = 환상(제네시스)을 뺀 모든 루미를 잡음 */
export const dexComplete = (p: { caught?: string[] }) => Object.values(SPECIES).filter((sp) => sp.legend !== 'myth').every((sp) => !!p.caught?.includes(sp.id));
export const hasDone = (p: { flags?: string[]; defeated: string[]; badges: string[]; caught?: string[] }, k: string): boolean =>
  k === 'dex' ? dexComplete(p) : k.startsWith('!') ? !hasDone(p, k.slice(1)) : k.startsWith('caught:') ? !!p.caught?.includes(k.slice(7)) : !!p.flags?.includes(k) || p.defeated.includes(k) || p.badges.includes(k);
/** 지금 이 맵에서 일어날 수 있는 다음 사건 (pos 를 주면 spot 거리도 검사) */
export const nextEvent = (p: { map: string; flags?: string[]; defeated: string[]; badges: string[]; caught?: string[]; story: number }, map = p.map, pos?: { x: number; y: number }) =>
  p.story >= 5 ? CHAPTERS.events.find((e) => e.map === map && !p.flags?.includes(e.id) && e.needs.every((k) => hasDone(p, k)) && (!e.spot || !pos || Math.hypot(pos.x - e.spot.x, pos.y - e.spot.y) <= e.spot.r)) : undefined;
/** 아직 일어나지 않은 사건 때문에 막힌 곳 */
export const gateFor = (p: { flags?: string[] }, to: string) => CHAPTERS.events.find((e) => e.gate?.map === to && !p.flags?.includes(e.id));

/** 비전 기술 (skills.json) */
export interface SkillDef { name: string; badge: string; obstacle: string; look: string; use: string; need: string; drops?: [string, number][] }
export const SKILLS = Object.fromEntries(Object.entries(skillsJson).filter(([k]) => !k.startsWith('_'))) as unknown as Record<string, SkillDef>;
/** 이 장애물을 치우는 기술 */
export const skillFor = (type: string) => Object.entries(SKILLS).find(([, s]) => s.obstacle === type)?.[0];

/** 사이드 스토리 (quests.json): 막힌 곳 · 네 탑 · 마지막 선율 */
export interface SpireDef { name: string; score: string; boss: string; color: string; notes: number[] }
export const QUESTS = questsJson as unknown as { gates: Record<string, { flag: string; msg: string; seal?: string }>; spires: Record<string, SpireDef>; finale: { score: string; boss: string; notes: number[] } };
/** 마을 → 그 마을의 호감도 주민 */
export const HANDS = ((regionJson as unknown as { hands?: Record<string, string[]> }).hands ?? {}) as Record<string, string[]>;
/** 마을 단계 및 특산물에 맞는 루미 마트 */
export const martFor = (town: string) => {
  if (SHOPS[`mart_${town}`]) return `mart_${town}`;
  const t = REGION_MAPS[town]?.tier ?? 2;
  return t <= 2 ? 'windvale' : t <= 4 ? 'mart2' : t <= 6 ? 'mart3' : 'mart4';
};
