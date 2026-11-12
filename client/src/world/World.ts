import Phaser from 'phaser';
import { MapInfo, prop, type TiledMap } from '@shared/sim/MapInfo';
import type { MapId } from '@shared/types';
import { DEPTH, TILE, type Manifest } from '../config';
import { Grid } from './Grid';
import type { Surface } from '../audio/Sfx';
import { paintUrban } from '../three/Proto3D';

/** 실내에서 빛을 내는 물건 */
const LIGHT_OBJECTS = new Set(['lamp_floor', 'forge', 'fireplace', 'lamp']);

export interface WorldObject {
  id: number;
  type: string;
  cellX: number; cellY: number; cellW: number; cellH: number;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  shadow?: Phaser.GameObjects.Image;
  interact?: string;
  text?: string;
  /** 이 건물이 이어지는 실내 맵 (없으면 건물 종류로) */
  interior?: string;
  tall: boolean;
  blocks: boolean;
}

const TALL = new Set(['oak', 'oak_apple', 'oak_autumn', 'pine', 'pine_snow', 'palm', 'dead_tree', 'cave_mouth', 'ruin_pillar', 'portal', 'house', 'board', 'stall', 'stall_b']);
// 풍차 날개 회전 축 위치는 맵 스폰 'windmill_hub'
const NON_BLOCKING = new Set(['tuft', 'tallgrass', 'stairs_up', 'portal', 'cave_hole', 'glint']);
// 그림자 크기 (가로 배율, 세로 배율)
const SHADOW: Record<string, [number, number, number]> = {
  oak: [1.25, 1.3, -1], oak_apple: [1.25, 1.3, -1], oak_autumn: [1.25, 1.3, -1], pine: [1, 1.1, -1], pine_snow: [1, 1.1, -1], palm: [0.8, 0.8, -1], dead_tree: [0.9, 0.9, -1], cactus: [0.5, 0.5, 0],
  cave_mouth: [1.6, 0.9, -1], ruin_pillar: [0.55, 0.5, 0], ruin_broken: [0.55, 0.5, 0], altar_stone: [1.5, 0.8, -1], reeds: [0.4, 0.4, 0], bush: [1, 0.9, -1], bush_berry: [1, 0.9, -1],
  rock_big: [0.95, 0.8, -1], rock: [0.5, 0.55, 0], ore_stone: [0.5, 0.55, 0], ore_copper: [0.5, 0.55, 0], ore_iron: [0.5, 0.55, 0], ore_star: [0.5, 0.55, 0], well: [1, 0.9, -1], shipping_bin: [0.95, 0.7, -1], house: [3.6, 1.6, -2],
  stump: [0.5, 0.5, 0], log: [0.95, 0.6, 0], barrel: [0.5, 0.5, 0], crate: [0.5, 0.5, 0], hay: [0.5, 0.5, 0],
  scarecrow: [0.5, 0.5, 0], mailbox: [0.4, 0.45, 0], lamp: [0.35, 0.4, 0], sign: [0.45, 0.45, 0],
  bench: [0.9, 0.5, 0], planter: [0.5, 0.45, 0], board: [0.9, 0.5, 0], stall: [1.4, 0.7, -1], stall_b: [1.4, 0.7, -1], cafe_table: [0.6, 0.45, 0], anvil: [0.5, 0.4, 0],
};

/** 바닥이 매끈한 타일인 실내 (나머지 실내는 나무 바닥) */
const TILE_FLOORS = new Set(['in_center', 'in_lab', 'in_gym', 'league', 'tower', 'origin', 'in_shop_w', 'in_store']);

export interface LightSource { x: number; y: number; scale: number; tint: number; base: number }

