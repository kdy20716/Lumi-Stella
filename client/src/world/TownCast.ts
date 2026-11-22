// 살아있는 마을·도시·이웃집 NPC 캐스트: shared/data/illust.json 의 완성된 한국어 일러스트(shop_*, guide_*, craft_*, cafe_*, prof_*, city_*, extra_*)를 월드에 배치
import type { NpcDef } from '@shared/data';
import type { MapInfo } from '@shared/sim/MapInfo';
import type { MapId } from '@shared/types';
import ILLUST_SPEC from '@shared/data/illust.json';

type IllustEntry = { name: string; role: string; persona?: string; pose?: string; face?: string };
const SPEC = ILLUST_SPEC as Record<string, IllustEntry | undefined>;

const hashStr = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const stripRole = (name: string) =>
  name.replace(/^(상점주인|공방장인|카페마스터|안내원|경관|지배인|셰프|디자이너|게이머|버스커|라이더|농부|잠수사|천문학도|사서|카지노\s*지배인|정비사|학생|거리악사|수도승|기자|감독)\s+/, '').trim();

const TOWN_GUIDE_TIPS: Record<string, string[]> = {
  town: [
    '별빛 마을에 오신 걸 환영해요! 소라네 루미 마트는 아침 6시부터 밤 10시까지 열려 있답니다.',
    '먼저 괭이(80G)·물뿌리개(80G)·곡괭이(100G)를 장만하면 농장 텃밭과 북서쪽 바위터를 바로 가꿀 수 있어요!',
  ],
  windvale: [
    '바람골 도장의 세나 관장은 바람 타입을 써요. 빛 타입이나 튼튼한 바위·땅 루미로 맞서면 유리하답니다!',
    '마을 북쪽 3번 도로로 가면 단풍골, 동쪽 2번 도로로 가면 바닷가 물결항이 나와요.',
  ],
  harbor: [
    '물결항 도장의 파도 관장은 물 타입의 고수예요! 풀 타입 루미를 앞세우면 훨씬 수월하게 이길 수 있어요.',
    '항구 부두 쪽에서 낚싯대를 던지면 희귀한 물 타입 루미가 걸리기도 한답니다.',
  ],
  maple: [
    '단풍골 도장의 단비 관장은 풀 타입을 다뤄요. 불꽃 타입이나 바람 타입 기술이 아주 잘 먹혀요!',
    '도장 배지를 얻으면 비전 기술 「바위 부수기」로 숨겨진 동굴 안쪽까지 탐험할 수 있어요.',
  ],
  bloom: [
    '꽃구름 마을은 향기로운 꽃과 약초로 유명해요. 바닷가 선착장에서 배를 타면 비밀 정원으로도 갈 수 있답니다!',
    '마을 텃밭에 씨앗을 심어 두고 주민과 친해지면 매일 물을 대신 줘요.',
  ],
  forge: [
    '쇳불 도시 도장의 무쇠 관장은 땅 타입의 베테랑이에요. 물이나 풀 타입 루미로 공략해 보세요!',
    '이 주변 바위와 땅속 통로에서는 철 광석이 아주 잘 나와요. 곡괭이를 꼭 챙기세요!',
  ],
  mist: [
    '안개 마을 옆 늪지 대초원에는 평소 보기 힘든 야생 루미가 많아요. 루미볼을 넉넉히 준비하고 들어가세요!',
    '마을 사람과 이야기를 나누면 모험가용 고속 자전거 소식도 들을 수 있답니다.',
  ],
  ember: [
    '잿빛 마을 도장의 화련 관장은 뜨거운 불꽃 타입! 물이나 땅 타입 루미를 데려가면 승률이 크게 올라요.',
    '북쪽 불꽃산 동굴은 험하지만 귀한 광석과 강한 불꽃 루미가 숨어 있답니다.',
  ],
  pinecone: [
    '솔방울 마을 서쪽 안개숲은 길이 복잡하지만 숨겨진 보물 상자와 버섯이 아주 많아요.',
    '별마루산으로 오르기 전에 마트에서 회복약과 고급 볼을 든든히 챙겨 두세요!',
  ],
  lumina: [
    '빛누리 시티 도장의 샛별 관장은 빛 타입의 스타! 땅 타입 기술이 빛 타입에 아주 강해요.',
    '서쪽 14번 도로에는 고속 자전거 도로가 펼쳐져 있어요. B키로 자전거를 타고 시원하게 달려 보세요!',
  ],
  summit: [
    '별마루 도장의 천문 관장은 여러 속성을 섞어 쓰는 강자예요. 파티 속성을 골고루 맞추는 게 핵심이에요!',
    '북쪽 별마루산 동굴 꼭대기에는 전설 속 별의 제단이 기다리고 있답니다.',
  ],
  shell: [
    '조개 마을 선착장에서 배를 타면 옛 광산이 있는 무쇠섬으로 건너갈 수 있어요.',
    '해변 모래밭과 바위 틈에서 별가루 결정이 가끔 발견된다는 소문이 있어요!',
  ],
  sand: [
    '모래바람 마을은 사막 한가운데 오아시스 교역지예요. 도핑약과 회복약을 넉넉히 챙겨 두면 든든해요.',
    '서쪽 신기루길을 따라가면 대도시 빛누리 시티로 바로 이어집니다!',
  ],
  canyon: [
    '바위골은 사방이 절벽으로 둘러싸인 모험가의 관문이에요. 북쪽 눈발 고개를 넘으면 서리 마을이 나와요.',
    '협곡 곳곳의 광맥에서 철 광석과 별가루 결정을 캐 강철·별빛 도구를 만들어 보세요!',
  ],
  moon: [
    '달맞이 마을 항구에서는 보름달섬과 그믐달섬으로 떠나는 정기선이 출항해요.',
    '밤이 되면 달빛 아래 희귀한 빛 타입 루미가 모습을 드러낸답니다.',
  ],
  frost: [
    '서리 마을 도장의 설아 관장은 노말 타입의 달인이에요! 빙판 위에서 눈덩이를 부수며 길을 여는 게 관건이에요.',
    '추운 지방이라 체력이 금방 빠질 수 있어요. 루미 센터의 은설 간호사님께 언제든 들르세요.',
  ],
  cape: [
    '등대곶은 루미 리그가 열리는 왕관 시티로 가는 마지막 항구예요!',
    '배지 여덟 개를 모두 모았다면 부두 끝에서 정기선을 타고 꿈의 무대로 출항하세요!',
  ],
  crown: [
    '왕관 시티에 오신 걸 축하해요! 북쪽 루미 리그 전당에서 사천왕 현우·미란·강혁·세라와 챔피언 하람이 기다리고 있어요.',
    '남쪽 부두에서는 강자들이 모이는 도전의 섬으로 가는 배도 탈 수 있답니다!',
  ],
};

