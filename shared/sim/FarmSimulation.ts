// 권한 있는 농장 시뮬레이션 (Authoritative). 서버와 싱글플레이(LocalAuthority)에서 동일하게 사용.
// 클라이언트는 결과가 아니라 ActionIntent 만 보내고, 여기서 거리/에너지/도구 소지를 검증한 뒤 상태를 바꾼다.
import { CROPS, ITEMS, SHOPS, hhmmToMinutes } from '../data';
import { SoilState, type ActionIntent, type ActionResult, type FarmSnapshot, type FarmTile, type InventorySlot, type MapId, type PlayerState, type WorldTime, type Weather } from '../types';
import { MapInfo } from './MapInfo';

export const DAY_START = 6 * 60;      // 06:00
export const DAY_END = 26 * 60;       // 다음날 02:00 → 기절
export const MS_PER_10_MIN = 7000;    // 실제 7초 = 게임 10분
export const HOTBAR_SIZE = 12;
const REACH = 1.75;                   // 도구 사거리 (타일)

export type SimEvent =
  | { type: 'tile'; tile: FarmTile }
  | { type: 'time'; time: WorldTime }
  | { type: 'gold'; gold: number; delta: number }
  | { type: 'player'; id: string; energy: number; inventory: InventorySlot[] }
  | { type: 'newDay'; time: WorldTime; shippedGold: number }
  | { type: 'objectRemoved'; objectId: number }
  | { type: 'toast'; playerId?: string; text: string; icon?: string };

type Listener = (e: SimEvent) => void;

export class FarmSimulation {
  readonly map: MapInfo;
  time: WorldTime = { day: 1, minutes: DAY_START, season: 'spring', weather: 'sunny' };
  gold = 500;
  private tiles = new Map<string, FarmTile>();
  readonly players = new Map<string, PlayerState>();
  private removed = new Set<number>();
  private bin: { itemId: string; quantity: number }[] = [];
  private acc = 0;
  private listeners: Listener[] = [];
  private seed = 1337;

  constructor(map: MapInfo, opts: { seedPlots?: boolean } = {}) {
    this.map = map;
    if (opts.seedPlots !== false) this.seedPlots();
  }

  on(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  private emit(e: SimEvent) { for (const l of this.listeners) l(e); }
  private rand() { this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff; return this.seed / 0x7fffffff; }

  // ── 초기 상태 ───────────────────────────────────────
  private seedPlots() {
    for (const p of this.map.plots) for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) {
      const t: FarmTile = { x, y, soil: p.watered ? SoilState.Watered : SoilState.Plowed, crop: null };
      if (p.crop && CROPS[p.crop]) {
        // 자연스러운 성장 편차
        const st = Math.max(0, Math.min(4, p.stage - (this.rand() < 0.25 ? 1 : 0)));
        t.crop = { id: p.crop, stage: st, daysInStage: 0 };
      }
      this.tiles.set(`${x},${y}`, t);
    }
  }

  addPlayer(id: string, name: string, look = 'player', x = 0, y = 0, map: MapId = 'farm'): PlayerState {
    const inv: InventorySlot[] = Array.from({ length: HOTBAR_SIZE }, (_, i) => ({ slotIndex: i, itemId: null, quantity: 0 }));
    const give = ['hoe', 'watering_can', 'axe', 'seeds_parsnip', 'seeds_cauliflower', 'seeds_tomato', 'seeds_pumpkin'];
    const qty: Record<string, number> = { seeds_parsnip: 15, seeds_cauliflower: 5, seeds_tomato: 8, seeds_pumpkin: 3 };
    give.forEach((it, i) => { inv[i].itemId = it; inv[i].quantity = qty[it] ?? 1; });
    const p: PlayerState = { id, name, look, map, x, y, dir: 'down', anim: 'idle', energy: 270, maxEnergy: 270, inventory: inv };
    this.players.set(id, p);
    return p;
  }
  removePlayer(id: string) { this.players.delete(id); }
  /** 맵 이동 (워프). 위치는 도착 맵의 스폰 지점 */
  setPlayerMap(id: string, map: MapId, x: number, y: number) {
    const p = this.players.get(id); if (!p) return;
    p.map = map; p.x = x; p.y = y;
  }

  snapshot(): FarmSnapshot {
    return { time: { ...this.time }, gold: this.gold, tiles: [...this.tiles.values()].map((t) => ({ ...t, crop: t.crop ? { ...t.crop } : null })), removedObjects: [...this.removed], shippingBin: [...this.bin] };
  }
  getTile(x: number, y: number) { return this.tiles.get(`${x},${y}`) ?? null; }
  isRemoved(objectId: number) { return this.removed.has(objectId); }

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

