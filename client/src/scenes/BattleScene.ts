import Phaser from 'phaser';
import { STARTER_LUMI_SET } from '@shared/bmShop';
import { TYPE_COLORS } from '@shared/data';
import type { BattleLog, BattleUpdate, CreatureView } from '@shared/types';
import type { Authority } from '../net/Authority';
import { BattleUI } from '../ui/BattleUI';
import { sfx } from '../audio/Sfx';
import { music } from '../audio/Music';

export interface BattleData { auth: Authority; update: BattleUpdate; onEnd: (ended: NonNullable<BattleUpdate['ended']>) => void }

const W = 240, H = 135;
const FOE = { x: 172, y: 88 }, ME = { x: 62, y: 124 };

/** 배틀 씬: 배경/루미 스프라이트 연출은 2D Phaser, 체력·메뉴·메시지는 DOM(BattleUI) */
export class BattleScene extends Phaser.Scene {
  private ui!: BattleUI;
  private data_!: BattleData;
  private foe!: Phaser.GameObjects.Sprite;
  private me!: Phaser.GameObjects.Sprite;
  private trainerSprite?: Phaser.GameObjects.Sprite;
  private foeShadow!: Phaser.GameObjects.Ellipse;
  private meShadow!: Phaser.GameObjects.Ellipse;
  private busy = false;

  constructor() { super('Battle'); }

