import Phaser from 'phaser';
import { ITEMS, NPCS, SHOPS } from '@shared/data';
import { HOTBAR_SIZE } from '@shared/sim/FarmSimulation';
import { MapInfo, type TiledMap, type WarpDef } from '@shared/sim/MapInfo';
import { DIR_VEC, MAP_NAMES, type MapId } from '@shared/types';
import { DEPTH, TILE, pickZoom, type Manifest } from '../config';
import { Atmosphere } from '../fx/Atmosphere';
import { FarmRenderer } from '../farm/FarmRenderer';
import { Chicken, Duck } from '../entities/Animals';
import { facingFromVector, type Character } from '../entities/Character';
import { Npc } from '../entities/Npc';
import { Player } from '../entities/Player';
import { RemotePlayer } from '../entities/RemotePlayer';
import { Authority, LocalAuthority, NetworkAuthority, type AuthorityEvent } from '../net/Authority';
import { ui, setIconIds } from '../ui/UI';
import { World, type WorldObject } from '../world/World';

const FLAVOR: Record<string, string> = {
  well: '깊은 돌우물. 들여다보니 시원한 바람이 올라온다.',
  scarecrow: '허수아비 "감자". 오늘도 묵묵히 밭을 지키고 있다.',
  hay: '햇볕 냄새가 나는 푹신한 건초더미.',
  barrel: '빗물을 받아두는 나무통이다.',
  crate: '빈 나무 상자. 언젠가 수확물로 가득 차겠지.',
  oak: '듬직한 참나무. 바람에 잎이 사락사락 흔들린다.',
  oak_apple: '빨간 사과가 주렁주렁 열린 나무. 아직은 덜 익었다.',
  pine: '솔향기가 그윽한 소나무.',
  rock: '단단한 돌멩이. 곡괭이가 있으면 깰 수 있을 것 같다.',
  rock_big: '커다란 바위. 이끼가 소복하게 앉았다.',
  bush: '꽃이 핀 덤불.', bush_berry: '산딸기가 열린 덤불. 새들이 좋아할 것 같다.',
  lamp: '해가 지면 따뜻한 불빛을 밝히는 가로등.',
  stump: '오래된 그루터기. 도끼로 치울 수 있다.', log: '쓰러진 통나무. 도끼로 치울 수 있다.',
  planter: '마을 사람들이 정성껏 가꾼 꽃 화분.', cafe_table: '루나 카페의 야외 테이블. 커피 향이 은은하다.',
  stall: '광장의 무인 가판대.', stall_b: '광장의 무인 가판대.',
};
const LETTER = ['[별빛 마을 촌장의 편지]\n\n새 이웃이 된 것을 진심으로 환영합니다!', '이 농장은 오랫동안 비어 있었지만, 흙은 여전히 기름지답니다.\n괭이로 땅을 갈고, 씨앗을 심고, 매일 물을 주세요.', '농장 오른쪽 길을 따라가면 별빛 마을이 나와요.\n잡화점에서 씨앗을, 카페에서 간식을 살 수 있답니다.\n\n— 오 촌장 드림'];
const HOME_OWNER: Record<string, string> = { mayor: '오 촌장', luna: '루나', teo: '태오', sora: '소라', mio: '미오' };
const label = (t: string) => `<b class="text-[#ffe58a]">E</b> ${t}`;

interface SceneData { authority?: Authority; map?: MapId; spawn?: string }

export class FarmScene extends Phaser.Scene {
  private auth!: Authority;
  private mapId: MapId = 'farm';
  private world!: World;
  private atmo!: Atmosphere;
  private farm?: FarmRenderer;
  private player!: Player;
  private npcs: Npc[] = [];
  private chickens: Chicken[] = [];
  private ducks: Duck[] = [];
  private remotes = new Map<string, RemotePlayer>();
  private manifest!: Manifest;
  private cursor!: Phaser.GameObjects.Image;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private selected = 0;
  private playing = false;
  private warping = false;
  private sleepConfirmUntil = 0;
  private lastPointerMove = -99999;
  private zoom = 3;

