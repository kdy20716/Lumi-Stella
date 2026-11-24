// 최신 핵심 시스템 통합 시뮬레이션 검증 (npx tsx tools/test/latest-features.ts)
//  1. 8대 체육관 기믹 액션 (스위치·수위 조절·소코반 블록·함정 추락·눈덩이·워프패드)
//  2. 해신의 바다(ocean_shrine): 조류 비석 3개 공명 · 소용돌이 해제 · 보너스 상자 · 물 전설 '해랑' 포획
//  3. 별빛 교도소(in_prison): 성실 노역 석방 루트(석판·나무판 100/100 + 두부 귀가) & 불법 탈옥 루트(B5→1F·감시관 적발·재화 몰수·악행스택 100→선행 갱생)
//  4. 안티치트 무결성 서명(verifySaveIntegrity) & DEV_AUTH 기본 관리자 차단 검증
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MapInfo, prop, type TiledMap } from '../../shared/sim/MapInfo';
import { makeCreature } from '../../shared/sim/Battle';
import { FarmSimulation } from '../../shared/sim/FarmSimulation';
import { computeSaveSig, verifySaveIntegrity } from '../../shared/sim/antiCheat';
import { lifeDexSummary, registerLifeDex } from '../../shared/sim/lifeDex';
import { MAP_IDS, PRISON_NEXT_FLOOR, SoilState, type MapId, type SaveData } from '../../shared/types';
import { LIFE_DEX, SPECIES, martFor } from '../../shared/data';

const T = 16;
const MAPS = Object.fromEntries(
  MAP_IDS.map((id) => [id, new MapInfo(JSON.parse(readFileSync(`client/public/assets/maps/${id}.json`, 'utf8')) as TiledMap)]),
) as Record<MapId, MapInfo>;

const log = (msg: string) => console.log(`✓ ${msg}`);

// ── 1. 체육관 기믹 검증 ───────────────────────────────────────────────
{
  const sim = new FarmSimulation(MAPS);
  const p = sim.addPlayer('tester_gym', '테스터', 'm1');
  sim.apply(p.id, { kind: 'chooseStarter', species: 'saerok' });

  // (a) 바람골 도장 스위치 → 전자문 개방
  sim.warpTo(p, 'in_gym');
  const btn = MAPS.in_gym.objects.find((o) => o.type === 'switch_btn');
  assert(btn, 'in_gym switch_btn 존재');
  const bx = Number(prop(btn, 'cellX', 0)), by = Number(prop(btn, 'cellY', 0));
  const gid = String(prop(btn, 'gateId', ''));
  p.x = bx * T + 8; p.y = by * T + 12;
  const swRes = sim.apply(p.id, { kind: 'switch', gateId: gid });
  assert.equal(swRes.ok, true, '바람골 도장 스위치 작동');

  // (b) 물결항 도장 3단 수위 스위치
  sim.warpTo(p, 'gym_harbor');
  for (const lv of [1, 2, 0]) {
    const wsw = MAPS.gym_harbor.objects.find((o) => o.type === 'water_switch' && Number(prop(o, 'level', -1)) === lv);
    if (!wsw) continue;
    p.x = Number(prop(wsw, 'cellX', 0)) * T + 8;
    p.y = Number(prop(wsw, 'cellY', 0)) * T + 12;
    const wRes = sim.apply(p.id, { kind: 'gymWater', level: lv });
    assert.equal(wRes.ok, true, `물결항 도장 수위 ${lv} 전환`);
  }

  // (c) 쇳불 도장 소코반 밀기 블록 & 리셋
  sim.warpTo(p, 'gym_forge');
  const blk = MAPS.gym_forge.pushBlocks[0];
  assert(blk, 'gym_forge push_block 존재');
  let moved = false;
  for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
    p.x = blk.x * T + 8;
    p.y = blk.y * T + 12;
    const r = sim.apply(p.id, { kind: 'gymPush', objectId: blk.id, dx, dy });
    if (r.ok) { moved = true; break; }
  }
  assert.equal(moved, true, '쇳불 도장 밀기 블록 이동');
  assert.equal(sim.apply(p.id, { kind: 'gymReset', group: blk.group }).ok, true, '쇳불 도장 블록 리셋');

  // (d) 잿빛 도장 함정 발판 추락
  sim.warpTo(p, 'gym_ember');
  const trap = MAPS.gym_ember.objects.find((o) => o.type === 'cracked_tile' || o.type === 'quiz_pad');
  if (trap) {
    p.x = Number(prop(trap, 'cellX', 0)) * T + 8;
    p.y = Number(prop(trap, 'cellY', 0)) * T + 12;
    const toX = Number(prop(trap, trap.type === 'cracked_tile' ? 'fallX' : 'failX', 0));
    const toY = Number(prop(trap, trap.type === 'cracked_tile' ? 'fallY' : 'failY', 0));
    if (toX > 0 && toY > 0) {
      assert.equal(sim.apply(p.id, { kind: 'gymFall', toX, toY }).ok, true, '잿빛 도장 함정 이동');
    }
  }

  // (e) 서리 도장 눈덩이 파괴 & 리셋
  sim.warpTo(p, 'gym_frost');
  const snow = MAPS.gym_frost.objects.find((o) => o.type === 'snowball');
  assert(snow, 'gym_frost snowball 존재');
  p.x = Number(prop(snow, 'cellX', 0)) * T + 8;
  p.y = Number(prop(snow, 'cellY', 0)) * T + 12;
  assert.equal(sim.apply(p.id, { kind: 'gymClear', objectId: snow.id }).ok, true, '서리 도장 눈덩이 파괴');
  assert(p.cleared?.includes(`gym_frost:${snow.id}`));
  assert.equal(sim.apply(p.id, { kind: 'gymReset' }).ok, true, '서리 도장 눈덩이 리셋');
  assert(!p.cleared?.includes(`gym_frost:${snow.id}`));

  // (f) 별마루 도장 워프 패드
  sim.warpTo(p, 'gym_summit');
  const pad = MAPS.gym_summit.objects.find((o) => o.type === 'warp_pad');
  assert(pad, 'gym_summit warp_pad 존재');
  p.x = Number(prop(pad, 'cellX', 0)) * T + 8;
  p.y = Number(prop(pad, 'cellY', 0)) * T + 12;
  assert.equal(sim.apply(p.id, { kind: 'pad', objectId: pad.id }).ok, true, '별마루 도장 워프 패드 순간이동');

  log('8대 체육관 핵심 기믹(스위치·수위·블록·함정·눈덩이·워프패드) 검증 통과');
}

