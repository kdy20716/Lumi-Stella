// 루미 도감 확장: 기존 15종 + 진화 3단계 35계열(105종) = 120종
//  - 이름 · 모습 · 능력치 · 기술 · 진화 레벨을 계열 설계에서 자동으로 만듦 (모두 이 게임 오리지널)
//  - 모습: creatures.mjs 의 부품(귀 · 꼬리 · 장식)을 조합, 진화할수록 몸이 커지고 장식이 늘어남
//  - 능력치/기술 데이터는 tools/data/gen-dex.mjs 가 shared/data/creatures.json 에 써 넣음
import { darken, lighten, mix } from './lib/img.mjs';

const tone = (d, b, l) => ({ d, b, l });
const pal = (c) => tone(darken(c, 0.32), c, lighten(c, 0.38));

/** [이름 3단계, 분류, 몸색, 배색, 강조색, 귀, 꼬리, 장식(1단계), 진화하며 붙는 장식, 도움] */
export const DEX_LINES = {
  풀: [
    [['싹뚝', '싹나무', '숲거인'], '새싹 루미', '#6aa84a', '#f0f4d0', '#3f8a3a', 'floppy', 'leaf', [], ['moss', 'mane'], 'farm'],
    [['꽃망울', '꽃송이', '꽃여왕'], '꽃 루미', '#e88ab0', '#fff4f8', '#5aae4a', 'cap', 'curlleaf', ['collar'], ['mane', 'stars'], 'farm'],
    [['솔톨', '솔잎곰', '솔숲거인'], '솔방울 루미', '#8a6a3a', '#e8d8a8', '#2f7a3a', 'round', 'stub', ['moss'], ['mane', 'shell'], 'forage'],
    [['버섯돌', '버섯모자', '버섯성'], '버섯 루미', '#c8a888', '#fff2e0', '#c8403a', 'cap', 'none', ['spots'], ['collar', 'glow'], 'forage'],
    [['덩굴이', '덩굴뱀', '덩굴용'], '덩굴 루미', '#4a9a5a', '#e0f0c0', '#8a5a2a', 'antler', 'leaf', [], ['mane', 'wings'], 'farm'],
  ],
  물: [
    [['물방울', '물보라', '해일왕'], '물방울 루미', '#5aa8e0', '#eaf8ff', '#2f6aa8', 'drop', 'watertail', ['jelly'], [], 'fish'],
    [['조개미', '조개탑', '진주성'], '조개 루미', '#8ab8d8', '#fff8f0', '#e8b8c8', 'none', 'stub', ['shell'], ['glow', 'collar'], 'fish'],
    [['올챙', '개굴랑', '늪대장'], '개구리 루미', '#4aa87a', '#f0f8d0', '#2f6a4a', 'lilypad', 'none', [], ['spots', 'mane'], 'fish'],
    [['해초랑', '해초룡', '심해룡'], '해초 루미', '#2f8a8a', '#d8f4ec', '#1f5a6a', 'fin', 'fin', [], ['mane', 'wings'], 'fish'],
    [['소라게', '소라성', '파도기사'], '소라 루미', '#e0906a', '#fff0e0', '#5a8ac8', 'antenna', 'stub', ['shell'], ['collar', 'mane'], 'mine'],
  ],
  불: [
    [['불씨', '불꽃새', '태양새'], '불새 루미', '#e8642e', '#fff0d0', '#ffd65a', 'feather', 'flame', ['wings'], ['mane', 'stars'], 'energy'],
    [['숯돌이', '숯곰', '용광곰'], '숯 루미', '#5a4a4a', '#e8c8a8', '#e8642e', 'round', 'flamepuff', [], ['mane', 'shell'], 'mine'],
    [['초롱이', '초롱불', '등불령'], '등불 루미', '#e8a83a', '#fff8d0', '#e0473b', 'antenna', 'glowbulb', ['glow'], ['clearwings', 'stars'], 'energy'],
    [['화끈', '화르륵', '화염사자'], '사자 루미', '#d8702a', '#fff0d8', '#ffd65a', 'pointy', 'flame', [], ['mane', 'collar'], 'mine'],
    [['불티', '불티여우', '불꽃여우'], '여우 루미', '#e8803a', '#fff4e0', '#ffd65a', 'flamelong', 'fluffy', ['spots'], ['mane', 'stars'], 'forage'],
  ],
  땅: [
    [['모래알', '모래성', '사막왕'], '모래 루미', '#d8b878', '#fff4d8', '#a87838', 'none', 'stub', ['jelly'], [], 'mine'],
    [['두더지', '두더쿵', '땅울림'], '두더지 루미', '#7a5a4a', '#e8c8b0', '#c8a888', 'round', 'stub', ['whiskers'], ['shell', 'mane'], 'mine'],
    [['자갈콩', '바위콩', '산맥콩'], '바위 루미', '#8a8a92', '#d8d8e0', '#5a5a6a', 'none', 'none', ['shell'], ['moss', 'mane'], 'mine'],
    [['진흙이', '진흙곰', '늪지거인'], '진흙 루미', '#8a6a4a', '#d8c098', '#5a7a3a', 'round', 'stub', [], ['moss', 'shell'], 'farm'],
    [['화석이', '화석룡', '고대룡'], '화석 루미', '#a89880', '#f0e8d8', '#6a5a4a', 'horn', 'leaf', ['spots'], ['mane', 'wings'], 'exp'],
  ],
  바람: [
    [['깃털이', '깃바람', '폭풍새'], '새 루미', '#7ab0e0', '#fff8e8', '#e8a83a', 'feather', 'feathers', ['wings'], ['mane', 'stars'], 'forage'],
    [['솜구름', '구름양', '천둥양'], '구름 루미', '#e8eef8', '#ffffff', '#ffd65a', 'floppy', 'fluffy', [], ['mane', 'glow'], 'energy'],
    [['나풀이', '나비바람', '무지개나비'], '나비 루미', '#b88ae0', '#fff4ff', '#5ac8e0', 'antenna', 'none', ['clearwings'], ['stars', 'glow'], 'forage'],
    [['회오리', '회오리여우', '태풍여우'], '바람여우 루미', '#8ac8c8', '#f0ffff', '#3a8aa8', 'pointy', 'fluffy', [], ['wings', 'mane'], 'exp'],
    [['박쥐롱', '박쥐날개', '밤하늘박쥐'], '박쥐 루미', '#5a4a8a', '#d8c8f0', '#e0473b', 'pointy', 'none', ['wings'], ['collar', 'stars'], 'exp'],
  ],
  빛: [
    [['반디', '반디등', '은하반디'], '반딧불 루미', '#4a5a9a', '#fff8a0', '#ffd65a', 'antenna', 'glowbulb', ['glow'], ['clearwings', 'stars'], 'energy'],
    [['별사탕', '별무늬', '유성'], '별 루미', '#f0c8e8', '#fffaff', '#ffd65a', 'crest', 'star', ['stars'], ['wings', 'glow'], 'exp'],
    [['달토끼', '달빛토끼', '월광토끼'], '달 루미', '#d8d8f0', '#ffffff', '#ffe58a', 'long', 'fluffy', [], ['collar', 'stars'], 'energy'],
    [['수정이', '수정사슴', '오로라사슴'], '수정 루미', '#8ad8e8', '#f0ffff', '#c8a8f0', 'antler', 'stub', ['spots'], ['glow', 'stars'], 'mine'],
    [['햇살이', '햇살새', '새벽새'], '햇살 루미', '#ffd27a', '#fffaf0', '#e8803a', 'feather', 'feathers', ['wings'], ['glow', 'stars'], 'farm'],
  ],
  노말: [
    [['뭉치', '뭉치곰', '털보곰'], '곰 루미', '#b8926a', '#f8ead8', '#7a5a3a', 'round', 'stub', [], ['collar', 'mane'], 'mine'],
    [['다람', '다람쥐왕', '도토리왕'], '다람쥐 루미', '#c8803a', '#fff0d8', '#7a4a2a', 'pointy', 'fluffy', ['spots'], ['collar', 'mane'], 'forage'],
    [['냥냥', '냥이대장', '호랑냥'], '고양이 루미', '#e8c89a', '#fffaf0', '#8a5a3a', 'catdrop', 'curlleaf', ['whiskers'], ['spots', 'mane'], 'fish'],
    [['꿀꿀', '꿀돼지', '멧돼지왕'], '돼지 루미', '#f0a8b0', '#fff0f0', '#a86a5a', 'floppy', 'curlleaf', [], ['collar', 'mane'], 'farm'],
    [['멍뭉', '멍멍장군', '늑대왕'], '강아지 루미', '#a8a8b8', '#f8f8ff', '#4a5a8a', 'floppy', 'fluffy', ['collar'], ['mane', 'spots'], 'exp'],
  ],
};

