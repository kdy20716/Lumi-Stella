// 네트워크 패킷 규격 (WebSocket JSON). C2S = 클라이언트→서버, S2C = 서버→클라이언트
import type { ActionIntent, Dir, FarmSnapshot, PlayerState } from './types';
import type { SimEvent } from './sim/FarmSimulation';

export const DEFAULT_PORT = 2567;
export const SNAPSHOT_HZ = 15;

export interface NetPlayer { id: string; name: string; look: string; x: number; y: number; dir: Dir; anim: string }

export type C2S =
  | { t: 'join'; name: string; look: string }
  | { t: 'move'; x: number; y: number; dir: Dir; anim: string; seq: number }
  | { t: 'action'; action: ActionIntent; reqId: number }
  | { t: 'anim'; anim: string; dir: Dir }           // 도구 휘두르기 등 다른 사람에게 보이는 일회성 애니메이션
  | { t: 'chat'; text: string };

export type S2C =
  | { t: 'welcome'; id: string; you: PlayerState; snapshot: FarmSnapshot; players: NetPlayer[] }
  | { t: 'players'; list: NetPlayer[]; ts: number }   // 주기적 위치 스냅샷 (보간용)
  | { t: 'joined'; player: NetPlayer }
  | { t: 'left'; id: string }
  | { t: 'sim'; event: SimEvent }
  | { t: 'actionResult'; reqId: number; ok: boolean; reason?: string; anim?: string }
  | { t: 'anim'; id: string; anim: string; dir: Dir }
  | { t: 'correct'; x: number; y: number }            // 서버 보정 (Reconciliation)
  | { t: 'chat'; from: string; name: string; text: string };