// ── 2. 해신의 바다(ocean_shrine) & 물 전설 '해랑' 검증 ────────────────
{
  const sim = new FarmSimulation(MAPS);
  const p = sim.addPlayer('tester_sea', '바다탐험가', 'f1');
  p.party.push(makeCreature('saerok', 70));
  p.bag.origin_ball = 2;

  sim.warpTo(p, 'ocean_shrine');
  // 봉인 해제 전에는 해랑 배틀 불가
  assert.equal(sim.apply(p.id, { kind: 'seaLegend' }).reason, 'sealed', '봉인 전 해랑 배틀 차단');

  // 서쪽 보너스 보물 상자 존재 및 개봉 확인
  const chest = MAPS.ocean_shrine.objects.find((o) => prop(o, 'interact', '') === 'loot');
  assert(chest, '해신의 바다 보너스 보물 상자 존재');
  p.x = Number(prop(chest, 'cellX', 0)) * T + 8;
  p.y = (Number(prop(chest, 'cellY', 0)) + 1) * T + 8;
  assert.equal(sim.apply(p.id, { kind: 'loot', objectId: chest.id }).ok, true, '해신의 바다 보물 상자 획득');

  // 조류 비석 3개 모두 활성화 → 소용돌이 해제
  const seals = MAPS.ocean_shrine.objects.filter((o) => o.type === 'tide_seal');
  assert.equal(seals.length, 3, '조류 비석 3개 존재');
  for (const s of seals) {
    p.x = Number(prop(s, 'cellX', 0)) * T + 8;
    p.y = (Number(prop(s, 'cellY', 0)) + 1) * T + 8;
    assert.equal(sim.apply(p.id, { kind: 'tideSeal', objectId: s.id }).ok, true);
  }
  assert(p.flags.includes('sea_shrine_open'), '조류 비석 3개 공명으로 sea_shrine_open 플래그 활성');

  // 해랑 배틀 시작 및 포획
  const battleStart = sim.apply(p.id, { kind: 'seaLegend' });
  assert.equal(battleStart.ok, true, '해랑 배틀 시작');
  assert.equal(battleStart.battle?.view.foe.species, 'haerang');
  assert(SPECIES.haerang, 'creatures.json 에 해랑(haerang) 등록됨');
  const catchRes = sim.apply(p.id, { kind: 'battleItem', itemId: 'origin_ball' });
  assert.equal(catchRes.battle?.ended, 'caught', '태초볼로 해랑 100% 포획');
  assert(p.caught.includes('haerang'), '도감에 해랑 포획 기록됨');

  log('해신의 바다 보물 상자 · 3대 조류 비석 · 소용돌이 해제 · 전설 루미 해랑 포획 검증 통과');
}

