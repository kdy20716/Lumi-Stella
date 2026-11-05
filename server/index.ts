// 권한 서버 (Authoritative Server): npm run server
//  - 구글 로그인(Firebase ID 토큰)으로 접속 → 진행상황을 Firestore(또는 로컬 파일)에 저장/불러오기
//  - 농장 상태·시간·인벤토리·골드·배틀은 서버의 FarmSimulation 이 최종 결정, 클라이언트는 Intent 만 보냄
//  - 방(room) 단위 가시성: 농장/집은 주인별 인스턴스(초대받은 친구만), 마을·도로·실내 가게는 모두 보임
//
// 파일 구성
//   config.ts   포트 · 관리자 계정 · 제한값
//   auth.ts     Firebase ID 토큰 검증 (서명 · 만료 · 이메일 인증)
//   storage.ts  저장소 (Firestore / 로컬 파일) + 밴 · 버그 신고
//   hub.ts      접속자 · 보내기 · 접속자 목록 · 시뮬레이션 이벤트 전달
//   admin.ts    관리자 명령 (관리자 계정만)
//   index.ts    (이 파일) HTTP + Socket.io 연결 → 메시지 처리 → 게임 루프 · 자동 저장
//
// 통신: Socket.io. 패킷 이름 = 메시지의 t (예: 클라 emit('move', {t:'move',...}) · 서버 emit('players', {t:'players',...}))
//   웹소켓이 막힌 환경(일부 프록시 · Azure 설정)에서는 자동으로 HTTP 롱폴링으로 대체
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { SNAPSHOT_HZ, type C2S, type BugReport } from '../shared/protocol';
import { FarmSimulation } from '../shared/sim/FarmSimulation';
import { MapInfo, type TiledMap } from '../shared/sim/MapInfo';
import { MAP_IDS, MAP_NAMES, type MapId } from '../shared/types';
import { firebaseConfig } from '../shared/firebaseConfig';
import { verifyIdToken } from './auth';
import { createStorage } from './storage';
import { CLIENT_ORIGINS, DEV_AUTH, MAX_SPEED, PORT, REPORT_COOLDOWN_MS, REPORT_MAX_LEN, isAdminEmail } from './config';
import { Hub, type Client, type Conn } from './hub';
import { handleAdmin } from './admin';

// ── 준비: 맵 · 시뮬레이션 · 저장소 ────────────────────
const loadMap = (id: MapId) => new MapInfo(JSON.parse(readFileSync(fileURLToPath(new URL(`../client/public/assets/maps/${id}.json`, import.meta.url)), 'utf8')) as TiledMap);
const MAPS = Object.fromEntries(MAP_IDS.map((id) => [id, loadMap(id)])) as Record<MapId, MapInfo>;
const sim = new FarmSimulation(MAPS, { multiplayer: true });   // 멀티: 숙소에서 자도 서버 시계는 그대로
const storage = await createStorage();
const world = await storage.loadWorld().catch(() => null);
if (world?.time) sim.setWorld(world.time);
const hub = new Hub(sim, () => void saveAll('새 날'));

// ── 저장 ─────────────────────────────────────────────
async function savePlayer(id: string) {
  const data = sim.exportSave(id);
  if (data && data.look) await storage.save(id, data).catch((e) => console.warn('저장 실패', id, (e as Error).message));
}
async function saveAll(why: string) {
  await Promise.all([...hub.clients.keys()].map(savePlayer));
  await storage.saveWorld({ time: sim.time }).catch(() => {});
  if (hub.clients.size) console.log(`💾 ${hub.clients.size}명 저장 (${why})`);
}
/** 강퇴: 알림을 보내고 연결을 끊음 (닫힐 때 저장됨) */
function kick(uid: string, message: string) { const c = hub.clients.get(uid); if (!c) return; hub.send(c.conn, { t: 'error', message }); setTimeout(() => c.conn.close(), 100); }

