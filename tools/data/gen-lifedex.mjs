#!/usr/bin/env node
// 생활 도감 90종 (농사 30 · 채광 30 · 낚시 30) + 17개 마을 특산물 + 요리/특수볼 레시피 데이터 생성기
//   실행: node tools/data/gen-lifedex.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const ROOT = join(dirname(SELF), '../..');
const DATA = join(ROOT, 'shared/data');

// ── 1. 새로 추가되는 작물 23종 (마을 특산 16 + 비경 7 → 총 30종) ─────────
// 모든 작물은 본고장 마을 텃밭에서는 사계절 재배 가능하며, 별빛 농장에서도 봄 기본 호환 + 제철 보너스를 가짐
export const NEW_CROPS = [
  // [id, name, townOrPlace, placeName, kind, seasons, growthDays, regrowDays, qty, seedSell, cropSell, palette, shape, desc]
  ['wind_wheat', '바람밀', 'windvale', '바람골 마을', 'local', ['spring', 'summer', 'fall'], [1, 1, 1, 1], 0, [2, 3], 15, 48, ['#e8c864', '#fff0a8', '#b88e28'], 'grain', '산들바람을 맞으며 자라는 고소한 황금빛 밀. 주먹밥과 도시락의 기본 재료.'],
  ['salt_cabbage', '소금꽃 배추', 'harbor', '물결항', 'local', ['spring', 'fall', 'winter'], [1, 1, 2, 1], 0, [1, 2], 25, 85, ['#7ad0a8', '#dcfff0', '#3f8a6e'], 'head', '바닷바람의 미네랄을 머금어 잎끝에 하얀 소금꽃이 맺힌 아삭한 배추.'],
  ['maple_sweet', '단풍 고구마', 'maple', '단풍골', 'local', ['spring', 'summer', 'fall'], [1, 1, 2, 1], 0, [2, 3], 25, 72, ['#c84a58', '#f6b878', '#7e2432'], 'root', '단풍잎처럼 붉은 껍질 속에 꿀처럼 달콤한 노란 속살이 꽉 찬 고구마.'],
  ['cloud_cotton', '구름 목화', 'bloom', '꽃구름 마을', 'local', ['spring', 'summer', 'fall'], [1, 2, 2, 1], 3, [1, 2], 30, 95, ['#f4f6ff', '#ffffff', '#b8c4dc'], 'puff', '꽃구름 마을 들판에서 뭉게구름처럼 폭신하게 피어나는 하얀 목화솜.'],
  ['iron_potato', '무쇠 감자', 'forge', '쇳불 도시', 'local', ['spring', 'summer', 'fall'], [1, 1, 2, 2], 0, [2, 3], 30, 88, ['#9a7e62', '#d8c2a4', '#5c4632'], 'root', '광산 지대의 미네랄 토양에서 단단하고 묵직하게 여문 영양 만점 감자.'],
  ['mist_shroom', '안개 버섯', 'mist', '안개 마을', 'local', ['spring', 'summer', 'fall', 'winter'], [1, 1, 1, 2], 2, [1, 2], 35, 105, ['#8a7ec8', '#d4ccff', '#4e4288'], 'mushroom', '습한 안개를 먹고 은은한 보랏빛 포자를 피우는 향긋한 버섯.'],
  ['spa_ginger', '온천 생강', 'ember', '잿빛 마을', 'local', ['spring', 'summer', 'fall', 'winter'], [1, 1, 2, 2], 0, [1, 2], 35, 115, ['#e09a48', '#ffd89a', '#9c5c1c'], 'root', '화산 온천수의 지열을 품고 자라 한 입만 먹어도 몸이 데워지는 생강.'],
  ['pine_carrot', '솔향 당근', 'pinecone', '솔방울 마을', 'local', ['spring', 'summer', 'fall'], [1, 1, 2, 1], 0, [1, 2], 30, 98, ['#ee6c32', '#ffae78', '#a83e14'], 'root', '울창한 솔숲의 상쾌한 향기가 배어 있는 아삭하고 달콤한 당근.'],
  ['glow_radish', '빛무', 'lumina', '빛누리 시티', 'local', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 1], 0, [1, 2], 45, 145, ['#7ee8ff', '#e8ffff', '#2ea0c8'], 'root', '빛누리 시티 온실 화단에서 개량되어 밤에도 은은한 청록빛을 내는 무.'],
  ['star_flower', '별꽃', 'summit', '별마루 마을', 'local', ['spring', 'summer', 'fall'], [1, 2, 2, 2], 3, [1, 2], 55, 175, ['#ffd84a', '#fffbe0', '#b88618'], 'flower', '별마루 고원의 맑은 밤하늘 아래 다섯 갈래 별 모양으로 피어나는 약초꽃.'],
  ['sea_melon', '바다 멜론', 'shell', '조개 마을', 'local', ['spring', 'summer'], [1, 2, 2, 2], 0, [1, 1], 50, 210, ['#48b8d8', '#b8f4ff', '#1e7494'], 'melon', '푸른 파도 무늬 껍질 속에 시원하고 달콤한 과즙이 가득한 해변 멜론.'],
  ['cactus_fruit', '선인장 열매', 'sand', '모래바람 마을', 'local', ['spring', 'summer', 'fall'], [1, 2, 2, 1], 3, [1, 2], 45, 150, ['#e84a7a', '#ff9ec0', '#981e48'], 'berry', '뜨거운 사막 태양 아래에서도 수분을 가득 머금고 열리는 선홍빛 열매.'],
  ['cliff_sorghum', '바위 수수', 'canyon', '바위골', 'local', ['spring', 'summer', 'fall'], [1, 1, 2, 2], 0, [2, 3], 40, 110, ['#b85238', '#e89878', '#742818'], 'grain', '척박한 협곡 바람을 이겨내고 붉은 이삭을 틔우는 차지고 고소한 수수.'],
  ['moon_primrose', '달맞이꽃', 'moon', '달맞이 마을', 'local', ['spring', 'summer', 'fall'], [1, 2, 2, 2], 3, [1, 2], 55, 180, ['#c898ff', '#f4e6ff', '#7448b8'], 'flower', '달빛이 비치면 보랏빛 꽃잎이 활짝 열리는 신비로운 해안 야생화.'],
  ['snow_turnip', '설원 순무', 'frost', '서리 마을', 'local', ['spring', 'fall', 'winter'], [1, 2, 2, 1], 0, [1, 2], 50, 165, ['#d8ecff', '#ffffff', '#6ea4d8'], 'root', '얼어붙은 눈밭 아래에서 추위를 견디며 당도를 끌어올린 새하얀 순무.'],
  ['golden_wheat', '황금 밀', 'crown', '왕관 시티', 'local', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 2], 0, [2, 3], 70, 230, ['#ffbe2e', '#fff6b0', '#b87410'], 'grain', '루미 리그 챔피언의 식탁에 오르는 최고급 황금빛 밀 이삭.'],
  // 비경 7종 (씨앗은 해당 비경 채집으로 획득)
  ['dawn_lotus', '새벽 연꽃', 'dawn_lake', '새벽호수', 'rare', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 2], 0, [1, 1], 80, 280, ['#ff9ec8', '#fff0f8', '#c85888'], 'flower', '새벽호수의 물안개 기운을 머금고 피어나는 영롱한 분홍 연꽃.'],
  ['sunset_berry', '노을 딸기', 'valor_lake', '노을호수', 'rare', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 1], 3, [1, 2], 80, 240, ['#ff6438', '#ffd088', '#b82e14'], 'berry', '노을호수의 붉은 저녁놀을 닮아 새콤달콤한 향이 진동하는 희귀 딸기.'],
  ['moon_mint', '달빛 박하', 'acuity_lake', '달빛호수', 'rare', ['spring', 'summer', 'fall', 'winter'], [1, 1, 2, 2], 2, [1, 2], 85, 250, ['#7ef4e8', '#e8ffff', '#2ea89e'], 'flower', '달빛호수 주변의 서늘한 냉기를 품어 머리가 맑아지는 은빛 박하.'],
  ['marsh_root', '늪 연근', 'marsh', '늪지 대초원', 'rare', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 2], 0, [1, 2], 75, 245, ['#d8b88e', '#fff0d8', '#8c6a42'], 'root', '깊은 늪지 진흙 속에서 영양분을 가득 저장한 아삭한 연근.'],
  ['paradise_rose', '꽃구름 장미', 'paradise', '꽃구름 정원', 'rare', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 2], 3, [1, 1], 90, 290, ['#ff4878', '#ffb8d0', '#9e1840'], 'flower', '바다 건너 꽃구름 정원에서만 구할 수 있는 진한 향기의 보석 장미.'],
  ['fullmoon_bloom', '보름달꽃', 'fullmoon', '보름달섬', 'rare', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 3], 0, [1, 1], 110, 360, ['#ffe868', '#ffffea', '#c8981e'], 'flower', '보름달섬의 축복을 받아 둥근 만월처럼 환하게 빛나는 희귀 꽃.'],
  ['newmoon_truffle', '그믐 버섯', 'newmoon', '그믐달섬', 'rare', ['spring', 'summer', 'fall', 'winter'], [1, 2, 2, 3], 0, [1, 1], 110, 380, ['#483868', '#a890e0', '#201634'], 'mushroom', '그믐달섬의 깊은 어둠 속에서만 자라나는 신비하고 진한 향의 송로버섯.'],
];

