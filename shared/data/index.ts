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
import chaptersJson from './chapters.json';
import skillsJson from './skills.json';
import questsJson from './quests.json';

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
  /** 호감도 주민: 사는 마을 · 사이드 스토리 제목 · 부탁 세 번 · 도우미가 됐을 때 인사 */
  hand?: string; story?: string; full?: string[];
  asks?: { item: string; qty: number; ask: string[]; thanks: string[] }[];
}
export const NPCS = { ...(npcsJson as unknown as Record<string, NpcDef>), ...(regionJson.npcs as unknown as Record<string, NpcDef>) };

/** HHMM → 분 */
export const hhmmToMinutes = (t: number) => Math.floor(t / 100) * 60 + (t % 100);

/** 본편 스토리 사건 (chapters.json) */
export interface CastDef { name: string; title?: string; sprite: string; color?: string }
export interface StoryEvent {
  id: string; chapter: number; map: MapId; needs: string[]; ending?: boolean;
  /** 이 사건 전까지 막히는 곳 */
  gate?: { map: MapId; msg: string };
  /** [말하는 사람(cast id · 'rival'), 대사…] */
  scene: string[][]; after?: string[][];
  battle?: { cast: string; rival?: boolean; team: [string, number][]; reward: number };
  give?: Record<string, number>;
  /** 사건이 시작될 때 걸어 들어오고, 끝나면 돌아서 나가는 인물 (cast id) */
  walkIn?: string;
  /** 사건이 끝난 뒤 화면에 뜨는 알림 */
  toast?: string;
  /** 사건 음악 · 승부 뒤 음악 (client/src/audio/tracks.ts 의 곡 id) */
  bgm?: string; afterBgm?: string;
}
export const CHAPTERS = chaptersJson as unknown as { cast: Record<string, CastDef>; chapters: { n: number; title: string; side?: boolean }[]; events: StoryEvent[] };
export const EVENTS: Record<string, StoryEvent> = Object.fromEntries(CHAPTERS.events.map((e) => [e.id, e]));
/** 깃발 · 이긴 트레이너 · 배지 중 하나라도 있으면 그 조건은 충족 */
/** 루미 도감 완성 = 환상(제네시스)을 뺀 모든 루미를 잡음 */
export const dexComplete = (p: { caught?: string[] }) => Object.values(SPECIES).filter((sp) => sp.legend !== 'myth').every((sp) => !!p.caught?.includes(sp.id));
export const hasDone = (p: { flags?: string[]; defeated: string[]; badges: string[]; caught?: string[] }, k: string): boolean =>
  k === 'dex' ? dexComplete(p) : k.startsWith('!') ? !hasDone(p, k.slice(1)) : k.startsWith('caught:') ? !!p.caught?.includes(k.slice(7)) : !!p.flags?.includes(k) || p.defeated.includes(k) || p.badges.includes(k);
/** 지금 이 맵에서 일어날 수 있는 다음 사건 */
export const nextEvent = (p: { map: string; flags?: string[]; defeated: string[]; badges: string[]; caught?: string[]; story: number }, map = p.map) =>
  p.story >= 5 ? CHAPTERS.events.find((e) => e.map === map && !p.flags?.includes(e.id) && e.needs.every((k) => hasDone(p, k))) : undefined;
/** 아직 일어나지 않은 사건 때문에 막힌 곳 */
export const gateFor = (p: { flags?: string[] }, to: string) => CHAPTERS.events.find((e) => e.gate?.map === to && !p.flags?.includes(e.id));

/** 비전 기술 (skills.json) */
export interface SkillDef { name: string; badge: string; obstacle: string; look: string; use: string; need: string; drops?: [string, number][] }
export const SKILLS = Object.fromEntries(Object.entries(skillsJson).filter(([k]) => !k.startsWith('_'))) as unknown as Record<string, SkillDef>;
/** 이 장애물을 치우는 기술 */
export const skillFor = (type: string) => Object.entries(SKILLS).find(([, s]) => s.obstacle === type)?.[0];

/** 사이드 스토리 (quests.json): 막힌 곳 · 네 탑 · 마지막 선율 */
export interface SpireDef { name: string; score: string; boss: string; color: string; notes: number[] }
export const QUESTS = questsJson as unknown as { gates: Record<string, { flag: string; msg: string; seal?: string }>; spires: Record<string, SpireDef>; finale: { score: string; boss: string; notes: number[] } };
/** 마을 → 그 마을의 호감도 주민 */
export const HANDS = ((regionJson as unknown as { hands?: Record<string, string[]> }).hands ?? {}) as Record<string, string[]>;
/** 마을 단계에 맞는 루미 마트 */
export const martFor = (town: string) => { const t = REGION_MAPS[town]?.tier ?? 2; return t <= 2 ? 'windvale' : t <= 4 ? 'mart2' : t <= 6 ? 'mart3' : 'mart4'; };
