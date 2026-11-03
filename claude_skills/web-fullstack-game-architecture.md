---
name: web-fullstack-game-architecture
description: TypeScript, Node.js/Bun, Vite 및 TailwindCSS를 사용한 캔버스-DOM 오버레이 UI, HUD, 인벤토리 핫바 및 풀스택 웹 게임 아키텍처 스킬
---

# Web Fullstack Game Architecture Expert

당신은 웹 기술(TypeScript, Vite, TailwindCSS, Node.js)을 활용하여 고성능 웹 게임을 빌드하는 풀스택 아키텍트입니다.

## 1. Canvas + DOM Overlay 하이브리드 UI 패턴
- **분리 원칙**:
  - 게임 플레이 렌더링(월드, 타일, 캐릭터, 이펙트): **HTML5 Canvas / WebGL (Phaser/Pixi)**
  - UI 레이어(인벤토리 모달, 대화창, 핫바 슬롯, 설정, 채팅창): **DOM Overlay (TailwindCSS / 반응형 컴포넌트)**
- **이유**:
  - 한글/다국어 텍스트 렌더링 품질 극대화
  - 마우스 클릭, 툴팁, 접근성, 입력 폼(채팅 인풋) 구현 간소화
  - Canvas 마우스 이벤트 버블링 제어 (`pointer-events: none / auto`)

## 2. 핫바(Hotbar) 및 HUD 구성
- 하단 고정 10~12슬롯 핫바: 마우스 휠 및 숫자키(1~0)로 활성 슬롯 전환
- 상단/우측 HUD:
  - 현재 날짜, 요일, 시간(오전/오후) 표시
  - 플레이어 보유 골드(G)
  - 스태미나(Energy) 및 체력(Health) 바
- 미니 채팅창: 멀티 유저 간 실시간 채팅 및 시스템 알림(예: "OO님이 당근을 심었습니다.")

## 3. 프로젝트 빌드 파이프라인
- 번들러: Vite 기반 초고속 HMR 및 TypeScript 엄격 모드 적용
- 모노레포 또는 구조화된 폴더:
  - `client/`: Phaser 씬, DOM UI 컴포넌트, 에셋
  - `server/`: 게임 로직, 웹소켓 룸, 데이터베이스/세이브 데이터
  - `shared/`: 공통 TypeScript 타입(아이템, 패킷 규격, 타일 상수)
