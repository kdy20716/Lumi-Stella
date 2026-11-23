// 관리자 명령: 유저 보기 · 강퇴 · 밴 · 순간이동 · 아이템/골드 지급 · 버그 신고 확인
//  - handleAdmin 은 Client.admin === true (서버가 토큰으로 확인한 관리자) 일 때만 불림. 여기서도 한 번 더 확인
//  - 모든 입력값을 검사 (대상 uid · 아이템 id · 수량 범위), 실패하면 아무 것도 바꾸지 않음
import type { AdminCmd, AdminUser, S2C } from '../shared/protocol';
import type { FarmSimulation } from '../shared/sim/FarmSimulation';
import { formatBanUntil } from '../shared/sim/antiCheat';
import { formatKrw } from '../shared/bmShop';
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
        return {
          uid, name: p.name, look: p.look, map: p.map, mapName: REGION_MAPS[p.map]?.name ?? p.map,
          gold: p.gold, cash: p.cash ?? 0, badges: p.badges.length,
          party: p.party.map((c) => `${SPECIES[c.species]?.name ?? c.species} Lv${c.level}`).join(', '),
          online: true, world: p.world ? '친구들만' : '모두',
          jailed: !!p.jailed, muteRemainingSec: Math.ceil(p.muteRemainingSec ?? 0),
        };
      });
      const rawBans = await storage.bans();
      const now = Date.now();
      const bans = [];
      for (const [uid, b] of Object.entries(rawBans)) {
        if (b.until && now >= b.until) { await storage.unban(uid).catch(() => {}); continue; }
        bans.push({ uid, name: b.name, reason: b.reason, at: b.at, until: b.until });
      }
      return { ok: true, users, bans };
    }
    case 'reports': return { ok: true, reports: (await storage.reports()).sort((a, b) => b.at - a.at).slice(0, 100) };
    case 'resolve': { if (typeof cmd.id !== 'string') return { ok: false }; await storage.resolveReport(cmd.id); log(`신고 처리 ${cmd.id}`); return { ok: true }; }
    case 'kick': {
      if (!uidOk(cmd.uid) || cmd.uid === me.id || !hub.clients.has(cmd.uid)) return { ok: false, message: '대상이 없어요' };
      log(`강퇴 ${cmd.uid}`); onKick(cmd.uid, `관리자에 의해 강퇴되었어요.${cmd.reason ? ` (${String(cmd.reason).slice(0, 60)})` : ''}`);
      return { ok: true, message: '강퇴했어요' };
    }
    case 'ban': {
      if (!uidOk(cmd.uid) || cmd.uid === me.id) return { ok: false, message: '대상이 없어요' };
      const onlineP = sim.players.get(cmd.uid);
      const savedP = onlineP ? null : await storage.load(cmd.uid).catch(() => null);
      const name = onlineP?.name ?? savedP?.name ?? cmd.uid;
      const days = typeof cmd.days === 'number' && Number.isFinite(cmd.days) && cmd.days > 0 ? Math.min(3650, Math.round(cmd.days)) : 0;
      const until = days > 0 ? Date.now() + days * 86_400_000 : undefined;
      const reason = String(cmd.reason ?? (days > 0 ? `관리자 ${days}일 접속 금지` : '관리자 영구 정지')).slice(0, 80);
      await storage.ban(cmd.uid, name, reason, until);
      log(`접속금지 ${cmd.uid} (${days > 0 ? `${days}일` : '영구'}) ${reason}`);
      if (hub.clients.has(cmd.uid)) onKick(cmd.uid, `⛔ 접속이 금지되었습니다. (${formatBanUntil(until)}${reason ? ` · 사유: ${reason}` : ''})`);
      return { ok: true, message: `${name} 님에게 ${days > 0 ? `${days}일 접속 금지` : '영구 정지'}를 적용했어요` };
    }
    case 'unban': { if (!uidOk(cmd.uid)) return { ok: false }; await storage.unban(cmd.uid); log(`접속금지 해제 ${cmd.uid}`); return { ok: true, message: '접속 금지를 풀었어요' }; }
    case 'mute': {
      if (!uidOk(cmd.uid)) return { ok: false, message: '대상이 없어요' };
      const mins = Math.max(1, Math.min(10_080, Math.round(Number(cmd.minutes) || 10)));
      const reason = String(cmd.reason ?? '').slice(0, 80);
      const t = target(cmd.uid);
      if (t) {
        sim.mutePlayer(t, mins, reason);
        const d = sim.exportSave(cmd.uid);
        if (d) await storage.save(cmd.uid, d).catch(() => {});
        log(`채팅금지 ${cmd.uid} ${mins}분(접속시간)`);
        return { ok: true, message: `${t.name} 님에게 ${mins}분 채팅 금지를 적용했어요 (접속 중일 때만 차감)` };
      }
      const saved = await storage.load(cmd.uid).catch(() => null);
      if (!saved) return { ok: false, message: '해당 계정의 저장 데이터가 없어요' };
      saved.muteRemainingSec = mins * 60;
      (saved.notices ??= []).unshift({
        id: `ntc_${Date.now().toString(36)}`,
        kind: 'punish',
        title: '🔇 채팅 금지 처분 안내',
        body: `채팅 금지 시간: ${mins}분 (인게임 접속 중일 때만 시간이 차감됩니다)\n${reason ? `사유: ${reason}` : '사유: 관리자 제재'}`,
        at: Date.now(),
        read: false,
      });
      await storage.save(cmd.uid, saved).catch(() => {});
      log(`오프라인 채팅금지 ${cmd.uid} ${mins}분`);
      return { ok: true, message: `${saved.name} 님(오프라인)에게 ${mins}분 채팅 금지를 예약했어요` };
    }
    case 'unmute': {
      if (!uidOk(cmd.uid)) return { ok: false };
      const t = target(cmd.uid);
      if (t) {
        sim.unmutePlayer(t);
        const d = sim.exportSave(cmd.uid);
        if (d) await storage.save(cmd.uid, d).catch(() => {});
        log(`채팅금지 해제 ${cmd.uid}`);
        return { ok: true, message: `${t.name} 님의 채팅 금지를 해제했어요` };
      }
      const saved = await storage.load(cmd.uid).catch(() => null);
      if (saved) {
        saved.muteRemainingSec = 0;
        await storage.save(cmd.uid, saved).catch(() => {});
        return { ok: true, message: `${saved.name} 님의 채팅 금지를 해제했어요` };
      }
      return { ok: false, message: '대상이 없어요' };
    }
    case 'jail': {
      if (!uidOk(cmd.uid)) return { ok: false, message: '대상이 없어요' };
      const reason = String(cmd.reason ?? '관리자 제재 수감').slice(0, 80);
      const fine = cmd.fine !== false;
      const t = target(cmd.uid);
      if (t) {
        if (!sim.jailPlayer(t, reason, fine)) return { ok: false, message: '감옥 이동 실패' };
        const d = sim.exportSave(cmd.uid);
        if (d) await storage.save(cmd.uid, d).catch(() => {});
        log(`감옥 수감 ${cmd.uid} (${reason})`);
        return { ok: true, message: `${t.name} 님을 별빛 교도소로 보냈어요!` };
      }
      const saved = await storage.load(cmd.uid).catch(() => null);
      if (!saved) return { ok: false, message: '해당 계정의 저장 데이터가 없어요' };
      saved.jailed = true;
      saved.jailReason = reason;
      saved.jailFine = fine;
      saved.jailPrevGold = saved.gold;
      saved.jailPrevCash = saved.cash ?? 0;
      await storage.save(cmd.uid, saved).catch(() => {});
      log(`오프라인 감옥 수감 ${cmd.uid} (${reason})`);
      return { ok: true, message: `${saved.name} 님(오프라인)을 수감 처리했어요 (다음 접속 시 교도소 시작)` };
    }
    case 'unjail': {
      if (!uidOk(cmd.uid)) return { ok: false };
      const t = target(cmd.uid);
      if (t) {
        sim.unjailPlayer(t);
        const d = sim.exportSave(cmd.uid);
        if (d) await storage.save(cmd.uid, d).catch(() => {});
        log(`석방 ${cmd.uid}`);
        return { ok: true, message: `${t.name} 님을 석방했어요` };
      }
      const saved = await storage.load(cmd.uid).catch(() => null);
      if (saved) {
        saved.jailed = false;
        saved.jailReason = undefined;
        await storage.save(cmd.uid, saved).catch(() => {});
        log(`오프라인 석방 ${cmd.uid}`);
        return { ok: true, message: `${saved.name} 님을 석방했어요` };
      }
      return { ok: false, message: '대상이 없어요' };
    }
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
    case 'grantCash': {
      if (!uidOk(cmd.uid)) return { ok: false };
      const t = target(cmd.uid); if (!t) return { ok: false, message: '접속 중이 아니에요' };
      if (cmd.mode === 'ensureAll') {
        sim.ensureAdminCash(t, true);
      } else {
        const delta = Math.round(Number(cmd.amount));
        if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100_000_000) return { ok: false, message: '캐쉬 금액이 올바르지 않아요' };
        if (!sim.grantCash(t, delta)) return { ok: false };
      }
      const d = sim.exportSave(cmd.uid);
      if (d) await storage.save(cmd.uid, d).catch(() => {});
      log(`캐쉬 ${cmd.uid} ${cmd.mode === 'ensureAll' ? 'ensureAll' : cmd.amount}`);
      return { ok: true, message: `${t.name} 님 보유 캐쉬: ${formatKrw(t.cash ?? 0)}` };
    }
    case 'resetBm': {
      if (!uidOk(cmd.uid)) return { ok: false };
      const t = target(cmd.uid); if (!t) return { ok: false, message: '접속 중이 아니에요' };
      sim.resetBmState(t);
      const d = sim.exportSave(cmd.uid);
      if (d) await storage.save(cmd.uid, d).catch(() => {});
      log(`상점초기화 ${cmd.uid}`);
      return { ok: true, message: `${t.name} 님의 캐쉬 상점 구매 기록을 초기화했어요` };
    }
    case 'warp': {
      if (!uidOk(cmd.uid) || typeof cmd.map !== 'string' || !Object.prototype.hasOwnProperty.call(REGION_MAPS, cmd.map)) return { ok: false, message: '없는 장소' };
      const t = target(cmd.uid); if (!t) return { ok: false, message: '접속 중이 아니에요' };
      if (!sim.warpTo(t, cmd.map)) return { ok: false, message: '이동 실패' };
      log(`장소이동 ${cmd.uid} → ${cmd.map}`);
      return { ok: true, message: `${REGION_MAPS[cmd.map]?.name ?? cmd.map}(으)로 이동했어요` };
    }
    case 'setTime': {
      const m = Math.round(Number(cmd.minutes));
      if (!Number.isFinite(m) || m < 360 || m > 1550) return { ok: false, message: '올바른 시각이 아니에요' };
      sim.setTimeMinutes(m);
      log(`시각변경 → ${m}분`);
      return { ok: true, message: '게임 시각을 변경했어요' };
    }
    default: return { ok: false, message: '모르는 명령' };
  }
}
