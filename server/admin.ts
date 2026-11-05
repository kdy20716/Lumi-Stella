// 관리자 명령: 유저 보기 · 강퇴 · 밴 · 순간이동 · 아이템/골드 지급 · 버그 신고 확인
//  - handleAdmin 은 Client.admin === true (서버가 토큰으로 확인한 관리자) 일 때만 불림. 여기서도 한 번 더 확인
//  - 모든 입력값을 검사 (대상 uid · 아이템 id · 수량 범위), 실패하면 아무 것도 바꾸지 않음
import type { AdminCmd, AdminUser, S2C } from '../shared/protocol';
import type { FarmSimulation } from '../shared/sim/FarmSimulation';
import { ITEMS, REGION_MAPS, SPECIES } from '../shared/data';
import type { Hub, Client } from './hub';
import type { Storage } from './storage';

type Result = Omit<Extract<S2C, { t: 'adminResult' }>, 't' | 'reqId'>;

export async function handleAdmin(me: Client, cmd: AdminCmd, sim: FarmSimulation, hub: Hub, storage: Storage, onKick: (uid: string, msg: string) => void): Promise<Result> {
  if (!me.admin) return { ok: false, message: '권한 없음' };
  if (!cmd || typeof cmd !== 'object' || typeof (cmd as { op?: unknown }).op !== 'string') return { ok: false, message: '잘못된 명령' };
  const uidOk = (u: unknown): u is string => typeof u === 'string' && u.length > 0 && u.length < 128;
  const target = (u: string) => sim.players.get(u);
  const log = (msg: string) => { console.log(`🛡 [admin ${sim.players.get(me.id)?.name ?? me.id}] ${msg}`); void storage.audit?.(`${me.id} ${msg}`).catch(() => {}); };
  switch (cmd.op) {
    case 'users': {
      const users: AdminUser[] = [...hub.clients.keys()].map((uid) => {
        const p = sim.players.get(uid)!;
        return { uid, name: p.name, look: p.look, map: p.map, mapName: REGION_MAPS[p.map]?.name ?? p.map, gold: p.gold, badges: p.badges.length, party: p.party.map((c) => `${SPECIES[c.species]?.name ?? c.species} Lv${c.level}`).join(', '), online: true, world: p.world ? '친구들만' : '모두' };
      });
      const bans = await storage.bans();
      return { ok: true, users, bans: Object.entries(bans).map(([uid, b]) => ({ uid, name: b.name, reason: b.reason })) };
    }
    case 'reports': return { ok: true, reports: (await storage.reports()).sort((a, b) => b.at - a.at).slice(0, 100) };
    case 'resolve': { if (typeof cmd.id !== 'string') return { ok: false }; await storage.resolveReport(cmd.id); log(`버그 신고 처리 ${cmd.id}`); return { ok: true }; }
    case 'kick': {
      if (!uidOk(cmd.uid) || cmd.uid === me.id || !hub.clients.has(cmd.uid)) return { ok: false, message: '대상이 없어요' };
      log(`강퇴 ${cmd.uid}`); onKick(cmd.uid, `관리자에 의해 강퇴되었어요.${cmd.reason ? ` (${String(cmd.reason).slice(0, 60)})` : ''}`);
      return { ok: true, message: '강퇴했어요' };
    }
    case 'ban': {
      if (!uidOk(cmd.uid) || cmd.uid === me.id) return { ok: false, message: '대상이 없어요' };
      const name = sim.players.get(cmd.uid)?.name ?? cmd.uid;
      await storage.ban(cmd.uid, name, String(cmd.reason ?? '').slice(0, 80));
      log(`밴 ${cmd.uid}`);
      if (hub.clients.has(cmd.uid)) onKick(cmd.uid, '이 계정은 이용이 정지되었어요.');
      return { ok: true, message: `${name} 님을 정지했어요` };
    }
    case 'unban': { if (!uidOk(cmd.uid)) return { ok: false }; await storage.unban(cmd.uid); log(`밴 해제 ${cmd.uid}`); return { ok: true, message: '정지를 풀었어요' }; }
    case 'goto': case 'bring': {
      if (!uidOk(cmd.uid)) return { ok: false };
      const t = target(cmd.uid), a = sim.players.get(me.id);
      if (!t || !a || !hub.clients.has(cmd.uid)) return { ok: false, message: '접속 중이 아니에요' };
      const [from, to] = cmd.op === 'goto' ? [t, a] : [a, t];
      sim.teleport(to, from.map, from.inst, from.world, from.x + 16, from.y);
      log(`${cmd.op === 'goto' ? '이동 →' : '데려오기 ←'} ${cmd.uid}`);
      return { ok: true, message: cmd.op === 'goto' ? `${t.name} 님 옆으로 이동했어요` : `${t.name} 님을 데려왔어요` };
    }
    case 'give': {
      if (!uidOk(cmd.uid) || typeof cmd.itemId !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, cmd.itemId)) return { ok: false, message: '없는 아이템' };
      const t = target(cmd.uid); if (!t) return { ok: false, message: '접속 중이 아니에요' };
      if (!sim.grant(t, cmd.itemId, Number(cmd.qty))) return { ok: false, message: '가방이 가득 찼어요' };
      log(`지급 ${cmd.uid} ${cmd.itemId}×${cmd.qty}`);
      return { ok: true, message: `${ITEMS[cmd.itemId].name}을(를) 줬어요` };
    }
    case 'gold': {
      if (!uidOk(cmd.uid)) return { ok: false };
      const t = target(cmd.uid); if (!t) return { ok: false, message: '접속 중이 아니에요' };
      if (!sim.grantGold(t, Number(cmd.amount))) return { ok: false };
      log(`골드 ${cmd.uid} ${cmd.amount}`);
      return { ok: true, message: '골드를 바꿨어요' };
    }
    default: return { ok: false, message: '모르는 명령' };
  }
}