  create(data: BattleData) {
    this.data_ = data;
    const v = data.update.view;
    const cam = this.cameras.main;
    const fit = () => { const z = Math.max(1, Math.min(this.scale.width / W, (this.scale.height + 40) / H)); cam.setZoom(z); cam.centerOn(W / 2, H / 2 + 6); };
    fit(); this.scale.on('resize', fit); this.events.once('shutdown', () => this.scale.off('resize', fit));
    cam.setBackgroundColor('#0b0d18');
    this.add.image(0, 0, `battle_${v.bg}`).setOrigin(0);
    this.foeShadow = this.add.ellipse(FOE.x, FOE.y + 1, 34, 7, 0x203018, 0.35);
    this.meShadow = this.add.ellipse(ME.x, ME.y + 1, 42, 9, 0x203018, 0.35);
    this.foe = this.add.sprite(FOE.x + 140, FOE.y, `lumi_${v.foe.species}`, 0);
    this.skinFoe(v.foe.species);
    const myKey = this.mySheetKey(v.me.species);
    this.me = this.add.sprite(ME.x - 140, ME.y, myKey, 4).setOrigin(0.5, 30 / 32).setScale(2);
    this.me.play(`${myKey}:up`);

    this.trainerSprite = undefined;
    if (v.trainer) {
      this.trainerSprite = this.add.sprite(FOE.x + 30, FOE.y, v.trainer.sprite, 0).setOrigin(0.5, 39 / 48).setScale(1.4);
      this.foe.setAlpha(0);
    }

    this.ui = new BattleUI();
    this.ui.setView(v);
    this.ui.hideSide('foe'); this.ui.hideSide('me');
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if ([' ', 'Enter', 'e', 'E', 'z', 'Z'].includes(e.key)) this.ui.advance();
    });
    this.input.on('pointerdown', () => this.ui.advance());
    this.events.once('shutdown', () => { this.ui.destroy(); this.input.keyboard?.off('keydown'); this.input.off('pointerdown'); });

    // 등장 연출
    cam.flash(250, 255, 255, 255);
    this.tweens.add({ targets: this.foe, x: FOE.x, duration: this.big ? 1100 : 700, ease: 'Cubic.Out' });
    if (this.big) this.legendEntrance();
    this.tweens.add({ targets: this.me, x: ME.x, duration: 700, ease: 'Cubic.Out' });
    this.time.delayedCall(720, async () => {
      if (this.trainerSprite) {
        await this.ui.say(data.update.log[0] && data.update.log[0].t === 'text' ? data.update.log[0].text : '', 600);
        this.tweens.add({ targets: this.trainerSprite, x: FOE.x + 140, alpha: 0, duration: 450 });
        this.foe.setAlpha(1); this.popIn(this.foe);
        await this.run(data.update.log.slice(1));
      } else await this.run(data.update.log);
      this.ui.setSide('foe', v.foe); this.ui.setSide('me', v.me);
      this.next(data.update);
    });
  }

  update() {}

  /** 상대 그림: 전설 · 환상은 큰 그림(96px) + 후광 */
  private big = false;
  private foeScale = 1.6;
  private aura?: Phaser.GameObjects.Image;
  private skinFoe(species: string) {
    const bigKey = `lumi_big_${species}`;
    this.big = this.textures.exists(bigKey);
    this.foeScale = this.big ? 0.86 : 1.6;
    if (this.big) { this.foe.setTexture(bigKey, 0).setOrigin(0.5, 92 / 96).setScale(this.foeScale); this.foe.play(`${bigKey}:idle`); }
    else { this.foe.setTexture(`lumi_${species}`, 0).setOrigin(0.5, 30 / 32).setScale(this.foeScale); this.foe.play(`lumi_${species}:down`); }
    this.foeShadow.setScale(this.big ? 2.1 : 1, this.big ? 1.7 : 1);
    this.aura?.destroy(); this.aura = undefined;
    if (this.big && this.textures.exists('glow')) {
      const tint = species === 'onnuri' ? 0xfff0b0 : species === 'stella' ? 0xff92e4 : 0xffe066;
      const pTint = species === 'onnuri' ? 0xd294ff : species === 'stella' ? 0x88f4ff : 0xffe878;
      this.aura = this.add.image(FOE.x, FOE.y - 40, 'glow').setScale(0.95).setTint(tint).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD).setDepth(-1);
      this.foe.setDepth(1);
      this.tweens.add({ targets: this.aura, scale: 1.15, alpha: 0.32, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
      // 전설별 고유 별빛 파티클 (제네시스: 시공 성광 / 스텔라: 오로라 회전 입자 / 별무리: 상승 유성)
      this.time.addEvent({ delay: 190, loop: true, callback: () => {
        if (!this.foe.visible || this.foe.alpha < 0.5) return;
        const ox = Phaser.Math.Between(-38, 38), oy = Phaser.Math.Between(0, 26);
        const p = this.add.image(FOE.x + ox, FOE.y - oy, 'sparkle').setTint(pTint).setAlpha(0.92).setScale(0.65).setDepth(2).setBlendMode(Phaser.BlendModes.ADD);
        const dx = species === 'byeolmuri' ? -22 : species === 'stella' ? Math.sin(this.time.now / 250) * 24 : ox * 0.4;
        this.tweens.add({ targets: p, x: p.x + dx, y: p.y - Phaser.Math.Between(28, 62), alpha: 0, duration: 1350, onComplete: () => p.destroy() });
      } });
    }
  }
  /** 전설별 고유 배틀장 등장 연출 (별무리: 황금 유성 / 스텔라: 오로라 링 / 제네시스: 태초 충격파) */
  private legendEntrance() {
    const cam = this.cameras.main;
    const sp = this.data_.update.view.foe.species;
    const [r, g, b] = sp === 'onnuri' ? [255, 245, 200] : sp === 'stella' ? [255, 170, 240] : [255, 230, 130];
    this.time.delayedCall(750, () => {
      cam.shake(720, sp === 'onnuri' ? 0.016 : 0.012);
      cam.flash(420, r, g, b);
      sfx.play('roar');
      // 방사형 링 파동 2회
      for (let k = 0; k < 2; k++) {
        this.time.delayedCall(k * 180, () => {
          const ring = this.add.circle(FOE.x, FOE.y - 26, 8).setStrokeStyle(2, Phaser.Display.Color.GetColor(r, g, b), 0.9).setDepth(3);
          this.tweens.add({ targets: ring, scale: 6.5, alpha: 0, duration: 600, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
        });
      }
    });
  }

  private popIn(s: Phaser.GameObjects.Sprite) {
    const sc = s.scaleX; s.setScale(0.2);
    this.tweens.add({ targets: s, scale: sc, duration: 280, ease: 'Back.Out' });
    for (let i = 0; i < 6; i++) {
      const p = this.add.image(s.x, s.y - 16, 'sparkle');
      const a = (i / 6) * Math.PI * 2;
      this.tweens.add({ targets: p, x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 16, alpha: 0, duration: 420, onComplete: () => p.destroy() });
    }
  }

  private next(up: BattleUpdate) {
    if (up.ended) { this.finish(up.ended); return; }
    this.ui.setView(up.view);
    this.ui.showMenu({
      move: (i) => this.act({ kind: 'battleMove', index: i }),
      item: (id) => this.act({ kind: 'battleItem', itemId: id }),
      swap: (i) => this.act({ kind: 'battleSwitch', index: i }),
      run: () => this.act({ kind: 'battleRun' }),
    });
  }

  private async act(a: Parameters<Authority['request']>[0]) {
    if (this.busy) return;
    this.busy = true; this.ui.hideMenu();
    const r = await this.data_.auth.request(a);
    if (r.battle) { await this.run(r.battle.log, r.battle.ended); this.busy = false; this.next(r.battle); }
    else { this.busy = false; this.next({ view: this.ui.view!, log: [] }); }
  }

  private finish(ended: NonNullable<BattleUpdate['ended']>) {
    this.cameras.main.fadeOut(400, 10, 12, 20);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.data_.onEnd(ended); this.scene.stop(); });
  }

  // ── 로그 재생 ──────────────────────────────────────
  private async run(log: BattleLog[], ended?: BattleUpdate['ended']) {
    // 이긴 배틀이면 마지막 상대가 쓰러지는 순간 승리 음악
    const lastFaint = ended === 'win' ? log.map((e) => e.t === 'faint' && e.side === 'foe').lastIndexOf(true) : -1;
    for (const [i, e] of log.entries()) {
      await this.play(e);
      if (i === lastFaint) music.play('victory');
      if (ended === 'caught' && e.t === 'throw' && e.success) music.play('victory');
    }
  }
  private wait(ms: number) { return new Promise<void>((r) => this.time.delayedCall(ms, r)); }

  private async play(e: BattleLog) {
    switch (e.t) {
      case 'text':
        if (/올라갔다|올랐다/.test(e.text)) sfx.play('buff'); else if (/떨어졌다/.test(e.text)) sfx.play('debuff'); else if (/레벨이/.test(e.text)) sfx.play('levelup'); else if (/승부에서 이겼다/.test(e.text)) sfx.play('win');
        await this.ui.say(e.text); break;
      case 'attack': await this.attackFx(e.side, e.type); break;
      case 'hp': {
        const target = e.side === 'me' ? this.me : this.foe;
        this.ui.hp(e.side, e.hp, e.maxHp);
        sfx.play(e.eff === undefined ? 'heal' : e.eff > 1 || e.crit ? 'superHit' : e.eff < 1 ? 'weakHit' : 'hit');
        if (e.eff !== undefined) {
          this.tweens.add({ targets: target, alpha: 0.2, duration: 70, yoyo: true, repeat: 2 });
          this.cameras.main.shake(e.eff > 1 ? 220 : 120, e.eff > 1 ? 0.012 : 0.005);
        } else {
          for (let i = 0; i < 5; i++) { const p = this.add.image(target.x + Phaser.Math.Between(-12, 12), target.y - Phaser.Math.Between(4, 30), 'sparkle').setTint(0x9aff9a); this.tweens.add({ targets: p, y: p.y - 12, alpha: 0, duration: 600, onComplete: () => p.destroy() }); }
        }
        await this.wait(520);
        break;
      }
      case 'faint': {
        const s = e.side === 'me' ? this.me : this.foe;
        sfx.play('faint');
        this.tweens.add({ targets: s, y: s.y + 20, alpha: 0, duration: 450, ease: 'Quad.In' });
        this.tweens.add({ targets: e.side === 'me' ? this.meShadow : this.foeShadow, alpha: 0, duration: 450 });
        await this.wait(500); this.ui.hideSide(e.side);
        break;
      }
      case 'send': await this.send(e.side, e.view); break;
      case 'throw': await this.throwJar(e.shakes, e.success); break;
      case 'exp': this.ui.exp(e.exp, e.expNext, e.level); await this.wait(e.leveled ? 300 : 150); break;
    }
  }

  private mySheetKey(species: string): string {
    const coord = this.data_.auth.me.lumiCoord ?? '';
    if (coord && STARTER_LUMI_SET.has(species)) {
      const k = `lumi_${species}_${coord}`;
      if (this.textures.exists(k)) return k;
    }
    return `lumi_${species}`;
  }

  private async send(side: 'me' | 'foe', v: CreatureView) {
    const s = side === 'me' ? this.me : this.foe;
    const pos = side === 'me' ? ME : FOE;
    sfx.play('send');
    s.setPosition(pos.x, pos.y).setAlpha(1);
    (side === 'me' ? this.meShadow : this.foeShadow).setAlpha(0.35);
    if (side === 'foe') { this.skinFoe(v.species); }
    else { const mk = this.mySheetKey(v.species); s.setTexture(mk, 4); s.play(`${mk}:up`); }
    this.popIn(s);
    this.ui.setSide(side, v);
    await this.wait(400);
  }

  private async attackFx(side: 'me' | 'foe', type: string) {
    const a = side === 'me' ? this.me : this.foe, t = side === 'me' ? this.foe : this.me;
    const dx = side === 'me' ? 14 : -14, dy = side === 'me' ? -6 : 6;
    await new Promise<void>((r) => this.tweens.add({ targets: a, x: a.x + dx, y: a.y + dy, duration: 110, yoyo: true, ease: 'Quad.Out', onComplete: () => r() }));
    const col = Phaser.Display.Color.HexStringToColor(TYPE_COLORS[type as keyof typeof TYPE_COLORS] ?? '#ffffff').color;
    for (let i = 0; i < 9; i++) {
      const p = this.add.circle(t.x + Phaser.Math.Between(-10, 10), t.y - 14 + Phaser.Math.Between(-10, 8), Phaser.Math.Between(2, 4), col, 0.9);
      this.tweens.add({ targets: p, scale: 2.2, alpha: 0, duration: 380 + i * 25, onComplete: () => p.destroy() });
    }
    await this.wait(180);
  }

  private async throwJar(shakes: number, success: boolean) {
    const jar = this.add.image(ME.x, ME.y - 30, 'jar_throw').setScale(1.4);
    sfx.play('throw');
    await new Promise<void>((r) => {
      const start = { x: jar.x, y: jar.y }, end = { x: FOE.x, y: FOE.y - 20 };
      this.tweens.addCounter({ from: 0, to: 1, duration: 520, onUpdate: (tw: Phaser.Tweens.Tween) => { const k = tw.getValue() ?? 0; jar.setPosition(start.x + (end.x - start.x) * k, start.y + (end.y - start.y) * k - Math.sin(k * Math.PI) * 40); jar.setAngle(k * 540); }, onComplete: () => r() });
    });
    // 루미가 병 속으로
    this.tweens.add({ targets: this.foe, scale: 0.1, alpha: 0, duration: 260 });
    this.cameras.main.flash(120, 255, 250, 210);
    jar.setAngle(0);
    await new Promise<void>((r) => this.tweens.add({ targets: jar, y: FOE.y - 6, duration: 300, ease: 'Bounce.Out', onComplete: () => r() }));
    for (let i = 0; i < Math.min(3, shakes); i++) {
      await this.wait(350);
      sfx.play('shake');
      await new Promise<void>((r) => this.tweens.add({ targets: jar, angle: { from: -18, to: 18 }, duration: 110, yoyo: true, onComplete: () => { jar.setAngle(0); r(); } }));
    }
    await this.wait(350);
    if (success) {
      sfx.play('catch');
      for (let i = 0; i < 8; i++) { const p = this.add.image(jar.x, jar.y - 4, 'sparkle'); const a = (i / 8) * Math.PI * 2; this.tweens.add({ targets: p, x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 14, alpha: 0, duration: 600, onComplete: () => p.destroy() }); }
      this.tweens.add({ targets: jar, y: jar.y - 3, duration: 200, yoyo: true, repeat: 1 });
    } else {
      jar.destroy();
      this.foe.setAlpha(1); this.foe.setScale(this.foeScale); this.popIn(this.foe);
    }
  }
}