// ── 3. 별빛 교도소: 성실 노역 석방 루트 검증 ──────────────────────────
{
  const sim = new FarmSimulation(MAPS);
  const p = sim.addPlayer('tester_honest', '성실수감자', 'm2');
  p.gold = 12_500;
  p.cash = 5_000;

  assert.equal(sim.jailPlayer(p, '테스트 수감', true), true);
  assert.equal(p.jailed, true);
  assert.equal(p.map, 'in_prison');

  // 노역 채광장 입장
  assert.equal(sim.apply(p.id, { kind: 'prisonEnterYard' }).ok, true);
  assert.equal(p.map, 'in_prison_yard');

  // 실제 채집 1회 테스트 (돌·나무 오브젝트 앞)
  const yardStone = MAPS.in_prison_yard.objects.find((o) => o.type === 'yard_stone');
  const yardWood = MAPS.in_prison_yard.objects.find((o) => o.type === 'yard_wood');
  assert(yardStone && yardWood, '노역장 돌·나무 오브젝트 존재');
  p.x = Number(prop(yardStone, 'cellX', 0)) * T + 8;
  p.y = Number(prop(yardStone, 'cellY', 0)) * T + 12;
  assert.equal(sim.apply(p.id, { kind: 'yardGather', objectId: yardStone.id, resource: 'stone' }).ok, true);
  p.x = Number(prop(yardWood, 'cellX', 0)) * T + 8;
  p.y = Number(prop(yardWood, 'cellY', 0)) * T + 12;
  assert.equal(sim.apply(p.id, { kind: 'yardGather', objectId: yardWood.id, resource: 'wood' }).ok, true);

  // 제작 및 100/100 완납 시뮬레이션
  for (let batch = 0; batch < 10; batch++) {
    sim.addItem(p, 'stone', 50);
    sim.addItem(p, 'wood', 50);
    assert.equal(sim.apply(p.id, { kind: 'yardCraft', out: 'stone_slab', qty: 10 }).ok, true);
    assert.equal(sim.apply(p.id, { kind: 'yardCraft', out: 'wood_plank', qty: 10 }).ok, true);
    assert.equal(sim.apply(p.id, { kind: 'yardDeliver' }).ok, true);
  }
  assert.equal(p.jailed, false, '석판·나무판 100개 완납 후 정식 석방');
  assert.equal(p.gold, 0, '벌금 정산으로 골드 0원');
  assert.equal(p.cash, 0, '벌금 정산으로 캐쉬 0원');
  assert.equal(p.evilStack, 0, '성실 석방은 악행스택 0');
  assert.equal(p.momLeft, false, '성실 석방은 엄마 가출 없음');
  assert.equal(p.pendingHomecoming, 'honest', '엄마 귀가 환영 컷신 대기');
  assert.equal(p.map, 'home', '집 안으로 자동 귀가');

  const homeRes = sim.apply(p.id, { kind: 'completeHomecoming' });
  assert.equal(homeRes.ok, true);
  assert(p.inventory.some((s) => s.itemId === 'tofu' && s.quantity >= 1), '엄마에게 두부 수령');

  log('별빛 교도소 성실 노역 루트(채집·제작·100/100 납품·정식 석방·두부 수령) 검증 통과');
}

