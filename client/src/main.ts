import './style.css';
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FarmScene } from './scenes/FarmScene';

// 픽셀 아트 렌더링: 안티앨리어싱 끔 + 정수 좌표 반올림 → 선명한 레트로 그래픽
new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14201a',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  scene: [BootScene, FarmScene],
});