/** 마을별 마트 주인 (in_shop_w 동적 교체용) */
export function townShopKeeper(townId: string): { id: string; name: string; title: string; sprite: string; portrait: string; greeting: string } {
  const id = `shop_${townId}`;
  const sp = SPEC[id];
  if (sp) {
    const clean = stripRole(sp.name);
    return {
      id,
      name: clean,
      title: sp.role,
      sprite: townId === 'windvale' ? 'villager' : (['harbor', 'shell', 'cape'].includes(townId) ? 'fisher' : ['forge', 'canyon'].includes(townId) ? 'miner' : ['lumina', 'crown'].includes(townId) ? 'gentleman' : 'villager'),
      portrait: id,
      greeting: `어서 오세요! ${sp.role} ${clean}입니다. 도구·씨앗·루미볼 구매는 물론, 수확한 작물과 광석도 바로 사들여요!`,
    };
  }
  return {
    id: 'shop_windvale',
    name: '구름',
    title: '루미 마트 주인',
    sprite: 'villager',
    portrait: 'shop_windvale',
    greeting: '루미 마트에 어서 오세요! 먼 길 떠나기 전에 필요한 물건을 챙겨 가세요.',
  };
}

/** 마을별 카페 바리스타 (야외 카페 노점용) */
export function townCafeKeeper(townId: string): { sprite: string; portrait: string; name: string; greeting: string } {
  const id = `cafe_${townId}`;
  const sp = SPEC[id];
  if (sp) {
    const clean = stripRole(sp.name);
    return {
      sprite: 'luna',
      portrait: id,
      name: clean,
      greeting: `향긋한 커피 한 잔 어떠세요? ${sp.role} ${clean}입니다. 모험 이야기를 들려주세요!`,
    };
  }
  return { sprite: 'luna', portrait: 'luna', name: '루나', greeting: '따뜻한 커피와 갓 구운 빵이 준비되어 있어요!' };
}