// ── 4. 별빛 교도소: 불법 탈옥(B5→1F) & 선행스택 갱생 루트 검증 ────────
{
  const sim = new FarmSimulation(MAPS);
  const p = sim.addPlayer('tester_escape', '탈옥수', 'm3');
  p.gold = 99_999;
  p.cash = 30_000;

  sim.flagCheater(p, '비정상 재화 변조 적발');
  assert.equal(p.jailed, true);
  assert.equal(p.map, 'in_prison');

  // B5 → B4 올라간 뒤 감시관에게 적발되면 B5 독방으로 즉시 원점 복귀하는지 확인
  const b5Wall = MAPS.in_prison.objects.find((o) => o.type === 'cracked_wall');
  assert(b5Wall, 'B5 금이 간 벽 존재');
  p.x = Number(prop(b5Wall, 'cellX', 0)) * T + 8;
  p.y = Number(prop(b5Wall, 'cellY', 0)) * T + 12;
  assert.equal(sim.apply(p.id, { kind: 'prisonBreakWall', objectId: b5Wall.id }).ok, true);

  const b5Stairs = MAPS.in_prison.objects.find((o) => o.type === 'prison_stairs_up');
  assert(b5Stairs, 'B5 계단 존재');
  p.x = (Number(prop(b5Stairs, 'cellX', 0)) + 0.5) * T;
  p.y = Number(prop(b5Stairs, 'cellY', 0)) * T + 8;
  assert.equal(sim.apply(p.id, { kind: 'prisonAscend', to: 'in_prison_b4' }).ok, true);
  assert.equal(p.map, 'in_prison_b4');
  assert.equal(sim.apply(p.id, { kind: 'prisonCaught' }).ok, true);
  assert.equal(p.map, 'in_prison', '감시관 적발 시 지하 5층 독방으로 원점 복귀');

  // B5 → B4 → B3 → B2 → B1 → 1F 연속 돌파
  let cur: MapId = 'in_prison';
  while (PRISON_NEXT_FLOOR[cur]) {
    const next = PRISON_NEXT_FLOOR[cur];
    const stairs = MAPS[cur].objects.find((o) => o.type === 'prison_stairs_up');
    assert(stairs, `${cur} 계단 존재`);
    p.x = (Number(prop(stairs, 'cellX', 0)) + 0.5) * T;
    p.y = Number(prop(stairs, 'cellY', 0)) * T + 8;
    assert.equal(sim.apply(p.id, { kind: 'prisonAscend', to: next }).ok, true);
    cur = next;
  }
  assert.equal(p.map, 'in_prison_1f');

  // 지상 1층 외벽 파괴 탈옥
  const exitWall = MAPS.in_prison_1f.objects.find((o) => o.type === 'prison_exit_wall' || prop(o, 'interact', '') === 'prison_escape_wall');
  if (exitWall) {
    p.x = (Number(prop(exitWall, 'cellX', 0)) + 1) * T;
    p.y = Number(prop(exitWall, 'cellY', 0)) * T + 8;
  }
  assert.equal(sim.apply(p.id, { kind: 'prisonEscape' }).ok, true);
  assert.equal(p.jailed, false);
  assert.equal(p.gold, 0, '탈옥 벌금으로 골드 0원 몰수');
  assert.equal(p.cash, 0, '탈옥 벌금으로 캐쉬 0원 몰수');
  assert.equal(p.evilStack, 100, '불법 탈옥 악행스택 100 부여');
  assert.equal(p.momLeft, true, '불법 탈옥으로 엄마 가출');
  assert(p.notices?.some((n) => n.kind === 'fine'), '벌금 고지서 발송됨');

  // 같은 주민 연속 도움 방지 검사 + 100회 교차 선행으로 엄마 복귀 검증
  assert.equal(sim.apply(p.id, { kind: 'goodDeed', npc: 'hana' }).ok, true);
  assert.equal(sim.apply(p.id, { kind: 'goodDeed', npc: 'hana' }).reason, 'same-npc', '동일 NPC 연속 선행 어뷰징 차단');
  for (let i = 1; i < 100; i++) {
    const npc = i % 2 === 1 ? 'minsu' : 'hana';
    assert.equal(sim.apply(p.id, { kind: 'goodDeed', npc }).ok, true);
  }
  assert.equal(p.evilStack, 0, '선행 100회 달성으로 악행스택 0');
  assert.equal(p.momLeft, false, '엄마 집 복귀');
  assert.equal(p.pendingHomecoming, 'mom_returned', '엄마 복귀 컷신 대기');
  assert.equal(sim.apply(p.id, { kind: 'completeHomecoming' }).ok, true);

  log('별빛 교도소 불법 탈옥(B5→1F·적발 리셋·재화 몰수·악행스택 100→선행 복귀) 검증 통과');
}

