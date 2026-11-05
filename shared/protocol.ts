// 네트워크 패킷 규격 (WebSocket JSON). C2S = 클라이언트→서버, S2C = 서버→클라이언트
import type { ActionIntent, ActionResult, Dir, FarmSnapshot, MapId, PlayerState } from './types';
import type { SimEvent } from './sim/FarmSimulation';

export const DEFAULT_PORT = 2567;
export const SNAPSHOT_HZ = 15;

/** 같은 방(room)에 있는 다른 플레이어의 위치 (보간용) */
export interface NetPlayer { id: string; name: string; look: string; map: MapId; inst: string; world: string; x: number; y: number; dir: Dir; anim: string; partner?: string; battling?: boolean; title?: string }
/** 접속자 목록 (어디 있는지). title: 서버가 정한 칭호 (예: 'admin') — 클라이언트가 보낼 수 없음 */
export interface RosterEntry { id: string; name: string; look: string; map: MapId; inst: string; title?: string }

/** 관리자 명령 (서버가 계정을 확인한 관리자만 처리) */
export type AdminCmd =
  | { op: 'users' }
  | { op: 'reports' }
  | { op: 'resolve'; id: string }
  | { op: 'kick'; uid: string; reason?: string }
  | { op: 'ban'; uid: string; reason?: string }
  | { op: 'unban'; uid: string }
  | { op: 'goto'; uid: string }                       // 내가 그 사람 옆으로
  | { op: 'bring'; uid: string }                      // 그 사람을 내 옆으로
  | { op: 'give'; uid: string; itemId: string; qty: number }
  | { op: 'gold'; uid: string; amount: number };
export interface AdminUser { uid: string; name: string; look: string; map: MapId; mapName: string; gold: number; badges: number; party: string; online: boolean; world: string }
export interface BugReport { id: string; uid: string; name: string; text: string; where: string; at: number; resolved?: boolean }

export type C2S =
  | { t: 'join'; token?: string; dev?: string; mode?: 'public' | 'friends' }  // token: Firebase ID 토큰, mode: 모두와 함께 / 친구들만
  | { t: 'move'; x: number; y: number; dir: Dir; anim: string; seq: number }
  | { t: 'action'; action: ActionIntent; reqId: number }
  | { t: 'anim'; anim: string; dir: Dir }           // 도구 휘두르기 등 같은 방 사람에게 보이는 일회성 애니메이션
  | { t: 'chat'; text: string }
  | { t: 'report'; text: string; where: string }     // 버그 신고 (모든 유저)
  | { t: 'admin'; cmd: AdminCmd; reqId: number };    // 관리자 명령

export type S2C =
  | { t: 'welcome'; id: string; you: PlayerState; snapshot: FarmSnapshot; roster: RosterEntry[]; storage: string; admin: boolean }
  | { t: 'adminResult'; reqId: number; ok: boolean; message?: string; users?: AdminUser[]; reports?: BugReport[]; bans?: { uid: string; name: string; reason: string }[] }
  | { t: 'adminReport'; report: BugReport }           // 새 버그 신고 알림 (관리자에게만)
  | { t: 'reported' }
  | { t: 'players'; list: NetPlayer[]; ts: number }
  | { t: 'roster'; list: RosterEntry[] }
  | { t: 'left'; id: string }
  | { t: 'sim'; event: SimEvent }
  | ({ t: 'actionResult'; reqId: number } & ActionResult)
  | { t: 'anim'; id: string; anim: string; dir: Dir }
  | { t: 'correct'; x: number; y: number }
  | { t: 'chat'; from: string; name: string; text: string }
  | { t: 'error'; message: string };
