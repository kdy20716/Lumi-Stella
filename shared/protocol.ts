// 네트워크 패킷 규격 (WebSocket JSON). C2S = 클라이언트→서버, S2C = 서버→클라이언트
import type { ActionIntent, ActionResult, Dir, FarmSnapshot, MapId, PlayerState } from './types';
import type { SimEvent } from './sim/FarmSimulation';

export const DEFAULT_PORT = 2567;
export const SNAPSHOT_HZ = 15;

/** 같은 방(room)에 있는 다른 플레이어의 위치 (보간용) */
export interface NetPlayer { id: string; name: string; look: string; map: MapId; inst: string; world: string; x: number; y: number; dir: Dir; anim: string; partner?: string; battling?: boolean }
/** 접속자 목록 (어디 있는지) */
export interface RosterEntry { id: string; name: string; look: string; map: MapId; inst: string }

export type C2S =
  | { t: 'join'; token?: string; dev?: string; mode?: 'public' | 'friends' }  // token: Firebase ID 토큰, mode: 모두와 함께 / 친구들만
  | { t: 'move'; x: number; y: number; dir: Dir; anim: string; seq: number }
  | { t: 'action'; action: ActionIntent; reqId: number }
  | { t: 'anim'; anim: string; dir: Dir }           // 도구 휘두르기 등 같은 방 사람에게 보이는 일회성 애니메이션
  | { t: 'chat'; text: string };

export type S2C =
  | { t: 'welcome'; id: string; you: PlayerState; snapshot: FarmSnapshot; roster: RosterEntry[]; storage: string }
  | { t: 'players'; list: NetPlayer[]; ts: number }
  | { t: 'roster'; list: RosterEntry[] }
  | { t: 'left'; id: string }
  | { t: 'sim'; event: SimEvent }
  | ({ t: 'actionResult'; reqId: number } & ActionResult)
  | { t: 'anim'; id: string; anim: string; dir: Dir }
  | { t: 'correct'; x: number; y: number }
  | { t: 'chat'; from: string; name: string; text: string }
  | { t: 'error'; message: string };
