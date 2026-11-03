#!/usr/bin/env node
// 모든 픽셀아트 에셋을 코드로 생성 → client/public/assets/
//   실행: npm run gen:art
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Img } from './lib/img.mjs';
import { buildTileset, buildWater, ROW, DECOR, WOOD, MISC, TILESET_COLS } from './tiles.mjs';
import * as TW from './town.mjs';
import { buildCharacterSheet } from './char.mjs';
import { LOOKS } from './looks.mjs';
import * as OB from './objects.mjs';
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
for (const [key, opt] of Object.entries(TW.BUILDINGS)) {
  const b = TW.buildBuilding(opt);
  image(key, `buildings/${key}.png`, b.img);
  image(`${key}_glow`, `buildings/${key}_glow.png`, b.glow);
  manifest.buildings[key] = { cellW: b.cellW, cellH: b.cellH, doorCell: b.doorCell, chimneyX: opt.chimneyX ?? null, w: opt.w, h: opt.h };
}
image('bench', 'objects/bench.png', TW.buildBench());
image('planter', 'objects/planter.png', TW.buildPlanter());
image('board', 'objects/board.png', TW.buildBoard());
image('stall', 'objects/stall.png', TW.buildStall());
image('stall_b', 'objects/stall_b.png', TW.buildStall(['#7d5aa8', '#fff1dc']));
image('cafe_table', 'objects/cafe_table.png', TW.buildCafeTable());
image('anvil', 'objects/anvil.png', TW.buildAnvil());
sheet('duck', 'animals/duck.png', TW.buildDuck(), 16, 16, { originY: 15 / 16 });
image('slot', 'ui/slot.png', buildSlot());
image('slot_active', 'ui/slot_active.png', buildSlotActive());

mkdirSync(ROOT, { recursive: true });
writeFileSync(out('manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`✔ 에셋 생성 완료 → ${ROOT}`);
console.log(`  이미지 ${Object.keys(manifest.images).length}, 스프라이트시트 ${Object.keys(manifest.spritesheets).length}, 캐릭터 ${Object.keys(manifest.characters).length}`);
