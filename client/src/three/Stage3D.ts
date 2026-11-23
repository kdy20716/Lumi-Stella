// 인게임 포켓몬 5세대(블랙·화이트) 스타일 2.5D 렌더러
//  - FarmScene 의 실시간 상태(플레이어·파트너 루미·NPC·트레이너·컷신 배우·농장 밭/작물·채집물·시간대/날씨)를
//    그대로 받아 원근 3D 지형 + 입체 건물 + 2D 도트 빌보드 디오라마로 실시간 렌더링
//  - 배틀 씬(BattleScene)이 열릴 때는 자동으로 숨겨지고, V 키 또는 상단 버튼으로 2.5D / 2D 즉시 전환 가능
import type Phaser from 'phaser';
import * as THREE from 'three';
import { CHAT_BUBBLES } from '@shared/bmShop';
import { prop, type MapInfo, type TiledMap } from '@shared/sim/MapInfo';
import { SoilState, type Dir, type FarmTile, type MapId } from '@shared/types';
import { TILE, type Manifest } from '../config';
import type { World } from '../world/World';
import { Fx3D, syncPhaserCamOverlay, type BurstKind } from './Fx3D';
import { buildInteriorRoom3D, hasInteriorProp3D, makeInteriorProp3D } from './Interior3D';
import { buildOuterSkirt, buildTerrainMesh, computeHeights, type Heights } from './Terrain';
import {
  Billboard,
  makeBlockout,
  makeBuilding,
  makeCaveWalls,
  makeSpire,
  makeStreetProp,
  paintUrban,
  pixelTex,
  type Tall,
} from './Proto3D';

const T = TILE;
type MapWithProps = TiledMap & { properties?: { name: string; value: string | number | boolean }[] };

interface DynEntry {
  uid: number;
  key: string;
  cols: number;
  rows: number;
  fw: number;
  fh: number;
  bb: Billboard;
  shadow: THREE.Mesh;
  seen: boolean;
}

export class Stage3D {
  private static renderer?: THREE.WebGLRenderer;
  private static listeners = new Set<(enabled: boolean) => void>();
  static renderSnapshot?: () => void;

