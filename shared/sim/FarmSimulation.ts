// 권한 있는 농장 시뮬레이션 (Authoritative). 서버와 싱글플레이(LocalAuthority)에서 동일하게 사용.
// 클라이언트는 결과가 아니라 ActionIntent 만 보내고, 여기서 거리/에너지/도구 소지를 검증한 뒤 상태를 바꾼다.
//  - 농장/집은 주인별 인스턴스(초대받은 친구만 함께), 마을·도로·바람골·가게 실내는 모두가 공유
//  - 골드·가방·루미는 플레이어별, 시간·날씨는 서버 전체 공통
import { CROPS, ENCOUNTERS, ITEMS, SHOPS, SPECIES, TRAINERS, hhmmToMinutes } from '../data';
import { BattleEngine, healAll, makeCreature, type BattleState } from './Battle';
import {
  SoilState, INTERIOR_OF, ALL_PLAYER_LOOKS, isInterior, roomOf, BADGE_GATES,
  type ActionIntent, type ActionResult, type Dish, type FarmSnapshot, type FarmTile, type ForageSpot, type InventorySlot, type MapId,
  type PlayerState, type SaveData, type WorldTime, type Weather, type BattleUpdate,
} from '../types';
import { MapInfo, prop } from './MapInfo';
import { RIVAL_PICK, STORY, rivalOf } from '../story';

export const DAY_START = 6 * 60;      // 06:00
export const DAY_END = 26 * 60;       // 다음날 02:00 → 기절
export const MS_PER_10_MIN = 7000;    // 실제 7초 = 게임 10분
export const HOTBAR_SIZE = 12;
export const INVENTORY_SIZE = 24;     // 핫바 2줄 (Q 로 전환)
const REACH = 1.75;                   // 도구 사거리 (타일)
const INVITE_TTL = 5 * 60_000;

export type SimEvent =
  | { type: 'tile'; owner: string; tile: FarmTile }
  | { type: 'time'; time: WorldTime }
  | { type: 'gold'; playerId: string; gold: number; delta: number }
  | { type: 'player'; id: string; energy: number; inventory: InventorySlot[] }
  | { type: 'newDay'; time: WorldTime }
  | { type: 'objectRemoved'; key: string; owner?: string }
  | { type: 'objectRestored'; keys: string[] }
  | { type: 'forage'; spots: ForageSpot[] }
  | { type: 'party'; id: string; party: PlayerState['party']; bag: PlayerState['bag']; badges: string[]; defeated: string[]; seen: string[]; caught: string[]; visited: string[] }
  | { type: 'help'; playerId: string; species: string; text: string }
  | { type: 'toast'; playerId?: string; room?: string; text: string; icon?: string }
  | { type: 'room'; playerId: string; map: MapId; inst: string; world: string; x: number; y: number; snapshot: FarmSnapshot }
  | { type: 'look'; id: string; look: string; name: string }
  | { type: 'emote'; playerId: string; room: string; emote: number }
  | { type: 'dish'; room: string; dish: Dish | null }
  | { type: 'invite'; to: string; from: string; fromName: string; where: 'farm' | 'home' }
  | { type: 'sleep'; ready: number; total: number }
  | { type: 'story'; id: string; story: number };

