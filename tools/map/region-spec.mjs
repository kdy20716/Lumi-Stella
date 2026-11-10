// 루미나 지방 전체 설계 (4세대 규모 참고: 마을 17 · 도로 30 · 던전/랜드마크/특별구역/시설 25+)
// 이름과 지형은 모두 이 게임 오리지널. 좌표 (x, y) 는 휴대폰 지도(360×240) 위치.
//   kind: town | route | cave | area | room     biome: meadow forest beach rocky snow desert swamp volcano city
//   tier: 진행 단계(1~9) → 야생 루미 레벨, 트레이너 강함

export const WORLD_W = 360, WORLD_H = 240;

/** 마을 18 (별빛 마을·바람골은 손으로 만든 기존 맵) · 왕관 시티는 북동쪽 리그 섬 (등대곶에서 배) */
export const TOWNS = [
  { id: 'town', name: '별빛 마을', x: 46, y: 200, tier: 1, biome: 'meadow', existing: true, desc: '호숫가의 작은 마을. 모든 여행이 시작되는 곳.' },
  { id: 'windvale', name: '바람골 마을', x: 88, y: 194, tier: 2, biome: 'meadow', existing: true, gym: '바람', desc: '풍차가 도는 바람의 마을.' },
  { id: 'harbor', name: '물결항', x: 138, y: 210, tier: 3, biome: 'beach', coastal: true, gym: '물', desc: '갈매기 소리가 끊이지 않는 남쪽 항구.' },
  { id: 'maple', name: '단풍골', x: 92, y: 150, tier: 3, biome: 'forest', gym: '풀', desc: '사계절 붉은 잎이 지지 않는 숲속 마을.' },
  { id: 'bloom', name: '꽃구름 마을', x: 186, y: 206, tier: 4, biome: 'meadow', coastal: true, desc: '꽃밭이 구름처럼 피어나는 바닷가 마을.' },
  { id: 'forge', name: '쇳불 도시', x: 96, y: 104, tier: 4, biome: 'rocky', city: true, gym: '땅', desc: '광산과 대장간의 도시. 밤에도 쇳불이 꺼지지 않는다.' },
  { id: 'mist', name: '안개 마을', x: 186, y: 160, tier: 5, biome: 'swamp', desc: '늪지 대초원 입구의 조용한 마을.' },
  { id: 'ember', name: '잿빛 마을', x: 240, y: 212, tier: 5, biome: 'volcano', coastal: true, gym: '불', desc: '불꽃산 아래 온천이 솟는 마을.' },
  { id: 'pinecone', name: '솔방울 마을', x: 140, y: 92, tier: 5, biome: 'forest', desc: '안개숲 곁 나무꾼들의 마을.' },
  { id: 'lumina', name: '빛누리 시티', x: 246, y: 128, tier: 6, biome: 'city', city: true, gym: '빛', desc: '지방에서 가장 큰 도시. 밤하늘보다 밝다.' },
  { id: 'summit', name: '별마루 마을', x: 186, y: 104, tier: 7, biome: 'rocky', gym: '혼합', desc: '별마루산 기슭, 별을 섬기는 오래된 마을.' },
  { id: 'shell', name: '조개 마을', x: 300, y: 214, tier: 6, biome: 'beach', coastal: true, desc: '조개껍질 지붕이 반짝이는 동쪽 해변 마을.' },
  { id: 'sand', name: '모래바람 마을', x: 306, y: 166, tier: 6, biome: 'desert', desc: '사막 오아시스에 기댄 교역 마을.' },
  { id: 'canyon', name: '바위골', x: 96, y: 56, tier: 6, biome: 'rocky', desc: '깎아지른 협곡 사이의 마을.' },
  { id: 'moon', name: '달맞이 마을', x: 40, y: 62, tier: 7, biome: 'meadow', coastal: true, desc: '달이 가장 크게 뜨는 서쪽 바닷가.' },
  { id: 'frost', name: '서리 마을', x: 150, y: 30, tier: 7, biome: 'snow', gym: '노말', desc: '일 년 내내 눈이 쌓인 북쪽 마을.' },
  { id: 'cape', name: '등대곶', x: 282, y: 66, tier: 8, biome: 'beach', coastal: true, desc: '대륙 북동쪽 끝, 리그 섬으로 가는 배가 뜨는 등대 마을.' },
  { id: 'crown', name: '왕관 시티', x: 330, y: 30, tier: 9, biome: 'city', city: true, coastal: true, league: true, island: true, desc: '북동쪽 바다 위 리그 섬. 루미 리그가 열리는 꿈의 도시.' },
];

