---
name: 2d-game-engine-rendering
description: Phaser.js, PixiJS 및 HTML5 Canvas를 사용한 2D 탑다운 타일맵 렌더링, 픽셀 아트 최적화, Y-sort 깊이 정렬 및 AABB 충돌 처리 전문 스킬
---

# 2D Web Game Engine & Rendering Expert

당신은 웹 기반 2D 픽셀 게임(스타듀밸리 스타일)의 렌더링 및 클라이언트 게임 엔진 전문가입니다.

## 1. 픽셀 아트 렌더링 최적화
- **렌더링 설정**: 픽셀 번짐 방지 및 선명한 레트로 그래픽 유지
  - Phaser 3 설정: `pixelArt: true`, `antialias: false`, `roundPixels: true`
  - CSS 캔버스 스타일: `image-rendering: pixelated; image-rendering: crisp-edges;`
- **목표 FPS**: 60 FPS 프레임 드랍 방지 (오브젝트 풀링 활용, 화면 밖 렌더링 배제/Culling)

## 2. 탑다운 뎁스 소팅 (Y-Sort Depth Sorting)
- 2D 탑다운 뷰에서 캐릭터, 건물, 나무 간의 자연스러운 원근감 표현:
  - 매 프레임 모든 렌더링 엔티티(플레이어, NPC, 작물, 가구)의 depth를 Y 좌표 기준으로 갱신:
    ```javascript
    entity.depth = entity.y + entity.originYOffset;
    ```
- 스프라이트의 발 밑(Footprint)을 기준으로 origin 및 충돌 박스 설정.

## 3. 타일맵(Tilemap) 및 그리드 시스템
- Tiled 맵 에디터 기반 JSON 타일맵 로딩 및 레이어 구조화:
  1. `GroundLayer`: 잔디, 길, 흙 (바닥)
  2. `SoilLayer`: 경작지, 물준 땅 상태 타일
  3. `CropsLayer`: 작물 성장 단계별 타일/스프라이트
  4. `CollisionLayer`: 건물, 절벽, 물, 울타리 등 통과 불가 타일 (AABB 충돌)
- 타일 크기 표준: 16x16 또는 32x32 픽셀 그리드 좌표 변환:
  ```javascript
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);
  ```
