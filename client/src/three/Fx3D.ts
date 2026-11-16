// 2.5D 보조 연출 모듈 (Stage3D & BattleStage3D 공용 카메라 페이드/플래시 + 3D 날씨·파티클·낚시·빛기둥·창문 하늘)
import type Phaser from 'phaser';
import * as THREE from 'three';
import { DIR_VEC, type Dir } from '@shared/types';
import { TILE } from '../config';
import type { Heights } from './Terrain';

export type BurstKind = 'chips' | 'leaves' | 'dirt' | 'splash' | 'sparkle' | 'dust';

let fxOverlay: HTMLDivElement | undefined;

/** Phaser 카메라의 fadeEffect / flashEffect 를 WebGL 2.5D 캔버스 위 오버레이(#stage3d-fx)에 동기화 */
export function syncPhaserCamOverlay(cam: Phaser.Cameras.Scene2D.Camera | undefined, active: boolean) {
  if (!fxOverlay) {
    fxOverlay = document.createElement('div');
    fxOverlay.id = 'stage3d-fx';
    Object.assign(fxOverlay.style, {
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '3',
      display: 'none',
    });
    const ui = document.getElementById('ui');
    if (ui?.parentElement) ui.parentElement.insertBefore(fxOverlay, ui);
    else document.body.appendChild(fxOverlay);
  }
  if (!active || !cam) {
    fxOverlay.style.display = 'none';
    return;
  }

  type ChanEffect = { isRunning: boolean; isComplete?: boolean; direction?: boolean; progress: number; alpha?: number; red?: number; green?: number; blue?: number };
  const fade = cam.fadeEffect as unknown as ChanEffect | undefined;
  const flash = cam.flashEffect as unknown as ChanEffect | undefined;

  let fadeAlpha = 0;
  if (fade) {
    if (fade.isRunning) fadeAlpha = fade.direction ? fade.progress : 1 - fade.progress;
    else if (fade.isComplete && fade.direction) fadeAlpha = 1;
  }

  let flashAlpha = 0;
  if (flash?.isRunning) flashAlpha = (flash.alpha ?? 1) * (1 - flash.progress);

  if (flashAlpha > 0.01 && flashAlpha >= fadeAlpha) {
    const r = Math.round(flash?.red ?? 255);
    const g = Math.round(flash?.green ?? 255);
    const b = Math.round(flash?.blue ?? 255);
    fxOverlay.style.display = 'block';
    fxOverlay.style.background = `rgba(${r}, ${g}, ${b}, ${Math.min(1, flashAlpha).toFixed(3)})`;
  } else if (fadeAlpha > 0.005) {
    const r = Math.round(fade?.red ?? 10);
    const g = Math.round(fade?.green ?? 14);
    const b = Math.round(fade?.blue ?? 18);
    fxOverlay.style.display = 'block';
    fxOverlay.style.background = `rgba(${r}, ${g}, ${b}, ${Math.min(1, fadeAlpha).toFixed(3)})`;
  } else {
    fxOverlay.style.display = 'none';
  }
}

interface Particle3D {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  gravity: number;
  bounce: boolean;
  sway: number;
  phase: number;
  grow: number;
  spin: number;
  groundY: number;
  billboard?: boolean;
  drag?: number;
  maxOpacity?: number;
}

interface WeatherDrop {
  mesh: THREE.Mesh;
  ox: number;
  oy: number;
  oz: number;
  speed: number;
  phase: number;
}

interface SpireBeam3D {
  group: THREE.Group;
  coreMat: THREE.MeshBasicMaterial;
  haloMat: THREE.MeshBasicMaterial;
  burstT: number;
  bursting: boolean;
}

interface WindowQuad {
  mesh: THREE.Mesh;
  tex: THREE.CanvasTexture;
  cv: HTMLCanvasElement;
  wPx: number;
  hPx: number;
}

