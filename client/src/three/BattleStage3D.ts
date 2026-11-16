// 포켓몬 5세대(블랙·화이트) 스타일 2.5D 배틀 아레나 렌더러
//  - 바이옴별 입체 하늘·원경 실루엣 + 대지 플로어 + 3D 단상 + 실시간 루미/트레이너 빌보드 + 다이내믹 3D 카메라 워킹 + 3D 포획 병 던지기
import type Phaser from 'phaser';
import * as THREE from 'three';
import { TYPE_COLORS } from '@shared/data';
import type { BattleView } from '@shared/types';
import { syncPhaserCamOverlay } from './Fx3D';
import { Billboard, pixelTex } from './Proto3D';
import { Stage3D } from './Stage3D';

const ME_POS = new THREE.Vector3(-1.9, 0.18, 1.9);
const FOE_POS = new THREE.Vector3(2.0, 0.18, -1.8);

interface ArenaTheme {
  skyTop: string;
  skyBot: string;
  floorA: string;
  floorB: string;
  padTop: string;
  padSide: string;
  accent: string;
  propCol: number;
}

const THEMES: Record<string, ArenaTheme> = {
  grass: { skyTop: '#3e86d8', skyBot: '#b6e6ff', floorA: '#5ba448', floorB: '#4c8e3c', padTop: '#7cc65e', padSide: '#6e4e34', accent: '#ffe58a', propCol: 0x3b7a38 },
  water: { skyTop: '#3578c8', skyBot: '#b8ecff', floorA: '#3b82b8', floorB: '#3272a6', padTop: '#5ca864', padSide: '#4a5a68', accent: '#d8f6ff', propCol: 0x5c84a8 },
  town: { skyTop: '#5088cc', skyBot: '#d6ecff', floorA: '#b4aa9a', floorB: '#9e9484', padTop: '#dad2c2', padSide: '#7c7468', accent: '#ffda88', propCol: 0x7c8496 },
  cave: { skyTop: '#161428', skyBot: '#2e2a46', floorA: '#3a364a', floorB: '#2e2a3c', padTop: '#58526c', padSide: '#242030', accent: '#7ad8ff', propCol: 0x5878a8 },
  snow: { skyTop: '#6898d0', skyBot: '#e8f6ff', floorA: '#dceaf6', floorB: '#c2d8ec', padTop: '#f4faff', padSide: '#8aa2ba', accent: '#ffffff', propCol: 0xa6c8e0 },
  sand: { skyTop: '#4e8ecc', skyBot: '#ffe6b0', floorA: '#d8b46e', floorB: '#c49d5a', padTop: '#ebd08e', padSide: '#8e6c42', accent: '#fff4d4', propCol: 0xb88c4a },
  summit: { skyTop: '#243062', skyBot: '#9488c8', floorA: '#54586a', floorB: '#44485a', padTop: '#74788c', padSide: '#2c303e', accent: '#ffe58a', propCol: 0x868ea8 },
  origin: { skyTop: '#100c24', skyBot: '#382a68', floorA: '#221c44', floorB: '#181436', padTop: '#3c3470', padSide: '#1c183c', accent: '#a8d8ff', propCol: 0x78a8ff },
};

interface Actor3D {
  bb?: Billboard;
  shadow: THREE.Mesh;
  sig: string;
  baseScale: number;
  baseY: number;
  offset: THREE.Vector3;
  scaleMul: number;
  alpha: number;
}

interface BurstDot {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
}

export class BattleStage3D {
  private scene3d = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
  private theme: ArenaTheme;
  private elapsed = 0;
  private introT = 0;
  private camFocus = new THREE.Vector3(0.1, 0.65, 0.05);
  private camPosTarget = new THREE.Vector3(-4.4, 4.4, 12.6);
  private camTargetOffset = new THREE.Vector3();
  private meAct: Actor3D;
  private foeAct: Actor3D;
  private trainerAct?: Actor3D;
  private auraMesh?: THREE.Mesh;
  private jarMesh?: THREE.Mesh;
  private jarOffset = new THREE.Vector3();
  private jarScale = 1;
  private jarRot = 0;
  private dots: BurstDot[] = [];
  private dotGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  private floorTex?: THREE.CanvasTexture;
  private ambientStars: THREE.Mesh[] = [];
  private disposed = false;

