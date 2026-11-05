// 클라이언트/서버 공용 타입
import REGION from './data/region.json';
export type Dir = 'down' | 'left' | 'right' | 'up';
export const DIR_VEC: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

export type ItemType = 'tool' | 'seed' | 'crop' | 'material' | 'food' | 'battle' | 'placeable' | 'key';
/** 맵 목록·이름·지도 좌표는 맵 생성기(tools/map/generate-map.mjs)가 만든 region.json 에서 */
export interface MapMeta { name: string; kind: 'farm' | 'town' | 'route' | 'cave' | 'area' | 'room'; biome: string; x: number; y: number; tier: number; interior?: boolean }
export type MapId = string;
export const MAP_IDS: MapId[] = REGION.ids;
export const MAP_META = REGION.maps as unknown as Record<MapId, MapMeta>;
export const MAP_NAMES: Record<MapId, string> = Object.fromEntries(Object.entries(MAP_META).map(([id, m]) => [id, m.name]));
const INTERIOR_SET = new Set<string>(REGION.interior);
/** 바깥 건물(오브젝트 타입) → 실내 맵 */
export const INTERIOR_OF: Record<string, MapId> = { house: 'home', store: 'in_store', cafe: 'in_cafe', hall: 'in_lab', smithy: 'in_smithy', house_a: 'in_house_a', house_b: 'in_house_b', house_c: 'in_house_c', center: 'in_center', shop_w: 'in_shop_w', gym: 'in_gym', windmill: 'in_windmill' };
export const isInterior = (m: MapId) => INTERIOR_SET.has(m);
/** 배지가 있어야 들어갈 수 있는 곳 */
export const BADGE_GATES: Record<string, number> = { league: 8, origin: 8, distortion: 8 };
/** 주인별로 따로 존재하는 공간 (초대받은 친구만 함께 보임) */
export const isPrivateMap = (m: MapId) => m === 'farm' || m === 'home';
/** 같은 방(room)에 있는 플레이어끼리만 서로 보인다: 공개 맵은 맵 이름, 개인 공간은 맵@주인, 건물 실내는 맵@바깥맵:건물id */
export const roomKey = (map: MapId, inst: string) => (inst ? `${map}@${inst}` : map);
/** 세계(world)까지 포함한 방: '' = 모두가 함께하는 공개 세계, uid = 그 사람의 '친구들만' 세계. 농장/집은 주인 기준이라 세계와 무관 */
export const roomOf = (map: MapId, inst: string, world: string) => (isPrivateMap(map) || !world ? roomKey(map, inst) : `${world}|${roomKey(map, inst)}`);
/** 캐릭터 선택 외형 (남 4 · 여 4) */
export const PLAYER_LOOKS = { male: ['m1', 'm2', 'm3', 'm4'], female: ['f1', 'f2', 'f3', 'f4'] } as const;
export const ALL_PLAYER_LOOKS: string[] = [...PLAYER_LOOKS.male, ...PLAYER_LOOKS.female];
/** 감정표현: emotes.png 프레임 번호 */
export const EMOTES = [{ id: 5, name: '웃음' }, { id: 2, name: '하트' }, { id: 1, name: '놀람' }, { id: 3, name: '궁금' }, { id: 6, name: '슬픔' }, { id: 7, name: '화남' }] as const;
export type ToolKind = 'hoe' | 'watering_can' | 'axe' | 'pickaxe' | 'rod' | 'hammer';

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
  energy?: number;       // 음식: 회복 에너지
  catchBonus?: number;   // 루미볼 포획 보정
  heal?: number;         // 배틀 회복량
  boost?: { atk?: number; def?: number }; // 도핑약: 배틀 중 능력 단계 상승
  place?: string;        // 설치물: 농장에 놓이는 오브젝트 종류 (망치로 부수면 아이템으로 돌아옴)
}

