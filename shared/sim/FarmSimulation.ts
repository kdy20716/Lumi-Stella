// 권한 있는 농장 시뮬레이션 (Authoritative). 서버와 싱글플레이(LocalAuthority)에서 동일하게 사용.
// 클라이언트는 결과가 아니라 ActionIntent 만 보내고, 여기서 거리/에너지/도구 소지를 검증한 뒤 상태를 바꾼다.
//  - 농장/집은 주인별 인스턴스(초대받은 친구만 함께), 마을·도로·바람골·가게 실내는 모두가 공유
//  - 골드·가방·루미는 플레이어별, 시간·날씨는 서버 전체 공통
import { dexComplete, SKILLS, skillFor, CHAPTERS, CROPS, ENCOUNTERS, EVENTS, HANDS, ITEMS, NPCS, QUESTS, RECIPES, REGION_MAPS, SHOPS, SPECIES, TRAINERS, gateFor, hhmmToMinutes, nextEvent } from '../data';
import { BattleEngine, healAll, makeCreature, type BattleState } from './Battle';
import {
  SoilState, INTERIOR_OF, ALL_PLAYER_LOOKS, isInterior, roomOf, BADGE_GATES, BOND_MAX, BOND_WATER, BOND_ASK_AT,
  type ActionIntent, type ActionResult, type Dish, type FarmSnapshot, type FarmTile, type ForageSpot, type InventorySlot, type MapId,
  type PlacedObject, type PlayerState, type SaveData, type TrainerDef, type WorldTime, type Weather, type BattleUpdate,
} from '../types';
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
const REACH = 1.75;                   // 도구 사거리 (타일)
const INVITE_TTL = 5 * 60_000;

export type SimEvent =
  | { type: 'tile'; owner: string; tile: FarmTile; map?: MapId }
  | { type: 'time'; time: WorldTime }
  | { type: 'gold'; playerId: string; gold: number; delta: number }
  | { type: 'player'; id: string; energy: number; inventory: InventorySlot[] }
  | { type: 'newDay'; time: WorldTime }
  | { type: 'objectRemoved'; key: string; owner?: string }
  | { type: 'objectRestored'; keys: string[] }
  | { type: 'cleared'; playerId: string; key: string }
  | { type: 'opened'; playerId: string; key: string }
  | { type: 'forage'; spots: ForageSpot[] }
  | { type: 'party'; id: string; party: PlayerState['party']; bag: PlayerState['bag']; badges: string[]; defeated: string[]; seen: string[]; caught: string[]; visited: string[]; recipes: string[]; flags: string[]; bonds?: Record<string, number>; asks?: Record<string, number>; stock?: Record<string, Record<string, number>>; opened?: string[] }
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
  | { type: 'unplaced'; owner: string; id: string };