/** 도로 28 (22 · 30번은 뱃길로 바뀜 — 섬은 항구의 정기선으로만): [번호, A, B, 이름, biome]
 *  마을 사이 도로는 2~3구간으로 나뉜 맵 (route3 → route3b → route3c): 4세대처럼 마을 사이가 꽤 멀어요 */
export const ROUTES = [
  [1, 'town', 'windvale', '산들길', 'meadow'],
  [2, 'windvale', 'harbor', '갯바람길', 'beach'],
  [3, 'windvale', 'maple', '단풍오솔길', 'forest'],
  [4, 'maple', 'forge', '자갈비탈', 'rocky'],
  [5, 'harbor', 'bloom', '해당화길', 'beach'],
  [6, 'bloom', 'ember', '노을언덕', 'meadow'],
  [7, 'ember', 'shell', '화산재 해변', 'volcano'],
  [8, 'shell', 'sand', '모래언덕길', 'desert'],
  [9, 'sand', 'lumina', '신기루길', 'desert'],
  [10, 'bloom', 'mist', '갈대습지길', 'swamp'],
  [11, 'mist', 'lumina', '반딧불길', 'meadow'],
  [12, 'forge', 'pinecone', '나무꾼길', 'forest'],
  [13, 'pinecone', 'summit', '구름고개', 'rocky'],
  [14, 'summit', 'lumina', '별빛 들판', 'meadow'],
  [15, 'forge', 'canyon', '협곡 오르막', 'rocky'],
  [16, 'canyon', 'frost', '눈발 고개', 'snow'],
  [17, 'canyon', 'moon', '해넘이길', 'meadow'],
  [18, 'frost', 'route19', '눈꽃 평원', 'snow'],
  [19, 'route18', 'cape', '얼음 강변', 'snow'],
  [20, 'lumina', 'victory_1f', '도전자의 길', 'rocky'],
  [21, 'victory_3f', 'cape', '등대 언덕길', 'meadow'],
  [23, 'sand', 'route24', '마른 바람길', 'desert'],
  [24, 'route23', 'cape', '동쪽 해안길', 'beach'],
  [25, 'moon', 'route26', '서해 절벽길', 'beach'],
  [26, 'route25', 'maple', '이끼 숲길', 'forest'],
  [27, 'summit', 'frost', '하늘 잔도', 'snow'],
  [28, 'mist', 'summit', '안개 비탈', 'swamp'],
  [29, 'pinecone', 'canyon', '솔바람 계곡', 'forest'],
];

/** 확장 도로 (2단계 제안서 승인분). 기존 맵 · 이름이 바뀌지 않게 따로 두고, 생성도 맨 마지막에 함
 *  [번호, A, B, 이름, biome, { need: 비전 기술 }] — need 가 있으면 A 쪽 입구를 그 기술로만 지나갈 수 있음 */
export const ROUTES_V2 = [
  [31, 'town', 'dawn_lake', '호숫가 숲길', 'forest', { need: 'cut' }],
];

/** 던전 · 랜드마크 · 특별 구역 · 시설
 *  attach: [붙는 맵, 'mouth'(동굴 입구) | 'side'(옆길) | 'dock'(배) | 'door'(건물) | 'stairs' | 'portal'] */
