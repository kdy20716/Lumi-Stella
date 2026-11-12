import Phaser from 'phaser';
import { CROPS } from '@shared/data';
import { SoilState, type FarmTile } from '@shared/types';
import { TILE, type Manifest } from '../config';
import type { World } from '../world/World';

/** 시뮬레이션 상태(FarmTile) → 경작지 오토타일 + 작물 스프라이트 */
export class FarmRenderer {
  private tiles = new Map<string, FarmTile>();
  private crops = new Map<string, Phaser.GameObjects.Sprite>();
  private rowDry: number; private rowWet: number; private cols: number;

  constructor(private scene: Phaser.Scene, private world: World, manifest: Manifest) {
    this.rowDry = manifest.tileset.ROW.TILLED; this.rowWet = manifest.tileset.ROW.TILLED_WET; this.cols = manifest.tileset.columns;
  }

  load(tiles: FarmTile[]) { for (const t of tiles) this.apply(t, false); }
  get(x: number, y: number) { return this.tiles.get(`${x},${y}`); }
  getTiles() { return this.tiles; }
  getCrops() { return this.crops; }

  apply(t: FarmTile, fx = true) {
    const k = `${t.x},${t.y}`;
    const prev = this.tiles.get(k);
    if (t.soil === SoilState.Unplowed) this.tiles.delete(k);
    else this.tiles.set(k, { ...t, crop: t.crop ? { ...t.crop } : null });
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) this.paintSoil(t.x + dx, t.y + dy);
    this.paintCrop(t, prev, fx);
    if (fx && prev && prev.soil !== SoilState.Watered && t.soil === SoilState.Watered) this.splash(t.x, t.y);
    if (fx && !prev && t.soil !== SoilState.Unplowed) this.dirtPuff(t.x, t.y);
  }

  private paintSoil(x: number, y: number) {
    const t = this.tiles.get(`${x},${y}`);
    if (!t) { this.world.soil.removeTileAt(x, y); return; }
    const has = (dx: number, dy: number) => this.tiles.has(`${x + dx},${y + dy}`);
    const mask = (has(0, -1) ? 1 : 0) | (has(1, 0) ? 2 : 0) | (has(0, 1) ? 4 : 0) | (has(-1, 0) ? 8 : 0);
    const row = t.soil === SoilState.Watered ? this.rowWet : this.rowDry;
    this.world.soil.putTileAt(this.world.map.tilesets[0].firstgid + row * this.cols + mask, x, y);
  }

  private paintCrop(t: FarmTile, prev: FarmTile | undefined, fx: boolean) {
    const k = `${t.x},${t.y}`;
    let sp = this.crops.get(k);
    if (!t.crop || t.soil === SoilState.Unplowed) { if (sp) { this.crops.delete(k); this.pop(sp); } return; }
    const def = CROPS[t.crop.id];
    const frame = def.spriteRow * 5 + Math.min(4, t.crop.stage);
    if (!sp) {
      sp = this.scene.add.sprite(t.x * TILE + 8, t.y * TILE + TILE, 'crops', frame).setOrigin(0.5, 31 / 32);
      sp.setDepth(t.y * TILE + TILE - 3);
      this.crops.set(k, sp);
      if (fx) { sp.setScale(0.2, 0.2); this.scene.tweens.add({ targets: sp, scale: 1, duration: 260, ease: 'Back.Out' }); }
    } else if (Number(sp.frame.name) !== frame) {
      sp.setFrame(frame);
      if (fx) this.scene.tweens.add({ targets: sp, scaleY: { from: 0.8, to: 1 }, duration: 240, ease: 'Back.Out' });
    }
    // 다 자란 작물은 살랑살랑
    const mature = t.crop.stage >= 4;
    if (mature && !sp.getData('sway')) {
      sp.setData('sway', this.scene.tweens.add({ targets: sp, angle: { from: -2, to: 2 }, duration: 1300 + Math.random() * 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' }));
    } else if (!mature && sp.getData('sway')) { (sp.getData('sway') as Phaser.Tweens.Tween).stop(); sp.setData('sway', null); sp.setAngle(0); }
    void prev;
  }

  /** 플레이어가 지나가면 작물 흔들림 */
  brush(px: number, py: number) {
    const k = `${Math.floor(px / TILE)},${Math.floor((py - 3) / TILE)}`;
    const sp = this.crops.get(k);
    if (sp && !sp.getData('brushing')) {
      sp.setData('brushing', true);
      this.scene.tweens.add({ targets: sp, scaleX: { from: 1.15, to: 1 }, duration: 260, ease: 'Back.Out', onComplete: () => sp.setData('brushing', false) });
    }
  }

  private pop(sp: Phaser.GameObjects.Sprite) {
    (sp.getData('sway') as Phaser.Tweens.Tween | null)?.stop();
    this.scene.tweens.add({ targets: sp, y: sp.y - 10, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => sp.destroy() });
  }

  private splash(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const d = this.scene.add.rectangle(x * TILE + 8 + Phaser.Math.Between(-5, 5), y * TILE + 9, 1, 2, 0x8fcdee).setDepth(y * TILE + 20);
      this.scene.tweens.add({ targets: d, y: d.y + Phaser.Math.Between(-7, -2), x: d.x + Phaser.Math.Between(-4, 4), alpha: 0, duration: 380 + i * 30, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
  }
  private dirtPuff(x: number, y: number) {
    for (let i = 0; i < 5; i++) {
      const d = this.scene.add.rectangle(x * TILE + 8 + Phaser.Math.Between(-5, 5), y * TILE + 10, 2, 2, 0x966139).setDepth(y * TILE + 20);
      this.scene.tweens.add({ targets: d, y: d.y - Phaser.Math.Between(3, 8), x: d.x + Phaser.Math.Between(-5, 5), alpha: 0, duration: 420, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
  }
}