type Listener = (e: SimEvent) => void;
interface FarmState { owner: string; tiles: Map<string, FarmTile>; removed: Set<number>; dish: Dish | null }

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
  /** 공개 맵에서 사라진 오브젝트 `${map}:${id}` (채석장 바위 등) */
  private removed = new Set<string>();
  /** 받은 초대: to → from → {where, t} */
  private invites = new Map<string, Map<string, { where: 'farm' | 'home'; t: number }>>();
  private acc = 0;
  private listeners: Listener[] = [];
  private seed = 1337;

  constructor(maps: Record<MapId, MapInfo>) {
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
    f = { owner, tiles: new Map(), removed: new Set(saved?.removed ?? []), dish: null };
    if (saved) for (const t of saved.tiles) f.tiles.set(`${t.x},${t.y}`, cloneTile(t));
    else this.seedPlots(f);
    this.farms.set(owner, f);
    return f;
  }
  /** 플레이어가 지금 서 있는 농장 (자기 농장 또는 초대받은 친구 농장) */
  private farmOf(p: PlayerState) { return this.ensureFarm(p.map === 'farm' || p.map === 'home' ? p.inst || p.id : p.id); }

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
    const give = ['hoe', 'watering_can', 'axe', 'seeds_parsnip', 'seeds_cauliflower', 'seeds_tomato', 'seeds_pumpkin', 'pickaxe', 'rod'];
    const qty: Record<string, number> = { seeds_parsnip: 15, seeds_cauliflower: 5, seeds_tomato: 8, seeds_pumpkin: 3 };
    give.forEach((it, i) => { inv[i].itemId = it; inv[i].quantity = qty[it] ?? 1; });
    const home = this.homeSpot();
    const p: PlayerState = {
      id, name, look, map: 'farm', inst: id, x: home.x, y: home.y, dir: 'down', anim: 'idle', energy: 270, maxEnergy: 270, inventory: inv, gold: 500, bin: [], story: STORY.HOME, world, homeWorld: world,
      party: [], box: [], bag: {}, badges: [], defeated: [], seen: [], caught: [], visited: ['farm'],
    };
    if (save) {
      Object.assign(p, {
        name: save.name || name, look: save.look ?? look, gold: save.gold ?? 500, energy: save.energy ?? 270, maxEnergy: save.maxEnergy ?? 270,
        party: save.party ?? [], box: save.box ?? [], bag: save.bag ?? {}, badges: save.badges ?? [], defeated: save.defeated ?? [],
        seen: save.seen ?? [], caught: save.caught ?? [], bin: save.bin ?? [], visited: save.visited ?? ['farm', 'town', ...(save.party?.length ? ['route1', 'windvale'] : [])],
        story: save.story ?? ((save.party ?? []).length ? STORY.DONE : STORY.HOME),
      });
      if (save.inventory?.length) p.inventory = Array.from({ length: INVENTORY_SIZE }, (_, i) => ({ slotIndex: i, itemId: save.inventory[i]?.itemId ?? null, quantity: save.inventory[i]?.quantity ?? 0 }));
    }
    this.players.set(id, p);
    this.ensureFarm(id, save?.farm);
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
      farm: { tiles: f ? [...f.tiles.values()] : [], removed: f ? [...f.removed] : [] }, story: p.story, visited: p.visited, savedAt: Date.now(),
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
    return save;
  }
  inBattle(id: string) { return this.battles.has(id); }

  private homeSpot() { const s = this.map.spawns.get('player') ?? { x: 368, y: 232 }; return { x: s.x, y: s.y + 5 }; }

  /** 방 이동 (워프/실내/초대/새 날/배틀 패배) → 해당 플레이어에게 새 방의 상태를 보냄 */
  private relocate(p: PlayerState, map: MapId, inst: string, x: number, y: number) {
    p.map = map; p.inst = inst; p.x = x; p.y = y; p.sleeping = false;
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
      tiles: farm && p?.map === 'farm' ? [...farm.tiles.values()].map(cloneTile) : [],
      removedObjects: [...this.removed, ...(farm ? [...farm.removed].map((id) => `farm:${id}`) : [])],
      forage: [...this.forage], dish: farm && p?.map === 'home' ? farm.dish : null,
    };
  }

  // ── 시간 ───────────────────────────────────────────
  tick(dtMs: number) {
    this.acc += dtMs;
    while (this.acc >= MS_PER_10_MIN) {
      this.acc -= MS_PER_10_MIN;
      this.time.minutes += 10;
      this.emit({ type: 'time', time: { ...this.time } });
      if (this.time.minutes >= DAY_END) { this.emit({ type: 'toast', text: '너무 늦게까지 일했어요... 기절했습니다!' }); this.newDay(); }
    }
  }
  /** 현재 10분 구간 진행률 (조명 보간용) */
  get subMinute() { return (this.acc / MS_PER_10_MIN) * 10; }
  /** 서버 재시작 후 이어가기용 */
  setWorld(time: WorldTime) { this.time = { ...time }; }

  newDay() {
    const weather: Weather = this.rand() < 0.25 ? 'rain' : 'sunny';
    this.time = { day: this.time.day + 1, minutes: DAY_START, season: this.time.season, weather };
    if (this.time.day > 28) this.time.day = 1;
    this.acc = 0;
    // 작물 성장 (전날 물 준 칸만) — 메모리에 있는 모든 농장
    for (const f of this.farms.values()) {
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
    // 채석장 바위·채집물 다시 생성
    const restored = [...this.removed].filter((k) => { const [m, id] = k.split(':'); return this.maps[m as MapId]?.objects.some((o) => String(o.id) === id && o.properties?.some((pp) => pp.name === 'mine')); });
    for (const k of restored) this.removed.delete(k);
    if (restored.length) this.emit({ type: 'objectRestored', keys: restored });
    this.spawnForage();
    this.emit({ type: 'forage', spots: [...this.forage] });
    this.emit({ type: 'newDay', time: { ...this.time } });
    // 새 날: 모두 자기 농장 집 앞에서 시작 (루미도 푹 쉼)
    const home = this.homeSpot();
    for (const p of this.players.values()) {
      p.energy = p.maxEnergy;
      healAll(p.party);
      this.battles.delete(p.id);
      this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory });
      this.emitParty(p);
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
    if (['useTool', 'plant', 'harvest', 'ship', 'chop'].includes(a.kind) && p.map !== 'farm') return { ok: false, reason: 'wrong-map' };
    // 배틀 중에는 배틀 행동만
    const battleKinds = ['battleMove', 'battleItem', 'battleSwitch', 'battleRun', 'emote'];
    if (this.battles.has(p.id) && !battleKinds.includes(a.kind)) return { ok: false, reason: 'in-battle' };
    if (a.kind !== 'sleep' && a.kind !== 'emote') p.sleeping = false;
    switch (a.kind) {
      case 'chooseStarter': return this.chooseStarter(p, a.species);
      case 'setPartner': return this.setPartner(p, a.index);
      case 'heal': healAll(p.party); this.emitParty(p); return { ok: true };
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
      case 'warp': return this.warp(p, a.index);
      case 'enter': return this.enter(p, a.objectId);
      case 'invite': return this.invite(p, a.to, a.where);
      case 'acceptInvite': return this.acceptInvite(p, a.from);
      case 'setLook': return this.setLook(p, a.look, a.name);
      case 'emote': if (!Number.isInteger(a.id) || a.id < 0 || a.id > 7) return { ok: false }; this.emit({ type: 'emote', playerId: p.id, room: this.room(p), emote: a.id }); return { ok: true };
      case 'serve': return this.serve(p, a.slot);
      case 'eatDish': return this.eatDish(p);
      case 'story': return this.storyStep(p, a.step);
      case 'rivalBattle': return this.rivalBattle(p);
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
  private spend(p: PlayerState, cost: number) {
    if (SPECIES[p.party[0]?.species]?.helps === 'energy') cost = Math.max(1, cost - 1);
    if (cost <= 0) return true;
    if (p.energy < cost) { this.emit({ type: 'toast', playerId: p.id, text: '너무 지쳤어요... 잠을 자야 해요.', icon: 'energy' }); return false; }
    p.energy -= cost; return true;
  }
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
    const T = m.tile;
    const cellX = Number(prop(o, 'cellX', 0)), cellY = Number(prop(o, 'cellY', 0)), cellW = Number(prop(o, 'cellW', 1));
    const doorX = Number(prop(o, 'doorCellX', cellX + Math.floor(cellW / 2)));
    const dx = doorX * T + 8, dy = (cellY + 1) * T + 13;
    if (Math.abs(p.x - dx) > T * 1.6 || Math.abs(p.y - dy) > T * 1.6) return { ok: false, reason: 'far' };
    // 내 집은 '지금 있는 농장의 주인' 집 (친구 농장에 놀러 왔으면 친구 집)
    // 이름 붙은 실내(도장·리그·탑 …)는 한 곳뿐이라 모두 같은 방, 공용 실내(쉼터·상점·이웃집)는 건물마다 따로
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
    this.emit({ type: 'toast', room: this.room(p), text: `${p.name}님이 ${item.name}을(를) 맛있게 먹었어요! (에너지 +${gain})`, icon: 'energy' });
    return { ok: true, anim: 'interact' };
  }

  // ── 농사 ───────────────────────────────────────────
  private tileEmit(f: FarmState, t: FarmTile) { this.emit({ type: 'tile', owner: f.owner, tile: cloneTile(t) }); }

  private useTool(p: PlayerState, slot: number, tx: number, ty: number): ActionResult {
    const item = ITEMS[p.inventory[slot]?.itemId ?? ''];
    if (!item?.tool) return { ok: false, reason: 'not-tool' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const f = this.farmOf(p);
    const key = `${tx},${ty}`; const tile = f.tiles.get(key);
    const cost = item.energyCost ?? 1;
    if (item.tool === 'hoe') {
      if (tile || !this.map.isTillable(tx, ty)) return { ok: false, reason: 'cannot-till', anim: 'hoe' };
      if (!this.spend(p, cost)) return { ok: false, reason: 'tired' };
      const t: FarmTile = { x: tx, y: ty, soil: this.time.weather === 'rain' ? SoilState.Watered : SoilState.Plowed, crop: null };
      f.tiles.set(key, t); this.tileEmit(f, t); this.changed(p);
      return { ok: true, anim: 'hoe' };
    }
    if (item.tool === 'watering_can') {
      if (!tile || tile.soil === SoilState.Watered) return { ok: false, reason: 'cannot-water', anim: 'water' };
      if (!this.spend(p, SPECIES[p.party[0]?.species]?.type === '물' ? 0 : cost)) return { ok: false, reason: 'tired' };
      tile.soil = SoilState.Watered; this.tileEmit(f, tile); this.changed(p);
      return { ok: true, anim: 'water' };
    }
    return { ok: false, reason: 'axe-needs-target', anim: 'axe' };
  }

  private plant(p: PlayerState, slot: number, tx: number, ty: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || item.type !== 'seed' || !item.cropId) return { ok: false, reason: 'not-seed' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const f = this.farmOf(p);
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
    const f = this.farmOf(p);
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

  private chop(p: PlayerState, objectId: number): ActionResult {
    const o = this.map.objects.find((ob) => ob.id === objectId);
    const f = this.farmOf(p);
    if (!o || f.removed.has(objectId)) return { ok: false };
    const slot = p.inventory.findIndex((s) => s.itemId === 'axe');
    if (slot < 0) return { ok: false, reason: 'no-axe' };
    if (!this.spend(p, ITEMS.axe.energyCost ?? 2)) return { ok: false, reason: 'tired' };
    this.changed(p);
    if (o.type === 'stump' || o.type === 'log') {
      f.removed.add(objectId);
      this.emit({ type: 'objectRemoved', key: `farm:${objectId}`, owner: f.owner });
      this.setGold(p, o.type === 'log' ? 15 : 8);
      return { ok: true, anim: 'axe' };
    }
    return { ok: true, anim: 'axe', reason: 'shake' };
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
    if (p.energy >= p.maxEnergy) { this.emit({ type: 'toast', playerId: p.id, text: '배가 불러요. 에너지가 가득 차 있어요.', icon: 'energy' }); return { ok: false, reason: 'full' }; }
    p.energy = Math.min(p.maxEnergy, p.energy + (item.energy ?? 0));
    s.quantity--; if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${item.name}을(를) 먹었어요. 에너지 +${item.energy}`, icon: 'energy' });
    return { ok: true, anim: 'interact' };
  }

  // ── 루미 모험 ──────────────────────────────────────
  private emitParty(p: PlayerState) {
    this.emit({ type: 'party', id: p.id, party: p.party, bag: p.bag, badges: p.badges, defeated: p.defeated, seen: p.seen, caught: p.caught, visited: p.visited });
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
    p.bag.jar = (p.bag.jar ?? 0) + 5; p.bag.potion = (p.bag.potion ?? 0) + 3;
    this.emitParty(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${SPECIES[species].name}이(가) 파트너가 되었어요! 별빛 병 5개, 회복 꿀 3개를 받았어요.`, icon: 'lumi' });
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
    this.battles.set(p.id, state);
    return { ok: true, battle: update };
  }

  private trainerBattle(p: PlayerState, trainerId: string): ActionResult {
    const tr = TRAINERS[trainerId];
    if (!tr || p.defeated.includes(trainerId) || tr.map !== p.map || !this.canBattle(p)) return { ok: false, reason: 'invalid-trainer' };
    const need = (tr.requires ?? []).find((r) => !p.defeated.includes(r));
    if (need) return { ok: false, reason: `requires:${need}` };
    const bg = this.maps[p.map].props.battleBg ?? (isInterior(p.map) ? 'town' : undefined);
    const { state, update } = this.engine.startTrainer(p, trainerId, undefined, bg);
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
      if (up.ended === 'win' && st.trainerId) {
        const tr = st.tr ?? TRAINERS[st.trainerId];
        if (st.script === 'rival') this.setStory(p, STORY.DONE);
        p.defeated.push(st.trainerId);
        p.gold += tr.reward;
        up.log.push({ t: 'text', text: `${tr.title} ${tr.name}과(와)의 승부에서 이겼다!` }, ...tr.defeat.map((text) => ({ t: 'text' as const, text: `${tr.name}: "${text}"` })), { t: 'text', text: `상금으로 ${tr.reward}G를 받았다!` });
        if (tr.badge && !p.badges.includes(tr.badge)) { p.badges.push(tr.badge); up.log.push({ t: 'text', text: `${ITEMS[tr.badge].name}을(를) 받았다!` }); }
        this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta: tr.reward });
      }
      if (up.ended === 'lose') {
        const lost = Math.floor(p.gold * 0.1);
        p.gold -= lost;
        healAll(p.party);
        up.log.push({ t: 'text', text: '눈앞이 캄캄해졌다...' }, { t: 'text', text: `정신을 차려 보니 농장 집 앞이었다. (${lost}G를 잃어버렸다)` });
        this.emit({ type: 'gold', playerId: p.id, gold: p.gold, delta: -lost });
        // 농장 집 앞으로 (클라이언트는 배틀 연출이 끝난 뒤 방 이동을 처리)
        this.battles.delete(p.id);
        const h = this.homeSpot();
        this.relocate(p, 'farm', p.id, h.x, h.y);
      }
    }
    this.emitParty(p);
    return { ok: true, battle: up };
  }

  private fish(p: PlayerState, tx: number, ty: number): ActionResult {
    const m = this.maps[p.map];
    if (!p.inventory.some((s) => s.itemId === 'rod')) return { ok: false, reason: 'no-rod' };
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
    if (!p.inventory.some((s) => s.itemId === 'pickaxe')) return { ok: false, reason: 'no-pickaxe' };
    const T = m.tile; if (Math.hypot(o.x / T - p.x / T, o.y / T - 0.5 - (p.y - 4) / T) > 2.6) return { ok: false, reason: 'far' };
    const mineHelp = this.helps(p) === 'mine';
    if (!this.spend(p, mineHelp ? 2 : 3)) return { ok: false, reason: 'tired' };
    const got: string[] = [];
    for (const [item, lo, hi, chance] of ENCOUNTERS.ore[kind] ?? []) {
      if (this.rand() * 100 > chance) continue;
      const qty = lo + Math.floor(this.rand() * (hi - lo + 1)) + (mineHelp && item !== 'stone' ? 1 : 0);
      if (this.addItem(p, item, qty)) got.push(`${ITEMS[item].name} ×${qty}`);
    }
    if (f) f.removed.add(objectId); else this.removed.add(key);
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

  addItem(p: PlayerState, itemId: string, qty: number) {
    const def = ITEMS[itemId];
    if (def.type === 'battle') { p.bag[itemId] = (p.bag[itemId] ?? 0) + qty; this.emitParty(p); return true; }
    let slot = p.inventory.find((s) => s.itemId === itemId && s.quantity + qty <= def.maxStack);
    if (!slot) slot = p.inventory.find((s) => !s.itemId);
    if (!slot) return false;
    slot.itemId = itemId; slot.quantity += qty;
    return true;
  }
}
