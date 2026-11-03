// 권한 서버 (Authoritative Server): npm run server
//  - 농장 상태/시간/날씨/인벤토리는 서버의 FarmSimulation 이 최종 결정
//  - 클라이언트는 이동 위치와 행동 의도(ActionIntent)만 보냄 → 서버 검증 후 브로드캐스트
//  - 이동은 속도 상한 검증 + 충돌 검증, 이상하면 'correct' 로 위치 보정
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { DEFAULT_PORT, SNAPSHOT_HZ, type C2S, type NetPlayer, type S2C } from '../shared/protocol';
import { FarmSimulation } from '../shared/sim/FarmSimulation';
import { MapInfo, type TiledMap } from '../shared/sim/MapInfo';

const mapPath = fileURLToPath(new URL('../client/public/assets/maps/farm.json', import.meta.url));
const info = new MapInfo(JSON.parse(readFileSync(mapPath, 'utf8')) as TiledMap);
const sim = new FarmSimulation(info);
const spawn = info.spawns.get('player') ?? { x: 368, y: 232 };
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const MAX_SPEED = 130; // px/s (달리기 108 + 여유)

interface Client { ws: WebSocket; id: string; lastMove: number; anim: string }
const clients = new Map<string, Client>();
let nextId = 1;

const send = (ws: WebSocket, m: S2C) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
const broadcast = (m: S2C, except?: string) => { const s = JSON.stringify(m); for (const c of clients.values()) if (c.id !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(s); };
const netPlayer = (id: string): NetPlayer => { const p = sim.players.get(id)!; return { id, name: p.name, look: p.look, x: p.x, y: p.y, dir: p.dir, anim: clients.get(id)?.anim ?? 'idle' }; };

// 시뮬레이션 이벤트 → 관련 클라이언트에 전달
sim.on((event) => {
  if (event.type === 'player') { const c = clients.get(event.id); if (c) send(c.ws, { t: 'sim', event }); return; }
  if (event.type === 'toast' && event.playerId) { const c = clients.get(event.playerId); if (c) send(c.ws, { t: 'sim', event }); return; }
  broadcast({ t: 'sim', event });
});

const canStand = (x: number, y: number) => {
  const T = info.tile, hw = 5, hh = 5;
  for (let cy = Math.floor((y - hh) / T); cy <= Math.floor((y - 0.01) / T); cy++)
    for (let cx = Math.floor((x - hw) / T); cx <= Math.floor((x + hw - 0.01) / T); cx++) if (info.isBlocked(cx, cy)) return false;
  return true;
};

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws) => {
  let client: Client | null = null;
  ws.on('message', (raw) => {
    let m: C2S;
    try { m = JSON.parse(String(raw)) as C2S; } catch { return; }
    if (!client) {
      if (m.t !== 'join') return;
      const id = `p${nextId++}`;
      const name = String(m.name ?? '농부').slice(0, 10);
      const offset = (clients.size % 4) * 14 - 21;
      const p = sim.addPlayer(id, name, 'player', spawn.x + offset, spawn.y + 5);
      client = { ws, id, lastMove: Date.now(), anim: 'idle' };
      clients.set(id, client);
      send(ws, { t: 'welcome', id, you: p, snapshot: sim.snapshot(), players: [...clients.keys()].filter((k) => k !== id).map(netPlayer) });
      broadcast({ t: 'joined', player: netPlayer(id) }, id);
      broadcast({ t: 'chat', from: 'server', name: '시스템', text: `${name}님이 접속했어요.` }, id);
      console.log(`+ ${name} (${id}) 접속 — 현재 ${clients.size}명`);
      return;
    }
    const p = sim.players.get(client.id)!;
    switch (m.t) {
      case 'move': {
        const now = Date.now(), dt = Math.max(16, now - client.lastMove) / 1000;
        client.lastMove = now;
        const dist = Math.hypot(m.x - p.x, m.y - p.y);
        if (dist > MAX_SPEED * dt + 6 || !canStand(m.x, m.y)) { send(ws, { t: 'correct', x: p.x, y: p.y }); break; } // 서버 보정
        p.x = m.x; p.y = m.y; p.dir = m.dir; client.anim = m.anim;
        break;
      }
      case 'action': {
        const r = sim.apply(client.id, m.action);
        send(ws, { t: 'actionResult', reqId: m.reqId, ok: r.ok, reason: r.reason, anim: r.anim });
        break;
      }
      case 'anim': broadcast({ t: 'anim', id: client.id, anim: m.anim, dir: m.dir }, client.id); break;
      case 'chat': broadcast({ t: 'chat', from: client.id, name: p.name, text: String(m.text).slice(0, 80) }); break;
    }
  });
  ws.on('close', () => {
    if (!client) return;
    clients.delete(client.id); sim.removePlayer(client.id);
    broadcast({ t: 'left', id: client.id });
    console.log(`- ${client.id} 퇴장 — 현재 ${clients.size}명`);
  });
});

// 게임 루프: 시간 진행 + 위치 스냅샷 브로드캐스트
let last = Date.now();
setInterval(() => {
  const now = Date.now(); sim.tick(now - last); last = now;
  if (clients.size) broadcast({ t: 'players', list: [...clients.keys()].map(netPlayer), ts: now });
}, 1000 / SNAPSHOT_HZ);

console.log(`🌾 별빛 농장 서버 실행 중 — ws://localhost:${PORT}`);