export const PLACES = [
  // 세 호수 + 호수 동굴
  { id: 'dawn_lake', name: '새벽호수', kind: 'area', tpl: 'lake', biome: 'forest', tier: 3, x: 74, y: 170, attach: ['route3', 'side'], desc: '새벽마다 물안개가 피어오르는 호수. 지혜의 루미가 잠든다는 전설.' },
  { id: 'valor_lake', name: '노을호수', kind: 'area', tpl: 'lake', biome: 'meadow', tier: 5, x: 272, y: 192, attach: ['route7', 'side'], desc: '노을빛을 그대로 비추는 호수. 용기의 루미 전설.' },
  { id: 'acuity_lake', name: '달빛호수', kind: 'area', tpl: 'lake', biome: 'snow', tier: 8, x: 196, y: 22, attach: ['route18', 'side'], desc: '얼음 아래로 달빛이 흐르는 호수. 마음의 루미 전설.' },
  // 별마루산 (지방 한가운데의 큰 산) → 별의 제단 → 태초의 방 / 뒤집힌 세계
  { id: 'coronet_1f', name: '별마루산 1층', kind: 'cave', theme: 'rock', tier: 7, x: 190, y: 86, attach: ['summit', 'mouth'], floor: 1, chain: 'coronet', desc: '지방을 남북으로 가르는 거대한 산.' },
  { id: 'coronet_2f', name: '별마루산 2층', kind: 'cave', theme: 'rock', tier: 8, x: 192, y: 78, attach: ['coronet_1f', 'stairs'], floor: 2 },
  { id: 'coronet_3f', name: '별마루산 정상 동굴', kind: 'cave', theme: 'crystal', tier: 8, x: 194, y: 70, attach: ['coronet_2f', 'stairs'], floor: 3 },
  { id: 'altar', name: '별의 제단', kind: 'area', tpl: 'altar', biome: 'rocky', tier: 9, x: 196, y: 62, attach: ['coronet_3f', 'mouth'], desc: '구름 위, 부서진 기둥들이 둘러싼 고대의 제단.' },
  { id: 'origin', name: '태초의 방', kind: 'room', room: 'origin', tier: 9, x: 198, y: 56, attach: ['altar', 'stairs'], needBadges: 8, desc: '세상이 처음 빚어졌다는 빛의 방.' },
  { id: 'distortion', name: '뒤집힌 세계', kind: 'area', tpl: 'distortion', biome: 'distortion', tier: 9, x: 204, y: 64, attach: ['altar', 'portal'], needBadges: 8, desc: '위와 아래가 뒤섞인 기묘한 세계.' },
  // 불꽃산 · 무쇠섬 · 승리의 길
  { id: 'stark_1f', name: '불꽃산 입구', kind: 'cave', theme: 'lava', tier: 7, x: 244, y: 196, attach: ['ember', 'mouth'], floor: 1, desc: '지금도 연기를 뿜는 활화산.' },
  { id: 'stark_2f', name: '불꽃산 화구', kind: 'cave', theme: 'lava', tier: 8, x: 246, y: 188, attach: ['stark_1f', 'stairs'], floor: 2 },
  { id: 'iron', name: '무쇠섬', kind: 'area', tpl: 'island', biome: 'rocky', tier: 7, x: 336, y: 228, attach: ['shell', 'dock'], desc: '쇳덩이 같은 바위로 된 외딴 섬. 옛 광산이 있다.' },
  { id: 'iron_1f', name: '무쇠섬 갱도', kind: 'cave', theme: 'mine', tier: 7, x: 338, y: 222, attach: ['iron', 'mouth'], floor: 1 },
  { id: 'iron_2f', name: '무쇠섬 깊은 갱도', kind: 'cave', theme: 'mine', tier: 8, x: 340, y: 216, attach: ['iron_1f', 'stairs'], floor: 2 },
  { id: 'victory_1f', name: '승리의 길 1층', kind: 'cave', theme: 'rock', tier: 9, x: 262, y: 96, floor: 1, desc: '리그에 도전하는 이들만 지나는 험한 동굴.' },
  { id: 'victory_2f', name: '승리의 길 2층', kind: 'cave', theme: 'crystal', tier: 9, x: 272, y: 84, attach: ['victory_1f', 'stairs'], floor: 2 },
  { id: 'victory_3f', name: '승리의 길 3층', kind: 'cave', theme: 'rock', tier: 9, x: 282, y: 72, attach: ['victory_2f', 'stairs'], floor: 3 },
  // 숲 · 늪 · 동굴
  { id: 'eterna_forest', name: '안개숲', kind: 'area', tpl: 'forest_maze', biome: 'forest', tier: 5, x: 118, y: 108, attach: ['route12', 'side'], desc: '한번 들어가면 길을 잃는다는 깊은 숲.' },
  { id: 'chateau', name: '숲속 폐저택', kind: 'room', room: 'chateau', tier: 6, x: 112, y: 116, attach: ['eterna_forest', 'door'], desc: '아무도 살지 않는데 밤마다 불이 켜지는 저택.' },
  { id: 'marsh', name: '늪지 대초원', kind: 'area', tpl: 'marsh', biome: 'swamp', tier: 5, x: 164, y: 152, attach: ['mist', 'side'], desc: '끝없이 펼쳐진 늪과 풀숲. 희귀한 루미가 산다.' },
  { id: 'wayward_1f', name: '헤매는 동굴', kind: 'cave', theme: 'dark', tier: 4, x: 78, y: 128, attach: ['route4', 'mouth'], floor: 1, desc: '불빛이 없으면 한 치 앞도 보이지 않는 동굴.' },
  { id: 'wayward_2f', name: '헤매는 동굴 안쪽', kind: 'cave', theme: 'dark', tier: 5, x: 70, y: 122, attach: ['wayward_1f', 'stairs'], floor: 2 },
  { id: 'ice_cave', name: '얼음 굴', kind: 'cave', theme: 'ice', tier: 7, x: 128, y: 42, attach: ['route16', 'mouth'], floor: 1, desc: '천장에서 고드름이 반짝이는 동굴.' },
  { id: 'sea_cave', name: '바다 동굴', kind: 'cave', theme: 'sea', tier: 3, x: 112, y: 222, attach: ['route2', 'mouth'], floor: 1, desc: '밀물 때면 잠기는 해식 동굴.' },
  { id: 'underground', name: '땅속 통로', kind: 'cave', theme: 'mine', tier: 5, x: 110, y: 96, attach: ['forge', 'mouth'], floor: 1, desc: '쇳불 도시 광부들이 파 놓은 땅속 길.' },
  // 특별한 섬 · 정원
  { id: 'fullmoon', name: '보름달섬', kind: 'area', tpl: 'island', biome: 'meadow', tier: 8, x: 14, y: 40, attach: ['moon', 'dock'], desc: '보름달 아래서만 피는 꽃이 있는 섬.' },
  { id: 'newmoon', name: '그믐달섬', kind: 'area', tpl: 'island', biome: 'forest', tier: 8, x: 16, y: 86, attach: ['moon', 'dock'], desc: '빛 한 줄기 없는 어둠의 섬.' },
  { id: 'paradise', name: '꽃구름 정원', kind: 'area', tpl: 'garden', biome: 'meadow', tier: 7, x: 196, y: 232, attach: ['bloom', 'dock'], desc: '바다 건너 꽃이 끝없이 피어 있는 비밀 정원.' },
  // 시설
  { id: 'battle', name: '도전의 섬', kind: 'area', tpl: 'battle', biome: 'beach', tier: 9, x: 352, y: 62, attach: ['crown', 'dock'], desc: '강자들이 모여드는 섬. 도전의 탑이 서 있다.' },
  { id: 'tower', name: '도전의 탑', kind: 'room', room: 'tower', tier: 9, x: 354, y: 56, attach: ['battle', 'door'], desc: '끝없이 이어지는 승부의 탑.' },
  { id: 'palpark', name: '추억 공원', kind: 'area', tpl: 'park', biome: 'meadow', tier: 6, x: 320, y: 190, attach: ['route8', 'side'], desc: '먼 곳의 루미들과 다시 만나는 공원.' },
  { id: 'amity', name: '자랑 뒷동산', kind: 'area', tpl: 'park', biome: 'meadow', tier: 6, x: 266, y: 128, attach: ['lumina', 'side'], desc: '파트너 루미와 산책하며 자랑하는 언덕 공원.' },
  { id: 'league', name: '루미 리그', kind: 'room', room: 'league', tier: 9, x: 334, y: 24, attach: ['crown', 'door'], needBadges: 8, desc: '사천왕과 챔피언이 기다리는 전당.' },
];

