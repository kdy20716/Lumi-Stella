// 클라이언트/서버 공용 타입
export type Dir = 'down' | 'left' | 'right' | 'up';
export const DIR_VEC: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

export type ItemType = 'tool' | 'seed' | 'crop' | 'material';
export type ToolKind = 'hoe' | 'watering_can' | 'axe';

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  icon: string;          // ui/icons.png 의 아이콘 id
  sellPrice: number;
  maxStack: number;
  description: string;
  tool?: ToolKind;
  cropId?: string;       // 씨앗 → 작물
  energyCost?: number;   // 도구 사용 시 소모 에너지
}

export interface CropDef {
  id: string;
  name: string;
  seedItem: string;
  harvestItem: string;
  seasons: Season[];
  growthDays: number[];  // 단계별 소요 일수 (마지막 = 수확 가능 단계로 가는 기간)
  regrowDays: number;    // 0 = 1회 수확, >0 = 수확 후 해당 일수 뒤 재수확
  harvestQty: [number, number];
  spriteRow: number;     // crops.png 행
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter';
export type Weather = 'sunny' | 'rain';

/** 토양 상태 (CLAUDE.md 규격) */
export enum SoilState { Unplowed = 0, Plowed = 1, Watered = 2 }

export interface CropInstance { id: string; stage: number; daysInStage: number; regrowing?: boolean }
export interface FarmTile { x: number; y: number; soil: SoilState; crop: CropInstance | null }

export interface InventorySlot { slotIndex: number; itemId: string | null; quantity: number }

export interface PlayerState {
  id: string;
  name: string;
  look: string;           // 캐릭터 시트 키
  x: number; y: number;   // 월드 픽셀 (발 위치)
  dir: Dir;
  anim: string;           // 'idle' | 'walk' | 'run' | 'hoe' ...
  energy: number;
  maxEnergy: number;
  inventory: InventorySlot[];
}

export interface WorldTime { day: number; minutes: number; season: Season; weather: Weather }

export interface FarmSnapshot {
  time: WorldTime;
  gold: number;
  tiles: FarmTile[];
  removedObjects: number[];
  shippingBin: { itemId: string; quantity: number }[];
}

/** 클라이언트 → 권한자(로컬 시뮬레이션 또는 서버)로 보내는 행동 의도 */
export type ActionIntent =
  | { kind: 'useTool'; slot: number; tx: number; ty: number }
  | { kind: 'plant'; slot: number; tx: number; ty: number }
  | { kind: 'harvest'; tx: number; ty: number }
  | { kind: 'ship'; slot: number }
  | { kind: 'chop'; objectId: number }
  | { kind: 'sleep' };

export interface ActionResult { ok: boolean; reason?: string; anim?: string }
