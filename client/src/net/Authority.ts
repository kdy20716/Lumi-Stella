import { io, type Socket } from 'socket.io-client';
import { mixedContentProblem } from './serverUrl';
import { ITEMS, REGION_MAPS, SPECIES } from '@shared/data';
import { formatKrw } from '@shared/bmShop';
import type { AdminCmd, AdminUser, BanEntry, BugReport, S2C as _S2C } from '@shared/protocol';
import type { NetPlayer, RosterEntry, S2C, C2S } from '@shared/protocol';
import { FarmSimulation, MS_PER_10_MIN, type SimEvent } from '@shared/sim/FarmSimulation';
import { computeSaveSig, formatBanUntil, formatMuteRemaining, verifySaveIntegrity } from '@shared/sim/antiCheat';
import type { MapInfo } from '@shared/sim/MapInfo';
import { SoilState, isHomeMap, roomOf, type ForageSpot, type ActionIntent, type ActionResult, type Dir, type Dish, type FarmSnapshot, type FarmTile, type MapId, type PlacedObject, type PlayerState, type SaveData, type WorldTime } from '@shared/types';

export type AuthorityEvent =
  | { type: 'sim'; event: SimEvent }
  | { type: 'players'; list: NetPlayer[] }
  | { type: 'roster' }
  | { type: 'left'; id: string }
  | { type: 'anim'; id: string; anim: string; dir: Dir }
  | { type: 'chat'; from: string; name: string; text: string }
  | { type: 'correct'; x: number; y: number }
  | { type: 'disconnected'; message?: string }
  /** 연결이 잠깐 끊겨 자동으로 다시 접속하는 중 */
  | { type: 'reconnecting' }
  /** 다시 접속됨: me 가 서버 기준(끊기기 직전 위치)으로 갱신됨 */
  | { type: 'reconnected' }
  | { type: 'adminReport'; report: BugReport }
  | { type: 'reported' };

export interface PendingInvite { from: string; name: string; where: 'farm' | 'home'; t: number }

/**
 * 게임 상태 권한자 추상화.
 *  - LocalAuthority: 브라우저 안에서 FarmSimulation 을 직접 돌림 (혼자 연습하기, 저장 안 됨)
 *  - NetworkAuthority: WebSocket 서버가 권한을 가짐 (구글 로그인 멀티플레이, 서버가 저장)
 * 씬 코드는 어느 쪽이든 동일하게 동작한다.
 */
export type AdminReply = Omit<Extract<_S2C, { t: 'adminResult' }>, 't' | 'reqId'>;
export abstract class Authority {
  abstract readonly online: boolean;
  me!: PlayerState;
  time!: WorldTime;
  gold = 0;
  /** 서버/시뮬레이션이 정식 인가한 최근 골드·캐쉬 기준 (치트 변조 감시용) */
  protected authorizedGold = 0;
  protected authorizedCash = 0;
  /** 저장 파일 변조 감지 시 이유 문자열 (씬 시작 직후 즉시 치트 프리징 발동) */
  tamperDetectedReason: string | null = null;
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
  get farmOwner() { return this.me.map === 'farm' || isHomeMap(this.me.map) ? this.me.inst || this.me.id : this.me.id; }

