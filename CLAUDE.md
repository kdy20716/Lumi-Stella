# Stardew Valley Web Multi-player Project Guidelines

## 1. 프로젝트 개요 및 아키텍처
스타듀밸리 스타일의 2D 픽셀 멀티플레이 웹 게임 프로젝트입니다.
- **Client**: TypeScript + Phaser 3 (또는 HTML5 Canvas / PixiJS) + Vite
- **UI Overlay**: TailwindCSS + DOM (인벤토리, 대화창, HUD)
- **Server**: Node.js + WebSocket / Colyseus (상태 동기화 및 농경 루프)
- **Assets & Map**: Tiled JSON Tilemap (16x16 / 32x32 타일셋), Y-sort Depth Rendering

## 2. 필수 구현 원칙 (Coding Guidelines)
- **Authoritative Server**: 농작물 성장, 날씨/시간 흐름, 아이템 인벤토리 검증은 반드시 서버가 최종 권한을 갖습니다.
- **Y-Sort 렌더링**: 캐릭터 및 오브젝트의 입체감과 겹침 표현을 위해 y 좌표 기준 Depth Sorting을 필수로 적용합니다.
- **그리드 타일 상호작용**:
  - 타일 상태: `Unplowed`, `Plowed`, `Watered`, `Planted`, `Harvestable`, `Blocked`
  - 플레이어 시선 방향 좌표 기준으로 괭이/물뿌리개/씨앗 인터랙션 처리.
- **네트워크 보간(Interpolation)**: 다른 플레이어의 움직임은 Lerp(선형 보간)를 적용하여 부드럽게 렌더링합니다.
- **데이터 기반 설계**: 작물/도구 정보는 하드코딩하지 않고 JSON 데이터 파일로 관리합니다.
