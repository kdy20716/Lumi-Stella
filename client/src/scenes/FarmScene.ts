import Phaser from 'phaser';
import { ITEMS, NPCS, QUESTS, SHOPS, SKILLS, SPECIES, TRAINERS, martFor, nextEvent } from '@shared/data';
import { MapInfo, type TiledMap, type WarpDef } from '@shared/sim/MapInfo';
import { BADGE_GATES, BOND_ASK_AT, BOND_MAX, DIR_VEC, INTERIOR_OF, MAP_IDS, MAP_META, MAP_NAMES, roomOf, type BattleUpdate, type MapId } from '@shared/types';
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
import { touch } from '../ui/Touch';
import { ui, setIconIds } from '../ui/UI';
import { phone } from '../ui/Phone';
import type { TitleHandle } from '../ui/UI';
import { sfx } from '../audio/Sfx';
import { battleTrack, music, trackFor } from '../audio/Music';
import { StoryDirector } from '../story/StoryDirector';
import { EventDirector, VILLAIN_CAST } from '../story/EventDirector';
import { captureMemory } from '../story/Memories';
import { STORY } from '@shared/story';
import { LEGEND, MYTH, STELLA, dexComplete } from '@shared/sim/FarmSimulation';
import { playFlute } from '../ui/Flute';
import { stormFx, questClear } from '../fx/Storm';
import { World, type WorldObject } from '../world/World';
import { Stage3D } from '../three/Stage3D';
import ILLUST_SPEC from '@shared/data/illust.json';

/** 제작법을 가르쳐 주는 공방 NPC: 새로 배우면 하는 말 */
const TEACHERS: Record<string, { name: string; teach: string[] }> = {
  hana: { name: '하나', teach: ['루미풀 씨앗이야. 밭에 심고 매일 물만 주면 돼.', '다 자라면 작업대에서 회복약으로 달여 봐. 내가 처음 배운 것도 그거였어!'] },
  minsu: { name: '민수', teach: ['배지를 땄다고? ...좋아, 약속대로 새 볼 만드는 법을 알려 주지.', '공방 화덕이나 네 집 작업대에서 만들 수 있다. 재료 아끼지 말고.'] },
  hanbyeol: { name: '한별 박사', teach: ['오오, 배지가 늘었군! 그럼 다음 단계 조합법을 알려 주겠네.', '연구소 조합기나 집 작업대에서 만들어 보게. 루미가 훨씬 든든해질 걸세.'] },
};

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
const LETTER = ['[별빛 마을 이장님의 편지]\n\n열다섯 번째 생일을 진심으로 축하한다!\n이제 너도 어엿한 루미 트레이너란다.\n(우편함에서 친구에게 농장·집 초대장을 보낼 수 있어요)', '별빛 마을 트레이너의 전통을 잊지 말거라.\n밭에서 루미풀을 길러 회복약을, 바위에서 광석을 캐 루미볼을 —\n집 작업대에서 직접 만들어 길을 떠나는 것이란다.', '배지를 모을수록 민수의 볼 공방과 한별 박사의 연구소에서\n더 좋은 제작법을 배울 수 있을 게다.\n\n— 오 이장 드림'];
const HOME_OWNER: Record<string, string> = { mayor: '오 이장', luna: '루나', teo: '태오', sora: '소라', mio: '미오', villager: '구름', leader: '세나' };
const label = (t: string) => `<b class="text-[#ffe58a]">E</b> ${t}`;

interface SceneData { authority?: Authority; map?: MapId; spawn?: string; pos?: { x: number; y: number }; fromRoom?: boolean }
/** 이웃집 주인 이름 (실내 맵은 여러 집이 같은 배치를 쓰므로 들어갈 때 기억) */
let houseOwner = '';