/** 이웃집 16인 주민 목록 (in_house_a/b/c 실내 배치 + 문 앞 이름표) */
const EXTRA_RESIDENTS: { id: string; sprite: string; color: string; lines: string[][] }[] = [
  { id: 'extra_grandma', sprite: 'lady', color: '#b87a5a', lines: [['어이구, 젊은 트레이너가 놀러 왔구나! 따뜻한 보리차 한 잔 마시고 가렴.', '예전엔 이 마을 어른들도 다 밭을 일구며 루미를 키웠단다.']] },
  { id: 'extra_toddler', sprite: 'juni', color: '#e87a4a', lines: [['우와! 형아/누나 루미 진짜 멋지다!! 나도 크면 체육관 관장 될 거야!', '엄마가 풀숲에는 혼자 가지 말랬어. 대신 집에서 그림 그려!']] },
  { id: 'extra_farmer_m', sprite: 'woodcutter', color: '#5f8a3e', lines: [['허허, 농사 잘되고 있나? 밭에 물을 꼭 줘야 다음 날 쑥쑥 자란다네!', '비 오는 날엔 물을 안 줘도 되니 그때 채석장이나 동굴로 채광 다녀오게.']] },
  { id: 'extra_farmer_f', sprite: 'hana', color: '#d8705a', lines: [['어서 와요! 수확한 작물은 농장 출하 상자에 넣거나 마트에 바로 팔 수 있어요.', '루미풀과 불꽃고추는 다시 자라는 작물이라 한 번 심어 두면 아주 효자랍니다!']] },
  { id: 'extra_miner_chief', sprite: 'miner', color: '#7a6450', lines: [['오, 곡괭이질 좀 해 봤나? 구리 광석 다섯 개만 모으면 작업대에서 구리 도구를 만들 수 있지.', '구리 도끼를 만들면 농장에 쓰러진 커다란 통나무도 베어 낼 수 있다네!']] },
  { id: 'extra_diver', sprite: 'swimmer', color: '#2f8fc0', lines: [['바닷속 산호 동굴을 잠수하다 보면 반짝이는 별가루 결정이 가끔 보여요!', '물 타입 루미는 불꽃과 땅 타입에 강하니 파티에 한 마리 꼭 넣어 두세요!']] },
  { id: 'extra_astronomer', sprite: 'researcher', color: '#4a5a9a', lines: [['별마루산 꼭대기에서는 밤마다 유성이 쏟아지는 것처럼 보인대요.', '전설 속 별빛의 씨앗이 정말 하늘에서 떨어졌을지도 모르겠네요.']] },
  { id: 'extra_librarian', sprite: 'lady', color: '#7a5aa8', lines: [['오래된 고서에 따르면 루미나 지방의 세 호수에는 각각 오래된 수호 루미가 깃들어 있대요.', '휴대폰의 모험 수첩을 수시로 확인하면 지금 어디로 가야 할지 금방 알 수 있답니다.']] },
  { id: 'extra_innkeeper', sprite: 'luna', color: '#c87050', lines: [['밤이 되면 각 마을의 별빛 카지노가 문을 열어요! 골드를 걸고 슬롯·주사위·하이로우로 운을 시험해 보세요.', '루미 회복은 언제든 마을 루미 센터에서 무료로 받을 수 있답니다!']] },
  { id: 'extra_mechanic', sprite: 'minsu', color: '#8a6842', lines: [['고속 자전거 체인은 내가 기름칠해 뒀지! B키로 언제든 타고 내릴 수 있어.', '도구 내구도가 다 닳으면 집 작업대에서 나무랑 광석으로 더 튼튼하게 새로 만들어 봐!']] },
  { id: 'extra_student_m', sprite: 'juni', color: '#3a7ab8', lines: [['상성 공부 중이에요! 풀은 물·땅에 2배, 물은 불·땅에 2배, 불은 풀에 2배예요!', '그리고 바람은 풀에 2배, 빛은 바람에 2배, 땅은 불·빛에 2배래요!']] },
  { id: 'extra_student_f', sprite: 'lass', color: '#d85a8a', lines: [['휴대폰 지도에서 가 본 마을을 누르면 별바람 택시로 단숨에 날아갈 수 있다는 거 알아요?', '동굴에서 길을 잃었을 땐 지도 앱의 동굴 탈출 버튼을 눌러 보세요!']] },
  { id: 'extra_musician', sprite: 'teo', color: '#d88a3a', lines: [['♪ 따스한 바람 따라 흐르는 선율~ 모험가의 발걸음은 노래 같지.', '언젠가 네 개의 탑에 울려 퍼진다는 전설의 오카리나 소리를 꼭 듣고 싶어.']] },
  { id: 'extra_monk', sprite: 'park', color: '#5a7a6a', lines: [['마음이 급할수록 잠시 멈춰 숨을 고르는 법이라네.', '파트너 루미와 교감하며 천천히 나아가면 어떤 시련도 넘을 수 있을 걸세.']] },
  { id: 'extra_reporter', sprite: 'lass', color: '#c84a5a', lines: [['특종 취재 중이에요! 요즘 별빛 마을 출신 신예 트레이너가 대단하다는 소문이 자자하던데, 혹시 당신?!', '도장 배지를 모을 때마다 꼭 다시 인터뷰해 주세요!']] },
  { id: 'extra_cameraman', sprite: 'hiker', color: '#4a687a', lines: [['후우, 방송 장비가 꽤 무겁네요! 빛누리 방송국 특집 다큐멘터리를 찍고 있어요.', '멋진 루미 배틀 장면이 나오면 제가 놓치지 않고 담아 드리죠!']] },
];