type Listener = (e: SimEvent) => void;
interface FarmState { owner: string; /** 마을 텃밭이면 그 마을 */ map?: MapId; tiles: Map<string, FarmTile>; removed: Set<number>; placed: Map<string, PlacedObject>; dish: Dish | null }
/** 농장 맵 배치 버전: 바뀌면 옛 세이브의 '치운 오브젝트' 목록은 맞지 않으므로 비움 (경작지는 유지) */
const FARM_VER = 2;
/** 지나갈 수 있는 오브젝트 (충돌 없음) */
const NON_BLOCKING = new Set(['tuft', 'tallgrass', 'stairs_up', 'portal', 'glint']);
const TREES = new Set(['oak', 'oak_apple', 'oak_autumn', 'pine', 'pine_snow', 'palm', 'dead_tree']);
const TREE_HITS = 5, STUMP_HITS = 2;
/** 전설 · 환상 (별마루산 꼭대기 별의 제단) */
export const LEGEND = 'byeolmuri', MYTH = 'onnuri', STELLA = 'stella';
/** 레벨에 맞게 진화한 모습 (사건 상대 팀) */
const grownAt = (sp: string, lv: number) => { let s = sp; for (let k = 0; k < 2; k++) { const e = SPECIES[s]?.evolves; if (e && lv >= e.level + 2) s = e.to; } return s; };
/** 캔 광석이 다시 생기기까지 (실제 시간) */
export const ORE_RESPAWN_MS = 3 * 60_000;
const LEGEND_LV = 70, MYTH_LV = 150, STELLA_LV = 60, MASTER_LV = 100;
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

  /** 멀티 서버면 true: 숙소에서 자도 시간이 흐르지 않음 (서버 시계를 모두가 공유) */
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
  private farmOf(p: PlayerState) { return this.ensureFarm(p.map === 'farm' || p.map === 'home' ? p.inst || p.id : p.id); }
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
  addPlayer(id: string, name: string, look = 'player', save?: SaveData | null, world = ''): PlayerState {
    const inv: InventorySlot[] = Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ slotIndex: i, itemId: null, quantity: 0 }));
    // 도구는 마을(소라네 루미 마트)에서 직접 사서 쓰는 것이 시작: 씨앗만 챙겨 줌
    const give = ['seeds_lumi_herb', 'seeds_parsnip', 'seeds_tomato'];
    const qty: Record<string, number> = { seeds_lumi_herb: 10, seeds_parsnip: 8, seeds_tomato: 4 };
    give.forEach((it, i) => { inv[i].itemId = it; inv[i].quantity = qty[it] ?? 1; });
    const home = this.homeSpot();
    const p: PlayerState = {
      id, name, look, map: 'farm', inst: id, x: home.x, y: home.y, dir: 'down', anim: 'idle', energy: 270, maxEnergy: 270, inventory: inv, gold: 500, bin: [], story: STORY.HOME, world, homeWorld: world,
      party: [], box: [], bag: {}, badges: [], defeated: [], seen: [], caught: [], visited: ['farm'], recipes: STARTER_RECIPES(), flags: [],
    };
    if (save) {
      Object.assign(p, {
        name: save.name || name, look: save.look ?? look, gold: save.gold ?? 500, energy: save.energy ?? 270, maxEnergy: save.maxEnergy ?? 270,
        party: save.party ?? [], box: save.box ?? [], bag: save.bag ?? {}, badges: save.badges ?? [], defeated: save.defeated ?? [],
        seen: save.seen ?? [], caught: save.caught ?? [], bin: save.bin ?? [], visited: save.visited ?? ['farm', 'town', ...(save.party?.length ? ['route1', 'windvale'] : [])],
        story: save.story ?? ((save.party ?? []).length ? STORY.DONE : STORY.HOME),
        recipes: [...new Set([...STARTER_RECIPES(), ...(save.recipes ?? [])])],
        flags: save.flags ?? [],
        bonds: save.bonds ?? {}, bondDay: save.bondDay ?? {}, asks: save.asks ?? {}, stock: save.stock ?? {}, opened: save.opened ?? [],
      });
      migrateBag(p.bag);
      if (save.inventory?.length) p.inventory = Array.from({ length: INVENTORY_SIZE }, (_, i) => { const id = save.inventory[i]?.itemId ?? null; const ok = !!id && !!ITEMS[id]; return { slotIndex: i, itemId: ok ? id : null, quantity: ok ? save.inventory[i]?.quantity ?? 0 : 0 }; });
    }
    this.players.set(id, p);
    this.ensureFarm(id, save?.farm);
    for (const [m, tiles] of Object.entries(save?.plots ?? {})) if (this.maps[m]?.farmZones.length) { const f = this.plotOf(id, m); for (const t of tiles) f.tiles.set(`${t.x},${t.y}`, cloneTile(t)); }
    // 마지막 위치에서 이어서: 내 농장 · 집이거나 공용 장소일 때만 (친구 농장 등은 그 친구가 없을 수 있어 내 농장으로)
    const at = save?.pos;
    if (at && p.story !== STORY.HOME && this.maps[at.map]) {
      const own = at.map === 'farm' || at.map === 'home' ? at.inst === id : !(at.inst && this.players.has(at.inst));
      const next = { ...p, map: at.map, inst: own && (at.map === 'farm' || at.map === 'home') ? id : at.inst };
      if (own && Number.isFinite(at.x) && Number.isFinite(at.y) && this.canStand(next, at.x, at.y)) {
        Object.assign(p, { map: next.map, inst: next.inst, x: at.x, y: at.y, dir: at.dir ?? p.dir, ret: at.ret });
      }
    }
    // 아직 프롤로그 첫 장면이면 내 방에서 눈을 뜸
    if (p.story === STORY.HOME) { const w = this.maps.home.spawns.get('wake') ?? this.maps.home.spawns.get('entry')!; Object.assign(p, { map: 'home', inst: id, x: w.x, y: w.y + 5 }); }
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
      if (g.world === id && g.homeWorld !== id) { g.world = g.homeWorld; if (!((g.map === 'farm' || g.map === 'home') && g.inst === id)) this.relocate(g, g.map, g.inst, g.x, g.y); }
      if ((g.map === 'farm' || g.map === 'home') && g.inst === id) {
        this.emit({ type: 'toast', playerId: g.id, text: '농장 주인이 떠나서 마을로 돌아왔어요.', icon: 'heart' });
        this.toSpawn(g, 'town', '', 'from_farm');
      }
    }
    this.farms.delete(id);
    for (const k of [...this.plots.keys()]) if (k.startsWith(`${id}|`)) this.plots.delete(k);
    return save;
  }
  inBattle(id: string) { return this.battles.has(id); }

  private homeSpot() { const s = this.map.spawns.get('player') ?? { x: 368, y: 232 }; return { x: s.x, y: s.y + 5 }; }

  /** 방 이동 (워프/실내/초대/새 날/배틀 패배) → 해당 플레이어에게 새 방의 상태를 보냄 */
  private relocate(p: PlayerState, map: MapId, inst: string, x: number, y: number) {
    p.map = map; p.inst = inst; p.x = x; p.y = y; p.sleeping = false;
    p.cleared = [];   // 비전 기술로 치운 장애물은 맵을 떠나면 다시 생김
    if (map !== 'home' && !isInterior(map)) p.ret = undefined;
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
    const farm = p && (p.map === 'farm' || p.map === 'home') ? this.farmOf(p) : null;
    return {
      time: { ...this.time }, gold: p?.gold ?? 0,
      tiles: farm && p?.map === 'farm' ? [...farm.tiles.values()].map(cloneTile) : p && p.map !== 'home' && this.isField(p.map) ? [...this.plotOf(p.id, p.map).tiles.values()].map(cloneTile) : [],
      removedObjects: [...this.removed, ...(farm ? [...farm.removed].map((id) => `farm:${id}`) : [])],
      forage: [...this.forage], dish: farm && p?.map === 'home' ? farm.dish : null,
      placed: farm && p?.map === 'farm' ? [...farm.placed.values()].map((o) => ({ ...o })) : [],
    };
  }

  // ── 시간 ───────────────────────────────────────────
  tick(dtMs: number) {
    this.acc += dtMs;
    this.respawnOres();
    while (this.acc >= MS_PER_10_MIN) {
      this.acc -= MS_PER_10_MIN;
      this.time.minutes += 10;
      this.emit({ type: 'time', time: { ...this.time } });
      if (this.time.minutes >= DAY_END) { this.emit({ type: 'toast', text: '새벽이 지나 새 아침이 밝았어요. (잠을 자면 체력이 회복돼요)', icon: 'sun' }); this.newDay(false, false); }
    }
  }
  /** 캔 광석은 몇 분 뒤 그 자리에 다시 생김 (동굴 파밍) */
  private respawnOres(now = Date.now()) {
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
    this.time = { day: this.time.day + 1, minutes: DAY_START, season: this.time.season, weather };
    if (this.time.day > 28) this.time.day = 1;
    this.acc = 0;
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
        for (const t of this.ensureFarm(p.id).tiles.values()) { if (n >= 6) break; if (t.crop && t.soil !== SoilState.Watered) { t.soil = SoilState.Watered; n++; } }
        if (n) this.emit({ type: 'help', playerId: p.id, species: p.party[0].species, text: `${SPECIES[p.party[0].species].name}이(가) 아침 일찍 작물 ${n}칸에 물을 줬어요!` });
      }
    }
    this.helpersWork(weather);
    // 채석장 바위·채집물 다시 생성
    const restored = [...this.removed].filter((k) => { const [m, id] = k.split(':'); return this.maps[m as MapId]?.objects.some((o) => String(o.id) === id && o.properties?.some((pp) => pp.name === 'mine')); });
    for (const k of restored) this.removed.delete(k);
    if (restored.length) this.emit({ type: 'objectRestored', keys: restored });
    this.spawnForage();
    this.emit({ type: 'forage', spots: [...this.forage] });
    this.emit({ type: 'newDay', time: { ...this.time } });
    // 새 날: 모두 자기 농장 집 앞에서 시작 (루미도 푹 쉼)
    const home = this.homeSpot();
    if (!rest) return;
    for (const p of this.players.values()) {
      p.energy = p.maxEnergy;
      healAll(p.party);
      this.battles.delete(p.id);
      this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory });
      this.emitParty(p);
      if (!relocate) continue;
      p.world = p.homeWorld;
      this.relocate(p, 'farm', p.id, home.x, home.y);
    }
  }

  // ── 행동 처리 (서버 권한 검증) ──────────────────────
  apply(playerId: string, a: ActionIntent): ActionResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, reason: 'no-player' };
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
      case 'heal': healAll(p.party); this.emitParty(p); return { ok: true };
      case 'inn': return this.inn(p);
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
      case 'resetSave': return this.resetSave(p);
      case 'goHome': { p.world = p.homeWorld; const h = this.homeSpot(); this.relocate(p, 'farm', p.id, h.x, h.y); return { ok: true }; }
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
    if (to === 'route1' && (!p.party.length || p.story < STORY.DONE)) return { ok: false, reason: 'need-partner' };
    if ((BADGE_GATES[to] ?? 0) > p.badges.length) return { ok: false, reason: `need-badges:${BADGE_GATES[to]}` };
    const gw = p.mode === 'story' ? gateFor(p, to) : undefined; if (gw) return { ok: false, reason: `event:${gw.id}` };
    const qg = QUESTS.gates[to]; if (qg && !p.flags.includes(qg.flag)) return { ok: false, reason: `gate:${to}` };
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
    if ((BADGE_GATES[target] ?? 0) > p.badges.length) return { ok: false, reason: `need-badges:${BADGE_GATES[target]}` };
    const ge = p.mode === 'story' ? gateFor(p, target) : undefined; if (ge) return { ok: false, reason: `event:${ge.id}` };
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
    if (!ALL_PLAYER_LOOKS.includes(look) && look !== 'player') return { ok: false, reason: 'bad-look' };
    const first = !p.look;
    if (!first && !(p.map === 'home' && p.inst === p.id)) return { ok: false, reason: 'not-home' };
    p.look = look;
    if (name !== undefined) { const n = String(name).replace(/[<>]/g, '').trim().slice(0, 10); if (n) p.name = n; }
    this.emit({ type: 'look', id: p.id, look: p.look, name: p.name });
    return { ok: true };
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
      [STORY.PHONE]: (q) => q.story === STORY.RACE && q.map === 'town',
      [STORY.MEET]: (q) => q.story === STORY.PHONE && q.map === 'town',
      [STORY.HALL]: (q) => q.story === STORY.MEET && q.map === 'in_lab',
    };
    if (!need[step]?.(p)) return { ok: false, reason: 'story' };
    this.setStory(p, step);
    return { ok: true };
  }
  /** 본편 사건 (chapters.json): 장소 · 순서 검증 → 승부가 있으면 시작, 없으면 바로 완료 */
  private storyEvent(p: PlayerState, id: string): ActionResult {
    const ev = EVENTS[id];
    if (!ev || p.flags.includes(id)) return { ok: false, reason: 'done' };
    if (p.mode !== 'story') return { ok: false, reason: 'multi' };   // 본편 사건은 스토리 모드에서만
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
    if (p.mode !== 'story' || !p.flags.includes('ending')) return { ok: false, reason: 'story' };
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
    this.removePlayer(p.id);
    this.addPlayer(p.id, name, '', null, world);
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
    d.servings--;
    if (d.servings <= 0) f.dish = null;
    this.changed(p);
    this.emit({ type: 'dish', room: this.room(p), dish: f.dish });
    this.emit({ type: 'emote', playerId: p.id, room: this.room(p), emote: 5 });
    this.emit({ type: 'toast', room: this.room(p), text: `${p.name}님이 ${item.name}을(를) 맛있게 먹었어요!`, icon: 'energy' });
    return { ok: true, anim: 'interact' };
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
    if (!crop.seasons.includes(this.time.season)) { this.emit({ type: 'toast', playerId: p.id, text: `${crop.name}은(는) 지금 계절에 자라지 않아요.` }); return { ok: false, reason: 'season' }; }
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
    if (o.type === 'log') { this.emit({ type: 'toast', playerId: p.id, text: '쓰러진 커다란 통나무다. 도끼로는 꿈쩍도 안 한다.', icon: 'axe' }); return { ok: false, reason: 'too-big', anim: 'axe' }; }
    if (!tree && !stump) { if (TREES.has(o.type)) this.emit({ type: 'toast', playerId: p.id, text: '농장을 둘러싼 숲의 나무는 베지 않기로 했다.', icon: 'axe' }); return { ok: true, anim: 'axe', reason: 'shake' }; }
    if (!this.spend(p, axeDef.energyCost ?? 2)) return { ok: false, reason: 'tired' };
    const key = `${f.owner}:${objectId}`, hits = (this.chopHits.get(key) ?? 0) + 1;
    this.changed(p); this.wear(p, axe);
    if (hits < Math.max(1, Math.ceil((tree ? TREE_HITS : STUMP_HITS) / (axeDef.power ?? 1)))) { this.chopHits.set(key, hits); return { ok: true, anim: 'axe', reason: 'shake' }; }
    this.chopHits.delete(key);
    f.removed.add(objectId);
    this.emit({ type: 'objectRemoved', key: `farm:${objectId}`, owner: f.owner });
    const wood = tree ? 5 + Math.floor(this.rand() * 3) : 2;
    this.addItem(p, 'wood', wood); this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${tree ? '나무가 쓰러졌다!' : '그루터기를 치웠다.'} 나무 조각 +${wood}`, icon: 'wood' });
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
    if (!info.isBlocked(x, y)) return false;
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
  /** 서버 이동 검증용: 치운 나무 · 바위 자리는 지나갈 수 있고 설치물은 못 지나감 */
  canStand(p: PlayerState, px: number, py: number, hw = 5, hh = 5) {
    const info = this.maps[p.map]; if (!info) return false;
    const f = p.map === 'farm' ? this.farmOf(p) : null;
    const T = info.tile;
    for (let cy = Math.floor((py - hh) / T); cy <= Math.floor((py - 0.01) / T); cy++)
      for (let cx = Math.floor((px - hw) / T); cx <= Math.floor((px + hw - 0.01) / T); cx++) if (this.blockedAt(p.map, f, cx, cy, p)) return false;
    return true;
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

  private eat(p: PlayerState, slot: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || item.type !== 'food') return { ok: false, reason: 'not-food' };
    s.quantity--; if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${item.name}을(를) 먹었어요. 맛있다!`, icon: 'energy' });
    return { ok: true, anim: 'interact' };
  }

  // ── 루미 모험 ──────────────────────────────────────
  private emitParty(p: PlayerState) {
    this.emit({ type: 'party', id: p.id, party: p.party, bag: p.bag, badges: p.badges, defeated: p.defeated, seen: p.seen, caught: p.caught, visited: p.visited, recipes: p.recipes, flags: p.flags, bonds: p.bonds, asks: p.asks, stock: p.stock, opened: p.opened });
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

  private canBattle(p: PlayerState) { return p.party.some((c) => c.hp > 0); }

  private encounter(p: PlayerState): ActionResult {
    const table = ENCOUNTERS.grass[p.map];
    if (!table || !this.canBattle(p)) return { ok: false, reason: 'no-encounter' };
    // 플레이어가 실제로 풀숲 위에 있는지 검증
    const m = this.maps[p.map], T = m.tile;
    const cx = Math.floor(p.x / T), cy = Math.floor((p.y - 3) / T);
    const cave = m.props.cave === 'true';
    if (!cave && !m.objects.some((o) => o.type === 'tallgrass' && Math.floor(o.x / T) === cx && Math.floor(o.y / T) - 1 === cy)) return { ok: false, reason: 'not-grass' };
    const now = Date.now(); if (now - (this.lastEncounter.get(p.id) ?? 0) < 2500) return { ok: false, reason: 'cooldown' };
    this.lastEncounter.set(p.id, now);
    const night = this.time.minutes >= 19 * 60 || this.time.minutes < 6 * 60 + 30;
    const [sp, lo, hi] = this.pick(night ? table.night : table.day, (r) => r[3]);
    const lv = lo + Math.floor(this.rand() * (hi - lo + 1));
    const { state, update } = this.engine.startWild(p, sp, lv, m.props.battleBg ?? 'grass');
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
    for (const [it, n] of Object.entries(st)) { if (!ITEMS[it] || !this.addItem(p, it, n)) continue; got += n; delete st[it]; }
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

  /** 지금 있는 곳에서 가장 가까운 마을 (지도 좌표 기준) → 숙소/센터 앞 */
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
    return { map: best, spawn: sp.has('wp_inn') ? 'wp_inn' : sp.has('wp_center') ? 'wp_center' : 'player' };
  }

  /** 숙소: 500G → 루미 · 체력 완전 회복. 혼자 할 때는 다음 날 아침까지 잠 / 멀티는 시간 그대로 */
  private inn(p: PlayerState): ActionResult {
    const COST = 500;
    if (p.gold < COST) { this.emit({ type: 'toast', playerId: p.id, text: `숙박비가 모자라요. (${COST}G 필요)`, icon: 'gold' }); return { ok: false, reason: 'gold' }; }
    p.gold -= COST;
    this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta: -COST });
    if (!this.multiplayer) this.newDay(false, false);
    p.energy = p.maxEnergy; healAll(p.party);
    this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory });
    this.emitParty(p);
    return { ok: true, reason: this.multiplayer ? 'rested' : 'slept' };
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
      // 제네시스를 붙잡으면 사이드 퀘스트 완료
      if (up.ended === 'caught' && st.foes[st.foeIdx]?.species === MYTH) { if (!p.flags.includes('side_genesis')) p.flags.push('side_genesis'); }
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
        // 가장 가까운 마을 숙소/센터 앞으로 (클라이언트는 배틀 연출이 끝난 뒤 방 이동을 처리)
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
    // 낚시형 파트너: 희귀 물고기 가중치 2배
    const [item] = this.pick(table.items, ([id, w]) => (fishHelp && ITEMS[id].sellPrice >= 90 ? w * 2 : w));
    if (!this.addItem(p, item, 1)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[item].name}을(를) 낚았다!`, icon: item });
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
    const T = m.tile; if (Math.hypot(o.x / T - p.x / T, o.y / T - 0.5 - (p.y - 4) / T) > 2.6) return { ok: false, reason: 'far' };
    const mineHelp = this.helps(p) === 'mine';
    if (!this.spend(p, Math.max(1, (mineHelp ? 2 : 3) - (pickPower >= 3 ? 1 : 0)))) return { ok: false, reason: 'tired' };
    this.wear(p, pick);
    const got: string[] = [];
    for (const [item, lo, hi, chance] of ENCOUNTERS.ore[kind] ?? []) {
      if (this.rand() * 100 > chance) continue;
      const qty = lo + Math.floor(this.rand() * (hi - lo + 1)) + (mineHelp && item !== 'stone' ? 1 : 0) + (pickPower >= 2 && item !== 'stone' && this.rand() < 0.3 * (pickPower - 1) ? 1 : 0);
      if (this.addItem(p, item, qty)) got.push(`${ITEMS[item].name} ×${qty}`);
    }
    if (f) f.removed.add(objectId); else { this.removed.add(key); this.oreBack.set(key, Date.now() + ORE_RESPAWN_MS); }
    this.emit({ type: 'objectRemoved', key, owner: f?.owner });
    this.changed(p);
    if (got.length) this.emit({ type: 'toast', playerId: p.id, text: `${got.join(', ')} 획득!`, icon: (ENCOUNTERS.ore[kind]?.[0]?.[0]) ?? 'stone' });
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
    if (def.type === 'battle') { p.bag[itemId] = (p.bag[itemId] ?? 0) + qty; this.emitParty(p); return true; }
    let slot = p.inventory.find((s) => s.itemId === itemId && s.quantity + qty <= def.maxStack);
    if (!slot) slot = p.inventory.find((s) => !s.itemId);
    if (!slot) return false;
    slot.itemId = itemId; slot.quantity += qty;
    if (def.durability && slot.dur === undefined) slot.dur = def.durability;
    return true;
  }
}
