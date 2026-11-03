import type { CropDef, ItemDef, MapId, ShopDef } from '../types';
import cropsJson from './crops.json';
import itemsJson from './items.json';
import npcsJson from './npcs.json';
import shopsJson from './shops.json';

export const CROPS = cropsJson as unknown as Record<string, CropDef>;
export const ITEMS = itemsJson as unknown as Record<string, ItemDef>;
export const SHOPS = shopsJson as unknown as Record<string, ShopDef>;

export interface NpcScheduleEntry {
  time: number;            // HHMM (600 = 6:00)
  map?: MapId;             // 목적지가 있는 맵 (기본 farm)
  to: string;              // 웨이포인트 이름 (맵 Spawns 레이어)
  idle: 'stand' | 'wander' | 'work' | 'leave' | 'perform';
  radius?: number;
  face?: 'down' | 'up' | 'left' | 'right';
  work?: 'water' | 'hoe';
}
export interface NpcDef {
  id: string; name: string; title: string; sprite: string; speed: number; run?: boolean; color: string;
  schedule: NpcScheduleEntry[];
  dialogue: Record<'first' | 'morning' | 'afternoon' | 'evening' | 'rain' | 'random', string[]>;
}
export const NPCS = npcsJson as unknown as Record<string, NpcDef>;

/** HHMM → 분 */
export const hhmmToMinutes = (t: number) => Math.floor(t / 100) * 60 + (t % 100);
