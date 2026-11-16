import type Phaser from 'phaser';
import { LUMI_COORDS, type LumiCoordDef } from '@shared/bmShop';

/** 32×32 루미 스프라이트 비율(origin 0.5, 30/32) 위에 겹치는 32×32 픽셀 코디 아트를 그린다. */
function drawCoordPixels(ctx: CanvasRenderingContext2D, def: LumiCoordDef) {
  ctx.clearRect(0, 0, 32, 32);
  const px = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const ol = '#1e1614';

  switch (def.kind) {
    case 'ribbon':
      // 머리 위 리본
      px(10, 6, 4, 3, ol); px(18, 6, 4, 3, ol); px(14, 7, 4, 2, ol);
      px(11, 7, 3, 1, def.primary); px(18, 7, 3, 1, def.primary);
      px(14, 7, 4, 2, def.secondary);
      px(12, 9, 2, 2, def.primary); px(18, 9, 2, 2, def.primary);
      break;
    case 'scarf':
      // 목에 두른 머플러 + 끝자락
      px(10, 20, 12, 3, ol);
      px(11, 21, 10, 2, def.primary);
      px(12, 21, 2, 2, def.secondary);
      px(18, 22, 3, 5, ol);
      px(19, 22, 2, 4, def.primary);
      px(19, 25, 2, 1, def.secondary);
      break;
    case 'goggles':
      // 이마 위 탐험가 물안경
      px(9, 8, 14, 4, ol);
      px(10, 9, 5, 2, def.primary); px(17, 9, 5, 2, def.primary);
      px(11, 9, 3, 2, def.secondary); px(18, 9, 3, 2, def.secondary);
      px(15, 9, 2, 2, '#f0f0f0');
      break;
    case 'flower':
      // 꽃화관
      px(9, 7, 14, 3, ol);
      px(10, 8, 12, 2, def.secondary);
      px(10, 7, 3, 3, def.primary); px(15, 6, 3, 3, '#ffe066'); px(19, 7, 3, 3, def.primary);
      break;
    case 'helmet':
      // 황동 고글 헬멧
      px(10, 5, 12, 5, ol);
      px(11, 6, 10, 3, def.primary);
      px(12, 8, 3, 2, '#9bf0ff'); px(17, 8, 3, 2, '#9bf0ff');
      px(11, 9, 10, 1, def.secondary);
      break;
    case 'cape':
      // 어깨에 걸친 불꽃 망토 (루미 몸 뒤/양옆 표현)
      px(8, 20, 3, 7, ol); px(21, 20, 3, 7, ol);
      px(9, 20, 2, 6, def.primary); px(21, 20, 2, 6, def.primary);
      px(11, 20, 10, 2, def.secondary);
      break;
    case 'shades':
      // 네온 선글라스 (눈 위치 y=14)
      px(9, 12, 14, 4, ol);
      px(10, 13, 5, 2, def.primary); px(17, 13, 5, 2, def.primary);
      px(10, 13, 2, 1, def.secondary); px(17, 13, 2, 1, def.secondary);
      px(15, 13, 2, 1, def.secondary);
      break;
    case 'earmuff':
      // 눈꽃 귀마개
      px(8, 6, 16, 2, def.secondary);
      px(7, 10, 4, 6, ol); px(21, 10, 4, 6, ol);
      px(8, 11, 3, 4, def.primary); px(21, 11, 3, 4, def.primary);
      break;
    case 'crown':
      // 미니 왕관
      px(11, 4, 10, 5, ol);
      px(12, 5, 2, 2, def.primary); px(15, 4, 2, 3, def.primary); px(18, 5, 2, 2, def.primary);
      px(12, 7, 8, 2, def.primary);
      px(15, 7, 2, 1, def.secondary);
      break;
  }
}

/** Phaser 씬에 루미 코디 텍스처를 1회 생성해 키를 반환한다. */
export function ensureLumiCoordTexture(scene: Phaser.Scene, coordId?: string): string | null {
  if (!coordId || !LUMI_COORDS[coordId]) return null;
  const key = `lumi_coord_${coordId}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, 32, 32);
  if (!tex) return null;
  drawCoordPixels(tex.getContext(), LUMI_COORDS[coordId]);
  tex.refresh();
  return key;
}

const previewCache = new Map<string, string>();

/** DOM(휴대폰 상점 · 우편함)용 루미 + 코디 합성 픽셀 데이터 URL 또는 코디 아이콘 HTML */
export function lumiCoordBadgeHtml(coordId: string, size = 34): string {
  const def = LUMI_COORDS[coordId];
  if (!def) return '';
  let dataUrl = previewCache.get(coordId);
  if (!dataUrl && typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const ctx = c.getContext('2d');
    if (ctx) {
      drawCoordPixels(ctx, def);
      dataUrl = c.toDataURL();
      previewCache.set(coordId, dataUrl);
    }
  }
  if (!dataUrl) return `<span style="display:inline-block;width:${size}px;height:${size}px;background:${def.primary}"></span>`;
  return `<img src="${dataUrl}" alt="${def.name}" style="width:${size}px;height:${size}px;image-rendering:pixelated;object-fit:contain" />`;
}