/** 관장 8명 (+ 사천왕 4 · 챔피언) */
export const GYMS = {
  windvale: { type: '바람', leader: 'sena' },   // 기존
  harbor: { type: '물', name: '파도', badge: 'badge_water', badgeName: '물결 배지', species: ['pongpong', 'mallang', 'chalang'] },
  maple: { type: '풀', name: '단비', badge: 'badge_leaf', badgeName: '새싹 배지', species: ['posil', 'saerok', 'ikkigom'] },
  forge: { type: '땅', name: '무쇠', badge: 'badge_earth', badgeName: '바위 배지', species: ['jagal', 'ikkigom', 'jagal'] },
  ember: { type: '불', name: '화련', badge: 'badge_flame', badgeName: '불꽃 배지', species: ['busit', 'morak', 'busit'] },
  lumina: { type: '빛', name: '샛별', badge: 'badge_light', badgeName: '샛별 배지', species: ['banjjak', 'banjjak', 'astra'] },
  frost: { type: '노말', name: '설아', badge: 'badge_normal', badgeName: '눈송이 배지', species: ['kongkong', 'kongkong', 'ikkigom'] },
  summit: { type: '혼합', name: '천문', badge: 'badge_star', badgeName: '별자리 배지', species: ['astra', 'busit', 'mallang', 'ikkigom'] },
};