/** 타일맵 레이어 + 맵 오브젝트 스프라이트 구성 */
export class World {
  readonly info: MapInfo;
  readonly grid: Grid;
  readonly map: Phaser.Tilemaps.Tilemap;
  readonly soil: Phaser.Tilemaps.TilemapLayer;
  readonly objects: WorldObject[] = [];
  /** 밤에 켜지는 빛 (가로등/창문 주변 후광) */
  readonly lights: LightSource[] = [];
  /** 밤에 켜지는 창문 발광 오버레이 */
  readonly windowGlows: Phaser.GameObjects.Image[] = [];
  readonly widthPx: number; readonly heightPx: number;
  private water: Phaser.GameObjects.TileSprite[] = [];
  private waterFrame = 0; private waterT = 0;
  private tufts: Phaser.GameObjects.Sprite[] = [];
  readonly grassCells = new Set<string>();
  /** 건물 실내 맵 (방 배경 한 장 + 가구) */
  readonly interior: boolean;
  /** 실내 창문 유리 (픽셀 사각형) + 시간대 하늘 그림 */
  windowRects: [number, number, number, number][] = [];
  private windowSky?: Phaser.GameObjects.Graphics;
  private skyKey = '';
  /** 실내 창밖: 아침(노을빛 여명) · 낮(파란 하늘) · 저녁(주황 노을) · 밤(별) */
  updateWindows(minutes: number, weather: string) {
    const g = this.windowSky; if (!g) return;
    const h = (minutes / 60) % 24;
    const phase = h >= 5 && h < 9 ? 'morning' : h >= 9 && h < 16 ? 'day' : h >= 16 && h < 19.5 ? 'evening' : 'night';
    const key = `${phase}:${weather}`; if (key === this.skyKey) return; this.skyKey = key;
    const SKY: Record<string, [number, number]> = { morning: [0xf6c6a0, 0xcfe8f4], day: [0x6fb8ec, 0xd6f0ff], evening: [0x7a4a8a, 0xff9a52], night: [0x0e1430, 0x2a3a72] };
    let [top, bot] = SKY[phase];
    if (weather === 'rain' && phase !== 'night') { top = 0x7a8696; bot = 0xaab4c0; }
    g.clear();
    const mixc = (a: number, b: number, t: number) => { const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t), gg = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t), bb = (a & 255) + (((b & 255) - (a & 255)) * t); return (Math.round(r) << 16) | (Math.round(gg) << 8) | Math.round(bb); };
    for (const [x, y, w, hh] of this.windowRects) {
      for (let j = 0; j < hh; j++) { g.fillStyle(mixc(top, bot, j / hh), 1); g.fillRect(x, y + j, w, 1); }
      if (phase === 'night') { g.fillStyle(0xfff6c8, 1); g.fillCircle(x + w - 6, y + 5, 2.5); g.fillStyle(0xffffff, 0.9); for (const [sx, sy] of [[4, 4], [9, 12], [15, 3], [6, 17], [18, 15]]) g.fillRect(x + sx, y + sy, 1, 1); }
      else if (phase === 'evening') { g.fillStyle(0xffe08a, 1); g.fillCircle(x + 7, y + hh - 4, 3.5); }
      else if (phase === 'morning') { g.fillStyle(0xfff2c0, 1); g.fillCircle(x + w - 7, y + hh - 5, 3); }
      else if (weather !== 'rain') { g.fillStyle(0xffffff, 1); g.fillRect(x + 3, y + 4, 6, 2); g.fillRect(x + 14, y + 9, 5, 2); }
      if (weather === 'rain') { g.fillStyle(0xdde8f4, 0.8); for (let k = 0; k < 6; k++) g.fillRect(x + 2 + k * 4, y + 3 + ((k * 7) % 14), 1, 3); }
      // 창살 (그림의 나무 창틀 십자를 다시 위에)
      g.fillStyle(0xa8683a, 1); g.fillRect(x + w / 2 - 1, y, 2, hh); g.fillRect(x, y + hh / 2 - 1, w, 2);
    }
  }
  /** 동굴 층 (배경 한 장 + 어둠) */
  readonly cave: boolean;
  readonly biome: string;
  readonly theme: string;
  readonly title: string;
  private tallGrass: Phaser.GameObjects.Sprite[] = [];

  constructor(private scene: Phaser.Scene, readonly manifest: Manifest, readonly mapId: MapId = 'farm') {
    const raw = scene.cache.tilemap.get(mapId).data as TiledMap;
    this.info = new MapInfo(raw);
    this.grid = new Grid(this.info);
    this.widthPx = this.info.width * TILE; this.heightPx = this.info.height * TILE;

    this.interior = String(prop(raw, 'interior', '')) === 'true';
    this.cave = String(prop(raw, 'cave', '')) === 'true';
    this.biome = String(prop(raw, 'biome', 'meadow'));
    this.theme = String(prop(raw, 'theme', ''));
    this.title = String(prop(raw, 'title', ''));
    const bg = String(prop(raw, 'bg', ''));
    if (bg && scene.textures.exists(bg)) scene.add.image(0, 0, bg).setOrigin(0).setDepth(DEPTH.ground);
    try { this.windowRects = JSON.parse(String(prop(raw, 'windows', '[]'))) as [number, number, number, number][]; } catch { this.windowRects = []; }
    if (this.windowRects.length) this.windowSky = scene.add.graphics().setDepth(DEPTH.ground + 1);
    // 물: 맵 전체 아래에 깔리는 애니메이션 타일스프라이트 (지면 타일의 투명 영역으로 비침)
    const wKey = scene.textures.exists(`water_${this.biome}0`) ? `water_${this.biome}` : 'water';
    if (!this.interior && !this.cave) for (let f = 0; f < 4; f++) this.water.push(scene.add.tileSprite(0, 0, this.widthPx + TILE, this.heightPx + TILE, `${wKey}${f}`).setOrigin(0).setDepth(DEPTH.water).setVisible(f === 0));

    this.map = scene.make.tilemap({ key: mapId });
    // 바이옴 타일셋 (눈·모래·화산재 …): 같은 배치에 색만 다른 이미지
    const tsKey = scene.textures.exists(`tileset_${this.biome}`) ? `tileset_${this.biome}` : 'tileset';
    const ts = this.map.addTilesetImage('tileset', tsKey)!;
    const off = Number(prop(raw, 'groundOffset', 8));
    this.map.createLayer('Ground', ts, off, off)?.setDepth(DEPTH.ground - 1);
    this.soil = this.map.createBlankLayer('Soil', ts, 0, 0)!.setDepth(DEPTH.soil);
    this.map.createLayer('Decor', ts, 0, 0)?.setDepth(DEPTH.decor);
    this.map.createLayer('Bridge', ts, 0, 0)?.setDepth(DEPTH.bridge);
    // 도시 바닥(차도·횡단보도·인도·광장): 2D 모드에서도 선명하게 표시
    const surface = String(prop(raw, 'surface', ''));
    if (surface) {
      const surfKey = `urban_surf_${mapId}`;
      if (!scene.textures.exists(surfKey)) {
        const ct = scene.textures.createCanvas(surfKey, this.widthPx, this.heightPx)!;
        paintUrban(ct.getContext(), surface.split('|'));
        ct.refresh();
      }
      scene.add.image(0, 0, surfKey).setOrigin(0).setDepth(DEPTH.decor + 1);
    }
    // 2.5D 절벽 · 계단 · 턱 (바닥 장식 위, 캐릭터 아래)
    if (raw.layers.some((l) => l.name === 'Cliff')) this.map.createLayer('Cliff', ts, 0, 0)?.setDepth(DEPTH.decor + 5);
    // 실내 조명 (벽난로·스탠드)
    //  실제로 빛을 내는 물건(벽난로 · 스탠드 · 화로) 근처에만 — 빈 벽에 가로등 같은 빛이 생기지 않게
    const glowing = this.info.objects.filter((o) => LIGHT_OBJECTS.has(String(o.type)));
    for (const l of this.info.spawnList.filter((o) => o.name === 'light')) {
      const ok = this.mapId === 'home' ? true : glowing.some((o) => Math.hypot(o.x - l.x, o.y - l.y) < 48);
      if (ok) this.lights.push({ x: l.x, y: l.y, scale: 1.3, tint: 0xffc070, base: 0.55 });
    }

    this.buildObjects();
  }

  private buildObjects() {
    const s = this.scene, m = this.manifest;
    const fences = new Set(this.info.objects.filter((o) => o.type === 'fence').map((o) => `${prop(o, 'cellX')},${prop(o, 'cellY')}`));
    for (const o of this.info.objects) {
      const type = o.type;
      const cellX = Number(prop(o, 'cellX', 0)), cellY = Number(prop(o, 'cellY', 0)), cellW = Number(prop(o, 'cellW', 1)), cellH = Number(prop(o, 'cellH', 1));
      const building = m.buildings?.[type];
      let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
      let blockoutFacility = false;
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
      } else if (img && String(prop(o, 'blockout', '')) !== '1') sprite = s.add.image(o.x, o.y, type).setOrigin(0.5, img.originY);
      else if (type === 'vine' && m.images.bush) sprite = s.add.image(o.x, o.y, 'bush').setOrigin(0.5, m.images.bush.originY).setTint(0x6a8a4a);   // 가시덩굴(풀베기 장애물): 그림 생기기 전까지 짙은 덤불
      else if (type === 'vend' || type === 'tlight') {
        // 도시 소품(그림 전): 자판기 = 빨간 상자, 신호등 = 기둥
        const vend = type === 'vend';
        s.add.rectangle(o.x, o.y, vend ? 12 : 3, vend ? 22 : 34, vend ? 0xd8463a : 0x4a4d55).setOrigin(0.5, 1).setDepth(o.y);
        if (!vend) s.add.rectangle(o.x, o.y - 34, 7, 12, 0x2b2d33).setOrigin(0.5, 0).setDepth(o.y);
        continue;
      }
      else if (String(prop(o, 'blockout', '')) === '1') {
        // 2.5D 스타일 다층 빌딩 (옥상 깊이 + 옆벽 입체 음영 + 창문 격자 + 1층 쇼윈도/차양 + 간판)
        const floors = Math.max(1, Number(prop(o, 'floors', 3)));
        const colHex = String(prop(o, 'color', '#c8c8c8'));
        const label = String(prop(o, 'label', ''));
        const accent = String(prop(o, 'accent', ''));
        const bKey = `bo25d:${type}:${colHex}:${floors}:${cellW}:${cellH}:${label}:${accent}`;
        if (!s.textures.exists(bKey)) {
          const fh = 12, lobby = 16, roofD = Math.max(10, Math.round(cellH * 7)), sideW = 6;
          const Wp = cellW * 16 + sideW, Hp = roofD + floors * fh + (lobby - fh);
          const ct = s.textures.createCanvas(bKey, Wp, Hp)!;
          const cx = ct.getContext();
          const baseC = Phaser.Display.Color.HexStringToColor(colHex);
          const shade = (f: number) => `rgb(${Math.round(baseC.red * f)},${Math.round(baseC.green * f)},${Math.round(baseC.blue * f)})`;
          const fw = cellW * 16;
          // 옥상 입체 윗면 (사다리꼴/평행사변형 2.5D 깊이감)
          cx.fillStyle = shade(0.68);
          cx.beginPath(); cx.moveTo(sideW, 0); cx.lineTo(Wp, 0); cx.lineTo(fw, roofD); cx.lineTo(0, roofD); cx.closePath(); cx.fill();
          cx.strokeStyle = shade(0.45); cx.lineWidth = 1; cx.stroke();
          // 오른쪽 옆벽 (2.5D 입체 옆면)
          cx.fillStyle = shade(0.72);
          cx.beginPath(); cx.moveTo(fw, roofD); cx.lineTo(Wp, 0); cx.lineTo(Wp, Hp - roofD); cx.lineTo(fw, Hp); cx.closePath(); cx.fill();
          // 정면 외벽
          cx.fillStyle = colHex; cx.fillRect(0, roofD, fw, Hp - roofD);
          cx.fillStyle = shade(0.5); cx.fillRect(0, roofD, fw, 2);
          // 층별 창문
          const glass = type === 'apart' ? '#5f7c93' : '#4e6f8c', glassHi = '#9ec4e0';
          for (let f = 0; f < floors - 1; f++) {
            const yy = roofD + f * fh;
            cx.fillStyle = shade(0.76); cx.fillRect(0, yy + fh - 1, fw, 1);
            const step = type === 'apart' ? 10 : 6, ww = type === 'apart' ? 6 : 4;
            for (let xx = 3; xx + ww <= fw - 3; xx += step) {
              cx.fillStyle = glass; cx.fillRect(xx, yy + 3, ww, 6);
              cx.fillStyle = glassHi; cx.fillRect(xx, yy + 3, ww, 1);
            }
          }
          // 1층 로비 + 차양 + 유리문
          const ly = Hp - lobby;
          cx.fillStyle = accent || shade(0.62); cx.fillRect(0, ly - 3, fw, 4);
          const dw = Math.min(16, fw - 8), dx = Math.floor(fw / 2 - dw / 2);
          cx.fillStyle = '#2d3b48'; cx.fillRect(dx, ly + 3, dw, lobby - 3);
          cx.fillStyle = glassHi; cx.fillRect(dx + 1, ly + 4, Math.max(2, dw / 2 - 2), lobby - 5);
          cx.fillRect(dx + dw / 2 + 1, ly + 4, Math.max(2, dw / 2 - 2), lobby - 5);
          if (label) {
            cx.font = 'bold 8px Galmuri9, sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
            const tw = Math.min(fw - 4, cx.measureText(label).width + 8), py = Math.max(roofD + 2, ly - 13);
            cx.fillStyle = accent || 'rgba(20,24,32,0.88)'; cx.fillRect(fw / 2 - tw / 2, py, tw, 10);
            cx.fillStyle = '#fff8ec'; cx.fillText(label, fw / 2, py + 5, fw - 6);
          }
          ct.refresh();
        }
        sprite = s.add.image(cellX * 16 + (cellW * 16) / 2 + 3, (cellY + 1) * 16, bKey).setOrigin(0.5, 1);
        blockoutFacility = true;
      } else continue;
      // 풀숲은 칸 아래쪽 기준 깊이 → 그 칸에 선 캐릭터의 다리를 덮음
      sprite.setDepth(o.y - (type === 'tuft' ? 6 : type === 'tallgrass' ? 0.5 : 0));
      if (type === 'tallgrass') { this.grassCells.add(`${cellX},${cellY}`); this.tallGrass.push(sprite as Phaser.GameObjects.Sprite); }

      const sh = SHADOW[type];
      let shadow: Phaser.GameObjects.Image | undefined;
      if (sh) shadow = s.add.image(o.x, o.y + sh[2], 'shadow').setScale(sh[0], sh[1]).setDepth(DEPTH.cursor - 1).setAlpha(type === 'house' ? 0.6 : 0.9);
      else if (building && !blockoutFacility) shadow = s.add.image(o.x, o.y - 2, 'shadow').setScale(cellW * 0.55, 1.5).setDepth(DEPTH.cursor - 1).setAlpha(0.6);

      const wo: WorldObject = {
        id: o.id, type, cellX, cellY, cellW, cellH, sprite, shadow, tall: TALL.has(type) || !!building || blockoutFacility, blocks: !NON_BLOCKING.has(type),
        interact: prop<string | undefined>(o, 'interact', undefined), text: prop<string | undefined>(o, 'text', undefined), interior: prop<string | undefined>(o, 'interior', undefined),
      };
      this.objects.push(wo);
      if (type === 'tuft') this.tufts.push(sprite as Phaser.GameObjects.Sprite);
      if (type === 'lamp') {
        this.lights.push({ x: o.x, y: o.y - 37, scale: 0.75, tint: 0xffd88a, base: 1 }, { x: o.x, y: o.y - 7, scale: 1.2, tint: 0xffb860, base: 0.5 });
      }
      if ((type === 'house' || building) && img && !blockoutFacility) {
        const top = o.y - img!.h * img!.originY;
        const glowKey = type === 'house' ? 'house_glow' : `${type}_glow`;
        if (s.textures.exists(glowKey)) this.windowGlows.push(s.add.image(o.x, o.y, glowKey).setOrigin(0.5, img!.originY).setDepth(o.y + 1).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
        const half = img!.w / 2;
        this.lights.push({ x: o.x - half * 0.45, y: o.y - 26, scale: 1.1, tint: 0xffc870, base: 1 }, { x: o.x + half * 0.45, y: o.y - 26, scale: 1.1, tint: 0xffc870, base: 1 });
        if (type === 'house') { wo.interact ??= 'door'; this.chimneySmoke(o.x + 30, o.y - 112); }
        else if (building?.chimneyX != null) this.chimneySmoke(o.x - half + building.chimneyX + 4, top + 1, type === 'smithy');
      }
    }
  }

  private chimneySmoke(x: number, y: number, dark = false) {
    if (!this.scene.textures.exists('smoke')) {
      const g = this.scene.make.graphics({}, false);
      g.fillStyle(0xffffff, 1).fillCircle(4, 4, 4); g.generateTexture('smoke', 8, 8); g.destroy();
    }
    this.scene.add.particles(x, y, 'smoke', {
      lifespan: 3200, frequency: dark ? 260 : 420, speedY: { min: -14, max: -9 }, speedX: { min: 2, max: 7 },
      scale: { start: 0.5, end: 1.6 }, alpha: { start: 0.55, end: 0 }, tint: dark ? 0x8a8690 : 0xd8d4d0,
    }).setDepth(DEPTH.overlay - 10);
  }

  /** 발밑 재질 (발소리용): 다리 · 부두 → 실내 → 동굴 → 풀숲 → 갈아 둔 밭 → 지형 + 바이옴 */
  surfaceAt(px: number, py: number): Surface {
    const cx = Math.floor(px / TILE), cy = Math.floor((py - 3) / TILE);
    if (this.map.getTileAt(cx, cy, false, 'Bridge')) return 'wood';
    if (this.info.isStairs(cx, cy)) return 'stone';
    if (this.interior) return TILE_FLOORS.has(this.mapId) || this.mapId.startsWith('gym_') ? 'tile' : 'wood';
    if (this.cave) return this.theme === 'ice' ? 'ice' : 'cave';
    if (this.grassCells.has(`${cx},${cy}`)) return 'tallgrass';
    if (this.soil.getTileAt(cx, cy)) return 'dirt';
    const t = this.info.terrainAt(cx, cy), b = this.biome;
    if (t === '2') return 'water';
    if (t === '3' || b === 'distortion') return 'stone';
    if (b === 'snow') return 'snow';
    if (b === 'desert' || b === 'beach') return t === '1' || b === 'desert' ? 'sand' : 'grass';
    if (t === '1') return b === 'swamp' ? 'water' : b === 'city' ? 'stone' : 'dirt';
    return b === 'volcano' ? 'dirt' : 'grass';
  }

  // ── 설치물 (플레이어가 놓은 울타리 · 상자 …) ────────────
  readonly placed = new Map<string, { type: string; x: number; y: number; sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image; shadow?: Phaser.GameObjects.Image }>();
  addPlaced(id: string, type: string, cx: number, cy: number, fx = true) {
    if (this.placed.has(id)) return;
    const s = this.scene, m = this.manifest;
    const x = cx * TILE + TILE / 2, y = (cy + 1) * TILE;
    const sheet = m.spritesheets[type], img = m.images[type];
    let sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
    if (sheet) sprite = s.add.sprite(x, y, type, 0).setOrigin(0.5, sheet.originY);
    else if (img) sprite = s.add.image(x, y, type).setOrigin(0.5, img.originY);
    else return;
    sprite.setDepth(y);
    const sh = SHADOW[type];
    const shadow = sh ? s.add.image(x, y + sh[2], 'shadow').setScale(sh[0], sh[1]).setDepth(DEPTH.cursor - 1).setAlpha(0.9) : undefined;
    this.placed.set(id, { type, x: cx, y: cy, sprite, shadow });
    this.grid.setBlocked(cx, cy, true);
    if (type === 'lamp') this.lights.push({ x, y: y - 37, scale: 0.75, tint: 0xffd88a, base: 1 }, { x, y: y - 7, scale: 1.2, tint: 0xffb860, base: 0.5 });
    if (type === 'fence') this.linkFences();
    if (fx) s.tweens.add({ targets: sprite, scaleY: { from: 0.3, to: 1 }, duration: 220, ease: 'Back.Out' });
  }
  removePlaced(id: string) {
    const o = this.placed.get(id); if (!o) return;
    this.placed.delete(id);
    this.grid.setBlocked(o.x, o.y, false);
    if (o.type === 'lamp') { const px = o.x * TILE + TILE / 2; for (let i = this.lights.length - 1; i >= 0; i--) if (this.lights[i].x === px && Math.abs(this.lights[i].y - (o.y + 1) * TILE) < 40) this.lights.splice(i, 1); }
    this.scene.tweens.add({ targets: [o.sprite, o.shadow].filter(Boolean), alpha: 0, scaleY: 0.2, duration: 200, onComplete: () => { o.sprite.destroy(); o.shadow?.destroy(); } });
    if (o.type === 'fence') this.linkFences();
  }
  /** 이 칸의 잡초(아직 안 뽑은 풀포기) */
  weedAt(cx: number, cy: number) { return this.objects.find((o) => o.type === 'tuft' && o.sprite.active && o.cellX === cx && o.cellY === cy); }
    placedAt(cx: number, cy: number) { for (const [id, o] of this.placed) if (o.x === cx && o.y === cy) return id; return undefined; }
  /** 울타리: 좌우 이웃(맵 울타리 + 설치 울타리)과 이어진 모양 */
  private linkFences() {
    const has = (x: number, y: number) => [...this.placed.values()].some((o) => o.type === 'fence' && o.x === x && o.y === y) || this.objects.some((o) => o.type === 'fence' && o.sprite.active && o.cellX === x && o.cellY === y);
    for (const o of this.placed.values()) {
      if (o.type !== 'fence' || !(o.sprite instanceof Phaser.GameObjects.Sprite)) continue;
      const l = has(o.x - 1, o.y), r = has(o.x + 1, o.y);
      o.sprite.setFrame(l && r ? 3 : r ? 1 : l ? 2 : 0);
    }
  }

  /** 셀 (cx,cy)를 점유한 오브젝트 */
  objectAt(cx: number, cy: number): WorldObject | undefined {
    return this.objects.find((o) => o.sprite.active && o.blocks && cy <= o.cellY && cy > o.cellY - o.cellH && cx >= o.cellX && cx < o.cellX + o.cellW);
  }

  removeObject(id: number, fx = true) {
    const o = this.objects.find((ob) => ob.id === id);
    if (!o || !o.sprite.active) return;
    for (let y = o.cellY - o.cellH + 1; y <= o.cellY; y++) for (let x = o.cellX; x < o.cellX + o.cellW; x++) this.grid.setBlocked(x, y, false);
    if (fx) {
      this.scene.tweens.add({ targets: [o.sprite, o.shadow].filter(Boolean), alpha: 0, scaleY: 0.2, duration: 220, onComplete: () => { o.sprite.destroy(); o.shadow?.destroy(); } });
    } else { o.sprite.destroy(); o.shadow?.destroy(); }
  }

  /** 매일 다시 생기는 채석장 바위 복원 */
  restoreObject(id: number) {
    const o = this.objects.find((ob) => ob.id === id);
    if (!o || o.sprite.active) return;
    const raw = this.info.objects.find((ob) => ob.id === id)!;
    const img = this.manifest.images[o.type];
    if (!img) return;
    o.sprite = this.scene.add.image(raw.x, raw.y, o.type).setOrigin(0.5, img.originY).setDepth(raw.y);
    for (let y = o.cellY - o.cellH + 1; y <= o.cellY; y++) for (let x = o.cellX; x < o.cellX + o.cellW; x++) this.grid.setBlocked(x, y, true);
  }
  mineKind(o: WorldObject) { return this.info.objects.find((ob) => ob.id === o.id)?.properties?.find((p) => p.name === 'mine')?.value as string | undefined ?? (o.type === 'rock' || o.type === 'rock_big' ? 'stone' : undefined); }

  /** 오브젝트 흔들기 (도끼질/스침 반응) */
  shake(o: WorldObject, power = 2) {
    const x0 = o.sprite.x;
    this.scene.tweens.add({ targets: o.sprite, x: { from: x0 - power, to: x0 + power }, duration: 50, yoyo: true, repeat: 2, onComplete: () => o.sprite.setX(x0) });
  }

  update(dt: number, player: { x: number; y: number }) {
    // 물 애니메이션
    this.waterT += dt;
    if (this.water.length && this.waterT > 280) { this.waterT = 0; this.water[this.waterFrame].setVisible(false); this.waterFrame = (this.waterFrame + 1) % 4; this.water[this.waterFrame].setVisible(true); }
    for (const w of this.water) w.tilePositionX += dt * 0.002;
    if (this.interior) return;
    // 플레이어가 큰 오브젝트 뒤에 가려지면 반투명
    for (const o of this.objects) {
      if (!o.tall || !o.sprite.active) continue;
      if (Math.abs(o.sprite.x - player.x) > 80 || o.sprite.y - player.y > 130 || player.y > o.sprite.y + 4) { if (o.sprite.alpha < 1) o.sprite.alpha = Math.min(1, o.sprite.alpha + dt / 200); continue; }
      const b = o.sprite.getBounds();
      const behind = player.y < o.sprite.y - 2 && player.x > b.left + 4 && player.x < b.right - 4 && player.y - 18 < b.bottom - 6 && player.y > b.top + 8;
      const target = behind ? 0.55 : 1;
      o.sprite.alpha += (target - o.sprite.alpha) * Math.min(1, dt / 120);
    }
    // 풀숲 지나가면 흔들림
    for (const t of this.tallGrass) {
      if (Math.abs(t.x - player.x) < 9 && Math.abs(t.y - player.y) < 9 && !t.getData('rustle')) {
        t.setData('rustle', true);
        this.scene.tweens.add({ targets: t, scaleX: { from: 1.25, to: 1 }, scaleY: { from: 0.8, to: 1 }, duration: 260, ease: 'Back.Out', onComplete: () => t.setData('rustle', false) });
      }
    }
    for (const t of this.tufts) {
      if (!t.active) continue;
      if (Math.abs(t.x - player.x) < 8 && Math.abs(t.y - player.y) < 6 && !t.getData('rustle')) {
        t.setData('rustle', true);
        this.scene.tweens.add({ targets: t, angle: { from: -12, to: 12 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => { t.setAngle(0); t.setData('rustle', false); } });
      }
    }
  }
}
