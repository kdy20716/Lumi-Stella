// 인게임 포켓몬 5세대(블랙·화이트) 스타일 2.5D 렌더러
//  - FarmScene 의 실시간 상태(플레이어·파트너 루미·NPC·트레이너·컷신 배우·농장 밭/작물·채집물·시간대/날씨)를
//    그대로 받아 원근 3D 지형 + 입체 건물 + 2D 도트 빌보드 디오라마로 실시간 렌더링
//  - 배틀 씬(BattleScene)이 열릴 때는 자동으로 숨겨지고, V 키 또는 상단 버튼으로 2.5D / 2D 즉시 전환 가능
import type Phaser from 'phaser';
import * as THREE from 'three';
import { prop, type TiledMap } from '@shared/sim/MapInfo';
import { SoilState, type FarmTile, type MapId } from '@shared/types';
import { TILE, type Manifest } from '../config';
import type { World } from '../world/World';
import { buildTerrainMesh, computeHeights, type Heights } from './Terrain';
import {
  Billboard,
  makeBlockout,
  makeBuilding,
  makeCaveWalls,
  makeStreetProp,
  paintUrban,
  pixelTex,
  type Tall,
} from './Proto3D';

const T = TILE;
type MapWithProps = TiledMap & { properties?: { name: string; value: string | number | boolean }[] };

interface DynEntry {
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
  private static badge?: HTMLButtonElement;
  private static _enabled = localStorage.getItem('sf:view25d') !== '0';

  static get enabled() {
    return Stage3D._enabled;
  }
  static set enabled(v: boolean) {
    Stage3D._enabled = v;
    try {
      localStorage.setItem('sf:view25d', v ? '1' : '0');
    } catch {
      /* ignore */
    }
    Stage3D.updateBadge();
  }