/** 비전 기술로만 들어가는 깊은 동굴 (확장분: 기존 맵이 바뀌지 않게 맨 마지막에 생성)
 *  parent 동굴 안 빈 바닥에 내려가는 구멍을 내고, 그 둘레를 장애물로 막음 (smash = 금 간 바위, climb = 깎아지른 바위벽) */
export const DEEP_CAVES = [
  { id: 'sea_cave_deep', name: '바다 동굴 안쪽', parent: 'sea_cave', need: 'smash', theme: 'sea', tier: 4, x: 108, y: 226, desc: '파도가 깎아 놓은 수정 굴. 별가루 결정이 반짝인다.' },
  { id: 'underground_deep', name: '땅속 통로 깊은 곳', parent: 'underground', need: 'smash', theme: 'mine', tier: 6, x: 114, y: 100, desc: '광부들도 들어가 보지 못한 옛 광맥.' },
  { id: 'wayward_deep', name: '헤매는 동굴 바닥', parent: 'wayward_2f', need: 'climb', theme: 'dark', tier: 6, x: 66, y: 118, desc: '절벽 아래 숨은 어둠의 굴. 낯선 루미가 산다.' },
  { id: 'iron_deep', name: '무쇠섬 최심부', parent: 'iron_2f', need: 'smash', theme: 'mine', tier: 8, x: 344, y: 212, desc: '쇳덩이 바위 속 깊은 곳의 보물 광맥.' },
  { id: 'coronet_deep', name: '별마루산 수정 동굴', parent: 'coronet_2f', need: 'climb', theme: 'crystal', tier: 8, x: 186, y: 74, desc: '바위벽 너머, 별빛이 굳어 수정이 된 동굴.' },
  // ── 사이드 스토리: 별마루산 미로 → 시험의 방(루미 마스터) → 별의 요람(전설 스텔라) ──
  { id: 'star_maze', name: '별마루산 미로', parent: 'coronet_3f', need: 'climb', theme: 'crystal', tier: 9, x: 200, y: 74, maze: true, desc: '수정 벽이 길을 감추는 산속의 미로. 끝까지 뚫고 간 사람은 손에 꼽는다.' },
  { id: 'master_hall', name: '시험의 방', parent: 'star_maze', theme: 'crystal', tier: 9, x: 203, y: 71, chamber: true, safe: true, desc: '미로 끝의 고요한 방. 누군가 기다리고 있다.' },
  { id: 'stella_nest', name: '별의 요람', parent: 'master_hall', theme: 'crystal', tier: 9, x: 206, y: 68, chamber: true, safe: true, feature: 'stella', desc: '별빛이 고여 잠든 방. 전설의 루미 스텔라의 보금자리.' },
  // ── 사이드 스토리: 동서남북 네 탑 (입구 → 시련의 층 → 꼭대기) ──
  ...[['n', '북쪽 탑', 'route18', 'ice', 150, 12], ['e', '동쪽 탑', 'route24', 'ruin', 322, 110], ['s', '남쪽 탑', 'route5', 'ruin', 162, 226], ['w', '서쪽 탑', 'route25', 'dark', 22, 110]].flatMap(([d, nm, parent, theme, x, y]) => [
    { id: `spire_${d}`, name: `${nm} · 입구`, parent, outdoor: true, theme, tier: 9, x, y, chamber: true, safe: true, spire: d, desc: `${nm}. 오래전 별빛을 지키려 세운 네 탑 가운데 하나.` },
    { id: `spire_${d}_2f`, name: `${nm} · 시련의 층`, parent: `spire_${d}`, up: true, theme, tier: 9, x, y: y - 3, noOre: true, maze: true, spire: d },
    { id: `spire_${d}_top`, name: `${nm} · 꼭대기`, parent: `spire_${d}_2f`, up: true, theme, tier: 9, x, y: y - 6, chamber: true, safe: true, feature: 'spire_top', spire: d },
  ]),
];
/** 비전 기술로 여는 숨은 지역 (그 지역 맵 안, 들어온 입구에서 몇 칸 안쪽을 막음) */
export const PLACE_GATES = { eterna_forest: 'cut', marsh: 'cut', acuity_lake: 'climb', valor_lake: 'cut' };

/** 깊은 동굴 가운데 '방 하나짜리' (미로가 아니라 가운데 둥근 방) — 맵과 배경 그림이 같은 모양을 쓰도록 여기서 한 번만 정함 */
export const CHAMBERS = new Set(DEEP_CAVES.filter((d) => d.chamber).map((d) => d.id));
export const MAZES = new Set(DEEP_CAVES.filter((d) => d.maze).map((d) => d.id));
