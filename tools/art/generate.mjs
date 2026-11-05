#!/usr/bin/env node
// 모든 픽셀아트 에셋을 코드로 생성 → client/public/assets/
//   실행: npm run gen:art
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Img } from './lib/img.mjs';
import { buildTileset, buildWater, ROW, DECOR, WOOD, MISC, TILESET_COLS } from './tiles.mjs';
import * as TW from './town.mjs';
import * as ADV from './adventure.mjs';
import { buildCreatureSheet, SPECIES_ART as BASE_ART, CF } from './creatures.mjs';
import { dexArt } from './dex.mjs';
const SPECIES_ART = { ...BASE_ART, ...dexArt() };
import { buildCharacterSheet } from './char.mjs';
import { LOOKS } from './looks.mjs';
import * as OB from './objects.mjs';
import { buildRoom, FURN, ROOMS } from './interior.mjs';
import { buildPortrait } from './portrait.mjs';
import * as RG from './region.mjs';
import { LEGEND_ART, buildLegendBig, buildLegendSmall } from './legends.mjs';
import { buildCrops, buildIcons, buildPanel, buildSlot, buildSlotActive, ICONS, CROP_IDS, CROP_STAGES } from './items.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../client/public/assets');
const out = (p) => join(ROOT, p);
const manifest = { generatedAt: new Date().toISOString(), tileSize: 16, images: {}, spritesheets: {}, characters: {}, tileset: {} };

/** 첫 프레임에서 불투명 픽셀의 최하단 y+1 (스프라이트 발 위치 → origin 계산용) */
function footY(img, fw, fh) { for (let y = fh - 1; y >= 0; y--) for (let x = 0; x < fw; x++) if (img.alpha(x, y) > 0) return y + 1; return fh; }
function image(key, path, img) { img.save(out(path)); manifest.images[key] = { path: `assets/${path}`, w: img.w, h: img.h, originY: footY(img, img.w, img.h) / img.h }; }
function sheet(key, path, img, fw, fh, extra = {}) { img.save(out(path)); manifest.spritesheets[key] = { path: `assets/${path}`, frameWidth: fw, frameHeight: fh, frames: (img.w / fw) * (img.h / fh), originY: footY(img, fw, fh) / fh, ...extra }; }

// 타일
const ts = buildTileset();
ts.save(out('tiles/tileset.png'));
manifest.tileset = { path: 'assets/tiles/tileset.png', columns: TILESET_COLS, rows: ts.h / 16, ROW, DECOR, WOOD, MISC };
const water = buildWater();
for (let f = 0; f < 4; f++) { const t = new Img(64, 64); t.blit(water, 0, 0, { sx: f * 64, sw: 64, sh: 64 }); image(`water${f}`, `tiles/water_${f}.png`, t); }
// 바이옴별 타일셋 · 물 (같은 타일 배치, 색만 다름)
manifest.biomes = {};
for (const biome of Object.keys(RG.BIOME_TINT)) {
  RG.biomeTileset(ts, biome).save(out(`tiles/tileset_${biome}.png`));
  const w = RG.biomeWater(water, biome);
  if (w) for (let f = 0; f < 4; f++) { const t = new Img(64, 64); t.blit(w, 0, 0, { sx: f * 64, sw: 64, sh: 64 }); image(`water_${biome}${f}`, `tiles/water_${biome}_${f}.png`, t); }
  manifest.biomes[biome] = { tileset: `assets/tiles/tileset_${biome}.png`, water: !!w };
}

// 캐릭터
for (const [id, look] of Object.entries(LOOKS)) {
  const { img, meta } = buildCharacterSheet(look);
  img.save(out(`characters/${id}.png`));
  manifest.characters[id] = { path: `assets/characters/${id}.png`, ...meta };
}

