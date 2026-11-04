import Phaser from 'phaser';
import { ITEMS, NPCS, SHOPS, SPECIES, TRAINERS } from '@shared/data';
import { HOTBAR_SIZE } from '@shared/sim/FarmSimulation';
import { MapInfo, type TiledMap, type WarpDef } from '@shared/sim/MapInfo';
import { BADGE_GATES, DIR_VEC, INTERIOR_OF, MAP_IDS, MAP_META, MAP_NAMES, roomOf, type BattleUpdate, type MapId } from '@shared/types';
import type { RosterEntry } from '@shared/protocol';
import { DEPTH, TILE, pickZoom, type Manifest } from '../config';
import { Atmosphere } from '../fx/Atmosphere';
import { FarmRenderer } from '../farm/FarmRenderer';
import { Chicken, Duck } from '../entities/Animals';
import { facingFromVector, type Character } from '../entities/Character';
import { Npc } from '../entities/Npc';
import { Partner } from '../entities/Partner';
import { Trainer } from '../entities/Trainer';
import type { BattleData } from './BattleScene';
import { Player } from '../entities/Player';
import { RemotePlayer } from '../entities/RemotePlayer';
import { Authority, LocalAuthority, NetworkAuthority, type AuthorityEvent } from '../net/Authority';
import { ui, setIconIds } from '../ui/UI';
import type { TitleHandle } from '../ui/UI';
import { sfx } from '../audio/Sfx';
import { StoryDirector } from '../story/StoryDirector';
import { STORY } from '@shared/story';
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
  oak_autumn: '붉게 물든 단풍나무. 사계절 내내 잎이 지지 않는다고 한다.', pine_snow: '눈을 소복이 뒤집어쓴 전나무.',
  palm: '바닷바람에 흔들리는 야자수.', cactus: '가시가 따끔한 선인장. 꼭대기에 분홍 꽃이 피었다.', dead_tree: '잎이 다 떨어진 앙상한 나무.',
  reeds: '바람에 서걱거리는 갈대.', ruin_pillar: '이끼 낀 오래된 돌기둥. 알 수 없는 문양이 새겨져 있다.', ruin_broken: '부서진 돌기둥의 밑동.',
  cave_mouth: '서늘한 바람이 불어 나오는 동굴 입구.', portal: '일렁이는 보랏빛 틈. 저 너머는 위아래가 뒤집혀 있다…', stairs_up: '위로 이어지는 돌계단.',
};
const LETTER = ['[별빛 마을 이장님의 편지]\n\n새 이웃이 된 것을 진심으로 환영합니다!\n(우편함에서 친구에게 농장·집 초대장을 보낼 수 있어요)', '이 농장은 오랫동안 비어 있었지만, 흙은 여전히 기름지답니다.\n괭이로 땅을 갈고, 씨앗을 심고, 매일 물을 주세요.', '농장 오른쪽 길을 따라가면 별빛 마을이 나와요.\n잡화점에서 씨앗을, 카페에서 간식을 살 수 있답니다.\n\n— 오 이장 드림'];
const HOME_OWNER: Record<string, string> = { mayor: '오 이장', luna: '루나', teo: '태오', sora: '소라', mio: '미오', villager: '구름', leader: '세나' };
const label = (t: string) => `<b class="text-[#ffe58a]">E</b> ${t}`;