export function houseResidentFor(inst: string, ownerHint = ''): NpcDef {
  const idx = hashStr(inst || ownerHint || 'home') % EXTRA_RESIDENTS.length;
  const pick = EXTRA_RESIDENTS[idx];
  const sp = SPEC[pick.id];
  const name = ownerHint || (sp ? stripRole(sp.name) : '마을 주민');
  const title = sp?.role ?? '마을 이웃';
  return {
    id: `house_${pick.id}_${idx}`,
    name,
    title,
    sprite: pick.sprite,
    portrait: pick.id,
    speed: 24,
    color: pick.color,
    schedule: [{ time: 600, map: 'in_house_a', to: 'wp_host', idle: 'stand', face: 'down' }],
    dialogue: {
      first: pick.lines[0],
      morning: pick.lines[0],
      afternoon: pick.lines[0],
      evening: [pick.lines[0][0], '해가 저물어 가네요. 오늘 모험도 수고 많았어요!'],
      rain: ['비 오는 날엔 따뜻한 집 안이 최고죠. 천천히 쉬다 가세요!'],
      random: pick.lines[0],
    },
  };
}

export function houseOwnerName(townId: string, buildingId: number, fallbackKey?: string): string {
  const STATIC: Record<string, string> = { mayor: '오 이장', luna: '루나', teo: '태오', sora: '소라', mio: '미오', villager: '구름', leader: '세나' };
  if (fallbackKey && STATIC[fallbackKey]) return STATIC[fallbackKey];
  const idx = hashStr(`${townId}:${buildingId}`) % EXTRA_RESIDENTS.length;
  const sp = SPEC[EXTRA_RESIDENTS[idx].id];
  return sp ? stripRole(sp.name) : '이웃';
}

