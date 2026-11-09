import './style.css';
import { loadLooks, warmIllust } from './ui/Illust';
void loadLooks().then(warmIllust);
import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FarmScene } from './scenes/FarmScene';
import { BattleScene } from './scenes/BattleScene';

const params = new URLSearchParams(location.search);

// ?illust → 게임 대신 인물 일러스트 테스트 페이지
if (params.has('illust')) {
  void import('./ui/IllustTest').then((m) => m.showIllustTest());
}
// ?dex → 기라티나 신오도감 기준 210마리 루미 도감 개발/연동 테스트 페이지
else if (params.has('dex')) {
  void import('./ui/PokedexTest').then((m) => m.showPokedexTest());
}
// ?3d → 포켓몬 4세대식 3D 시험판 (?3d=home 처럼 시작 장소 지정)
else if (params.has('3d')) {
  void import('./three/Proto3D').then((m) => m.start(params.get('3d') || 'town'));
}
// 픽셀 아트 렌더링: 안티앨리어싱 끔 + 정수 좌표 반올림 → 선명한 레트로 그래픽
else {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#14201a',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    scene: [BootScene, FarmScene, BattleScene],
  });
}