  private scene3d = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, 1, 0.1, 400);
  private hts!: Heights;
  private interior = false;
  private cave = false;
  private biome = 'meadow';
  private waterTex: THREE.Texture[] = [];
  private waterMat?: THREE.MeshBasicMaterial;
  private sway: { tex: THREE.Texture; frames: number }[] = [];
  private tall: Tall[] = [];
  private objMeshes = new Map<number, THREE.Object3D[]>();
  private placedMeshes = new Map<string, THREE.Object3D[]>();
  private dynPool = new Map<Phaser.GameObjects.Sprite | Phaser.GameObjects.Image, DynEntry>();
  private labelPool = new Map<Phaser.GameObjects.GameObject, { mesh: THREE.Mesh; tex: THREE.CanvasTexture; cv: HTMLCanvasElement; text: string; seen: boolean }>();
  private shadowTex!: THREE.Texture;
  private nightHalos: THREE.Mesh[] = [];
  private bladesMesh?: THREE.Mesh;
  private cursorMesh?: THREE.Mesh;
  private soilCv?: HTMLCanvasElement;
  private soilTex?: THREE.Texture;
  private soilDirty = true;
  private waterT = 0;
  private swayT = 0;
  private camTarget = new THREE.Vector3();
  private camInit = false;
  private camYaw = 0;
  private lastPx = 0;
  private cam = { el: 38, fov: 22, dist: 24, stretch: true };
  private tintMaterials: THREE.MeshBasicMaterial[] = [];
  private lastTintHex = -1;
  private hiddenByBattle = false;

  constructor(
    private phaserScene: Phaser.Scene,
    private manifest: Manifest,
    private world: World,
    private mapId: MapId,
  ) {
    this.ensureRenderer();
    this.ensureBadge();
    this.build();
    this.resize();
  }

  private ensureRenderer() {
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
    this.syncVisibility();
  }

  private ensureBadge() {
    if (!Stage3D.badge) {
      const b = document.createElement('button');
      b.type = 'button';
      Object.assign(b.style, {
        position: 'fixed',
        left: '12px',
        bottom: '12px',
        zIndex: '35',
        padding: '5px 10px',
        background: 'rgba(24, 20, 30, 0.88)',
        color: '#ffe58a',
        border: '2px solid #c89a5a',
        borderRadius: '8px',
        fontFamily: 'Galmuri9, Galmuri11, sans-serif',
        fontSize: '11px',
        cursor: 'pointer',
        pointerEvents: 'auto',
        boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
      });
      b.onclick = () => {
        Stage3D.enabled = !Stage3D.enabled;
        this.syncVisibility();
      };
      document.body.appendChild(b);
      Stage3D.badge = b;
    }
    Stage3D.updateBadge();
  }

  private static updateBadge() {
    if (!Stage3D.badge) return;
    Stage3D.badge.innerHTML = Stage3D._enabled
      ? '🎥 <b>2.5D (포켓몬 5세대풍)</b> · <span style="opacity:.8">V 전환</span>'
      : '🖼️ <b>클래식 2D</b> · <span style="opacity:.8">V 전환</span>';
    Stage3D.badge.style.borderColor = Stage3D._enabled ? '#7cc45a' : '#a8683a';
  }

  toggle() {
    Stage3D.enabled = !Stage3D.enabled;
    this.syncVisibility();
    return Stage3D.enabled;
  }

  setBattleHidden(hidden: boolean) {
    this.hiddenByBattle = hidden;
    this.syncVisibility();
  }

  private syncVisibility() {
    const show = Stage3D.enabled && !this.hiddenByBattle;
    if (Stage3D.renderer) Stage3D.renderer.domElement.style.display = show ? 'block' : 'none';
    if (Stage3D.badge) Stage3D.badge.style.display = this.hiddenByBattle ? 'none' : 'block';
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
            m.userData = { ...m.userData, baseColor: m.color.clone() };
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
    if (this.interior) this.cam = { el: 44, fov: 20, dist: 19, stretch: true };
    else if (this.biome === 'city') this.cam = { el: 36, fov: 23, dist: 25, stretch: true };
    else this.cam = { el: 38, fov: 22, dist: 23, stretch: true };

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
      drawLayer('Ground', off - T, off - T);
      drawLayer('Ground', off - T, off);
      drawLayer('Ground', off, off - T);
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
      const floor = new THREE.PlaneGeometry(W, H - k);
      const fuv = floor.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < fuv.count; i++) fuv.setY(i, fuv.getY(i) * ((H - k) / H));
      const fm = new THREE.Mesh(floor, new THREE.MeshBasicMaterial({ map: groundTex, alphaTest: 0.5 }));
      fm.rotation.x = -Math.PI / 2;
      fm.position.set(W / 2, 0, k + (H - k) / 2);
      const wall = new THREE.PlaneGeometry(W, k);
      const wuv = wall.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < wuv.count; i++) wuv.setY(i, 1 - (1 - wuv.getY(i)) * (k / H));
      const wm = new THREE.Mesh(wall, new THREE.MeshBasicMaterial({ map: groundTex, color: 0xf2f2f2 }));
      wm.position.set(W / 2, k / 2, k);
      this.scene3d.add(fm, wm);
      this.registerTintMat(fm);
      this.registerTintMat(wm);
    } else {
      this.hts = computeHeights(raw, spawn ? { x: spawn.x / T, y: spawn.y / T } : undefined);
      const faceTex = pixelTex(tilesetImg, `ts:${this.biome}`);
      const fu = (1 * T) / tilesetImg.width, fv = (11 * T) / tilesetImg.height;
      const tMesh = buildTerrainMesh(this.hts, groundTex, faceTex, [
        fu,
        1 - fv,
        fu + T / tilesetImg.width,
        1 - fv - T / tilesetImg.height,
      ]);
      this.scene3d.add(tMesh);
      this.registerTintMat(tMesh);
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
      const wk = this.phaserScene.textures.exists(`water_${this.biome}0`) ? `water_${this.biome}` : 'water';
      for (let f = 0; f < 4; f++) {
        const im = this.getImg(`${wk}${f}`);
        if (!im) continue;
        const t = pixelTex(im).clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(W, H);
        t.needsUpdate = true;
        this.waterTex.push(t);
      }
      if (this.waterTex.length) {
        this.waterMat = new THREE.MeshBasicMaterial({ map: this.waterTex[0] });
        const wm = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.waterMat);
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
        new THREE.MeshBasicMaterial({ map: this.soilTex, transparent: true, alphaTest: 0.1, depthWrite: false }),
      );
      sm.rotation.x = -Math.PI / 2;
      sm.position.set(W / 2, 0.025, H / 2);
      this.scene3d.add(sm);
      this.registerTintMat(sm);

      for (const z of info.farmZones) {
        if (this.mapId === 'farm') break;
        const y0 = this.hts.sample(z.x + z.w / 2, z.y + z.h / 2) + 0.02;
        const soilBg = new THREE.Mesh(
          new THREE.PlaneGeometry(z.w, z.h),
          new THREE.MeshBasicMaterial({ color: 0x7a5230, transparent: true, opacity: 0.35, depthWrite: false }),
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
    const haloGeo = new THREE.CircleGeometry(1.6, 16);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0xffc868,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    haloMat.userData = { noTint: true };

    for (const o of info.objects) {
      const ALIAS: Record<string, string> = { vine: 'bush', boulder: 'rock_big' };
      const type = this.manifest.images[o.type] || this.manifest.spritesheets[o.type] ? o.type : ALIAS[o.type] ?? o.type;
      const cellX = Number(prop(o, 'cellX', 0)),
        cellY = Number(prop(o, 'cellY', 0)),
        cellW = Number(prop(o, 'cellW', 1)),
        cellH = Number(prop(o, 'cellH', 1));
      const im = this.manifest.images[type],
        sh = this.manifest.spritesheets[type];
      const base = this.hts.at(cellX, cellY).sw;
      const isBuilding = !!this.manifest.buildings?.[type] || type === 'house';
      const created: THREE.Object3D[] = [];

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
        this.scene3d.add(t.mesh);
        this.registerTintMat(t.mesh);
        this.tall.push(t);
        created.push(t.mesh);
        this.objMeshes.set(o.id, created);
        continue;
      }
      if (im && isBuilding && im.h / T > cellH) {
        const bimg = this.getImg(type) as HTMLImageElement | null;
        if (bimg) {
          const tex = pixelTex(bimg, `img:${type}`);
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
          );
          this.scene3d.add(bMesh);
          this.registerTintMat(bMesh);
          created.push(bMesh);
          // 밤 창문 불빛 후광
          const h1 = new THREE.Mesh(haloGeo, haloMat);
          h1.rotation.x = -Math.PI / 2;
          h1.position.set(cellX + cellW / 2, base + 0.04, cellY + 1.4);
          this.scene3d.add(h1);
          this.nightHalos.push(h1);
          this.objMeshes.set(o.id, created);
          continue;
        }
      }
      if (type === 'spire') {
        const cx0 = cellX + cellW / 2,
          cz0 = cellY + 1 - cellH / 2,
          y0 = this.hts.sample(cx0, Math.min(H - 0.01, cellY + 0.5));
        const g = new THREE.Group();
        const scv = document.createElement('canvas');
        scv.width = 64;
        scv.height = 96;
        const c2 = scv.getContext('2d')!;
        c2.fillStyle = '#8e94aa';
        c2.fillRect(0, 0, 64, 96);
        for (let r = 0; r < 16; r++)
          for (let k = 0; k < 9; k++) {
            c2.fillStyle = (r * 7 + k * 3) % 5 === 0 ? '#6a6e84' : (r + k) % 3 === 0 ? '#a6acc0' : '#8e94aa';
            c2.fillRect(k * 8 - (r % 2 ? 4 : 0), r * 6, 7, 5);
          }
        c2.fillStyle = '#3a3c4c';
        for (const yy of [30, 62]) c2.fillRect(0, yy, 64, 3);
        const st = new THREE.CanvasTexture(scv);
        st.magFilter = THREE.NearestFilter;
        st.minFilter = THREE.NearestFilter;
        st.colorSpace = THREE.SRGBColorSpace;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.5, 6.4, 8), new THREE.MeshBasicMaterial({ map: st }));
        body.position.y = 3.2;
        g.add(body);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.2, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0x6a6e84 }));
        rim.position.y = 6.6;
        g.add(rim);
        const gem = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1, 4), new THREE.MeshBasicMaterial({ color: 0x8aecff }));
        gem.position.y = 7.5;
        g.add(gem);
        g.position.set(cx0, y0, cz0);
        this.scene3d.add(g);
        this.registerTintMat(g);
        created.push(g);
        this.objMeshes.set(o.id, created);
        continue;
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
          if (sh.frames > 1 && type !== 'fence') {
            this.sway.push({ tex: (bb.mesh.material as THREE.MeshBasicMaterial).map!, frames: sh.frames });
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
      const gx = o.x / T,
        gz = o.y / T;
      bb.mesh.position.set(gx, this.hts.sample(gx, Math.min(H - 0.01, gz - 0.01)), gz);
      this.scene3d.add(bb.mesh);
      this.registerTintMat(bb.mesh);
      created.push(bb.mesh);

      if (['oak', 'oak_apple', 'pine', 'oak_autumn', 'pine_snow', 'palm', 'rock', 'rock_big', 'bush', 'lamp', 'well', 'shipping_bin'].includes(type)) {
        const isTree = type.startsWith('oak') || type.startsWith('pine') || type === 'palm';
        const s = new THREE.Mesh(
          new THREE.PlaneGeometry(isTree ? 2.2 : 1, isTree ? 0.85 : 0.45),
          new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: 0.48, depthWrite: false }),
        );
        s.rotation.x = -Math.PI / 2;
        s.position.set(gx, bb.mesh.position.y + 0.02, gz - 0.08);
        this.scene3d.add(s);
        created.push(s);
      }
      if (type === 'lamp') {
        const h = new THREE.Mesh(haloGeo, haloMat);
        h.rotation.x = -Math.PI / 2;
        h.position.set(gx, bb.mesh.position.y + 0.03, gz + 0.1);
        this.scene3d.add(h);
        this.nightHalos.push(h);
      }
      this.objMeshes.set(o.id, created);
    }

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
    const curMat = new THREE.MeshBasicMaterial({ color: 0xffe58a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    curMat.userData = { noTint: true };
    this.cursorMesh = new THREE.Mesh(curGeo, curMat);
    this.cursorMesh.rotation.x = -Math.PI / 2;
    this.cursorMesh.visible = false;
    this.scene3d.add(this.cursorMesh);
  }

  markSoilDirty() {
    this.soilDirty = true;
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
    const squash = this.cam.stretch ? 1 / Math.sin((this.cam.el * Math.PI) / 180) : 1;
    this.camera.aspect = (window.innerWidth / window.innerHeight) * squash;
    this.camera.fov = this.cam.fov;
    this.camera.updateProjectionMatrix();
  }

  /** 마우스 화면 좌표 → 3D 지면 위 픽셀 좌표 (x, y) 변환 */
  screenToWorld(clientX: number, clientY: number, refWorldY: number): { x: number; y: number } | null {
    if (!Stage3D.enabled || this.hiddenByBattle) return null;
    const nx = (clientX / window.innerWidth) * 2 - 1;
    const ny = -(clientY / window.innerHeight) * 2 + 1;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -refWorldY);
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
        new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, opacity: shS > 0 ? 0.5 : 0, depthWrite: false }),
      );
      shadow.rotation.x = -Math.PI / 2;
      this.scene3d.add(bb.mesh, shadow);
      entry = { key: sig, cols, rows, fw, fh, bb, shadow, seen: true };
      this.dynPool.set(sp, entry);
    }
    entry.seen = true;

    const frameIdx = typeof sp.frame.name === 'number' ? sp.frame.name : parseInt(String(sp.frame.name), 10) || 0;
    entry.bb.setFrame(frameIdx);

    const sx = (sp.flipX ? -1 : 1) * sp.scaleX;
    const sy = sp.scaleY;
    entry.bb.mesh.scale.set(sx, sy, 1);

    const gx = sp.x / T;
    const gz = sp.y / T + (opts?.zOffset ?? 0);
    const h = this.hts.sample(gx, Math.max(0, Math.min(this.world.info.height - 0.01, gz)));
    entry.bb.mesh.position.set(gx, h + (opts?.yBias ?? 0), gz);
    entry.bb.mesh.rotation.y = this.camYaw;
    const mat = entry.bb.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = sp.alpha;

    entry.shadow.visible = (opts?.shadowScale ?? 1) > 0 && sp.alpha > 0.2;
    entry.shadow.position.set(gx, h + 0.025, gz - 0.02);
  }

  private syncLabel(txtObj: Phaser.GameObjects.Text | undefined, gx: number, gy: number, gz: number, isBubble = false) {
    if (!txtObj || !txtObj.active || !txtObj.visible || !txtObj.text) return;
    let item = this.labelPool.get(txtObj);
    if (!item || item.text !== txtObj.text) {
      const cv = item?.cv ?? document.createElement('canvas');
      const c = cv.getContext('2d')!;
      c.font = isBubble ? 'bold 13px Galmuri11, Galmuri9, sans-serif' : 'bold 12px Galmuri9, sans-serif';
      const tw = Math.min(240, Math.ceil(c.measureText(txtObj.text).width) + 16);
      const th = isBubble ? 26 : 20;
      cv.width = tw;
      cv.height = th;
      c.font = isBubble ? 'bold 13px Galmuri11, Galmuri9, sans-serif' : 'bold 12px Galmuri9, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      if (isBubble) {
        c.fillStyle = 'rgba(255, 248, 236, 0.95)';
        c.fillRect(1, 1, tw - 2, th - 2);
        c.strokeStyle = '#3b2414';
        c.lineWidth = 2;
        c.strokeRect(1, 1, tw - 2, th - 2);
        c.fillStyle = '#3b2414';
        c.fillText(txtObj.text, tw / 2, th / 2);
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
        item = { mesh, tex, cv, text: txtObj.text, seen: true };
        this.labelPool.set(txtObj, item);
      } else {
        item.text = txtObj.text;
        item.tex.needsUpdate = true;
        item.mesh.geometry.dispose();
        item.mesh.geometry = new THREE.PlaneGeometry(tw / 42, th / 42);
      }
    }
    item.seen = true;
    item.mesh.position.set(gx, gy + (isBubble ? 2.45 : 2.05), gz);
    item.mesh.rotation.y = this.camYaw;
  }

  private updateAtmosphere(minutes: number, weather: string) {
    const h = (minutes / 60) % 24;
    let tint = 0xffffff;
    let bg = this.interior || this.cave ? 0x0d0a0c : 0x16241d;
    let nightAlpha = 0;

    if (!this.interior && !this.cave) {
      if (h >= 5 && h < 7.5) {
        tint = 0xffe6cc;
        bg = 0x262028;
      } else if (h >= 7.5 && h < 16.5) {
        tint = 0xffffff;
        bg = 0x182820;
      } else if (h >= 16.5 && h < 19.5) {
        const t = (h - 16.5) / 3;
        tint = t < 0.5 ? 0xffd0a6 : 0xd69898;
        bg = 0x221824;
        nightAlpha = Math.max(0, (h - 17.5) / 2) * 0.55;
      } else {
        tint = 0x7686b8;
        bg = 0x0b1020;
        nightAlpha = 0.65;
      }
      if (weather === 'rain') {
        tint = h >= 19.5 || h < 5 ? 0x62729c : 0xb8c8d8;
        bg = 0x121a24;
      }
    }

    if (tint !== this.lastTintHex) {
      this.lastTintHex = tint;
      const tc = new THREE.Color(tint);
      this.scene3d.background = new THREE.Color(bg);
      for (const m of this.tintMaterials) {
        const base = (m.userData?.baseColor as THREE.Color | undefined) ?? new THREE.Color(0xffffff);
        m.color.copy(base).multiply(tc);
      }
      for (const hMesh of this.nightHalos) {
        (hMesh.material as THREE.MeshBasicMaterial).opacity = nightAlpha;
      }
    }
  }

  private frameOffsets(gy: number) {
    const tmpV = new THREE.Vector3();
    const el = (this.cam.el * Math.PI) / 180;
    this.camera.position.set(0, gy + Math.sin(el) * this.cam.dist, Math.cos(el) * this.cam.dist);
    this.camera.lookAt(0, gy, 0);
    this.camera.updateMatrixWorld();
    const hit = (nx: number, ny: number) => {
      tmpV.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
      const t = tmpV.y < -1e-3 ? (0 - this.camera.position.y) / tmpV.y : 1e4;
      return { x: this.camera.position.x + tmpV.x * t, z: this.camera.position.z + tmpV.z * t };
    };
    const tl = hit(-1, 1),
      tr = hit(1, 1),
      bl = hit(-1, -1);
    return { minX: tl.x, maxX: tr.x, minZ: tl.z, maxZ: bl.z };
  }

  update(
    dt: number,
    state: {
      player: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text };
      partner?: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite };
      npcs: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text }[];
      trainers: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text }[];
      storyActors: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text }[];
      plotActors: { sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text }[];
      remotes: Iterable<{ sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite; label?: Phaser.GameObjects.Text; bubble?: Phaser.GameObjects.Text }>;
      remotePartners: Iterable<{ sprite: Phaser.GameObjects.Sprite; emote?: Phaser.GameObjects.Sprite }>;
      chickens: { sprite: Phaser.GameObjects.Sprite }[];
      ducks: { sprite: Phaser.GameObjects.Sprite }[];
      forage: Iterable<Phaser.GameObjects.Image>;
      crops?: Map<string, Phaser.GameObjects.Sprite>;
      tiles?: Map<string, FarmTile>;
      legend?: Phaser.GameObjects.Sprite;
      dish?: Phaser.GameObjects.Image;
      bobber?: Phaser.GameObjects.Arc;
      cursor?: Phaser.GameObjects.Image;
      minutes: number;
      weather: string;
    },
  ) {
    if (!Stage3D.enabled || this.hiddenByBattle || !Stage3D.renderer) return;

    if (this.soilDirty && state.tiles) this.refreshSoil(state.tiles);

    // 1) 제거된 맵 오브젝트 동기화 (벌목·채광·비전기술·보물상자)
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
          created.push(bb.mesh);
        }
        this.placedMeshes.set(id, created);
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
    }) => {
      this.syncSprite(c.sprite, { shadowScale: 0.85 });
      if (c.emote?.active) this.syncSprite(c.emote, { shadowScale: 0, yBias: 1.95, zOffset: 0.05 });
      const gx = c.sprite.x / T,
        gz = c.sprite.y / T,
        gy = this.hts.sample(gx, Math.max(0, Math.min(this.world.info.height - 0.01, gz)));
      if (c.label) this.syncLabel(c.label, gx, gy, gz, false);
      if (c.bubble) this.syncLabel(c.bubble, gx, gy, gz, true);
    };

    syncChar(state.player);
    if (state.partner) {
      this.syncSprite(state.partner.sprite, { shadowScale: 0.45, zOffset: 0.01 });
      if (state.partner.emote?.active) this.syncSprite(state.partner.emote, { shadowScale: 0, yBias: 1.15, zOffset: 0.04 });
    }
    for (const n of state.npcs) syncChar(n);
    for (const t of state.trainers) syncChar(t);
    for (const a of state.storyActors) syncChar(a);
    for (const a of state.plotActors) syncChar(a);
    for (const r of state.remotes) syncChar(r);
    for (const rp of state.remotePartners) {
      this.syncSprite(rp.sprite, { shadowScale: 0.45, zOffset: 0.01 });
      if (rp.emote?.active) this.syncSprite(rp.emote, { shadowScale: 0, yBias: 1.15, zOffset: 0.04 });
    }
    for (const c of state.chickens) this.syncSprite(c.sprite, { shadowScale: 0.35 });
    for (const d of state.ducks) this.syncSprite(d.sprite, { shadowScale: 0 });
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

    // 5) 플레이어를 가리는 고층 빌딩 반투명 처리
    const px = state.player.sprite.x / T;
    const pz = state.player.sprite.y / T;
    for (const b of this.tall) {
      const hide = px > b.x0 - 0.5 && px < b.x1 + 0.5 && pz < b.z0 + 0.2 && pz > b.z0 - b.h - 1;
      if (hide !== b.faded) {
        b.faded = hide;
        for (const m of b.mats) {
          m.opacity = hide ? 0.32 : 1;
          m.depthWrite = !hide;
        }
      }
    }

    // 6) 물 · 나무 흔들림 애니메이션 + 시간대/날씨 조명
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
    this.updateAtmosphere(state.minutes, state.weather);

    // 7) 포켓몬 5세대풍 다이내믹 카메라 추적
    const gy = this.hts.sample(px, Math.max(0, Math.min(this.world.info.height - 0.01, pz)));
    const vx = px - (this.lastPx || px);
    this.lastPx = px;
    const targetYaw = this.interior ? 0 : Math.max(-0.07, Math.min(0.07, -vx * 0.35));
    this.camYaw += (targetYaw - this.camYaw) * Math.min(1, dt / 260);

    let tx = px,
      tz = pz;
    const W = this.world.info.width,
      H = this.world.info.height;
    const f = this.frameOffsets(gy);
    tx = W <= f.maxX - f.minX ? W / 2 : Math.max(-f.minX, Math.min(W - f.maxX, tx));
    tz = H <= f.maxZ - f.minZ ? (H - f.minZ - f.maxZ) / 2 : Math.max(-f.minZ, Math.min(H - f.maxZ, tz));

    if (!this.camInit) {
      this.camInit = true;
      this.camTarget.set(tx, gy, tz);
    } else {
      this.camTarget.lerp(new THREE.Vector3(tx, gy, tz), 1 - Math.pow(0.0008, dt / 1000));
    }

    const el = (this.cam.el * Math.PI) / 180;
    const dist = this.cam.dist;
    const horiz = Math.cos(el) * dist;
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.camYaw) * horiz,
      this.camTarget.y + Math.sin(el) * dist,
      this.camTarget.z + Math.cos(this.camYaw) * horiz,
    );
    this.camera.lookAt(this.camTarget.x, this.camTarget.y + 0.35, this.camTarget.z);

    Stage3D.renderer.render(this.scene3d, this.camera);
  }

  destroy() {
    this.dynPool.clear();
    this.labelPool.clear();
    this.objMeshes.clear();
    this.placedMeshes.clear();
  }
}