/** 지역별 전문 박사 6인 */
const REGIONAL_PROFS: Record<string, { id: string; sprite: string; color: string; lines: string[] }> = {
  summit: {
    id: 'prof_astro', sprite: 'professor', color: '#4a5a9a',
    lines: ['나는 별마루 천문대의 천성 박사라네. 별마루산 정상에서 관측되는 별빛 파장이 요즘 유난히 강해졌어.', '하늘의 별빛과 땅의 씨앗은 하나로 이어져 있다네. 꼭 정상 별의 제단을 직접 보게나.'],
  },
  harbor: {
    id: 'prof_ocean', sprite: 'professor', color: '#2f7ab8',
    lines: ['반갑네! 물결항 해양 생태 소장 해수 박사일세. 바닷바람이 부는 날엔 낚시로 희귀 물 루미를 만날 확률이 높아진다네.', '물 타입 파트너와 함께 농사를 지으면 물뿌리개 힘도 들지 않으니 일석이조지!'],
  },
  ember: {
    id: 'prof_geol', sprite: 'miner', color: '#c8502e',
    lines: ['허허, 화산 지질 연구원 석철 박사라네. 이 일대 암석은 마그마 열기를 머금어 강철·별가루 광석이 풍부하지.', '불꽃 타입 파트너를 데리고 채광하면 광석이 하나 더 떨어지니 꼭 활용해 보게!'],
  },
  bloom: {
    id: 'prof_botany', sprite: 'professor', color: '#4f9a45',
    lines: ['어서 오세요, 꽃구름 식물원 원장 초록 박사예요. 이곳의 비옥한 토양 덕분에 마을 텃밭 작물이 아주 건강하게 자라죠.', '수확한 루미풀·불꽃고추·단단콩을 작업대에서 조합하면 최고의 모험 약품이 된답니다!'],
  },
  frost: {
    id: 'prof_archae', sprite: 'researcher', color: '#5a8ab8',
    lines: ['고대유적 발굴단장 고훈 박사일세. 설원 아래 묻힌 석판에 동서남북 네 개의 탑과 오카리나 전설이 적혀 있더군.', '루미 리그를 제패한 뒤에도 이 지방에는 아직 풀리지 않은 거대한 비밀이 남아 있다네.'],
  },
  lumina: {
    id: 'prof_tech', sprite: 'researcher', color: '#3aa8c0',
    lines: ['안녕! 빛누리 디지털 루미 연구소장 규현 박사야. 휴대폰의 PC 보관함과 별바람 택시 네트워크는 우리 연구소 작품이지!', '루미 센터 PC 단말기에서도 보관함을 열 수 있으니 잡은 루미들을 마음껏 관리해 봐!'],
  },
};

/** 대도시 12인 시민 배치 (빛누리 시티 6 · 왕관 시티 4 · 쇳불 도시 2) */
const CITY_CAST: Record<string, { id: string; sprite: string; color: string; lines: string[] }[]> = {
  lumina: [
    { id: 'city_officer', sprite: 'gentleman', color: '#2f5a9a', lines: ['빛누리 시티 치안 순찰 중입니다! 요즘 수상한 검은 제복 무리가 시내를 어슬렁거려 경계를 강화하고 있어요.', '어린 트레이너도 안전에 유의하며 모험하세요!'] },
    { id: 'city_salary_m', sprite: 'gentleman', color: '#5a6a7a', lines: ['휴우, 퇴근길에 파트너 루미랑 산책하는 게 유일한 낙이에요.', '별빛 마을 출신이라고요? 거기 루미풀이 그렇게 좋다면서요!'] },
    { id: 'city_salary_f', sprite: 'lady', color: '#7a5aa8', lines: ['빛누리 IT 기획자 수진이에요. 요즘 트레이너들 사이에서 휴대폰 모험 수첩 앱이 대인기라던데요!', '배지 모으는 길도 차근차근 계획 세우면 훨씬 수월해요.'] },
    { id: 'city_stylist', sprite: 'lady', color: '#d85a9a', lines: ['어머, 센스 있는 트레이너네! 내 집 2층 옷장에서 언제든 스타일을 바꿀 수 있는 거 알지?', '멋진 모습으로 빛누리 도장에 도전해 봐!'] },
    { id: 'city_clerk', sprite: 'lass', color: '#3aa8a8', lines: ['빛누리 백화점 인포메이션 소희입니다! 대도시답게 루미 마트에도 고급 볼과 도핑약이 가득해요.', '필요한 물건이 있으면 언제든 마트에 들러 주세요!'] },
    { id: 'city_gamer', sprite: 'juni', color: '#e88a2e', lines: ['오락실 챔피언 찬영이야! 배틀도 게임처럼 상성과 선공 싸움이 핵심이지!', '속도가 빠른 루미로 먼저 기선을 제압해 봐!'] },
  ],
  crown: [
    { id: 'city_ceo', sprite: 'gentleman', color: '#8a682e', lines: ['왕관 시티에 당도한 젊은 도전자여, 환영하네. 루미 리그에 서는 것만으로도 이미 대단한 성취지.', '최후의 순간까지 자신의 루미를 믿게나.'] },
    { id: 'city_concierge', sprite: 'gentleman', color: '#6a4a8a', lines: ['왕관 시티 특급 호텔 지배인 상철입니다. 리그 도전을 앞두고 루미 센터에서 만반의 회복을 마치셨나요?', '승리의 영광이 함께하길 기원합니다.'] },
    { id: 'city_chef', sprite: 'minsu', color: '#c85a3a', lines: ['하하! 루미나 최고급 셰프 현성일세! 질 좋은 파스닙과 호박, 무지개송어가 있으면 천하일미가 따로 없지!', '농장에서 키운 신선한 작물이야말로 최고의 보약이야!'] },
    { id: 'city_busker', sprite: 'teo', color: '#d87a4a', lines: ['♪ 챔피언을 꿈꾸는 별빛의 노래~ 왕관 시티 광장에 울려 퍼지네!', '네가 리그를 제패하면 그 이야기를 새 노래로 부를게!'] },
  ],
  forge: [
    { id: 'city_security', sprite: 'miner', color: '#4a5a6a', lines: ['쇳불 도시 보안대장 강호다. 광산 갱도는 깊고 어두우니 회복약과 루미볼을 단단히 챙겨 들어가라!'] },
    { id: 'city_courier', sprite: 'ace_m', color: '#d86a2e', lines: ['특송 라이더 기범이야! 쇳불 도시에서 캔 철 광석은 루미나 전역의 볼 공방으로 배달되지!', '강철 도구를 만들면 채광도 벌목도 두 배는 빨라져!'] },
  ],
};

