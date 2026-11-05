import './style.css';
import { loadLooks, warmIllust } from './ui/Illust';
void loadLooks().then(warmIllust);
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FarmScene } from './scenes/FarmScene';
import { BattleScene } from './scenes/BattleScene';

// ?illust → 게임 대신 일러스트 테스트 페이지 (모든 인물 · 대화창 미리보기)
if (new URLSearchParams(location.search).has('illust')) void import('./ui/IllustTest').then((m) => m.showIllustTest());
// 픽셀 아트 렌더링: 안티앨리어싱 끔 + 정수 좌표 반올림 → 선명한 레트로 그래픽
else new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14201a',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [BootScene, FarmScene, BattleScene],
});
