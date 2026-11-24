// 생활 도감(농사·채광·낚시 90종) · 지역 특산물 · 포만감 · 요리 도메인 모듈
import { CROPS, ITEMS, LIFE_DEX, LIFE_DEX_BY_ITEM, LIFE_DEX_MILESTONES, RECIPES, SPECIES, TOWN_SPECIALTIES } from '../data';
import { stats } from './Battle';
import type { ItemDef, LifeDexEntry, LifeDexState, MapId, PlayerState, Season } from '../types';

export const DEFAULT_FOOD = 80;
export const MAX_FOOD = 100;
export const MORNING_FOOD = 75;

/** 빈 생활 도감 상태 생성 */
export function emptyLifeDex(): LifeDexState {
  return { farm: {}, mine: {}, fish: {} };
}

/** 생활 도감 초기화 + 기존 세이브 마이그레이션 (가방·출하함·마을창고에 이미 보유한 항목 자동 등록) */
export function ensureLifeDex(p: PlayerState, migrateExisting = false): LifeDexState {
  const hadDex = !!p.lifeDex;
  p.lifeDex ??= emptyLifeDex();
  p.lifeDex.farm ??= {};
  p.lifeDex.mine ??= {};
  p.lifeDex.fish ??= {};
  p.lifeDexClaims ??= [];
  if (p.food === undefined || !Number.isFinite(p.food)) p.food = DEFAULT_FOOD;

  if (migrateExisting && !hadDex) {
    const recordSilent = (itemId: string | null | undefined, qty: number) => {
      if (!itemId || qty <= 0) return;
      const e = LIFE_DEX_BY_ITEM[itemId];
      if (!e) return;
      p.lifeDex![e.cat][e.id] = (p.lifeDex![e.cat][e.id] ?? 0) + qty;
    };
    for (const s of p.inventory ?? []) recordSilent(s.itemId, s.quantity);
    for (const b of p.bin ?? []) recordSilent(b.itemId, b.quantity);
    for (const townStock of Object.values(p.stock ?? {})) {
      for (const [itemId, qty] of Object.entries(townStock)) recordSilent(itemId, qty);
    }
  }
  return p.lifeDex;
}

/** 배지 개수에 따라 자동 해금되는 요리 · 특산물 루미볼 레시피 동기화 */
export function syncAutoRecipes(p: PlayerState): string[] {
  const newlyUnlocked: string[] = [];
  const badgeCount = p.badges?.length ?? 0;
  for (const r of Object.values(RECIPES)) {
    if (!r.autoUnlockByBadge) continue;
    if (badgeCount >= (r.badges ?? 0) && !p.recipes.includes(r.id)) {
      p.recipes.push(r.id);
      newlyUnlocked.push(r.id);
    }
  }
  return newlyUnlocked;
}

/** 수확 · 채광 · 낚시 시 생활 도감 등록 */
export function registerLifeDex(
  p: PlayerState,
  itemId: string,
  qty = 1,
): { entry: LifeDexEntry; first: boolean; total: number } | null {
  const entry = LIFE_DEX_BY_ITEM[itemId];
  if (!entry || qty <= 0) return null;
  const dex = ensureLifeDex(p);
  const bucket = dex[entry.cat];
  const first = !bucket[entry.id];
  bucket[entry.id] = (bucket[entry.id] ?? 0) + qty;
  return { entry, first, total: lifeDexSummary(p).total };
}

/** 플레이어 생활 도감 통계 계산 */
export function lifeDexSummary(p: { lifeDex?: LifeDexState }) {
  const dex = p.lifeDex;
  const farm = dex?.farm ? Object.keys(dex.farm).filter((k) => dex.farm[k] > 0).length : 0;
  const mine = dex?.mine ? Object.keys(dex.mine).filter((k) => dex.mine[k] > 0).length : 0;
  const fish = dex?.fish ? Object.keys(dex.fish).filter((k) => dex.fish[k] > 0).length : 0;
  const total = farm + mine + fish;
  const max = LIFE_DEX.length || 90;
  const pct = Math.floor((total / max) * 100);
  return { farm, mine, fish, total, max, pct };
}

/** 특정 마을의 특산물 3종 등록 현황 */
export function townSpecialtyProgress(p: { lifeDex?: LifeDexState }, townId: string) {
  const spec = TOWN_SPECIALTIES[townId];
  if (!spec) return null;
  const dex = p.lifeDex;
  const hasCrop = !!(dex?.farm?.[spec.crop]);
  const hasOre = !!(dex?.mine?.[spec.ore]);
  const hasFish = !!(dex?.fish?.[spec.fish]);
  const done = Number(hasCrop) + Number(hasOre) + Number(hasFish);
  return { spec, hasCrop, hasOre, hasFish, done, total: 3 };
}

