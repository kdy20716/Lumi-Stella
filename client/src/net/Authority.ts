import type { NetPlayer, RosterEntry, S2C, C2S } from '@shared/protocol';
import { FarmSimulation, MS_PER_10_MIN, type SimEvent } from '@shared/sim/FarmSimulation';
import type { MapInfo } from '@shared/sim/MapInfo';
import { SoilState, roomOf, type ForageSpot, type ActionIntent, type ActionResult, type Dir, type Dish, type FarmSnapshot, type FarmTile, type MapId, type PlacedObject, type PlayerState, type SaveData, type WorldTime } from '@shared/types';

export type AuthorityEvent =
  | { type: 'sim'; event: SimEvent }
  | { type: 'players'; list: NetPlayer[] }
  | { type: 'roster' }
  | { type: 'left'; id: string }
  | { type: 'anim'; id: string; anim: string; dir: Dir }
  | { type: 'chat'; from: string; name: string; text: string }
  | { type: 'correct'; x: number; y: number }
  | { type: 'disconnected'; message?: string };

export interface PendingInvite { from: string; name: string; where: 'farm' | 'home'; t: number }

/**
 * 게임 상태 권한자 추상화.
 *  - LocalAuthority: 브라우저 안에서 FarmSimulation 을 직접 돌림 (혼자 연습하기, 저장 안 됨)
 *  - NetworkAuthority: WebSocket 서버가 권한을 가짐 (구글 로그인 멀티플레이, 서버가 저장)
 * 씬 코드는 어느 쪽이든 동일하게 동작한다.
 */
export abstract class Authority {
  abstract readonly online: boolean;
  me!: PlayerState;
  time!: WorldTime;
  gold = 0;
  /** 지금 있는 방의 상태 사본 (농장이면 그 주인의 경작지) */
  readonly tiles = new Map<string, FarmTile>();
  readonly removed = new Set<string>();
  forage: ForageSpot[] = [];
  dish: Dish | null = null;
  /** 지금 있는 농장의 설치물 */
  readonly placed = new Map<string, PlacedObject>();
  /** 접속 중인 다른 플레이어 전원 (어느 방이든) */
  readonly roster = new Map<string, RosterEntry>();
  /** 받은 초대장 */
  readonly invites = new Map<string, PendingInvite>();
  storageKind = '';

  get room() { return roomOf(this.me.map, this.me.inst, this.me.world); }
  /** 지금 보고 있는 농장의 주인 id */
  get farmOwner() { return this.me.map === 'farm' || this.me.map === 'home' ? this.me.inst || this.me.id : this.me.id; }

