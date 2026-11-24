// 권한 있는 농장 시뮬레이션 (Authoritative). 서버와 싱글플레이(LocalAuthority)에서 동일하게 사용.
// 클라이언트는 결과가 아니라 ActionIntent 만 보내고, 여기서 거리/에너지/도구 소지를 검증한 뒤 상태를 바꾼다.
//  - 농장/집은 주인별 인스턴스(초대받은 친구만 함께), 마을·도로·바람골·가게 실내는 모두가 공유
//  - 골드·가방·루미는 플레이어별, 시간·날씨는 서버 전체 공통
import { dexComplete, SKILLS, skillFor, CHAPTERS, CROPS, ENCOUNTERS, EVENTS, HANDS, ITEMS, MOVES, NPCS, QUESTS, RECIPES, REGION_MAPS, SHOPS, SPECIES, TRAINERS, gateFor, hhmmToMinutes, nextEvent } from '../data';
import { BattleEngine, MAX_LEVEL, healAll, makeCreature, stats, syncPp, type BattleState } from './Battle';
import {
  SoilState, INTERIOR_OF, isHomeMap, isInterior, isCasinoOpen, isPrisonMap, PRISON_FLOOR_LABEL, PRISON_NEXT_FLOOR, roomOf, BADGE_GATES, BOND_MAX, BOND_WATER, BOND_ASK_AT,
  type ActionIntent, type ActionResult, type CasinoGame, type CasinoOutcome, type Dish, type FarmSnapshot, type FarmTile, type ForageSpot, type InventorySlot, type LifeDexCat, type LifeDexState, type MailGift, type MapId,
  type PlacedObject, type PlayerNotice, type PlayerState, type SaveData, type Season, type TrainerDef, type WorldTime, type Weather, type BattleUpdate,
} from '../types';
import {
  MORNING_FOOD,
  canGrowCropAt,
  claimableMilestone,
  consumeFoodItem,
  ensureLifeDex,
  foodStatusOf,
  registerLifeDex,
  rollRegionalMineralDrops,
  stepHungerTick,
  syncAutoRecipes,
} from './lifeDex';
import { ADMIN_DEFAULT_CASH_KRW, BM_ALL_TOTAL_KRW, BM_LOOK_IDS, BM_PRODUCT_MAP, CHAT_BUBBLES, LUMI_COORDS, UI_THEMES, isBmUnlocked, isValidPlayerLook, remainingBmCostKrw } from '../bmShop';
import { MapInfo, prop } from './MapInfo';
import { RIVAL_PICK, STORY, rivalOf } from '../story';

/** 처음부터 아는 제작법 (집 작업대) */
const STARTER_RECIPES = () => Object.values(RECIPES).filter((r) => r.starter).map((r) => r.id);
/** 처음 배우러 갔을 때 주는 선물 [아이템, 개수] */
const TEACH_GIFTS: Record<string, [string, number]> = { hana: ['seeds_lumi_herb', 8], minsu: ['copper_ore', 3], hanbyeol: ['seeds_fire_pepper', 4] };
/** 옛 세이브의 아이템 id → 새 id (별빛 병 → 루미볼) */
const OLD_ITEMS: Record<string, string> = { jar: 'lumi_ball', super_jar: 'super_ball' };
function migrateBag(bag: Record<string, number>) {
  for (const [o, n] of Object.entries(OLD_ITEMS)) if (bag[o]) { bag[n] = (bag[n] ?? 0) + bag[o]; delete bag[o]; }
  for (const k of Object.keys(bag)) if (!ITEMS[k]) delete bag[k];
}

export const DAY_START = 6 * 60;      // 06:00
export const DAY_END = 26 * 60;       // 다음날 02:00 → 날짜만 넘어감 (기절 없음)
export const MS_PER_10_MIN = 7000;    // 실제 7초 = 게임 10분
export const HOTBAR_SIZE = 12;
export const INVENTORY_SIZE = 24;     // 소지품 칸 (휴대폰 › 가방)
export const PRISON_MINE_GOAL = 3;    // (하위 호환 상수)
export const PRISON_LABOR_GOAL = 100; // 노역 채광장 석판·나무판 각 100개 납품 시 정식 석방
export const EVIL_STACK_MAX = 100;    // 불법 탈옥 시 부여되는 악행스택
const REACH = 1.75;                   // 도구 사거리 (타일)
const INVITE_TTL = 5 * 60_000;

export type SimEvent =
  | { type: 'tile'; owner: string; tile: FarmTile; map?: MapId }
  | { type: 'time'; time: WorldTime }
  | { type: 'gold'; playerId: string; gold: number; delta: number }
  | { type: 'player'; id: string; energy: number; inventory: InventorySlot[] }
  | { type: 'newDay'; time: WorldTime }
  | { type: 'objectRemoved'; key: string; owner?: string }
  | { type: 'objectRestored'; keys: string[]; playerId?: string }
  | { type: 'cleared'; playerId: string; key: string }
  | { type: 'opened'; playerId: string; key: string }
  | { type: 'forage'; spots: ForageSpot[] }
  | { type: 'party'; id: string; party: PlayerState['party']; box?: PlayerState['box']; bag: PlayerState['bag']; badges: string[]; defeated: string[]; seen: string[]; caught: string[]; visited: string[]; recipes: string[]; flags: string[]; bonds?: Record<string, number>; asks?: Record<string, number>; stock?: Record<string, Record<string, number>>; opened?: string[] }
  | { type: 'help'; playerId: string; species: string; text: string }
  | { type: 'toast'; playerId?: string; room?: string; text: string; icon?: string }
  | { type: 'room'; playerId: string; map: MapId; inst: string; world: string; x: number; y: number; snapshot: FarmSnapshot }
  | { type: 'look'; id: string; look: string; name: string }
  | { type: 'emote'; playerId: string; room: string; emote: number }
  | { type: 'dish'; room: string; dish: Dish | null }
  | { type: 'invite'; to: string; from: string; fromName: string; where: 'farm' | 'home' }
  | { type: 'sleep'; ready: number; total: number }
  | { type: 'story'; id: string; story: number }
  | { type: 'placed'; owner: string; obj: PlacedObject }
  | { type: 'unplaced'; owner: string; id: string }
  | { type: 'bmState'; id: string; mailItems: MailGift[]; uiTheme: string; ownedThemes: string[]; ownedOutfits: string[]; lumiCoord: string; ownedLumiCoords: string[]; chatBubble: string; ownedBubbles: string[]; bmOrders: string[]; cash: number; isAdmin: boolean }
  | { type: 'bike'; id: string; riding: boolean }
  | { type: 'surf'; id: string; surfing: boolean }
  | { type: 'cheatFreeze'; playerId: string; message: string; reason?: string }
  | { type: 'prisonState'; playerId: string; jailed: boolean; mined: number; goal: number; reason?: string }
  | { type: 'prisonLabor'; playerId: string; slabs: number; planks: number; goal: number }
  | { type: 'karma'; playerId: string; evilStack: number; momLeft: boolean; pendingHomecoming?: 'honest' | 'mom_returned' | ''; lastHelpedNpc?: string }
  | { type: 'notices'; playerId: string; notices: PlayerNotice[] }
  | { type: 'mute'; playerId: string; muteRemainingSec: number }
  | { type: 'lifeDex'; playerId: string; lifeDex: LifeDexState; lifeDexClaims: string[]; added?: { id: string; cat: LifeDexCat; name: string; first: boolean; total: number } }
  | { type: 'hunger'; playerId: string; food: number; hungerOff: boolean; peckishAlert?: boolean };

type Listener = (e: SimEvent) => void;
interface FarmState { owner: string; /** 마을 텃밭이면 그 마을 */ map?: MapId; tiles: Map<string, FarmTile>; removed: Set<number>; placed: Map<string, PlacedObject>; dish: Dish | null }
/** 농장 맵 배치 버전: 바뀌면 옛 세이브의 '치운 오브젝트' 목록은 맞지 않으므로 비움 (경작지는 유지) */
const FARM_VER = 3;
/** 지나갈 수 있는 오브젝트 (충돌 없음) */
const NON_BLOCKING = new Set(['tuft', 'tallgrass', 'stairs_up', 'attic_stairs_up', 'attic_stairs_down', 'portal', 'glint', 'ice_tile', 'arrow_pad', 'warp_pad', 'switch_btn', 'gatehouse', 'cycle_gate', 'pair_card', 'rail_switch', 'quiz_pad', 'prism', 'rune_pad', 'rune_demo', 'snow_reset', 'stop_tile', 'water_switch', 'water_bridge', 'push_block', 'block_slot', 'puzzle_reset', 'cracked_tile', 'sea_current', 'prison_hatch', 'prison_stairs_up']);
const TREES = new Set(['oak', 'oak_apple', 'oak_autumn', 'pine', 'pine_snow', 'palm', 'dead_tree']);
const TREE_HITS = 5, STUMP_HITS = 2;
/** 전설 · 환상 (별마루산 꼭대기 별의 제단 · 별의 요람 · 해신의 바다) */
export const LEGEND = 'byeolmuri', MYTH = 'onnuri', STELLA = 'stella', SEA_LEGEND = 'haerang';
/** 레벨에 맞게 진화한 모습 (사건 상대 팀) */
const grownAt = (sp: string, lv: number) => { let s = sp; for (let k = 0; k < 2; k++) { const e = SPECIES[s]?.evolves; if (e && lv >= e.level + 2) s = e.to; } return s; };
/** 캔 광석이 다시 생기기까지 (실제 시간) */
export const ORE_RESPAWN_MS = 3 * 60_000;
const LEGEND_LV = 70, MYTH_LV = 150, STELLA_LV = 60, SEA_LEGEND_LV = 62, MASTER_LV = 100;
export { dexComplete } from '../data';
const oprop = (o: { properties?: { name: string; value: unknown }[] }, name: string) => o.properties?.find((pp) => pp.name === name)?.value;

const cloneTile = (t: FarmTile): FarmTile => ({ ...t, crop: t.crop ? { ...t.crop } : null });

export class FarmSimulation {
  readonly map: MapInfo;
  readonly maps: Record<MapId, MapInfo>;
  private battles = new Map<string, BattleState>();
  private engine: BattleEngine;
  private forage: ForageSpot[] = [];
  private lastEncounter = new Map<string, number>();
  time: WorldTime = { day: 1, minutes: DAY_START, season: 'spring', weather: 'sunny' };
  readonly players = new Map<string, PlayerState>();
  /** 주인별 농장 (접속 중인 주인만 메모리에 올림) */
  private farms = new Map<string, FarmState>();
  /** 마을 텃밭: `${주인}|${마을}` (나에게만 보이는 내 몫의 밭) */
  private plots = new Map<string, FarmState>();
  /** 공개 맵에서 사라진 오브젝트 `${map}:${id}` (채석장 바위 등) */
  private removed = new Set<string>();
  /** 캔 광석이 다시 생기는 시각 (광석 key → ms) */
  private oreBack = new Map<string, number>();
  /** 받은 초대: to → from → {where, t} */
  private invites = new Map<string, Map<string, { where: 'farm' | 'home'; t: number }>>();
  private acc = 0;
  private listeners: Listener[] = [];
  private seed = 1337;
  /** 나무 · 그루터기에 남은 도끼질 (`${주인}:${id}` → 맞은 횟수) */
  private chopHits = new Map<string, number>();
  /** 맵별 칸 → 그 칸을 막는 오브젝트 id (치우면 지나갈 수 있음) */
  private occCache = new Map<MapId, Map<number, number>>();
  private weedCache = new Map<number, number[]>();
  private placeSeq = 0;
  /** 체육관 런타임 퍼즐 상태 (플레이어별: 맵을 떠나면 자동 초기화) */
  private gymWater = new Map<string, number>();
  private gymBlocks = new Map<string, Map<number, { x: number; y: number; group: string; gateId: string; locked: boolean }>>();
  /** 온라인 채팅 금지 타이머 동기화 누적기 (초) */
  private muteSyncAcc = new Map<string, number>();
  /** 노역 채광장 자원 빠른 재생성 큐 (플레이어별) */
  private yardRespawns: { playerId: string; key: string; at: number }[] = [];

  /** 멀티 서버면 true: 서버 시계를 모두가 공유 */
  readonly multiplayer: boolean;
  constructor(maps: Record<MapId, MapInfo>, opts: { multiplayer?: boolean } = {}) {
    this.multiplayer = !!opts.multiplayer;
    this.maps = maps;
    this.map = maps.farm;
    this.engine = new BattleEngine(() => this.rand());
    this.spawnForage();
  }

  on(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  private emit(e: SimEvent) { for (const l of this.listeners) l(e); }
  private rand() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }
  room(p: PlayerState) { return roomOf(p.map, p.inst, p.world); }
  playersIn(room: string) { return [...this.players.values()].filter((p) => this.room(p) === room); }

  // ── 농장 인스턴스 ───────────────────────────────────
  private ensureFarm(owner: string, saved?: SaveData['farm']): FarmState {
    let f = this.farms.get(owner);
    if (f) return f;
    const sameLayout = saved?.ver === FARM_VER;
    f = { owner, tiles: new Map(), removed: new Set(sameLayout ? saved?.removed ?? [] : []), placed: new Map((sameLayout ? saved?.placed ?? [] : []).map((o) => [o.id, { ...o }])), dish: null };
    if (saved) for (const t of saved.tiles) f.tiles.set(`${t.x},${t.y}`, cloneTile(t));
    else this.seedPlots(f);
    this.farms.set(owner, f);
    return f;
  }
  /** 플레이어가 지금 서 있는 농장 (자기 농장 또는 초대받은 친구 농장) */
  private farmOf(p: PlayerState) { return this.ensureFarm(p.map === 'farm' || isHomeMap(p.map) ? p.inst || p.id : p.id); }
  private plotOf(owner: string, map: MapId): FarmState {
    const k = `${owner}|${map}`; let f = this.plots.get(k);
    if (!f) { f = { owner, map, tiles: new Map(), removed: new Set(), placed: new Map(), dish: null }; this.plots.set(k, f); }
    return f;
  }
  /** 괭이질할 수 있는 맵: 내 농장 + 텃밭이 있는 마을 */
  isField(map: MapId) { return map === 'farm' || (this.maps[map]?.farmZones.length ?? 0) > 0; }
  /** 지금 서 있는 곳의 밭 (농장 또는 그 마을의 내 텃밭) */
  private fieldOf(p: PlayerState) { return p.map === 'farm' ? this.farmOf(p) : this.plotOf(p.id, p.map); }