  protected applySnapshot(s: FarmSnapshot) {
    this.tiles.clear(); this.removed.clear();
    for (const t of s.tiles) this.tiles.set(`${t.x},${t.y}`, t);
    for (const id of s.removedObjects) this.removed.add(id);
    this.forage = [...(s.forage ?? [])];
    this.dish = s.dish ?? null;
    this.placed.clear(); for (const o of s.placed ?? []) this.placed.set(o.id, { ...o });
    this.time = { ...s.time }; this.gold = s.gold; this.me.gold = s.gold;
    this.authorizedGold = s.gold;
    this.authorizedCash = Math.max(0, Math.round(this.me.cash ?? 0));
  }
  /** 런타임 메모리·콘솔 재화 무단 변조 감지 */
  checkCurrencyTamper(): string | null {
    if (this.tamperDetectedReason) return this.tamperDetectedReason;
    if (!this.me) return null;
    const g = this.me.gold;
    const c = this.me.cash ?? 0;
    if (!Number.isFinite(g) || !Number.isFinite(c) || g < 0 || c < 0) return '비정상 재화 수치 변조';
    if (g > this.authorizedGold) return `비정상 골드 증가 감지 (${this.authorizedGold}G → ${g}G)`;
    if (this.gold > this.authorizedGold) return `비정상 골드 캐시 변조 감지 (${this.authorizedGold}G → ${this.gold}G)`;
    if (c > this.authorizedCash) return `비정상 캐쉬 증가 감지 (${this.authorizedCash}원 → ${c}원)`;
    return null;
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
      case 'gold': if (e.playerId === me.id) { this.gold = e.gold; me.gold = e.gold; this.authorizedGold = e.gold; } break;
      case 'player': if (e.id === me.id) { me.energy = e.energy; me.inventory = e.inventory.map((s) => ({ ...s })); } break;
      case 'bike': if (e.id === me.id) me.riding = e.riding; break;
      case 'surf': if (e.id === me.id) me.surfing = e.surfing; break;
      case 'tile': if ((e.map ?? 'farm') === me.map && e.owner === this.farmOwner) { const k = `${e.tile.x},${e.tile.y}`; if (e.tile.soil === SoilState.Unplowed) this.tiles.delete(k); else this.tiles.set(k, { ...e.tile, crop: e.tile.crop ? { ...e.tile.crop } : null }); } break;
      case 'objectRemoved': if (!e.owner || e.owner === this.farmOwner) this.removed.add(e.key); break;
      case 'objectRestored':
        for (const k of e.keys) this.removed.delete(k);
        if ((!e.playerId || e.playerId === me.id) && me.cleared) me.cleared = me.cleared.filter((k) => !e.keys.includes(k));
        break;
      case 'forage': this.forage = [...e.spots]; break;
      case 'party': if (e.id === me.id) Object.assign(me, { party: e.party.map((c) => ({ ...c, moves: [...c.moves], pp: c.pp ? [...c.pp] : undefined })), box: (e.box ?? me.box ?? []).map((c) => ({ ...c, moves: [...c.moves], pp: c.pp ? [...c.pp] : undefined })), bag: { ...e.bag }, badges: [...e.badges], defeated: [...e.defeated], seen: [...e.seen], caught: [...e.caught], visited: [...e.visited], recipes: [...(e.recipes ?? [])], flags: [...(e.flags ?? [])], bonds: { ...(e.bonds ?? me.bonds ?? {}) }, asks: { ...(e.asks ?? me.asks ?? {}) }, stock: JSON.parse(JSON.stringify(e.stock ?? me.stock ?? {})), opened: [...(e.opened ?? me.opened ?? [])] }); break;
      case 'room': if (e.playerId === me.id) { Object.assign(me, { map: e.map, inst: e.inst, world: e.world, x: e.x, y: e.y }); this.applySnapshot(e.snapshot); } break;
      case 'look': { if (e.id === me.id) { me.look = e.look; me.name = e.name; } const r = this.roster.get(e.id); if (r) { r.look = e.look; r.name = e.name; } break; }
      case 'dish': if (e.room === this.room) this.dish = e.dish; break;
      case 'invite': if (e.to === me.id) this.invites.set(e.from, { from: e.from, name: e.fromName, where: e.where, t: Date.now() }); break;
      case 'story': if (e.id === me.id) me.story = e.story; break;
      case 'bmState':
        if (e.id === me.id) {
          Object.assign(me, {
            mailItems: e.mailItems, uiTheme: e.uiTheme, ownedThemes: e.ownedThemes,
            ownedOutfits: e.ownedOutfits, lumiCoord: e.lumiCoord, ownedLumiCoords: e.ownedLumiCoords,
            chatBubble: e.chatBubble, ownedBubbles: e.ownedBubbles, bmOrders: e.bmOrders,
            cash: e.cash, isAdmin: e.isAdmin,
          });
          this.authorizedCash = Math.max(0, Math.round(e.cash ?? 0));
        }
        break;
      case 'prisonState':
        if (e.playerId === me.id) {
          me.jailed = e.jailed;
          me.prisonMined = e.mined;
          if (e.reason !== undefined) me.jailReason = e.reason;
        }
        break;
      case 'prisonLabor':
        if (e.playerId === me.id) {
          me.prisonSlabs = e.slabs;
          me.prisonPlanks = e.planks;
        }
        break;
      case 'karma':
        if (e.playerId === me.id) {
          me.evilStack = e.evilStack;
          me.momLeft = e.momLeft;
          if (e.pendingHomecoming !== undefined) me.pendingHomecoming = e.pendingHomecoming;
          if (e.lastHelpedNpc !== undefined) me.lastHelpedNpc = e.lastHelpedNpc;
        }
        break;
      case 'notices':
        if (e.playerId === me.id) me.notices = e.notices.map((n) => ({ ...n }));
        break;
      case 'lifeDex':
        if (e.playerId === me.id) {
          me.lifeDex = JSON.parse(JSON.stringify(e.lifeDex));
          me.lifeDexClaims = [...e.lifeDexClaims];
        }
        break;
      case 'hunger':
        if (e.playerId === me.id) {
          me.food = e.food;
          me.hungerOff = e.hungerOff;
        }
        break;
      case 'mute':
        if (e.playerId === me.id) me.muteRemainingSec = e.muteRemainingSec;
        break;
      case 'cheatFreeze':
        if (e.playerId === me.id) {
          me.jailed = true;
          me.jailReason = e.reason;
        }
        break;
      case 'placed': if (me.map === 'farm' && e.owner === this.farmOwner) this.placed.set(e.obj.id, { ...e.obj }); break;
      case 'unplaced': if (me.map === 'farm' && e.owner === this.farmOwner) this.placed.delete(e.id); break;
    }
  }
  protected subMs = 0;
  /** 조명 보간용 소수점 분 */
  get minutesSmooth() { return this.time.minutes + Math.min(10, (this.subMs / MS_PER_10_MIN) * 10); }
  abstract request(a: ActionIntent): Promise<ActionResult>;
  /** 서버가 확인한 관리자 계정이면 true (멀티 전용). 화면 표시용일 뿐, 실제 권한 검사는 서버가 함 */
  isAdmin = false;
  admin(_cmd: AdminCmd): Promise<AdminReply> { void _cmd; return Promise.resolve({ ok: false, message: '멀티플레이에서만 쓸 수 있어요' }); }
  /** 버그·유저 신고 → 관리자 휴대폰으로 */
  report(_text: string, _where: string, _extra?: { kind?: 'bug' | 'user'; targetUid?: string; targetName?: string }): boolean { void _text; void _where; void _extra; return false; }
  shopServerUrl(): string | null { return null; }
  shopHeaders(): Promise<Record<string, string>> { return Promise.resolve({}); }
  abstract sendMove(x: number, y: number, dir: Dir, anim: string): void;
  abstract sendAnim(anim: string, dir: Dir): void;
  abstract chat(text: string): void;
  close() { /* 기본: 없음 */ }
  update(dt: number) { this.subMs += dt; }
}