  protected applySnapshot(s: FarmSnapshot) {
    this.tiles.clear(); this.removed.clear();
    for (const t of s.tiles) this.tiles.set(`${t.x},${t.y}`, t);
    for (const id of s.removedObjects) this.removed.add(id);
    this.forage = [...(s.forage ?? [])];
    this.dish = s.dish ?? null;
    this.placed.clear(); for (const o of s.placed ?? []) this.placed.set(o.id, { ...o });
    this.time = { ...s.time }; this.gold = s.gold; this.me.gold = s.gold;
  }
  protected listeners: ((e: AuthorityEvent) => void)[] = [];
  on(fn: (e: AuthorityEvent) => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  protected emit(e: AuthorityEvent) {
    if (e.type === 'sim') this.track(e.event);
    for (const l of [...this.listeners]) l(e);
  }
  /** 공통: 이벤트로 로컬 사본 갱신 */
  protected track(e: SimEvent) {
    const me = this.me;
    switch (e.type) {
      case 'time': case 'newDay': this.time = { ...e.time }; this.subMs = 0; break;
      case 'gold': if (e.playerId === me.id) { this.gold = e.gold; me.gold = e.gold; } break;
      case 'player': if (e.id === me.id) { me.energy = e.energy; me.inventory = e.inventory.map((s) => ({ ...s })); } break;
      case 'tile': if (me.map === 'farm' && e.owner === this.farmOwner) { const k = `${e.tile.x},${e.tile.y}`; if (e.tile.soil === SoilState.Unplowed) this.tiles.delete(k); else this.tiles.set(k, { ...e.tile, crop: e.tile.crop ? { ...e.tile.crop } : null }); } break;
      case 'objectRemoved': if (!e.owner || e.owner === this.farmOwner) this.removed.add(e.key); break;
      case 'objectRestored': for (const k of e.keys) this.removed.delete(k); break;
      case 'forage': this.forage = [...e.spots]; break;
      case 'party': if (e.id === me.id) Object.assign(me, { party: e.party.map((c) => ({ ...c, moves: [...c.moves] })), bag: { ...e.bag }, badges: [...e.badges], defeated: [...e.defeated], seen: [...e.seen], caught: [...e.caught], visited: [...e.visited], recipes: [...(e.recipes ?? [])] }); break;
      case 'room': if (e.playerId === me.id) { Object.assign(me, { map: e.map, inst: e.inst, world: e.world, x: e.x, y: e.y }); this.applySnapshot(e.snapshot); } break;
      case 'look': { if (e.id === me.id) { me.look = e.look; me.name = e.name; } const r = this.roster.get(e.id); if (r) { r.look = e.look; r.name = e.name; } break; }
      case 'dish': if (e.room === this.room) this.dish = e.dish; break;
      case 'invite': if (e.to === me.id) this.invites.set(e.from, { from: e.from, name: e.fromName, where: e.where, t: Date.now() }); break;
      case 'story': if (e.id === me.id) me.story = e.story; break;
      case 'placed': if (me.map === 'farm' && e.owner === this.farmOwner) this.placed.set(e.obj.id, { ...e.obj }); break;
      case 'unplaced': if (me.map === 'farm' && e.owner === this.farmOwner) this.placed.delete(e.id); break;
    }
  }
  protected subMs = 0;
  /** 조명 보간용 소수점 분 */
  get minutesSmooth() { return this.time.minutes + Math.min(10, (this.subMs / MS_PER_10_MIN) * 10); }
  abstract request(a: ActionIntent): Promise<ActionResult>;
  abstract sendMove(x: number, y: number, dir: Dir, anim: string): void;
  abstract sendAnim(anim: string, dir: Dir): void;
  abstract chat(text: string): void;
  close() { /* 기본: 없음 */ }
  update(dt: number) { this.subMs += dt; }
}

const SOLO_KEY = 'sf:solo:v1';
/** 혼자하기(오프라인): 이 브라우저 localStorage 에 자동 저장 */
export class LocalAuthority extends Authority {
  readonly online = false;
  readonly sim: FarmSimulation;
  private saveTimer = 0;
  private resetting = false;
  static hasSave() { try { return !!localStorage.getItem(SOLO_KEY); } catch { return false; } }
  static clear() { try { localStorage.removeItem(SOLO_KEY); } catch { /* 무시 */ } }
  constructor(maps: Record<MapId, MapInfo>) {
    super();
    this.sim = new FarmSimulation(maps);
    let saved: { save: SaveData; time: WorldTime } | null = null;
    try { const raw = localStorage.getItem(SOLO_KEY); if (raw) saved = JSON.parse(raw); } catch { saved = null; }
    if (saved?.time) this.sim.setWorld(saved.time);
    this.me = this.sim.addPlayer('local', saved?.save?.name ?? '트레이너', saved?.save?.look ?? '', saved?.save ?? null);
    this.applySnapshot(this.sim.snapshot('local'));
    this.storageKind = '이 브라우저 (혼자하기)';
    this.sim.on((event) => {
      this.emit({ type: 'sim', event });
      if (event.type === 'room' || event.type === 'newDay' || event.type === 'story' || event.type === 'look') this.save();
    });
    this.saveTimer = window.setInterval(() => this.save(), 30_000);
    window.addEventListener('beforeunload', () => this.save());
  }
  save() {
    const d = this.sim.exportSave('local');
    if (!d || !d.look || this.resetting) return;
    try { localStorage.setItem(SOLO_KEY, JSON.stringify({ save: d, time: this.sim.time })); } catch { /* 용량 초과 등 */ }
  }
  override close() { clearInterval(this.saveTimer); }
  override get minutesSmooth() { return this.sim.time.minutes + this.sim.subMinute; }
  async request(a: ActionIntent) {
    if (a.kind === 'resetSave') { this.resetting = true; LocalAuthority.clear(); return { ok: true }; }
    return this.sim.apply(this.me.id, a);
  }
  sendMove(x: number, y: number, dir: Dir, anim: string) { Object.assign(this.me, { x, y, dir, anim }); }
  sendAnim() { /* 혼자: 브로드캐스트 불필요 */ }
  chat(text: string) { this.emit({ type: 'chat', from: this.me.id, name: this.me.name, text }); }
  override update(dt: number) { this.sim.tick(dt); }
}

export class NetworkAuthority extends Authority {
  readonly online = true;
  private ws!: WebSocket;
  private reqId = 0;
  private pending = new Map<number, (r: ActionResult) => void>();
  private seq = 0;
  private lastSent = 0;
  private closedByUser = false;

