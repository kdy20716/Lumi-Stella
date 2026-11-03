// 클라이언트/서버 공용 타입
export type Dir = 'down' | 'left' | 'right' | 'up';
export const DIR_VEC: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };

export type ItemType = 'tool' | 'seed' | 'crop' | 'material' | 'food' | 'battle';
export const OUTDOOR_IDS = ['farm', 'town', 'route1', 'windvale'] as const;
export const INTERIOR_IDS = ['home', 'in_store', 'in_cafe', 'in_lab', 'in_smithy', 'in_house_a', 'in_house_b', 'in_house_c', 'in_center', 'in_shop_w', 'in_gym', 'in_windmill'] as const;
export type MapId = (typeof OUTDOOR_IDS)[number] | (typeof INTERIOR_IDS)[number];
export const MAP_IDS: MapId[] = [...OUTDOOR_IDS, ...INTERIOR_IDS];
export const MAP_NAMES: Record<MapId, string> = {
  farm: '별빛 농장', town: '별빛 마을', route1: '1번 도로 · 산들길', windvale: '바람골 마을',
  home: '나의 집', in_store: '소라네 잡화점', in_cafe: '루나 카페', in_lab: '마을회관 · 루미 연구실', in_smithy: '민수의 대장간',
  in_house_a: '이웃집', in_house_b: '이웃집', in_house_c: '이웃집', in_center: '루미 쉼터', in_shop_w: '바람골 상점', in_gym: '바람골 도장', in_windmill: '풍차 안',
};
/** 바깥 건물(오브젝트 타입) → 실내 맵 */
export const INTERIOR_OF: Record<string, MapId> = { house: 'home', store: 'in_store', cafe: 'in_cafe', hall: 'in_lab', smithy: 'in_smithy', house_a: 'in_house_a', house_b: 'in_house_b', house_c: 'in_house_c', center: 'in_center', shop_w: 'in_shop_w', gym: 'in_gym', windmill: 'in_windmill' };
export const isInterior = (m: MapId) => (INTERIOR_IDS as readonly string[]).includes(m);
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
export type ToolKind = 'hoe' | 'watering_can' | 'axe' | 'pickaxe' | 'rod';

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
  catchBonus?: number;   // 별빛 병 포획 보정
  heal?: number;         // 배틀 회복량
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
  bag: Record<string, number>;    // 배틀 아이템 (별빛 병, 회복 꿀)
  badges: string[];
  defeated: string[];             // 이긴 트레이너 id
  seen: string[]; caught: string[];
}

export type LumiType = '노말' | '풀' | '물' | '불' | '땅' | '바람' | '빛';
export interface CreatureInst { uid: string; species: string; level: number; exp: number; hp: number; moves: string[] }
export interface SpeciesDef {
  id: string; name: string; type: LumiType; kind: string; description: string;
  base: { hp: number; atk: number; def: number; spd: number };
  catchRate: number; expYield: number; learnset: [number, string][];
  helps: 'farm' | 'fish' | 'mine' | 'forage' | 'energy' | 'exp';
}
export interface MoveDef { id: string; name: string; type: LumiType; power: number; accuracy: number; category: 'atk' | 'heal' | 'debuffAtk' | 'debuffDef' | 'buffDef'; priority: number; description: string }
export interface TrainerDef { id: string; name: string; title: string; sprite: string; map: MapId; sight: number; team: [string, number][]; reward: number; badge?: string; intro: string[]; defeat: string[]; after: string[] }

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
export interface FarmSnapshot {
  time: WorldTime;
  gold: number;
  tiles: FarmTile[];          // 지금 있는 농장(주인 기준)의 경작지
  removedObjects: string[];   // `${map}:${objectId}` (농장은 지금 보고 있는 주인의 농장 기준)
  forage: ForageSpot[];
  dish: Dish | null;          // 집 식탁에 차려진 음식
}
/** 저장 데이터 (Firestore / 로컬 파일) */
export interface SaveData {
  v: 1; name: string; look: string; gold: number; energy: number; maxEnergy: number;
  inventory: InventorySlot[]; party: CreatureInst[]; box: CreatureInst[]; bag: Record<string, number>;
  badges: string[]; defeated: string[]; seen: string[]; caught: string[]; bin: { itemId: string; quantity: number }[];
  farm: { tiles: FarmTile[]; removed: number[] };
  story?: number;
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
  | { kind: 'resetSave' }
  | { kind: 'goHome' };                               // 친구 세계/농장에서 내 농장으로                            // 저장 초기화 (처음부터)

export interface ActionResult { ok: boolean; reason?: string; anim?: string; battle?: BattleUpdate; data?: { item?: string; qty?: number } }

export interface ShopDef {
  id: string; name: string; owner: string | null; open: number; close: number; greeting: string;
  items: { itemId: string; price: number }[];
}