// ── 2. 새로 추가되는 광물 26종 (기본 1 + 마을 특산 16 + 동굴/비경 9 → 총 30종) ──
export const NEW_ORES = [
  ['coal', '석탄', 'route1', '산들길 · 광산 전역', 'basic', 25, ['#2e323c', '#5c6478', '#14171d'], '화덕과 야외 요리에 두루 쓰이는 검은 연료석.'],
  ['ore_breeze', '바람돌', 'windvale', '바람골 · 1번 도로', 'local', 65, ['#68d8c8', '#dcfff8', '#2a887c'], '가벼운 바람의 기운이 깃들어 있는 연옥빛 광석. 신속볼의 재료.'],
  ['ore_aqua_quartz', '물빛 석영', 'harbor', '물결항 · 2번 도로', 'local', 80, ['#48a8f0', '#d0f0ff', '#1e5ca0'], '파도처럼 투명한 푸른빛이 감도는 석영 결정. 물결볼의 재료.'],
  ['ore_maple_agate', '단풍 마노', 'maple', '단풍골 · 3번 도로', 'local', 85, ['#d85838', '#ffb890', '#882814'], '가을 단풍잎 결이 그대로 굳어 만들어진 붉은 마노.'],
  ['ore_pink_quartz', '분홍 석영', 'bloom', '꽃구름 마을 · 5~6번 도로', 'local', 95, ['#f08ab8', '#ffe0f0', '#a84472'], '꽃잎처럼 은은한 분홍빛을 띠는 아름다운 석영.'],
  ['ore_gold', '금광석', 'forge', '쇳불 도시 · 4번 도로', 'local', 140, ['#f0b830', '#fff4a8', '#9c6c10'], '묵직하고 눈부신 황금빛이 살아 있는 귀한 광석.'],
  ['ore_peat', '이탄', 'mist', '안개 마을 · 10~11번 도로', 'local', 90, ['#5c4e3e', '#9a8468', '#342a20'], '오랜 세월 늪지 식물이 퇴적되어 만들어진 고열량 광물.'],
  ['ore_flame', '화염석', 'ember', '잿빛 마을 · 7번 도로', 'local', 135, ['#f04828', '#ffb848', '#981c0c'], '만지기만 해도 따뜻한 화산의 열기가 응축된 붉은 돌. 불꽃볼의 재료.'],
  ['ore_amber', '호박석', 'pinecone', '솔방울 마을 · 12~13번 도로', 'local', 120, ['#e89228', '#ffe088', '#98500c'], '오래된 침엽수의 송진이 굳어 보석처럼 투명해진 황금 호박.'],
  ['ore_lumen', '광휘석', 'lumina', '빛누리 시티 · 14·20번 도로', 'local', 155, ['#70f0ff', '#ffffff', '#2898b8'], '스스로 네온처럼 찬란한 빛을 내뿜는 미래 도시의 희귀 광석.'],
  ['ore_meteor', '운석 조각', 'summit', '별마루 마을 · 27~28번 도로', 'local', 190, ['#6858a8', '#d0c0ff', '#32265c'], '별마루산 기슭에 떨어진 별똥별의 파편. 신비한 자성을 띤다.'],
  ['ore_pearl', '진주', 'shell', '조개 마을 · 8번 도로 · 해신의 바다', 'local', 160, ['#eef4ff', '#ffffff', '#9eb4d0'], '조개 바위 속에서 영롱한 무지갯빛 광택을 품고 자란 바다의 보석.'],
  ['ore_desert_rose', '사막 장미석', 'sand', '모래바람 마을 · 9·23번 도로', 'local', 150, ['#e0a078', '#ffe4d0', '#945c3c'], '모래와 바람이 장미꽃 모양으로 빚어낸 사막의 결정석.'],
  ['ore_jasper', '벽옥', 'canyon', '바위골 · 15·17·29번 도로', 'local', 145, ['#38a868', '#9ef0b8', '#1c6038'], '협곡의 깊은 암반층에서 캐내는 치밀하고 단단한 녹색 보석.'],
  ['ore_moonstone', '월장석', 'moon', '달맞이 마을 · 25~26번 도로', 'local', 185, ['#98b0f8', '#f0f6ff', '#485ea8'], '은은한 달무리가 어른거리는 푸른 진주빛 원석. 달빛볼의 재료.'],
  ['ore_cryolite', '빙정석', 'frost', '서리 마을 · 16·18·19번 도로', 'local', 180, ['#88dcff', '#f0fcff', '#3888b8'], '한여름에도 녹지 않는 얼음처럼 차갑고 투명한 결정.'],
  ['ore_crown_diamond', '왕관 금강석', 'crown', '왕관 시티 · 등대곶 · 21·24번 도로', 'local', 280, ['#b8ecff', '#ffffff', '#5898d8'], '루미 리그 왕관 장식에 쓰이는 세상에서 가장 단단하고 눈부신 보석.'],
  // 동굴 · 비경 9종
  ['ore_coral', '산호석', 'sea_cave', '바다 동굴', 'rare', 130, ['#ff7078', '#ffc8cc', '#a8303c'], '바다 동굴 암벽에서 자라난 고운 다홍빛 산호 화석.'],
  ['ore_glow', '야광석', 'wayward_1f', '헤매는 동굴', 'rare', 145, ['#90ff78', '#e8ffd8', '#3ea030'], '칠흑 같은 동굴 어둠 속에서 연둣빛으로 반짝이는 발광 광석.'],
  ['ore_silver', '은광석', 'underground', '땅속 통로', 'rare', 150, ['#c8d4e8', '#ffffff', '#748298'], '땅속 통로 깊은 광맥에서 나오는 맑은 은빛 광석.'],
  ['ore_obsidian', '흑요석', 'stark_1f', '불꽃산', 'rare', 195, ['#382848', '#9878c0', '#140c1c'], '용암이 급격히 식으며 유리처럼 매끄럽고 날카롭게 굳은 검은 돌.'],
  ['ore_raw_steel', '무쇠 원석', 'iron_1f', '무쇠섬 갱도', 'rare', 200, ['#68788c', '#c0d4e8', '#34404e'], '무쇠섬 깊은 갱도에서만 산출되는 고순도 강철 원석.'],
  ['ore_cave_crystal', '동굴 수정', 'coronet_1f', '별마루산 동굴', 'rare', 210, ['#b088ff', '#f0e4ff', '#6038b8'], '별마루산 중심부에서 별빛을 머금고 자란 투명한 자수정 기둥.'],
  ['ore_permafrost', '만년빙 조각', 'ice_cave', '얼음 굴', 'rare', 205, ['#60c8f8', '#e8faff', '#2470a8'], '수천 년 동안 녹지 않고 푸른 냉기를 뿜어내는 얼음 굴의 결정.'],
  ['ore_victory', '승리의 원석', 'victory_1f', '승리의 길', 'rare', 260, ['#ff9838', '#fff0b8', '#a84810'], '승리의 길을 돌파하는 도전자에게만 모습을 드러내는 타오르는 금빛 원석.'],
  ['ore_warp_crystal', '뒤틀린 결정', 'star_maze', '별마루산 미로 · 뒤집힌 세계', 'rare', 320, ['#d848ff', '#ffb8ff', '#681498'], '시공간의 경계에서 중력을 거스르며 일렁이는 기묘한 보랏빛 결정.'],
];

