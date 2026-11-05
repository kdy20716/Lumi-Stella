// 접속자 관리: 연결 목록 · 보내기(한 명/방/전체) · 접속자 목록 · 시뮬레이션 이벤트를 관련 있는 사람에게만 전달
import { WebSocket } from 'ws';
import type { NetPlayer, RosterEntry, S2C } from '../shared/protocol';
import type { FarmSimulation, SimEvent } from '../shared/sim/FarmSimulation';
import { roomKey } from '../shared/types';

export interface Client { ws: WebSocket; id: string; lastMove: number; anim: string; admin: boolean; lastReport: number }

export class Hub {
  readonly clients = new Map<string, Client>();
  rosterDirty = false;
  constructor(private sim: FarmSimulation, private onNewDay: () => void) {
    sim.on((e) => this.route(e));
  }

  send(ws: WebSocket, m: S2C) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); }
  sendTo(id: string, m: S2C) { const c = this.clients.get(id); if (c) this.send(c.ws, m); }
  broadcast(m: S2C, except?: string) { const s = JSON.stringify(m); for (const c of this.clients.values()) if (c.id !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(s); }
  toRoom(room: string, m: S2C, except?: string) { for (const p of this.sim.playersIn(room)) if (p.id !== except) this.sendTo(p.id, m); }
  toAdmins(m: S2C) { for (const c of this.clients.values()) if (c.admin) this.send(c.ws, m); }

  /** 칭호는 서버만 정함 (관리자 계정 → 'admin') */
  title(id: string) { return this.clients.get(id)?.admin ? 'admin' : undefined; }
  netPlayer(id: string): NetPlayer {
    const p = this.sim.players.get(id)!;
    return { id, name: p.name, look: p.look, map: p.map, inst: p.inst, world: p.world, x: p.x, y: p.y, dir: p.dir, anim: this.clients.get(id)?.anim ?? 'idle', partner: p.party[0]?.species, battling: this.sim.inBattle(id), title: this.title(id) };
  }
  roster(): RosterEntry[] { return [...this.clients.keys()].map((id) => { const p = this.sim.players.get(id)!; return { id, name: p.name, look: p.look, map: p.map, inst: p.inst, title: this.title(id) }; }); }

  private route(event: SimEvent) {
    const m: S2C = { t: 'sim', event };
    switch (event.type) {
      case 'player': case 'party': return this.sendTo(event.id, m);
      case 'help': case 'gold': return this.sendTo(event.playerId, m);
      case 'room': this.rosterDirty = true; return this.sendTo(event.playerId, m);
      case 'invite': return this.sendTo(event.to, m);
      case 'toast': if (event.playerId) return this.sendTo(event.playerId, m); if (event.room) return this.toRoom(event.room, m); return this.broadcast(m);
      case 'emote': case 'dish': return this.toRoom(event.room, m);
      case 'tile': case 'placed': case 'unplaced': return this.toRoom(roomKey('farm', event.owner), m);
      case 'objectRemoved': if (event.owner) { this.toRoom(roomKey('farm', event.owner), m); return this.toRoom(roomKey('home', event.owner), m); } return this.broadcast(m);
      case 'look': this.rosterDirty = true; return this.broadcast(m);
      case 'newDay': this.broadcast(m); this.onNewDay(); return;
      default: return this.broadcast(m);
    }
  }

  /** 같은 방 사람들 위치 + (가끔) 접속자 목록 */
  private rosterT = 0;
  snapshot(hz: number) {
    const now = Date.now();
    for (const c of this.clients.values()) {
      const me = this.sim.players.get(c.id); if (!me) continue;
      const room = this.sim.room(me);
      this.send(c.ws, { t: 'players', list: this.sim.playersIn(room).filter((o) => o.id !== c.id && this.clients.has(o.id)).map((o) => this.netPlayer(o.id)), ts: now });
    }
    this.rosterT += 1000 / hz;
    if (this.rosterDirty || this.rosterT > 2000) { this.rosterDirty = false; this.rosterT = 0; this.broadcast({ t: 'roster', list: this.roster() }); }
  }
}
