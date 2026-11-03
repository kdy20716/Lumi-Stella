// 권한 서버 (Authoritative Server): npm run server
//  - 농장 상태/시간/날씨/인벤토리/골드/상점 구매는 서버의 FarmSimulation 이 최종 결정
//  - 클라이언트는 이동 위치와 행동 의도(ActionIntent)만 보냄 → 서버 검증 후 브로드캐스트
//  - 여러 맵(농장/마을): 플레이어마다 현재 맵을 추적, 이동 검증은 해당 맵 충돌로
//  - 모든 접속자 목록(맵 포함)을 주기적으로 브로드캐스트 → 클라이언트는 같은 맵이면 렌더, 목록 UI 에는 전원 표시
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { DEFAULT_PORT, SNAPSHOT_HZ, type C2S, type NetPlayer, type S2C } from '../shared/protocol';
import { FarmSimulation } from '../shared/sim/FarmSimulation';
import { MapInfo, type TiledMap } from '../shared/sim/MapInfo';
import type { MapId } from '../shared/types';

const loadMap = (id: MapId) => new MapInfo(JSON.parse(readFileSync(fileURLToPath(new URL(`../client/public/assets/maps/${id}.json`, import.meta.url)), 'utf8')) as TiledMap);
const MAPS: Record<MapId, MapInfo> = { farm: loadMap('farm'), town: loadMap('town') };
const sim = new FarmSimulation(MAPS.farm);
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const MAX_SPEED = 130; // px/s (달리기 108 + 여유)

interface Client { ws: WebSocket; id: string; lastMove: number; anim: string }
const clients = new Map<string, Client>();
let nextId = 1;

const send = (ws: WebSocket, m: S2C) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
const broadcast = (m: S2C, except?: string) => { const s = JSON.stringify(m); for (const c of clients.values()) if (c.id !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(s); };
const netPlayer = (id: string): NetPlayer => { const p = sim.players.get(id)!; return { id, name: p.name, look: p.look, map: p.map, x: p.x, y: p.y, dir: p.dir, anim: clients.get(id)?.anim ?? 'idle' }; };
const spawnPoint = (map: MapId, name: string) => { const s = MAPS[map].spawns.get(name) ?? MAPS[map].spawns.get('player')!; return { x: s.x, y: s.y + 5 }; };

// 시뮬레이션 이벤트 → 관련 클라이언트에 전달
sim.on((event) => {
  if (event.type === 'player') { const c = clients.get(event.id); if (c) send(c.ws, { t: 'sim', event }); return; }
  if (event.type === 'toast' && event.playerId) { const c = clients.get(event.playerId); if (c) send(c.ws, { t: 'sim', event }); return; }
  broadcast({ t: 'sim', event });
});

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws) => {
  let client: Client | null = null;
  ws.on('message', (raw) => {
    let m: C2S;
    try { m = JSON.parse(String(raw)) as C2S; } catch { return; }
    if (!client) {
      if (m.t !== 'join') return;
      const id = `p${nextId++}`;
      const name = String(m.name ?? '농부').slice(0, 10) || '농부';
      const sp = spawnPoint('farm', 'player');
      const offset = (clients.size % 4) * 14 - 21;
      const p = sim.addPlayer(id, name, 'player', sp.x + offset, sp.y, 'farm');
      client = { ws, id, lastMove: Date.now(), anim: 'idle' };
      clients.set(id, client);
      send(ws, { t: 'welcome', id, you: p, snapshot: sim.snapshot(), players: [...clients.keys()].filter((k) => k !== id).map(netPlayer) });
      broadcast({ t: 'joined', player: netPlayer(id) }, id);
      broadcast({ t: 'chat', from: 'server', name: '시스템', text: `${name}님이 농장에 왔어요.` }, id);
      console.log(`+ ${name} (${id}) 접속 — 현재 ${clients.size}명`);
      return;
    }
    const p = sim.players.get(client.id)!;
    switch (m.t) {
      case 'move': {
        const now = Date.now(), dt = Math.max(16, now - client.lastMove) / 1000;
        client.lastMove = now;
        const dist = Math.hypot(m.x - p.x, m.y - p.y);
        if (dist > MAX_SPEED * dt + 6 || !MAPS[p.map].canStand(m.x, m.y)) { send(ws, { t: 'correct', x: p.x, y: p.y }); break; } // 서버 보정
        p.x = m.x; p.y = m.y; p.dir = m.dir; client.anim = m.anim;
        break;
      }
      case 'map': {
        // 워프 검증: 현재 맵의 워프 영역 근처에 있어야 하고, 목적지가 그 워프의 대상과 일치해야 함
        const w = MAPS[p.map].warps.find((wp) => wp.to === m.map && Math.abs(p.x - (wp.x + wp.w / 2)) < 48 && Math.abs(p.y - (wp.y + wp.h / 2)) < 64);
        if (!w || !MAPS[m.map]) { send(ws, { t: 'correct', x: p.x, y: p.y }); break; }
        const sp = spawnPoint(m.map, w.spawn);
        sim.setPlayerMap(client.id, m.map, sp.x, sp.y);
        client.lastMove = Date.now();
        broadcast({ t: 'moved', id: client.id, map: m.map });
        break;
      }
      case 'action': {
        const r = sim.apply(client.id, m.action);
        send(ws, { t: 'actionResult', reqId: m.reqId, ok: r.ok, reason: r.reason, anim: r.anim });
        break;
      }
      case 'anim': broadcast({ t: 'anim', id: client.id, anim: m.anim, dir: m.dir }, client.id); break;
      case 'chat': {
        const text = String(m.text ?? '').trim().slice(0, 80);
        if (text) broadcast({ t: 'chat', from: client.id, name: p.name, text });
        break;
      }
    }
  });
  ws.on('close', () => {
    if (!client) return;
    const name = sim.players.get(client.id)?.name ?? client.id;
    clients.delete(client.id); sim.removePlayer(client.id);
    broadcast({ t: 'left', id: client.id });
    broadcast({ t: 'chat', from: 'server', name: '시스템', text: `${name}님이 떠났어요.` });
    console.log(`- ${name} 퇴장 — 현재 ${clients.size}명`);
  });
});

// 게임 루프: 시간 진행 + 전체 접속자 스냅샷 브로드캐스트
let last = Date.now();
setInterval(() => {
  const now = Date.now(); sim.tick(now - last); last = now;
  if (clients.size) broadcast({ t: 'players', list: [...clients.keys()].map(netPlayer), ts: now });
}, 1000 / SNAPSHOT_HZ);

console.log(`🌾 별빛 농장 서버 실행 중 — ws://localhost:${PORT}  (맵: ${Object.keys(MAPS).join(', ')})`);