/** 본고장 마을 텃밭 또는 온실형 도시 화단에서는 계절과 무관하게 특산 작물 재배 가능 */
export function canGrowCropAt(cropId: string, mapId: MapId, season: Season): boolean {
  const crop = CROPS[cropId];
  if (!crop) return false;
  if (crop.seasons.includes(season)) return true;
  if (mapId === 'lumina' || mapId === 'crown') return true;
  const spec = TOWN_SPECIALTIES[mapId];
  return spec?.crop === cropId;
}

// 맵 접두사별 지역 특산 · 동굴 희귀 광물 테이블
const REGIONAL_ORE_PREFIXES: [string, string, number][] = [
  ['windvale', 'ore_breeze', 55],
  ['route1', 'ore_breeze', 42],
  ['harbor', 'ore_aqua_quartz', 55],
  ['route2', 'ore_aqua_quartz', 45],
  ['maple', 'ore_maple_agate', 55],
  ['route3', 'ore_maple_agate', 45],
  ['route31', 'ore_maple_agate', 45],
  ['bloom', 'ore_pink_quartz', 55],
  ['route5', 'ore_pink_quartz', 45],
  ['route6', 'ore_pink_quartz', 42],
  ['forge', 'ore_gold', 55],
  ['route4', 'ore_gold', 45],
  ['mist', 'ore_peat', 55],
  ['route10', 'ore_peat', 45],
  ['route11', 'ore_peat', 42],
  ['ember', 'ore_flame', 55],
  ['route7', 'ore_flame', 45],
  ['pinecone', 'ore_amber', 55],
  ['route12', 'ore_amber', 45],
  ['route13', 'ore_amber', 45],
  ['lumina', 'ore_lumen', 55],
  ['route14', 'ore_lumen', 45],
  ['route20', 'ore_lumen', 45],
  ['summit', 'ore_meteor', 55],
  ['route27', 'ore_meteor', 45],
  ['route28', 'ore_meteor', 45],
  ['shell', 'ore_pearl', 55],
  ['route8', 'ore_pearl', 45],
  ['ocean_shrine', 'ore_pearl', 50],
  ['sand', 'ore_desert_rose', 55],
  ['route9', 'ore_desert_rose', 45],
  ['route23', 'ore_desert_rose', 45],
  ['canyon', 'ore_jasper', 55],
  ['route15', 'ore_jasper', 45],
  ['route17', 'ore_jasper', 45],
  ['route29', 'ore_jasper', 42],
  ['moon', 'ore_moonstone', 55],
  ['route25', 'ore_moonstone', 45],
  ['route26', 'ore_moonstone', 45],
  ['frost', 'ore_cryolite', 55],
  ['route16', 'ore_cryolite', 45],
  ['route18', 'ore_cryolite', 45],
  ['route19', 'ore_cryolite', 45],
  ['crown', 'ore_crown_diamond', 55],
  ['cape', 'ore_crown_diamond', 50],
  ['route21', 'ore_crown_diamond', 45],
  ['route24', 'ore_crown_diamond', 42],
  // 동굴 · 비경 9종
  ['sea_cave', 'ore_coral', 52],
  ['wayward_', 'ore_glow', 52],
  ['underground', 'ore_silver', 52],
  ['stark_', 'ore_obsidian', 52],
  ['iron', 'ore_raw_steel', 52],
  ['coronet_', 'ore_cave_crystal', 52],
  ['ice_cave', 'ore_permafrost', 55],
  ['victory_', 'ore_victory', 52],
  ['distortion', 'ore_warp_crystal', 60],
  ['star_maze', 'ore_warp_crystal', 55],
  ['spire_', 'ore_warp_crystal', 52],
];

