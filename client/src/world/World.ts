import Phaser from 'phaser';
import { MapInfo, prop, type TiledMap } from '@shared/sim/MapInfo';
import { DEPTH, TILE, type Manifest } from '../config';
import { Grid } from './Grid';

export interface WorldObject {
  id: number;
  type: string;
  cellX: number; cellY: number; cellW: number;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  interact?: string;
  text?: string;
  tall: boolean;
  blocks: boolean;
}

const TALL = new Set(['oak', 'oak_apple', 'pine', 'house']);
const NON_BLOCKING = new Set(['tuft']);
// 그림자 크기 (가로 배율, 세로 배율)
const SHADOW: Record<string, [number, number, number]> = {
  oak: [1.25, 1.3, -1], oak_apple: [1.25, 1.3, -1], pine: [1, 1.1, -1], bush: [1, 0.9, -1], bush_berry: [1, 0.9, -1],
  rock_big: [0.95, 0.8, -1], rock: [0.5, 0.55, 0], well: [1, 0.9, -1], shipping_bin: [0.95, 0.7, -1], house: [3.6, 1.6, -2],
  stump: [0.5, 0.5, 0], log: [0.95, 0.6, 0], barrel: [0.5, 0.5, 0], crate: [0.5, 0.5, 0], hay: [0.5, 0.5, 0],
  scarecrow: [0.5, 0.5, 0], mailbox: [0.4, 0.45, 0], lamp: [0.35, 0.4, 0], sign: [0.45, 0.45, 0],
};

/** 타일맵 레이어 + 맵 오브젝트 스프라이트 구성 */
export class World {
  readonly info: MapInfo;
  readonly grid: Grid;
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly soil: Phaser.Tilemaps.TilemapLayer;
  readonly objects: WorldObject[] = [];
  readonly lamps: { x: number; y: number }[] = [];
  houseGlow?: Phaser.GameObjects.Image;
  readonly widthPx: number; readonly heightPx: number;
  private water: Phaser.GameObjects.TileSprite[] = [];
  private waterFrame = 0; private waterT = 0;
  private tufts: Phaser.GameObjects.Sprite[] = [];

  constructor(private scene: Phaser.Scene, readonly manifest: Manifest) {
    const raw = scene.cache.tilemap.get('farm').data as TiledMap;
    this.info = new MapInfo(raw);
    this.grid = new Grid(this.info);
    this.widthPx = this.info.width * TILE; this.heightPx = this.info.height * TILE;

    // 물: 맵 전체 아래에 깔리는 애니메이션 타일스프라이트 (지면 타일의 투명 영역으로 비침)
    for (let f = 0; f < 4; f++) this.water.push(scene.add.tileSprite(0, 0, this.widthPx + TILE, this.heightPx + TILE, `water${f}`).setOrigin(0).setDepth(DEPTH.water).setVisible(f === 0));

    this.map = scene.make.tilemap({ key: 'farm' });
    const ts = this.map.addTilesetImage('tileset', 'tileset')!;
    const off = Number(prop(raw, 'groundOffset', 8));
    this.map.createLayer('Ground', ts, off, off)!.setDepth(DEPTH.ground);
    this.soil = this.map.createBlankLayer('Soil', ts, 0, 0)!.setDepth(DEPTH.soil);
    this.map.createLayer('Decor', ts, 0, 0)!.setDepth(DEPTH.decor);
    this.map.createLayer('Bridge', ts, 0, 0)!.setDepth(DEPTH.bridge);

    this.buildObjects();
  }

