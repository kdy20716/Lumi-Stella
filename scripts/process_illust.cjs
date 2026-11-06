const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');

const brainDir = 'C:\\Users\\kdy02\\.gemini\\antigravity\\brain\\2dc6751a-7bfb-493e-aa8e-f1d081b1e133';
const targetDir = path.resolve(__dirname, '../client/public/assets/illust');
const indexJsonPath = path.join(targetDir, 'index.json');

function cutImage(inputJpgPath, outputPngPath) {
  const jpgData = fs.readFileSync(inputJpgPath);
  const raw = jpeg.decode(jpgData, { useTArray: true, formatAsRGBA: true });
  const w = raw.width;
  const h = raw.height;
  const src = raw.data;

  const png = new PNG({ width: w, height: h });
  const dst = png.data;

  // 1. Identify light/white pixels (RGB >= 236, color spread < 20)
  const isLight = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = src[i * 4];
    const g = src[i * 4 + 1];
    const b = src[i * 4 + 2];
    if (r >= 236 && g >= 236 && b >= 236 && Math.max(r, g, b) - Math.min(r, g, b) < 20) {
      isLight[i] = 1;
    }
  }

  // 2. Flood fill from borders
  const isBg = new Uint8Array(w * h);
  const q = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  function tryPush(x, y) {
    const idx = y * w + x;
    if (isBg[idx] === 0 && isLight[idx] === 1) {
      isBg[idx] = 1;
      q[tail++] = idx;
    }
  }

  // Top border
  for (let x = 0; x < w; x++) tryPush(x, 0);
  // Left and Right borders
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }
  // Bottom left & right corners (avoid character bust in bottom center)
  const cornerMargin = Math.floor(w * 0.25);
  for (let x = 0; x < cornerMargin; x++) tryPush(x, h - 1);
  for (let x = w - cornerMargin; x < w; x++) tryPush(x, h - 1);

  while (head < tail) {
    const curr = q[head++];
    const cx = curr % w;
    const cy = Math.floor(curr / w);

    if (cx > 0) tryPush(cx - 1, cy);
    if (cx < w - 1) tryPush(cx + 1, cy);
    if (cy > 0) tryPush(cx, cy - 1);
    if (cy < h - 1) tryPush(cx, cy + 1);
  }

  // 3. Write RGBA with feathered edge
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const p = idx * 4;

      if (isBg[idx] === 1) {
        dst[p] = 0;
        dst[p + 1] = 0;
        dst[p + 2] = 0;
        dst[p + 3] = 0;
      } else {
        // Check neighbor for anti-aliasing / edge feathering
        let hasBgNeighbor = false;
        if (
          (x > 0 && isBg[idx - 1] === 1) ||
          (x < w - 1 && isBg[idx + 1] === 1) ||
          (y > 0 && isBg[idx - w] === 1) ||
          (y < h - 1 && isBg[idx + w] === 1)
        ) {
          hasBgNeighbor = true;
        }

        dst[p] = src[p];
        dst[p + 1] = src[p + 1];
        dst[p + 2] = src[p + 2];

        if (hasBgNeighbor) {
          const r = src[p];
          const g = src[p + 1];
          const b = src[p + 2];
          const brightness = (r + g + b) / 3;
          if (brightness > 220) {
            dst[p + 3] = Math.max(0, Math.min(255, Math.round((255 - brightness) * 4)));
          } else {
            dst[p + 3] = 255;
          }
        } else {
          dst[p + 3] = 255;
        }
      }
    }
  }

  const pngBuffer = PNG.sync.write(png);
  fs.writeFileSync(outputPngPath, pngBuffer);
}

function processBatch(list) {
  let indexData = { ids: [], files: {}, model: 'gemini-3.1-flash-image', updatedAt: new Date().toISOString() };
  if (fs.existsSync(indexJsonPath)) {
    indexData = JSON.parse(fs.readFileSync(indexJsonPath, 'utf8'));
  }

  for (const item of list) {
    const srcJpg = path.isAbsolute(item.file) ? item.file : path.join(brainDir, item.file);
    if (!fs.existsSync(srcJpg)) {
      console.error(`[SKIP] File not found: ${srcJpg}`);
      continue;
    }

    const dstJpg = path.join(targetDir, `${item.id}.jpg`);
    const dstPng = path.join(targetDir, `${item.id}.png`);

    fs.copyFileSync(srcJpg, dstJpg);
    cutImage(srcJpg, dstPng);

    if (!indexData.ids.includes(item.id)) {
      indexData.ids.push(item.id);
    }
    indexData.files[item.id] = `${item.id}.png`;

    console.log(`[DONE] Processed & cut: ${item.id} -> ${dstPng}`);
  }

  indexData.updatedAt = new Date().toISOString();
  fs.writeFileSync(indexJsonPath, JSON.stringify(indexData, null, 2), 'utf8');
  console.log(`[INDEX] Updated index.json. Total count: ${indexData.ids.length}`);
}

module.exports = { cutImage, processBatch };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length >= 2) {
    const list = [{ id: args[0], file: args[1] }];
    processBatch(list);
  }
}
