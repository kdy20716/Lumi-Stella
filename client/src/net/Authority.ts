import type { NetPlayer, S2C, C2S } from '@shared/protocol';
import { FarmSimulation, MS_PER_10_MIN, type SimEvent } from '@shared/sim/FarmSimulation';
import type { MapInfo } from '@shared/sim/MapInfo';
import type { ActionIntent, ActionResult, Dir, FarmSnapshot, PlayerState, WorldTime } from '@shared/types';

export type AuthorityEvent =
  | { type: 'sim'; event: SimEvent }
  | { type: 'players'; list: NetPlayer[] }
  | { type: 'joined'; player: NetPlayer }
  | { type: 'left'; id: string }
  | { type: 'anim'; id: string; anim: string; dir: Dir }
  | { type: 'chat'; name: string; text: string }
  | { type: 'correct'; x: number; y: number }
  | { type: 'disconnected' };

/**
 * 게임 상태 권한자 추상화.
 *  - LocalAuthority: 브라우저 안에서 FarmSimulation 을 직접 돌림 (싱글플레이)
 *  - NetworkAuthority: WebSocket 서버가 권한을 가짐 (멀티플레이). 클라이언트는 Intent 만 전송
 * 씬 코드는 어느 쪽이든 동일하게 동작한다.
 */
export abstract class Authority {
  abstract readonly online: boolean;
  me!: PlayerState;
  time!: WorldTime;
  gold = 0;
  initial!: FarmSnapshot;
  protected listeners: ((e: AuthorityEvent) => void)[] = [];
  on(fn: (e: AuthorityEvent) => void) { this.listeners.push(fn); }
  protected emit(e: AuthorityEvent) {
    if (e.type === 'sim') this.track(e.event);
    for (const l of this.listeners) l(e);
  }
  /** 공통: 이벤트로 로컬 사본(시간/골드/내 인벤토리) 갱신 */
  protected track(e: SimEvent) {
    if (e.type === 'time' || e.type === 'newDay') { this.time = { ...e.time }; this.subMs = 0; }
    if (e.type === 'gold') this.gold = e.gold;
    if (e.type === 'player' && e.id === this.me.id) { this.me.energy = e.energy; this.me.inventory = e.inventory.map((s) => ({ ...s })); }
  }
  protected subMs = 0;
  /** 조명 보간용 소수점 분 */
  get minutesSmooth() { return this.time.minutes + Math.min(10, (this.subMs / MS_PER_10_MIN) * 10); }
  abstract request(a: ActionIntent): Promise<ActionResult>;
  abstract sendMove(x: number, y: number, dir: Dir, anim: string): void;
  abstract sendAnim(anim: string, dir: Dir): void;
  abstract chat(text: string): void;
  update(dt: number) { this.subMs += dt; }
}

export class LocalAuthority extends Authority {
  readonly online = false;
  readonly sim: FarmSimulation;
  constructor(map: MapInfo, spawn: { x: number; y: number }) {
    super();
    this.sim = new FarmSimulation(map);
    this.me = this.sim.addPlayer('local', '농부', 'player', spawn.x, spawn.y);
    this.initial = this.sim.snapshot();
    this.time = { ...this.sim.time }; this.gold = this.sim.gold;
    this.sim.on((event) => this.emit({ type: 'sim', event }));
  }
  override get minutesSmooth() { return this.sim.time.minutes + this.sim.subMinute; }
  async request(a: ActionIntent) { return this.sim.apply(this.me.id, a); }
  sendMove(x: number, y: number, dir: Dir, anim: string) { Object.assign(this.me, { x, y, dir, anim }); }
  sendAnim() { /* 싱글플레이: 브로드캐스트 불필요 */ }
  chat(text: string) { this.emit({ type: 'chat', name: this.me.name, text }); }
  override update(dt: number) { this.sim.tick(dt); }
}

export class NetworkAuthority extends Authority {
  readonly online = true;
  private ws!: WebSocket;
  private reqId = 0;
  private pending = new Map<number, (r: ActionResult) => void>();
  private seq = 0;
  private lastSent = 0;
  playersAtJoin: NetPlayer[] = [];

  static connect(url: string, name: string): Promise<NetworkAuthority> {
    const a = new NetworkAuthority();
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      a.ws = ws;
      const timeout = setTimeout(() => { ws.close(); reject(new Error('서버 응답 없음')); }, 5000);
      ws.onopen = () => a.send({ t: 'join', name, look: 'player' });
      ws.onerror = () => { clearTimeout(timeout); reject(new Error('접속 실패')); };
      ws.onclose = () => a.emit({ type: 'disconnected' });
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as S2C;
        if (msg.t === 'welcome') {
          clearTimeout(timeout);
          a.me = msg.you; a.initial = msg.snapshot; a.time = { ...msg.snapshot.time }; a.gold = msg.snapshot.gold; a.playersAtJoin = msg.players;
          resolve(a);
        } else a.handle(msg);
      };
    });
  }

  private send(m: C2S) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }

  private handle(m: S2C) {
    switch (m.t) {
      case 'sim': this.emit({ type: 'sim', event: m.event }); break;
      case 'players': this.emit({ type: 'players', list: m.list.filter((p) => p.id !== this.me.id) }); break;
      case 'joined': if (m.player.id !== this.me.id) this.emit({ type: 'joined', player: m.player }); break;
      case 'left': this.emit({ type: 'left', id: m.id }); break;
      case 'anim': if (m.id !== this.me.id) this.emit({ type: 'anim', id: m.id, anim: m.anim, dir: m.dir }); break;
      case 'chat': this.emit({ type: 'chat', name: m.name, text: m.text }); break;
      case 'correct': this.emit({ type: 'correct', x: m.x, y: m.y }); break;
      case 'actionResult': this.pending.get(m.reqId)?.({ ok: m.ok, reason: m.reason, anim: m.anim }); this.pending.delete(m.reqId); break;
    }
  }

  request(action: ActionIntent): Promise<ActionResult> {
    const reqId = ++this.reqId;
    this.send({ t: 'action', action, reqId });
    return new Promise((res) => { this.pending.set(reqId, res); setTimeout(() => { if (this.pending.delete(reqId)) res({ ok: false, reason: 'timeout' }); }, 3000); });
  }
  sendMove(x: number, y: number, dir: Dir, anim: string) {
    const now = performance.now();
    if (now - this.lastSent < 1000 / 20) return; // 20Hz 제한
    this.lastSent = now;
    Object.assign(this.me, { x, y, dir, anim });
    this.send({ t: 'move', x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, dir, anim, seq: ++this.seq });
  }
  sendAnim(anim: string, dir: Dir) { this.send({ t: 'anim', anim, dir }); }
  chat(text: string) { this.send({ t: 'chat', text }); }
}
