export const TILE = 16;
export const WALK_SPEED = 62;   // px/s (월드 단위)
export const RUN_SPEED = 108;
/** 화면 높이에 맞춘 정수 배율 줌 (픽셀이 깨지지 않도록) */
export const pickZoom = (h: number) => Math.max(2, Math.min(5, Math.round(h / 250)));

export const DEPTH = {
  water: -1000, ground: -900, soil: -850, decor: -800, bridge: -790, cursor: -700,
  overlay: 1_000_000, glow: 1_000_001, weather: 1_000_002, ui: 1_000_010,
} as const;

export interface CharacterMeta {
  path: string; frameWidth: number; frameHeight: number; originX: number; originY: number; columns: number;
  anims: Record<string, { start: number; end: number; fps: number; repeat: number }>;
}
export interface Manifest {
  tileSize: number;
  images: Record<string, { path: string; w: number; h: number; originY: number }>;
  spritesheets: Record<string, { path: string; frameWidth: number; frameHeight: number; frames: number; originY: number; ids?: string[]; stages?: number }>;
  characters: Record<string, CharacterMeta>;
  buildings?: Record<string, { cellW: number; cellH: number; doorCell: number; chimneyX: number | null; w: number; h: number }>;
  tileset: { path: string; columns: number; rows: number; ROW: Record<string, number>; DECOR: Record<string, number>; WOOD: Record<string, number>; MISC: Record<string, number> };
}
