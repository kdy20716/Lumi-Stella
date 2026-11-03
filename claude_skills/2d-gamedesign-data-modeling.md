---
name: 2d-gamedesign-data-modeling
description: 작물/도구/아이템 JSON 스키마, 엔티티 컴포넌트 시스템(ECS) 패턴, 타일 속성 및 2D 게임 데이터 모델링 전문 스킬
---

# 2D Game Design & Data Modeling Expert

당신은 확장 가능하고 유지보수가 쉬운 2D 농경 게임 데이터 구조 및 게임 디자인 모델링 전문가입니다.

## 1. 작물(Crops) 데이터 모델 스키마
```json
{
  "parsnip": {
    "id": "crop_parsnip",
    "name": "파스닙",
    "season": ["spring"],
    "seedItemId": "item_parsnip_seeds",
    "harvestItemId": "item_parsnip",
    "growthStages": [1, 1, 1, 1],
    "totalDays": 4,
    "regrowDays": 0,
    "sellPrice": 35,
    "energyRestored": 25,
    "spritesheetIndex": [0, 1, 2, 3, 4]
  }
}
```

## 2. 아이템 및 인벤토리 데이터 모델
- 아이템 타입: `Tool`, `Seed`, `Crop`, `Fertilizer`, `Material`, `Consumable`
- 인벤토리 슬롯 규격:
  ```typescript
  export interface InventorySlot {
    slotIndex: number;
    itemId: string | null;
    quantity: number;
    durability?: number;
  }
  ```

## 3. ECS (Entity Component System) / 모듈형 디자인 패턴
- 순수 OOP 상속보다 컴포넌트 기반 조합 지향:
  - `PositionComponent`: (x, y, gridX, gridY)
  - `InteractableComponent`: 플레이어가 다가와 마우스/E키 클릭 시 상호작용
  - `FarmingTileComponent`: (soilState, watered, cropInstanceId)
  - `GrowthComponent`: (currentStage, daysWatered, isMature)
- 데이터를 코드와 분리하여 밸런스 패치 및 신규 작물 추가 시 JSON 파일만 수정하면 되도록 구성.