// ── 3. 새로 추가되는 물고기 26종 (마을 특산 16 + 비경 10 → 총 30종) ────────
export const NEW_FISH = [
  ['fish_breeze_medaka', '산들 송사리', 'windvale', '바람골 · 1번 도로', 'local', 55, ['#78d0c0', '#d8fff4', '#388878'], false, false, '바람골 개울가 수면 위를 가볍게 통통 튀어 오르는 민첩한 송사리.'],
  ['fish_silver_mackerel', '은빛 고등어', 'harbor', '물결항 · 2번 도로', 'local', 85, ['#5898d8', '#dceeff', '#285488'], true, false, '물결항 앞바다를 무리 지어 가르는 등 푸르고 싱싱한 고등어.'],
  ['fish_yamame', '계곡 산천어', 'maple', '단풍골 · 3·31번 도로', 'local', 95, ['#88a878', '#f0c8b0', '#486440'], true, false, '단풍골의 차고 맑은 계곡물에만 사는 붉은 무늬의 귀한 민물고기.'],
  ['fish_cherry_mullet', '벚꽃 숭어', 'bloom', '꽃구름 마을 · 5번 도로', 'local', 100, ['#e890b0', '#ffe0ec', '#984868'], false, false, '꽃잎이 흩날리는 바닷가에서 잡혀 비늘에 분홍빛이 감도는 숭어.'],
  ['fish_mine_loach', '광천 미꾸리', 'forge', '쇳불 도시 · 4번 도로', 'local', 105, ['#8c7458', '#c8b090', '#4c3c28'], false, true, '미네랄이 풍부한 광천수 물줄기에 사는 기운찬 수염 미꾸리.'],
  ['fish_swamp_snakehead', '늪 가물치', 'mist', '안개 마을 · 10·28번 도로', 'local', 125, ['#4c6848', '#90b488', '#243420'], true, false, '안개 낀 습지 수초 사이에 숨어 지내는 묵직하고 힘센 가물치.'],
  ['fish_onsen_carp', '온천 잉어', 'ember', '잿빛 마을 · 6~7번 도로', 'local', 130, ['#e86838', '#ffc898', '#983014'], false, true, '따뜻한 온천수가 섞여 흐르는 물가에서 여유롭게 헤엄치는 붉은 잉어.'],
  ['fish_lenok', '열목어', 'pinecone', '솔방울 마을 · 12·29번 도로', 'local', 135, ['#987858', '#d8c0a0', '#543e28'], true, false, '깊은 숲속 차가운 상류 계곡에서만 만날 수 있는 황갈색 명품 어종.'],
  ['fish_neon_guppy', '네온 구피', 'lumina', '빛누리 시티 · 11·14번 도로', 'local', 145, ['#38d8ff', '#ff78e8', '#1c6898'], true, false, '빛누리 시티 수로에서 네온사인처럼 화려한 지느러미를 뽐내는 물고기.'],
  ['fish_star_minnow', '별빛 피라미', 'summit', '별마루 마을 · 13·27번 도로', 'local', 165, ['#7870d8', '#ffe888', '#3c3488'], true, false, '밤하늘 별빛이 비늘마다 반짝이는 고산 지대의 신비로운 피라미.'],
  ['fish_azure_bream', '쪽빛 도미', 'shell', '조개 마을 · 8번 도로', 'local', 160, ['#3878e0', '#a8dcff', '#1c4088'], false, false, '조개 마을의 산호초 바다에서 잡히는 선명한 쪽빛 참도미.'],
  ['fish_oasis_goby', '오아시스 망둥이', 'sand', '모래바람 마을 · 9·23번 도로', 'local', 150, ['#d8a860', '#fff0c0', '#88642c'], false, true, '사막 한가운데 오아시스 연못에서 강인한 생명력으로 살아가는 물고기.'],
  ['fish_torrent_perch', '급류 꺽지', 'canyon', '바위골 · 15~17번 도로', 'local', 155, ['#687860', '#b8c8a8', '#344030'], true, false, '바위골의 거센 물살을 거슬러 오르는 단단한 근육질 민물고기.'],
  ['fish_moon_hairtail', '달빛 갈치', 'moon', '달맞이 마을 · 25~26번 도로', 'local', 185, ['#c8d8f8', '#ffffff', '#687ca8'], false, false, '달 뜨는 밤바다에서 은장도처럼 길고 눈부시게 빛나는 갈치.'],
  ['fish_ice_smelt', '얼음 빙어', 'frost', '서리 마을 · 18~19번 도로', 'local', 175, ['#a8e4ff', '#ffffff', '#5898c0'], false, false, '얼음장 아래 차가운 물속을 투명한 몸으로 헤엄치는 고소한 빙어.'],
  ['fish_golden_carp', '황금 잉어', 'crown', '왕관 시티 · 등대곶 · 21·24번 도로', 'local', 260, ['#f8b828', '#fff8b8', '#a86c08'], false, true, '온몸이 순금빛 비늘로 덮여 행운과 승리를 부른다는 전설적인 잉어.'],
  // 비경 10종
  ['fish_dawn_sweetfish', '새벽 은어', 'dawn_lake', '새벽호수', 'rare', 210, ['#98d8c8', '#f0fffa', '#4c887c'], false, false, '새벽호수의 맑은 이슬만 먹고 자라 수박 향이 나는 은빛 물고기.'],
  ['fish_sunset_goldfish', '노을 금붕어', 'valor_lake', '노을호수', 'rare', 215, ['#ff5830', '#ffd878', '#a8240c'], true, false, '노을처럼 타오르는 비단 지느러미를 흔들며 유영하는 희귀 금붕어.'],
  ['fish_moon_salmon', '달빛 연어', 'acuity_lake', '달빛호수', 'rare', 230, ['#7898e0', '#ffd0d8', '#384c8c'], true, false, '달빛호수의 얼음물 속에서 푸른 광채를 띠는 대물 연어.'],
  ['fish_cave_eel', '동굴 장어', 'ocean_shrine', '갯바람길 해식동굴 앞바다 · 해신의 바다', 'rare', 195, ['#3c5070', '#98c0e8', '#1c2638'], false, true, '해식 동굴 입구 바위틈과 깊은 바다 수로에 숨어 지내는 심해 장어.'],
  ['fish_marsh_sturgeon', '늪 철갑상어', 'marsh', '늪지 대초원', 'rare', 240, ['#5c6858', '#b0bca8', '#2c3428'], true, true, '고대부터 늪지 바닥을 지켜온 단단한 비늘 갑옷의 거대 물고기.'],
  ['fish_koi', '정원 비단잉어', 'paradise', '꽃구름 정원', 'rare', 250, ['#f05848', '#ffffff', '#282834'], true, true, '꽃구름 정원 연못에서 그림 같은 홍백 무늬를 자랑하는 비단잉어.'],
  ['fish_fullmoon_flounder', '보름달 넙치', 'fullmoon', '보름달섬', 'rare', 290, ['#e8c868', '#fff8d0', '#947828'], false, false, '보름달처럼 둥글고 황금빛이 도는 보름달섬 연안의 희귀 넙치.'],
  ['fish_newmoon_angler', '그믐 아귀', 'newmoon', '그믐달섬', 'rare', 300, ['#483468', '#98f8ff', '#1e1430'], false, true, '그믐달섬 심해에서 작은 초롱불을 밝히고 먹이를 유인하는 심해어.'],
  ['fish_lava_fin', '용암어', 'stark_1f', '불꽃산 · 화산재 해변', 'rare', 280, ['#ff3818', '#ffe058', '#881008'], true, false, '펄펄 끓는 화산 지열수에서도 거뜬히 헤엄치는 불꽃 지느러미 물고기.'],
  ['fish_sky_fish', '하늘물고기', 'distortion', '뒤집힌 세계 · 해신의 바다', 'rare', 350, ['#a888ff', '#e8ffff', '#5034a8'], true, false, '물과 하늘의 경계를 유영하듯 반투명하게 빛나는 환상의 물고기.'],
];

