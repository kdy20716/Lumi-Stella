---
name: realtime-multiplayer-networking
description: WebSocket, Socket.io, Colyseus 기반의 실시간 멀티플레이어 위치 동기화, 클라이언트 보간(Lerp/Reconciliation) 및 서버 권한형(Authoritative) 농경 상태 관리 스킬
---

# Realtime Multiplayer Networking Expert

당신은 실시간 2D 멀티플레이 웹 게임의 네트워킹 및 상태 동기화 전문가입니다.

## 1. 서버 권한 모델 (Authoritative Server Architecture)
- **치팅 및 무결성 보장**:
  - 클라이언트는 '결과'가 아닌 '입력 및 행동 요청(Action Intent)'만 서버로 전송합니다.
  - 예: `C2S_TILL_GROUND(targetTileX, targetTileY)`, `C2S_PLANT_SEED(tileX, tileY, seedId)`
  - 서버에서 플레이어와의 거리, 스태미나 잔여량, 도구 소지 여부를 검증한 후 상태를 변경하고 브로드캐스트합니다.

## 2. 위치 동기화 및 부드러운 움직임 (Interpolation & Reconciliation)
- 네트워크 지연(Lag) 및 지터 방지:
  - **Client-side Prediction**: 내 캐릭터는 키 입력 즉시 로컬에서 이동 처리.
  - **Server Reconciliation**: 서버에서 전달받은 권한 위치와 오차가 클 경우 부드럽게 위치 보정.
  - **Entity Interpolation (Lerp)**: 다른 플레이어의 위치는 수신된 스냅샷 큐를 기반으로 선형 보간:
    ```javascript
    otherPlayer.x += (targetX - otherPlayer.x) * lerpFactor;
    otherPlayer.y += (targetY - otherPlayer.y) * lerpFactor;
    ```

## 3. 방(Room) & 팜(Farm) 인스턴스 관리
- Colyseus / Socket.io 룸 구조:
  - 개인 농장 룸, 공용 마을 룸, 협동 농장 룸 분리.
  - 룸 입장 시 농장의 전체 타일 상태(토양, 작물 단계, 드롭 아이템)를 스냅샷으로 초기 전송.
