// 권한 서버 (Authoritative Server): npm run server
//  - 구글 로그인(Firebase ID 토큰)으로 접속 → 진행상황을 Firestore(또는 로컬 파일)에 저장/불러오기
//  - 농장 상태·시간·인벤토리·골드·배틀은 서버의 FarmSimulation 이 최종 결정, 클라이언트는 Intent 만 보냄
//  - 방(room) 단위 가시성: 농장/집은 주인별 인스턴스(초대받은 친구만), 마을·도로·실내 가게는 모두 보임
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { DEFAULT_PORT, SNAPSHOT_HZ, type C2S, type NetPlayer, type RosterEntry, type S2C } from '../shared/protocol';
import { FarmSimulation, type SimEvent } from '../shared/sim/FarmSimulation';
import { MapInfo, type TiledMap } from '../shared/sim/MapInfo';
import { MAP_IDS, MAP_NAMES, roomKey, type MapId } from '../shared/types';
import { firebaseConfig } from '../shared/firebaseConfig';
import { verifyIdToken } from './auth';
import { createStorage } from './storage';

const loadMap = (id: MapId) => new MapInfo(JSON.parse(readFileSync(fileURLToPath(new URL(`../client/public/assets/maps/${id}.json`, import.meta.url)), 'utf8')) as TiledMap);
const MAPS = Object.fromEntries(MAP_IDS.map((id) => [id, loadMap(id)])) as Record<MapId, MapInfo>;
const sim = new FarmSimulation(MAPS);
const storage = await createStorage();
const world = await storage.loadWorld().catch(() => null);
if (world?.time) sim.setWorld(world.time);
const PORT = Number(process.env.PORT ?? DEFAULT_PORT);
const DEV_AUTH = process.env.DEV_AUTH === '1';   // 테스트용: 토큰 없이 { dev: '이름' } 으로 접속 허용
const MAX_SPEED = 130; // px/s (달리기 108 + 여유)

interface Client { ws: WebSocket; id: string; lastMove: number; anim: string }
const clients = new Map<string, Client>();

