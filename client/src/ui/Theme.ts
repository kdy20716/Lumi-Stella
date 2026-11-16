import { UI_THEMES } from '@shared/bmShop';

/**
 * 선택한 UI 디자인 테마를 문서 전체 CSS 변수로 적용한다.
 * 기본 `'rural'`은 시골 원목 패널, 캐쉬 상점 해금 테마는 팔레트를 즉시 교체한다.
 */
export function applyUiTheme(themeId?: string): string {
  const def = UI_THEMES[themeId ?? 'rural'] ?? UI_THEMES.rural;
  const root = document.documentElement;
  root.dataset.uiTheme = def.id;
  const s = root.style;
  s.setProperty('--ui-bg', def.bg);
  s.setProperty('--ui-panel', def.panel);
  s.setProperty('--ui-panel-alt', def.panelAlt);
  s.setProperty('--ui-border', def.border);
  s.setProperty('--ui-border-bright', def.borderBright);
  s.setProperty('--ui-accent', def.accent);
  s.setProperty('--ui-text', def.text);
  s.setProperty('--ui-text-dim', def.textDim);
  return def.id;
}
