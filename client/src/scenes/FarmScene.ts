import Phaser from 'phaser';
import { ITEMS, NPCS, QUESTS, SHOPS, SKILLS, SPECIES, TRAINERS, martFor, nextEvent } from '@shared/data';
import { MapInfo, type TiledMap, type WarpDef } from '@shared/sim/MapInfo';
import { BADGE_GATES, BOND_ASK_AT, BOND_MAX, DIR_VEC, INTERIOR_OF, MAP_IDS, MAP_META, MAP_NAMES, PRISON_FLOOR_LABEL, SoilState, isCasinoOpen, isHomeMap, isPrisonMap, roomOf, type BattleUpdate, type CasinoGame, type MapId } from '@shared/types';
import type { RosterEntry } from '@shared/protocol';
import { DEPTH, TILE, pickZoom, type Manifest } from '../config';
import { Atmosphere } from '../fx/Atmosphere';
import { FarmRenderer } from '../farm/FarmRenderer';
import { Chicken, Duck, WaterLumi } from '../entities/Animals';
import { Character, facingFromVector } from '../entities/Character';
import { Npc } from '../entities/Npc';
import { Partner } from '../entities/Partner';
import { PrisonWarden } from '../entities/PrisonWarden';
import { Trainer } from '../entities/Trainer';
import type { BattleData } from './BattleScene';
import { Player } from '../entities/Player';
import { RemotePlayer } from '../entities/RemotePlayer';
import { Authority, LocalAuthority, NetworkAuthority, type AuthorityEvent } from '../net/Authority';
import { touch } from '../ui/Touch';
import { ui, setIconIds, formatTime } from '../ui/UI';
import { phone } from '../ui/Phone';
import type { TitleHandle } from '../ui/UI';
import { sfx } from '../audio/Sfx';
import { battleTrack, music, trackFor } from '../audio/Music';
import { StoryDirector, clearStorySeen } from '../story/StoryDirector';
import { applyUiTheme } from '../ui/Theme';
import { pgCheckoutModal } from '../ui/PgCheckoutModal';
import { casinoModal } from '../ui/Casino';
import { purchaseAllWithAdminCash, purchaseBmItemWithCash, runPgSystemTest } from '../net/bmApi';
import { EventDirector, VILLAIN_CAST } from '../story/EventDirector';
import { captureMemory } from '../story/Memories';
import { STORY } from '@shared/story';
import { EVIL_STACK_MAX, LEGEND, MYTH, PRISON_LABOR_GOAL, STELLA, SEA_LEGEND, dexComplete } from '@shared/sim/FarmSimulation';
import { playFlute } from '../ui/Flute';
import { stormFx, questClear } from '../fx/Storm';
import { playBattleIntro, playInteractFx, showAreaPlate, type EncounterEnv } from '../fx/CinematicFx';
import type { BurstKind } from '../three/Fx3D';
import { World, type WorldObject } from '../world/World';
import { extraNpcsForMap, houseOwnerName, townCafeKeeper, townShopKeeper } from '../world/TownCast';
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
  stump: '오래된 그루터기. 도끼로 치울 수 있다.', log: '쓰러진 커다란 통나무. 구리 도끼 이상이면 치울 수 있을 것 같다.',
  planter: '마을 사람들이 정성껏 가꾼 꽃 화분.', cafe_table: '루나 카페의 야외 테이블. 커피 향이 은은하다.',
  stall: '광장의 무인 가판대.', stall_b: '광장의 무인 가판대.',
  oak_autumn: '붉게 물든 단풍나무. 사계절 내내 잎이 지지 않는다고 한다.', pine_snow: '눈을 소복이 뒤집어쓴 전나무.',
  palm: '바닷바람에 흔들리는 야자수.', cactus: '가시가 따끔한 선인장. 꼭대기에 분홍 꽃이 피었다.', dead_tree: '잎이 다 떨어진 앙상한 나무.',
  reeds: '바람에 서걱거리는 갈대.', ruin_pillar: '이끼 낀 오래된 돌기둥. 알 수 없는 문양이 새겨져 있다.', ruin_broken: '부서진 돌기둥의 밑동.',
  cave_mouth: '서늘한 바람이 불어 나오는 동굴 입구.', portal: '일렁이는 보랏빛 틈. 저 너머는 위아래가 뒤집혀 있다…', stairs_up: '위로 이어지는 돌계단.',
};
const LETTER = ['[별빛 마을 이장님의 편지]\n\n열다섯 번째 생일을 진심으로 축하한다!\n이제 너도 어엿한 루미 트레이너란다.\n(우편함에서 친구에게 농장·집 초대장을 보낼 수 있어요)', '별빛 마을 트레이너의 전통을 잊지 말거라.\n밭에서 루미풀을 길러 회복약을, 바위에서 광석을 캐 루미볼을 —\n집 작업대에서 직접 만들어 길을 떠나는 것이란다.', '배지를 모을수록 민수의 볼 공방과 한별 박사의 연구소에서\n더 좋은 제작법을 배울 수 있을 게다.\n\n— 오 이장 드림'];
const label = (t: string) => `<b class="text-[#ffe58a]">E</b> ${t}`;

interface SceneData { authority?: Authority; map?: MapId; spawn?: string; pos?: { x: number; y: number }; fromRoom?: boolean }
/** 이웃집 주인 이름 (실내 맵은 여러 집이 같은 배치를 쓰므로 들어갈 때 기억) */
let houseOwner = '';