// 오브젝트
sheet('oak', 'objects/oak.png', OB.buildOak({ seed: 3 }), 48, 64, { originY: 61 / 64 });
sheet('oak_apple', 'objects/oak_apple.png', OB.buildOak({ seed: 9, fruit: '#d8473b' }), 48, 64, { originY: 61 / 64 });
sheet('pine', 'objects/pine.png', OB.buildPine(), 40, 72, { originY: 69 / 72 });
sheet('oak_autumn', 'objects/oak_autumn.png', OB.buildOak({ seed: 13, pal: RG.AUTUMN }), 48, 64, { originY: 61 / 64 });
sheet('pine_snow', 'objects/pine_snow.png', OB.buildPine({ seed: 11, snow: true }), 40, 72, { originY: 69 / 72 });
sheet('palm', 'objects/palm.png', RG.buildPalm(), 48, 64, { originY: 62 / 64 });
sheet('fence', 'objects/fence.png', OB.buildFence(), 16, 24, { originY: 22 / 24 });
sheet('tuft', 'objects/tuft.png', OB.buildTuft(), 16, 16, { originY: 15 / 16 });
sheet('butterfly', 'fx/butterfly.png', OB.buildButterfly(), 8, 8);
sheet('emotes', 'fx/emotes.png', OB.buildEmotes(), 16, 16);
sheet('chicken_white', 'animals/chicken_white.png', OB.buildChicken(true), 16, 16, { originY: 15 / 16 });
sheet('chicken_brown', 'animals/chicken_brown.png', OB.buildChicken(false), 16, 16, { originY: 15 / 16 });
sheet('crops', 'crops/crops.png', buildCrops(), 16, 32, { ids: CROP_IDS, stages: CROP_STAGES });
sheet('icons', 'ui/icons.png', buildIcons(), 16, 16, { ids: ICONS });

const house = OB.buildHouse();
image('house', 'objects/house.png', house.img);
image('house_glow', 'objects/house_glow.png', house.glow);
image('bush', 'objects/bush.png', OB.buildBush({ seed: 5 }));
image('bush_berry', 'objects/bush_berry.png', OB.buildBush({ seed: 8, berries: true }));
image('rock', 'objects/rock.png', OB.buildRock(false));
image('rock_big', 'objects/rock_big.png', OB.buildRock(true));
image('stump', 'objects/stump.png', OB.buildStump());
image('cactus', 'objects/cactus.png', RG.buildCactus());
image('dead_tree', 'objects/dead_tree.png', RG.buildDeadTree());
image('reeds', 'objects/reeds.png', RG.buildReeds());
image('cave_mouth', 'objects/cave_mouth.png', RG.buildCaveMouth());
image('ruin_pillar', 'objects/ruin_pillar.png', RG.buildRuinPillar(false));
image('ruin_broken', 'objects/ruin_broken.png', RG.buildRuinPillar(true));
image('altar_stone', 'objects/altar_stone.png', RG.buildAltarStone());
image('portal', 'objects/portal.png', RG.buildPortal());
image('stairs_up', 'objects/stairs_up.png', RG.buildStairsUp());
image('log', 'objects/log.png', OB.buildLog());
image('shipping_bin', 'objects/shipping_bin.png', OB.buildShippingBin());
image('mailbox', 'objects/mailbox.png', OB.buildMailbox());
image('scarecrow', 'objects/scarecrow.png', OB.buildScarecrow());
image('well', 'objects/well.png', OB.buildWell());
image('lamp', 'objects/lamp.png', OB.buildLamp());
image('sign', 'objects/sign.png', OB.buildSign());
image('barrel', 'objects/barrel.png', OB.buildBarrel());
image('crate', 'objects/crate.png', OB.buildCrate());
image('hay', 'objects/hay.png', OB.buildHay());
image('shadow', 'fx/shadow.png', OB.buildShadow());
image('glow', 'fx/glow.png', OB.buildGlow(128));
image('cloud', 'fx/cloud.png', OB.buildCloudShadow());
image('cursor', 'fx/cursor.png', OB.buildCursor());
image('panel', 'ui/panel.png', buildPanel());

