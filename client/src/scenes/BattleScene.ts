import Phaser from 'phaser';
import { TYPE_COLORS } from '@shared/data';
import type { BattleLog, BattleUpdate, CreatureView } from '@shared/types';
import type { Authority } from '../net/Authority';
import { BattleUI } from '../ui/BattleUI';
import { sfx } from '../audio/Sfx';

export interface BattleData { auth: Authority; update: BattleUpdate; onEnd: (ended: NonNullable<BattleUpdate['ended']>) => void }

const W = 240, H = 135;
const FOE = { x: 172, y: 88 }, ME = { x: 62, y: 124 };

/** 배틀 씬: 배경/루미 스프라이트 연출은 Phaser, 체력·메뉴·메시지는 DOM(BattleUI) */
export class BattleScene extends Phaser.Scene {
  private ui!: BattleUI;
  private data_!: BattleData;
  private foe!: Phaser.GameObjects.Sprite;
  private me!: Phaser.GameObjects.Sprite;
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
    this.foe = this.add.sprite(FOE.x + 140, FOE.y, `lumi_${v.foe.species}`, 0).setOrigin(0.5, 30 / 32).setScale(1.6);
    this.foe.play(`lumi_${v.foe.species}:down`);
    this.me = this.add.sprite(ME.x - 140, ME.y, `lumi_${v.me.species}`, 4).setOrigin(0.5, 30 / 32).setScale(2);
    this.me.play(`lumi_${v.me.species}:up`);

    let trainerSprite: Phaser.GameObjects.Sprite | undefined;
    if (v.trainer) {
      trainerSprite = this.add.sprite(FOE.x + 30, FOE.y, v.trainer.sprite, 0).setOrigin(0.5, 39 / 48).setScale(1.4);
      this.foe.setAlpha(0);
    }

    this.ui = new BattleUI();
    this.ui.setView(v);
    this.ui.hideSide('foe'); this.ui.hideSide('me');
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => { if ([' ', 'Enter', 'e', 'E', 'z', 'Z'].includes(e.key)) this.ui.advance(); });
    this.input.on('pointerdown', () => this.ui.advance());
    this.events.once('shutdown', () => { this.ui.destroy(); this.input.keyboard?.off('keydown'); this.input.off('pointerdown'); });

    // 등장 연출
    cam.flash(250, 255, 255, 255);
    this.tweens.add({ targets: this.foe, x: FOE.x, duration: 700, ease: 'Cubic.Out' });
    this.tweens.add({ targets: this.me, x: ME.x, duration: 700, ease: 'Cubic.Out' });
    this.time.delayedCall(720, async () => {
      if (trainerSprite) {
        await this.ui.say(data.update.log[0] && data.update.log[0].t === 'text' ? data.update.log[0].text : '', 600);
        this.tweens.add({ targets: trainerSprite, x: FOE.x + 140, alpha: 0, duration: 450 });
        this.foe.setAlpha(1); this.popIn(this.foe);
        await this.run(data.update.log.slice(1));
      } else await this.run(data.update.log);
      this.ui.setSide('foe', v.foe); this.ui.setSide('me', v.me);
      this.next(data.update);
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
    if (r.battle) { await this.run(r.battle.log); this.busy = false; this.next(r.battle); }
    else { this.busy = false; this.next({ view: this.ui.view!, log: [] }); }
  }

  private finish(ended: NonNullable<BattleUpdate['ended']>) {
    this.cameras.main.fadeOut(400, 10, 12, 20);
    this.cameras.main.once('camerafadeoutcomplete', () => { this.data_.onEnd(ended); this.scene.stop(); });
  }

  // ── 로그 재생 ──────────────────────────────────────
  private async run(log: BattleLog[]) {
    for (const e of log) await this.play(e);
  }
  private wait(ms: number) { return new Promise<void>((r) => this.time.delayedCall(ms, r)); }

  private async play(e: BattleLog) {
    switch (e.t) {
      case 'text':
        if (/올라갔다/.test(e.text)) sfx.play('buff'); else if (/떨어졌다/.test(e.text)) sfx.play('debuff'); else if (/레벨이/.test(e.text)) sfx.play('levelup'); else if (/승부에서 이겼다/.test(e.text)) sfx.play('win');
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

  private async send(side: 'me' | 'foe', v: CreatureView) {
    const s = side === 'me' ? this.me : this.foe;
    const pos = side === 'me' ? ME : FOE;
    sfx.play('send');
    s.setTexture(`lumi_${v.species}`, side === 'me' ? 4 : 0).setPosition(pos.x, pos.y).setAlpha(1);
    (side === 'me' ? this.meShadow : this.foeShadow).setAlpha(0.35);
    s.play(`lumi_${v.species}:${side === 'me' ? 'up' : 'down'}`);
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
      this.foe.setAlpha(1); this.foe.setScale(1.6); this.popIn(this.foe);
    }
  }
}
