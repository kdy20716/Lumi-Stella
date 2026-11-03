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
};