  newDay() {
    // 출하 정산
    let earned = 0;
    for (const b of this.bin) earned += (ITEMS[b.itemId]?.sellPrice ?? 0) * b.quantity;
    this.bin = [];
    if (earned) this.gold += earned;
    const weather: Weather = this.rand() < 0.25 ? 'rain' : 'sunny';
    this.time = { day: this.time.day + 1, minutes: DAY_START, season: this.time.season, weather };
    if (this.time.day > 28) { this.time.day = 1; }
    this.acc = 0;
    // 작물 성장 (전날 물 준 칸만)
    for (const t of this.tiles.values()) {
      if (t.crop && t.soil === SoilState.Watered) {
        const def = CROPS[t.crop.id];
        if (t.crop.stage < 4) {
          t.crop.daysInStage++;
          const need = t.crop.regrowing ? def.regrowDays : def.growthDays[t.crop.stage];
          if (t.crop.daysInStage >= need) { t.crop.stage = t.crop.regrowing ? 4 : t.crop.stage + 1; t.crop.daysInStage = 0; if (t.crop.stage === 4) t.crop.regrowing = false; }
        }
      }
      t.soil = weather === 'rain' ? SoilState.Watered : SoilState.Plowed;
      // 작물 없이 방치된 경작지는 확률적으로 원상복귀
      if (!t.crop && weather !== 'rain' && this.rand() < 0.1) { this.tiles.delete(`${t.x},${t.y}`); t.soil = SoilState.Unplowed; }
      this.emit({ type: 'tile', tile: t });
    }
    // 새 날: 모든 플레이어는 농장 집 앞에서 시작
    const home = this.map.spawns.get('player');
    for (const p of this.players.values()) {
      p.energy = p.maxEnergy;
      if (home) { p.map = 'farm'; p.x = home.x; p.y = home.y + 5; }
      this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory });
    }
    if (earned) this.emit({ type: 'gold', gold: this.gold, delta: earned });
    this.emit({ type: 'newDay', time: { ...this.time }, shippedGold: earned });
  }

  // ── 행동 처리 (서버 권한 검증) ──────────────────────
  apply(playerId: string, a: ActionIntent): ActionResult {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, reason: 'no-player' };
    // 농사 관련 행동은 농장 맵에서만
    if (['useTool', 'plant', 'harvest', 'ship', 'chop'].includes(a.kind) && p.map !== 'farm') return { ok: false, reason: 'wrong-map' };
    switch (a.kind) {
      case 'buy': return this.buy(p, a.shop, a.itemId, a.qty);
      case 'eat': return this.eat(p, a.slot);
      case 'useTool': return this.useTool(p, a.slot, a.tx, a.ty);
      case 'plant': return this.plant(p, a.slot, a.tx, a.ty);
      case 'harvest': return this.harvest(p, a.tx, a.ty);
      case 'ship': return this.ship(p, a.slot);
      case 'chop': return this.chop(p, a.objectId);
      case 'sleep': this.newDay(); return { ok: true };
    }
  }

  private inReach(p: PlayerState, tx: number, ty: number) {
    const T = this.map.tile;
    const px = p.x / T, py = (p.y - 4) / T;
    return Math.hypot(tx + 0.5 - px, ty + 0.5 - py) <= REACH + 0.5;
  }
  private spend(p: PlayerState, cost: number) {
    if (p.energy < cost) { this.emit({ type: 'toast', playerId: p.id, text: '너무 지쳤어요... 잠을 자야 해요.', icon: 'energy' }); return false; }
    p.energy -= cost; return true;
  }
  private changed(p: PlayerState) { this.emit({ type: 'player', id: p.id, energy: p.energy, inventory: p.inventory }); }

  private useTool(p: PlayerState, slot: number, tx: number, ty: number): ActionResult {
    const item = ITEMS[p.inventory[slot]?.itemId ?? ''];
    if (!item?.tool) return { ok: false, reason: 'not-tool' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const key = `${tx},${ty}`; const tile = this.tiles.get(key);
    const cost = item.energyCost ?? 1;
    if (item.tool === 'hoe') {
      if (tile || !this.map.isTillable(tx, ty)) return { ok: false, reason: 'cannot-till', anim: 'hoe' };
      if (!this.spend(p, cost)) return { ok: false, reason: 'tired' };
      const t: FarmTile = { x: tx, y: ty, soil: this.time.weather === 'rain' ? SoilState.Watered : SoilState.Plowed, crop: null };
      this.tiles.set(key, t); this.emit({ type: 'tile', tile: t }); this.changed(p);
      return { ok: true, anim: 'hoe' };
    }
    if (item.tool === 'watering_can') {
      if (!tile || tile.soil === SoilState.Watered) return { ok: false, reason: 'cannot-water', anim: 'water' };
      if (!this.spend(p, cost)) return { ok: false, reason: 'tired' };
      tile.soil = SoilState.Watered; this.emit({ type: 'tile', tile }); this.changed(p);
      return { ok: true, anim: 'water' };
    }
    return { ok: false, reason: 'axe-needs-target', anim: 'axe' };
  }

  private plant(p: PlayerState, slot: number, tx: number, ty: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || item.type !== 'seed' || !item.cropId) return { ok: false, reason: 'not-seed' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const tile = this.tiles.get(`${tx},${ty}`);
    if (!tile || tile.crop) return { ok: false, reason: 'no-soil' };
    const crop = CROPS[item.cropId];
    if (!crop.seasons.includes(this.time.season)) { this.emit({ type: 'toast', playerId: p.id, text: `${crop.name}은(는) 지금 계절에 자라지 않아요.` }); return { ok: false, reason: 'season' }; }
    tile.crop = { id: crop.id, stage: 0, daysInStage: 0 };
    s.quantity--; if (s.quantity <= 0) { s.itemId = null; s.quantity = 0; }
    this.emit({ type: 'tile', tile }); this.changed(p);
    return { ok: true, anim: 'interact' };
  }

  private harvest(p: PlayerState, tx: number, ty: number): ActionResult {
    const tile = this.tiles.get(`${tx},${ty}`);
    if (!tile?.crop || tile.crop.stage < 4) return { ok: false, reason: 'not-ready' };
    if (!this.inReach(p, tx, ty)) return { ok: false, reason: 'far' };
    const def = CROPS[tile.crop.id];
    const qty = def.harvestQty[0] + Math.floor(this.rand() * (def.harvestQty[1] - def.harvestQty[0] + 1));
    if (!this.addItem(p, def.harvestItem, qty)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    if (def.regrowDays > 0) { tile.crop.stage = 3; tile.crop.daysInStage = 0; tile.crop.regrowing = true; }
    else tile.crop = null;
    this.emit({ type: 'tile', tile }); this.changed(p);
    this.emit({ type: 'toast', playerId: p.id, text: `${ITEMS[def.harvestItem].name} ×${qty} 수확!`, icon: def.harvestItem });
    return { ok: true, anim: 'interact' };
  }

  private ship(p: PlayerState, slot: number): ActionResult {
    const s = p.inventory[slot]; const item = ITEMS[s?.itemId ?? ''];
    if (!item || item.type !== 'crop') { this.emit({ type: 'toast', playerId: p.id, text: '출하 상자: 작물을 손에 들고 상호작용하면 팔 수 있어요.' }); return { ok: false, reason: 'not-sellable' }; }
    const existing = this.bin.find((b) => b.itemId === item.id);
    if (existing) existing.quantity += s.quantity; else this.bin.push({ itemId: item.id, quantity: s.quantity });
    this.emit({ type: 'toast', playerId: p.id, text: `${item.name} ×${s.quantity} 출하 (내일 아침 ${item.sellPrice * s.quantity}G 정산)`, icon: 'gold' });
    s.itemId = null; s.quantity = 0;
    this.changed(p);
    return { ok: true, anim: 'interact' };
  }

  private chop(p: PlayerState, objectId: number): ActionResult {
    const o = this.map.objects.find((ob) => ob.id === objectId);
    if (!o || this.removed.has(objectId)) return { ok: false };
    const slot = p.inventory.findIndex((s) => s.itemId === 'axe');
    if (slot < 0) return { ok: false, reason: 'no-axe' };
    if (!this.spend(p, ITEMS.axe.energyCost ?? 2)) return { ok: false, reason: 'tired' };
    this.changed(p);
    if (o.type === 'stump' || o.type === 'log') {
      this.removed.add(objectId);
      this.emit({ type: 'objectRemoved', objectId });
      this.gold += o.type === 'log' ? 15 : 8;
      this.emit({ type: 'gold', gold: this.gold, delta: o.type === 'log' ? 15 : 8 });
      return { ok: true, anim: 'axe' };
    }
    return { ok: true, anim: 'axe', reason: 'shake' };
  }

  private buy(p: PlayerState, shopId: string, itemId: string, qty: number): ActionResult {
    const shop = SHOPS[shopId]; const entry = shop?.items.find((i) => i.itemId === itemId);
    if (!shop || !entry || !ITEMS[itemId]) return { ok: false, reason: 'no-item' };
    if (p.map !== 'town') return { ok: false, reason: 'wrong-map' };
    qty = Math.max(1, Math.min(99, Math.floor(qty)));
    const m = this.time.minutes;
    if (m < hhmmToMinutes(shop.open) || m >= hhmmToMinutes(shop.close)) { this.emit({ type: 'toast', playerId: p.id, text: `${shop.name}은(는) 지금 문을 닫았어요.` }); return { ok: false, reason: 'closed' }; }
    const cost = entry.price * qty;
    if (this.gold < cost) { this.emit({ type: 'toast', playerId: p.id, text: '골드가 부족해요.', icon: 'gold' }); return { ok: false, reason: 'gold' }; }
    if (!this.addItem(p, itemId, qty)) { this.emit({ type: 'toast', playerId: p.id, text: '가방이 가득 찼어요!' }); return { ok: false, reason: 'full' }; }
    this.gold -= cost;
    this.emit({ type: 'gold', gold: this.gold, delta: -cost });
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

  addItem(p: PlayerState, itemId: string, qty: number) {
    const def = ITEMS[itemId];
    let slot = p.inventory.find((s) => s.itemId === itemId && s.quantity + qty <= def.maxStack);
    if (!slot) slot = p.inventory.find((s) => !s.itemId);
    if (!slot) return false;
    slot.itemId = itemId; slot.quantity += qty;
    return true;
  }
}
