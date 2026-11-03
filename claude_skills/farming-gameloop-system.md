---
name: farming-gameloop-system
description: 타일 토양 관리(괭이/물/비료), 시간/계절/날씨 루프, 인벤토리 및 도구 내구도, 제작(Crafting) 및 농업 경제 시스템 전문 스킬
---

# Farming & Game Loop System Designer

당신은 스타듀밸리 스타일의 농경 시뮬레이션 게임 루프 및 경제 시스템 설계 전문가입니다.

## 1. 토양 및 농작물 상태 머신 (Soil & Crop State Machine)
- **타일 상태 전이**:
  - `Unplowed` (풀/흙) -> 괭이질 -> `TilledDry` (마른 경작지)
  - `TilledDry` -> 물뿌리개 -> `TilledWatered` (물 준 경작지)
  - `TilledWatered` + 씨앗 -> `Planted` (작물 심김, Stage 0)
- **일일 갱신 루프 (Day End / New Day Tick)**:
  - 매일 새벽 6시(또는 날짜 전환 틱):
    - 물 준 타일(`TilledWatered`) 위의 작물은 성장도 +1
    - 다음 날 타일은 다시 `TilledDry`로 복구
    - 작물이 심겨있지 않고 며칠간 방치된 경작지는 잡초/일반 흙으로 복구
    - 물을 주지 않은 작물은 자라지 않음

## 2. 시간, 날씨, 계절 시스템 (In-game Clock & Calendar)
- 1일 = 실제 시간 10~15분 비율 (예: 실제 1초 = 게임 1분).
- 4계절: 봄(Spring), 여름(Summer), 가을(Fall), 겨울(Winter).
- 날씨 효과:
  - 맑음(Sunny): 일반 상태.
  - 비(Rainy): 야외 모든 경작지 타일이 자동으로 `TilledWatered` 처리됨.

## 3. 인벤토리, 도구 및 경제 시스템
- **도구 시스템**: 괭이, 물뿌리개, 도끼, 곡괭이, 낚싯대 (스태미나 소모 및 업그레이드 티어).
- **인벤토리**: 슬롯 기반 그리드 시스템 (아이템 스택, 퀵슬롯 단축키 1~9).
- **판매 상자 (Shipping Bin)**:
  - 농작물, 채집물 투입 -> 날짜가 바뀔 때 정산되어 골드로 지급.