const send = (ws: WebSocket, m: S2C) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
const sendTo = (id: string, m: S2C) => { const c = clients.get(id); if (c) send(c.ws, m); };
const broadcast = (m: S2C, except?: string) => { const s = JSON.stringify(m); for (const c of clients.values()) if (c.id !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(s); };
const toRoom = (room: string, m: S2C, except?: string) => { for (const p of sim.playersIn(room)) if (p.id !== except) sendTo(p.id, m); };
const netPlayer = (id: string): NetPlayer => { const p = sim.players.get(id)!; return { id, name: p.name, look: p.look, map: p.map, inst: p.inst, world: p.world, x: p.x, y: p.y, dir: p.dir, anim: clients.get(id)?.anim ?? 'idle', partner: p.party[0]?.species, battling: sim.inBattle(id) }; };
const roster = (): RosterEntry[] => [...clients.keys()].map((id) => { const p = sim.players.get(id)!; return { id, name: p.name, look: p.look, map: p.map, inst: p.inst }; });
let rosterDirty = false;

// 시뮬레이션 이벤트 → 관련 있는 클라이언트에게만
sim.on((event: SimEvent) => {
  const m: S2C = { t: 'sim', event };
  switch (event.type) {
    case 'player': case 'party': return sendTo(event.id, m);
    case 'help': case 'gold': return sendTo(event.playerId, m);
    case 'room': rosterDirty = true; return sendTo(event.playerId, m);
    case 'invite': return sendTo(event.to, m);
    case 'toast': if (event.playerId) return sendTo(event.playerId, m); if (event.room) return toRoom(event.room, m); return broadcast(m);
    case 'emote': case 'dish': return toRoom(event.room, m);
    case 'tile': case 'placed': case 'unplaced': return toRoom(roomKey('farm', event.owner), m);
    case 'objectRemoved': if (event.owner) { toRoom(roomKey('farm', event.owner), m); return toRoom(roomKey('home', event.owner), m); } return broadcast(m);
    case 'look': rosterDirty = true; return broadcast(m);
    case 'newDay': broadcast(m); void saveAll('새 날'); return;
    default: return broadcast(m);
  }
});

async function savePlayer(id: string) {
  const data = sim.exportSave(id);
  if (data && data.look) await storage.save(id, data).catch((e) => console.warn('저장 실패', id, (e as Error).message));
}
async function saveAll(why: string) {
  await Promise.all([...clients.keys()].map(savePlayer));
  await storage.saveWorld({ time: sim.time }).catch(() => {});
  if (clients.size) console.log(`💾 ${clients.size}명 저장 (${why})`);
}

const wss = new WebSocketServer({ port: PORT });
wss.on('connection', (ws) => {
  let client: Client | null = null;
  let joining = false;
  ws.on('message', async (raw) => {
    let m: C2S;
    try { m = JSON.parse(String(raw)) as C2S; } catch { return; }
    if (!client) {
      if (m.t !== 'join' || joining) return;
      joining = true;
      let uid: string, gName: string;
      try {
        if (m.token) { const u = await verifyIdToken(m.token, firebaseConfig.projectId); uid = u.uid; gName = u.name; }
        else if (DEV_AUTH && m.dev) { uid = `dev-${String(m.dev).replace(/[^a-zA-Z0-9가-힣]/g, '').slice(0, 12)}`; gName = String(m.dev).slice(0, 10); }
        else throw new Error('구글 로그인이 필요해요');
      } catch (e) { send(ws, { t: 'error', message: (e as Error).message }); ws.close(); return; }
      // 같은 계정이 다른 창에서 접속 중이면 이전 연결을 저장 후 종료
      const old = clients.get(uid);
      if (old) { send(old.ws, { t: 'error', message: '다른 곳에서 같은 계정으로 접속했어요.' }); old.ws.close(); await new Promise((r) => setTimeout(r, 150)); }
      const save = await storage.load(uid).catch(() => null);
      if (ws.readyState !== WebSocket.OPEN) return;
      const world = m.mode === 'friends' ? uid : '';
      const p = sim.addPlayer(uid, save?.name || gName, save?.look ?? '', save, world);
      client = { ws, id: uid, lastMove: Date.now(), anim: 'idle' };
      clients.set(uid, client);
      send(ws, { t: 'welcome', id: uid, you: p, snapshot: sim.snapshot(uid), roster: roster(), storage: storage.kind });
      rosterDirty = true;
      if (!world) broadcast({ t: 'chat', from: 'server', name: '시스템', text: `${p.name}님이 접속했어요.` }, uid);
      console.log(`+ ${p.name} (${uid.slice(0, 8)}…) ${save ? '불러옴' : '새 캐릭터'} · ${world ? '친구들만' : '모두와 함께'} — 현재 ${clients.size}명`);
      return;
    }
    const p = sim.players.get(client.id);
    if (!p) return;
    switch (m.t) {
      case 'move': {
        const now = Date.now(), dt = Math.max(16, now - client.lastMove) / 1000;
        client.lastMove = now;
        const dist = Math.hypot(m.x - p.x, m.y - p.y);
        if (dist > MAX_SPEED * dt + 6 || !sim.canStand(p, m.x, m.y)) { send(ws, { t: 'correct', x: p.x, y: p.y }); break; } // 서버 보정
        if (dist > 2) p.sleeping = false;
        p.x = m.x; p.y = m.y; p.dir = m.dir; client.anim = m.anim;
        break;
      }
      case 'action': {
        const r = sim.apply(client.id, m.action);
        send(ws, { t: 'actionResult', reqId: m.reqId, ...r });
        // 저장 초기화는 바로 저장소에도 반영 (캐릭터가 없는 상태라 일반 자동 저장은 건너뜀)
        if (m.action.kind === 'resetSave' && r.ok) { const d = sim.exportSave(client.id); if (d) await storage.save(client.id, d).catch(() => {}); }
        break;
      }
      case 'anim': toRoom(sim.room(p), { t: 'anim', id: client.id, anim: m.anim, dir: m.dir }, client.id); break;
      case 'chat': {
        const text = String(m.text ?? '').trim().slice(0, 80);
        // 채팅은 같은 세계 사람들에게만 (친구들만 모드는 그 세계 안에서만)
        if (text) for (const o of sim.players.values()) if (o.world === p.world || o.id === p.id) sendTo(o.id, { t: 'chat', from: client.id, name: p.name, text });
        break;
      }
    }
  });
  ws.on('close', () => {
    if (!client || clients.get(client.id)?.ws !== ws) return;
    const id = client.id;
    const name = sim.players.get(id)?.name ?? id;
    clients.delete(id);
    const save = sim.removePlayer(id);
    if (save?.look) void storage.save(id, save).catch((e) => console.warn('저장 실패', (e as Error).message));
    broadcast({ t: 'left', id });
    rosterDirty = true;
    broadcast({ t: 'chat', from: 'server', name: '시스템', text: `${name}님이 떠났어요.` });
    console.log(`- ${name} 퇴장 (저장됨) — 현재 ${clients.size}명`);
  });
});

// 게임 루프: 시간 진행 + 같은 방 사람들 위치 + 접속자 목록
let last = Date.now();
let rosterT = 0;
setInterval(() => {
  const now = Date.now(); sim.tick(now - last); last = now;
  for (const c of clients.values()) {
    const me = sim.players.get(c.id); if (!me) continue;
    const room = sim.room(me);
    send(c.ws, { t: 'players', list: sim.playersIn(room).filter((o) => o.id !== c.id && clients.has(o.id)).map((o) => netPlayer(o.id)), ts: now });
  }
  rosterT += 1000 / SNAPSHOT_HZ;
  if (rosterDirty || rosterT > 2000) { rosterDirty = false; rosterT = 0; broadcast({ t: 'roster', list: roster() }); }
}, 1000 / SNAPSHOT_HZ);
setInterval(() => void saveAll('자동 저장'), 60_000);

const shutdown = async () => { console.log('\n서버 종료 — 저장 중...'); await saveAll('종료'); process.exit(0); };
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

console.log(`✨ 루미 몬스터즈: 별빛의 씨앗 서버 실행 중 — ws://localhost:${PORT}`);
console.log(`   저장소: ${storage.kind}${DEV_AUTH ? '  (DEV_AUTH: 토큰 없이 접속 허용)' : ''}`);
console.log(`   맵: ${MAP_IDS.length}개 (${MAP_NAMES.town} 외)`);