/** 방 이동 효과음: 실내 문(종류별) · 동굴 입구 · 계단 · 바깥 길(소리 없음) */
const BELL_DOORS = new Set(['in_store', 'in_cafe', 'in_shop_w', 'in_casino']);
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
  private waterLumis: WaterLumi[] = [];
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
  private bikeZoneEntered = false;
  private badgeJingle = false;
  private fishing?: { phase: 'cast' | 'wait' | 'bite'; t: number; tx: number; ty: number; bobber: Phaser.GameObjects.Arc; window: number };
  private blades?: Phaser.GameObjects.Image;
  private dishSprite?: Phaser.GameObjects.Image;
  private pendingRoom = false;
  private lastTabDown = 0;
  private story!: StoryDirector;
  private plot!: EventDirector;   // 본편 사건 (chapters.json)
  private stage3d?: Stage3D;
  private openGates = new Set<string>();
  private flippedRails = new Set<string>();
  private revealedCards = new Set<number>();
  private matchedCards = new Set<number>();
  private pickedCards: { id: number; gateId: string; key: string }[] = [];
  private cardFlipLockUntil = 0;
  private prismRots = new Map<number, number>();
  private litLaserDests = new Set<number>();
  private laserSegments: [number, number, number, number][] = [];
  private runeStep = 0;
  private runeSteps = new Map<string, number>();
  private litRune: number | null = null;
  private runeDemoPlaying = false;
  private quizWrongUntil = 0;
  private stepGimmickLock = '';
  private padLock = '';
  private arrowLock = '';
  private switchLock = '';
  private waterLevel = 0;
  private pushBlocks = new Map<number, { x: number; y: number; group: string; gateId: string; locked: boolean }>();
  private pushHoldMs = 0;
  private pushHoldTarget = 0;
  private pushingBlock = false;
  private crackedTiles = new Set<number>();
  private crackedCellLock = '';
  private npcActions = new Map<string, 'craft' | 'shop'>();
  private pendingBattleMeta?: { trainerId?: string; portrait?: string; fromFish?: boolean };
  private lastEnvStepCell = '';
  private envStepCooldown = 0;
  private wardens: PrisonWarden[] = [];
  private prisonHud?: HTMLDivElement;
  private prisonCaughtLockUntil = 0;
  private cellWaitMs = 0;
  private cellOfferShown = false;
  private stairsLock = false;
  private homeMom?: Character;
  private yardGuard?: Character;
  private noteSprite?: Phaser.GameObjects.Image;
  private cheatFreezing = false;
  private cheatWatchAcc = 0;
  /** 손에 든 가방 칸 (핫바 대신 휴대폰 › 가방 또는 Q/1~6 으로 빠르게 고름) */
  private get slot() { return this.selected; }

  constructor() { super('Farm'); }

  create(data: SceneData) {
    this.manifest = this.cache.json.get('manifest') as Manifest;
    setIconIds(this.manifest.spritesheets.icons.ids ?? []);
    this.npcs = []; this.chickens = []; this.ducks = []; this.waterLumis = []; this.wardens = []; this.remotes.clear(); this.playing = false; this.warping = false;
    this.prisonHud?.remove(); this.prisonHud = undefined; this.prisonCaughtLockUntil = 0; this.cellWaitMs = 0; this.cellOfferShown = false; this.stairsLock = false;
    this.homeMom = undefined; this.yardGuard = undefined; this.noteSprite = undefined; this.cheatFreezing = false; this.cheatWatchAcc = 0;
    this.trainers = []; this.remotePartners.clear(); this.forageSprites.clear(); this.partner = undefined; this.fishing = undefined; this.battling = false; this.lastCell = '';
    this.openGates.clear(); this.padLock = ''; this.arrowLock = ''; this.switchLock = '';
    this.flippedRails.clear(); this.revealedCards.clear(); this.matchedCards.clear(); this.pickedCards = [];
    this.cardFlipLockUntil = 0; this.prismRots.clear(); this.litLaserDests.clear(); this.laserSegments = [];
    this.runeStep = 0; this.runeSteps.clear(); this.litRune = null; this.runeDemoPlaying = false; this.quizWrongUntil = 0; this.stepGimmickLock = '';
    this.waterLevel = 0; this.pushBlocks.clear(); this.pushHoldMs = 0; this.pushHoldTarget = 0; this.pushingBlock = false;
    this.crackedTiles.clear(); this.crackedCellLock = '';
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
      // 순수 물 위만 허용(다리·부두·고체 장애물 절대 제외) — 오리 & 해양/수생 루미 공통 규칙
      const isWater = (px: number, py: number) => info.isOpenWaterPx(px, py, 7);
      for (const s of info.spawnList.filter((o) => o.name === 'duck')) this.ducks.push(new Duck(this, s.x, s.y, isWater));
      // 호수·해변·해신의 바다에 서식하는 야생 수생/해양 루미 스폰 (다리·육지 절대 침범 금지)
      if (!this.world.interior && !this.world.cave && this.world.biome !== 'distortion') {
        const isSea = this.mapId === 'ocean_shrine' || this.world.biome === 'beach' || ['harbor', 'shell', 'cape', 'fullmoon', 'newmoon'].includes(this.mapId);
        const pool = isSea ? ['w1a', 'w1b', 'w2a', 'w4a', 'w5a', 'chalang'] : ['pongpong', 'mallang', 'w3a', 'w1a'];
        const want = this.mapId === 'ocean_shrine' ? 10 : isSea ? 5 : 3;
        const cands: [number, number][] = [];
        for (let wy = 3; wy < info.height - 3; wy += 2) {
          for (let wx = 3; wx < info.width - 3; wx += 2) {
            const px = wx * TILE + 8, py = wy * TILE + 8;
            if (!info.isOpenWaterPx(px, py, 10)) continue;
            if (info.seaCurrentAt(wx, wy) || info.whirlpoolAt(wx, wy)) continue;
            cands.push([px, py]);
          }
        }
        if (cands.length >= 2) {
          let h = 2166136261;
          for (let i = 0; i < this.mapId.length; i++) h = Math.imul(h ^ this.mapId.charCodeAt(i), 16777619);
          const step = Math.max(1, Math.floor(cands.length / want));
          const placed: [number, number][] = [];
          for (let i = 0; i < cands.length && placed.length < want; i++) {
            const idx = (Math.abs(h) + i * step) % cands.length;
            const [px, py] = cands[idx];
            if (placed.some(([qx, qy]) => Math.hypot(qx - px, qy - py) < 52)) continue;
            placed.push([px, py]);
            const spId = pool[(placed.length + Math.abs(h)) % pool.length];
            this.waterLumis.push(new WaterLumi(this, spId, px, py, (qx, qy) => info.isOpenWaterPx(qx, qy, 8)));
          }
        }
      }
    }

    // 플레이어 시작 위치: 워프 도착 지점 > (멀티) 서버 위치 > 맵 기본 스폰
    const sp = data?.spawn ? info.spawns.get(data.spawn) : undefined;
    const titleAt = !data?.authority && !data?.pos && this.titleStart && this.titleStart.map === this.mapId ? { x: this.titleStart.x, y: this.titleStart.y } : undefined;
    const start = data?.pos ?? titleAt ?? (sp ? { x: sp.x, y: sp.y + 5 }
      : this.auth.me.x ? { x: this.auth.me.x, y: this.auth.me.y }
      : { x: (info.spawns.get('player') ?? farmSpawn).x, y: (info.spawns.get('player') ?? farmSpawn).y + 5 });
    const look = this.manifest.characters[this.auth.me.look] ? this.auth.me.look : 'm1';
    this.player = new Player(this, look, start.x, start.y, this.manifest.characters[look], this.world.grid);
    this.player.riding = !!this.auth.me.riding && !this.world.interior && !this.world.cave;
    this.player.bubbleSkin = this.auth.me.chatBubble ?? 'default';
    this.syncPlayerLabel();
    this.player.onStep = (run) => {
      if (this.playing && !this.player.riding) {
        const surf = this.world.surfaceAt(this.player.x, this.player.y);
        sfx.step(surf, run);
        this.emitEnvStepFx(surf);
      }
    };
    this.player.onHop = () => { sfx.play('hop'); this.stage3d?.ring(this.player.x, this.player.y, 0xfff0b0, 0.9, 0.35); };
    this.player.onDust = (x, y) => this.stage3d?.burst('dust', x, y);
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
    this.npcActions.clear();
    if (this.mapId !== 'farm') {
      const occupiedCells = new Set<string>();
      for (const base of Object.values(NPCS)) {
        // 루미 센터는 마을마다 다른 간호사, 루미 마트(in_shop_w)는 마을마다 다른 한국어 점주(shop_<마을>)
        const nurse = base.id === 'daon' && this.mapId === 'in_center' ? this.centerNurse() : null;
        const martKeeper = base.id === 'gureum' && this.mapId === 'in_shop_w' ? townShopKeeper(this.townOfRoom()) : null;
        let def = nurse
          ? { ...base, name: nurse.name, title: nurse.title, sprite: nurse.sprite, portrait: nurse.sprite }
          : martKeeper
            ? { ...base, name: martKeeper.name, title: martKeeper.title, sprite: this.manifest.characters[martKeeper.sprite] ? martKeeper.sprite : 'villager', portrait: martKeeper.portrait }
            : base;
        if (!this.manifest.characters[def.sprite]) continue;
        if (def.gen && def.schedule[0]?.map !== this.mapId) continue;   // 생성된 주민은 자기 마을에만
        // 호감도를 다 쌓은 주민은 텃밭 도우미: 텃밭 곁에서 밭일을 함
        const helper = !!def.hand && (this.auth.me.bonds?.[def.id] ?? 0) >= BOND_MAX && info.spawns.has('wp_hand');
        if (helper) { const spot = this.npcs.some((q) => q.def.title.endsWith('텃밭 도우미')) ? 'wp_plot' : 'wp_hand'; Object.assign(def = { ...def }, { title: `${MAP_NAMES[this.mapId] ?? ''} 텃밭 도우미`, schedule: [{ time: 600, map: this.mapId, to: spot, idle: 'work', work: 'water', radius: 2 }] }); }
        const n = new Npc(this, def, this.manifest.characters[def.sprite], this.world.grid, info.spawns, this.zoom, this.mapId);
        n.resetForDay(this.auth.time.minutes);
        if (n.state !== 'gone') { const [cx, cy] = n.cell(); occupiedCells.add(`${cx},${cy}`); }
        this.npcs.push(n);
      }
      // 마을 안내원(guide_*) · 공방장인(craft_*) · 지역 박사(prof_*) · 대도시 시민(city_*) · 이웃집 주민(extra_*) 동적 배치
      const extras = extraNpcsForMap(this.mapId, this.auth.me.inst ?? '', info, this.manifest.characters, occupiedCells, houseOwner);
      if (extras.length) {
        const dynSpawns = new Map(info.spawns);
        for (const ex of extras) {
          const wpKey = ex.def.schedule[0]?.to;
          if (wpKey && !dynSpawns.has(wpKey)) dynSpawns.set(wpKey, { x: ex.cell[0] * TILE + 8, y: ex.cell[1] * TILE + 8 });
          if (!this.manifest.characters[ex.def.sprite]) continue;
          const n = new Npc(this, ex.def, this.manifest.characters[ex.def.sprite], this.world.grid, dynSpawns, this.zoom, this.mapId);
          n.resetForDay(this.auth.time.minutes);
          if (ex.action) this.npcActions.set(ex.def.id, ex.action);
          this.npcs.push(n);
        }
      }
    }
    this.spawnLegends();
    this.spawnPrison();
    this.spawnHomeMom();
    this.atmo = new Atmosphere(this, this.world);
    this.atmo.setWeather(this.auth.time.weather);
    this.stage3d = new Stage3D(this, this.manifest, this.world, this.mapId);
    if (this.farm) this.farm.onFx = (k, tx, ty) => this.stage3d?.burst(k, tx * TILE + 8, ty * TILE + 8);
    this.initGymPuzzleState();

    const cam = this.cameras.main;
    cam.setZoom(this.zoom).setRoundPixels(true).setBackgroundColor(this.world.interior || this.world.cave ? '#0d0a0c' : '#14201a');
    this.fitCamera();
    this.renderDish();
    this.scale.on('resize', this.onResize, this);
    const onHide = () => this.writeLast();
    window.addEventListener('pagehide', onHide);
    this.events.once('shutdown', () => window.removeEventListener('pagehide', onHide));
    this.events.once('shutdown', () => { this.prisonHud?.remove(); this.prisonHud = undefined; for (const w of this.wardens) w.destroy(); this.wardens = []; this.homeMom?.destroy(); this.homeMom = undefined; this.yardGuard?.destroy(); this.yardGuard = undefined; this.noteSprite?.destroy(); this.noteSprite = undefined; this.stage3d?.destroy(); this.scale.off('resize', this.onResize, this); this.input.keyboard?.off('keydown'); this.input.off('pointerdown'); this.input.off('pointermove'); this.input.off('wheel'); });

    this.setupInput();
    const unsubscribe = this.auth.on((e) => this.onAuthority(e));
    this.events.once('shutdown', unsubscribe);

    if (data?.authority || !titleMode) {
      if (!data?.authority) {
        this.withCharacter(this.auth, () => this.scene.restart({ authority: this.auth, map: this.auth.me.map, pos: { x: this.auth.me.x, y: this.auth.me.y } } satisfies SceneData));
      } else {
        this.begin(!!(data?.spawn || data?.fromRoom));
      }
    } else this.titleScreen();
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
    if (dev) t.setUser(dev);
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
    if (auth.tamperDetectedReason) { this.triggerCheatFreeze(auth.tamperDetectedReason, true); return; }
    if (auth.me.look) { next(); return; }
    if (auth.me.jailed) { auth.me.look = 'm1'; next(); return; }
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
    applyUiTheme(this.auth.me.uiTheme);
    this.playMapMusic();
    ui.hud.time(this.auth.time); ui.hud.gold(this.auth.gold); ui.hud.energy(this.auth.me.energy, this.auth.me.maxEnergy);
    ui.hotbar.onClick = () => { if (this.hasPhone()) phone.toggle('bag'); };
    if (firstTime) this.selected = -1;   // 접속하면 빈손으로 시작 (가방에서 골라 듦)
    this.ensureHeld();
    this.setupPhone();
    this.syncNoticeHud();
    this.updatePrisonHud();
    ui.hotbar.render(this.auth.me.inventory, this.selected);
    // 저장 파일 재화 변조가 감지되었다면 접속 즉시 1초 과부하 프리징 + 치트 알림 발동!
    if (this.auth.tamperDetectedReason) {
      this.triggerCheatFreeze(this.auth.tamperDetectedReason, true);
      return;
    }
    // 성실 노역 석방 / 악행스택 0 달성 후 집 입장 시 엄마 귀가 컷신 자동 재생!
    if (this.mapId === 'home' && this.auth.me.inst === this.auth.me.id && this.auth.me.pendingHomecoming && !this.auth.me.momLeft) {
      this.playing = false;
      this.time.delayedCall(450, () => void this.playHomecomingCutscene());
      return;
    }
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
    const meta = MAP_META[this.mapId] ?? { kind: 'route', biome: 'meadow', tier: 1 };
    showAreaPlate(title, sub, meta.kind, meta.biome, this.mapId);
    // 개발/테스트용 시각 연출 프리뷰 핸들 (저장 데이터 변경 없음)
    (window as unknown as Record<string, unknown>).__lumiFx = {
      playBattleIntro,
      playInteractFx,
      showAreaPlate,
      ring: (col = 0xffe58a) => this.stage3d?.ring(this.player.x, this.player.y, col, 1.8, 0.55),
      burst: (kind: BurstKind = 'sparkle') => this.stage3d?.burst(kind, this.player.x, this.player.y, 10),
    };
    if (firstTime) ui.toast.push('루미 스텔라에 오신 걸 환영해요! (H: 조작법 · Esc: 메뉴)', 'heart');
    if (EventDirector.pendingEpilogue && this.mapId === 'farm') { this.playing = false; this.cameras.main.setAlpha(1); void this.plot.epilogue(); return; }
    // 씬 진입 직후 필수 스토리 컷신/사건이 대기 중이면 350~900ms 동안 워프 이탈하지 못하도록 조작 잠금
    const me = this.auth.me, own = me.inst === me.id;
    const willPrologue = !!me.look && me.story < STORY.DONE && (
      (this.mapId === 'home_2f' && own && me.story === STORY.HOME) ||
      (this.mapId === 'home' && own && me.story === STORY.HOME) ||
      (this.mapId === 'town' && (me.story === STORY.RACE || me.story === STORY.HOME)) ||
      (this.mapId === 'in_lab' && (me.story === STORY.MEET || me.story === STORY.HALL || me.story === STORY.PHONE || me.story === STORY.RACE))
    );
    const [px, py] = this.player.cell();
    const willEvent = (me.mode ?? 'story') === 'story' && !!nextEvent({ ...me, map: this.mapId }, this.mapId, { x: px, y: py });
    if (willPrologue || willEvent) this.playing = false;
    this.time.delayedCall(fromWarp ? 350 : 900, () => {
      this.story.begin();
      this.plot.check();
      // 만약 컷신 조건이 이미 소모(예: seen)되어 시작되지 않았다면 즉시 조작 복원
      this.time.delayedCall(50, () => { if (!this.warping && !this.battling && !this.story.isBusy() && !this.plot.isBusy() && !ui.dialogue.open) this.playing = true; });
    });
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
  private hasPhone() { return this.auth.me.story >= STORY.PHONE || this.auth.isAdmin || !!this.auth.me.jailed || (this.auth.me.notices?.length ?? 0) > 0; }
  /** 휴대폰: 이 씬(맵)이 바뀔 때마다 새 문맥으로 연결 */
  private setupPhone() {
    phone.setCtx({
      me: () => this.auth.me,
      time: () => this.auth.time,
      here: () => {
        // 실내면 그 건물이 있는 바깥 맵 위치로
        const me = this.auth.me, meta = MAP_META[me.map];
        const id = isHomeMap(me.map) ? 'farm' : meta?.interior && !meta.x ? (me.inst.split(':')[0] || me.ret?.map || 'town') : me.map;
        const owner = (me.map === 'farm' || isHomeMap(me.map)) && me.inst !== me.id ? ` (${this.auth.roster.get(me.inst)?.name ?? '친구'}님네)` : '';
        return { id, owner };
      },
      mapUnlocked: () => this.auth.me.story >= STORY.HALL,
      roster: () => { const me = this.auth.me; return [{ id: me.id, name: me.name, where: this.whereText(me), me: true }, ...[...this.auth.roster.values()].map((p: RosterEntry) => ({ id: p.id, name: p.name, where: this.whereText(p) }))]; },
      online: () => this.auth.online,
      storage: () => this.auth.storageKind,
      canSave: () => this.auth instanceof LocalAuthority,
      setPartner: (i) => { void this.auth.request({ kind: 'setPartner', index: i }).then(() => { this.syncPartner(); phone.refresh(); }); },
      partySwap: (a, b) => { void this.auth.request({ kind: 'partySwap', a, b }).then(() => { this.syncPartner(); phone.refresh(); }); },
      boxSwap: async (partyIndex, boxIndex) => {
        const r = await this.auth.request({ kind: 'boxSwap', partyIndex, boxIndex });
        if (r.ok) { sfx.play('confirm'); this.syncPartner(); phone.refresh(); return true; }
        sfx.play('error');
        if (r.reason === 'need-alive') ui.toast.push('파티에는 싸울 수 있는 루미가 1마리 이상 있어야 해요!', 'lumi');
        return false;
      },
      boxDeposit: async (partyIndex) => {
        const r = await this.auth.request({ kind: 'boxDeposit', partyIndex });
        if (r.ok) { sfx.play('confirm'); this.syncPartner(); phone.refresh(); return true; }
        sfx.play('error');
        if (r.reason === 'last-lumi') ui.toast.push('파티의 마지막 루미는 맡길 수 없어요.', 'lumi');
        else if (r.reason === 'need-alive') ui.toast.push('파티에는 싸울 수 있는 루미가 1마리 이상 남아 있어야 해요!', 'lumi');
        return false;
      },
      boxWithdraw: async (boxIndex) => {
        const r = await this.auth.request({ kind: 'boxWithdraw', boxIndex });
        if (r.ok) { sfx.play('confirm'); this.syncPartner(); phone.refresh(); return true; }
        sfx.play('error');
        if (r.reason === 'party-full') ui.toast.push('파티가 이미 6마리 가득 찼어요. [파티와 교체]를 써 보세요!', 'lumi');
        return false;
      },
      boxRelease: async (boxIndex) => {
        const r = await this.auth.request({ kind: 'boxRelease', boxIndex });
        if (r.ok) { sfx.play('tap'); phone.refresh(); return true; }
        sfx.play('error');
        return false;
      },
      useBagItem: async (itemId, partyIndex) => {
        const r = await this.auth.request({ kind: 'useBagItem', itemId, partyIndex });
        if (r.ok) { sfx.play('heal_machine'); this.partner?.cheer(2); phone.refresh(); return true; }
        sfx.play('error');
        if (r.reason === 'full-hp') ui.toast.push('이미 체력이 가득 차 있어요!', 'heart');
        else if (r.reason === 'fainted') ui.toast.push('기절한 루미는 루미 센터나 내 집 침대에서 회복해 주세요.', 'lumi');
        return false;
      },
      fastTravel: async (to) => {
        const r = await this.auth.request({ kind: 'fastTravel', to });
        if (r.ok) { sfx.play('dash'); return true; }
        sfx.play('error');
        if (r.reason === 'in-cave') ui.toast.push('동굴 안에서는 택시를 부를 수 없어요. [동굴 탈출]을 써 주세요!', 'heart');
        else if (r.reason === 'jailed') ui.toast.push('⛓️ 별빛 교도소에 수감 중에는 빠른 이동을 할 수 없어요! 탈옥을 먼저 완료하세요.', 'heart');
        else if (r.reason === 'need-partner') ui.toast.push('프롤로그를 마친 뒤 빠른 이동을 쓸 수 있어요.', 'lumi');
        else if (r.reason === 'not-visited') ui.toast.push('직접 가 본 마을로만 이동할 수 있어요.', 'heart');
        return false;
      },
      escapeCave: async () => {
        const r = await this.auth.request({ kind: 'escapeCave' });
        if (r.ok) { sfx.play('dash'); return true; }
        sfx.play('error');
        return false;
      },
      inCave: () => this.world.info.props.cave === 'true',
      save: () => this.saveNow(),
      reset: () => void this.resetSave(),
      toTitle: () => this.toTitle(),
      held: () => this.selected,
      bagActions: (slot) => this.bagActions(slot),
      report: (text, extra) => this.auth.report(text, `${this.world.title || this.mapId} · ${this.auth.time.day}일 ${Math.floor(this.auth.time.minutes / 60)}시`, extra),
      markNoticesRead: () => { void this.auth.request({ kind: 'markNoticesRead' }).then(() => { this.syncNoticeHud(); phone.refresh(); }); },
      isAdmin: () => this.auth.isAdmin,
      admin: (cmd) => this.auth.admin(cmd),
      buyCashPack: (pack) => void pgCheckoutModal.openCashPack(this.auth, pack, () => { phone.refresh(); }),
      buyBm: async (product) => {
        const r = await purchaseBmItemWithCash(this.auth, product);
        if (r.ok) {
          sfx.play('confirm');
          if (product.category === 'theme') applyUiTheme(this.auth.me.uiTheme);
          else if (product.category === 'outfit') this.applyMyLook(this.auth.me.look, this.auth.me.name);
          else if (product.category === 'lumi') this.syncPartner();
          phone.refresh();
          return true;
        }
        sfx.play('error');
        ui.toast.push(r.error ?? '구매에 실패했어요.', 'heart');
        phone.refresh();
        return false;
      },
      equipBm: (category, itemId) => {
        if (category === 'item') return;
        void this.auth.request({ kind: 'equipCosmetic', category, itemId }).then((r) => {
          if (r.ok) {
            if (category === 'theme') applyUiTheme(itemId);
            else if (category === 'outfit') this.applyMyLook(itemId, this.auth.me.name);
            else if (category === 'bubble') this.player.bubbleSkin = itemId || 'default';
            this.syncPartner();
            phone.refresh();
          } else ui.toast.push('보유하지 않은 코디예요.', 'heart');
        });
      },
      previewBm: (category, itemId) => {
        const me = this.auth.me;
        if (!category || !itemId) {
          applyUiTheme(me.uiTheme);
          const curSheet = this.manifest.characters[me.look] ? me.look : 'm1';
          this.player?.setSheet(curSheet, this.manifest.characters[curSheet]);
          this.player.bubbleSkin = me.chatBubble ?? 'default';
          this.syncPartner();
          return;
        }
        if (category === 'theme') {
          applyUiTheme(itemId);
        } else if (category === 'outfit') {
          const sh = this.manifest.characters[itemId] ? itemId : 'm1';
          this.player?.setSheet(sh, this.manifest.characters[sh]);
        } else if (category === 'lumi') {
          this.partner?.setCoord(itemId);
        } else if (category === 'bubble') {
          this.player.bubbleSkin = itemId;
          this.player.say('예쁜 말풍선 미리보기♪', this.zoom);
        }
      },
      changeName: async (newName) => {
        const r = await this.auth.request({ kind: 'changeName', name: newName });
        if (r.ok) {
          sfx.play('confirm');
          this.applyMyLook(this.auth.me.look, this.auth.me.name);
          phone.refresh();
          return { ok: true, name: this.auth.me.name };
        }
        sfx.play('error');
        return { ok: false, error: r.reason === 'no-ticket' ? '닉네임 변경권이 없어요! 상점에서 먼저 구매해 주세요.' : '새 닉네임을 입력해 주세요.' };
      },
      useCandy: async (partyIndex) => {
        const r = await this.auth.request({ kind: 'useCandy', partyIndex });
        if (r.ok) {
          sfx.play('item');
          music.jingle('jingle_heal');
          this.partner?.cheer(4);
          this.syncPartner();
          phone.refresh();
          return true;
        }
        sfx.play('error');
        return false;
      },
      buyAllBmCash: async () => {
        const r = await purchaseAllWithAdminCash(this.auth);
        if (r.ok) {
          sfx.play('confirm');
          ui.toast.push(`전 상품 ${r.boughtCount ?? 0}종 캐쉬 구매 완료! 상점에서 바로 적용할 수 있어요.`, 'heart');
        } else {
          sfx.play('error');
          ui.toast.push(r.error ?? '일괄 구매 실패', 'heart');
        }
        phone.refresh();
        return r;
      },
      testPgSystem: () => runPgSystemTest(this.auth),
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
    try { localStorage.removeItem(FarmScene.LAST_KEY); } catch { /* 무시 */ }
    clearStorySeen();
    applyUiTheme('rural');
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
    if (this.mapId === 'home_2f') return owner ? [`${owner}님의 다락방`, '아늑한 2층 다락방이에요'] : ['내 방 (2층 다락방)', '오른쪽 계단을 내려가 1층으로 가요'];
    if (this.mapId === 'home') return owner ? [`${owner}님의 집`, '식탁에 음식을 차려 같이 먹어요'] : ['나의 집', '1층 거실 · 부엌 · 작업대 · 식탁'];
    if (this.mapId.startsWith('in_house') && houseOwner) return [`${houseOwner}의 집`, ''];
    return [this.world.title || MAP_NAMES[this.mapId], this.mapId === 'town' ? '호숫가의 작은 마을' : ''];
  }

  // ── 입력 ────────────────────────────────────────────
  /** 키 하나 처리 (키보드 · 모바일 터치 버튼 공용) */
  private onKey(e: KeyboardEvent) {
      if (ui.chat.typing) return;
      // 대화창 선택지: 숫자 1~4로 즉시 선택
      if (ui.dialogue.waitingChoice && !this.battling && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        if (!e.repeat) ui.dialogue.pickChoice(Number(e.key) - 1);
        return;
      }
      // 대화창: 컷신 중(조작 잠김)에도 Space · E · Enter · 클릭으로 넘김
      if (ui.dialogue.open && !this.battling && [' ', 'e', 'E', 'x', 'X', 'c', 'C', 'Enter'].includes(e.key)) {
        e.preventDefault();
        if (!e.repeat && !ui.dialogue.waitingChoice) ui.dialogue.advance();
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
        if (pgCheckoutModal.open) pgCheckoutModal.close(); else if (casinoModal.open) { if (!casinoModal.busy) casinoModal.close(); } else if (ui.menu.open) ui.menu.close(); else if (ui.craft.open) ui.craft.close(); else if (phone.open) phone.back(); else if (ui.emoteWheel.open) ui.emoteWheel.close(); else if (ui.mailbox.open) ui.mailbox.close(); else if (ui.shop.open) ui.shop.close(); else if (ui.party.open) ui.party.close(); else if (ui.dialogue.open) ui.dialogue.close(); else if (this.hasPhone()) phone.show('home'); else this.openMenu();
        return;
      }
      if (ui.menu.open) return;
      if (e.key === 'r' || e.key === 'R') { this.openPhone('home', true); return; }
      if (e.key === 'm' || e.key === 'M') { this.openPhone('map'); return; }
      if (pgCheckoutModal.open || casinoModal.open || ui.shop.open || ui.mailbox.open || ui.creator.open) return;
      if (this.fishing && [' ', 'e', 'E', 'c', 'C', 'x', 'X'].includes(e.key)) { this.reel(); return; }
      if (!ui.dialogue.open && (e.key === 'q' || e.key === 'Q')) { if (!e.repeat) this.cycleTool(); return; }
      if (!ui.dialogue.open && /^[1-6]$/.test(e.key)) { if (!e.repeat) this.pickQuickTool(Number(e.key) - 1); return; }
      if (!ui.dialogue.open && e.key === '0') { if (!e.repeat) { this.select(-1); sfx.play('tap'); } return; }
      if (e.key === 'b' || e.key === 'B') { if (this.playing && !this.battling) void this.toggleBike(); return; }
      if (e.key === 'p' || e.key === 'P') { if (this.hasPhone()) phone.toggle('party'); else ui.party.toggle(this.auth.me, (i) => void this.auth.request({ kind: 'setPartner', index: i })); return; }
      if (e.key === 'h' || e.key === 'H') { if (this.hasPhone()) phone.toggle('help'); else ui.help.toggle(); }
      if (e.key === 'l' || e.key === 'L') ui.roster.toggle();
      if (e.key === 'Enter') { ui.chat.toggle(true); e.preventDefault(); }
      if (e.key === ' ' || e.key === 'c' || e.key === 'C') { if (ui.dialogue.open) { if (!ui.dialogue.waitingChoice) ui.dialogue.advance(); } else this.useItem(); }
      if (e.key === 'e' || e.key === 'E' || e.key === 'x' || e.key === 'X') { if (ui.dialogue.open) { if (!ui.dialogue.waitingChoice) ui.dialogue.advance(); } else this.interact(); }
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
      if (!this.playing || pgCheckoutModal.open || casinoModal.open || ui.shop.open || this.battling || ui.emoteWheel.open || ui.mailbox.open || ui.creator.open) return;
      if (this.fishing) { this.reel(); return; }
      if (ui.dialogue.open) { ui.dialogue.advance(); return; }
      if (p.rightButtonDown()) this.interact(this.pointerCell(p)); else this.useItem(this.pointerCell(p));
    });
  }

  private select(i: number) { this.selected = i; ui.hotbar.render(this.auth.me.inventory, i); phone.refresh(); }
  /** 보유한 도구·씨앗 슬롯 인덱스 목록 (도구 우선 → 씨앗 순) */
  private quickSlots(): number[] {
    const tools: number[] = [], seeds: number[] = [];
    this.auth.me.inventory.forEach((s, i) => {
      const it = s.itemId ? ITEMS[s.itemId] : null;
      if (!it || !s.quantity) return;
      if (it.type === 'tool') tools.push(i);
      else if (it.type === 'seed') seeds.push(i);
    });
    return [...tools, ...seeds];
  }
  /** 보유한 특정 종류 도구 중 가장 좋은 등급의 슬롯 (-1 = 없음) */
  private bestToolSlot(kind: string): number {
    let best = -1, bt = -1;
    this.auth.me.inventory.forEach((s, i) => {
      const d = s.itemId ? ITEMS[s.itemId] : null;
      if (d?.tool === kind && (d.tier ?? 0) > bt) { bt = d.tier ?? 0; best = i; }
    });
    return best;
  }
  /** Q 키: 보유한 도구·씨앗을 순서대로 순환 */
  private cycleTool() {
    const list = this.quickSlots();
    if (!list.length) { ui.toast.push('보유한 도구나 씨앗이 없어요. 별빛 마을 소라네 루미 마트에서 구매해 보세요!', 'hoe'); return; }
    const pos = list.indexOf(this.selected);
    const next = list[(pos + 1) % list.length];
    this.select(next);
    sfx.play('tap');
    const it = ITEMS[this.auth.me.inventory[next].itemId!];
    if (it) ui.toast.push(`${it.name} 장착! (Space 사용)`, it.icon);
  }
  /** 1~6 숫자 키: 보유한 도구·씨앗 중 해당 번째 바로 장착 */
  private pickQuickTool(idx: number) {
    const list = this.quickSlots();
    const slot = list[idx];
    if (slot == null) return;
    this.select(slot);
    sfx.play('tap');
  }
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
    if (this.player.busy || ui.dialogue.open || ui.shop.open || casinoModal.open) return;
    // 별빛 교도소(B5~1F · 노역 채광장)에서는 빈손이어도 Space 로 금이 간 벽·외벽·돌·나무에 바로 상호작용!
    if (isPrisonMap(this.mapId)) {
      const [px, py] = this.faceCell(cell);
      const po = this.world.objectAt(px, py);
      if (po) {
        if (po.type === 'cracked_wall' || po.interact === 'prison_wall') { this.breakPrisonWall(po); return; }
        if (po.type === 'prison_exit_wall' || po.interact === 'prison_escape_wall') { this.breakEscapeWall(po); return; }
        if (po.type === 'yard_stone' || po.interact === 'yard_stone') { this.gatherYard(po, 'stone'); return; }
        if (po.type === 'yard_wood' || po.interact === 'yard_wood') { this.gatherYard(po, 'wood'); return; }
        if (po.type === 'prison_ore' || po.interact === 'prison_ore') { this.minePrisonOre(po); return; }
      }
    }
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
        if (r.ok) {
          const mk = this.world.mineKind(o);
          sfx.play('rock_break');
          this.cameras.main.shake(110, 0.004);
          this.fxPop(o.sprite.x, o.sprite.y, 'rock', mk !== 'stone' ? 0xffe478 : 0xc8c0b4, 1.3);
          if (mk !== 'stone') {
            this.stage3d?.burst('magic', o.sprite.x, o.sprite.y, 12);
            this.time.delayedCall(180, () => sfx.play('sparkle'));
          }
          this.chips(o);
          this.partnerHelpFx();
        } else this.world.shake(o, 1);
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
          if (r.ok) {
            this.world.shake(o, o.tall ? 1 : 2);
            this.chips(o);
            if (o.tall) this.leaves(o);
            if (r.reason === 'felled') {
              sfx.play('rock_break');
              this.cameras.main.shake(120, 0.004);
              this.stage3d?.ring(o.sprite.x, o.sprite.y, 0xd8a868, 1.5, 0.45);
            }
          }
          else if (r.reason === 'too-big') this.world.shake(o, 1);
        } else {
          // 괭이로 잡초를 치면 뽑힘
          const weed = item.tool === 'hoe' && this.mapId === 'farm' ? this.world.weedAt(tx, ty) : undefined;
          if (weed) {
            void this.auth.request({ kind: 'pull', objectId: weed.id }).then((r) => {
              if (r.ok) { sfx.play('forage'); this.fxPop(tx * TILE + 8, ty * TILE + 10, 'grass', 0x7ce060, 0.9); }
            });
            return;
          }
          const r = await this.auth.request({ kind: 'useTool', slot: this.slot, tx, ty });
          if (r.ok) {
            if (item.tool === 'watering_can') this.fxPop(tx * TILE + 8, ty * TILE + 10, 'splash', 0x58c8ff, 1.15);
            else this.fxPop(tx * TILE + 8, ty * TILE + 10, 'dirt', 0xc89a5a, 0.85);
          } else if (r.reason === 'cannot-till') this.thunk(tx, ty);
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
        if (r.ok) { n++; this.fxPop(x * TILE + 8, y * TILE + 10, 'grass', 0x7ee060, 0.85); } else if (r.reason === 'season') break;
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
    if (item.id === 'star_candy') {
      out.push({
        label: '파트너 루미 Lv.+1 올리기',
        run: () => {
          void this.auth.request({ kind: 'useCandy', partyIndex: 0 }).then((r) => {
            if (r.ok) { sfx.play('item'); music.jingle('jingle_heal'); this.partner?.cheer(4); this.syncPartner(); phone.refresh(); }
            else sfx.play('error');
          });
        },
        primary: true,
      });
      out.push({ label: '다른 루미에게 쓰기 (상점 탭)', run: () => { phone.shopTab = 'item'; phone.show('shop'); } });
    } else if (item.type === 'food') {
      out.push({ label: '먹기', run: () => this.eatSlot(slot), primary: true });
    }
    if (item.id === 'name_ticket') out.push({ label: '닉네임 변경하기', run: () => { phone.shopTab = 'item'; phone.show('shop'); }, primary: true });
    if (item.id === 'ocarina') out.push({ label: '불기', run: () => this.fluteAnywhere(), primary: true });
    if (item.id === 'bicycle') out.push({ label: this.player.riding ? '내리기' : '타기 (B)', run: () => { phone.close(); void this.toggleBike(); }, primary: true });
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
    if (this.homeMom?.sprite.active && Math.hypot(this.homeMom.x - fx, this.homeMom.y - fy) < 18) {
      return { label: label('엄마와 대화하기'), run: () => this.talkHomeMom() };
    }
    if (this.yardGuard?.sprite.active && Math.hypot(this.yardGuard.x - fx, this.yardGuard.y - fy) < 18) {
      return { label: label('👮 교도소 감독관과 대화하기'), run: () => this.talkYardGuard() };
    }
    const tile = this.farm?.get(tx, ty);
    if (tile?.crop && tile.crop.stage >= 4) return { label: label('수확하기'), run: () => this.harvest(tx, ty) };
    const [px, py] = this.player.cell();
    const standTile = this.farm?.get(px, py);
    if (standTile?.crop && standTile.crop.stage >= 4) return { label: label('수확하기'), run: () => this.harvest(px, py) };
    const o = this.world.objectAt(tx, ty) ?? this.world.objectAt(px, py)
      ?? this.world.interactAt(tx, ty) ?? this.world.interactAt(px, py);
    if (o) {
      // 바위·광맥: 곡괭이가 있으면 E 한 번으로 자동 장착 + 즉시 채광!
      const mk = this.world.mineKind(o);
      if (mk) {
        const pick = this.bestToolSlot('pickaxe');
        if (pick >= 0) return { label: label(`채광하기 (${ITEMS[this.auth.me.inventory[pick].itemId!].name})`), run: () => { this.select(pick); this.useItem([tx, ty]); } };
        return { label: label('바위·광맥 살펴보기'), run: () => this.say([mk === 'stone' ? '단단한 바위다. 소라네 루미 마트에서 곡괭이(100G)를 사 오면 깰 수 있다!' : '반짝이는 광맥이다! 곡괭이(100G)를 사 오면 귀한 광석을 캘 수 있다!']) };
      }
      // 농장 안쪽 나무 · 그루터기 · 통나무: 도끼가 있으면 E 한 번으로 자동 벌목!
      const choppable = this.mapId === 'farm' && (o.type === 'stump' || o.type === 'log' || (['oak', 'oak_apple', 'pine'].includes(o.type) && !!this.objProp(o.id, 'chop')));
      if (choppable) {
        const axe = this.bestToolSlot('axe');
        if (axe >= 0) return { label: label(`벌목하기 (${ITEMS[this.auth.me.inventory[axe].itemId!].name})`), run: () => { this.select(axe); this.useItem([tx, ty]); } };
      }
      const res = this.gymObjectInteraction(o) ?? this.objectInteraction(o);
      if (res) return res;
    }
    // 갈아 둔 마른 밭 / 빈 밭: E 키로 물 주기 · 씨앗 심기 자동 지원
    if (tile && this.fieldMap) {
      if (tile.soil === SoilState.Plowed) {
        const can = this.bestToolSlot('watering_can');
        if (can >= 0) return { label: label('물 주기'), run: () => { this.select(can); this.useItem([tx, ty]); } };
      }
      if (!tile.crop) {
        const heldSeed = this.auth.me.inventory[this.slot]?.itemId;
        const seedSlot = heldSeed && ITEMS[heldSeed]?.type === 'seed' ? this.slot : this.auth.me.inventory.findIndex((s) => s.itemId && ITEMS[s.itemId]?.type === 'seed' && s.quantity > 0);
        if (seedSlot >= 0) return { label: label(`${ITEMS[this.auth.me.inventory[seedSlot].itemId!].name} 심기`), run: () => { this.select(seedSlot); this.plantAround(seedSlot, [tx, ty]); } };
      }
    }
    const placed = this.mapId === 'farm' ? this.world.placedAt(tx, ty) : undefined;
    if (placed) { const po = this.auth.placed.get(placed); const it = po ? ITEMS[po.item] : null; return { label: label(`${it?.name ?? '설치물'} 살펴보기`), run: () => this.say([`${it?.name ?? '설치물'}${po && po.by !== this.auth.me.id ? ` (${this.auth.roster.get(po.by)?.name ?? '친구'}님이 설치)` : ''}.`, '망치를 들고 치면 부숴서 가방에 돌려받을 수 있다.']) }; }
    const weed = this.mapId === 'farm' ? this.world.weedAt(tx, ty) : undefined;
    if (weed) return { label: label('잡초 뽑기'), run: () => { this.auth.sendAnim('interact', this.player.dir); this.player.playOnce('interact', this.player.dir, () => void this.auth.request({ kind: 'pull', objectId: weed.id }).then((r) => r.ok && sfx.play('forage')), 1); } };
    // 물가: 낚싯대를 손에 쥐고 있으면 낚시, 그 외 파도타기 가능(물결 배지/관리자)하면 바로 파도타기!
    if (this.world.info.terrainAt(tx, ty) === '2' && !this.player.surfing
      && Math.abs(this.world.info.heights.sample(this.player.x / TILE, this.player.y / TILE) - this.world.info.heights.sample(tx + 0.5, ty + 0.5)) < 0.8) {
      const heldId = this.auth.me.inventory[this.slot]?.itemId;
      const holdingRod = !!(heldId && ITEMS[heldId]?.tool === 'rod');
      const rodSlot = this.auth.me.inventory.findIndex((s) => s.itemId && ITEMS[s.itemId]?.tool === 'rod');
      const canSurf = this.world.info.isOpenWater(tx, ty) && (this.auth.me.badges.includes('badge_water') || !!this.auth.me.isAdmin);
      if (holdingRod) return { label: label('낚시하기'), run: () => this.castLine(tx, ty) };
      if (canSurf) return { label: label('🌊 파도타기 (물 위로 나가기)'), run: () => void this.toggleSurf(true, tx, ty) };
      if (this.mapId === 'ocean_shrine') return { label: label('🌊 파도타기 (물결 배지 필요)'), run: () => this.say([SKILLS.surf.look, SKILLS.surf.need]) };
      if (rodSlot >= 0) return { label: label('낚시하기'), run: () => { this.select(rodSlot); this.castLine(tx, ty); } };
      return { label: label('물 살펴보기'), run: () => this.say(['맑은 물결이 잔잔하게 일렁인다.', '상점에서 낚싯대를 사면 낚시를, 물결 배지를 따면 파도타기를 할 수 있다!']) };
    }
    return null;
  }

  private say(pages: string[], name = '', sprite?: string) {
    this.player.busy = false;
    this.player.play('idle');
    const SPR: Record<string, string> = { '한별 박사': 'professor', '다온': 'nurse', '하나': 'hana', '민수': 'minsu' };
    ui.dialogue.show({ name, pages, sprite: sprite ?? SPR[name] });
  }

  private objectInteraction(o: WorldObject): { label: string; run: () => void } | null {
    const it = o.interact ?? '';
    // 건물: 문 앞에서 E → 실내로
    const inside = o.interior ?? INTERIOR_OF[o.type];
    if (inside && !this.world.interior) {
      if (inside === 'in_casino') {
        if (!isCasinoOpen(this.auth.time.minutes)) {
          return {
            label: label('별빛 카지노 (밤 18:00 개장)'),
            run: () => {
              sfx.play('error');
              this.say([
                `🌙 별빛 카지노는 밤(오후 6시 ~ 새벽 2시)에만 문을 엽니다!\n(현재 시각: ${formatTime(this.auth.time.minutes)})`,
                '해가 지고 가로등이 켜지면 다시 찾아와 주세요!',
              ]);
            },
          };
        }
        return { label: label('별빛 카지노 들어가기 (🌙 영업 중)'), run: () => this.enterBuilding(o, '') };
      }
      const owner = it.startsWith('home:') ? houseOwnerName(this.mapId, o.id, it.slice(5)) : '';
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
        this.fxPop(o.sprite.x, o.sprite.y, 'magic', 0xffe066, 1.65);
        playInteractFx('chest', `${item?.name ?? '보물'}${n > 1 ? ` ×${n}` : ''} 획득!`);
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
    if (it.startsWith('prison_up:')) {
      const next = it.slice(10) as MapId;
      return { label: label(`🪜 ${PRISON_FLOOR_LABEL[next] ?? next}(으)로 올라가기`), run: () => void this.ascendPrison(next) };
    }
    const ownHome = isHomeMap(this.mapId) && this.auth.me.inst === this.auth.me.id;
    switch (it) {
      case 'ship': return { label: label('출하 상자 — 작물 · 물고기 팔기'), run: () => { sfx.play('bin_lid'); this.stage3d?.ring(o.sprite.x, o.sprite.y, 0xffd848, 1.15); this.ship(); } };
      case 'mail': return { label: label('우편함 열기 — 편지 · 친구 초대'), run: () => { sfx.play('mailbox'); this.fxPop(o.sprite.x, o.sprite.y, 'sparkle', 0x7ceeff, 1.1); this.openMailbox(); } };
      case 'sign': return {
        label: label('표지판 읽기'),
        run: () => {
          sfx.play('page');
          this.stage3d?.ring(o.sprite.x, o.sprite.y, 0xffe58a, 1.0, 0.35);
          if (this.mapId === 'in_prison' && this.auth.me.jailed && o.cellX <= 6 && o.cellY >= 9) {
            ui.dialogue.show({
              name: '⛓️ 별빛 교도소 안내',
              pages: [o.text ?? '...'],
              choices: [
                { label: '⛏️ 성실 노역 채광장으로 바로 가기', primary: true, run: () => this.moveRoom(() => this.auth.request({ kind: 'prisonEnterYard' })) },
                { label: '닫기 (독방 벽 부수고 탈옥 도전)', run: () => {} },
              ],
            });
          } else {
            this.say([o.text ?? '...']);
          }
        },
      };
      case 'board': return { label: label('마을 게시판 보기'), run: () => { sfx.play('page'); this.stage3d?.ring(o.sprite.x, o.sprite.y, 0xffe58a, 1.15, 0.4); this.say(this.boardNotes()); } };
      case 'casino:slot': return { label: label('별빛 슬롯머신 플레이'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'magic', 0xff6ba8, 1.3); this.openCasino('slot'); } };
      case 'casino:dice': return { label: label('루미 주사위 테이블'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'sparkle', 0xffe066, 1.3); this.openCasino('dice'); } };
      case 'casino:highlow': return { label: label('하이·로우 카드 테이블'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'magic', 0xc084ff, 1.3); this.openCasino('highlow'); } };
      case 'casino:dealer': return { label: label('카지노 지배인과 대화하기'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'heart', 0xff70b8, 1.2); this.casinoDealerDialogue('extra_innkeeper'); } };
      case 'center': {
        const cn = this.centerNurse();
        return { label: label('루미 센터에서 루미 회복하기'), run: () => this.healAt(cn?.name ?? '다온', '맡겨 주신 루미들이 모두 건강해졌어요! 또 오세요♪', undefined, cn?.sprite) };
      }
      case 'pc': return { label: label('루미 센터 PC 모니터 — 보관함 확인'), run: () => { sfx.play('phone_open'); this.fxPop(o.sprite.x, o.sprite.y, 'magic', 0x48e8ff, 1.45); playInteractFx('pc'); phone.openBox(); } };
      case 'windmill': return { label: label('맷돌 살펴보기'), run: () => { this.stage3d?.ring(o.sprite.x, o.sprite.y, 0xffe58a, 1.2); this.say(['풍차 날개가 돌면 이 커다란 맷돌도 함께 돌아간다.', '고소한 밀가루 냄새가 난다.']); } };
      case 'smithy': return { label: label('볼 공방 화덕 — 루미볼 만들기'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'ember', 0xff8a30, 1.25); this.openCraft('smithy'); } };
      case 'workbench': return { label: label('작업대 — 회복약 · 도핑약 · 루미볼 만들기'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'sparkle', 0xffe066, 1.2); this.openCraft('home'); } };
      case 'labcraft': return { label: label('약품 조합기 — 회복약 · 도핑약 만들기'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'magic', 0x62e8ff, 1.25); this.openCraft('lab'); } };
      case 'bed': return ownHome ? { label: label('침대에서 자기 (하루 마치기)'), run: () => { sfx.play('bed'); this.fxPop(o.sprite.x, o.sprite.y, 'magic', 0xb8a0ff, 1.2); this.sleep(); } } : { label: label('살펴보기'), run: () => this.say(['친구의 침대다. 푹신해 보인다.']) };
      case 'nbed': return { label: label('살펴보기'), run: () => this.say([`${houseOwner || '이웃'}의 침대다. 남의 침대에 누울 순 없지.`]) };
      case 'wardrobe': return ownHome ? { label: label('옷장 — 외형 바꾸기'), run: () => { sfx.play('chest'); this.fxPop(o.sprite.x, o.sprite.y, 'sparkle', 0xffb8e0, 1.25); this.openWardrobe(); } } : { label: label('살펴보기'), run: () => this.say(['친구의 옷장이다. 멋진 옷이 가득하다.']) };
      case 'kitchen': return { label: label('부엌 살펴보기'), run: () => { this.stage3d?.ring(o.sprite.x, o.sprite.y, 0xffe58a, 1.0); this.say(['깔끔한 부엌. 수확한 작물이나 카페 음식을 들고 식탁에서 E 를 누르면 같이 먹을 수 있어요.']); } };
      case 'tv': return { label: label('TV 보기'), run: () => { sfx.play('tap'); this.fxPop(o.sprite.x, o.sprite.y, 'sparkle', 0x7ceeff, 1.15); this.say(this.tvProgram(), '📺 TV 방송'); } };
      case 'dtable': return this.tableInteraction();
      case 'piano': return { label: label('피아노 치기'), run: () => { sfx.play('piano'); this.emote(4); this.fxPop(o.sprite.x, o.sprite.y, 'note', 0xffe054, 1.35); this.say(['♪ 도레미파솔~ 서툴지만 즐거운 소리가 난다.']); } };
      case 'starter_table': return { label: label('살펴보기'), run: () => { this.fxPop(o.sprite.x, o.sprite.y, 'sparkle', 0xffe478, 1.3); this.say([this.auth.me.party.length ? '루미 구슬이 놓여 있던 받침대. 박사님이 새 아이들을 돌보고 있다.' : '세 개의 루미 구슬이 빛나고 있다. 한별 박사님에게 말을 걸어 보자!']); } };
      case 'altar': return this.altarInteraction(o);
      case 'tide_seal': return this.tideSealInteraction(o);
      case 'whirlpool': return {
        label: label('소용돌이 살펴보기'),
        run: () => {
          this.stage3d?.ring(o.sprite.x, o.sprite.y, 0x38bdf8, 1.35, 0.45);
          this.say(['거대한 심해의 소용돌이가 앞을 가로막고 있다.', '해신의 바다 서·동·중앙에 흩어진 세 조류 비석을 모두 깨워야 소용돌이가 잠잠해질 것 같다.']);
        },
      };
      case 'sea_altar': return this.seaAltarInteraction(o);
      case 'prison_wall': return { label: label('💥 금이 간 감옥 벽 부수기'), run: () => this.breakPrisonWall(o) };
      case 'prison_escape_wall': return { label: label('☀️ 1층 금이 간 외벽 부수고 탈옥하기!'), run: () => this.breakEscapeWall(o) };
      case 'yard_stone': return { label: label('🪨 돌 캐기 (노역 +10)'), run: () => this.gatherYard(o, 'stone') };
      case 'yard_wood': return { label: label('🪵 나무 베기 (노역 +10)'), run: () => this.gatherYard(o, 'wood') };
      case 'prison_craft': return { label: label('🔨 노역 작업대 — 석판 · 나무판 제작'), run: () => this.openPrisonCraft() };
      case 'prison_deliver': return { label: label('📦 노역 납품함 — 석판·나무판 납품 (100/100)'), run: () => this.openPrisonDeliver() };
      case 'prison_back_cell': return { label: label('🪜 지하 5층 독방으로 돌아가기'), run: () => this.moveRoom(() => this.auth.request({ kind: 'prisonBackCell' })) };
      case 'prison_ore': return { label: label('감옥 광석 채광하기 (탈옥 곡괭이)'), run: () => this.minePrisonOre(o) };
      case 'prison_escape': return { label: label('비밀 탈출 해치로 탈옥하기'), run: () => void this.escapePrison(o) };
      case 'bench': return { label: label('벤치에 앉아 쉬기'), run: () => { sfx.play('sit'); this.fxPop(this.player.x, this.player.y, 'heart', 0xffa6c4, 1.1); this.say(['벤치에 앉아 호수를 바라본다.\n오리들이 한가롭게 떠다닌다...']); } };
      case 'campfire': return {
        label: label('모닥불 곁에 나란히 앉기'),
        run: () => {
          sfx.play('sit');
          const dir = facingFromVector(14 * TILE + 8 - this.player.x, 26 * TILE - this.player.y, this.player.dir);
          this.player.play('idle', dir);
          this.emote(2);
          this.fxPop(o.sprite.x, o.sprite.y, 'ember', 0xff8030, 1.5);
          this.stage3d?.burst('heart', this.player.x, this.player.y, 14);
          const isNight = this.auth.time.minutes >= 17 * 60 + 30 || this.auth.time.minutes < 6 * 60 + 30;
          ui.toast.push(isNight ? '타오르는 모닥불 곁에 나란히 앉았어요. (Enter로 채팅해 보세요!)' : '모닥불 광장 벤치에 앉았어요. 밤이 되면 불꽃이 타오릅니다!', 'heart');
        },
      };
      case 'tower': case 'dept': {
        if (!o.label) return null;
        if (o.label === '빛누리 방송국') {
          const flags = this.auth.me.flags ?? [];
          if (!flags.includes('ch6_lumina')) return { label: label('빛누리 방송국'), run: () => this.say(['빛누리 방송국 건물.\n시내 입구 쪽 소란부터 확인해 보자.']) };
          if (!flags.includes('ch6_nebula')) return { label: label('빛누리 방송국 들어가기'), run: () => { void this.plot.check(); } };
          return { label: label('빛누리 방송국'), run: () => this.say(['빛누리 방송국.\n관장 샛별과 함께 성간단 제4간부 성운을 몰아내 방송이 정상으로 돌아왔다.']) };
        }
        const desc: Record<string, string> = {
          '성간단 빌딩': (this.auth.me.flags ?? []).includes('ch7_altar')
            ? '성간단 빌딩.\n별의 제단 사건 이후 굳게 문이 닫혀 있다.'
            : '성간단 빌딩.\n검은 유리문 너머로 서늘한 기계음만 새어 나온다.',
          '빛누리 백화점': '빛누리 백화점.\n화려한 안내판이 반짝이고 있다. 개장을 준비하는 중이다.',
          '빛누리 타워': '빛누리 타워.\n루미나 시티에서 가장 높은 전망 타워. 맑은 날엔 별마루산까지 보인다.',
        };
        return { label: label(o.label), run: () => this.say([desc[o.label!] ?? `${o.label}.`]) };
      }
    }
    if (FLAVOR[o.type]) return { label: label('살펴보기'), run: () => { this.stage3d?.ring(o.sprite.x, o.sprite.y, 0xffe58a, 0.95, 0.35); this.say([FLAVOR[o.type]]); } };
    return null;
  }

  private tvProgram(): string[] {
    const badges = this.auth.me.badges.length;
    const flags = this.auth.me.flags ?? [];
    if (flags.includes('ending')) {
      return [
        '『루미나 뉴스 특보입니다! 별빛 마을 출신의 젊은 트레이너가 루미 리그를 제패하고 새로운 루미 마스터에 등극했습니다!』',
        '『별마루산 너머에서 신비한 별빛이 관측되었다는 소식도 함께 전해 드립니다.』',
      ];
    }
    if (flags.includes('ch6_lumina') && !flags.includes('ch6_nebula')) {
      return [
        '『치지직… 여기는 성간단! 빛누리 방송국은 우리가 접수했다!』',
        '『루미나 지방의 모든 별빛 결정은 성간단의 것이다… 치직…』',
      ];
    }
    if (badges === 0) {
      return [
        '『지금 루미나 지방의 루미 리그 특별 중계와 함께, 달빛호수에서 포착된 신비한 별빛 루미 특집 다큐멘터리가 방송되고 있습니다!』',
        '『전설 속 별빛의 씨앗과 일곱 속성의 루미들… 오늘 열다섯 살이 되어 첫발을 내딛는 신입 트레이너 여러분을 응원합니다!』',
      ];
    }
    return [
      `『루미나 트레이너 채널입니다! 현재 배지 ${badges}개를 모은 유망주 트레이너들의 활약이 이어지고 있습니다!』`,
      '『오늘의 팁: 별빛 마을 전통대로 밭에서 키운 루미풀과 광석으로 회복약과 루미볼을 직접 만들면 긴 여정도 든든합니다!』',
    ];
  }

  private boardNotes() {
    const t = this.auth.time;
    return [
      `[별빛 마을 게시판]\n오늘 날씨: ${t.weather === 'rain' ? '비 — 농장 작물에 물을 줄 필요가 없어요!' : '맑음 — 물 주는 것 잊지 마세요!'}`,
      '· 소라네 루미 마트: 오전 6시 ~ 밤 10시 (농사·채광 도구 · 씨앗 · 볼 · 작물/광석 매입)\n· 루나 카페: 오전 7시 30분 ~ 오후 10시 (커피·빵·케이크)\n· 광장 씨앗 가판대: 오전 9시 ~ 오후 6시\n· 민수의 볼 공방: 화덕 자유 이용 (배지를 따면 새 볼 제작법 전수!)\n· 별빛 카지노: 밤 6시 ~ 새벽 2시 (골드를 걸고 즐기는 슬롯 · 주사위 · 하이로우!)',
      '· 태오의 거리 공연: 오전엔 호수 북쪽, 오후엔 광장 동쪽!\n· 팁: Q 키나 1~6 키로 보유한 도구·씨앗을 빠르게 바꿀 수 있어요!',
    ];
  }

  private openShop(id: string) {
    const shop = SHOPS[id];
    const town = this.mapId === 'in_shop_w' ? this.townOfRoom() : this.mapId;
    const owner = shop.owner ? this.npcs.find((n) => n.def.id === shop.owner) : undefined;
    if (shop.owner && this.mapId !== 'in_shop_w' && (!owner || owner.state === 'gone' || Math.hypot(owner.x - this.player.x, owner.y - this.player.y) > 140)) {
      ui.toast.push(`${shop.name}: 주인이 자리에 없어요. (영업 ${Math.floor(shop.open / 100)}시~${Math.floor(shop.close / 100)}시)`, 'sun');
      return;
    }
    this.player.play('idle');
    let keeper: { sprite: string; portrait?: string; name: string } | undefined = owner
      ? { sprite: owner.def.sprite, portrait: owner.def.portrait ?? owner.def.sprite, name: owner.def.name }
      : undefined;
    let title: string | undefined;
    let greeting: string | undefined;
    if (this.mapId === 'in_shop_w') {
      const mk = townShopKeeper(town);
      keeper = { sprite: mk.sprite, portrait: mk.portrait, name: mk.name };
      title = `${MAP_NAMES[town] ?? ''} 루미 마트`.trim();
      greeting = mk.greeting;
    } else if (id === 'cafe' && this.mapId !== 'in_cafe') {
      const ck = townCafeKeeper(town);
      keeper = { sprite: ck.sprite, portrait: ck.portrait, name: ck.name };
      title = `${MAP_NAMES[town] ?? ''} 노천 카페`.trim();
      greeting = ck.greeting;
    } else if ((id === 'mart2' || id === 'mart3' || id === 'mart4') && !keeper) {
      const mk = townShopKeeper(town);
      keeper = { sprite: mk.sprite, portrait: mk.portrait, name: mk.name };
      title = `${MAP_NAMES[town] ?? ''} 루미 마트`.trim();
      greeting = mk.greeting;
    }
    ui.shop.show(
      shop,
      this.auth.gold,
      (itemId, qty) => {
        void this.auth.request({ kind: 'buy', shop: id, itemId, qty }).then((r) => {
          sfx.play(r.ok ? 'shop_buy' : 'error');
          if (r.ok) {
            ui.shop.refresh();
            // 빈손일 때 도구를 사면 바로 손에 쥐어 줌!
            if (this.selected < 0 && ITEMS[itemId]?.type === 'tool') {
              const sIdx = this.auth.me.inventory.findIndex((sl) => sl.itemId === itemId);
              if (sIdx >= 0) this.select(sIdx);
            }
          }
        });
      },
      keeper,
      {
        me: () => this.auth.me,
        onSell: (slot, qty) => {
          void this.auth.request({ kind: 'sell', shop: id, slot, qty }).then((r) => {
            sfx.play(r.ok ? 'coin' : 'error');
            if (r.ok) ui.shop.refresh();
          });
        },
        title,
        greeting,
      },
    );
  }

  private interact(cell?: [number, number]) {
    if (this.player.busy || ui.dialogue.open || ui.shop.open || casinoModal.open) return;
    if (cell) this.faceCell(cell);
    this.findInteraction(cell)?.run();
  }

  private talk(npc: Npc) {
    this.fxPop(npc.x, npc.y, 'heart', 0xffb8d4, 1.05);
    npc.showEmote(0, 800);
    if (npc.def.id === 'hanbyeol') { npc.beginTalk(this.player.x, this.player.y, this.auth.time.day); this.professor(() => npc.endTalk()); return; }
    if (npc.def.id === 'casino_dealer') { npc.beginTalk(this.player.x, this.player.y, this.auth.time.day); this.casinoDealerDialogue(npc.def.portrait ?? 'extra_innkeeper', () => npc.endTalk()); return; }
    if (npc.def.hand) { void this.handTalk(npc); return; }
    const portrait = npc.def.portrait ?? npc.def.sprite;
    const dir = facingFromVector(npc.x - this.player.x, npc.y - this.player.y, this.player.dir);
    this.player.play('idle', dir);
    // 루미 센터 간호사: 회복 · PC 보관함 · 인사 선택지
    if (npc.def.id === 'daon') {
      npc.beginTalk(this.player.x, this.player.y, this.auth.time.day);
      const evil = this.auth.me.evilStack ?? 0;
      ui.dialogue.show({
        name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color,
        pages: ['루미 센터에 어서 오세요! 무엇을 도와드릴까요?'],
        choices: [
          { label: '💗 루미 회복하기 (무료)', primary: true, run: () => this.healAt(npc.def.name, '맡겨 주신 루미들이 모두 건강해졌어요! 또 오세요♪', undefined, portrait) },
          { label: '💻 PC 보관함 열기', run: () => { sfx.play('phone_open'); phone.openBox(); } },
          ...(evil > 0 ? [{ label: `🤝 센터 일손 돕기 (선행 +1 · 악행 ${evil}→${evil - 1})`, run: () => void this.doGoodDeed(npc) }] : []),
          { label: '💬 이야기 나누기', run: () => ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color, pages: npc.pickLines(this.auth.time.minutes, this.auth.time.weather), hearts: npc.hearts }) },
        ],
      }, () => npc.endTalk());
      return;
    }
    // 상점 · 카페 주인에게 직접 말 걸면 [상점 열기] / [이야기 나누기] 선택지 제공!
    if ((npc.def.id === 'sora' && this.mapId === 'in_store') || (npc.def.id === 'luna' && this.mapId === 'in_cafe') || (npc.def.id === 'gureum' && this.mapId === 'in_shop_w')) {
      const shopId = npc.def.id === 'sora' ? 'general' : npc.def.id === 'luna' ? 'cafe' : (this.townOfRoom() !== 'windvale' && MAP_META[this.townOfRoom()]?.kind === 'town' ? martFor(this.townOfRoom()) : 'windvale');
      const shopLabel = npc.def.id === 'luna' ? '☕ 카페 메뉴 보기 · 팔기' : '🛒 상점 열기 (사기 · 팔기)';
      const evil = this.auth.me.evilStack ?? 0;
      npc.beginTalk(this.player.x, this.player.y, this.auth.time.day);
      ui.dialogue.show({
        name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color,
        pages: [`어서 오세요! ${npc.def.name}입니다. 필요한 물건이 있으신가요?`],
        choices: [
          { label: shopLabel, primary: true, run: () => this.openShop(shopId) },
          ...(evil > 0 ? [{ label: `🤝 가게 정리 돕기 (선행 +1 · 악행 ${evil}→${evil - 1})`, run: () => void this.doGoodDeed(npc) }] : []),
          { label: '💬 이야기 나누기', run: () => ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color, pages: npc.pickLines(this.auth.time.minutes, this.auth.time.weather), hearts: npc.hearts }) },
        ],
      }, () => npc.endTalk());
      return;
    }
    // 마을 공방장인(craft_*): 휴대용 작업대 이용 / 이야기 나누기
    if (this.npcActions.get(npc.def.id) === 'craft') {
      const evil = this.auth.me.evilStack ?? 0;
      npc.beginTalk(this.player.x, this.player.y, this.auth.time.day);
      ui.dialogue.show({
        name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color,
        pages: [`반갑네, 트레이너! ${npc.def.title} ${npc.def.name}일세. 작업대가 필요한가?`],
        choices: [
          { label: '🔨 공방 작업대 쓰기 (볼·약·도구 제작)', primary: true, run: () => this.openCraft('home', { sprite: npc.def.sprite, portrait, name: npc.def.name, title: `${MAP_NAMES[this.mapId] ?? ''} 공방 · ${npc.def.name}` }) },
          ...(evil > 0 ? [{ label: `🤝 공방 일손 돕기 (선행 +1 · 악행 ${evil}→${evil - 1})`, run: () => void this.doGoodDeed(npc) }] : []),
          { label: '💬 이야기 나누기', run: () => ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color, pages: npc.pickLines(this.auth.time.minutes, this.auth.time.weather), hearts: npc.hearts }) },
        ],
      }, () => npc.endTalk());
      return;
    }
    const pages = npc.pickLines(this.auth.time.minutes, this.auth.time.weather);
    npc.beginTalk(this.player.x, this.player.y, this.auth.time.day);
    // 악행스택이 남아있으면 모든 마을 주민에게 [🤝 마을 일손 돕기 (선행 +1)] 선택지 제공!
    const evil = this.auth.me.evilStack ?? 0;
    if (evil > 0) {
      ui.dialogue.show({
        name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color,
        pages: [pages[0] ?? '안녕하세요! 무엇을 도와드릴까요?'],
        hearts: npc.hearts,
        choices: [
          { label: `🤝 마을 일손 돕기 (선행 +1 · 악행 ${evil}→${evil - 1})`, primary: true, run: () => void this.doGoodDeed(npc) },
          { label: '💬 이야기 나누기', run: () => ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color, pages, hearts: npc.hearts }) },
        ],
      }, () => { npc.endTalk(); if (TEACHERS[npc.def.id]) void this.learnFrom(npc.def.id); });
      return;
    }
    ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color, pages, hearts: npc.hearts }, () => { npc.endTalk(); if (TEACHERS[npc.def.id]) void this.learnFrom(npc.def.id); });
  }

  private harvest(tx: number, ty: number) {
    const [px, py] = this.player.cell();
    const dir = facingFromVector(tx - px, ty - py, this.player.dir);
    this.auth.sendAnim('interact', dir);
    this.player.playOnce('interact', dir, () => {
      void this.auth.request({ kind: 'harvest', tx, ty }).then((r) => {
        if (r.ok) {
          sfx.play('harvest');
          this.fxPop(tx * TILE + 8, ty * TILE + 10, 'sparkle', 0xffe066, 1.25);
          this.stage3d?.burst('leaves', tx * TILE + 8, ty * TILE + 10, 8);
        }
      });
    }, 1);
  }

  /** 출하 상자: 손에 든 게 팔 수 있는 물건이면 바로 넣고, 아니면 한 번에 출하 / 가방에서 고르기 선택 */
  private ship() {
    const it = ITEMS[this.auth.me.inventory[this.slot]?.itemId ?? ''];
    if (it && it.sellPrice > 0 && it.type !== 'tool' && it.type !== 'key') { this.shipSlot(this.slot); return; }
    const sellSlots = this.auth.me.inventory
      .map((s, idx) => ({ s, idx, d: s.itemId ? ITEMS[s.itemId] : null }))
      .filter((x) => x.d && x.s.quantity > 0 && x.d.sellPrice > 0 && x.d.type !== 'tool' && x.d.type !== 'key' && x.d.type !== 'seed');
    if (sellSlots.length) {
      const total = sellSlots.reduce((sum, x) => sum + x.d!.sellPrice * x.s.quantity, 0);
      ui.dialogue.show({
        name: '출하 상자',
        pages: [`수확한 작물·광석·물고기 ${sellSlots.length}종이 가방에 있어요.\n(내일 아침 총 ${total.toLocaleString()}G 정산 · 상점에 직접 팔면 즉시 골드를 받을 수도 있어요!)`],
        choices: [
          {
            label: `📦 작물·광석·물고기 모두 출하 (+${total.toLocaleString()}G 예정)`,
            primary: true,
            run: async () => {
              let shipped = 0;
              for (const x of sellSlots) {
                const r = await this.auth.request({ kind: 'ship', slot: x.idx });
                if (r.ok) shipped++;
              }
              if (shipped) {
                sfx.play('ship');
                const bin = this.world.objects.find((o) => o.interact === 'ship');
                if (bin) this.tweens.add({ targets: bin.sprite, scaleY: { from: 0.9, to: 1 }, scaleX: { from: 1.08, to: 1 }, duration: 260, ease: 'Back.Out' });
              }
            },
          },
          ...(this.hasPhone() ? [{ label: '🎒 가방에서 하나씩 고르기', run: () => { phone.show('bag'); ui.toast.push('가방에서 출하할 물건을 눌러 "출하하기"를 고르세요.', 'gold'); } }] : []),
          { label: '닫기', run: () => {} },
        ],
      });
      return;
    }
    if (this.hasPhone()) { phone.show('bag'); ui.toast.push('지금 출하할 작물·광석·물고기가 없어요. 밭에서 수확하거나 채광해 보세요!', 'gold'); }
    else ui.toast.push('출하할 작물이나 광석을 손에 들고 상자를 눌러 주세요.', 'gold');
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

  // ── 8개 체육관 고유 기믹 로직 ───────────────────────────
  private objProp(id: number, key: string): unknown {
    return this.world.info.objects.find((ob) => ob.id === id)?.properties?.find((p) => p.name === key)?.value;
  }

  private parseSeq(raw: unknown): number[] {
    if (Array.isArray(raw)) return raw.map(Number);
    if (typeof raw === 'string' && raw.trim()) {
      try {
        const a = JSON.parse(raw);
        if (Array.isArray(a)) return a.map(Number);
      } catch {
        return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
      }
    }
    return [1, 3, 0, 2];
  }

  private initGymPuzzleState() {
    if (this.player) {
      this.player.onSlideBlocked = (px, py, dx, dy, distPx) => this.handleIceSlideBlocked(px, py, dx, dy, distPx);
    }
    const prefix = `${this.mapId}:`;
    for (const k of this.auth.me.cleared ?? []) {
      if (!k.startsWith(prefix)) continue;
      const id = k.slice(prefix.length);
      if (/^\d+$/.test(id)) this.world.removeObject(Number(id), false);
      else {
        this.openGates.add(id);
        this.world.openGate(id);
      }
    }
    for (const wo of this.world.objects) {
      if (wo.type === 'pair_card' && wo.gateId && this.openGates.has(wo.gateId)) {
        this.matchedCards.add(wo.id);
        this.revealedCards.add(wo.id);
        this.world.setCardVisual2D(wo.id, true, 0xff80b0);
      }
      if (wo.type === 'prism') {
        const r = Number(this.objProp(wo.id, 'rot') ?? 0);
        this.prismRots.set(wo.id, r);
      }
    }
    this.waterLevel = 0;
    if (this.world.info.waterBridges.size > 0) this.world.setWaterLevel(0);
    this.pushBlocks.clear();
    for (const b of this.world.info.pushBlocks) {
      const done = this.openGates.has(b.gateId);
      this.pushBlocks.set(b.id, { x: b.x, y: b.y, group: b.group, gateId: b.gateId, locked: done });
      if (done) this.world.movePushBlock(b.id, b.x, b.y, true);
    }
    if (this.world.info.laserSources.length > 0) this.recomputeLasers(false);
  }

  private gymObjectInteraction(o: { id: number; type: string; interact?: string; gateId?: string }): { label: string; run: () => void } | null {
    if (o.type === 'sign' || o.interact === 'sign') {
      const txt = String(this.objProp(o.id, 'text') ?? this.objProp(o.id, 'msg') ?? '').trim();
      if (!txt) return null;
      return { label: label('안내 석판 읽기'), run: () => this.say(txt.split('\n')) };
    }
    if (o.type === 'snowball') {
      return {
        label: label('거대 눈덩이 살펴보기'),
        run: () => ui.toast.push('얼음판 위에서 2칸 이상 미끄러져 부딪히면 산산조각낼 수 있어요!', 'ice'),
      };
    }
    if (o.type === 'snow_reset') {
      return { label: label('눈덩이 초기화 패드 밟기'), run: () => this.resetSnowballs() };
    }
    if (o.type === 'pair_card') {
      return { label: label('단풍꽃 카드 뒤집기'), run: () => this.flipPairCard(o.id) };
    }
    if (o.type === 'rail_switch') {
      const rg = String(this.objProp(o.id, 'railGroup') ?? 'fg1');
      const gid = String(this.objProp(o.id, 'gateId') ?? rg);
      return { label: label(`레일 레버 전환 (${rg === 'fg2' || rg === 'r2' ? '청록' : '황금'})`), run: () => this.toggleRailSwitch(rg, gid) };
    }
    if (o.type === 'quiz_pad') {
      const lbl = String(this.objProp(o.id, 'num') ?? '?');
      const q = String(this.objProp(o.id, 'q') ?? '');
      return {
        label: label(`${lbl}번 답안 패드 (${q ? q.split('\n')[0].slice(0, 14) + '…' : '불꽃 퀴즈'})`),
        run: () => this.answerQuizPad(o.id),
      };
    }
    if (o.type === 'prism') {
      return { label: label('광학 프리즘 회전하기'), run: () => this.rotatePrism(o.id) };
    }
    if (o.type === 'laser_src') {
      return { label: label('광선 발사기 확인'), run: () => ui.toast.push('광학 프리즘(E)을 회전시켜 초록 수신기에 광선을 연결하세요!', 'sparkle') };
    }
    if (o.type === 'laser_dst') {
      return { label: label('광선 수신기 확인'), run: () => ui.toast.push('광선이 이 수신기에 닿으면 잠긴 게이트가 열립니다!', 'sparkle') };
    }
    if (o.type === 'rune_demo') {
      return { label: label('별빛 룬 시범 선율 듣기'), run: () => this.playRuneDemo(o.id) };
    }
    if (o.type === 'rune_pad') {
      const idx = Number(this.objProp(o.id, 'runeIdx') ?? 0);
      return { label: label(`별빛 룬 [${idx + 1}] 울리기`), run: () => this.stepRunePad(o.id) };
    }
    if (o.type === 'water_switch') {
      const lv = Number(this.objProp(o.id, 'level') ?? 0);
      const name = lv === 0 ? '노랑(낮음)' : lv === 1 ? '초록(중간)' : '파랑(높음)';
      return { label: label(`수위 밸브 전환 · ${name}`), run: () => void this.triggerWaterSwitch(lv) };
    }
    if (o.type === 'push_block') {
      const [dx, dy] = DIR_VEC[this.player.dir];
      return { label: label('강철 블록 밀기'), run: () => void this.tryPushBlock(o.id, dx, dy) };
    }
    if (o.type === 'puzzle_reset') {
      const grp = String(this.objProp(o.id, 'group') ?? '');
      return { label: label('구역 퍼즐 초기화'), run: () => void this.resetGymPuzzle(grp || undefined) };
    }
    return null;
  }

  private checkFloorGymPuzzle(cx: number, cy: number, cellKey: string) {
    if (this.player && !this.player.onSlideBlocked) {
      this.player.onSlideBlocked = (px, py, dx, dy, distPx) => this.handleIceSlideBlocked(px, py, dx, dy, distPx);
    }
    const info = this.world.info;
    // 잿빛 도장(루네식) 금 가는 화산판은 인접 타일을 연속으로 밟으므로 별도 셀 락으로 처리
    const ct = info.crackedTileAt(cx, cy);
    if (!ct) {
      if (this.crackedCellLock) this.crackedCellLock = '';
    } else if (this.crackedCellLock !== cellKey && !this.warping) {
      if (Math.hypot(this.player.x - (cx * TILE + 8), this.player.y - (cy * TILE + 11)) < 10.5) {
        this.crackedCellLock = cellKey;
        this.stepCrackedTile(ct);
      }
    }
    const pc = info.pairCardAt(cx, cy);
    const qp = info.quizPadAt(cx, cy);
    const pr = info.prismAt(cx, cy);
    const rp = info.runePadAt(cx, cy);
    const rd = info.runeDemoAt(cx, cy);
    const sr = info.snowResetAt(cx, cy);
    const ws = info.waterSwitchAt(cx, cy);
    const pzR = info.puzzleResetAt(cx, cy);
    if (!pc && !qp && !pr && !rp && !rd && !sr && !ws && !pzR) {
      if (this.stepGimmickLock) this.stepGimmickLock = '';
      return;
    }
    if (this.stepGimmickLock === cellKey) return;
    if (Math.hypot(this.player.x - (cx * TILE + 8), this.player.y - (cy * TILE + 11)) >= 11.5) return;
    this.stepGimmickLock = cellKey;
    if (pc) this.flipPairCard(pc.id);
    else if (qp) this.answerQuizPad(qp.id);
    else if (pr) this.rotatePrism(pr.id);
    else if (rd) this.playRuneDemo(rd.id);
    else if (rp) this.stepRunePad(rp.id);
    else if (sr) this.resetSnowballs();
    else if (ws) void this.triggerWaterSwitch(ws.level);
    else if (pzR) void this.resetGymPuzzle(pzR.group || undefined);
  }

  private handleIceSlideBlocked(px: number, py: number, dx: number, dy: number, distPx: number) {
    const info = this.world.info;
    let sb = info.snowballAt(Math.floor((px + dx * 10) / TILE), Math.floor((py - 3 + dy * 10) / TILE));
    let hx = Math.floor((px + dx * 10) / TILE), hy = Math.floor((py - 3 + dy * 10) / TILE);
    if (!sb) {
      hx = Math.floor((px + dx * 13) / TILE);
      hy = Math.floor((py - 3 + dy * 13) / TILE);
      sb = info.snowballAt(hx, hy);
    }
    if (!sb) return;
    if (distPx < 22) {
      sfx.play('puzzle_ng');
      const wo = this.world.objects.find((ob) => ob.id === sb!.id);
      if (wo) this.world.shake(wo, 2);
      ui.toast.push('힘이 부족해요! 얼음 위에서 2칸 이상 미끄러져 부딪혀야 눈덩이가 부서집니다.', 'ice');
      return;
    }
    sfx.play('snow_smash');
    this.cameras.main.shake(180, 0.006);
    this.world.removeObject(sb.id, true);
    this.stage3d?.burstSnow3D(hx * TILE + 8, hy * TILE + 8);
    this.stage3d?.ring(hx * TILE + 8, hy * TILE + 8, 0x9eeeff, 2.0, 0.55);
    void this.auth.request({ kind: 'gymClear', objectId: sb.id });
    ui.toast.push('콰광! 거대 눈덩이를 산산조각냈어요!', 'ice');
  }

  private resetSnowballs() {
    sfx.play('heal_machine');
    this.fxPop(this.player.x, this.player.y, 'frost', 0x78e4ff, 1.8);
    ui.toast.push('눈덩이 초기화! 모든 눈덩이를 처음 위치로 되돌렸어요.', 'ice');
    void this.auth.request({ kind: 'gymReset' });
  }

  private async triggerWaterSwitch(level: number) {
    const lv = Math.max(0, Math.min(2, Math.floor(level)));
    if (this.waterLevel === lv) {
      const labelTxt = lv === 0 ? '낮음(노랑)' : lv === 1 ? '중간(초록)' : '높음(파랑)';
      ui.toast.push(`이미 수위가 ${labelTxt} 상태예요!`, 'water');
      return;
    }
    const r = await this.auth.request({ kind: 'gymWater', level: lv });
    if (!r.ok) return;
    this.waterLevel = lv;
    this.world.setWaterLevel(lv);
    sfx.play('lever');
    this.cameras.main.shake(170, 0.004);
    this.fxPop(this.player.x, this.player.y, 'splash', lv === 0 ? 0xfacc15 : lv === 1 ? 0x34d399 : 0x38bdf8, 2.2);
    const labelTxt = lv === 0 ? '낮음 (노랑 부교 개방)' : lv === 1 ? '중간 (초록 부교 개방)' : '높음 (파랑 부교 개방)';
    ui.toast.push(`수위 조절 완료! 현재 수위: ${labelTxt}`, 'water');
  }

  private async tryPushBlock(id: number, dx: number, dy: number) {
    if (this.pushingBlock) return;
    const st = this.pushBlocks.get(id);
    if (!st || st.locked) return;
    this.pushingBlock = true;
    try {
      const r = await this.auth.request({ kind: 'gymPush', objectId: id, dx, dy });
      if (!r.ok) {
        sfx.play('puzzle_ng');
        return;
      }
      st.x += dx;
      st.y += dy;
      const complete = r.data?.item === 'complete';
      const onSlot = r.data?.item === 'onSlot';
      if (complete) {
        for (const [bid, ob] of this.pushBlocks) {
          if (ob.group === st.group) {
            ob.locked = true;
            this.world.movePushBlock(bid, ob.x, ob.y, true);
          }
        }
      } else {
        this.world.movePushBlock(id, st.x, st.y, false);
      }
      sfx.play(complete || onSlot ? 'puzzle_ok' : 'tap');
      this.fxPop(st.x * TILE + 8, st.y * TILE + 10, onSlot || complete ? 'sparkle' : 'rock', onSlot || complete ? 0xf59e0b : 0xa8a098, onSlot || complete ? 1.5 : 0.9);
      if (r.data?.qty === 1) {
        this.openGates.add(st.gateId);
        this.world.openGate(st.gateId);
        this.cameras.main.shake(180, 0.005);
        playInteractFx('gate', '소코반 퍼즐 완성! 용광로 관문 개방');
        ui.toast.push('소코반 퍼즐 완성! 모든 강철 블록이 잠기며 용광로 관문이 열렸어요!', 'sparkle');
      } else if (onSlot) {
        ui.toast.push('찰칵! 강철 블록이 슬롯 위에 올랐습니다! (필요하면 다시 밀어 옮길 수 있어요)', 'sparkle');
      }
    } finally {
      this.pushingBlock = false;
    }
  }

  private async resetGymPuzzle(group?: string) {
    const r = await this.auth.request({ kind: 'gymReset', group });
    if (!r.ok) return;
    sfx.play('heal_machine');
    this.fxPop(this.player.x, this.player.y, 'magic', 0x62e8ff, 1.8);
    for (const orig of this.world.info.pushBlocks) {
      if (group && orig.group !== group) continue;
      if (this.openGates.has(orig.gateId)) continue;
      this.pushBlocks.set(orig.id, { x: orig.x, y: orig.y, group: orig.group, gateId: orig.gateId, locked: false });
    }
    this.world.resetPushBlocks(group, this.openGates);
    if (group && this.world.info.crackedTiles.size > 0) {
      for (const ct of this.world.info.crackedTiles.values()) {
        if (ct.zoneId === group && !this.openGates.has(ct.gateId)) this.crackedTiles.delete(ct.id);
      }
    }
    ui.toast.push('퍼즐 초기화 완료! 블록과 발판을 처음 위치로 되돌렸어요.', 'sparkle');
  }

  private stepCrackedTile(ct: { id: number; zoneId: string; gateId: string; fallX: number; fallY: number }) {
    if (this.openGates.has(ct.gateId)) return;
    if (this.crackedTiles.has(ct.id)) {
      void this.triggerCrackedFall(ct);
      return;
    }
    this.crackedTiles.add(ct.id);
    sfx.play('tap');
    this.fxPop(this.player.x, this.player.y, 'ember', 0xff7030, 0.9);
    const zoneTiles = [...this.world.info.crackedTiles.values()].filter((t) => t.zoneId === ct.zoneId);
    const done = zoneTiles.filter((t) => this.crackedTiles.has(t.id)).length;
    if (zoneTiles.length > 0 && done >= zoneTiles.length) {
      sfx.play('puzzle_ok');
      this.openGates.add(ct.gateId);
      this.world.openGate(ct.gateId);
      this.cameras.main.shake(180, 0.005);
      playInteractFx('gate', `화산판 한붓그리기 완성! (${done}/${zoneTiles.length})`);
      void this.auth.request({ kind: 'gymClear', gateId: ct.gateId });
      ui.toast.push(`화산판 한붓그리기 완성! (${done}/${zoneTiles.length}) 다음 관문이 열렸습니다!`, 'fire');
    } else if (done === 1 || done % 6 === 0 || zoneTiles.length - done <= 2) {
      ui.toast.push(`화산판 진행: ${done}/${zoneTiles.length} (모든 칸을 한 번씩만 밟으세요!)`, 'fire');
    }
  }

  private async triggerCrackedFall(ct: { zoneId: string; gateId: string; fallX: number; fallY: number }) {
    this.warping = true;
    this.player.stopStep();
    sfx.play('puzzle_ng');
    this.cameras.main.shake(220, 0.008);
    this.cameras.main.flash(220, 255, 110, 48);
    this.fxPop(this.player.x, this.player.y, 'ember', 0xff4020, 1.8);
    for (const t of this.world.info.crackedTiles.values()) {
      if (t.zoneId === ct.zoneId) this.crackedTiles.delete(t.id);
    }
    const r = await this.auth.request({ kind: 'gymFall', toX: ct.fallX, toY: ct.fallY });
    if (r.ok) {
      const nx = ct.fallX * TILE + 8, ny = ct.fallY * TILE + 13;
      this.crackedCellLock = `${ct.fallX},${ct.fallY}`;
      this.player.setPosition(nx, ny);
      this.partner?.teleport(nx, ny + 2);
      this.auth.sendMove(nx, ny, this.player.dir, 'idle');
      ui.toast.push('와장창! 금 간 화산판을 두 번 밟아 아래층으로 떨어졌습니다!', 'fire');
    }
    this.time.delayedCall(180, () => { this.warping = false; });
  }

  private flipPairCard(id: number) {
    if (this.matchedCards.has(id) || this.revealedCards.has(id)) return;
    if (performance.now() < this.cardFlipLockUntil) return;
    const gateId = String(this.objProp(id, 'gateId') ?? 'mp1');
    if (this.openGates.has(gateId)) return;
    const sym = String(this.objProp(id, 'pairKey') ?? 'leaf_red');
    const SYM_HEX: Record<string, number> = {
      leaf_red: 0xe8524a, sun_gold: 0xffd448, sakura: 0xff88b8, violet: 0xa870ff, bellflower: 0x48b8ff,
      emerald: 0x22c55e, coral: 0xf97316, frost: 0x67e8f9,
    };
    this.revealedCards.add(id);
    this.world.setCardVisual2D(id, true, SYM_HEX[sym] ?? 0xff6b9d);
    this.fxPop(this.player.x, this.player.y, 'leaves', SYM_HEX[sym] ?? 0xff6b9d, 1.0);
    sfx.play('card_flip');
    this.pickedCards.push({ id, gateId, key: `${gateId}:${sym}` });
    if (this.pickedCards.length < 2) return;
    const [a, b] = this.pickedCards;
    this.pickedCards = [];
    if (a.key === b.key) {
      this.matchedCards.add(a.id);
      this.matchedCards.add(b.id);
      sfx.play('puzzle_ok');
      this.fxPop(this.player.x, this.player.y, 'heart', 0xff88b8, 1.5);
      const gateCards = this.world.info.objects.filter(
        (ob) => ob.type === 'pair_card' && String(ob.properties?.find((pr) => pr.name === 'gateId')?.value ?? 'mp1') === a.gateId,
      );
      if (gateCards.length > 0 && gateCards.every((ob) => this.matchedCards.has(ob.id))) {
        this.openGates.add(a.gateId);
        this.world.openGate(a.gateId);
        playInteractFx('gate', '단풍꽃 정원 봉인 해제!');
        ui.toast.push('단풍꽃 짝을 모두 맞췄어요! 덩굴 문이 열립니다!', 'flower');
        void this.auth.request({ kind: 'gymClear', gateId: a.gateId });
      } else {
        const done = Math.floor(gateCards.filter((ob) => this.matchedCards.has(ob.id)).length / 2);
        const tot = Math.floor(gateCards.length / 2);
        ui.toast.push(`단풍꽃 짝 매칭 성공! (${done}/${tot}쌍)`, 'flower');
      }
    } else {
      sfx.play('puzzle_ng');
      this.cardFlipLockUntil = performance.now() + 720;
      ui.toast.push('모양이 달라요! 곧 다시 뒤집힙니다.', 'flower');
      this.time.delayedCall(700, () => {
        if (!this.scene.isActive()) return;
        this.revealedCards.delete(a.id);
        this.revealedCards.delete(b.id);
        this.world.setCardVisual2D(a.id, false);
        this.world.setCardVisual2D(b.id, false);
      });
    }
  }

  private toggleRailSwitch(rg: string, gateId?: string) {
    if (this.flippedRails.has(rg)) this.flippedRails.delete(rg);
    else {
      this.flippedRails.add(rg);
      const gid = gateId || rg;
      if (gid && !this.openGates.has(gid)) {
        this.openGates.add(gid);
        this.world.openGate(gid);
        playInteractFx('gate', '레일 방향 전환 & 관문 개방!');
        void this.auth.request({ kind: 'gymClear', gateId: gid });
      }
    }
    sfx.play('lever');
    this.fxPop(this.player.x, this.player.y, 'sparkle', rg === 'fg2' || rg === 'r2' ? 0x48d0ff : 0xffaa33, 1.6);
    this.world.updateArrowFlip2D(this.flippedRails);
    ui.toast.push(`${rg === 'fg2' || rg === 'r2' ? '청록' : '황금'} 레일 방향 전환! 화살표 발판 방향과 관문이 열렸어요.`, 'sparkle');
  }

  private answerQuizPad(id: number) {
    const gateId = String(this.objProp(id, 'gateId') ?? 'eq1');
    if (this.openGates.has(gateId)) {
      ui.toast.push('이미 불꽃 결계가 열린 관문이에요!', 'fire');
      return;
    }
    const corr = this.objProp(id, 'correct');
    const ok = corr === true || String(corr) === 'true';
    if (ok) {
      sfx.play('puzzle_ok');
      this.openGates.add(gateId);
      this.world.openGate(gateId);
      this.fxPop(this.player.x, this.player.y, 'ember', 0xffd448, 1.8);
      playInteractFx('gate', '정답! 불꽃 결계 해제!');
      ui.toast.push('정답! 불꽃 관문이 해제되었습니다!', 'fire');
      void this.auth.request({ kind: 'gymClear', gateId });
    } else {
      sfx.play('puzzle_ng');
      this.quizWrongUntil = performance.now() + 650;
      const q = String(this.objProp(id, 'q') ?? '');
      const failX = Number(this.objProp(id, 'failX') ?? -1);
      const failY = Number(this.objProp(id, 'failY') ?? -1);
      if (failX >= 0 && failY >= 0) {
        this.warping = true;
        this.player.stopStep();
        this.cameras.main.shake(220, 0.008);
        this.cameras.main.flash(220, 255, 80, 40);
        this.fxPop(this.player.x, this.player.y, 'ember', 0xff3018, 1.9);
        void this.auth.request({ kind: 'gymFall', toX: failX, toY: failY }).then((r) => {
          if (r.ok) {
            const nx = failX * TILE + 8, ny = failY * TILE + 13;
            this.player.setPosition(nx, ny);
            this.partner?.teleport(nx, ny + 2);
            this.auth.sendMove(nx, ny, this.player.dir, 'idle');
            ui.toast.push('오답 함정 발동! 지하 용암 우리로 떨어졌습니다!', 'fire');
          }
          this.time.delayedCall(180, () => { this.warping = false; });
        });
        return;
      }
      ui.toast.push(q ? `오답! [${q.split('\n')[0]}] 다시 생각해 보세요!` : '오답입니다! 석판을 읽고 올바른 번호를 밟아 주세요.', 'fire');
      if (this.world.info.canStand(this.player.x, this.player.y + 12)) {
        this.player.setPosition(this.player.x, this.player.y + 12);
      }
    }
  }

  private rotatePrism(id: number) {
    const cur = this.prismRots.get(id) ?? Number(this.objProp(id, 'rot') ?? 0);
    const next = (cur + 1) % 4;
    this.prismRots.set(id, next);
    sfx.play('lever');
    this.fxPop(this.player.x, this.player.y, 'magic', 0x48f0ff, 1.35);
    this.recomputeLasers(true);
  }

  private recomputeLasers(notify: boolean) {
    const info = this.world.info;
    const W = info.width;
    this.litLaserDests.clear();
    this.laserSegments = [];
    const DIRS: Record<string, [number, number]> = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };

    for (const src of info.laserSources) {
      let x = src.x, y = src.y;
      let [dx, dy] = DIRS[src.dir] ?? [1, 0];
      let segStartX = x + 0.5, segStartY = y + 0.5;
      for (let step = 0; step < 240; step++) {
        const nx = x + dx, ny = y + dy;
        if (!info.inBounds(nx, ny)) {
          this.laserSegments.push([segStartX, segStartY, x + 0.5 + dx * 0.45, y + 0.5 + dy * 0.45]);
          break;
        }
        const dst = info.laserTargets.get(ny * W + nx);
        if (dst) {
          this.laserSegments.push([segStartX, segStartY, nx + 0.5, ny + 0.5]);
          this.litLaserDests.add(dst.id);
          break;
        }
        const pr = info.prismAt(nx, ny);
        if (pr) {
          this.laserSegments.push([segStartX, segStartY, nx + 0.5, ny + 0.5]);
          const rot = this.prismRots.get(pr.id) ?? pr.rot;
          [dx, dy] = rot % 2 === 0 ? [dy, dx] : [-dy, -dx];
          x = nx; y = ny;
          segStartX = nx + 0.5; segStartY = ny + 0.5;
          continue;
        }
        if (info.isBlocked(nx, ny)) {
          this.laserSegments.push([segStartX, segStartY, x + 0.5 + dx * 0.45, y + 0.5 + dy * 0.45]);
          break;
        }
        x = nx; y = ny;
        if (step === 239) this.laserSegments.push([segStartX, segStartY, x + 0.5, y + 0.5]);
      }
    }

    if (!notify) return;
    const byGate = new Map<string, number[]>();
    for (const dst of info.laserTargets.values()) {
      const list = byGate.get(dst.gateId) ?? [];
      list.push(dst.id);
      byGate.set(dst.gateId, list);
    }
    for (const [gateId, ids] of byGate) {
      if (!this.openGates.has(gateId) && ids.length > 0 && ids.every((id) => this.litLaserDests.has(id))) {
        sfx.play('laser_hit');
        this.openGates.add(gateId);
        this.world.openGate(gateId);
        this.fxPop(this.player.x, this.player.y, 'magic', 0x48f0ff, 2.0);
        playInteractFx('gate', '빛의 광학 회로 완성! 장벽 해제');
        ui.toast.push('빛의 회로 완성! 네온 레이저 장벽이 열렸어요!', 'sparkle');
        void this.auth.request({ kind: 'gymClear', gateId });
      }
    }
  }

  private playRuneDemo(id: number) {
    if (this.runeDemoPlaying) return;
    const seq = this.parseSeq(this.objProp(id, 'seq'));
    this.runeDemoPlaying = true;
    this.fxPop(this.player.x, this.player.y, 'note', 0xffe478, 1.5);
    ui.toast.push(`별빛 룬 선율을 기억하세요! (${seq.map((n) => n + 1).join(' → ')})`, 'star');
    seq.forEach((n, i) => {
      this.time.delayedCall(i * 420, () => {
        if (!this.scene.isActive()) return;
        this.litRune = n;
        sfx.play(`note${n % 4}`);
      });
    });
    this.time.delayedCall(seq.length * 420 + 180, () => {
      if (!this.scene.isActive()) return;
      this.litRune = null;
      this.runeDemoPlaying = false;
    });
  }

  private stepRunePad(id: number) {
    const gateId = String(this.objProp(id, 'gateId') ?? 'sm_rune');
    const idx = Number(this.objProp(id, 'runeIdx') ?? 0);
    const seq = this.parseSeq(this.objProp(id, 'seq'));
    const RUNE_COL = [0xff5e78, 0x48c8ff, 0xffd848, 0xb874ff][idx % 4];
    if (this.openGates.has(gateId)) {
      sfx.play(`note${idx % 4}`);
      this.fxPop(this.player.x, this.player.y, 'note', RUNE_COL, 1.1);
      return;
    }
    sfx.play(`note${idx % 4}`);
    this.fxPop(this.player.x, this.player.y, 'note', RUNE_COL, 1.25);
    this.litRune = idx;
    this.time.delayedCall(260, () => {
      if (this.scene.isActive() && !this.runeDemoPlaying && this.litRune === idx) this.litRune = null;
    });
    const curStep = this.runeSteps.get(gateId) ?? 0;
    if (idx === seq[curStep]) {
      const nextStep = curStep + 1;
      this.runeSteps.set(gateId, nextStep);
      this.runeStep = nextStep;
      if (nextStep >= seq.length) {
        this.openGates.add(gateId);
        this.world.openGate(gateId);
        this.time.delayedCall(120, () => sfx.play('puzzle_ok'));
        playInteractFx('gate', `천공의 ${seq.length}음 선율 완성! 별빛 봉인 해제`);
        ui.toast.push(`천공의 ${seq.length}음 선율 완성! 별빛 결계가 열렸습니다!`, 'star');
        void this.auth.request({ kind: 'gymClear', gateId });
      } else {
        ui.toast.push(`별빛 룬 공명 (${nextStep}/${seq.length})`, 'star');
      }
    } else {
      this.runeSteps.set(gateId, 0);
      this.runeStep = 0;
      this.time.delayedCall(140, () => sfx.play('puzzle_ng'));
      ui.toast.push('음정이 어긋났어요! 노란 시범 제단에서 순서를 확인하고 처음부터 밟아 보세요.', 'star');
    }
  }

  // ── 맵 이동 (워프) + 포켓몬식 바닥 기믹 ─────────────
  private checkWarp() {
    if (this.warping || !this.playing) return;
    const w = this.world.info.warpAt(this.player.x, this.player.y - 3);
    if (w) this.warp(w);
  }
  private checkGimmicks(vx: number, vy: number, dt = 16) {
    if (this.warping || !this.playing || this.battling || this.player.busy) return;
    const info = this.world.info;
    const cx = Math.floor(this.player.x / TILE), cy = Math.floor((this.player.y - 3) / TILE);
    const cellKey = `${cx},${cy}`;
    this.checkFloorGymPuzzle(cx, cy, cellKey);
    if (this.padLock && this.padLock !== cellKey) this.padLock = '';
    if (this.switchLock && this.switchLock !== cellKey) this.switchLock = '';
    if (this.arrowLock && this.arrowLock !== cellKey && !this.player.isSliding) this.arrowLock = '';

    // 빙판 밖 일반 바닥에 발이 닿으면 빙판 미끄럼 즉시 해제
    if (this.player.slide?.mode === 'ice' && !info.isIce(cx, cy)) {
      this.player.stopSlide();
    }
    // 파도타기 중 육지/다리에 올라서면 자동으로 파도타기 하차
    if (this.player.surfing && info.terrainAt(cx, cy) !== '2' && this.player.slide?.mode !== 'current') {
      void this.toggleSurf(false);
    }
    // 해신의 바다: 방향성 해류 급류(sea_current) 위에 올라서면 물결 방향으로 쾌속 이동!
    const sc = info.seaCurrentAt(cx, cy);
    if (this.player.surfing && sc) {
      const dv = sc.dir === 'right' ? [1, 0] : sc.dir === 'down' ? [0, 1] : sc.dir === 'left' ? [-1, 0] : [0, -1];
      if (this.player.slide?.mode !== 'current' || this.player.slide.vx !== dv[0] || this.player.slide.vy !== dv[1]) {
        this.player.startSlide(dv[0], dv[1], 'current', TILE * 1.15);
        this.stage3d?.burst('splash', this.player.x, this.player.y, 5);
        sfx.play('water');
      }
      return;
    }
    if (this.player.slide?.mode === 'current' && !sc) {
      this.player.stopSlide();
    }

    // 상록시티/로켓단 아지트식 회전 화살표 연쇄 이동 + 정지 타일(stop_tile) 정지
    const ap = info.arrowAt(cx, cy);
    if (this.player.slide?.mode === 'arrow' && cellKey !== this.arrowLock) {
      const distCenter = Math.hypot(this.player.x - (cx * TILE + 8), this.player.y - (cy * TILE + 11));
      if (info.isStopTile(cx, cy) && distCenter < 7.5) {
        this.arrowLock = cellKey;
        this.player.setPosition(cx * TILE + 8, cy * TILE + 11);
        this.player.stopSlide();
        sfx.play('tap');
        return;
      }
      if (ap && distCenter < 7.5) {
        this.arrowLock = cellKey;
        const apDir = (ap.railGroup && ap.altDir && this.flippedRails.has(ap.railGroup)) ? ap.altDir : ap.dir;
        const dv = apDir === 'right' ? [1, 0] : apDir === 'down' ? [0, 1] : apDir === 'left' ? [-1, 0] : [0, -1];
        this.player.setPosition(cx * TILE + 8, cy * TILE + 11);
        sfx.play('dash');
        this.player.startSlide(dv[0], dv[1], 'arrow', ap.spin ? Infinity : ap.steps * TILE);
        return;
      }
    }

    const wp = info.warpPadAt(cx, cy);
    if (wp && this.padLock !== cellKey && !this.player.isSliding) {
      if (Math.hypot(this.player.x - (cx * TILE + 8), this.player.y - (cy * TILE + 11)) < 10.5) {
        void this.triggerWarpPad(wp);
        return;
      }
    }

    const sw = info.switchAt(cx, cy);
    if (sw && this.switchLock !== cellKey && !this.openGates.has(sw.gateId)) {
      if (Math.hypot(this.player.x - (cx * TILE + 8), this.player.y - (cy * TILE + 11)) < 10.5) {
        this.switchLock = cellKey;
        this.openGates.add(sw.gateId);
        this.world.openGate(sw.gateId);
        sfx.play('puzzle_ok');
        this.fxPop(this.player.x, this.player.y, 'sparkle', 0x52f0c8, 1.75);
        playInteractFx('gate', '봉인 장치 해제! 다음 통로가 열렸습니다');
        void this.auth.request({ kind: 'switch', gateId: sw.gateId }).then((r) => {
          if (r.ok && r.data?.item) ui.toast.push('장치가 작동해 통로가 열렸다!', 'sun');
        });
      }
    }

    if (ap && !this.player.isSliding && this.arrowLock !== cellKey) {
      if (Math.hypot(this.player.x - (cx * TILE + 8), this.player.y - (cy * TILE + 11)) < 10.5) {
        this.arrowLock = cellKey;
        const apDir = (ap.railGroup && ap.altDir && this.flippedRails.has(ap.railGroup)) ? ap.altDir : ap.dir;
        const dv = apDir === 'right' ? [1, 0] : apDir === 'down' ? [0, 1] : apDir === 'left' ? [-1, 0] : [0, -1];
        this.player.setPosition(cx * TILE + 8, cy * TILE + 11);
        sfx.play('dash');
        this.fxPop(cx * TILE + 8, cy * TILE + 10, 'sparkle', 0x48e0ff, 1.0);
        this.player.startSlide(dv[0], dv[1], 'arrow', ap.spin ? Infinity : ap.steps * TILE);
        return;
      }
    }

    // 쇳불 도장 (장막/검은먹식) 밀기 블록: 블록을 향해 짧게 밀면 1칸 이동 (E 키로도 밀기 가능)
    if (!this.player.isSliding && this.pushBlocks.size > 0 && Math.hypot(vx, vy) >= 0.4) {
      const dx = Math.abs(vx) >= Math.abs(vy) ? Math.sign(vx) : 0;
      const dy = dx ? 0 : Math.sign(vy);
      const tx1 = cx + dx, ty1 = cy + dy;
      const tx2 = Math.floor((this.player.x + dx * 11) / TILE), ty2 = Math.floor((this.player.y - 3 + dy * 11) / TILE);
      let hitId = 0;
      for (const [bid, bst] of this.pushBlocks) {
        if (!bst.locked && ((bst.x === tx1 && bst.y === ty1) || (bst.x === tx2 && bst.y === ty2))) { hitId = bid; break; }
      }
      if (hitId) {
        if (this.pushHoldTarget === hitId) this.pushHoldMs += dt;
        else { this.pushHoldTarget = hitId; this.pushHoldMs = dt; }
        if (this.pushHoldMs >= 110) {
          this.pushHoldMs = 0;
          this.pushHoldTarget = 0;
          void this.tryPushBlock(hitId, dx, dy);
        }
      } else {
        this.pushHoldMs = 0;
        this.pushHoldTarget = 0;
      }
    } else {
      this.pushHoldMs = 0;
      this.pushHoldTarget = 0;
    }

    if (info.isIce(cx, cy) && !this.player.isSliding && Math.hypot(vx, vy) >= 0.25) {
      const sx = Math.abs(vx) >= Math.abs(vy) ? Math.sign(vx) : 0;
      const sy = sx ? 0 : Math.sign(vy);
      if (sx || sy) {
        const px = this.player.x + sx * 6, py = this.player.y + sy * 6;
        if (this.world.grid.canStand(px, py)) {
          this.player.startSlide(sx, sy, 'ice', Infinity);
        }
      }
    }
  }
  private async triggerWarpPad(wp: { id: number; toX: number; toY: number; color: string }) {
    this.warping = true;
    this.player.stopStep();
    sfx.play('warp');
    const colHex = Phaser.Display.Color.HexStringToColor(wp.color || '#78d8ff').color;
    this.fxPop(this.player.x, this.player.y, 'magic', colHex, 1.6);
    playInteractFx('warp');
    this.cameras.main.flash(160, 210, 240, 255);
    const res = await this.auth.request({ kind: 'pad', objectId: wp.id });
    if (res.ok) {
      const nx = wp.toX * TILE + 8, ny = wp.toY * TILE + 13;
      this.padLock = `${wp.toX},${wp.toY}`;
      this.player.setPosition(nx, ny);
      this.partner?.teleport(nx, ny + 2);
      this.fxPop(nx, ny, 'magic', colHex, 1.6);
      this.auth.sendMove(nx, ny, this.player.dir, 'idle');
    }
    this.time.delayedCall(120, () => { this.warping = false; });
  }
  private warp(w: WarpDef) {
    if ((w.to === 'route1' || w.to === 'route31') && (!this.auth.me.party.length || this.auth.me.story < STORY.DONE)) {
      const [dx, dy] = DIR_VEC[this.player.dir];
      this.player.setPosition(this.player.x - dx * TILE, this.player.y - dy * TILE); this.player.stopStep();
      sfx.play('error');
      const msg = this.auth.me.story < STORY.MEET
        ? '마을 바깥 도로다… 오늘은 먼저 별빛 마을에서 할 일이 있어!'
        : this.auth.me.party.length > 0
          ? '아직은 갈 수 없어. 마을회관에서 소꿉친구와 첫 승부를 마쳐야 해!'
          : '아직은 갈 수 없어. 마을회관에서 오 이장님을 만나 파트너 루미를 받아야 해!';
      this.say([msg]);
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
    ui.shop.close(); ui.dialogue.close(false); ui.mailbox.close(); casinoModal.close(false);
    this.cancelFishing();
    this.cameras.main.fadeOut(300, 10, 14, 18);
    this.cameras.main.once('camerafadeoutcomplete', async () => {
      const r = await req();
      if (!r.ok && this.scene.isActive()) {
        this.warping = false; this.playing = true; onFail?.();
        this.cameras.main.fadeIn(250);
        if (r.reason === 'far') ui.toast.push('문 앞에 바짝 서서 눌러 주세요.', 'heart');
        else if (r.reason === 'casino-closed') ui.toast.push('🌙 별빛 카지노는 밤(오후 6시 이후)에만 입장할 수 있어요!', 'sun');
        else if (r.reason === 'need-partner') ui.toast.push('먼저 마을회관에서 파트너 루미를 받아 오세요!', 'lumi');
        else if (r.reason === 'need-surf') ui.toast.push('🌊 물결 배지(파도타기)가 있어야 해신의 바다로 나아갈 수 있어요!', 'badge_water');
        else if (r.reason?.startsWith('event:')) ui.toast.push(EventDirector.gateMessage(r.reason, this.auth.me), 'heart');
        else if (r.reason?.startsWith('gate:')) ui.toast.push(QUESTS.gates[r.reason.slice(5)]?.msg ?? '지금은 들어갈 수 없어요.', 'heart');
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
        else if (ev.type === 'time') { ui.hud.time(ev.time); phone.tick(ev.time); if (ev.time.minutes === 18 * 60) ui.toast.push('🌙 해가 지고 가로등이 켜져요. 별빛 카지노도 영업을 시작합니다!', 'sun'); if (ev.time.minutes === 24 * 60) ui.toast.push('자정이 넘었어요! 곧 자러 가야 해요.', 'energy'); }
        else if (ev.type === 'gold') { if (ev.playerId === me.id) { ui.hud.gold(ev.gold); ui.shop.gold(ev.gold); casinoModal.refreshGold(ev.gold); phone.refresh(); if (ev.delta > 0) ui.toast.push(`+${ev.delta}G`, 'gold'); } }
        else if (ev.type === 'player' && ev.id === me.id) { ui.hud.energy(ev.energy, me.maxEnergy); this.ensureHeld(); ui.craft.refresh(); ui.shop.refresh(); phone.refresh(); }
        else if (ev.type === 'objectRemoved') { const [m, id] = ev.key.split(':'); if (m === this.mapId && (!ev.owner || ev.owner === this.auth.farmOwner)) this.world.removeObject(Number(id)); }
        else if (ev.type === 'opened' && ev.playerId === me.id) { const [m, id] = ev.key.split(':'); if (m === this.mapId) this.world.removeObject(Number(id)); }
        else if (ev.type === 'cleared' && ev.playerId === me.id) {
          const [m, id] = ev.key.split(':');
          if (m === this.mapId) {
            if (/^\d+$/.test(id)) {
              const numId = Number(id);
              const wo = this.world.objects.find((o) => o.id === numId);
              if (wo?.gateId) {
                this.openGates.add(wo.gateId);
                this.world.openGate(wo.gateId);
              }
              this.world.removeObject(numId);
            } else {
              this.openGates.add(id);
              this.world.openGate(id);
            }
          }
        }
        else if (ev.type === 'objectRestored' && (!ev.playerId || ev.playerId === me.id)) { for (const k of ev.keys) { const [m, id] = k.split(':'); if (m === this.mapId) this.world.restoreObject(Number(id)); } }
        else if (ev.type === 'forage') this.renderForage();
        else if (ev.type === 'placed') { if (this.mapId === 'farm' && ev.owner === this.auth.farmOwner) this.world.addPlaced(ev.obj.id, ev.obj.type, ev.obj.x, ev.obj.y); }
        else if (ev.type === 'unplaced') { if (this.mapId === 'farm' && ev.owner === this.auth.farmOwner) this.world.removePlaced(ev.id); }
        else if (ev.type === 'party' && ev.id === me.id) { this.syncPartner(); ui.craft.refresh(); phone.refresh(); if (ev.badges.length > this.badgeCount && this.badgeCount >= 0) { if (this.battling) this.badgeJingle = true; else music.jingle('jingle_badge'); } this.badgeCount = ev.badges.length; }
        else if (ev.type === 'help' && ev.playerId === me.id) { this.partner?.cheer(4); ui.toast.push(ev.text, 'lumi'); }
        else if (ev.type === 'toast' && (!ev.playerId || ev.playerId === me.id) && (!ev.room || ev.room === this.auth.room)) ui.toast.push(ev.text, ev.icon);
        else if (ev.type === 'newDay') { ui.hud.time(ev.time); this.stage3d?.markSoilDirty(); if (ev.time.weather === 'rain') ui.toast.push('비가 와요. 오늘은 물을 안 줘도 돼요!', 'rain'); }
        else if (ev.type === 'room' && ev.playerId === me.id) this.goRoom();
        else if (ev.type === 'look') {
          if (ev.id === me.id) {
            this.applyMyLook(ev.look, ev.name);
          } else {
            const r = this.remotes.get(ev.id);
            if (r) {
              const p = { x: r.x, y: r.y };
              this.removeRemote(ev.id);
              this.addRemote(ev.id, this.auth.roster.get(ev.id)?.title === 'admin' ? `[admin] ${ev.name}` : ev.name, ev.look, p.x, p.y);
            }
            this.renderRoster();
            if (phone.open) phone.refresh();
          }
        }
        else if (ev.type === 'emote' && ev.room === this.auth.room) { const who: Character | undefined = ev.playerId === me.id ? this.player : this.remotes.get(ev.playerId); who?.showEmote(ev.emote, 2200); }
        else if (ev.type === 'dish' && ev.room === this.auth.room) this.renderDish();
        else if (ev.type === 'invite' && ev.to === me.id) ui.invitePrompt.show(ev.fromName, ev.where, () => this.acceptInvite(ev.from));
        else if (ev.type === 'sleep') ui.toast.push(`친구들이 모두 잠들면 다음 날이 시작돼요 (${ev.ready}/${ev.total}명 잠듦)`, 'energy');
        else if (ev.type === 'bmState' && ev.id === me.id) {
          applyUiTheme(ev.uiTheme);
          this.player.bubbleSkin = ev.chatBubble ?? 'default';
          this.syncPartner();
          phone.refresh();
          if (ui.mailbox.open) this.openMailbox();
        }
        else if (ev.type === 'prisonState' && ev.playerId === me.id) {
          this.updatePrisonHud();
        }
        else if (ev.type === 'prisonLabor' && ev.playerId === me.id) {
          this.updatePrisonHud();
        }
        else if (ev.type === 'karma' && ev.playerId === me.id) {
          this.updatePrisonHud();
          this.syncNoticeHud();
          phone.refresh();
        }
        else if (ev.type === 'notices' && ev.playerId === me.id) {
          this.syncNoticeHud();
          phone.refresh();
        }
        else if (ev.type === 'mute' && ev.playerId === me.id) {
          if (phone.open) phone.refresh();
        }
        else if (ev.type === 'cheatFreeze' && ev.playerId === me.id) {
          this.triggerCheatFreeze(ev.reason ?? '비정상 재화 증가 치트 감지', false, ev.message || 'your are bad cheater');
        }
        break;
      }
      case 'players': {
        // 서버는 같은 방(room)에 있는 사람만 보내줌: 내 농장에는 초대한 친구만, 마을부터는 모두
        for (const p of e.list) {
          if (roomOf(p.map, p.inst, p.world) !== this.auth.room) { this.removeRemote(p.id); continue; }
          let r = this.remotes.get(p.id);
          if (r && r.look !== p.look) { this.removeRemote(p.id); r = undefined; }
          if (!r) { r = this.addRemote(p.id, p.title === 'admin' ? `[admin] ${p.name}` : p.name, p.look, p.x, p.y); if (this.playing) ui.toast.push(`${p.name}님이 왔어요!`, 'heart'); }
          r.bubbleSkin = p.chatBubble ?? 'default';
          r.push(p.x, p.y, p.dir, p.anim);
          let rp = this.remotePartners.get(p.id);
          if (p.partner && !rp) { rp = new Partner(this, p.partner, p.x, p.y + 10, p.lumiCoord ?? ''); this.remotePartners.set(p.id, rp); }
          if (p.partner && rp) { rp.setSpecies(p.partner); rp.setCoord(p.lumiCoord ?? ''); }
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
  /** 씬 재시작이나 화면 멈춤 없이 내 외형과 머리 위 닉네임 라벨을 즉시 갱신 */
  private applyMyLook(look: string, name: string) {
    this.auth.me.look = look;
    if (name) this.auth.me.name = name;
    if (this.player) {
      const sheet = this.manifest.characters[look] ? look : 'm1';
      this.player.setSheet(sheet, this.manifest.characters[sheet]);
      this.syncPlayerLabel();
    }
    this.renderRoster();
    if (phone.open) phone.refresh();
  }

  private syncPlayerLabel() {
    if (!this.player) return;
    const isAdmin = this.auth.isAdmin || this.auth.me.isAdmin;
    const text = isAdmin ? `[admin] ${this.auth.me.name}` : this.auth.me.name;
    const color = isAdmin ? '#ff8a7a' : '#fff8ec';
    if (!this.player.label) {
      this.player.label = this.add.text(this.player.x, this.player.y, text, {
        fontFamily: 'Galmuri9, Galmuri11, sans-serif',
        fontSize: '8px',
        color,
        stroke: '#3b2414',
        strokeThickness: 2,
        resolution: this.zoom,
      }).setOrigin(0.5, 1);
    } else {
      this.player.label.setText(text).setColor(color);
    }
  }

  private whereText(r: { id: string; map: MapId; inst: string }) {
    if (r.map === 'farm' || isHomeMap(r.map)) {
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
      bmMail: me.mailItems ?? [],
      onClaimBm: (giftId) => void this.auth.request({ kind: 'bmClaimMail', giftId }).then((res) => { if (!res.ok) sfx.play('error'); else sfx.play('item'); if (ui.mailbox.open) this.openMailbox(); }),
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
    this.player.busy = false;
    this.player.play('idle');
    this.playing = false;
    ui.creator.show({
      title: '옷장',
      sub: '기본 의상이나 구매한 캐쉬 의상으로 바로 갈아입을 수 있어요. (닉네임 변경은 휴대폰 상점의 닉네임 변경권을 이용해 주세요)',
      name: me.name,
      look: me.look,
      askName: false,
      ownedOutfits: me.ownedOutfits ?? [],
      onDone: async (look) => {
        this.playing = true;
        this.player.busy = false;
        const r = await this.auth.request({ kind: 'setLook', look });
        if (r.ok) {
          this.applyMyLook(look, this.auth.me.name);
          sfx.play('confirm');
          ui.toast.push('의상을 갈아입었어요!', 'heart');
        } else {
          ui.toast.push('내 집 옷장에서만 바꿀 수 있어요.', 'heart');
        }
      },
      onCancel: () => {
        this.playing = true;
        this.player.busy = false;
      },
    });
  }
  private tableInteraction(): { label: string; run: () => void } {
    if (this.mapId === 'home' && this.auth.me.inst === this.auth.me.id && this.auth.me.momLeft) {
      const evil = this.auth.me.evilStack ?? 0;
      return {
        label: label('📝 식탁 위의 엄마 쪽지 읽기'),
        run: () => {
          sfx.play('page');
          this.say([
            '「너가 부끄럽구나 찾지 않았으면 좋겠구나」',
            `불법 탈옥으로 엄마가 집을 떠나셨습니다.\n현재 악행스택: ${evil} / ${EVIL_STACK_MAX}\n\n마을 사람들을 한 명 한 명 찾아가 일손을 도와 선행(+1)을 쌓아 악행스택을 0으로 만들면 엄마가 집으로 돌아오십니다.`,
          ], '📝 식탁 위의 쪽지');
        },
      };
    }
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
  private fxPop(x: number, y: number, kind: BurstKind, ringCol = 0xffe58a, ringRad = 1.2) {
    this.stage3d?.burst(kind, x, y, 8);
    this.stage3d?.ring(x, y, ringCol, ringRad, 0.45);
  }
  /** 현재 맵 · 지형에 따른 포켓몬식 야생 조우 환경 판별 */
  private encounterEnv(): EncounterEnv {
    if (this.player?.surfing || this.mapId === 'ocean_shrine') return 'water';
    if (this.mapId === 'altar' || this.mapId === 'origin' || this.mapId === 'stella_nest' || this.world.biome === 'distortion' || /^spire_/.test(this.mapId)) return 'cosmic';
    if (this.world.cave) {
      if (this.world.theme === 'ice') return 'snow';
      if (this.world.theme === 'lava') return 'volcano';
      if (this.world.theme === 'sea') return 'water';
      return 'cave';
    }
    if (this.world.biome === 'snow') return 'snow';
    if (this.world.biome === 'volcano' || this.world.biome === 'desert') return 'volcano';
    if (this.world.biome === 'beach') return 'water';
    const [cx, cy] = this.player.cell();
    if (this.world.grassCells.has(`${cx},${cy}`)) return 'grass';
    if (MAP_META[this.mapId]?.kind === 'town') return 'town';
    return 'grass';
  }
  /** 위치·지형별 발걸음 현장 연출 (풀숲 사각사각 · 설원/빙판 서리가루 · 동굴 먼지 · 해변 물방울 · 화산 불티) */
  private emitEnvStepFx(surf: string) {
    const now = performance.now();
    if (now < this.envStepCooldown) return;
    const [cx, cy] = this.player.cell();
    const key = `${cx},${cy}`;
    if (this.world.grassCells.has(key)) {
      this.envStepCooldown = now + 170;
      this.stage3d?.burst('grass', this.player.x, this.player.y, 3);
      if (this.lastEnvStepCell !== key) this.stage3d?.ring(this.player.x, this.player.y, 0x70e860, 0.72, 0.3);
      this.lastEnvStepCell = key;
      return;
    }
    if (this.world.info.isIce(cx, cy) || this.world.biome === 'snow' || this.world.theme === 'ice') {
      this.envStepCooldown = now + 200;
      this.stage3d?.burst('frost', this.player.x, this.player.y, 2);
      return;
    }
    if (this.world.biome === 'volcano' || this.world.theme === 'lava' || this.mapId === 'gym_ember' || this.mapId === 'gym_forge') {
      if (Math.random() < 0.35) {
        this.envStepCooldown = now + 280;
        this.stage3d?.burst('ember', this.player.x, this.player.y, 2);
      }
      return;
    }
    if (this.world.cave) {
      if (Math.random() < 0.45) {
        this.envStepCooldown = now + 260;
        this.stage3d?.burst('dust', this.player.x, this.player.y, 1);
      }
      return;
    }
    if (surf === 'sand' || this.world.biome === 'beach') {
      // 물가 인접 시 물보라 파문
      const nearWater = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.world.info.terrainAt(cx + dx, cy + dy) === '2');
      if (nearWater) {
        this.envStepCooldown = now + 260;
        this.stage3d?.ring(this.player.x, this.player.y, 0x78dcff, 0.78, 0.36);
        this.stage3d?.burst('splash', this.player.x, this.player.y, 2);
      }
    }
  }
  private chips(o: WorldObject) {
    this.stage3d?.burst('chips', o.sprite.x, o.sprite.y, 8);
    for (let i = 0; i < 7; i++) {
      const c = this.add.rectangle(o.sprite.x + Phaser.Math.Between(-6, 6), o.sprite.y - 8, 2, 2, Phaser.Utils.Array.GetRandom([0xc99260, 0x8c5a33, 0xe0b080])).setDepth(o.sprite.y + 1);
      this.tweens.add({ targets: c, x: c.x + Phaser.Math.Between(-14, 14), y: { value: c.y + Phaser.Math.Between(2, 8), ease: 'Bounce.Out' }, alpha: 0, duration: 600, onComplete: () => c.destroy() });
    }
  }
  private leaves(o: WorldObject) {
    this.stage3d?.burst('leaves', o.sprite.x, o.sprite.y, 38);
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
    // 런타임 재화 치트 감시 (매 250ms): 비정상 골드·캐쉬 변조 즉시 1초 과부하 프리징 발동!
    if (!this.cheatFreezing && (this.cheatWatchAcc += dt) >= 250) {
      this.cheatWatchAcc = 0;
      const tamper = this.auth.checkCurrencyTamper();
      if (tamper) { this.triggerCheatFreeze(tamper, true); return; }
    }
    if (this.cheatFreezing) return;
    const k = this.keys;
    const canMove = this.playing && !ui.confirm.open && !ui.dialogue.open && !ui.chat.typing && !ui.shop.open && !casinoModal.open && !this.battling && !this.fishing && !ui.party.open;
    // 키보드(-1/0/1) + 모바일 조이스틱(연속값) → 합쳐서 -1~1 로. 대각선은 Player.move 에서 속도를 맞춤
    const clamp1 = (n: number) => Math.max(-1, Math.min(1, n));
    const vx = canMove ? clamp1((k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0) + touch.vx) : 0;
    const vy = canMove ? clamp1((k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0) + touch.vy) : 0;
    const inCycle = this.world.info.inCycleZone(this.player.x, this.player.y);
    if (inCycle && !this.bikeZoneEntered) {
      this.bikeZoneEntered = true;
      if (!this.player.riding && this.auth.me.inventory.some((s) => s.itemId === 'bicycle')) void this.toggleBike(true);
    } else if (!inCycle) {
      this.bikeZoneEntered = false;
    }
    this.player.riding = !!this.auth.me.riding && !this.world.interior && !this.world.cave;
    const run = k.SHIFT.isDown || touch.run;
    this.player.move(dt, { vx, vy, run }, this.npcs.filter((n) => n.state !== 'gone' && n.sprite.visible));
    this.player.update();
    const groundY = this.player.sprite.getData('groundY');
    const syncY = typeof groundY === 'number' ? groundY : this.player.y;
    if (this.playing) this.auth.sendMove(this.player.x, syncY, this.player.dir, this.player.anim);
    if (this.player.moving) this.farm?.brush(this.player.x, this.player.y);
    this.checkWarp();
    this.checkGimmicks(vx, vy, dt);
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
    for (const wl of this.waterLumis) wl.update(dt, this.player);
    if (isPrisonMap(this.mapId)) this.tickPrison(dt);
    this.homeMom?.update();
    this.yardGuard?.update();
    for (const r of this.remotes.values()) r.tick();
    this.world.update(dt, this.player);
    if (this.world.interior) this.world.updateWindows(this.auth.time.minutes, this.auth.time.weather);
    this.atmo.follow(this.player.x, this.player.y);
    this.atmo.update(dt, minutes);
    this.updateCursor();
    const followCam = (this.cameras.main as unknown as { _follow?: object | null })._follow != null && !this.cameras.main.panEffect.isRunning;
    this.stage3d?.setGymPuzzleState({
      flippedRails: this.flippedRails,
      revealedCards: this.revealedCards,
      prismRots: this.prismRots,
      litLaserDests: this.litLaserDests,
      laserSegments: this.laserSegments,
      litRune: this.litRune,
      matchedRunes: this.runeStep,
      demoActive: this.runeDemoPlaying,
      quizWrongUntil: this.quizWrongUntil,
      waterLevel: this.waterLevel,
      pushBlocks: this.pushBlocks,
      crackedTiles: this.crackedTiles,
    }, this.openGates);
    this.stage3d?.update(dt, {
      player: this.player,
      partner: this.partner,
      npcs: this.npcs,
      trainers: this.trainers,
      storyActors: [
        ...this.story.getActors(),
        ...(this.homeMom ? [this.homeMom] : []),
        ...(this.yardGuard ? [this.yardGuard] : []),
      ],
      plotActors: this.plot.getActors(),
      remotes: this.remotes.values(),
      remotePartners: this.remotePartners.values(),
      chickens: this.chickens,
      ducks: this.ducks,
      waterLumis: this.waterLumis,
      wardens: this.wardens,
      forage: this.forageSprites.values(),
      crops: this.farm?.getCrops(),
      tiles: this.farm?.getTiles(),
      legend: this.legendSprite,
      dish: this.dishSprite ?? this.noteSprite,
      bobber: this.fishing?.bobber,
      cursor: this.cursor,
      cam: { baseZoom: this.zoom, followPlayer: followCam },
      openGates: this.openGates,
      minutes,
      weather: this.auth.time.weather,
    });
  }

  private updateCursor() {
    if (!this.playing || ui.dialogue.open || ui.shop.open || casinoModal.open || this.battling || this.fishing) { this.cursor.setVisible(false); ui.hint.set(null); return; }
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
    const coord = this.auth.me.lumiCoord ?? '';
    if (!this.partner) { this.partner = new Partner(this, lead.species, this.player.x, this.player.y + 10, coord); this.partner.poof(); }
    else { this.partner.setSpecies(lead.species); this.partner.setCoord(coord); }
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
    if (n > 0) { sfx.play('item'); this.say(t.teach, t.name, NPCS[npc]?.sprite); }
  }

  /** 작업대 창: 집(전부) · 볼 공방(민수) · 연구소(한별 박사) · 마을 공방장인 */
  private openCraft(where: 'home' | 'smithy' | 'lab', custom?: { sprite: string; portrait?: string; name: string; title: string }) {
    this.player.play('idle');
    const keeper = custom ?? (where === 'smithy' ? NPCS.minsu : where === 'lab' ? NPCS.hanbyeol : undefined);
    const title = custom?.title ?? (where === 'home' ? '나의 작업대' : where === 'smithy' ? '민수의 볼 공방' : '한별 연구소 · 약품 조합기');
    const sub = custom
      ? '"재료만 있으면 볼이든 회복약이든 강화 도구든 마음껏 만들어 보게!"'
      : where === 'home' ? '밭에서 키운 약초와 캐 온 광석으로 직접 만들어요.' : where === 'smithy' ? '"화덕은 마음껏 써. 배운 대로만 하면 볼은 절대 안 깨져."' : '"조합 비율만 지키면 누구나 좋은 약을 만들 수 있다네."';
    ui.craft.show({
      title, sub,
      keeper: keeper ? { sprite: keeper.sprite, portrait: 'portrait' in keeper ? keeper.portrait : keeper.sprite, name: keeper.name } : undefined,
      teacher: where === 'home' || custom ? undefined : where === 'smithy' ? 'minsu' : 'hanbyeol',
      me: () => this.auth.me,
      onCraft: (id, times) => { void this.auth.request({ kind: 'craft', recipe: id, times }).then((res) => { if (res.ok) sfx.play(where === 'smithy' ? 'craft_fire' : where === 'lab' ? 'craft_lab' : 'craft_bench'); else sfx.play('error'); ui.craft.refresh(); }); },
    });
  }

  /** 별빛 카지노(밤 18:00~02:00 전용): 골드를 걸고 슬롯 · 주사위 · 하이로우 플레이 */
  private openCasino(initialGame: CasinoGame = 'slot') {
    if (!isCasinoOpen(this.auth.time.minutes)) {
      sfx.play('error');
      ui.toast.push('🌙 별빛 카지노는 밤(오후 6시 ~ 새벽 2시)에만 이용할 수 있어요!', 'sun');
      return;
    }
    this.player.play('idle');
    casinoModal.show({
      initialGame,
      gold: () => this.auth.gold,
      onBet: (game, bet, pick) => this.auth.request({ kind: 'casinoBet', game, bet, pick }),
    });
  }

  private casinoDealerDialogue(sprite = 'extra_innkeeper', onDone?: () => void) {
    this.player.play('idle');
    ui.dialogue.show({
      name: '순자',
      title: '별빛 카지노 지배인',
      sprite,
      color: '#d87090',
      pages: ['🌙 별빛 카지노에 어서 오세요! 보유한 골드를 걸고 한 판 승부를 즐겨 보시겠어요?'],
      choices: [
        { label: '🎰 별빛 슬롯 (최대 10배)', primary: true, run: () => this.openCasino('slot') },
        { label: '🎲 루미 주사위 (2~5배)', run: () => this.openCasino('dice') },
        { label: '🃏 하이·로우 카드 (2~8배)', run: () => this.openCasino('highlow') },
        { label: '📖 규칙 듣기', run: () => ui.dialogue.show({ name: '순자', title: '별빛 카지노 지배인', sprite, color: '#d87090', pages: ['별빛 카지노는 매일 밤 6시(18:00)부터 새벽 2시까지만 운영됩니다.', '승리하면 베팅금의 2배~10배 골드를 즉시 지급해 드리며, 패배 시 베팅한 골드를 잃게 돼요. 건전하게 즐겨 주세요!'] }) },
      ],
    }, onDone);
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
        this.cameras.main.shake(id === 'smash' ? 220 : 120, id === 'smash' ? 0.007 : 0.003);
        this.fxPop(o.sprite.x, o.sprite.y, id === 'cut' ? 'grass' : id === 'smash' ? 'rock' : 'sparkle', id === 'cut' ? 0x70e860 : id === 'smash' ? 0xffaa44 : 0x7ceeff, 1.6);
        ui.toast.push(sk.use.replaceAll('{lumi}', lumi), 'lumi');
      });
    }, 1);
  }

  private healAt(who: string, line: string, after?: () => void, sprite?: string) {
    if (!this.auth.me.party.length) { this.say(['돌봐 줄 루미가 아직 없어요.'], who); return; }
    void this.auth.request({ kind: 'heal' }).then(() => {
      this.partner?.cheer(2);
      this.cameras.main.flash(300, 255, 240, 250);
      this.fxPop(this.player.x, this.player.y, 'heart', 0xff8ac0, 1.8);
      this.stage3d?.burst('sparkle', this.player.x, this.player.y, 14);
      playInteractFx('heal', `${who}의 돌봄으로 루미들이 모두 건강해졌어요!`);
      sfx.play('heal_machine');
      music.jingle('jingle_heal');
      this.player.play('idle');
      ui.dialogue.show({ name: who, pages: [line], sprite: sprite ?? (who === '한별 박사' ? 'professor' : who === '다온' ? 'nurse' : undefined) }, after);
    });
  }

  private talkTrainer(t: Trainer) {
    t.faceTo(this.player.x, this.player.y);
    this.stage3d?.ring(t.x, t.y, 0xffd848, 1.35, 0.45);
    const portrait = t.def.portrait ?? t.def.sprite;
    if (t.def.id === 'champion' && this.auth.me.defeated.includes('champion')) { this.masterTalk(t); return; }
    if (this.auth.me.defeated.includes(t.def.id)) { this.say(t.def.after.map((l) => `${t.def.name}: "${l}"`), t.def.name, portrait); return; }
    if (!this.auth.me.party.some((c) => c.hp > 0)) { this.say([`${t.def.name}: "싸울 수 있는 루미가 없잖아! 먼저 쉬게 해 줘."`], t.def.name, portrait); return; }
    this.challenge(t);
  }

  private checkTrainers() {
    if (!this.auth.me.party.some((c) => c.hp > 0) || ui.dialogue.open) return;
    for (const t of this.trainers) {
      if (t.approaching || this.auth.me.defeated.includes(t.def.id)) continue;
      if (t.sees(this.player.x, this.player.y)) {
        this.playing = false;
        sfx.play('encounter');
        this.cameras.main.shake(170, 0.004);
        this.fxPop(t.x, t.y, 'sparkle', 0xff4838, 1.85);
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
    if (!dexComplete(me)) { this.say([`${t.def.name}: "챔피언 자리는 네 거야. 그래도 루미나 지방의 루미를 전부 만나 봤어?"`, `${t.def.name}: "루미 도감을 다 채우면(${have}/${need.length}) 다시 와. 그땐 내 진짜 팀으로 상대해 줄게."`], t.def.name, t.def.sprite); return; }
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
    if (this.mapId === 'ocean_shrine' && !this.caughtSp(SEA_LEGEND)) {
      const a = this.world.objects.find((o) => o.interact === 'sea_altar');
      if (a) put('haerang', 'lumi_big_haerang', a.sprite.x, a.sprite.y - 16, 0.65);
    }
    if (this.mapId === 'ocean_shrine') {
      for (const o of this.world.objects) {
        if (o.type !== 'tide_seal') continue;
        const idx = Number(this.objProp(o.id, 'sealIdx') ?? 0);
        if (me.flags.includes(`tide_seal_${idx}`)) {
          const col = Phaser.Display.Color.HexStringToColor(String(this.objProp(o.id, 'color') ?? '#38bdf8')).color;
          this.stage3d?.spireBeam(col, o.sprite.x, o.sprite.y, false);
        }
      }
    }
    // 빛이 켜진 탑 꼭대기: 빛줄기
    const top = /^spire_(\w)_top$/.exec(this.mapId);
    if (top && me.flags.includes(`lit_${top[1]}`)) this.spireBeam(top[1], false);
  }
  private spireBeam(d: string, burst: boolean) {
    const ped = this.world.objects.find((o) => (o.interact ?? '').startsWith('spire_top:')); if (!ped) return;
    const col = Phaser.Display.Color.HexStringToColor(QUESTS.spires[d]?.color ?? '#ffe58a').color;
    const x = ped.sprite.x, y = ped.sprite.y - 10;
    this.stage3d?.spireBeam(col, ped.sprite.x, ped.sprite.y, burst);
    const beam = this.add.rectangle(x, y, 10, 400, col, 0.55).setOrigin(0.5, 1).setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
    const glow = this.add.rectangle(x, y, 26, 400, col, 0.22).setOrigin(0.5, 1).setDepth(DEPTH.glow).setBlendMode(Phaser.BlendModes.ADD);
    if (burst) { beam.setScale(0.1, 0); glow.setScale(0.1, 0); this.tweens.add({ targets: [beam, glow], scaleX: 1, scaleY: 1, duration: 900, ease: 'Cubic.Out' }); }
    this.tweens.add({ targets: [beam, glow], alpha: { from: 0.75, to: 0.35 }, duration: 1100, yoyo: true, repeat: -1 });
  }
  private async toggleBike(force?: boolean) {
    const r = await this.auth.request({ kind: 'toggleBike', force });
    if (!r.ok) return;
    const riding = !!r.data?.qty;
    this.player.riding = riding;
    this.player.play(riding ? (this.player.moving ? 'bike' : 'bike_idle') : (this.player.moving ? 'walk' : 'idle'), this.player.dir);
    if (riding) sfx.play('bike_bell');
  }
  private async toggleSurf(on: boolean, tx?: number, ty?: number) {
    const r = await this.auth.request({ kind: 'toggleSurf', on, tx, ty });
    if (!r.ok) {
      if (r.reason === 'need-surf') this.say([SKILLS.surf.look, SKILLS.surf.need]);
      return;
    }
    const surfing = !!r.data?.qty;
    this.player.surfing = surfing;
    if (surfing) {
      this.player.riding = false;
      if (tx != null && ty != null) {
        this.player.setPosition(tx * TILE + 8, ty * TILE + 12);
      }
      sfx.play('water');
      this.fxPop(this.player.x, this.player.y, 'splash', 0x38bdf8, 1.45);
      ui.toast.push('🌊 파도타기! 푸른 물결 위로 미끄러져 나아갑니다.', 'badge_water');
    } else {
      this.player.stopSlide();
      sfx.play('hop');
      this.stage3d?.ring(this.player.x, this.player.y, 0x9ce8ff, 0.9, 0.35);
    }
  }
  private tideSealInteraction(o: WorldObject): { label: string; run: () => void } {
    const idx = Number(this.objProp(o.id, 'sealIdx') ?? 0);
    const done = this.auth.me.flags.includes(`tide_seal_${idx}`);
    const names = ['서쪽 산호', '동쪽 암초', '중앙 진주'];
    return {
      label: label(done ? `${names[idx] ?? ''} 조류 비석 (활성화됨)` : `🌊 ${names[idx] ?? ''} 조류 비석 깨우기`),
      run: () => {
        this.player.playOnce('interact', this.player.dir, () => {
          void this.auth.request({ kind: 'tideSeal', objectId: o.id }).then((r) => {
            if (!r.ok) return;
            const colHex = String(this.objProp(o.id, 'color') ?? '#38bdf8');
            const col = Phaser.Display.Color.HexStringToColor(colHex).color;
            const cnt = r.data?.qty ?? 0;
            sfx.play(r.data?.item === 'opened' ? 'sparkle' : 'confirm');
            this.fxPop(o.sprite.x, o.sprite.y, 'splash', col, 1.8);
            this.stage3d?.spireBeam(col, o.sprite.x, o.sprite.y, true);
            if (r.data?.item === 'opened') {
              this.cameras.main.shake(700, 0.004);
              playInteractFx('gate', '세 조류 비석이 모두 공명했다! 북쪽 소용돌이 장벽 개방!');
              this.say([
                '세 조류 비석의 빛이 하나로 모이며 바다 깊은 곳에서 웅장한 파도 소리가 울려 퍼진다…!',
                '북쪽을 가로막던 거대한 심해의 소용돌이가 잠잠해졌다! 해신의 성소로 나아가 보자!',
              ]);
            } else if (r.data?.item === 'already') {
              ui.toast.push(`🌊 이미 깨어난 조류 비석이에요. (진행도 ${cnt}/3)`, 'badge_water');
            } else {
              playInteractFx('gate', `제${idx + 1} 조류 비석 활성화! (${cnt}/3)`);
              ui.toast.push(`🌊 제${idx + 1} 조류 비석이 푸르게 공명했다! (${cnt}/3)`, 'badge_water');
            }
          });
        }, 1);
      },
    };
  }
  private seaAltarInteraction(o: WorldObject): { label: string; run: () => void } {
    const me = this.auth.me;
    if (!me.flags.includes('sea_shrine_open')) {
      return {
        label: label('해신의 제단 살펴보기'),
        run: () => this.say([o.text ?? '해신의 제단.', '아직 세 조류 비석이 모두 깨어나지 않아 잠잠하다.']),
      };
    }
    if (this.caughtSp(SEA_LEGEND)) {
      return {
        label: label('해신의 제단 살펴보기'),
        run: () => this.say(['제단 위 바닷빛 진주가 평온하게 반짝이고 있다.', '전설의 물 루미 해랑과 맺은 인연이 잔잔한 파도처럼 이어진다.']),
      };
    }
    return {
      label: label('🌊 해신의 제단 — 전설의 물 루미 「해랑」에게 도전!'),
      run: () => this.seaLegendScene(),
    };
  }
  private seaLegendScene() {
    if (!this.auth.me.party.some((c) => c.hp > 0)) { this.say(['싸울 수 있는 루미가 없다. 먼저 회복하고 오자.']); return; }
    this.playing = false; phone.close();
    sfx.play('sparkle');
    this.fxPop(this.player.x, this.player.y, 'splash', 0x48e8ff, 2.2);
    const cam = this.cameras.main;
    cam.shake(800, 0.004); cam.flash(900, 120, 220, 255);
    this.time.delayedCall(950, async () => {
      const r = await this.auth.request({ kind: 'seaLegend' });
      if (r.battle) this.startBattle(r.battle, () => {
        if (this.caughtSp(SEA_LEGEND) && this.legendId === 'haerang') {
          this.legendSprite?.destroy(); this.legendSprite = undefined; this.legendId = '';
        }
      });
      else this.playing = true;
    });
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
    this.stage3d?.burst('sparkle', ball.x, p.y, 26);
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
    if ((me.evilStack ?? 0) > 0 && me.lastHelpedNpc !== id) {
      const help = await new Promise<boolean>((res) => ui.confirm.show(`🤝 ${def.name}의 텃밭 일손을 도와드릴까요?\n(선행 +1 · 남은 악행스택 ${me.evilStack} → ${(me.evilStack ?? 1) - 1})`, () => res(true), { yes: '일손 돕기', no: '다음에', onNo: () => res(false) }));
      if (help) {
        const gr = await this.auth.request({ kind: 'goodDeed', npc: id });
        if (gr.ok) {
          sfx.play('confirm');
          npc.showEmote(2, 1600);
          this.fxPop(npc.x, npc.y, 'heart', 0xffe066, 1.3);
          await ui.dialogue.say({ name: def.name, title: def.title, sprite: def.sprite, color: def.color, pages: ['정말 고마워! 이렇게 마을 사람들을 진심으로 돕다 보면 어머니도 꼭 마음을 열어 주실 거야!'] });
        }
      }
    }
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
    const portrait = t.def.portrait ?? t.def.sprite;
    ui.dialogue.show({ name: `${t.def.title} ${t.def.name}`, sprite: portrait, color: '#c8453c', pages: t.def.intro }, async () => {
      const r = await this.auth.request({ kind: 'trainer', trainerId: t.def.id });
      if (r.battle) {
        this.pendingBattleMeta = { trainerId: t.def.id, portrait };
        this.startBattle(r.battle, () => { if (t.def.sight > 0) t.returnHome(); });
      } else {
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
    if (this.world.cave) { if (this.world.info.warpAt(this.player.x, this.player.y) || Math.random() > 0.025) return; }
    else if (this.player.surfing && this.world.info.terrainAt(cx, cy) === '2') {
      if (this.world.info.warpAt(this.player.x, this.player.y) || this.world.info.seaCurrentAt(cx, cy) || Math.random() > 0.032) return;
    } else { if (!this.world.grassCells.has(key)) return; if (Math.random() > 0.04) return; }
    this.playing = false;
    void this.auth.request({ kind: 'encounter' }).then((r) => { if (r.battle) this.startBattle(r.battle); else this.playing = true; });
  }

  private startBattle(update: BattleUpdate, after?: () => void) {
    this.battling = true; this.playing = false;
    const meta = this.pendingBattleMeta;
    this.pendingBattleMeta = undefined;
    touch.setVisible(false);
    this.cancelFishing();
    ui.dialogue.close(false); ui.shop.close(); ui.party.close(); phone.close();
    this.auth.sendAnim('interact', this.player.dir);
    const v = update.view;
    music.play(v.foe.species === MYTH ? 'battle_genesis' : SPECIES[v.foe.species]?.legend || v.trainer?.title === '루미 마스터' ? 'battle_champion' : battleTrack(v.kind, v.trainer?.title));
    // 관장 8명 · 사천왕 · 챔피언 · 전설 3종 · 위치별(풀숲/동굴/물/설원/화산/우주) 전용 포켓몬식 시네마틱 전환!
    void playBattleIntro({
      kind: v.kind,
      env: this.encounterEnv(),
      fromFish: meta?.fromFish,
      foeSpecies: v.foe.species,
      foeName: v.foe.name,
      foeLegend: SPECIES[v.foe.species]?.legend,
      trainer: v.trainer
        ? { id: meta?.trainerId, name: v.trainer.name, title: v.trainer.title, sprite: v.trainer.sprite, portrait: meta?.portrait ?? v.trainer.sprite }
        : undefined,
    }).then(() => {
      if (!this.scene.isActive()) return;
      const data: BattleData = {
        auth: this.auth, update,
        onEnd: (ended) => {
          this.battling = false;
          this.stage3d?.setBattleHidden(false);
          this.stage3d?.resize();
          touch.setVisible(true);
          this.playMapMusic();
          if (this.badgeJingle) {
            this.badgeJingle = false;
            music.jingle('jingle_badge');
            const b = this.auth.me.badges.at(-1);
            if (b) playInteractFx('badge', `${ITEMS[b]?.name ?? '도장 배지'} 획득!`);
            if (b && this.auth.me.mode === 'story') this.time.delayedCall(600, () => captureMemory(this, this.auth.me.id, b, `${ITEMS[b]?.name ?? '배지'} 획득`));
          }
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
      this.fxPop(tx * TILE + 8, ty * TILE + 9, 'splash', 0x78dcff, 1.35);
      this.fishing.phase = 'wait'; this.fishing.t = (1500 + Math.random() * 2500) * (fishHelp ? 0.6 : 1);
      ui.toast.push('찌가 흔들리면 Space / E / 클릭!', 'rod');
    } });
  }
  private tickFishing(dt: number) {
    const f = this.fishing; if (!f || f.phase === 'cast') return;
    f.t -= dt;
    if (f.phase === 'wait') {
      f.bobber.y = f.ty * TILE + 9 + Math.sin(this.time.now / 300) * 0.6;
      if (f.t <= 0) {
        sfx.play('bite');
        this.cameras.main.shake(120, 0.004);
        this.fxPop(f.tx * TILE + 8, f.ty * TILE + 9, 'splash', 0xffe58a, 1.9);
        f.phase = 'bite'; f.t = f.window; this.player.showEmote(1, 0); ui.fishing.show('!');
        this.tweens.add({ targets: f.bobber, y: f.bobber.y + 2, duration: 80, yoyo: true, repeat: 3 });
      }
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
    this.fxPop(tx * TILE + 8, ty * TILE + 9, 'splash', 0x48c8ff, 1.8);
    const r = await this.auth.request({ kind: 'fish', tx, ty });
    if (r.ok && !r.battle) this.time.delayedCall(360, () => sfx.play('fish_catch'));
    if (r.battle) {
      this.pendingBattleMeta = { fromFish: true };
      this.startBattle(r.battle);
    } else if (r.ok) {
      this.partnerHelpFx();
      this.fxPop(tx * TILE + 8, ty * TILE + 8, 'sparkle', 0xffe066, 1.5);
      const s = this.add.image(tx * TILE + 8, ty * TILE + 8, 'sparkle').setDepth(ty * TILE + 30);
      this.tweens.add({ targets: s, y: s.y - 20, alpha: 0, duration: 700, onComplete: () => s.destroy() });
    }
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
    const sp = this.forageSprites.get(key);
    const fx = sp?.x ?? this.player.x, fy = sp?.y ?? this.player.y;
    this.player.playOnce('interact', this.player.dir, async () => {
      const r = await this.auth.request({ kind: 'forage', key });
      if (r.ok) {
        sfx.play('forage');
        this.fxPop(fx, fy, 'sparkle', 0x90e858, 1.15);
        this.partnerHelpFx();
      }
    }, 1);
  }

  // ── 안티치트 1초 과부하 프리징 · 별빛 교도소 탈옥 미니게임 · 휴대폰 고지서 HUD ──
  private syncNoticeHud() {
    const notices = this.auth.me.notices ?? [];
    const unread = notices.filter((n) => !n.read);
    const hasFine = unread.some((n) => n.kind === 'fine');
    ui.hud.notices(unread.length, hasFine, () => {
      if (this.hasPhone()) phone.show('messages');
    });
  }

  private spawnPrison() {
    if (!isPrisonMap(this.mapId)) return;
    const info = this.world.info;
    const wMeta = this.manifest.characters.warden ?? this.manifest.characters.doyun;
    const wSheet = this.manifest.characters.warden ? 'warden' : 'doyun';
    // 노역 채광장: 친절한 교도소 감독관 배치
    if (this.mapId === 'in_prison_yard') {
      const gs = info.spawns.get('yard_guard') ?? { x: 14 * TILE + 8, y: 6 * TILE + 12 };
      const guard = new Character(this, wSheet, gs.x, gs.y + 4, wMeta);
      guard.play('idle', 'down');
      guard.label = this.add.text(gs.x, gs.y - 26, '👮 노역 감독관', {
        fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '7px', color: '#93c5fd', stroke: '#0f172a', strokeThickness: 2, resolution: this.zoom,
      }).setOrigin(0.5, 1).setDepth(DEPTH.ui);
      this.yardGuard = guard;
      return;
    }
    const isWall = (tx: number, ty: number) => {
      if (tx < 0 || ty < 0 || tx >= info.width || ty >= info.height) return true;
      const obj = this.world.objectAt(tx, ty);
      if (obj && (obj.type === 'prison_stairs_up' || obj.type === 'prison_hatch')) return false;
      return this.world.grid.blocked(tx, ty);
    };
    for (const s of info.spawnList) {
      if (!s.name.startsWith('warden:')) continue;
      const routeStr = String(s.properties?.find((p) => p.name === 'route')?.value ?? '');
      const speed = Number(s.properties?.find((p) => p.name === 'speed')?.value ?? 42);
      const pts: [number, number][] = routeStr
        .split(';')
        .map((pair) => pair.split(',').map((v) => Number(v.trim())))
        .filter((a) => a.length === 2 && Number.isFinite(a[0]) && Number.isFinite(a[1])) as [number, number][];
      if (!pts.length) pts.push([Math.floor(s.x / TILE), Math.floor(s.y / TILE)]);
      this.wardens.push(new PrisonWarden(this, wSheet, wMeta, pts, speed, isWall, this.zoom));
    }
  }

  /** 내 집 1층(home) 엄마 배치: 탈옥 후 momLeft === true 면 엄마가 집을 떠나고 식탁에 쪽지만 남음! */
  private spawnHomeMom() {
    if (this.mapId !== 'home' || this.auth.me.inst !== this.auth.me.id) return;
    if (this.auth.me.momLeft) {
      // 식탁 위에 하얀 쪽지(반짝이) 표시
      const tbl = this.world.objects.find((o) => o.type === 'dtable');
      if (tbl) {
        const sp = this.add.image(tbl.sprite.x, tbl.sprite.y - 16, 'glint').setDepth(tbl.sprite.y + 4);
        this.tweens.add({ targets: sp, alpha: 0.4, scale: 1.18, duration: 700, yoyo: true, repeat: -1 });
        this.noteSprite = sp;
      }
      return;
    }
    const mMeta = this.manifest.characters.mom;
    if (!mMeta) return;
    const mx = 7 * TILE + 8, my = 5 * TILE + 12;
    const mom = new Character(this, 'mom', mx, my, mMeta);
    mom.play('idle', 'down');
    mom.label = this.add.text(mx, my - 26, '엄마', {
      fontFamily: 'Galmuri9, Galmuri11, sans-serif', fontSize: '7px', color: '#ffe4d6', stroke: '#4a2418', strokeThickness: 2, resolution: this.zoom,
    }).setOrigin(0.5, 1).setDepth(DEPTH.ui);
    this.homeMom = mom;
  }

  private updatePrisonHud() {
    const me = this.auth.me;
    const inPrison = isPrisonMap(this.mapId);
    const evil = me.evilStack ?? 0;
    if (!inPrison && evil <= 0) {
      this.prisonHud?.remove();
      this.prisonHud = undefined;
      return;
    }
    if (!this.prisonHud) {
      const el = document.createElement('div');
      el.className = 'prison-hud';
      document.getElementById('ui')?.appendChild(el);
      this.prisonHud = el;
    }
    this.prisonHud.classList.remove('ready', 'warn', 'danger', 'evil');
    if (!inPrison) {
      this.prisonHud.classList.add('evil');
      this.prisonHud.innerHTML = `<span class="ph-pill">😈 악행스택 ${evil}/${EVIL_STACK_MAX}</span><span>엄마가 집을 떠나셨습니다 · 마을 사람을 도와 선행(+1)으로 0을 만드세요!</span>`;
      return;
    }
    if (this.mapId === 'in_prison_yard') {
      const slabs = me.prisonSlabs ?? 0;
      const planks = me.prisonPlanks ?? 0;
      const haveStone = me.inventory.reduce((n, s) => n + (s.itemId === 'stone' ? s.quantity : 0), 0);
      const haveWood = me.inventory.reduce((n, s) => n + (s.itemId === 'wood' ? s.quantity : 0), 0);
      const haveSlab = me.inventory.reduce((n, s) => n + (s.itemId === 'stone_slab' ? s.quantity : 0), 0);
      const havePlank = me.inventory.reduce((n, s) => n + (s.itemId === 'wood_plank' ? s.quantity : 0), 0);
      const ready = slabs + haveSlab >= PRISON_LABOR_GOAL && planks + havePlank >= PRISON_LABOR_GOAL;
      if (ready) this.prisonHud.classList.add('ready');
      this.prisonHud.innerHTML = `<span class="ph-pill">⛏️ 노역 납품 석판 ${slabs}/${PRISON_LABOR_GOAL} · 나무판 ${planks}/${PRISON_LABOR_GOAL}</span><span>보유: 돌 ${haveStone} · 나무 ${haveWood} · 석판 ${haveSlab} · 나무판 ${havePlank}</span>`;
      return;
    }
    const floor = PRISON_FLOOR_LABEL[this.mapId] ?? this.mapId;
    const anyChase = this.wardens.some((w) => w.aiState === 'chase');
    const anySusp = this.wardens.some((w) => w.aiState === 'suspicious');
    if (anyChase) {
      this.prisonHud.classList.add('danger');
      this.prisonHud.innerHTML = `<span class="ph-pill">🚨 추격 발동! (${floor})</span><span>경찰 감시관이 빠르게 쫓아옵니다! 벽 뒤로 도망치거나 계단으로 올라가세요!</span>`;
      return;
    }
    if (anySusp) {
      this.prisonHud.classList.add('warn');
      const maxSusp = Math.max(...this.wardens.map((w) => w.suspicionMs));
      const left = Math.max(0.1, (3000 - maxSusp) / 1000).toFixed(1);
      this.prisonHud.innerHTML = `<span class="ph-pill">❓ 경계 중 (${left}초)</span><span>경찰 감시관과 눈이 마주쳤습니다! 빠르게 시야에서 벗어나세요!</span>`;
      return;
    }
    if (this.mapId === 'in_prison_1f') {
      this.prisonHud.classList.add('ready');
      this.prisonHud.innerHTML = `<span class="ph-pill">☀️ ${floor}</span><span>북쪽 빛이 새는 금이 간 외벽을 [E/Space]로 부수면 탈옥 성공!</span>`;
      return;
    }
    if (this.mapId === 'in_prison' && !this.cellOfferShown && this.cellWaitMs > 800) {
      const rem = Math.max(1, Math.ceil((8000 - this.cellWaitMs) / 1000));
      this.prisonHud.innerHTML = `<span class="ph-pill">⛓️ ${floor}</span><span>금이 간 벽을 부숴 탈옥 OR 독방에서 ${rem}초 대기(성실 노역 석방)</span>`;
      return;
    }
    this.prisonHud.innerHTML = `<span class="ph-pill">⛓️ ${floor}</span><span>금이 간 벽을 [E/Space]로 부수고 경찰 감시관을 피해 지상 1층으로 올라가세요!</span>`;
  }

  private breakPrisonWall(o: WorldObject) {
    if (this.player.busy) return;
    const dir = facingFromVector(o.sprite.x - this.player.x, o.sprite.y - this.player.y, this.player.dir);
    this.auth.sendAnim('pick', dir);
    this.player.playOnce('pick', dir, async () => {
      sfx.play('pick');
      const r = await this.auth.request({ kind: 'prisonBreakWall', objectId: o.id });
      if (r.ok) {
        sfx.play('rock_break');
        this.cameras.main.shake(150, 0.006);
        this.fxPop(o.sprite.x, o.sprite.y, 'rock', 0xfacc15, 1.5);
        this.chips(o);
        this.updatePrisonHud();
      } else {
        sfx.play('error');
        this.world.shake(o, 1);
      }
    }, 3);
  }

  private breakEscapeWall(o: WorldObject) {
    if (this.player.busy) return;
    const dir = facingFromVector(o.sprite.x - this.player.x, o.sprite.y - this.player.y, this.player.dir);
    this.auth.sendAnim('pick', dir);
    this.player.playOnce('pick', dir, async () => {
      sfx.play('rock_break');
      this.cameras.main.flash(450, 255, 248, 200);
      this.cameras.main.shake(260, 0.01);
      this.fxPop(o.sprite.x, o.sprite.y, 'rock', 0xfef08a, 2.0);
      this.stage3d?.burst('sparkle', o.sprite.x, o.sprite.y, 18);
      const r = await this.auth.request({ kind: 'prisonEscape' });
      if (r.ok) {
        sfx.play('confirm');
        this.updatePrisonHud();
        this.syncNoticeHud();
      } else {
        sfx.play('error');
      }
    }, 3);
  }

  private async ascendPrison(next: MapId) {
    if (this.stairsLock || this.warping) return;
    this.stairsLock = true;
    sfx.play('dash');
    this.moveRoom(() => this.auth.request({ kind: 'prisonAscend', to: next }), () => { this.stairsLock = false; });
  }

  private gatherYard(o: WorldObject, resource: 'stone' | 'wood') {
    if (this.player.busy) return;
    const dir = facingFromVector(o.sprite.x - this.player.x, o.sprite.y - this.player.y, this.player.dir);
    const anim = resource === 'stone' ? 'pick' : 'axe';
    this.auth.sendAnim(anim, dir);
    this.player.playOnce(anim, dir, async () => {
      sfx.play(anim);
      const r = await this.auth.request({ kind: 'yardGather', objectId: o.id, resource });
      if (r.ok) {
        sfx.play('rock_break');
        this.cameras.main.shake(100, 0.004);
        this.fxPop(o.sprite.x, o.sprite.y, resource === 'stone' ? 'rock' : 'sparkle', resource === 'stone' ? 0xd1d5db : 0xe2a96a, 1.3);
        this.chips(o);
        this.updatePrisonHud();
      } else {
        sfx.play('error');
      }
    }, 3);
  }

  private openPrisonCraft() {
    const me = this.auth.me;
    const stone = me.inventory.reduce((n, s) => n + (s.itemId === 'stone' ? s.quantity : 0), 0);
    const wood = me.inventory.reduce((n, s) => n + (s.itemId === 'wood' ? s.quantity : 0), 0);
    const make = (out: 'stone_slab' | 'wood_plank', qty: number) => async () => {
      const r = await this.auth.request({ kind: 'yardCraft', out, qty });
      if (r.ok) { sfx.play('confirm'); this.updatePrisonHud(); this.openPrisonCraft(); }
      else { sfx.play('error'); ui.toast.push('재료(돌/나무)가 부족하거나 가방이 가득 찼어요!'); }
    };
    const choices: { label: string; run: () => void; primary?: boolean }[] = [];
    const maxSlabs = Math.min(100, Math.floor(stone / 5));
    const maxPlanks = Math.min(100, Math.floor(wood / 5));
    if (maxSlabs > 0) {
      choices.push({ label: `🪨 석판 전부 제작 (${maxSlabs}개 · 돌 ${maxSlabs * 5}개)`, primary: true, run: () => void make('stone_slab', maxSlabs)() });
      if (maxSlabs > 1) choices.push({ label: '🪨 석판 1개 제작 (돌 5개)', run: () => void make('stone_slab', 1)() });
      if (maxSlabs >= 10) choices.push({ label: '🪨 석판 10개 제작 (돌 50개)', run: () => void make('stone_slab', 10)() });
    }
    if (maxPlanks > 0) {
      choices.push({ label: `🪵 나무판 전부 제작 (${maxPlanks}개 · 나무 ${maxPlanks * 5}개)`, primary: maxSlabs <= 0, run: () => void make('wood_plank', maxPlanks)() });
      if (maxPlanks > 1) choices.push({ label: '🪵 나무판 1개 제작 (나무 5개)', run: () => void make('wood_plank', 1)() });
      if (maxPlanks >= 10) choices.push({ label: '🪵 나무판 10개 제작 (나무 50개)', run: () => void make('wood_plank', 10)() });
    }
    choices.push({ label: '닫기', run: () => {} });
    ui.dialogue.show({
      name: '🔨 노역 작업대',
      pages: [`보유 재료: 돌 ${stone}개 · 나무 ${wood}개\n돌 5개 → 석판 1개 / 나무 5개 → 나무판 1개\n(석판 100개 · 나무판 100개를 납품하면 정식 석방됩니다!)`],
      choices,
    });
  }

  private openPrisonDeliver() {
    const me = this.auth.me;
    const slabs = me.prisonSlabs ?? 0;
    const planks = me.prisonPlanks ?? 0;
    const haveSlab = me.inventory.reduce((n, s) => n + (s.itemId === 'stone_slab' ? s.quantity : 0), 0);
    const havePlank = me.inventory.reduce((n, s) => n + (s.itemId === 'wood_plank' ? s.quantity : 0), 0);
    const choices: { label: string; run: () => void; primary?: boolean }[] = [];
    if (haveSlab > 0 || havePlank > 0) {
      choices.push({
        label: `📦 석판(${haveSlab}) · 나무판(${havePlank}) 전부 납품하기`,
        primary: true,
        run: async () => {
          const willFinish = slabs + haveSlab >= PRISON_LABOR_GOAL && planks + havePlank >= PRISON_LABOR_GOAL;
          if (willFinish) {
            await ui.dialogue.say({
              name: '👮 교도소 감독관', sprite: 'warden', color: '#1d4ed8',
              pages: ['석판 100개, 나무판 100개 전부 완납했구나!', '성실하게 죗값을 치렀으니 오늘부로 정식 석방한다. 집으로 돌아가 어머니를 뵙도록 해라.'],
            });
          }
          const r = await this.auth.request({ kind: 'yardDeliver' });
          if (r.ok) { sfx.play('confirm'); this.updatePrisonHud(); }
          else sfx.play('error');
        },
      });
    }
    choices.push({ label: '닫기', run: () => {} });
    ui.dialogue.show({
      name: '📦 노역 납품함',
      pages: [`현재 납품 현황: 석판 ${slabs} / ${PRISON_LABOR_GOAL} · 나무판 ${planks} / ${PRISON_LABOR_GOAL}\n가방 보유: 석판 ${haveSlab}개 · 나무판 ${havePlank}개\n(둘 다 100개씩 납품하면 즉시 정식 석방됩니다!)`],
      choices,
    });
  }

  private talkYardGuard() {
    const me = this.auth.me;
    const slabs = me.prisonSlabs ?? 0, planks = me.prisonPlanks ?? 0;
    ui.dialogue.show({
      name: '👮 노역 감독관', sprite: 'warden', color: '#1d4ed8',
      pages: [`열심히 일하고 있군! 현재 석판 ${slabs}/${PRISON_LABOR_GOAL} · 나무판 ${planks}/${PRISON_LABOR_GOAL} 납품했다.\n서쪽에서 돌, 동쪽에서 나무를 캐서 작업대에서 가공한 뒤 납품함에 넣어라.`],
      choices: [
        { label: '🔨 노역 작업대 열기', primary: true, run: () => this.openPrisonCraft() },
        { label: '📦 납품함 열기', run: () => this.openPrisonDeliver() },
        { label: '닫기', run: () => {} },
      ],
    });
  }

  private minePrisonOre(o: WorldObject) {
    if (this.player.busy) return;
    const dir = facingFromVector(o.sprite.x - this.player.x, o.sprite.y - this.player.y, this.player.dir);
    this.auth.sendAnim('pick', dir);
    this.player.playOnce('pick', dir, async () => {
      sfx.play('pick');
      const r = await this.auth.request({ kind: 'prisonMine', objectId: o.id });
      if (r.ok) {
        sfx.play('rock_break');
        this.cameras.main.shake(120, 0.0045);
        this.fxPop(o.sprite.x, o.sprite.y, 'rock', 0xffe478, 1.35);
        this.chips(o);
        this.updatePrisonHud();
      } else {
        sfx.play('error');
        this.world.shake(o, 1);
      }
    }, 3);
  }

  private async escapePrison(o: WorldObject) {
    const r = await this.auth.request({ kind: 'prisonEscape' });
    if (r.ok) {
      sfx.play('confirm');
      this.fxPop(o.sprite.x, o.sprite.y, 'magic', 0x4ade80, 1.8);
      this.updatePrisonHud();
      this.syncNoticeHud();
    } else sfx.play('error');
  }

  /** 교도소 전 층 통합 업데이트: 경찰 AI('?' 3초 → '!' 추격) + 지하 5층 성실 대기 트리거 + 계단 자동 등반 */
  private tickPrison(dt: number) {
    if (this.mapId === 'in_prison_yard') return;
    const locked = !this.playing || this.time.now < this.prisonCaughtLockUntil || ui.dialogue.open;
    let caught = false;
    for (const w of this.wardens) {
      const ev = w.tickAI(dt, this.player.x, this.player.y, locked);
      if (ev === 'suspicious') {
        sfx.play('blip');
        ui.toast.push('❓ 경찰 감시관이 인기척을 느꼈습니다! 3초 안에 벽 뒤로 숨으세요!', 'heart');
      } else if (ev === 'chase') {
        sfx.play('error');
        this.cameras.main.shake(180, 0.008);
        ui.toast.push('🚨 경찰 감시관이 전력으로 쫓아옵니다! 빠르게 도망치세요!', 'heart');
      } else if (ev === 'caught' && !locked && !this.battling && !this.warping) {
        caught = true;
      }
    }
    this.updatePrisonHud();

    if (caught) {
      this.prisonCaughtLockUntil = this.time.now + 1400;
      sfx.play('error');
      this.cameras.main.flash(360, 220, 24, 48);
      this.cameras.main.shake(280, 0.012);
      this.player.stopStep();
      for (const w of this.wardens) w.resetPatrol();
      void this.auth.request({ kind: 'prisonCaught' }).then(() => {
        if (this.mapId === 'in_prison') {
          const cell = this.world.info.spawns.get('entry') ?? this.world.info.spawns.get('player') ?? { x: 56, y: 200 };
          this.player.setPosition(cell.x, cell.y + 5);
          this.player.play('idle', 'right');
          this.cellWaitMs = 0;
          this.updatePrisonHud();
        }
      });
      return;
    }

    if (locked || this.warping) return;

    // 1) 계단 타일을 직접 밟으면 자동으로 위층 올라가기!
    const [pcx, pcy] = this.player.cell();
    const stObj = this.world.objectAt(pcx, pcy) ?? this.world.interactAt(pcx, pcy);
    if (!this.stairsLock && stObj?.interact?.startsWith('prison_up:')) {
      void this.ascendPrison(stObj.interact.slice(10) as MapId);
      return;
    }

    // 2) 지하 5층 독방에 가만히 있으면 8초 뒤 감시관이 노역 채광장으로 안내!
    if (this.mapId === 'in_prison' && !this.cellOfferShown) {
      const inCell = pcx <= 6 && pcy >= 10;
      const wallIntact = this.world.objects.some((o) => o.type === 'cracked_wall' && o.cellX === 7 && o.cellY === 12 && o.sprite.active);
      if (inCell && wallIntact) {
        this.cellWaitMs += dt;
        if (this.cellWaitMs >= 8000) {
          this.cellOfferShown = true;
          this.player.stopStep();
          sfx.play('blip');
          ui.dialogue.show({
            name: '👮 경찰 감시관', sprite: 'warden', color: '#1d4ed8',
            pages: [
              '조용히 반성하고 있군. 이제 일할 시간이다.',
              '바깥 노역 채광장에 가서 돌과 나무를 캐고, 석판 100개와 나무판 100개를 만들어 납품하면 정식으로 석방해 주지.',
            ],
            choices: [
              {
                label: '⛏️ 네, 성실히 일하겠습니다 (노역 채광장으로 이동)',
                primary: true,
                run: () => this.moveRoom(() => this.auth.request({ kind: 'prisonEnterYard' })),
              },
              {
                label: '⛓️ 잠시 독방에 남겠습니다',
                run: () => { ui.toast.push('독방 금이 간 벽을 부숴 탈옥하거나, 다시 노역에 참여할 수 있어요.'); },
              },
            ],
          });
        }
      } else {
        this.cellWaitMs = 0;
      }
    }
  }

  /** 정식 석방 / 악행스택 0 달성 후 집 안으로 걸어 들어가 엄마를 만나는 귀가 연출 + 두부 한 모 지급 */
  private async playHomecomingCutscene() {
    const mode = this.auth.me.pendingHomecoming;
    if (!mode) { this.playing = true; return; }
    this.playing = false;
    this.player.stopStep();
    const targetY = 6 * TILE + 14;
    // 집 문 앞에서 거실의 엄마 앞까지 천천히 걸어 들어가는 연출
    this.player.play('walk', 'up');
    await new Promise<void>((res) => {
      this.tweens.add({
        targets: this.player.sprite,
        y: targetY,
        duration: 1100,
        ease: 'Sine.easeInOut',
        onUpdate: () => this.player.update(),
        onComplete: () => res(),
      });
    });
    this.player.play('idle', 'up');
    this.homeMom?.showEmote(2, 2400);
    if (this.homeMom) this.fxPop(this.homeMom.x, this.homeMom.y, 'heart', 0xff9eb8, 1.5);
    sfx.play('heal_machine');
    if (mode === 'honest') {
      await ui.dialogue.say({
        name: '엄마', sprite: 'mom', color: '#c0705a',
        pages: [
          '어머, 돌아왔구나… 고생 정말 많았지.',
          '무슨일이 생기든 나는 너를 응원한단다',
          '앞으로는 성실하고 떳떳하게 살았으면 좋겠어',
          '자, 엄마가 따뜻한 두부 한 모 준비해 두었단다. 얼른 받아 들렴!',
        ],
      });
    } else {
      await ui.dialogue.say({
        name: '엄마', sprite: 'mom', color: '#c0705a',
        pages: [
          '돌아왔구나… 마을 사람들이 네가 한 사람 한 사람 진심으로 도와주었다고 전해 주었단다.',
          '무슨일이 생기든 나는 너를 응원한단다',
          '앞으로는 성실하고 떳떳하게 살았으면 좋겠어',
          '여기, 새로 시작하는 마음으로 따뜻한 두부 한 모 먹으렴.',
        ],
      });
    }
    const r = await this.auth.request({ kind: 'completeHomecoming' });
    if (r.ok) {
      music.jingle('jingle_heal');
      this.fxPop(this.player.x, this.player.y, 'sparkle', 0xffe066, 1.8);
    }
    this.updatePrisonHud();
    this.playing = true;
  }

  private talkHomeMom() {
    this.homeMom?.showEmote(2, 1400);
    this.fxPop(this.homeMom!.x, this.homeMom!.y, 'heart', 0xffb8c8, 1.15);
    ui.dialogue.show({
      name: '엄마', sprite: 'mom', color: '#c0705a',
      pages: ['무슨일이 생기든 나는 너를 응원한단다.', '언제든 지치면 집에 들러 푹 쉬다 가렴!'],
    });
  }

  private async doGoodDeed(npc: Npc) {
    const r = await this.auth.request({ kind: 'goodDeed', npc: npc.def.id });
    const portrait = npc.def.portrait ?? npc.def.sprite;
    if (r.ok) {
      sfx.play('confirm');
      npc.showEmote(2, 1600);
      this.fxPop(npc.x, npc.y, 'heart', 0xffe066, 1.35);
      const rem = this.auth.me.evilStack ?? 0;
      const lines = rem === 0
        ? ['정말 고마워요! 마을 사람들 모두가 당신이 얼마나 성실히 변했는지 알게 되었어요.', '어머니께서도 소식을 듣고 집으로 돌아오셨을 거예요! 얼른 집으로 가 보세요!']
        : [`정말 고마워요! 덕분에 큰 도움이 됐어요. (선행 +1 · 남은 악행스택: ${rem}/${EVIL_STACK_MAX})`, '다른 마을 사람들도 한 명 한 명 찾아가 도와주면 어머니께서 분명 돌아오실 거예요!'];
      ui.dialogue.show({ name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color, pages: lines, hearts: npc.hearts });
      this.updatePrisonHud();
    } else if (r.reason === 'same-npc') {
      sfx.play('blip');
      ui.dialogue.show({
        name: npc.def.name, title: npc.def.title, sprite: portrait, color: npc.def.color,
        pages: ['방금 내 일손을 도와주었잖아요! 다른 마을 사람들도 한 명 한 명 찾아가 도와주고 오세요!'],
        hearts: npc.hearts,
      });
    }
  }

  /** 치트(비정상 재화 변조) 감지 시 1초 과부하 프리징 + "your are bad cheater" 알림창 + 재접속 시 감옥 수감 */
  private triggerCheatFreeze(reason: string, notifyAuth: boolean, alertText = 'your are bad cheater') {
    if (this.cheatFreezing) return;
    this.cheatFreezing = true;
    this.playing = false;
    this.player?.stopStep();
    phone.close();
    ui.dialogue.close(false);
    if (notifyAuth) void this.auth.request({ kind: 'cheatCaught', reason });

    document.getElementById('cheat-overload')?.remove();
    const ov = document.createElement('div');
    ov.id = 'cheat-overload';
    ov.className = 'cheat-overload';
    ov.innerHTML = `<div class="cheat-overload-box">
      <div class="cheat-overload-title">⚠ SYSTEM OVERLOAD ⚠</div>
      <div class="cheat-overload-msg" data-co-msg>비정상 재화 치트 감지 — 게임 과부하 정지 중…</div>
      <div class="cheat-overload-bar"><div class="cheat-overload-fill" data-co-fill></div></div>
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => {
      const fill = ov.querySelector<HTMLElement>('[data-co-fill]');
      if (fill) fill.style.width = '100%';
    });

    // 1초간 과부하 경고음 + 화면 진동 연출 후 완전 멈춤
    for (const ms of [0, 220, 440, 680, 900]) {
      window.setTimeout(() => {
        try { sfx.play('error'); } catch { /* 무시 */ }
        try { this.cameras?.main?.shake(160, 0.018); } catch { /* 무시 */ }
      }, ms);
    }

    window.setTimeout(() => {
      ov.classList.add('frozen');
      const msgEl = ov.querySelector<HTMLElement>('[data-co-msg]');
      if (msgEl) msgEl.textContent = alertText;
      try { this.scene.pause(); } catch { /* 무시 */ }
      try { this.game.loop.sleep(); } catch { /* 무시 */ }
      window.setTimeout(() => {
        window.alert(alertText);
        location.reload();
      }, 60);
    }, 1000);
  }
}
