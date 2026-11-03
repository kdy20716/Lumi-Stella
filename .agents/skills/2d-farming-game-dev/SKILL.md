---
name: 2d-farming-game-dev
description: 2D 탑다운 농사 및 멀티플레이 웹 게임(스타듀밸리 스타일) 개발을 위한 가이드, 타일맵 렌더링, 농경 루프 및 멀티플레이어 동기화 전문 스킬.
---

# 2D Farming Multi-Player Web Game Development Skill

이 스킬은 Phaser 3 및 WebSocket/Colyseus 기반의 2D 픽셀 농경 멀티플레이어 웹 게임 개발 지침을 제공합니다.

## 핵심 시스템 구조

### 1. 타일맵 & 렌더링 (Phaser 3)
- 픽셀 완벽 렌더링: `render.pixelArt = true`, `render.antialias = false`
- Y-sorting: 매 프레임 플레이어 및 엔티티의 `depth = y`로 정렬
- 타일 레이어 구성:
  - `Ground` (잔디, 흙길)
  - `Farmland` (경작지, 물준 땅)
  - `Crops` (작물 스프라이트)
  - `Obstacles/Objects` (나무, 바위, 울타리 - 충돌 레이어)

### 2. 농경 상태 머신 (Farming State Machine)
- 타일 상태 enum:
  ```typescript
  export enum TileSoilState {
    DryGrass = 0,
    TilledDry = 1,
    TilledWatered = 2
  }
  ```
- 작물 데이터 구조:
  ```typescript
  export interface CropData {
    id: string;
    name: string;
    growthDays: number[]; // 각 단계별 소요 일수
    harvestYieldId: string;
    regrowDays?: number; // 다회 수확 작물 여부
  }
  ```

### 3. 멀티플레이어 상태 동기화 (Server Authoritative)
- 클라이언트는 `Action(PlayerMove, UseTool)`을 서버로 전송.
- 서버가 충돌/소지 도구/스태미나를 검증한 뒤 `TileUpdated`, `CropUpdated`, `PlayerMoved` 브로드캐스트.
- 클라이언트는 보간(Interpolation)을 통해 타 플레이어의 위치를 부드럽게 표시.