  /** cred: { token } = 구글 로그인 ID 토큰, { dev } = 서버를 DEV_AUTH=1 로 띄웠을 때 테스트용 */
  static connect(url: string, cred: { token?: string; dev?: string; mode?: 'public' | 'friends' }): Promise<NetworkAuthority> {
    const a = new NetworkAuthority();
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try { ws = new WebSocket(url); } catch { reject(new Error('서버 주소가 올바르지 않아요')); return; }
      a.ws = ws;
      let joined = false;
      const timeout = setTimeout(() => { ws.close(); reject(new Error('서버 응답 없음')); }, 8000);
      ws.onopen = () => a.send({ t: 'join', ...cred });
      ws.onerror = () => { clearTimeout(timeout); if (!joined) reject(new Error('서버에 접속할 수 없어요')); };
      ws.onclose = () => { if (joined && !a.closedByUser) a.emit({ type: 'disconnected' }); };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as S2C;
        if (msg.t === 'welcome') {
          clearTimeout(timeout); joined = true;
          a.me = msg.you; a.storageKind = msg.storage;
          a.applySnapshot(msg.snapshot);
          for (const p of msg.roster) if (p.id !== msg.id) a.roster.set(p.id, p);
          resolve(a);
        } else if (msg.t === 'error' && !joined) { clearTimeout(timeout); reject(new Error(msg.message)); }
        else a.handle(msg);
      };
    });
  }

  private send(m: C2S) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private handle(m: S2C) {
    switch (m.t) {
      case 'sim': this.emit({ type: 'sim', event: m.event }); break;
      case 'players': this.emit({ type: 'players', list: m.list.filter((p) => p.id !== this.me.id) }); break;
      case 'roster': this.roster.clear(); for (const p of m.list) if (p.id !== this.me.id) this.roster.set(p.id, p); this.emit({ type: 'roster' }); break;
      case 'left': this.roster.delete(m.id); this.invites.delete(m.id); this.emit({ type: 'left', id: m.id }); break;
      case 'anim': if (m.id !== this.me.id) this.emit({ type: 'anim', id: m.id, anim: m.anim, dir: m.dir }); break;
      case 'chat': this.emit({ type: 'chat', from: m.from, name: m.name, text: m.text }); break;
      case 'correct': this.emit({ type: 'correct', x: m.x, y: m.y }); break;
      case 'error': this.emit({ type: 'disconnected', message: m.message }); break;
      case 'actionResult': { const { t: _t, reqId, ...r } = m; void _t; this.pending.get(reqId)?.(r); this.pending.delete(reqId); break; }
    }
  }

  request(action: ActionIntent): Promise<ActionResult> {
    const reqId = ++this.reqId;
    this.send({ t: 'action', action, reqId });
    return new Promise((res) => { this.pending.set(reqId, res); setTimeout(() => { if (this.pending.delete(reqId)) res({ ok: false, reason: 'timeout' }); }, 4000); });
  }
  sendMove(x: number, y: number, dir: Dir, anim: string) {
    const now = performance.now();
    if (now - this.lastSent < 1000 / 20) return; // 20Hz 제한
    this.lastSent = now;
    Object.assign(this.me, { x, y, dir, anim });
    this.send({ t: 'move', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, dir, anim, seq: ++this.seq });
  }
  /** 방 이동 직후 잠깐 위치 전송을 멈춤 (서버가 새 위치를 기준으로 검증하도록) */
  holdMoves(ms = 300) { this.lastSent = performance.now() + ms; }
  sendAnim(anim: string, dir: Dir) { this.send({ t: 'anim', anim, dir }); }
  chat(text: string) { this.send({ t: 'chat', text }); }
  override close() { this.closedByUser = true; this.ws.close(); }
}