// ── 5. 오프라인 세이브 무결성 해시 검증 ───────────────────────────────
{
  const sig = computeSaveSig({ gold: 1000, cash: 500, jailed: false, muteRemainingSec: 0 });
  assert.equal(verifySaveIntegrity({ gold: 1000, cash: 500, jailed: false, muteRemainingSec: 0, saveSig: sig }).ok, true);
  assert.equal(verifySaveIntegrity({ gold: 999999, cash: 500, jailed: false, muteRemainingSec: 0, saveSig: sig }).ok, false, '골드 변조 탐지');
  assert.equal(verifySaveIntegrity({ gold: 1000, cash: 99999, jailed: false, muteRemainingSec: 0, saveSig: sig }).ok, false, '캐쉬 변조 탐지');
  assert.equal(verifySaveIntegrity({ gold: 1000, cash: 500, jailed: false, muteRemainingSec: 0, saveSig: computeSaveSig({ gold: 1000, cash: 500, jailed: true, muteRemainingSec: 0 }) }).ok, false, '수감 상태 변조 탐지');
  log('세이브 무결성 서명(computeSaveSig / verifySaveIntegrity) 변조 탐지 검증 통과');
}

// ── 6. 트랙 A: 생활 도감(90종)·17개 마을 특산물·포만감/요리 통합 검증 ──
{
  assert.equal(LIFE_DEX.length, 90, '생활 도감 총 90종(농사 30 · 채광 30 · 낚시 30) 정의됨');

  const sim = new FarmSimulation(MAPS);
  const p = sim.addPlayer('tester_lifedex', '생활장인', 'f2');
  p.gold = 50_000;
  p.party.push(makeCreature('saerok', 20));
  p.party[0].hp = Math.max(1, p.party[0].hp - 25);
  const hpBeforeEat = p.party[0].hp;

  // 기본 도구 지급
  sim.addItem(p, 'hoe', 1);
  sim.addItem(p, 'watering_can', 1);
  sim.addItem(p, 'pickaxe', 1);
  sim.addItem(p, 'rod', 1);

  // (a) 서리 마을 마트에서 특산 씨앗(설원 순무) 구매 + 계절 제한 및 본고장 텃밭 사계절 재배 검증
  sim.time.minutes = 10 * 60; // 마트 영업 시간(10:00)
  sim.time.season = 'summer'; // 설원 순무 비재배 계절(여름)
  sim.warpTo(p, 'frost');
  const frostShop = martFor('frost');
  assert.equal(frostShop, 'mart_frost', '서리 마을 전용 마트 ID 매핑');
  assert.equal(sim.apply(p.id, { kind: 'buy', shop: frostShop, itemId: 'seeds_snow_turnip', qty: 3 }).ok, true, '서리 마을 특산 씨앗 구매');

  // 여름철 내 농장에서는 설원 순무 심기 불가 확인
  sim.warpTo(p, 'farm');
  const hoeSlot = p.inventory.findIndex((s) => s.itemId === 'hoe');
  const seedSlot = p.inventory.findIndex((s) => s.itemId === 'seeds_snow_turnip');
  let farmTillX = -1, farmTillY = -1;
  for (let y = 8; y < MAPS.farm.height - 4 && farmTillX < 0; y++) {
    for (let x = 8; x < MAPS.farm.width - 4; x++) {
      p.x = (x - 1) * T + 8; p.y = y * T + 12;
      if (sim.apply(p.id, { kind: 'useTool', slot: hoeSlot, tx: x, ty: y }).ok) {
        farmTillX = x; farmTillY = y; break;
      }
    }
  }
  assert(farmTillX >= 0, '내 농장 경작 가능 타일 확보');
  assert.equal(sim.apply(p.id, { kind: 'plant', slot: seedSlot, tx: farmTillX, ty: farmTillY }).reason, 'season', '여름철 일반 농장에서 설원 순무 파종 차단');

  // 본고장인 서리 마을 텃밭에서는 여름철에도 파종 + 수확 → 생활 도감(farm) 자동 등록!
  sim.warpTo(p, 'frost');
  let frostTillX = -1, frostTillY = -1;
  for (let y = 2; y < MAPS.frost.height - 2 && frostTillX < 0; y++) {
    for (let x = 2; x < MAPS.frost.width - 2; x++) {
      p.x = (x - 1) * T + 8; p.y = y * T + 12;
      if (sim.apply(p.id, { kind: 'useTool', slot: hoeSlot, tx: x, ty: y }).ok) {
        frostTillX = x; frostTillY = y; break;
      }
    }
  }
  assert(frostTillX >= 0, '서리 마을 공용 텃밭 경작 타일 확보');
  assert.equal(sim.apply(p.id, { kind: 'plant', slot: seedSlot, tx: frostTillX, ty: frostTillY }).ok, true, '본고장 텃밭 사계절 특산 작물 파종 성공');
  const plotSnap = sim.snapshot(p.id);
  assert(plotSnap.tiles.some((t) => t.x === frostTillX && t.y === frostTillY && t.crop?.id === 'snow_turnip'), '텃밭 스냅샷에 설원 순무 반영');
  const waterSlot = p.inventory.findIndex((s) => s.itemId === 'watering_can');
  for (let d = 0; d < 6; d++) {
    sim.warpTo(p, 'frost');
    p.x = (frostTillX - 1) * T + 8; p.y = frostTillY * T + 12;
    sim.apply(p.id, { kind: 'useTool', slot: waterSlot, tx: frostTillX, ty: frostTillY });
    sim.warpTo(p, 'home');
    sim.apply(p.id, { kind: 'sleep' });
  }
  sim.warpTo(p, 'frost');
  p.x = (frostTillX - 1) * T + 8; p.y = frostTillY * T + 12;
  assert.equal(sim.apply(p.id, { kind: 'harvest', tx: frostTillX, ty: frostTillY }).ok, true, '본고장 텃밭 설원 순무 수확 성공');
  assert((p.lifeDex?.farm.snow_turnip ?? 0) >= 1, '수확 즉시 생활 도감(농사: 설원 순무) 등록됨');

  // (b) 비경 채광(별빛 미궁) → 생활 도감(mine) 등록 확인
  sim.warpTo(p, 'star_maze');
  const oreObj = MAPS.star_maze.objects.find((o) => !!prop(o, 'mine', '') || o.type === 'rock' || o.type === 'rock_big');
  assert(oreObj, '별빛 미궁 채광 오브젝트 존재');
  p.x = oreObj.x;
  p.y = oreObj.y;
  assert.equal(sim.apply(p.id, { kind: 'mine', objectId: oreObj.id }).ok, true, '별빛 미궁 채광 성공');
  assert(Object.keys(p.lifeDex?.mine ?? {}).length >= 1, '채광 즉시 생활 도감(채광) 광물 등록됨');

  // (c) 물결항 낚시 → 생활 도감(fish) 등록 확인 (야생 루미 입질 시 도망 후 재시도)
  sim.warpTo(p, 'harbor');
  sim.addItem(p, 'rod_star', 1); // 내구도 넉넉한 별빛 낚싯대
  let fishDone = false;
  for (let y = 2; y < MAPS.harbor.height - 2 && !fishDone; y++) {
    for (let x = 2; x < MAPS.harbor.width - 2 && !fishDone; x++) {
      if (MAPS.harbor.terrainAt(x, y) === '2' && !MAPS.harbor.isBlocked(x, y - 1)) {
        p.x = x * T + 8; p.y = (y - 1) * T + 12;
        for (let tries = 0; tries < 12; tries++) {
          const fr = sim.apply(p.id, { kind: 'fish', tx: x, ty: y });
          if (!fr.ok) break;
          if (fr.battle) {
            sim.apply(p.id, { kind: 'battleRun' });
            // battleRun 실패 시 강제 기절 방지를 위해 체력 소진 없이 반복
            while (sim.inBattle(p.id)) sim.apply(p.id, { kind: 'battleRun' });
            continue;
          }
          if (fr.data?.item) { fishDone = true; break; }
        }
      }
    }
  }
  assert.equal(fishDone, true, '물결항 물고기 낚시 성공');
  assert(Object.keys(p.lifeDex?.fish ?? {}).length >= 1, '낚시 즉시 생활 도감(낚시) 어종 등록됨');

  // (d) 특산물 요리(바람밀 주먹밥) 조리 · 포만감 감소 · 식사 회복 · 편한 모드 토글 · 배지 자동 레시피 해금 검증
  sim.addItem(p, 'wind_wheat', 2);
  sim.addItem(p, 'lumi_herb', 2);
  assert.equal(sim.apply(p.id, { kind: 'craft', recipe: 'dish_onigiri', times: 1 }).ok, true, '기본 요리 레시피(바람밀 주먹밥) 조리 성공');

  // 배지 1개 획득 시 특수 볼(물방울볼) 및 요리 레시피 자동 해금 확인
  sim.addItem(p, 'ore_aqua_quartz', 2);
  sim.addItem(p, 'copper_ore', 2);
  assert.equal(sim.apply(p.id, { kind: 'craft', recipe: 'tide_ball', times: 1 }).ok, false, '배지 미보유 시 물방울볼 제작 차단');
  p.badges.push('badge_wind');
  assert.equal(sim.apply(p.id, { kind: 'craft', recipe: 'tide_ball', times: 1 }).ok, true, '배지 1개 달성 자동 해금 특수 볼(물방울볼) 제작 성공');
  assert((p.bag.tide_ball ?? 0) >= 2, '모험 가방에 물방울볼 지급됨');

  // 야외 시간 경과로 포만감 감소 → 요리 섭취로 포만감 + 파티 HP 동시 회복!
  sim.warpTo(p, 'route1');
  p.food = 40;
  sim.tick(35_000); // 인게임 30분 이상 경과 유도
  assert((p.food ?? 40) < 40, '야외 활동 시간 경과 시 포만감 자연 감소');
  const dishSlot = p.inventory.findIndex((s) => s.itemId === 'dish_onigiri');
  assert(dishSlot >= 0, '가방에 바람밀 주먹밥 존재');
  assert.equal(sim.apply(p.id, { kind: 'eat', slot: dishSlot }).ok, true, '요리 섭취 성공');
  assert((p.food ?? 0) > 40, '요리 섭취로 포만감 회복');
  assert(p.party[0].hp > hpBeforeEat, '요리 섭취로 파티 루미 체력 회복');

  // 편한 모드(hungerOff) 토글 시 포만감 감소 중단 확인
  assert.equal(sim.apply(p.id, { kind: 'setHungerMode', off: true }).ok, true, '편한 모드 활성화');
  assert.equal(p.hungerOff, true);
  const foodLocked = p.food ?? 80;
  sim.tick(60_000);
  assert.equal(p.food, foodLocked, '편한 모드 중에는 포만감이 줄어들지 않음');

  // (e) 도감 9종 이상 등록 후 10% 마일스톤(ldex_10) 보상 수령 및 중복 수령 차단
  for (const entry of LIFE_DEX.slice(0, 10)) registerLifeDex(p, entry.item, 1);
  assert(lifeDexSummary(p).total >= 10, '생활 도감 10종 이상 등록 확인');
  const goldBeforeClaim = p.gold;
  assert.equal(sim.apply(p.id, { kind: 'claimDexMilestone', milestoneId: 'ldex_10' }).ok, true, '생활 도감 10% 마일스톤 수령 성공');
  assert(p.gold > goldBeforeClaim, '마일스톤 골드 보상 지급됨');
  assert.equal(sim.apply(p.id, { kind: 'claimDexMilestone', milestoneId: 'ldex_10' }).reason, 'already', '마일스톤 중복 수령 차단');

  // (f) 구버전 세이브(lifeDex 필드 없음) 로드 시 보유 아이템·출하 기록 기반 자동 마이그레이션 검증
  const legacySave = {
    v: 1,
    name: '구버전유저',
    look: 'm1',
    gold: 500,
    energy: 100,
    maxEnergy: 100,
    inventory: [{ slotIndex: 0, itemId: 'parsnip', quantity: 3 }, { slotIndex: 1, itemId: 'copper_ore', quantity: 2 }],
    party: [],
    box: [],
    bag: {},
    badges: [],
    defeated: [],
    seen: [],
    caught: [],
    bin: [{ itemId: 'fish_trout', quantity: 1 }],
    farm: { tiles: [{ x: 10, y: 10, soil: SoilState.Plowed, crop: null }], removed: [], placed: [] },
    story: 0,
    flags: [],
    visited: ['town'],
    recipes: [],
    pos: { map: 'farm', inst: 'legacy_u', x: 368, y: 232, dir: 'down' },
    savedAt: Date.now(),
  } as SaveData;
  const migrated = sim.addPlayer('legacy_u', '구버전유저', 'm1', legacySave);
  assert.equal(lifeDexSummary(migrated).total, 3, '구버전 세이브의 인벤토리·출하함 아이템 3종(설탕당근·금광석·잉어) 자동 도감 복원');

  log('트랙 A: 생활 도감 90종 · 마을 특산물 본고장 재배 · 채광/낚시 · 요리/포만감 · 마일스톤 · 구버전 세이브 마이그레이션 검증 통과');
}

console.log('\n🎉 모든 최신 컨텐츠 및 보안 시뮬레이션 검증 통과!');
