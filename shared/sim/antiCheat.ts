// 치트(비정상 재화 변조) 감지용 무결성 서명 및 시간 포맷 공용 유틸
export interface IntegrityPayload {
  gold: number;
  cash: number;
  jailed?: boolean;
  muteRemainingSec?: number;
}

const SALT = 'LumiStella::AntiCheat::2026::v1';

/** FNV-1a 기반 결정론적 무결성 해시 (오프라인 localStorage 재화/수감 변조 탐지) */
export function computeSaveSig(p: IntegrityPayload): string {
  const g = Math.max(0, Math.round(Number(p.gold) || 0));
  const c = Math.max(0, Math.round(Number(p.cash) || 0));
  const j = p.jailed ? 1 : 0;
  const m = Math.max(0, Math.round(Number(p.muteRemainingSec) || 0));
  const raw = `${SALT}|g:${g}|c:${c}|j:${j}|m:${m}|k:${g * 31 + c * 17 + j * 97}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (ch + i * 13) & 0xff;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(36)}-${h2.toString(36)}`;
}

/** 저장 데이터 재화/수감 변조 여부 검사 */
export function verifySaveIntegrity(save: {
  gold?: number;
  cash?: number;
  jailed?: boolean;
  muteRemainingSec?: number;
  saveSig?: string;
  isAdmin?: boolean;
}): { ok: boolean; reason?: string } {
  if (!save) return { ok: true };
  const gold = Number(save.gold ?? 0);
  const cash = Number(save.cash ?? 0);
  if (!Number.isFinite(gold) || !Number.isFinite(cash) || gold < 0 || cash < 0) {
    return { ok: false, reason: '비정상적인 재화 수치(NaN/음수) 변조' };
  }
  if (save.saveSig) {
    const expected = computeSaveSig({
      gold,
      cash,
      jailed: !!save.jailed,
      muteRemainingSec: save.muteRemainingSec ?? 0,
    });
    if (save.saveSig !== expected) {
      return { ok: false, reason: '저장 파일(localStorage) 재화·상태 무단 변조' };
    }
  }
  return { ok: true };
}

/** 남은 채팅 금지 시간(초)을 읽기 쉬운 한국어로 표시 */
export function formatMuteRemaining(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}시간 ${m}분 ${r}초`;
  if (m > 0) return `${m}분 ${String(r).padStart(2, '0')}초`;
  return `${r}초`;
}

/** 세상시간 기준 접속 금지 만료 시각 포맷 */
export function formatBanUntil(until?: number, now = Date.now()): string {
  if (!until || !Number.isFinite(until)) return '영구 정지';
  const remMs = Math.max(0, until - now);
  const d = Math.floor(remMs / 86_400_000);
  const h = Math.floor((remMs % 86_400_000) / 3_600_000);
  const m = Math.floor((remMs % 3_600_000) / 60_000);
  const dt = new Date(until);
  const dateStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  const rem = d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m}분` : `${Math.max(1, m)}분`;
  return `${dateStr}까지 (남은 ${rem})`;
}
