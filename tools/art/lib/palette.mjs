// 전체 게임 공용 팔레트 (따뜻한 톤의 오리지널 팔레트)
export const P = {
  outline: '#2a1b14',
  ink: '#241812',
  white: '#fff8ec',

  grass: { d2: '#2f5e33', d1: '#3d7a3c', base: '#559a45', l1: '#73b852', l2: '#9bd165', l3: '#c3e57e' },
  dirt: { d2: '#7a5232', d1: '#94673f', base: '#b3834f', l1: '#c99a62', l2: '#ddb57c', peb: '#8a6a4c' },
  soil: { d2: '#4e301c', d1: '#663f24', base: '#7d4f2d', l1: '#966139', l2: '#ad7646' },
  wet: { d2: '#2e1c12', d1: '#3c2617', base: '#4b301d', l1: '#5c3c25', l2: '#6e4a2f' },
  water: { deep: '#245c92', d1: '#2d6fa6', base: '#3a86bf', l1: '#57a6d8', l2: '#8fcdee', foam: '#e2f6ff' },
  sand: { base: '#e2c88e', d1: '#c9ab72', l1: '#f0dca8' },

  wood: { d2: '#4a2c18', d1: '#6b4024', base: '#8c5a33', l1: '#ad7445', l2: '#c99260' },
  plank: { d1: '#7a4a2a', base: '#a26a3c', l1: '#c2864f', l2: '#d9a46a' },
  roof: { d2: '#5c1f22', d1: '#7f2b2b', base: '#a83c34', l1: '#c95a42', l2: '#e07d58' },
  stone: { d2: '#4f4f5c', d1: '#6a6b78', base: '#878996', l1: '#a6a8b3', l2: '#c8cad1' },
  leaf: { d2: '#1f4a2c', d1: '#2c6a35', base: '#3f8a3e', l1: '#5dab4a', l2: '#86c95b', l3: '#b4e07a' },
  pine: { d2: '#163d33', d1: '#1f5642', base: '#2b6f4f', l1: '#3f8b5c', l2: '#5fa86c' },
  bark: { d2: '#3a2416', d1: '#53331f', base: '#6e4529', l1: '#8a5a36' },
  metal: { d2: '#3c4250', d1: '#5a6273', base: '#7f899c', l1: '#a9b3c4', l2: '#d4dbe6' },
  gold: { d1: '#b5761e', base: '#e0a43a', l1: '#f6d16b' },
  glass: { d1: '#3f6f8f', base: '#7fc0de', l1: '#c9ecf6', warm: '#ffd77a', warm2: '#ffb347' },

  flowers: ['#f2f2f2', '#ffd65a', '#ff8fb1', '#b78cff', '#ff6a4d', '#7fd3ff'],
};

// 캐릭터 팔레트 헬퍼: base → {d, b, l}
export const tone = (d, b, l) => ({ d, b, l });

export const SKINS = {
  light: tone('#d99a7a', '#f6c7a3', '#ffe0c4'),
  tan: tone('#b97a55', '#dda278', '#f0bf93'),
  brown: tone('#7d4c32', '#a26a47', '#c08560'),
  pale: tone('#e0aa90', '#fdd9bd', '#fff0dc'),
};
