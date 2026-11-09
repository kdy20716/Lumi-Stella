// 추억 사진: 본편 사건 · 배지를 얻은 순간의 게임 화면을 작게 저장해 두었다가 엔딩 크레딧에 띄움
//  - 이 브라우저(localStorage)에 계정별로 저장. 저장이 안 되는 환경이면 조용히 건너뜀
import type Phaser from 'phaser';

export interface Memory { id: string; caption: string; img: string; t: number }
const key = (uid: string) => `sf:mem:${uid}`;
const W = 400, H = 225;

export function loadMemories(uid: string): Memory[] {
  try { return JSON.parse(localStorage.getItem(key(uid)) ?? '[]') as Memory[]; } catch { return []; }
}
/** 지금 화면을 찍어 둠 (같은 id 는 처음 한 번만) */
export function captureMemory(scene: Phaser.Scene, uid: string, id: string, caption: string) {
  const list = loadMemories(uid);
  if (list.some((m) => m.id === id)) return;
  scene.game.renderer.snapshot((shot) => {
    try {
      const src = shot as HTMLImageElement;
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const g = cv.getContext('2d')!;
      const sw = src.width, sh = src.height, s = Math.max(W / sw, H / sh);
      g.imageSmoothingEnabled = false;
      g.drawImage(src, (W - sw * s) / 2, (H - sh * s) / 2, sw * s, sh * s);
      list.push({ id, caption, img: cv.toDataURL('image/jpeg', 0.72), t: Date.now() });
      localStorage.setItem(key(uid), JSON.stringify(list.slice(-40)));
    } catch { /* 저장 공간 부족 등: 건너뜀 */ }
  }, 'image/png');
}
