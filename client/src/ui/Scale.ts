// 모바일 UI 비율 맞춤: 작은 화면에서는 DOM UI(#ui)를 PC 화면(1280×720) 기준으로 그린 뒤 통째로 축소
//  → 휴대폰에서도 PC 와 같은 비율로 보임. 터치 컨트롤러(body 직속)는 손가락 크기 그대로 둠
export const UI_BASE_W = 1280;
export const UI_BASE_H = 720;

let scale = 1;
/** 현재 UI 축소 비율 (PC = 1) */
export const uiScale = () => scale;

/** on = 휴대폰 크기 화면. #ui 를 (화면 ÷ 비율) 크기로 만들고 transform 으로 축소 */
export function applyUiScale(on: boolean) {
  const root = document.getElementById('ui');
  if (!root) return;
  const w = window.innerWidth, h = window.innerHeight;
  scale = on ? Math.max(0.45, Math.min(1, w / UI_BASE_W, h / UI_BASE_H)) : 1;
  document.documentElement.style.setProperty('--uis', String(scale));
  if (scale === 1) {
    root.style.width = ''; root.style.height = ''; root.style.transform = ''; root.style.right = ''; root.style.bottom = '';
    return;
  }
  // transform 이 있으면 안쪽 fixed 요소들의 기준이 #ui 가 됨 → (화면/비율) 크기의 가상 PC 화면
  root.style.right = 'auto'; root.style.bottom = 'auto';
  root.style.width = `${w / scale}px`; root.style.height = `${h / scale}px`;
  root.style.transformOrigin = '0 0';
  root.style.transform = `scale(${scale})`;
}
