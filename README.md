# 🌾 별빛 농장 (Starlight Farm)

스타듀밸리 스타일의 2D 픽셀 농장 **멀티플레이 웹 게임** 기본 골격입니다.
**Vite + TypeScript + Phaser 3** 클라이언트, **Node.js WebSocket 권한 서버**, 그리고 **모든 그래픽을 코드로 직접 생성하는 픽셀아트 파이프라인**으로 구성되어 있습니다.

## 빠른 시작

```bash
npm install
npm run dev          # http://localhost:5173 → "혼자 시작하기"
```

멀티플레이:

```bash
npm run server       # ws://localhost:2567 (권한 서버)
npm run dev          # 브라우저 창 여러 개 → 닉네임 입력 → "멀티플레이 접속"
```

## 조작법

| 키 | 동작 |
|---|---|
| WASD / 방향키 | 이동 (Shift: 달리기) |
| Space / 좌클릭 | 도구 사용 · 씨앗 심기 (마우스로 주변 1칸 타일 지정 가능) |
| E / 우클릭 | NPC 대화 · 수확 · 출하 상자 · 우편함 · 표지판 · 집(잠자기) |
| 1~0, -, = / 마우스 휠 | 핫바 슬롯 선택 |
| Enter | 채팅 (멀티플레이) |
| H | 도움말 · N: (디버그) 다음 날 |

## 현재 구현된 것

- **농장 맵 (56×42 타일)**: 듀얼그리드 오토타일(잔디/흙길/물가), 애니메이션 물, 연못과 부두, 개울, 울타리 친 밭, 숲 테두리, 꽃·자갈 장식
- **Y-Sort 깊이 정렬**: 캐릭터·나무·건물이 발 위치 기준으로 자연스럽게 겹침, 나무/집 뒤로 가면 반투명 처리
- **플레이어**: 4방향 × `idle`(숨쉬기+눈 깜빡임) · `walk` · `run` · `hoe`(괭이질) · `axe`(도끼질) · `water`(물주기) · `interact`(상호작용) 애니메이션, 축 분리 AABB 충돌 + 모서리 미끄러짐 보정
- **NPC 5명** (하나·민수·소라·박 영감·준이): 시간대별 스케줄 → A* 길찾기 → 서 있기/배회/작업/퇴장, 말 걸면 플레이어 쪽을 보고 대화(초상화·타자기 효과·호감도 하트), 접근 시 말풍선
- **농사 루프**: 괭이질 → 씨앗 → 물주기 → 다음 날 성장 → 수확 → 출하 상자 → 아침 정산, 재수확 작물(토마토), 비 오는 날 자동 물주기
- **시간/날씨**: 실제 7초 = 게임 10분, 새벽·한낮·노을·밤 색감 변화, 밤에 가로등·창문 발광과 반딧불, 굴뚝 연기, 구름 그림자, 비
- **분위기 연출**: 나무/풀 흔들림, 나비, 닭(배회·모이 쪼기·달려오면 도망), 흙먼지·물방울·나뭇조각 파티클
- **DOM 오버레이 UI**: 시계/날짜/날씨/골드 HUD, 에너지 바, 12칸 핫바, 대화창, 토스트, 상호작용 힌트, 타이틀 화면, 하루 전환 화면, 채팅

## 프로젝트 구조

```
client/                 # Vite 루트
  index.html
  public/assets/        # ← tools/ 가 생성한 PNG/JSON (직접 수정 X, 재생성)
  src/
    main.ts             # Phaser 설정 (pixelArt, roundPixels)
    scenes/             # BootScene(로드·애니 등록), FarmScene(게임 루프)
    world/              # World(타일맵·오브젝트), Grid(충돌·A*)
    entities/           # Character, Player, Npc, RemotePlayer(보간), Animals
    farm/               # FarmRenderer (경작지 오토타일 + 작물)
    fx/                 # Atmosphere (낮밤·조명·날씨·나비/반딧불)
    net/                # Authority (Local / Network 권한자 추상화)
    ui/                 # DOM UI (Tailwind)
shared/                 # 클라·서버 공용
  types.ts, protocol.ts
  data/                 # crops.json, items.json, npcs.json  ← 밸런스/대사/스케줄은 여기서
  sim/                  # FarmSimulation(권한 로직), MapInfo(Tiled JSON 파서)
server/index.ts         # WebSocket 권한 서버
tools/
  art/                  # 픽셀아트 생성기 (의존성 0, Node 내장 zlib 로 PNG 인코딩)
  map/                  # 농장 맵 생성기 → Tiled 호환 JSON
```

## 아키텍처 메모

- **서버 권한(Authoritative)**: 클라이언트는 `ActionIntent`(예: `useTool(slot, tx, ty)`)만 보내고, `FarmSimulation`이 거리·에너지·도구 소지를 검증한 뒤 이벤트를 브로드캐스트합니다. 싱글플레이는 같은 시뮬레이션을 브라우저에서 돌리는 `LocalAuthority`를 씁니다 → 씬 코드는 두 모드에서 동일.
- **이동 동기화**: 내 캐릭터는 즉시 로컬 이동(Client-side Prediction), 서버는 속도·충돌 검증 후 이상하면 `correct`로 보정(Reconciliation), 다른 플레이어는 110ms 버퍼 선형 보간(Entity Interpolation).
- **데이터 기반**: 작물/아이템/NPC 대사·스케줄은 `shared/data/*.json`만 고치면 반영됩니다.
- **타일 상태**: `SoilState.Unplowed / Plowed / Watered` + `CropInstance(stage)`.

## 그래픽 재생성

모든 이미지는 `tools/art/*.mjs` 코드로 그려집니다. 색·형태를 바꾸고 다시 생성하세요.

```bash
npm run gen          # = gen:art + gen:map
```

- 캐릭터 외형: `tools/art/looks.mjs` (머리 스타일 `short|long|bob|bun|ponytail|spiky|bald`, 의상 `shirt|overalls|dress|apron|vest`, 모자 `straw|cap|beanie`, 수염/안경)
- 애니메이션 포즈: `tools/art/char.mjs`의 `ANIMS`
- 맵 레이아웃: `tools/map/generate-map.mjs` (생성된 `farm.json`은 Tiled 에디터로 열 수 있음)

## 다음 단계 제안

- 집 내부 씬 / 마을 맵 전환, 상점 UI(씨앗 구매)
- 인벤토리 전체 창, 제작(Crafting), 도구 업그레이드
- 멀티플레이: NPC 이동을 서버 권한으로 이전, 수면 투표, Colyseus 스키마 기반 델타 동기화, 세이브 데이터(DB)
- 사운드(발소리·괭이질·환경음)