/** 겹치지 않는 열린 워킹 스팟 탐색 */
function findOpenCell(info: MapInfo, seedX: number, seedY: number, used: Set<string>): [number, number] | null {
  for (let r = 0; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = seedX + dx, y = seedY + dy;
        const k = `${x},${y}`;
        if (used.has(k) || !info.inBounds(x, y)) continue;
        if (x < 2 || y < 3 || x >= info.width - 2 || y >= info.height - 2) continue;
        if (info.isBlocked(x, y) || info.terrainAt(x, y) === '2') continue;
        if (info.warps.some((w) => Math.abs((w.x + w.w / 2) / 16 - x) < 2.5 && Math.abs((w.y + w.h / 2) / 16 - y) < 2.5)) continue;
        used.add(k);
        return [x, y];
      }
    }
  }
  return null;
}

export interface ExtraNpcSpawn {
  def: NpcDef;
  cell: [number, number];
  action?: 'craft' | 'shop';
}

/** 현재 맵(마을/도시/이웃집)에 동적으로 배치할 살아있는 NPC 목록 */
export function extraNpcsForMap(
  mapId: MapId,
  inst: string,
  info: MapInfo,
  manifestChars: Record<string, unknown>,
  occupiedCells: Set<string>,
  houseOwnerHint = '',
): ExtraNpcSpawn[] {
  const out: ExtraNpcSpawn[] = [];
  const validSprite = (s: string) => (manifestChars[s] ? s : 'villager');

  // 1. 이웃집(in_house_a/b/c): 빈 방이 없도록 16종의 주민을 집마다 배치
  if (mapId === 'in_house_a' || mapId === 'in_house_b' || mapId === 'in_house_c') {
    const sp = info.spawns.get('wp_host') ?? info.spawns.get('entry');
    if (sp) {
      const def = houseResidentFor(inst, houseOwnerHint);
      def.sprite = validSprite(def.sprite);
      def.schedule = [{ time: 600, map: mapId, to: 'wp_host', idle: 'stand', face: 'down' }];
      out.push({ def, cell: [Math.floor(sp.x / 16), Math.floor(sp.y / 16)] });
    }
    return out;
  }

  // 1.5. 밤 전용 별빛 카지노(in_casino): 카지노 지배인 순자 + 밤 손님 2명
  if (mapId === 'in_casino') {
    const clerk = info.spawns.get('wp_clerk');
    if (clerk) {
      const lines = ['별빛 카지노에 오신 것을 환영해요! 오늘 밤 행운의 여신이 함께하시길!', '슬롯머신, 루미 주사위, 하이로우 카드 중 원하는 테이블에서 승부해 보세요!'];
      out.push({
        cell: [Math.floor(clerk.x / 16), Math.floor(clerk.y / 16)],
        def: {
          id: 'casino_dealer',
          name: '순자',
          title: '별빛 카지노 지배인',
          sprite: validSprite('luna'),
          portrait: 'extra_innkeeper',
          speed: 24,
          color: '#d87090',
          schedule: [{ time: 600, map: mapId, to: 'wp_clerk', idle: 'stand', face: 'down' }],
          dialogue: { first: lines, morning: lines, afternoon: lines, evening: lines, rain: lines, random: lines },
        },
      });
    }
    const g1 = info.spawns.get('wp_guest1');
    if (g1) {
      const l1 = ['오예! 슬롯머신에서 별 3개 뜨면 무려 10배 잭팟이라던데!', '적당히 베팅하면서 대박 노려 보자고~'];
      out.push({
        cell: [Math.floor(g1.x / 16), Math.floor(g1.y / 16)],
        def: {
          id: 'casino_patron_1',
          name: '찬영',
          title: '야간 겜블러',
          sprite: validSprite('juni'),
          portrait: 'city_gamer',
          speed: 24,
          color: '#e8a03a',
          schedule: [{ time: 600, map: mapId, to: 'wp_guest1', idle: 'stand', face: 'up' }],
          dialogue: { first: l1, morning: l1, afternoon: l1, evening: l1, rain: l1, random: l1 },
        },
      });
    }
    const g2 = info.spawns.get('wp_guest2');
    if (g2) {
      const l2 = ['주사위 행운의 7과 하이로우 SAME은 배당이 각각 5배, 8배로 아주 짭짤합니다.', '골드 여유가 있을 때 한 번씩 도전해 보세요!'];
      out.push({
        cell: [Math.floor(g2.x / 16), Math.floor(g2.y / 16)],
        def: {
          id: 'casino_patron_2',
          name: '상철',
          title: '단골 신사',
          sprite: validSprite('gentleman'),
          portrait: 'city_concierge',
          speed: 24,
          color: '#7a5aa8',
          schedule: [{ time: 600, map: mapId, to: 'wp_guest2', idle: 'stand', face: 'up' }],
          dialogue: { first: l2, morning: l2, afternoon: l2, evening: l2, rain: l2, random: l2 },
        },
      });
    }
    return out;
  }

  // 2. 마을 / 도시 바깥 맵: 안내원(guide_*) + 공방장인(craft_*) + 지역 박사(prof_*) + 대도시 시민(city_*)
  const guideSpec = SPEC[`guide_${mapId}`];
  const anchor = info.spawns.get('wp_plaza') ?? info.spawns.get('wp_board') ?? info.spawns.get('wp_center') ?? info.spawns.get('player');
  if (guideSpec && anchor) {
    const ax = Math.floor(anchor.x / 16), ay = Math.floor(anchor.y / 16);
    const guideAnchor = info.spawns.get('wp_board') ?? info.spawns.get('wp_center') ?? anchor;
    const gc = findOpenCell(info, Math.floor(guideAnchor.x / 16) + 2, Math.floor(guideAnchor.y / 16) + 1, occupiedCells);
    if (gc) {
      const tips = TOWN_GUIDE_TIPS[mapId] ?? [`${guideSpec.role}입니다! 이 마을을 천천히 둘러보세요.`];
      out.push({
        cell: gc,
        def: {
          id: `guide_${mapId}`,
          name: stripRole(guideSpec.name),
          title: guideSpec.role,
          sprite: validSprite(mapId === 'lumina' || mapId === 'crown' ? 'lady' : 'lass'),
          portrait: `guide_${mapId}`,
          speed: 26,
          color: '#3f8fb5',
          schedule: [{ time: 600, map: mapId, to: '__dyn_guide', idle: 'stand', face: 'down' }],
          dialogue: {
            first: [`안녕하세요! ${guideSpec.role} ${stripRole(guideSpec.name)}예요.`, ...tips],
            morning: tips, afternoon: tips, evening: tips, rain: tips, random: tips,
          },
        },
      });
    }

    // 마을별 공방장인(craft_*) — 별빛 마을은 이미 민수(in_smithy)가 있으므로 제외, 나머지 17개 마을에 배치해 원정 중에도 볼·회복약·강화도구 제작 가능!
    const craftSpec = mapId !== 'town' ? SPEC[`craft_${mapId}`] : undefined;
    if (craftSpec) {
      const shopAnchor = info.spawns.get('wp_shop') ?? anchor;
      const cc = findOpenCell(info, Math.floor(shopAnchor.x / 16) - 2, Math.floor(shopAnchor.y / 16) + 2, occupiedCells);
      if (cc) {
        const cname = stripRole(craftSpec.name);
        out.push({
          cell: cc,
          action: 'craft',
          def: {
            id: `craft_${mapId}`,
            name: cname,
            title: craftSpec.role,
            sprite: validSprite('minsu'),
            portrait: `craft_${mapId}`,
            speed: 26,
            color: '#b85a3a',
            schedule: [{ time: 600, map: mapId, to: '__dyn_craft', idle: 'stand', face: 'down' }],
            dialogue: {
              first: [`나는 ${craftSpec.role} ${cname}! 먼 길 떠난 트레이너가 쓸 수 있게 휴대용 작업대를 펼쳐 뒀지.`, '광석과 약초만 있으면 루미볼·회복약·구리/강철 도구까지 바로 만들 수 있다네!'],
              morning: ['아침부터 망치질하기 딱 좋은 날씨군! 작업대 쓸 일 있나?'],
              afternoon: ['직접 만든 볼과 도구는 손에 착 감기는 맛이 다르다네.'],
              evening: ['오늘 채광은 수확이 좋았나? 광석이 모이면 도구를 업그레이드해 보게!'],
              rain: ['비 오는 날엔 대장간 불빛이 더 따뜻하지.'],
              random: ['민수 형님한테 배운 제작법도 내 작업대에서 그대로 만들 수 있다네!'],
            },
          },
        });
      }
    }

    // 지역 박사(prof_*) 6명
    const prof = REGIONAL_PROFS[mapId];
    if (prof && SPEC[prof.id]) {
      const pc = findOpenCell(info, ax + 4, ay - 2, occupiedCells);
      if (pc) {
        out.push({
          cell: pc,
          def: {
            id: prof.id,
            name: SPEC[prof.id]!.name,
            title: SPEC[prof.id]!.role,
            sprite: validSprite(prof.sprite),
            portrait: prof.id,
            speed: 24,
            color: prof.color,
            schedule: [{ time: 600, map: mapId, to: '__dyn_prof', idle: 'wander', radius: 1 }],
            dialogue: {
              first: prof.lines, morning: prof.lines, afternoon: prof.lines, evening: prof.lines, rain: prof.lines, random: prof.lines,
            },
          },
        });
      }
    }

    // 대도시 12명 시민(city_*)
    const citizens = CITY_CAST[mapId] ?? [];
    citizens.forEach((ct, i) => {
      const sp = SPEC[ct.id];
      if (!sp) return;
      const ox = ((i % 3) - 1) * 7 + (i % 2 ? 3 : -3);
      const oy = (Math.floor(i / 3) - 1) * 6 + 2;
      const cell = findOpenCell(info, ax + ox, ay + oy, occupiedCells);
      if (!cell) return;
      out.push({
        cell,
        def: {
          id: ct.id,
          name: stripRole(sp.name),
          title: sp.role,
          sprite: validSprite(ct.sprite),
          portrait: ct.id,
          speed: 30,
          color: ct.color,
          schedule: [{ time: 600, map: mapId, to: `__dyn_city_${i}`, idle: i % 2 === 0 ? 'wander' : 'stand', radius: 2, face: 'down' }],
          dialogue: {
            first: ct.lines, morning: ct.lines, afternoon: ct.lines, evening: ct.lines, rain: ct.lines, random: ct.lines,
          },
        },
      });
    });
  }

  return out;
}