const BURST_CFG: Record<BurstKind, { colors: number[]; count: number; size: number; speed: number; up: number; gravity: number; life: number; bounce?: boolean; sway?: number; unlit?: boolean; puff?: boolean }> = {
  chips: { colors: [0xc99260, 0x8c5a33, 0xe0b080], count: 8, size: 0.14, speed: 2.2, up: 3.1, gravity: 11, life: 0.58, bounce: true },
  leaves: { colors: [0x5dab4a, 0x86c95b, 0x3f8a3e], count: 6, size: 0.18, speed: 1.4, up: 0.9, gravity: 1.8, life: 1.35, sway: 2.4 },
  dirt: { colors: [0x8b5a2b, 0x6d421e, 0xa87544], count: 7, size: 0.13, speed: 1.6, up: 2.4, gravity: 10, life: 0.45, bounce: true },
  splash: { colors: [0x78c8ff, 0xb8e6ff, 0xffffff], count: 8, size: 0.12, speed: 1.9, up: 2.7, gravity: 10.5, life: 0.48, unlit: true },
  sparkle: { colors: [0xffe58a, 0xfff8d0, 0x8ef0ff], count: 8, size: 0.16, speed: 1.6, up: 2.1, gravity: -0.6, life: 0.72, unlit: true },
  dust: { colors: [0xf2e6cf, 0xe6d4b2, 0xd8c29a], count: 3, size: 0.24, speed: 0.48, up: 0.52, gravity: 1.6, life: 0.34, puff: true },
};

/** 2.5D 월드용 동적 이펙트 매니저 */
export class Fx3D {
  private boxGeo = new THREE.BoxGeometry(1, 1, 1);
  private planeGeo = new THREE.PlaneGeometry(1, 1);
  private dustTex?: THREE.CanvasTexture;
  private particles: Particle3D[] = [];
  private chimneys: { x: number; y: number; z: number; dark: boolean; acc: number }[] = [];
  private weatherKind = '';
  private weatherGroup = new THREE.Group();
  private weatherDrops: WeatherDrop[] = [];
  private spireBeams: SpireBeam3D[] = [];
  private windows: WindowQuad[] = [];
  private lastWinKey = '';

  // 낚시 3D 오브젝트
  private fishingGroup = new THREE.Group();
  private bobberGroup = new THREE.Group();
  private lineObj!: THREE.Line;
  private lineGeo!: THREE.BufferGeometry;
  private rippleMesh!: THREE.Mesh;
  private rippleMat!: THREE.MeshBasicMaterial;
  private rippleT = 0;

  constructor(private scene3d: THREE.Scene, private hts: Heights) {
    scene3d.add(this.weatherGroup);
    this.initFishing();
  }