// 마을 건물 (발광 오버레이 + 점유 셀 정보)
manifest.buildings = {};
for (const [key, opt] of Object.entries({ ...TW.BUILDINGS, ...ADV.ADV_BUILDINGS })) {
  const b = key === 'gym' ? TW.buildGym() : TW.buildBuilding(opt);
  image(key, `buildings/${key}.png`, b.img);
  image(`${key}_glow`, `buildings/${key}_glow.png`, b.glow);
  manifest.buildings[key] = { cellW: b.cellW, cellH: b.cellH, doorCell: b.doorCell, chimneyX: opt.chimneyX ?? null, w: b.img.w, h: b.img.h };
}
image('bench', 'objects/bench.png', TW.buildBench());
image('planter', 'objects/planter.png', TW.buildPlanter());
image('board', 'objects/board.png', TW.buildBoard());
image('stall', 'objects/stall.png', TW.buildStall());
image('stall_b', 'objects/stall_b.png', TW.buildStall(['#7d5aa8', '#fff1dc']));
image('cafe_table', 'objects/cafe_table.png', TW.buildCafeTable());
image('anvil', 'objects/anvil.png', TW.buildAnvil());
sheet('duck', 'animals/duck.png', TW.buildDuck(), 16, 16, { originY: 15 / 16 });

// 모험 요소
sheet('tallgrass', 'objects/tallgrass.png', ADV.buildTallGrass(), 16, 16, { originY: 1 });
for (const k of ['stone', 'copper', 'iron', 'star']) image(`ore_${k}`, `objects/ore_${k}.png`, ADV.buildOreRock(k));
for (const k of ['grass', 'water', 'town']) image(`battle_${k}`, `battle/bg_${k}.png`, ADV.buildBattleBg(k));
for (const k of ['cave', 'snow', 'sand', 'summit', 'origin']) image(`battle_${k}`, `battle/bg_${k}.png`, RG.buildBattleBg2(k));
// 동굴 층 배경 (맵 생성기와 같은 레이아웃)
for (const n of RG.caveNodes()) image(`cave_${n.id}`, `caves/${n.id}.png`, RG.buildCaveBg(n));
image('windmill_blades', 'buildings/windmill_blades.png', ADV.buildWindmillBlades());
image('jar_throw', 'fx/jar.png', ADV.buildJar());
image('sparkle', 'fx/sparkle.png', ADV.buildSparkle());

// 루미 (오리지널 몬스터) 시트: 열 = [정면0, 정면1, 측면0, 측면1, 뒷면0, 뒷면1]
manifest.lumi = {};
for (const [id, cfg] of Object.entries(SPECIES_ART)) {
  const img = LEGEND_ART.includes(id) ? buildLegendSmall(id, CF) : buildCreatureSheet(cfg);
  sheet(`lumi_${id}`, `lumi/${id}.png`, img, CF, CF, { originY: 30 / 32 });
  manifest.lumi[id] = `lumi_${id}`;
}
// 전설 · 환상: 배틀용 큰 그림 (96px, 2프레임)
manifest.lumiBig = {};
for (const id of LEGEND_ART) { sheet(`lumi_big_${id}`, `lumi/big_${id}.png`, buildLegendBig(id), 96, 96, { originY: 92 / 96 }); manifest.lumiBig[id] = `lumi_big_${id}`; }
// 건물 실내: 방 배경 + 가구
for (const [id, spec] of Object.entries(ROOMS)) image(`room_${id}`, `interiors/${id}.png`, buildRoom(spec));
for (const [type, f] of Object.entries(FURN)) image(type, `objects/${type}.png`, f.build());
// 대화창 흉상 일러스트 (모든 인물)
for (const [id, look] of Object.entries(LOOKS)) buildPortrait(look).save(out(`portraits/${id}.png`));
// 휴대폰 지도
image('worldmap', 'ui/worldmap.png', RG.buildRegionMap());
image('slot', 'ui/slot.png', buildSlot());
image('slot_active', 'ui/slot_active.png', buildSlotActive());

mkdirSync(ROOT, { recursive: true });
writeFileSync(out('manifest.json'), JSON.stringify(manifest, null, 2));
// 대화창 벡터 일러스트용 외형 색 (client/src/ui/Illust.ts)
writeFileSync(out('looks.json'), JSON.stringify(LOOKS));
console.log(`✔ 에셋 생성 완료 → ${ROOT}`);
console.log(`  이미지 ${Object.keys(manifest.images).length}, 스프라이트시트 ${Object.keys(manifest.spritesheets).length}, 캐릭터 ${Object.keys(manifest.characters).length}`);
