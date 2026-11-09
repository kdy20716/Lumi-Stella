// 지역 스타일 규칙 (스타일 키트): 마을마다 "어떤 동네인지" 하나만 정하고, 그 동네에 맞는 것만 놓는다.
//   도심에 시골집 · 호수 · 다른 마을 주민이 섞이지 않게 하는 규칙. check-world.mjs 가 이 규칙으로 검사해요.
//
//   facility: 센터 · 상점 · 여관 · 체육관을 어떤 모양으로 세우는지
//     'city'    = 도시형 (빌딩과 같은 상자 건물 + 색 띠 + 이름판)
//     'cottage' = 마을형 (지붕 있는 기존 그림)
//   deny:  이 동네에 있으면 안 되는 물건
//   water: 물 칸 최대 수 (분수 하나 = 9칸)
//   grass: 풀밭 비율 최대 (공원)

const COTTAGE = ['house', 'house_a', 'house_b', 'house_c', 'store', 'cafe', 'smithy', 'windmill', 'hall'];
const FARM = ['plot', 'hay', 'well', 'shipping_bin', 'mailbox', 'stall', 'stall_b', 'log', 'bush_berry'];
const CITY = ['tower', 'dept', 'apart', 'factory', 'tlight', 'vend'];

export const DISTRICTS = {
  metro: {
    name: '대도시', facility: 'city', water: 9, grass: 0.1,
    deny: [...COTTAGE, ...FARM, 'oak_apple', 'factory', 'palm', 'pine', 'pine_snow', 'cactus', 'reeds', 'dead_tree', 'stump', 'rock', 'rock_big', 'tuft', 'tallgrass'],
    npc: 'city', desc: '빌딩 · 차도 · 인도 · 광장. 나무는 가로수와 공원에만, 물은 분수 하나',
  },
  industrial: {
    name: '공업 도시', facility: 'city', water: 0, grass: 0.06,
    deny: [...COTTAGE, ...FARM, 'oak_apple', 'dept', 'palm', 'pine_snow', 'cactus', 'reeds', 'tallgrass'],
    npc: 'worker', desc: '공장 · 굴뚝 · 노동자 아파트 · 자갈 마당 · 광산 입구. 물 없음',
  },
  port: {
    name: '항구 마을', facility: 'cottage', water: Infinity, grass: 1,
    deny: [...CITY, 'pine_snow', 'cactus', 'windmill', 'smithy', ...FARM.filter((f) => f !== 'stall' && f !== 'stall_b')],
    npc: 'sea', desc: '바다 · 부두 · 마을형 건물. 빌딩 · 신호등 없음',
  },
  town: {
    name: '마을', facility: 'cottage', water: Infinity, grass: 1,
    deny: CITY,
    npc: 'biome', desc: '마을형 건물 · 자연. 빌딩 · 신호등 · 자판기 없음',
  },
  home: {
    name: '고향 마을', facility: 'cottage', water: Infinity, grass: 1,
    deny: CITY,
    npc: 'home', desc: '주인공의 고향. 손으로 만든 주민들만 사는 곳',
  },
};

/** 마을 → 동네 종류 (정해지지 않은 마을은 town) */
export const TOWN_DISTRICT = {
  town: 'home',
  lumina: 'metro', crown: 'metro',
  forge: 'industrial',
  harbor: 'port', cape: 'port', shell: 'port',
};
export const districtOf = (id) => DISTRICTS[TOWN_DISTRICT[id] ?? 'town'];
export const districtKey = (id) => TOWN_DISTRICT[id] ?? 'town';

/** 도시형 시설 모양 (facility: 'city'): 상자 건물 + 색 띠 + 이름판 */
export const CITY_FACILITY = {
  center: { label: '루미 센터', floors: 3, color: '#f1ece6', accent: '#e0475b' },
  shop_w: { label: '루미 마트', floors: 3, color: '#e8eef4', accent: '#3a6ab0' },
  store: { label: '루미 마트', floors: 3, color: '#e8eef4', accent: '#3a6ab0' },
  inn: { label: '호텔', floors: 7, color: '#d9cdb8', accent: '#3a5a8a' },
  gym: { label: '체육관', floors: 4, color: '#c9d6d6', accent: '#2a7a7a' },
};