/** 방 이동 효과음: 실내 문(종류별) · 동굴 입구 · 계단 · 바깥 길(소리 없음) */
const BELL_DOORS = new Set(['in_store', 'in_cafe', 'in_shop_w']);
const AUTO_DOORS = new Set(['in_center', 'in_lab', 'league', 'tower']);
function doorSound(from: string, to: string): string {
  const kind = (id: string) => MAP_META[id as MapId]?.kind;
  const room = to !== '@exit' && kind(to) === 'room' ? to : kind(from) === 'room' ? from : '';
  if (room || to === '@exit') return BELL_DOORS.has(room) ? 'door_bell' : AUTO_DOORS.has(room) ? 'door_auto' : 'door_wood';
  if (kind(from) === 'cave' && kind(to) === 'cave') return 'stairs';
  if (kind(from) === 'cave' || kind(to) === 'cave') return 'cave_enter';
  return '';
}

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
  /** 손에 든 가방 칸 (-1 = 빈손). 맵을 옮겨도(씬 재시작) 유지되도록 static 에 보관 */
  private static heldSlot = -1;
  private static heldId: string | null = null;
  private get selected() { return FarmScene.heldSlot; }
  private set selected(v: number) { FarmScene.heldSlot = v; FarmScene.heldId = v >= 0 ? this.auth?.me.inventory[v]?.itemId ?? null : null; }
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
  private musicTick = 0;
  private lastTick = 0;
  private titleStart?: { map: string; x: number; y: number };
  private badgeCount = -1;
  private badgeJingle = false;
  private fishing?: { phase: 'cast' | 'wait' | 'bite'; t: number; tx: number; ty: number; bobber: Phaser.GameObjects.Arc; window: number };
  private blades?: Phaser.GameObjects.Image;
  private dishSprite?: Phaser.GameObjects.Image;
  private pendingRoom = false;
  private lastTabDown = 0;
  private story!: StoryDirector;
  private plot!: EventDirector;   // 본편 사건 (chapters.json)
  private stage3d?: Stage3D;
  /** 손에 든 가방 칸 (핫바 대신 휴대폰 › 가방에서 고름) */
  private get slot() { return this.selected; }

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
    // 타이틀 화면(로그인 전): 마지막으로 있던 곳을 배경으로, 처음이면 내 집 방 안
    // ?offline → 로그인 없이 이 브라우저 저장으로 바로 이어서 (개발 · 확인용)
    const titleMode = !data?.authority && !data?.map && !new URLSearchParams(location.search).has('offline');
    const last = titleMode ? FarmScene.readLast() : null;
    this.titleStart = last && this.cache.tilemap.exists(last.map) ? last : undefined;
    this.mapId = data?.map ?? (titleMode ? (this.titleStart?.map ?? 'home') : this.auth.me.map ?? 'farm');

    this.world = new World(this, this.manifest, this.mapId);
    const info = this.world.info;
    for (const key of this.auth.removed) { const [m, id] = key.split(':'); if (m === this.mapId) this.world.removeObject(Number(id), false); }
    for (const key of this.auth.me.opened ?? []) { const [m, id] = key.split(':'); if (m === this.mapId) this.world.removeObject(Number(id), false); }   // 이미 연 보물 상자 · 주운 반짝이

    if (this.mapId === 'farm') {
      this.farm = new FarmRenderer(this, this.world, this.manifest);
      this.farm.load([...this.auth.tiles.values()]);
      for (const o of this.auth.placed.values()) this.world.addPlaced(o.id, o.type, o.x, o.y, false);
      for (const s of info.spawnList.filter((o) => o.name === 'chicken')) {
        const color = String(s.properties?.find((p) => p.name === 'color')?.value ?? 'white');
        this.chickens.push(new Chicken(this, `chicken_${color}`, s.x, s.y, this.world.grid));
      }
    } else {
      this.farm = undefined;
      // 마을 텃밭: 내 몫의 밭을 그림 (나에게만 보임)
      if (info.farmZones.length) {
        this.farm = new FarmRenderer(this, this.world, this.manifest); this.farm.load([...this.auth.tiles.values()]);
        // 텃밭 자리 표시: 옅은 흙빛 바닥 + 나무 말뚝 울타리 줄
        const g = this.add.graphics().setDepth(DEPTH.soil - 1);
        for (const z of info.farmZones) {
          const x = z.x * TILE, y = z.y * TILE, w = z.w * TILE, h = z.h * TILE;
          g.fillStyle(0x7a5230, 0.22).fillRect(x, y, w, h);
          g.lineStyle(1, 0x5a3a1c, 0.75).strokeRect(x - 1.5, y - 1.5, w + 3, h + 3);
          g.fillStyle(0x8a5a32, 1);
          for (let i = 0; i <= z.w; i += 1) { g.fillRect(x + i * TILE - 1.5, y - 4, 3, 5); g.fillRect(x + i * TILE - 1.5, y + h - 1, 3, 5); }
          for (let j = 1; j < z.h; j += 1) { g.fillRect(x - 3, y + j * TILE - 2, 3, 4); g.fillRect(x + w, y + j * TILE - 2, 3, 4); }
          g.fillStyle(0xc89a5a, 1);
          for (let i = 0; i <= z.w; i += 1) { g.fillRect(x + i * TILE - 1.5, y - 4, 3, 1); g.fillRect(x + i * TILE - 1.5, y + h - 1, 3, 1); }
        }
      }
      const isWater = (px: number, py: number) => info.terrainAt(Math.floor(px / TILE), Math.floor(py / TILE)) === '2';
      for (const s of info.spawnList.filter((o) => o.name === 'duck')) this.ducks.push(new Duck(this, s.x, s.y, isWater));
    }

    // 플레이어 시작 위치: 워프 도착 지점 > (멀티) 서버 위치 > 맵 기본 스폰
    const sp = data?.spawn ? info.spawns.get(data.spawn) : undefined;
    const titleAt = !data?.authority && !data?.pos && this.titleStart && this.titleStart.map === this.mapId ? { x: this.titleStart.x, y: this.titleStart.y } : undefined;
    const start = data?.pos ?? titleAt ?? (sp ? { x: sp.x, y: sp.y + 5 }
      : this.auth.me.x ? { x: this.auth.me.x, y: this.auth.me.y }
      : { x: (info.spawns.get('player') ?? farmSpawn).x, y: (info.spawns.get('player') ?? farmSpawn).y + 5 });
    const look = this.manifest.characters[this.auth.me.look] ? this.auth.me.look : 'm1';
    this.player = new Player(this, look, start.x, start.y, this.manifest.characters[look], this.world.grid);
    // 관리자 계정: 내 머리 위에도 [admin] 칭호 (서버가 확인한 값)
    if (this.auth.online && this.auth.isAdmin) this.player.label = this.add.text(this.player.x, this.player.y, `[admin] ${this.auth.me.name}`, { fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '8px', color: '#ff8a7a', stroke: '#3b2414', strokeThickness: 2, resolution: this.zoom }).setOrigin(0.5, 1);
    this.player.onStep = (run) => { if (this.playing) sfx.step(this.world.surfaceAt(this.player.x, this.player.y), run); };
    this.player.onHop = () => sfx.play('hop');
    if (data?.fromRoom) this.player.play('idle', this.world.interior ? 'up' : 'down');
    if (sp) this.player.play('idle', start.x < this.world.widthPx / 2 ? 'right' : 'left');
    this.story = new StoryDirector({
      scene: this, player: this.player, world: this.world, auth: this.auth, manifest: this.manifest, zoom: this.zoom, mapId: this.mapId,
      lock: () => { this.playing = false; this.player.play('idle', this.player.dir); }, unlock: () => { this.playing = true; },
      startBattle: (u, after) => this.startBattle(u, after),
    });
    this.plot = new EventDirector({
      scene: this, player: this.player, world: this.world, auth: this.auth, manifest: this.manifest, zoom: this.zoom, mapId: this.mapId,
      lock: () => { this.playing = false; this.player.play('idle', this.player.dir); }, unlock: () => { this.playing = true; },
      startBattle: (u, after) => this.startBattle(u, after),
      playMapMusic: () => this.playMapMusic(),
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

    // 시작 지점(내 농장)은 나만의 밭: 마을 사람은 보이지 않음 (엄마 · 친구 · 우편부는 이야기 연출로만 찾아옴)
    if (this.mapId !== 'farm') for (const base of Object.values(NPCS)) {
      // 루미 센터는 마을마다 다른 간호사 (같은 실내 맵을 쓰지만 어느 마을 건물인지에 따라 사람이 바뀜)
      const nurse = base.id === 'daon' && this.mapId === 'in_center' ? this.centerNurse() : null;
      let def = nurse ? { ...base, name: nurse.name, title: nurse.title, sprite: nurse.sprite } : base;
      if (!this.manifest.characters[def.sprite]) continue;
      if (def.gen && def.schedule[0]?.map !== this.mapId) continue;   // 생성된 주민은 자기 마을에만
      // 호감도를 다 쌓은 주민은 텃밭 도우미: 텃밭 곁에서 밭일을 함
      const helper = !!def.hand && (this.auth.me.bonds?.[def.id] ?? 0) >= BOND_MAX && info.spawns.has('wp_hand');
      if (helper) { const spot = this.npcs.some((q) => q.def.title.endsWith('텃밭 도우미')) ? 'wp_plot' : 'wp_hand'; Object.assign(def = { ...def }, { title: `${MAP_NAMES[this.mapId] ?? ''} 텃밭 도우미`, schedule: [{ time: 600, map: this.mapId, to: spot, idle: 'work', work: 'water', radius: 2 }] }); }
      const n = new Npc(this, def, this.manifest.characters[def.sprite], this.world.grid, info.spawns, this.zoom, this.mapId);
      n.resetForDay(this.auth.time.minutes);
      this.npcs.push(n);
    }
    this.spawnLegends();
    this.atmo = new Atmosphere(this, this.world);
    this.atmo.setWeather(this.auth.time.weather);
    this.stage3d = new Stage3D(this, this.manifest, this.world, this.mapId);

    const cam = this.cameras.main;
    cam.setZoom(this.zoom).setRoundPixels(true).setBackgroundColor(this.world.interior || this.world.cave ? '#0d0a0c' : '#14201a');
    this.fitCamera();
    this.renderDish();
    this.scale.on('resize', this.onResize, this);
    const onHide = () => this.writeLast();
    window.addEventListener('pagehide', onHide);
    this.events.once('shutdown', () => window.removeEventListener('pagehide', onHide));
    this.events.once('shutdown', () => { this.stage3d?.destroy(); this.scale.off('resize', this.onResize, this); this.input.keyboard?.off('keydown'); this.input.off('pointerdown'); this.input.off('pointermove'); this.input.off('wheel'); });

    this.setupInput();
    const unsubscribe = this.auth.on((e) => this.onAuthority(e));
    this.events.once('shutdown', unsubscribe);

    if (data?.authority || !titleMode) this.begin(!!(data?.spawn || data?.fromRoom));
    else this.titleScreen();
  }

  private onResize(size: Phaser.Structs.Size) { this.zoom = pickZoom(size.height); this.cameras.main.setZoom(this.zoom); this.fitCamera(); this.stage3d?.resize(); }
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
    touch.setVisible(false);   // 타이틀에서는 조이스틱 · 버튼 숨김
    const cam = this.cameras.main;
    const points = [[370, 250], [560, 420], [200, 470], [700, 300], [380, 200]];
    let i = 0;
    const next = () => { if (this.playing) return; const [x, y] = points[i++ % points.length]; cam.pan(x, y, 7000, 'Sine.easeInOut', false, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => { if (p === 1) next(); }); };
    if (this.world.interior || this.mapId !== 'farm') cam.centerOn(this.player.x, this.player.y);   // 실내: 그 자리에 고정
    else { cam.centerOn(370, 250); next(); }
    const dev = new URLSearchParams(location.search).get('dev');
    type Fb = typeof import('../net/firebase');
    let fb: Fb | null = null;
    const loadFb = async () => (fb ??= await import('../net/firebase'));
    music.play('title');
    const t: TitleHandle & { url: () => string } = ui.title.show({
      onLogout: async () => {
        try {
          await (await loadFb()).logout();
          try { localStorage.removeItem('sf:last'); } catch { /* 무시 */ }
          location.reload();   // 집 실내가 배경인 처음 화면으로
        } catch (e) { t.error((e as Error).message); }
      },
      onGoogle: async (mode) => {
        try {
          let cred: { token?: string; dev?: string; mode?: 'public' | 'story' };
          if (dev) cred = { dev };   // 테스트: 서버를 DEV_AUTH=1 로 켜고 ?dev=이름
          else {
            t.busy('구글 로그인 중...');
            const f = await loadFb();
            const user = (await f.currentUser()) ?? (await f.signInWithGoogle());
            t.setUser(user.displayName ?? user.email ?? '트레이너');
            cred = { token: await f.idToken(user) };
          }
          t.busy('서버에 접속 중...');
          // 재접속 때 쓸 새 토큰 (구글 토큰은 1시간이면 만료)
          const refresh = dev ? undefined : async () => { const f = await loadFb(); const u = await f.currentUser(); if (!u) throw new Error('로그인 만료'); return { token: await f.idToken(u) }; };
          const auth = await NetworkAuthority.connect(t.url(), { ...cred, mode }, refresh);
          t.close();
          this.withCharacter(auth, () => this.scene.restart({ authority: auth, map: auth.me.map, pos: { x: auth.me.x, y: auth.me.y } } satisfies SceneData));
        } catch (e) {
          const msg = (e as Error).message ?? String(e);
          // 혼자하기: 로그인/서버가 안 되면 이 브라우저에서 혼자 진행 (자동 저장)
          // 혼자하기: 로그인 취소/실패 또는 서버 접속 불가 시 이 브라우저에서 혼자 진행 (자동 저장)
          if (mode === 'story') {
            t.close();
            const toastMsg = /popup-closed|cancelled/.test(msg)
              ? '로그인 없이 이 브라우저에서 혼자 진행해요 (자동 저장)'
              : '서버에 연결할 수 없어 이 브라우저에서 혼자 진행해요 (자동 저장)';
            ui.toast.push(toastMsg, 'heart');
            this.startSolo();
            return;
          }
          t.error(/popup-closed|cancelled/.test(msg) ? '로그인 창이 닫혔어요.' : /unauthorized-domain/.test(msg) ? `Firebase 콘솔 → Authentication → 설정 → 승인된 도메인에 ${location.hostname} 을(를) 추가해 주세요.` : /configuration-not-found|operation-not-allowed/.test(msg) ? 'Firebase 콘솔에서 Google 로그인 제공업체를 사용 설정해 주세요.' : `${msg}`);
        }
      },
    });
    if (dev) t.setUser(`${dev} (테스트)`);
    // 이미 로그인된 브라우저: 이름만 보여 주고, '구글 계정으로 시작'을 눌러야 들어감 (팝업 없이 그 계정으로)
    else void loadFb().then((f) => f.currentUser()).then((u) => t.setUser(u ? (u.displayName ?? u.email ?? '트레이너') : null)).catch(() => t.setUser(null));
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
    touch.setVisible(true);
    const cam = this.cameras.main;
    const firstTime = !fromWarp;
    ui.mountGame();
    if (fromWarp) { cam.centerOn(this.player.x, this.player.y); cam.startFollow(this.player.sprite, true, 0.14, 0.14, 0, 8); cam.fadeIn(450); }
    else {
      cam.stopFollow(); cam.panEffect.reset();
      cam.pan(this.player.x, this.player.y - 8, 900, 'Sine.easeInOut', true, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => { if (p === 1) cam.startFollow(this.player.sprite, true, 0.14, 0.14, 0, 8); });
    }
    this.badgeCount = this.auth.me.badges.length;
    this.playMapMusic();
    ui.hud.time(this.auth.time); ui.hud.gold(this.auth.gold); ui.hud.energy(this.auth.me.energy, this.auth.me.maxEnergy);
    ui.hotbar.onClick = () => { if (this.hasPhone()) phone.toggle('bag'); };
    if (firstTime) this.selected = -1;   // 접속하면 빈손으로 시작 (가방에서 골라 듦)
    this.ensureHeld();
    this.setupPhone();
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
    if (firstTime) ui.toast.push('루미 스텔라에 오신 걸 환영해요! (H: 조작법 · Esc: 메뉴)', 'heart');
    if (EventDirector.pendingEpilogue && this.mapId === 'farm') { this.playing = false; this.cameras.main.setAlpha(1); void this.plot.epilogue(); return; }
    this.time.delayedCall(fromWarp ? 350 : 900, () => { this.story.begin(); this.plot.check(); });
  }

  /** 지금 장소·시간에 맞는 배경음악 (같은 곡이면 이어서 재생) */
  private playMapMusic() {
    if (this.battling) return;
    const meta = MAP_META[this.mapId] ?? { kind: 'route', biome: 'meadow', tier: 1 };
    const m = this.auth.time.minutes, night = m >= 19 * 60 || m < 6 * 60;
    // 스토리 모드: 성간단이 일을 벌이고 있는 곳은 위기 음악
    const ev = this.auth.me.mode === 'story' ? nextEvent({ ...this.auth.me, map: this.mapId }) : undefined;
    if (ev && (ev.bgm === 'crisis' || (ev.battle && VILLAIN_CAST.has(ev.battle.cast)))) { music.play('crisis'); return; }
    music.play(trackFor({ id: this.mapId, kind: meta.kind, biome: meta.biome, tier: meta.tier ?? 1, interior: this.world.interior }), night && !this.world.interior);
  }

  // ── 휴대폰 지도 / 일시정지 메뉴 ─────────────────────
  private hasPhone() { return this.auth.me.story >= STORY.PHONE; }
  /** 휴대폰: 이 씬(맵)이 바뀔 때마다 새 문맥으로 연결 */
  private setupPhone() {
    phone.setCtx({
      me: () => this.auth.me,
      time: () => this.auth.time,
      here: () => {
        // 실내면 그 건물이 있는 바깥 맵 위치로
        const me = this.auth.me, meta = MAP_META[me.map];
        const id = me.map === 'home' ? 'farm' : meta?.interior && !meta.x ? (me.inst.split(':')[0] || me.ret?.map || 'town') : me.map;
        const owner = (me.map === 'farm' || me.map === 'home') && me.inst !== me.id ? ` (${this.auth.roster.get(me.inst)?.name ?? '친구'}님네)` : '';
        return { id, owner };
      },
      mapUnlocked: () => this.auth.me.story >= STORY.HALL,
      roster: () => { const me = this.auth.me; return [{ id: me.id, name: me.name, where: this.whereText(me), me: true }, ...[...this.auth.roster.values()].map((p: RosterEntry) => ({ id: p.id, name: p.name, where: this.whereText(p) }))]; },
      online: () => this.auth.online,
      storage: () => this.auth.storageKind,
      canSave: () => this.auth instanceof LocalAuthority,
      setPartner: (i) => { void this.auth.request({ kind: 'setPartner', index: i }).then(() => phone.refresh()); },
      save: () => this.saveNow(),
      reset: () => void this.resetSave(),
      toTitle: () => this.toTitle(),
      held: () => this.selected,
      bagActions: (slot) => this.bagActions(slot),
      report: (text) => this.auth.report(text, `${this.world.title || this.mapId} · ${this.auth.time.day}일 ${Math.floor(this.auth.time.minutes / 60)}시`),
      isAdmin: () => this.auth.isAdmin,
      admin: (cmd) => this.auth.admin(cmd),
    });
    phone.refresh();
  }
  /** R: 휴대폰 홈 화면 (항상 홈으로) · M: 지도 바로 열기 · P·H 는 해당 앱으로 */
  private openPhone(app: Parameters<typeof phone.show>[0] = 'home', home = false) {
    if (!this.hasPhone()) { sfx.play('error'); ui.toast.push('아직 휴대폰이 없어요. 엄마가 생일 선물을 준비해 두셨대요!', 'heart'); return; }
    if (home) { if (phone.open && phone.app === 'home') phone.close(); else phone.show('home'); return; }
    phone.toggle(app);
  }
  /** 마지막으로 있던 곳 (타이틀 배경 · 다음 접속 시작 위치). 이 브라우저에만 저장 */
  private static LAST_KEY = 'sf:last';
  static readLast(): { map: string; x: number; y: number } | null {
    try { const r = localStorage.getItem(FarmScene.LAST_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  }
  private writeLast() {
    if (!this.playing || !this.player) return;
    try { localStorage.setItem(FarmScene.LAST_KEY, JSON.stringify({ map: this.mapId, x: Math.round(this.player.x), y: Math.round(this.player.y) })); } catch { /* 용량 초과 등 무시 */ }
  }
  private saveNow() { if (this.auth instanceof LocalAuthority) { this.auth.save(); sfx.play('confirm'); ui.toast.push('이 브라우저에 저장했어요!', 'heart'); } }
  private async resetSave() {
    this.playing = false;
    await this.auth.request({ kind: 'resetSave' });
    this.auth.close();
    void ui.transition.run('처음부터', '새로운 이야기를 시작합니다', () => location.reload());
  }
  private toTitle() { if (this.auth instanceof LocalAuthority) this.auth.save(); this.auth.close(); location.reload(); }
  /** 휴대폰을 받기 전(프롤로그)에만 쓰는 일시정지 메뉴 */
  private openMenu() {
    const local = this.auth instanceof LocalAuthority;
    ui.menu.show({ storage: this.auth.storageKind, canSave: local, onSave: () => this.saveNow(), onReset: () => void this.resetSave(), onTitle: () => this.toTitle() });
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
  /** 키 하나 처리 (키보드 · 모바일 터치 버튼 공용) */
  private onKey(e: KeyboardEvent) {
      if (ui.chat.typing) return;
      // 대화창: 컷신 중(조작 잠김)에도 Space · E · Enter · 클릭으로 넘김
      if (ui.dialogue.open && !this.battling && [' ', 'e', 'E', 'x', 'X', 'c', 'C', 'Enter'].includes(e.key)) {
        e.preventDefault();
        if (!e.repeat) ui.dialogue.advance();
        return;
      }
      if (!this.playing) return;
      if (this.battling) return;
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.repeat) return;
        if (ui.emoteWheel.open) { ui.emoteWheel.close(); return; }
        if (!ui.dialogue.open && !ui.creator.open) { ui.emoteWheel.show(this.scale.width / 2, this.scale.height / 2, (id) => this.emote(id)); this.lastTabDown = this.time.now; }
        return;
      }
      if (ui.emoteWheel.open && /^(w|a|s|d|arrow)/i.test(e.key)) ui.emoteWheel.close();
      if (e.key === 'Escape') {
        if (ui.menu.open) ui.menu.close(); else if (ui.craft.open) ui.craft.close(); else if (phone.open) phone.back(); else if (ui.emoteWheel.open) ui.emoteWheel.close(); else if (ui.mailbox.open) ui.mailbox.close(); else if (ui.shop.open) ui.shop.close(); else if (ui.party.open) ui.party.close(); else if (ui.dialogue.open) ui.dialogue.close(); else if (this.hasPhone()) phone.show('home'); else this.openMenu();
        return;
      }
      if (ui.menu.open) return;
      if (e.key === 'r' || e.key === 'R') { this.openPhone('home', true); return; }
      if (e.key === 'm' || e.key === 'M') { this.openPhone('map'); return; }
      if (e.key === 'v' || e.key === 'V') {
        const on = this.stage3d?.toggle();
        ui.toast.push(on ? '포켓몬 5세대풍 2.5D 시점으로 전환했어요! (V 키)' : '클래식 2D 시점으로 전환했어요! (V 키)', 'heart');
        return;
      }
      if (ui.shop.open || ui.mailbox.open || ui.creator.open) return;
      if (this.fishing && [' ', 'e', 'E', 'c', 'C', 'x', 'X'].includes(e.key)) { this.reel(); return; }
      if (e.key === 'p' || e.key === 'P') { if (this.hasPhone()) phone.toggle('party'); else ui.party.toggle(this.auth.me, (i) => void this.auth.request({ kind: 'setPartner', index: i })); return; }
      if (e.key === 'h' || e.key === 'H') { if (this.hasPhone()) phone.toggle('help'); else ui.help.toggle(); }
      if (e.key === 'l' || e.key === 'L') ui.roster.toggle();
      if (e.key === 'Enter') { ui.chat.toggle(true); e.preventDefault(); }
      if (e.key === ' ' || e.key === 'c' || e.key === 'C') { if (ui.dialogue.open) ui.dialogue.advance(); else this.useItem(); }
      if (e.key === 'e' || e.key === 'E' || e.key === 'x' || e.key === 'X') { if (ui.dialogue.open) ui.dialogue.advance(); else this.interact(); }
  }

  private setupInput() {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT,SPACE,E,X,C,TAB') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown', (e: KeyboardEvent) => this.onKey(e));
    // 모바일: 터치 버튼도 같은 키 처리로
    touch.mount();
    touch.onKey = (key) => { if (key === 'Tab' && ui.emoteWheel.open) { ui.emoteWheel.close(); return; } this.onKey({ key, repeat: false, preventDefault() {} } as unknown as KeyboardEvent); };
    // Tab 을 떼면 마우스가 가리키는 감정표현 (짧게 톡 누르면 휠이 열린 채로 남아 클릭으로 고름)
    kb.on('keyup', (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !ui.emoteWheel.open) return;
      // 짧게 톡: 휠을 열어둔 채 클릭으로 고름 / 길게 누르다 떼기: 가리킨 감정 사용 (없으면 닫힘)
      if (this.time.now - this.lastTabDown < 250) return;
      const id = ui.emoteWheel.release();
      if (id !== null) this.emote(id);
    });
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { this.lastPointerMove = this.time.now; if (ui.emoteWheel.open) ui.emoteWheel.move(p.x, p.y); });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (ui.emoteWheel.open) { ui.emoteWheel.close(); return; }
      if (ui.dialogue.open && !this.battling) { ui.dialogue.advance(); return; }
      if (!this.playing || ui.shop.open || this.battling || ui.emoteWheel.open || ui.mailbox.open || ui.creator.open) return;
      if (this.fishing) { this.reel(); return; }
      if (ui.dialogue.open) { ui.dialogue.advance(); return; }
      if (p.rightButtonDown()) this.interact(this.pointerCell(p)); else this.useItem(this.pointerCell(p));
    });
  }

  private select(i: number) { this.selected = i; ui.hotbar.render(this.auth.me.inventory, i); phone.refresh(); }
  /** 손에 든 물건이 다 떨어졌거나 칸이 바뀌었으면 맞춰 줌 (다 쓰면 빈손). 자동으로 다른 걸 쥐어 주지 않음 */
  private ensureHeld() {
    const inv = this.auth.me.inventory, id = FarmScene.heldId;
    if (FarmScene.heldSlot >= 0 && inv[FarmScene.heldSlot]?.itemId !== id) {
      const moved = id ? inv.findIndex((s) => s.itemId === id) : -1;
      FarmScene.heldSlot = moved;
      if (moved < 0) FarmScene.heldId = null;
    }
    ui.hotbar.render(inv, this.selected);
  }

  private pointerCell(p: Phaser.Input.Pointer): [number, number] | undefined {
    const w3d = this.stage3d?.screenToWorld(p.x, p.y, 0);
    const w = w3d ?? this.cameras.main.getWorldPoint(p.x, p.y);
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
    if (!item) { ui.toast.push('빈손이에요. 휴대폰(R) › 가방에서 도구를 손에 들어 보세요.', 'craft'); return; }
    const [tx, ty] = this.faceCell(cell);
    const dir = this.player.dir;
    if (item.type === 'food') { this.eatSlot(this.slot); return; }
    const fieldOnly = item.type === 'seed' || item.tool === 'hoe' || item.tool === 'watering_can';   // 농장 + 마을 텃밭
    const farmOnly = item.type === 'placeable' || item.tool === 'axe' || item.tool === 'hammer';
    if ((this.mapId !== 'farm' && farmOnly) || (fieldOnly && !this.fieldMap)) {
      if (item.type === 'tool') { const a = item.tool === 'watering_can' ? 'water' : item.tool === 'axe' ? 'axe' : item.tool === 'hammer' ? 'pick' : 'hoe'; this.auth.sendAnim(a, dir); this.player.playOnce(a, dir); }
      ui.toast.push(fieldOnly ? '이건 내 농장이나 마을 텃밭에서 쓸 수 있어요.' : '이건 내 농장에서만 쓸 수 있어요. 농장으로 돌아가세요!', item.icon);
      return;
    }
    if (item.tool === 'rod') { this.castLine(tx, ty); return; }
    if (this.world.info.terrainAt(tx, ty) === '2' && !this.auth.me.inventory.some((s) => s.itemId && ITEMS[s.itemId]?.tool === 'rod')) { sfx.play('error'); ui.toast.push('낚싯대가 없어요. 마을 상점에서 낚싯대를 구매해 주세요!', 'rod'); return; }
    if (item.type === 'placeable') { this.placeAt(this.slot, tx, ty); return; }
    if (item.tool === 'pickaxe' || item.tool === 'hammer') {
      this.auth.sendAnim('pick', dir);
      this.player.playOnce('pick', dir, async () => {
        sfx.play('pick');
        if (item.tool === 'hammer') {
          const id = this.world.placedAt(tx, ty);
          if (!id) { this.thunk(tx, ty); return; }
          const r = await this.auth.request({ kind: 'hammer', tx, ty });
          if (r.ok) { sfx.play('rock_break'); ui.toast.push('구조물을 부쉈어요. 가방으로 돌아왔어요!', 'hammer'); }
          return;
        }
        const o = this.world.objectAt(tx, ty);
        if (!o || !this.world.mineKind(o)) { this.thunk(tx, ty); return; }
        const r = await this.auth.request({ kind: 'mine', objectId: o.id });
        if (r.ok) { sfx.play('rock_break'); if (this.world.mineKind(o) !== 'stone') this.time.delayedCall(180, () => sfx.play('sparkle')); this.chips(o); this.partnerHelpFx(); } else this.world.shake(o, 1);
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
          if (r.ok) { this.world.shake(o, o.tall ? 1 : 2); this.chips(o); if (o.tall) this.leaves(o); if (r.reason === 'felled') sfx.play('rock_break'); }
          else if (r.reason === 'too-big') this.world.shake(o, 1);
        } else {
          // 괭이로 잡초를 치면 뽑힘
          const weed = item.tool === 'hoe' && this.mapId === 'farm' ? this.world.weedAt(tx, ty) : undefined;
          if (weed) { void this.auth.request({ kind: 'pull', objectId: weed.id }).then((r) => r.ok && sfx.play('forage')); return; }
          const r = await this.auth.request({ kind: 'useTool', slot: this.slot, tx, ty });
          if (!r.ok && r.reason === 'cannot-till') this.thunk(tx, ty);
        }
      }, anim === 'water' ? 1 : 3);
    } else if (item.type === 'seed') {
      this.plantAround(this.slot, [tx, ty]);
    } else if (item.type === 'crop' || item.type === 'material') {
      const o = this.world.objectAt(tx, ty);
      if (o?.interact === 'ship') this.shipSlot(this.slot);
      else ui.toast.push(`${item.name}: 농장 출하 상자에 넣으면 ${item.sellPrice}G!`, item.icon);
    }
  }

  private eatSlot(slot: number) {
    const dir = this.player.dir;
    this.player.playOnce('interact', dir, () => { void this.auth.request({ kind: 'eat', slot }).then((r) => r.ok && sfx.play('eat')); }, 1);
    this.auth.sendAnim('interact', dir);
  }
  /** 씨앗: 바라보는 칸 먼저, 그다음 내 주변 8칸 중 갈아 둔 빈 밭에 차례로 심기 */
  private plantAround(slot: number, first?: [number, number]) {
    if (!this.fieldMap || !this.farm) { ui.toast.push('씨앗은 내 농장이나 마을 텃밭에 심을 수 있어요.', 'seeds_parsnip'); return; }
    const [px, py] = this.player.cell();
    const cells: [number, number][] = [];
    if (first) cells.push(first); else cells.push(this.player.facingCell());
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) cells.push([px + dx, py + dy]);
    const free = cells.filter(([x, y], i, a) => a.findIndex(([x2, y2]) => x2 === x && y2 === y) === i).filter(([x, y]) => { const t = this.farm!.get(x, y); return t && !t.crop; });
    if (!free.length) { ui.toast.push('주변에 갈아 둔 빈 밭이 없어요. 괭이로 먼저 땅을 갈아요.', 'hoe'); return; }
    const dir = this.player.dir;
    this.auth.sendAnim('interact', dir);
    this.player.playOnce('interact', dir, async () => {
      let n = 0;
      for (const [x, y] of free) {
        if (!this.auth.me.inventory[slot]?.quantity) break;
        const r = await this.auth.request({ kind: 'plant', slot, tx: x, ty: y });
        if (r.ok) n++; else if (r.reason === 'season') break;
      }
      if (n) { sfx.play('plant'); ui.toast.push(`씨앗을 ${n}칸에 심었어요. 물 주는 것 잊지 마세요!`, 'watering_can'); }
    }, 1);
  }
  private placeAt(slot: number, tx: number, ty: number) {
    if (this.mapId !== 'farm') { ui.toast.push('설치물은 농장에만 놓을 수 있어요.', 'fence_wood'); return; }
    const dir = this.player.dir;
    this.auth.sendAnim('interact', dir);
    this.player.playOnce('interact', dir, () => { void this.auth.request({ kind: 'place', slot, tx, ty }).then((r) => { if (r.ok) sfx.play('chest'); else if (r.reason === 'far') ui.toast.push('바로 앞 칸에만 놓을 수 있어요.', 'fence_wood'); }); }, 1);
  }
  /** 가방에서 아이템을 눌렀을 때 할 수 있는 일 (휴대폰 가방 앱이 버튼으로 보여 줌) */
  private bagActions(slot: number): { label: string; run: () => void; primary?: boolean }[] {
    const s = this.auth.me.inventory[slot]; const item = s?.itemId ? ITEMS[s.itemId] : null;
    if (!item) return [];
    const out: { label: string; run: () => void; primary?: boolean }[] = [];
    const held = slot === this.selected;
    const hold = held
      ? { label: '선택 해제하기', run: () => { this.select(-1); sfx.play('tap'); ui.toast.push(`${item.name}을(를) 손에서 내려놓았어요.`); } }
      : { label: '손에 들기', run: () => { this.select(slot); sfx.play('tap'); ui.toast.push(`${item.name}을(를) 손에 들었어요. Space / 좌클릭으로 사용!`, item.icon); }, primary: item.type === 'tool' };
    const nearBin = this.mapId === 'farm' && this.world.objects.some((o) => o.interact === 'ship' && o.sprite.active && Math.hypot(o.sprite.x - this.player.x, o.sprite.y - this.player.y) < 40);
    const nearTable = this.mapId === 'home' && this.world.objects.some((o) => o.interact === 'dtable' && Math.hypot(o.sprite.x - this.player.x, o.sprite.y - this.player.y) < 44);
    if (item.type === 'seed') out.push({ label: '주변 밭에 심기', run: () => this.plantAround(slot), primary: true });
    if (item.type === 'placeable') out.push({ label: '바로 앞에 설치하기', run: () => { const [x, y] = this.player.facingCell(); this.placeAt(slot, x, y); }, primary: true });
    if (item.type === 'food') out.push({ label: '먹기', run: () => this.eatSlot(slot), primary: true });
    if (item.id === 'ocarina') out.push({ label: '불기', run: () => this.fluteAnywhere(), primary: true });
    if (nearTable && (item.type === 'food' || item.type === 'crop')) out.push({ label: '식탁에 차리기 (4인분)', run: () => { this.auth.sendAnim('interact', this.player.dir); this.player.playOnce('interact', this.player.dir, () => void this.auth.request({ kind: 'serve', slot }), 1); } });
    if (nearBin && item.sellPrice > 0 && item.type !== 'tool') out.push({ label: `출하하기 (${item.sellPrice * s!.quantity}G)`, run: () => this.shipSlot(slot), primary: true });
    if (item.type !== 'food' && item.type !== 'key') out.push(hold);
    return out;
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
    const lg = this.legendSprite;
    if (lg?.active && Math.hypot(lg.x - fx, lg.y - 8 - fy) < (this.legendId === 'genesis' ? 34 : 22)) return this.legendId === 'genesis' ? { label: label('제네시스에게 말을 건다'), run: () => void this.genesisBattle() } : { label: label('잠든 루미에게 다가가기'), run: () => void this.stellaScene() };
    const npc = this.npcs.find((n) => n.state !== 'gone' && Math.hypot(n.x - fx, n.y - fy) < 15);
    if (npc) return { label: label(`${npc.def.name}와(과) 대화하기`), run: () => this.talk(npc) };
    const tile = this.farm?.get(tx, ty);
    if (tile?.crop && tile.crop.stage >= 4) return { label: label('수확하기'), run: () => this.harvest(tx, ty) };
    const o = this.world.objectAt(tx, ty);
    if (o) return this.objectInteraction(o);
    const placed = this.mapId === 'farm' ? this.world.placedAt(tx, ty) : undefined;
    if (placed) { const po = this.auth.placed.get(placed); const it = po ? ITEMS[po.item] : null; return { label: label(`${it?.name ?? '설치물'} 살펴보기`), run: () => this.say([`${it?.name ?? '설치물'}${po && po.by !== this.auth.me.id ? ` (${this.auth.roster.get(po.by)?.name ?? '친구'}님이 설치)` : ''}.`, '망치를 들고 치면 부숴서 가방에 돌려받을 수 있다.']) }; }
    const weed = this.mapId === 'farm' ? this.world.weedAt(tx, ty) : undefined;
    if (weed) return { label: label('잡초 뽑기'), run: () => { this.auth.sendAnim('interact', this.player.dir); this.player.playOnce('interact', this.player.dir, () => void this.auth.request({ kind: 'pull', objectId: weed.id }).then((r) => r.ok && sfx.play('forage')), 1); } };
    // 물가: 낚싯대가 있으면 바로 낚시, 없으면 사 오라고 안내
    if (this.world.info.terrainAt(tx, ty) === '2') {
      const rodSlot = this.auth.me.inventory.findIndex((s) => s.itemId && ITEMS[s.itemId]?.tool === 'rod');
      if (rodSlot < 0) return { label: label('물 살펴보기'), run: () => { sfx.play('error'); ui.toast.push('낚싯대가 없어요. 마을 상점에서 낚싯대를 구매해 주세요!', 'rod'); } };
      return { label: label('낚시하기'), run: () => { this.select(rodSlot); this.castLine(tx, ty); } };
    }
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
    // 비전 기술 장애물 (풀베기 · 바위 부수기 · 암석 오르기)
    if (it === 'loot') return { label: label(o.type === 'chest' ? '보물 상자 열기' : '반짝이는 것 줍기'), run: () => {
      this.player.playOnce('interact', this.player.dir, () => void this.auth.request({ kind: 'loot', objectId: o.id }).then((r) => {
        if (!r.ok) { if (r.reason === 'far') ui.toast.push('바로 앞에 서서 눌러 주세요.', 'heart'); return; }
        const item = ITEMS[r.data?.item ?? ''], n = r.data?.qty ?? 1;
        sfx.play(o.type === 'chest' ? 'chest' : 'pickup'); if (o.type === 'chest') this.time.delayedCall(220, () => sfx.play('item'));
        this.partner?.cheer(2);
        this.say([o.type === 'chest' ? '보물 상자를 열었다!' : '풀숲 사이에서 무언가 반짝인다…', `${item?.name ?? '물건'}${n > 1 ? ` ×${n}` : ''}을(를) 손에 넣었다!`]);
      }), 1);
    } };
    if (it.startsWith('skill:')) {
      const id = it.slice(6), sk = SKILLS[id]; if (!sk) return null;
      const me = this.auth.me;
      if (!me.badges.includes(sk.badge) || !me.party.length) return { label: label('살펴보기'), run: () => this.say([sk.look, sk.need]) };
      return { label: label(`${sk.name} 쓰기`), run: () => this.useSkill(o, id) };
    }
    if (it.startsWith('spire_top:')) return this.spireTopInteraction(it.slice(10), o);
    if (it.startsWith('spire:')) { const d = it.slice(6), sp = QUESTS.spires[d], lit = this.auth.me.flags.includes(`lit_${d}`); return { label: label(`${sp?.name ?? '탑'} 살펴보기`), run: () => this.say([o.text ?? '오래된 탑.', lit ? '꼭대기에서 빛줄기가 하늘로 솟고 있다.' : this.auth.me.flags.includes('side_flute') ? '문틈으로 바람 소리가 샌다. 들어가 볼 수 있을 것 같다.' : '문은 굳게 닫혀 있다. 무언가를 기다리는 듯하다…']) }; }
    if (it.startsWith('shop:')) {
      // 생성 마을의 루미 마트는 마을 단계에 맞는 물건을 팖 (멀리 갈수록 좋은 볼)
      const sid = it.slice(5), town = this.mapId === 'in_shop_w' ? this.auth.me.inst.split(':')[0] : this.mapId;
      const shop = SHOPS[sid === 'windvale' && town !== 'windvale' && MAP_META[town]?.kind === 'town' ? martFor(town) : sid];
      return shop ? { label: label(`${shop.name} 이용하기`), run: () => this.openShop(shop.id) } : null;
    }
    const ownHome = this.mapId === 'home' && this.auth.me.inst === this.auth.me.id;
    switch (it) {
      case 'ship': return { label: label('출하 상자 — 작물 · 물고기 팔기'), run: () => { sfx.play('bin_lid'); this.ship(); } };
      case 'mail': return { label: label('우편함 열기 — 편지 · 친구 초대'), run: () => { sfx.play('mailbox'); this.openMailbox(); } };
      case 'sign': return { label: label('표지판 읽기'), run: () => { sfx.play('page'); this.say([o.text ?? '...']); } };
      case 'board': return { label: label('마을 게시판 보기'), run: () => { sfx.play('page'); this.say(this.boardNotes()); } };
      case 'inn': return { label: label('숙소 — 하룻밤 묵기 (500G)'), run: () => this.stayInn() };
      case 'center': return { label: label('루미 센터에서 루미 회복하기'), run: () => this.healAt('다온', '맡겨 주신 루미들이 모두 건강해졌어요! 또 오세요♪') };
      case 'windmill': return { label: label('맷돌 살펴보기'), run: () => this.say(['풍차 날개가 돌면 이 커다란 맷돌도 함께 돌아간다.', '고소한 밀가루 냄새가 난다.']) };
      case 'smithy': return { label: label('볼 공방 화덕 — 루미볼 만들기'), run: () => this.openCraft('smithy') };
      case 'workbench': return { label: label('작업대 — 회복약 · 도핑약 · 루미볼 만들기'), run: () => this.openCraft('home') };
      case 'labcraft': return { label: label('약품 조합기 — 회복약 · 도핑약 만들기'), run: () => this.openCraft('lab') };
      case 'bed': return ownHome ? { label: label('침대에서 자기 (하루 마치기)'), run: () => { sfx.play('bed'); this.sleep(); } } : { label: label('살펴보기'), run: () => this.say(['친구의 침대다. 푹신해 보인다.']) };
      case 'nbed': return { label: label('살펴보기'), run: () => this.say([`${houseOwner || '이웃'}의 침대다. 남의 침대에 누울 순 없지.`]) };
      case 'wardrobe': return ownHome ? { label: label('옷장 — 외형 바꾸기'), run: () => { sfx.play('chest'); this.openWardrobe(); } } : { label: label('살펴보기'), run: () => this.say(['친구의 옷장이다. 멋진 옷이 가득하다.']) };
      case 'kitchen': return { label: label('부엌 살펴보기'), run: () => this.say(['깔끔한 부엌. 수확한 작물이나 카페 음식을 들고 식탁에서 E 를 누르면 같이 먹을 수 있어요.']) };
      case 'dtable': return this.tableInteraction();
      case 'piano': return { label: label('피아노 치기'), run: () => { sfx.play('piano'); this.emote(4); this.say(['♪ 도레미파솔~ 서툴지만 즐거운 소리가 난다.']); } };
      case 'starter_table': return { label: label('살펴보기'), run: () => this.say([this.auth.me.party.length ? '루미 구슬이 놓여 있던 받침대. 박사님이 새 아이들을 돌보고 있다.' : '세 개의 루미 구슬이 빛나고 있다. 한별 박사님에게 말을 걸어 보자!']) };
      case 'altar': return this.altarInteraction(o);
      case 'bench': return { label: label('벤치에 앉아 쉬기'), run: () => { sfx.play('sit'); this.say(['벤치에 앉아 호수를 바라본다.\n오리들이 한가롭게 떠다닌다...']); } };
    }
    if (FLAVOR[o.type]) return { label: label('살펴보기'), run: () => this.say([FLAVOR[o.type]]) };
    return null;
  }

  private boardNotes() {
    const t = this.auth.time;
    return [
      `[별빛 마을 게시판]\n오늘 날씨: ${t.weather === 'rain' ? '비 — 농장 작물에 물을 줄 필요가 없어요!' : '맑음 — 물 주는 것 잊지 마세요!'}`,
      '· 소라네 루미 마트: 오전 9시 ~ 오후 5시 (약초 씨앗 · 볼 · 회복약)\n· 루나 카페: 오전 7시 30분 ~ 오후 10시 (커피·빵·케이크)\n· 광장 씨앗 가판대: 오전 9시 ~ 오후 6시\n· 민수의 볼 공방: 화덕 자유 이용 (배지를 따면 새 볼 제작법 전수!)',
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
    ui.shop.show(shop, this.auth.gold, (itemId, qty) => { void this.auth.request({ kind: 'buy', shop: id, itemId, qty }).then((r) => sfx.play(r.ok ? 'shop_buy' : 'error')); },
      owner ? { sprite: owner.def.sprite, name: owner.def.name } : undefined);
  }

  private interact(cell?: [number, number]) {
    if (this.player.busy || ui.dialogue.open || ui.shop.open) return;
    if (cell) this.faceCell(cell);
    this.findInteraction(cell)?.run();
  }

  private talk(npc: Npc) {
    if (npc.def.id === 'hanbyeol') { npc.beginTalk(this.player.x, this.player.y, this.auth.time.day); this.professor(() => npc.endTalk()); return; }
    if (npc.def.hand) { void this.handTalk(npc); return; }
    if (npc.def.id === 'daon') { this.healAt(npc.def.name, '맡겨 주신 루미들이 모두 건강해졌어요! 또 오세요♪', undefined, npc.def.sprite); return; }
    const dir = facingFromVector(npc.x - this.player.x, npc.y - this.player.y, this.player.dir);
    this.player.play('idle', dir);
    const pages = npc.pickLines(this.auth.time.minutes, this.auth.time.weather);
    npc.beginTalk(this.player.x, this.player.y, this.auth.time.day);
    ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: npc.def.sprite, color: npc.def.color, pages, hearts: npc.hearts }, () => { npc.endTalk(); if (TEACHERS[npc.def.id]) void this.learnFrom(npc.def.id); });
  }

  private harvest(tx: number, ty: number) {
    const [px, py] = this.player.cell();
    const dir = facingFromVector(tx - px, ty - py, this.player.dir);
    this.auth.sendAnim('interact', dir);
    this.player.playOnce('interact', dir, () => { void this.auth.request({ kind: 'harvest', tx, ty }).then((r) => r.ok && sfx.play('harvest')); }, 1);
  }

  /** 출하 상자: 손에 든 게 팔 수 있는 물건이면 바로 넣고, 아니면 휴대폰 가방을 열어 고르게 함 */
  private ship() {
    const it = ITEMS[this.auth.me.inventory[this.slot]?.itemId ?? ''];
    if (it && it.sellPrice > 0 && it.type !== 'tool') { this.shipSlot(this.slot); return; }
    if (this.hasPhone()) { phone.show('bag'); ui.toast.push('가방에서 출하할 물건을 눌러 "출하하기"를 고르세요.', 'gold'); }
    else ui.toast.push('출하할 작물을 손에 들고 상자를 눌러 주세요.', 'gold');
  }
  private shipSlot(slot: number) {
    this.auth.sendAnim('interact', this.player.dir);
    this.player.playOnce('interact', this.player.dir, async () => {
      const r = await this.auth.request({ kind: 'ship', slot });
      const bin = this.world.objects.find((o) => o.interact === 'ship');
      if (r.ok) sfx.play('ship');
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
      this.player.setPosition(this.player.x - TILE, this.player.y); this.player.stopStep();
      sfx.play('error');
      this.say([this.auth.me.story < STORY.MEET ? '저 너머는 1번 도로… 오늘은 먼저 마을에서 할 일이 있다!' : '아직은 갈 수 없어. 마을회관에서 이장님을 만나고 루미를 받아야 해!']);
      return;
    }
    const gate = BADGE_GATES[w.to] ?? 0;
    if (gate > this.auth.me.badges.length) {
      const [dx, dy] = DIR_VEC[this.player.dir]; this.player.setPosition(this.player.x - dx * TILE, this.player.y - dy * TILE); this.player.stopStep();
      sfx.play('error');
      this.say([`보이지 않는 힘이 앞을 가로막는다…`, `(배지를 ${gate}개 모으면 지나갈 수 있을 것 같다. 지금 ${this.auth.me.badges.length}개)`]);
      return;
    }
    // 사이드 스토리로 막힌 곳 (탑의 문 · 봉인된 계단 · 별의 요람)
    const qg = QUESTS.gates[w.to];
    if (qg && !this.auth.me.flags.includes(qg.flag)) {
      const [dx, dy] = DIR_VEC[this.player.dir]; this.player.setPosition(this.player.x - dx * TILE, this.player.y - dy * TILE); this.player.stopStep();
      sfx.play('error');
      if (qg.seal) void this.sealScene(qg.seal, qg.msg); else this.say([qg.msg]);
      return;
    }
    const index = this.world.info.warps.indexOf(w);
    // 부두 끝: 정기선을 타고 섬 ↔ 항구
    if (w.ferry) {
      this.playing = false; phone.close();
      const back = () => this.player.setPosition(this.player.x, this.player.y - 14);
      void ui.ferry(MAP_NAMES[w.to] ?? '섬').then(() => { this.playing = true; this.moveRoom(() => this.auth.request({ kind: 'warp', index }), back, ''); });
      return;
    }
    this.moveRoom(() => this.auth.request({ kind: 'warp', index }), () => this.player.setPosition(this.player.x, this.player.y - (w.to === '@exit' ? 8 : 0)), doorSound(this.mapId, w.to));
  }
  /** 건물 문 앞에서 E → 실내 */
  private enterBuilding(o: WorldObject, owner: string) {
    houseOwner = owner;
    this.player.play('idle', 'up');
    this.moveRoom(() => this.auth.request({ kind: 'enter', objectId: o.id }), undefined, doorSound(this.mapId, o.interior ?? INTERIOR_OF[o.type] ?? 'home'));
  }
  /** 방 이동 요청: 화면을 어둡게 → 권한자에게 요청 → 'room' 이벤트가 오면 씬 재시작 */
  private moveRoom(req: () => Promise<{ ok: boolean; reason?: string }>, onFail?: () => void, sound = 'door_wood') {
    if (this.warping) return;
    this.warping = true; this.playing = false;
    if (sound) sfx.play(sound);
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
        else if (r.reason?.startsWith('event:')) ui.toast.push(EventDirector.gateMessage(r.reason), 'heart');
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
        if (ev.type === 'tile') { if ((ev.map ?? 'farm') === this.mapId && ev.owner === this.auth.farmOwner) { this.farm?.apply(ev.tile); this.stage3d?.markSoilDirty(); } }
        else if (ev.type === 'time') { ui.hud.time(ev.time); phone.tick(ev.time); if (ev.time.minutes === 18 * 60) ui.toast.push('해가 지고 있어요. 가로등이 켜집니다.', 'sun'); if (ev.time.minutes === 24 * 60) ui.toast.push('자정이 넘었어요! 곧 자러 가야 해요.', 'energy'); }
        else if (ev.type === 'gold') { if (ev.playerId === me.id) { ui.hud.gold(ev.gold); ui.shop.gold(ev.gold); phone.refresh(); if (ev.delta > 0) ui.toast.push(`+${ev.delta}G`, 'gold'); } }
        else if (ev.type === 'player' && ev.id === me.id) { ui.hud.energy(ev.energy, me.maxEnergy); this.ensureHeld(); ui.craft.refresh(); phone.refresh(); }
        else if (ev.type === 'objectRemoved') { const [m, id] = ev.key.split(':'); if (m === this.mapId && (!ev.owner || ev.owner === this.auth.farmOwner)) this.world.removeObject(Number(id)); }
        else if (ev.type === 'opened' && ev.playerId === me.id) { const [m, id] = ev.key.split(':'); if (m === this.mapId) this.world.removeObject(Number(id)); }
        else if (ev.type === 'cleared' && ev.playerId === me.id) { const [m, id] = ev.key.split(':'); if (m === this.mapId) this.world.removeObject(Number(id)); }
        else if (ev.type === 'objectRestored') { for (const k of ev.keys) { const [m, id] = k.split(':'); if (m === this.mapId) this.world.restoreObject(Number(id)); } }
        else if (ev.type === 'forage') this.renderForage();
        else if (ev.type === 'placed') { if (this.mapId === 'farm' && ev.owner === this.auth.farmOwner) this.world.addPlaced(ev.obj.id, ev.obj.type, ev.obj.x, ev.obj.y); }
        else if (ev.type === 'unplaced') { if (this.mapId === 'farm' && ev.owner === this.auth.farmOwner) this.world.removePlaced(ev.id); }
        else if (ev.type === 'party' && ev.id === me.id) { this.syncPartner(); ui.craft.refresh(); phone.refresh(); if (ev.badges.length > this.badgeCount && this.badgeCount >= 0) { if (this.battling) this.badgeJingle = true; else music.jingle('jingle_badge'); } this.badgeCount = ev.badges.length; }
        else if (ev.type === 'help' && ev.playerId === me.id) { this.partner?.cheer(4); ui.toast.push(ev.text, 'lumi'); }
        else if (ev.type === 'toast' && (!ev.playerId || ev.playerId === me.id) && (!ev.room || ev.room === this.auth.room)) ui.toast.push(ev.text, ev.icon);
        else if (ev.type === 'newDay') { ui.hud.time(ev.time); this.stage3d?.markSoilDirty(); if (ev.time.weather === 'rain') ui.toast.push('비가 와요. 오늘은 물을 안 줘도 돼요!', 'rain'); }
        else if (ev.type === 'room' && ev.playerId === me.id) this.goRoom();
        else if (ev.type === 'look') {
          if (ev.id === me.id) { if (this.playing) this.goRoomSame(); }
          else { const r = this.remotes.get(ev.id); if (r) { const p = { x: r.x, y: r.y }; this.removeRemote(ev.id); this.addRemote(ev.id, this.auth.roster.get(ev.id)?.title === 'admin' ? `[admin] ${ev.name}` : ev.name, ev.look, p.x, p.y); } this.renderRoster(); }
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
          if (!r) { r = this.addRemote(p.id, p.title === 'admin' ? `[admin] ${p.name}` : p.name, p.look, p.x, p.y); if (this.playing) ui.toast.push(`${p.name}님이 왔어요!`, 'heart'); }
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
      case 'roster': this.renderRoster(); if (phone.app === 'friends') phone.refresh(); break;
      case 'left': this.removeRemote(e.id); this.renderRoster(); break;
      case 'anim': this.remotes.get(e.id)?.playOnce(e.anim, e.dir, undefined, 99); break;
      case 'chat': {
        ui.chat.add(e.name, e.text, e.from === me.id ? '#9bd165' : e.from === 'server' ? '#7cc45a' : '#ffe58a');
        const who: Character | undefined = e.from === me.id ? this.player : this.remotes.get(e.from);
        who?.say(e.text, this.zoom);
        break;
      }
      case 'correct': this.player.setPosition(e.x, e.y); this.player.stopStep(); break;
      case 'adminReport': sfx.play('mailbox'); ui.toast.push(`🐞 새 버그 신고: ${e.report.name} — ${e.report.text.slice(0, 30)}`, 'heart'); phone.onReport(); break;
      case 'reported': ui.toast.push('버그 신고를 보냈어요. 고마워요!', 'heart'); break;
      case 'reconnecting':
        // 잠깐 끊김: 조작만 멈추고 자동 재접속을 기다림 (진행 상황은 서버에 그대로)
        this.playing = false; this.player.stopStep();
        ui.banner.show('연결이 잠깐 끊겼어요', '다시 연결하는 중… 잠시만 기다려 주세요');
        break;
      case 'reconnected': {
        ui.toast.push('서버에 다시 연결됐어요! 이어서 플레이해요.', 'heart');
        // 서버가 기억하는 위치(끊기기 직전)에서 이어서: 그 방을 다시 그림
        const me2 = this.auth.me;
        if (this.battling) { this.scene.stop('Battle'); this.battling = false; }
        phone.close(); ui.dialogue.close(false);
        this.scene.restart({ authority: this.auth, map: me2.map, pos: { x: me2.x, y: me2.y }, fromRoom: true } satisfies SceneData);
        break;
      }
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
    ui.roster.render([{ id: me.id, name: this.auth.isAdmin ? `[admin] ${me.name}` : me.name, where: this.whereText(me), me: true }, ...[...this.auth.roster.values()].map((p: RosterEntry) => ({ id: p.id, name: p.title === 'admin' ? `[admin] ${p.name}` : p.name, where: this.whereText(p) }))]);
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
      online: this.auth.online, isOwner: this.auth.farmOwner === me.id, story: me.mode === 'story',
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
    if (this.playing && (this.lastTick += dt) > 2000) { this.lastTick = 0; this.writeLast(); }
    if (this.playing && (this.musicTick += dt) > 3000) { this.musicTick = 0; this.playMapMusic(); }
    // 싱글플레이는 타이틀 화면/화면 전환 중에는 시간이 흐르지 않음 (멀티는 서버 시계)
    if (this.playing || this.auth.online) this.auth.update(dt);
    const k = this.keys;
    const canMove = this.playing && !ui.confirm.open && !ui.dialogue.open && !ui.chat.typing && !ui.shop.open && !this.battling && !this.fishing && !ui.party.open;
    // 키보드(-1/0/1) + 모바일 조이스틱(연속값) → 합쳐서 -1~1 로. 대각선은 Player.move 에서 속도를 맞춤
    const clamp1 = (n: number) => Math.max(-1, Math.min(1, n));
    const vx = canMove ? clamp1((k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + touch.vx) : 0;
    const vy = canMove ? clamp1((k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + touch.vy) : 0;
    const run = k.SHIFT.isDown || touch.run;
    this.player.move(dt, { vx, vy, run }, this.npcs.filter((n) => n.state !== 'gone' && n.sprite.visible));
    this.player.update();
    if (this.playing) this.auth.sendMove(this.player.x, this.player.y, this.player.dir, this.player.anim);
    if (this.player.moving) this.farm?.brush(this.player.x, this.player.y);
    this.checkWarp();
    if (this.playing && !this.battling) { this.checkEncounter(); this.checkTrainers(); }
    this.partner?.update(dt, this.player, this.player.moving);
    this.story.update(dt);
    this.plot.update(dt);
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
    if (this.world.interior) this.world.updateWindows(this.auth.time.minutes, this.auth.time.weather);
    this.atmo.follow(this.player.x, this.player.y);
    this.atmo.update(dt, minutes);
    this.updateCursor();
    this.stage3d?.update(dt, {
      player: this.player,
      partner: this.partner,
      npcs: this.npcs,
      trainers: this.trainers,
      storyActors: this.story.getActors(),
      plotActors: this.plot.getActors(),
      remotes: this.remotes.values(),
      remotePartners: this.remotePartners.values(),
      chickens: this.chickens,
      ducks: this.ducks,
      forage: this.forageSprites.values(),
      crops: this.farm?.getCrops(),
      tiles: this.farm?.getTiles(),
      legend: this.legendSprite,
      dish: this.dishSprite,
      bobber: this.fishing?.bobber,
      cursor: this.cursor,
      minutes,
      weather: this.auth.time.weather,
    });
  }

  private updateCursor() {
    if (!this.playing || ui.dialogue.open || ui.shop.open || this.battling || this.fishing) { this.cursor.setVisible(false); ui.hint.set(null); return; }
    const p = this.input.activePointer;
    const cell = this.time.now - this.lastPointerMove < 2500 ? this.pointerCell(p) : undefined;
    const [tx, ty] = cell ?? this.player.facingCell();
    const it = this.auth.me.inventory[this.slot]?.itemId;
    const type = it ? ITEMS[it].type : null;
    const tool = it ? ITEMS[it].tool : undefined;
    const show = (this.mapId === 'farm' && (type === 'tool' || type === 'seed')) || (this.fieldMap && (type === 'seed' || tool === 'hoe' || tool === 'watering_can')) || tool === 'pickaxe' || tool === 'rod';
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
    this.healAt('한별 박사', '연구실에서 루미들을 돌봐 줬다네. 모두 기운이 넘치는군!', () => void this.learnFrom('hanbyeol'));
  }

  /** 공방 NPC에게 배울 수 있는 제작법이 있으면 배움 */
  private async learnFrom(npc: string) {
    const r = await this.auth.request({ kind: 'learn', npc });
    const n = r.data?.qty ?? 0; const t = TEACHERS[npc];
    if (!t) return;
    if (n > 0) { sfx.play('item'); this.say(t.teach, t.name); }
  }

  /** 작업대 창: 집(전부) · 볼 공방(민수) · 연구소(한별 박사) */
  private openCraft(where: 'home' | 'smithy' | 'lab') {
    this.player.play('idle');
    const keeper = where === 'smithy' ? NPCS.minsu : where === 'lab' ? NPCS.hanbyeol : undefined;
    const title = where === 'home' ? '나의 작업대' : where === 'smithy' ? '민수의 볼 공방' : '한별 연구소 · 약품 조합기';
    const sub = where === 'home' ? '밭에서 키운 약초와 캐 온 광석으로 직접 만들어요.' : where === 'smithy' ? '"화덕은 마음껏 써. 배운 대로만 하면 볼은 절대 안 깨져."' : '"조합 비율만 지키면 누구나 좋은 약을 만들 수 있다네."';
    ui.craft.show({ title, sub, keeper: keeper ? { sprite: keeper.sprite, name: keeper.name } : undefined, teacher: where === 'home' ? undefined : keeper?.id,
      me: () => this.auth.me, onCraft: (id, times) => { void this.auth.request({ kind: 'craft', recipe: id, times }).then((res) => { if (res.ok) sfx.play(where === 'smithy' ? 'craft_fire' : where === 'lab' ? 'craft_lab' : 'craft_bench'); else sfx.play('error'); ui.craft.refresh(); }); } });
  }

  /** 마을 숙소: 혼자면 다음 날 아침까지 · 멀티는 시간은 그대로(서버 시계) 회복만 */
  private stayInn() {
    const online = this.auth.online;
    ui.confirm.show(`숙소 주인: "어서 오세요! 하룻밤 500G예요."\n${online ? '(멀티: 시간은 그대로, 루미와 체력만 회복)' : '(아침까지 푹 자고 루미와 체력을 모두 회복)'}`, () => {
      void this.auth.request({ kind: 'inn' }).then((r) => {
        if (!r.ok) { sfx.play('error'); return; }
        sfx.play('bed');
        this.cameras.main.fadeOut(500, 0, 0, 0);
        this.time.delayedCall(700, () => {
          this.cameras.main.fadeIn(600, 0, 0, 0);
          music.jingle('jingle_heal');
          this.partner?.cheer(2);
          ui.toast.push(r.reason === 'slept' ? '푹 자고 일어났어요! 상쾌한 아침이에요. (루미 · 체력 완전 회복)' : '잠깐 눈을 붙였어요. 루미와 체력이 모두 회복됐어요!', 'heart');
        });
      });
    }, { yes: '묵을게요 (500G)', no: '괜찮아요' });
  }

  /** 지금 있는 공용 실내(센터 · 마트)가 어느 마을 건물인지 — 방 이름(inst)이 '바깥맵:건물번호' */
  private townOfRoom() { return (this.auth.me.inst ?? '').split(':')[0]; }
  /** 이 마을 루미 센터 간호사: 이름 · 직함은 shared/data/illust.json 의 nurse_<마을>, 도트 외형은 tools/art/staff.mjs */
  private centerNurse(): { name: string; title: string; sprite: string } | null {
    const id = `nurse_${this.townOfRoom()}`;
    const spec = (ILLUST_SPEC as Record<string, { name: string; role: string } | undefined>)[id];
    if (!spec) return null;
    return { name: spec.name.replace(/\s*간호사$/, ''), title: spec.role, sprite: this.manifest.characters[id] ? id : 'nurse' };
  }

  /** 비전 기술: 파트너가 대신 써 줌 → 권한자가 확인하면 장애물이 (내 화면에서) 사라짐 */
  private useSkill(o: WorldObject, id: string) {
    const sk = SKILLS[id], lumi = SPECIES[this.auth.me.party[0]?.species ?? '']?.name ?? '루미';
    this.player.playOnce('interact', this.player.dir, () => {
      void this.auth.request({ kind: 'skill', objectId: o.id }).then((r) => {
        if (!r.ok) { if (r.reason === 'far') ui.toast.push('바로 앞에 서서 써 주세요.', 'heart'); return; }
        this.partner?.cheer(2);
        sfx.play(id === 'cut' ? 'axe' : id === 'smash' ? 'rock_break' : 'hop');
        this.cameras.main.shake(id === 'smash' ? 220 : 90, id === 'smash' ? 0.006 : 0.002);
        ui.toast.push(sk.use.replaceAll('{lumi}', lumi), 'lumi');
      });
    }, 1);
  }

  private healAt(who: string, line: string, after?: () => void, sprite?: string) {
    if (!this.auth.me.party.length) { this.say(['돌봐 줄 루미가 아직 없어요.'], who); return; }
    void this.auth.request({ kind: 'heal' }).then(() => {
      this.partner?.cheer(2);
      this.cameras.main.flash(300, 255, 240, 250);
      sfx.play('heal_machine');
      music.jingle('jingle_heal');
      this.player.play('idle');
      ui.dialogue.show({ name: who, pages: [line], sprite: sprite ?? (who === '한별 박사' ? 'professor' : who === '다온' ? 'nurse' : undefined) }, after);
    });
  }

  private talkTrainer(t: Trainer) {
    t.faceTo(this.player.x, this.player.y);
    if (t.def.id === 'champion' && this.auth.me.defeated.includes('champion')) { this.masterTalk(t); return; }
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

  private caughtSp(sp: string) { const me = this.auth.me; return me.caught.includes(sp) || me.party.some((c) => c.species === sp) || me.box.some((c) => c.species === sp); }
  /** 루미 마스터 하람: 도감을 완성하면 재대결 (전원 Lv.100) */
  private masterTalk(t: Trainer) {
    const me = this.auth.me;
    const need = Object.keys(SPECIES).filter((id) => id !== MYTH);
    const have = need.filter((id) => me.caught.includes(id)).length;
    if (!dexComplete(me)) { this.say([`${t.def.name}: "챔피언 자리는 네 거야. 그래도 루미나 지방의 루미를 전부 만나 봤어?"`, `${t.def.name}: "루미 도감을 다 채우면(${have}/${need.length}) 다시 와. 그땐 내 진짜 팀으로 상대해 줄게."`], t.def.name); return; }
    this.playing = false;
    ui.dialogue.show({ name: `루미 마스터 ${t.def.name}`, sprite: t.def.sprite, color: '#e0a43a', pages: ['…도감을 전부 채웠구나. 하나 누나 밭에서 시작한 아이가.', '좋아. 루미 마스터의 시련이다. 전원 만렙(Lv.100) — 이번엔 봐주지 않아!'] }, async () => {
      const r = await this.auth.request({ kind: 'rematch' });
      if (r.battle) this.startBattle(r.battle); else { this.playing = true; if (r.reason === 'no-lumi') ui.toast.push('싸울 수 있는 루미가 없어요. 먼저 회복하세요.', 'lumi'); }
    });
  }
  /** 별의 제단: 챔피언 → 전설 별무리 · 오카리나 → 환상 온누리 */
  private altarInteraction(o: WorldObject): { label: string; run: () => void } {
    const me = this.auth.me, has = (k: string) => me.flags.includes(k);
    const hasFlute = me.inventory.some((s) => s.itemId === 'ocarina');
    if (has('genesis_awake') && !this.caughtSp(MYTH)) return { label: label('제네시스에게 말을 건다'), run: () => void this.genesisBattle() };
    if (has(QUESTS.finale.boss) && hasFlute && !this.caughtSp(MYTH)) return { label: label('시련의 오카리나 불기'), run: () => void this.genesisScene() };
    if (!me.defeated.includes('champion')) return { label: label('별의 제단 살펴보기'), run: () => this.say([o.text ?? '별의 제단.', '(루미 리그의 챔피언이 되면 이곳에 무언가가 내려온다고 한다…)']) };
    if (!this.caughtSp(LEGEND)) return { label: label('별의 제단에 손을 얹기'), run: () => this.legendScene() };
    const lit = Object.keys(QUESTS.spires).filter((d) => has(`lit_${d}`)).length;
    return { label: label('별의 제단 살펴보기'), run: () => this.say(this.caughtSp(MYTH) ? ['제단 위로 따스한 햇살이 고요히 흐른다.', '제네시스와 별무리가 지켜보는 듯하다.'] : hasFlute ? ['제단 한가운데에 네 방향을 가리키는 홈이 파여 있다.', `(동서남북 네 탑의 빛이 모이면 무슨 일이 생길 것 같다 — 지금 ${lit}/4)`] : ['별무리가 머물던 자리에 별가루가 반짝인다.', '(별마루산 미로 끝에서 누군가 기다리고 있다는 소문이 있다…)']) };
  }
  private legendScene() {
    if (!this.auth.me.party.some((c) => c.hp > 0)) { this.say(['싸울 수 있는 루미가 없다. 먼저 회복하고 오자.']); return; }
    this.playing = false; phone.close();
    sfx.play('sparkle');
    const cam = this.cameras.main;
    cam.shake(900, 0.004); cam.flash(1200, 200, 210, 255);
    this.time.delayedCall(1300, async () => {
      const r = await this.auth.request({ kind: 'legend' });
      if (r.battle) this.startBattle(r.battle); else this.playing = true;
    });
  }
  // ── 사이드 스토리: 전설 스텔라 · 시련의 오카리나 · 네 탑 · 제네시스 ──
  private legendSprite?: Phaser.GameObjects.Sprite;
  private legendId = '';
  private get fieldMap() { return this.mapId === 'farm' || this.world.info.farmZones.length > 0; }
  /** 맵에 서 있는 전설: 별의 요람의 스텔라 · 별의 제단에 깨어난 제네시스 */
  private spawnLegends() {
    this.legendSprite = undefined; this.legendId = '';
    const me = this.auth.me;
    const put = (id: string, key: string, x: number, y: number, scale: number) => {
      if (!this.textures.exists(key)) return;
      const s = this.add.sprite(x, y, key, 0).setOrigin(0.5, 92 / 96).setScale(scale).setDepth(y);
      if (this.anims.exists(`${key}:idle`)) s.play(`${key}:idle`);
      this.tweens.add({ targets: s, y: y - 3, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.legendSprite = s; this.legendId = id;
    };
    if (this.mapId === 'stella_nest' && !this.caughtSp(STELLA)) { const sp = this.world.info.spawns.get('stella'); if (sp) put('stella', 'lumi_big_stella', sp.x, sp.y + 10, 0.5); }
    if (this.mapId === 'altar' && me.flags.includes('genesis_awake') && !this.caughtSp(MYTH)) { const a = this.world.objects.find((o) => o.interact === 'altar'); if (a) put('genesis', 'lumi_big_onnuri', a.sprite.x, a.sprite.y - 14, 0.8); }
    // 빛이 켜진 탑 꼭대기: 빛줄기
    const top = /^spire_(\w)_top$/.exec(this.mapId);
    if (top && me.flags.includes(`lit_${top[1]}`)) this.spireBeam(top[1], false);
  }
  private spireBeam(d: string, burst: boolean) {
    const ped = this.world.objects.find((o) => (o.interact ?? '').startsWith('spire_top:')); if (!ped) return;
    const col = Phaser.Display.Color.HexStringToColor(QUESTS.spires[d]?.color ?? '#ffe58a').color;
    const x = ped.sprite.x, y = ped.sprite.y - 10;
    const beam = this.add.rectangle(x, y, 10, 400, col, 0.55).setOrigin(0.5, 1).setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
    const glow = this.add.rectangle(x, y, 26, 400, col, 0.22).setOrigin(0.5, 1).setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
    if (burst) { beam.setScale(0.1, 0); glow.setScale(0.1, 0); this.tweens.add({ targets: [beam, glow], scaleX: 1, scaleY: 1, duration: 900, ease: 'Cubic.Out' }); }
    this.tweens.add({ targets: [beam, glow], alpha: { from: 0.75, to: 0.35 }, duration: 1100, yoyo: true, repeat: -1 });
  }
  private hasFlute() { return this.auth.me.inventory.some((s) => s.itemId === 'ocarina'); }
  /** 가방에서 오카리나를 꺼내 불었을 때: 있는 곳에 맞는 연주 */
  private fluteAnywhere() {
    const seal = /^spire_(\w)$/.exec(this.mapId), top = /^spire_(\w)_top$/.exec(this.mapId), me = this.auth.me;
    if (seal && !me.flags.includes(`open_${seal[1]}`)) { void this.sealScene(seal[1], QUESTS.gates[`spire_${seal[1]}_2f`]?.msg ?? ''); return; }
    if (top && !me.flags.includes(`lit_${top[1]}`)) { void this.spireTopScene(top[1]); return; }
    if (this.mapId === 'altar' && me.flags.includes(QUESTS.finale.boss) && !me.flags.includes('genesis_awake')) { void this.genesisScene(); return; }
    sfx.play('ocarina');
    const got = Object.values(QUESTS.spires).filter((sp) => me.flags.includes(sp.boss)).map((sp) => sp.score);
    this.say(['시련의 오카리나를 불어 보았다. 맑은 소리가 멀리 퍼진다.', got.length ? `가진 악보: ${got.join(', ')}${me.flags.includes(QUESTS.finale.boss) ? `, ${QUESTS.finale.score}` : ''}` : '(악보가 있어야 제대로 된 선율을 불 수 있을 것 같다. 동서남북 네 탑을 찾아가 보자)']);
  }
  /** 탑 입구의 봉인된 계단: 그 탑의 악보대로 오카리나를 불면 열림 */
  private async sealScene(d: string, msg: string) {
    const sp = QUESTS.spires[d]; if (!sp) return;
    if (!this.hasFlute() || !this.auth.me.flags.includes(sp.boss)) { this.say([msg, '(이 탑의 악보가 있어야 봉인을 풀 수 있을 것 같다)']); return; }
    this.playing = false; phone.close(); ui.dialogue.close(false);
    const ok = await playFlute(sp.score, sp.notes, sp.color);
    if (ok && (await this.auth.request({ kind: 'flute', at: `seal:${d}` })).ok) {
      sfx.play('sparkle'); this.cameras.main.flash(700, 255, 250, 220);
      await ui.dialogue.say({ name: '', pages: ['봉인이 빛의 가루가 되어 흩어졌다!', '위로 가는 계단이 열렸다.'] });
    }
    this.playing = true;
  }
  private spireTopInteraction(d: string, o: WorldObject): { label: string; run: () => void } {
    const lit = this.auth.me.flags.includes(`lit_${d}`);
    if (lit || !this.hasFlute()) return { label: label('빛받이 살펴보기'), run: () => this.say(lit ? ['빛받이에서 빛줄기가 하늘로 솟고 있다.', '빛은 별마루산 꼭대기 쪽으로 휘어 간다.'] : [o.text ?? '오래된 빛받이.']) };
    return { label: label('시련의 오카리나 불기'), run: () => void this.spireTopScene(d) };
  }
  /** 탑 꼭대기에서 오카리나를 불면: 탑이 흔들리고 빛이 켜짐 */
  private async spireTopScene(d: string) {
    const sp = QUESTS.spires[d]; if (!sp) return;
    this.playing = false; phone.close(); ui.dialogue.close(false);
    const ok = await playFlute(sp.score, sp.notes, sp.color);
    const r = ok ? await this.auth.request({ kind: 'flute', at: `top:${d}` }) : { ok: false as const };
    if (r.ok) {
      const cam = this.cameras.main;
      sfx.play('roar'); cam.shake(2200, 0.012);
      await new Promise((res) => this.time.delayedCall(1500, res));
      sfx.play('sparkle'); cam.flash(900, 255, 250, 220);
      this.spireBeam(d, true);
      await new Promise((res) => this.time.delayedCall(1100, res));
      const n = Object.keys(QUESTS.spires).filter((k) => this.auth.me.flags.includes(`lit_${k}`)).length;
      const left = Object.entries(QUESTS.spires).filter(([k]) => !this.auth.me.flags.includes(`lit_${k}`)).map(([, v]) => v.name);
      await ui.dialogue.say({ name: '', pages: ['탑이 크게 흔들리더니, 빛받이에서 빛줄기가 솟아올랐다!', n >= 4 ? '네 줄기 빛이 별마루산 꼭대기, 별의 제단으로 모이고 있다…!' : `${sp.name}의 빛이 켜졌다. (${n}/4 · 남은 탑: ${left.join(', ')})`] });
    }
    this.playing = true;
  }
  /** 별의 요람: 잠든 스텔라를 깨움 */
  private async stellaScene() {
    if (!this.auth.me.party.some((c) => c.hp > 0)) { this.say(['싸울 수 있는 루미가 없다. 먼저 회복하고 오자.']); return; }
    this.playing = false; phone.close();
    sfx.play('sparkle'); this.cameras.main.flash(900, 220, 230, 255);
    await new Promise((res) => this.time.delayedCall(900, res));
    const r = await this.auth.request({ kind: 'stella' });
    if (r.battle) this.startBattle(r.battle, () => { if (this.caughtSp(STELLA)) { this.legendSprite?.destroy(); this.legendSprite = undefined; } });
    else { this.playing = true; this.say(['루미는 깊이 잠들어 있다. 아직 때가 아닌 것 같다.']); }
  }
  /** 마지막 선율: 안개 · 번개 · 섬뜩한 음악 속에서 제네시스가 서서히 모습을 드러냄 */
  private async genesisScene() {
    if (this.mapId !== 'altar') return;
    this.playing = false; phone.close(); ui.dialogue.close(false);
    this.player.play('idle', 'up');
    const ok = await playFlute(QUESTS.finale.score, QUESTS.finale.notes, '#e8d8ff');
    if (!ok || !(await this.auth.request({ kind: 'flute', at: 'altar' })).ok) { this.playing = true; return; }
    const cam = this.cameras.main, wait = (ms: number) => new Promise((res) => this.time.delayedCall(ms, res));
    music.stop();
    await wait(900);
    const fx = stormFx();
    fx.gather();
    music.play('omen');
    await wait(2600);
    await ui.dialogue.say({ name: '', pages: ['…오카리나 소리가 멎자, 바람이 멈췄다.', '안개가 제단을 삼키기 시작한다.'] });
    for (const [gap, power] of [[900, 0.006], [1500, 0.01], [700, 0.008], [1800, 0.016]] as const) { await wait(gap); fx.bolt(); sfx.play('roar'); cam.shake(500, power); }
    await wait(1000);
    await ui.dialogue.say({ name: '', pages: ['하늘이 갈라지는 소리가 난다.', '무언가가… 내려오고 있다.'] });
    this.spawnLegends();
    const g = this.legendSprite;
    if (g) { g.setAlpha(0).setTint(0x18102a); this.tweens.add({ targets: g, alpha: 1, duration: 6000, ease: 'Sine.easeIn' }); this.tweens.addCounter({ from: 0, to: 100, duration: 7000, onUpdate: (t) => { const v = Math.round(24 + ((t.getValue() ?? 0) / 100) * 231); g.setTint(Phaser.Display.Color.GetColor(v, v, v)); }, onComplete: () => g.clearTint() }); }
    await wait(1800); fx.bolt(); cam.shake(700, 0.02); sfx.play('roar');
    await wait(2600); fx.thin();
    await wait(2800); fx.bolt(); cam.shake(400, 0.01);
    await wait(1200);
    await ui.dialogue.say({ name: '', pages: ['안개 속에서 거대한 그림자가 이쪽을 내려다보고 있다.', '태초의 루미, 제네시스.', '(말을 걸면 승부가 시작된다. 단단히 준비하고 다가가자)'] });
    fx.end(2500);
    this.playing = true;
  }
  private async genesisBattle() {
    if (!this.auth.me.party.some((c) => c.hp > 0)) { this.say(['싸울 수 있는 루미가 없다. 먼저 회복하고 오자.']); return; }
    this.playing = false; phone.close();
    await ui.dialogue.say({ name: '제네시스', pages: ['………………', '(머릿속에 직접 울리는 소리. 「보여 다오, 작은 별의 아이야.」)'] });
    this.cameras.main.shake(900, 0.012); sfx.play('roar');
    await new Promise((res) => this.time.delayedCall(900, res));
    const r = await this.auth.request({ kind: 'ocarina' });
    if (r.battle) this.startBattle(r.battle, () => { if (this.caughtSp(MYTH)) void this.genesisFinale(); });
    else this.playing = true;
  }
  /** 포획 완료: 안개가 걷히고 햇살 → 카메라가 주인공에게 다가감 → 볼을 들어 올림 → 사이드 퀘스트 클리어 */
  private async genesisFinale() {
    this.playing = false;
    this.legendSprite?.destroy(); this.legendSprite = undefined;
    const cam = this.cameras.main, wait = (ms: number) => new Promise((res) => this.time.delayedCall(ms, res)), p = this.player;
    music.play('homecoming');
    const fx = stormFx(); fx.gather();
    await wait(600);
    fx.clear();
    p.play('idle', 'down');
    const z = cam.zoom;
    cam.zoomTo(z * 1.7, 3200, 'Sine.easeInOut');
    await wait(3000);
    // 루미볼을 번쩍 들어 올림
    const key = this.textures.exists('jar_throw') ? 'jar_throw' : 'sparkle';
    const ball = this.add.image(p.x, p.y - 14, key).setDepth(p.y + 500).setScale(0.9);
    p.playOnce('interact', 'down', () => p.play('idle', 'down'), 1);
    this.tweens.add({ targets: ball, y: p.y - 30, duration: 500, ease: 'Back.Out' });
    sfx.play('catch'); cam.flash(600, 255, 244, 190);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, s = this.add.image(ball.x, p.y - 30, 'sparkle').setDepth(p.y + 501).setScale(0.6); this.tweens.add({ targets: s, x: ball.x + Math.cos(a) * 26, y: p.y - 30 + Math.sin(a) * 20, alpha: 0, duration: 1100, onComplete: () => s.destroy() }); }
    await wait(700);
    music.jingle('jingle_badge');
    questClear('제네시스 포획 완료', '사이드 퀘스트 「태초의 선율」 클리어');
    captureMemory(this, this.auth.me.id, 'side_genesis', '태초의 루미 제네시스');
    await wait(5200);
    this.tweens.add({ targets: ball, alpha: 0, duration: 500, onComplete: () => ball.destroy() });
    cam.zoomTo(z, 1600, 'Sine.easeInOut');
    fx.end(2500);
    await wait(1700);
    await ui.dialogue.say({ name: '', pages: ['제단 위로 햇살이 쏟아진다. 루미나 지방의 모든 별빛이 한 번 반짝였다.', '— 별빛의 씨앗 이야기, 진짜 끝 —'] });
    this.playing = true; this.playMapMusic();
  }
  // ── 마을 주민 호감도: 이야기 → 부탁(사이드 스토리) → 텃밭 도우미 ──
  private async handTalk(npc: Npc) {
    const def = npc.def, id = def.id, me = this.auth.me, t = this.auth.time;
    this.player.play('idle', facingFromVector(npc.x - this.player.x, npc.y - this.player.y, this.player.dir));
    npc.beginTalk(this.player.x, this.player.y, t.day);
    this.playing = false;
    await this.auth.request({ kind: 'talk', npc: id });
    const bond = () => me.bonds?.[id] ?? 0;
    const who = () => ({ name: def.name, title: bond() >= BOND_MAX ? `${MAP_NAMES[this.mapId] ?? ''} 텃밭 도우미` : def.title, sprite: def.sprite, color: def.color, hearts: Math.floor(bond() / 2) });
    const step = me.asks?.[id] ?? 0, a = def.asks?.[step];
    const pages: string[] = [];
    // 도우미가 맡아 둔 수확물
    const stock = me.stock?.[this.mapId];
    if (stock && Object.keys(stock).length) {
      await ui.dialogue.say({ ...who(), pages: [`텃밭에서 거둔 걸 맡아 뒀어. ${Object.entries(stock).map(([it, n]) => `${ITEMS[it]?.name ?? it} ${n}개`).join(', ')}!`] });
      const r = await this.auth.request({ kind: 'collect', map: this.mapId }); if (r.ok) sfx.play('harvest');
    }
    if (a && bond() >= (BOND_ASK_AT[step] ?? 0)) {
      const have = me.inventory.reduce((n, s) => n + (s.itemId === a.item ? s.quantity : 0), 0);
      await ui.dialogue.say({ ...who(), pages: [`「${def.story}」 ${step + 1}/${def.asks!.length}`, ...a.ask, `(부탁: ${ITEMS[a.item]?.name ?? a.item} ${have}/${a.qty}개)`] });
      if (have >= a.qty) {
        const yes = await new Promise<boolean>((res) => ui.confirm.show(`${ITEMS[a.item]?.name} ${a.qty}개를 건네줄까요?`, () => res(true), { yes: '건네준다', no: '다음에', onNo: () => res(false) }));
        if (yes && (await this.auth.request({ kind: 'ask', npc: id })).ok) {
          sfx.play('item');
          await ui.dialogue.say({ ...who(), pages: a.thanks });
          if (bond() >= BOND_MAX && def.full) await ui.dialogue.say({ ...who(), pages: def.full });
        }
      }
    } else {
      if (bond() >= BOND_MAX && def.full && Math.random() < 0.5) pages.push(...def.full);
      else pages.push(...npc.pickLines(t.minutes, t.weather));
      if (a) pages.push(`(조금 더 친해지면 속 얘기를 들려줄 것 같다 — 하트 ${Math.ceil((BOND_ASK_AT[step] ?? 0) / 2)}개부터. 매일 이야기를 나눠 보자)`);
      else if (bond() < BOND_MAX) pages.push('(매일 이야기를 나누면 더 가까워질 것 같다)');
      await ui.dialogue.say({ ...who(), pages });
    }
    npc.endTalk();
    this.playing = true;
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
    touch.setVisible(false);
    this.cancelFishing();
    ui.dialogue.close(false); ui.shop.close(); ui.party.close(); phone.close();
    this.auth.sendAnim('interact', this.player.dir);
    // 화면 깜빡임 전환 → 배틀 씬
    const cam = this.cameras.main;
    cam.flash(160, 255, 255, 255);
    sfx.play('encounter');
    music.play(update.view.foe.species === MYTH ? 'battle_genesis' : SPECIES[update.view.foe.species]?.legend || update.view.trainer?.title === '루미 마스터' ? 'battle_champion' : battleTrack(update.view.kind, update.view.trainer?.title));
    this.time.delayedCall(180, () => cam.flash(160, 255, 255, 255));
    this.time.delayedCall(420, () => {
      const data: BattleData = {
        auth: this.auth, update,
        onEnd: (ended) => {
          this.battling = false;
          this.stage3d?.setBattleHidden(false);
          touch.setVisible(true);
          this.playMapMusic();
          if (this.badgeJingle) { this.badgeJingle = false; music.jingle('jingle_badge'); const b = this.auth.me.badges.at(-1); if (b && this.auth.me.mode === 'story') this.time.delayedCall(600, () => captureMemory(this, this.auth.me.id, b, `${ITEMS[b]?.name ?? '배지'} 획득`)); }
          this.scene.resume();
          if (this.pendingRoom) { this.pendingRoom = false; this.goRoom(); return; }
          this.cameras.main.fadeIn(350);
          this.playing = true;
          after?.();
          this.syncPartner();
          this.time.delayedCall(500, () => this.plot.check());   // 관장을 이긴 뒤 이어지는 사건
          if (ended === 'caught') ui.toast.push('새 루미가 친구가 됐어요! (P: 나의 루미)', 'lumi');
        },
      };
      this.stage3d?.setBattleHidden(true);
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
    sfx.play('cast');
    this.player.busy = true;
    this.player.play('fish', this.player.dir, false);
    const bobber = this.add.circle(this.player.x, this.player.y - 20, 2, 0xff5a5a).setStrokeStyle(1, 0xffffff).setDepth(ty * TILE + 20);
    const fishHelp = SPECIES[this.auth.me.party[0]?.species]?.helps === 'fish';
    this.fishing = { phase: 'cast', t: 0, tx, ty, bobber, window: fishHelp ? 1400 : 950 };
    this.tweens.add({ targets: bobber, x: tx * TILE + 8, y: ty * TILE + 9, duration: 450, ease: 'Quad.Out', onComplete: () => {
      if (!this.fishing) return;
      sfx.play('plop');
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
      sfx.play('fish_lose'); ui.toast.push('앗, 놓쳤다...', 'rod'); this.cancelFishing();
    }
  }
  private async reel() {
    const f = this.fishing; if (!f) return;
    if (f.phase !== 'bite') { sfx.play('fish_lose'); ui.toast.push('너무 일찍 당겼어요!', 'rod'); this.cancelFishing(); return; }
    const { tx, ty } = f;
    this.cancelFishing();
    this.player.playOnce('interact', this.player.dir, undefined, 99);
    sfx.play('reel');
    const r = await this.auth.request({ kind: 'fish', tx, ty });
    if (r.ok && !r.battle) this.time.delayedCall(360, () => sfx.play('fish_catch'));
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
      if (r.ok) { sfx.play('forage'); this.partnerHelpFx(); }
    }, 1);
  }
}