// ── 4. 부엌 · 캠핑 냄비 요리 10종 ─────────────────────────────────────
export const NEW_DISHES = [
  // [id, name, sellPrice, food, partyHeal, in, starter, badges, palette, desc]
  ['dish_onigiri', '바람밀 주먹밥', 75, 38, 15, { wind_wheat: 2 }, true, 0, ['#ffffff', '#243c28', '#e8d8b0'], '포만감 +38 · 파티 체력 +15. 고소한 바람밀로 꼭꼭 뭉친 든든한 휴대 주먹밥.'],
  ['dish_grilled_fish', '소금구이 생선', 95, 35, 20, { fish_crucian: 1, coal: 1 }, true, 0, ['#d88840', '#ffe0a8', '#7c4218'], '포만감 +35 · 파티 체력 +20. 숯불에 노릇하고 바삭하게 구워낸 생선구이.'],
  ['dish_roasted_sweet', '모닥불 군고구마', 110, 52, 25, { maple_sweet: 1 }, true, 0, ['#b83848', '#ffd048', '#681c24'], '포만감 +52 · 파티 체력 +25. 호호 불며 먹는 달콤하고 포슬포슬한 군고구마.'],
  ['dish_seafood_stew', '물결 해물전골', 210, 62, 45, { salt_cabbage: 1, fish_silver_mackerel: 1 }, false, 1, ['#3888c8', '#dcfff0', '#d84830'], '포만감 +62 · 파티 체력 +45. 소금꽃 배추와 은빛 고등어를 시원하게 끓여낸 어부 전골.'],
  ['dish_potato_stew', '무쇠 감자 스튜', 250, 72, 55, { iron_potato: 2, pine_carrot: 1 }, false, 2, ['#e09848', '#fff0c8', '#8c4c1c'], '포만감 +72 · 파티 체력 +55. 쇳불 광부들이 즐겨 먹는 진하고 걸쭉한 스튜.'],
  ['dish_ginger_tea', '온천 생강차', 190, 28, 70, { spa_ginger: 2 }, false, 3, ['#f0a838', '#fff8d0', '#985c14'], '포만감 +28 · 파티 체력 +70. 몸속까지 따스해져 루미들의 피로를 빠르게 풀어 주는 차.'],
  ['dish_melon_ice', '바다 멜론 빙수', 260, 50, 50, { sea_melon: 1, berry: 2 }, false, 3, ['#58d8f0', '#ffffff', '#e84878'], '포만감 +50 · 파티 체력 +50. 시원한 바다 멜론 과육을 듬뿍 올린 새콤달콤 빙수.'],
  ['dish_sorghum_cake', '바위골 수수떡', 220, 68, 40, { cliff_sorghum: 2 }, false, 4, ['#a8422c', '#e89878', '#5c2014'], '포만감 +68 · 파티 체력 +40. 험한 협곡을 넘을 때 허기를 꽉 잡아주는 쫄깃한 떡.'],
  ['dish_turnip_soup', '따뜻한 순무국', 340, 82, 80, { snow_turnip: 2, fish_ice_smelt: 1 }, false, 5, ['#d8f0ff', '#ffffff', '#6898c8'], '포만감 +82 · 파티 체력 +80. 매서운 설원 추위도 단숨에 녹여 주는 맑고 깊은 국.'],
  ['dish_champion_bento', '챔피언 특선 도시락', 620, 100, 140, { golden_wheat: 1, fish_golden_carp: 1, star_flower: 1 }, false, 7, ['#ffd038', '#ff6848', '#5c3820'], '포만감 +100 · 파티 체력 +140. 루미 리그 도전자들을 위한 최고의 영양 만점 도시락!'],
];