  constructor() { super('Farm'); }

  create(data: SceneData) {
    this.manifest = this.cache.json.get('manifest') as Manifest;
    setIconIds(this.manifest.spritesheets.icons.ids ?? []);
    this.npcs = []; this.chickens = []; this.ducks = []; this.remotes.clear(); this.playing = false; this.warping = false;
    this.zoom = pickZoom(this.scale.height);

    const farmInfo = new MapInfo(this.cache.tilemap.get('farm').data as TiledMap);
    const farmSpawn = farmInfo.spawns.get('player') ?? { x: 368, y: 232 };
    this.auth = data?.authority ?? new LocalAuthority(farmInfo, { x: farmSpawn.x, y: farmSpawn.y + 5 });
    this.mapId = data?.map ?? this.auth.me.map ?? 'farm';

    this.world = new World(this, this.manifest, this.mapId);
    const info = this.world.info;
    for (const id of this.auth.removed) if (this.mapId === 'farm') this.world.removeObject(id, false);

    if (this.mapId === 'farm') {
      this.farm = new FarmRenderer(this, this.world, this.manifest);
      this.farm.load([...this.auth.tiles.values()]);
      for (const s of info.spawnList.filter((o) => o.name === 'chicken')) {
        const color = String(s.properties?.find((p) => p.name === 'color')?.value ?? 'white');
        this.chickens.push(new Chicken(this, `chicken_${color}`, s.x, s.y, this.world.grid));
      }
    } else {
      this.farm = undefined;
      const isWater = (px: number, py: number) => info.terrainAt(Math.floor(px / TILE), Math.floor(py / TILE)) === '2';
      for (const s of info.spawnList.filter((o) => o.name === 'duck')) this.ducks.push(new Duck(this, s.x, s.y, isWater));
    }

    // 플레이어 시작 위치: 워프 도착 지점 > (멀티) 서버 위치 > 맵 기본 스폰
    const sp = data?.spawn ? info.spawns.get(data.spawn) : undefined;
    const start = sp ? { x: sp.x, y: sp.y + 5 }
      : this.auth.online && this.auth.me.x ? { x: this.auth.me.x, y: this.auth.me.y }
      : { x: (info.spawns.get('player') ?? farmSpawn).x, y: (info.spawns.get('player') ?? farmSpawn).y + 5 };
    this.player = new Player(this, 'player', start.x, start.y, this.manifest.characters.player, this.world.grid);
    if (sp) this.player.play('idle', start.x < this.world.widthPx / 2 ? 'right' : 'left');
    this.cursor = this.add.image(0, 0, 'cursor').setOrigin(0).setDepth(DEPTH.cursor).setVisible(false);

    for (const def of Object.values(NPCS)) {
      if (!this.manifest.characters[def.sprite]) continue;
      const n = new Npc(this, def, this.manifest.characters[def.sprite], this.world.grid, info.spawns, this.zoom, this.mapId);
      n.resetForDay(this.auth.time.minutes);
      this.npcs.push(n);
    }
    this.atmo = new Atmosphere(this, this.world);
    this.atmo.setWeather(this.auth.time.weather);

    const cam = this.cameras.main;
    cam.setZoom(this.zoom).setRoundPixels(true).setBackgroundColor('#14201a');
    cam.setBounds(10, 10, this.world.widthPx - 12, this.world.heightPx - 12);
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize, this); this.input.keyboard?.off('keydown'); this.input.off('pointerdown'); this.input.off('pointermove'); this.input.off('wheel'); });

    this.setupInput();
    const unsubscribe = this.auth.on((e) => this.onAuthority(e));
    this.events.once('shutdown', unsubscribe);

    if (data?.authority) this.begin(!!data.spawn);
    else this.titleScreen();
  }

  private onResize(size: Phaser.Structs.Size) { this.zoom = pickZoom(size.height); this.cameras.main.setZoom(this.zoom); }

  // ── 타이틀 ──────────────────────────────────────────
  private titleScreen() {
    const cam = this.cameras.main;
    const points = [[370, 250], [560, 420], [200, 470], [700, 300], [380, 200]];
    let i = 0;
    const next = () => { if (this.playing) return; const [x, y] = points[i++ % points.length]; cam.pan(x, y, 7000, 'Sine.easeInOut', false, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => { if (p === 1) next(); }); };
    cam.centerOn(370, 250); next();
    const t = ui.title.show(
      () => this.begin(false),
      async (url, name) => {
        try {
          const auth = await NetworkAuthority.connect(url, name);
          t.close();
          this.scene.restart({ authority: auth, map: auth.me.map });
        } catch (e) { t.error(`${(e as Error).message} — 서버 실행: npm run server`); }
      },
    );
  }

  private begin(fromWarp: boolean) {
    this.playing = true;
    const cam = this.cameras.main;
    const firstTime = !fromWarp;
    ui.mountGame();
    if (fromWarp) { cam.centerOn(this.player.x, this.player.y); cam.startFollow(this.player.sprite, true, 0.14, 0.14, 0, 8); cam.fadeIn(450); }
    else {
      cam.stopFollow(); cam.panEffect.reset();
      cam.pan(this.player.x, this.player.y - 8, 900, 'Sine.easeInOut', true, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => { if (p === 1) cam.startFollow(this.player.sprite, true, 0.14, 0.14, 0, 8); });
    }
    ui.hud.time(this.auth.time); ui.hud.gold(this.auth.gold); ui.hud.energy(this.auth.me.energy, this.auth.me.maxEnergy);
    ui.hotbar.onSelect = (i) => this.select(i);
    ui.hotbar.render(this.auth.me.inventory, this.selected);
    ui.chat.onSend = (t) => this.auth.chat(t);
    if (this.auth.online) {
      ui.roster.mount();
      for (const p of this.auth.roster.values()) if (p.map === this.mapId) this.addRemote(p.id, p.name, p.x, p.y);
      this.renderRoster();
      if (firstTime) ui.chat.add('시스템', `${this.auth.me.name}(으)로 접속했어요. Enter 로 채팅할 수 있어요!`, '#7cc45a');
    }
    ui.banner.show(MAP_NAMES[this.mapId], this.mapId === 'town' ? '호숫가의 작은 마을' : '나의 농장');
    if (firstTime) ui.toast.push('별빛 농장에 오신 걸 환영해요! (H: 조작법)', 'heart');
  }

  // ── 입력 ────────────────────────────────────────────
  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,E,X,C,TAB') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (!this.playing || ui.chat.typing) return;
      if (e.key === 'Escape') { if (ui.shop.open) ui.shop.close(); else if (ui.dialogue.open) ui.dialogue.close(); return; }
      if (ui.shop.open) return;
      const idx = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].indexOf(e.key);
      if (idx >= 0) this.select(idx);
      if (e.key === 'h' || e.key === 'H') ui.help.toggle();
      if (e.key === 'Tab') { ui.roster.toggle(); e.preventDefault(); }
      if (e.key === 'Enter') { ui.chat.toggle(true); e.preventDefault(); }
      if ((e.key === 'n' || e.key === 'N') && !ui.dialogue.open) this.sleep(true);
      if (e.key === ' ' || e.key === 'c' || e.key === 'C') { if (ui.dialogue.open) ui.dialogue.advance(); else this.useItem(); }
      if (e.key === 'e' || e.key === 'E' || e.key === 'x' || e.key === 'X') { if (ui.dialogue.open) ui.dialogue.advance(); else this.interact(); }
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', () => { this.lastPointerMove = this.time.now; });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.playing || ui.shop.open) return;
      if (ui.dialogue.open) { ui.dialogue.advance(); return; }
      if (p.rightButtonDown()) this.interact(this.pointerCell(p)); else this.useItem(this.pointerCell(p));
    });
    this.input.on('wheel', (_p: unknown, _g: unknown, _dx: number, dy: number) => { if (this.playing && !ui.shop.open) this.select((this.selected + (dy > 0 ? 1 : -1) + HOTBAR_SIZE) % HOTBAR_SIZE); });
  }

  private select(i: number) { this.selected = i; ui.hotbar.render(this.auth.me.inventory, i); }

  private pointerCell(p: Phaser.Input.Pointer): [number, number] | undefined {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const cx = Math.floor(w.x / TILE), cy = Math.floor(w.y / TILE);
    const [px, py] = this.player.cell();
    return Math.abs(cx - px) <= 1 && Math.abs(cy - py) <= 1 && !(cx === px && cy === py) ? [cx, cy] : undefined;
  }
  private faceCell(c?: [number, number]): [number, number] {
    if (!c) return this.player.facingCell();
    const [px, py] = this.player.cell();
    this.player.dir = facingFromVector(c[0] - px, c[1] - py, this.player.dir);
    return c;
  }

  // ── 도구/아이템 사용 ────────────────────────────────
  private useItem(cell?: [number, number]) {
    if (this.player.busy || ui.dialogue.open || ui.shop.open) return;
    const slot = this.auth.me.inventory[this.selected];
    const item = slot?.itemId ? ITEMS[slot.itemId] : null;
    if (!item) return;
    const [tx, ty] = this.faceCell(cell);
    const dir = this.player.dir;
    if (item.type === 'food') {
      this.player.playOnce('interact', dir, () => { void this.auth.request({ kind: 'eat', slot: this.selected }); }, 1);
      this.auth.sendAnim('interact', dir);
      return;
    }
    if (this.mapId !== 'farm' && (item.type === 'tool' || item.type === 'seed')) {
      if (item.type === 'tool') { this.auth.sendAnim(item.tool === 'watering_can' ? 'water' : item.tool === 'axe' ? 'axe' : 'hoe', dir); this.player.playOnce(item.tool === 'watering_can' ? 'water' : item.tool === 'axe' ? 'axe' : 'hoe', dir); }
      ui.toast.push('마을에서는 농사를 지을 수 없어요. 농장으로 돌아가세요!', item.icon);
      return;
    }
    if (item.type === 'tool') {
      const anim = item.tool === 'watering_can' ? 'water' : item.tool === 'axe' ? 'axe' : 'hoe';
      this.auth.sendAnim(anim, dir);
      this.player.playOnce(anim, dir, async () => {
        if (item.tool === 'axe') {
          const o = this.world.objectAt(tx, ty);
          if (!o) return;
          const r = await this.auth.request({ kind: 'chop', objectId: o.id });
          if (r.ok) { this.world.shake(o, o.tall ? 1 : 2); this.chips(o); if (o.tall) this.leaves(o); }
        } else {
          const r = await this.auth.request({ kind: 'useTool', slot: this.selected, tx, ty });
          if (!r.ok && r.reason === 'cannot-till') this.thunk(tx, ty);
        }
      }, anim === 'water' ? 1 : 3);
    } else if (item.type === 'seed') {
      this.player.playOnce('interact', dir, async () => {
        const r = await this.auth.request({ kind: 'plant', slot: this.selected, tx, ty });
        if (!r.ok && r.reason === 'no-soil') ui.toast.push('먼저 괭이로 땅을 갈아야 해요.', 'hoe');
      }, 1);
      this.auth.sendAnim('interact', dir);
    } else if (item.type === 'crop') {
      const o = this.world.objectAt(tx, ty);
      if (o?.interact === 'ship') this.interact(cell);
      else ui.toast.push(`${item.name}: 농장 출하 상자에 넣으면 ${item.sellPrice}G!`, item.icon);
    }
  }

  // ── 상호작용 (대화/수확/출하/상점/조사) ──────────────
  private findInteraction(cell?: [number, number]): { label: string; run: () => void } | null {
    const [tx, ty] = cell ?? this.player.facingCell();
    const [dx, dy] = DIR_VEC[this.player.dir];
    const fx = this.player.x + dx * 12, fy = this.player.y - 2 + dy * 12;
    const npc = this.npcs.find((n) => n.state !== 'gone' && Math.hypot(n.x - fx, n.y - fy) < 15);
    if (npc) return { label: label(`${npc.def.name}와(과) 대화하기`), run: () => this.talk(npc) };
    const tile = this.farm?.get(tx, ty);
    if (tile?.crop && tile.crop.stage >= 4) return { label: label('수확하기'), run: () => this.harvest(tx, ty) };
    const o = this.world.objectAt(tx, ty);
    if (o) return this.objectInteraction(o);
    return null;
  }

  private say(pages: string[], name = '') { this.player.play('idle'); ui.dialogue.show({ name, pages }); }

  private objectInteraction(o: WorldObject): { label: string; run: () => void } | null {
    const it = o.interact ?? '';
    if (it.startsWith('shop:')) {
      const shop = SHOPS[it.slice(5)];
      return shop ? { label: label(`${shop.name} 이용하기`), run: () => this.openShop(shop.id) } : null;
    }
    if (it.startsWith('home:')) {
      const who = HOME_OWNER[it.slice(5)] ?? '누군가';
      return { label: label('문 두드리기'), run: () => this.say([`${who}의 집이다.\n똑똑... 지금은 아무도 문을 열어주지 않는다.`]) };
    }
    switch (it) {
      case 'ship': return { label: label('손에 든 작물 출하하기'), run: () => this.ship() };
      case 'mail': return { label: label('우편함 열기'), run: () => this.say(LETTER) };
      case 'sign': return { label: label('표지판 읽기'), run: () => this.say([o.text ?? '...']) };
      case 'door': return { label: label('집에 들어가서 자기'), run: () => this.sleep() };
      case 'board': return { label: label('마을 게시판 보기'), run: () => this.say(this.boardNotes()) };
      case 'hall': return { label: label('마을회관 살펴보기'), run: () => this.say(['별빛 마을회관. 커다란 시계가 째깍째깍 시간을 알려준다.', '"마을 축제 준비 위원 모집 중 — 관심 있는 분은 오 촌장에게"']) };
      case 'smithy': return { label: label('대장간 살펴보기'), run: () => this.say(['민수의 대장간. 화덕에서 뜨거운 열기가 뿜어져 나온다.', '"도구 강화 서비스 — 곧 시작합니다!"']) };
      case 'bench': return { label: label('벤치에 앉아 쉬기'), run: () => this.say(['벤치에 앉아 호수를 바라본다.\n오리들이 한가롭게 떠다닌다...']) };
    }
    if (FLAVOR[o.type]) return { label: label('살펴보기'), run: () => this.say([FLAVOR[o.type]]) };
    return null;
  }

  private boardNotes() {
    const t = this.auth.time;
    return [
      `[별빛 마을 게시판]\n오늘 날씨: ${t.weather === 'rain' ? '비 — 농장 작물에 물을 줄 필요가 없어요!' : '맑음 — 물 주는 것 잊지 마세요!'}`,
      '· 소라네 잡화점: 오전 9시 ~ 오후 5시 (씨앗 판매)\n· 루나 카페: 오전 7시 30분 ~ 오후 10시 (커피·빵·케이크)\n· 광장 가판대: 오전 9시 ~ 오후 6시',
      '· 태오의 거리 공연: 오전엔 호수 북쪽, 오후엔 광장 동쪽!\n· 분실물: 준이의 모자 (찾으면 준이에게)',
    ];
  }

  private openShop(id: string) {
    const shop = SHOPS[id];
    const owner = shop.owner ? this.npcs.find((n) => n.def.id === shop.owner) : undefined;
    if (shop.owner && (!owner || owner.state === 'gone' || Math.hypot(owner.x - this.player.x, owner.y - this.player.y) > 120)) {
      ui.toast.push(`${shop.name}: 주인이 자리에 없어요. (영업 ${Math.floor(shop.open / 100)}시~${Math.floor(shop.close / 100)}시)`, 'sun');
      return;
    }
    this.player.play('idle');
    ui.shop.show(shop, this.auth.gold, (itemId, qty) => { void this.auth.request({ kind: 'buy', shop: id, itemId, qty }); },
      owner ? { sprite: owner.def.sprite, name: owner.def.name } : undefined);
  }

  private interact(cell?: [number, number]) {
    if (this.player.busy || ui.dialogue.open || ui.shop.open) return;
    if (cell) this.faceCell(cell);
    this.findInteraction(cell)?.run();
  }

  private talk(npc: Npc) {
    const dir = facingFromVector(npc.x - this.player.x, npc.y - this.player.y, this.player.dir);
    this.player.play('idle', dir);
    const pages = npc.pickLines(this.auth.time.minutes, this.auth.time.weather);
    npc.beginTalk(this.player.x, this.player.y, this.auth.time.day);
    ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: npc.def.sprite, color: npc.def.color, pages, hearts: npc.hearts }, () => npc.endTalk());
  }

  private harvest(tx: number, ty: number) {
    const [px, py] = this.player.cell();
    const dir = facingFromVector(tx - px, ty - py, this.player.dir);
    this.auth.sendAnim('interact', dir);
    this.player.playOnce('interact', dir, () => { void this.auth.request({ kind: 'harvest', tx, ty }); }, 1);
  }

  private ship() {
    this.auth.sendAnim('interact', this.player.dir);
    this.player.playOnce('interact', this.player.dir, async () => {
      const r = await this.auth.request({ kind: 'ship', slot: this.selected });
      const bin = this.world.objects.find((o) => o.interact === 'ship');
      if (r.ok && bin) this.tweens.add({ targets: bin.sprite, scaleY: { from: 0.9, to: 1 }, scaleX: { from: 1.08, to: 1 }, duration: 260, ease: 'Back.Out' });
    }, 1);
  }

  private sleep(force = false) {
    if (!force && this.auth.time.minutes < 18 * 60 && performance.now() > this.sleepConfirmUntil) {
      this.sleepConfirmUntil = performance.now() + 4000;
      ui.toast.push('아직 해가 떠 있어요. 정말 자려면 한 번 더 상호작용하세요.', 'sun');
      return;
    }
    this.playing = false;
    const next = this.auth.time.day + 1;
    void ui.transition.run('Zzz...', `봄 ${next > 28 ? 1 : next}일차 아침이 밝아옵니다`, () => { void this.auth.request({ kind: 'sleep' }); });
  }

  // ── 맵 이동 (워프) ──────────────────────────────────
  private checkWarp() {
    if (this.warping || !this.playing) return;
    const w = this.world.info.warpAt(this.player.x, this.player.y - 3);
    if (w) this.warp(w);
  }
  private warp(w: WarpDef) {
    this.warping = true; this.playing = false;
    ui.shop.close(); ui.dialogue.close(false);
    const to = w.to as MapId;
    const target = new MapInfo(this.cache.tilemap.get(to).data as TiledMap).spawns.get(w.spawn) ?? { x: 40, y: 330 };
    this.cameras.main.fadeOut(350, 10, 14, 18);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.auth.changeMap(to, w.spawn, target.x, target.y + 5);
      this.scene.restart({ authority: this.auth, map: to, spawn: w.spawn } satisfies SceneData);
    });
  }

  // ── 권한자 이벤트 ───────────────────────────────────
  private onAuthority(e: AuthorityEvent) {
    switch (e.type) {
      case 'sim': {
        const ev = e.event;
        if (ev.type === 'tile') this.farm?.apply(ev.tile);
        else if (ev.type === 'time') { ui.hud.time(ev.time); if (ev.time.minutes === 18 * 60) ui.toast.push('해가 지고 있어요. 가로등이 켜집니다.', 'sun'); if (ev.time.minutes === 24 * 60) ui.toast.push('자정이 넘었어요! 곧 자러 가야 해요.', 'energy'); }
        else if (ev.type === 'gold') { ui.hud.gold(ev.gold); ui.shop.gold(ev.gold); if (ev.delta > 0) ui.toast.push(`+${ev.delta}G`, 'gold'); }
        else if (ev.type === 'player' && ev.id === this.auth.me.id) { ui.hud.energy(ev.energy, this.auth.me.maxEnergy); ui.hotbar.render(this.auth.me.inventory, this.selected); }
        else if (ev.type === 'objectRemoved') { if (this.mapId === 'farm') this.world.removeObject(ev.objectId); }
        else if (ev.type === 'toast' && (!ev.playerId || ev.playerId === this.auth.me.id)) ui.toast.push(ev.text, ev.icon);
        else if (ev.type === 'newDay') this.onNewDay(ev.shippedGold);
        break;
      }
      case 'players':
        for (const p of e.list) {
          if (p.map !== this.mapId) { this.removeRemote(p.id); continue; }
          const r = this.remotes.get(p.id) ?? this.addRemote(p.id, p.name, p.x, p.y);
          r.push(p.x, p.y, p.dir, p.anim);
        }
        for (const id of [...this.remotes.keys()]) if (!e.list.some((p) => p.id === id)) this.removeRemote(id);
        this.renderRoster();
        break;
      case 'joined': if (e.player.map === this.mapId) this.addRemote(e.player.id, e.player.name, e.player.x, e.player.y); this.renderRoster(); break;
      case 'moved': {
        const p = this.auth.roster.get(e.id);
        if (e.map === this.mapId && p) { this.addRemote(p.id, p.name, p.x, p.y); ui.toast.push(`${p.name}님이 ${MAP_NAMES[e.map]}에 왔어요.`, 'heart'); }
        else this.removeRemote(e.id);
        this.renderRoster();
        break;
      }
      case 'left': this.removeRemote(e.id); this.renderRoster(); break;
      case 'anim': this.remotes.get(e.id)?.playOnce(e.anim, e.dir, undefined, 99); break;
      case 'chat': {
        ui.chat.add(e.name, e.text, e.from === this.auth.me.id ? '#9bd165' : e.from === 'server' ? '#7cc45a' : '#ffe58a');
        const who: Character | undefined = e.from === this.auth.me.id ? this.player : this.remotes.get(e.from);
        who?.say(e.text, this.zoom);
        break;
      }
      case 'correct': this.player.setPosition(e.x, e.y); break;
      case 'disconnected': ui.toast.push('서버 연결이 끊어졌어요.', 'energy'); break;
    }
  }

  private renderRoster() {
    if (!this.auth.online) return;
    ui.roster.render([{ id: this.auth.me.id, name: this.auth.me.name, map: this.mapId, me: true }, ...[...this.auth.roster.values()].map((p) => ({ id: p.id, name: p.name, map: p.map }))]);
  }

  private addRemote(id: string, name: string, x: number, y: number) {
    const ex = this.remotes.get(id); if (ex) return ex;
    const r = new RemotePlayer(this, 'player', x, y, this.manifest.characters.player, id, name, this.zoom);
    r.sprite.setTint(0xf0e0ff);
    this.remotes.set(id, r);
    return r;
  }
  private removeRemote(id: string) { const r = this.remotes.get(id); if (r) { r.destroy(); this.remotes.delete(id); } }

  private onNewDay(shipped: number) {
    // 새 날은 언제나 농장 집 앞에서 시작
    this.auth.me.map = 'farm';
    if (this.mapId !== 'farm') {
      this.scene.restart({ authority: this.auth, map: 'farm', spawn: 'player' } satisfies SceneData);
      return;
    }
    const sp = this.world.info.spawns.get('player')!;
    this.player.setPosition(sp.x, sp.y + 5); this.player.play('idle', 'down');
    this.cameras.main.centerOn(this.player.x, this.player.y);
    for (const n of this.npcs) n.resetForDay(this.auth.time.minutes);
    this.atmo.setWeather(this.auth.time.weather);
    ui.hud.time(this.auth.time);
    this.time.delayedCall(1200, () => {
      this.playing = true;
      if (shipped) ui.toast.push(`어제 출하한 작물이 ${shipped}G에 팔렸어요!`, 'gold');
      if (this.auth.time.weather === 'rain') ui.toast.push('비가 와요. 오늘은 물을 안 줘도 돼요!', 'rain');
    });
  }

  // ── 연출 ────────────────────────────────────────────
  private chips(o: WorldObject) {
    for (let i = 0; i < 7; i++) {
      const c = this.add.rectangle(o.sprite.x + Phaser.Math.Between(-6, 6), o.sprite.y - 8, 2, 2, Phaser.Utils.Array.GetRandom([0xc99260, 0x8c5a33, 0xe0b080])).setDepth(o.sprite.y + 1);
      this.tweens.add({ targets: c, x: c.x + Phaser.Math.Between(-14, 14), y: { value: c.y + Phaser.Math.Between(2, 8), ease: 'Bounce.Out' }, alpha: 0, duration: 600, onComplete: () => c.destroy() });
    }
  }
  private leaves(o: WorldObject) {
    for (let i = 0; i < 5; i++) {
      const l = this.add.rectangle(o.sprite.x + Phaser.Math.Between(-16, 16), o.sprite.y - Phaser.Math.Between(30, 50), 3, 2, Phaser.Utils.Array.GetRandom([0x5dab4a, 0x86c95b, 0x3f8a3e])).setDepth(o.sprite.y + 2);
      this.tweens.add({ targets: l, y: l.y + Phaser.Math.Between(26, 40), x: l.x + Phaser.Math.Between(-12, 12), angle: 360, alpha: 0, duration: 1400 + i * 120, ease: 'Sine.In', onComplete: () => l.destroy() });
    }
  }
  private thunk(tx: number, ty: number) {
    const s = this.add.circle(tx * TILE + 8, ty * TILE + 10, 3, 0xffffff, 0.6).setDepth(ty * TILE + 20);
    this.tweens.add({ targets: s, scale: 2.2, alpha: 0, duration: 260, onComplete: () => s.destroy() });
  }

  // ── 메인 루프 ───────────────────────────────────────
  update(_t: number, dt: number) {
    dt = Math.min(dt, 50);
    // 싱글플레이는 타이틀 화면/화면 전환 중에는 시간이 흐르지 않음 (멀티는 서버 시계)
    if (this.playing || this.auth.online) this.auth.update(dt);
    const k = this.keys;
    const canMove = this.playing && !ui.dialogue.open && !ui.chat.typing && !ui.shop.open;
    const vx = canMove ? (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) : 0;
    const vy = canMove ? (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) : 0;
    const run = k.SHIFT.isDown;
    this.player.move(dt, { vx, vy, run }, this.npcs.filter((n) => n.state !== 'gone' && n.sprite.visible));
    this.player.update();
    if (this.playing) this.auth.sendMove(this.player.x, this.player.y, this.player.dir, this.player.anim);
    if (this.player.moving) this.farm?.brush(this.player.x, this.player.y);
    this.checkWarp();

    const minutes = this.auth.minutesSmooth;
    for (const n of this.npcs) n.updateNpc(dt, minutes, this.auth.time.day, this.player, this.playing);
    const running = run && this.player.moving;
    for (const c of this.chickens) c.update(dt, { x: this.player.x, y: this.player.y, running });
    for (const d of this.ducks) d.update(dt, this.player);
    for (const r of this.remotes.values()) r.tick();
    this.world.update(dt, this.player);
    this.atmo.update(dt, minutes);
    this.updateCursor();
  }

  private updateCursor() {
    if (!this.playing || ui.dialogue.open || ui.shop.open) { this.cursor.setVisible(false); ui.hint.set(null); return; }
    const p = this.input.activePointer;
    const cell = this.time.now - this.lastPointerMove < 2500 ? this.pointerCell(p) : undefined;
    const [tx, ty] = cell ?? this.player.facingCell();
    const it = this.auth.me.inventory[this.selected]?.itemId;
    const type = it ? ITEMS[it].type : null;
    const show = this.mapId === 'farm' && (type === 'tool' || type === 'seed');
    this.cursor.setVisible(show).setPosition(tx * TILE - 1, ty * TILE - 1).setAlpha(0.65 + Math.sin(this.time.now / 180) * 0.25);
    ui.hint.set(this.player.busy ? null : this.findInteraction(cell)?.label ?? null);
  }
}