  constructor(private phaserScene: Phaser.Scene, private view: BattleView) {
    this.theme = THEMES[view.bg] ?? THEMES.grass;
    Stage3D.getSharedRenderer();
    this.buildArena(view.bg);

    const shadowTex = this.getTex('shadow');
    const makeShadow = (rad: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(rad, rad * 0.48),
        new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.45, depthWrite: false }),
      );
      m.rotation.x = -Math.PI / 2;
      this.scene3d.add(m);
      return m;
    };

    this.meAct = {
      shadow: makeShadow(1.8),
      sig: '',
      baseScale: 1.25,
      baseY: ME_POS.y,
      offset: new THREE.Vector3(-5.5, 0, 0),
      scaleMul: 1,
      alpha: 1,
    };
    this.foeAct = {
      shadow: makeShadow(1.75),
      sig: '',
      baseScale: 1.15,
      baseY: FOE_POS.y,
      offset: new THREE.Vector3(5.5, 0, 0),
      scaleMul: 1,
      alpha: view.trainer ? 0 : 1,
    };

    if (view.trainer) {
      this.trainerAct = {
        shadow: makeShadow(1.45),
        sig: '',
        baseScale: 0.85,
        baseY: FOE_POS.y,
        offset: new THREE.Vector3(1.2, 0, 0),
        scaleMul: 1,
        alpha: 1,
      };
    }

    this.resize();
    this.syncVisibility();
  }

  private getImg(key: string): HTMLImageElement | HTMLCanvasElement | null {
    if (!this.phaserScene.textures.exists(key)) return null;
    return this.phaserScene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  }

  private getTex(key: string): THREE.Texture {
    const img = this.getImg(key);
    if (img) return pixelTex(img, `battle:${key}`);
    const cv = document.createElement('canvas');
    cv.width = 4;
    cv.height = 4;
    const cx = cv.getContext('2d')!;
    cx.fillStyle = '#000000';
    cx.fillRect(0, 0, 4, 4);
    return pixelTex(cv, 'battle:fallback');
  }

  private buildArena(bg: string) {
    const th = this.theme;
    this.scene3d.background = new THREE.Color(th.skyTop);
    if (bg === 'cave' || bg === 'origin') {
      this.scene3d.fog = new THREE.Fog(th.skyBot, 14, 34);
    }

    // 1) 픽셀 감성 곡면 하늘 배경
    const scv = document.createElement('canvas');
    scv.width = 256;
    scv.height = 96;
    const sc = scv.getContext('2d')!;
    const g = sc.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, th.skyTop);
    g.addColorStop(1, th.skyBot);
    sc.fillStyle = g;
    sc.fillRect(0, 0, 256, 96);
    if (bg === 'origin' || bg === 'summit' || bg === 'cave') {
      sc.fillStyle = th.accent;
      for (let i = 0; i < 42; i++) {
        sc.globalAlpha = 0.35 + (i % 4) * 0.18;
        sc.fillRect((i * 37) % 256, (i * 19) % 64, 1 + (i % 2), 1 + (i % 2));
      }
      sc.globalAlpha = 1;
    } else {
      sc.fillStyle = 'rgba(255,255,255,0.45)';
      for (let i = 0; i < 6; i++) {
        const cx = (i * 46 + 12) % 240;
        const cy = 14 + (i % 3) * 10;
        sc.fillRect(cx, cy, 22, 4);
        sc.fillRect(cx + 4, cy - 3, 14, 3);
      }
    }
    const skyTex = pixelTex(scv);
    const backdrop = new THREE.Mesh(
      new THREE.CylinderGeometry(24, 24, 18, 24, 1, true, Math.PI * 0.4, Math.PI * 1.2),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    backdrop.position.set(0, 5.2, -1);
    this.scene3d.add(backdrop);

    // 2) 대지 플로어 타일
    const fcv = document.createElement('canvas');
    fcv.width = 128;
    fcv.height = 128;
    const fc = fcv.getContext('2d')!;
    fc.fillStyle = th.floorA;
    fc.fillRect(0, 0, 128, 128);
    fc.fillStyle = th.floorB;
    for (let y = 0; y < 128; y += 8) {
      for (let x = 0; x < 128; x += 8) {
        if (((x / 8 + y / 8) & 1) === 0) fc.fillRect(x, y, 8, 8);
      }
    }
    this.floorTex = new THREE.CanvasTexture(fcv);
    this.floorTex.magFilter = THREE.NearestFilter;
    this.floorTex.minFilter = THREE.NearestFilter;
    this.floorTex.colorSpace = THREE.SRGBColorSpace;
    this.floorTex.wrapS = this.floorTex.wrapT = THREE.RepeatWrapping;
    this.floorTex.repeat.set(bg === 'water' ? 6 : 8, bg === 'water' ? 6 : 8);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(19, 32),
      new THREE.MeshBasicMaterial({ map: this.floorTex }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene3d.add(floor);

    // 3) 3D 배틀 단상 2개 (아군 · 상대)
    const addPad = (pos: THREE.Vector3, r: number) => {
      const grp = new THREE.Group();
      const side = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r * 1.1, 0.2, 16),
        new THREE.MeshBasicMaterial({ color: th.padSide }),
      );
      side.position.y = 0.08;
      const top = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.96, r * 0.98, 0.06, 16),
        new THREE.MeshBasicMaterial({ color: th.padTop }),
      );
      top.position.y = 0.17;
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.88, r * 0.96, 16),
        new THREE.MeshBasicMaterial({ color: th.accent, transparent: true, opacity: bg === 'origin' ? 0.55 : 0.22, side: THREE.DoubleSide }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.205;
      grp.add(side, top, rim);
      grp.position.set(pos.x, 0, pos.z);
      this.scene3d.add(grp);
    };
    addPad(ME_POS, 1.65);
    addPad(FOE_POS, 1.8);

    // 4) 원경 바이옴 프롭 (입체감 강화)
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * 0.85 + (i / 8) * Math.PI * 0.7;
      const dist = 10.5 + (i % 2) * 2.2;
      const px = Math.cos(a) * dist;
      const pz = Math.sin(a) * dist - 1.5;
      const h = bg === 'cave' ? 2.4 + (i % 3) * 0.9 : bg === 'origin' ? 1.8 + (i % 2) * 0.8 : 1.4 + (i % 3) * 0.55;
      const geo = bg === 'cave' || bg === 'origin'
        ? new THREE.OctahedronGeometry(0.65, 0)
        : new THREE.ConeGeometry(0.95, h, bg === 'town' ? 4 : 6);
      const prop = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: th.propCol }));
      prop.position.set(px, h * 0.45, pz);
      if (bg === 'origin') {
        prop.position.y = 1.6 + (i % 3) * 0.8;
        this.ambientStars.push(prop);
      }
      this.scene3d.add(prop);
    }
  }

  syncVisibility() {
    if (this.disposed) return;
    const show = Stage3D.enabled;
    const r = Stage3D.getSharedRenderer();
    r.domElement.style.display = show ? 'block' : 'none';
    if (!show) syncPhaserCamOverlay(undefined, false);
  }

  resize() {
    const r = Stage3D.getSharedRenderer();
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.setSize(window.innerWidth, window.innerHeight, false);
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1.35 ? Math.min(46, 28 * (1.35 / Math.max(0.55, aspect))) : 28;
    this.camera.updateProjectionMatrix();
  }

  private syncSprite(act: Actor3D, sp: Phaser.GameObjects.Sprite | undefined, worldAnchor: THREE.Vector3, scaleMul = 1) {
    if (!sp || !sp.active || act.alpha <= 0.01) {
      if (act.bb) act.bb.mesh.visible = false;
      act.shadow.visible = false;
      return;
    }
    const texKey = sp.texture?.key;
    if (!texKey || texKey === '__DEFAULT') return;
    const img = this.getImg(texKey);
    if (!img) return;
    const fw = sp.frame.width || img.width;
    const fh = sp.frame.height || img.height;
    const cols = Math.max(1, Math.round(img.width / fw));
    const rows = Math.max(1, Math.round(img.height / fh));
    const sig = `${texKey}:${fw}x${fh}`;

    if (!act.bb || act.sig !== sig) {
      if (act.bb) this.scene3d.remove(act.bb.mesh);
      const tex = pixelTex(img, `b3d:${texKey}`);
      const bb = new Billboard(tex, fw, fh, cols, rows, sp.originY, sp.originX);
      (bb.mesh.material as THREE.MeshBasicMaterial).transparent = true;
      act.bb = bb;
      act.sig = sig;
      this.scene3d.add(bb.mesh);
    }

    act.bb.mesh.visible = true;
    const frameIdx = typeof sp.frame.name === 'number' ? sp.frame.name : parseInt(String(sp.frame.name), 10) || 0;
    act.bb.setFrame(frameIdx);

    const s = act.baseScale * act.scaleMul * scaleMul;
    act.bb.mesh.scale.set(s * (sp.flipX ? -1 : 1), s, 1);
    act.bb.mesh.position.set(
      worldAnchor.x + act.offset.x,
      Math.max(worldAnchor.y, worldAnchor.y + act.offset.y),
      worldAnchor.z + act.offset.z,
    );
    act.bb.mesh.lookAt(this.camera.position.x, act.bb.mesh.position.y, this.camera.position.z);

    const mat = act.bb.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = act.alpha;

    act.shadow.visible = act.alpha > 0.15;
    const sh = s * 0.55;
    act.shadow.scale.set(sh, sh, 1);
    act.shadow.position.set(worldAnchor.x + act.offset.x, worldAnchor.y + 0.03, worldAnchor.z + act.offset.z);
  }

  private emitDots(center: THREE.Vector3, colHex: number, count = 10, up = 2.6, spread = 2.2) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(
        this.dotGeo,
        new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: 0.95 }),
      );
      m.position.set(center.x + (Math.random() - 0.5) * 0.5, center.y + 0.55, center.z + (Math.random() - 0.5) * 0.5);
      this.scene3d.add(m);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const spd = 1.2 + Math.random() * spread;
      this.dots.push({
        mesh: m,
        vx: Math.cos(a) * spd,
        vy: up * (0.5 + Math.random() * 0.7),
        vz: Math.sin(a) * spd,
        age: 0,
        life: 0.48 + Math.random() * 0.2,
      });
    }
  }

  playEntrance(bigFoe: boolean) {
    this.introT = 0;
    this.meAct.offset.set(-6.5, 0, 0);
    this.foeAct.offset.set(6.5, 0, 0);
    if (this.trainerAct) this.trainerAct.offset.set(2.2, 0, 0);
    if (bigFoe) this.ensureAura(true);
    const dur = bigFoe ? 1100 : 700;
    this.phaserScene.tweens.add({ targets: this.meAct.offset, x: 0, duration: 700, ease: 'Cubic.Out' });
    this.phaserScene.tweens.add({ targets: this.foeAct.offset, x: 0, duration: dur, ease: 'Cubic.Out' });
    if (this.trainerAct) {
      this.phaserScene.tweens.add({ targets: this.trainerAct.offset, x: 0, duration: 700, ease: 'Cubic.Out' });
    }
  }

  ensureAura(enable: boolean) {
    if (enable && !this.auraMesh) {
      const gTex = this.getTex('glow');
      const m = new THREE.MeshBasicMaterial({
        map: gTex,
        color: this.view.foe.species === 'onnuri' ? 0xfff0c0 : 0x7ad8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.auraMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), m);
      this.auraMesh.position.set(FOE_POS.x, FOE_POS.y + 1.1, FOE_POS.z - 0.15);
      this.scene3d.add(this.auraMesh);
    } else if (!enable && this.auraMesh) {
      this.scene3d.remove(this.auraMesh);
      this.auraMesh.geometry.dispose();
      (this.auraMesh.material as THREE.Material).dispose();
      this.auraMesh = undefined;
    }
  }

  async hideTrainerAndRevealFoe() {
    if (this.trainerAct) {
      this.phaserScene.tweens.add({ targets: this.trainerAct.offset, x: 5.5, duration: 420, ease: 'Quad.In' });
      this.phaserScene.tweens.add({ targets: this.trainerAct, alpha: 0, duration: 420 });
    }
    this.foeAct.alpha = 1;
    this.foeAct.offset.set(0, 0, 0);
    this.popIn('foe');
  }

  popIn(side: 'me' | 'foe') {
    const act = side === 'me' ? this.meAct : this.foeAct;
    const pos = side === 'me' ? ME_POS : FOE_POS;
    act.alpha = 1;
    act.offset.set(0, 0, 0);
    act.scaleMul = 0.2;
    this.phaserScene.tweens.add({ targets: act, scaleMul: 1, duration: 280, ease: 'Back.Out' });
    this.emitDots(pos, 0xffe58a, 8, 2.2, 1.8);
  }

  async playAttack(side: 'me' | 'foe', type: string) {
    const a = side === 'me' ? this.meAct : this.foeAct;
    const targetPos = side === 'me' ? FOE_POS : ME_POS;
    const dirVec = side === 'me' ? new THREE.Vector3(1.15, 0.35, -0.9) : new THREE.Vector3(-1.15, 0.35, 0.9);
    const camKick = side === 'me' ? new THREE.Vector3(0.85, -0.15, -0.75) : new THREE.Vector3(-0.75, -0.15, 0.65);

    this.phaserScene.tweens.add({ targets: this.camTargetOffset, x: camKick.x, y: camKick.y, z: camKick.z, duration: 180, yoyo: true, ease: 'Quad.Out' });
    await new Promise<void>((r) =>
      this.phaserScene.tweens.add({
        targets: a.offset,
        x: dirVec.x,
        y: dirVec.y,
        z: dirVec.z,
        duration: 120,
        yoyo: true,
        ease: 'Quad.Out',
        onComplete: () => r(),
      }),
    );
    const colHex = Number(`0x${(TYPE_COLORS[type as keyof typeof TYPE_COLORS] ?? '#ffffff').replace('#', '')}`) || 0xffffff;
    this.emitDots(targetPos, colHex, 12, 2.8, 2.6);
  }

  playHit(side: 'me' | 'foe', eff?: number) {
    const target = side === 'me' ? this.meAct : this.foeAct;
    const pos = side === 'me' ? ME_POS : FOE_POS;
    if (eff !== undefined) {
      this.phaserScene.tweens.add({ targets: target, alpha: 0.2, duration: 70, yoyo: true, repeat: 2 });
    } else {
      this.emitDots(pos, 0x9aff9a, 8, 2.5, 1.2);
    }
  }

  playFaint(side: 'me' | 'foe') {
    const target = side === 'me' ? this.meAct : this.foeAct;
    this.phaserScene.tweens.add({ targets: target.offset, y: -1.4, duration: 420, ease: 'Quad.In' });
    this.phaserScene.tweens.add({ targets: target, alpha: 0, duration: 420 });
  }

  async playThrowJar(shakes: number, success: boolean, wait: (ms: number) => Promise<void>) {
    if (!this.jarMesh) {
      const tex = this.getTex('jar_throw');
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
      this.jarMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.75), mat);
      this.scene3d.add(this.jarMesh);
    }
    const jar = this.jarMesh;
    jar.visible = true;
    this.jarScale = 1;
    this.jarRot = 0;

    // 1) 포물선 투척
    await new Promise<void>((r) => {
      const st = { k: 0 };
      this.phaserScene.tweens.add({
        targets: st,
        k: 1,
        duration: 520,
        ease: 'Linear',
        onUpdate: () => {
          this.jarOffset.set(
            ME_POS.x + (FOE_POS.x - ME_POS.x) * st.k,
            ME_POS.y + 1.2 + (FOE_POS.y + 0.5 - (ME_POS.y + 1.2)) * st.k + Math.sin(st.k * Math.PI) * 2.2,
            ME_POS.z + (FOE_POS.z - ME_POS.z) * st.k,
          );
          this.jarRot = st.k * Math.PI * 4;
        },
        onComplete: () => r(),
      });
    });

    // 2) 루미 흡수 + 단상 착지 바운스
    this.phaserScene.tweens.add({ targets: this.foeAct, scaleMul: 0.08, alpha: 0, duration: 240 });
    this.emitDots(FOE_POS, 0xfff5c0, 10, 2.2, 1.9);
    this.jarRot = 0;
    await new Promise<void>((r) => {
      this.phaserScene.tweens.add({
        targets: this.jarOffset,
        y: FOE_POS.y + 0.35,
        duration: 300,
        ease: 'Bounce.Out',
        onComplete: () => r(),
      });
    });

    // 3) 흔들림 (최대 3회)
    for (let i = 0; i < Math.min(3, shakes); i++) {
      await wait(350);
      await new Promise<void>((r) => {
        const st = { a: -0.35 };
        this.phaserScene.tweens.add({
          targets: st,
          a: 0.35,
          duration: 110,
          yoyo: true,
          onUpdate: () => { this.jarRot = st.a; },
          onComplete: () => { this.jarRot = 0; r(); },
        });
      });
    }
    await wait(350);

    if (success) {
      this.emitDots(FOE_POS, 0xffe58a, 14, 3.0, 2.4);
      this.phaserScene.tweens.add({ targets: this.jarOffset, y: FOE_POS.y + 0.55, duration: 180, yoyo: true, repeat: 1 });
    } else {
      jar.visible = false;
      this.popIn('foe');
    }
  }

  update(
    dtMs: number,
    state: {
      me: Phaser.GameObjects.Sprite;
      foe: Phaser.GameObjects.Sprite;
      trainer?: Phaser.GameObjects.Sprite;
      foeBig: boolean;
      cam: Phaser.Cameras.Scene2D.Camera;
    },
  ) {
    if (this.disposed || !Stage3D.enabled) return;
    const dt = Math.min(0.05, dtMs / 1000);
    this.elapsed += dt;
    this.introT = Math.min(1, this.introT + dt / 0.85);

    // 물 바닥 잔물결 스크롤 + 오리진 부유 크리스탈
    if (this.floorTex && this.view.bg === 'water') {
      this.floorTex.offset.x = (this.floorTex.offset.x + dt * 0.08) % 1;
      this.floorTex.offset.y = (this.floorTex.offset.y + dt * 0.04) % 1;
    }
    for (let i = 0; i < this.ambientStars.length; i++) {
      this.ambientStars[i].rotation.y += dt * 0.7;
      this.ambientStars[i].position.y += Math.sin(this.elapsed * 2 + i) * dt * 0.2;
    }
    if (this.auraMesh) {
      this.auraMesh.lookAt(this.camera.position);
      const pulse = 0.85 + Math.sin(this.elapsed * 3.2) * 0.14;
      this.auraMesh.scale.set(pulse, pulse, 1);
    }

    // 3D 파티클 적분
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const p = this.dots[i];
      p.age += dt;
      if (p.age >= p.life) {
        this.scene3d.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();
        this.dots.splice(i, 1);
        continue;
      }
      p.vy -= 7.5 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y = Math.max(0.1, p.mesh.position.y + p.vy * dt);
      p.mesh.position.z += p.vz * dt;
      p.mesh.rotation.x += dt * 6;
      p.mesh.rotation.y += dt * 6;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - p.age / p.life);
    }

    // 포켓몬 5세대풍 다이내믹 스윙 카메라
    const ease = 1 - Math.pow(1 - this.introT, 3);
    const swayX = Math.sin(this.elapsed * 0.65) * 0.35;
    const swayY = Math.cos(this.elapsed * 0.45) * 0.12;
    const swayZ = Math.sin(this.elapsed * 0.5) * 0.22;

    const shake = state.cam.shakeEffect as unknown as { isRunning: boolean; intensity?: { x: number; y: number } } | undefined;
    const shX = shake?.isRunning ? (Math.random() - 0.5) * (shake.intensity?.x ?? 0.01) * 16 : 0;
    const shY = shake?.isRunning ? (Math.random() - 0.5) * (shake.intensity?.y ?? shake.intensity?.x ?? 0.01) * 14 : 0;

    const introX = (1 - ease) * 3.5;
    const introY = (1 - ease) * 1.4;
    this.camera.position.set(
      this.camPosTarget.x + introX + swayX + this.camTargetOffset.x * 0.7 + shX,
      this.camPosTarget.y + introY + swayY + shY,
      this.camPosTarget.z + swayZ + this.camTargetOffset.z * 0.7,
    );
    this.camera.lookAt(
      this.camFocus.x + this.camTargetOffset.x + shX * 0.4,
      this.camFocus.y + shY * 0.4,
      this.camFocus.z + this.camTargetOffset.z,
    );

    // 빌보드 동기화
    this.syncSprite(this.meAct, state.me, ME_POS, 1.0);
    this.syncSprite(this.foeAct, state.foe, FOE_POS, state.foeBig ? 0.62 : 1.0);
    if (this.trainerAct && state.trainer) {
      this.syncSprite(this.trainerAct, state.trainer, FOE_POS, 1.0);
    }
    if (this.jarMesh?.visible) {
      this.jarMesh.position.copy(this.jarOffset);
      this.jarMesh.lookAt(this.camera.position);
      this.jarMesh.rotateZ(this.jarRot);
      this.jarMesh.scale.setScalar(this.jarScale);
    }

    Stage3D.getSharedRenderer().render(this.scene3d, this.camera);
    syncPhaserCamOverlay(state.cam, true);
  }

  dispose() {
    this.disposed = true;
    syncPhaserCamOverlay(undefined, false);
    for (const d of this.dots) (d.mesh.material as THREE.Material).dispose();
    this.dots = [];
    this.dotGeo.dispose();
    this.floorTex?.dispose();
    this.ensureAura(false);
    this.scene3d.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m.dispose();
      }
    });
  }
}