/** 현재 맵의 바위/광맥 채광 시 추가 드롭되는 석탄 · 지역 특산 광물 계산 */
export function rollRegionalMineralDrops(
  mapId: MapId,
  pickPower: number,
  mineHelp: boolean,
  wellFed: boolean,
  rand: () => number,
): { item: string; qty: number }[] {
  const out: { item: string; qty: number }[] = [];
  const bonusChance = (pickPower - 1) * 8 + (mineHelp ? 10 : 0) + (wellFed ? 8 : 0);

  // 석탄(기본 광물): 모든 야외/동굴 채광 시 28% + 보너스 확률로 출현
  if (rand() * 100 < 28 + bonusChance * 0.5 && ITEMS.coal) {
    out.push({ item: 'coal', qty: 1 });
  }

  for (const [prefix, oreId, baseChance] of REGIONAL_ORE_PREFIXES) {
    const match = prefix.endsWith('_')
      ? mapId.startsWith(prefix)
      : mapId === prefix
        || (/^route\d+$/.test(prefix) && new RegExp(`^${prefix}[a-z]?$`).test(mapId))
        || ((prefix === 'sea_cave' || prefix === 'underground') && mapId === `${prefix}_deep`)
        || (prefix === 'iron' && (mapId === 'iron' || mapId.startsWith('iron_')));
    if (!match || !ITEMS[oreId]) continue;
    if (rand() * 100 < Math.min(88, baseChance + bonusChance)) {
      const qty = pickPower >= 3 && rand() < 0.35 ? 2 : 1;
      out.push({ item: oreId, qty });
    }
    break;
  }
  return out;
}

/** 포만감 상태 단계 판정 */
export function foodStatusOf(p: { food?: number; hungerOff?: boolean }): {
  level: 'full' | 'normal' | 'peckish' | 'starving';
  label: string;
  food: number;
  canRun: boolean;
  wellFed: boolean;
} {
  const food = Math.max(0, Math.min(MAX_FOOD, Math.round(p.food ?? DEFAULT_FOOD)));
  if (p.hungerOff) return { level: 'normal', label: '편한 모드', food, canRun: true, wellFed: false };
  if (food >= 70) return { level: 'full', label: '든든함 (특산물↑ · 경험치+15%)', food, canRun: true, wellFed: true };
  if (food >= 30) return { level: 'normal', label: '보통', food, canRun: true, wellFed: false };
  if (food >= 10) return { level: 'peckish', label: '출출함', food, canRun: true, wellFed: false };
  return { level: 'starving', label: '배고픔 (달리기 불가)', food, canRun: false, wellFed: false };
}

/** 야외 활동 중 30분(게임 시간)마다 포만감 -1 처리 */
export function stepHungerTick(p: PlayerState, isOutdoor: boolean): { changed: boolean; becamePeckish: boolean } {
  if (p.hungerOff || p.jailed || !isOutdoor) return { changed: false, becamePeckish: false };
  const prev = Math.max(0, Math.min(MAX_FOOD, Math.round(p.food ?? DEFAULT_FOOD)));
  if (prev <= 0) return { changed: false, becamePeckish: false };
  const next = Math.max(0, prev - 1);
  p.food = next;
  return { changed: true, becamePeckish: prev >= 30 && next < 30 };
}

/** 음식 섭취: 포만감 회복 + 파티 루미 체력 소량 회복 */
export function consumeFoodItem(p: PlayerState, item: ItemDef): { foodGain: number; healedCount: number } {
  const cur = Math.max(0, Math.min(MAX_FOOD, Math.round(p.food ?? DEFAULT_FOOD)));
  const addFood = Math.max(5, Math.round(item.food ?? Math.round((item.energy ?? 30) * 0.45)));
  p.food = Math.min(MAX_FOOD, cur + addFood);
  const foodGain = p.food - cur;

  let healedCount = 0;
  const healAmt = Math.max(0, Math.round(item.partyHeal ?? 0));
  if (healAmt > 0 && p.party.length) {
    for (const c of p.party) {
      if (c.hp <= 0 || !SPECIES[c.species]) continue;
      const maxHp = stats(c).maxHp;
      if (c.hp < maxHp) {
        c.hp = Math.min(maxHp, c.hp + healAmt);
        healedCount++;
      }
    }
  }
  return { foodGain, healedCount };
}

/** 도감 달성률 마일스톤 수령 가능 목록 및 검증 */
export function claimableMilestone(p: PlayerState, milestoneId: string) {
  const m = LIFE_DEX_MILESTONES.find((x) => x.id === milestoneId);
  if (!m) return { ok: false as const, reason: 'no-milestone' };
  const claims = (p.lifeDexClaims ??= []);
  if (claims.includes(milestoneId)) return { ok: false as const, reason: 'already' };
  const { total } = lifeDexSummary(p);
  if (total < m.count) return { ok: false as const, reason: 'not-enough' };
  return { ok: true as const, milestone: m };
}