// ── 접속 ─────────────────────────────────────────────
async function join(ws: Conn, m: Extract<C2S, { t: 'join' }>): Promise<Client | null> {
  let uid: string, gName: string, admin = false;
  try {
    if (m.token) {
      const u = await verifyIdToken(m.token, firebaseConfig.projectId);
      uid = u.uid; gName = u.name; admin = isAdminEmail(u.email, u.emailVerified);
    } else if (DEV_AUTH && m.dev) { uid = `dev-${String(m.dev).replace(/[^a-zA-Z0-9가-힣]/g, '').slice(0, 12)}`; gName = String(m.dev).slice(0, 10); }
    else throw new Error('구글 로그인이 필요해요');
  } catch (e) { hub.send(ws, { t: 'error', message: (e as Error).message }); ws.close(); return null; }
  const banned = (await storage.bans().catch(() => ({})) as Record<string, { reason: string }>)[uid];
  if (banned) { hub.send(ws, { t: 'error', message: `이 계정은 이용이 정지되었어요.${banned.reason ? ` (${banned.reason})` : ''}` }); ws.close(); return null; }
  // 같은 계정이 다른 창에서 접속 중이면 이전 연결을 저장 후 종료
  const old = hub.clients.get(uid);
  if (old) { hub.send(old.conn, { t: 'error', message: '다른 곳에서 같은 계정으로 접속했어요.' }); old.conn.close(); await new Promise((r) => setTimeout(r, 150)); }
  const save = await storage.load(uid).catch(() => null);
  if (!ws.open) return null;
  const worldId = m.mode === 'friends' ? uid : '';
  const p = sim.addPlayer(uid, save?.name || gName, save?.look ?? '', save, worldId);
  const client: Client = { conn: ws, id: uid, lastMove: Date.now(), anim: 'idle', admin, lastReport: 0 };
  hub.clients.set(uid, client);
  hub.send(ws, { t: 'welcome', id: uid, you: p, snapshot: sim.snapshot(uid), roster: hub.roster(), storage: storage.kind, admin });
  hub.rosterDirty = true;
  if (!worldId) hub.broadcast({ t: 'chat', from: 'server', name: '시스템', text: `${admin ? '[admin] ' : ''}${p.name}님이 접속했어요.` }, uid);
  console.log(`+ ${p.name} (${uid.slice(0, 8)}…)${admin ? ' 🛡관리자' : ''} ${save ? '불러옴' : '새 캐릭터'} · ${worldId ? '친구들만' : '모두와 함께'} — 현재 ${hub.clients.size}명`);
  return client;
}

// ── 메시지 처리 ──────────────────────────────────────
async function onMessage(client: Client, m: C2S) {
  const p = sim.players.get(client.id);
  if (!p) return;
  const ws = client.conn;
  switch (m.t) {
    case 'move': {
      const now = Date.now(), dt = Math.max(16, now - client.lastMove) / 1000;
      client.lastMove = now;
      const dist = Math.hypot(m.x - p.x, m.y - p.y);
      if (dist > MAX_SPEED * dt + 6 || !sim.canStand(p, m.x, m.y)) { hub.send(ws, { t: 'correct', x: p.x, y: p.y }); break; } // 서버 보정
      if (dist > 2) p.sleeping = false;
      p.x = m.x; p.y = m.y; p.dir = m.dir; client.anim = String(m.anim).slice(0, 16);
      break;
    }
    case 'action': {
      const r = sim.apply(client.id, m.action);
      hub.send(ws, { t: 'actionResult', reqId: m.reqId, ...r });
      // 저장 초기화는 바로 저장소에도 반영 (캐릭터가 없는 상태라 일반 자동 저장은 건너뜀)
      if (m.action.kind === 'resetSave' && r.ok) { const d = sim.exportSave(client.id); if (d) await storage.save(client.id, d).catch(() => {}); }
      break;
    }
    case 'anim': hub.toRoom(sim.room(p), { t: 'anim', id: client.id, anim: String(m.anim).slice(0, 16), dir: m.dir }, client.id); break;
    case 'chat': {
      const text = String(m.text ?? '').trim().slice(0, 80);
      // 채팅은 같은 세계 사람들에게만 (친구들만 모드는 그 세계 안에서만)
      if (text) for (const o of sim.players.values()) if (o.world === p.world || o.id === p.id) hub.sendTo(o.id, { t: 'chat', from: client.id, name: client.admin ? `[admin] ${p.name}` : p.name, text });
      break;
    }
    case 'report': {
      const now = Date.now();
      const text = String(m.text ?? '').trim().slice(0, REPORT_MAX_LEN);
      if (!text || now - client.lastReport < REPORT_COOLDOWN_MS) break;
      client.lastReport = now;
      const report: BugReport = { id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, uid: client.id, name: p.name, text, where: `${MAP_NAMES[p.map] ?? p.map} (${Math.round(p.x / 16)},${Math.round(p.y / 16)}) · ${String(m.where ?? '').slice(0, 80)}`, at: now };
      await storage.addReport(report).catch(() => {});
      hub.send(ws, { t: 'reported' });
      hub.toAdmins({ t: 'adminReport', report });
      console.log(`🐞 버그 신고: ${p.name} — ${text.slice(0, 60)}`);
      break;
    }
    case 'admin': {
      // 관리자 확인은 접속할 때 서버가 토큰으로 정한 client.admin 만 믿음 (메시지 안의 어떤 값도 믿지 않음)
      if (!client.admin) { hub.send(ws, { t: 'adminResult', reqId: Number(m.reqId) || 0, ok: false, message: '권한 없음' }); console.warn(`⚠ 관리자 명령 시도 거부: ${p.name} (${client.id})`); break; }
      const r = await handleAdmin(client, m.cmd, sim, hub, storage, kick).catch((e) => ({ ok: false, message: (e as Error).message }));
      hub.send(ws, { t: 'adminResult', reqId: Number(m.reqId) || 0, ...r });
      break;
    }
  }
}

