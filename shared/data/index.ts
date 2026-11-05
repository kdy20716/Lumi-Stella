import type { CropDef, ItemDef, MapId, MoveDef, RecipeDef, ShopDef, SpeciesDef, TrainerDef, LumiType } from '../types';
import cropsJson from './crops.json';
import itemsJson from './items.json';
import npcsJson from './npcs.json';
import shopsJson from './shops.json';
import creaturesJson from './creatures.json';
import movesJson from './moves.json';
import trainersJson from './trainers.json';
import encountersJson from './encounters.json';
import regionJson from './region.json';
import recipesJson from './recipes.json';

export const CROPS = cropsJson as unknown as Record<string, CropDef>;
export const ITEMS = itemsJson as unknown as Record<string, ItemDef>;
export const SHOPS = shopsJson as unknown as Record<string, ShopDef>;
export const RECIPES = recipesJson as unknown as Record<string, RecipeDef>;
export const SPECIES = creaturesJson as unknown as Record<string, SpeciesDef>;
export const MOVES = movesJson as unknown as Record<string, MoveDef>;
/** 지방 맵 메타 (이름 · 종류 · 휴대폰 지도 좌표) */
export const REGION_MAPS = regionJson.maps as unknown as Record<string, { name: string; kind: string; biome: string; x: number; y: number; tier: number; interior?: boolean }>;
export const TRAINERS = { ...(trainersJson as unknown as Record<string, TrainerDef>), ...(regionJson.trainers as unknown as Record<string, TrainerDef>) };
type Range = [string, number, number, number]; // [종, 최소Lv, 최대Lv, 가중치]
const ENC = encountersJson as unknown as {
  grass: Record<string, { day: Range[]; night: Range[] }>;
  fish: Record<string, { items: [string, number][]; lumi: Range[] }>;
  forage: Record<string, string[]>;
  ore: Record<string, [string, number, number, number][]>;
  starters: string[];
  typeChart: Record<LumiType, Partial<Record<LumiType, number>>>;
};
// 생성된 지방 데이터(야생 루미 · 낚시 · 채집)를 손으로 만든 데이터 위에 합침
export const ENCOUNTERS = { ...ENC, grass: { ...(regionJson.grass as unknown as typeof ENC.grass), ...ENC.grass }, fish: { ...(regionJson.fish as unknown as typeof ENC.fish), ...ENC.fish }, forage: { ...(regionJson.forage as unknown as typeof ENC.forage), ...ENC.forage } };
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
  /** 친밀도(하트)별 대사: { "2": [...], "4": [...] } — 친해질수록 속마음을 털어놓음 */
  hearts?: Record<string, string[]>;
  /** 생성된 마을 주민 (자기 마을에만 있음) */
  gen?: boolean;
}
export const NPCS = { ...(npcsJson as unknown as Record<string, NpcDef>), ...(regionJson.npcs as unknown as Record<string, NpcDef>) };

/** HHMM → 분 */
export const hhmmToMinutes = (t: number) => Math.floor(t / 100) * 60 + (t % 100);