  private seedPlots(f: FarmState) {
    for (const p of this.map.plots) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const t: FarmTile = { x, y, soil: p.watered ? SoilState.Watered : SoilState.Plowed, crop: null };
      if (p.crop && CROPS[p.crop]) {
        const st = Math.max(0, Math.min(4, p.stage - (this.rand() < 0.25 ? 1 : 0)));
        t.crop = { id: p.crop, stage: st, daysInStage: 0 };
      }
      f.tiles.set(`${x},${y}`, t);
    }
  }

  // ── 접속 / 저장 ─────────────────────────────────────
  /** 멀티플레이 등에서 이미 접속 중인 닉네임과 겹치면 뒤에 2, 3, 4... 번호를 자동으로 붙여 고유하게 만든다 */
  uniqueName(rawName: string, excludeId?: string): string {
    const clean = String(rawName || '트레이너').replace(/[<>]/g, '').trim().slice(0, 10) || '트레이너';
    const taken = new Set<string>();
    for (const other of this.players.values()) {
      if (other.id !== excludeId && other.name) taken.add(other.name);
    }
    if (!taken.has(clean)) return clean;
    const base = clean.replace(/\d+$/, '') || clean;
    let k = 2;
    while (taken.has(`${base}${k}`)) k++;
    return `${base}${k}`;
  }

  addPlayer(id: string, name: string, look = 'player', save?: SaveData | null, world = ''): PlayerState {
    const inv: InventorySlot[] = Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ slotIndex: i, itemId: null, quantity: 0 }));
    // 도구는 마을(소라네 루미 마트)에서 직접 사서 쓰는 것이 시작: 씨앗만 챙겨 줌
    const give = ['seeds_lumi_herb', 'seeds_parsnip', 'seeds_tomato'];
    const qty: Record<string, number> = { seeds_lumi_herb: 10, seeds_parsnip: 8, seeds_tomato: 4 };
    give.forEach((it, i) => { inv[i].itemId = it; inv[i].quantity = qty[it] ?? 1; });
    const home = this.homeSpot();
    const initialName = this.uniqueName(save?.name || name, id);
    const p: PlayerState = {
      id, name: initialName, look, map: 'farm', inst: id, x: home.x, y: home.y, dir: 'down', anim: 'idle', energy: 270, maxEnergy: 270, inventory: inv, gold: 500, bin: [], story: STORY.HOME, world, homeWorld: world, mode: 'story',
      party: [], box: [], bag: {}, badges: [], defeated: [], seen: [], caught: [], visited: ['farm'], recipes: STARTER_RECIPES(), flags: [],
      mailItems: [], uiTheme: 'rural', ownedThemes: ['rural'], ownedOutfits: [], lumiCoord: '', ownedLumiCoords: [], chatBubble: 'default', ownedBubbles: ['default'], bmOrders: [], cashOrders: [],
      isAdmin: false, cash: 0,
      jailed: false, prisonMined: 0, prisonSlabs: 0, prisonPlanks: 0, evilStack: 0, momLeft: false, pendingHomecoming: '', muteRemainingSec: 0, notices: [],
    };
    if (save) {
      Object.assign(p, {
        name: initialName, look: save.look ?? look, gold: save.gold ?? 500, energy: save.energy ?? 270, maxEnergy: save.maxEnergy ?? 270,
        party: save.party ?? [], box: save.box ?? [], bag: save.bag ?? {}, badges: save.badges ?? [], defeated: save.defeated ?? [],
        seen: save.seen ?? [], caught: save.caught ?? [], bin: save.bin ?? [], visited: save.visited ?? ['farm', 'town', ...(save.party?.length ? ['route1', 'windvale'] : [])],
        story: save.story ?? ((save.party ?? []).length ? STORY.DONE : STORY.HOME),
        recipes: [...new Set([...STARTER_RECIPES(), ...(save.recipes ?? [])])],
        flags: save.flags ?? [],
        bonds: save.bonds ?? {}, bondDay: save.bondDay ?? {}, asks: save.asks ?? {}, stock: save.stock ?? {}, opened: save.opened ?? [],
        mailItems: save.mailItems ?? [],
        uiTheme: save.uiTheme && UI_THEMES[save.uiTheme] ? save.uiTheme : 'rural',
        ownedThemes: [...new Set(['rural', ...(save.ownedThemes ?? [])])],
        ownedOutfits: [...new Set(save.ownedOutfits ?? [])],
        lumiCoord: save.lumiCoord && LUMI_COORDS[save.lumiCoord] ? save.lumiCoord : '',
        ownedLumiCoords: [...new Set(save.ownedLumiCoords ?? [])],
        chatBubble: save.chatBubble && CHAT_BUBBLES[save.chatBubble] ? save.chatBubble : 'default',
        ownedBubbles: [...new Set(['default', ...(save.ownedBubbles ?? [])])],
        bmOrders: [...new Set(save.bmOrders ?? [])],
        cashOrders: [...new Set(save.cashOrders ?? [])],
        cash: typeof save.cash === 'number' && Number.isFinite(save.cash) ? Math.max(0, Math.round(save.cash)) : 0,
        isAdmin: false,
        jailed: !!save.jailed,
        jailReason: save.jailReason,
        jailFine: save.jailFine,
        jailPrevGold: save.jailPrevGold,
        jailPrevCash: save.jailPrevCash,
        prisonMined: 0,
        prisonSlabs: Math.max(0, Math.round(save.prisonSlabs ?? 0)),
        prisonPlanks: Math.max(0, Math.round(save.prisonPlanks ?? 0)),
        evilStack: Math.max(0, Math.min(EVIL_STACK_MAX, Math.round(save.evilStack ?? 0))),
        momLeft: !!save.momLeft,
        pendingHomecoming: save.pendingHomecoming ?? '',
        lastHelpedNpc: save.lastHelpedNpc,
        muteRemainingSec: typeof save.muteRemainingSec === 'number' && Number.isFinite(save.muteRemainingSec) ? Math.max(0, save.muteRemainingSec) : 0,
        notices: Array.isArray(save.notices) ? save.notices.slice(0, 40) : [],
        lifeDex: save.lifeDex ? JSON.parse(JSON.stringify(save.lifeDex)) : undefined,
        lifeDexClaims: Array.isArray(save.lifeDexClaims) ? [...new Set(save.lifeDexClaims)] : [],
        food: typeof save.food === 'number' && Number.isFinite(save.food) ? Math.max(0, Math.min(100, Math.round(save.food))) : undefined,
        hungerOff: !!save.hungerOff,
      });
      migrateBag(p.bag);
      if (save.inventory?.length) {
        const len = Math.max(INVENTORY_SIZE, save.inventory.length);
        p.inventory = Array.from({ length: len }, (_, i) => {
          const raw = save.inventory[i];
          const itemId = raw?.itemId ?? null;
          const ok = !!itemId && !!ITEMS[itemId];
          const dur = ok && typeof raw?.dur === 'number' ? raw.dur : undefined;
          return dur !== undefined
            ? { slotIndex: i, itemId: itemId!, quantity: raw?.quantity ?? 0, dur }
            : { slotIndex: i, itemId: ok ? itemId : null, quantity: ok ? raw?.quantity ?? 0 : 0 };
        });
      }
    }
    ensureLifeDex(p, !!save);
    syncAutoRecipes(p);
    this.players.set(id, p);
    this.ensureFarm(id, save?.farm);
    for (const [m, tiles] of Object.entries(save?.plots ?? {})) if (this.maps[m]?.farmZones.length) { const f = this.plotOf(id, m); for (const t of tiles) f.tiles.set(`${t.x},${t.y}`, cloneTile(t)); }
    // 마지막 위치에서 이어서: 내 농장 · 집이거나 공용 장소일 때만 (친구 농장 등은 그 친구가 없을 수 있어 내 농장으로)
    const at = save?.pos;
    if (at && p.story !== STORY.HOME && this.maps[at.map]) {
      if (at.map === 'in_casino' && !isCasinoOpen(this.time.minutes)) {
        const ret = at.ret && this.maps[at.ret.map] && !isInterior(at.ret.map) ? at.ret : null;
        if (ret) Object.assign(p, { map: ret.map, inst: ret.inst ?? '', x: ret.x, y: ret.y, dir: 'down' as const });
        else {
          const nt = this.nearestTown(p);
          const sp = this.maps[nt.map].spawns.get(nt.spawn) ?? this.maps[nt.map].spawns.get('player')!;
          Object.assign(p, { map: nt.map, inst: '', x: sp.x, y: sp.y + 5, dir: 'down' as const });
        }
      } else {
        const own = at.map === 'farm' || isHomeMap(at.map) ? at.inst === id : !(at.inst && this.players.has(at.inst));
        const next = { ...p, map: at.map, inst: own && (at.map === 'farm' || isHomeMap(at.map)) ? id : at.inst };
        if (own && Number.isFinite(at.x) && Number.isFinite(at.y) && this.canStand(next, at.x, at.y)) {
          Object.assign(p, { map: next.map, inst: next.inst, x: at.x, y: at.y, dir: at.dir ?? p.dir, ret: at.ret });
        }
      }
    }
    // 아직 프롤로그 첫 장면이면 2층 다락방 내 방(TV 앞)에서 시작
    if (p.story === STORY.HOME) { const w = this.maps.home_2f.spawns.get('wake') ?? this.maps.home_2f.spawns.get('entry')!; Object.assign(p, { map: 'home_2f', inst: id, x: w.x, y: w.y + 5, dir: 'up' }); }
    // 수감 중인 계정은 노역 채광장에 있었다면 노역장에서, 그 외에는 무조건 별빛 교도소 지하 5층 독방에서 시작
    if (p.jailed && this.maps.in_prison) {
      if (save?.pos?.map === 'in_prison_yard' && this.maps.in_prison_yard) {
        const ysp = this.maps.in_prison_yard.spawns.get('entry') ?? { x: 232, y: 264 };
        Object.assign(p, { map: 'in_prison_yard', inst: '', x: ysp.x, y: ysp.y + 5, dir: 'up' as const, ret: undefined, cleared: [], prisonMined: 0 });
      } else {
        const cell = this.maps.in_prison.spawns.get('entry') ?? this.maps.in_prison.spawns.get('player') ?? { x: 56, y: 200 };
        Object.assign(p, { map: 'in_prison', inst: '', x: cell.x, y: cell.y + 5, dir: 'right' as const, ret: undefined, cleared: [], prisonMined: 0 });
      }
    }
    return p;
  }

  /** 저장용 데이터 */
  exportSave(id: string): SaveData | null {
    const p = this.players.get(id); if (!p) return null;
    const f = this.farms.get(id);
    return JSON.parse(JSON.stringify({
      v: 1, name: p.name, look: p.look, gold: p.gold, energy: p.energy, maxEnergy: p.maxEnergy, inventory: p.inventory,
      party: p.party, box: p.box, bag: p.bag, badges: p.badges, defeated: p.defeated, seen: p.seen, caught: p.caught, bin: p.bin,
      farm: { tiles: f ? [...f.tiles.values()] : [], removed: f ? [...f.removed] : [], placed: f ? [...f.placed.values()] : [], ver: FARM_VER }, story: p.story, flags: p.flags, visited: p.visited, recipes: p.recipes,
      bonds: p.bonds, bondDay: p.bondDay, asks: p.asks, stock: p.stock, opened: p.opened,
      mailItems: p.mailItems, uiTheme: p.uiTheme, ownedThemes: p.ownedThemes, ownedOutfits: p.ownedOutfits,
      lumiCoord: p.lumiCoord, ownedLumiCoords: p.ownedLumiCoords, chatBubble: p.chatBubble, ownedBubbles: p.ownedBubbles, bmOrders: p.bmOrders, cashOrders: p.cashOrders,
      cash: p.cash ?? 0,
      jailed: !!p.jailed,
      jailReason: p.jailReason,
      jailFine: p.jailFine,
      jailPrevGold: p.jailPrevGold,
      jailPrevCash: p.jailPrevCash,
      prisonSlabs: p.prisonSlabs ?? 0,
      prisonPlanks: p.prisonPlanks ?? 0,
      evilStack: p.evilStack ?? 0,
      momLeft: !!p.momLeft,
      pendingHomecoming: p.pendingHomecoming ?? '',
      lastHelpedNpc: p.lastHelpedNpc,
      muteRemainingSec: Math.max(0, Math.round(p.muteRemainingSec ?? 0)),
      notices: p.notices ?? [],
      lifeDex: p.lifeDex,
      lifeDexClaims: p.lifeDexClaims ?? [],
      food: p.food ?? 80,
      hungerOff: !!p.hungerOff,
      plots: Object.fromEntries([...this.plots.values()].filter((pl) => pl.owner === id && pl.tiles.size).map((pl) => [pl.map!, [...pl.tiles.values()]])),
      pos: { map: p.map, inst: p.inst, x: p.x, y: p.y, dir: p.dir, ret: p.ret }, savedAt: Date.now(),
    } satisfies SaveData)) as SaveData;
  }

  /** 접속 종료: 저장 데이터를 돌려주고, 그 사람 농장/집에 있던 손님은 마을로 */
  removePlayer(id: string): SaveData | null {
    const save = this.exportSave(id);
    this.players.delete(id); this.battles.delete(id); this.invites.delete(id);
    for (const inv of this.invites.values()) inv.delete(id);
    for (const g of this.players.values()) {
      if (g.world === id && g.homeWorld !== id) { g.world = g.homeWorld; if (!((g.map === 'farm' || isHomeMap(g.map)) && g.inst === id)) this.relocate(g, g.map, g.inst, g.x, g.y); }
      if ((g.map === 'farm' || isHomeMap(g.map)) && g.inst === id) {
        this.emit({ type: 'toast', playerId: g.id, text: '농장 주인이 떠나서 마을로 돌아왔어요.', icon: 'heart' });
        this.toSpawn(g, 'town', '', 'from_farm');
      }
    }
    this.farms.delete(id);
    this.gymWater.delete(id);
    this.gymBlocks.delete(id);
    this.muteSyncAcc.delete(id);
    this.yardRespawns = this.yardRespawns.filter((r) => r.playerId !== id);
    for (const k of [...this.plots.keys()]) if (k.startsWith(`${id}|`)) this.plots.delete(k);
    return save;
  }
  inBattle(id: string) { return this.battles.has(id); }

  private homeSpot() { const s = this.map.spawns.get('player') ?? { x: 368, y: 232 }; return { x: s.x, y: s.y + 5 }; }

  /** 방 이동 (워프/실내/초대/새 날/배틀 패배) → 해당 플레이어에게 새 방의 상태를 보냄 */
  private relocate(p: PlayerState, map: MapId, inst: string, x: number, y: number) {
    p.map = map; p.inst = inst; p.x = x; p.y = y; p.sleeping = false;
    p.cleared = [];   // 비전 기술로 치운 장애물은 맵을 떠나면 다시 생김
    this.gymWater.delete(p.id);
    this.gymBlocks.delete(p.id);
    if (p.riding && (isInterior(map) || this.maps[map]?.props.cave)) {
      p.riding = false;
      this.emit({ type: 'bike', id: p.id, riding: false });
    }
    if (p.surfing) {
      p.surfing = false;
      this.emit({ type: 'surf', id: p.id, surfing: false });
    }
    // 해신의 바다: 이미 3개의 조류 비석을 모두 해제했다면 소용돌이 장벽을 열린 상태로 유지
    if (map === 'ocean_shrine' && p.flags.includes('sea_shrine_open')) {
      const m = this.maps[map];
      if (m) for (const o of m.objects) {
        if (o.type === 'whirlpool' && String(oprop(o, 'gateId') ?? '') === 'sea_main') {
          p.cleared.push(`${map}:${o.id}`);
        }
      }
    }
    if (!isHomeMap(map) && !isInterior(map)) p.ret = undefined;
    if (!isInterior(map) && !p.visited.includes(map)) { p.visited.push(map); this.emitParty(p); }
    this.emit({ type: 'room', playerId: p.id, map, inst, world: p.world, x, y, snapshot: this.snapshot(p.id) });
  }
  private toSpawn(p: PlayerState, map: MapId, inst: string, spawn: string) {
    const s = this.maps[map].spawns.get(spawn) ?? this.maps[map].spawns.get('player') ?? { x: 64, y: 64 };
    this.relocate(p, map, inst, s.x, s.y + 5);
  }

  /** 지금 있는 방 기준 상태 (경작지는 그 농장 주인 것) */
  snapshot(playerId: string): FarmSnapshot {
    const p = this.players.get(playerId);
    const farm = p && (p.map === 'farm' || isHomeMap(p.map)) ? this.farmOf(p) : null;
    return {
      time: { ...this.time }, gold: p?.gold ?? 0,
      tiles: farm && p?.map === 'farm' ? [...farm.tiles.values()].map(cloneTile) : p && !isHomeMap(p.map) && this.isField(p.map) ? [...this.plotOf(p.id, p.map).tiles.values()].map(cloneTile) : [],
      removedObjects: [...this.removed, ...(farm ? [...farm.removed].map((id) => `farm:${id}`) : [])],
      forage: [...this.forage], dish: farm && p?.map === 'home' ? farm.dish : null,
      placed: farm && p?.map === 'farm' ? [...farm.placed.values()].map((o) => ({ ...o })) : [],
    };
  }

  // ── 시간 ───────────────────────────────────────────
  tick(dtMs: number) {
    this.acc += dtMs;
    this.respawnOres();
    // 채팅 금지(인게임 접속 시간 기준): 현재 접속 중인 플레이어만 남은 시간 감소
    const dtSec = Math.max(0, dtMs) / 1000;
    if (dtSec > 0) {
      for (const p of this.players.values()) {
        if ((p.muteRemainingSec ?? 0) <= 0) continue;
        p.muteRemainingSec = Math.max(0, (p.muteRemainingSec ?? 0) - dtSec);
        const acc = (this.muteSyncAcc.get(p.id) ?? 0) + dtSec;
        if (p.muteRemainingSec <= 0) {
          this.muteSyncAcc.delete(p.id);
          this.emit({ type: 'mute', playerId: p.id, muteRemainingSec: 0 });
          this.emit({ type: 'toast', playerId: p.id, text: '🔊 채팅 금지 시간이 모두 지나 해제되었어요!', icon: 'heart' });
        } else if (acc >= 5) {
          this.muteSyncAcc.set(p.id, 0);
          this.emit({ type: 'mute', playerId: p.id, muteRemainingSec: Math.ceil(p.muteRemainingSec) });
        } else {
          this.muteSyncAcc.set(p.id, acc);
        }
      }
    }
    while (this.acc >= MS_PER_10_MIN) {
      this.acc -= MS_PER_10_MIN;
      this.time.minutes += 10;
      this.emit({ type: 'time', time: { ...this.time } });
      if (this.time.minutes % 30 === 0) {
        for (const p of this.players.values()) {
          const outdoor = !isInterior(p.map) && p.map !== 'farm';
          const hr = stepHungerTick(p, outdoor);
          if (hr.changed) {
            this.emit({ type: 'hunger', playerId: p.id, food: p.food ?? 80, hungerOff: !!p.hungerOff, peckishAlert: hr.becamePeckish });
            if (hr.becamePeckish) {
              this.emit({ type: 'toast', playerId: p.id, text: '🍙 꼬르륵… 배가 출출해졌어요! 도시락이나 음식을 먹어 보세요.', icon: 'food_bowl' });
            }
          }
        }
      }
      if (this.time.minutes >= DAY_END) { this.emit({ type: 'toast', text: '새벽이 지나 새 아침이 밝았어요. (잠을 자면 체력이 회복돼요)', icon: 'sun' }); this.newDay(false, false); }
    }
  }
  /** 캔 광석은 몇 분 뒤 그 자리에 다시 생김 (동굴 파밍) */
  private respawnOres(now = Date.now()) {
    if (this.yardRespawns.length) {
      const keep: typeof this.yardRespawns = [];
      for (const item of this.yardRespawns) {
        if (item.at <= now) {
          const pl = this.players.get(item.playerId);
          if (pl?.cleared) pl.cleared = pl.cleared.filter((k) => k !== item.key);
          this.emit({ type: 'objectRestored', playerId: item.playerId, keys: [item.key] });
        } else {
          keep.push(item);
        }
      }
      this.yardRespawns = keep;
    }
    if (!this.oreBack.size) return;
    const back: string[] = [];
    for (const [k, t] of this.oreBack) if (t <= now) { this.oreBack.delete(k); if (this.removed.delete(k)) back.push(k); }
    if (back.length) this.emit({ type: 'objectRestored', keys: back });
  }
  /** 현재 10분 구간 진행률 (조명 보간용) */
  get subMinute() { return (this.acc / MS_PER_10_MIN) * 10; }
  /** 서버 재시작 후 이어가기용 */
  setWorld(time: WorldTime) { this.time = { ...time }; }

  /** relocate: 모두 집 앞으로 · rest: 체력/루미 회복 (잠을 잤을 때만) */
  newDay(relocate = true, rest = true) {
    const weather: Weather = this.rand() < 0.25 ? 'rain' : 'sunny';
    const seasons: Season[] = ['spring', 'summer', 'fall', 'winter'];
    let nextDay = this.time.day + 1;
    let nextSeason = this.time.season;
    if (nextDay > 28) {
      nextDay = 1;
      nextSeason = seasons[(seasons.indexOf(this.time.season) + 1) % seasons.length];
    }
    this.time = { day: nextDay, minutes: DAY_START, season: nextSeason, weather };
    this.acc = 0;
    if (rest) {
      for (const p of this.players.values()) {
        p.food = Math.max(p.food ?? 0, MORNING_FOOD);
        this.emit({ type: 'hunger', playerId: p.id, food: p.food, hungerOff: !!p.hungerOff });
      }
    }
    // 작물 성장 (전날 물 준 칸만) — 메모리에 있는 모든 농장
    for (const f of [...this.farms.values(), ...this.plots.values()]) {
      for (const t of [...f.tiles.values()]) {
        if (t.crop && t.soil === SoilState.Watered) {
          const def = CROPS[t.crop.id];
          if (t.crop.stage < 4) {
            t.crop.daysInStage++;
            const need = t.crop.regrowing ? def.regrowDays : def.growthDays[t.crop.stage];
            if (t.crop.daysInStage >= need) { t.crop.stage = t.crop.regrowing ? 4 : t.crop.stage + 1; t.crop.daysInStage = 0; if (t.crop.stage === 4) t.crop.regrowing = false; }
          }
        }
        t.soil = weather === 'rain' ? SoilState.Watered : SoilState.Plowed;
        if (!t.crop && weather !== 'rain' && this.rand() < 0.1) { f.tiles.delete(`${t.x},${t.y}`); t.soil = SoilState.Unplowed; }
        this.tileEmit(f, t);   // 자리를 옮기지 않는 새 날(N)에도 밭 그림이 바로 바뀌도록
      }
      f.dish = null;
    }
    // 출하 정산 (플레이어별) + 농사형 파트너 도움
    for (const p of this.players.values()) {
      let earned = 0;
      for (const b of p.bin) earned += (ITEMS[b.itemId]?.sellPrice ?? 0) * b.quantity;
      p.bin = [];
      if (earned) { p.gold += earned; this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta: earned }); this.emit({ type: 'toast', playerId: p.id, text: `어제 출하한 물건이 ${earned}G에 팔렸어요!`, icon: 'gold' }); }
      if (SPECIES[p.party[0]?.species]?.helps === 'farm' && weather !== 'rain') {
        let n = 0;
        const myFarm = this.ensureFarm(p.id);
        for (const t of myFarm.tiles.values()) { if (n >= 6) break; if (t.crop && t.soil !== SoilState.Watered) { t.soil = SoilState.Watered; this.tileEmit(myFarm, t); n++; } }
        if (n) this.emit({ type: 'help', playerId: p.id, species: p.party[0].species, text: `${SPECIES[p.party[0].species].name}이(가) 아침 일찍 작물 ${n}칸에 물을 줬어요!` });
      }
    }
    this.helpersWork(weather);
    // 채석장 바위·채집물 다시 생성 (농장 채광 바위터의 광맥도 매일 복원)
    const restored = [...this.removed].filter((k) => { const [m, id] = k.split(':'); return this.maps[m as MapId]?.objects.some((o) => String(o.id) === id && o.properties?.some((pp) => pp.name === 'mine')); });
    for (const k of restored) this.removed.delete(k);
    if (restored.length) this.emit({ type: 'objectRestored', keys: restored });
    const farmMineIds = new Set(this.map.objects.filter((o) => o.properties?.some((pp) => pp.name === 'mine')).map((o) => o.id));
    for (const f of this.farms.values()) {
      const farmBack: string[] = [];
      for (const id of [...f.removed]) {
        if (farmMineIds.has(id)) { f.removed.delete(id); farmBack.push(`farm:${id}`); }
      }
      if (farmBack.length) this.emit({ type: 'objectRestored', playerId: f.owner, keys: farmBack });
    }
    this.spawnForage();
    this.emit({ type: 'forage', spots: [...this.forage] });
    this.emit({ type: 'newDay', time: { ...this.time } });
    // 새벽 6시가 되면 밤 전용 카지노 영업 종료 → 안에 있던 손님은 바깥으로 안내
    for (const p of this.players.values()) {
      if (p.map === 'in_casino' && !isCasinoOpen(this.time.minutes)) {
        const ret = p.ret && this.maps[p.ret.map] && !isInterior(p.ret.map) ? p.ret : null;
        if (ret) this.relocate(p, ret.map, ret.inst, ret.x, ret.y);
        else { const nt = this.nearestTown(p); this.toSpawn(p, nt.map, '', nt.spawn); }
        this.emit({ type: 'toast', playerId: p.id, text: '🌅 새벽이 밝아 별빛 카지노가 영업을 마쳤어요! 내일 밤 6시에 다시 만나요.', icon: 'sun' });
      }
    }
    // 새 날: 모두 자기 농장 집 앞에서 시작 (루미도 푹 쉼)
    const home = this.homeSpot();
    if (!rest) return;
    for (const p of this.players.values()) {
      p.energy = p.maxEnergy;
      healAll(p.party);
      this.battles.delete(p.id);
      this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory });
      this.emitParty(p);
      if (!relocate || p.jailed) continue;
      p.world = p.homeWorld;
      this.relocate(p, 'farm', p.id, home.x, home.y);
    }
  }

  // ── 행동 처리 (서버 권한 검증) ──────────────────────
  apply(playerId: string, a: ActionIntent): ActionResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, reason: 'no-player' };
    if (a.kind === 'cheatCaught') return this.flagCheater(p, a.reason);
    if (a.kind === 'markNoticesRead') return this.markNoticesRead(p);
    // 수감 중에는 탈옥/감옥 채광/감정표현 외 이동·빠른이동·귀환 전면 차단
    if (p.jailed && ['fastTravel', 'escapeCave', 'goHome', 'warp', 'enter', 'invite', 'acceptInvite', 'sleep', 'debugDay'].includes(a.kind)) {
      return { ok: false, reason: 'jailed' };
    }
    if (!p.look && a.kind !== 'setLook') return { ok: false, reason: 'no-character' };
    // 농사 관련 행동은 농장 맵에서만
    if (['ship', 'chop', 'pull', 'place', 'hammer'].includes(a.kind) && p.map !== 'farm') return { ok: false, reason: 'wrong-map' };
    if (['useTool', 'plant', 'harvest'].includes(a.kind) && !this.isField(p.map)) return { ok: false, reason: 'wrong-map' };
    // 배틀 중에는 배틀 행동만
    const battleKinds = ['battleMove', 'battleItem', 'battleSwitch', 'battleRun', 'emote'];
    if (this.battles.has(p.id) && !battleKinds.includes(a.kind)) return { ok: false, reason: 'in-battle' };
    if (a.kind !== 'sleep' && a.kind !== 'emote') p.sleeping = false;
    switch (a.kind) {
      case 'chooseStarter': return this.chooseStarter(p, a.species);
      case 'setPartner': return this.setPartner(p, a.index);
      case 'heal': {
        if (p.map !== 'in_center' && p.map !== 'in_lab' && !isHomeMap(p.map)) return { ok: false, reason: 'no-heal-spot' };
        healAll(p.party); this.emitParty(p); return { ok: true };
      }
      case 'partySwap': return this.partySwap(p, a.a, a.b);
      case 'boxSwap': return this.boxSwap(p, a.partyIndex, a.boxIndex);
      case 'boxDeposit': return this.boxDeposit(p, a.partyIndex);
      case 'boxWithdraw': return this.boxWithdraw(p, a.boxIndex);
      case 'boxRelease': return this.boxRelease(p, a.boxIndex);
      case 'useBagItem': return this.useBagItem(p, a.itemId, a.partyIndex);
      case 'fastTravel': return this.fastTravel(p, a.to);
      case 'escapeCave': return this.escapeCave(p);
      case 'casinoBet': return this.casinoBet(p, a.game, a.bet, a.pick);
      case 'encounter': return this.encounter(p);
      case 'trainer': return this.trainerBattle(p, a.trainerId);
      case 'battleMove': return this.battleStep(p, (st) => this.engine.move(p, st, a.index));
      case 'battleSwitch': return this.battleStep(p, (st) => this.engine.switchTo(p, st, a.index));
      case 'battleRun': return this.battleStep(p, (st) => this.engine.run(p, st));
      case 'battleItem': {
        const st = this.battles.get(p.id); if (!st) return { ok: false, reason: 'no-battle' };
        const r = this.engine.item(p, st, a.itemId);
        if (!r.ok) return { ok: false, reason: r.reason };
        return this.afterBattle(p, st, r.update);
      }
      case 'fish': return this.fish(p, a.tx, a.ty);
      case 'mine': return this.mine(p, a.objectId);
      case 'forage': return this.pickForage(p, a.key);
      case 'buy': return this.buy(p, a.shop, a.itemId, a.qty);
      case 'sell': return this.sell(p, a.shop, a.slot, a.qty);
      case 'eat': return this.eat(p, a.slot);
      case 'useTool': return this.useTool(p, a.slot, a.tx, a.ty);
      case 'plant': return this.plant(p, a.slot, a.tx, a.ty);
      case 'harvest': return this.harvest(p, a.tx, a.ty);
      case 'ship': return this.ship(p, a.slot);
      case 'chop': return this.chop(p, a.objectId);
      case 'sleep': return this.sleep(p);
      case 'legend': return this.legendBattle(p);
      case 'ocarina': return this.ocarinaBattle(p);
      case 'stella': return this.stellaBattle(p);
      case 'flute': return this.flute(p, String(a.at));
      case 'talk': return this.talk(p, a.npc);
      case 'ask': return this.askDone(p, a.npc);
      case 'collect': return this.collect(p, a.map);
      case 'loot': return this.loot(p, a.objectId);
      case 'rematch': return this.masterRematch(p);
      case 'debugDay': if (this.players.size > 1) return { ok: false, reason: 'multi' }; this.newDay(false); return { ok: true };
      case 'pull': return this.pull(p, a.objectId);
      case 'place': return this.place(p, a.slot, a.tx, a.ty);
      case 'hammer': return this.hammer(p, a.tx, a.ty);
      case 'warp': return this.warp(p, a.index);
      case 'enter': return this.enter(p, a.objectId);
      case 'invite': return this.invite(p, a.to, a.where);
      case 'acceptInvite': return this.acceptInvite(p, a.from);
      case 'setLook': return this.setLook(p, a.look, a.name);
      case 'emote': if (!Number.isInteger(a.id) || a.id < 0 || a.id > 7) return { ok: false }; this.emit({ type: 'emote', playerId: p.id, room: this.room(p), emote: a.id }); return { ok: true };
      case 'serve': return this.serve(p, a.slot);
      case 'eatDish': return this.eatDish(p);
      case 'story': return this.storyStep(p, a.step);
      case 'event': return this.storyEvent(p, a.id);
      case 'epilogue': return this.epilogue(p);
      case 'skill': return this.useSkill(p, a.objectId);
      case 'rivalBattle': return this.rivalBattle(p);
      case 'craft': return this.craft(p, a.recipe, a.times ?? 1);
      case 'learn': return this.learn(p, a.npc);
      case 'bmDeliver': return this.multiplayer ? { ok: false, reason: 'server-confirm' } : this.deliverBmOrder(p.id, a.productId, a.orderId, a.provider ?? 'web-card', { admin: p.isAdmin, deductCash: !!a.useCash });
      case 'bmClaimMail': return this.bmClaimMail(p, a.giftId);
      case 'equipCosmetic': return this.equipCosmetic(p, a.category, a.itemId);
      case 'changeName': return this.changeName(p, a.name);
      case 'useCandy': return this.useCandy(p, a.partyIndex);
      case 'resetSave': return this.resetSave(p);
      case 'goHome': { p.world = p.homeWorld; const h = this.homeSpot(); this.relocate(p, 'farm', p.id, h.x, h.y); return { ok: true }; }
      case 'pad': return this.usePad(p, a.objectId);
      case 'switch': return this.triggerSwitch(p, a.gateId);
      case 'gymClear': return this.gymClear(p, a.gateId, a.objectId);
      case 'gymReset': return this.gymReset(p, a.group);
      case 'gymWater': return this.setGymWater(p, a.level);
      case 'gymPush': return this.pushGymBlock(p, a.objectId, a.dx, a.dy);
      case 'gymFall': return this.gymFall(p, a.toX, a.toY);
      case 'toggleBike': return this.toggleBike(p, a.force);
      case 'toggleSurf': return this.toggleSurf(p, a.on, a.tx, a.ty);
      case 'tideSeal': return this.activateTideSeal(p, a.objectId);
      case 'seaLegend': return this.seaLegendBattle(p);
      case 'prisonMine': return this.prisonMine(p, a.objectId);
      case 'prisonBreakWall': return this.prisonBreakWall(p, a.objectId);
      case 'prisonAscend': return this.prisonAscend(p, a.to);
      case 'prisonEnterYard': return this.prisonEnterYard(p);
      case 'prisonBackCell': return this.prisonBackCell(p);
      case 'yardGather': return this.yardGather(p, a.objectId, a.resource);
      case 'yardCraft': return this.yardCraft(p, a.out, a.qty);
      case 'yardDeliver': return this.yardDeliver(p);
      case 'prisonCaught': return this.prisonCaught(p);
      case 'prisonEscape': return this.prisonEscape(p);
      case 'completeHomecoming': return this.completeHomecoming(p);
      case 'goodDeed': return this.goodDeed(p, a.npc);
      case 'claimDexMilestone': return this.claimDexMilestone(p, a.milestoneId);
      case 'setHungerMode': return this.setHungerMode(p, a.off);
    }
    return { ok: false, reason: 'unknown' };
  }

  private inReach(p: PlayerState, tx: number, ty: number) {
    const T = this.map.tile;
    const px = p.x / T, py = (p.y - 4) / T;
    return Math.hypot(tx + 0.5 - px, ty + 0.5 - py) <= REACH + 0.5;
  }
  /** 에너지 게이지는 없앴음: 도구는 에너지를 쓰지 않고 언제든 쓸 수 있음 (저장 호환을 위해 energy 값은 그대로 둠) */
  private spend(_p: PlayerState, _cost: number) { return true; }
  private changed(p: PlayerState) { this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory }); }
  private setGold(p: PlayerState, delta: number) { p.gold += delta; this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta }); }

  // ── 이동: 워프 / 건물 출입 / 초대 ───────────────────
  private warp(p: PlayerState, index: number): ActionResult {
    const m = this.maps[p.map]; const w = m.warps[index];
    if (!w || Math.abs(p.x - (w.x + w.w / 2)) > w.w / 2 + 24 || Math.abs(p.y - (w.y + w.h / 2)) > w.h / 2 + 28) return { ok: false, reason: 'far' };
    if (w.to === '@exit') {
      const r = p.ret;
      if (r && this.maps[r.map]) this.relocate(p, r.map, r.map === 'farm' && !this.players.has(r.inst) ? p.id : r.inst, r.x, r.y);
      else { const h = this.homeSpot(); this.relocate(p, 'farm', p.id, h.x, h.y); }
      return { ok: true };
    }
    const to = w.to as MapId;
    if (!this.maps[to]) return { ok: false, reason: 'no-map' };
    if ((to === 'route1' || to === 'route31') && (!p.party.length || p.story < STORY.DONE)) return { ok: false, reason: 'need-partner' };
    if (to === 'ocean_shrine' && !p.badges.includes('badge_water') && !p.isAdmin) return { ok: false, reason: 'need-surf' };
    if ((BADGE_GATES[to] ?? 0) > p.badges.length) return { ok: false, reason: `need-badges:${BADGE_GATES[to]}` };
    const gw = (p.mode ?? 'story') === 'story' ? gateFor(p, to) : undefined; if (gw) return { ok: false, reason: `event:${gw.id}` };
    const qg = QUESTS.gates[to]; if (qg && !p.flags.includes(qg.flag)) return { ok: false, reason: `gate:${to}` };
    // 집 1층 <-> 2층 다락방 계단 이동 시 집 주인과 귀환 좌표를 그대로 유지
    if ((p.map === 'home' && to === 'home_2f') || (p.map === 'home_2f' && to === 'home')) {
      const savedRet = p.ret;
      this.toSpawn(p, to, p.inst || p.id, w.spawn);
      p.ret = savedRet;
      return { ok: true };
    }
    // 다른 맵에서 농장으로 가면 언제나 '내' 농장
    this.toSpawn(p, to, to === 'farm' ? p.id : '', w.spawn);
    return { ok: true };
  }

  private enter(p: PlayerState, objectId: number): ActionResult {
    if (isInterior(p.map)) return { ok: false, reason: 'inside' };
    const m = this.maps[p.map];
    const o = m.objects.find((ob) => ob.id === objectId);
    const target = o ? String(prop(o, 'interior', '') || INTERIOR_OF[o.type] || '') : '';
    if (!o || !target || !this.maps[target]) return { ok: false, reason: 'no-door' };
    if (target === 'in_casino' && !isCasinoOpen(this.time.minutes)) return { ok: false, reason: 'casino-closed' };
    if ((BADGE_GATES[target] ?? 0) > p.badges.length) return { ok: false, reason: `need-badges:${BADGE_GATES[target]}` };
    const ge = (p.mode ?? 'story') === 'story' ? gateFor(p, target) : undefined; if (ge) return { ok: false, reason: `event:${ge.id}` };
    const qg = QUESTS.gates[target]; if (qg && !p.flags.includes(qg.flag)) return { ok: false, reason: `gate:${target}` };
    const T = m.tile;
    const cellX = Number(prop(o, 'cellX', 0)), cellY = Number(prop(o, 'cellY', 0)), cellW = Number(prop(o, 'cellW', 1));
    const doorX = Number(prop(o, 'doorCellX', cellX + Math.floor(cellW / 2)));
    const dx = doorX * T + 8, dy = (cellY + 1) * T + 13;
    if (Math.abs(p.x - dx) > T * 1.6 || Math.abs(p.y - dy) > T * 1.6) return { ok: false, reason: 'far' };
    // 내 집은 '지금 있는 농장의 주인' 집 (친구 농장에 놀러 왔으면 친구 집)
    // 이름 붙은 실내(도장·리그·탑 …)는 한 곳뿐이라 모두 같은 방, 공용 실내(센터·마트·이웃집)는 건물마다 따로
    const inst = target === 'home' ? p.inst || p.id : prop(o, 'interior', '') ? '' : `${p.map}:${o.id}`;
    const ret = { map: p.map, inst: p.inst, x: dx, y: dy };
    const s = this.maps[target].spawns.get('entry') ?? this.maps[target].spawns.get('player')!;
    this.relocate(p, target, inst, s.x, s.y + 5);
    p.ret = ret;
    return { ok: true };
  }

  private invite(p: PlayerState, to: string, where: 'farm' | 'home'): ActionResult {
    const t = this.players.get(to);
    if (!t || t.id === p.id || (where !== 'farm' && where !== 'home')) return { ok: false, reason: 'no-target' };
    if (p.mode === 'story' || t.mode === 'story') return { ok: false, reason: 'story-mode' };   // 스토리 모드는 혼자
    let box = this.invites.get(to); if (!box) { box = new Map(); this.invites.set(to, box); }
    box.set(p.id, { where, t: Date.now() });
    this.emit({ type: 'invite', to, from: p.id, fromName: p.name, where });
    this.emit({ type: 'toast', playerId: p.id, text: `${t.name}님에게 ${where === 'farm' ? '농장' : '집'} 초대장을 보냈어요!`, icon: 'heart' });
    return { ok: true };
  }
  private acceptInvite(p: PlayerState, from: string): ActionResult {
    const inv = this.invites.get(p.id)?.get(from);
    const host = this.players.get(from);
    if (!inv || !host || Date.now() - inv.t > INVITE_TTL) return { ok: false, reason: 'expired' };
    if (p.mode === 'story') return { ok: false, reason: 'story-mode' };
    this.invites.get(p.id)!.delete(from);
    this.ensureFarm(host.id);
    p.world = host.world;   // 친구의 세계로 함께 이동 (친구들만 모드면 그 친구 세계의 마을에서도 함께)
    if (inv.where === 'home') {
      const s = this.maps.home.spawns.get('entry')!;
      const door = this.homeDoor();
      this.relocate(p, 'home', host.id, s.x, s.y + 5);
      p.ret = { map: 'farm', inst: host.id, x: door.x, y: door.y };
    } else {
      const h = this.homeSpot();
      this.relocate(p, 'farm', host.id, h.x + 18, h.y + 6);
    }
    this.emit({ type: 'toast', playerId: host.id, text: `${p.name}님이 놀러 왔어요!`, icon: 'heart' });
    return { ok: true };
  }
  private homeDoor() {
    const o = this.map.objects.find((ob) => ob.type === 'house');
    const T = this.map.tile;
    if (!o) return this.homeSpot();
    return { x: Number(prop(o, 'doorCellX', 23)) * T + 8, y: (Number(prop(o, 'cellY', 11)) + 1) * T + 13 };
  }

  private setLook(p: PlayerState, look: string, name?: string): ActionResult {
    if (!isValidPlayerLook(look, p.ownedOutfits)) return { ok: false, reason: 'bad-look' };
    const first = !p.look;
    if (!first && !(isHomeMap(p.map) && p.inst === p.id)) return { ok: false, reason: 'not-home' };
    p.look = look;
    if (first && name !== undefined) {
      const n = String(name).replace(/[<>]/g, '').trim().slice(0, 10);
      if (n) p.name = this.uniqueName(n, p.id);
    }
    this.emit({ type: 'look', id: p.id, look: p.look, name: p.name });
    return { ok: true };
  }

  /** 고속 자전거 탑승 · 하차 전환 (실내·동굴 불가, 자전거 소지 시 가능) */
  private toggleBike(p: PlayerState, force?: boolean): ActionResult {
    if (this.battles.has(p.id)) return { ok: false, reason: 'battle' };
    const want = force ?? !p.riding;
    if (want) {
      if (isInterior(p.map) || this.maps[p.map]?.props.cave) {
        if (!force) this.emit({ type: 'toast', playerId: p.id, text: '실내나 동굴에서는 자전거를 탈 수 없어요!', icon: 'bicycle' });
        return { ok: false, reason: 'indoor' };
      }
      if (this.countItem(p, 'bicycle') < 1) {
        if (!force) this.emit({ type: 'toast', playerId: p.id, text: '아직 자전거가 없어요! (안개 마을 · 빛누리 시티 주민 또는 중반 챕터 보상)', icon: 'bicycle' });
        return { ok: false, reason: 'no-bike' };
      }
      if (p.riding) return { ok: true, data: { qty: 1 } };
      p.riding = true;
      this.emit({ type: 'bike', id: p.id, riding: true });
      return { ok: true, data: { qty: 1 } };
    }
    if (!p.riding) return { ok: true, data: { qty: 0 } };
    p.riding = false;
    this.emit({ type: 'bike', id: p.id, riding: false });
    return { ok: true, data: { qty: 0 } };
  }

  /** 파도타기 탑승 · 하차 전환 (물결 배지 소지 또는 관리자, 실내/동굴 불가) */
  private toggleSurf(p: PlayerState, on?: boolean, tx?: number, ty?: number): ActionResult {
    if (this.battles.has(p.id)) return { ok: false, reason: 'battle' };
    const want = on ?? !p.surfing;
    const m = this.maps[p.map];
    if (!m) return { ok: false, reason: 'no-map' };
    if (want) {
      if (isInterior(p.map) || m.props.cave === 'true') return { ok: false, reason: 'indoor' };
      if (!p.badges.includes('badge_water') && !p.isAdmin) {
        return { ok: false, reason: 'need-surf' };
      }
      if (p.riding) { p.riding = false; this.emit({ type: 'bike', id: p.id, riding: false }); }
      p.surfing = true;
      if (tx != null && ty != null && m.isOpenWater(tx, ty)) {
        const T = m.tile;
        const nx = tx * T + 8, ny = ty * T + 12;
        if (Math.hypot(nx - p.x, ny - p.y) <= T * 2.5) { p.x = nx; p.y = ny; }
      }
      this.emit({ type: 'surf', id: p.id, surfing: true });
      return { ok: true, data: { qty: 1 } };
    }
    if (!p.surfing) return { ok: true, data: { qty: 0 } };
    p.surfing = false;
    this.emit({ type: 'surf', id: p.id, surfing: false });
    return { ok: true, data: { qty: 0 } };
  }

  /** 해신의 바다 조류 비석 활성화 (3개 모두 공명하면 북쪽 소용돌이 장벽 영구 해제) */
  private activateTideSeal(p: PlayerState, objectId: number): ActionResult {
    const m = this.maps[p.map];
    if (!m) return { ok: false, reason: 'no-map' };
    const o = m.objects.find((ob) => ob.id === objectId && ob.type === 'tide_seal');
    if (!o) return { ok: false, reason: 'no-seal' };
    const T = m.tile;
    const cx = Number(oprop(o, 'cellX') ?? 0), cy = Number(oprop(o, 'cellY') ?? 0);
    if (Math.hypot((cx + 0.5) * T - p.x, (cy + 0.5) * T - (p.y - 4)) > T * 2.8) return { ok: false, reason: 'far' };
    const sealIdx = Number(oprop(o, 'sealIdx') ?? 0);
    const gateId = String(oprop(o, 'gateId') ?? 'sea_main');
    const flag = `tide_seal_${sealIdx}`;
    const already = p.flags.includes(flag);
    if (!already) this.addFlag(p, flag);
    const doneCount = [0, 1, 2].filter((k) => p.flags.includes(`tide_seal_${k}`)).length;
    let openedGate = false;
    if (doneCount >= 3) {
      if (!p.flags.includes('sea_shrine_open')) {
        this.addFlag(p, 'sea_shrine_open');
        openedGate = true;
      }
      for (const wp of m.objects) {
        if (wp.type !== 'whirlpool' || String(oprop(wp, 'gateId') ?? '') !== gateId) continue;
        const key = `${p.map}:${wp.id}`;
        if (!p.cleared?.includes(key)) {
          (p.cleared ??= []).push(key);
          this.emit({ type: 'cleared', playerId: p.id, key });
        }
      }
    }
    return { ok: true, anim: 'interact', data: { item: openedGate ? 'opened' : already ? 'already' : 'lit', qty: doneCount } };
  }

  /** 닉네임 변경권(name_ticket)을 1장 사용하여 새 닉네임으로 변경 (중복 시 뒤에 2, 3... 자동 부여) */
  private changeName(p: PlayerState, rawName: string): ActionResult {
    const trimmed = String(rawName ?? '').replace(/[<>]/g, '').trim().slice(0, 10);
    if (!trimmed) {
      this.emit({ type: 'toast', playerId: p.id, text: '변경할 새 닉네임을 입력해 주세요!', icon: 'name_ticket' });
      return { ok: false, reason: 'empty-name' };
    }
    if (trimmed === p.name) {
      this.emit({ type: 'toast', playerId: p.id, text: '현재 사용 중인 닉네임과 같아요. 다른 이름을 입력해 주세요!', icon: 'name_ticket' });
      return { ok: false, reason: 'same-name' };
    }
    if (this.countItem(p, 'name_ticket') < 1) {
      this.emit({ type: 'toast', playerId: p.id, text: '닉네임 변경권이 없어요. 상점(아이템 탭)에서 구매해 주세요!', icon: 'name_ticket' });
      return { ok: false, reason: 'no-ticket' };
    }
    this.takeItem(p, 'name_ticket', 1);
    p.name = this.uniqueName(trimmed, p.id);
    this.changed(p);
    this.emit({ type: 'look', id: p.id, look: p.look, name: p.name });
    this.emit({ type: 'toast', playerId: p.id, text: `닉네임이 '${p.name}'(으)로 변경되었어요!`, icon: 'name_ticket' });
    return { ok: true, data: { item: p.name, qty: 1 } };
  }

  /** 별빛 사탕(star_candy)을 1개 사용하여 지정한 파티 루미 레벨 +1 상승 (최대 Lv.100, 기술 습득·진화 반영) */
  private useCandy(p: PlayerState, partyIndex: number): ActionResult {
    if (this.countItem(p, 'star_candy') < 1) {
      this.emit({ type: 'toast', playerId: p.id, text: '별빛 사탕이 없어요. 상점(아이템 탭)에서 구매해 주세요!', icon: 'star_candy' });
      return { ok: false, reason: 'no-candy' };
    }
    const c = p.party[partyIndex];
    if (!c) {
      this.emit({ type: 'toast', playerId: p.id, text: '레벨을 올릴 루미가 아직 없어요!', icon: 'lumi' });
      return { ok: false, reason: 'no-lumi' };
    }
    if (c.level >= MAX_LEVEL) {
      this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[c.species].name}은(는) 이미 최고 레벨(Lv.${MAX_LEVEL})이에요!`, icon: 'star_candy' });
      return { ok: false, reason: 'max-level' };
    }
    this.takeItem(p, 'star_candy', 1);
    const beforeMax = stats(c).maxHp;
    c.level += 1;
    c.exp = 0;
    c.hp = Math.min(stats(c).maxHp, Math.max(1, c.hp) + (stats(c).maxHp - beforeMax));
    const learnedNames: string[] = [];
    const learn = SPECIES[c.species].learnset.filter(([lv]) => lv === c.level).map(([, m]) => m);
    for (const mv of learn) {
      if (!c.moves.includes(mv) && MOVES[mv]) {
        const before = { moves: [...c.moves], pp: c.pp ? [...c.pp] : undefined };
        if (c.moves.length >= 4) c.moves.shift();
        c.moves.push(mv);
        syncPp(c, before);
        learnedNames.push(MOVES[mv].name);
      }
    }
    let evoMsg = '';
    const evo = SPECIES[c.species].evolves;
    if (evo && c.level >= evo.level && SPECIES[evo.to]) {
      const from = SPECIES[c.species].name;
      const beforeEvo = stats(c).maxHp;
      c.species = evo.to;
      c.hp = Math.min(stats(c).maxHp, c.hp + (stats(c).maxHp - beforeEvo));
      if (!p.seen.includes(evo.to)) p.seen.push(evo.to);
      if (!p.caught.includes(evo.to)) p.caught.push(evo.to);
      evoMsg = ` ✨ ${from}이(가) ${SPECIES[evo.to].name}(으)로 진화했어요!`;
    }
    const moveMsg = learnedNames.length ? ` (새 기술: ${learnedNames.join(', ')})` : '';
    this.changed(p);
    this.emitParty(p);
    this.emit({
      type: 'toast',
      playerId: p.id,
      text: `별빛 사탕 사용! ${SPECIES[c.species].name}의 레벨이 Lv.${c.level}(으)로 올랐어요!${moveMsg}${evoMsg}`,
      icon: 'star_candy',
    });
    return { ok: true, data: { item: c.species, qty: c.level } };
  }

  private sleep(p: PlayerState): ActionResult {
    p.sleeping = true;
    const all = [...this.players.values()];
    const ready = all.filter((x) => x.sleeping).length;
    if (ready >= all.length) { this.newDay(); return { ok: true }; }
    this.emit({ type: 'sleep', ready, total: all.length });
    return { ok: true, reason: 'waiting' };
  }

  // ── 프롤로그 ───────────────────────────────────────
  private setStory(p: PlayerState, v: number) { p.story = v; this.emit({ type: 'story', id: p.id, story: v }); }
  /** 연출은 클라이언트, 단계와 조건 검증은 여기서 */
  private storyStep(p: PlayerState, step: number): ActionResult {
    const need: Record<number, (q: PlayerState) => boolean> = {
      [STORY.RACE]: (q) => q.story === STORY.HOME,
      [STORY.PHONE]: (q) => (q.story === STORY.RACE || q.story === STORY.HOME) && q.map === 'town',
      [STORY.MEET]: (q) => (q.story === STORY.PHONE || q.story === STORY.RACE) && q.map === 'town',
      [STORY.HALL]: (q) => (q.story === STORY.MEET || q.story === STORY.PHONE || q.story === STORY.RACE) && q.map === 'in_lab',
    };
    if (!need[step]?.(p)) return { ok: false, reason: 'story' };
    this.setStory(p, step);
    return { ok: true };
  }
  /** 본편 사건 (chapters.json): 장소 · 순서 검증 → 승부가 있으면 시작, 없으면 바로 완료 */
  private storyEvent(p: PlayerState, id: string): ActionResult {
    if ((p.mode ?? 'story') !== 'story') return { ok: false, reason: 'multi' };
    const ev = EVENTS[id];
    if (!ev || p.flags.includes(id)) return { ok: false, reason: 'done' };
    if (nextEvent(p)?.id !== id) return { ok: false, reason: 'story' };
    if (!ev.battle) { this.finishEvent(p, id); return { ok: true }; }
    if (!this.canBattle(p)) return { ok: false, reason: 'no-lumi' };
    const b = ev.battle, cast = CHAPTERS.cast[b.cast] ?? { name: '???', sprite: 'villager' };
    const rv = rivalOf(p.look), starter = RIVAL_PICK[p.caught.find((s) => ENCOUNTERS.starters.includes(s)) ?? ''] ?? 'kongkong';
    const team = b.team.map(([sp, lv]) => [grownAt(sp === '@starter' ? starter : sp, lv), lv] as [string, number]);
    const def: TrainerDef = {
      id: `ev_${id}`, name: b.rival ? rv.name : cast.name, title: b.rival ? '소꿉친구' : cast.title ?? '', sprite: b.rival ? rv.look : cast.sprite,
      map: p.map, sight: 0, team, reward: b.reward, intro: [], defeat: [], after: [],
    };
    const { state, update } = this.engine.startTrainer(p, def, undefined, this.maps[p.map].props.battleBg ?? (isInterior(p.map) ? 'town' : undefined));
    state.eventId = id;
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }
  /** 엔딩 뒤 에필로그: 내 농장 집 문 바로 앞 (한 칸 아래)으로 */
  private epilogue(p: PlayerState): ActionResult {
    if (!p.flags.includes('ending')) return { ok: false, reason: 'story' };
    const house = this.maps.farm.objects.find((o) => o.type === 'house');
    const dx = Number(prop(house ?? {} as never, 'doorCellX', 23)), cy = Number(prop(house ?? {} as never, 'cellY', 11));
    p.world = p.homeWorld;
    this.relocate(p, 'farm', p.id, dx * 16 + 8, (cy + 2) * 16 + 13);
    p.dir = 'up';
    return { ok: true };
  }
  /** 비전 기술: 배지가 있으면 장애물을 치움 (나에게만, 이 맵에 있는 동안). 바위 부수기는 가끔 광석이 나옴 */
  private useSkill(p: PlayerState, objectId: number): ActionResult {
    const m = this.maps[p.map], o = m.objects.find((ob) => ob.id === objectId);
    const id = o ? skillFor(o.type) : undefined, sk = id ? SKILLS[id] : undefined;
    if (!o || !sk) return { ok: false, reason: 'no-obstacle' };
    const key = `${p.map}:${objectId}`;
    if (p.cleared?.includes(key)) return { ok: false, reason: 'cleared' };
    if (!p.badges.includes(sk.badge)) return { ok: false, reason: `need:${id}` };
    if (!p.party.length) return { ok: false, reason: 'no-lumi' };
    const T = m.tile; if (Math.hypot(o.x / T - p.x / T, o.y / T - 0.5 - (p.y - 4) / T) > 2.4) return { ok: false, reason: 'far' };
    (p.cleared ??= []).push(key);
    this.emit({ type: 'cleared', playerId: p.id, key });
    if (sk.drops) for (const [item, chance] of sk.drops) if (this.rand() * 100 < chance) { if (this.addItem(p, item, 1)) { this.changed(p); this.emit({ type: 'toast', playerId: p.id, text: `부서진 바위에서 ${ITEMS[item].name}을(를) 찾았다!`, icon: item }); } break; }
    return { ok: true, anim: 'interact' };
  }
  private usePad(p: PlayerState, objectId: number): ActionResult {
    const m = this.maps[p.map];
    const o = m.objects.find((ob) => ob.id === objectId && ob.type === 'warp_pad');
    if (!o) return { ok: false, reason: 'no-pad' };
    const T = m.tile;
    const cx = Number(oprop(o, 'cellX') ?? -1), cy = Number(oprop(o, 'cellY') ?? -1);
    if (cx < 0 || Math.hypot(cx * T + 8 - p.x, cy * T + 12 - p.y) > T * 2.4) return { ok: false, reason: 'far' };
    const toX = Number(oprop(o, 'toX') ?? cx), toY = Number(oprop(o, 'toY') ?? cy);
    const nx = toX * T + 8, ny = toY * T + 13;
    if (!this.canStand(p, nx, ny)) return { ok: false, reason: 'blocked' };
    p.x = nx; p.y = ny;
    return { ok: true };
  }
  private triggerSwitch(p: PlayerState, gateId: string): ActionResult {
    const m = this.maps[p.map];
    const T = m.tile;
    const btn = m.objects.find((o) => o.type === 'switch_btn' && String(oprop(o, 'gateId') ?? '') === gateId
      && Math.hypot(Number(oprop(o, 'cellX') ?? -99) * T + 8 - p.x, Number(oprop(o, 'cellY') ?? -99) * T + 12 - p.y) <= T * 2.4);
    if (!btn) return { ok: false, reason: 'far' };
    let openedAny = false;
    for (const o of m.objects) {
      if (o.type !== 'gate_bar' || String(oprop(o, 'gateId') ?? '') !== gateId) continue;
      const key = `${p.map}:${o.id}`;
      if (!p.cleared?.includes(key)) {
        (p.cleared ??= []).push(key);
        this.emit({ type: 'cleared', playerId: p.id, key });
        openedAny = true;
      }
    }
    return { ok: true, anim: 'interact', data: openedAny ? { item: gateId } : undefined };
  }
  /** 체육관 미니게임 완료 시 관문(gate_bar) 해제 또는 빙판 눈덩이(snowball) 파괴 */
  private gymClear(p: PlayerState, gateId?: string, objectId?: number): ActionResult {
    const m = this.maps[p.map];
    if (!m) return { ok: false, reason: 'no-map' };
    let changed = false;
    if (objectId != null) {
      const o = m.objects.find((ob) => ob.id === objectId && ob.type === 'snowball');
      if (!o) return { ok: false, reason: 'no-snowball' };
      const T = m.tile;
      if (Math.hypot(Number(oprop(o, 'cellX') ?? -99) * T + 8 - p.x, Number(oprop(o, 'cellY') ?? -99) * T + 12 - p.y) > T * 3.5) {
        return { ok: false, reason: 'far' };
      }
      const key = `${p.map}:${o.id}`;
      if (!p.cleared?.includes(key)) { (p.cleared ??= []).push(key); this.emit({ type: 'cleared', playerId: p.id, key }); changed = true; }
    }
    if (gateId) {
      for (const o of m.objects) {
        if (o.type !== 'gate_bar' || String(oprop(o, 'gateId') ?? '') !== gateId) continue;
        const key = `${p.map}:${o.id}`;
        if (!p.cleared?.includes(key)) { (p.cleared ??= []).push(key); this.emit({ type: 'cleared', playerId: p.id, key }); changed = true; }
      }
    }
    return { ok: true, data: changed ? { item: gateId ?? String(objectId ?? '') } : undefined };
  }
  /** 플레이어별 쇳불 도장 밀기 블록 상태 초기화/조회 */
  private blocksOf(p: PlayerState, mapId: MapId = p.map) {
    const info = this.maps[mapId];
    if (!info?.pushBlocks.length) return null;
    let map = this.gymBlocks.get(p.id);
    if (!map) {
      map = new Map();
      for (const b of info.pushBlocks) {
        map.set(b.id, { x: b.x, y: b.y, group: b.group, gateId: b.gateId, locked: false });
      }
      this.gymBlocks.set(p.id, map);
    }
    return map;
  }
  /** 체육관 눈덩이 / 밀기 블록 초기화 */
  private gymReset(p: PlayerState, group?: string): ActionResult {
    const m = this.maps[p.map];
    if (!m) return { ok: false, reason: 'no-map' };
    const snowIds = new Set(m.objects.filter((o) => o.type === 'snowball').map((o) => `${p.map}:${o.id}`));
    const back = (p.cleared ?? []).filter((k) => snowIds.has(k));
    if (back.length) {
      p.cleared = (p.cleared ?? []).filter((k) => !snowIds.has(k));
      this.emit({ type: 'objectRestored', keys: back, playerId: p.id });
    }
    const blks = this.blocksOf(p);
    if (blks) {
      for (const orig of m.pushBlocks) {
        if (group && orig.group !== group) continue;
        // 이미 게이트가 열린 그룹은 그대로 유지
        const gateDone = m.objects.some((o) => o.type === 'gate_bar' && String(oprop(o, 'gateId') ?? '') === orig.gateId && p.cleared?.includes(`${p.map}:${o.id}`));
        if (gateDone) continue;
        blks.set(orig.id, { x: orig.x, y: orig.y, group: orig.group, gateId: orig.gateId, locked: false });
      }
    }
    return { ok: true };
  }
  /** 물결항 도장 (들판식): 3단계 수위(0/1/2) 전환 */
  private setGymWater(p: PlayerState, level: number): ActionResult {
    const m = this.maps[p.map];
    if (!m) return { ok: false, reason: 'no-map' };
    const lv = Math.max(0, Math.min(2, Math.floor(level)));
    const T = m.tile;
    const sw = m.objects.find((o) => o.type === 'water_switch' && Number(oprop(o, 'level') ?? 0) === lv
      && Math.hypot(Number(oprop(o, 'cellX') ?? -99) * T + 8 - p.x, Number(oprop(o, 'cellY') ?? -99) * T + 12 - p.y) <= T * 2.8);
    if (!sw) return { ok: false, reason: 'far' };
    this.gymWater.set(p.id, lv);
    return { ok: true, data: { qty: lv } };
  }
  /** 쇳불 도장 (장막/검은먹식): 밀기 블록 1칸 이동 + 슬롯 안착 시 관문 해제 */
  private pushGymBlock(p: PlayerState, objectId: number, dx: number, dy: number): ActionResult {
    const m = this.maps[p.map];
    if (!m) return { ok: false, reason: 'no-map' };
    if (Math.abs(dx) + Math.abs(dy) !== 1) return { ok: false, reason: 'dir' };
    const blks = this.blocksOf(p);
    const b = blks?.get(objectId);
    if (!b || b.locked) return { ok: false, reason: 'no-block' };
    const T = m.tile;
    if (Math.hypot(b.x * T + 8 - p.x, b.y * T + 12 - p.y) > T * 2.5) return { ok: false, reason: 'far' };
    const nx = b.x + dx, ny = b.y + dy;
    if (!m.inBounds(nx, ny)) return { ok: false, reason: 'blocked' };
    if (this.blockedAt(p.map, null, nx, ny, p)) return { ok: false, reason: 'blocked' };
    // 이미 다른 블록이 차지한 칸은 못 밀어 넣음
    for (const [oid, ob] of blks!) {
      if (oid !== objectId && !ob.locked && ob.x === nx && ob.y === ny) return { ok: false, reason: 'blocked' };
    }
    // 트레이너 자리 방지
    for (const sp of m.spawnList) {
      if (!sp.name.startsWith('trainer:')) continue;
      if (Math.floor(sp.x / T) === nx && Math.floor(sp.y / T) === ny) return { ok: false, reason: 'blocked' };
    }
    b.x = nx; b.y = ny;
    // 정통 소코반 규칙: 슬롯에 올린 블록도 완료 전에는 다시 밀어 재배치 가능, 모든 슬롯이 동시에 채워지면 그룹 전체 확정 잠금 + 관문 개방!
    const onSlot = !!m.blockSlotAt(nx, ny) && m.blockSlotAt(nx, ny)!.group === b.group;
    const needSlots = [...m.blockSlots.entries()].filter(([, s]) => s.gateId === b.gateId);
    const allFilled = needSlots.length > 0 && needSlots.every(([idx]) => {
      const sx = idx % m.width, sy = Math.floor(idx / m.width);
      return [...blks!.values()].some((ob) => ob.group === b.group && ob.x === sx && ob.y === sy);
    });
    let unlocked = false;
    if (allFilled) {
      for (const ob of blks!.values()) if (ob.group === b.group) ob.locked = true;
      for (const o of m.objects) {
        if (o.type !== 'gate_bar' || String(oprop(o, 'gateId') ?? '') !== b.gateId) continue;
        const key = `${p.map}:${o.id}`;
        if (!p.cleared?.includes(key)) {
          (p.cleared ??= []).push(key);
          this.emit({ type: 'cleared', playerId: p.id, key });
          unlocked = true;
        }
      }
    }
    return { ok: true, anim: 'interact', data: { item: allFilled ? 'complete' : onSlot ? 'onSlot' : 'moved', qty: unlocked ? 1 : 0 } };
  }
  /** 잿빛 도장 (루네식/홍련식): 금 간 화산판 추락 또는 퀴즈 오답 함정 이동 */
  private gymFall(p: PlayerState, toX: number, toY: number): ActionResult {
    const m = this.maps[p.map];
    if (!m) return { ok: false, reason: 'no-map' };
    const T = m.tile;
    const nearTrap = m.objects.some((o) =>
      ((o.type === 'cracked_tile' && Number(oprop(o, 'fallX') ?? -1) === toX && Number(oprop(o, 'fallY') ?? -1) === toY)
        || (o.type === 'quiz_pad' && Number(oprop(o, 'failX') ?? -1) === toX && Number(oprop(o, 'failY') ?? -1) === toY))
      && Math.hypot(Number(oprop(o, 'cellX') ?? -99) * T + 8 - p.x, Number(oprop(o, 'cellY') ?? -99) * T + 12 - p.y) <= T * 3.0);
    if (!nearTrap) return { ok: false, reason: 'far' };
    const nx = toX * T + 8, ny = toY * T + 13;
    if (!this.canStand(p, nx, ny)) return { ok: false, reason: 'blocked' };
    p.x = nx; p.y = ny;
    return { ok: true };
  }
  private finishEvent(p: PlayerState, id: string) {
    if (p.flags.includes(id)) return;
    p.flags.push(id);
    for (const [it, n] of Object.entries(EVENTS[id]?.give ?? {})) if (ITEMS[it]) this.addItem(p, it, n);
    this.changed(p); this.emitParty(p);
  }

  private rivalBattle(p: PlayerState): ActionResult {
    if (p.story !== STORY.HALL || !p.party.length || p.map !== 'in_lab') return { ok: false, reason: 'story' };
    healAll(p.party);
    const r = rivalOf(p.look), sp = RIVAL_PICK[p.party[0].species] ?? 'kongkong';
    const def = { id: 'rival', name: r.name, title: '소꿉친구', sprite: r.look, map: 'in_lab' as MapId, sight: 0, team: [[sp, 5]] as [string, number][], reward: 300,
      intro: [], defeat: ['칫, 분하다!', '다음에는 완벽한 승리로 되갚아 주겠어. 기대해도 좋아!'], after: [] };
    const { state, update } = this.engine.startTrainer(p, def, 'rival');
    update.log[0] = { t: 'text', text: `소꿉친구 ${r.name}이(가) 승부를 걸어왔다!` };
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }

  // ── 작업대 제작 (서버 권한: 재료 확인 → 차감 → 결과 지급) ──
  private countItem(p: PlayerState, itemId: string) { return p.inventory.reduce((n, s) => n + (s.itemId === itemId ? s.quantity : 0), 0); }
  private takeItem(p: PlayerState, itemId: string, qty: number) {
    for (const s of p.inventory) {
      if (qty <= 0) break;
      if (s.itemId !== itemId) continue;
      const k = Math.min(qty, s.quantity); s.quantity -= k; qty -= k;
      if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    }
  }
  private craft(p: PlayerState, recipeId: string, times: number): ActionResult {
    const r = RECIPES[recipeId];
    if (!r) return { ok: false, reason: 'no-recipe' };
    syncAutoRecipes(p);
    if (!p.recipes.includes(r.id)) return { ok: false, reason: 'unknown-recipe' };
    times = Math.max(1, Math.min(20, Math.floor(times) || 1));
    for (const [it, n] of Object.entries(r.in)) {
      if (this.countItem(p, it) < n * times) { this.emit({ type: 'toast', playerId: p.id, text: `재료가 부족해요: ${ITEMS[it]?.name ?? it} ${n * times}개 필요` }); return { ok: false, reason: 'materials' }; }
    }
    const out = ITEMS[r.out];
    if (out.type !== 'battle') {
      const free = p.inventory.some((s) => !s.itemId || (s.itemId === r.out && s.quantity + r.qty * times <= out.maxStack));
      if (!free) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    }
    for (const [it, n] of Object.entries(r.in)) this.takeItem(p, it, n * times);
    this.addItem(p, r.out, r.qty * times);
    this.changed(p); this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${out.name} ×${r.qty * times} 완성!`, icon: out.icon });
    return { ok: true, data: { item: r.out, qty: r.qty * times } };
  }
  /** 공방 NPC에게 배울 수 있는 제작법을 모두 배움 (+ 처음 만났을 때 선물) */
  private learn(p: PlayerState, npc: string): ActionResult {
    const learned: string[] = [];
    for (const r of Object.values(RECIPES)) {
      if (r.teacher !== npc || p.recipes.includes(r.id)) continue;
      if (p.badges.length < (r.badges ?? 0)) continue;
      p.recipes.push(r.id); learned.push(r.id);
    }
    const gift = TEACH_GIFTS[npc];
    if (gift && !p.recipes.includes(`gift:${npc}`)) {
      if (this.addItem(p, gift[0], gift[1])) { p.recipes.push(`gift:${npc}`); this.changed(p); this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[gift[0]].name} ×${gift[1]}을(를) 받았어요!`, icon: ITEMS[gift[0]].icon }); }
    }
    if (learned.length) {
      this.emitParty(p);
      this.emit({ type: 'toast', playerId: p.id, text: `새 제작법: ${learned.map((id) => ITEMS[RECIPES[id].out].name).join(', ')}`, icon: ITEMS[RECIPES[learned[0]].out].icon });
    }
    return { ok: true, data: { qty: learned.length } };
  }

  private resetSave(p: PlayerState): ActionResult {
    const name = p.name;
    const world = p.homeWorld;
    const mode = p.mode ?? 'story';
    const wasAdmin = !!p.isAdmin;
    const prevCash = p.cash ?? 0;
    const prevCashOrders = [...(p.cashOrders ?? [])];
    this.removePlayer(p.id);
    const next = this.addPlayer(p.id, name, '', null, world);
    next.mode = mode;
    next.cashOrders = prevCashOrders;
    if (prevCash > 0) next.cash = prevCash;
    if (wasAdmin) this.setAdminProfile(p.id, true);
    else if (prevCash > 0) this.emitBm(next);
    return { ok: true };
  }

  // ── 캐쉬 상점 · PG 캐쉬 충전 · 공유 우편함 배송 ─────
  private emitBm(p: PlayerState) {
    this.emit({
      type: 'bmState', id: p.id,
      mailItems: (p.mailItems ?? []).map((g) => ({ ...g })),
      uiTheme: p.uiTheme ?? 'rural',
      ownedThemes: [...(p.ownedThemes ?? ['rural'])],
      ownedOutfits: [...(p.ownedOutfits ?? [])],
      lumiCoord: p.lumiCoord ?? '',
      ownedLumiCoords: [...(p.ownedLumiCoords ?? [])],
      chatBubble: p.chatBubble ?? 'default',
      ownedBubbles: [...(p.ownedBubbles ?? ['default'])],
      bmOrders: [...(p.bmOrders ?? [])],
      cash: p.cash ?? 0,
      isAdmin: p.isAdmin === true,
    });
  }

  /** 서버가 확인한 관리자 계정 부여 및 전체 상품 테스트 가능 캐쉬 지급 */
  setAdminProfile(playerId: string, isAdmin: boolean) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.isAdmin = isAdmin;
    if (isAdmin) this.ensureAdminCash(p, false);
    this.emitBm(p);
  }

  /** 어드민이 남은 모든 캐쉬 상품을 사고도 남을 만큼의 테스트 캐쉬 확보 */
  ensureAdminCash(p: PlayerState, emit = true) {
    const minNeeded = Math.max(remainingBmCostKrw(p), BM_ALL_TOTAL_KRW);
    if ((p.cash ?? 0) < minNeeded) {
      p.cash = Math.max(ADMIN_DEFAULT_CASH_KRW, minNeeded);
    }
    if (emit) this.emitBm(p);
  }

  /** 어드민 캐쉬 증감 */
  grantCash(p: PlayerState, delta: number) {
    if (!Number.isFinite(delta) || delta === 0) return false;
    p.cash = Math.max(0, Math.round((p.cash ?? 0) + delta));
    this.emitBm(p);
    this.emit({ type: 'toast', playerId: p.id, text: `보유 캐쉬가 ${(p.cash ?? 0).toLocaleString('ko-KR')} 캐쉬가 되었어요.`, icon: 'heart' });
    return true;
  }

  /** 외부 PG(토스/PortOne 등) 결제 완료 후 계정에 캐쉬 지급 (주문 ID 기준 중복 방지) */
  creditCashOrder(playerId: string, orderId: string, cashAmount: number, provider = 'pg'): ActionResult {
    const p = this.players.get(playerId);
    const add = Math.max(0, Math.round(cashAmount));
    if (!p || !add) return { ok: false, reason: 'invalid' };
    const orders = (p.cashOrders ??= []);
    if (orders.includes(orderId)) return { ok: true };
    orders.push(orderId);
    p.cash = Math.max(0, Math.round((p.cash ?? 0) + add));
    this.emitBm(p);
    this.emit({
      type: 'toast',
      playerId: p.id,
      text: `${add.toLocaleString('ko-KR')} 캐쉬가 충전되었어요! (보유 ${p.cash.toLocaleString('ko-KR')} 캐쉬)`,
      icon: 'heart',
    });
    void provider;
    return { ok: true, data: { qty: add } };
  }

  /** 어드민 테스트용: 캐쉬 상점 보유·배송·적용 상태 초기화 */
  resetBmState(p: PlayerState) {
    p.mailItems = [];
    p.ownedThemes = ['rural'];
    p.ownedOutfits = [];
    p.ownedLumiCoords = [];
    p.ownedBubbles = ['default'];
    p.bmOrders = [];
    p.uiTheme = 'rural';
    p.lumiCoord = '';
    p.chatBubble = 'default';
    if (BM_LOOK_IDS.has(p.look)) {
      p.look = 'm1';
      this.emit({ type: 'look', id: p.id, look: p.look, name: p.name });
    }
    if (p.isAdmin) this.ensureAdminCash(p, false);
    this.emitBm(p);
    this.emit({ type: 'toast', playerId: p.id, text: '캐쉬 상점 구매 기록과 우편함을 초기화했어요.', icon: 'mail' });
  }

  /** 카드·캐쉬 결제 승인 후 호출: 해금 조건·중복 주문 검증 뒤 즉시 지급·적용 (우편함 수령 내역에도 기록) */
  deliverBmOrder(
    playerId: string,
    productId: string,
    orderId: string,
    provider = 'web-card',
    opts?: { admin?: boolean; deductCash?: boolean; silentToast?: boolean },
  ): ActionResult {
    const p = this.players.get(playerId);
    const prod = BM_PRODUCT_MAP[productId];
    if (!p || !prod) return { ok: false, reason: 'no-item' };
    const orders = (p.bmOrders ??= []);
    if (orders.includes(orderId)) return { ok: true };
    if (!prod.repeatable) {
      const alreadyOwned =
        (p.ownedThemes?.includes(productId) ?? false) ||
        (p.ownedOutfits?.includes(productId) ?? false) ||
        (p.ownedLumiCoords?.includes(productId) ?? false) ||
        (p.ownedBubbles?.includes(productId) ?? false);
      if (alreadyOwned) return { ok: false, reason: 'already-owned' };
    } else if (ITEMS[prod.id]) {
      const maxStack = ITEMS[prod.id].maxStack ?? 99;
      const hasSlot = p.inventory.some((s) => !s.itemId || (s.itemId === prod.id && s.quantity < maxStack));
      if (!hasSlot) return { ok: false, reason: 'full' };
    }
    const allowBypass = !!(opts?.admin || p.isAdmin);
    const u = isBmUnlocked(prod, p, allowBypass);
    if (!u.unlocked) return { ok: false, reason: 'locked' };
    if (opts?.deductCash) {
      const curCash = p.cash ?? 0;
      if (curCash < prod.priceKrw) return { ok: false, reason: 'no-cash' };
      p.cash = curCash - prod.priceKrw;
    }
    orders.push(orderId);
    const list = (p.mailItems ??= []);
    list.unshift({
      id: `gift_${orderId}`,
      orderId,
      productId: prod.id,
      category: prod.category,
      name: prod.name,
      boughtAt: Date.now(),
      claimed: true,
      provider,
    });

    if (prod.category === 'item') {
      this.addItem(p, prod.id, 1);
      this.changed(p);
    } else if (prod.category === 'theme') {
      const themes = (p.ownedThemes ??= ['rural']);
      if (!themes.includes(prod.id)) themes.push(prod.id);
      if (!opts?.silentToast) p.uiTheme = prod.id;
    } else if (prod.category === 'outfit') {
      const outfits = (p.ownedOutfits ??= []);
      if (!outfits.includes(prod.id)) outfits.push(prod.id);
      if (!opts?.silentToast) {
        p.look = prod.id;
        this.emit({ type: 'look', id: p.id, look: p.look, name: p.name });
      }
    } else if (prod.category === 'lumi') {
      const coords = (p.ownedLumiCoords ??= []);
      if (!coords.includes(prod.id)) coords.push(prod.id);
      if (!opts?.silentToast) p.lumiCoord = prod.id;
    } else if (prod.category === 'bubble') {
      const bubbles = (p.ownedBubbles ??= ['default']);
      if (!bubbles.includes(prod.id)) bubbles.push(prod.id);
      if (!opts?.silentToast) p.chatBubble = prod.id;
    }

    this.emitBm(p);
    if (!opts?.silentToast) {
      const msg = prod.category === 'item'
        ? `${prod.name} 구매 완료! 상점이나 가방에서 바로 사용할 수 있어요.`
        : `${prod.name} 구매 및 즉시 적용 완료!`;
      this.emit({ type: 'toast', playerId: p.id, text: msg, icon: prod.category === 'item' ? prod.id : 'heart' });
    }
    return { ok: true, data: { item: prod.id, qty: 1 } };
  }

  /** 우편함 수령: 시작 농장 또는 아무 마을 텃밭의 우편함에서 동일 목록을 수령해 계정 외형/UI/루미 코디로 지급 */
  private bmClaimMail(p: PlayerState, giftId: string): ActionResult {
    const list = (p.mailItems ??= []);
    const targets = giftId === 'all' ? list.filter((g) => !g.claimed) : list.filter((g) => g.id === giftId && !g.claimed);
    if (!targets.length) return { ok: false, reason: 'empty' };
    const themes = (p.ownedThemes ??= ['rural']);
    const outfits = (p.ownedOutfits ??= []);
    const coords = (p.ownedLumiCoords ??= []);
    const bubbles = (p.ownedBubbles ??= ['default']);
    for (const g of targets) {
      g.claimed = true;
      if (g.category === 'theme' && !themes.includes(g.productId)) themes.push(g.productId);
      else if (g.category === 'outfit' && !outfits.includes(g.productId)) outfits.push(g.productId);
      else if (g.category === 'lumi' && !coords.includes(g.productId)) coords.push(g.productId);
      else if (g.category === 'bubble' && !bubbles.includes(g.productId)) bubbles.push(g.productId);
    }
    this.emitBm(p);
    const msg = targets.length === 1 ? `우편함에서 [${targets[0].name}]을(를) 수령했어요!` : `우편함에서 상점 상품 ${targets.length}개를 모두 수령했어요!`;
    this.emit({ type: 'toast', playerId: p.id, text: msg, icon: 'mail' });
    return { ok: true, data: { qty: targets.length } };
  }

  /** 보유한 UI 디자인 · 캐쉬 의상 · 루미 코디 · 말풍선 스킨 장착 또는 해제 */
  private equipCosmetic(p: PlayerState, category: 'theme' | 'outfit' | 'lumi' | 'bubble', itemId: string): ActionResult {
    if (category === 'theme') {
      const owned = p.ownedThemes ?? ['rural'];
      if (!UI_THEMES[itemId] || (itemId !== 'rural' && !owned.includes(itemId))) return { ok: false, reason: 'not-owned' };
      p.uiTheme = itemId;
      this.emitBm(p);
      this.emit({ type: 'toast', playerId: p.id, text: `${UI_THEMES[itemId].name}이(가) 적용되었어요!`, icon: 'heart' });
      return { ok: true };
    }
    if (category === 'outfit') {
      if (!isValidPlayerLook(itemId, p.ownedOutfits)) return { ok: false, reason: 'not-owned' };
      p.look = itemId;
      this.emit({ type: 'look', id: p.id, look: p.look, name: p.name });
      return { ok: true };
    }
    if (category === 'bubble') {
      const target = itemId || 'default';
      const owned = p.ownedBubbles ?? ['default'];
      if (!CHAT_BUBBLES[target] || (target !== 'default' && !owned.includes(target))) return { ok: false, reason: 'not-owned' };
      p.chatBubble = target;
      this.emitBm(p);
      this.emit({ type: 'toast', playerId: p.id, text: `${CHAT_BUBBLES[target].name}이(가) 적용되었어요!`, icon: 'heart' });
      return { ok: true };
    }
    if (itemId && (!LUMI_COORDS[itemId] || !(p.ownedLumiCoords ?? []).includes(itemId))) return { ok: false, reason: 'not-owned' };
    p.lumiCoord = itemId;
    this.emitBm(p);
    this.emit({ type: 'toast', playerId: p.id, text: itemId ? `${LUMI_COORDS[itemId].name}을(를) 파트너 루미에게 입혔어요!` : '파트너 루미 코디를 해제했어요.', icon: 'lumi' });
    return { ok: true };
  }

  // ── 집 식탁: 같이 밥 먹기 ───────────────────────────
  private serve(p: PlayerState, slot: number): ActionResult {
    if (p.map !== 'home') return { ok: false, reason: 'wrong-map' };
    const f = this.farmOf(p);
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || (item.type !== 'food' && item.type !== 'crop') || item.sellPrice <= 0) return { ok: false, reason: 'not-food' };
    if (f.dish) return { ok: false, reason: 'occupied' };
    s.quantity--; if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    f.dish = { item: item.id, servings: 4, by: p.name };
    this.changed(p);
    this.emit({ type: 'dish', room: this.room(p), dish: f.dish });
    this.emit({ type: 'toast', room: this.room(p), text: `${p.name}님이 식탁에 ${item.name}을(를) 차렸어요! (4인분)`, icon: item.icon });
    return { ok: true, anim: 'interact' };
  }
  private eatDish(p: PlayerState): ActionResult {
    if (p.map !== 'home') return { ok: false, reason: 'wrong-map' };
    const f = this.farmOf(p); const d = f.dish;
    if (!d) return { ok: false, reason: 'empty' };
    const item = ITEMS[d.item];
    const gain = Math.max(15, Math.round((item.energy ?? item.sellPrice * 0.6) * 0.8));
    p.energy = Math.min(p.maxEnergy, p.energy + gain);
    const { healedCount } = consumeFoodItem(p, item);
    d.servings--;
    if (d.servings <= 0) f.dish = null;
    this.changed(p);
    if (healedCount > 0) this.emitParty(p);
    this.emit({ type: 'hunger', playerId: p.id, food: p.food ?? 80, hungerOff: !!p.hungerOff });
    this.emit({ type: 'dish', room: this.room(p), dish: f.dish });
    this.emit({ type: 'emote', playerId: p.id, room: this.room(p), emote: 5 });
    this.emit({ type: 'toast', room: this.room(p), text: `${p.name}님이 ${item.name}을(를) 맛있게 먹었어요!`, icon: 'food_bowl' });
    return { ok: true, anim: 'interact' };
  }

  private recordDex(p: PlayerState, itemId: string, qty = 1) {
    const res = registerLifeDex(p, itemId, qty);
    if (!res) return;
    this.emit({
      type: 'lifeDex',
      playerId: p.id,
      lifeDex: JSON.parse(JSON.stringify(p.lifeDex)),
      lifeDexClaims: [...(p.lifeDexClaims ?? [])],
      added: { id: res.entry.id, cat: res.entry.cat, name: res.entry.name, first: res.first, total: res.total },
    });
    if (res.first) {
      const catKo = res.entry.cat === 'farm' ? '농사 도감' : res.entry.cat === 'mine' ? '채광 도감' : '낚시 도감';
      this.emit({
        type: 'toast',
        playerId: p.id,
        text: `📖 [${catKo} 신규 등록!] ${res.entry.name} (${res.total}/90)`,
        icon: itemId,
      });
    }
  }

  private claimDexMilestone(p: PlayerState, milestoneId: string): ActionResult {
    const check = claimableMilestone(p, milestoneId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const m = check.milestone;
    for (const [it, q] of Object.entries(m.items)) {
      if (ITEMS[it] && ITEMS[it].type !== 'battle') {
        const free = p.inventory.some((s) => !s.itemId || (s.itemId === it && s.quantity + q <= ITEMS[it].maxStack));
        if (!free) {
          this.emit({ type: 'toast', playerId: p.id, text: '보상을 받을 가방 공간이 부족해요! 한두 칸을 비운 뒤 다시 받아 주세요.' });
          return { ok: false, reason: 'full' };
        }
      }
    }
    (p.lifeDexClaims ??= []).push(m.id);
    if (m.gold > 0) this.setGold(p, m.gold);
    const rewardNames: string[] = m.gold > 0 ? [`${m.gold.toLocaleString()}G`] : [];
    for (const [it, q] of Object.entries(m.items)) {
      if (this.addItem(p, it, q)) rewardNames.push(`${ITEMS[it].name} ×${q}`);
    }
    this.changed(p);
    this.emitParty(p);
    this.emit({
      type: 'lifeDex',
      playerId: p.id,
      lifeDex: JSON.parse(JSON.stringify(p.lifeDex)),
      lifeDexClaims: [...p.lifeDexClaims],
    });
    this.emit({
      type: 'toast',
      playerId: p.id,
      text: `🏆 ${m.title} 보상 수령! (${rewardNames.join(' · ')})`,
      icon: 'star_ball',
    });
    return { ok: true };
  }

  private setHungerMode(p: PlayerState, off: boolean): ActionResult {
    p.hungerOff = !!off;
    if (p.hungerOff && (p.food ?? 80) < 60) p.food = 80;
    this.emit({ type: 'hunger', playerId: p.id, food: p.food ?? 80, hungerOff: p.hungerOff });
    this.emit({
      type: 'toast',
      playerId: p.id,
      text: p.hungerOff ? '🍙 편한 모드 켜짐: 포만감이 줄어들지 않아요.' : '🍙 생존 보급 모드 켜짐: 야외 모험 시 도시락으로 포만감을 챙기세요!',
      icon: 'food_bowl',
    });
    return { ok: true };
  }

  // ── 농사 ───────────────────────────────────────────
  private tileEmit(f: FarmState, t: FarmTile) { this.emit({ type: 'tile', owner: f.owner, tile: cloneTile(t), map: f.map ?? 'farm' }); }

  private useTool(p: PlayerState, slot: number, tx: number, ty: number): ActionResult {
    const item = ITEMS[p.inventory[slot]?.itemId ?? ''];
    if (!item?.tool) return { ok: false, reason: 'not-tool' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const f = this.fieldOf(p);
    const key = `${tx},${ty}`; const tile = f.tiles.get(key);
    const cost = item.energyCost ?? 1;
    if (item.tool === 'hoe') {
      if (tile || !this.canTill(f, tx, ty)) return { ok: false, reason: 'cannot-till', anim: 'hoe' };
      if (!this.spend(p, cost)) return { ok: false, reason: 'tired' };
      const t: FarmTile = { x: tx, y: ty, soil: this.time.weather === 'rain' ? SoilState.Watered : SoilState.Plowed, crop: null };
      f.tiles.set(key, t); this.tileEmit(f, t); this.changed(p); this.wear(p, slot);
      return { ok: true, anim: 'hoe' };
    }
    if (item.tool === 'watering_can') {
      if (!tile || tile.soil === SoilState.Watered) return { ok: false, reason: 'cannot-water', anim: 'water' };
      if (!this.spend(p, SPECIES[p.party[0]?.species]?.type === '물' ? 0 : cost)) return { ok: false, reason: 'tired' };
      tile.soil = SoilState.Watered; this.tileEmit(f, tile); this.changed(p); this.wear(p, slot);
      return { ok: true, anim: 'water' };
    }
    return { ok: false, reason: 'axe-needs-target', anim: 'axe' };
  }

  private plant(p: PlayerState, slot: number, tx: number, ty: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || item.type !== 'seed' || !item.cropId) return { ok: false, reason: 'not-seed' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const f = this.fieldOf(p);
    const tile = f.tiles.get(`${tx},${ty}`);
    if (!tile || tile.crop) return { ok: false, reason: 'no-soil' };
    const crop = CROPS[item.cropId];
    if (!canGrowCropAt(crop.id, p.map, this.time.season)) { this.emit({ type: 'toast', playerId: p.id, text: `${crop.name}은(는) 지금 계절에 이 밭에서 자라지 않아요. (본고장 텃밭에서는 언제든 재배 가능!)` }); return { ok: false, reason: 'season' }; }
    tile.crop = { id: crop.id, stage: 0, daysInStage: 0 };
    s.quantity--; if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    this.tileEmit(f, tile); this.changed(p);
    return { ok: true, anim: 'interact' };
  }

  private harvest(p: PlayerState, tx: number, ty: number): ActionResult {
    const f = this.fieldOf(p);
    const tile = f.tiles.get(`${tx},${ty}`);
    if (!tile?.crop || tile.crop.stage < 4) return { ok: false, reason: 'not-ready' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const def = CROPS[tile.crop.id];
    const qty = def.harvestQty[0] + Math.floor(this.rand() * (def.harvestQty[1] - def.harvestQty[0] + 1));
    if (!this.addItem(p, def.harvestItem, qty)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    if (def.regrowDays > 0) { tile.crop.stage = 3; tile.crop.daysInStage = 0; tile.crop.regrowing = true; }
    else tile.crop = null;
    this.tileEmit(f, tile); this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[def.harvestItem].name} ×${qty} 수확!`, icon: def.harvestItem });
    this.recordDex(p, def.harvestItem, qty);
    return { ok: true, anim: 'interact' };
  }

  private ship(p: PlayerState, slot: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || item.type === 'tool' || item.type === 'battle' || item.sellPrice <= 0) { this.emit({ type: 'toast', playerId: p.id, text: '출하 상자: 작물·물고기·광석·채집물을 손에 들고 상호작용하면 팔 수 있어요.' }); return { ok: false, reason: 'not-sellable' }; }
    const existing = p.bin.find((b) => b.itemId === item.id);
    if (existing) existing.quantity += s.quantity; else p.bin.push({ itemId: item.id, quantity: s.quantity });
    this.emit({ type: 'toast', playerId: p.id, text: `${item.name} ×${s.quantity} 출하 (내일 아침 ${item.sellPrice * s.quantity}G 정산)`, icon: 'gold' });
    s.itemId = null; s.quantity = 0;
    this.changed(p);
    return { ok: true, anim: 'interact' };
  }

  /** 도끼: 안쪽에 선 나무(chop 표시) 5번 · 그루터기 2번이면 쓰러짐 → 나무 조각. 쓰러진 통나무 · 숲 테두리 나무는 못 벰 */
  private chop(p: PlayerState, objectId: number): ActionResult {
    const o = this.map.objects.find((ob) => ob.id === objectId);
    const f = this.farmOf(p);
    if (!o || f.removed.has(objectId)) return { ok: false };
    const axe = this.bestTool(p, 'axe');
    if (axe < 0) return { ok: false, reason: 'no-axe' };
    const axeDef = ITEMS[p.inventory[axe].itemId!];
    const T = this.map.tile; if (Math.hypot(o.x / T - p.x / T, o.y / T - 0.5 - (p.y - 4) / T) > 2.8) return { ok: false, reason: 'far' };
    const tree = TREES.has(o.type) && !!oprop(o, 'chop');
    const stump = o.type === 'stump';
    const log = o.type === 'log';
    if (log && (axeDef.power ?? 1) < 1.5) { this.emit({ type: 'toast', playerId: p.id, text: '단단한 통나무다. 구리 도끼 이상으로 업그레이드하면 벨 수 있을 것 같다!', icon: 'axe' }); return { ok: false, reason: 'too-big', anim: 'axe' }; }
    if (!tree && !stump && !log) { if (TREES.has(o.type)) this.emit({ type: 'toast', playerId: p.id, text: '농장을 둘러싼 숲의 나무는 베지 않기로 했다.', icon: 'axe' }); return { ok: true, anim: 'axe', reason: 'shake' }; }
    if (!this.spend(p, axeDef.energyCost ?? 2)) return { ok: false, reason: 'tired' };
    const key = `${f.owner}:${objectId}`, hits = (this.chopHits.get(key) ?? 0) + 1;
    this.changed(p); this.wear(p, axe);
    const needHits = log ? Math.max(1, Math.ceil(6 / (axeDef.power ?? 1))) : Math.max(1, Math.ceil((tree ? TREE_HITS : STUMP_HITS) / (axeDef.power ?? 1)));
    if (hits < needHits) { this.chopHits.set(key, hits); return { ok: true, anim: 'axe', reason: 'shake' }; }
    this.chopHits.delete(key);
    f.removed.add(objectId);
    this.emit({ type: 'objectRemoved', key: `farm:${objectId}`, owner: f.owner });
    const wood = log ? 8 : tree ? 5 + Math.floor(this.rand() * 3) : 2;
    this.addItem(p, 'wood', wood); this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${log ? '커다란 통나무를 치웠다!' : tree ? '나무가 쓰러졌다!' : '그루터기를 치웠다.'} 나무 조각 +${wood}`, icon: 'wood' });
    return { ok: true, anim: 'axe', reason: 'felled' };
  }

  /** 잡초 뽑기 (맨손): 밭을 갈려면 먼저 뽑아야 함 */
  private pull(p: PlayerState, objectId: number): ActionResult {
    const o = this.map.objects.find((ob) => ob.id === objectId);
    const f = this.farmOf(p);
    if (!o || o.type !== 'tuft' || f.removed.has(objectId)) return { ok: false };
    const cx = Number(oprop(o, 'cellX')), cy = Number(oprop(o, 'cellY'));
    if (!this.inReach(p, cx, cy)) return { ok: false, reason: 'far' };
    // 같은 칸에 겹친 풀포기는 한 번에
    this.weedAt(f, cx, cy);
    for (const id of new Set([objectId, ...(this.weedCache.get(cy * this.map.width + cx) ?? [])])) {
      if (f.removed.has(id)) continue;
      f.removed.add(id);
      this.emit({ type: 'objectRemoved', key: `farm:${id}`, owner: f.owner });
    }
    if (this.rand() < 0.5) { this.addItem(p, 'fiber', 1); this.changed(p); }
    return { ok: true, anim: 'interact' };
  }

  /** 설치물 놓기 (농장: 내 농장 또는 초대받은 친구 농장) */
  private place(p: PlayerState, slot: number, tx: number, ty: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item?.place || item.type !== 'placeable') return { ok: false, reason: 'not-placeable' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const f = this.farmOf(p);
    const T = this.map.tile;
    const onPlayer = [...this.players.values()].some((q) => this.room(q) === this.room(p) && Math.floor(q.x / T) === tx && Math.floor((q.y - 3) / T) === ty);
    if (!this.map.inBounds(tx, ty) || this.map.terrainAt(tx, ty) === '2' || this.blockedAt('farm', f, tx, ty) || f.tiles.has(`${tx},${ty}`) || this.weedAt(f, tx, ty) || onPlayer || this.map.warps.some((w) => tx * T >= w.x - T && tx * T < w.x + w.w + T && ty * T >= w.y - T && ty * T < w.y + w.h + T)) {
      this.emit({ type: 'toast', playerId: p.id, text: '여기에는 놓을 수 없어요.', icon: item.icon }); return { ok: false, reason: 'blocked' };
    }
    const obj: PlacedObject = { id: `p${Date.now().toString(36)}${(this.placeSeq++).toString(36)}`, type: item.place, item: item.id, x: tx, y: ty, by: p.id };
    f.placed.set(obj.id, obj);
    s.quantity--; if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    this.changed(p);
    this.emit({ type: 'placed', owner: f.owner, obj: { ...obj } });
    return { ok: true, anim: 'interact' };
  }

  /** 망치: 설치물 부수기 → 아이템으로 돌려받음 (누가 설치했든 그 농장에 있으면) */
  private hammer(p: PlayerState, tx: number, ty: number): ActionResult {
    if (!p.inventory.some((s) => s.itemId === 'hammer')) return { ok: false, reason: 'no-hammer' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far', anim: 'pick' };
    const f = this.farmOf(p);
    const obj = [...f.placed.values()].find((o) => o.x === tx && o.y === ty);
    if (!obj) return { ok: false, reason: 'nothing', anim: 'pick' };
    if (!this.spend(p, ITEMS.hammer?.energyCost ?? 2)) return { ok: false, reason: 'tired' };
    if (!this.addItem(p, obj.item, 1)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full', anim: 'pick' }; }
    f.placed.delete(obj.id);
    this.changed(p);
    this.emit({ type: 'unplaced', owner: f.owner, id: obj.id });
    return { ok: true, anim: 'pick' };
  }

  // ── 칸 막힘 (치운 오브젝트 · 설치물 반영) ─────────────
  private occOf(mapId: MapId) {
    let m = this.occCache.get(mapId);
    if (m) return m;
    m = new Map(); const info = this.maps[mapId];
    for (const o of info.objects) {
      if (NON_BLOCKING.has(o.type)) continue;
      const cx = Number(oprop(o, 'cellX') ?? -1), cy = Number(oprop(o, 'cellY') ?? -1), w = Number(oprop(o, 'cellW') ?? 1), h = Number(oprop(o, 'cellH') ?? 1);
      if (cx < 0) continue;
      for (let y = cy - h + 1; y <= cy; y++) for (let x = cx; x < cx + w; x++) if (info.inBounds(x, y)) m.set(y * info.width + x, o.id);
    }
    this.occCache.set(mapId, m);
    return m;
  }
  /** 이 칸이 막혔나: 맵 충돌 중 치운 오브젝트 자리는 열림 + 농장 설치물은 막음 */
  private blockedAt(mapId: MapId, f: FarmState | null, x: number, y: number, who?: PlayerState) {
    const info = this.maps[mapId];
    if (!info.inBounds(x, y)) return true;
    if (f) for (const o of f.placed.values()) if (o.x === x && o.y === y) return true;
    const wb = info.waterBridgeAt(x, y);
    if (wb && (this.gymWater.get(who?.id ?? '') ?? 0) !== wb.reqLevel) return true;
    if (who && info.pushBlocks.length) {
      const blks = this.blocksOf(who, mapId);
      if (blks) {
        for (const b of blks.values()) if (!b.locked && b.x === x && b.y === y) return true;
      }
    }
    const surfing = !!who?.surfing;
    if (!info.isBlocked(x, y, surfing)) return false;
    const occ = this.occOf(mapId).get(y * info.width + x);
    if (occ == null) return true;
    if (who?.cleared?.includes(`${mapId}:${occ}`) || who?.opened?.includes(`${mapId}:${occ}`)) return false;
    return f ? !f.removed.has(occ) : !this.removed.has(`${mapId}:${occ}`);
  }
  private weedAt(f: FarmState, x: number, y: number) {
    if (!this.weedCache.size) for (const o of this.map.objects) if (o.type === 'tuft') { const k = Number(oprop(o, 'cellY')) * this.map.width + Number(oprop(o, 'cellX')); this.weedCache.set(k, [...(this.weedCache.get(k) ?? []), o.id]); }
    return (this.weedCache.get(y * this.map.width + x) ?? []).some((id) => !f.removed.has(id));
  }
  /** 괭이질: 농지 구역 · 흙길/물 아님 · 막힘 · 잡초 · 설치물 없음 */
  private canTill(f: FarmState, x: number, y: number) {
    const id = f.map ?? 'farm', info = this.maps[id];
    const t = info.terrainAt(x, y);
    if (t === '2' || t === '1' || this.blockedAt(id, f.map ? null : f, x, y) || (!f.map && this.weedAt(f, x, y))) return false;
    return info.farmZones.some((z) => x >= z.x && y >= z.y && x < z.x + z.w && y < z.y + z.h);
  }
  /** 서버 이동 검증용: 치운 나무 · 바위 자리는 지나갈 수 있고 설치물 · 3D 절벽 벽은 못 지나감 */
  canStand(p: PlayerState, px: number, py: number, hw = 5, hh = 5) {
    const info = this.maps[p.map]; if (!info) return false;
    const f = p.map === 'farm' ? this.farmOf(p) : null;
    const T = info.tile;
    const x0 = Math.floor((px - hw) / T), x1 = Math.floor((px + hw - 0.01) / T);
    const y0 = Math.floor((py - hh) / T), y1 = Math.floor((py - 0.01) / T);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) if (this.blockedAt(p.map, f, cx, cy, p)) return false;
    return !info.spansCliffWall(x0, y0, x1, y1);
  }

  private buy(p: PlayerState, shopId: string, itemId: string, qty: number): ActionResult {
    const shop = SHOPS[shopId]; const entry = shop?.items.find((i) => i.itemId === itemId);
    if (!shop || !entry || !ITEMS[itemId]) return { ok: false, reason: 'no-item' };
    if (p.map === 'farm' || p.map === 'home') return { ok: false, reason: 'wrong-map' };
    qty = Math.max(1, Math.min(99, Math.floor(qty)));
    const m = this.time.minutes;
    if (m < hhmmToMinutes(shop.open) || m >= hhmmToMinutes(shop.close)) { this.emit({ type: 'toast', playerId: p.id, text: `${shop.name}은(는) 지금 문을 닫았어요.` }); return { ok: false, reason: 'closed' }; }
    const cost = entry.price * qty;
    if (p.gold < cost) { this.emit({ type: 'toast', playerId: p.id, text: '골드가 부족해요.', icon: 'gold' }); return { ok: false, reason: 'gold' }; }
    if (!this.addItem(p, itemId, qty)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    this.setGold(p, -cost);
    this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[itemId].name} ×${qty} 구매 (-${cost}G)`, icon: ITEMS[itemId].icon });
    return { ok: true };
  }

  /** 상점에서 작물·광석·물고기·재료를 즉시 판매해 골드를 얻음 */
  private sell(p: PlayerState, shopId: string, slot: number, qty?: number): ActionResult {
    const shop = SHOPS[shopId];
    if (!shop) return { ok: false, reason: 'no-shop' };
    if (p.map === 'farm' || p.map === 'home') return { ok: false, reason: 'wrong-map' };
    const m = this.time.minutes;
    if (m < hhmmToMinutes(shop.open) || m >= hhmmToMinutes(shop.close)) {
      this.emit({ type: 'toast', playerId: p.id, text: `${shop.name}은(는) 지금 문을 닫았어요.` });
      return { ok: false, reason: 'closed' };
    }
    const s = p.inventory[slot];
    const item = ITEMS[s?.itemId ?? ''];
    if (!s || !item || item.type === 'tool' || item.type === 'key' || item.sellPrice <= 0) {
      return { ok: false, reason: 'not-sellable' };
    }
    const n = Math.max(1, Math.min(s.quantity, Math.floor(qty ?? s.quantity)));
    const gain = item.sellPrice * n;
    s.quantity -= n;
    if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    this.setGold(p, gain);
    this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${item.name} ×${n} 판매 (+${gain}G)`, icon: 'gold' });
    return { ok: true, data: { item: item.id, qty: n } };
  }

  private eat(p: PlayerState, slot: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || item.type !== 'food') return { ok: false, reason: 'not-food' };
    if (item.id === 'star_candy') return this.useCandy(p, 0);
    s.quantity--; if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    const { foodGain, healedCount } = consumeFoodItem(p, item);
    this.changed(p);
    if (healedCount > 0) this.emitParty(p);
    this.emit({ type: 'hunger', playerId: p.id, food: p.food ?? 80, hungerOff: !!p.hungerOff });
    const bonusTxt = healedCount > 0 ? ` · 파티 루미 체력 회복!` : '';
    this.emit({ type: 'toast', playerId: p.id, text: `🍙 ${item.name}을(를) 먹었어요! (포만감 +${foodGain} → ${p.food}/100${bonusTxt})`, icon: item.icon });
    return { ok: true, anim: 'interact' };
  }

  // ── 루미 모험 ──────────────────────────────────────
  private emitParty(p: PlayerState) {
    this.emit({ type: 'party', id: p.id, party: p.party, box: p.box, bag: p.bag, badges: p.badges, defeated: p.defeated, seen: p.seen, caught: p.caught, visited: p.visited, recipes: p.recipes, flags: p.flags, bonds: p.bonds, asks: p.asks, stock: p.stock, opened: p.opened });
  }
  private help(p: PlayerState, text: string) { const sp = p.party[0]?.species; if (sp) this.emit({ type: 'help', playerId: p.id, species: sp, text }); }
  private helps(p: PlayerState) { return SPECIES[p.party[0]?.species]?.helps; }
  private pick<T>(table: T[], weight: (t: T) => number): T {
    const total = table.reduce((a, t) => a + weight(t), 0); let r = this.rand() * total;
    for (const t of table) { r -= weight(t); if (r <= 0) return t; }
    return table[table.length - 1];
  }

  private chooseStarter(p: PlayerState, species: string): ActionResult {
    if (p.party.length) return { ok: false, reason: 'already' };
    if (p.story !== STORY.HALL) return { ok: false, reason: 'story' };
    if (!ENCOUNTERS.starters.includes(species)) return { ok: false, reason: 'not-starter' };
    p.party.push(makeCreature(species, 5));
    p.seen.push(species); p.caught.push(species);
    p.bag.lumi_ball = (p.bag.lumi_ball ?? 0) + 5; p.bag.potion = (p.bag.potion ?? 0) + 3;
    this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[species].name}이(가) 파트너가 되었어요! 루미볼 5개, 루미 회복약 3개를 받았어요.`, icon: 'lumi' });
    return { ok: true };
  }

  private setPartner(p: PlayerState, index: number): ActionResult {
    const c = p.party[index]; if (!c || index === 0) return { ok: false };
    p.party.splice(index, 1); p.party.unshift(c);
    this.emitParty(p);
    return { ok: true };
  }

  private partySwap(p: PlayerState, a: number, b: number): ActionResult {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a === b || !p.party[a] || !p.party[b]) return { ok: false, reason: 'bad-index' };
    [p.party[a], p.party[b]] = [p.party[b], p.party[a]];
    this.emitParty(p);
    return { ok: true };
  }

  private boxSwap(p: PlayerState, partyIndex: number, boxIndex: number): ActionResult {
    const pc = p.party[partyIndex], bc = p.box[boxIndex];
    if (!pc || !bc) return { ok: false, reason: 'bad-index' };
    const aliveAfter = p.party.some((c, i) => (i === partyIndex ? bc.hp > 0 : c.hp > 0));
    if (!aliveAfter) return { ok: false, reason: 'need-alive' };
    p.party[partyIndex] = bc;
    p.box[boxIndex] = pc;
    this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[bc.species]?.name ?? '루미'}을(를) 파티에 데려왔어요!`, icon: 'lumi' });
    return { ok: true };
  }

  private boxDeposit(p: PlayerState, partyIndex: number): ActionResult {
    if (p.party.length <= 1) return { ok: false, reason: 'last-lumi' };
    const pc = p.party[partyIndex]; if (!pc) return { ok: false, reason: 'bad-index' };
    if (!p.party.some((c, i) => i !== partyIndex && c.hp > 0)) return { ok: false, reason: 'need-alive' };
    p.party.splice(partyIndex, 1);
    p.box.push(pc);
    this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[pc.species]?.name ?? '루미'}을(를) PC 보관함에 맡겼어요.`, icon: 'lumi' });
    return { ok: true };
  }

  private boxWithdraw(p: PlayerState, boxIndex: number): ActionResult {
    if (p.party.length >= 6) return { ok: false, reason: 'party-full' };
    const bc = p.box[boxIndex]; if (!bc) return { ok: false, reason: 'bad-index' };
    p.box.splice(boxIndex, 1);
    p.party.push(bc);
    this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[bc.species]?.name ?? '루미'}이(가) 파티에 합류했어요!`, icon: 'lumi' });
    return { ok: true };
  }

  private boxRelease(p: PlayerState, boxIndex: number): ActionResult {
    const bc = p.box[boxIndex]; if (!bc) return { ok: false, reason: 'bad-index' };
    p.box.splice(boxIndex, 1);
    this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[bc.species]?.name ?? '루미'}에게 작별 인사를 했어요. 잘 가!`, icon: 'heart' });
    return { ok: true };
  }

  /** 전투 밖(휴대폰 가방)에서 회복약 사용 */
  private useBagItem(p: PlayerState, itemId: string, partyIndex: number): ActionResult {
    const def = ITEMS[itemId];
    if (!def || !def.heal || (p.bag[itemId] ?? 0) < 1) return { ok: false, reason: 'no-item' };
    const c = p.party[partyIndex];
    if (!c) return { ok: false, reason: 'bad-index' };
    const max = stats(c).maxHp;
    if (c.hp <= 0) return { ok: false, reason: 'fainted' };
    if (c.hp >= max) return { ok: false, reason: 'full-hp' };
    const before = c.hp;
    c.hp = Math.min(max, c.hp + def.heal);
    const healed = c.hp - before;
    p.bag[itemId] = (p.bag[itemId] ?? 1) - 1;
    if (p.bag[itemId] <= 0) delete p.bag[itemId];
    this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[c.species]?.name ?? '루미'}의 체력이 ${healed} 회복됐어요! (${c.hp}/${max})`, icon: def.icon });
    return { ok: true, data: { item: itemId, qty: healed } };
  }

  /** 별바람 택시(빠른 이동): 가 본 마을이나 내 농장으로 즉시 이동 (동굴 안에서는 탈출 사용) */
  private fastTravel(p: PlayerState, to: MapId): ActionResult {
    if (p.story < STORY.DONE || !p.party.length) return { ok: false, reason: 'need-partner' };
    if (this.maps[p.map]?.props.cave === 'true') return { ok: false, reason: 'in-cave' };
    const meta = REGION_MAPS[to];
    if (!meta || !this.maps[to]) return { ok: false, reason: 'no-map' };
    if (to !== 'farm' && !(meta.kind === 'town' && p.visited.includes(to))) return { ok: false, reason: 'not-visited' };
    if (p.riding) { p.riding = false; this.emit({ type: 'bike', id: p.id, riding: false }); }
    if (to === 'farm') {
      p.world = p.homeWorld;
      const h = this.homeSpot();
      this.relocate(p, 'farm', p.id, h.x, h.y);
    } else {
      const sp = this.maps[to].spawns;
      const spawn = sp.has('wp_center') ? 'wp_center' : sp.has('wp_hall') ? 'wp_hall' : sp.has('wp_casino') ? 'wp_casino' : 'player';
      this.toSpawn(p, to, '', spawn);
    }
    this.emit({ type: 'toast', playerId: p.id, text: `🕊️ 별바람 택시를 타고 ${meta.name}(으)로 이동했어요!`, icon: 'lumi' });
    return { ok: true };
  }

  /** 동굴 탈출: 깊은 동굴 안에서 가장 가까운 방문 마을로 즉시 귀환 */
  private escapeCave(p: PlayerState): ActionResult {
    if (this.maps[p.map]?.props.cave !== 'true') return { ok: false, reason: 'not-cave' };
    const to = this.nearestTown(p);
    this.toSpawn(p, to.map, '', to.spawn);
    this.emit({ type: 'toast', playerId: p.id, text: `🪢 동굴에서 벗어나 ${REGION_MAPS[to.map]?.name ?? '마을'}(으)로 돌아왔어요!`, icon: 'heart' });
    return { ok: true };
  }

  private canBattle(p: PlayerState) { return p.party.some((c) => c.hp > 0); }

  private encounter(p: PlayerState): ActionResult {
    const m = this.maps[p.map], T = m.tile;
    const cx = Math.floor(p.x / T), cy = Math.floor((p.y - 3) / T);
    const cave = m.props.cave === 'true';
    const onSurfWater = !!p.surfing && m.terrainAt(cx, cy) === '2';
    const table = ENCOUNTERS.grass[p.map];
    if (!this.canBattle(p)) return { ok: false, reason: 'no-encounter' };
    if (!onSurfWater && (!table || (!cave && !m.objects.some((o) => o.type === 'tallgrass' && Math.floor(o.x / T) === cx && Math.floor(o.y / T) - 1 === cy)))) return { ok: false, reason: 'not-grass' };
    const now = Date.now(); if (now - (this.lastEncounter.get(p.id) ?? 0) < 5000) return { ok: false, reason: 'cooldown' };
    this.lastEncounter.set(p.id, now);
    const night = this.time.minutes >= 19 * 60 || this.time.minutes < 6 * 60 + 30;
    const surfPool = ENCOUNTERS.fish[p.map]?.lumi ?? [['w1a', 14, 20, 30], ['w2a', 14, 20, 25], ['w4a', 16, 22, 25], ['chalang', 16, 22, 20]];
    const [sp, lo, hi] = onSurfWater
      ? (p.map === 'ocean_shrine' && table ? this.pick(night ? table.night : table.day, (r) => r[3]) : this.pick(surfPool, (r) => r[3]))
      : this.pick(night ? table!.night : table!.day, (r) => r[3]);
    const lv = lo + Math.floor(this.rand() * (hi - lo + 1));
    const { state, update } = this.engine.startWild(p, sp, lv, onSurfWater ? 'water' : (m.props.battleBg ?? 'grass'));
    state.dark = cave || night;
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }

  private hasCaught(p: PlayerState, sp: string) { return p.caught.includes(sp) || p.party.some((c) => c.species === sp) || p.box.some((c) => c.species === sp); }
  /** 별의 제단: 본편(챔피언)을 깬 트레이너 앞에만 전설 별무리가 내려옴 */
  private legendBattle(p: PlayerState): ActionResult {
    if (p.map !== 'altar') return { ok: false, reason: 'wrong-map' };
    if (!p.defeated.includes('champion')) return { ok: false, reason: 'story' };
    if (this.hasCaught(p, LEGEND)) return { ok: false, reason: 'caught' };
    if (!this.canBattle(p)) return { ok: false, reason: 'no-lumi' };
    const { state, update } = this.engine.startWild(p, LEGEND, LEGEND_LV, 'summit');
    update.log.splice(0, 1, { t: 'text', text: '별의 제단 위로 별빛이 쏟아져 내린다…!' }, { t: 'text', text: `전설의 루미 ${SPECIES[LEGEND].name}이(가) 모습을 드러냈다!` });
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }
  /** 깨어난 제네시스에게 말을 걸면 (네 탑의 빛 + 마지막 선율 뒤): 레벨 150 보스전
   *  체력이 절반보다 많으면 볼을 던질 수 없고, 절반 아래 0.1% · 20% 아래 10% (태초볼은 절반 아래에서 100%) */
  private ocarinaBattle(p: PlayerState): ActionResult {
    if (p.map !== 'altar') return { ok: false, reason: 'wrong-map' };
    if (!p.flags.includes('genesis_awake')) return { ok: false, reason: 'asleep' };
    if (this.hasCaught(p, MYTH)) return { ok: false, reason: 'caught' };
    if (!this.canBattle(p)) return { ok: false, reason: 'no-lumi' };
    const { state, update } = this.engine.startWild(p, MYTH, MYTH_LV, 'origin');
    update.log.splice(0, 1, { t: 'text', text: '제네시스가 천천히 눈을 떴다. 하늘과 땅이 함께 울린다…' }, { t: 'text', text: `태초의 루미 ${SPECIES[MYTH].name}(Lv.${MYTH_LV})이(가) 덮쳐 온다!` });
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }
  /** 별의 요람: 루미 마스터의 시험을 넘은 트레이너 앞에서만 눈을 뜨는 전설 스텔라 */
  private stellaBattle(p: PlayerState): ActionResult {
    if (p.map !== 'stella_nest') return { ok: false, reason: 'wrong-map' };
    if (!p.flags.includes('side_master')) return { ok: false, reason: 'story' };
    if (this.hasCaught(p, STELLA)) return { ok: false, reason: 'caught' };
    if (!this.canBattle(p)) return { ok: false, reason: 'no-lumi' };
    const { state, update } = this.engine.startWild(p, STELLA, STELLA_LV, 'cave');
    state.dark = true;
    update.log.splice(0, 1, { t: 'text', text: '수정 사이로 별빛이 모여들더니, 작은 숨소리가 들린다…' }, { t: 'text', text: `전설의 루미 ${SPECIES[STELLA].name}이(가) 눈을 떴다!` });
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }
  /** 해신의 바다: 세 조류 비석을 모두 깨운 트레이너 앞에 강림하는 물 타입 전설 루미 '해랑' */
  private seaLegendBattle(p: PlayerState): ActionResult {
    if (p.map !== 'ocean_shrine') return { ok: false, reason: 'wrong-map' };
    if (!p.flags.includes('sea_shrine_open')) return { ok: false, reason: 'sealed' };
    if (this.hasCaught(p, SEA_LEGEND)) return { ok: false, reason: 'caught' };
    if (!this.canBattle(p)) return { ok: false, reason: 'no-lumi' };
    const { state, update } = this.engine.startWild(p, SEA_LEGEND, SEA_LEGEND_LV, 'water');
    update.log.splice(0, 1, { t: 'text', text: '깊은 바다가 갈라지며 찬란한 해류가 솟구친다…!' }, { t: 'text', text: `전설의 물 루미 ${SPECIES[SEA_LEGEND].name}(Lv.${SEA_LEGEND_LV})이(가) 모습을 드러냈다!` });
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }
  /** 보물 상자 · 반짝이는 것: 맵에 정해진 물건을 한 번만 얻음 (플레이어마다 따로) */
  private loot(p: PlayerState, objectId: number): ActionResult {
    const m = this.maps[p.map], o = m.objects.find((ob) => ob.id === objectId);
    const item = o ? String(prop(o, 'loot', '')) : '', qty = o ? Number(prop(o, 'qty', 1)) : 0;
    if (!o || !ITEMS[item]) return { ok: false, reason: 'no-loot' };
    const key = `${p.map}:${objectId}`;
    if (p.opened?.includes(key)) return { ok: false, reason: 'opened' };
    const T = m.tile; if (Math.hypot(o.x / T - p.x / T, o.y / T - 0.5 - (p.y - 4) / T) > 2.4) return { ok: false, reason: 'far' };
    if (!this.addItem(p, item, qty)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    (p.opened ??= []).push(key);
    this.changed(p); this.emitParty(p);
    this.emit({ type: 'opened', playerId: p.id, key });
    return { ok: true, data: { item, qty } };
  }
  private addFlag(p: PlayerState, f: string) { if (!p.flags.includes(f)) { p.flags.push(f); this.emitParty(p); } }
  /** 시련의 오카리나: 악보(간부를 이겨 얻음)가 있어야 봉인이 풀리고 빛이 켜짐. 연주(리듬)는 클라이언트, 조건 검증은 여기서 */
  private flute(p: PlayerState, at: string): ActionResult {
    if (!p.inventory.some((s) => s.itemId === 'ocarina')) return { ok: false, reason: 'no-flute' };
    const [kind, d] = at.split(':'), sp = QUESTS.spires[d ?? ''];
    if (kind === 'altar') {
      if (p.map !== 'altar') return { ok: false, reason: 'wrong-map' };
      if (!p.flags.includes(QUESTS.finale.boss)) return { ok: false, reason: 'no-score' };
      this.addFlag(p, 'genesis_awake');
      return { ok: true };
    }
    if (!sp) return { ok: false, reason: 'unknown' };
    if (!p.flags.includes(sp.boss)) return { ok: false, reason: 'no-score' };
    if (kind === 'seal') { if (p.map !== `spire_${d}`) return { ok: false, reason: 'wrong-map' }; this.addFlag(p, `open_${d}`); return { ok: true }; }
    if (kind === 'top') {
      if (p.map !== `spire_${d}_top`) return { ok: false, reason: 'wrong-map' };
      this.addFlag(p, `lit_${d}`);
      const n = Object.keys(QUESTS.spires).filter((k) => p.flags.includes(`lit_${k}`)).length;
      this.emit({ type: 'toast', playerId: p.id, text: n >= 4 ? '네 탑의 빛이 모두 켜졌다! 빛줄기가 별마루산 꼭대기로 모인다…' : `${sp.name}의 빛이 켜졌다! (${n}/4)`, icon: 'ocarina' });
      return { ok: true, data: { qty: n } };
    }
    return { ok: false, reason: 'unknown' };
  }

  // ── 마을 주민 호감도 · 사이드 스토리 · 텃밭 도우미 ──
  /** 이야기하기: 하루 한 번 호감도 +1 */
  private talk(p: PlayerState, npc: string): ActionResult {
    const def = NPCS[npc]; if (!def?.hand || def.hand !== p.map) return { ok: false, reason: 'no-npc' };
    const b = (p.bonds ??= {}), d = (p.bondDay ??= {});
    if (d[npc] !== this.time.day) { d[npc] = this.time.day; this.addBond(p, npc, 1); }
    if ((p.map === 'lumina' || p.map === 'mist') && this.countItem(p, 'bicycle') < 1) {
      if (this.addItem(p, 'bicycle', 1)) {
        this.changed(p);
        this.emit({ type: 'toast', playerId: p.id, text: '모험가용 고속 자전거를 선물 받았어요! (B키로 언제든 타고 내릴 수 있어요)', icon: 'bicycle' });
      }
    }
    return { ok: true, data: { qty: b[npc] ?? 0 } };
  }
  private addBond(p: PlayerState, npc: string, n: number) {
    const b = (p.bonds ??= {}), before = b[npc] ?? 0;
    b[npc] = Math.min(BOND_MAX, before + n);
    const def = NPCS[npc], town = REGION_MAPS[def?.hand ?? '']?.name ?? '마을';
    if (before < BOND_WATER && b[npc] >= BOND_WATER) this.emit({ type: 'toast', playerId: p.id, text: `${def.name}와(과) 친해졌어요! 이제 ${town} 텃밭에 매일 물을 대신 줘요.`, icon: 'heart' });
    if (before < BOND_MAX && b[npc] >= BOND_MAX) this.emit({ type: 'toast', playerId: p.id, text: `${def.name}이(가) ${town} 텃밭 도우미가 되었어요! 물 주기 · 수확 · 다시 심기까지 함께해요.`, icon: 'heart' });
    this.emitParty(p);
  }
  /** 부탁 들어주기: 물건을 건네면 사이드 스토리가 한 단계 나아가고 호감도 +2 · 사례금 */
  private askDone(p: PlayerState, npc: string): ActionResult {
    const def = NPCS[npc]; if (!def?.hand || def.hand !== p.map || !def.asks) return { ok: false, reason: 'no-npc' };
    const step = (p.asks ??= {})[npc] ?? 0, a = def.asks[step];
    if (!a) return { ok: false, reason: 'done' };
    if ((p.bonds?.[npc] ?? 0) < (BOND_ASK_AT[step] ?? 0)) return { ok: false, reason: 'bond' };
    if (this.countItem(p, a.item) < a.qty) return { ok: false, reason: 'materials' };
    this.takeItem(p, a.item, a.qty);
    p.asks[npc] = step + 1;
    const gold = [200, 450, 900][step] ?? 200;
    this.setGold(p, gold);
    this.changed(p);
    this.addBond(p, npc, 2);
    this.emit({ type: 'toast', playerId: p.id, text: `「${def.story}」 ${step + 1}/${def.asks.length} · 사례로 ${gold}G를 받았어요.`, icon: 'gold' });
    return { ok: true, data: { qty: step + 1 } };
  }
  /** 도우미가 맡아 둔 수확물 받기 (가방에 들어가는 만큼) */
  private collect(p: PlayerState, map: string): ActionResult {
    const st = p.stock?.[map]; if (!st || p.map !== map) return { ok: false, reason: 'empty' };
    let got = 0;
    for (const [it, n] of Object.entries(st)) { if (!ITEMS[it] || !this.addItem(p, it, n)) continue; got += n; this.recordDex(p, it, n); delete st[it]; }
    if (!Object.keys(st).length) delete p.stock![map];
    this.changed(p); this.emitParty(p);
    if (!got) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    this.emit({ type: 'toast', playerId: p.id, text: `맡겨 둔 수확물 ${got}개를 받았어요!`, icon: 'heart' });
    return { ok: true, data: { qty: got } };
  }
  /** 이 마을에서 가장 친한 주민의 호감도 */
  private bondIn(p: PlayerState, town: string) { return Math.max(0, ...(HANDS[town] ?? []).map((id) => p.bonds?.[id] ?? 0)); }
  /** 새 날 아침: 친해진 주민이 내 텃밭에 물을 주고(하트 2개~), 도우미(하트 5개)는 익은 작물을 거둬 맡아 두고 다시 심음 */
  private helpersWork(weather: Weather) {
    for (const p of this.players.values()) {
      let reaped = 0; const towns: string[] = [];
      for (const f of this.plots.values()) {
        if (f.owner !== p.id || !f.map || !f.tiles.size) continue;
        const lv = this.bondIn(p, f.map); if (lv < BOND_WATER) continue;
        for (const t of f.tiles.values()) {
          if (!t.crop) continue;
          if (lv >= BOND_MAX && t.crop.stage >= 4) {
            const def = CROPS[t.crop.id], qty = def.harvestQty[0] + Math.floor(this.rand() * (def.harvestQty[1] - def.harvestQty[0] + 1));
            const st = ((p.stock ??= {})[f.map] ??= {}); st[def.harvestItem] = (st[def.harvestItem] ?? 0) + qty; reaped += qty;
            if (!towns.includes(f.map)) towns.push(f.map);
            t.crop = def.regrowDays > 0 ? { id: def.id, stage: 3, daysInStage: 0, regrowing: true } : { id: def.id, stage: 0, daysInStage: 0 };
          }
          if (weather !== 'rain') t.soil = SoilState.Watered;
          this.tileEmit(f, t);
        }
      }
      if (reaped) { this.emitParty(p); this.emit({ type: 'toast', playerId: p.id, text: `텃밭 도우미가 ${towns.map((m) => REGION_MAPS[m]?.name ?? m).join(' · ')}에서 작물 ${reaped}개를 거둬 뒀어요. 들러서 받아 가세요!`, icon: 'heart' }); }
    }
  }
  /** 루미 도감을 완성하면 루미 리그에서 루미 마스터 하람과 재대결 (모든 루미 만렙) */
  private masterRematch(p: PlayerState): ActionResult {
    if (p.map !== 'league') return { ok: false, reason: 'wrong-map' };
    if (!p.defeated.includes('champion')) return { ok: false, reason: 'story' };
    if (!dexComplete(p)) return { ok: false, reason: 'dex' };
    if (!this.canBattle(p)) return { ok: false, reason: 'no-lumi' };
    const base = TRAINERS.champion;
    const def: TrainerDef = {
      ...base, id: 'champion_ex', title: '루미 마스터', sight: 0, reward: 20000, requires: [],
      team: (['astra', 'busit', 'mallang', 'ikkigom', 'poreureu', 'posil'] as const).map((sp) => [sp, MASTER_LV] as [string, number]),
      intro: ['도감을 전부 채웠다고? …하나 누나가 그랬지. 땅을 아는 트레이너가 결국 이긴다고.', '좋아. 이번엔 봐주지 않아. 내 루미 전원, 끝까지 키운 모습이다!'],
      defeat: ['…졌다. 완벽하게.', '이걸 받아. 내가 줄 수 있는 마지막 태초볼이야.'],
      after: ['별마루산 미로 끝에서 기다리는 것, 이미 만났겠지?'],
    };
    const { state, update } = this.engine.startTrainer(p, def, undefined, 'town');
    update.log.splice(1, 0, ...def.intro.map((text) => ({ t: 'text' as const, text: `${def.name}: "${text}"` })));
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }

  /** 길 위 트레이너는 내 루미 레벨에 맞춰 비슷한 레벨로 (관장 · 사천왕 · 챔피언 · 라이벌은 그대로) */
  private scaledTrainer(p: PlayerState, tr: TrainerDef): TrainerDef {
    if (tr.badge || /관장|사천왕|챔피언|마스터|라이벌/.test(tr.title) || !p.party.length) return tr;
    const mine = [...p.party].map((c) => c.level).sort((a, b) => b - a);
    const ref = Math.round((mine[0] + (mine[1] ?? mine[0])) / 2);   // 가장 센 두 마리의 평균
    const top = Math.max(...tr.team.map(([, l]) => l));
    const team = tr.team.map(([sp, l]) => [sp, Math.max(2, Math.min(100, ref - 1 + (l - top)))] as [string, number]);
    const lv = Math.max(...team.map(([, l]) => l));
    return { ...tr, team, reward: Math.max(tr.reward, 30 * lv) };
  }

  /** 지금 있는 곳에서 가장 가까운 마을 (지도 좌표 기준) → 센터/광장 앞 */
  nearestTown(p: PlayerState): { map: MapId; spawn: string } {
    let here = REGION_MAPS[p.map];
    if (!here || here.interior || here.kind === 'room') {
      const back = p.ret?.map ? REGION_MAPS[p.ret.map] : undefined;
      here = back ?? REGION_MAPS.town;
    }
    let best: MapId = 'town', bd = Infinity;
    for (const [id, m] of Object.entries(REGION_MAPS)) {
      if (m.kind !== 'town' || !this.maps[id as MapId]) continue;
      if (!p.visited.includes(id) && id !== 'town') continue;   // 가 본 마을만
      const d = Math.hypot(m.x - here.x, m.y - here.y);
      if (d < bd) { bd = d; best = id as MapId; }
    }
    const sp = this.maps[best].spawns;
    return { map: best, spawn: sp.has('wp_center') ? 'wp_center' : sp.has('wp_hall') ? 'wp_hall' : sp.has('wp_casino') ? 'wp_casino' : 'player' };
  }

  /** 별빛 카지노 (밤 18:00 ~ 02:00 / 06:00 미만 전용): 골드 베팅 미니게임 3종 (슬롯 · 주사위 · 하이로우) */
  private casinoBet(p: PlayerState, game: CasinoGame, bet: number, pick?: string): ActionResult {
    if (p.map !== 'in_casino') return { ok: false, reason: 'wrong-map' };
    if (!isCasinoOpen(this.time.minutes)) return { ok: false, reason: 'casino-closed' };
    if (!Number.isInteger(bet) || bet < 10 || bet > 10000) return { ok: false, reason: 'bad-bet' };
    if (p.gold < bet) {
      this.emit({ type: 'toast', playerId: p.id, text: `골드가 부족해요! (${bet.toLocaleString()}G 필요)`, icon: 'gold' });
      return { ok: false, reason: 'gold' };
    }

    let multiplier = 0;
    let summary = '아쉽네요! 다음 기회에 다시 도전해 보세요.';
    let reels: string[] | undefined;
    let dice: [number, number] | undefined;
    let cards: [number, number] | undefined;

    if (game === 'slot') {
      const pool = ['🍒', '🍒', '🍒', '🍋', '🍋', '🍋', '🔔', '🔔', '🍀', '🍀', '💎', '⭐'];
      const r0 = pool[Math.floor(this.rand() * pool.length)];
      const r1 = pool[Math.floor(this.rand() * pool.length)];
      const r2 = pool[Math.floor(this.rand() * pool.length)];
      reels = [r0, r1, r2];
      if (r0 === '⭐' && r1 === '⭐' && r2 === '⭐') {
        multiplier = 10; summary = '🌟 별빛 잭팟! 10배 대박 당첨!';
      } else if (r0 === '💎' && r1 === '💎' && r2 === '💎') {
        multiplier = 7; summary = '💎 다이아 잭팟! 7배 당첨!';
      } else if (r0 === r1 && r1 === r2) {
        multiplier = 4; summary = '🎰 트리플 매치! 4배 당첨!';
      } else if (
        (r0 === r1 && (r0 === '⭐' || r0 === '💎' || r0 === '🍒')) ||
        (r1 === r2 && (r1 === '⭐' || r1 === '💎')) ||
        (r0 === r2 && (r0 === '⭐' || r0 === '💎'))
      ) {
        multiplier = 2; summary = '✨ 투 페어 보너스! 2배 당첨!';
      }
    } else if (game === 'dice') {
      const choice = pick && ['odd', 'even', 'seven', 'double'].includes(pick) ? pick : 'odd';
      const d1 = 1 + Math.floor(this.rand() * 6);
      const d2 = 1 + Math.floor(this.rand() * 6);
      const sum = d1 + d2;
      dice = [d1, d2];
      if (choice === 'odd' && sum % 2 === 1) {
        multiplier = 2; summary = `🎲 합계 ${sum}(홀수) 적중! 2배 당첨!`;
      } else if (choice === 'even' && sum % 2 === 0) {
        multiplier = 2; summary = `🎲 합계 ${sum}(짝수) 적중! 2배 당첨!`;
      } else if (choice === 'seven' && sum === 7) {
        multiplier = 5; summary = '🎯 행운의 7 적중! 5배 당첨!';
      } else if (choice === 'double' && d1 === d2) {
        multiplier = 5; summary = `🎲 ${d1}-${d2} 더블 적중! 5배 당첨!`;
      } else {
        summary = `🎲 주사위 결과 ${d1} + ${d2} = ${sum}… 아쉽게 빗나갔어요!`;
      }
    } else if (game === 'highlow') {
      const choice = pick && ['high', 'low', 'same'].includes(pick) ? pick : 'high';
      const c1 = 1 + Math.floor(this.rand() * 13);
      const c2 = 1 + Math.floor(this.rand() * 13);
      const cardName = (v: number) => (v === 1 ? 'A' : v === 11 ? 'J' : v === 12 ? 'Q' : v === 13 ? 'K' : String(v));
      cards = [c1, c2];
      if (choice === 'high' && c2 > c1) {
        multiplier = 2; summary = `🃏 ${cardName(c1)} → ${cardName(c2)} (HIGH) 적중! 2배 당첨!`;
      } else if (choice === 'low' && c2 < c1) {
        multiplier = 2; summary = `🃏 ${cardName(c1)} → ${cardName(c2)} (LOW) 적중! 2배 당첨!`;
      } else if (choice === 'same' && c2 === c1) {
        multiplier = 8; summary = `🃏 ${cardName(c1)} = ${cardName(c2)} (SAME) 대박! 8배 당첨!`;
      } else {
        summary = `🃏 딜러 ${cardName(c1)} → 내 카드 ${cardName(c2)}… 패배했어요!`;
      }
    } else {
      return { ok: false, reason: 'bad-game' };
    }

    const payout = bet * multiplier;
    const net = payout - bet;
    const win = payout > 0;
    this.setGold(p, net);
    const outcome: CasinoOutcome = { game, bet, payout, net, win, multiplier, summary, reels, dice, cards };
    this.emit({
      type: 'toast',
      playerId: p.id,
      text: win ? `🎰 ${summary} (+${payout.toLocaleString()}G)` : `💸 ${bet.toLocaleString()}G를 잃었어요…`,
      icon: 'gold',
    });
    return { ok: true, data: { casino: outcome } };
  }

  private trainerBattle(p: PlayerState, trainerId: string): ActionResult {
    const tr = TRAINERS[trainerId];
    if (!tr || p.defeated.includes(trainerId) || tr.map !== p.map || !this.canBattle(p)) return { ok: false, reason: 'invalid-trainer' };
    const need = (tr.requires ?? []).find((r) => !p.defeated.includes(r));
    if (need) return { ok: false, reason: `requires:${need}` };
    const bg = this.maps[p.map].props.battleBg ?? (isInterior(p.map) ? 'town' : undefined);
    const { state, update } = this.engine.startTrainer(p, this.scaledTrainer(p, tr), undefined, bg);
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }

  private battleStep(p: PlayerState, fn: (st: BattleState) => BattleUpdate | null): ActionResult {
    const st = this.battles.get(p.id); if (!st) return { ok: false, reason: 'no-battle' };
    const up = fn(st); if (!up) return { ok: false, reason: 'invalid' };
    return this.afterBattle(p, st, up);
  }

  private afterBattle(p: PlayerState, st: BattleState, up: BattleUpdate): ActionResult {
    if (up.ended) {
      this.battles.delete(p.id);
      if (up.ended === 'caught') {
        const foe = st.foes[st.foeIdx];
        if (foe?.species === MYTH && !p.flags.includes('side_genesis')) p.flags.push('side_genesis');
        if (foe && p.box[p.box.length - 1] === foe) {
          this.emit({ type: 'toast', playerId: p.id, text: `💻 파티가 가득 차서 ${SPECIES[foe.species]?.name ?? foe.species}을(를) PC 보관함으로 보냈어요!`, icon: 'lumi' });
        }
      }
      if (up.ended === 'win' && st.trainerId) {
        const tr = st.tr ?? TRAINERS[st.trainerId];
        if (st.script === 'rival') this.setStory(p, STORY.DONE);
        if (st.eventId) this.finishEvent(p, st.eventId);
        const first = !p.defeated.includes(st.trainerId);
        if (first) p.defeated.push(st.trainerId);
        p.gold += tr.reward;
        up.log.push({ t: 'text', text: `${tr.title} ${tr.name}과(와)의 승부에서 이겼다!` }, ...tr.defeat.map((text) => ({ t: 'text' as const, text: `${tr.name}: "${text}"` })), { t: 'text', text: `상금으로 ${tr.reward}G를 받았다!` });
        if (tr.badge && !p.badges.includes(tr.badge)) {
          p.badges.push(tr.badge); up.log.push({ t: 'text', text: `${ITEMS[tr.badge].name}을(를) 받았다!` });
          for (const sk of Object.values(SKILLS)) if (sk.badge === tr.badge) up.log.push({ t: 'text', text: `이제 필드에서 비전 기술 「${sk.name}」을(를) 쓸 수 있다! (${sk.look.replace(/\.$/, '')} 앞에서 E)` });
          const newRecipes = syncAutoRecipes(p);
          if (newRecipes.length) {
            up.log.push({ t: 'text', text: `🍳 새 요리 · 제작법 해금: ${newRecipes.map((rid) => ITEMS[RECIPES[rid].out]?.name ?? rid).join(', ')}!` });
          }
        }
        if (st.trainerId === 'champion' && first) up.log.push({ t: 'text', text: '축하합니다! 루미 리그 챔피언이 되었다 — 이제 당신이 루미 마스터!' }, { t: 'text', text: '(별마루산 꼭대기 별의 제단에서 무언가가 기다리고 있다…)' });
        if (st.trainerId === 'champion_ex' && first) {
          this.addItem(p, 'origin_ball', 1); this.changed(p);
          up.log.push({ t: 'text', text: '태초볼을 받았다! (어떤 루미든 반드시 잡히는 볼)' });
        }
        if (st.eventId && EVENTS[st.eventId]?.give) for (const [it, n] of Object.entries(EVENTS[st.eventId].give!)) if (ITEMS[it]) up.log.push({ t: 'text', text: `${ITEMS[it].name}${n > 1 ? ` ×${n}` : ''}을(를) 받았다!` });
        this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta: tr.reward });
      }
      if (up.ended === 'lose') {
        const lost = Math.floor(p.gold * 0.1);
        p.gold -= lost;
        healAll(p.party);
        const to = this.nearestTown(p);
        up.log.push({ t: 'text', text: '눈앞이 캄캄해졌다...' }, { t: 'text', text: `정신을 차려 보니 ${REGION_MAPS[to.map]?.name ?? '마을'}이었다. (${lost}G를 잃어버렸다)` });
        this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta: -lost });
        // 가장 가까운 마을 센터/광장 앞으로 (클라이언트는 배틀 연출이 끝난 뒤 방 이동을 처리)
        this.battles.delete(p.id);
        p.world = p.homeWorld;
        this.toSpawn(p, to.map, '', to.spawn);
      }
    }
    this.emitParty(p);
    return { ok: true, battle: up };
  }

  private fish(p: PlayerState, tx: number, ty: number): ActionResult {
    const m = this.maps[p.map];
    const rod = this.bestTool(p, 'rod');
    if (rod < 0) return { ok: false, reason: 'no-rod' };
    this.wear(p, rod);
    if (m.terrainAt(tx, ty) !== '2') return { ok: false, reason: 'not-water' };
    const T = m.tile; if (Math.hypot(tx + 0.5 - p.x / T, ty + 0.5 - (p.y - 4) / T) > 3) return { ok: false, reason: 'far' };
    const table = ENCOUNTERS.fish[p.map]; if (!table) return { ok: false, reason: 'no-fish' };
    if (!this.spend(p, 2)) return { ok: false, reason: 'tired' };
    this.changed(p);
    const fishHelp = this.helps(p) === 'fish';
    const lumiWeight = table.lumi.reduce((a, r) => a + r[3], 0), itemWeight = table.items.reduce((a, r) => a + r[1], 0);
    if (this.canBattle(p) && this.rand() * (lumiWeight + itemWeight) < lumiWeight) {
      const [sp, lo, hi] = this.pick(table.lumi, (r) => r[3]);
      const { state, update } = this.engine.startWild(p, sp, lo + Math.floor(this.rand() * (hi - lo + 1)), 'water');
      update.log.unshift({ t: 'text', text: '앗! 물고기가 아니라 루미가 걸렸다!' });
      this.battles.set(p.id, state);
      return { ok: true, battle: update };
    }
    // 낚시형 파트너 · 든든함 버프: 희귀/특산 물고기 가중치 보너스
    const wellFed = foodStatusOf(p).wellFed;
    const [item] = this.pick(table.items, ([id, w]) => {
      let mult = 1;
      if (fishHelp && ITEMS[id].sellPrice >= 90) mult *= 2;
      if (wellFed && ITEMS[id].sellPrice >= 80) mult *= 1.35;
      return w * mult;
    });
    if (!this.addItem(p, item, 1)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[item].name}을(를) 낚았다!`, icon: item });
    this.recordDex(p, item, 1);
    if (fishHelp) this.help(p, `${SPECIES[p.party[0].species].name}이(가) 물고기 냄새를 맡고 도와줬어요!`);
    return { ok: true, data: { item, qty: 1 } };
  }

  private mine(p: PlayerState, objectId: number): ActionResult {
    const m = this.maps[p.map];
    const o = m.objects.find((ob) => ob.id === objectId);
    const onFarm = p.map === 'farm', f = onFarm ? this.farmOf(p) : null;
    const key = `${p.map}:${objectId}`;
    if (!o || (f ? f.removed.has(objectId) : this.removed.has(key))) return { ok: false, reason: 'no-rock' };
    const kind = String(o.properties?.find((pp) => pp.name === 'mine')?.value ?? (o.type === 'rock' || o.type === 'rock_big' ? 'stone' : ''));
    if (!kind) return { ok: false, reason: 'not-minable' };
    const pick = this.bestTool(p, 'pickaxe');
    if (pick < 0) return { ok: false, reason: 'no-pickaxe' };
    const pickPower = ITEMS[p.inventory[pick].itemId!].power ?? 1;
    const T = m.tile; if (Math.hypot(o.x / T - p.x / T, o.y / T - 0.5 - (p.y - 4) / T) > 2.85) return { ok: false, reason: 'far' };
    const table = ENCOUNTERS.ore[kind] ?? [];
    const primary = table[0]?.[0];
    if (primary && !p.inventory.some((s) => !s.itemId || (s.itemId === primary && s.quantity < (ITEMS[primary]?.maxStack ?? 99)))) {
      this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요! 출하 상자나 상점에서 정리해 주세요.' });
      return { ok: false, reason: 'full' };
    }
    const mineHelp = this.helps(p) === 'mine';
    if (!this.spend(p, Math.max(1, (mineHelp ? 2 : 3) - (pickPower >= 3 ? 1 : 0)))) return { ok: false, reason: 'tired' };
    this.wear(p, pick);
    const got: string[] = [];
    const gotIds: [string, number][] = [];
    for (const [item, lo, hi, chance] of table) {
      if (this.rand() * 100 > chance) continue;
      const qty = lo + Math.floor(this.rand() * (hi - lo + 1)) + (mineHelp && item !== 'stone' ? 1 : 0) + (pickPower >= 2 && item !== 'stone' && this.rand() < 0.3 * (pickPower - 1) ? 1 : 0);
      if (this.addItem(p, item, qty)) {
        got.push(`${ITEMS[item].name} ×${qty}`);
        gotIds.push([item, qty]);
      }
    }
    // 지역 특산 광물 · 석탄 추가 산출
    const regDrops = rollRegionalMineralDrops(p.map, pickPower, mineHelp, foodStatusOf(p).wellFed, () => this.rand());
    for (const rd of regDrops) {
      if (this.addItem(p, rd.item, rd.qty)) {
        got.push(`✨${ITEMS[rd.item].name} ×${rd.qty}`);
        gotIds.push([rd.item, rd.qty]);
      }
    }
    if (f) f.removed.add(objectId); else { this.removed.add(key); this.oreBack.set(key, Date.now() + ORE_RESPAWN_MS); }
    this.emit({ type: 'objectRemoved', key, owner: f?.owner });
    this.changed(p);
    if (got.length) this.emit({ type: 'toast', playerId: p.id, text: `${got.join(', ')} 획득!`, icon: gotIds[gotIds.length - 1]?.[0] ?? 'stone' });
    for (const [gid, gqty] of gotIds) this.recordDex(p, gid, gqty);
    if (mineHelp) this.help(p, `${SPECIES[p.party[0].species].name}이(가) 바위를 달궈 광석을 더 캐냈어요!`);
    return { ok: true, anim: 'pick' };
  }

  private spawnForage() {
    this.forage = [];
    for (const [mapId, items] of Object.entries(ENCOUNTERS.forage)) {
      const m = this.maps[mapId as MapId]; if (!m) continue;
      const spots = m.spawnList.filter((s) => s.name === 'forage');
      spots.forEach((s, i) => { if (this.rand() < 0.55) this.forage.push({ key: `${mapId}:${i}`, map: mapId as MapId, x: s.x, y: s.y, item: items[Math.floor(this.rand() * items.length)] }); });
    }
  }
  private pickForage(p: PlayerState, key: string): ActionResult {
    const i = this.forage.findIndex((f) => f.key === key);
    if (i < 0) return { ok: false, reason: 'gone' };
    const f = this.forage[i];
    if (f.map !== p.map || Math.hypot(f.x - p.x, f.y - p.y) > 40) return { ok: false, reason: 'far' };
    const qty = this.helps(p) === 'forage' ? 2 : 1;
    if (!this.addItem(p, f.item, qty)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    this.forage.splice(i, 1);
    this.changed(p);
    this.emit({ type: 'forage', spots: [...this.forage] });
    this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[f.item].name} ×${qty} 채집!`, icon: f.item });
    if (qty > 1) this.help(p, `${SPECIES[p.party[0].species].name}이(가) 하나 더 찾아냈어요!`);
    return { ok: true, anim: 'interact' };
  }

  // ── 관리자 전용 (서버가 관리자 계정을 확인한 뒤에만 호출) ──
  teleport(p: PlayerState, map: MapId, inst: string, world: string, x: number, y: number) { this.battles.delete(p.id); p.world = world; this.relocate(p, map, inst, x, y); }
  warpTo(p: PlayerState, map: MapId) {
    const m = this.maps[map]; if (!m) return false;
    const s = m.spawns.get('player') ?? m.spawns.get('entry');
    if (!s) return false;
    this.teleport(p, map, map === 'farm' || isHomeMap(map) ? p.id : '', p.world, s.x, s.y + 5);
    return true;
  }
  grant(p: PlayerState, itemId: string, qty: number) {
    if (!Object.prototype.hasOwnProperty.call(ITEMS, itemId) || !Number.isFinite(qty)) return false;
    const n = Math.max(1, Math.min(999, Math.floor(qty)));
    const ok = this.addItem(p, itemId, n);
    if (ok) { this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory }); this.emitParty(p); this.emit({ type: 'toast', playerId: p.id, text: `관리자에게서 ${ITEMS[itemId].name} ×${n}을(를) 받았어요!`, icon: ITEMS[itemId].icon }); }
    return ok;
  }
  grantGold(p: PlayerState, amount: number) {
    if (!Number.isFinite(amount)) return false;
    const n = Math.max(-1_000_000, Math.min(1_000_000, Math.floor(amount)));
    p.gold = Math.max(0, p.gold + n);
    this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta: n });
    return true;
  }

  // ── 안티치트 · 별빛 교도소 탈옥 · 휴대폰 고지서 · 제재 ─────────
  pushNotice(p: PlayerState, notice: Omit<PlayerNotice, 'id' | 'at'>) {
    const item: PlayerNotice = {
      ...notice,
      id: `ntc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      at: Date.now(),
      read: false,
    };
    const list = (p.notices ??= []);
    list.unshift(item);
    if (list.length > 40) list.length = 40;
    this.emit({ type: 'notices', playerId: p.id, notices: list.map((x) => ({ ...x })) });
  }

  private markNoticesRead(p: PlayerState): ActionResult {
    const list = (p.notices ??= []);
    for (const n of list) n.read = true;
    this.emit({ type: 'notices', playerId: p.id, notices: list.map((x) => ({ ...x })) });
    return { ok: true };
  }

  /** 비정상 재화 치트 적발 → 즉시 수감 상태 기록 + 1초 과부하 프리징/알림 이벤트 송출 */
  flagCheater(p: PlayerState, reason = '비정상 재화 증가 치트 감지'): ActionResult {
    const cleanReason = String(reason || '비정상 재화 증가 치트 감지').slice(0, 120);
    p.jailed = true;
    p.jailReason = cleanReason;
    p.jailFine = true;
    p.jailPrevGold = Math.max(p.gold, p.jailPrevGold ?? 0);
    p.jailPrevCash = Math.max(p.cash ?? 0, p.jailPrevCash ?? 0);
    p.prisonMined = 0;
    this.battles.delete(p.id);
    if (this.maps.in_prison) {
      const cell = this.maps.in_prison.spawns.get('entry') ?? this.maps.in_prison.spawns.get('player') ?? { x: 56, y: 296 };
      p.map = 'in_prison';
      p.inst = '';
      p.x = cell.x;
      p.y = cell.y + 5;
      p.dir = 'right';
      p.ret = undefined;
      p.cleared = [];
    }
    this.emit({ type: 'cheatFreeze', playerId: p.id, message: 'your are bad cheater', reason: cleanReason });
    return { ok: true };
  }

  /** 관리자 또는 시스템이 플레이어를 별빛 교도소로 즉시 수감 */
  jailPlayer(p: PlayerState, reason = '관리자 제재 수감', fine = true): boolean {
    if (!this.maps.in_prison) return false;
    this.battles.delete(p.id);
    p.jailed = true;
    p.jailReason = String(reason || '관리자 제재 수감').slice(0, 120);
    p.jailFine = fine;
    p.jailPrevGold = Math.max(p.gold, p.jailPrevGold ?? 0);
    p.jailPrevCash = Math.max(p.cash ?? 0, p.jailPrevCash ?? 0);
    p.prisonMined = 0;
    this.toSpawn(p, 'in_prison', '', 'entry');
    this.emit({ type: 'prisonState', playerId: p.id, jailed: true, mined: 0, goal: PRISON_MINE_GOAL, reason: p.jailReason });
    this.pushNotice(p, {
      kind: 'punish',
      title: '⛓️ 별빛 교도소 수감 통지서',
      body: `사유: ${p.jailReason}\n\n별빛 교도소에 수감되었습니다.\n감시관의 시야를 피해 감옥 광석 ${PRISON_MINE_GOAL}개를 채광한 뒤 북동쪽 탈출 해치로 탈옥하세요.${fine ? '\n(※ 탈옥 시 벌금 집행으로 골드·캐쉬가 0원으로 초기화됩니다.)' : ''}`,
    });
    this.emit({ type: 'toast', playerId: p.id, text: `⛓️ 별빛 교도소에 수감되었습니다! (${p.jailReason})`, icon: 'heart' });
    return true;
  }

  /** 관리자 석방 (벌금 몰수 없이 원래 마을로 복귀) */
  unjailPlayer(p: PlayerState): boolean {
    p.jailed = false;
    p.jailReason = undefined;
    p.jailFine = undefined;
    p.jailPrevGold = undefined;
    p.jailPrevCash = undefined;
    p.prisonMined = 0;
    p.prisonSlabs = 0;
    p.prisonPlanks = 0;
    this.emit({ type: 'prisonState', playerId: p.id, jailed: false, mined: 0, goal: PRISON_MINE_GOAL });
    if (isPrisonMap(p.map)) this.toSpawn(p, 'town', '', 'from_farm');
    this.pushNotice(p, {
      kind: 'system',
      title: '🔓 석방 통지서',
      body: '관리자 권한으로 별빛 교도소 수감이 해제되었습니다. 별빛 마을로 복귀합니다.',
    });
    this.emit({ type: 'toast', playerId: p.id, text: '🔓 관리자 권한으로 석방되었어요!', icon: 'heart' });
    return true;
  }

  /** 채팅 금지 부여 (인게임 접속 중일 때만 시간이 흐름) */
  mutePlayer(p: PlayerState, minutes: number, reason = ''): boolean {
    const mins = Math.max(1, Math.min(10_080, Math.round(minutes)));
    p.muteRemainingSec = mins * 60;
    this.muteSyncAcc.set(p.id, 0);
    this.emit({ type: 'mute', playerId: p.id, muteRemainingSec: p.muteRemainingSec });
    this.pushNotice(p, {
      kind: 'punish',
      title: '🔇 채팅 금지 처분 안내',
      body: `채팅 금지 시간: ${mins}분 (인게임 접속 중일 때만 시간이 차감됩니다)\n${reason ? `사유: ${reason}` : '사유: 신고 접수에 따른 관리자 제재'}`,
    });
    this.emit({ type: 'toast', playerId: p.id, text: `🔇 ${mins}분간 채팅이 금지되었습니다. (접속 중일 때만 시간 감소)`, icon: 'heart' });
    return true;
  }

  /** 채팅 금지 해제 */
  unmutePlayer(p: PlayerState): boolean {
    p.muteRemainingSec = 0;
    this.muteSyncAcc.delete(p.id);
    this.emit({ type: 'mute', playerId: p.id, muteRemainingSec: 0 });
    this.emit({ type: 'toast', playerId: p.id, text: '🔊 관리자에 의해 채팅 금지가 해제되었어요.', icon: 'heart' });
    return true;
  }

  /** 별빛 교도소 탈옥 미니게임: 감옥 광석 채광 */
  private prisonMine(p: PlayerState, objectId: number): ActionResult {
    if (p.map !== 'in_prison') return { ok: false, reason: 'wrong-map' };
    const m = this.maps.in_prison;
    const o = m?.objects.find((ob) => ob.id === objectId && (ob.type === 'prison_ore' || String(oprop(ob, 'interact') ?? '') === 'prison_ore'));
    if (!o) return { ok: false, reason: 'not-ore' };
    const T = m.tile;
    const cx = Number(oprop(o, 'cellX') ?? Math.floor(o.x / T));
    const cy = Number(oprop(o, 'cellY') ?? Math.floor(o.y / T) - 1);
    if (!this.inReach(p, cx, cy)) return { ok: false, reason: 'far' };
    const key = `in_prison:${o.id}`;
    const cleared = (p.cleared ??= []);
    if (cleared.includes(key)) return { ok: false, reason: 'already' };
    cleared.push(key);
    p.prisonMined = (p.prisonMined ?? 0) + 1;
    this.emit({ type: 'cleared', playerId: p.id, key });
    this.emit({ type: 'prisonState', playerId: p.id, jailed: !!p.jailed, mined: p.prisonMined, goal: PRISON_MINE_GOAL, reason: p.jailReason });
    if (p.prisonMined >= PRISON_MINE_GOAL) {
      this.emit({ type: 'toast', playerId: p.id, text: `⛏ 탈옥 채광 완료 (${p.prisonMined}/${PRISON_MINE_GOAL})! 북동쪽 녹색 탈출 해치로 이동하세요!`, icon: 'pickaxe' });
    } else {
      this.emit({ type: 'toast', playerId: p.id, text: `⛏ 감옥 광석 채광 성공! (${p.prisonMined}/${PRISON_MINE_GOAL})`, icon: 'pickaxe' });
    }
    return { ok: true, anim: 'pick', data: { qty: p.prisonMined } };
  }

  /** 별빛 교도소: 금이 간 벽 부수기 (지하 5층 ~ 지상 1층 전 층 공용) */
  private prisonBreakWall(p: PlayerState, objectId: number): ActionResult {
    if (!isPrisonMap(p.map) || p.map === 'in_prison_yard') return { ok: false, reason: 'wrong-map' };
    const m = this.maps[p.map];
    const o = m?.objects.find((ob) => ob.id === objectId && (ob.type === 'cracked_wall' || String(oprop(ob, 'interact') ?? '') === 'prison_wall'));
    if (!o) return { ok: false, reason: 'not-wall' };
    const T = m.tile;
    const cx = Number(oprop(o, 'cellX') ?? Math.floor(o.x / T));
    const cy = Number(oprop(o, 'cellY') ?? Math.floor(o.y / T) - 1);
    if (!this.inReach(p, cx, cy)) return { ok: false, reason: 'far' };
    const key = `${p.map}:${o.id}`;
    const cleared = (p.cleared ??= []);
    if (cleared.includes(key)) return { ok: false, reason: 'already' };
    cleared.push(key);
    this.emit({ type: 'cleared', playerId: p.id, key });
    this.emit({ type: 'toast', playerId: p.id, text: '💥 금이 간 벽을 부숴 통로를 열었어요! 경찰 감시관을 피해 위층 계단으로 올라가세요!', icon: 'pickaxe' });
    return { ok: true, anim: 'pick' };
  }

  /** 별빛 교도소: 철제 계단으로 위층 올라가기 (B5 → B4 → B3 → B2 → B1 → 1F) */
  private prisonAscend(p: PlayerState, to: MapId): ActionResult {
    if (!isPrisonMap(p.map) || PRISON_NEXT_FLOOR[p.map] !== to || !this.maps[to]) return { ok: false, reason: 'wrong-floor' };
    const m = this.maps[p.map];
    const st = m?.objects.find((ob) => ob.type === 'prison_stairs_up');
    if (st) {
      const T = m.tile;
      const sx = (Number(oprop(st, 'cellX') ?? Math.floor(st.x / T)) + 0.5) * T;
      const sy = (Number(oprop(st, 'cellY') ?? Math.floor(st.y / T) - 1) + 0.5) * T;
      if (Math.hypot(p.x - sx, p.y - sy) > T * 2.6) return { ok: false, reason: 'far' };
    }
    this.toSpawn(p, to, '', 'entry');
    this.emit({ type: 'prisonState', playerId: p.id, jailed: !!p.jailed, mined: p.prisonMined ?? 0, goal: PRISON_MINE_GOAL, reason: p.jailReason });
    this.emit({
      type: 'toast',
      playerId: p.id,
      text: to === 'in_prison_1f'
        ? '☀️ 지상 1층에 도착했어요! 북쪽의 빛이 새는 금이 간 외벽을 부수면 탈옥 성공!'
        : `🪜 ${PRISON_FLOOR_LABEL[to] ?? to}(으)로 올라왔어요!`,
      icon: 'pickaxe',
    });
    return { ok: true };
  }

  /** 성실 노역 루트: 지하 5층 독방 대기 후 노역 채광장으로 이동 */
  private prisonEnterYard(p: PlayerState): ActionResult {
    if (!p.jailed || p.map !== 'in_prison' || !this.maps.in_prison_yard) return { ok: false, reason: 'wrong-map' };
    this.toSpawn(p, 'in_prison_yard', '', 'entry');
    this.emit({ type: 'prisonLabor', playerId: p.id, slabs: p.prisonSlabs ?? 0, planks: p.prisonPlanks ?? 0, goal: PRISON_LABOR_GOAL });
    this.emit({ type: 'toast', playerId: p.id, text: '⛏️ 노역 채광장 도착! 돌·나무를 캐서 석판 100개 · 나무판 100개를 만들어 납품하세요.', icon: 'pickaxe' });
    return { ok: true };
  }

  /** 노역 채광장에서 지하 5층 독방으로 복귀 */
  private prisonBackCell(p: PlayerState): ActionResult {
    if (!p.jailed || p.map !== 'in_prison_yard' || !this.maps.in_prison) return { ok: false, reason: 'wrong-map' };
    this.toSpawn(p, 'in_prison', '', 'entry');
    this.emit({ type: 'toast', playerId: p.id, text: '⛓️ 지하 5층 독방으로 돌아왔어요.', icon: 'heart' });
    return { ok: true };
  }

  /** 노역 채광장: 돌 / 나무 무한 채집 (1회 +10개, 3.5초 뒤 자동 재생성) */
  private yardGather(p: PlayerState, objectId: number, resource: 'stone' | 'wood'): ActionResult {
    if (p.map !== 'in_prison_yard') return { ok: false, reason: 'wrong-map' };
    const m = this.maps.in_prison_yard;
    const expectType = resource === 'stone' ? 'yard_stone' : 'yard_wood';
    const o = m?.objects.find((ob) => ob.id === objectId && ob.type === expectType);
    if (!o) return { ok: false, reason: 'not-resource' };
    const T = m.tile;
    const cx = Number(oprop(o, 'cellX') ?? Math.floor(o.x / T));
    const cy = Number(oprop(o, 'cellY') ?? Math.floor(o.y / T) - 1);
    if (!this.inReach(p, cx, cy)) return { ok: false, reason: 'far' };
    const key = `in_prison_yard:${o.id}`;
    const cleared = (p.cleared ??= []);
    if (cleared.includes(key)) return { ok: false, reason: 'cooldown' };
    const qty = 1;
    if (!this.addItem(p, resource, qty)) {
      this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요! 작업대에서 석판/나무판을 제작하거나 납품해 주세요.' });
      return { ok: false, reason: 'full' };
    }
    cleared.push(key);
    this.yardRespawns.push({ playerId: p.id, key, at: Date.now() + 3500 });
    this.changed(p);
    this.emit({ type: 'cleared', playerId: p.id, key });
    this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[resource].name} +${qty} 획득!`, icon: ITEMS[resource].icon });
    return { ok: true, anim: resource === 'stone' ? 'pick' : 'axe', data: { item: resource, qty } };
  }

  /** 노역 채광장 작업대: 돌 → 석판 / 나무 → 나무판 제작 */
  private yardCraft(p: PlayerState, out: 'stone_slab' | 'wood_plank', qty: number): ActionResult {
    if (p.map !== 'in_prison_yard') return { ok: false, reason: 'wrong-map' };
    const src = out === 'stone_slab' ? 'stone' : 'wood';
    const costPer = 5;
    const have = this.countItem(p, src);
    const req = Math.max(1, Math.min(PRISON_LABOR_GOAL, Math.floor(Number(qty) || 1)));
    const n = Math.min(req, Math.floor(have / costPer));
    if (n <= 0) return { ok: false, reason: 'no-materials' };
    this.takeItem(p, src, n * costPer);
    if (!this.addItem(p, out, n)) {
      this.addItem(p, src, n * costPer);
      return { ok: false, reason: 'full' };
    }
    this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `🔨 ${ITEMS[out].name} ×${n} 제작 완료!`, icon: ITEMS[out].icon });
    return { ok: true, data: { item: out, qty: n } };
  }

  /** 노역 채광장 납품함: 석판·나무판 납품 (둘 다 100개 달성 시 정식 석방 + 엄마 귀가 연출!) */
  private yardDeliver(p: PlayerState): ActionResult {
    if (p.map !== 'in_prison_yard') return { ok: false, reason: 'wrong-map' };
    let slabs = p.prisonSlabs ?? 0;
    let planks = p.prisonPlanks ?? 0;
    const haveSlab = this.countItem(p, 'stone_slab');
    const havePlank = this.countItem(p, 'wood_plank');
    const addSlab = Math.min(haveSlab, Math.max(0, PRISON_LABOR_GOAL - slabs));
    const addPlank = Math.min(havePlank, Math.max(0, PRISON_LABOR_GOAL - planks));
    if (addSlab <= 0 && addPlank <= 0 && (slabs < PRISON_LABOR_GOAL || planks < PRISON_LABOR_GOAL)) {
      return { ok: false, reason: 'nothing' };
    }
    if (addSlab > 0) { this.takeItem(p, 'stone_slab', addSlab); slabs += addSlab; }
    if (addPlank > 0) { this.takeItem(p, 'wood_plank', addPlank); planks += addPlank; }
    p.prisonSlabs = slabs;
    p.prisonPlanks = planks;
    this.changed(p);
    this.emit({ type: 'prisonLabor', playerId: p.id, slabs, planks, goal: PRISON_LABOR_GOAL });

    // 석판 100 + 나무판 100 완납 → 성실 정식 석방!
    if (slabs >= PRISON_LABOR_GOAL && planks >= PRISON_LABOR_GOAL) {
      const fine = p.jailFine !== false;
      const reason = p.jailReason || '규정 위반 노역 완납';
      const prevGold = Math.max(p.gold, p.jailPrevGold ?? 0);
      const prevCash = Math.max(p.cash ?? 0, p.jailPrevCash ?? 0);
      p.jailed = false;
      p.prisonSlabs = 0;
      p.prisonPlanks = 0;
      p.prisonMined = 0;
      p.evilStack = 0;
      p.momLeft = false;
      p.pendingHomecoming = 'honest';
      p.jailReason = undefined;
      p.jailFine = undefined;
      p.jailPrevGold = undefined;
      p.jailPrevCash = undefined;
      if (fine) {
        const deltaGold = -p.gold;
        p.gold = 0;
        p.cash = 0;
        this.emit({ type: 'gold', playerId: p.id, gold: 0, delta: deltaGold });
        this.emitBm(p);
        this.pushNotice(p, {
          kind: 'fine',
          title: '⚖️ 별빛 치안국 석방 · 벌금 정산 고지서',
          body: `사유: ${reason}\n\n노역 석판 100개 · 나무판 100개를 성실히 완납하여 정식 석방되었습니다.\n규정에 따라 기존 재화는 0원으로 정산되었습니다.\n\n· 보유 골드: ${prevGold.toLocaleString('ko-KR')}G → 0G\n· 보유 캐쉬: ${prevCash.toLocaleString('ko-KR')}원 → 0원`,
          prevGold,
          prevCash,
        });
      }
      this.emit({ type: 'prisonState', playerId: p.id, jailed: false, mined: 0, goal: PRISON_MINE_GOAL });
      this.emit({ type: 'karma', playerId: p.id, evilStack: 0, momLeft: false, pendingHomecoming: 'honest' });
      // 집 안으로 바로 입장하여 엄마와의 감동 귀가 연출 재생!
      p.world = p.homeWorld;
      const hEntry = this.maps.home.spawns.get('entry') ?? { x: 120, y: 152 };
      const door = this.homeDoor();
      this.relocate(p, 'home', p.id, hEntry.x, hEntry.y + 5);
      p.ret = { map: 'farm', inst: p.id, x: door.x, y: door.y };
      this.emit({ type: 'toast', playerId: p.id, text: '🔓 석판 100개 · 나무판 100개 완납! 정식으로 석방되어 집으로 돌아갑니다.', icon: 'heart' });
      return { ok: true, data: { qty: PRISON_LABOR_GOAL } };
    }

    this.emit({
      type: 'toast',
      playerId: p.id,
      text: `📦 납품 완료! 석판 ${slabs}/${PRISON_LABOR_GOAL} · 나무판 ${planks}/${PRISON_LABOR_GOAL}`,
      icon: 'stone_slab',
    });
    return { ok: true, data: { qty: addSlab + addPlank } };
  }

  /** 경찰 감시관에게 붙잡힘 → 어느 층에 있든 지하 5층 독방 원점으로 즉시 압송! */
  private prisonCaught(p: PlayerState): ActionResult {
    if (!isPrisonMap(p.map) || p.map === 'in_prison_yard') return { ok: false, reason: 'wrong-map' };
    const restoreKeys = [...(p.cleared ?? [])];
    p.cleared = [];
    p.prisonMined = 0;
    const cell = this.maps.in_prison.spawns.get('entry') ?? this.maps.in_prison.spawns.get('player') ?? { x: 56, y: 200 };
    if (p.map !== 'in_prison') {
      this.toSpawn(p, 'in_prison', '', 'entry');
    } else {
      p.x = cell.x;
      p.y = cell.y + 5;
      p.dir = 'right';
      if (restoreKeys.length) this.emit({ type: 'objectRestored', playerId: p.id, keys: restoreKeys });
    }
    this.emit({ type: 'prisonState', playerId: p.id, jailed: !!p.jailed, mined: 0, goal: PRISON_MINE_GOAL, reason: p.jailReason });
    this.emit({ type: 'toast', playerId: p.id, text: '🚨 경찰 감시관에게 붙잡혔다! 지하 5층 독방 원점으로 되돌아갑니다!', icon: 'heart' });
    return { ok: true };
  }

  /** 지상 1층 외벽 파괴 불법 탈옥 → 0원 초기화 + 벌금 고지서 + 악행스택 100 + 엄마 가출 */
  private prisonEscape(p: PlayerState): ActionResult {
    if (p.map !== 'in_prison_1f') return { ok: false, reason: 'need-1f' };
    const m = this.maps.in_prison_1f;
    const wall = m?.objects.find((ob) => ob.type === 'prison_exit_wall' || String(oprop(ob, 'interact') ?? '') === 'prison_escape_wall');
    if (wall) {
      const T = m.tile;
      const hx = (Number(oprop(wall, 'cellX') ?? Math.floor(wall.x / T)) + 1) * T;
      const hy = (Number(oprop(wall, 'cellY') ?? Math.floor(wall.y / T) - 1) + 0.5) * T;
      if (Math.hypot(p.x - hx, p.y - hy) > T * 3.0) return { ok: false, reason: 'far' };
    }
    const fine = p.jailFine !== false;
    const reason = p.jailReason || '비정상 재화 변조 / 규정 위반';
    const prevGold = Math.max(p.gold, p.jailPrevGold ?? 0);
    const prevCash = Math.max(p.cash ?? 0, p.jailPrevCash ?? 0);
    p.jailed = false;
    p.prisonMined = 0;
    p.prisonSlabs = 0;
    p.prisonPlanks = 0;
    p.jailReason = undefined;
    p.jailFine = undefined;
    p.jailPrevGold = undefined;
    p.jailPrevCash = undefined;
    // 불법 탈옥 페널티: 악행스택 100 + 엄마가 집을 떠남!
    p.evilStack = EVIL_STACK_MAX;
    p.momLeft = true;
    p.pendingHomecoming = '';
    p.lastHelpedNpc = undefined;
    if (fine) {
      const deltaGold = -p.gold;
      p.gold = 0;
      p.cash = 0;
      this.emit({ type: 'gold', playerId: p.id, gold: 0, delta: deltaGold });
      this.emitBm(p);
      this.pushNotice(p, {
        kind: 'fine',
        title: '⚖️ 별빛 치안국 벌금 고지서',
        body: `처분 사유: ${reason} (+ 불법 탈옥)\n\n지상 1층 외벽 파괴 탈옥이 확인되어 벌금 집행으로 계정의 모든 재화가 0원으로 초기화되었습니다.\n\n· 보유 골드: ${prevGold.toLocaleString('ko-KR')}G → 0G\n· 보유 캐쉬: ${prevCash.toLocaleString('ko-KR')}원 → 0원\n· 악행스택: +100 (마을 사람들을 도와 0으로 줄여야 신뢰를 되찾을 수 있습니다)`,
        prevGold,
        prevCash,
      });
    }
    this.emit({ type: 'prisonState', playerId: p.id, jailed: false, mined: 0, goal: PRISON_MINE_GOAL });
    this.emit({ type: 'karma', playerId: p.id, evilStack: p.evilStack, momLeft: true, pendingHomecoming: '' });
    this.toSpawn(p, 'town', '', 'from_farm');
    this.emit({
      type: 'toast',
      playerId: p.id,
      text: '🚨 1층 외벽을 부수고 탈옥 성공! 골드·캐쉬가 0원이 되고 악행스택 100이 쌓였습니다. 집으로 가 엄마를 확인해 보세요…',
      icon: 'heart',
    });
    return { ok: true };
  }

  /** 엄마 귀가 컷신 완료 → 따뜻한 두부 한 모 지급 */
  private completeHomecoming(p: PlayerState): ActionResult {
    const mode = p.pendingHomecoming;
    if (!mode) return { ok: false, reason: 'none' };
    p.pendingHomecoming = '';
    this.addItem(p, 'tofu', 1);
    this.changed(p);
    this.emit({ type: 'karma', playerId: p.id, evilStack: p.evilStack ?? 0, momLeft: !!p.momLeft, pendingHomecoming: '' });
    this.emit({ type: 'toast', playerId: p.id, text: '🍽️ 엄마에게서 따뜻한 두부 한 모를 받았어요!', icon: 'tofu' });
    return { ok: true, data: { item: 'tofu', qty: 1 } };
  }

  /** 마을 사람을 한 명 한 명 도와 선행스택 +1 (악행스택 100 → 0 달성 시 엄마 복귀!) */
  private goodDeed(p: PlayerState, npc: string): ActionResult {
    const cur = p.evilStack ?? 0;
    if (cur <= 0) return { ok: false, reason: 'clean' };
    const npcId = String(npc || '').trim().slice(0, 64);
    if (!npcId) return { ok: false, reason: 'no-npc' };
    if (p.lastHelpedNpc === npcId) return { ok: false, reason: 'same-npc' };
    p.evilStack = Math.max(0, cur - 1);
    p.lastHelpedNpc = npcId;
    if (p.evilStack === 0 && p.momLeft) {
      p.momLeft = false;
      p.pendingHomecoming = 'mom_returned';
      this.pushNotice(p, {
        kind: 'system',
        title: '💌 엄마에게서 온 편지',
        body: '마을 사람들이 네가 얼마나 성실하게 남을 돕고 변했는지 전해 주더구나.\n엄마도 이제 마음을 풀고 집으로 돌아왔단다. 얼른 집으로 돌아오렴.',
      });
      this.emit({ type: 'toast', playerId: p.id, text: '✨ 악행스택이 0이 되었어요! 엄마가 집으로 돌아오셨습니다! 집으로 가 보세요!', icon: 'heart' });
    } else {
      this.emit({ type: 'toast', playerId: p.id, text: `🤝 선행 +1! 남은 악행스택: ${p.evilStack}/${EVIL_STACK_MAX}`, icon: 'heart' });
    }
    this.emit({ type: 'karma', playerId: p.id, evilStack: p.evilStack, momLeft: !!p.momLeft, pendingHomecoming: p.pendingHomecoming, lastHelpedNpc: p.lastHelpedNpc });
    return { ok: true, data: { qty: p.evilStack } };
  }
  setTimeMinutes(minutes: number) {
    const clamped = Math.max(DAY_START, Math.min(DAY_END - 10, Math.round(minutes / 10) * 10));
    this.time = { ...this.time, minutes: clamped };
    this.acc = 0;
    this.emit({ type: 'time', time: { ...this.time } });
    if (!isCasinoOpen(this.time.minutes)) {
      for (const p of this.players.values()) {
        if (p.map !== 'in_casino') continue;
        const ret = p.ret && this.maps[p.ret.map] && !isInterior(p.ret.map) ? p.ret : null;
        if (ret) this.relocate(p, ret.map, ret.inst, ret.x, ret.y);
        else { const nt = this.nearestTown(p); this.toSpawn(p, nt.map, '', nt.spawn); }
        this.emit({ type: 'toast', playerId: p.id, text: '☀️ 낮 시간이 되어 별빛 카지노가 영업을 마쳤어요.', icon: 'sun' });
      }
    }
  }

  /** 그 종류 도구 중 가장 좋은 것 (가방 칸 번호, 없으면 -1) */
  bestTool(p: PlayerState, kind: string) {
    let best = -1, bt = -1;
    p.inventory.forEach((s, i) => { const d = s.itemId ? ITEMS[s.itemId] : null; if (d?.tool === kind && (d.tier ?? 0) > bt) { bt = d.tier ?? 0; best = i; } });
    return best;
  }
  /** 도구 한 번 사용 → 내구도 1 감소. 0 이 되면 부서져 사라짐 */
  wear(p: PlayerState, idx: number) {
    const s = p.inventory[idx]; const d = s?.itemId ? ITEMS[s.itemId] : null;
    if (!s || !d?.durability) return;
    s.dur = (s.dur ?? d.durability) - 1;
    if (s.dur === Math.ceil(d.durability * 0.1)) this.emit({ type: 'toast', playerId: p.id, text: `${d.name}이(가) 곧 부서질 것 같아요! (남은 내구도 ${s.dur})`, icon: d.icon });
    if (s.dur <= 0) {
      s.itemId = null; s.quantity = 0; delete s.dur;
      this.emit({ type: 'toast', playerId: p.id, text: `${d.name}이(가) 부서졌어요! 집 작업대에서 다시 만들거나 더 좋은 도구를 만들어 보세요.`, icon: d.icon });
    }
    this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory });
  }

  addItem(p: PlayerState, itemId: string, qty: number) {
    const def = ITEMS[itemId];
    if (!def) return false;
    if (def.type === 'battle') { p.bag[itemId] = (p.bag[itemId] ?? 0) + qty; this.emitParty(p); return true; }
    if (def.type === 'key' && this.countItem(p, itemId) > 0) return true;
    let slot = p.inventory.find((s) => s.itemId === itemId && s.quantity + qty <= def.maxStack);
    if (!slot) slot = p.inventory.find((s) => !s.itemId);
    if (!slot) {
      // 중요한 키 아이템(오카리나·자전거 등)은 가방이 꽉 차도 절대 유실되지 않도록 예비 슬롯 확장
      if (def.type === 'key') {
        slot = { slotIndex: p.inventory.length, itemId: null, quantity: 0 };
        p.inventory.push(slot);
      } else {
        return false;
      }
    }
    slot.itemId = itemId; slot.quantity += qty;
    if (def.durability && slot.dur === undefined) slot.dur = def.durability;
    return true;
  }
}
