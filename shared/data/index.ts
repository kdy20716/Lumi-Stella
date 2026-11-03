import type { CropDef, ItemDef, MapId, MoveDef, ShopDef, SpeciesDef, TrainerDef, LumiType } from '../types';
import cropsJson from './crops.json';
import itemsJson from './items.json';
import npcsJson from './npcs.json';
import shopsJson from './shops.json';
import creaturesJson from './creatures.json';
import movesJson from './moves.json';
import trainersJson from './trainers.json';
import encountersJson from './encounters.json';

export const CROPS = cropsJson as unknown as Record<string, CropDef>;
export const ITEMS = itemsJson as unknown as Record<string, ItemDef>;
export const SHOPS = shopsJson as unknown as Record<string, ShopDef>;
export const SPECIES = creaturesJson as unknown as Record<string, SpeciesDef>;
export const MOVES = movesJson as unknown as Record<string, MoveDef>;
export const TRAINERS = trainersJson as unknown as Record<string, TrainerDef>;
type Range = [string, number, number, number]; // [종, 최소Lv, 최대Lv, 가중치]
export const ENCOUNTERS = encountersJson as unknown as {
  grass: Record<string, { day: Range[]; night: Range[] }>;
  fish: Record<string, { items: [string, number][]; lumi: Range[] }>;
  forage: Record<string, string[]>;
  ore: Record<string, [string, number, number, number][]>;
  starters: string[];
  typeChart: Record<LumiType, Partial<Record<LumiType, number>>>;
};
export const TYPE_COLORS: Record<LumiType, string> = { 노말: '#a8a090', 풀: '#5fae4a', 물: '#3f8fc8', 불: '#e8642e', 땅: '#b8864a', 바람: '#7ab8d8', 빛: '#e0b830' };

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