interface SceneData { authority?: Authority; map?: MapId; spawn?: string; pos?: { x: number; y: number }; fromRoom?: boolean }
/** 이웃집 주인 이름 (실내 맵은 여러 집이 같은 배치를 쓰므로 들어갈 때 기억) */
let houseOwner = '';

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
  private partner?: Partner;
  private trainers: Trainer[] = [];
  private remotePartners = new Map<string, Partner>();
  private forageSprites = new Map<string, Phaser.GameObjects.Image>();
  private lastCell = '';
  private battling = false;
  private fishing?: { phase: 'cast' | 'wait' | 'bite'; t: number; tx: number; ty: number; bobber: Phaser.GameObjects.Arc; window: number };
  private blades?: Phaser.GameObjects.Image;
  private dishSprite?: Phaser.GameObjects.Image;
  private pendingRoom = false;
  private lastTabDown = 0;
  private story!: StoryDirector;
  private stepT = 0;
  /** 현재 선택된 인벤토리 칸 (핫바 줄 반영) */
  private get slot() { return ui.hotbar.row * 12 + this.selected; }

  constructor() { super('Farm'); }

  create(data: SceneData) {
    this.manifest = this.cache.json.get('manifest') as Manifest;
    setIconIds(this.manifest.spritesheets.icons.ids ?? []);
    this.npcs = []; this.chickens = []; this.ducks = []; this.remotes.clear(); this.playing = false; this.warping = false;
    this.trainers = []; this.remotePartners.clear(); this.forageSprites.clear(); this.partner = undefined; this.fishing = undefined; this.battling = false; this.lastCell = '';
    this.zoom = pickZoom(this.scale.height);

    this.dishSprite = undefined; this.pendingRoom = false;
    const farmInfo = new MapInfo(this.cache.tilemap.get('farm').data as TiledMap);
    const farmSpawn = farmInfo.spawns.get('player') ?? { x: 368, y: 232 };
    if (!data?.authority) {
      const maps = Object.fromEntries(MAP_IDS.map((id) => [id, id === 'farm' ? farmInfo : new MapInfo(this.cache.tilemap.get(id).data as TiledMap)])) as Record<MapId, MapInfo>;
      this.auth = new LocalAuthority(maps);
    } else this.auth = data.authority;
    this.mapId = data?.map ?? this.auth.me.map ?? 'farm';

    this.world = new World(this, this.manifest, this.mapId);
    const info = this.world.info;
    for (const key of this.auth.removed) { const [m, id] = key.split(':'); if (m === this.mapId) this.world.removeObject(Number(id), false); }

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
    const start = data?.pos ?? (sp ? { x: sp.x, y: sp.y + 5 }
      : this.auth.me.x ? { x: this.auth.me.x, y: this.auth.me.y }
      : { x: (info.spawns.get('player') ?? farmSpawn).x, y: (info.spawns.get('player') ?? farmSpawn).y + 5 });
    const look = this.manifest.characters[this.auth.me.look] ? this.auth.me.look : 'm1';
    this.player = new Player(this, look, start.x, start.y, this.manifest.characters[look], this.world.grid);
    if (data?.fromRoom) this.player.play('idle', this.world.interior ? 'up' : 'down');
    if (sp) this.player.play('idle', start.x < this.world.widthPx / 2 ? 'right' : 'left');
    this.story = new StoryDirector({
      scene: this, player: this.player, world: this.world, auth: this.auth, manifest: this.manifest, zoom: this.zoom, mapId: this.mapId,
      lock: () => { this.playing = false; this.player.play('idle', this.player.dir); }, unlock: () => { this.playing = true; },
      startBattle: (u, after) => this.startBattle(u, after),
    });
    this.cursor = this.add.image(0, 0, 'cursor').setOrigin(0).setDepth(DEPTH.cursor).setVisible(false);
    // 파트너 루미
    const lead = this.auth.me.party[0];
    if (lead) this.partner = new Partner(this, lead.species, start.x, start.y + 10);
    // 트레이너 (스폰 이름 trainer:<id>) + 바람골 관장
    for (const s of info.spawnList.filter((o) => o.name.startsWith('trainer:'))) {
      const def = TRAINERS[s.name.slice(8)]; if (!def) continue;
      const face = String(s.properties?.find((p) => p.name === 'face')?.value ?? 'down') as 'down';
      this.trainers.push(new Trainer(this, def, this.manifest.characters[def.sprite], s.x, s.y + 5, face, this.world.grid, this.zoom));
    }
    this.renderForage();
    const hub = info.spawns.get('windmill_hub');
    if (hub) this.blades = this.add.image(hub.x, hub.y, 'windmill_blades').setDepth(hub.y + 200);

    for (const def of Object.values(NPCS)) {
      if (!this.manifest.characters[def.sprite]) continue;
      if (def.gen && def.schedule[0]?.map !== this.mapId) continue;   // 생성된 주민은 자기 마을에만
      const n = new Npc(this, def, this.manifest.characters[def.sprite], this.world.grid, info.spawns, this.zoom, this.mapId);
      n.resetForDay(this.auth.time.minutes);
      this.npcs.push(n);
    }
    this.atmo = new Atmosphere(this, this.world);
    this.atmo.setWeather(this.auth.time.weather);

    const cam = this.cameras.main;
    cam.setZoom(this.zoom).setRoundPixels(true).setBackgroundColor(this.world.interior || this.world.cave ? '#0d0a0c' : '#14201a');
    this.fitCamera();
    this.renderDish();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => { this.scale.off('resize', this.onResize, this); this.input.keyboard?.off('keydown'); this.input.off('pointerdown'); this.input.off('pointermove'); this.input.off('wheel'); });

    this.setupInput();
    const unsubscribe = this.auth.on((e) => this.onAuthority(e));
    this.events.once('shutdown', unsubscribe);

    if (data?.authority) this.begin(!!(data.spawn || data.fromRoom));
    else this.titleScreen();
  }

  private onResize(size: Phaser.Structs.Size) { this.zoom = pickZoom(size.height); this.cameras.main.setZoom(this.zoom); this.fitCamera(); }
  /** 바깥 맵은 가장자리까지, 작은 실내는 화면 가운데에 */
  private fitCamera() {
    const cam = this.cameras.main, W = this.world.widthPx, H = this.world.heightPx;
    if (!this.world.interior) { cam.setBounds(10, 10, W - 12, H - 12); return; }
    const vw = this.scale.width / this.zoom, vh = this.scale.height / this.zoom;
    const bw = Math.max(W, vw), bh = Math.max(H + 24, vh);
    cam.setBounds((W - bw) / 2, (H - bh) / 2 + 8, bw, bh);
  }

  // ── 타이틀 ──────────────────────────────────────────
  private titleScreen() {
    const cam = this.cameras.main;
    const points = [[370, 250], [560, 420], [200, 470], [700, 300], [380, 200]];
    let i = 0;
    const next = () => { if (this.playing) return; const [x, y] = points[i++ % points.length]; cam.pan(x, y, 7000, 'Sine.easeInOut', false, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => { if (p === 1) next(); }); };
    cam.centerOn(370, 250); next();
    const dev = new URLSearchParams(location.search).get('dev');
    type Fb = typeof import('../net/firebase');
    let fb: Fb | null = null;
    const loadFb = async () => (fb ??= await import('../net/firebase'));
    const t: TitleHandle & { url: () => string } = ui.title.show({
      onLogout: async () => { try { await (await loadFb()).logout(); t.setUser(null); } catch (e) { t.error((e as Error).message); } },
      onGoogle: async (mode) => {
        try {
          let cred: { token?: string; dev?: string; mode?: 'public' | 'friends' };
          if (dev) cred = { dev };   // 테스트: 서버를 DEV_AUTH=1 로 켜고 ?dev=이름
          else {
            t.busy('구글 로그인 중...');
            const f = await loadFb();
            const user = (await f.currentUser()) ?? (await f.signInWithGoogle());
            t.setUser(user.displayName ?? user.email ?? '농부');
            cred = { token: await f.idToken(user) };
          }
          t.busy('서버에 접속 중...');
          const auth = await NetworkAuthority.connect(t.url(), { ...cred, mode });
          t.close();
          this.withCharacter(auth, () => this.scene.restart({ authority: auth, map: auth.me.map, pos: { x: auth.me.x, y: auth.me.y } } satisfies SceneData));
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          // 혼자하기: 로그인/서버가 안 되면 이 브라우저에서 혼자 진행 (자동 저장)
          if (mode === 'friends' && !/popup-closed|cancelled/.test(msg)) { t.close(); ui.toast.push('서버에 연결할 수 없어 이 브라우저에서 혼자 진행해요 (자동 저장)', 'heart'); this.startSolo(); return; }
          t.error(/popup-closed|cancelled/.test(msg) ? '로그인 창이 닫혔어요.' : /unauthorized-domain/.test(msg) ? 'Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 이 주소를 추가해 주세요.' : /configuration-not-found|operation-not-allowed/.test(msg) ? 'Firebase 콘솔에서 Google 로그인 제공업체를 사용 설정해 주세요.' : `${msg}`);
        }
      },
    });
    if (dev) t.setUser(`${dev} (테스트)`);
    else void loadFb().then((f) => f.currentUser()).then((u) => t.setUser(u ? (u.displayName ?? u.email ?? '농부') : null)).catch(() => t.setUser(null));
  }

  /** 혼자하기(오프라인): 외형을 고르고 시작 — 진행은 이 브라우저에 저장 */
  private startSolo() {
    const a = this.auth;
    this.withCharacter(a, () => this.scene.restart({ authority: a, map: a.me.map, pos: { x: a.me.x, y: a.me.y } } satisfies SceneData));
  }

  /** 캐릭터가 아직 없으면 만들기 화면 → setLook → 다음 */
  private withCharacter(auth: Authority, next: () => void) {
    if (auth.me.look) { next(); return; }
    ui.creator.show({
      title: '나의 주인공 만들기', sub: '오늘은 열다섯 번째 생일 — 별빛 마을의 떳떳한 일원이 되는 날! 모습을 골라 주세요. (나중에 내 집 옷장에서 바꿀 수 있어요)',
      name: auth.me.name, askName: true,
      onDone: async (look, name) => { await auth.request({ kind: 'setLook', look, name }); next(); },
    });
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
      this.renderRoster();
      if (firstTime) {
        ui.chat.add('시스템', `${this.auth.me.name}(으)로 접속했어요. Enter 채팅 · Tab 감정표현 · 우편함에서 친구 초대!`, '#7cc45a');
        ui.toast.push(`진행상황 저장: ${this.auth.storageKind}`, 'heart');
      }
    }
    const [title, sub] = this.placeName();
    ui.banner.show(title, sub);
    if (firstTime) ui.toast.push('별빛 농장에 오신 걸 환영해요! (H: 조작법 · Esc: 메뉴)', 'heart');
    this.time.delayedCall(fromWarp ? 350 : 900, () => this.story.begin());
  }

  // ── 휴대폰 지도 / 일시정지 메뉴 ─────────────────────
  private openMap() {
    const me = this.auth.me;
    if (me.story < STORY.PHONE) { sfx.play('error'); ui.toast.push('휴대폰이 없어요… 집에 두고 왔나?', 'heart'); return; }
    if (me.story < STORY.HALL) { sfx.play('error'); ui.toast.push('휴대폰에 아직 지도 앱이 없어요. 이장님을 만나 보자!', 'heart'); return; }
    // 실내면 그 건물이 있는 바깥 맵 위치로
    const meta = MAP_META[me.map];
    const parent = me.map === 'home' ? 'farm' : meta?.interior && !meta.x ? (me.inst.split(':')[0] || me.ret?.map || 'town') : me.map;
    const owner = (me.map === 'farm' || me.map === 'home') && me.inst !== me.id ? ` (${this.auth.roster.get(me.inst)?.name ?? '친구'}님네)` : '';
    ui.worldMap.toggle(parent, owner, me.visited ?? []);
  }
  private openMenu() {
    const local = this.auth instanceof LocalAuthority;
    ui.menu.show({
      storage: this.auth.storageKind, canSave: local,
      onSave: () => { if (this.auth instanceof LocalAuthority) { this.auth.save(); sfx.play('confirm'); ui.toast.push('이 브라우저에 저장했어요!', 'heart'); } },
      onReset: async () => {
        this.playing = false;
        await this.auth.request({ kind: 'resetSave' });
        this.auth.close();
        void ui.transition.run('처음부터', '새로운 이야기를 시작합니다', () => location.reload());
      },
      onTitle: () => { if (this.auth instanceof LocalAuthority) this.auth.save(); this.auth.close(); location.reload(); },
    });
  }

  /** 지금 있는 곳 이름 (친구 농장/집이면 주인 이름) */
  private placeName(): [string, string] {
    const me = this.auth.me;
    const owner = me.inst && me.inst !== me.id ? this.auth.roster.get(me.inst)?.name : undefined;
    if (this.mapId === 'farm') return owner ? [`${owner}님의 농장`, '친구 농장에 놀러 왔어요'] : [MAP_NAMES.farm, '나의 농장'];
    if (this.mapId === 'home') return owner ? [`${owner}님의 집`, '식탁에 음식을 차려 같이 먹어요'] : ['나의 집', '옷장 · 침대 · 식탁'];
    if (this.mapId.startsWith('in_house') && houseOwner) return [`${houseOwner}의 집`, ''];
    return [this.world.title || MAP_NAMES[this.mapId], this.mapId === 'town' ? '호숫가의 작은 마을' : ''];
  }

  // ── 입력 ────────────────────────────────────────────
  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,E,X,C,TAB') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (e: KeyboardEvent) => {
      if (!this.playing || ui.chat.typing) return;
      if (this.battling) return;
      if (e.key === 'Tab') { e.preventDefault(); if (!ui.emoteWheel.open && !ui.dialogue.open && !ui.creator.open) { const p = this.input.activePointer; const inside = p.x > 0 && p.y > 0; ui.emoteWheel.show(inside ? Math.min(Math.max(p.x, 170), this.scale.width - 170) : this.scale.width / 2, inside ? Math.min(Math.max(p.y, 170), this.scale.height - 170) : this.scale.height / 2, (id) => this.emote(id)); this.lastTabDown = this.time.now; } return; }
      if (e.key === 'Escape') {
        if (ui.menu.open) ui.menu.close(); else if (ui.worldMap.open) ui.worldMap.close(); else if (ui.emoteWheel.open) ui.emoteWheel.close(); else if (ui.mailbox.open) ui.mailbox.close(); else if (ui.shop.open) ui.shop.close(); else if (ui.party.open) ui.party.close(); else if (ui.dialogue.open) ui.dialogue.close(); else this.openMenu();
        return;
      }
      if (ui.menu.open) return;
      if (e.key === 'm' || e.key === 'M') { this.openMap(); return; }
      if (ui.worldMap.open) return;
      if (ui.shop.open || ui.mailbox.open || ui.creator.open) return;
      if (this.fishing && [' ', 'e', 'E', 'c', 'C', 'x', 'X'].includes(e.key)) { this.reel(); return; }
      if (e.key === 'p' || e.key === 'P') { ui.party.toggle(this.auth.me, (i) => void this.auth.request({ kind: 'setPartner', index: i })); return; }
      if (e.key === 'q' || e.key === 'Q') { ui.hotbar.row = 1 - ui.hotbar.row; this.select(this.selected); return; }
      const idx = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='].indexOf(e.key);
      if (idx >= 0) this.select(idx);
      if (e.key === 'h' || e.key === 'H') ui.help.toggle();
      if (e.key === 'l' || e.key === 'L') ui.roster.toggle();
      if (e.key === 'Enter') { ui.chat.toggle(true); e.preventDefault(); }
      if ((e.key === 'n' || e.key === 'N') && !ui.dialogue.open) this.sleep(true);
      if (e.key === ' ' || e.key === 'c' || e.key === 'C') { if (ui.dialogue.open) ui.dialogue.advance(); else this.useItem(); }
      if (e.key === 'e' || e.key === 'E' || e.key === 'x' || e.key === 'X') { if (ui.dialogue.open) ui.dialogue.advance(); else this.interact(); }
    });
    // Tab 을 떼면 마우스가 가리키는 감정표현 (짧게 톡 누르면 휠이 열린 채로 남아 클릭으로 고름)
    kb.on('keyup', (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ui.emoteWheel.open) return;
      if (this.time.now - this.lastTabDown < 220 && ui.emoteWheel.sel < 0) return;
      const id = ui.emoteWheel.release();
      if (id !== null) this.emote(id);
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.lastPointerMove = this.time.now; if (ui.emoteWheel.open) ui.emoteWheel.move(p.x, p.y); });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.playing || ui.shop.open || this.battling || ui.emoteWheel.open || ui.mailbox.open || ui.creator.open) return;
      if (this.fishing) { this.reel(); return; }
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
    const slot = this.auth.me.inventory[this.slot];
    const item = slot?.itemId ? ITEMS[slot.itemId] : null;
    if (!item) return;
    const [tx, ty] = this.faceCell(cell);
    const dir = this.player.dir;
    if (item.type === 'food') {
      this.player.playOnce('interact', dir, () => { void this.auth.request({ kind: 'eat', slot: this.slot }).then((r) => r.ok && sfx.play('eat')); }, 1);
      this.auth.sendAnim('interact', dir);
      return;
    }
    if (this.mapId !== 'farm' && (item.type === 'tool' || item.type === 'seed') && item.tool !== 'rod' && item.tool !== 'pickaxe') {
      if (item.type === 'tool') { this.auth.sendAnim(item.tool === 'watering_can' ? 'water' : item.tool === 'axe' ? 'axe' : 'hoe', dir); this.player.playOnce(item.tool === 'watering_can' ? 'water' : item.tool === 'axe' ? 'axe' : 'hoe', dir); }
      ui.toast.push('마을에서는 농사를 지을 수 없어요. 농장으로 돌아가세요!', item.icon);
      return;
    }
    if (item.tool === 'rod') { this.castLine(tx, ty); return; }
    if (item.tool === 'pickaxe') {
      this.auth.sendAnim('pick', dir);
      this.player.playOnce('pick', dir, async () => {
        sfx.play('pick');
        const o = this.world.objectAt(tx, ty);
        if (!o || !this.world.mineKind(o)) { this.thunk(tx, ty); return; }
        const r = await this.auth.request({ kind: 'mine', objectId: o.id });
        if (r.ok) { this.chips(o); this.partnerHelpFx(); } else this.world.shake(o, 1);
      }, 3);
      return;
    }
    if (item.type === 'tool') {
      const anim = item.tool === 'watering_can' ? 'water' : item.tool === 'axe' ? 'axe' : 'hoe';
      this.auth.sendAnim(anim, dir);
      this.player.playOnce(anim, dir, async () => {
        sfx.play(anim);
        if (item.tool === 'axe') {
          const o = this.world.objectAt(tx, ty);
          if (!o) return;
          const r = await this.auth.request({ kind: 'chop', objectId: o.id });
          if (r.ok) { this.world.shake(o, o.tall ? 1 : 2); this.chips(o); if (o.tall) this.leaves(o); }
        } else {
          const r = await this.auth.request({ kind: 'useTool', slot: this.slot, tx, ty });
          if (!r.ok && r.reason === 'cannot-till') this.thunk(tx, ty);
        }
      }, anim === 'water' ? 1 : 3);
    } else if (item.type === 'seed') {
      this.player.playOnce('interact', dir, async () => {
        const r = await this.auth.request({ kind: 'plant', slot: this.slot, tx, ty });
        if (r.ok) sfx.play('plant');
        if (!r.ok && r.reason === 'no-soil') ui.toast.push('먼저 괭이로 땅을 갈아야 해요.', 'hoe');
      }, 1);
      this.auth.sendAnim('interact', dir);
    } else if (item.type === 'crop' || item.type === 'material') {
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
    const sa = this.story?.interaction(fx, fy); if (sa) return sa;
    const tr = this.trainers.find((t) => !t.approaching && Math.hypot(t.x - fx, t.y - fy) < 15);
    if (tr) return { label: label(`${tr.def.title} ${tr.def.name}에게 말 걸기`), run: () => this.talkTrainer(tr) };
    for (const f of this.auth.forage) if (f.map === this.mapId && Math.hypot(f.x - fx, f.y - 4 - fy) < 14) return { label: label(`${ITEMS[f.item].name} 채집하기`), run: () => this.pickForage(f.key) };
    const npc = this.npcs.find((n) => n.state !== 'gone' && Math.hypot(n.x - fx, n.y - fy) < 15);
    if (npc) return { label: label(`${npc.def.name}와(과) 대화하기`), run: () => this.talk(npc) };
    const tile = this.farm?.get(tx, ty);
    if (tile?.crop && tile.crop.stage >= 4) return { label: label('수확하기'), run: () => this.harvest(tx, ty) };
    const o = this.world.objectAt(tx, ty);
    if (o) return this.objectInteraction(o);
    return null;
  }

  private say(pages: string[], name = '') {
    this.player.play('idle');
    const SPR: Record<string, string> = { '한별 박사': 'professor', '다온': 'nurse' };
    ui.dialogue.show({ name, pages, sprite: SPR[name] });
  }

  private objectInteraction(o: WorldObject): { label: string; run: () => void } | null {
    const it = o.interact ?? '';
    // 건물: 문 앞에서 E → 실내로
    const inside = o.interior ?? INTERIOR_OF[o.type];
    if (inside && !this.world.interior) {
      const owner = it.startsWith('home:') ? HOME_OWNER[it.slice(5)] ?? '이웃' : '';
      const me = this.auth.me;
      const name = o.type === 'house' ? (me.inst && me.inst !== me.id ? `${this.auth.roster.get(me.inst)?.name ?? '친구'}님의 집` : '내 집') : owner ? `${owner}의 집` : MAP_NAMES[inside];
      const extra = it === 'hall' && !me.party.length ? ' — 파트너 루미 받기' : '';
      return { label: label(`${name} 들어가기${extra}`), run: () => this.enterBuilding(o, owner) };
    }
    if (it.startsWith('shop:')) {
      const shop = SHOPS[it.slice(5)];
      return shop ? { label: label(`${shop.name} 이용하기`), run: () => this.openShop(shop.id) } : null;
    }
    const ownHome = this.mapId === 'home' && this.auth.me.inst === this.auth.me.id;
    switch (it) {
      case 'ship': return { label: label('손에 든 작물 출하하기'), run: () => this.ship() };
      case 'mail': return { label: label('우편함 열기 — 편지 · 친구 초대'), run: () => this.openMailbox() };
      case 'sign': return { label: label('표지판 읽기'), run: () => this.say([o.text ?? '...']) };
      case 'board': return { label: label('마을 게시판 보기'), run: () => this.say(this.boardNotes()) };
      case 'center': return { label: label('루미 쉼터에서 루미 회복하기'), run: () => this.healAt('다온', '루미들이 모두 건강해졌어요! 또 오세요♪') };
      case 'windmill': return { label: label('맷돌 살펴보기'), run: () => this.say(['풍차 날개가 돌면 이 커다란 맷돌도 함께 돌아간다.', '고소한 밀가루 냄새가 난다.']) };
      case 'smithy': return { label: label('대장간 살펴보기'), run: () => this.say(['민수의 대장간. 화덕에서 뜨거운 열기가 뿜어져 나온다.', '"도구 강화 서비스 — 곧 시작합니다!"']) };
      case 'bed': return ownHome ? { label: label('침대에서 자기 (하루 마치기)'), run: () => this.sleep() } : { label: label('살펴보기'), run: () => this.say(['친구의 침대다. 푹신해 보인다.']) };
      case 'nbed': return { label: label('살펴보기'), run: () => this.say([`${houseOwner || '이웃'}의 침대다. 남의 침대에 누울 순 없지.`]) };
      case 'wardrobe': return ownHome ? { label: label('옷장 — 외형 바꾸기'), run: () => this.openWardrobe() } : { label: label('살펴보기'), run: () => this.say(['친구의 옷장이다. 멋진 옷이 가득하다.']) };
      case 'kitchen': return { label: label('부엌 살펴보기'), run: () => this.say(['깔끔한 부엌. 수확한 작물이나 카페 음식을 들고 식탁에서 E 를 누르면 같이 먹을 수 있어요.']) };
      case 'dtable': return this.tableInteraction();
      case 'piano': return { label: label('피아노 치기'), run: () => { this.emote(4); this.say(['♪ 도레미파솔~ 서툴지만 즐거운 소리가 난다.']); } };
      case 'starter_table': return { label: label('살펴보기'), run: () => this.say([this.auth.me.party.length ? '루미 구슬이 놓여 있던 받침대. 박사님이 새 아이들을 돌보고 있다.' : '세 개의 루미 구슬이 빛나고 있다. 한별 박사님에게 말을 걸어 보자!']) };
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
    if (npc.def.id === 'hanbyeol') { npc.beginTalk(this.player.x, this.player.y, this.auth.time.day); this.professor(() => npc.endTalk()); return; }
    if (npc.def.id === 'daon') { this.healAt('다온', '루미들이 모두 건강해졌어요! 또 오세요♪'); return; }
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
      const r = await this.auth.request({ kind: 'ship', slot: this.slot });
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
    sfx.play('sleep');
    const next = this.auth.time.day + 1;
    const waitingOthers = this.auth.online && this.auth.roster.size > 0;
    void ui.transition.run('Zzz...', waitingOthers ? '친구들이 모두 잠들면 아침이 밝아와요' : `봄 ${next > 28 ? 1 : next}일차 아침이 밝아옵니다`, () => {
      void this.auth.request({ kind: 'sleep' }).then((r) => { if (r.reason === 'waiting' && this.scene.isActive()) this.playing = true; });
    });
  }

  // ── 맵 이동 (워프) ──────────────────────────────────
  private checkWarp() {
    if (this.warping || !this.playing) return;
    const w = this.world.info.warpAt(this.player.x, this.player.y - 3);
    if (w) this.warp(w);
  }
  private warp(w: WarpDef) {
    if (w.to === 'route1' && (!this.auth.me.party.length || this.auth.me.story < STORY.DONE)) {
      this.player.setPosition(this.player.x - 10, this.player.y);
      sfx.play('error');
      this.say([this.auth.me.story < STORY.MEET ? '저 너머는 1번 도로… 오늘은 먼저 마을에서 할 일이 있다!' : '아직은 갈 수 없어. 마을회관에서 이장님을 만나고 루미를 받아야 해!']);
      return;
    }
    const gate = BADGE_GATES[w.to] ?? 0;
    if (gate > this.auth.me.badges.length) {
      const [dx, dy] = DIR_VEC[this.player.dir]; this.player.setPosition(this.player.x - dx * 14, this.player.y - dy * 14);
      sfx.play('error');
      this.say([`보이지 않는 힘이 앞을 가로막는다…`, `(배지를 ${gate}개 모으면 지나갈 수 있을 것 같다. 지금 ${this.auth.me.badges.length}개)`]);
      return;
    }
    const index = this.world.info.warps.indexOf(w);
    this.moveRoom(() => this.auth.request({ kind: 'warp', index }), () => this.player.setPosition(this.player.x, this.player.y - (w.to === '@exit' ? 8 : 0)));
  }
  /** 건물 문 앞에서 E → 실내 */
  private enterBuilding(o: WorldObject, owner: string) {
    houseOwner = owner;
    this.player.play('idle', 'up');
    this.moveRoom(() => this.auth.request({ kind: 'enter', objectId: o.id }));
  }
  /** 방 이동 요청: 화면을 어둡게 → 권한자에게 요청 → 'room' 이벤트가 오면 씬 재시작 */
  private moveRoom(req: () => Promise<{ ok: boolean; reason?: string }>, onFail?: () => void) {
    if (this.warping) return;
    this.warping = true; this.playing = false;
    sfx.play('door');
    ui.shop.close(); ui.dialogue.close(false); ui.mailbox.close();
    this.cancelFishing();
    this.cameras.main.fadeOut(300, 10, 14, 18);
    this.cameras.main.once('camerafadeoutcomplete', async () => {
      const r = await req();
      if (!r.ok && this.scene.isActive()) {
        this.warping = false; this.playing = true; onFail?.();
        this.cameras.main.fadeIn(250);
        if (r.reason === 'far') ui.toast.push('문 앞에 바짝 서서 눌러 주세요.', 'heart');
        else if (r.reason === 'need-partner') ui.toast.push('먼저 마을회관에서 파트너 루미를 받아 오세요!', 'lumi');
        else if (r.reason?.startsWith('need-badges:')) ui.toast.push(`배지 ${r.reason.slice(12)}개를 모은 트레이너만 들어갈 수 있어요. (지금 ${this.auth.me.badges.length}개)`, 'badge_wind');
      }
    });
  }
  /** 권한자가 나를 다른 방으로 옮김 (워프·실내·초대·새 날·배틀 패배) */
  private goRoom() {
    if (this.battling) { this.pendingRoom = true; return; }
    const me = this.auth.me;
    if (this.auth instanceof NetworkAuthority) this.auth.holdMoves();
    const restart = () => this.scene.restart({ authority: this.auth, map: me.map, pos: { x: me.x, y: me.y }, fromRoom: true } satisfies SceneData);
    if (this.warping) { restart(); return; }
    this.warping = true; this.playing = false;
    this.cameras.main.fadeOut(250, 10, 14, 18);
    this.cameras.main.once('camerafadeoutcomplete', restart);
  }

  // ── 권한자 이벤트 ───────────────────────────────────
  private onAuthority(e: AuthorityEvent) {
    const me = this.auth.me;
    switch (e.type) {
      case 'sim': {
        const ev = e.event;
        if (ev.type === 'tile') { if (this.mapId === 'farm' && ev.owner === this.auth.farmOwner) this.farm?.apply(ev.tile); }
        else if (ev.type === 'time') { ui.hud.time(ev.time); if (ev.time.minutes === 18 * 60) ui.toast.push('해가 지고 있어요. 가로등이 켜집니다.', 'sun'); if (ev.time.minutes === 24 * 60) ui.toast.push('자정이 넘었어요! 곧 자러 가야 해요.', 'energy'); }
        else if (ev.type === 'gold') { if (ev.playerId === me.id) { ui.hud.gold(ev.gold); ui.shop.gold(ev.gold); if (ev.delta > 0) ui.toast.push(`+${ev.delta}G`, 'gold'); } }
        else if (ev.type === 'player' && ev.id === me.id) { ui.hud.energy(ev.energy, me.maxEnergy); ui.hotbar.render(me.inventory, this.selected); }
        else if (ev.type === 'objectRemoved') { const [m, id] = ev.key.split(':'); if (m === this.mapId && (!ev.owner || ev.owner === this.auth.farmOwner)) this.world.removeObject(Number(id)); }
        else if (ev.type === 'objectRestored') { for (const k of ev.keys) { const [m, id] = k.split(':'); if (m === this.mapId) this.world.restoreObject(Number(id)); } }
        else if (ev.type === 'forage') this.renderForage();
        else if (ev.type === 'party' && ev.id === me.id) this.syncPartner();
        else if (ev.type === 'help' && ev.playerId === me.id) { this.partner?.cheer(4); ui.toast.push(ev.text, 'lumi'); }
        else if (ev.type === 'toast' && (!ev.playerId || ev.playerId === me.id) && (!ev.room || ev.room === this.auth.room)) ui.toast.push(ev.text, ev.icon);
        else if (ev.type === 'newDay') { ui.hud.time(ev.time); if (ev.time.weather === 'rain') ui.toast.push('비가 와요. 오늘은 물을 안 줘도 돼요!', 'rain'); }
        else if (ev.type === 'room' && ev.playerId === me.id) this.goRoom();
        else if (ev.type === 'look') {
          if (ev.id === me.id) { if (this.playing) this.goRoomSame(); }
          else { const r = this.remotes.get(ev.id); if (r) { const p = { x: r.x, y: r.y }; this.removeRemote(ev.id); this.addRemote(ev.id, ev.name, ev.look, p.x, p.y); } this.renderRoster(); }
        }
        else if (ev.type === 'emote' && ev.room === this.auth.room) { const who: Character | undefined = ev.playerId === me.id ? this.player : this.remotes.get(ev.playerId); who?.showEmote(ev.emote, 2200); }
        else if (ev.type === 'dish' && ev.room === this.auth.room) this.renderDish();
        else if (ev.type === 'invite' && ev.to === me.id) ui.invitePrompt.show(ev.fromName, ev.where, () => this.acceptInvite(ev.from));
        else if (ev.type === 'sleep') ui.toast.push(`친구들이 모두 잠들면 다음 날이 시작돼요 (${ev.ready}/${ev.total}명 잠듦)`, 'energy');
        break;
      }
      case 'players': {
        // 서버는 같은 방(room)에 있는 사람만 보내줌: 내 농장에는 초대한 친구만, 마을부터는 모두
        for (const p of e.list) {
          if (roomOf(p.map, p.inst, p.world) !== this.auth.room) { this.removeRemote(p.id); continue; }
          let r = this.remotes.get(p.id);
          if (r && r.look !== p.look) { this.removeRemote(p.id); r = undefined; }
          if (!r) { r = this.addRemote(p.id, p.name, p.look, p.x, p.y); if (this.playing) ui.toast.push(`${p.name}님이 왔어요!`, 'heart'); }
          r.push(p.x, p.y, p.dir, p.anim);
          let rp = this.remotePartners.get(p.id);
          if (p.partner && !rp) { rp = new Partner(this, p.partner, p.x, p.y + 10); this.remotePartners.set(p.id, rp); }
          if (p.partner && rp) rp.setSpecies(p.partner);
          if (p.battling && !r.emote) r.showEmote(1, 0); else if (!p.battling && r.emote && r.battleEmote) r.hideEmote();
          r.battleEmote = !!p.battling;
        }
        for (const id of [...this.remotes.keys()]) if (!e.list.some((p) => p.id === id)) this.removeRemote(id);
        break;
      }
      case 'roster': this.renderRoster(); break;
      case 'left': this.removeRemote(e.id); this.renderRoster(); break;
      case 'anim': this.remotes.get(e.id)?.playOnce(e.anim, e.dir, undefined, 99); break;
      case 'chat': {
        ui.chat.add(e.name, e.text, e.from === me.id ? '#9bd165' : e.from === 'server' ? '#7cc45a' : '#ffe58a');
        const who: Character | undefined = e.from === me.id ? this.player : this.remotes.get(e.from);
        who?.say(e.text, this.zoom);
        break;
      }
      case 'correct': this.player.setPosition(e.x, e.y); break;
      case 'disconnected':
        this.playing = false;
        ui.dialogue.show({ name: '시스템', pages: [`${e.message ?? '서버 연결이 끊어졌어요.'}\n진행상황은 서버에 저장되어 있어요. 확인을 누르면 다시 시작합니다.`] }, () => location.reload());
        break;
    }
  }
  /** 같은 방에서 다시 그리기 (외형 변경 후) */
  private goRoomSame() { this.warping = false; this.goRoom(); }

  private whereText(r: { id: string; map: MapId; inst: string }) {
    if (r.map === 'farm' || r.map === 'home') {
      const owner = r.inst === r.id ? '자기' : `${r.inst === this.auth.me.id ? this.auth.me.name : this.auth.roster.get(r.inst)?.name ?? '친구'}님`;
      return `${owner} ${r.map === 'farm' ? '농장' : '집'}`;
    }
    return MAP_NAMES[r.map] ?? r.map;
  }
  private renderRoster() {
    if (!this.auth.online) return;
    const me = this.auth.me;
    ui.roster.render([{ id: me.id, name: me.name, where: this.whereText(me), me: true }, ...[...this.auth.roster.values()].map((p: RosterEntry) => ({ id: p.id, name: p.name, where: this.whereText(p) }))]);
  }

  private addRemote(id: string, name: string, look: string, x: number, y: number) {
    const ex = this.remotes.get(id); if (ex) return ex;
    const sheet = this.manifest.characters[look] ? look : 'm1';
    const r = new RemotePlayer(this, sheet, x, y, this.manifest.characters[sheet], id, name, this.zoom);
    r.look = look;
    this.remotes.set(id, r);
    return r;
  }
  private removeRemote(id: string) { const r = this.remotes.get(id); if (r) { r.destroy(); this.remotes.delete(id); } const rp = this.remotePartners.get(id); if (rp) { rp.destroy(); this.remotePartners.delete(id); } }

  // ── 소셜: 감정표현 · 우편함 초대 · 옷장 · 식탁 ─────────
  private emote(id: number) {
    sfx.play('emote');
    void this.auth.request({ kind: 'emote', id });
  }
  private openMailbox() {
    const me = this.auth.me;
    this.player.play('idle');
    ui.mailbox.show({
      online: this.auth.online, isOwner: this.auth.farmOwner === me.id,
      players: [...this.auth.roster.values()].map((p) => ({ id: p.id, name: p.name, look: p.look, where: this.whereText(p) })),
      invites: [...this.auth.invites.values()].filter((i) => Date.now() - i.t < 5 * 60_000),
      onLetter: () => this.say(LETTER),
      onInvite: (id, where) => void this.auth.request({ kind: 'invite', to: id, where }),
      onAccept: (from) => this.acceptInvite(from),
      onGoHome: () => this.moveRoom(() => this.auth.request({ kind: 'goHome' })),
    });
  }
  private acceptInvite(from: string) {
    this.auth.invites.delete(from);
    if (this.battling) { ui.toast.push('배틀이 끝난 뒤에 우편함에서 수락할 수 있어요.', 'heart'); return; }
    this.moveRoom(async () => { const r = await this.auth.request({ kind: 'acceptInvite', from }); if (!r.ok) ui.toast.push('초대장이 만료됐어요.', 'heart'); return r; });
  }
  private openWardrobe() {
    const me = this.auth.me;
    this.player.play('idle');
    this.playing = false;
    ui.creator.show({
      title: '옷장', sub: '오늘은 어떤 모습으로 지내 볼까요?', name: me.name, look: me.look, askName: true,
      onDone: async (look, name) => { const r = await this.auth.request({ kind: 'setLook', look, name }); if (!r.ok) { this.playing = true; ui.toast.push('내 집 옷장에서만 바꿀 수 있어요.', 'heart'); } },
      onCancel: () => { this.playing = true; },
    });
  }
  private tableInteraction(): { label: string; run: () => void } {
    const d = this.auth.dish;
    if (d) return { label: label(`${ITEMS[d.item].name} 같이 먹기 (${d.servings}인분 남음)`), run: () => { this.auth.sendAnim('interact', this.player.dir); this.player.playOnce('interact', this.player.dir, () => void this.auth.request({ kind: 'eatDish' }), 1); } };
    const held = this.auth.me.inventory[this.slot]?.itemId;
    const item = held ? ITEMS[held] : null;
    if (item && (item.type === 'food' || item.type === 'crop')) return { label: label(`${item.name} 식탁에 차리기 (4인분)`), run: () => { this.auth.sendAnim('interact', this.player.dir); this.player.playOnce('interact', this.player.dir, () => void this.auth.request({ kind: 'serve', slot: this.slot }), 1); } };
    return { label: label('식탁'), run: () => this.say(['작물이나 카페 음식을 손에 들고 식탁에서 E 를 누르면 차릴 수 있어요.', '차린 음식은 4인분! 집에 초대한 친구와 같이 먹으면 에너지가 회복돼요.']) };
  }
  private renderDish() {
    this.dishSprite?.destroy(); this.dishSprite = undefined;
    const d = this.auth.dish; if (!d || this.mapId !== 'home') return;
    const t = this.world.objects.find((o) => o.type === 'dtable'); if (!t) return;
    const icons = this.manifest.spritesheets.icons.ids ?? [];
    this.dishSprite = this.add.image(t.sprite.x, t.sprite.y - 22, 'icons', Math.max(0, icons.indexOf(ITEMS[d.item].icon))).setDepth(t.sprite.y + 1);
    this.tweens.add({ targets: this.dishSprite, y: this.dishSprite.y - 1, duration: 600, yoyo: true, repeat: -1 });
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
    const canMove = this.playing && !ui.dialogue.open && !ui.chat.typing && !ui.shop.open && !this.battling && !this.fishing && !ui.party.open;
    const vx = canMove ? (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) : 0;
    const vy = canMove ? (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) : 0;
    const run = k.SHIFT.isDown;
    this.player.move(dt, { vx, vy, run }, this.npcs.filter((n) => n.state !== 'gone' && n.sprite.visible));
    this.player.update();
    if (this.playing) this.auth.sendMove(this.player.x, this.player.y, this.player.dir, this.player.anim);
    if (this.player.moving) this.farm?.brush(this.player.x, this.player.y);
    this.checkWarp();
    if (this.playing && !this.battling) { this.checkEncounter(); this.checkTrainers(); }
    this.partner?.update(dt, this.player, this.player.moving);
    this.story.update(dt);
    if (this.player.moving) { this.stepT -= dt; if (this.stepT <= 0) { sfx.play('step'); this.stepT = this.keys.SHIFT.isDown ? 170 : 270; } } else this.stepT = 0;
    for (const [id, rp] of this.remotePartners) { const r = this.remotes.get(id); if (r) rp.update(dt, r, true); }
    for (const t of this.trainers) t.tick(dt, this.player);
    this.tickFishing(dt);
    if (this.blades) this.blades.rotation += dt * 0.0006;
    for (const sp of this.forageSprites.values()) sp.y = (sp.getData('y0') as number) + Math.sin(this.time.now / 300 + sp.x) * 1.2;

    const minutes = this.auth.minutesSmooth;
    for (const n of this.npcs) n.updateNpc(dt, minutes, this.auth.time.day, this.player, this.playing);
    const running = run && this.player.moving;
    for (const c of this.chickens) c.update(dt, { x: this.player.x, y: this.player.y, running });
    for (const d of this.ducks) d.update(dt, this.player);
    for (const r of this.remotes.values()) r.tick();
    this.world.update(dt, this.player);
    this.atmo.follow(this.player.x, this.player.y);
    this.atmo.update(dt, minutes);
    this.updateCursor();
  }

  private updateCursor() {
    if (!this.playing || ui.dialogue.open || ui.shop.open || this.battling || this.fishing) { this.cursor.setVisible(false); ui.hint.set(null); return; }
    const p = this.input.activePointer;
    const cell = this.time.now - this.lastPointerMove < 2500 ? this.pointerCell(p) : undefined;
    const [tx, ty] = cell ?? this.player.facingCell();
    const it = this.auth.me.inventory[this.slot]?.itemId;
    const type = it ? ITEMS[it].type : null;
    const tool = it ? ITEMS[it].tool : undefined;
    const show = (this.mapId === 'farm' && (type === 'tool' || type === 'seed')) || tool === 'pickaxe' || tool === 'rod';
    this.cursor.setVisible(show).setPosition(tx * TILE - 1, ty * TILE - 1).setAlpha(0.65 + Math.sin(this.time.now / 180) * 0.25);
    ui.hint.set(this.player.busy ? null : this.findInteraction(cell)?.label ?? null);
  }

  // ── 루미 모험 ──────────────────────────────────────
  private syncPartner() {
    const lead = this.auth.me.party[0];
    if (!lead) { this.partner?.destroy(); this.partner = undefined; return; }
    if (!this.partner) { this.partner = new Partner(this, lead.species, this.player.x, this.player.y + 10); this.partner.poof(); }
    else this.partner.setSpecies(lead.species);
  }
  private partnerHelpFx() { const h = SPECIES[this.auth.me.party[0]?.species]?.helps; if (h === 'mine' || h === 'fish' || h === 'forage') this.partner?.cheer(4); }

  /** 마을회관 연구실의 한별 박사: 처음이면 스타터 선택, 이후엔 회복 */
  /** 마을회관 연구실의 한별 박사: 회복 담당 (루미는 이장님이 맡겨 줌) */
  private professor(done: () => void) {
    done();
    if (!this.auth.me.party.length) { this.say(['오, 자네가 오늘 열다섯 살이 된 친구로군. 루미는 이장님께서 직접 맡겨 주신다네.', '이장님은 이 방 한가운데 계실 걸세!'], '한별 박사'); return; }
    this.healAt('한별 박사', '연구실에서 루미들을 돌봐 줬다네. 모두 기운이 넘치는군!');
  }

  private healAt(who: string, line: string) {
    if (!this.auth.me.party.length) { this.say(['돌봐 줄 루미가 아직 없어요.'], who); return; }
    void this.auth.request({ kind: 'heal' }).then(() => {
      this.partner?.cheer(2);
      this.cameras.main.flash(300, 255, 240, 250);
      sfx.play('heal');
      this.say([line], who);
    });
  }

  private talkTrainer(t: Trainer) {
    t.faceTo(this.player.x, this.player.y);
    if (this.auth.me.defeated.includes(t.def.id)) { this.say(t.def.after.map((l) => `${t.def.name}: "${l}"`), t.def.name); return; }
    if (!this.auth.me.party.some((c) => c.hp > 0)) { this.say([`${t.def.name}: "싸울 수 있는 루미가 없잖아! 먼저 쉬게 해 줘."`]); return; }
    this.challenge(t);
  }

  private checkTrainers() {
    if (!this.auth.me.party.some((c) => c.hp > 0) || ui.dialogue.open) return;
    for (const t of this.trainers) {
      if (t.approaching || this.auth.me.defeated.includes(t.def.id)) continue;
      if (t.sees(this.player.x, this.player.y)) {
        this.playing = false;
        this.player.play('idle', facingFromVector(t.x - this.player.x, t.y - this.player.y, this.player.dir));
        t.approach(this.player.x, this.player.y, () => this.challenge(t));
        return;
      }
    }
  }

  private challenge(t: Trainer) {
    this.playing = false;
    ui.dialogue.show({ name: `${t.def.title} ${t.def.name}`, sprite: t.def.sprite, color: '#c8453c', pages: t.def.intro }, async () => {
      const r = await this.auth.request({ kind: 'trainer', trainerId: t.def.id });
      if (r.battle) this.startBattle(r.battle, () => { if (t.def.sight > 0) t.returnHome(); });
      else {
        this.playing = true; t.returnHome();
        if (r.reason?.startsWith('requires:')) { const need = TRAINERS[r.reason.slice(9)]; ui.toast.push(need ? `먼저 ${need.title} ${need.name}을(를) 이겨야 해요.` : '아직 도전할 수 없어요.'); }
      }
    });
  }

  private checkEncounter() {
    const [cx, cy] = this.player.cell();
    const key = `${cx},${cy}`;
    if (key === this.lastCell) return;
    this.lastCell = key;
    if (!this.auth.me.party.some((c) => c.hp > 0)) return;
    if (this.world.cave) { if (this.world.info.warpAt(this.player.x, this.player.y) || Math.random() > 0.055) return; }
    else { if (!this.world.grassCells.has(key)) return; if (Math.random() > 0.11) return; }
    this.playing = false;
    void this.auth.request({ kind: 'encounter' }).then((r) => { if (r.battle) this.startBattle(r.battle); else this.playing = true; });
  }

  private startBattle(update: BattleUpdate, after?: () => void) {
    this.battling = true; this.playing = false;
    this.cancelFishing();
    ui.dialogue.close(false); ui.shop.close(); ui.party.close();
    this.auth.sendAnim('interact', this.player.dir);
    // 화면 깜빡임 전환 → 배틀 씬
    const cam = this.cameras.main;
    cam.flash(160, 255, 255, 255);
    sfx.play('encounter');
    this.time.delayedCall(180, () => cam.flash(160, 255, 255, 255));
    this.time.delayedCall(420, () => {
      const data: BattleData = {
        auth: this.auth, update,
        onEnd: (ended) => {
          this.battling = false;
          this.scene.resume();
          if (this.pendingRoom) { this.pendingRoom = false; this.goRoom(); return; }
          this.cameras.main.fadeIn(350);
          this.playing = true;
          after?.();
          this.syncPartner();
          if (ended === 'caught') ui.toast.push('새 루미가 친구가 됐어요! (P: 나의 루미)', 'lumi');
        },
      };
      this.scene.launch('Battle', data);
      this.scene.pause();
    });
  }

  // 낚시: 던지기 → 기다림 → 입질(!) → 제때 누르기
  private castLine(tx: number, ty: number) {
    if (this.world.info.terrainAt(tx, ty) !== '2') {
      // 바라보는 방향 2칸 앞까지 물 찾기
      const [dx, dy] = DIR_VEC[this.player.dir]; const [px, py] = this.player.cell();
      if (this.world.info.terrainAt(px + dx * 2, py + dy * 2) === '2') { tx = px + dx * 2; ty = py + dy * 2; }
      else { ui.toast.push('물을 바라보고 낚싯대를 사용하세요.', 'rod'); return; }
    }
    this.auth.sendAnim('fish', this.player.dir);
    sfx.play('splash');
    this.player.busy = true;
    this.player.play('fish', this.player.dir, false);
    const bobber = this.add.circle(this.player.x, this.player.y - 20, 2, 0xff5a5a).setStrokeStyle(1, 0xffffff).setDepth(ty * TILE + 20);
    const fishHelp = SPECIES[this.auth.me.party[0]?.species]?.helps === 'fish';
    this.fishing = { phase: 'cast', t: 0, tx, ty, bobber, window: fishHelp ? 1400 : 950 };
    this.tweens.add({ targets: bobber, x: tx * TILE + 8, y: ty * TILE + 9, duration: 450, ease: 'Quad.Out', onComplete: () => {
      if (!this.fishing) return;
      this.fishing.phase = 'wait'; this.fishing.t = (1500 + Math.random() * 2500) * (fishHelp ? 0.6 : 1);
      ui.toast.push('찌가 흔들리면 Space / E / 클릭!', 'rod');
    } });
  }
  private tickFishing(dt: number) {
    const f = this.fishing; if (!f || f.phase === 'cast') return;
    f.t -= dt;
    if (f.phase === 'wait') {
      f.bobber.y = f.ty * TILE + 9 + Math.sin(this.time.now / 300) * 0.6;
      if (f.t <= 0) { sfx.play('bite'); f.phase = 'bite'; f.t = f.window; this.player.showEmote(1, 0); ui.fishing.show('!'); this.tweens.add({ targets: f.bobber, y: f.bobber.y + 2, duration: 80, yoyo: true, repeat: 3 }); }
    } else if (f.phase === 'bite' && f.t <= 0) {
      ui.toast.push('앗, 놓쳤다...', 'rod'); this.cancelFishing();
    }
  }
  private async reel() {
    const f = this.fishing; if (!f) return;
    if (f.phase !== 'bite') { ui.toast.push('너무 일찍 당겼어요!', 'rod'); this.cancelFishing(); return; }
    const { tx, ty } = f;
    this.cancelFishing();
    this.player.playOnce('interact', this.player.dir, undefined, 99);
    const r = await this.auth.request({ kind: 'fish', tx, ty });
    if (r.battle) this.startBattle(r.battle);
    else if (r.ok) { this.partnerHelpFx(); const s = this.add.image(tx * TILE + 8, ty * TILE + 8, 'sparkle').setDepth(ty * TILE + 30); this.tweens.add({ targets: s, y: s.y - 20, alpha: 0, duration: 700, onComplete: () => s.destroy() }); }
  }
  private cancelFishing() {
    if (!this.fishing) return;
    this.fishing.bobber.destroy(); this.fishing = undefined;
    this.player.busy = false; this.player.hideEmote(); this.player.play('idle', this.player.dir); ui.fishing.hide();
  }

  // 채집물
  private renderForage() {
    for (const sp of this.forageSprites.values()) sp.destroy();
    this.forageSprites.clear();
    const icons = this.manifest.spritesheets.icons.ids ?? [];
    for (const f of this.auth.forage) {
      if (f.map !== this.mapId) continue;
      const sp = this.add.image(f.x, f.y - 2, 'icons', Math.max(0, icons.indexOf(ITEMS[f.item].icon))).setScale(0.85).setOrigin(0.5, 1).setDepth(f.y);
      sp.setData('y0', f.y - 2);
      this.forageSprites.set(f.key, sp);
    }
  }
  private pickForage(key: string) {
    this.player.playOnce('interact', this.player.dir, async () => {
      const r = await this.auth.request({ kind: 'forage', key });
      if (r.ok) this.partnerHelpFx();
    }, 1);
  }
}