  private buildObjects() {
    const s = this.scene, m = this.manifest;
    const fences = new Set(this.info.objects.filter((o) => o.type === 'fence').map((o) => `${prop(o, 'cellX')},${prop(o, 'cellY')}`));
    for (const o of this.info.objects) {
      const type = o.type;
      const cellX = Number(prop(o, 'cellX', 0)), cellY = Number(prop(o, 'cellY', 0)), cellW = Number(prop(o, 'cellW', 1));
      let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
      const sheet = m.spritesheets[type], img = m.images[type];
      if (sheet) {
        const sp = s.add.sprite(o.x, o.y, type, 0).setOrigin(0.5, sheet.originY);
        if (s.anims.exists(`${type}:sway`)) {
          sp.play({ key: `${type}:sway`, startFrame: Number(prop(o, 'frameOffset', 0)) % 4 });
          sp.anims.timeScale = 0.8 + Math.random() * 0.4;
        }
        if (type === 'fence') {
          const l = fences.has(`${cellX - 1},${cellY}`), r = fences.has(`${cellX + 1},${cellY}`);
          sp.setFrame(l && r ? 3 : r ? 1 : l ? 2 : 0);
        }
        sprite = sp;
      } else if (img) sprite = s.add.image(o.x, o.y, type).setOrigin(0.5, img.originY);
      else continue;
      sprite.setDepth(o.y - (type === 'tuft' ? 6 : 0));

      const sh = SHADOW[type];
      let shadow: Phaser.GameObjects.Image | undefined;
      if (sh) shadow = s.add.image(o.x, o.y + sh[2], 'shadow').setScale(sh[0], sh[1]).setDepth(DEPTH.cursor - 1).setAlpha(type === 'house' ? 0.6 : 0.9);

      const wo: WorldObject = {
        id: o.id, type, cellX, cellY, cellW, sprite, shadow, tall: TALL.has(type), blocks: !NON_BLOCKING.has(type),
        interact: prop<string | undefined>(o, 'interact', undefined), text: prop<string | undefined>(o, 'text', undefined),
      };
      this.objects.push(wo);
      if (type === 'tuft') this.tufts.push(sprite as Phaser.GameObjects.Sprite);
      if (type === 'lamp') this.lamps.push({ x: o.x, y: o.y - 37 });
      if (type === 'house') {
        this.houseGlow = s.add.image(o.x, o.y, 'house_glow').setOrigin(0.5, img!.originY).setDepth(o.y + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
        wo.interact = 'door';
        this.chimneySmoke(o.x + 30, o.y - 112);
      }
    }
  }

  private chimneySmoke(x: number, y: number) {
    const g = this.scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4); g.generateTexture('smoke', 8, 8); g.destroy();
    this.scene.add.particles(x, y, 'smoke', {
      lifespan: 3200, frequency: 420, speedY: { min: -14, max: -9 }, speedX: { min: 2, max: 7 },
      scale: { start: 0.5, end: 1.6 }, alpha: { start: 0.55, end: 0 }, tint: 0xd8d4d0,
    }).setDepth(DEPTH.overlay - 10);
  }

  /** 셀 (cx,cy)를 점유한 오브젝트 */
  objectAt(cx: number, cy: number): WorldObject | undefined {
    return this.objects.find((o) => o.sprite.active && o.blocks && cy === o.cellY && cx >= o.cellX && cx < o.cellX + o.cellW)
      ?? this.objects.find((o) => o.sprite.active && o.type === 'house' && cy <= o.cellY && cy >= o.cellY - 3 && cx >= o.cellX && cx < o.cellX + o.cellW)
      ?? this.objects.find((o) => o.sprite.active && (o.type === 'well') && cy <= o.cellY && cy >= o.cellY - 1 && cx >= o.cellX && cx < o.cellX + o.cellW);
  }

  removeObject(id: number, fx = true) {
    const o = this.objects.find((ob) => ob.id === id);
    if (!o || !o.sprite.active) return;
    for (let x = o.cellX; x < o.cellX + o.cellW; x++) this.grid.setBlocked(x, o.cellY, false);
    if (fx) {
      this.scene.tweens.add({ targets: [o.sprite, o.shadow].filter(Boolean), alpha: 0, scaleY: 0.2, duration: 220, onComplete: () => { o.sprite.destroy(); o.shadow?.destroy(); } });
    } else { o.sprite.destroy(); o.shadow?.destroy(); }
  }

  /** 오브젝트 흔들기 (도끼질/스침 반응) */
  shake(o: WorldObject, power = 2) {
    const x0 = o.sprite.x;
    this.scene.tweens.add({ targets: o.sprite, x: { from: x0 - power, to: x0 + power }, duration: 50, yoyo: true, repeat: 2, onComplete: () => o.sprite.setX(x0) });
  }

  update(dt: number, player: { x: number; y: number }) {
    // 물 애니메이션
    this.waterT += dt;
    if (this.waterT > 280) { this.waterT = 0; this.water[this.waterFrame].setVisible(false); this.waterFrame = (this.waterFrame + 1) % 4; this.water[this.waterFrame].setVisible(true); }
    for (const w of this.water) w.tilePositionX += dt * 0.002;
    // 플레이어가 큰 오브젝트 뒤에 가려지면 반투명
    for (const o of this.objects) {
      if (!o.tall || !o.sprite.active) continue;
      if (Math.abs(o.sprite.x - player.x) > 64 || o.sprite.y - player.y > 130 || player.y > o.sprite.y + 4) { if (o.sprite.alpha < 1) o.sprite.alpha = Math.min(1, o.sprite.alpha + dt / 200); continue; }
      const b = o.sprite.getBounds();
      const behind = player.y < o.sprite.y - 2 && player.x > b.left + 4 && player.x < b.right - 4 && player.y - 18 < b.bottom - 6 && player.y > b.top + 8;
      const target = behind ? 0.55 : 1;
      o.sprite.alpha += (target - o.sprite.alpha) * Math.min(1, dt / 120);
    }
    // 풀숲 지나가면 흔들림
    for (const t of this.tufts) {
      if (Math.abs(t.x - player.x) < 8 && Math.abs(t.y - player.y) < 6 && !t.getData('rustle')) {
        t.setData('rustle', true);
        this.scene.tweens.add({ targets: t, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => { t.setAngle(0); t.setData('rustle', false); } });
      }
    }
  }
}