const ROMA = { 풀: 'g', 물: 'w', 불: 'f', 땅: 'e', 바람: 'a', 빛: 'l', 노말: 'n' };
/** 계열 → 종 id 3개 (예: g1a g1b g1c) */
export const lineIds = (type, i) => ['a', 'b', 'c'].map((s) => `${ROMA[type]}${i + 1}${s}`);

/** 새 종들의 그림 설정 */
export function dexArt() {
  const out = {};
  for (const [type, lines] of Object.entries(DEX_LINES)) lines.forEach((L, i) => {
    const [, , body, belly, accent, ears, tail, ex0, exAdd] = L;
    lineIds(type, i).forEach((id, st) => {
      const b = st === 0 ? body : st === 1 ? mix(body, darken(body, 0.25), 0.4) : darken(body, 0.18);
      const extras = [...ex0, ...exAdd.slice(0, st)];
      const jelly = extras.includes('jelly');
      out[id] = {
        pal: pal(b), belly, accent: pal(accent), wingPal: pal(lighten(accent, 0.2)),
        ears: jelly && st === 0 ? 'none' : ears, tail: jelly && st === 0 ? 'none' : tail,
        extras: jelly && st > 0 ? extras.filter((e) => e !== 'jelly') : extras,
        legs: jelly && st === 0 ? 'none' : extras.includes('wings') && (ears === 'feather') ? 'bird' : undefined,
        mouth: ears === 'feather' ? 'beak' : undefined,
        head: 6 + st, body: [5 + st, 4 + st], faceMask: st > 0 || i % 2 === 0,
        eyes: st === 0 && i % 3 === 0 ? 'big' : undefined, eyeColor: darken(accent, 0.2), bigTail: st === 2,
      };
    });
  });
  return out;
}