  private initFishing() {
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff5a5a }),
    );
    const bot = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf8f8f8 }),
    );
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6),
      new THREE.MeshBasicMaterial({ color: 0xffe58a }),
    );
    tip.position.y = 0.13;
    this.bobberGroup.add(top, bot, tip);

    const pts = Array.from({ length: 10 }, () => new THREE.Vector3());
    this.lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xf4f0e8, transparent: true, opacity: 0.85 });
    lineMat.userData = { noTint: true };
    this.lineObj = new THREE.Line(this.lineGeo, lineMat);

    this.rippleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    this.rippleMat.userData = { noTint: true };
    this.rippleMesh = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 18), this.rippleMat);
    this.rippleMesh.rotation.x = -Math.PI / 2;

    this.fishingGroup.visible = false;
    this.fishingGroup.add(this.bobberGroup, this.lineObj, this.rippleMesh);
    this.scene3d.add(this.fishingGroup);
  }

  addChimney(gx: number, gy: number, gz: number, dark = false) {
    this.chimneys.push({ x: gx, y: gy, z: gz, dark, acc: Math.random() * 350 });
  }

  private getDustTex() {
    if (this.dustTex) return this.dustTex;
    const cv = document.createElement('canvas');
    cv.width = 16;
    cv.height = 16;
    const c = cv.getContext('2d')!;
    const puffs: [number, number, number, string][] = [
      [8, 9, 4.5, 'rgba(255,255,255,0.65)'],
      [5.5, 9.5, 3, 'rgba(255,255,255,0.85)'],
      [10.5, 9.5, 3, 'rgba(255,255,255,0.85)'],
      [8, 7, 3.2, 'rgba(255,255,255,0.95)'],
    ];
    for (const [px, py, r, fill] of puffs) {
      c.fillStyle = fill;
      c.beginPath();
      c.arc(px, py, r, 0, Math.PI * 2);
      c.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    this.dustTex = t;
    return t;
  }

  burst(kind: BurstKind, worldPxX: number, worldPxY: number, liftPx = 0) {
    const cfg = BURST_CFG[kind];
    const gx = worldPxX / TILE;
    const gz = worldPxY / TILE;
    const gy = this.hts.sample(gx, Math.max(0, Math.min(this.hts.h - 0.01, gz))) + liftPx / TILE;
    for (let i = 0; i < cfg.count; i++) {
      const col = cfg.colors[i % cfg.colors.length];
      const mat = cfg.puff
        ? new THREE.MeshBasicMaterial({ map: this.getDustTex(), color: col, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide })
        : new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.92, side: THREE.DoubleSide });
      if (cfg.unlit) mat.userData = { noTint: true };
      const mesh = new THREE.Mesh(cfg.sway || cfg.puff ? this.planeGeo : this.boxGeo, mat);
      const s = cfg.size * (0.78 + Math.random() * 0.44);
      mesh.scale.set(s, cfg.sway ? s * 0.7 : cfg.puff ? s * 0.85 : s, s);
      const ang = Math.random() * Math.PI * 2;
      const spd = cfg.speed * (0.4 + Math.random() * 0.75);
      mesh.position.set(
        gx + (Math.random() - 0.5) * (cfg.puff ? 0.24 : 0.35),
        gy + (cfg.puff ? 0.08 + Math.random() * 0.06 : 0.1 + Math.random() * 0.15),
        gz + (Math.random() - 0.5) * (cfg.puff ? 0.18 : 0.35),
      );
      this.scene3d.add(mesh);
      this.particles.push({
        mesh,
        vx: Math.cos(ang) * spd,
        vy: cfg.up * (0.65 + Math.random() * 0.55),
        vz: Math.sin(ang) * spd,
        age: 0,
        life: cfg.life * (0.85 + Math.random() * 0.3),
        gravity: cfg.gravity,
        bounce: !!cfg.bounce,
        sway: cfg.sway ?? 0,
        phase: Math.random() * Math.PI * 2,
        grow: cfg.puff ? 0.42 : 0,
        spin: cfg.sway ? (Math.random() - 0.5) * 8 : 0,
        groundY: gy + 0.05,
        billboard: !!cfg.puff,
        drag: cfg.puff ? 4.2 : 0,
        maxOpacity: cfg.puff ? 0.58 : 0.9,
      });
    }
  }

  addSpireBeam(worldPxX: number, worldPxY: number, colorHex: number, burst: boolean) {
    const gx = worldPxX / TILE;
    const gz = worldPxY / TILE;
    const gy = this.hts.sample(gx, Math.max(0, Math.min(this.hts.h - 0.01, gz))) + 0.5;
    const group = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    coreMat.userData = { noTint: true };
    const haloMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    haloMat.userData = { noTint: true };

    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 26, 12, 1, true), coreMat);
    core.position.y = 13;
    const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.78, 26, 12, 1, true), haloMat);
    halo.position.y = 13;
    group.add(core, halo);
    group.position.set(gx, gy, gz);
    if (burst) group.scale.set(0.1, 0.01, 0.1);
    this.scene3d.add(group);
    this.spireBeams.push({ group, coreMat, haloMat, burstT: burst ? 0 : 1, bursting: burst });
  }

  setupWindows(rects: [number, number, number, number][], wallZ: number) {
    for (const [wx, wy, w, h] of rects) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(8, w);
      cv.height = Math.max(8, h);
      const tex = new THREE.CanvasTexture(cv);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      mat.userData = { noTint: true };
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w / TILE, h / TILE), mat);
      const worldY = Math.max(h / (2 * TILE), wallZ - (wy + h / 2) / TILE);
      mesh.position.set((wx + w / 2) / TILE, worldY, wallZ + 0.012);
      this.scene3d.add(mesh);
      this.windows.push({ mesh, tex, cv, wPx: w, hPx: h });
    }
  }

  updateWindows(minutes: number, weather: string, timeMs: number) {
    if (!this.windows.length) return;
    const h = (minutes / 60) % 24;
    const phase = h >= 5 && h < 7.5 ? 'dawn' : h >= 7.5 && h < 17 ? 'day' : h >= 17 && h < 19.5 ? 'dusk' : 'night';
    const tick = Math.floor(timeMs / 250);
    const key = `${phase}:${weather}:${tick}`;
    if (key === this.lastWinKey) return;
    this.lastWinKey = key;

    let top = '#3d86cc', bot = '#a6dcff';
    if (phase === 'dawn') { top = '#8e78a8'; bot = '#ffbf94'; }
    else if (phase === 'dusk') { top = '#5a5096'; bot = '#f28258'; }
    else if (phase === 'night') { top = '#101633'; bot = '#263868'; }
    if (weather === 'rain' && phase !== 'night') { top = '#7a8696'; bot = '#aab4c0'; }

    for (const wq of this.windows) {
      const c = wq.cv.getContext('2d')!;
      const g = c.createLinearGradient(0, 0, 0, wq.hPx);
      g.addColorStop(0, top);
      g.addColorStop(1, bot);
      c.fillStyle = g;
      c.fillRect(0, 0, wq.wPx, wq.hPx);
      if (phase === 'night') {
        c.fillStyle = '#fff5b8';
        c.fillRect(wq.wPx - 6, 3, 2, 2);
        c.fillStyle = ((tick & 3) === 0 ? '#ffffff' : '#ffe880');
        c.fillRect(4, 4, 1, 1);
        c.fillRect(Math.floor(wq.wPx * 0.45), 6, 1, 1);
      } else {
        const cx = ((tick * 0.4) % (wq.wPx + 10)) - 5;
        c.fillStyle = weather === 'rain' ? 'rgba(200,210,224,0.7)' : 'rgba(255,255,255,0.75)';
        c.fillRect(Math.floor(cx), 4, 7, 2);
      }
      if (weather === 'rain') {
        c.fillStyle = 'rgba(220,235,250,0.8)';
        for (let k = 0; k < 5; k++) {
          c.fillRect((k * 5 + (tick % 4)) % wq.wPx, (k * 4 + tick * 2) % wq.hPx, 1, 3);
        }
      }
      wq.tex.needsUpdate = true;
    }
  }

  syncFishing(
    playerX: number,
    playerZ: number,
    dir: Dir,
    bobber: Phaser.GameObjects.Arc | undefined,
    dtSec: number,
    nowSec: number,
  ) {
    if (!bobber || !bobber.active) {
      this.fishingGroup.visible = false;
      return;
    }
    this.fishingGroup.visible = true;
    const bx = bobber.x / TILE;
    const bz = bobber.y / TILE;
    const py = this.hts.sample(playerX, Math.max(0, Math.min(this.hts.h - 0.01, playerZ)));
    const dist = Math.hypot(bx - playerX, bz - playerZ);
    const waterY = Math.max(-0.08, this.hts.sample(bx, Math.max(0, Math.min(this.hts.h - 0.01, bz))) - 0.1);
    const by = waterY + 0.06 + Math.sin(nowSec * 6) * 0.03;

    this.bobberGroup.position.set(bx, by, bz);

    const [dx, dz] = DIR_VEC[dir];
    const p0 = new THREE.Vector3(playerX + dx * 0.65, py + 1.02, playerZ + dz * 0.65);
    const p1 = new THREE.Vector3(bx, by + 0.08, bz);
    const posAttr = this.lineGeo.attributes.position as THREE.BufferAttribute;
    const sag = Math.min(0.65, 0.12 + dist * 0.14);
    for (let i = 0; i < posAttr.count; i++) {
      const t = i / (posAttr.count - 1);
      const lx = p0.x + (p1.x - p0.x) * t;
      const lz = p0.z + (p1.z - p0.z) * t;
      const ly = p0.y + (p1.y - p0.y) * t - Math.sin(t * Math.PI) * sag;
      posAttr.setXYZ(i, lx, ly, lz);
    }
    posAttr.needsUpdate = true;

    this.rippleT = (this.rippleT + dtSec * 1.4) % 1;
    const rs = 0.6 + this.rippleT * 2.2;
    this.rippleMesh.position.set(bx, waterY + 0.02, bz);
    this.rippleMesh.scale.set(rs, rs, 1);
    this.rippleMat.opacity = (1 - this.rippleT) * 0.55;
  }

  private ensureWeather(kind: string) {
    if (this.weatherKind === kind) return;
    this.weatherKind = kind;
    for (const d of this.weatherDrops) {
      this.weatherGroup.remove(d.mesh);
      (d.mesh.material as THREE.Material).dispose();
    }
    this.weatherDrops = [];
    if (!kind) return;

    const count = kind === 'rain' ? 140 : kind === 'snow' ? 85 : 42;
    const col = kind === 'rain' ? 0xc2dfff : kind === 'snow' ? 0xf6fbff : kind === 'volcano' ? 0xff9a44 : 0xd0a8ff;
    const sx = kind === 'rain' ? 0.03 : 0.1;
    const sy = kind === 'rain' ? 0.48 : 0.1;
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        this.planeGeo,
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: kind === 'rain' ? 0.52 : 0.78, side: THREE.DoubleSide, depthWrite: false }),
      );
      m.scale.set(sx, sy, 1);
      if (kind === 'rain') m.rotation.z = -0.18;
      this.weatherGroup.add(m);
      this.weatherDrops.push({
        mesh: m,
        ox: (Math.random() - 0.5) * 28,
        oy: Math.random() * 14,
        oz: (Math.random() - 0.5) * 24,
        speed: kind === 'rain' ? 15 + Math.random() * 5 : kind === 'snow' ? 2.1 + Math.random() * 1.2 : 1.4 + Math.random() * 1.2,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  update(dtMs: number, camTarget: THREE.Vector3, camYaw: number, weather: string, biome: string, interior: boolean, cave: boolean, nowMs: number) {
    const dt = Math.min(0.05, dtMs / 1000);
    const nowSec = nowMs / 1000;

    // 1) 굴뚝 연기 방출
    for (const c of this.chimneys) {
      c.acc += dtMs;
      if (c.acc < 360) continue;
      c.acc = 0;
      const m = new THREE.Mesh(
        this.boxGeo,
        new THREE.MeshBasicMaterial({ color: c.dark ? 0x625a58 : 0xebe8e2, transparent: true, opacity: 0.65 }),
      );
      m.scale.set(0.22, 0.22, 0.22);
      m.position.set(c.x + (Math.random() - 0.5) * 0.14, c.y, c.z + (Math.random() - 0.5) * 0.14);
      this.scene3d.add(m);
      this.particles.push({
        mesh: m,
        vx: 0.35 + Math.random() * 0.25,
        vy: 1.15 + Math.random() * 0.3,
        vz: -0.1,
        age: 0,
        life: 1.5,
        gravity: -0.15,
        bounce: false,
        sway: 0.4,
        phase: Math.random() * Math.PI * 2,
        grow: 0.7,
        spin: 0,
        groundY: c.y,
      });
    }

    // 2) 3D 파티클 적분
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene3d.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy -= p.gravity * dt;
      if (p.drag) {
        const damp = Math.exp(-p.drag * dt);
        p.vx *= damp;
        p.vz *= damp;
      }
      p.mesh.position.x += (p.vx + (p.sway ? Math.sin(nowSec * 5 + p.phase) * p.sway * 0.4 : 0)) * dt;
      p.mesh.position.y = Math.max(p.groundY - 0.02, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      if (p.bounce && p.mesh.position.y <= p.groundY) {
        p.mesh.position.y = p.groundY;
        p.vy = Math.abs(p.vy) * 0.42;
        p.vx *= 0.65;
        p.vz *= 0.65;
      }
      if (p.billboard) p.mesh.rotation.y = camYaw;
      if (p.spin) p.mesh.rotation.z += p.spin * dt;
      if (p.grow) p.mesh.scale.addScalar(p.grow * dt);
      const t = p.age / p.life;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1 - t) * (p.maxOpacity ?? 0.9));
    }

    // 3) 탑 빛기둥 맥동
    for (const b of this.spireBeams) {
      if (b.bursting) {
        b.burstT = Math.min(1, b.burstT + dt / 0.9);
        const e = 1 - Math.pow(1 - b.burstT, 3);
        b.group.scale.set(0.1 + 0.9 * e, e, 0.1 + 0.9 * e);
        if (b.burstT >= 1) b.bursting = false;
      }
      const pulse = 0.5 + 0.5 * Math.sin(nowSec * 2.8);
      b.coreMat.opacity = 0.42 + pulse * 0.34;
      b.haloMat.opacity = 0.15 + pulse * 0.15;
    }

    // 4) 3D 날씨 (비 / 설원 눈 / 화산 불티 / 시공 입자)
    const activeWeather = interior || cave
      ? ''
      : weather === 'rain'
        ? 'rain'
        : biome === 'snow'
          ? 'snow'
          : biome === 'volcano'
            ? 'volcano'
            : biome === 'origin' || biome === 'distort'
              ? 'distort'
              : '';
    this.ensureWeather(activeWeather);
    if (activeWeather) {
      for (const d of this.weatherDrops) {
        if (activeWeather === 'volcano' || activeWeather === 'distort') {
          d.oy = (d.oy + d.speed * dt) % 14;
          d.ox += Math.sin(nowSec * 1.4 + d.phase) * 0.6 * dt;
        } else {
          d.oy -= d.speed * dt;
          if (activeWeather === 'rain') d.ox -= d.speed * 0.16 * dt;
          else d.ox += Math.sin(nowSec * 1.8 + d.phase) * 0.9 * dt;
          if (d.oy < 0) {
            d.oy += 14;
            d.ox = (Math.random() - 0.5) * 28;
          }
        }
        d.mesh.position.set(camTarget.x + d.ox, camTarget.y - 1 + d.oy, camTarget.z + d.oz);
        d.mesh.rotation.y = camYaw;
      }
    }
  }

  dispose() {
    for (const p of this.particles) {
      this.scene3d.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.ensureWeather('');
    this.scene3d.remove(this.weatherGroup, this.fishingGroup);
    for (const b of this.spireBeams) {
      b.coreMat.dispose();
      b.haloMat.dispose();
    }
    this.spireBeams = [];
    for (const w of this.windows) {
      w.mesh.geometry.dispose();
      (w.mesh.material as THREE.Material).dispose();
      w.tex.dispose();
    }
    this.windows = [];
    this.boxGeo.dispose();
    this.planeGeo.dispose();
    this.lineGeo.dispose();
    this.rippleMat.dispose();
    this.dustTex?.dispose();
  }
}
