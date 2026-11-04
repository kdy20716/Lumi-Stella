import Phaser from 'phaser';
import type { Manifest } from '../config';
import { ui } from '../ui/UI';
import { MAP_IDS } from '@shared/types';

/** 매니페스트 → 모든 에셋 로드 → 애니메이션 등록 */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    ui.loading.show();
    this.load.on('progress', (v: number) => ui.loading.progress(v));
    this.load.json('manifest', 'assets/manifest.json');
    for (const m of MAP_IDS) this.load.tilemapTiledJSON(m, `assets/maps/${m}.json`);
    this.load.on('filecomplete-json-manifest', (_k: string, _t: string, m: Manifest) => {
      this.load.image('tileset', m.tileset.path);
      for (const [b, info] of Object.entries((m as Manifest & { biomes?: Record<string, { tileset: string }> }).biomes ?? {})) this.load.image(`tileset_${b}`, info.tileset);
      for (const [key, im] of Object.entries(m.images)) this.load.image(key, im.path);
      for (const [key, s] of Object.entries(m.spritesheets)) this.load.spritesheet(key, s.path, { frameWidth: s.frameWidth, frameHeight: s.frameHeight });
      for (const [key, c] of Object.entries(m.characters)) this.load.spritesheet(key, c.path, { frameWidth: c.frameWidth, frameHeight: c.frameHeight });
    });
  }

  create() {
    const m = this.cache.json.get('manifest') as Manifest;
    // 캐릭터: "<시트>:<애니>-<방향>"  예) player:walk-left
    for (const [key, c] of Object.entries(m.characters)) {
      for (const [name, a] of Object.entries(c.anims)) {
        this.anims.create({ key: `${key}:${name}`, frames: this.anims.generateFrameNumbers(key, { start: a.start, end: a.end }), frameRate: a.fps, repeat: a.repeat });
      }
    }
    const loop = (key: string, sheet: string, frames: number[], fps: number) =>
      this.anims.create({ key, frames: frames.map((f) => ({ key: sheet, frame: f })), frameRate: fps, repeat: -1 });
    for (const t of ['oak', 'oak_apple', 'oak_autumn', 'pine', 'pine_snow', 'palm']) loop(`${t}:sway`, t, [0, 1, 2, 3], 1.6);
    loop('tuft:sway', 'tuft', [0, 1, 2, 3], 2.5);
    loop('tallgrass:sway', 'tallgrass', [0, 1, 0, 2], 2);
    // 루미: [정면0, 정면1, 측면0, 측면1, 뒷면0, 뒷면1]
    for (const key of Object.values((m as Manifest & { lumi: Record<string, string> }).lumi ?? {})) {
      loop(`${key}:down`, key, [0, 1], 4); loop(`${key}:left`, key, [2, 3], 4); loop(`${key}:up`, key, [4, 5], 4);
    }
    for (let i = 0; i < 4; i++) loop(`butterfly:${i}`, 'butterfly', [i * 2, i * 2 + 1], 8);
    for (const c of ['chicken_white', 'chicken_brown']) {
      ['down', 'side', 'up'].forEach((d, r) => {
        loop(`${c}:idle-${d}`, c, [r * 6, r * 6, r * 6, r * 6 + 1], 3);
        loop(`${c}:walk-${d}`, c, [r * 6 + 2, r * 6 + 3], 7);
        this.anims.create({ key: `${c}:peck-${d}`, frames: [r * 6 + 4, r * 6 + 5, r * 6 + 4, r * 6 + 5].map((f) => ({ key: c, frame: f })), frameRate: 6, repeat: 0 });
      });
    }
    ui.loading.done();
    this.scene.start('Farm');
  }
}