  static get enabled() {
    return true;
  }
  static set enabled(_v: boolean) {
    // 2.5D is permanently enabled
  }
  static onToggle(fn: (enabled: boolean) => void): () => void {
    Stage3D.listeners.add(fn);
    return () => Stage3D.listeners.delete(fn);
  }
  static getSharedRenderer(): THREE.WebGLRenderer {
    if (!Stage3D.renderer) {
      const r = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      r.setClearColor(0x14201a);
      Object.assign(r.domElement.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        imageRendering: 'pixelated',
        pointerEvents: 'none',
        zIndex: '1',
      });
      r.domElement.id = 'stage3d';
      const gameEl = document.getElementById('game');
      if (gameEl?.parentElement) gameEl.parentElement.insertBefore(r.domElement, document.getElementById('ui'));
      else document.body.appendChild(r.domElement);
      Stage3D.renderer = r;
    }
    return Stage3D.renderer;
  }
  static get canvas(): HTMLCanvasElement | undefined {
    return Stage3D.renderer?.domElement;
  }

  private scene3d = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, 1, 0.8, 300);
  private hts!: Heights;
  private fx!: Fx3D;
  private interior = false;
  private cave = false;
  private biome = 'meadow';
  private waterTex: THREE.Texture[] = [];
  private waterMat?: THREE.MeshBasicMaterial;
  private sway: { tex: THREE.Texture; frames: number }[] = [];
  private tall: Tall[] = [];
  private glowMats: THREE.MeshBasicMaterial[] = [];
  private spireGems: THREE.Object3D[] = [];
  private objMeshes = new Map<number, THREE.Object3D[]>();
  private placedMeshes = new Map<string, THREE.Object3D[]>();
  private dynPool = new Map<Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, DynEntry>();
  private dynSeq = 0;
  private labelPool = new Map<Phaser.GameObjects.GameObject, { mesh: THREE.Mesh; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; text: string; seen: boolean }>();
  private shadowTex!: THREE.Texture;
  private torchMesh?: THREE.Mesh;
  private torchMat?: THREE.MeshBasicMaterial;
  private groundGlowTex?: THREE.CanvasTexture;
  private groundGlowMat?: THREE.MeshBasicMaterial;
  private bulbGlowMat?: THREE.MeshBasicMaterial;
  private bladesMesh?: THREE.Mesh;
  private cursorMesh?: THREE.Mesh;
  private campfires: { tex?: THREE.Texture; frames: number; glowOuter: THREE.Mesh; glowInner: THREE.Mesh; halo: THREE.Mesh; outerMat: THREE.MeshBasicMaterial; innerMat: THREE.MeshBasicMaterial; haloMat: THREE.MeshBasicMaterial; gx: number; gy: number; gz: number; phase: number }[] = [];
  private campfireT = 0;
  private seaCurrentTexs: THREE.Texture[] = [];
  private whirlpoolTexs: { tex: THREE.Texture; frames: number }[] = [];
  private whirlpoolT = 0;
  private surfMount?: THREE.Group;
  private surfRipple?: THREE.Mesh;
  private gimmickSpin: THREE.Object3D[] = [];
  private gateMeshes = new Map<string, THREE.Object3D[]>();
  private switchCaps = new Map<string, { cap: THREE.Mesh; baseY: number; col: number }[]>();
  private soilCv?: HTMLCanvasElement;
  private soilTex?: THREE.Texture;
  private soilDirty = true;
  private waterT = 0;
  private bridgeCamBoost = 0;
  private wardenCones: THREE.Mesh[] = [];
  private swayT = 0;
  private camTarget = new THREE.Vector3();
  private camInit = false;
  private camYaw = 0;
  private lastPx = 0;
  private lastVelX = 0;
  private smoothGy = 0;
  private cam = { el: 38, fov: 22, dist: 24, stretch: true };
  private tintMaterials: THREE.MeshBasicMaterial[] = [];
  private lastTintColor = new THREE.Color(0xffffff);
  private lastTintHex = -1;
  private nightAlpha = 0;
  private hiddenByBattle = false;
  private unsubToggle?: () => void;
  private dynArrows: { group: THREE.Group; baseDir: string; altDir: string; railGroup: string; curAngle: number }[] = [];
  private railLevers: { lever: THREE.Group; railGroup: string; curRot: number }[] = [];
  private cardMeshes = new Map<number, { group: THREE.Group; back: THREE.Mesh; front: THREE.Mesh; flip: number }>();
  private prismMeshes = new Map<number, { rotor: THREE.Group; crystal: THREE.Mesh; curRot: number }>();
  private laserDestRings = new Map<number, { gem: THREE.Mesh; mat: THREE.MeshBasicMaterial }>();
  private laserBeamGroup: THREE.Group | null = null;
  private laserSig = '';
  private quizMats = new Map<string, { pad: THREE.MeshBasicMaterial; rim: THREE.MeshBasicMaterial }[]>();
  private runeNodes: { id: number; idx: number; padMat: THREE.MeshBasicMaterial; baseColor: number; gem: THREE.Mesh; phase: number }[] = [];
  private demoGems: { gem: THREE.Mesh; baseY: number; mat: THREE.MeshBasicMaterial }[] = [];
  private resetPads: { ring: THREE.Mesh; baseY: number }[] = [];
  private snowShards: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number }[] = [];
  private waterSwitchCaps: { cap: THREE.Mesh; level: number; baseY: number }[] = [];
  private waterBridgeMeshes: { group: THREE.Group; reqLevel: number; baseY: number; mat: THREE.MeshBasicMaterial; curY: number }[] = [];
  private pushBlockMeshes = new Map<number, { group: THREE.Group; mat: THREE.MeshBasicMaterial; curX: number; curZ: number; curY: number; baseY: number }>();
  private crackedTileMeshes = new Map<number, { mat: THREE.MeshBasicMaterial; rimMat: THREE.MeshBasicMaterial; gateId: string }>();
  private gymPuzzle: {
    flippedRails?: Set<string>;
    revealedCards?: Set<number>;
    prismRots?: Map<number, number>;
    litLaserDests?: Set<number>;
    laserSegments?: [number, number, number, number][];
    litRune?: number | null;
    matchedRunes?: number;
    demoActive?: boolean;
    quizWrongUntil?: number;
    waterLevel?: number;
    pushBlocks?: Map<number, { x: number; y: number; locked: boolean }>;
    crackedTiles?: Set<number>;
  } = {};
  private gymOpenGates?: Set<string>;

  static isExtGimmick(t: string) {
    return t === 'snowball' || t === 'snow_reset' || t === 'pair_card' || t === 'rail_switch' || t === 'quiz_pad'
      || t === 'prism' || t === 'laser_src' || t === 'laser_dst' || t === 'rune_pad' || t === 'rune_demo'
      || t === 'stop_tile' || t === 'water_switch' || t === 'water_bridge' || t === 'push_block'
      || t === 'block_slot' || t === 'puzzle_reset' || t === 'cracked_tile' || t === 'pit';
  }

  setGymPuzzleState(p: Stage3D['gymPuzzle'], openGates?: Set<string>) {
    this.gymPuzzle = p;
    this.gymOpenGates = openGates;
  }

  burstSnow3D(px: number, py: number) {
    const cx = px / TILE, cz = py / TILE;
    const h = this.hts.sample(Math.max(0.05, cx), Math.max(0.05, cz));
    const cols = [0xffffff, 0xd8eefc, 0x98d4f8];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const spd = 1.2 + Math.random() * 2.2;
      const s = 0.08 + Math.random() * 0.08;
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({ color: cols[i % cols.length] }),
      );
      m.position.set(cx + (Math.random() - 0.5) * 0.3, h + 0.35 + Math.random() * 0.25, cz + (Math.random() - 0.5) * 0.3);
      this.scene3d.add(m);
      this.snowShards.push({ mesh: m, vx: Math.cos(a) * spd, vy: 2.2 + Math.random() * 2.2, vz: Math.sin(a) * spd, life: 0.55 + Math.random() * 0.25 });
    }
  }

  constructor(
    private phaserScene: Phaser.Scene,
    private manifest: Manifest,
    private world: World,
    private mapId: MapId,
  ) {
    this.ensureRenderer();
    this.build();
    this.resize();
  }

  private ensureRenderer() {
    Stage3D.getSharedRenderer();
    this.syncVisibility();
  }

  toggle() {
    return true;
  }

  setBattleHidden(hidden: boolean) {
    this.hiddenByBattle = hidden;
    this.syncVisibility();
  }

  private syncVisibility() {
    const show = !this.hiddenByBattle;
    if (Stage3D.renderer) Stage3D.renderer.domElement.style.display = show ? 'block' : 'none';
    if (!show) syncPhaserCamOverlay(undefined, false);
  }

  private getImg(key: string): HTMLImageElement | HTMLCanvasElement | null {
    if (!this.phaserScene.textures.exists(key)) return null;
    return this.phaserScene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  }

  private registerTintMat(root: THREE.Object3D) {
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshBasicMaterial && !m.userData?.noTint) {
            const base = m.color.clone();
            m.userData = { ...m.userData, baseColor: base };
            m.color.copy(base).multiply(this.lastTintColor);
            this.tintMaterials.push(m);
          }
        }
      }
    });
  }

  private build() {
    const raw = this.phaserScene.cache.tilemap.get(this.mapId).data as MapWithProps;
    const info = this.world.info;
    const W = raw.width, H = raw.height;
    this.interior = this.world.interior;
    this.cave = this.world.cave;
    this.biome = this.world.biome;

    // 포켓몬 5세대 카메라 프리셋: 도시/야외는 드라마틱한 로우 앵글(36~38°), 실내는 보기 편한 44°
    if (this.interior) this.cam = { el: 44, fov: 20, dist: 23, stretch: true };
    else if (this.biome === 'city') this.cam = { el: 36, fov: 23, dist: 31, stretch: true };
    else this.cam = { el: 38, fov: 22, dist: 29, stretch: true };

    const tsKey = this.phaserScene.textures.exists(`tileset_${this.biome}`) ? `tileset_${this.biome}` : 'tileset';
    const tilesetImg = (this.getImg(tsKey) ?? this.getImg('tileset')) as HTMLImageElement;
    const shadowImg = this.getImg('shadow')!;
    this.shadowTex = pixelTex(shadowImg, 'shadow');

    // 1) 바닥 캔버스 합성
    const cv = document.createElement('canvas');
    cv.width = W * T;
    cv.height = H * T;
    const cx = cv.getContext('2d')!;
    const bg = String(prop(raw, 'bg', ''));
    const bgImg = bg ? this.getImg(bg) : null;
    if (bgImg) cx.drawImage(bgImg, 0, 0);

    const off = Number(prop(raw, 'groundOffset', 8));
    const drawLayer = (name: string, o: number, oy = o) => {
      const l = raw.layers.find((x) => x.name === name);
      if (!l?.data) return;
      l.data.forEach((g0, i) => {
        const g = g0 & 0x1fffffff;
        if (!g) return;
        const sx = ((g - 1) % 16) * T, sy = Math.floor((g - 1) / 16) * T;
        cx.drawImage(tilesetImg, sx, sy, T, T, (i % W) * T + o, Math.floor(i / W) * T + oy, T, T);
      });
    };
    if (off) {
      // 듀얼그리드 오토타일(+8px 오프셋)의 맨 왼쪽·위쪽 8px 테두리만 메운다.
      // (클리핑 없이 전체를 3번 겹쳐 그리면 투명한 물 타일 아래로 물가 잔상이 3겹 비치는 버그가 발생함)
      cx.save();
      cx.beginPath();
      cx.rect(0, 0, off, H * T);
      cx.rect(0, 0, W * T, off);
      cx.clip();
      drawLayer('Ground', off - T, off - T);
      drawLayer('Ground', off - T, off);
      drawLayer('Ground', off, off - T);
      cx.restore();
    }
    drawLayer('Ground', off);
    drawLayer('Decor', 0);
    drawLayer('Bridge', 0);
    drawLayer('Cliff', 0);

    const surface = String(prop(raw, 'surface', ''));
    const surf = surface ? surface.split('|') : null;
    if (surf) paintUrban(cx, surf);

    // 5세대풍 타일 깊이감: 도로 가장자리와 절벽 아래에 미세한 앰비언트 그늘 추가
    const groundTex = pixelTex(cv);

    // 2) 3D 지형 (절벽·계단·언덕)
    const spawn = info.spawns.get('player') ?? info.spawns.get('entry');
    if (this.interior) {
      let k = 0;
      while (k < H && Array.from({ length: W }, (_, x) => info.isBlocked(x, k)).every(Boolean)) k++;
      k = Math.min(k, 4);
      this.hts = computeHeights({ ...raw, layers: raw.layers.filter((l) => l.name !== 'Cliff') }, undefined);
      const room3d = buildInteriorRoom3D(info, groundTex, bgImg, k, T, this.hts);
      this.scene3d.add(room3d);
      this.registerTintMat(room3d);
    } else {
      this.hts = computeHeights(raw, spawn ? { x: spawn.x / T, y: spawn.y / T } : undefined);
      const faceTex = pixelTex(tilesetImg, `ts:${this.biome}`);
      const fu = (1 * T) / tilesetImg.width, fv = (11 * T) / tilesetImg.height;
      const faceUV: [number, number, number, number] = [
        fu,
        1 - fv,
        fu + T / tilesetImg.width,
        1 - fv - T / tilesetImg.height,
      ];
      const tMesh = buildTerrainMesh(this.hts, groundTex, faceTex, faceUV);
      this.scene3d.add(tMesh);
      this.registerTintMat(tMesh);
      const skirt = buildOuterSkirt(this.hts, groundTex, faceTex, faceUV, {
        cave: this.cave,
        margin: 22,
        isWall: this.cave ? (bx, by) => info.isBlocked(bx, by) : undefined,
      });
      this.scene3d.add(skirt);
      this.registerTintMat(skirt);
      const bridgeLayer = raw.layers.find((x) => x.name === 'Bridge');
      if (bridgeLayer?.data && String(prop(raw, 'bridgeStyle', 'wood')) === 'wood') this.addBridge3D(bridgeLayer.data, W, H, info);
    }

    this.fx = new Fx3D(this.scene3d, this.hts);

    // 실내 창문(낮 하늘·구름·밤 별·비) + 동굴 안개·플레이어 횃불 후광
    if (this.interior) {
      let wk = 0;
      while (wk < H && Array.from({ length: W }, (_, x) => info.isBlocked(x, wk)).every(Boolean)) wk++;
      wk = Math.min(wk, 4);
      if (this.world.windowRects.length && wk > 0) this.fx.setupWindows(this.world.windowRects, wk);
    }
    if (this.cave) {
      // 카메라 거리(dist=29)보다 안개가 가까우면 화면 전체가 완전 암전되므로
      // 플레이어 주변(29 전후)은 선명하게 보이고 먼 동굴 외곽만 어둡게 잠기도록 설정
      this.scene3d.fog = new THREE.Fog(0x0d0c1a, 34, 62);
    }
    if (!this.interior) {
      const tcv = document.createElement('canvas');
      tcv.width = 64;
      tcv.height = 64;
      const tcx = tcv.getContext('2d')!;
      const tg = tcx.createRadialGradient(32, 32, 2, 32, 32, 32);
      tg.addColorStop(0, 'rgba(255, 228, 162, 1)');
      tg.addColorStop(0.45, 'rgba(255, 200, 120, 0.48)');
      tg.addColorStop(1, 'rgba(255, 180, 90, 0)');
      tcx.fillStyle = tg;
      tcx.fillRect(0, 0, 64, 64);
      const tTex = new THREE.CanvasTexture(tcv);
      tTex.colorSpace = THREE.SRGBColorSpace;
      this.torchMat = new THREE.MeshBasicMaterial({
        map: tTex,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.torchMat.userData = { noTint: true };
      this.torchMesh = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 8.2), this.torchMat);
      this.torchMesh.rotation.x = -Math.PI / 2;
      this.scene3d.add(this.torchMesh);

      // 파도타기 전용 수면 보드 + 잔물결 링 (바다/호수 위 이동 시 플레이어 발밑에 표시)
      const sGrp = new THREE.Group();
      const boardCv = document.createElement('canvas');
      boardCv.width = 48; boardCv.height = 48;
      const bc = boardCv.getContext('2d')!;
      bc.fillStyle = 'rgba(30, 148, 224, 0.92)';
      bc.beginPath(); bc.ellipse(24, 24, 20, 14, 0, 0, Math.PI * 2); bc.fill();
      bc.fillStyle = 'rgba(122, 236, 255, 0.95)';
      bc.beginPath(); bc.ellipse(24, 23, 14, 9, 0, 0, Math.PI * 2); bc.fill();
      bc.strokeStyle = '#ffffff'; bc.lineWidth = 2.5;
      bc.beginPath(); bc.ellipse(24, 24, 20, 14, 0, 0, Math.PI * 2); bc.stroke();
      const boardTex = new THREE.CanvasTexture(boardCv);
      boardTex.colorSpace = THREE.SRGBColorSpace;
      const boardMat = new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, depthWrite: false });
      boardMat.userData = { noTint: true };
      const boardMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.25), boardMat);
      boardMesh.rotation.x = -Math.PI / 2;
      boardMesh.position.y = 0.04;
      const ripMat = new THREE.MeshBasicMaterial({ color: 0xb0f4ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      ripMat.userData = { noTint: true };
      const ripMesh = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.88, 24), ripMat);
      ripMesh.rotation.x = -Math.PI / 2;
      ripMesh.position.y = 0.02;
      sGrp.add(ripMesh, boardMesh);
      sGrp.visible = false;
      this.scene3d.add(sGrp);
      this.surfMount = sGrp;
      this.surfRipple = ripMesh;
    }

    // 3) 동굴 벽 / 도시 외벽 / 물 애니메이션
    if (this.cave) {
      const cw = makeCaveWalls(info, W, H, groundTex);
      this.scene3d.add(cw);
      this.registerTintMat(cw);
    }
    if (surf) {
      const uw = makeCaveWalls(info, W, H, groundTex, 1.3, (x, y) => surf[y]?.[x] === 'x');
      this.scene3d.add(uw);
      this.registerTintMat(uw);
    }
    if (!this.interior && !this.cave) {
      const margin = 22;
      const wSpan = W + margin * 2,
        hSpan = H + margin * 2;
      const wk = this.phaserScene.textures.exists(`water_${this.biome}0`) ? `water_${this.biome}` : 'water';
      for (let f = 0; f < 4; f++) {
        const im = this.getImg(`${wk}${f}`);
        if (!im) continue;
        const t = pixelTex(im).clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(wSpan, hSpan);
        t.needsUpdate = true;
        this.waterTex.push(t);
      }
      if (this.waterTex.length) {
        this.waterMat = new THREE.MeshBasicMaterial({ map: this.waterTex[0] });
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(wSpan, hSpan), this.waterMat);
        wm.rotation.x = -Math.PI / 2;
        wm.position.set(W / 2, -0.12, H / 2);
        this.scene3d.add(wm);
        this.registerTintMat(wm);
      }
    }

    // 4) 농장/텃밭 경작지 레이어 (실시간 괭이질·물주기 반영)
    if (this.mapId === 'farm' || info.farmZones.length > 0) {
      this.soilCv = document.createElement('canvas');
      this.soilCv.width = W * T;
      this.soilCv.height = H * T;
      this.soilTex = pixelTex(this.soilCv);
      const sm = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: this.soilTex, transparent: true, alphaTest: 0.1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      );
      sm.rotation.x = -Math.PI / 2;
      sm.position.set(W / 2, 0.03, H / 2);
      this.scene3d.add(sm);
      this.registerTintMat(sm);

      for (const z of info.farmZones) {
        if (this.mapId === 'farm') break;
        const y0 = this.hts.sample(z.x + z.w / 2, z.y + z.h / 2) + 0.022;
        const soilBg = new THREE.Mesh(
          new THREE.PlaneGeometry(z.w, z.h),
          new THREE.MeshBasicMaterial({ color: 0x7a5230, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        );
        soilBg.rotation.x = -Math.PI / 2;
        soilBg.position.set(z.x + z.w / 2, y0, z.y + z.h / 2);
        this.scene3d.add(soilBg);
        const post = new THREE.BoxGeometry(0.16, 0.45, 0.16);
        const pm = new THREE.MeshBasicMaterial({ color: 0x8a5a32 });
        const put = (x: number, zz: number) => {
          const p = new THREE.Mesh(post, pm);
          p.position.set(x, y0 + 0.22, zz);
          this.scene3d.add(p);
        };
        for (let i = 0; i <= z.w; i++) {
          put(z.x + i, z.y);
          put(z.x + i, z.y + z.h);
        }
        for (let j = 1; j < z.h; j++) {
          put(z.x, z.y + j);
          put(z.x + z.w, z.y + j);
        }
      }
    }

    // 5) 맵 오브젝트 (3D 입체 건물 · 빌딩 · 나무 · 바위 · 광석 · 가로등)
    const swayTex = new Map<string, THREE.Texture>();
    const gcv = document.createElement('canvas');
    gcv.width = 128;
    gcv.height = 128;
    const gcx = gcv.getContext('2d')!;
    const gg = gcx.createRadialGradient(64, 64, 1, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255, 240, 188, 1)');
    gg.addColorStop(0.22, 'rgba(255, 214, 128, 0.56)');
    gg.addColorStop(0.5, 'rgba(255, 192, 96, 0.2)');
    gg.addColorStop(0.78, 'rgba(255, 174, 78, 0.04)');
    gg.addColorStop(1, 'rgba(255, 165, 70, 0)');
    gcx.fillStyle = gg;
    gcx.fillRect(0, 0, 128, 128);
    this.groundGlowTex = new THREE.CanvasTexture(gcv);
    this.groundGlowTex.colorSpace = THREE.SRGBColorSpace;
    this.groundGlowMat = new THREE.MeshBasicMaterial({
      map: this.groundGlowTex,
      transparent: true,
      opacity: 0,
      visible: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.groundGlowMat.userData = { noTint: true };
    this.bulbGlowMat = new THREE.MeshBasicMaterial({
      map: this.groundGlowTex,
      transparent: true,
      opacity: 0,
      visible: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bulbGlowMat.userData = { noTint: true };
    const buildingFronts: Array<{ x0: number; x1: number; z1: number }> = [];
    if (!this.interior) this.addBridgeAndHighway3D(raw, W, H, info);

    for (const o of info.objects) {
      const ALIAS: Record<string, string> = { vine: 'bush', boulder: 'rock_big' };
      const type = this.manifest.images[o.type] || this.manifest.spritesheets[o.type] ? o.type : ALIAS[o.type] ?? o.type;
      const cellX = Number(prop(o, 'cellX', 0)),
        cellY = Number(prop(o, 'cellY', 0)),
        cellW = Number(prop(o, 'cellW', 1)),
        cellH = Number(prop(o, 'cellH', 1));
      const im = this.manifest.images[type],
        sh = this.manifest.spritesheets[type];
      const base = this.hts.sample(
        Math.max(0.05, Math.min(W - 0.05, cellX + cellW * 0.5)),
        Math.max(0.05, Math.min(H - 0.05, cellY + 0.5)),
      );
      const isBuilding = !!this.manifest.buildings?.[type] || type === 'house';
      const created: THREE.Object3D[] = [];

      if (type === 'gatehouse' || type === 'cycle_gate') {
        this.addGatehouse3D(type, o, cellX, cellY, cellW, cellH, created, W, H);
        this.objMeshes.set(o.id, created);
        continue;
      }

      if (type === 'pit') {
        this.objMeshes.set(o.id, created);
        continue;
      }
      if (type === 'ice_tile' || type === 'arrow_pad' || type === 'warp_pad' || type === 'switch_btn' || type === 'gate_bar' || Stage3D.isExtGimmick(type)) {
        this.addGimmick3D(type, o, cellX, cellY, cellW, cellH, created, W, H);
        this.objMeshes.set(o.id, created);
        continue;
      }

      if (type === 'prison_hatch') {
        const grp = new THREE.Group();
        const cx = cellX + cellW * 0.5, cz = cellY + 0.5;
        const rim = new THREE.Mesh(
          new THREE.BoxGeometry(cellW * 0.94, 0.08, 0.88),
          new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.65, metalness: 0.4 }),
        );
        rim.position.set(cx, base + 0.04, cz);
        const hole = new THREE.Mesh(
          new THREE.PlaneGeometry(cellW * 0.72, 0.62),
          new THREE.MeshBasicMaterial({ color: 0x0b1018 }),
        );
        hole.rotation.x = -Math.PI / 2;
        hole.position.set(cx, base + 0.085, cz);
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(cellW * 0.88, 0.8),
          new THREE.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),
        );
        glow.rotation.x = -Math.PI / 2;
        glow.position.set(cx, base + 0.09, cz);
        grp.add(rim, hole, glow);
        this.scene3d.add(grp);
        created.push(grp);
        this.objMeshes.set(o.id, created);
        continue;
      }

      if (type === 'vend' || type === 'tlight') {
        const sp = makeStreetProp(type, o.x / T, o.y / T, base);
        this.scene3d.add(sp);
        this.registerTintMat(sp);
        created.push(sp);
        this.objMeshes.set(o.id, created);
        continue;
      }
      if (String(prop(o, 'blockout', '')) === '1') {
        const t = makeBlockout(o, type, cellX, cellY, cellW, cellH, base);
        buildingFronts.push({ x0: cellX, x1: cellX + cellW, z1: cellY + 1 });
        this.scene3d.add(t.mesh);
        this.registerTintMat(t.mesh);
        this.tall.push(t);
        const chim = Number(prop(o, 'chimney', 0));
        const floors = Math.max(1, Number(prop(o, 'floors', 3)));
        const bh = floors * 0.75 + 0.25;
        for (let ci = 0; ci < chim; ci++) {
          const ch = 3.2 + ci * 0.4;
          const cxp = cellX + (cellW * (ci + 1)) / (chim + 1);
          const czp = cellY + 1 - cellH * 0.7;
          this.fx.addChimney(cxp, base + bh + ch + 0.15, czp, true);
        }
        created.push(t.mesh);
        this.objMeshes.set(o.id, created);
        continue;
      }
      if (im && isBuilding && im.h / T > cellH) {
        const bimg = this.getImg(type) as HTMLImageElement | null;
        if (bimg) {
          const tex = pixelTex(bimg, `img:${type}`);
          const gimg = this.getImg(`${type}_glow`) as HTMLImageElement | null;
          const gtex = gimg ? pixelTex(gimg, `glow:${type}`) : null;
          const bMesh = makeBuilding(
            bimg,
            tex,
            type,
            cellX,
            cellY,
            cellW,
            cellH,
            base,
            this.manifest.buildings?.[type]?.chimneyX,
            gtex,
          );
          this.scene3d.add(bMesh);
          this.registerTintMat(bMesh);
          buildingFronts.push({ x0: cellX, x1: cellX + cellW, z1: cellY + 1 });
          if (bMesh.userData.tall) this.tall.push(bMesh.userData.tall as Tall);
          if (bMesh.userData.glowMat) this.glowMats.push(bMesh.userData.glowMat as THREE.MeshBasicMaterial);
          const chimPos = bMesh.userData.chimney as { x: number; y: number; z: number } | undefined;
          if (chimPos) this.fx.addChimney(chimPos.x, chimPos.y, chimPos.z, type === 'smithy');
          else if (type === 'house') this.fx.addChimney((o.x + 30) / T, base + 5.7, cellY + 0.2, false);
          created.push(bMesh);
          if (gtex) created.push(this.addGroundGlow(cellX + cellW / 2, base, cellY + 1 + 0.55, Math.min(cellW * 0.65, 3.6), 1.35));
          this.objMeshes.set(o.id, created);
          continue;
        }
      }
      if (type === 'sea_current') {
        const dir = String(prop(o, 'dir', 'up'));
        const cv2 = document.createElement('canvas');
        cv2.width = 32; cv2.height = 32;
        const c2 = cv2.getContext('2d')!;
        c2.fillStyle = 'rgba(28, 178, 232, 0.34)';
        c2.fillRect(0, 0, 32, 32);
        c2.strokeStyle = 'rgba(220, 252, 255, 0.92)';
        c2.lineWidth = 3;
        c2.lineCap = 'round';
        // 위쪽 방향 2줄 물결 화살표 (메시 회전으로 상하좌우 방향 표현)
        for (const oy of [10, 24]) {
          c2.beginPath();
          c2.moveTo(6, oy + 5); c2.lineTo(16, oy - 3); c2.lineTo(26, oy + 5);
          c2.stroke();
        }
        const tex = new THREE.CanvasTexture(cv2);
        tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
        tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
        mat.userData = { noTint: true };
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.02), mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = dir === 'right' ? -Math.PI / 2 : dir === 'down' ? Math.PI : dir === 'left' ? Math.PI / 2 : 0;
        mesh.position.set(cellX + 0.5, -0.05, cellY + 0.5);
        this.scene3d.add(mesh);
        this.seaCurrentTexs.push(tex);
        created.push(mesh);
        this.objMeshes.set(o.id, created);
        continue;
      }
      if (type === 'spire') {
        const cx0 = cellX + cellW / 2,
          cz0 = cellY + 1 - cellH / 2,
          y0 = this.hts.sample(cx0, Math.min(H - 0.01, cellY + 0.5));
        const g = makeSpire(cx0, y0, cz0);
        this.scene3d.add(g);
        this.registerTintMat(g);
        if (g.userData.gem) this.spireGems.push(g.userData.gem as THREE.Object3D);
        created.push(g);
        this.objMeshes.set(o.id, created);
        continue;
      }

      if (this.interior && hasInteriorProp3D(type) && im) {
        const pimg = this.getImg(type);
        if (pimg) {
          const t = pixelTex(pimg, `img:${type}`);
          const prop3d = makeInteriorProp3D(type, o, t, im.w, im.h, W, this.shadowTex, T);
          if (prop3d) {
            prop3d.position.y += base;
            this.scene3d.add(prop3d);
            this.registerTintMat(prop3d);
            created.push(prop3d);
            if ((type === 'lamp_floor' || type === 'forge' || type === 'candle') && this.groundGlowTex) {
              const gm = new THREE.MeshBasicMaterial({
                map: this.groundGlowTex, color: type === 'forge' ? 0xff9a4a : 0xffe49e,
                transparent: true, opacity: type === 'forge' ? 0.28 : 0.20,
                blending: THREE.AdditiveBlending, depthWrite: false,
              });
              gm.userData = { noTint: true };
              const g = new THREE.Mesh(new THREE.PlaneGeometry(type === 'forge' ? 3.2 : 2.2, type === 'forge' ? 2.2 : 1.6), gm);
              g.rotation.x = -Math.PI / 2;
              g.position.set(cellX + cellW / 2, base + 0.02, cellY + (type === 'forge' ? 0.9 : 0.55));
              this.scene3d.add(g);
              created.push(g);
            }
            this.objMeshes.set(o.id, created);
            continue;
          }
        }
      }

      let bb: Billboard | null = null;
      if (sh) {
        const img = this.getImg(type);
        if (img) {
          let t = swayTex.get(type);
          if (!t) {
            t = pixelTex(img, `sheet:${type}`);
            swayTex.set(type, t);
          }
          bb = new Billboard(t, sh.frameWidth, sh.frameHeight, sh.frames, Math.max(1, Math.round(img.height / sh.frameHeight)), sh.originY);
          bb.setFrame(Number(prop(o, 'frameOffset', 0)) % sh.frames);
          if (sh.frames > 1 && type !== 'fence' && type !== 'campfire' && type !== 'whirlpool') {
            this.sway.push({ tex: (bb.mesh.material as THREE.MeshBasicMaterial).map!, frames: sh.frames });
          } else if (type === 'whirlpool' && sh.frames > 1) {
            this.whirlpoolTexs.push({ tex: (bb.mesh.material as THREE.MeshBasicMaterial).map!, frames: sh.frames });
          }
        }
      } else if (im) {
        const img = this.getImg(type);
        if (img) {
          const t = pixelTex(img, `img:${type}`);
          bb = new Billboard(t, im.w, im.h, 1, 1, im.originY);
        }
      }
      if (!bb) continue;
      if (o.type === 'vine' && type !== 'vine') (bb.mesh.material as THREE.MeshBasicMaterial).color.set(0x6a8a4a);
      const gx = o.x / T;
      let gz = o.y / T;
      for (const b of buildingFronts) {
        if (Math.abs(gz - b.z1) < 0.08 && gx >= b.x0 - 0.5 && gx <= b.x1 + 0.5) {
          gz = b.z1 + 0.03;
          break;
        }
      }
      // 실내 북쪽 벽(y=3)에 붙은 가구는 바닥(y=3..4) 위가 아니라 북쪽 벽(z=3) 바로 앞에 밀착해 세운다 (쯔꾸르/포켓몬식 벽걸이·벽면 가구 배치)
      if (this.interior && cellY === 3 && cellH === 1) {
        gz = 3.16;
      }
      gz += ((o.id % 19) - 9) * 0.0012;
      bb.mesh.position.set(gx, this.hts.sample(gx, Math.min(H - 0.01, gz - 0.01)), gz);
      this.scene3d.add(bb.mesh);
      if (type === 'campfire' || type === 'whirlpool' || type === 'tide_seal' || type === 'sea_altar') {
        (bb.mesh.material as THREE.MeshBasicMaterial).userData = { noTint: true };
      } else {
        this.registerTintMat(bb.mesh);
      }
      created.push(bb.mesh);

      if (this.interior && (type === 'lamp_floor' || type === 'forge' || type === 'candle') && this.groundGlowTex) {
        const gm = new THREE.MeshBasicMaterial({
          map: this.groundGlowTex, color: type === 'forge' ? 0xff9a4a : 0xffe49e,
          transparent: true, opacity: type === 'forge' ? 0.45 : 0.34,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        gm.userData = { noTint: true };
        const g = new THREE.Mesh(new THREE.PlaneGeometry(type === 'forge' ? 4.2 : 3.0, type === 'forge' ? 3.0 : 2.2), gm);
        g.rotation.x = -Math.PI / 2;
        g.position.set(cellX + cellW / 2, 0.02, cellY + (type === 'forge' ? 0.9 : 0.55));
        this.scene3d.add(g);
        created.push(g);
      }

      if (['oak', 'oak_apple', 'pine', 'oak_autumn', 'pine_snow', 'palm', 'rock', 'rock_big', 'bush', 'lamp', 'well', 'shipping_bin'].includes(type)) {
        const isTree = type.startsWith('oak') || type.startsWith('pine') || type === 'palm';
        if (isTree) {
          const tGrp = new THREE.Group();
          this.tall.push({
            mesh: tGrp,
            x0: gx - 1.15,
            x1: gx + 1.15,
            z0: gz - 0.15,
            z1: gz,
            h: 3.4,
            mats: [bb.mesh.material as THREE.MeshBasicMaterial],
            faded: false,
          });
        }
        const s = new THREE.Mesh(
          new THREE.PlaneGeometry(isTree ? 2.2 : 1, isTree ? 0.85 : 0.45),
          new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: 0.48, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        );
        s.rotation.x = -Math.PI / 2;
        s.position.set(gx, bb.mesh.position.y + 0.025, gz - 0.08);
        this.scene3d.add(s);
        created.push(s);
      }
      if (type === 'lamp') created.push(...this.addLampGlow(gx, bb.mesh.position.y, gz));
      if (type === 'campfire') {
        const cfTex = (bb.mesh.material as THREE.MeshBasicMaterial).map ?? undefined;
        created.push(...this.addCampfireGlow(gx, bb.mesh.position.y, gz, cfTex, sh?.frames ?? 1));
      }
      this.objMeshes.set(o.id, created);
    }

    if (!this.interior && !this.cave) this.addOuterTrees(info, surf, W, H);

    // 6) 풍차 날개 (windmill_hub)
    const hub = info.spawns.get('windmill_hub');
    if (hub) {
      const bImg = this.getImg('windmill_blades');
      if (bImg) {
        const bTex = pixelTex(bImg, 'img:windmill_blades');
        const g = new THREE.PlaneGeometry(bImg.width / T, bImg.height / T);
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: bTex, alphaTest: 0.4, side: THREE.DoubleSide }));
        const hx = hub.x / T,
          hz = (hub.y + 38) / T;
        m.position.set(hx, this.hts.sample(hx, Math.min(H - 1, hz)) + 2.8, hz + 0.15);
        this.scene3d.add(m);
        this.registerTintMat(m);
        this.bladesMesh = m;
      }
    }

    // 7) 타일 선택 커서 (농기구·씨앗 위치 표시)
    const curGeo = new THREE.RingGeometry(0.42, 0.52, 4);
    curGeo.rotateZ(Math.PI / 4);
    const curMat = new THREE.MeshBasicMaterial({ color: 0xffe58a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    curMat.userData = { noTint: true };
    this.cursorMesh = new THREE.Mesh(curGeo, curMat);
    this.cursorMesh.rotation.x = -Math.PI / 2;
    this.cursorMesh.visible = false;
    this.scene3d.add(this.cursorMesh);
  }

  markSoilDirty() {
    this.soilDirty = true;
  }

  burst(kind: BurstKind, worldPxX: number, worldPxY: number, liftPx = 0) {
    this.fx?.burst(kind, worldPxX, worldPxY, liftPx);
  }

  ring(worldPxX: number, worldPxY: number, colorHex = 0xffe58a, maxRadius = 1.25, life = 0.48, liftPx = 2) {
    this.fx?.ring(worldPxX, worldPxY, colorHex, maxRadius, life, liftPx);
  }

  spireBeam(colorHex: number, worldPxX: number, worldPxY: number, burst: boolean) {
    this.fx?.addSpireBeam(worldPxX, worldPxY, colorHex, burst);
  }

  private refreshSoil(tiles: Map<string, FarmTile>) {
    if (!this.soilCv || !this.soilTex) return;
    this.soilDirty = false;
    const cx = this.soilCv.getContext('2d')!;
    cx.clearRect(0, 0, this.soilCv.width, this.soilCv.height);
    const tsImg = this.getImg('tileset') as HTMLImageElement | null;
    if (!tsImg) return;
    const rowDry = this.manifest.tileset.ROW.TILLED;
    const rowWet = this.manifest.tileset.ROW.TILLED_WET;
    const cols = this.manifest.tileset.columns;
    for (const t of tiles.values()) {
      if (t.soil === SoilState.Unplowed) continue;
      const has = (dx: number, dy: number) => tiles.has(`${t.x + dx},${t.y + dy}`);
      const mask = (has(0, -1) ? 1 : 0) | (has(1, 0) ? 2 : 0) | (has(0, 1) ? 4 : 0) | (has(-1, 0) ? 8 : 0);
      const row = t.soil === SoilState.Watered ? rowWet : rowDry;
      const gid = row * cols + mask;
      const sx = (gid % 16) * T,
        sy = Math.floor(gid / 16) * T;
      cx.drawImage(tsImg, sx, sy, T, T, t.x * T, t.y * T, T, T);
    }
    this.soilTex.needsUpdate = true;
  }

  resize() {
    const r = Stage3D.renderer;
    if (!r) return;
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(window.innerWidth, window.innerHeight, false);
    const rawAspect = window.innerWidth / Math.max(1, window.innerHeight);
    const squash = this.cam.stretch ? 1 / Math.sin((this.cam.el * Math.PI) / 180) : 1;
    this.camera.aspect = rawAspect * squash;
    this.camera.fov = rawAspect < 1 ? Math.min(36, this.cam.fov / Math.max(0.62, rawAspect)) : this.cam.fov;
    this.camera.updateProjectionMatrix();
  }

  /** 마우스 화면 좌표 → 3D 고도 반영 지형 표면 픽셀 좌표 (x, y) 변환 */
  screenToWorld(clientX: number, clientY: number, refWorldY = 0): { x: number; y: number } | null {
    if (!Stage3D.enabled || this.hiddenByBattle) return null;
    const nx = (clientX / window.innerWidth) * 2 - 1;
    const ny = -(clientY / window.innerHeight) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const dir = ray.ray.direction;
    if (dir.y >= -1e-4) return null;

    const orig = ray.ray.origin;
    const tMin = Math.max(0.5, (14 - orig.y) / dir.y);
    const tMax = Math.min(90, (-2 - orig.y) / dir.y);
    const p = new THREE.Vector3();
    let prevT = tMin;
    let prevDiff = 1;
    for (let t = tMin; t <= tMax; t += 0.4) {
      p.copy(orig).addScaledVector(dir, t);
      const cz = Math.max(0, Math.min(this.world.info.height - 0.01, p.z));
      const cx = Math.max(0, Math.min(this.world.info.width - 0.01, p.x));
      const diff = p.y - this.hts.sample(cx, cz);
      if (diff <= 0 && prevDiff > 0) {
        let lo = prevT, hi = t;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) * 0.5;
          p.copy(orig).addScaledVector(dir, mid);
          const mz = Math.max(0, Math.min(this.world.info.height - 0.01, p.z));
          const mx = Math.max(0, Math.min(this.world.info.width - 0.01, p.x));
          if (p.y - this.hts.sample(mx, mz) <= 0) hi = mid;
          else lo = mid;
        }
        p.copy(orig).addScaledVector(dir, (lo + hi) * 0.5);
        return { x: p.x * T, y: p.z * T };
      }
      prevT = t;
      prevDiff = diff;
    }

    const fbY = refWorldY || this.hts.sample(
      Math.max(0, Math.min(this.world.info.width - 0.01, this.camTarget.x)),
      Math.max(0, Math.min(this.world.info.height - 0.01, this.camTarget.z)),
    );
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -fbY);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x * T, y: hit.z * T };
  }

  private syncSprite(
    sp: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image | undefined,
    opts?: { shadowScale?: number; yBias?: number; zOffset?: number },
  ) {
    if (!sp || !sp.active || !sp.visible || sp.alpha <= 0.01) return;
    const texKey = sp.texture?.key;
    if (!texKey || texKey === '__DEFAULT') return;
    const img = this.getImg(texKey);
    if (!img) return;

    const fw = sp.frame.width || img.width;
    const fh = sp.frame.height || img.height;
    const cols = Math.max(1, Math.round(img.width / fw));
    const rows = Math.max(1, Math.round(img.height / fh));
    const sig = `${texKey}:${fw}x${fh}:${sp.originX.toFixed(2)},${sp.originY.toFixed(2)}`;

    let entry = this.dynPool.get(sp);
    if (!entry || entry.key !== sig) {
      if (entry) {
        this.scene3d.remove(entry.bb.mesh, entry.shadow);
      }
      const baseTex = pixelTex(img, `dyn:${texKey}`);
      const bb = new Billboard(baseTex, fw, fh, cols, rows, sp.originY, sp.originX);
      (bb.mesh.material as THREE.MeshBasicMaterial).transparent = true;
      const shS = opts?.shadowScale ?? (fw >= 28 ? 0.85 : 0.45);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(shS, shS * 0.4),
        new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: shS > 0 ? 0.5 : 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      );
      shadow.rotation.x = -Math.PI / 2;
      this.scene3d.add(bb.mesh, shadow);
      entry = { uid: this.dynSeq++, key: sig, cols, rows, fw, fh, bb, shadow, seen: true };
      this.dynPool.set(sp, entry);
    }
    entry.seen = true;

    const frameIdx = typeof sp.frame.name === 'number' ? sp.frame.name : parseInt(String(sp.frame.name), 10) || 0;
    entry.bb.setFrame(frameIdx);

    const sx = (sp.flipX ? -1 : 1) * sp.scaleX;
    const sy = sp.scaleY;
    entry.bb.mesh.scale.set(sx, sy, 1);

    const lift = Number(sp.getData('lift') || 0);
    const groundY = sp.getData('groundY');
    const rawY = typeof groundY === 'number' ? groundY : lift ? sp.y + lift : sp.y;
    const gx = sp.x / T;
    const gz = rawY / T + (opts?.zOffset ?? ((entry.uid % 19) - 9) * 0.0008);
    const h = this.hts.sample(gx, Math.max(0, Math.min(this.world.info.height - 0.01, gz)));
    entry.bb.mesh.visible = sp.visible && sp.alpha > 0.01;
    entry.bb.mesh.position.set(gx, h + lift / T + (opts?.yBias ?? 0), gz);
    entry.bb.mesh.rotation.y = this.camYaw;
    const mat = entry.bb.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = sp.alpha;
    if (!opts?.yBias) mat.color.copy(this.lastTintColor);

    const shLift = Math.max(0.45, 1 - lift / 32);
    entry.shadow.visible = sp.visible && (opts?.shadowScale ?? 1) > 0 && sp.alpha > 0.2;
    entry.shadow.scale.set(shLift, shLift, 1);
    entry.shadow.position.set(gx, h + 0.028, gz - 0.02);
  }

  private syncLabel(txtObj: Phaser.GameObjects.Text | undefined, gx: number, gy: number, gz: number, isBubble = false, bubbleSkin = 'default') {
    if (!txtObj || !txtObj.active || !txtObj.visible || txtObj.alpha <= 0.01 || !txtObj.text) return;
    const sig = isBubble ? `${bubbleSkin}:${txtObj.text}` : txtObj.text;
    let item = this.labelPool.get(txtObj);
    if (!item || item.text !== sig) {
      const cv = item?.cv ?? document.createElement('canvas');
      const c = cv.getContext('2d')!;
      c.font = isBubble ? 'bold 13px Galmuri11, Galmuri9, sans-serif' : 'bold 12px Galmuri9, sans-serif';
      const tw = Math.min(256, Math.ceil(c.measureText(txtObj.text).width) + (isBubble ? 24 : 16));
      const th = isBubble ? 34 : 20;
      cv.width = tw;
      cv.height = th;
      c.font = isBubble ? 'bold 13px Galmuri11, Galmuri9, sans-serif' : 'bold 12px Galmuri9, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (isBubble) {
        const skin = CHAT_BUBBLES[bubbleSkin] ?? CHAT_BUBBLES.default;
        const bh = th - 6;
        const r = 7;
        const rrect = (x: number, y: number, w: number, h: number, rad: number) => {
          c.beginPath();
          c.moveTo(x + rad, y);
          c.lineTo(x + w - rad, y);
          c.quadraticCurveTo(x + w, y, x + w, y + rad);
          c.lineTo(x + w, y + h - rad);
          c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
          c.lineTo(x + rad, y + h);
          c.quadraticCurveTo(x, y + h, x, y + h - rad);
          c.lineTo(x, y + rad);
          c.quadraticCurveTo(x, y, x + rad, y);
          c.closePath();
        };
        const grad = c.createLinearGradient(0, 1, 0, bh);
        grad.addColorStop(0, skin.bgTop);
        grad.addColorStop(1, skin.bgBottom);
        rrect(2, 2, tw - 4, bh - 2, r);
        c.fillStyle = grad;
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = skin.borderOuter;
        c.stroke();

        rrect(4, 4, tw - 8, bh - 6, Math.max(3, r - 2));
        c.lineWidth = 1.2;
        c.strokeStyle = skin.borderInner;
        c.stroke();

        // 아래쪽 말풍선 꼬리 (▼)
        const mx = tw / 2;
        c.beginPath();
        c.moveTo(mx - 5, bh - 1);
        c.lineTo(mx, th - 1);
        c.lineTo(mx + 5, bh - 1);
        c.closePath();
        c.fillStyle = skin.bgBottom;
        c.fill();
        c.lineWidth = 1.8;
        c.strokeStyle = skin.borderOuter;
        c.stroke();

        // 스킨별 모서리/상단 포인트 장식
        c.fillStyle = skin.badgeColor;
        if (skin.ornament === 'wood') {
          for (const [ox, oy] of [[6, 6], [tw - 6, 6], [6, bh - 4], [tw - 6, bh - 4]]) {
            c.fillRect(ox - 1, oy - 1, 2, 2);
          }
        } else if (skin.ornament === 'sakura') {
          for (const [ox, oy] of [[7, 7], [tw - 7, 7]]) {
            c.beginPath(); c.arc(ox, oy, 2.4, 0, Math.PI * 2); c.fill();
          }
        } else if (skin.ornament === 'star') {
          for (const [ox, oy] of [[8, 7], [tw - 8, 7], [tw - 12, bh - 5]]) {
            c.fillRect(ox - 1, oy - 2, 2, 4); c.fillRect(ox - 2, oy - 1, 4, 2);
          }
        } else if (skin.ornament === 'mint') {
          for (const [ox, oy] of [[7, 7], [tw - 7, 7]]) {
            c.fillRect(ox - 2, oy - 1, 3, 2); c.fillRect(ox - 1, oy - 2, 2, 3);
          }
        } else if (skin.ornament === 'neon') {
          c.fillStyle = '#00f0ff';
          c.fillRect(4, 4, 6, 2); c.fillRect(tw - 10, bh - 4, 6, 2);
          c.fillStyle = '#ff4df0';
          c.fillRect(tw - 10, 4, 6, 2); c.fillRect(4, bh - 4, 6, 2);
        } else if (skin.ornament === 'crown') {
          c.fillStyle = '#ffd23f';
          c.fillRect(mx - 5, 1, 10, 3);
          c.fillRect(mx - 5, 0, 2, 2); c.fillRect(mx - 1, 0, 2, 2); c.fillRect(mx + 3, 0, 2, 2);
          c.fillStyle = '#ff4d6d';
          c.fillRect(mx - 1, 1, 2, 2);
        }

        c.fillStyle = skin.textColor;
        c.fillText(txtObj.text, tw / 2, bh / 2 + 1);
      } else {
        c.lineWidth = 3;
        c.strokeStyle = '#2a180c';
        c.strokeText(txtObj.text, tw / 2, th / 2);
        c.fillStyle = txtObj.style.color || '#fff8ec';
        c.fillText(txtObj.text, tw / 2, th / 2);
      }
      if (!item) {
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false });
        mat.userData = { noTint: true };
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(tw / 42, th / 42), mat);
        mesh.renderOrder = 10;
        this.scene3d.add(mesh);
        item = { mesh, tex, cv, text: sig, seen: true };
        this.labelPool.set(txtObj, item);
      } else {
        item.text = sig;
        item.tex.needsUpdate = true;
        item.mesh.geometry.dispose();
        item.mesh.geometry = new THREE.PlaneGeometry(tw / 42, th / 42);
      }
    }
    item.seen = true;
    item.mesh.position.set(gx, gy + (isBubble ? 1.96 : 1.56), gz);
    item.mesh.rotation.y = this.camYaw;
  }

  private addGroundGlow(cx: number, baseY: number, cz: number, w: number, d: number): THREE.Mesh {
    const seg = 6;
    const geo = new THREE.PlaneGeometry(w, d, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cols = new Float32Array(pos.count * 3);
    const maxX = this.world.info.width - 0.01;
    const maxZ = this.world.info.height - 0.01;
    for (let i = 0; i < pos.count; i++) {
      const wx = Math.max(0, Math.min(maxX, cx + pos.getX(i)));
      const wz = Math.max(0, Math.min(maxZ, cz + pos.getZ(i)));
      const sy = this.hts.sample(wx, wz);
      const diff = Math.abs(sy - baseY);
      const weight = diff <= 0.16 ? 1 : diff >= 0.32 ? 0 : 1 - (diff - 0.16) / 0.16;
      pos.setY(i, (diff <= 0.32 ? sy : baseY) + 0.028);
      cols[i * 3] = weight;
      cols[i * 3 + 1] = weight;
      cols[i * 3 + 2] = weight;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mesh = new THREE.Mesh(geo, this.groundGlowMat!);
    mesh.position.set(cx, 0, cz);
    mesh.renderOrder = 1;
    mesh.userData.fixedRot = true;
    this.scene3d.add(mesh);
    return mesh;
  }

  private addLampGlow(gx: number, baseY: number, gz: number): THREE.Object3D[] {
    const bulb = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.1), this.bulbGlowMat!);
    bulb.position.set(gx, baseY + 2.28, gz + 0.12);
    bulb.rotation.x = -0.22;
    bulb.renderOrder = 2;
    this.scene3d.add(bulb);
    const pool = this.addGroundGlow(gx, baseY, gz + 0.12, 4.4, 3.8);
    return [bulb, pool];
  }

  /** 마을 파이어 캠프(모닥불): 3D 콘 제거 · 2D 애니메이션 스프라이트 + 환하고 따뜻한 다중 불빛 후광 */
  private addCampfireGlow(gx: number, baseY: number, gz: number, tex: THREE.Texture | undefined, frames: number): THREE.Object3D[] {
    const mkMat = (color: number, op: number) => {
      const m = new THREE.MeshBasicMaterial({
        map: this.groundGlowTex,
        color,
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      m.userData = { noTint: true };
      return m;
    };
    const outerMat = mkMat(0xff8424, 0.55);
    const glowOuter = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 9.4), outerMat);
    glowOuter.rotation.x = -Math.PI / 2;
    glowOuter.position.set(gx, baseY + 0.03, gz);
    glowOuter.renderOrder = 2;
    this.scene3d.add(glowOuter);

    const innerMat = mkMat(0xffe278, 0.75);
    const glowInner = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.8), innerMat);
    glowInner.rotation.x = -Math.PI / 2;
    glowInner.position.set(gx, baseY + 0.04, gz);
    glowInner.renderOrder = 2;
    this.scene3d.add(glowInner);

    const haloMat = new THREE.MeshBasicMaterial({
      map: this.groundGlowTex,
      color: 0xffb848,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    haloMat.userData = { noTint: true };
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.0), haloMat);
    halo.position.set(gx, baseY + 0.72, gz - 0.06);
    halo.rotation.x = -0.22;
    halo.renderOrder = 3;
    this.scene3d.add(halo);

    this.campfires.push({ tex, frames, glowOuter, glowInner, halo, outerMat, innerMat, haloMat, gx, gy: baseY, gz, phase: Math.random() * 10 });
    return [glowOuter, glowInner, halo];
  }

  private updateAtmosphere(minutes: number, weather: string) {
    const h = (minutes / 60) % 24;
    const cTint = new THREE.Color(0xffffff);
    const cBg = new THREE.Color(this.interior || this.cave ? 0x090810 : 0x182820);
    let nightAlpha = 0;

    if (this.cave) {
      cTint.setHex(0xc2cbe0);
      cBg.setHex(0x0d0c1a);
      nightAlpha = 0.65;
    } else if (!this.interior) {
      const cDawn = new THREE.Color(0xffe4c4);
      const cDay = new THREE.Color(0xffffff);
      const cDusk = new THREE.Color(0xffcaaa);
      const cNight = new THREE.Color(0x8a9cd0);
      const bgDawn = new THREE.Color(0x28202c);
      const bgDay = new THREE.Color(0x182820);
      const bgDusk = new THREE.Color(0x241826);
      const bgNight = new THREE.Color(0x0b1020);

      if (h >= 5 && h < 7.5) {
        const t = (h - 5) / 2.5;
        cTint.copy(cNight).lerp(cDawn, t);
        cBg.copy(bgNight).lerp(bgDawn, t);
        nightAlpha = 0.7 * (1 - t);
      } else if (h >= 7.5 && h < 9) {
        const t = (h - 7.5) / 1.5;
        cTint.copy(cDawn).lerp(cDay, t);
        cBg.copy(bgDawn).lerp(bgDay, t);
      } else if (h >= 9 && h < 16.5) {
        cTint.copy(cDay);
        cBg.copy(bgDay);
      } else if (h >= 16.5 && h < 18.2) {
        const t = (h - 16.5) / 1.7;
        cTint.copy(cDay).lerp(cDusk, t);
        cBg.copy(bgDay).lerp(bgDusk, t);
        nightAlpha = t * 0.35;
      } else if (h >= 18.2 && h < 20) {
        const t = (h - 18.2) / 1.8;
        cTint.copy(cDusk).lerp(cNight, t);
        cBg.copy(bgDusk).lerp(bgNight, t);
        nightAlpha = 0.35 + t * 0.37;
      } else {
        cTint.copy(cNight);
        cBg.copy(bgNight);
        nightAlpha = 0.72;
      }
      if (weather === 'rain') {
        const rainT = h >= 19 || h < 5.5 ? 0x62729c : 0xb2c2d4;
        cTint.lerp(new THREE.Color(rainT), 0.55);
        cBg.lerp(new THREE.Color(0x121922), 0.65);
        nightAlpha = Math.max(nightAlpha, 0.24);
      }
    }

    this.nightAlpha = nightAlpha;
    const tintHex = cTint.getHex();
    if (tintHex !== this.lastTintHex) {
      this.lastTintHex = tintHex;
      this.lastTintColor.copy(cTint);
      this.scene3d.background = cBg;
      for (const m of this.tintMaterials) {
        const base = (m.userData?.baseColor as THREE.Color | undefined) ?? new THREE.Color(0xffffff);
        m.color.copy(base).multiply(cTint);
      }
    }
    const glowAlpha = this.interior || this.cave ? 0 : nightAlpha;
    if (this.groundGlowMat) {
      this.groundGlowMat.opacity = glowAlpha * 0.62;
      this.groundGlowMat.visible = glowAlpha > 0.01;
    }
    if (this.bulbGlowMat) {
      this.bulbGlowMat.opacity = glowAlpha * 0.92;
      this.bulbGlowMat.visible = glowAlpha > 0.01;
    }
    for (const gm of this.glowMats) {
      gm.opacity = this.interior || this.cave ? 0 : Math.min(1, nightAlpha * 1.15);
    }
    if (this.torchMat) {
      this.torchMat.opacity = this.cave ? 0.58 : nightAlpha * 0.14;
    }
  }

  private addOuterTrees(info: Stage3D['world']['info'], surf: string[] | null, W: number, H: number) {
    const candidates = new Set<string>();
    for (const o of info.objects) {
      if (o.type === 'oak' || o.type === 'oak_apple' || o.type === 'oak_autumn' || o.type === 'pine' || o.type === 'pine_snow' || o.type === 'palm') {
        candidates.add(o.type);
      }
    }
    const defaults =
      this.biome === 'snow'
        ? ['pine_snow', 'pine']
        : this.biome === 'autumn'
          ? ['oak_autumn', 'oak']
          : this.biome === 'coast'
            ? ['palm', 'oak']
            : ['oak', 'pine'];
    for (const d of defaults) candidates.add(d);
    const treeKeys = [...candidates].filter((k) => this.getImg(k) && (this.manifest.spritesheets[k] || this.manifest.images[k]));
    if (!treeKeys.length) return;

    const warps = info.warps.map((w) => ({ cx: (w.x + w.w / 2) / T, cz: (w.y + w.h / 2) / T }));
    const hash = (a: number, b: number) => (((a * 374761393) ^ (b * 668265263)) >>> 0) / 4294967296;
    const step = 3.2;
    for (let gy = -14; gy <= H + 12; gy += step) {
      for (let gx = -14; gx <= W + 14; gx += step) {
        if (gx >= -1.6 && gx <= W + 1.6 && gy >= -1.4 && gy <= H + 4.2) continue;
        const h1 = hash(Math.round(gx * 10), Math.round(gy * 10));
        const px = gx + (h1 - 0.5) * 1.4;
        const pz = gy + (hash(Math.round(gy * 10), Math.round(gx * 10)) - 0.5) * 1.4;
        if (px >= -1.3 && px <= W + 1.3 && pz >= -1.2 && pz <= H + 3.8) continue;

        const bx = Math.max(0, Math.min(W - 1, Math.floor(px)));
        const by = Math.max(0, Math.min(H - 1, Math.floor(pz)));
        if (info.terrainAt(bx, by) === '2') continue;
        if (surf && surf[by]?.[bx] !== 'g') continue;

        let nearCorridor = false;
        for (const w of warps) {
          if (Math.hypot(px - w.cx, pz - w.cz) < 3.5) { nearCorridor = true; break; }
          if ((px < 0 || px >= W) && (w.cx < 2.5 || w.cx > W - 2.5) && Math.abs(pz - w.cz) < 2.5) { nearCorridor = true; break; }
          if ((pz < 0 || pz >= H) && (w.cz < 2.5 || w.cz > H - 2.5) && Math.abs(px - w.cx) < 2.5) { nearCorridor = true; break; }
        }
        if (nearCorridor) continue;

        const key = treeKeys[Math.floor(h1 * treeKeys.length) % treeKeys.length];
        const img = this.getImg(key);
        if (!img) continue;
        const sh = this.manifest.spritesheets[key];
        const im = this.manifest.images[key];
        let bb: Billboard | null = null;
        if (sh) {
          const t = pixelTex(img, `outer:${key}`);
          bb = new Billboard(t, sh.frameWidth, sh.frameHeight, sh.frames, Math.max(1, Math.round(img.height / sh.frameHeight)), sh.originY);
          bb.setFrame(Math.floor(h1 * 17) % sh.frames);
        } else if (im) {
          bb = new Billboard(pixelTex(img, `outer:${key}`), im.w, im.h, 1, 1, im.originY);
        }
        if (!bb) continue;
        const c = this.hts.at(bx, by);
        const yBase = px < 0 ? (c.nw + c.sw) / 2 : px >= W ? (c.ne + c.se) / 2 : pz < 0 ? (c.nw + c.ne) / 2 : (c.sw + c.se) / 2;
        bb.mesh.position.set(px, yBase, pz);
        this.scene3d.add(bb.mesh);
        this.registerTintMat(bb.mesh);
      }
    }
  }

  /** 3D 박스·경사 빔 배치 빌더 (단일 드로우콜 + 방향별 음영) */
  private makeColorBatch() {
    const pos: number[] = [];
    const col: number[] = [];
    const idx: number[] = [];
    const tmp = new THREE.Color();
    const pushTri = (a: number, b: number, c: number) => idx.push(a, b, c);
    const pushQuad = (pts: [number, number, number][], hex: number, shade: number) => {
      tmp.setHex(hex);
      const r = Math.min(1, tmp.r * shade), g = Math.min(1, tmp.g * shade), b = Math.min(1, tmp.b * shade);
      const base = pos.length / 3;
      for (const p of pts) {
        pos.push(p[0], p[1], p[2]);
        col.push(r, g, b);
      }
      pushTri(base, base + 1, base + 2);
      pushTri(base, base + 2, base + 3);
    };
    const pushBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, hex: number) => {
      const x0 = cx - sx / 2, x1 = cx + sx / 2;
      const y0 = cy - sy / 2, y1 = cy + sy / 2;
      const z0 = cz - sz / 2, z1 = cz + sz / 2;
      pushQuad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], hex, 1.05); // top
      pushQuad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], hex, 0.94); // +z front
      pushQuad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], hex, 0.80); // -z back
      pushQuad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], hex, 0.86); // +x right
      pushQuad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], hex, 0.86); // -x left
      pushQuad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], hex, 0.68); // bottom
    };
    const pushBeam = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, hex: number) => {
      const dx = bx - ax, dy = by - ay, dz = bz - az;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-4) return;
      const upx = Math.abs(dy / len) > 0.92 ? 1 : 0, upy = upx ? 0 : 1, upz = 0;
      let rx = dy * upz - dz * upy, ry = dz * upx - dx * upz, rz = dx * upy - dy * upx;
      const rl = Math.hypot(rx, ry, rz) || 1;
      rx = (rx / rl) * r; ry = (ry / rl) * r; rz = (rz / rl) * r;
      let ux = ry * dz - rz * dy, uy = rz * dx - rx * dz, uz = rx * dy - ry * dx;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux = (ux / ul) * r; uy = (uy / ul) * r; uz = (uz / ul) * r;
      const a0: [number, number, number] = [ax - rx - ux, ay - ry - uy, az - rz - uz];
      const a1: [number, number, number] = [ax + rx - ux, ay + ry - uy, az + rz - uz];
      const a2: [number, number, number] = [ax + rx + ux, ay + ry + uy, az + rz + uz];
      const a3: [number, number, number] = [ax - rx + ux, ay - ry + uy, az - rz + uz];
      const b0: [number, number, number] = [bx - rx - ux, by - ry - uy, bz - rz - uz];
      const b1: [number, number, number] = [bx + rx - ux, by + ry - uy, bz + rz - uz];
      const b2: [number, number, number] = [bx + rx + ux, by + ry + uy, bz + rz + uz];
      const b3: [number, number, number] = [bx - rx + ux, by - ry + uy, bz - rz + uz];
      pushQuad([a3, a2, b2, b3], hex, 1.02);
      pushQuad([a0, a1, b1, b0], hex, 0.78);
      pushQuad([a1, a2, b2, b1], hex, 0.90);
      pushQuad([a3, b3, b0, a0], hex, 0.88);
    };
    const build = (): THREE.Mesh | null => {
      if (!idx.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
      const mesh = new THREE.Mesh(geo, mat);
      this.scene3d.add(mesh);
      this.registerTintMat(mesh);
      return mesh;
    };
    return { pushBox, pushBeam, build };
  }

  /** 도시 철교·석조교·현수교 및 Y축 고가도로(자전거 도로) 3D 구조물 + 야간 가로등 생성 */
  private addBridgeAndHighway3D(
    raw: { layers: { name: string; data?: number[] }[]; properties?: { name: string; type: string; value: string | number | boolean }[] },
    W: number,
    H: number,
    info: Stage3D['world']['info'],
  ) {
    const batch = this.makeColorBatch();
    const bridgeStyle = String(prop(raw, 'bridgeStyle', 'wood'));
    const bridgeLayer = raw.layers.find((x) => x.name === 'Bridge');
    const bData = bridgeLayer?.data;
    const lamps: Array<{ x: number; y: number; z: number; color: number }> = [];

    const parseJson = <T,>(k: string): T[] => {
      const v = raw.properties?.find((p) => p.name === k)?.value;
      if (Array.isArray(v)) return v as T[];
      if (typeof v === 'string' && v.trim()) {
        try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
      }
      return [];
    };

    // 1) 스타일 다리(steel / stone / suspension / timber): 난간 · 교각 · 상판 두께 · 트러스/주탑/케이블
    if (bData && bridgeStyle !== 'wood') {
      const hasB = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < W && ty < H && (bData[ty * W + tx] ?? 0) > 0;
      const isEdgeDrop = (nx: number, ny: number, h: number) =>
        nx >= 0 && ny >= 0 && nx < W && ny < H && !hasB(nx, ny) &&
        (info.terrainAt(nx, ny) === '2' || Math.abs(this.hts.sample(nx + 0.5, ny + 0.5) - h) > 0.35);

      const deckColor = bridgeStyle === 'stone' ? 0x9ca2ac : bridgeStyle === 'steel' ? 0x525d6b : bridgeStyle === 'timber' ? 0x7d5836 : 0x3b434e;
      const railColor = bridgeStyle === 'stone' ? 0xb4bac4 : bridgeStyle === 'steel' ? 0x627387 : bridgeStyle === 'timber' ? 0x986d42 : 0xd9e1ec;
      const postColor = bridgeStyle === 'stone' ? 0x828894 : bridgeStyle === 'steel' ? 0x3a4654 : bridgeStyle === 'timber' ? 0x5d3d22 : 0xc8372d;
      const pierColor = bridgeStyle === 'stone' ? 0x777d88 : bridgeStyle === 'steel' ? 0x3c4552 : bridgeStyle === 'timber' ? 0x4f351e : 0x8e96a3;
      const railH = bridgeStyle === 'stone' ? 0.42 : bridgeStyle === 'suspension' ? 0.46 : 0.48;

      const visited = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!hasB(x, y)) continue;
        const h = this.hts.sample(x + 0.5, y + 0.5);
        const dropL = isEdgeDrop(x - 1, y, h);
        const dropR = isEdgeDrop(x + 1, y, h);
        const dropU = isEdgeDrop(x, y - 1, h);
        const dropD = isEdgeDrop(x, y + 1, h);

        // 상판 측면 두께 (3D 부피감) & 교각
        if (h > 0.25 || info.terrainAt(x, y) === '2') {
          if (dropL) batch.pushBox(x + 0.04, h - 0.12, y + 0.5, 0.08, 0.24, 1.0, deckColor);
          if (dropR) batch.pushBox(x + 0.96, h - 0.12, y + 0.5, 0.08, 0.24, 1.0, deckColor);
          if (dropU) batch.pushBox(x + 0.5, h - 0.12, y + 0.04, 1.0, 0.24, 0.08, deckColor);
          if (dropD) batch.pushBox(x + 0.5, h - 0.12, y + 0.96, 1.0, 0.24, 0.08, deckColor);
        }

        // 외곽 난간 & 보행 안전 연석
        if (dropL) {
          batch.pushBox(x + 0.06, h + railH, y + 0.5, 0.09, 0.09, 1.0, railColor);
          batch.pushBox(x + 0.06, h + railH * 0.45, y + 0.5, 0.10, railH * 0.9, 0.14, postColor);
        }
        if (dropR) {
          batch.pushBox(x + 0.94, h + railH, y + 0.5, 0.09, 0.09, 1.0, railColor);
          batch.pushBox(x + 0.94, h + railH * 0.45, y + 0.5, 0.10, railH * 0.9, 0.14, postColor);
        }
        if (dropU) {
          batch.pushBox(x + 0.5, h + railH, y + 0.06, 1.0, 0.09, 0.09, railColor);
          batch.pushBox(x + 0.5, h + railH * 0.45, y + 0.06, 0.14, railH * 0.9, 0.10, postColor);
        }
        if (dropD) {
          batch.pushBox(x + 0.5, h + railH, y + 0.94, 1.0, 0.09, 0.09, railColor);
          batch.pushBox(x + 0.5, h + railH * 0.45, y + 0.94, 0.14, railH * 0.9, 0.10, postColor);
        }

        // 물/계곡 아래로 내리는 교각 기둥
        const edgeCell = dropL || dropR || dropU || dropD;
        if (edgeCell && ((x * 3 + y * 5) % 4 === 0) && (h > 0.35 || info.terrainAt(x, y) === '2')) {
          const bot = -0.45, top = h - 0.12;
          const px = dropL ? x + 0.14 : dropR ? x + 0.86 : x + 0.5;
          const pz = dropU ? y + 0.14 : dropD ? y + 0.86 : y + 0.5;
          batch.pushBox(px, (top + bot) / 2, pz, 0.34, top - bot, 0.34, pierColor);
          batch.pushBox(px, bot + 0.25, pz, 0.50, 0.50, 0.50, bridgeStyle === 'suspension' ? 0xd96b43 : pierColor);
        }

        // 다리 가로등 (양 측면 5칸 간격)
        if ((dropL || dropU) && ((x + y) % 5 === 2)) {
          const lx = dropL ? x + 0.08 : x + 0.5, lz = dropU ? y + 0.08 : y + 0.5;
          batch.pushBox(lx, h + 1.05, lz, 0.10, 2.1, 0.10, 0x353c46);
          batch.pushBox(lx, h + 2.12, lz, 0.28, 0.14, 0.28, bridgeStyle === 'suspension' ? 0x9cf0ff : 0xffe6a0);
          lamps.push({ x: lx, y: h, z: lz, color: bridgeStyle === 'suspension' ? 0x9ef4ff : 0xffdf94 });
        }

        // 연결된 다리 전체 스팬을 뽑아 대형 아치·트러스·현수 주탑 건설
        if (!visited[y * W + x]) {
          const st = [[x, y]];
          visited[y * W + x] = 1;
          let minX = x, maxX = x, minY = y, maxY = y, sumH = 0, cnt = 0;
          while (st.length) {
            const [cx, cy] = st.pop()!;
            minX = Math.min(minX, cx); maxX = Math.max(maxX, cx);
            minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
            sumH += this.hts.sample(cx + 0.5, cy + 0.5); cnt++;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = cx + dx, ny = cy + dy;
              if (hasB(nx, ny) && !visited[ny * W + nx]) { visited[ny * W + nx] = 1; st.push([nx, ny]); }
            }
          }
          const avgH = sumH / Math.max(1, cnt);
          const spanW = maxX - minX + 1, spanH = maxY - minY + 1;
          const horiz = spanW >= spanH;
          const mainLen = horiz ? spanW : spanH;

          if (bridgeStyle === 'suspension' && mainLen >= 6) {
            // 스카이애로우 브리지 스타일 붉은 쌍둥이 주탑 + 현수 케이블 + 행어 케이블
            const tFracs = mainLen >= 10 ? [0.28, 0.72] : [0.5];
            const cablePts = (sideOffset: number) => {
              const anchors: number[] = [];
              if (horiz) {
                anchors.push(minX, avgH + 0.5);
                for (const f of tFracs) anchors.push(minX + spanW * f, avgH + 5.1);
                anchors.push(maxX + 1, avgH + 0.5);
                for (let k = 0; k < anchors.length - 2; k += 2) {
                  const ax = anchors[k], ay = anchors[k + 1], bx = anchors[k + 2], by = anchors[k + 3];
                  const midLow = k === 0 || k + 2 === anchors.length - 2 ? 0.5 : 1.75;
                  const segs = 6;
                  for (let s = 0; s < segs; s++) {
                    const u0 = s / segs, u1 = (s + 1) / segs;
                    const xA = ax + (bx - ax) * u0, xB = ax + (bx - ax) * u1;
                    const sag0 = -4 * midLow * u0 * (1 - u0), sag1 = -4 * midLow * u1 * (1 - u1);
                    const yA = ay + (by - ay) * u0 + sag0, yB = ay + (by - ay) * u1 + sag1;
                    batch.pushBeam(xA, yA, sideOffset, xB, yB, sideOffset, 0.055, 0xd8e3f0);
                    if (s % 2 === 1) batch.pushBeam(xA, yA, sideOffset, xA, avgH + 0.42, sideOffset, 0.025, 0xbcc7d4);
                  }
                }
              } else {
                anchors.push(minY, avgH + 0.5);
                for (const f of tFracs) anchors.push(minY + spanH * f, avgH + 5.1);
                anchors.push(maxY + 1, avgH + 0.5);
                for (let k = 0; k < anchors.length - 2; k += 2) {
                  const az = anchors[k], ay = anchors[k + 1], bz = anchors[k + 2], by = anchors[k + 3];
                  const midLow = k === 0 || k + 2 === anchors.length - 2 ? 0.5 : 1.75;
                  const segs = 6;
                  for (let s = 0; s < segs; s++) {
                    const u0 = s / segs, u1 = (s + 1) / segs;
                    const zA = az + (bz - az) * u0, zB = az + (bz - az) * u1;
                    const sag0 = -4 * midLow * u0 * (1 - u0), sag1 = -4 * midLow * u1 * (1 - u1);
                    const yA = ay + (by - ay) * u0 + sag0, yB = ay + (by - ay) * u1 + sag1;
                    batch.pushBeam(sideOffset, yA, zA, sideOffset, yB, zB, 0.055, 0xd8e3f0);
                    if (s % 2 === 1) batch.pushBeam(sideOffset, yA, zA, sideOffset, avgH + 0.42, zA, 0.025, 0xbcc7d4);
                  }
                }
              }
            };
            for (const f of tFracs) {
              if (horiz) {
                const tx = minX + spanW * f, zA = minY + 0.06, zB = maxY + 0.94;
                batch.pushBox(tx, avgH + 2.55, zA, 0.38, 5.2, 0.34, 0xc8372d);
                batch.pushBox(tx, avgH + 2.55, zB, 0.38, 5.2, 0.34, 0xc8372d);
                batch.pushBox(tx, avgH + 5.22, zA, 0.44, 0.24, 0.40, 0xf2f4f8);
                batch.pushBox(tx, avgH + 5.22, zB, 0.44, 0.24, 0.40, 0xf2f4f8);
                batch.pushBox(tx, avgH + 4.45, (zA + zB) / 2, 0.26, 0.34, Math.max(0.8, zB - zA), 0xc8372d);
                batch.pushBox(tx, avgH + 2.95, (zA + zB) / 2, 0.22, 0.24, Math.max(0.8, zB - zA), 0xb12c24);
              } else {
                const tz = minY + spanH * f, xA = minX + 0.06, xB = maxX + 0.94;
                batch.pushBox(xA, avgH + 2.55, tz, 0.34, 5.2, 0.38, 0xc8372d);
                batch.pushBox(xB, avgH + 2.55, tz, 0.34, 5.2, 0.38, 0xc8372d);
                batch.pushBox(xA, avgH + 5.22, tz, 0.40, 0.24, 0.44, 0xf2f4f8);
                batch.pushBox(xB, avgH + 5.22, tz, 0.40, 0.24, 0.44, 0xf2f4f8);
                batch.pushBox((xA + xB) / 2, avgH + 4.45, tz, Math.max(0.8, xB - xA), 0.34, 0.26, 0xc8372d);
                batch.pushBox((xA + xB) / 2, avgH + 2.95, tz, Math.max(0.8, xB - xA), 0.24, 0.22, 0xb12c24);
              }
            }
            cablePts(horiz ? minY + 0.06 : minX + 0.06);
            cablePts(horiz ? maxY + 0.94 : maxX + 0.94);
          } else if (bridgeStyle === 'steel' && mainLen >= 4) {
            // 쇳불 강철 트러스교 (사선 철골 트러스 + 상부 횡보)
            const topY = avgH + 2.25;
            if (horiz) {
              const zA = minY + 0.06, zB = maxY + 0.94;
              batch.pushBeam(minX + 0.5, topY, zA, maxX + 0.5, topY, zA, 0.08, 0x4b5c6e);
              batch.pushBeam(minX + 0.5, topY, zB, maxX + 0.5, topY, zB, 0.08, 0x4b5c6e);
              for (let tx = minX; tx <= maxX; tx += 2) {
                batch.pushBox(tx + 0.5, avgH + 1.15, zA, 0.18, 2.25, 0.18, 0x3b4858);
                batch.pushBox(tx + 0.5, avgH + 1.15, zB, 0.18, 2.25, 0.18, 0x3b4858);
                batch.pushBox(tx + 0.5, topY, (zA + zB) / 2, 0.18, 0.18, Math.max(0.8, zB - zA), 0x4b5c6e);
                if (tx + 2 <= maxX) {
                  batch.pushBeam(tx + 0.5, avgH + 0.3, zA, tx + 2.5, topY, zA, 0.055, 0x627387);
                  batch.pushBeam(tx + 0.5, avgH + 0.3, zB, tx + 2.5, topY, zB, 0.055, 0x627387);
                }
              }
            } else {
              const xA = minX + 0.06, xB = maxX + 0.94;
              batch.pushBeam(xA, topY, minY + 0.5, xA, topY, maxY + 0.5, 0.08, 0x4b5c6e);
              batch.pushBeam(xB, topY, minY + 0.5, xB, topY, maxY + 0.5, 0.08, 0x4b5c6e);
              for (let tz = minY; tz <= maxY; tz += 2) {
                batch.pushBox(xA, avgH + 1.15, tz + 0.5, 0.18, 2.25, 0.18, 0x3b4858);
                batch.pushBox(xB, avgH + 1.15, tz + 0.5, 0.18, 2.25, 0.18, 0x3b4858);
                batch.pushBox((xA + xB) / 2, topY, tz + 0.5, Math.max(0.8, xB - xA), 0.18, 0.18, 0x4b5c6e);
                if (tz + 2 <= maxY) {
                  batch.pushBeam(xA, avgH + 0.3, tz + 0.5, xA, topY, tz + 2.5, 0.055, 0x627387);
                  batch.pushBeam(xB, avgH + 0.3, tz + 0.5, xB, topY, tz + 2.5, 0.055, 0x627387);
                }
              }
            }
          }
        }
      }
    }

    // 2) 고가도로 / 자전거 도로 (Bridge 타일이 없는 고가 elevs 구간에 안전 가드레일 · 교각 · 안내 비콘 설치)
    const elevs = parseJson<{ x0: number; y0: number; x1: number; y1: number; h: number; openUnder?: boolean }>('elevs');
    const bAt = (x: number, y: number) => bData && x >= 0 && y >= 0 && x < W && y < H && (bData[y * W + x] ?? 0) > 0;
    for (const e of elevs) {
      if (e.h < 1.1) continue;
      const x0 = Math.max(0, Math.floor(e.x0)), y0 = Math.max(0, Math.floor(e.y0));
      const x1 = Math.min(W - 1, Math.floor(e.x1)), y1 = Math.min(H - 1, Math.floor(e.y1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (bAt(x, y)) continue;
        const h = this.hts.sample(x + 0.5, y + 0.5);
        const dropEdge = (nx: number, ny: number) =>
          nx >= 0 && ny >= 0 && nx < W && ny < H && h - this.hts.sample(nx + 0.5, ny + 0.5) > 0.55;
        if (dropEdge(x - 1, y)) {
          batch.pushBox(x + 0.06, h + 0.42, y + 0.5, 0.08, 0.09, 1.0, 0x4298dc);
          batch.pushBox(x + 0.06, h + 0.21, y + 0.5, 0.09, 0.42, 0.12, 0xd8e6f2);
        }
        if (dropEdge(x + 1, y)) {
          batch.pushBox(x + 0.94, h + 0.42, y + 0.5, 0.08, 0.09, 1.0, 0x4298dc);
          batch.pushBox(x + 0.94, h + 0.21, y + 0.5, 0.09, 0.42, 0.12, 0xd8e6f2);
        }
        if (dropEdge(x, y - 1)) {
          batch.pushBox(x + 0.5, h + 0.42, y + 0.06, 1.0, 0.09, 0.08, 0x4298dc);
          batch.pushBox(x + 0.5, h + 0.21, y + 0.06, 0.12, 0.42, 0.09, 0xd8e6f2);
        }
        if (dropEdge(x, y + 1)) {
          batch.pushBox(x + 0.5, h + 0.42, y + 0.94, 1.0, 0.09, 0.08, 0x4298dc);
          batch.pushBox(x + 0.5, h + 0.21, y + 0.94, 0.12, 0.42, 0.09, 0xd8e6f2);
        }
        if ((dropEdge(x - 1, y) || dropEdge(x, y - 1)) && (x + y) % 6 === 2) {
          const lx = dropEdge(x - 1, y) ? x + 0.07 : x + 0.5, lz = dropEdge(x, y - 1) ? y + 0.07 : y + 0.5;
          batch.pushBox(lx, h + 1.05, lz, 0.09, 2.1, 0.09, 0x35485c);
          batch.pushBox(lx, h + 2.12, lz, 0.26, 0.14, 0.26, 0x8ef2d8);
          lamps.push({ x: lx, y: h, z: lz, color: 0x8ef2d8 });
        }
      }
    }

    batch.build();
    for (const l of lamps) this.addLampGlow(l.x, l.y, l.z);
  }

  /** 도시 게이트하우스 · 자전거 도로 통과형 3D 아치 관문 (중앙 도로는 열려 있어 그대로 통과) */
  private addGatehouse3D(
    type: string,
    o: { properties?: { name: string; type: string; value: string | number | boolean }[] },
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
    created: THREE.Object3D[],
    W: number,
    H: number,
  ) {
    const batch = this.makeColorBatch();
    const axis = String(prop(o, 'axis', cellW >= cellH ? 'ns' : 'ew'));
    const isCycle = type === 'cycle_gate';
    const wallHex = isCycle ? 0xd9e8e4 : 0xdccbb4;
    const roofHex = isCycle ? 0x268a6e : 0x385e8c;
    const trimHex = isCycle ? 0x46e0b8 : 0xe3b854;

    if (axis === 'ns') {
      const cx = cellX + cellW / 2;
      const cz = cellY - (cellH - 1) / 2 + 0.5;
      const base = this.hts.sample(Math.max(0.05, Math.min(W - 0.05, cx)), Math.max(0.05, Math.min(H - 0.05, cz)));
      const spanX = Math.max(3, cellW);
      const lx = cellX + 0.42, rx = cellX + spanX - 0.42;
      batch.pushBox(lx, base + 1.15, cz, 0.72, 2.3, 1.35, wallHex);
      batch.pushBox(rx, base + 1.15, cz, 0.72, 2.3, 1.35, wallHex);
      batch.pushBox(lx, base + 2.42, cz, 0.86, 0.30, 1.50, roofHex);
      batch.pushBox(rx, base + 2.42, cz, 0.86, 0.30, 1.50, roofHex);
      batch.pushBox(cx, base + 2.60, cz, spanX + 0.3, 0.68, 1.45, wallHex);
      batch.pushBox(cx, base + 3.08, cz, spanX + 0.65, 0.38, 1.65, roofHex);
      batch.pushBox(cx, base + 2.60, cz + 0.74, Math.max(1.4, spanX - 1.2), 0.34, 0.08, trimHex);
      const mesh = batch.build();
      if (mesh) created.push(mesh);
      created.push(...this.addLampGlow(lx, base, cz + 0.72));
      created.push(...this.addLampGlow(rx, base, cz + 0.72));
    } else {
      const cx = cellX + cellW / 2;
      const z0 = cellY - cellH + 1;
      const cz = z0 + cellH / 2;
      const base = this.hts.sample(Math.max(0.05, Math.min(W - 0.05, cx)), Math.max(0.05, Math.min(H - 0.05, cz)));
      const spanZ = Math.max(3, cellH);
      const uz = z0 + 0.42, dz = z0 + spanZ - 0.42;
      batch.pushBox(cx, base + 1.15, uz, 1.35, 2.3, 0.72, wallHex);
      batch.pushBox(cx, base + 1.15, dz, 1.35, 2.3, 0.72, wallHex);
      batch.pushBox(cx, base + 2.42, uz, 1.50, 0.30, 0.86, roofHex);
      batch.pushBox(cx, base + 2.42, dz, 1.50, 0.30, 0.86, roofHex);
      batch.pushBox(cx, base + 2.60, cz, 1.45, 0.68, spanZ + 0.3, wallHex);
      batch.pushBox(cx, base + 3.08, cz, 1.65, 0.38, spanZ + 0.65, roofHex);
      batch.pushBox(cx + 0.74, base + 2.60, cz, 0.08, 0.34, Math.max(1.4, spanZ - 1.2), trimHex);
      const mesh = batch.build();
      if (mesh) created.push(mesh);
      created.push(...this.addLampGlow(cx + 0.72, base, uz));
      created.push(...this.addLampGlow(cx + 0.72, base, dz));
    }
  }

  /** 다리 타일(Bridge)에 입체 목재 상판·물속 교각·난간 추가 (단일 드로우콜) */
  private addBridge3D(data: number[], W: number, H: number, info: MapInfo) {
    const pos: number[] = [], col: number[] = [];
    const pushBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rgb: number) => {
      const r = ((rgb >> 16) & 255) / 255, g = ((rgb >> 8) & 255) / 255, b = (rgb & 255) / 255;
      const hx = sx / 2, hy = sy / 2, hz = sz / 2;
      const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
      const quad = (p: number[][], k: number) => {
        for (const i of [0, 1, 2, 0, 2, 3]) {
          pos.push(...p[i]);
          col.push(r * k, g * k, b * k);
        }
      };
      quad([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], 1.0);
      quad([[x0, y1, z1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1]], 0.78);
      quad([[x1, y1, z0], [x1, y0, z0], [x0, y0, z0], [x0, y1, z0]], 0.65);
      quad([[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], 0.7);
      quad([[x1, y1, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0]], 0.7);
    };
    const isBr = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && (data[y * W + x] & 0x1fffffff) > 0;
    const isDrop = (x: number, y: number) => x < 0 || y < 0 || x >= W || y >= H || (!isBr(x, y) && info.isBlocked(x, y));

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isBr(x, y)) continue;
      const h = this.hts.sample(x + 0.5, y + 0.5);
      // 다리 밑면 목재 보강
      pushBox(x + 0.5, h - 0.05, y + 0.5, 0.98, 0.1, 0.98, 0x6b4423);
      const dN = isDrop(x, y - 1), dS = isDrop(x, y + 1), dW = isDrop(x - 1, y), dE = isDrop(x + 1, y);
      if (dN || dS || dW || dE) {
        if ((x + y) % 2 === 0) pushBox(x + 0.5, (h - 0.38) / 2, y + 0.5, 0.18, h + 0.38, 0.18, 0x452a14);
      }
      if (dN) {
        pushBox(x + 0.5, h + 0.28, y + 0.08, 0.96, 0.09, 0.09, 0x9b6838);
        pushBox(x + 0.12, h + 0.16, y + 0.08, 0.1, 0.34, 0.1, 0x774c27);
        pushBox(x + 0.88, h + 0.16, y + 0.08, 0.1, 0.34, 0.1, 0x774c27);
      }
      if (dS) {
        pushBox(x + 0.5, h + 0.28, y + 0.92, 0.96, 0.09, 0.09, 0x9b6838);
        pushBox(x + 0.12, h + 0.16, y + 0.92, 0.1, 0.34, 0.1, 0x774c27);
        pushBox(x + 0.88, h + 0.16, y + 0.92, 0.1, 0.34, 0.1, 0x774c27);
      }
      if (dW) {
        pushBox(x + 0.08, h + 0.28, y + 0.5, 0.09, 0.09, 0.96, 0x9b6838);
        pushBox(x + 0.08, h + 0.16, y + 0.12, 0.1, 0.34, 0.1, 0x774c27);
        pushBox(x + 0.08, h + 0.16, y + 0.88, 0.1, 0.34, 0.1, 0x774c27);
      }
      if (dE) {
        pushBox(x + 0.92, h + 0.28, y + 0.5, 0.09, 0.09, 0.96, 0x9b6838);
        pushBox(x + 0.92, h + 0.16, y + 0.12, 0.1, 0.34, 0.1, 0x774c27);
        pushBox(x + 0.92, h + 0.16, y + 0.88, 0.1, 0.34, 0.1, 0x774c27);
      }
    }
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.scene3d.add(mesh);
    this.registerTintMat(mesh);
  }

  /** 포켓몬 스타일 맵 기믹(빙판·화살표패드·워프패드·스위치·전자문) 3D 시각화 */
  private addGimmick3D(
    type: string,
    o: MapInfo['objects'][number],
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
    created: THREE.Object3D[],
    W: number,
    H: number,
  ) {
    const parseHex = (v: unknown, def: number) => {
      const s = String(v ?? '').trim();
      const n = s ? parseInt(s.replace(/^#/, ''), 16) : NaN;
      return Number.isFinite(n) ? n : def;
    };
    const cx = cellX + cellW * 0.5;
    const cz = cellY + 1 - cellH * 0.5;
    const h = this.hts.sample(Math.max(0.05, Math.min(W - 0.05, cx)), Math.max(0.05, Math.min(H - 0.05, cz)));
    if (Stage3D.isExtGimmick(type) || (type === 'arrow_pad' && o.properties?.some((pr) => pr.name === 'altDir'))) {
      this.addGymPuzzle3D(type, o, cellW, cellH, created, cx, cz, h);
      return;
    }

    if (type === 'ice_tile') {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(cellW - 0.04, cellH - 0.04),
        new THREE.MeshBasicMaterial({
          color: 0xaef0ff,
          transparent: true,
          opacity: 0.34,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(cx, h + 0.025, cz);
      this.scene3d.add(m);
      this.registerTintMat(m);
      created.push(m);
      return;
    }

    if (type === 'arrow_pad') {
      const g = new THREE.Group();
      const dir = String(prop(o, 'dir', 'up'));
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.07, 0.86),
        new THREE.MeshBasicMaterial({ color: 0x263244 }),
      );
      base.position.y = 0.035;
      g.add(base);
      const chevMat = new THREE.MeshBasicMaterial({ color: 0x5ce8ff });
      const armL = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.13), chevMat);
      armL.position.set(-0.12, 0.085, 0.02);
      armL.rotation.y = Math.PI / 4;
      const armR = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.13), chevMat);
      armR.position.set(0.12, 0.085, 0.02);
      armR.rotation.y = -Math.PI / 4;
      const arrow = new THREE.Group();
      arrow.add(armL, armR);
      arrow.rotation.y = dir === 'down' ? Math.PI : dir === 'left' ? Math.PI / 2 : dir === 'right' ? -Math.PI / 2 : 0;
      g.add(arrow);
      g.position.set(cx, h, cz);
      this.scene3d.add(g);
      this.registerTintMat(g);
      created.push(g);
      return;
    }

    if (type === 'warp_pad') {
      const col = parseHex(prop(o, 'color', '#48c8ff'), 0x48c8ff);
      const g = new THREE.Group();
      const plate = new THREE.Mesh(
        new THREE.CylinderGeometry(0.44, 0.48, 0.08, 12),
        new THREE.MeshBasicMaterial({ color: 0x252a3d }),
      );
      plate.position.y = 0.04;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.24, 0.4, 16),
        new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.088;
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.16, 0),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.72 }),
      );
      orb.position.y = 0.28;
      g.add(plate, ring, orb);
      g.position.set(cx, h, cz);
      this.scene3d.add(g);
      this.registerTintMat(g);
      this.gimmickSpin.push(orb);
      created.push(g);
      return;
    }

    if (type === 'switch_btn') {
      const gateId = String(prop(o, 'gateId', 'g1'));
      const col = parseHex(prop(o, 'color', '#ff6470'), 0xff6470);
      const g = new THREE.Group();
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.08, 0.84),
        new THREE.MeshBasicMaterial({ color: 0x353b4a }),
      );
      rim.position.y = 0.04;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.31, 0.14, 12),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      cap.position.y = 0.14;
      g.add(rim, cap);
      g.position.set(cx, h, cz);
      this.scene3d.add(g);
      this.registerTintMat(g);
      const list = this.switchCaps.get(gateId) ?? [];
      list.push({ cap, baseY: 0.14, col });
      this.switchCaps.set(gateId, list);
      created.push(g);
      return;
    }

    if (type === 'gate_bar') {
      const gateId = String(prop(o, 'gateId', 'g1'));
      const col = parseHex(prop(o, 'color', '#ff5a6e'), 0xff5a6e);
      const g = new THREE.Group();
      const pMat = new THREE.MeshBasicMaterial({ color: 0x384152 });
      const postW = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.22), pMat);
      postW.position.set(-cellW * 0.5 + 0.14, 0.52, 0);
      const postE = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.05, 0.22), pMat);
      postE.position.set(cellW * 0.5 - 0.14, 0.52, 0);
      const bMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.82 });
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(cellW - 0.2, 0.14, 0.12), bMat);
      bar1.position.set(0, 0.42, 0);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(cellW - 0.2, 0.14, 0.12), bMat);
      bar2.position.set(0, 0.78, 0);
      g.add(postW, postE, bar1, bar2);
      g.position.set(cx, h, cz);
      this.scene3d.add(g);
      this.registerTintMat(g);
      const list = this.gateMeshes.get(gateId) ?? [];
      list.push(g);
      this.gateMeshes.set(gateId, list);
      created.push(g);
    }
  }

  private dirAngleY(dir: string) {
    return dir === 'right' ? -Math.PI / 2 : dir === 'left' ? Math.PI / 2 : dir === 'down' ? Math.PI : 0;
  }

  private addGymPuzzle3D(
    type: string,
    o: MapInfo['objects'][number],
    cellW: number,
    cellH: number,
    created: THREE.Object3D[],
    cx: number,
    cz: number,
    h: number,
  ) {
    const op = (k: string, d: unknown = '') => o.properties?.find((pr) => pr.name === k)?.value ?? d;
    const addM = (m: THREE.Object3D) => {
      this.scene3d.add(m);
      this.registerTintMat(m);
      created.push(m);
      return m;
    };
    const makeLabelTex = (txt: string, bg: string, fg: string) => {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d')!;
      g.fillStyle = bg; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = '#ffd080'; g.lineWidth = 4; g.strokeRect(4, 4, 56, 56);
      g.fillStyle = fg; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 32, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      return tex;
    };

    if (type === 'arrow_pad') {
      const baseDir = String(op('dir', 'up'));
      const altDir = String(op('altDir', baseDir));
      const railGroup = String(op('railGroup', 'fg1'));
      const col = railGroup === 'fg2' || railGroup === 'r2' ? 0x38d8ff : 0xfacc15;
      const grp = new THREE.Group();
      grp.position.set(cx, h + 0.03, cz);
      grp.rotation.y = this.dirAngleY(baseDir);
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.04, 0.86),
        new THREE.MeshBasicMaterial({ color: 0x334155 }),
      );
      grp.add(plate);
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.055, 0.42),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      shaft.position.set(0, 0.015, 0.1);
      grp.add(shaft);
      const head = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.06, 0.24),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      head.position.set(0, 0.02, -0.18);
      grp.add(head);
      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.065, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      tip.position.set(0, 0.025, -0.28);
      grp.add(tip);
      addM(grp);
      this.dynArrows.push({ group: grp, baseDir, altDir, railGroup, curAngle: this.dirAngleY(baseDir) });
      return;
    }

    if (type === 'snowball') {
      const grp = new THREE.Group();
      grp.position.set(cx, h, cz);
      const shadow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.44, 0.04, 12),
        new THREE.MeshBasicMaterial({ color: 0x8bb6db }),
      );
      shadow.position.y = 0.02;
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xdcf0ff }),
      );
      body.scale.set(1.08, 0.76, 1.08);
      body.position.y = 0.31;
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      cap.scale.set(1.05, 0.56, 1.05);
      cap.position.set(-0.04, 0.46, -0.04);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.41, 0.43, 0.12, 10),
        new THREE.MeshBasicMaterial({ color: 0xadd8f8 }),
      );
      band.position.y = 0.18;
      grp.add(shadow, body, cap, band);
      addM(grp);
      return;
    }

    if (type === 'snow_reset') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.05, 0.84),
        new THREE.MeshBasicMaterial({ color: 0x1e4d82 }),
      );
      base.position.set(cx, h + 0.025, cz);
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.07, 0.54),
        new THREE.MeshBasicMaterial({ color: 0x64d2ff }),
      );
      ring.position.set(cx, h + 0.05, cz);
      addM(base);
      addM(ring);
      this.resetPads.push({ ring, baseY: h + 0.05 });
      return;
    }

    if (type === 'pair_card') {
      const sym = String(op('pairKey', 'leaf_red'));
      const SYM_COL: Record<string, number> = {
        leaf_red: 0xe8524a, sun_gold: 0xffd448, sakura: 0xff88b8, violet: 0xa870ff, bellflower: 0x48b8ff,
        emerald: 0x22c55e, coral: 0xf97316, frost: 0x67e8f9,
      };
      const fc = SYM_COL[sym] ?? 0xff6b9d;
      const grp = new THREE.Group();
      grp.position.set(cx, h + 0.04, cz);
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.06, 0.82),
        new THREE.MeshBasicMaterial({ color: 0x31703f }),
      );
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.07, 0.44),
        new THREE.MeshBasicMaterial({ color: 0x62c46d }),
      );
      back.add(leaf);
      const front = new THREE.Mesh(
        new THREE.BoxGeometry(0.76, 0.08, 0.76),
        new THREE.MeshBasicMaterial({ color: 0xfff7e6 }),
      );
      const petal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshBasicMaterial({ color: fc }),
      );
      petal.scale.set(1.2, 0.45, 1.2);
      petal.position.y = 0.09;
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.1, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
      );
      core.position.y = 0.13;
      front.add(petal, core);
      front.visible = false;
      grp.add(back, front);
      addM(grp);
      this.cardMeshes.set(o.id, { group: grp, back, front, flip: 0 });
      return;
    }

    if (type === 'rail_switch') {
      const rg = String(op('railGroup', 'fg1'));
      const col = rg === 'fg2' || rg === 'r2' ? 0x38d8ff : 0xfacc15;
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.18, 0.72),
        new THREE.MeshBasicMaterial({ color: 0x333b4d }),
      );
      base.position.set(cx, h + 0.09, cz);
      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(0.78, 0.06, 0.78),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      trim.position.set(cx, h + 0.03, cz);
      const lever = new THREE.Group();
      lever.position.set(cx, h + 0.18, cz);
      const stick = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.48, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xd1d5db }),
      );
      stick.position.y = 0.24;
      const knob = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 8, 6),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      knob.position.y = 0.5;
      lever.add(stick, knob);
      lever.rotation.z = -0.45;
      addM(trim);
      addM(base);
      addM(lever);
      this.railLevers.push({ lever, railGroup: rg, curRot: -0.45 });
      return;
    }

    if (type === 'quiz_pad') {
      const gid = String(op('gateId', 'eq1'));
      const lbl = String(op('num', '?'));
      const rimMat = new THREE.MeshBasicMaterial({ color: 0x7a2412 });
      const padMat = new THREE.MeshBasicMaterial({ map: makeLabelTex(lbl, '#c2410c', '#fff4cc') });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.04, 0.88), rimMat);
      rim.position.set(cx, h + 0.02, cz);
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.055, 0.78), padMat);
      pad.position.set(cx, h + 0.025, cz);
      addM(rim);
      addM(pad);
      const list = this.quizMats.get(gid) ?? [];
      list.push({ pad: padMat, rim: rimMat });
      this.quizMats.set(gid, list);
      return;
    }

    if (type === 'prism') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.44, 0.16, 8),
        new THREE.MeshBasicMaterial({ color: 0x263250 }),
      );
      base.position.set(cx, h + 0.08, cz);
      const rotor = new THREE.Group();
      rotor.position.set(cx, h + 0.34, cz);
      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28, 0),
        new THREE.MeshBasicMaterial({ color: 0x56d8ff }),
      );
      crystal.scale.set(0.9, 1.35, 0.9);
      const mirror = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.42, 0.07),
        new THREE.MeshBasicMaterial({ color: 0xd8f8ff }),
      );
      const rot0 = Number(op('rot', 0));
      rotor.rotation.y = (rot0 * Math.PI) / 2 - Math.PI / 4;
      rotor.add(crystal, mirror);
      addM(base);
      addM(rotor);
      this.prismMeshes.set(o.id, { rotor, crystal, curRot: rotor.rotation.y });
      return;
    }

    if (type === 'laser_src') {
      const grp = new THREE.Group();
      grp.position.set(cx, h, cz);
      grp.rotation.y = this.dirAngleY(String(op('dir', 'right')));
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.74, 0.32, 0.74),
        new THREE.MeshBasicMaterial({ color: 0x2a183b }),
      );
      base.position.y = 0.16;
      const nozzle = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.24, 0.44),
        new THREE.MeshBasicMaterial({ color: 0x5c247a }),
      );
      nozzle.position.set(0, 0.28, -0.22);
      const lens = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.18, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xff3b8b }),
      );
      lens.position.set(0, 0.28, -0.44);
      grp.add(base, nozzle, lens);
      addM(grp);
      return;
    }

    if (type === 'laser_dst') {
      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.36, 0.42, 0.22, 8),
        new THREE.MeshBasicMaterial({ color: 0x1e363c }),
      );
      base.position.set(cx, h + 0.11, cz);
      const mat = new THREE.MeshBasicMaterial({ color: 0x2c6e60 });
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat);
      gem.position.set(cx, h + 0.48, cz);
      addM(base);
      addM(gem);
      this.laserDestRings.set(o.id, { gem, mat });
      return;
    }

    if (type === 'rune_pad' || type === 'rune_demo') {
      const idx = Number(op('runeIdx', 0));
      const COLS = [0xff5e78, 0x48c8ff, 0xffd848, 0xb874ff];
      const baseColor = type === 'rune_demo' ? 0xc084fc : (COLS[idx % COLS.length] ?? 0x60a5fa);
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.05, 0.86),
        new THREE.MeshBasicMaterial({ color: type === 'rune_demo' ? 0x3f1e68 : 0x1f2b54 }),
      );
      rim.position.set(cx, h + 0.025, cz);
      const padMat = new THREE.MeshBasicMaterial({ color: baseColor });
      const pad = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.68), padMat);
      pad.position.set(cx, h + 0.04, cz);
      addM(rim);
      addM(pad);
      if (type === 'rune_demo') {
        const gMat = new THREE.MeshBasicMaterial({ color: 0xfde047 });
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), gMat);
        gem.position.set(cx, h + 0.45, cz);
        addM(gem);
        this.demoGems.push({ gem, baseY: h + 0.45, mat: gMat });
      } else {
        const gem = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.14, 0),
          new THREE.MeshBasicMaterial({ color: baseColor }),
        );
        gem.position.set(cx, h + 0.22, cz);
        addM(gem);
        this.runeNodes.push({ id: o.id, idx, padMat, baseColor, gem, phase: idx * 1.1 });
      }
      return;
    }

    if (type === 'stop_tile') {
      const grp = new THREE.Group();
      grp.position.set(cx, h + 0.025, cz);
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.05, 0.88),
        new THREE.MeshBasicMaterial({ color: 0x1e293b }),
      );
      grp.add(base);
      const sqMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      for (const [sx, sz] of [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]]) {
        const sq = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.065, 0.24), sqMat);
        sq.position.set(sx, 0.015, sz);
        grp.add(sq);
      }
      addM(grp);
      return;
    }

    if (type === 'water_switch') {
      const level = Number(op('level', 0));
      const col = level === 0 ? 0xfacc15 : level === 1 ? 0x34d399 : 0x38bdf8;
      const grp = new THREE.Group();
      grp.position.set(cx, h, cz);
      const ped = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.14, 0.86),
        new THREE.MeshBasicMaterial({ color: 0x1e3a5f }),
      );
      ped.position.y = 0.07;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.32, 0.36, 0.18, 12),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      cap.position.y = 0.2;
      grp.add(ped, cap);
      addM(grp);
      this.waterSwitchCaps.push({ cap, level, baseY: 0.2 });
      return;
    }

    if (type === 'water_bridge') {
      const reqLevel = Number(op('reqLevel', 0));
      const stripeCol = reqLevel === 0 ? 0xfacc15 : reqLevel === 1 ? 0x34d399 : 0x38bdf8;
      const grp = new THREE.Group();
      grp.position.set(cx, h + 0.03, cz);
      const mat = new THREE.MeshBasicMaterial({ color: 0xb87e48, transparent: true, opacity: 1 });
      const deck = new THREE.Mesh(new THREE.BoxGeometry(cellW - 0.06, 0.14, cellH - 0.06), mat);
      deck.position.y = 0.07;
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(cellW - 0.14, 0.03, cellH - 0.14),
        new THREE.MeshBasicMaterial({ color: stripeCol, transparent: true, opacity: 0.9 }),
      );
      stripe.position.y = 0.15;
      const inner = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.2, cellW - 0.34), 0.035, Math.max(0.2, cellH - 0.34)),
        mat,
      );
      inner.position.y = 0.155;
      grp.add(deck, stripe, inner);
      addM(grp);
      this.waterBridgeMeshes.push({ group: grp, reqLevel, baseY: h + 0.03, mat, curY: h + 0.03 });
      return;
    }

    if (type === 'push_block') {
      const grp = new THREE.Group();
      grp.position.set(cx, h, cz);
      const mat = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.72, 0.84), mat);
      body.position.y = 0.36;
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.88, 0.12, 0.88),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
      );
      band.position.y = 0.36;
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.08, 0.66),
        new THREE.MeshBasicMaterial({ color: 0x94a3b8 }),
      );
      top.position.y = 0.74;
      grp.add(body, band, top);
      addM(grp);
      this.pushBlockMeshes.set(o.id, { group: grp, mat, curX: cx, curZ: cz, curY: h, baseY: h });
      return;
    }

    if (type === 'block_slot') {
      const grp = new THREE.Group();
      grp.position.set(cx, h + 0.02, cz);
      const outer = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.04, 0.9),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b }),
      );
      const hole = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.05, 0.7),
        new THREE.MeshBasicMaterial({ color: 0x1c1917 }),
      );
      hole.position.y = 0.01;
      grp.add(outer, hole);
      addM(grp);
      return;
    }

    if (type === 'puzzle_reset') {
      const base = new THREE.Mesh(
        new THREE.BoxGeometry(0.84, 0.05, 0.84),
        new THREE.MeshBasicMaterial({ color: 0x1e3a5f }),
      );
      base.position.set(cx, h + 0.025, cz);
      const ring = new THREE.Mesh(
        new THREE.BoxGeometry(0.54, 0.07, 0.54),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
      );
      ring.position.set(cx, h + 0.05, cz);
      addM(base);
      addM(ring);
      this.resetPads.push({ ring, baseY: h + 0.05 });
      return;
    }

    if (type === 'cracked_tile') {
      const gateId = String(op('gateId', 'em_r1'));
      const rimMat = new THREE.MeshBasicMaterial({ color: 0x451a03 });
      const mat = new THREE.MeshBasicMaterial({ color: 0x9a3412 });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.05, 0.94), rimMat);
      rim.position.set(cx, h + 0.025, cz);
      const slab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.07, 0.8), mat);
      slab.position.set(cx, h + 0.035, cz);
      addM(rim);
      addM(slab);
      this.crackedTileMeshes.set(o.id, { mat, rimMat, gateId });
      return;
    }
    void cellW; void cellH;
  }

  private updateGymPuzzle3D(dt: number) {
    const s = dt / 1000;
    const pz = this.gymPuzzle;
    const gates = this.gymOpenGates;

    // 1. 철도 레버 & 회전식 화살표 발판
    for (const rv of this.railLevers) {
      const target = pz.flippedRails?.has(rv.railGroup) ? 0.45 : -0.45;
      rv.curRot += (target - rv.curRot) * Math.min(1, s * 12);
      rv.lever.rotation.z = rv.curRot;
    }
    for (const da of this.dynArrows) {
      const dir = pz.flippedRails?.has(da.railGroup) ? da.altDir : da.baseDir;
      const target = this.dirAngleY(dir);
      let diff = target - da.curAngle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      da.curAngle += diff * Math.min(1, s * 14);
      da.group.rotation.y = da.curAngle;
    }

    // 2. 기억력 단풍꽃 카드 뒤집기
    for (const [id, cm] of this.cardMeshes) {
      const rev = pz.revealedCards?.has(id) ?? false;
      const tgt = rev ? 1 : 0;
      cm.flip += (tgt - cm.flip) * Math.min(1, s * 12);
      const showFront = cm.flip > 0.5;
      cm.front.visible = showFront;
      cm.back.visible = !showFront;
      cm.group.scale.x = Math.max(0.12, Math.abs(cm.flip * 2 - 1));
      cm.front.position.y = showFront ? (cm.flip - 0.5) * 0.14 : 0;
    }

    // 3. 프리즘 회전 & 레이저 광선 + 리시버
    for (const [id, pm] of this.prismMeshes) {
      const rot = pz.prismRots?.get(id) ?? 0;
      const tgt = (rot * Math.PI) / 2 - Math.PI / 4;
      pm.curRot += (tgt - pm.curRot) * Math.min(1, s * 14);
      pm.rotor.rotation.y = pm.curRot;
    }
    for (const [id, dst] of this.laserDestRings) {
      const lit = pz.litLaserDests?.has(id) ?? false;
      dst.mat.color.setHex(lit ? 0x4cffb8 : 0x2c6e60);
      dst.gem.rotation.y += s * (lit ? 4.2 : 0.9);
      const sc = lit ? 1.25 : 0.95;
      dst.gem.scale.set(sc, sc, sc);
    }
    const segs = pz.laserSegments ?? [];
    const sig = segs.map((v) => v.join(',')).join('|');
    if (sig !== this.laserSig) {
      this.laserSig = sig;
      if (this.laserBeamGroup) {
        this.scene3d.remove(this.laserBeamGroup);
        this.laserBeamGroup = null;
      }
      if (segs.length) {
        const g = new THREE.Group();
        for (const [x1, z1, x2, z2] of segs) {
          const dx = x2 - x1, dz = z2 - z1;
          const len = Math.hypot(dx, dz);
          if (len < 0.05) continue;
          const h1 = this.hts.sample(x1, z1), h2 = this.hts.sample(x2, z2);
          const midY = (h1 + h2) * 0.5 + 0.34;
          const beam = new THREE.Mesh(
            new THREE.BoxGeometry(len, 0.07, 0.07),
            new THREE.MeshBasicMaterial({ color: 0xff3b9a }),
          );
          beam.position.set((x1 + x2) * 0.5, midY, (z1 + z2) * 0.5);
          beam.rotation.y = -Math.atan2(dz, dx);
          g.add(beam);
          const core = new THREE.Mesh(
            new THREE.BoxGeometry(len, 0.035, 0.035),
            new THREE.MeshBasicMaterial({ color: 0xffffff }),
          );
          core.position.copy(beam.position);
          core.rotation.y = beam.rotation.y;
          g.add(core);
        }
        this.scene3d.add(g);
        this.laserBeamGroup = g;
      }
    }

    // 4. 잿빛 도장 불꽃 퀴즈 발판
    const wrongFlash = (pz.quizWrongUntil ?? 0) > performance.now();
    for (const [gid, mats] of this.quizMats) {
      const ok = gates?.has(gid) ?? false;
      for (const m of mats) m.rim.color.setHex(ok ? 0x22c55e : wrongFlash ? 0xff2244 : 0x7a2412);
    }

    // 5. 별마루 도장 별빛 룬 시퀀스 & 리셋 패드
    const nowSec = performance.now() / 1000;
    for (const rn of this.runeNodes) {
      const bright = pz.litRune === rn.idx;
      rn.padMat.color.setHex(bright ? 0xffffff : rn.baseColor);
      rn.gem.rotation.y += s * (bright ? 5 : 1.5);
      rn.gem.scale.setScalar(bright ? 1.65 : 1.0);
    }
    for (const dg of this.demoGems) {
      dg.gem.rotation.y += s * (pz.demoActive ? 4.5 : 1.4);
      dg.gem.position.y = dg.baseY + Math.sin(nowSec * 3.2) * 0.06;
      dg.mat.color.setHex(pz.demoActive ? 0xffffff : 0xfde047);
    }
    for (const rp of this.resetPads) {
      rp.ring.rotation.y += s * 0.8;
      rp.ring.position.y = rp.baseY + Math.sin(nowSec * 2.5) * 0.02;
    }

    // 5b. 물결항 도장 (들판식) 3단계 수위 스위치 & 부교 상하 애니메이션
    const wl = pz.waterLevel ?? 0;
    for (const ws of this.waterSwitchCaps) {
      const pressed = ws.level === wl;
      const ty = pressed ? ws.baseY - 0.09 : ws.baseY;
      ws.cap.position.y += (ty - ws.cap.position.y) * Math.min(1, s * 12);
    }
    for (const wb of this.waterBridgeMeshes) {
      const active = wb.reqLevel === wl;
      const targetY = active ? wb.baseY + 0.04 : wb.baseY - 0.16;
      wb.curY += (targetY - wb.curY) * Math.min(1, s * 10);
      wb.group.position.y = wb.curY;
      wb.mat.color.setHex(active ? 0xc88d52 : 0x3b6891);
      wb.mat.opacity = active ? 1 : 0.42;
    }

    // 5c. 쇳불 도장 (장막/검은먹식) 밀기 블록 이동 & 슬롯 안착
    if (pz.pushBlocks && this.pushBlockMeshes.size) {
      for (const [id, bm] of this.pushBlockMeshes) {
        const st = pz.pushBlocks.get(id);
        if (!st) continue;
        const tx = st.x + 0.5, tz = st.y + 0.5;
        const ty = st.locked ? bm.baseY - 0.58 : bm.baseY;
        bm.curX += (tx - bm.curX) * Math.min(1, s * 14);
        bm.curZ += (tz - bm.curZ) * Math.min(1, s * 14);
        bm.curY += (ty - bm.curY) * Math.min(1, s * 12);
        bm.group.position.set(bm.curX, bm.curY, bm.curZ);
        const onSlot = this.world.info.blockSlotAt(st.x, st.y) != null;
        bm.mat.color.setHex(st.locked ? 0xfacc15 : onSlot ? 0xf59e0b : 0x64748b);
      }
    }

    // 5d. 잿빛 도장 (루네식) 금 가는 화산판 (미밟음/금감/완료)
    if (this.crackedTileMeshes.size) {
      for (const [id, cm] of this.crackedTileMeshes) {
        const solved = gates?.has(cm.gateId) ?? false;
        const cracked = pz.crackedTiles?.has(id) ?? false;
        if (solved) {
          cm.mat.color.setHex(0xfacc15);
          cm.rimMat.color.setHex(0x22c55e);
        } else if (cracked) {
          cm.mat.color.setHex(0xff5722);
          cm.rimMat.color.setHex(0xffd54f);
        } else {
          cm.mat.color.setHex(0x6b2714);
          cm.rimMat.color.setHex(0x2e120a);
        }
      }
    }

    // 6. 눈덩이 파괴 파편 물리
    for (let i = this.snowShards.length - 1; i >= 0; i--) {
      const sh = this.snowShards[i];
      sh.life -= s;
      if (sh.life <= 0) {
        this.scene3d.remove(sh.mesh);
        sh.mesh.geometry.dispose();
        (sh.mesh.material as THREE.Material).dispose();
        this.snowShards.splice(i, 1);
        continue;
      }
      sh.vy -= 8.5 * s;
      sh.mesh.position.x += sh.vx * s;
      sh.mesh.position.y += sh.vy * s;
      sh.mesh.position.z += sh.vz * s;
      sh.mesh.scale.setScalar(Math.max(0.1, sh.life / 0.6));
    }
  }

  private frameOffsets(gy: number, zoomScale = 1) {
    const tmpV = new THREE.Vector3();
    const el = (this.cam.el * Math.PI) / 180;
    const d = this.cam.dist * Math.max(0.45, Math.min(2.6, zoomScale));
    this.camera.position.set(0, gy + Math.sin(el) * d, Math.cos(el) * d);
    this.camera.lookAt(0, gy, 0);
    this.camera.updateMatrixWorld();
    const hit = (nx: number, ny: number) => {
      tmpV.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
      const t = tmpV.y < -1e-3 ? (gy - this.camera.position.y) / tmpV.y : 1e4;
      return { x: this.camera.position.x + tmpV.x * t, z: this.camera.position.z + tmpV.z * t };
    };
    const tl = hit(-1, 1),
      bl = hit(-1, -1),
      br = hit(1, -1);
    return { minX: bl.x * 0.92, maxX: br.x * 0.92, minZ: tl.z * 0.94, maxZ: bl.z * 0.9 };
  }

  update(
    dt: number,
    state: {
      player: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text; dir?: Dir; surfing?: boolean };
      partner?: { sprite: Phaser.GameObjects.Sprite; coordSprite?: Phaser.GameObjects.Image; emote?: Phaser.GameObjects.Sprite };
      npcs: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text }[];
      trainers: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text }[];
      storyActors: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text }[];
      plotActors: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text }[];
      remotes: Iterable<{ sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text }>;
      remotePartners: Iterable<{ sprite: Phaser.GameObjects.Sprite; coordSprite?: Phaser.GameObjects.Image; emote?: Phaser.GameObjects.Sprite }>;
      chickens: { sprite: Phaser.GameObjects.Sprite }[];
      ducks: { sprite: Phaser.GameObjects.Sprite }[];
      waterLumis?: { sprite: Phaser.GameObjects.Sprite }[];
      wardens?: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; getConeData(): { ox: number; oy: number; points: { x: number; y: number }[]; state?: 'patrol' | 'suspicious' | 'chase'; alerted: boolean } }[];
      forage: Iterable<Phaser.GameObjects.Image>;
      crops?: Map<string, Phaser.GameObjects.Sprite>;
      tiles?: Map<string, FarmTile>;
      legend?: Phaser.GameObjects.Sprite;
      dish?: Phaser.GameObjects.Image;
      bobber?: Phaser.GameObjects.Arc;
      cursor?: Phaser.GameObjects.Image;
      cam?: { baseZoom: number; followPlayer: boolean };
      openGates?: ReadonlySet<string>;
      minutes: number;
      weather: string;
    },
  ) {
    if (!Stage3D.enabled || this.hiddenByBattle || !Stage3D.renderer) return;

    if (this.soilDirty && state.tiles) this.refreshSoil(state.tiles);

    // 1) 제거된 맵 오브젝트 동기화 (벌목·채광·비전기술·보물상자)
    this.updateGymPuzzle3D(dt);
    for (const wo of this.world.objects) {
      const meshes = this.objMeshes.get(wo.id);
      if (meshes) {
        const active = wo.sprite.active;
        for (const m of meshes) m.visible = active;
      }
    }

    // 2) 플레이어 설치물 동기화
    for (const [id, po] of this.world.placed) {
      if (!this.placedMeshes.has(id)) {
        const created: THREE.Object3D[] = [];
        const sh = this.manifest.spritesheets[po.type],
          im = this.manifest.images[po.type];
        const img = this.getImg(po.type);
        if (img && (sh || im)) {
          const tex = pixelTex(img, `placed:${po.type}`);
          const bb = sh
            ? new Billboard(tex, sh.frameWidth, sh.frameHeight, sh.frames, 1, sh.originY)
            : new Billboard(tex, im!.w, im!.h, 1, 1, im!.originY);
          const gx = po.x + 0.5,
            gz = po.y + 1;
          bb.mesh.position.set(gx, this.hts.sample(gx, gz), gz);
          this.scene3d.add(bb.mesh);
          this.registerTintMat(bb.mesh);
          created.push(bb.mesh);
          if (po.type === 'lamp') created.push(...this.addLampGlow(gx, bb.mesh.position.y, gz));
        }
        this.placedMeshes.set(id, created);
      } else {
        for (const m of this.placedMeshes.get(id) ?? []) if (!m.userData?.fixedRot) m.rotation.y = this.camYaw;
      }
    }
    for (const [id, meshes] of this.placedMeshes) {
      if (!this.world.placed.has(id)) {
        for (const m of meshes) this.scene3d.remove(m);
        this.placedMeshes.delete(id);
      }
    }

    // 3) 동적 스프라이트 빌보드 동기화
    for (const e of this.dynPool.values()) e.seen = false;
    for (const l of this.labelPool.values()) l.seen = false;

    const syncChar = (c: {
      sprite: Phaser.GameObjects.Sprite;
      emote?: Phaser.GameObjects.Sprite;
      label?: Phaser.GameObjects.Text;
      bubble?: Phaser.GameObjects.Text;
      bubbleSkin?: string;
    }) => {
      this.syncSprite(c.sprite, { shadowScale: 0.85 });
      if (!c.sprite.active || !c.sprite.visible || c.sprite.alpha <= 0.01) return;
      if (c.emote?.active && c.emote.visible) {
        c.emote.setData('groundY', c.sprite.y);
        this.syncSprite(c.emote, { shadowScale: 0, yBias: 1.42, zOffset: 0.05 });
      }
      const gx = c.sprite.x / T,
        gz = c.sprite.y / T,
        gy = this.hts.sample(gx, Math.max(0, Math.min(this.world.info.height - 0.01, gz)));
      if (c.label) this.syncLabel(c.label, gx, gy, gz, false);
      if (c.bubble) this.syncLabel(c.bubble, gx, gy, gz, true, c.bubbleSkin ?? 'default');
    };

    syncChar(state.player);
    const py = this.hts.sample(
      Math.max(0.05, Math.min(this.world.info.width - 0.05, state.player.sprite.x / T)),
      Math.max(0.05, Math.min(this.world.info.height - 0.05, state.player.sprite.y / T)),
    );
    const targetBoost = Math.max(0, Math.min(1, (py - 1.15) / 1.45));
    this.bridgeCamBoost += (targetBoost - this.bridgeCamBoost) * Math.min(1, dt * 0.0045);
    if (state.partner) {
      this.syncSprite(state.partner.sprite, { shadowScale: 0.45, zOffset: 0.01 });
      if (state.partner.coordSprite?.active) this.syncSprite(state.partner.coordSprite, { shadowScale: 0, zOffset: 0.03 });
      if (state.partner.emote?.active) {
        state.partner.emote.setData('groundY', state.partner.sprite.y);
        this.syncSprite(state.partner.emote, { shadowScale: 0, yBias: 0.88, zOffset: 0.04 });
      }
    }
    for (const n of state.npcs) syncChar(n);
    for (const t of state.trainers) syncChar(t);
    for (const a of state.storyActors) syncChar(a);
    for (const a of state.plotActors) syncChar(a);
    for (const r of state.remotes) syncChar(r);
    for (const rp of state.remotePartners) {
      this.syncSprite(rp.sprite, { shadowScale: 0.45, zOffset: 0.01 });
      if (rp.coordSprite?.active) this.syncSprite(rp.coordSprite, { shadowScale: 0, zOffset: 0.03 });
      if (rp.emote?.active) {
        rp.emote.setData('groundY', rp.sprite.y);
        this.syncSprite(rp.emote, { shadowScale: 0, yBias: 0.88, zOffset: 0.04 });
      }
    }
    for (const c of state.chickens) this.syncSprite(c.sprite, { shadowScale: 0.35 });
    for (const d of state.ducks) this.syncSprite(d.sprite, { shadowScale: 0 });
    if (state.waterLumis) {
      for (const wl of state.waterLumis) this.syncSprite(wl.sprite, { shadowScale: 0 });
    }
    if (state.wardens?.length) {
      for (const w of state.wardens) syncChar(w);
      this.syncWardenCones(state.wardens);
    } else if (this.wardenCones.length) {
      for (const m of this.wardenCones) m.visible = false;
    }
    if (this.surfMount) {
      const onSurf = !!state.player.surfing;
      this.surfMount.visible = onSurf;
      if (onSurf) {
        const px0 = state.player.sprite.x / T, pz0 = state.player.sprite.y / T;
        const bob = Math.sin(this.phaserScene.time.now * 0.008) * 0.04;
        this.surfMount.position.set(px0, -0.04 + bob, pz0);
        if (this.surfRipple) {
          const p = (this.phaserScene.time.now * 0.0018) % 1;
          const sc = 0.85 + p * 0.75;
          this.surfRipple.scale.set(sc, sc, 1);
          (this.surfRipple.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.65;
        }
      }
    }
    for (const f of state.forage) this.syncSprite(f, { shadowScale: 0.35 });
    if (state.crops) {
      for (const sp of state.crops.values()) this.syncSprite(sp, { shadowScale: 0, zOffset: 0.02 });
    }
    if (state.legend) this.syncSprite(state.legend, { shadowScale: 1.3 });
    if (state.dish) this.syncSprite(state.dish, { shadowScale: 0, yBias: 1.1, zOffset: 0.08 });

    for (const [sp, e] of this.dynPool) {
      if (!e.seen || !sp.active) {
        this.scene3d.remove(e.bb.mesh, e.shadow);
        this.dynPool.delete(sp);
      }
    }
    for (const [txt, l] of this.labelPool) {
      if (!l.seen || !txt.active) {
        this.scene3d.remove(l.mesh);
        this.labelPool.delete(txt);
      }
    }

    // 4) 타일 커서 & 풍차 날개
    if (this.cursorMesh && state.cursor) {
      this.cursorMesh.visible = state.cursor.visible;
      if (state.cursor.visible) {
        const cx = (state.cursor.x + 1) / T + 0.5;
        const cz = (state.cursor.y + 1) / T + 0.5;
        this.cursorMesh.position.set(cx, this.hts.sample(cx, cz) + 0.04, cz);
      }
    }
    if (this.bladesMesh) this.bladesMesh.rotation.z -= dt * 0.0006;
    for (const gem of this.spireGems) gem.rotation.y += dt * 0.0014;
    for (const orb of this.gimmickSpin) orb.rotation.y += dt * 0.0024;
    if (state.openGates) {
      for (const [gid, list] of this.gateMeshes) {
        const open = state.openGates.has(gid);
        for (const m of list) m.visible = !open;
      }
      for (const [gid, caps] of this.switchCaps) {
        const open = state.openGates.has(gid);
        for (const c of caps) {
          c.cap.position.y = open ? c.baseY - 0.07 : c.baseY;
          c.cap.scale.y = open ? 0.35 : 1;
        }
      }
    }

    // 5) 플레이어를 가리는 고층 빌딩 · 마을 건물 · 나무 반투명 처리
    const pLift = Number(state.player.sprite.getData('lift') || 0);
    const pGroundY = state.player.sprite.getData('groundY');
    const px = state.player.sprite.x / T;
    const pz = (typeof pGroundY === 'number' ? pGroundY : pLift ? state.player.sprite.y + pLift : state.player.sprite.y) / T;
    for (const b of this.tall) {
      const hide = px > b.x0 - 0.4 && px < b.x1 + 0.4 && pz < b.z0 - 0.05 && pz > b.z0 - b.h * 0.95;
      if (hide !== b.faded) {
        b.faded = hide;
        for (const m of b.mats) {
          m.transparent = hide;
          m.opacity = hide ? 0.34 : 1;
          m.depthWrite = !hide;
        }
      }
    }

    // 6) 물 · 나무 흔들림 애니메이션 + 시간대/날씨 조명 + 창문 하늘 + 낚시찌
    this.waterT += dt;
    this.swayT += dt;
    if (this.waterMat && this.waterTex.length && this.waterT > 260) {
      this.waterT = 0;
      const i = (this.waterTex.indexOf(this.waterMat.map!) + 1) % this.waterTex.length;
      this.waterMat.map = this.waterTex[i];
    }
    if (this.swayT > 320) {
      this.swayT = 0;
      for (const s of this.sway) s.tex.offset.x = (s.tex.offset.x + 1 / s.frames) % 1;
    }
    if (this.seaCurrentTexs.length) {
      for (const t of this.seaCurrentTexs) t.offset.y = (t.offset.y - dt * 0.0022) % 1;
    }
    if (this.whirlpoolTexs.length) {
      this.whirlpoolT += dt;
      if (this.whirlpoolT > 120) {
        this.whirlpoolT = 0;
        const seen = new Set<THREE.Texture>();
        for (const wp of this.whirlpoolTexs) {
          if (seen.has(wp.tex)) continue;
          seen.add(wp.tex);
          wp.tex.offset.x = (wp.tex.offset.x + 1 / wp.frames) % 1;
        }
      }
    }
    this.updateAtmosphere(state.minutes, state.weather);
    if (this.campfires.length) {
      const now = this.phaserScene.time.now;
      this.campfireT += dt;
      const stepFrame = this.campfireT > 150;
      if (stepFrame) this.campfireT = 0;
      const darkFactor = Math.max(0.45, Math.min(1, this.nightAlpha * 1.35 + (state.minutes >= 17 * 60 || state.minutes < 7 * 60 ? 0.55 : 0)));
      const seenTex = new Set<THREE.Texture>();
      for (const cf of this.campfires) {
        if (stepFrame && cf.tex && cf.frames > 1 && !seenTex.has(cf.tex)) {
          seenTex.add(cf.tex);
          cf.tex.offset.x = (cf.tex.offset.x + 1 / cf.frames) % 1;
        }
        const flick = 0.92 + 0.08 * Math.sin(now * 0.014 + cf.phase) + 0.04 * Math.cos(now * 0.031 + cf.phase);
        const sc = 0.96 + 0.06 * Math.sin(now * 0.012 + cf.phase);
        cf.glowOuter.visible = true;
        cf.glowInner.visible = true;
        cf.halo.visible = true;
        cf.glowOuter.scale.set(sc, sc, 1);
        cf.glowInner.scale.set(sc, sc, 1);
        cf.halo.scale.set(sc, sc, 1);
        cf.outerMat.opacity = Math.min(0.85, darkFactor * 0.72 * flick);
        cf.innerMat.opacity = Math.min(0.95, darkFactor * 0.88 * flick);
        cf.haloMat.opacity = Math.min(0.68, darkFactor * 0.56 * flick);
      }
    }
    this.fx.updateWindows(state.minutes, state.weather, this.phaserScene.time.now);
    this.fx.syncFishing(px, pz, state.player.dir ?? 'down', state.bobber, dt / 1000, this.phaserScene.time.now / 1000);

    // 7) 포켓몬 5세대풍 다이내믹 카메라 추적 (타이틀 팬 · 줌 · 흔들림 · 페이드/플래시 동기화)
    const rawGy = this.hts.sample(px, Math.max(0, Math.min(this.world.info.height - 0.01, pz)));
    if (!this.camInit) this.smoothGy = rawGy;
    else this.smoothGy += (rawGy - this.smoothGy) * Math.min(1, dt / 95);
    const gy = this.smoothGy;
    if (this.torchMesh) {
      this.torchMesh.visible = this.cave || this.nightAlpha > 0.05;
      this.torchMesh.position.set(px, gy + 0.04, pz + 0.1);
    }

    const pCam = this.phaserScene.cameras.main;
    const followPlayer = state.cam ? state.cam.followPlayer : true;
    const rawTx = followPlayer ? px : pCam.midPoint.x / T;
    const rawTz = followPlayer ? pz : pCam.midPoint.y / T;
    const zoomScale = state.cam ? state.cam.baseZoom / Math.max(0.25, pCam.zoom) : 1;

    // 프레임 타임 변동이나 장애물 스침으로 카메라가 덜덜 떨리지 않도록 dt 정규화 + 데드존 적용
    const instVelX = dt > 1 ? (px - (this.lastPx || px)) / (dt / 1000) : 0;
    this.lastPx = px;
    this.lastVelX += (instVelX - this.lastVelX) * Math.min(1, dt / 120);
    const cleanVelX = Math.abs(this.lastVelX) < 1.8 ? 0 : this.lastVelX - Math.sign(this.lastVelX) * 1.8;
    const targetYaw = this.interior || !followPlayer ? 0 : Math.max(-0.024, Math.min(0.024, -cleanVelX * 0.0045));
    this.camYaw += (targetYaw - this.camYaw) * Math.min(1, dt / 320);
    if (Math.abs(this.camYaw) < 0.0004 && targetYaw === 0) this.camYaw = 0;

    let tx = rawTx,
      tz = rawTz;
    const W = this.world.info.width,
      H = this.world.info.height;
    if (followPlayer || zoomScale <= 1.15) {
      const f = this.frameOffsets(gy, zoomScale);
      tx = W <= f.maxX - f.minX ? W / 2 : Math.max(-f.minX, Math.min(W - f.maxX, tx));
      tz = H <= f.maxZ - f.minZ ? (H - f.minZ - f.maxZ) / 2 : Math.max(-f.minZ, Math.min(H - f.maxZ, tz));
    }

    if (!this.camInit) {
      this.camInit = true;
      this.camTarget.set(tx, gy, tz);
    } else {
      const lerpAmt = followPlayer ? 1 - Math.pow(0.0005, dt / 1000) : Math.min(1, dt / 90);
      this.camTarget.lerp(new THREE.Vector3(tx, gy, tz), lerpAmt);
      if (Math.hypot(tx - this.camTarget.x, tz - this.camTarget.z) < 0.0015) {
        this.camTarget.x = tx;
        this.camTarget.z = tz;
      }
    }

    this.fx.update(dt, this.camTarget, this.camYaw, state.weather, this.biome, this.interior, this.cave, this.phaserScene.time.now);

    const shake = pCam.shakeEffect as unknown as { isRunning: boolean; intensity?: { x: number; y: number } } | undefined;
    const shX = shake?.isRunning ? (Math.random() - 0.5) * (shake.intensity?.x ?? 0.01) * 34 : 0;
    const shY = shake?.isRunning ? (Math.random() - 0.5) * (shake.intensity?.y ?? shake.intensity?.x ?? 0.01) * 28 : 0;

    const el = ((this.cam.el - 3.5 * this.bridgeCamBoost) * Math.PI) / 180;
    const dist = this.cam.dist * Math.max(0.45, Math.min(2.6, zoomScale)) * (1 + 0.34 * this.bridgeCamBoost);
    const horiz = Math.cos(el) * dist;
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.camYaw) * horiz + shX,
      this.camTarget.y + Math.sin(el) * dist + shY,
      this.camTarget.z + Math.cos(this.camYaw) * horiz,
    );
    this.camera.lookAt(this.camTarget.x + shX * 0.5, this.camTarget.y + 0.35 + shY * 0.5, this.camTarget.z);

    const renderNow = () => Stage3D.renderer!.render(this.scene3d, this.camera);
    Stage3D.renderSnapshot = renderNow;
    renderNow();
    syncPhaserCamOverlay(pCam, true);
  }

  /** 별빛 교도소 경찰 감시관 3D 바닥 시야각 (순찰=파랑 · '?'의심=주황 · '!'추격=빨강) */
  private syncWardenCones(
    wardens: { getConeData(): { ox: number; oy: number; points: { x: number; y: number }[]; state?: 'patrol' | 'suspicious' | 'chase'; alerted: boolean } }[],
  ) {
    while (this.wardenCones.length < wardens.length) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.MeshBasicMaterial({
        color: 0x3b82f6,
        transparent: true,
        opacity: 0.34,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.renderOrder = 6;
      this.scene3d.add(mesh);
      this.wardenCones.push(mesh);
    }
    const pulse = 0.28 + Math.sin(this.phaserScene.time.now * 0.007) * 0.06;
    for (let i = 0; i < this.wardenCones.length; i++) {
      const mesh = this.wardenCones[i];
      const w = wardens[i];
      if (!w) { mesh.visible = false; continue; }
      const c = w.getConeData();
      if (c.points.length < 2) { mesh.visible = false; continue; }
      const tris = c.points.length - 1;
      const verts = new Float32Array(tris * 9);
      const y = 0.045;
      const ox = c.ox / T, oz = c.oy / T;
      for (let k = 0; k < tris; k++) {
        const a = c.points[k], b = c.points[k + 1];
        const base = k * 9;
        verts[base] = ox; verts[base + 1] = y; verts[base + 2] = oz;
        verts[base + 3] = a.x / T; verts[base + 4] = y; verts[base + 5] = a.y / T;
        verts[base + 6] = b.x / T; verts[base + 7] = y; verts[base + 8] = b.y / T;
      }
      mesh.geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      mesh.geometry.computeBoundingSphere();
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (c.state === 'chase' || c.alerted) {
        mat.color.setHex(0xef4444);
        mat.opacity = 0.56;
      } else if (c.state === 'suspicious') {
        mat.color.setHex(0xf59e0b);
        mat.opacity = 0.44 + Math.sin(this.phaserScene.time.now * 0.016) * 0.1;
      } else {
        mat.color.setHex(0x3b82f6);
        mat.opacity = pulse;
      }
      mesh.visible = true;
    }
  }

  destroy() {
    this.unsubToggle?.();
    if (Stage3D.renderSnapshot) Stage3D.renderSnapshot = undefined;
    syncPhaserCamOverlay(undefined, false);
    this.fx?.dispose();
    this.groundGlowTex?.dispose();
    this.groundGlowMat?.dispose();
    this.bulbGlowMat?.dispose();
    for (const m of this.wardenCones) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.wardenCones.length = 0;
    this.dynPool.clear();
    this.labelPool.clear();
    this.objMeshes.clear();
    this.placedMeshes.clear();
    this.gateMeshes.clear();
    this.switchCaps.clear();
    this.gimmickSpin.length = 0;
  }
}