// ── crops.json & 씨앗/작물 items 반영 ────────────────────────────────
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(SELF);
if (isMain) {
const crops = JSON.parse(readFileSync(join(DATA, 'crops.json'), 'utf8'));
const items = JSON.parse(readFileSync(join(DATA, 'items.json'), 'utf8'));
const recipes = JSON.parse(readFileSync(join(DATA, 'recipes.json'), 'utf8'));
let nextRow = 7;
for (const [id, name, , placeName, kind, seasons, growthDays, regrowDays, harvestQty, seedSell, cropSell, , , desc] of NEW_CROPS) {
  crops[id] = {
    id,
    name,
    seedItem: `seeds_${id}`,
    harvestItem: id,
    seasons,
    growthDays,
    regrowDays,
    harvestQty,
    spriteRow: nextRow++,
  };
  const days = growthDays.reduce((a, b) => a + b, 0);
  const regrowTxt = regrowDays > 0 ? `, 수확 후 ${regrowDays}일마다 재수확` : '';
  items[`seeds_${id}`] = {
    id: `seeds_${id}`,
    name: `${name} 씨앗`,
    type: 'seed',
    cropId: id,
    icon: `seeds_${id}`,
    sellPrice: seedSell,
    maxStack: 99,
    description: `[${placeName} ${kind === 'rare' ? '비경' : '특산'}] ${days}일이면 자랍니다${regrowTxt}.`,
  };
  items[id] = {
    id,
    name,
    type: 'crop',
    icon: id,
    sellPrice: cropSell,
    maxStack: 99,
    description: desc,
  };
}

// ── 광물 items 반영 ──────────────────────────────────────────────────
for (const [id, name, , placeName, kind, sellPrice, , desc] of NEW_ORES) {
  items[id] = {
    id,
    name,
    type: 'material',
    icon: id,
    sellPrice,
    maxStack: 99,
    description: `[${placeName} ${kind === 'basic' ? '광물' : kind === 'rare' ? '희귀 광물' : '특산 광물'}] ${desc}`,
  };
}

// ── 물고기 items 반영 ────────────────────────────────────────────────
for (const [id, name, , placeName, kind, sellPrice, , , , desc] of NEW_FISH) {
  items[id] = {
    id,
    name,
    type: 'material',
    icon: id,
    sellPrice,
    maxStack: 99,
    description: `[${placeName} ${kind === 'rare' ? '비경 어종' : '특산 어종'}] ${desc}`,
  };
}

// ── 기존 음식 포만감(food) 보강 + 새 요리 10종 반영 ──────────────────
const existingFoods = {
  coffee: { food: 12, partyHeal: 10, desc: '포만감 +12 · 파티 체력 +10. 루나 카페의 향긋한 드립 커피.' },
  bread: { food: 32, partyHeal: 15, desc: '포만감 +32 · 파티 체력 +15. 겉은 바삭, 속은 촉촉한 갓 구운 빵.' },
  cake: { food: 55, partyHeal: 35, desc: '포만감 +55 · 파티 체력 +35. 달콤한 생크림이 듬뿍 올라간 딸기 케이크.' },
  berry: { food: 10, partyHeal: 5, desc: '포만감 +10 · 파티 체력 +5. 길가에서 딴 새콤달콤 산딸기.' },
  herb: { food: 8, partyHeal: 10, desc: '포만감 +8 · 파티 체력 +10. 쌉싸름하지만 기운이 나는 들풀.' },
  tofu: { food: 65, partyHeal: 50, desc: '포만감 +65 · 파티 체력 +50. 엄마의 따뜻한 마음이 담긴 하얀 두부 한 모.' },
};
for (const [id, cfg] of Object.entries(existingFoods)) {
  if (items[id]) {
    items[id].food = cfg.food;
    items[id].partyHeal = cfg.partyHeal;
    items[id].description = cfg.desc;
  }
}

for (const [id, name, sellPrice, food, partyHeal, ing, starter, badges, , desc] of NEW_DISHES) {
  items[id] = {
    id,
    name,
    type: 'food',
    icon: id,
    sellPrice,
    maxStack: 20,
    energy: food * 2,
    food,
    partyHeal,
    description: desc,
  };
  recipes[id] = {
    id,
    out: id,
    qty: 1,
    in: ing,
    station: 'kitchen',
    description: desc,
    ...(starter ? { starter: true } : { badges, autoUnlockByBadge: true }),
  };
}

// ── 지역 특산물로 만드는 특수 루미볼 & 회복약 작업대 레시피 추가 ──────
const specialRecipes = [
  { id: 'quick_ball', out: 'quick_ball', qty: 2, in: { ore_breeze: 1, copper_ore: 1, wind_wheat: 1 }, starter: true, description: '바람골 특산 바람돌과 바람밀로 만드는 첫 턴 특화 루미볼.' },
  { id: 'tide_ball', out: 'tide_ball', qty: 2, in: { ore_aqua_quartz: 1, copper_ore: 1 }, badges: 1, autoUnlockByBadge: true, description: '물결항 물빛 석영으로 빚어 물 타입 루미에게 강한 포획볼.' },
  { id: 'leaf_ball', out: 'leaf_ball', qty: 2, in: { ore_maple_agate: 1, cloud_cotton: 1 }, badges: 2, autoUnlockByBadge: true, description: '단풍 마노와 구름 목화로 만든 풀 타입 특화 포획볼.' },
  { id: 'heavy_ball', out: 'heavy_ball', qty: 2, in: { ore_gold: 1, iron_ore: 2 }, badges: 3, autoUnlockByBadge: true, description: '쇳불 금광석과 철을 합금해 높은 레벨 루미에게 강한 묵직한 볼.' },
  { id: 'ember_ball', out: 'ember_ball', qty: 2, in: { ore_flame: 1, iron_ore: 1 }, badges: 4, autoUnlockByBadge: true, description: '잿빛 화염석의 열기를 담은 불 타입 특화 포획볼.' },
  { id: 'moon_ball', out: 'moon_ball', qty: 2, in: { ore_moonstone: 1, ore_lumen: 1 }, badges: 5, autoUnlockByBadge: true, description: '월장석과 광휘석을 세공해 밤과 동굴에서 빛나는 포획볼.' },
];
for (const sr of specialRecipes) {
  recipes[sr.id] = sr;
}

// ── 5. 생활 도감 90종 (shared/data/dex.json) 생성 ─────────────────────
const basicFarm = [
  { id: 'parsnip', item: 'parsnip', name: '파스닙', region: 'town', regionName: '별빛 마을', kind: 'basic', hint: '별빛 마을 소라네 루미 마트에서 씨앗 구매 후 수확' },
  { id: 'cauliflower', item: 'cauliflower', name: '콜리플라워', region: 'town', regionName: '별빛 마을', kind: 'basic', hint: '별빛 마을 소라네 루미 마트에서 씨앗 구매 후 수확' },
  { id: 'tomato', item: 'tomato', name: '토마토', region: 'town', regionName: '별빛 마을', kind: 'basic', hint: '별빛 마을 마트 · 가판대에서 씨앗 구매 후 수확' },
  { id: 'pumpkin', item: 'pumpkin', name: '호박', region: 'town', regionName: '별빛 마을', kind: 'basic', hint: '별빛 마을 마트 · 가판대에서 씨앗 구매 후 수확' },
  { id: 'lumi_herb', item: 'lumi_herb', name: '루미풀', region: 'town', regionName: '별빛 마을', kind: 'local', hint: '별빛 마을 특산 약초 — 마트에서 씨앗을 사 밭에서 수확' },
  { id: 'fire_pepper', item: 'fire_pepper', name: '불꽃고추', region: 'town', regionName: '별빛 마을', kind: 'basic', hint: '루미 마트에서 씨앗 구매 후 수확' },
  { id: 'iron_bean', item: 'iron_bean', name: '단단콩', region: 'town', regionName: '별빛 마을', kind: 'basic', hint: '루미 마트에서 씨앗 구매 후 수확' },
];
const farmEntries = [
  ...basicFarm.map((e) => ({ ...e, cat: 'farm' })),
  ...NEW_CROPS.map(([id, name, region, regionName, kind]) => ({
    id,
    cat: 'farm',
    item: id,
    name,
    region,
    regionName,
    kind,
    hint: kind === 'rare' ? `${regionName} 주변 풀밭에서 씨앗을 채집해 밭에서 수확` : `${regionName} 루미 마트에서 특산 씨앗을 사서 수확`,
  })),
];

const basicMine = [
  { id: 'stone', item: 'stone', name: '돌', region: 'farm', regionName: '별빛 농장 · 전역', kind: 'basic', hint: '농장이나 도로의 바위를 곡괭이로 채광' },
  { id: 'copper_ore', item: 'copper_ore', name: '구리 광석', region: 'town', regionName: '별빛 마을 · 1번 도로', kind: 'local', hint: '별빛 농장 · 1번 도로 구리 광맥 채광' },
  { id: 'iron_ore', item: 'iron_ore', name: '철 광석', region: 'route1', regionName: '1번 도로 · 동굴 전역', kind: 'basic', hint: '도로 채석장이나 동굴의 철 광맥 채광' },
  { id: 'star_shard', item: 'star_shard', name: '별가루 결정', region: 'route1', regionName: '심층 동굴 · 고지대', kind: 'basic', hint: '보랏빛 별가루 광맥을 곡괭이로 채광' },
];
const mineEntries = [
  ...basicMine.map((e) => ({ ...e, cat: 'mine' })),
  ...NEW_ORES.map(([id, name, region, regionName, kind]) => ({
    id,
    cat: 'mine',
    item: id,
    name,
    region,
    regionName,
    kind,
    hint: `${regionName}의 바위 · 광맥을 곡괭이로 채광`,
  })),
];

const basicFish = [
  { id: 'fish_crucian', item: 'fish_crucian', name: '붕어', region: 'town', regionName: '별빛 마을 · 농장 연못', kind: 'local', hint: '별빛 농장 연못 · 별빛 마을 호수에서 낚시' },
  { id: 'fish_trout', item: 'fish_trout', name: '송어', region: 'route1', regionName: '별빛 마을 · 1번 도로', kind: 'basic', hint: '맑은 강가나 호수에서 낚싯대로 낚시' },
  { id: 'fish_catfish', item: 'fish_catfish', name: '메기', region: 'farm', regionName: '별빛 농장 · 강가', kind: 'basic', hint: '농장 연못이나 완만한 강물에서 낚시' },
  { id: 'fish_rainbow', item: 'fish_rainbow', name: '무지개송어', region: 'town', regionName: '별빛 마을 호수', kind: 'basic', hint: '별빛 마을 호수 · 1번 도로에서 드물게 낚임' },
];
const fishEntries = [
  ...basicFish.map((e) => ({ ...e, cat: 'fish' })),
  ...NEW_FISH.map(([id, name, region, regionName, kind]) => ({
    id,
    cat: 'fish',
    item: id,
    name,
    region,
    regionName,
    kind,
    hint: `${regionName} 물가에서 낚싯대로 낚시`,
  })),
];

// 마을 17곳(+등대곶 공유) 특산물 3종 매핑
const townSpecialties = {
  town: { name: '별빛 마을', crop: 'lumi_herb', ore: 'copper_ore', fish: 'fish_crucian', seed: 'seeds_lumi_herb', seedPrice: 30 },
  windvale: { name: '바람골 마을', crop: 'wind_wheat', ore: 'ore_breeze', fish: 'fish_breeze_medaka', seed: 'seeds_wind_wheat', seedPrice: 35 },
  harbor: { name: '물결항', crop: 'salt_cabbage', ore: 'ore_aqua_quartz', fish: 'fish_silver_mackerel', seed: 'seeds_salt_cabbage', seedPrice: 55 },
  maple: { name: '단풍골', crop: 'maple_sweet', ore: 'ore_maple_agate', fish: 'fish_yamame', seed: 'seeds_maple_sweet', seedPrice: 55 },
  bloom: { name: '꽃구름 마을', crop: 'cloud_cotton', ore: 'ore_pink_quartz', fish: 'fish_cherry_mullet', seed: 'seeds_cloud_cotton', seedPrice: 65 },
  forge: { name: '쇳불 도시', crop: 'iron_potato', ore: 'ore_gold', fish: 'fish_mine_loach', seed: 'seeds_iron_potato', seedPrice: 65 },
  mist: { name: '안개 마을', crop: 'mist_shroom', ore: 'ore_peat', fish: 'fish_swamp_snakehead', seed: 'seeds_mist_shroom', seedPrice: 75 },
  ember: { name: '잿빛 마을', crop: 'spa_ginger', ore: 'ore_flame', fish: 'fish_onsen_carp', seed: 'seeds_spa_ginger', seedPrice: 80 },
  pinecone: { name: '솔방울 마을', crop: 'pine_carrot', ore: 'ore_amber', fish: 'fish_lenok', seed: 'seeds_pine_carrot', seedPrice: 70 },
  lumina: { name: '빛누리 시티', crop: 'glow_radish', ore: 'ore_lumen', fish: 'fish_neon_guppy', seed: 'seeds_glow_radish', seedPrice: 95 },
  summit: { name: '별마루 마을', crop: 'star_flower', ore: 'ore_meteor', fish: 'fish_star_minnow', seed: 'seeds_star_flower', seedPrice: 115 },
  shell: { name: '조개 마을', crop: 'sea_melon', ore: 'ore_pearl', fish: 'fish_azure_bream', seed: 'seeds_sea_melon', seedPrice: 110 },
  sand: { name: '모래바람 마을', crop: 'cactus_fruit', ore: 'ore_desert_rose', fish: 'fish_oasis_goby', seed: 'seeds_cactus_fruit', seedPrice: 95 },
  canyon: { name: '바위골', crop: 'cliff_sorghum', ore: 'ore_jasper', fish: 'fish_torrent_perch', seed: 'seeds_cliff_sorghum', seedPrice: 85 },
  moon: { name: '달맞이 마을', crop: 'moon_primrose', ore: 'ore_moonstone', fish: 'fish_moon_hairtail', seed: 'seeds_moon_primrose', seedPrice: 120 },
  frost: { name: '서리 마을', crop: 'snow_turnip', ore: 'ore_cryolite', fish: 'fish_ice_smelt', seed: 'seeds_snow_turnip', seedPrice: 110 },
  crown: { name: '왕관 시티', crop: 'golden_wheat', ore: 'ore_crown_diamond', fish: 'fish_golden_carp', seed: 'seeds_golden_wheat', seedPrice: 150 },
};

const milestones = [
  { pct: 10, count: 9, id: 'ldex_10', title: '초보 채집가 (10%)', gold: 800, items: { quick_ball: 3, dish_onigiri: 2 } },
  { pct: 25, count: 23, id: 'ldex_25', title: '지방 개척자 (25%)', gold: 2000, items: { hyper_ball: 5, super_potion: 3 } },
  { pct: 50, count: 45, id: 'ldex_50', title: '특산물 장인 (50%)', gold: 5000, items: { star_ball: 5, star_candy: 1 } },
  { pct: 75, count: 68, id: 'ldex_75', title: '루미나 박물학자 (75%)', gold: 12000, items: { star_ball: 10, dish_champion_bento: 3, star_candy: 2 } },
  { pct: 100, count: 90, id: 'ldex_100', title: '★ 대자연의 마스터 (100%)', gold: 30000, items: { origin_ball: 1, star_candy: 5 } },
];

const dexJson = {
  entries: [...farmEntries, ...mineEntries, ...fishEntries],
  townSpecialties,
  milestones,
};

if (farmEntries.length !== 30 || mineEntries.length !== 30 || fishEntries.length !== 30) {
  throw new Error(`도감 개수 불일치: farm=${farmEntries.length}, mine=${mineEntries.length}, fish=${fishEntries.length}`);
}

writeFileSync(join(DATA, 'crops.json'), JSON.stringify(crops, null, 2) + '\n');
writeFileSync(join(DATA, 'items.json'), JSON.stringify(items, null, 2) + '\n');
writeFileSync(join(DATA, 'recipes.json'), JSON.stringify(recipes, null, 2) + '\n');
writeFileSync(join(DATA, 'dex.json'), JSON.stringify(dexJson, null, 2) + '\n');

console.log(`✔ 생활 도감 데이터 생성 완료: 총 ${dexJson.entries.length}종 (농사 ${farmEntries.length} · 채광 ${mineEntries.length} · 낚시 ${fishEntries.length})`);
console.log(`  작물 ${Object.keys(crops).length}종 · 아이템 ${Object.keys(items).length}종 · 레시피 ${Object.keys(recipes).length}종`);
}
