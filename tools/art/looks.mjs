// 캐릭터 외형 정의 (플레이어 + NPC). 색상 톤: d(어두움) b(기본) l(밝음)
import { SKINS, tone } from './lib/palette.mjs';

const shoesBrown = tone('#3a2214', '#5c3820', '#80522f');
const shoesDark = tone('#22202a', '#3a3644', '#5a5668');

export const LOOKS = {
  player: {
    skin: SKINS.light, hair: tone('#5a2e1a', '#86452a', '#b0683a'), hairStyle: 'short',
    shirt: tone('#2f6a8a', '#3f8fb5', '#73bfe0'), pants: tone('#3b3f6e', '#525a9a', '#7a83c4'),
    shoes: shoesBrown, outfit: 'overalls', sleeves: 'short', accent: tone('#8a2f2f', '#c44a3a', '#e8775a'),
  },
  hana: { // 이웃 농부
    skin: SKINS.pale, hair: tone('#a8562a', '#d8783a', '#f2a65a'), hairStyle: 'ponytail',
    shirt: tone('#c9a24a', '#f0d27a', '#fff0b0'), pants: tone('#2f6a4a', '#3f8a5f', '#6ab884'),
    shoes: shoesBrown, outfit: 'overalls', sleeves: 'short', accent: tone('#a83250', '#e0476b', '#ff8aa6'),
  },
  minsu: { // 대장장이
    skin: SKINS.tan, hair: tone('#2a1d18', '#3d2b22', '#5a4234'), hairStyle: 'bald', beard: true,
    shirt: tone('#8a3a2a', '#b8523a', '#d8775a'), pants: tone('#2a2a36', '#3d3d4e', '#5c5c70'),
    shoes: shoesDark, outfit: 'apron', sleeves: 'short', accent: tone('#4a3a2a', '#6a5440', '#8c7458'),
  },
  sora: { // 잡화점 상인
    skin: SKINS.light, hair: tone('#1f1a2e', '#2f2848', '#4a4070'), hairStyle: 'bun', glasses: true,
    shirt: tone('#5a3a8a', '#7d5aa8', '#a98ad0'), pants: tone('#3a2a4a', '#4a3a5e', '#6a5a80'),
    shoes: shoesDark, outfit: 'dress', sleeves: 'long', accent: tone('#c99a2a', '#f0c84a', '#ffe58a'),
  },
  park: { // 어부 할아버지
    skin: SKINS.brown, hair: tone('#9a9a9e', '#c8c8cc', '#ececf0'), hairStyle: 'bald', beard: true,
    shirt: tone('#3f5a3a', '#55784f', '#7aa070'), pants: tone('#4a3a2a', '#6a5440', '#8c7458'),
    shoes: shoesBrown, outfit: 'vest', sleeves: 'long', hat: 'beanie', accent: tone('#2a4a6a', '#3a6a9a', '#6a9ac8'),
  },
  juni: { // 동네 꼬마
    skin: SKINS.pale, hair: tone('#1f1410', '#33231a', '#55402f'), hairStyle: 'spiky',
    shirt: tone('#b83a2a', '#e8573a', '#ff8a5a'), pants: tone('#2a4a7a', '#3a64a0', '#5a8ad0'),
    shoes: tone('#c8c8cc', '#f0f0f0', '#ffffff'), outfit: 'shirt', sleeves: 'short', hat: 'cap', accent: tone('#1f5a8a', '#2f7ab5', '#5aa8e0'),
  },
  mayor: { // 오 촌장
    skin: SKINS.tan, hair: tone('#8a8a90', '#b8b8be', '#e0e0e6'), hairStyle: 'bald', beard: true, glasses: true,
    shirt: tone('#c9b48a', '#efe0bc', '#fff6dc'), pants: tone('#3a2a22', '#5a4234', '#7a5c48'),
    shoes: shoesDark, outfit: 'vest', sleeves: 'long', accent: tone('#5a1f2a', '#8a2f3f', '#b84a5a'),
  },
  luna: { // 카페 사장
    skin: SKINS.light, hair: tone('#7a3f1f', '#a8602f', '#d8904f'), hairStyle: 'long',
    shirt: tone('#1f6a66', '#2f8f8a', '#5ab8b0'), pants: tone('#2a2a36', '#3d3d4e', '#5c5c70'),
    shoes: shoesBrown, outfit: 'apron', sleeves: 'long', accent: tone('#8a4a6a', '#b86a8a', '#e09ab4'),
  },
  teo: { // 거리 악사
    skin: SKINS.brown, hair: tone('#151012', '#221a1c', '#3a2e30'), hairStyle: 'short', hat: 'beanie',
    shirt: tone('#c06a1f', '#e8892e', '#ffb05a'), pants: tone('#2a3a5a', '#3a5078', '#5a74a0'),
    shoes: shoesDark, outfit: 'vest', sleeves: 'short', accent: tone('#2f5a2f', '#3f7a3f', '#5fa05f'),
  },
  mio: { // 화가
    skin: SKINS.pale, hair: tone('#2a2a5a', '#3f3f8a', '#6a6ab8'), hairStyle: 'bob', hat: 'beanie',
    shirt: tone('#c9a24a', '#f0d27a', '#fff0b0'), pants: tone('#3a2a4a', '#4a3a5e', '#6a5a80'),
    shoes: shoesBrown, outfit: 'dress', sleeves: 'short', accent: tone('#a82f3a', '#d8473b', '#ff7a6a'),
  },
  doyun: { // 우체부
    skin: SKINS.light, hair: tone('#4a2a1a', '#6a3f24', '#8a5a36'), hairStyle: 'short', hat: 'cap',
    shirt: tone('#2a4a8a', '#3a64b0', '#6a90d8'), pants: tone('#1f2a4a', '#2a3a64', '#4a5a8a'),
    shoes: shoesDark, outfit: 'shirt', sleeves: 'long', accent: tone('#1f3a6a', '#2a4a8a', '#ffd65a'),
  },
  // ── 루미 모험 인물 ──
  professor: { // 한별 박사 (루미 연구가)
    skin: SKINS.light, hair: tone('#6a6a72', '#9a9aa4', '#cacad2'), hairStyle: 'bob', glasses: true,
    shirt: tone('#c9c9d6', '#f2f2f8', '#ffffff'), pants: tone('#2a3a4a', '#3a5068', '#5a7490'),
    shoes: shoesDark, outfit: 'apron', sleeves: 'long', accent: tone('#2a6a8a', '#3a8ab0', '#6ab0d8'),
  },
  bugkid: { // 곤충 채집 소년
    skin: SKINS.tan, hair: tone('#2a1a10', '#3d2a1c', '#5a4030'), hairStyle: 'spiky', hat: 'straw',
    shirt: tone('#4a8a2a', '#6ab83a', '#9ae06a'), pants: tone('#a87a3a', '#d8a85a', '#f2cc88'),
    shoes: shoesBrown, outfit: 'shirt', sleeves: 'short', accent: tone('#2a6a2a', '#3f8a3f', '#6ab06a'),
  },
  hiker: { // 등산가
    skin: SKINS.brown, hair: tone('#2a1a10', '#4a3020', '#6a4a30'), hairStyle: 'short', beard: true, hat: 'beanie',
    shirt: tone('#8a3a1f', '#b8562e', '#e0804a'), pants: tone('#3a3a2a', '#5a5a3a', '#7a7a5a'),
    shoes: shoesDark, outfit: 'vest', sleeves: 'long', accent: tone('#3a5a2a', '#4f7a3a', '#7aa05a'),
  },
  lass: { // 소녀 트레이너
    skin: SKINS.pale, hair: tone('#8a3a5a', '#c05a80', '#e88aa8'), hairStyle: 'long',
    shirt: tone('#c9b0e0', '#e8d8f8', '#ffffff'), pants: tone('#5a3a8a', '#7d5aa8', '#a98ad0'),
    shoes: shoesBrown, outfit: 'dress', sleeves: 'short', accent: tone('#5a3a8a', '#7d5aa8', '#a98ad0'),
  },
  fisher: { // 낚시꾼
    skin: SKINS.tan, hair: tone('#1f1a14', '#33281e', '#4a3c2e'), hairStyle: 'short', hat: 'straw',
    shirt: tone('#2a5a6a', '#3a7a8a', '#6aa8b8'), pants: tone('#3a3020', '#5a4a30', '#7a6a4a'),
    shoes: shoesBrown, outfit: 'overalls', sleeves: 'short', accent: tone('#1f5a8a', '#2f7ab5', '#5aa8e0'),
  },
  leader: { // 바람골 도장 관장 세나
    skin: SKINS.light, hair: tone('#1f4a5a', '#2f6a7a', '#5aa0b0'), hairStyle: 'ponytail',
    shirt: tone('#e0e8f0', '#ffffff', '#ffffff'), pants: tone('#1f3a4a', '#2a5068', '#4a7490'),
    shoes: shoesDark, outfit: 'vest', sleeves: 'long', accent: tone('#2a8a8a', '#3ab0a8', '#7ad8d0'),
  },
  nurse: { // 루미 쉼터 직원 다온
    skin: SKINS.pale, hair: tone('#b85a6a', '#e07a8a', '#ffb0bc'), hairStyle: 'bun',
    shirt: tone('#e8a0b0', '#ffc8d4', '#fff0f4'), pants: tone('#c97a8a', '#e8a0b0', '#ffd0dc'),
    shoes: tone('#c8c8cc', '#f0f0f0', '#ffffff'), outfit: 'apron', sleeves: 'short', accent: tone('#e07a8a', '#ff9cb0', '#ffd0dc'),
  },
  villager: { // 바람골 주민
    skin: SKINS.tan, hair: tone('#5a3a1a', '#8a5a2a', '#b07a40'), hairStyle: 'short', hat: 'cap',
    shirt: tone('#a8862a', '#d8b24a', '#f2d47a'), pants: tone('#3a3a4a', '#4a4a5e', '#6a6a80'),
    shoes: shoesBrown, outfit: 'shirt', sleeves: 'short', accent: tone('#7a3a2a', '#a8523a', '#d07a5a'),
  },
  // ── 플레이어 선택 외형 (남 4 · 여 4) ──
  m1: { // 남1: 갈색 머리 · 청 멜빵
    skin: SKINS.light, hair: tone('#5a2e1a', '#86452a', '#b0683a'), hairStyle: 'short',
    shirt: tone('#2f6a8a', '#3f8fb5', '#73bfe0'), pants: tone('#3b3f6e', '#525a9a', '#7a83c4'),
    shoes: shoesBrown, outfit: 'overalls', sleeves: 'short', accent: tone('#8a2f2f', '#c44a3a', '#e8775a'),
  },
  m2: { // 남2: 검은 삐죽머리 · 빨간 티 · 모자
    skin: SKINS.tan, hair: tone('#141018', '#241c28', '#3e3244'), hairStyle: 'spiky', hat: 'cap',
    shirt: tone('#a82a2a', '#d8413a', '#ff7a5a'), pants: tone('#2a3a5a', '#3a5078', '#5a74a0'),
    shoes: tone('#c8c8cc', '#f0f0f0', '#ffffff'), outfit: 'shirt', sleeves: 'short', accent: tone('#1f3a6a', '#2a4a8a', '#ffd65a'),
  },
  m3: { // 남3: 금발 · 초록 조끼 · 안경
    skin: SKINS.pale, hair: tone('#b8862a', '#e8b84a', '#ffe08a'), hairStyle: 'short', glasses: true,
    shirt: tone('#d8d0c0', '#f4eee2', '#ffffff'), pants: tone('#4a3a2a', '#6a5440', '#8c7458'),
    shoes: shoesDark, outfit: 'vest', sleeves: 'long', accent: tone('#2f6a2f', '#3f8a3f', '#6ab06a'),
  },
  m4: { // 남4: 짙은 피부 · 털모자 · 주황 셔츠
    skin: SKINS.brown, hair: tone('#151012', '#221a1c', '#3a2e30'), hairStyle: 'short', hat: 'beanie',
    shirt: tone('#c06a1f', '#e8892e', '#ffb05a'), pants: tone('#2a2a36', '#3d3d4e', '#5c5c70'),
    shoes: shoesBrown, outfit: 'shirt', sleeves: 'long', accent: tone('#2a5a6a', '#3a7a8a', '#6aa8b8'),
  },
  f1: { // 여1: 긴 갈색 머리 · 분홍 원피스
    skin: SKINS.light, hair: tone('#6a2f1a', '#93482a', '#c06a40'), hairStyle: 'long',
    shirt: tone('#c05a7a', '#e87a9a', '#ffaac0'), pants: tone('#8a3a5a', '#b05a7a', '#d88aa0'),
    shoes: shoesBrown, outfit: 'dress', sleeves: 'short', accent: tone('#f0e0c0', '#fff4dc', '#ffffff'),
  },
  f2: { // 여2: 빨간 포니테일 · 노랑 멜빵
    skin: SKINS.pale, hair: tone('#9a2f1f', '#c8462a', '#ee7a4a'), hairStyle: 'ponytail',
    shirt: tone('#e8e0d0', '#fffaf0', '#ffffff'), pants: tone('#c9962a', '#f0c048', '#ffe080'),
    shoes: shoesBrown, outfit: 'overalls', sleeves: 'short', accent: tone('#3a7a4a', '#4f9a5f', '#7cc48a'),
  },
  f3: { // 여3: 흑갈색 단발 · 청록 셔츠 · 안경
    skin: SKINS.light, hair: tone('#2a1a14', '#43291e', '#65412e'), hairStyle: 'bob', glasses: true,
    shirt: tone('#1f6a66', '#2f8f8a', '#5ab8b0'), pants: tone('#2a2a36', '#3d3d4e', '#5c5c70'),
    shoes: shoesDark, outfit: 'shirt', sleeves: 'long', accent: tone('#c99a2a', '#f0c84a', '#ffe58a'),
  },
  f4: { // 여4: 금발 올림머리 · 밀짚모자 · 보라 원피스
    skin: SKINS.brown, hair: tone('#c09a3a', '#e8c25a', '#fff09a'), hairStyle: 'bun', hat: 'straw',
    shirt: tone('#5a3a8a', '#7d5aa8', '#a98ad0'), pants: tone('#3a2a4a', '#4a3a5e', '#6a5a80'),
    shoes: shoesBrown, outfit: 'dress', sleeves: 'short', accent: tone('#e8d0f0', '#fff0ff', '#ffffff'),
  },
  // ── 스토리 인물 ──
  mom: { // 주인공의 어머니
    skin: SKINS.light, hair: tone('#4a2a1e', '#6e3f2a', '#94593a'), hairStyle: 'bun',
    shirt: tone('#b86a5a', '#e08a74', '#f8b29a'), pants: tone('#4a3a5a', '#5e4c74', '#7c6a94'),
    shoes: shoesBrown, outfit: 'apron', sleeves: 'long', accent: tone('#d8c8a8', '#f4e8cc', '#ffffff'),
  },
  rival_m: { // 남자 라이벌 '한결'
    skin: SKINS.tan, hair: tone('#5a1f14', '#8a2f1f', '#c0503a'), hairStyle: 'spiky',
    shirt: tone('#1f4a8a', '#2f68c0', '#5a94e8'), pants: tone('#2a2a36', '#3d3d4e', '#5c5c70'),
    shoes: tone('#a82a2a', '#d8413a', '#ff7a5a'), outfit: 'vest', sleeves: 'short', accent: tone('#c99a2a', '#f0c84a', '#ffe58a'),
  },
  rival_f: { // 여자 라이벌 '새봄'
    skin: SKINS.pale, hair: tone('#c0662a', '#ee8a3a', '#ffb870'), hairStyle: 'ponytail', hat: 'cap',
    shirt: tone('#2f8a5a', '#3fb07a', '#7ad8a8'), pants: tone('#2a3a5a', '#3a5078', '#5a74a0'),
    shoes: tone('#c8c8cc', '#f0f0f0', '#ffffff'), outfit: 'shirt', sleeves: 'short', accent: tone('#e0475b', '#ff6a7a', '#ffa0aa'),
  },
  // ── 루미나 지방 트레이너 · 관장 · 사천왕 · 챔피언 ──
  woodcutter: { skin: SKINS.tan, hair: tone('#3a2214', '#5c3820', '#80522f'), hairStyle: 'short', beard: true, shirt: tone('#7a2a22', '#a83c34', '#d0604a'), pants: tone('#2a3a2a', '#3d523d', '#5a745a'), shoes: shoesBrown, outfit: 'vest', sleeves: 'long', hat: 'beanie', accent: tone('#3a2a1a', '#5a4026', '#7a5a3a') },
  miner: { skin: SKINS.light, hair: tone('#2a1d18', '#3d2b22', '#5a4234'), hairStyle: 'short', shirt: tone('#8a6a2a', '#b88a3a', '#e0b060'), pants: tone('#3a3a44', '#55556a', '#77778c'), shoes: shoesDark, outfit: 'overalls', sleeves: 'short', hat: 'cap', accent: tone('#c99a2a', '#f0c84a', '#ffe58a') },
  swimmer: { skin: SKINS.tan, hair: tone('#1f1410', '#33231a', '#55402f'), hairStyle: 'short', shirt: tone('#1f6a8a', '#2f9ac0', '#6ad0f0'), pants: tone('#1f4a6a', '#2f6a9a', '#5a94c8'), shoes: tone('#c8a070', '#e8c090', '#ffe0b0'), outfit: 'shirt', sleeves: 'short', accent: tone('#e0475b', '#ff6a7a', '#ffa0aa') },
  skier: { skin: SKINS.pale, hair: tone('#c09a3a', '#e8c25a', '#fff09a'), hairStyle: 'long', shirt: tone('#a82a4a', '#d84a6a', '#ff8aa0'), pants: tone('#2a2a4a', '#3a3a6a', '#5a5a8a'), shoes: shoesDark, outfit: 'shirt', sleeves: 'long', hat: 'beanie', accent: tone('#e8e8f0', '#ffffff', '#ffffff') },
  explorer: { skin: SKINS.tan, hair: tone('#5a2e1a', '#86452a', '#b0683a'), hairStyle: 'short', glasses: true, shirt: tone('#8a7a4a', '#b8a868', '#e0d090'), pants: tone('#5a4a2a', '#7a6640', '#9a8458'), shoes: shoesBrown, outfit: 'vest', sleeves: 'short', hat: 'straw', accent: tone('#6a5a3a', '#8a7650', '#ac9670') },
  researcher: { skin: SKINS.light, hair: tone('#1f1a2e', '#2f2848', '#4a4070'), hairStyle: 'bob', glasses: true, shirt: tone('#c8c8d0', '#eeeef4', '#ffffff'), pants: tone('#2a3a4a', '#3a5068', '#5a7088'), shoes: shoesDark, outfit: 'apron', sleeves: 'long', accent: tone('#3a8ab0', '#5aa8d0', '#8ad0f0') },
  gentleman: { skin: SKINS.light, hair: tone('#8a8a90', '#b8b8be', '#e0e0e6'), hairStyle: 'short', beard: true, shirt: tone('#2a2a3a', '#3d3d55', '#5c5c78'), pants: tone('#1e1e28', '#2e2e3e', '#4a4a5e'), shoes: shoesDark, outfit: 'vest', sleeves: 'long', accent: tone('#8a2f2f', '#c44a3a', '#e8775a') },
  lady: { skin: SKINS.pale, hair: tone('#e8e0d0', '#f4f0e8', '#ffffff'), hairStyle: 'long', shirt: tone('#4a3a6a', '#6a5a94', '#9a8ac0'), pants: tone('#3a2a4a', '#4a3a5e', '#6a5a80'), shoes: shoesDark, outfit: 'dress', sleeves: 'long', accent: tone('#e8d0f0', '#fff0ff', '#ffffff') },
  ace_m: { skin: SKINS.light, hair: tone('#1f2a4a', '#2f3f6a', '#4a5a8a'), hairStyle: 'spiky', shirt: tone('#2a2a36', '#3d3d4e', '#5c5c70'), pants: tone('#1e1e28', '#2e2e3e', '#4a4a5e'), shoes: tone('#a82a2a', '#d8413a', '#ff7a5a'), outfit: 'vest', sleeves: 'long', accent: tone('#c99a2a', '#f0c84a', '#ffe58a') },
  ace_f: { skin: SKINS.tan, hair: tone('#1f1410', '#33231a', '#55402f'), hairStyle: 'ponytail', shirt: tone('#2a2a36', '#3d3d4e', '#5c5c70'), pants: tone('#1e1e28', '#2e2e3e', '#4a4a5e'), shoes: tone('#a82a2a', '#d8413a', '#ff7a5a'), outfit: 'shirt', sleeves: 'long', accent: tone('#c99a2a', '#f0c84a', '#ffe58a') },
  leader_harbor: { skin: SKINS.tan, hair: tone('#1f4a8a', '#2f68c0', '#5a94e8'), hairStyle: 'spiky', shirt: tone('#1f6a8a', '#2f9ac0', '#6ad0f0'), pants: tone('#e0e0e6', '#f4f4f8', '#ffffff'), shoes: shoesBrown, outfit: 'shirt', sleeves: 'short', accent: tone('#e8e8f0', '#ffffff', '#ffffff') },
  leader_maple: { skin: SKINS.pale, hair: tone('#2f6a2a', '#4a8a3a', '#7ab85a'), hairStyle: 'long', shirt: tone('#a85a2a', '#d8783a', '#f2a65a'), pants: tone('#2f6a4a', '#3f8a5f', '#6ab884'), shoes: shoesBrown, outfit: 'dress', sleeves: 'long', hat: 'straw', accent: tone('#c9a24a', '#f0d27a', '#fff0b0') },
  leader_forge: { skin: SKINS.brown, hair: tone('#2a1d18', '#3d2b22', '#5a4234'), hairStyle: 'bald', beard: true, shirt: tone('#6a5a4a', '#8a7a68', '#ac9a88'), pants: tone('#2a2a36', '#3d3d4e', '#5c5c70'), shoes: shoesDark, outfit: 'apron', sleeves: 'short', accent: tone('#4a3a2a', '#6a5440', '#8c7458') },
  leader_ember: { skin: SKINS.light, hair: tone('#a8241a', '#d8412a', '#ff7a4a'), hairStyle: 'ponytail', shirt: tone('#2a1e24', '#3e2e36', '#5a4650'), pants: tone('#2a1e24', '#3e2e36', '#5a4650'), shoes: tone('#a82a2a', '#d8413a', '#ff7a5a'), outfit: 'vest', sleeves: 'short', accent: tone('#d84a1a', '#ff6a2a', '#ffa05a') },
  leader_lumina: { skin: SKINS.pale, hair: tone('#c09a3a', '#e8c25a', '#fff09a'), hairStyle: 'bob', glasses: true, shirt: tone('#c9a24a', '#f0d27a', '#fff0b0'), pants: tone('#e0e0e6', '#f4f4f8', '#ffffff'), shoes: shoesBrown, outfit: 'dress', sleeves: 'long', accent: tone('#e8e8f0', '#ffffff', '#ffffff') },
  leader_frost: { skin: SKINS.pale, hair: tone('#a8c8e0', '#d0e4f2', '#f4faff'), hairStyle: 'long', shirt: tone('#4a6a9a', '#6a8ac0', '#9ab8e8'), pants: tone('#2a3a5a', '#3a5078', '#5a74a0'), shoes: tone('#c8c8cc', '#f0f0f0', '#ffffff'), outfit: 'dress', sleeves: 'long', hat: 'beanie', accent: tone('#e8e8f0', '#ffffff', '#ffffff') },
  leader_summit: { skin: SKINS.tan, hair: tone('#8a8a90', '#b8b8be', '#e0e0e6'), hairStyle: 'long', beard: true, glasses: true, shirt: tone('#2a2048', '#3e3068', '#5e4c94'), pants: tone('#1e1830', '#2e2448', '#4a3e68'), shoes: shoesDark, outfit: 'apron', sleeves: 'long', accent: tone('#c99a2a', '#f0c84a', '#ffe58a') },
  elite1: { skin: SKINS.light, hair: tone('#5a7a9a', '#7a9aba', '#a8c4dc'), hairStyle: 'spiky', shirt: tone('#4a6a7a', '#6a8a9a', '#9abac8'), pants: tone('#2a3a4a', '#3a5068', '#5a7088'), shoes: shoesDark, outfit: 'vest', sleeves: 'long', accent: tone('#e8e8f0', '#ffffff', '#ffffff') },
  elite2: { skin: SKINS.pale, hair: tone('#1f4a6a', '#2f6a9a', '#5a94c8'), hairStyle: 'long', shirt: tone('#1f4a6a', '#2f6a9a', '#5a94c8'), pants: tone('#1f2a4a', '#2f3f6a', '#4a5a8a'), shoes: shoesDark, outfit: 'dress', sleeves: 'long', accent: tone('#8ad0f0', '#c0ecff', '#ffffff') },
  elite3: { skin: SKINS.brown, hair: tone('#a8241a', '#d8412a', '#ff7a4a'), hairStyle: 'spiky', beard: true, shirt: tone('#8a2a1a', '#b83a2a', '#e8573a'), pants: tone('#2a1e24', '#3e2e36', '#5a4650'), shoes: shoesDark, outfit: 'vest', sleeves: 'short', accent: tone('#c99a2a', '#f0c84a', '#ffe58a') },
  elite4: { skin: SKINS.light, hair: tone('#1f3a1e', '#2f5a2c', '#4a7a46'), hairStyle: 'bun', glasses: true, shirt: tone('#2f5a3a', '#3f7a4f', '#6aa87a'), pants: tone('#2a3a2a', '#3d523d', '#5a745a'), shoes: shoesBrown, outfit: 'dress', sleeves: 'long', accent: tone('#c9a24a', '#f0d27a', '#fff0b0') },
  champion: { skin: SKINS.pale, hair: tone('#1f1a2e', '#2f2848', '#4a4070'), hairStyle: 'long', shirt: tone('#1e1830', '#2e2448', '#4a3e68'), pants: tone('#1e1830', '#2e2448', '#4a3e68'), shoes: shoesDark, outfit: 'dress', sleeves: 'long', accent: tone('#c99a2a', '#f0c84a', '#ffe58a') },
};