const SOLO_KEY = 'sf:solo:v1';
const LOCAL_MOD_KEY = 'sf:local:mod:v1';
interface LocalModStore { reports: BugReport[]; bans: BanEntry[] }
function readLocalMod(): LocalModStore {
  try {
    const raw = localStorage.getItem(LOCAL_MOD_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<LocalModStore>;
      return { reports: Array.isArray(p.reports) ? p.reports : [], bans: Array.isArray(p.bans) ? p.bans : [] };
    }
  } catch { /* 무시 */ }
  return { reports: [], bans: [] };
}
function writeLocalMod(d: LocalModStore) {
  try { localStorage.setItem(LOCAL_MOD_KEY, JSON.stringify(d)); } catch { /* 무시 */ }
}

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
    if (saved?.save) {
      const check = verifySaveIntegrity(saved.save);
      if (!check.ok) this.tamperDetectedReason = check.reason ?? '저장 파일 재화 변조 감지';
    }
    if (saved?.time) this.sim.setWorld(saved.time);
    this.me = this.sim.addPlayer('local', saved?.save?.name ?? '트레이너', saved?.save?.look ?? '', saved?.save ?? null);
    this.me.mode = 'story';   // 이 브라우저 저장 = 스토리 모드 (혼자)
    const params = new URLSearchParams(location.search);
    if (params.has('admin') || params.has('offline')) {
      this.isAdmin = true;
      this.sim.setAdminProfile('local', true);
    }
    this.applySnapshot(this.sim.snapshot('local'));
    this.storageKind = '이 브라우저 (혼자하기)';
    this.sim.on((event) => {
      this.emit({ type: 'sim', event });
      if (event.type === 'room' || event.type === 'newDay' || event.type === 'story' || event.type === 'look' || event.type === 'bmState' || event.type === 'party' || event.type === 'prisonState' || event.type === 'prisonLabor' || event.type === 'karma' || event.type === 'notices' || event.type === 'mute' || event.type === 'cheatFreeze' || event.type === 'gold') this.save();
    });
    this.saveTimer = window.setInterval(() => this.save(), 30_000);
    window.addEventListener('beforeunload', () => this.save());
  }
  save() {
    const d = this.sim.exportSave('local');
    if (!d || (!d.look && !d.jailed) || this.resetting) return;
    if (!d.look && d.jailed) d.look = 'm1';
    d.saveSig = computeSaveSig({ gold: d.gold, cash: d.cash ?? 0, jailed: !!d.jailed, muteRemainingSec: d.muteRemainingSec ?? 0 });
    try { localStorage.setItem(SOLO_KEY, JSON.stringify({ save: d, time: this.sim.time })); } catch { /* 용량 초과 등 */ }
  }
  override close() { clearInterval(this.saveTimer); }
  override get minutesSmooth() { return this.sim.time.minutes + this.sim.subMinute; }
  async request(a: ActionIntent) {
    if (a.kind === 'resetSave') { this.resetting = true; LocalAuthority.clear(); return { ok: true }; }
    const r = this.sim.apply(this.me.id, a);
    if (a.kind === 'cheatCaught' || a.kind === 'prisonEscape' || a.kind === 'yardDeliver' || a.kind === 'completeHomecoming' || a.kind === 'goodDeed' || a.kind === 'markNoticesRead') this.save();
    return r;
  }
  override report(text: string, where: string, extra?: { kind?: 'bug' | 'user'; targetUid?: string; targetName?: string }): boolean {
    const clean = String(text ?? '').trim().slice(0, 500);
    if (!clean) return false;
    const mod = readLocalMod();
    const rep: BugReport = {
      id: `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      uid: this.me.id,
      name: this.me.name,
      text: clean,
      where,
      at: Date.now(),
      kind: extra?.kind ?? (extra?.targetUid ? 'user' : 'bug'),
      targetUid: extra?.targetUid || undefined,
      targetName: extra?.targetName || (extra?.targetUid ? this.sim.players.get(extra.targetUid)?.name : undefined),
    };
    mod.reports.unshift(rep);
    writeLocalMod(mod);
    this.emit({ type: 'reported' });
    if (this.isAdmin) this.emit({ type: 'adminReport', report: rep });
    return true;
  }
  override async admin(cmd: AdminCmd): Promise<AdminReply> {
    if (!this.isAdmin) return { ok: false, message: '권한 없음' };
    switch (cmd.op) {
      case 'users': {
        const users: AdminUser[] = [...this.sim.players.values()].map((p) => ({
          uid: p.id,
          name: p.name,
          look: p.look,
          map: p.map,
          mapName: REGION_MAPS[p.map]?.name ?? p.map,
          gold: p.gold,
          cash: p.cash ?? 0,
          badges: p.badges.length,
          party: p.party.map((c) => `${SPECIES[c.species]?.name ?? c.species} Lv${c.level}`).join(', '),
          online: true,
          world: p.world ? '친구들만' : '모두',
          jailed: !!p.jailed,
          muteRemainingSec: Math.ceil(p.muteRemainingSec ?? 0),
        }));
        const mod = readLocalMod();
        const now = Date.now();
        const activeBans = mod.bans.filter((b) => !b.until || now < b.until);
        if (activeBans.length !== mod.bans.length) { mod.bans = activeBans; writeLocalMod(mod); }
        return { ok: true, users, bans: activeBans };
      }
      case 'reports': {
        const mod = readLocalMod();
        return { ok: true, reports: [...mod.reports].sort((a, b) => b.at - a.at) };
      }
      case 'resolve': {
        const mod = readLocalMod();
        const rep = mod.reports.find((r) => r.id === cmd.id);
        if (rep) rep.resolved = true;
        writeLocalMod(mod);
        return { ok: true, message: '신고를 처리 완료했어요' };
      }
      case 'mute': {
        const t = this.sim.players.get(cmd.uid);
        if (!t) return { ok: false, message: '대상이 없어요' };
        const mins = Math.max(1, Math.min(10_080, Math.round(Number(cmd.minutes) || 10)));
        this.sim.mutePlayer(t, mins, cmd.reason ?? '');
        this.save();
        return { ok: true, message: `${t.name} 님에게 ${mins}분 채팅 금지를 적용했어요 (접속 중일 때만 차감)` };
      }
      case 'unmute': {
        const t = this.sim.players.get(cmd.uid);
        if (!t) return { ok: false, message: '대상이 없어요' };
        this.sim.unmutePlayer(t);
        this.save();
        return { ok: true, message: `${t.name} 님의 채팅 금지를 해제했어요` };
      }
      case 'ban': {
        const days = typeof cmd.days === 'number' && Number.isFinite(cmd.days) && cmd.days > 0 ? Math.min(3650, Math.round(cmd.days)) : 0;
        const until = days > 0 ? Date.now() + days * 86_400_000 : undefined;
        const name = this.sim.players.get(cmd.uid)?.name ?? cmd.uid;
        const reason = String(cmd.reason ?? (days > 0 ? `관리자 ${days}일 접속 금지` : '관리자 영구 정지')).slice(0, 80);
        const mod = readLocalMod();
        mod.bans = mod.bans.filter((b) => b.uid !== cmd.uid);
        mod.bans.unshift({ uid: cmd.uid, name, reason, at: Date.now(), until });
        writeLocalMod(mod);
        return { ok: true, message: `${name} 님에게 접속 금지 적용 (${formatBanUntil(until)})` };
      }
      case 'unban': {
        const mod = readLocalMod();
        mod.bans = mod.bans.filter((b) => b.uid !== cmd.uid);
        writeLocalMod(mod);
        return { ok: true, message: '접속 금지를 해제했어요' };
      }
      case 'jail': {
        const t = this.sim.players.get(cmd.uid);
        if (!t) return { ok: false, message: '대상이 없어요' };
        this.sim.jailPlayer(t, cmd.reason ?? '관리자 제재 수감', cmd.fine !== false);
        this.save();
        return { ok: true, message: `${t.name} 님을 별빛 교도소로 보냈어요!` };
      }
      case 'unjail': {
        const t = this.sim.players.get(cmd.uid);
        if (!t) return { ok: false, message: '대상이 없어요' };
        this.sim.unjailPlayer(t);
        this.save();
        return { ok: true, message: `${t.name} 님을 석방했어요` };
      }
      case 'give': {
        const t = this.sim.players.get(cmd.uid);
        if (!t || !ITEMS[cmd.itemId]) return { ok: false, message: '지급 실패' };
        if (!this.sim.grant(t, cmd.itemId, Number(cmd.qty))) return { ok: false, message: '가방이 가득 찼어요' };
        this.save();
        return { ok: true, message: `${ITEMS[cmd.itemId].name}을(를) 지급했어요` };
      }
      case 'gold': {
        const t = this.sim.players.get(cmd.uid);
        if (!t || !this.sim.grantGold(t, Number(cmd.amount))) return { ok: false, message: '골드 변경 실패' };
        this.save();
        return { ok: true, message: '골드를 바꿨어요' };
      }
      case 'grantCash': {
        const t = this.sim.players.get(cmd.uid);
        if (!t) return { ok: false, message: '대상이 없어요' };
        if (cmd.mode === 'ensureAll') this.sim.ensureAdminCash(t, true);
        else this.sim.grantCash(t, Number(cmd.amount));
        this.save();
        return { ok: true, message: `${t.name} 님 보유 캐쉬: ${formatKrw(t.cash ?? 0)}` };
      }
      case 'resetBm': {
        const t = this.sim.players.get(cmd.uid);
        if (!t) return { ok: false, message: '대상이 없어요' };
        this.sim.resetBmState(t);
        this.save();
        return { ok: true, message: '캐쉬 상점 구매 기록을 초기화했어요' };
      }
      case 'warp': {
        const t = this.sim.players.get(cmd.uid);
        if (!t || !this.sim.warpTo(t, cmd.map)) return { ok: false, message: '이동 실패' };
        this.save();
        return { ok: true, message: `${REGION_MAPS[cmd.map]?.name ?? cmd.map}(으)로 이동했어요` };
      }
      case 'setTime': {
        this.sim.setTimeMinutes(cmd.minutes);
        this.save();
        const hh = Math.floor(cmd.minutes / 60) % 24, mm = cmd.minutes % 60;
        return { ok: true, message: `시각을 ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}(으)로 바꿨어요` };
      }
      default:
        return { ok: false, message: '멀티플레이 서버에서 사용할 수 있는 명령이에요' };
    }
  }
  sendMove(x: number, y: number, dir: Dir, anim: string) { Object.assign(this.me, { x, y, dir, anim }); }
  sendAnim() { /* 혼자: 브로드캐스트 불필요 */ }
  chat(text: string) {
    if ((this.me.muteRemainingSec ?? 0) > 0) {
      this.emit({ type: 'chat', from: 'server', name: '시스템', text: `🔇 채팅 금지 상태입니다! 남은 접속 시간: ${formatMuteRemaining(this.me.muteRemainingSec!)} (인게임 접속 중일 때만 시간이 흐릅니다)` });
      return;
    }
    this.emit({ type: 'chat', from: this.me.id, name: this.me.name, text });
  }
  override update(dt: number) { this.sim.tick(dt); }
}

type Cred = { token?: string; dev?: string; mode?: 'public' | 'friends' | 'story' };

export class NetworkAuthority extends Authority {
  readonly online = true;
  private socket!: Socket;
  private reqId = 0;
  private pending = new Map<number, (r: ActionResult) => void>();
  private seq = 0;
  private lastSent = 0;
  private closedByUser = false;

  /**
   * Socket.io 로 게임 서버에 접속 → join → welcome 을 받으면 완료
   * url: serverUrl() (VITE_SERVER_URL · ?server= · 같은 PC 2567)
   * cred: { token } = 구글 로그인 ID 토큰, { dev } = 서버를 DEV_AUTH=1 로 띄웠을 때 테스트용
   * 패킷: emit(이름 = 메시지 t, 메시지) / 서버도 같은 규칙 → onAny 로 받아서 handle
   */
  /** 끊긴 뒤 이 시간 안에 다시 붙지 못하면 포기하고 타이틀로 */
  static readonly GIVE_UP_MS = 3 * 60_000;

  private credInfo!: Cred;
  private refreshCred?: () => Promise<Cred>;
  private httpUrl = '';

  static connect(url: string, cred: Cred, refresh?: () => Promise<Cred>): Promise<NetworkAuthority> {
    const a = new NetworkAuthority();
    a.httpUrl = url;
    a.credInfo = cred;
    a.refreshCred = refresh;
    return new Promise((resolve, reject) => {
      if (mixedContentProblem(url)) { reject(new Error('https 페이지에서는 https 서버 주소가 필요해요 (VITE_SERVER_URL 확인)')); return; }
      // 웹소켓을 먼저 쓰고, 막혀 있으면 HTTP 롱폴링으로 자동 대체.
      // 다른 창에 잠깐 다녀오거나 휴대폰 화면이 꺼져 끊겨도 자동으로 다시 접속 (같은 계정 · 끊기기 직전 위치)
      const socket = io(url, { transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 800, reconnectionDelayMax: 5000, timeout: 10000, withCredentials: true });
      a.socket = socket;
      let joined = false, kicked = false, giveUp = 0;
      const fail = (msg: string) => { clearTimeout(timeout); if (!joined) { socket.disconnect(); reject(new Error(msg)); } };
      const timeout = setTimeout(() => fail('서버 응답 없음 (서버가 켜져 있는지, 주소가 맞는지 확인)'), 15000);
      socket.on('connect', () => {
        if (!joined) { a.send({ t: 'join', ...cred }); return; }
        // 재접속: 구글 토큰은 1시간이면 만료되므로 새로 받아서 다시 join
        void (refresh ? refresh().catch(() => cred) : Promise.resolve(cred)).then((c) => { cred = { ...c, mode: cred.mode }; a.send({ t: 'join', ...cred }); });
      });
      socket.on('connect_error', (e: Error) => { if (joined) return; console.warn('[socket] 접속 실패', url, e.message); fail(`서버에 접속할 수 없어요 (${url})`); });
      socket.on('disconnect', (reason: string) => {
        if (!joined || a.closedByUser) return;
        // 서버가 끊은 경우(다른 곳에서 접속 · 정지 등)는 다시 붙지 않음
        if (kicked || reason === 'io server disconnect') { a.emit({ type: 'disconnected', message: kicked ? a.kickMessage : undefined }); return; }
        a.emit({ type: 'reconnecting' });
        clearTimeout(giveUp);
        giveUp = window.setTimeout(() => { if (!socket.connected) { a.closedByUser = true; socket.disconnect(); a.emit({ type: 'disconnected', message: '서버와 연결이 끊겼어요' }); } }, NetworkAuthority.GIVE_UP_MS);
      });
      // 화면으로 돌아오면 기다리지 말고 바로 다시 접속 시도
      const wake = () => { if (joined && !a.closedByUser && !kicked && !socket.connected && !document.hidden) socket.connect(); };
      document.addEventListener('visibilitychange', wake);
      window.addEventListener('focus', wake);
      window.addEventListener('online', wake);
      socket.onAny((ev: string, msg: S2C) => {
        if (!msg || typeof msg !== 'object' || msg.t !== ev) return;
        if (msg.t === 'welcome') {
          clearTimeout(timeout); clearTimeout(giveUp);
          const again = joined; joined = true;
          a.me = msg.you; a.storageKind = msg.storage; a.isAdmin = msg.admin === true;
          a.me.isAdmin = a.isAdmin;
          a.applySnapshot(msg.snapshot);
          a.roster.clear();
          for (const p of msg.roster) if (p.id !== msg.id) a.roster.set(p.id, p);
          // 끊겨 있던 동안의 요청은 응답이 오지 않으므로 실패로 정리
          for (const [, res] of a.pending) res({ ok: false, reason: 'timeout' });
          a.pending.clear();
          if (again) a.emit({ type: 'reconnected' }); else resolve(a);
        } else if (msg.t === 'error' && !joined) fail(msg.message);
        else if (msg.t === 'error') { kicked = true; a.kickMessage = msg.message; a.handle(msg); }
        else a.handle(msg);
      });
    });
  }
  private kickMessage?: string;

  private send(m: C2S) { if (this.socket?.connected) this.socket.emit(m.t, m); }

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
      case 'adminResult': { const { t: _t2, reqId, ...r } = m; void _t2; this.adminPending.get(reqId)?.(r); this.adminPending.delete(reqId); break; }
      case 'adminReport': this.emit({ type: 'adminReport', report: m.report }); break;
      case 'reported': this.emit({ type: 'reported' }); break;
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
  private adminPending = new Map<number, (r: AdminReply) => void>();
  admin(cmd: AdminCmd): Promise<AdminReply> {
    const reqId = ++this.reqId;
    this.send({ t: 'admin', cmd, reqId });
    return new Promise((res) => { this.adminPending.set(reqId, res); setTimeout(() => { if (this.adminPending.delete(reqId)) res({ ok: false, message: '응답 없음' }); }, 8000); });
  }
  report(text: string, where: string, extra?: { kind?: 'bug' | 'user'; targetUid?: string; targetName?: string }) {
    this.send({ t: 'report', text, where, kind: extra?.kind, targetUid: extra?.targetUid, targetName: extra?.targetName });
    return true;
  }
  override shopServerUrl() { return this.httpUrl; }
  override async shopHeaders(): Promise<Record<string, string>> {
    const c = this.refreshCred ? await this.refreshCred().catch(() => this.credInfo) : this.credInfo;
    this.credInfo = { ...c, mode: this.credInfo.mode };
    if (c.token) return { Authorization: `Bearer ${c.token}` };
    if (c.dev) return { 'X-Dev-User': encodeURIComponent(c.dev) };
    return {};
  }
  chat(text: string) { this.send({ t: 'chat', text }); }
  override close() { this.closedByUser = true; this.socket?.disconnect(); }
}