/** 작업대 제작법 (작물·채집물·광석 → 볼·회복약·도핑약) */
export interface RecipeDef {
  id: string; out: string; qty: number; in: Record<string, number>; description: string;
  starter?: boolean;     // 처음부터 아는 제작법
  teacher?: string;      // 가르쳐 주는 NPC id
  badges?: number;       // 배우는 데 필요한 배지 수
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

export interface ForageSpot { key: string; map: MapId; x: number; y: number; item: string }
export interface InventorySlot { slotIndex: number; itemId: string | null; quantity: number }

export interface PlayerState {
  id: string;
  name: string;
  look: string;           // 캐릭터 시트 키 ('' = 아직 캐릭터를 만들지 않음)
  map: MapId;             // 현재 있는 맵
  inst: string;           // 인스턴스: '' 공개 맵 · 주인 id(농장/집) · '바깥맵:건물id'(실내)
  world: string;          // 지금 있는 세계: '' 모두와 함께 · uid 그 사람의 친구들만 세계
  homeWorld: string;      // 접속할 때 고른 내 세계
  ret?: { map: MapId; inst: string; x: number; y: number }; // 실내에서 나갈 때 돌아갈 곳
  gold: number;
  bin: { itemId: string; quantity: number }[];  // 출하 상자 (다음 날 아침 정산)
  sleeping?: boolean;
  story: number;          // 프롤로그 진행 단계 (shared/story.ts)
  x: number; y: number;   // 월드 픽셀 (발 위치)
  dir: Dir;
  anim: string;           // 'idle' | 'walk' | 'run' | 'hoe' ...
  energy: number;
  maxEnergy: number;
  inventory: InventorySlot[];
  // ── 루미 모험 ──
  party: CreatureInst[];          // 최대 6, [0] = 따라다니는 파트너
  box: CreatureInst[];            // 파티가 가득 차면 보관
  bag: Record<string, number>;    // 배틀 아이템 (루미볼, 회복약, 도핑약)
  recipes: string[];              // 배운 제작법 (+ 'gift:<npc>' 받은 선물 표시)
  badges: string[];
  defeated: string[];             // 이긴 트레이너 id
  seen: string[]; caught: string[];
  visited: string[];              // 가 본 바깥 맵 (휴대폰 지도 안개 걷힘)
}

export type LumiType = '노말' | '풀' | '물' | '불' | '땅' | '바람' | '빛';
export interface CreatureInst { uid: string; species: string; level: number; exp: number; hp: number; moves: string[] }
export interface SpeciesDef {
  id: string; name: string; type: LumiType; kind: string; description: string;
  base: { hp: number; atk: number; def: number; spd: number };
  catchRate: number; expYield: number; learnset: [number, string][];
  helps: 'farm' | 'fish' | 'mine' | 'forage' | 'energy' | 'exp';
  /** 전설 · 환상: 야생에 나오지 않고 정해진 곳에서만 */
  legend?: 'legend' | 'myth';
  /** 체력과 볼에 상관없이 고정 포획률 (태초볼 제외) */
  fixedCatch?: number;
}
export interface MoveDef { id: string; name: string; type: LumiType; power: number; accuracy: number; category: 'atk' | 'heal' | 'debuffAtk' | 'debuffDef' | 'buffDef'; priority: number; description: string }
export interface TrainerDef { id: string; name: string; title: string; sprite: string; map: MapId; sight: number; team: [string, number][]; reward: number; badge?: string; requires?: string[]; intro: string[]; defeat: string[]; after: string[] }

export interface CreatureView { uid: string; species: string; name: string; type: LumiType; level: number; hp: number; maxHp: number; exp: number; expNext: number; moves: { id: string; name: string; type: LumiType; power: number; category: string }[] }
export interface BattleView {
  kind: 'wild' | 'trainer'; bg: string; trainer?: { name: string; title: string; sprite: string; left: number };
  me: CreatureView; foe: CreatureView;
  party: { uid: string; species: string; name: string; level: number; hp: number; maxHp: number }[];
  bag: Record<string, number>;
}
export type BattleLog =
  | { t: 'text'; text: string }
  | { t: 'attack'; side: 'me' | 'foe'; move: string; type: LumiType }
  | { t: 'hp'; side: 'me' | 'foe'; hp: number; maxHp: number; eff?: number; crit?: boolean }
  | { t: 'faint'; side: 'me' | 'foe' }
  | { t: 'send'; side: 'me' | 'foe'; view: CreatureView }
  | { t: 'throw'; item: string; shakes: number; success: boolean }
  | { t: 'exp'; exp: number; expNext: number; level: number; leveled: boolean };
export interface BattleUpdate { view: BattleView; log: BattleLog[]; ended?: 'win' | 'lose' | 'run' | 'caught' }

export interface WorldTime { day: number; minutes: number; season: Season; weather: Weather }

export interface Dish { item: string; servings: number; by: string }
/** 플레이어가 농장에 설치한 구조물 (울타리 · 상자 · 허수아비 …) */
export interface PlacedObject { id: string; type: string; item: string; x: number; y: number; by: string }

export interface FarmSnapshot {
  time: WorldTime;
  gold: number;
  tiles: FarmTile[];          // 지금 있는 농장(주인 기준)의 경작지
  removedObjects: string[];   // `${map}:${objectId}` (농장은 지금 보고 있는 주인의 농장 기준)
  forage: ForageSpot[];
  dish: Dish | null;          // 집 식탁에 차려진 음식
  placed?: PlacedObject[];    // 지금 있는 농장의 설치물
}
/** 저장 데이터 (Firestore / 로컬 파일) */
export interface SaveData {
  v: 1; name: string; look: string; gold: number; energy: number; maxEnergy: number;
  inventory: InventorySlot[]; party: CreatureInst[]; box: CreatureInst[]; bag: Record<string, number>;
  badges: string[]; defeated: string[]; seen: string[]; caught: string[]; bin: { itemId: string; quantity: number }[];
  farm: { tiles: FarmTile[]; removed: number[]; placed?: PlacedObject[]; ver?: number };
  story?: number;
  visited?: string[];
  recipes?: string[];
  savedAt: number;
}

/** 클라이언트 → 권한자(로컬 시뮬레이션 또는 서버)로 보내는 행동 의도 */
export type ActionIntent =
  | { kind: 'useTool'; slot: number; tx: number; ty: number }
  | { kind: 'plant'; slot: number; tx: number; ty: number }
  | { kind: 'harvest'; tx: number; ty: number }
  | { kind: 'ship'; slot: number }
  | { kind: 'chop'; objectId: number }
  | { kind: 'buy'; shop: string; itemId: string; qty: number }
  | { kind: 'eat'; slot: number }
  | { kind: 'sleep' }
  | { kind: 'debugDay' }                              // 테스트용: 자리 그대로 다음 날 (혼자일 때만, 키는 없음)
  | { kind: 'legend' }                                // 별의 제단: 전설 별무리
  | { kind: 'ocarina' }                               // 별의 제단에서 오카리나: 환상 온누리
  | { kind: 'rematch' }                               // 루미 리그: 루미 마스터 재대결 (도감 완성)
  | { kind: 'pull'; objectId: number }               // 잡초 뽑기 (맨손)
  | { kind: 'place'; slot: number; tx: number; ty: number }
  | { kind: 'hammer'; tx: number; ty: number }
  | { kind: 'chooseStarter'; species: string }
  | { kind: 'setPartner'; index: number }
  | { kind: 'heal' }
  | { kind: 'encounter' }
  | { kind: 'trainer'; trainerId: string }
  | { kind: 'battleMove'; index: number }
  | { kind: 'battleItem'; itemId: string }
  | { kind: 'battleSwitch'; index: number }
  | { kind: 'battleRun' }
  | { kind: 'fish'; tx: number; ty: number }
  | { kind: 'mine'; objectId: number }
  | { kind: 'forage'; key: string }
  | { kind: 'warp'; index: number }                   // 발로 밟는 워프 (맵 가장자리 / 실내 출구)
  | { kind: 'enter'; objectId: number }               // 건물 문 앞에서 E
  | { kind: 'invite'; to: string; where: 'farm' | 'home' }
  | { kind: 'acceptInvite'; from: string }
  | { kind: 'setLook'; look: string; name?: string }
  | { kind: 'emote'; id: number }
  | { kind: 'serve'; slot: number }                   // 식탁에 음식 차리기
  | { kind: 'eatDish' }
  | { kind: 'story'; step: number }                   // 프롤로그 다음 단계로
  | { kind: 'rivalBattle' }                           // 마을회관에서 친구와 첫 대결
  | { kind: 'craft'; recipe: string; times?: number }  // 작업대에서 제작
  | { kind: 'learn'; npc: string }                  // 공방 NPC에게 제작법 배우기
  | { kind: 'resetSave' }
  | { kind: 'goHome' };                               // 친구 세계/농장에서 내 농장으로                            // 저장 초기화 (처음부터)

export interface ActionResult { ok: boolean; reason?: string; anim?: string; battle?: BattleUpdate; data?: { item?: string; qty?: number } }

export interface ShopDef {
  id: string; name: string; owner: string | null; open: number; close: number; greeting: string;
  items: { itemId: string; price: number }[];
}
