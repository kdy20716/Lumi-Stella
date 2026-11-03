import Phaser from 'phaser';
import type { Weather } from '@shared/types';
import { DEPTH } from '../config';
import type { World } from '../world/World';
import { Butterfly } from '../entities/Animals';

// 시간대별 조명 키프레임: [분, 색상, 조명 강도(가로등/창문)]
const KEYS: [number, number, number][] = [
  [360, 0xc6a6d8, 0.55], [420, 0xffecd2, 0.1], [540, 0xffffff, 0], [960, 0xfffaf0, 0],
  [1080, 0xffc48a, 0.25], [1170, 0xc58aa8, 0.65], [1260, 0x5a68aa, 1], [1560, 0x3a4482, 1],
];
const lerpColor = (a: number, b: number, t: number) => {
  const ca = Phaser.Display.Color.IntegerToColor(a), cb = Phaser.Display.Color.IntegerToColor(b);
  const c = Phaser.Display.Color.Interpolate.ColorWithColor(ca, cb, 100, Math.round(t * 100));
  return Phaser.Display.Color.GetColor(c.r, c.g, c.b);
};

/** 낮/밤 조명, 가로등·창문 발광, 구름 그림자, 비, 나비/반딧불 */
export class Atmosphere {
  private overlay: Phaser.GameObjects.Image;
  private glows: { img: Phaser.GameObjects.Image; base: number; phase: number }[] = [];
  private clouds: Phaser.GameObjects.Image[] = [];
  private rain: Phaser.GameObjects.Particles.ParticleEmitter;
  private butterflies: Butterfly[] = [];
  private fireflies: { img: Phaser.GameObjects.Image; t: number; bx: number; by: number }[] = [];
  light = 0;
  private weather: Weather = 'sunny';
  private indoor = false;

  constructor(private scene: Phaser.Scene, private world: World) {
    // 화면을 덮는 곱하기(MULTIPLY) 레이어로 시간대 색감 연출
    this.overlay = scene.add.image(0, 0, '__WHITE').setOrigin(0).setDepth(DEPTH.overlay).setBlendMode(Phaser.BlendModes.MULTIPLY);

    for (const l of world.lights) this.addGlow(l.x, l.y, l.scale, l.tint, l.base);

    this.indoor = world.interior;
    // 구름 그림자
    for (let i = 0; i < (this.indoor ? 0 : 5); i++) {
      this.clouds.push(scene.add.image(Math.random() * world.widthPx, Math.random() * world.heightPx, 'cloud')
        .setScale(1.6 + Math.random()).setAlpha(0.13).setDepth(DEPTH.overlay - 5));
    }

    // 비
    if (!scene.textures.exists('raindrop')) {
      const g = scene.make.graphics({}, false);
      g.fillStyle(0xbfe3ff, 1).fillRect(0, 0, 1, 6); g.generateTexture('raindrop', 1, 6); g.destroy();
    }
    this.rain = scene.add.particles(0, 0, 'raindrop', {
      x: { min: -40, max: 1400 }, y: { min: -20, max: 0 }, lifespan: { min: 900, max: 1500 },
      speedY: { min: 240, max: 300 }, speedX: { min: -50, max: -35 }, quantity: 3, frequency: 14, alpha: { start: 0.75, end: 0.2 }, emitting: false,
    }).setDepth(DEPTH.weather);

    if (this.indoor) return;
    for (let i = 0; i < 9; i++) this.butterflies.push(new Butterfly(scene, 100 + Math.random() * (world.widthPx - 200), 80 + Math.random() * (world.heightPx - 160), { w: world.widthPx, h: world.heightPx }));
    for (let i = 0; i < 26; i++) {
      const water = world.mapId === 'town' ? { x: 360, y: 290, w: 270, h: 160 } : { x: 100, y: 400, w: 200, h: 180 };
      const nearPond = i < 14;
      const bx = nearPond ? water.x + Math.random() * water.w : 60 + Math.random() * (world.widthPx - 120);
      const by = nearPond ? water.y + Math.random() * water.h : 60 + Math.random() * (world.heightPx - 120);
      this.fireflies.push({ img: scene.add.image(bx, by, 'glow').setScale(0.06).setTint(0xd8ff7a).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow).setAlpha(0), t: Math.random() * 9999, bx, by });
    }
  }

  private addGlow(x: number, y: number, scale: number, tint: number, base = 1) {
    const img = this.scene.add.image(x, y, 'glow').setScale(scale).setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.glow).setAlpha(0);
    this.glows.push({ img, base, phase: Math.random() * 10 });
  }

  setWeather(w: Weather) { this.weather = w; if (w === 'rain' && !this.indoor) this.rain.start(); else this.rain.stop(); }

  update(dt: number, minutes: number) {
    // 키프레임 보간
    let i = 0; while (i < KEYS.length - 2 && minutes >= KEYS[i + 1][0]) i++;
    const [m0, c0, l0] = KEYS[i], [m1, c1, l1] = KEYS[i + 1];
    const t = Phaser.Math.Clamp((minutes - m0) / (m1 - m0), 0, 1);
    let color = lerpColor(c0, c1, t);
    this.light = Phaser.Math.Linear(l0, l1, t);
    if (this.weather === 'rain') { color = lerpColor(color, 0x8a96b0, 0.45); this.light = Math.max(this.light, 0.35); }
    // 실내: 바깥보다 훨씬 은은하게 (밤엔 따뜻한 조명)
    if (this.indoor) { color = lerpColor(0xffffff, 0xe0cce0, this.light * 0.7); this.light = 0.35 + this.light * 0.6; }

    const v = this.scene.cameras.main.worldView;
    this.overlay.setPosition(v.x - 4, v.y - 4).setDisplaySize(v.width + 8, v.height + 8).setTint(color);
    this.rain.setPosition(v.x, v.y - 10);

    const now = this.scene.time.now;
    for (const g of this.glows) g.img.setAlpha(this.light * g.base * (0.85 + Math.sin(now / 180 + g.phase) * 0.05 + Math.sin(now / 47 + g.phase) * 0.03));
    for (const w of this.world.windowGlows) w.setAlpha(this.light * 0.9);

    for (const c of this.clouds) {
      c.x += dt * 0.006; c.y += dt * 0.0015;
      if (c.x - c.displayWidth / 2 > this.world.widthPx) { c.x = -c.displayWidth / 2; c.y = Math.random() * this.world.heightPx; }
      c.setAlpha((this.weather === 'rain' ? 0.2 : 0.13) * (1 - this.light * 0.8));
    }
    const day = this.weather === 'rain' ? 0 : Phaser.Math.Clamp(1 - this.light * 2, 0, 1);
    for (const b of this.butterflies) b.update(dt, day);
    for (const f of this.fireflies) {
      f.t += dt;
      f.img.setPosition(f.bx + Math.sin(f.t / 1300) * 22 + Math.sin(f.t / 370) * 4, f.by + Math.cos(f.t / 1700) * 16 + Math.sin(f.t / 290) * 3);
      f.img.setAlpha(Math.max(0, this.light - 0.4) * (0.5 + 0.5 * Math.sin(f.t / 260)) * 1.4);
    }
  }
}