// ── HTTP 서버 (상태 확인용) + Socket.io ─────────────
const http = createServer((req, res) => {
  // Azure App Service 상태 확인 · 브라우저로 열어 봤을 때
  if (req.url === '/' || req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(`lumi-monsters server ok · ${hub.clients.size} online`); return; }
  res.writeHead(404); res.end();
});
const io = new IOServer(http, {
  cors: { origin: CLIENT_ORIGINS.length ? CLIENT_ORIGINS : true, methods: ['GET', 'POST'], credentials: true },
  transports: ['websocket', 'polling'],
  maxHttpBufferSize: 64 * 1024,
  pingInterval: 20_000, pingTimeout: 25_000,
});
const C2S_TYPES = new Set(['join', 'move', 'action', 'anim', 'chat', 'report', 'admin']);

io.on('connection', (socket: Socket) => {
  const conn: Conn = {
    get open() { return socket.connected; },
    send: (m) => { socket.emit(m.t, m); },
    close: () => { socket.disconnect(true); },
  };
  let client: Client | null = null;
  let joining = false;
  // 모든 패킷: 이벤트 이름과 내용의 t 가 같아야 함 (모르는 이벤트 · 잘못된 형식은 무시)
  socket.onAny(async (ev: string, m: C2S) => {
    if (!C2S_TYPES.has(ev) || !m || typeof m !== 'object' || m.t !== ev) return;
    try {
      if (!client) {
        if (m.t !== 'join' || joining) return;
        joining = true;
        client = await join(conn, m);
        if (!client) joining = false;
        return;
      }
      await onMessage(client, m);
    } catch (e) { console.warn('메시지 처리 오류', ev, (e as Error).message); }
  });
  socket.on('disconnect', () => {
    if (!client || hub.clients.get(client.id)?.conn !== conn) return;
    const id = client.id;
    const name = sim.players.get(id)?.name ?? id;
    hub.clients.delete(id);
    const save = sim.removePlayer(id);
    if (save?.look) void storage.save(id, save).catch((e) => console.warn('저장 실패', (e as Error).message));
    hub.broadcast({ t: 'left', id });
    hub.rosterDirty = true;
    hub.broadcast({ t: 'chat', from: 'server', name: '시스템', text: `${name}님이 떠났어요.` });
    console.log(`- ${name} 퇴장 (저장됨) — 현재 ${hub.clients.size}명`);
  });
});
http.listen(PORT);

// ── 게임 루프: 시간 진행 + 같은 방 사람들 위치 + 접속자 목록 ──
let last = Date.now();
setInterval(() => { const now = Date.now(); sim.tick(now - last); last = now; hub.snapshot(SNAPSHOT_HZ); }, 1000 / SNAPSHOT_HZ);
setInterval(() => void saveAll('자동 저장'), 60_000);

const shutdown = async () => { console.log('\n서버 종료 — 저장 중...'); await saveAll('종료'); process.exit(0); };
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

console.log(`✨ 루미 몬스터즈: 별빛의 씨앗 서버 실행 중 — http://localhost:${PORT} (Socket.io)`);
console.log(`   허용 출처(CORS): ${CLIENT_ORIGINS.length ? CLIENT_ORIGINS.join(', ') : '모두 (CLIENT_ORIGIN 미설정)'}`);
console.log(`   저장소: ${storage.kind}${DEV_AUTH ? '  (DEV_AUTH: 토큰 없이 접속 허용 · 관리자 불가)' : ''}`);
console.log(`   맵: ${MAP_IDS.length}개 (${MAP_NAMES.town} 외)`);
