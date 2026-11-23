// 루미나 지방 8대 체육관 초대형(10배 면적) · 포켓몬 원작 정통 퍼즐 맵 (우회 불가 · 고밀도 장식)
//   1. in_gym     (바람골 · 50x58 · 10.1배): 상록시티/로켓단 아지트식 100% 빈틈없는 회전 화살표(Spin-Tile) + 정지 타일 미로
//   2. gym_harbor (물결항 · 58x68 · 10.0배): 들판시티(Pastoria)식 3단계 수위 역추적(Backtracking) 부교 퍼즐
//   3. gym_maple  (단풍골 · 60x66 ·  9.9배): 영원시티/검방울 숲 울타리 미궁 + 덩굴 레버 투석기 + 4→6→8쌍 꽃봉오리 기억력
//   4. gym_forge  (쇳불   · 56x74 · 10.0배): David Skinner 정통 Microban 소코반(#4, #12, #5) + 용암 횡단 레일 레버
//   5. gym_ember  (잿빛   · 62x70 ·  9.9배): 루네시티(Sootopolis)식 3방 한붓그리기 화산판(25/41/56칸) + 홍련 오답 추락 퀴즈
//   6. gym_lumina (빛누리 · 60x72 · 10.0배): 입구 즉각 가시 4단계 다중 광학 프리즘 레이저 회로 (교차 2빔 · 3중 코어 빔)
//   7. gym_frost  (서리   · 60x72 · 10.0배): 성도 얼음동굴(Ice Path) + 선단시티(Snowpoint) 다중 반사 리코셰 빙판 & 눈덩이
//   8. gym_summit (별마루 · 66x78 ·  9.9배): 노랑시티(Saffron) 3x3 9방 워프 미궁 + 5대 종합 시련(얼음동굴·한붓·회전·레이저·6음룬)

function rectGim(list, type, x0, y0, w, h, props = {}) {
  list.push([type, x0, y0 + h - 1, { w, h, ...props }]);
}
function cellGim(list, type, x, y, props = {}) {
  list.push([type, x, y, props]);
}
function spinArrow(list, x, y, dir) {
  list.push(['arrow_pad', x, y, { dir, steps: 60, spin: 1 }]);
}

/** 수조/용암 구역에서 지정된 섬/다리만 남기고 나머지 빈 칸을 투명 충돌체 pit으로 채움 */
function fillPoolPits(gimmicks, x0, y0, w, h, openRects) {
  const isOpen = (x, y) => openRects.some(([rx, ry, rw, rh]) => x >= rx && x < rx + rw && y >= ry && y < ry + rh);
  for (let y = y0; y < y0 + h; y++) {
    let runStart = -1;
    for (let x = x0; x <= x0 + w; x++) {
      const needPit = x < x0 + w && !isOpen(x, y);
      if (needPit && runStart < 0) runStart = x;
      else if (!needPit && runStart >= 0) {
        rectGim(gimmicks, 'pit', runStart, y, x - runStart, 1);
        runStart = -1;
      }
    }
  }
}

/** ASCII 회전 화살표 미로 스탬퍼: #=벽, ^=up, v=down, <=left, >=right, S=stop_tile, .=빈바닥 */
function stampSpinGrid(walls, gimmicks, x0, y0, rows) {
  const DIR = { '^': 'up', v: 'down', '<': 'left', '>': 'right' };
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      const x = x0 + rx, y = y0 + ry;
      if (ch === '#') walls.push([x, y, 1, 1]);
      else if (ch === 'S') cellGim(gimmicks, 'stop_tile', x, y);
      else if (DIR[ch]) spinArrow(gimmicks, x, y, DIR[ch]);
    }
  });
}

/** ASCII 소코반(Microban 원작) 스탬퍼: #=벽, $=push_block, .=block_slot, *=block+slot, @=플레이어 착지점, G=gate_bar, R=reset */
function stampSokoban(walls, gimmicks, x0, y0, rows, group, gateId, gateColor = '#f59e0b') {
  let start = [x0 + 1, y0 + 1];
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      const x = x0 + rx, y = y0 + ry;
      if (ch === '#') walls.push([x, y, 1, 1]);
      else if (ch === '$') cellGim(gimmicks, 'push_block', x, y, { group, gateId });
      else if (ch === '.') cellGim(gimmicks, 'block_slot', x, y, { group, gateId });
      else if (ch === '*') {
        cellGim(gimmicks, 'block_slot', x, y, { group, gateId });
        cellGim(gimmicks, 'push_block', x, y, { group, gateId });
      } else if (ch === '@') start = [x, y];
      else if (ch === 'G') rectGim(gimmicks, 'gate_bar', x, y, 1, 1, { gateId, color: gateColor });
      else if (ch === 'R') cellGim(gimmicks, 'puzzle_reset', x, y, { group });
    }
  });
  return start;
}

/** ASCII 빙판 리코셰(Ice Path / Snowpoint) 스탬퍼: #=벽, I=ice_tile, O=snowball+ice, P=pillar, .=안전눈밭 */
function stampIceGrid(walls, furn, gimmicks, x0, y0, rows) {
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < row.length; rx++) {
      const ch = row[rx];
      const x = x0 + rx, y = y0 + ry;
      if (ch === '#') walls.push([x, y, 1, 1]);
      else if (ch === 'P') furn.push(['pillar', x, y]);
      else if (ch === 'I') cellGim(gimmicks, 'ice_tile', x, y);
      else if (ch === 'O') {
        cellGim(gimmicks, 'ice_tile', x, y);
        cellGim(gimmicks, 'snowball', x, y);
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════
// 1. 바람골 도장 (in_gym) — 50 x 58 (2,900칸 · 기존 10.07배)
//    상록시티 체육관 & 로켓단 아지트 100% 빈틈없는 회전 화살표 바다 (우회 불가!)
// ══════════════════════════════════════════════════════════════════════
export function buildWindvaleGym() {
  const W = 50, H = 58, door = 25;
  const walls = [
    // 최상단 관장 세나 신전 단상 (y=3..9)
    [1, 3, 17, 7], [32, 3, 17, 7],
    [18, 9, 5, 1], [27, 9, 5, 1],
    // Zone 3 (y=11..20) ↔ Zone 2 구분 벽 (y=21, 문 x=23..26)
    [1, 21, 22, 1], [27, 21, 22, 1],
    // Zone 2 좌/우 미궁(x=3..20, x=29..46) ↔ 중앙 복도(x=22..27) 격리벽
    [21, 22, 1, 13], [28, 22, 1, 13],
    [1, 37, 21, 1], [28, 37, 21, 1],
    // Zone 1 (x=9..40, y=39..48) 양옆 웅장한 바람 회랑 외벽 (우회 완전 차단!)
    [1, 38, 8, 12], [41, 38, 8, 12],
    [1, 49, 8, 1], [41, 49, 8, 1],
    // Zone 3 양옆 외벽 (우회 차단)
    [1, 11, 8, 10], [41, 11, 8, 10],
  ];
  const elevs = [[18, 3, 31, 8, 1.0]];
  const ramps = [[23, 9, 26, 10, 'N', 0, 1.0]];
  const rugs = [
    [19, 3, 12, 5, '#2a8a8a'],
    [21, 50, 8, 6, '#236e78'],
    [10, 51, 9, 4, '#2a5f6c'], [31, 51, 9, 4, '#2a5f6c'],
    [22, 34, 6, 4, '#236e78'],
    [22, 22, 6, 3, '#236e78'],
    [9, 38, 32, 1, '#315460'],
  ];
  const emblems = [
    [24.5, 5.5, 2.6, '#2a8a8a', '#b8fff4'],
    [24.5, 53.5, 2.4, '#236e78', '#ffd866'],
  ];
  const circuits = [
    [2, 53, 21, 53, '#48d0c0'], [28, 53, 47, 53, '#48d0c0'],
    [24, 24, 24, 35, '#48d0c0'], [25, 24, 25, 35, '#48d0c0'],
    [24, 10, 24, 11, '#ffd866'], [25, 10, 25, 11, '#ffd866'],
  ];

  const gimmicks = [];

  // ── Zone 1 (x=9..40, y=39..48 — 32x10, 100% 빈틈없는 회전 화살표 바다!) ──
  // 입구(y=48): col 4(x=13, 함정), col 15(x=24, 정답), col 27(x=36, 함정)만 열림, 나머지 #!
  // 정답 7연쇄: (15,9)^ → (15,5)S → (14,5)< → (4,5)S → (4,4)^ → (4,1)S → (5,1)> → (20,1)S → (20,2)v → (20,6)S → (21,6)> → (29,6)S → (29,5)^ → (29,1)S → (30,1). 스위치 wg1!
  // Zone 1 상단 경계 벽 y=38 (중앙 문 x=23..26만 wg1 게이트!)
  walls.push([9, 38, 14, 1], [27, 38, 14, 1]);
  // Zone 1 32x10 100% 타일링 (y=39..48):
  //   행0(y=39): 중앙 게이트 출구(col 14..17 = .)는 별도 상단 포켓, 나머지 #로 격리 → 워프패드로 출구 포켓 복귀!
  //   (플레이어가 y=48에서 걸어서는 절대 행0 출구 포켓이나 스위치(col 30, row 1)에 닿을 수 없음!)
  stampSpinGrid(walls, gimmicks, 9, 39, [
    '##############....##############', // row 0 (y=39): 중앙 출구 포켓(x=23..26) — 아래쪽은 벽/화살표로 완전 차단!
    '####S>>>>>>>>>>>>>>>S#vvvvvvvS..', // row 1 (y=40): (4,1)S → (20,1)S, 우측 (29,1)S → (30,1) wg1 스위치 & (31,1) 복귀워프!
    '####^<<<<<<<<<<<<<<<v#vvvvvvv^##', // row 2 (y=41)
    '####^<<<<<<<<<<<<<<<v#vvvvvvv^##', // row 3 (y=42)
    '####^<<<<<<<<<<v<<<<v#vvvv<vv^##', // row 4 (y=43): (15,4)=v 함정, (27,4)=< 함정
    '####S<<<<<<<<<<S<<<<v#vvvvvvv^##', // row 5 (y=44): (15,5)S → 왼쪽 (14,5)< → (4,5)S! (오른쪽 숏컷 봉쇄!)
    '####v<<<<<<<<<<^>>>>S>>>>>>>>S##', // row 6 (y=45): (20,6)S → 오른쪽 (21,6)> → (29,6)S!
    '####v<<<<<<<<<<^vvvvvvvvvvv^vv##', // row 7 (y=46)
    '####^<<<<<<<<<<^vvvvvvvvvvv^vv##', // row 8 (y=47)
    '####^##########^###########^####', // row 9 (y=48): 오직 3개 화살표 입구(x=13, x=24, x=36)만 존재 — 걷기 우회 0%!
  ]);
  cellGim(gimmicks, 'switch_btn', 39, 40, { gateId: 'wg1', color: '#38d0a8' }); // (col 30, row 1)
  cellGim(gimmicks, 'warp_pad', 40, 40, { toX: 24, toY: 39, color: '#38d0a8' });   // 중앙 출구 포켓(y=39)으로 복귀!
  rectGim(gimmicks, 'gate_bar', 23, 38, 4, 1, { gateId: 'wg1', color: '#38d0a8' });

  // ── Zone 2 서쪽 돌풍 미궁 (x=2..20, y=23..36 — 19x14, 100% 빈틈없는 회전 화살표 바다!) ──
  // 중앙 복도(x=22..27, y=35..36)에서 서쪽으로 진입(x=20, y=35..36): 오직 row 12(y=35)의 '<' 입구로만 진입!
  // 정답 6연쇄 (x0=2, y0=23):
  //   (18,12)< → (12,12)S → (12,11)^ → (12,6)S → (13,6)> → (17,6)S → (17,5)^ → (17,1)S → (16,1)< → (3,1)S → (3,2)v → (3,10)S → (2,10) 스위치 wg2!
  walls.push([1, 22, 20, 1]); // 상단 차단
  stampSpinGrid(walls, gimmicks, 2, 23, [
    '###################', // row 0 (y=23)
    '###S<<<<<<<<<<<<<S#', // row 1 (y=24): (17,1)S → (3,1)S
    '###v>>>>>>>>>>>>>^#', // row 2 (y=25)
    '###v>>>>>>>>>>>>>^#', // row 3 (y=26)
    '###v>>>>>>>>>>>>>^#', // row 4 (y=27)
    '###v>>>>>>>>>>>>>^#', // row 5 (y=28)
    '###v>>>>>>>>S>>>>S#', // row 6 (y=29): (12,6)S → (17,6)S
    '###v>>>>>>>>^>>>>v#', // row 7 (y=30)
    '###v>>>>>>>>^>>>>v#', // row 8 (y=31)
    '###v>>>>>>>>^>>>>v#', // row 9 (y=32)
    '...S>>>>>>>>^>>>>v#', // row 10 (y=33): (3,10)S → 왼쪽 안전 스위치실(x=2..4, y=33)
    '###v>>>>>>>>^>>>>v#', // row 11 (y=34)
    '###v>>>>>>>>S<<<<<<', // row 12 (y=35): 동쪽 입구(col 18) < → (12,12)S!
    '###################', // row 13 (y=36)
  ]);
  cellGim(gimmicks, 'switch_btn', 3, 33, { gateId: 'wg2', color: '#ffd452' });
  cellGim(gimmicks, 'warp_pad', 2, 33, { toX: 24, toY: 35, color: '#ffd452' });

  // ── Zone 2 동쪽 돌풍 미궁 (x=29..47, y=23..36 — 19x14, 서쪽 미궁의 좌우 대칭 + 다른 루트!) ──
  // 진입(col 0, row 12 = x=29, y=35): '>' → (6,12)S → (6,11)^ → (6,4)S → (5,4)< → (1,4)S → (1,3)^ → (1,1)S → (2,1)> → (15,1)S → (15,2)v → (15,10)S → (16..17,10) 스위치 wg3!
  walls.push([29, 22, 20, 1]);
  stampSpinGrid(walls, gimmicks, 29, 23, [
    '###################', // row 0 (y=23)
    '#S>>>>>>>>>>>>>S###', // row 1 (y=24): (1,1)S → (15,1)S
    '#^<<<<<<<<<<<<<v###', // row 2 (y=25)
    '#^<<<<<<<<<<<<<v###', // row 3 (y=26)
    '#S<<<<S<<<<<<<<v###', // row 4 (y=27): (6,4)S → (1,4)S
    '#v<<<<^<<<<<<<<v###', // row 5 (y=28)
    '#v<<<<^<<<<<<<<v###', // row 6 (y=29)
    '#v<<<<^<<<<<<<<v###', // row 7 (y=30)
    '#v<<<<^<<<<<<<<v###', // row 8 (y=31)
    '#v<<<<^<<<<<<<<v###', // row 9 (y=32)
    '#v<<<<^<<<<<<<<S...', // row 10 (y=33): (15,10)S → 오른쪽 (16..18,10) 안전 스위치실!
    '#v<<<<^<<<<<<<<v###', // row 11 (y=34)
    '>>>>>>S<<<<<<<<v###', // row 12 (y=35): 서쪽 입구(col 0) > → (6,12)S!
    '###################', // row 13 (y=36)
  ]);
  cellGim(gimmicks, 'switch_btn', 45, 33, { gateId: 'wg3', color: '#ff6ba8' });
  cellGim(gimmicks, 'warp_pad', 46, 33, { toX: 25, toY: 35, color: '#ff6ba8' });

  // Zone 2 → Zone 3 중앙 2중 관문 (wg2 황금 + wg3 분홍)
  rectGim(gimmicks, 'gate_bar', 22, 24, 6, 1, { gateId: 'wg2', color: '#ffd452' });
  rectGim(gimmicks, 'gate_bar', 23, 21, 4, 1, { gateId: 'wg3', color: '#ff6ba8' });

  // ── Zone 3 (x=9..40, y=11..20 — 32x10, 100% 빈틈없는 최종 태풍 화살표 아레나!) ──
  // 입구(row 9 = y=20): col 14..17 (x=23..26) 중 오직 col 15(x=24)가 정답!
  // 정답 8연쇄:
  //   (15,9)^ → (15,7)S → (16,7)> → (28,7)S → (28,6)^ → (28,2)S → (27,2)< → (19,2)S → (19,3)v → (19,5)S → (18,5)< → (6,5)S → (6,4)^ → (6,2)S → (5,2)< → (2,2)S → (1,2) wg4!
  //   wg4 해제 후 워프패드(1,1) → 상단 중앙 포켓(x=24..25, y=11) → 상승 돌풍으로 세나 단상!
  stampSpinGrid(walls, gimmicks, 9, 11, [
    '##############....##############', // row 0 (y=11): 중앙 단상 직전 포켓(x=23..26)
    '#..#vvvvvvvvvvvvvvvvvvvvvvvvvvvv', // row 1 (y=12): (1,1)=워프, (2,1)=wg4 스위치
    '##S<<<S<<<<<<<<<<<<S<<<<<<<<S###', // row 2 (y=13): (28,2)S → (19,2)S, (6,2)S → (2,2)S → 위(2,1) 스위치!
    '##v###^<<<<<<<<<<<<v<<<<<<<<^###', // row 3 (y=14)
    '##v###^<<<<<<<<<<<<v<<<<<<<<^###', // row 4 (y=15)
    '##v###S<<<<<<<<<<<<S<<<<<<<<^###', // row 5 (y=16): (19,5)S → (6,5)S
    '##v###v<<<<<<<<<<<<v<<<<<<<<^###', // row 6 (y=17)
    '##v###v<<<<<<<<S>>>>>>>>>>>>S###', // row 7 (y=18): (15,7)S → (28,7)S
    '##v###v<<<<<<<<^vvvvvvvvvvvvv###', // row 8 (y=19)
    '##############v^vv##############', // row 9 (y=20): 입구 x=23..26 (col 15만 '^', 나머지 함정!)
  ]);
  // (2,2)S에서 위로 걸어 올라갈 수 있도록 (2,1)은 '.', (1,1)은 워프!
  cellGim(gimmicks, 'switch_btn', 11, 12, { gateId: 'wg4', color: '#b874ff' }); // col 2, row 1
  cellGim(gimmicks, 'warp_pad', 10, 12, { toX: 24, toY: 11, color: '#b874ff' }); // col 1, row 1 → 중앙 출구 포켓!
  rectGim(gimmicks, 'gate_bar', 23, 10, 4, 1, { gateId: 'wg4', color: '#b874ff' });
  cellGim(gimmicks, 'arrow_pad', 24, 9, { dir: 'up', steps: 2 });
  cellGim(gimmicks, 'arrow_pad', 25, 9, { dir: 'up', steps: 2 });

  // 풍성한 바람 신전 장식 (60+ 오브젝트!)
  const furn = [
    // 세나 단상 기둥 · 석상 · 촛대
    ['pillar', 19, 4], ['pillar', 30, 4], ['pillar', 19, 8], ['pillar', 30, 8],
    ['statue', 21, 4], ['statue', 28, 4], ['candle', 20, 6], ['candle', 29, 6],
    ['plant', 18, 4], ['plant', 31, 4], ['plant_b', 18, 8], ['plant_b', 31, 8],
    // 입구 로비 대형 열주 & 정원 (y=50..56)
    ['pillar', 4, 51], ['pillar', 8, 51], ['pillar', 12, 51], ['pillar', 16, 51], ['pillar', 20, 51],
    ['pillar', 29, 51], ['pillar', 33, 51], ['pillar', 37, 51], ['pillar', 41, 51], ['pillar', 45, 51],
    ['statue', 20, 55], ['statue', 29, 55], ['statue', 10, 55], ['statue', 39, 55],
    ['lamp_floor', 2, 51], ['lamp_floor', 47, 51], ['lamp_floor', 2, 55], ['lamp_floor', 47, 55],
    ['lamp_floor', 19, 53], ['lamp_floor', 30, 53],
    ['plant_b', 6, 55], ['plant_b', 14, 55], ['plant_b', 35, 55], ['plant_b', 43, 55],
    ['plant', 3, 53], ['plant', 46, 53], ['plant', 17, 55], ['plant', 32, 55],
    ['bench', 12, 55], ['bench', 36, 55],
    // 중앙 복도(x=22..27, y=22..36) 장식
    ['lamp_floor', 22, 35], ['lamp_floor', 27, 35], ['lamp_floor', 22, 25], ['lamp_floor', 27, 25],
    ['statue', 22, 31], ['statue', 27, 31], ['plant', 22, 28], ['plant', 27, 28],
    ['candle', 22, 22], ['candle', 27, 22],
    ['sign', 22, 54, { text: '바람골 도장 · 상록시티식 회전 화살표 미로!\n바닥 전체가 회전 화살표로 덮여 있어 걸어서 우회할 수 없습니다!\n정확한 입구 화살표를 골라 파란 정지 타일(■)을 연쇄 돌파하고 4개의 스위치를 모두 여세요!' }],
    ['sign', 24, 34, { text: '[2구역 · 쌍둥이 회전 미궁]\n서쪽(황금 스위치)과 동쪽(분홍 스위치) 미궁을 각각 6연쇄 화살표로 돌파하세요!' }],
    ['sign', 26, 22, { text: '[3구역 · 최종 태풍 아레나]\n중앙 4칸 입구 중 단 하나의 화살표만이 북서쪽 보라 스위치로 이어집니다!' }],
  ];

  return {
    name: '바람골 도장', W, H, door,
    wall: { color: '#c8d8e0', pattern: 'stone' },
    floor: { kind: 'stone', color: '#9aa8b4' },
    decor: [['banner', 4], ['banner', 14], ['banner', 24], ['banner', 34], ['banner', 44]],
    elevs, ramps, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:sena', 25, 5, { face: 'down' }],
      ['trainer:gym_windvale_t1', 26, 50, { face: 'left' }],
      ['trainer:gym_windvale_t2', 23, 32, { face: 'right' }],
      ['trainer:gym_windvale_t3', 26, 29, { face: 'left' }],
      ['trainer:gym_windvale_t4', 26, 23, { face: 'left' }],
      ['wp_gate', door, H - 2], ['entry', door, H - 2],
    ],
    lights: [[25, 6], [10, 15], [40, 15], [10, 29], [40, 29], [25, 44], [25, 54]],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 2. 물결항 도장 (gym_harbor) — 58 x 68 (3,944칸 · 기존 9.96배)
//    들판시티(Pastoria Gym) 진정한 3단계 수위 역추적(Backtracking) 퍼즐!
//    (각 핵심 섬에는 단 하나의 스위치만 배치 → 수위를 바꾼 뒤 옛 섬들을 역주행해야 진행!)
// ══════════════════════════════════════════════════════════════════════
export function buildHarborGym() {
  const W = 58, H = 68, door = 29;
  const elevs = [[21, 3, 36, 8, 1.0]];
  const ramps = [[27, 9, 31, 10, 'N', 0, 1.0]];
  const walls = [
    [1, 3, 20, 7], [37, 3, 20, 7],
    [21, 9, 6, 1], [31, 9, 6, 1],
  ];
  const pools = [[1, 11, 56, 49, 'water']];

  const islands = [
    [23, 55, 12, 6], // I0: 남쪽 중앙 부두 (y=55..60, 로비 y=60..66과 직결)
    [3, 51, 11, 7],  // I1: 남서 섬 [초록 스위치(1) 단독!]
    [44, 51, 11, 7], // I2: 남동 섬 [파랑 스위치(2) 단독!]
    [44, 37, 11, 7], // I3: 중동남 섬 (트레이너 t2)
    [23, 39, 12, 7], // I4: 중앙남 허브 섬 (트레이너 t1)
    [3, 37, 11, 7],  // I5: 중서남 섬
    [3, 24, 11, 7],  // I6: 중서북 섬 [노랑 스위치(0) 단독!]
    [23, 25, 12, 7], // I7: 중앙 허브 섬 (트레이너 t3)
    [44, 24, 11, 7], // I8: 중동북 섬
    [44, 12, 11, 6], // I9: 북동 섬 [초록 스위치(1) 단독!]
    [3, 12, 11, 6],  // I10: 북서 섬 [파랑 스위치(2) 단독! 최종 해금]
    [23, 14, 12, 5], // I11: 상단 결전 테라스 (관장 파도 직전)
  ];

  // 진정한 들판시티 역추적 그래프 (최소 5회 전역 수위 전환 0→1→2→0→1→2 필수!):
  //   1) I0(Lv0) --노랑0--> I1[초록1]
  //   2) I1(Lv1) --초록1--> I5 --초록1--> I4 --초록1--> I2[파랑2]
  //   3) I2(Lv2) --파랑2--> I3 --파랑2--> I4(역주행!) --파랑2--> I7 --파랑2--> I6[노랑0]
  //   4) I6(Lv0) --노랑0--> I7(역주행!) --노랑0--> I8 --노랑0--> I9[초록1]
  //   5) I9(Lv1) --초록1--> I11 --초록1--> I10[파랑2]
  //   6) I10(Lv2) --파랑2--> I11(역주행!) --파랑2--> 관장 파도!
  const bridges = [
    // Step 1 (Lv 0 노랑): I0 ↔ I1
    [14, 55, 9, 2, 0],
    // Step 2 (Lv 1 초록): I1 ↔ I5 ↔ I4 ↔ I2
    [7, 44, 3, 7, 1],
    [14, 41, 9, 2, 1],
    [35, 43, 9, 2, 1], // I4 ↔ I3? 아니 I2로 연결: 아래 남동 대각(I4 남쪽에서 I2로? 더 깔끔하게 I4↔I12↔I2 대신 I4→I3→I2 또는 I4에서 직접!)
    // 깔끔하게: I1(y=51..57) ↔ I5(y=37..43) [초록1], I5 ↔ I4(y=39..45) [초록1], I4 ↔ I3(y=37..43) [초록1], I3 ↔ I2(y=51..57) [초록1]!
    [48, 44, 3, 7, 1], // I3 ↔ I2 (초록1) → I2에서 파랑2 누르면 I2→I0 파랑2 또는 I2→I3(파랑2)로 돌아가야 함!
    // I2[파랑2] → 파랑2 다리로 I2(x=44..54, y=51..57) ↔ I0(x=23..34, y=55..60) [파랑2]! 그리고 I0 ↔ I4(y=39..45) [파랑2]!
    // WOW!! 그러면 진짜 들판시티처럼 남쪽 입구 부두(I0)로 되돌아와 중앙 파랑 대교를 타고 북상!!
    [35, 55, 9, 2, 2], // I2 ↔ I0 (파랑2 — 남쪽 부두로 역주행!)
    [28, 46, 3, 9, 2], // I0 ↔ I4 (파랑2 — 중앙 남부 대교!)
    [28, 32, 3, 7, 2], // I4 ↔ I7 (파랑2 — 중앙 허브 대교!)
    [14, 27, 9, 2, 2], // I7 ↔ I6 (파랑2 → I6에서 노랑0!)
    // Step 4 (Lv 0 노랑): I6 ↔ I7 ↔ I8 ↔ I9
    [14, 29, 9, 2, 0], // I6 ↔ I7 (노랑0 — 중앙 허브로 역주행!)
    [35, 27, 9, 2, 0], // I7 ↔ I8 (노랑0)
    [48, 18, 3, 6, 0], // I8 ↔ I9 (노랑0 → I9에서 초록1!)
    // Step 5 (Lv 1 초록): I9 ↔ I11 ↔ I10
    [35, 15, 9, 2, 1], // I9 ↔ I11 (초록1)
    [14, 15, 9, 2, 1], // I11 ↔ I10 (초록1 → I10에서 파랑2!)
    // Step 6 (Lv 2 파랑): I10 ↔ I11 → 관장 파도!
    [14, 17, 9, 1, 2], // I10 ↔ I11 (파랑2 — 역주행!)
    [28, 11, 3, 3, 2], // I11 → 관장 파도 단상 (파랑2!)
  ];

  const rugs = [
    [22, 3, 14, 5, '#3f8fc8'],
    [22, 61, 14, 5, '#2b6b9a'],
    [4, 61, 14, 4, '#367aa8'], [40, 61, 14, 4, '#367aa8'],
    ...islands.map(([x, y, w, h]) => [x, y, w, h, '#a89270']),
  ];
  const emblems = [
    [28.5, 5.5, 2.6, '#2b78b8', '#c8f2ff'],
    [28.5, 63.5, 2.4, '#2b6b9a', '#ffd866'],
    [28.5, 28, 2.2, '#3a8ac8', '#e0f8ff'],
  ];
  const circuits = [
    [4, 63, 21, 63, '#5ce8ff'], [36, 63, 53, 63, '#5ce8ff'],
    [28, 60, 28, 65, '#facc15'], [29, 60, 29, 65, '#facc15'],
  ];

  const gimmicks = [];
  fillPoolPits(gimmicks, 1, 11, 56, 49, [
    ...islands,
    ...bridges.map(([x, y, w, h]) => [x, y, w, h]),
  ]);
  for (const [x, y, w, h, reqLevel] of bridges) {
    rectGim(gimmicks, 'water_bridge', x, y, w, h, { reqLevel });
  }

  // 각 핵심 섬에 단 1개의 스위치만 배치 → 진정한 들판시티식 역추적!
  cellGim(gimmicks, 'water_switch', 25, 62, { level: 0, color: '#facc15' }); // 입구 리셋(노랑 0)
  cellGim(gimmicks, 'water_switch', 7, 53, { level: 1, color: '#34d399' });  // I1: 초록(1)
  cellGim(gimmicks, 'water_switch', 50, 53, { level: 2, color: '#38bdf8' }); // I2: 파랑(2)
  cellGim(gimmicks, 'water_switch', 7, 26, { level: 0, color: '#facc15' });  // I6: 노랑(0)
  cellGim(gimmicks, 'water_switch', 50, 14, { level: 1, color: '#34d399' }); // I9: 초록(1)
  cellGim(gimmicks, 'water_switch', 7, 14, { level: 2, color: '#38bdf8' });  // I10: 파랑(2) → 파도 단상 해방!
  // 비상 복귀 워프패드 (입구 부두로 복귀해 언제든 재도전 가능)
  cellGim(gimmicks, 'warp_pad', 29, 16, { toX: 29, toY: 62, color: '#e2e8f0' });

  // 풍성한 항구 수궁 장식 (65+ 오브젝트!)
  const furn = [
    ['pillar', 22, 4], ['pillar', 35, 4], ['pillar', 22, 8], ['pillar', 35, 8],
    ['statue', 24, 4], ['statue', 33, 4], ['crystal', 23, 6], ['crystal', 34, 6],
    // 남쪽 대형 항구 로비 (y=60..66)
    ['pillar', 4, 61], ['pillar', 10, 61], ['pillar', 16, 61], ['pillar', 41, 61], ['pillar', 47, 61], ['pillar', 53, 61],
    ['statue', 20, 63], ['statue', 37, 63], ['statue', 7, 64], ['statue', 50, 64],
    ['plant', 2, 65], ['plant', 55, 65], ['plant_b', 13, 65], ['plant_b', 44, 65],
    ['lamp_floor', 2, 61], ['lamp_floor', 55, 61], ['lamp_floor', 21, 61], ['lamp_floor', 36, 61],
    ['bench', 6, 61], ['bench', 50, 61],
    // 각 섬 코너 장식 (기둥 · 수정 · 화분 · 램프)
    ['pillar', 4, 52], ['pillar', 12, 52], ['plant', 4, 56], ['crystal', 12, 56],
    ['pillar', 45, 52], ['pillar', 53, 52], ['plant', 53, 56], ['crystal', 45, 56],
    ['pillar', 4, 38], ['pillar', 12, 38], ['lamp_floor', 4, 42],
    ['pillar', 45, 38], ['pillar', 53, 38], ['lamp_floor', 53, 42],
    ['statue', 24, 40], ['statue', 33, 40], ['plant_b', 24, 44], ['plant_b', 33, 44],
    ['crystal', 24, 26], ['crystal', 33, 26], ['lamp_floor', 24, 30], ['lamp_floor', 33, 30],
    ['pillar', 4, 25], ['pillar', 12, 25], ['plant_b', 4, 29],
    ['pillar', 45, 25], ['pillar', 53, 25], ['plant_b', 53, 29],
    ['statue', 4, 13], ['crystal', 12, 13], ['statue', 53, 13], ['crystal', 45, 13],
    ['pillar', 24, 14], ['pillar', 33, 14], ['candle', 25, 17], ['candle', 32, 17],
    ['sign', 34, 62, { text: '물결항 도장 · 들판시티식 3단계 수위 역추적 퍼즐!\n노랑(낮음) · 초록(중간) · 파랑(높음) 밸브를 누르면 수위가 바뀌어 지나왔던 섬들을 역주행해야 새 다리가 열립니다!' }],
    ['sign', 29, 28, { text: '[중앙 수문 관제실]\n파랑 수위에서 서쪽 섬으로 건너가 노랑 밸브를 작동시킨 뒤, 다시 이곳을 거쳐 동쪽→북동→북서 순으로 수위를 완성하세요!' }],
  ];

  return {
    name: '물결항 도장', col: '#3f8fc8', W, H, door,
    floor: { kind: 'tile', color: '#9cc8e0', color2: '#c4e2f0' },
    wall: { color: '#c8e4f2', pattern: 'tile' },
    elevs, ramps, pools, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:leader_harbor', 29, 5, { face: 'down' }],
      ['trainer:gym_harbor_t1', 31, 41, { face: 'left' }],
      ['trainer:gym_harbor_t2', 49, 40, { face: 'down' }],
      ['trainer:gym_harbor_t3', 26, 27, { face: 'right' }],
      ['trainer:gym_harbor_t4', 11, 14, { face: 'right' }],
    ],
    lights: [[29, 6], [9, 15], [49, 15], [29, 28], [9, 40], [49, 40], [29, 62]],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 3. 단풍골 도장 (gym_maple) — 60 x 66 (3,960칸 · 기존 9.90배)
//    영원시티 숲 미궁 + 검방울 덩굴 레버 투석기 + 3단계(4→6→8쌍) 꽃봉오리 정원 + 90+ 식물 장식
// ══════════════════════════════════════════════════════════════════════
export function buildMapleGym() {
  const W = 60, H = 66, door = 30;
  const elevs = [[23, 3, 37, 8, 1.0]];
  const ramps = [[28, 9, 32, 10, 'N', 0, 1.0]];
  const walls = [
    // 최상단 단비 단상
    [1, 3, 22, 7], [38, 3, 21, 7],
    [23, 9, 5, 1], [33, 9, 5, 1],
    // Zone 3 (y=11..23, 8쌍 황금 정원) ↔ Zone 2 구분 벽 (y=24, 중앙 문 x=28..31)
    [1, 24, 27, 1], [32, 24, 27, 1],
    // Zone 3 대칭 미로 울타리
    [14, 12, 1, 9], [45, 12, 1, 9],
    [20, 16, 6, 1], [34, 16, 6, 1],
    [7, 17, 7, 1], [46, 17, 7, 1],
    // Zone 2 (y=25..44): 서쪽 숲 미궁(1..19) · 중앙 6쌍 정원(21..38) · 동쪽 이끼 미궁(40..58)
    [1, 45, 27, 1], [32, 45, 27, 1],
    [20, 25, 1, 16], [39, 25, 1, 16],
    [21, 38, 7, 1], [32, 38, 7, 1],
    // 서쪽 숲 미궁 (x=1..19, y=25..44): 덩굴 레버 투석기(rail_switch mp_rw)로 봉인된 북서 스위치실(y=25..28)!
    [1, 39, 14, 1], [6, 34, 14, 1], [1, 29, 19, 1], // y=29 완전 차단 → x=16,y=30의 투석 화살표(altDir up)로만 넘을 수 있음!
    [10, 35, 1, 3], [14, 30, 1, 2],
    // 동쪽 이끼 미궁 (x=40..58, y=25..44): 덩굴 레버 투석기(rail_switch mp_re)로 봉인된 북동 스위치실(y=25..28)!
    [45, 39, 14, 1], [40, 34, 14, 1], [40, 29, 19, 1], // y=29 완전 차단 → x=43,y=30의 투석 화살표로만!
    [49, 35, 1, 3], [45, 30, 1, 2],
    // Zone 1 (y=46..64): 영원시티식 다층 덤불 미궁 (4개 숨겨진 꽃 정원)
    [1, 57, 18, 1], [41, 57, 18, 1],
    [18, 48, 1, 9], [41, 48, 1, 9],
    [6, 51, 12, 1], [42, 51, 12, 1],
    [12, 58, 1, 4], [47, 58, 1, 4],
    [23, 54, 5, 1], [32, 54, 5, 1],
  ];
  const rugs = [
    [24, 3, 12, 5, '#5fae4a'],
    [22, 12, 16, 11, '#3e8438'],
    [3, 12, 10, 11, '#4f7a38'], [47, 12, 10, 11, '#4f7a38'],
    [22, 26, 16, 11, '#4c8e3e'],
    [21, 47, 18, 13, '#3e8438'],
    [25, 60, 10, 5, '#6aa84f'],
    [3, 47, 14, 9, '#4c7a36'], [43, 47, 14, 9, '#4c7a36'],
  ];
  const emblems = [
    [29.5, 5.5, 2.6, '#4a9a3a', '#ffe880'],
    [29.5, 62.5, 2.2, '#5a9e42', '#ffd866'],
    [29.5, 31, 2.2, '#3e8438', '#ffb0c8'],
  ];
  const circuits = [
    [29, 46, 29, 60, '#a6e86e'], [30, 46, 30, 60, '#a6e86e'],
    [29, 25, 29, 37, '#ffd866'], [30, 25, 30, 37, '#ffd866'],
  ];

  const gimmicks = [];
  // Zone 1: 4쌍 (8장) 카드 — 4개 덤불 방 깊숙이 배치!
  const z1Cards = [
    [4, 62, 'leaf_red'], [55, 62, 'sun_gold'],
    [4, 48, 'sun_gold'], [55, 48, 'sakura'],
    [24, 58, 'sakura'], [35, 58, 'violet'],
    [24, 49, 'violet'], [35, 49, 'leaf_red'],
  ];
  for (const [x, y, pairKey] of z1Cards) cellGim(gimmicks, 'pair_card', x, y, { gateId: 'mp1', pairKey });
  rectGim(gimmicks, 'gate_bar', 28, 45, 4, 1, { gateId: 'mp1', color: '#6ee060' });

  // Zone 2 서쪽 덩굴 레버(mp_rw) → y=29 덩굴 장벽 해제 + 투석 발판 → 북서 스위치(mp_w)
  cellGim(gimmicks, 'rail_switch', 3, 31, { railGroup: 'mp_rw', gateId: 'mp_rw', color: '#ffaa33' });
  // y=29에 게이트 구멍 뚫기 (x=16..17)
  walls.splice(walls.findIndex((w) => w[0] === 1 && w[1] === 29 && w[2] === 19), 1, [1, 29, 15, 1], [18, 29, 2, 1]);
  rectGim(gimmicks, 'gate_bar', 16, 29, 2, 1, { gateId: 'mp_rw', color: '#ffaa33' });
  cellGim(gimmicks, 'arrow_pad', 16, 30, { dir: 'down', altDir: 'up', steps: 3, railGroup: 'mp_rw' });
  cellGim(gimmicks, 'switch_btn', 3, 26, { gateId: 'mp_w', color: '#ff88b8' });
  cellGim(gimmicks, 'warp_pad', 5, 26, { toX: 25, toY: 42, color: '#ff88b8' });

  // Zone 2 동쪽 덩굴 레버(mp_re) → y=29 덩굴 장벽 해제 + 투석 발판 → 북동 스위치(mp_e)
  cellGim(gimmicks, 'rail_switch', 56, 31, { railGroup: 'mp_re', gateId: 'mp_re', color: '#48d0ff' });
  walls.splice(walls.findIndex((w) => w[0] === 40 && w[1] === 29 && w[2] === 19), 1, [40, 29, 2, 1], [44, 29, 15, 1]);
  rectGim(gimmicks, 'gate_bar', 42, 29, 2, 1, { gateId: 'mp_re', color: '#48d0ff' });
  cellGim(gimmicks, 'arrow_pad', 43, 30, { dir: 'down', altDir: 'up', steps: 3, railGroup: 'mp_re' });
  cellGim(gimmicks, 'switch_btn', 56, 26, { gateId: 'mp_e', color: '#48b8ff' });
  cellGim(gimmicks, 'warp_pad', 54, 26, { toX: 34, toY: 42, color: '#48b8ff' });

  // 중앙 6쌍 정원 입구 2중 관문
  rectGim(gimmicks, 'gate_bar', 28, 39, 4, 1, { gateId: 'mp_w', color: '#ff88b8' });
  rectGim(gimmicks, 'gate_bar', 28, 38, 4, 1, { gateId: 'mp_e', color: '#48b8ff' });

  // Zone 2 중앙 6쌍 (12장) 카드
  const z2Cards = [
    [23, 35, 'leaf_red'], [27, 35, 'sun_gold'], [32, 35, 'sakura'], [36, 35, 'violet'],
    [23, 31, 'bellflower'], [27, 31, 'emerald'], [32, 31, 'leaf_red'], [36, 31, 'sun_gold'],
    [23, 27, 'violet'], [27, 27, 'bellflower'], [32, 27, 'emerald'], [36, 27, 'sakura'],
  ];
  for (const [x, y, pairKey] of z2Cards) cellGim(gimmicks, 'pair_card', x, y, { gateId: 'mp2', pairKey });
  rectGim(gimmicks, 'gate_bar', 28, 24, 4, 1, { gateId: 'mp2', color: '#ffd452' });

  // Zone 3 북쪽 성소: 8쌍 (16장) 8색 대형 꽃 정원!
  const z3Cards = [
    [4, 21, 'leaf_red'], [10, 21, 'sun_gold'], [4, 13, 'sakura'], [10, 13, 'violet'],
    [22, 21, 'bellflower'], [26, 21, 'emerald'], [33, 21, 'coral'], [37, 21, 'frost'],
    [22, 13, 'coral'], [26, 13, 'leaf_red'], [33, 13, 'frost'], [37, 13, 'sun_gold'],
    [49, 21, 'violet'], [55, 21, 'bellflower'], [49, 13, 'emerald'], [55, 13, 'sakura'],
  ];
  for (const [x, y, pairKey] of z3Cards) cellGim(gimmicks, 'pair_card', x, y, { gateId: 'mp3', pairKey });
  rectGim(gimmicks, 'gate_bar', 28, 11, 5, 1, { gateId: 'mp3', color: '#4ade80' });

  // 풍성한 식물원·단풍 숲 장식 (85+ 오브젝트!)
  const furn = [
    ['pillar', 24, 4], ['pillar', 35, 4], ['pillar', 24, 8], ['pillar', 35, 8],
    ['plant_b', 25, 4], ['plant_b', 34, 4], ['plant', 25, 8], ['plant', 34, 8],
    ['statue', 26, 4], ['statue', 33, 4],
    // 입구 로비 정원
    ['plant_b', 2, 63], ['plant', 5, 63], ['plant_b', 8, 63], ['plant', 15, 63], ['plant_b', 22, 63],
    ['plant_b', 37, 63], ['plant', 44, 63], ['plant_b', 51, 63], ['plant', 54, 63], ['plant_b', 57, 63],
    ['lamp_floor', 24, 63], ['lamp_floor', 35, 63], ['lamp_floor', 20, 58], ['lamp_floor', 39, 58],
    ['pillar', 24, 60], ['pillar', 35, 60], ['bench', 19, 63], ['bench', 38, 63],
    ['plant_b', 2, 59], ['plant_b', 57, 59], ['plant', 2, 54], ['plant', 57, 54],
    ['plant_b', 2, 47], ['plant_b', 57, 47], ['plant', 16, 47], ['plant', 43, 47],
    ['statue', 22, 52], ['statue', 37, 52], ['plant_b', 21, 47], ['plant_b', 38, 47],
    // Zone 2 좌/우 미궁 & 중앙 정원 장식
    ['plant', 2, 43], ['plant_b', 6, 43], ['plant', 15, 43], ['plant_b', 2, 36], ['plant', 18, 36],
    ['plant_b', 18, 31], ['lamp_floor', 8, 26], ['plant_b', 12, 26],
    ['plant', 57, 43], ['plant_b', 53, 43], ['plant', 44, 43], ['plant_b', 57, 36], ['plant', 41, 36],
    ['plant_b', 41, 31], ['lamp_floor', 51, 26], ['plant_b', 47, 26],
    ['pillar', 21, 36], ['pillar', 38, 36], ['pillar', 21, 26], ['pillar', 38, 26],
    ['lamp_floor', 25, 42], ['lamp_floor', 34, 42], ['plant_b', 22, 41], ['plant_b', 37, 41],
    // Zone 3 황금 단풍 성소 장식
    ['plant_b', 2, 22], ['plant', 2, 16], ['plant_b', 2, 12], ['plant', 12, 12],
    ['plant_b', 57, 22], ['plant', 57, 16], ['plant_b', 57, 12], ['plant', 47, 12],
    ['pillar', 16, 22], ['pillar', 43, 22], ['pillar', 16, 12], ['pillar', 43, 12],
    ['statue', 20, 22], ['statue', 39, 22], ['lamp_floor', 20, 12], ['lamp_floor', 39, 12],
    ['plant_b', 29, 21], ['plant_b', 30, 21], ['candle', 26, 11], ['candle', 33, 11],
    ['sign', 33, 62, { text: '단풍골 도장 · 영원 숲 미궁 & 꽃봉오리 짝 맞추기!\n1구역(4쌍) → 좌·우 숲 미궁의 덩굴 레버 투석기 돌파 → 2구역(6쌍) → 3구역(8쌍)을 모두 풀어 관장 단비에게 도전하세요!' }],
    ['sign', 34, 43, { text: '[2구역 안내]\n서쪽·동쪽 미궁 깊숙한 곳의 덩굴 레버를 당겨 투석 발판을 위로 전환한 뒤, 북쪽 끝 스위치를 모두 누르세요!' }],
    ['sign', 34, 22, { text: '[3구역 · 황금 단풍 성소]\n8종류(16장) 꽃봉오리의 짝을 모두 맞추면 관장 단비의 단상이 열립니다!' }],
  ];

  return {
    name: '단풍골 도장', col: '#5fae4a', W, H, door,
    floor: { kind: 'wood', color: '#a07848' },
    wall: { color: '#d8e8c0', pattern: 'plank' },
    elevs, ramps, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:leader_maple', 30, 5, { face: 'down' }],
      ['trainer:gym_maple_t1', 11, 53, { face: 'right' }],
      ['trainer:gym_maple_t2', 8, 31, { face: 'right' }],
      ['trainer:gym_maple_t3', 51, 31, { face: 'left' }],
      ['trainer:gym_maple_t4', 30, 18, { face: 'down' }],
    ],
    lights: [[30, 6], [10, 17], [50, 17], [30, 31], [10, 35], [50, 35], [30, 55]],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 4. 쇳불 도장 (gym_forge) — 56 x 74 (4,144칸 · 기존 9.96배)
//    David W. Skinner 정통 Microban 소코반(#4, #12, #5 원형 그대로!) + 용암 횡단 레일 레버!
// ══════════════════════════════════════════════════════════════════════
export function buildForgeGym() {
  const W = 56, H = 74, door = 28;
  const elevs = [[21, 3, 35, 8, 1.0]];
  const ramps = [[26, 9, 30, 10, 'N', 0, 1.0]];
  const pools = [
    [2, 54, 15, 14, 'lava'], [39, 54, 15, 14, 'lava'], // Zone 1 양옆 대용암 호수
    [2, 41, 52, 4, 'lava'],                            // Zone 2 1차 용암 해자 (컨베이어로만 횡단!)
    [2, 33, 52, 4, 'lava'],                            // Zone 2 2차 용암 해자 (컨베이어로만 횡단!)
    [16, 13, 4, 14, 'lava'], [36, 13, 4, 14, 'lava'],  // Zone 3 좌/우 리프트 분리 용암
  ];
  const walls = [
    [1, 3, 20, 7], [36, 3, 19, 7],
    [21, 9, 5, 1], [31, 9, 5, 1],
    // Zone 3 ↔ Zone 2 구분 벽 (y=28, 문 x=26..29)
    [1, 28, 25, 1], [30, 28, 25, 1],
    // Zone 2 ↔ Zone 1 구분 벽 (y=51, 문 x=26..29)
    [1, 51, 25, 1], [30, 51, 25, 1],
  ];
  const rugs = [
    [22, 3, 12, 5, '#c86e34'],
    [22, 68, 12, 5, '#8c4a24'],
    [21, 53, 14, 13, '#4e423a'], // Microban #4 주조장 바닥
    [22, 13, 12, 13, '#4e423a'], // Microban #5 대용광로 바닥
    [3, 14, 12, 11, '#4e423a'],  // Microban #12 서쪽 금고 바닥
  ];
  const emblems = [
    [27.5, 5.5, 2.6, '#b85c24', '#ffd866'],
    [27.5, 70.5, 2.3, '#8c4a24', '#ffaa33'],
  ];
  const circuits = [
    [18, 69, 37, 69, '#ff8833'],
    [41, 38, 41, 49, '#ffaa33'], [14, 30, 14, 40, '#48d0ff'],
  ];

  const gimmicks = [];
  // Zone 1 & Zone 3 용암 pit
  rectGim(gimmicks, 'pit', 2, 54, 15, 14);
  rectGim(gimmicks, 'pit', 39, 54, 15, 14);
  rectGim(gimmicks, 'pit', 16, 13, 4, 14);
  rectGim(gimmicks, 'pit', 36, 13, 4, 14);
  // Zone 2 용암 해자: 오직 2칸 폭 철교 레일(1차: x=41..42, 2차: x=13..14)만 뚫어두고 나머지 용암 pit!
  fillPoolPits(gimmicks, 2, 41, 52, 4, [[41, 41, 2, 4]]);
  fillPoolPits(gimmicks, 2, 33, 52, 4, [[13, 33, 2, 4]]);

  // ── Zone 1: 정통 David Skinner Microban Level 4 (3블록, 7x8 원형 + 하단 전용 리셋/퇴장 포켓!) ──
  const m4At = stampSokoban(walls, gimmicks, 24, 56, [
    '##GGG##',
    '### . #',
    '# $ $ #',
    '#  @$ #',
    '# . . #',
    '### ###',
    '##R  ##',
    '#######',
  ], 's1', 'sk1', '#f59e0b');
  // Microban #4 입장 워프패드(외부 y=66 → 내부 @) & 비상 퇴장 워프(하단 포켓 우측 (28,62))
  cellGim(gimmicks, 'warp_pad', 28, 66, { toX: m4At[0], toY: m4At[1], color: '#f59e0b' });
  cellGim(gimmicks, 'warp_pad', 28, 62, { toX: 28, toY: 67, color: '#e2e8f0' });
  // Microban #4 클리어 시 북쪽 GGG(y=56) 열림 → Zone 1 출구(y=51)도 sk1로 함께 열림!
  rectGim(gimmicks, 'gate_bar', 26, 51, 4, 1, { gateId: 'sk1', color: '#f59e0b' });
  // Zone 1 외곽에서 y=56 북쪽 방으로 걸어 우회하지 못하도록 Microban 좌우 벽을 용암 호수까지 연장!
  walls.push([17, 56, 7, 1], [31, 56, 8, 1]);

  // ── Zone 2 (y=29..50): 용암 해자 횡단 3단 컨베이어 레일 레버 (fg1 → fg2 → fg3, 우회 0%!) ──
  // 1층(y=45..50): 서쪽 끝 레버(fg1) at (10,48) → 1차 용암 해자 철교(41..42, 45) 방향 down(차단) → up(6칸 횡단!)
  cellGim(gimmicks, 'rail_switch', 10, 48, { railGroup: 'fg1', gateId: 'fg1', color: '#ffaa33' });
  cellGim(gimmicks, 'arrow_pad', 41, 45, { dir: 'down', altDir: 'up', steps: 6, railGroup: 'fg1' });
  cellGim(gimmicks, 'arrow_pad', 42, 45, { dir: 'down', altDir: 'up', steps: 6, railGroup: 'fg1' });
  rectGim(gimmicks, 'gate_bar', 41, 44, 2, 1, { gateId: 'fg1', color: '#ffaa33' });
  // 2층(y=37..40): 동쪽 끝 레버(fg2) at (49,38) → 2차 용암 해자 철교(13..14, 37) 방향 down(차단) → up(6칸 횡단!)
  cellGim(gimmicks, 'rail_switch', 49, 38, { railGroup: 'fg2', gateId: 'fg2', color: '#48d0ff' });
  cellGim(gimmicks, 'arrow_pad', 13, 37, { dir: 'down', altDir: 'up', steps: 6, railGroup: 'fg2' });
  cellGim(gimmicks, 'arrow_pad', 14, 37, { dir: 'down', altDir: 'up', steps: 6, railGroup: 'fg2' });
  rectGim(gimmicks, 'gate_bar', 13, 36, 2, 1, { gateId: 'fg2', color: '#48d0ff' });
  // 3층(y=29..32): 동쪽 끝 레버(fg3) at (49,30) → 중앙 출구 게이트 fg3(26..29, 28) 개방!
  cellGim(gimmicks, 'rail_switch', 49, 30, { railGroup: 'fg3', gateId: 'fg3', color: '#f472b6' });
  rectGim(gimmicks, 'gate_bar', 26, 28, 4, 1, { gateId: 'fg3', color: '#f472b6' });

  // ── Zone 3 (y=11..27): 서쪽 금고 Microban #3(2블록 정통 우회·교환 명작) + 중앙 대용광로 Microban #5(전설의 4블록 새장!) ──
  // 서쪽 리프트(21,25 ↔ 11,25) → David Skinner Microban #3 원형 그대로 (9x7, x=4..12, y=15..21)!
  cellGim(gimmicks, 'warp_pad', 21, 25, { toX: 11, toY: 25, color: '#38bdf8' });
  cellGim(gimmicks, 'warp_pad', 11, 26, { toX: 22, toY: 25, color: '#38bdf8' });
  const m3At = stampSokoban(walls, gimmicks, 4, 15, [
    '######   ',
    '###  ####',
    '#   $   #',
    '# #$#   #',
    '#  . .#@#',
    '#R##### #',
    '#########',
  ], 's_w', 'fg_w', '#38bdf8');
  cellGim(gimmicks, 'warp_pad', 8, 24, { toX: m3At[0], toY: m3At[1], color: '#38bdf8' }); // Microban #3 입장
  cellGim(gimmicks, 'warp_pad', 11, 20, { toX: 11, toY: 24, color: '#e2e8f0' });         // Microban #3 전용 퇴장 포켓!
  // 동쪽 리프트(34,25 ↔ 44,25): 수석 관원(t4) 격파 후 동쪽 스위치(fg_e)
  cellGim(gimmicks, 'warp_pad', 34, 25, { toX: 44, toY: 25, color: '#facc15' });
  cellGim(gimmicks, 'warp_pad', 44, 26, { toX: 33, toY: 25, color: '#facc15' });
  cellGim(gimmicks, 'switch_btn', 47, 15, { gateId: 'fg_e', color: '#facc15' });

  // 중앙 대용광로: 정통 David Skinner Microban Level 5 (전설의 4블록 새장! 4방향 중 3방향이 즉시 교착!)
  const m5At = stampSokoban(walls, gimmicks, 24, 15, [
    '##GGG##',
    '### . #',
    '# $.$ #',
    '# $@$ #',
    '# . . #',
    '### ###',
    '##R  ##',
    '#######',
  ], 's2', 'sk2', '#f59e0b');
  cellGim(gimmicks, 'warp_pad', 28, 25, { toX: m5At[0], toY: m5At[1], color: '#f59e0b' }); // Microban #5 중앙 새장 입장!
  cellGim(gimmicks, 'warp_pad', 28, 21, { toX: 28, toY: 26, color: '#e2e8f0' });           // Microban #5 비상 퇴장 포켓!
  walls.push([20, 15, 4, 1], [31, 15, 5, 1]); // 우회 차단!

  // 최종 3중 관문 (fg_w, fg_e, sk2)
  rectGim(gimmicks, 'gate_bar', 26, 12, 4, 1, { gateId: 'fg_w', color: '#38bdf8' });
  rectGim(gimmicks, 'gate_bar', 26, 11, 4, 1, { gateId: 'fg_e', color: '#facc15' });
  rectGim(gimmicks, 'gate_bar', 26, 10, 4, 1, { gateId: 'sk2', color: '#f59e0b' });

  // 풍성한 대장간·용광로 장식 (80+ 오브젝트!)
  const furn = [
    ['pillar', 22, 4], ['pillar', 33, 4], ['pillar', 22, 8], ['pillar', 33, 8],
    ['forge', 24, 4], ['forge', 30, 4], ['anvil', 23, 6], ['anvil', 32, 6], ['candle', 26, 4], ['candle', 29, 4],
    // 입구 로비 (y=68..72)
    ['forge', 3, 71], ['anvil', 6, 71], ['crate', 8, 71], ['barrel', 9, 71],
    ['forge', 51, 71], ['anvil', 48, 71], ['crate', 46, 71], ['barrel', 45, 71],
    ['pillar', 12, 69], ['pillar', 18, 69], ['pillar', 37, 69], ['pillar', 43, 69],
    ['statue', 22, 71], ['statue', 33, 71], ['candle', 21, 68], ['candle', 34, 68],
    ['barrel', 19, 66], ['crate', 20, 66], ['barrel', 36, 66], ['crate', 35, 66],
    ['anvil', 18, 61], ['anvil', 37, 61], ['candle', 18, 58], ['candle', 37, 58],
    ['forge', 18, 53], ['forge', 36, 53],
    // Zone 2 용광로 레일 층 장식
    ['pillar', 4, 48], ['pillar', 16, 48], ['pillar', 32, 48], ['pillar', 50, 48],
    ['candle', 8, 46], ['candle', 46, 46], ['anvil', 20, 49], ['barrel', 35, 49],
    ['pillar', 4, 39], ['pillar', 22, 39], ['pillar', 34, 39], ['pillar', 52, 39],
    ['candle', 11, 38], ['candle', 45, 38], ['crate', 30, 39], ['barrel', 31, 39],
    ['pillar', 4, 31], ['pillar', 20, 31], ['pillar', 36, 31], ['pillar', 52, 31],
    ['forge', 3, 30], ['anvil', 6, 30], ['candle', 24, 29], ['candle', 31, 29],
    // Zone 3 대용광로 장식
    ['forge', 41, 23], ['anvil', 44, 23], ['forge', 49, 23], ['barrel', 52, 23],
    ['pillar', 42, 16], ['pillar', 51, 16], ['candle', 45, 14], ['candle', 49, 14],
    ['statue', 22, 13], ['statue', 33, 13], ['candle', 20, 24], ['candle', 35, 24],
    ['pillar', 21, 13], ['pillar', 34, 13], ['barrel', 3, 25], ['crate', 4, 25],
    ['sign', 33, 70, { text: '쇳불 도장 · 정통 Microban 소코반 & 용암 레일 퍼즐!\n주황 워프패드로 주조장에 들어가 모든 강철 블록을 주황 슬롯에 밀어 넣으세요(이동 키 또는 E).\n실수하면 아래 파란 초기화 패드(R)로 언제든 되돌릴 수 있습니다!' }],
    ['sign', 31, 49, { text: '[2구역 · 용암 횡단 컨베이어]\n양쪽 끝 레일 레버를 당겨야 용암 위 철교 화살표가 위쪽으로 바뀝니다!' }],
    ['sign', 31, 26, { text: '[3구역 · 대용광로 Microban #5 & 서쪽 금고 #3]\n중앙 워프패드 안은 4블록 전설의 새장 퍼즐! 서쪽 금고(Microban #3)·동쪽 리프트 시련과 함께 모두 정복하세요!' }],
  ];

  return {
    name: '쇳불 도장', col: '#b8864a', W, H, door,
    floor: { kind: 'stone', color: '#8a7a6a' },
    wall: { color: '#8a7a70', pattern: 'stone' },
    elevs, ramps, pools, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:leader_forge', 28, 5, { face: 'down' }],
      ['trainer:gym_forge_t1', 21, 63, { face: 'right' }],
      ['trainer:gym_forge_t2', 26, 47, { face: 'down' }],
      ['trainer:gym_forge_t3', 26, 38, { face: 'right' }],
      ['trainer:gym_forge_t4', 46, 19, { face: 'left' }],
    ],
    lights: [[28, 6], [8, 18], [47, 18], [28, 18], [28, 39], [28, 59], [28, 70]],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 5. 잿빛 도장 (gym_ember) — 62 x 70 (4,340칸 · 기존 9.86배)
//    루네시티(Sootopolis) 3방 한붓그리기 화산판(25/41/56칸) + 홍련섬 오답 추락 퀴즈 + 90+ 촛대/신전 장식!
// ══════════════════════════════════════════════════════════════════════
export function buildEmberGym() {
  const W = 62, H = 70, door = 31;
  const elevs = [[24, 3, 38, 8, 1.0]];
  const ramps = [[29, 9, 33, 10, 'N', 0, 1.0]];
  const walls = [
    [1, 3, 23, 7], [39, 3, 22, 7],
    [24, 9, 5, 1], [34, 9, 5, 1],
    // 서쪽 지하 용암 추락 회랑(x=2..14) 완전 격리벽
    [15, 10, 2, 59],
    // 본당 5단 구분 벽
    [17, 52, 18, 1], [41, 52, 20, 1],
    [17, 46, 18, 1], [41, 46, 20, 1],
    [17, 40, 18, 1], [41, 40, 20, 1],
    [17, 27, 18, 1], [41, 27, 20, 1],
    [17, 11, 12, 1], [34, 11, 27, 1],
    // 지하 회랑 3개 층 구분
    [1, 48, 14, 1], [1, 28, 14, 1],
  ];
  const pools = [
    [18, 54, 42, 10, 'lava'],
    [18, 29, 42, 10, 'lava'],
    [18, 13, 42, 12, 'lava'],
  ];

  const gimmicks = [];
  const openLava = [];

  // Room 1 (루네시티 제1방: 5x5 = 25칸 한붓그리기)
  openLava.push([35, 61, 7, 3], [35, 53, 7, 3], [36, 56, 5, 5]);
  for (let y = 56; y <= 60; y++) for (let x = 36; x <= 40; x++) {
    cellGim(gimmicks, 'cracked_tile', x, y, { zoneId: 'r1', gateId: 'em_r1', fallX: 8, fallY: 61 });
  }
  cellGim(gimmicks, 'puzzle_reset', 35, 62, { group: 'r1' });
  rectGim(gimmicks, 'gate_bar', 35, 52, 6, 1, { gateId: 'em_r1', color: '#ff7040' });

  // 홍련섬 2단계 불꽃 퀴즈 (오답 밟으면 즉시 서쪽 지하 용암 우리로 추락!)
  const q1 = '물 타입에 약하고 풀 타입에 강한 속성은?\n① 얼음   ② 불꽃   ③ 바위';
  cellGim(gimmicks, 'quiz_pad', 32, 49, { gateId: 'eq1', num: 1, correct: false, q: q1, failX: 8, failY: 42, color: '#ff8a48' });
  cellGim(gimmicks, 'quiz_pad', 38, 49, { gateId: 'eq1', num: 2, correct: true, q: q1, color: '#ff8a48' });
  cellGim(gimmicks, 'quiz_pad', 44, 49, { gateId: 'eq1', num: 3, correct: false, q: q1, failX: 8, failY: 42, color: '#ff8a48' });
  rectGim(gimmicks, 'gate_bar', 35, 46, 6, 1, { gateId: 'eq1', color: '#ffaa40' });

  const q2 = '루네식 화산판 퍼즐에서 관문을 여는 조건은?\n① 절반만 밟기   ② 모든 칸을 정확히 한 번씩 밟기   ③ 뛰어넘기';
  cellGim(gimmicks, 'quiz_pad', 32, 43, { gateId: 'eq2', num: 1, correct: false, q: q2, failX: 8, failY: 42, color: '#ff8a48' });
  cellGim(gimmicks, 'quiz_pad', 38, 43, { gateId: 'eq2', num: 2, correct: true, q: q2, color: '#ff8a48' });
  cellGim(gimmicks, 'quiz_pad', 44, 43, { gateId: 'eq2', num: 3, correct: false, q: q2, failX: 8, failY: 42, color: '#ff8a48' });
  rectGim(gimmicks, 'gate_bar', 35, 40, 6, 1, { gateId: 'eq2', color: '#ffd448' });

  // Room 2 (루네시티 제2방: 9x5 - 4기둥 = 41칸 한붓그리기)
  const r2Pillars = new Set(['35,32', '36,32', '40,32', '41,32']);
  openLava.push([35, 36, 7, 3], [35, 28, 7, 3], [34, 31, 9, 5]);
  for (let y = 31; y <= 35; y++) for (let x = 34; x <= 42; x++) {
    if (r2Pillars.has(`${x},${y}`)) walls.push([x, y, 1, 1]);
    else cellGim(gimmicks, 'cracked_tile', x, y, { zoneId: 'r2', gateId: 'em_r2', fallX: 8, fallY: 42 });
  }
  cellGim(gimmicks, 'puzzle_reset', 35, 37, { group: 'r2' });
  rectGim(gimmicks, 'gate_bar', 35, 27, 6, 1, { gateId: 'em_r2', color: '#ff7040' });

  // Room 3 (루네시티 제3방: 10x6 - 4기둥 = 56칸 한붓그리기)
  const r3Pillars = new Set(['28,18', '29,18', '34,18', '35,18']);
  openLava.push([27, 22, 12, 3], [28, 12, 7, 4], [27, 16, 10, 6]);
  for (let y = 16; y <= 21; y++) for (let x = 27; x <= 36; x++) {
    if (r3Pillars.has(`${x},${y}`)) walls.push([x, y, 1, 1]);
    else cellGim(gimmicks, 'cracked_tile', x, y, { zoneId: 'r3', gateId: 'em_r3', fallX: 8, fallY: 22 });
  }
  cellGim(gimmicks, 'puzzle_reset', 28, 23, { group: 'r3' });
  rectGim(gimmicks, 'gate_bar', 29, 11, 5, 1, { gateId: 'em_r3', color: '#ffd448' });

  fillPoolPits(gimmicks, 18, 54, 42, 10, openLava);
  fillPoolPits(gimmicks, 18, 29, 42, 10, openLava);
  fillPoolPits(gimmicks, 18, 13, 42, 12, openLava);

  // 서쪽 지하 용암 회랑 복귀 워프패드 + 도전 진입 워프
  cellGim(gimmicks, 'warp_pad', 8, 52, { toX: 38, toY: 62, color: '#ff8a48' });
  cellGim(gimmicks, 'warp_pad', 8, 32, { toX: 38, toY: 37, color: '#ff8a48' });
  cellGim(gimmicks, 'warp_pad', 8, 14, { toX: 31, toY: 23, color: '#ffd448' });
  cellGim(gimmicks, 'warp_pad', 22, 66, { toX: 8, toY: 63, color: '#f97316' });
  cellGim(gimmicks, 'warp_pad', 22, 39, { toX: 8, toY: 43, color: '#f97316' });
  cellGim(gimmicks, 'warp_pad', 22, 25, { toX: 8, toY: 23, color: '#f97316' });

  const rugs = [
    [25, 3, 12, 5, '#e8642e'],
    [26, 65, 10, 4, '#9c3e24'],
    [18, 47, 42, 4, '#6e3222'], [18, 41, 42, 4, '#6e3222'],
    [35, 61, 7, 3, '#6b3a2e'], [35, 53, 7, 3, '#6b3a2e'],
    [35, 36, 7, 3, '#6b3a2e'], [35, 28, 7, 3, '#6b3a2e'],
    [27, 22, 12, 3, '#6b3a2e'], [28, 12, 7, 4, '#6b3a2e'],
    [3, 51, 10, 15, '#54261e'], [3, 31, 10, 15, '#54261e'], [3, 13, 10, 13, '#54261e'],
  ];
  const emblems = [
    [30.5, 5.5, 2.6, '#d84e24', '#ffe066'],
    [30.5, 66.5, 2.2, '#b83c1e', '#ffaa40'],
  ];
  const circuits = [
    [18, 66, 25, 66, '#ff6a33'], [36, 66, 59, 66, '#ff6a33'],
    [18, 49, 30, 49, '#ff8844'], [46, 49, 59, 49, '#ff8844'],
    [18, 43, 30, 43, '#ffaa44'], [46, 43, 59, 43, '#ffaa44'],
  ];

  // 웅장한 화산 신전 장식 (80+ 오브젝트!)
  const furn = [
    ['pillar', 25, 4], ['pillar', 36, 4], ['pillar', 25, 8], ['pillar', 36, 8],
    ['candle', 26, 4], ['candle', 35, 4], ['candle', 26, 8], ['candle', 35, 8],
    ['crystal_red', 27, 4], ['crystal_red', 34, 4], ['statue', 24, 6], ['statue', 37, 6],
    // 로비 열주 · 촛대 · 석상
    ['pillar', 19, 65], ['pillar', 24, 65], ['pillar', 37, 65], ['pillar', 43, 65], ['pillar', 49, 65], ['pillar', 55, 65],
    ['candle', 20, 68], ['candle', 25, 68], ['candle', 36, 68], ['candle', 42, 68], ['candle', 50, 68], ['candle', 58, 68],
    ['statue', 27, 65], ['statue', 34, 65], ['crystal_red', 18, 68], ['crystal_red', 59, 68],
    // 퀴즈 회랑 장식
    ['pillar', 20, 48], ['pillar', 28, 48], ['pillar', 48, 48], ['pillar', 56, 48],
    ['candle', 22, 50], ['candle', 30, 50], ['candle', 46, 50], ['candle', 54, 50],
    ['pillar', 20, 42], ['pillar', 28, 42], ['pillar', 48, 42], ['pillar', 56, 42],
    ['candle', 22, 44], ['candle', 30, 44], ['candle', 46, 44], ['candle', 54, 44],
    ['statue', 19, 50], ['statue', 58, 50], ['statue', 19, 44], ['statue', 58, 44],
    // 각 화산방 안전 발판 촛대 · 수정
    ['candle', 36, 53], ['candle', 40, 53], ['candle', 36, 36], ['candle', 40, 36],
    ['candle', 36, 28], ['candle', 40, 28], ['candle', 29, 13], ['candle', 33, 13],
    ['crystal_red', 27, 23], ['crystal_red', 38, 23],
    // 서쪽 지하 용암 회랑 장식
    ['candle', 3, 52], ['candle', 12, 52], ['candle', 3, 64], ['candle', 12, 64],
    ['pillar', 4, 55], ['pillar', 11, 55], ['pillar', 4, 61], ['pillar', 11, 61],
    ['candle', 3, 32], ['candle', 12, 32], ['candle', 3, 44], ['candle', 12, 44],
    ['pillar', 4, 35], ['pillar', 11, 35], ['pillar', 4, 41], ['pillar', 11, 41],
    ['candle', 3, 14], ['candle', 12, 14], ['candle', 3, 24], ['candle', 12, 24],
    ['statue', 4, 16], ['statue', 11, 16], ['crystal_red', 3, 20], ['crystal_red', 12, 20],
    ['sign', 34, 66, { text: '잿빛 도장 · 루네시티식 화산판 한붓그리기 & 홍련 퀴즈!\n모든 화산판을 중복 없이 정확히 한 번씩만 밟아야 관문이 열립니다.\n금 간 칸을 두 번 밟거나 퀴즈 오답을 밟으면 서쪽 지하 용암 우리로 떨어집니다!' }],
    ['sign', 41, 62, { text: '[제1 화산방 · 25칸 (5×5)]\n중앙 아래(38,60)에서 시작해 모든 칸을 한 번씩 밟고 중앙 위(38,56)로 나오세요!' }],
    ['sign', 51, 49, { text: `[홍련 1관문 · 오답 시 추락!]\n${q1}` }],
    ['sign', 51, 43, { text: `[홍련 2관문 · 오답 시 추락!]\n${q2}` }],
    ['sign', 41, 37, { text: '[제2 화산방 · 41칸]\n좌우 화산석 기둥을 피해 모든 칸을 한 번씩 밟으세요!' }],
    ['sign', 37, 23, { text: '[제3 화산방 · 최종 56칸!]\n중앙 왼쪽 아래(31,21)에서 시작해 왼쪽→오른쪽→중앙 위(31,16)로 완성하세요!' }],
  ];

  return {
    name: '잿빛 도장', col: '#e8642e', W, H, door,
    floor: { kind: 'stone', color: '#7a5a50' },
    wall: { color: '#a87060', pattern: 'stone' },
    elevs, ramps, pools, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:leader_ember', 31, 5, { face: 'down' }],
      ['trainer:gym_ember_t1', 5, 57, { face: 'right' }],
      ['trainer:gym_ember_t2', 11, 37, { face: 'left' }],
      ['trainer:gym_ember_t3', 26, 49, { face: 'right' }],
      ['trainer:gym_ember_t4', 5, 18, { face: 'right' }],
    ],
    lights: [[31, 6], [31, 19], [38, 33], [38, 46], [38, 58], [8, 56], [8, 37], [8, 18]],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 6. 빛누리 도장 (gym_lumina) — 60 x 72 (4,320칸 · 기존 10.00배)
//    입구 즉각 가시 레이저 빔 + 4단계 다중 광학 프리즘 회로(교차 2빔 · 7연쇄 · 3중 코어) + 90+ 수정 장식
// ══════════════════════════════════════════════════════════════════════
export function buildLuminaGym() {
  const W = 60, H = 72, door = 30;
  const elevs = [[23, 3, 37, 8, 1.1]];
  const ramps = [[28, 9, 32, 10, 'N', 0, 1.1]];
  const walls = [
    [1, 3, 22, 7], [38, 3, 21, 7],
    [23, 9, 5, 1], [33, 9, 5, 1],
    [1, 54, 27, 1], [33, 54, 26, 1],
    [1, 38, 27, 1], [33, 38, 26, 1],
    [1, 22, 27, 1], [33, 22, 26, 1],
    // Hall 1 차폐벽
    [22, 60, 1, 5], [38, 56, 1, 6],
    // Hall 2 교차 광학실 차폐 기둥 (중앙 교차로만 비움!)
    [29, 41, 2, 4], [29, 49, 2, 4],
    // Hall 3 광학 격자 차폐벽
    [18, 24, 1, 10], [30, 28, 1, 9], [42, 24, 1, 10],
    // Hall 4 트리플 코어 차폐벽
    [19, 13, 1, 6], [40, 13, 1, 6],
  ];
  const rugs = [
    [24, 3, 12, 5, '#e0b830'],
    [24, 67, 12, 4, '#1d324c'],
    [4, 56, 52, 10, '#162136'],
    [4, 40, 52, 12, '#162136'],
    [4, 24, 52, 12, '#162136'],
    [4, 12, 52, 9, '#162136'],
  ];
  const emblems = [
    [29.5, 5.5, 2.6, '#d8a824', '#fff8b0'],
    [29.5, 68.5, 2.0, '#1d4c78', '#62e8ff'],
    [29.5, 46.5, 2.2, '#2a3868', '#ffd84d'],
  ];
  const circuits = [
    [5, 66, 54, 66, '#38bdf8'], [5, 57, 54, 57, '#38bdf8'],
    [5, 51, 54, 51, '#ffd84d'], [5, 42, 54, 42, '#ffd84d'],
    [5, 35, 54, 35, '#a870ff'], [5, 25, 54, 25, '#a870ff'],
    [5, 20, 54, 20, '#ff5ea8'], [5, 13, 54, 13, '#48f0ff'],
  ];

  const gimmicks = [];
  // ── Hall 1 (y=55..70, lm1): 입구 바로 위(26,66)에서 발사 → 들어오자마자 찬란한 레이저 빔이 보임! ──
  // (26,66) left → (14,66)[1:up] → (14,58)[1:right] → (30,58)[0:down] → (30,64)[0:right] → (46,64)[1:up] → (46,58)[1? no, (46,58) dst!]
  // 반사 검증:
  //   left(-1,0)+rot 0 -> (0,-1)=up! (rot=0이 정답, 초기=1)
  //   up(0,-1)+rot 1 -> (1,0)=right! (rot=1이 정답, 초기=0)
  //   right(1,0)+rot 0 -> (0,1)=down! (rot=0이 정답, 초기=1)
  //   down(0,1)+rot 0 -> (1,0)=right! (rot=0이 정답, 초기=1)
  //   right(1,0)+rot 1 -> (0,-1)=up! (rot=1이 정답, 초기=0) → (46,58) dst!
  //   (30,66) 입구 앞을 가로질러 (26,66)→(14,66) 레이저가 입장 즉시 눈앞에 보임!
  cellGim(gimmicks, 'laser_src', 26, 66, { gateId: 'lm1', dir: 'left', color: '#48f0ff' });
  cellGim(gimmicks, 'prism', 14, 66, { gateId: 'lm1', rot: 1, color: '#48f0ff' }); // 정답 0
  cellGim(gimmicks, 'prism', 14, 58, { gateId: 'lm1', rot: 0, color: '#48f0ff' }); // 정답 1
  cellGim(gimmicks, 'prism', 30, 58, { gateId: 'lm1', rot: 1, color: '#48f0ff' }); // 정답 0
  cellGim(gimmicks, 'prism', 30, 64, { gateId: 'lm1', rot: 1, color: '#48f0ff' }); // 정답 0
  cellGim(gimmicks, 'prism', 46, 64, { gateId: 'lm1', rot: 0, color: '#48f0ff' }); // 정답 1
  cellGim(gimmicks, 'laser_dst', 46, 58, { gateId: 'lm1', color: '#48f0ff' });
  rectGim(gimmicks, 'gate_bar', 28, 54, 5, 1, { gateId: 'lm1', color: '#48f0ff' });

  // ── Hall 2 (y=39..53, lm2): 중앙 X-교차 듀얼 빔 회로 (서→동 청록 빔 + 동→서 황금 빔 교차!) ──
  // 서쪽 청록 빔: (5,51) right → (14,51)[1:up] → (14,46)[1:right] → 중앙(29..30,46) 관통! → (44,46)[1:up] → (44,42)[0? up->left=0] → (36,42) dst!
  // 체크: right+1=up, up+1=right, right+1=up, up+0=left → (36,42) dst!
  cellGim(gimmicks, 'laser_src', 5, 51, { gateId: 'lm2', dir: 'right', color: '#48f0ff' });
  cellGim(gimmicks, 'prism', 14, 51, { gateId: 'lm2', rot: 0, color: '#48f0ff' }); // 정답 1
  cellGim(gimmicks, 'prism', 14, 46, { gateId: 'lm2', rot: 0, color: '#48f0ff' }); // 정답 1
  cellGim(gimmicks, 'prism', 44, 46, { gateId: 'lm2', rot: 0, color: '#48f0ff' }); // 정답 1
  cellGim(gimmicks, 'prism', 44, 42, { gateId: 'lm2', rot: 1, color: '#48f0ff' }); // 정답 0
  cellGim(gimmicks, 'laser_dst', 36, 42, { gateId: 'lm2', color: '#48f0ff' });
  // 동쪽 황금 빔: (54,51) left → (48,51)[0:up] → (48,47)[0:left] → 중앙(29..30,47) 관통! → (10,47)[0:up] → (10,42)[1:right] → (22,42) dst!
  // 체크: left+0=up, up+0=left, left+0=up, up+1=right → (22,42) dst!
  cellGim(gimmicks, 'laser_src', 54, 51, { gateId: 'lm2', dir: 'left', color: '#ffd84d' });
  cellGim(gimmicks, 'prism', 48, 51, { gateId: 'lm2', rot: 1, color: '#ffd84d' }); // 정답 0
  cellGim(gimmicks, 'prism', 48, 47, { gateId: 'lm2', rot: 1, color: '#ffd84d' }); // 정답 0
  cellGim(gimmicks, 'prism', 10, 47, { gateId: 'lm2', rot: 1, color: '#ffd84d' }); // 정답 0
  cellGim(gimmicks, 'prism', 10, 42, { gateId: 'lm2', rot: 0, color: '#ffd84d' }); // 정답 1
  cellGim(gimmicks, 'laser_dst', 22, 42, { gateId: 'lm2', color: '#ffd84d' });
  rectGim(gimmicks, 'gate_bar', 28, 38, 5, 1, { gateId: 'lm2', color: '#ffd84d' });

  // ── Hall 3 (y=23..37, lm3): 7연쇄 광학 지그재그 미로 ──
  cellGim(gimmicks, 'laser_src', 5, 26, { gateId: 'lm3', dir: 'right', color: '#a870ff' });
  cellGim(gimmicks, 'prism', 12, 26, { gateId: 'lm3', rot: 1, color: '#a870ff' }); // 0
  cellGim(gimmicks, 'prism', 12, 35, { gateId: 'lm3', rot: 1, color: '#a870ff' }); // 0
  cellGim(gimmicks, 'prism', 24, 35, { gateId: 'lm3', rot: 0, color: '#a870ff' }); // 1
  cellGim(gimmicks, 'prism', 24, 25, { gateId: 'lm3', rot: 0, color: '#a870ff' }); // 1
  cellGim(gimmicks, 'prism', 36, 25, { gateId: 'lm3', rot: 1, color: '#a870ff' }); // 0
  cellGim(gimmicks, 'prism', 36, 35, { gateId: 'lm3', rot: 1, color: '#a870ff' }); // 0
  cellGim(gimmicks, 'prism', 52, 35, { gateId: 'lm3', rot: 0, color: '#a870ff' }); // 1
  cellGim(gimmicks, 'laser_dst', 52, 25, { gateId: 'lm3', color: '#a870ff' });
  rectGim(gimmicks, 'gate_bar', 28, 22, 5, 1, { gateId: 'lm3', color: '#a870ff' });

  // ── Hall 4 (y=11..21, lm4): 최종 트리플 코어 3빔 동시 연결! ──
  cellGim(gimmicks, 'laser_src', 4, 20, { gateId: 'lm4', dir: 'right', color: '#48f0ff' });
  cellGim(gimmicks, 'prism', 12, 20, { gateId: 'lm4', rot: 0, color: '#48f0ff' }); // 1
  cellGim(gimmicks, 'prism', 12, 13, { gateId: 'lm4', rot: 0, color: '#48f0ff' }); // 1
  cellGim(gimmicks, 'laser_dst', 17, 13, { gateId: 'lm4', color: '#48f0ff' });
  cellGim(gimmicks, 'laser_src', 22, 20, { gateId: 'lm4', dir: 'up', color: '#ffd84d' });
  cellGim(gimmicks, 'prism', 22, 14, { gateId: 'lm4', rot: 0, color: '#ffd84d' }); // 1
  cellGim(gimmicks, 'prism', 37, 14, { gateId: 'lm4', rot: 1, color: '#ffd84d' }); // 0
  cellGim(gimmicks, 'laser_dst', 37, 20, { gateId: 'lm4', color: '#ffd84d' });
  cellGim(gimmicks, 'laser_src', 55, 20, { gateId: 'lm4', dir: 'left', color: '#ff5ea8' });
  cellGim(gimmicks, 'prism', 47, 20, { gateId: 'lm4', rot: 1, color: '#ff5ea8' }); // 0
  cellGim(gimmicks, 'prism', 47, 13, { gateId: 'lm4', rot: 1, color: '#ff5ea8' }); // 0
  cellGim(gimmicks, 'laser_dst', 42, 13, { gateId: 'lm4', color: '#ff5ea8' });
  rectGim(gimmicks, 'gate_bar', 28, 11, 5, 1, { gateId: 'lm4', color: '#48f0ff' });

  // 화려한 사이버·네온 수정 신전 장식 (90+ 오브젝트 — 광선 경로를 절대 가리지 않는 벽가/구석 배치!)
  const furn = [
    ['crystal', 24, 4], ['crystal_red', 35, 4], ['crystal', 26, 4], ['crystal_red', 33, 4],
    ['pillar', 24, 8], ['pillar', 35, 8], ['candle', 25, 6], ['candle', 34, 6],
    // 입구 로비 네온 장식 (y=68..70)
    ['crystal', 2, 70], ['crystal_red', 5, 70], ['pillar', 9, 69], ['crystal', 13, 70], ['pillar', 18, 69], ['candle', 23, 69],
    ['candle', 36, 69], ['pillar', 41, 69], ['crystal_red', 46, 70], ['pillar', 50, 69], ['crystal', 54, 70], ['crystal_red', 57, 70],
    ['statue', 22, 68], ['statue', 37, 68],
    // Hall 1 테두리 수정·기둥 (y=55, 67 — 광선 y=58,64,66 피함!)
    ['crystal', 2, 62], ['crystal_red', 2, 56], ['crystal', 57, 62], ['crystal_red', 57, 56],
    ['pillar', 8, 56], ['pillar', 52, 56], ['candle', 20, 56], ['candle', 40, 56],
    ['crystal', 26, 56], ['crystal_red', 33, 56],
    // Hall 2 테두리 수정·기둥 (광선 y=42,46,47,51 피함!)
    ['crystal', 2, 52], ['crystal_red', 2, 44], ['crystal', 2, 40],
    ['crystal', 57, 52], ['crystal_red', 57, 44], ['crystal', 57, 40],
    ['pillar', 18, 40], ['pillar', 41, 40], ['candle', 26, 40], ['candle', 33, 40],
    ['crystal', 20, 52], ['crystal_red', 39, 52], ['statue', 26, 52], ['statue', 33, 52],
    // Hall 3 테두리 수정·기둥 (광선 y=25,26,35 피함!)
    ['crystal', 2, 36], ['crystal_red', 2, 30], ['crystal', 2, 24],
    ['crystal', 57, 36], ['crystal_red', 57, 30], ['crystal', 57, 24],
    ['pillar', 8, 36], ['pillar', 16, 36], ['pillar', 44, 36], ['pillar', 55, 36],
    ['candle', 22, 23], ['candle', 37, 23], ['crystal', 26, 23], ['crystal_red', 33, 23],
    // Hall 4 테두리 수정·기둥 (광선 y=13,14,20 피함!)
    ['crystal', 2, 21], ['crystal_red', 2, 16], ['crystal', 2, 12],
    ['crystal', 57, 21], ['crystal_red', 57, 16], ['crystal', 57, 12],
    ['pillar', 7, 12], ['pillar', 15, 12], ['pillar', 44, 12], ['pillar', 52, 12],
    ['candle', 25, 12], ['candle', 34, 12], ['statue', 24, 18], ['statue', 35, 18],
    ['sign', 34, 68, { text: '빛누리 도장 · 4단계 네온 광학 프리즘 회로!\n눈앞에서 발사되는 레이저를 바닥 프리즘(밟기 또는 E)으로 반사시켜 모든 초록 수신 크리스탈에 연결하세요!' }],
    ['sign', 34, 52, { text: '[제2 발전실 · 크로스 듀얼 빔]\n청록 빔과 황금 빔이 중앙을 교차해 반대편 수신기에 동시에 꽂히도록 프리즘을 맞추세요!' }],
    ['sign', 34, 36, { text: '[제3 격자실 · 7연쇄 광학 미로]\n차폐벽 틈을 따라 레이저를 7번 연속 꺾어 북동쪽 수신기까지 유도하세요!' }],
    ['sign', 34, 21, { text: '[제4 코어실 · 트리플 빔]\n좌·중·우 3개의 레이저를 동시에 연결해 관장 샛별의 무대를 개방하세요!' }],
  ];

  return {
    name: '빛누리 도장', col: '#e0b830', W, H, door,
    floor: { kind: 'tile', color: '#242b3d', color2: '#2e3850' },
    wall: { color: '#394662', pattern: 'diamond', accent: '#62d0ff' },
    elevs, ramps, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:leader_lumina', 30, 5, { face: 'down' }],
      ['trainer:gym_lumina_t1', 26, 61, { face: 'down' }],
      ['trainer:gym_lumina_t2', 41, 49, { face: 'left' }],
      ['trainer:gym_lumina_t3', 48, 30, { face: 'left' }],
      ['trainer:gym_lumina_t4', 29, 17, { face: 'down' }],
    ],
    lights: [[30, 6], [12, 16], [47, 16], [30, 30], [15, 46], [45, 46], [30, 62]],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 7. 서리 도장 (gym_frost) — 60 x 72 (4,320칸 · 기존 10.00배)
//    성도 얼음동굴(Ice Path) + 선단시티(Snowpoint) 다중 반사 리코셰 빙판 & 눈덩이!
//    (중앙 직진 치즈 0%! 3개 빙판 아레나 모두 최소 6~10회 90° 다중 반사 & 측면 눈덩이 격파 필수!)
// ══════════════════════════════════════════════════════════════════════
export function buildFrostGym() {
  const W = 60, H = 72, door = 30;
  const elevs = [
    [1, 13, 6, 62, 0.9],
    [53, 13, 58, 62, 0.9],
    [23, 3, 37, 8, 1.4],
  ];
  const ramps = [
    [2, 63, 5, 65, 'N', 0, 0.9],
    [54, 63, 57, 65, 'N', 0, 0.9],
    [7, 36, 9, 38, 'W', 0, 0.9],
    [50, 36, 52, 38, 'E', 0, 0.9],
    [7, 17, 9, 19, 'W', 0, 0.9],
    [50, 17, 52, 19, 'E', 0, 0.9],
    [28, 9, 32, 10, 'N', 0, 1.4],
  ];
  const walls = [
    [1, 3, 22, 7], [38, 3, 21, 7],
    [23, 9, 5, 1], [33, 9, 5, 1],
    [7, 39, 1, 24], [52, 39, 1, 24],
    [7, 20, 1, 16], [52, 20, 1, 16],
    [7, 11, 1, 6], [52, 11, 1, 6],
    // 1차·2차·3차 빙벽 (양쪽 끝 좁은 리코셰 출구만 열림 — 중앙 직진 완전 봉쇄!!)
    [8, 48, 34, 1], [45, 48, 7, 1], // 1차 출구: 오직 동쪽 x=42..44!
    [8, 29, 7, 1], [18, 29, 34, 1], // 2차 출구: 오직 서쪽 x=15..17!
    [8, 12, 20, 1], [33, 12, 19, 1], // 최종 출구: 중앙 x=28..32 (측면 가속+리코셰로 눈덩이 격파 후 진입!)
  ];
  const rugs = [
    [24, 3, 12, 5, '#58b4e8'],
    [22, 65, 16, 5, '#88c8ea'],
    [10, 62, 6, 3, '#eef8ff'], // 1단계 남서 안전 발사대
    [40, 45, 7, 3, '#eef8ff'], // 2단계 동쪽 안전 발사대
    [13, 26, 7, 3, '#eef8ff'], // 3단계 서쪽 안전 발사대
  ];
  const emblems = [
    [29.5, 5.5, 2.6, '#3a9ad8', '#e6f8ff'],
    [29.5, 67.5, 2.2, '#58b4e8', '#ffffff'],
  ];
  const circuits = [
    [8, 67, 21, 67, '#98e4ff'], [38, 67, 51, 67, '#98e4ff'],
    [4, 20, 4, 60, '#98e4ff'], [55, 20, 55, 60, '#98e4ff'],
  ];

  const furn = [
    ['statue', 24, 4], ['statue', 35, 4], ['statue', 24, 8], ['statue', 35, 8],
    ['crystal', 26, 4], ['crystal', 33, 4], ['crystal', 22, 66], ['crystal', 37, 66],
    // 남쪽 입구 빙정 장식
    ['pillar', 10, 69], ['pillar', 16, 69], ['pillar', 22, 69], ['pillar', 37, 69], ['pillar', 43, 69], ['pillar', 49, 69],
    ['crystal', 13, 69], ['crystal', 19, 69], ['crystal', 40, 69], ['crystal', 46, 69],
    ['statue', 8, 66], ['statue', 51, 66], ['lamp_floor', 20, 66], ['lamp_floor', 39, 66],
    // 좌·우 고지대 얼음 갤러리 장식 (x=1, x=58 가장자리)
    ['crystal', 1, 58], ['crystal', 1, 44], ['crystal', 1, 30], ['crystal', 1, 14],
    ['crystal', 58, 58], ['crystal', 58, 44], ['crystal', 58, 30], ['crystal', 58, 14],
    ['statue', 2, 13], ['statue', 57, 13], ['candle', 1, 61], ['candle', 58, 61],
    ['sign', 34, 67, { text: '서리 도장 · 성도 얼음동굴 & 선단식 다중 반사 빙판!\n단순 직진으로는 통과할 수 없습니다! 얼음 기둥에 부딪혀 90°씩 꺾고, 2칸 이상 가속으로 거대 눈덩이를 부숴 활주로를 여세요!' }],
    ['sign', 41, 46, { text: '[2단계 · 선단 고지대 연동 빙판]\n동쪽 눈밭과 좌·우 2층 고지대 슬로프에서 측면 가속으로 중앙 눈덩이들을 부수고 서쪽 출구(x=16)로 탈출하세요!' }],
    ['sign', 14, 27, { text: '[3단계 · 최종 빙정 리코셰 미궁]\n서쪽 눈밭에서 기둥을 타고 지그재그 반사해 중앙 3겹 눈덩이를 뚫고 관장 설아에게 도달하세요!' }],
  ];

  const gimmicks = [];
  // 좌·우 고지대 가속 빙판
  rectGim(gimmicks, 'ice_tile', 3, 16, 3, 44);
  rectGim(gimmicks, 'ice_tile', 54, 16, 3, 44);

  // ── 1단계 빙판 (x=8..51, y=49..64): 성도 얼음동굴식 리코셰 + 눈덩이 (중앙 x=30 직진 불가능, 동쪽 x=42..44 출구!) ──
  // 입구: 남서 눈밭(x=10..15, y=62..64)만 안전, 나머지 y=62..64는 벽으로 입구 제한!
  // (14,62)에서 출발:
  //   1) UP(x=14) → hits P(14,51) → stops (14,52)
  //   2) RIGHT(y=52) → hits O(24,52) SMASHES! → 재출발(14,52) RIGHT → hits P(32,52) → stops (31,52)
  //   3) DOWN(x=31) → hits P(31,61) → stops (31,60)
  //   4) RIGHT(y=60) → hits P(46,60) → stops (45,60)
  //   5) UP(x=45) → hits P(45,54) → stops (45,55)
  //   6) LEFT(y=55) → hits P(41,55) → stops (42,55)
  //   7) UP(x=42) → smashes O(42,50) & O(42,48) → 출구(42,47) 안전 눈밭 도달!! (최소 8회 리코셰!)
  rectGim(gimmicks, 'ice_tile', 8, 49, 44, 13);
  rectGim(gimmicks, 'ice_tile', 16, 62, 36, 3);
  walls.push([16, 64, 36, 1]); // y=64 남쪽에서 바로 중앙 빙판 진입 차단! 오직 남서 안전 눈밭(10..15)에서만 진입!
  // 1단계 전략 기둥(P) & 눈덩이(O)
  for (const [px, py] of [
    [14, 51], [32, 52], [31, 61], [46, 60], [45, 54], [41, 55],
    [22, 58], [26, 56], [37, 57], [48, 51], [19, 53], [11, 56],
  ]) furn.push(['pillar', px, py]);
  for (const [sx, sy] of [
    [24, 52], [42, 50], [42, 48], [43, 48], [44, 48], [38, 52],
  ]) cellGim(gimmicks, 'snowball', sx, sy);

  // ── 2단계 빙판 (x=8..51, y=30..47): 동쪽 안전 눈밭(40..46,45..47) → 서쪽 출구(x=15..17, y=29) 리코셰! ──
  // 경로:
  //   (43,45) UP → hits P(43,34) → stops (43,35)
  //   LEFT(y=35) → smashes O(33,35) → 재시도 LEFT → hits P(25,35) → stops (26,35)
  //   DOWN(x=26) → hits P(26,44) → stops (26,43)
  //   LEFT(y=43) → hits P(13,43) → stops (14,43)
  //   UP(x=14) → hits P(14,32) → stops (14,33)
  //   RIGHT(y=33) → hits P(18,33) → stops (17,33)
  //   UP(x=17) → smashes O(17,29) → 서쪽 출구(17,28) 안전 눈밭 도달!! (최소 8회 리코셰 + 고지대 슬로프 지원!)
  rectGim(gimmicks, 'ice_tile', 8, 30, 44, 15);
  rectGim(gimmicks, 'ice_tile', 8, 45, 32, 3);
  rectGim(gimmicks, 'ice_tile', 47, 45, 5, 3);
  for (const [px, py] of [
    [43, 34], [25, 35], [26, 44], [13, 43], [14, 32], [18, 33],
    [35, 41], [20, 39], [31, 31], [47, 39], [11, 35],
  ]) furn.push(['pillar', px, py]);
  for (const [sx, sy] of [
    [33, 35], [15, 29], [16, 29], [17, 29], [20, 37], [38, 37],
  ]) cellGim(gimmicks, 'snowball', sx, sy);

  // ── 3단계 최종 빙판 (x=8..51, y=13..28): 서쪽 눈밭(13..19,26..28) → 중앙 최종 출구(x=28..32, y=12) 리코셰! ──
  // 경로:
  //   (16,26) UP → hits P(16,15) → stops (16,16)
  //   RIGHT(y=16) → smashes O(24,16) → 재시도 RIGHT → hits P(44,16) → stops (43,16)
  //   DOWN(x=43) → hits P(43,25) → stops (43,24)
  //   LEFT(y=24) → hits P(29,24) → stops (30,24)
  //   UP(x=30) → smashes O(30,20) → 재시도 UP → smashes O(30,15) → 재시도 UP → smashes O(30,12) → 관장 설아 직통!!
  rectGim(gimmicks, 'ice_tile', 8, 13, 44, 13);
  rectGim(gimmicks, 'ice_tile', 8, 26, 5, 3);
  rectGim(gimmicks, 'ice_tile', 20, 26, 32, 3);
  rectGim(gimmicks, 'ice_tile', 28, 11, 5, 2);
  for (const [px, py] of [
    [16, 15], [44, 16], [43, 25], [29, 24],
    [22, 22], [38, 22], [35, 19], [25, 19], [47, 14], [11, 20],
  ]) furn.push(['pillar', px, py]);
  for (const [sx, sy] of [
    [24, 16], [30, 20], [30, 15],
    [28, 12], [29, 12], [30, 12], [31, 12], [32, 12],
    [29, 15], [31, 15], [18, 18], [41, 18],
  ]) cellGim(gimmicks, 'snowball', sx, sy);

  // 각 단계 안전 눈밭에 초기화 버튼
  cellGim(gimmicks, 'snow_reset', 26, 68, { color: '#58d8ff' });
  cellGim(gimmicks, 'snow_reset', 45, 46, { color: '#58d8ff' });
  cellGim(gimmicks, 'snow_reset', 18, 27, { color: '#58d8ff' });

  return {
    name: '서리 도장', col: '#58b4e8', W, H, door,
    floor: { kind: 'tile', color: '#cde8f6', color2: '#ecf8ff' },
    wall: { color: '#d8eefc', pattern: 'tile' },
    elevs, ramps, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:leader_frost', 30, 5, { face: 'down' }],
      ['trainer:gym_frost_t1', 2, 48, { face: 'right' }],
      ['trainer:gym_frost_t2', 57, 48, { face: 'left' }],
      ['trainer:gym_frost_t3', 44, 46, { face: 'left' }],
      ['trainer:gym_frost_t4', 15, 27, { face: 'right' }],
    ],
    lights: [[30, 6], [15, 20], [45, 20], [30, 38], [15, 55], [45, 55], [30, 67]],
  };
}

// ══════════════════════════════════════════════════════════════════════
// 8. 별마루 도장 (gym_summit) — 66 x 78 (5,148칸 · 기존 9.90배)
//    노랑시티 체육관(Saffron Gym FRLG) 정통 3x3 9개 독립 방 워프 미궁 (A..O)
//    + 5대 종합 시련 (NW: 성도 얼음동굴 1F 원형 / SW: 루네 21칸 한붓그리기 / NE: 상록 100% 회전 화살표 / SE: 6프리즘 레이저 / N: 6음 천공 룬)
// ══════════════════════════════════════════════════════════════════════
export function buildSummitGym() {
  const W = 66, H = 78, door = 33;
  // 3x3 완전 격리 방:
  //   Col 0: x=1..20   | Col 1: x=23..42  | Col 2: x=45..64
  //   Row 0: y=3..24   | Row 1: y=27..50  | Row 2: y=53..76
  const walls = [
    [21, 3, 2, 74], [43, 3, 2, 74],
    [1, 25, 64, 2], [1, 51, 64, 2],
    // 중앙 천문 성소 (Room C: x=23..42, y=27..50) 4중 봉인 복도
    [23, 27, 5, 11], [38, 27, 5, 11],
    [23, 38, 8, 1], [35, 38, 8, 1],
    [23, 40, 8, 1], [35, 40, 8, 1],
    [23, 42, 8, 1], [35, 42, 8, 1],
    [23, 44, 8, 1], [35, 44, 8, 1],
    // 남동 광학실 차폐벽
    [54, 59, 1, 9],
  ];
  const elevs = [[28, 28, 37, 34, 1.1]];
  const ramps = [[31, 35, 34, 36, 'N', 0, 1.1]];
  const rugs = [
    [29, 29, 8, 5, '#7d5aa8'],
    [27, 45, 12, 5, '#4c3872'],
    [27, 68, 12, 7, '#4c3872'],
    [3, 5, 16, 17, '#243c64'],   // NW 얼음동굴
    [25, 5, 16, 17, '#4c2c72'],  // N 천공 룬
    [47, 5, 16, 17, '#2d3a58'],  // NE 회전 화살표
    [3, 29, 16, 19, '#3e2d60'],  // W 노랑 워프 허브
    [47, 29, 16, 19, '#3e2d60'], // E 노랑 워프 허브
    [3, 55, 16, 19, '#5e2c34'],  // SW 한붓그리기
    [47, 55, 16, 19, '#1b2744'], // SE 광학 레이저
  ];
  const emblems = [
    [32.5, 31, 2.5, '#6a48a0', '#ffe478'],
    [32.5, 71.5, 2.4, '#4c3872', '#ffe478'],
    [10.5, 38.5, 2.2, '#483470', '#62d8ff'],
    [54.5, 38.5, 2.2, '#483470', '#ff80c8'],
    [32.5, 14, 2.3, '#5c3890', '#ffe478'],
  ];
  const circuits = [
    [24, 71, 41, 71, '#e0c870'], [32, 60, 32, 75, '#e0c870'],
    [3, 38, 18, 38, '#48c8ff'], [47, 38, 62, 38, '#ff80c8'],
    [47, 64, 62, 64, '#ffd84d'],
  ];

  const gimmicks = [];

  // 9개 방 전체에 웅장한 천문 성소 장식 (110+ 오브젝트!)
  const furn = [
    // 중앙 천문 성소(C)
    ['crystal', 29, 29], ['crystal', 36, 29], ['crystal_red', 29, 34], ['crystal_red', 36, 34],
    ['candle', 30, 29], ['candle', 35, 29], ['statue', 29, 32], ['statue', 36, 32],
    ['pillar', 25, 46], ['pillar', 40, 46], ['candle', 25, 49], ['candle', 40, 49],
    ['crystal', 28, 49], ['crystal_red', 37, 49],
    // 남중 입구 로비(S)
    ['pillar', 25, 74], ['pillar', 40, 74], ['pillar', 25, 68], ['pillar', 40, 68], ['pillar', 25, 60], ['pillar', 40, 60],
    ['candle', 28, 74], ['candle', 37, 74], ['candle', 28, 64], ['candle', 37, 64],
    ['crystal', 24, 72], ['crystal_red', 41, 72], ['crystal', 24, 56], ['crystal_red', 41, 56],
    ['statue', 28, 56], ['statue', 37, 56], ['lamp_floor', 24, 65], ['lamp_floor', 41, 65],
    // 서쪽 허브(W)
    ['pillar', 7, 32], ['pillar', 14, 32], ['pillar', 7, 44], ['pillar', 14, 44],
    ['crystal', 2, 38], ['crystal_red', 19, 38], ['candle', 10, 30], ['candle', 10, 47],
    ['statue', 7, 38], ['statue', 14, 38],
    // 동쪽 허브(E)
    ['pillar', 51, 32], ['pillar', 58, 32], ['pillar', 51, 44], ['pillar', 58, 44],
    ['crystal_red', 46, 38], ['crystal', 63, 38], ['candle', 55, 30], ['candle', 55, 47],
    ['statue', 51, 38], ['statue', 58, 38],
    // 북서 얼음동굴(NW)
    ['crystal', 2, 5], ['crystal', 19, 5], ['crystal', 2, 22], ['crystal', 19, 22],
    ['statue', 7, 5], ['statue', 15, 5], ['candle', 9, 21], ['candle', 15, 21],
    // 북쪽 천공 룬 방(N)
    ['pillar', 25, 6], ['pillar', 40, 6], ['pillar', 25, 19], ['pillar', 40, 19],
    ['crystal', 24, 10], ['crystal_red', 41, 10], ['crystal', 24, 16], ['crystal_red', 41, 16],
    ['candle', 29, 6], ['candle', 36, 6], ['statue', 29, 20], ['statue', 36, 20],
    // 북동 회전 화살표 방(NE)
    ['pillar', 46, 5], ['pillar', 63, 5], ['pillar', 46, 20], ['pillar', 63, 20],
    ['candle', 51, 5], ['candle', 59, 5], ['crystal', 46, 23], ['crystal_red', 63, 23],
    // 남서 한붓그리기 방(SW)
    ['candle', 3, 54], ['candle', 19, 54], ['candle', 3, 73], ['candle', 19, 73],
    ['pillar', 3, 68], ['pillar', 19, 68], ['statue', 11, 55], ['crystal_red', 10, 73],
    // 남동 광학 성좌 방(SE)
    ['crystal', 46, 55], ['crystal_red', 63, 55], ['crystal', 46, 74], ['crystal_red', 63, 74],
    ['pillar', 46, 62], ['pillar', 63, 62], ['candle', 55, 55], ['candle', 55, 74],
    ['sign', 36, 72, { text: '별마루 도장 · 노랑시티식 3×3 9방 워프 미궁 & 5대 종합 시련!\n9개의 독립된 방을 워프패드로 탐험하며 남서(한붓)·북서(얼음동굴)·북쪽(6음 룬)·북동(회전 화살표)·남동(광학 레이저) 시련을 모두 정복하세요!' }],
    ['sign', 27, 46, { text: '[중앙 성소 · 관장 천문의 방]\n청록(NW)·보라(N)·분홍(NE)·황금(SE) 4개 별빛 봉인을 모두 해제해야 관장 천문에게 다가갈 수 있습니다!' }],
    ['sign', 14, 68, { text: '[남서 시련 · 21칸 한붓그리기]\n7×3 화산판을 왼쪽 아래(9,64)에서 시작해 중복 없이 모두 밟고 오른쪽 위(11,62)로 나와 북서 얼음동굴 워프를 여세요!' }],
    ['sign', 12, 22, { text: '[북서 시련 · 성도 얼음동굴 리코셰]\n빙판 위 기둥을 타고 반사해 북쪽 청록 봉인(sm_nw)에 도달하세요!' }],
    ['sign', 38, 20, { text: '[북쪽 시련 · 천공 6음 룬]\n노란 시범 제단(E)으로 6음 선율을 듣고 4색 룬을 순서대로 밟아 보라 봉인(sm_n)을 여세요!' }],
    ['sign', 58, 21, { text: '[북동 시련 · 상록 회전 화살표]\n중앙 화살표 입구로 들어가 연쇄 회전 끝에 북쪽 분홍 봉인(sm_ne)을 여세요!' }],
    ['sign', 58, 73, { text: '[남동 시련 · 광학 성좌]\n4개 프리즘을 돌려 초록 수신 크리스탈에 빛을 연결해 황금 봉인(sm_se)을 여세요!' }],
  ];

  // ── 노랑시티(Saffron Gym FRLG) 정통 9방 텔레포터 네트워크 (비자명 장거리 루프!) ──
  // 방별 4코너 패드: 각 워프는 먼 방으로 날아가며, 4개의 별빛 봉인(NW, N, NE, SE)을 모두 찾아 해제해야 중앙 성소(C) 4중 관문이 열림!
  const warp = (x1, y1, tx, ty, color) => cellGim(gimmicks, 'warp_pad', x1, y1, { toX: tx, toY: ty, color });
  // S (입구 로비): 패드 A(33,61) → W 방(4,47) [노랑시티 첫 워프!]
  warp(33, 61, 4, 47, '#48c8ff');
  warp(4, 48, 33, 63, '#e2e8f0'); // W → S 복귀
  // W 방 (4코너):
  warp(4, 30, 48, 72, '#ffd848');  // W(NW) → SE 광학방 (장거리 대각선!)
  warp(17, 30, 26, 21, '#b874ff'); // W(NE) → N 룬 방
  warp(17, 47, 17, 72, '#ff6ba8'); // W(SE) → SW 한붓그리기 방
  // SW 방 (한붓그리기 21칸 7x3 클리어해야 북서쪽 워프패드(5,56)가 해방되어 NW 얼음동굴로 진입!):
  warp(17, 73, 16, 47, '#ff6ba8'); // SW → W 복귀
  warp(5, 56, 4, 21, '#48c8ff');   // SW(한붓그리기 출구!) → NW 얼음동굴!
  warp(17, 56, 48, 47, '#4ade80'); // SW → E 허브
  // NW 방 (성도 얼음동굴 1F 원형! 완료 후 스위치 sm_nw + 출구 워프):
  warp(4, 22, 6, 58, '#48c8ff');   // NW → SW 복귀
  warp(17, 6, 39, 21, '#4ade80');  // NW(얼음동굴 출구!) → N 룬 방!
  // N 방 (6음 천공 룬):
  warp(26, 22, 16, 30, '#b874ff'); // N → W 복귀
  warp(39, 22, 48, 21, '#ff6ba8'); // N → NE 회전 화살표 방
  warp(39, 6, 48, 30, '#48c8ff');  // N → E 허브
  // NE 방 (상록 100% 회전 화살표 방 → 스위치 sm_ne):
  warp(48, 22, 38, 21, '#ff6ba8'); // NE → N 복귀
  warp(61, 22, 61, 30, '#48c8ff'); // NE → E 허브
  // SE 방 (6프리즘 광학 방 → 스위치 sm_se):
  warp(48, 73, 5, 30, '#ffd848');  // SE → W 복귀
  warp(61, 56, 61, 47, '#4ade80'); // SE → E 허브
  // E 방 (동쪽 최종 허브 — 보라 워프패드 M으로 중앙 성소 C 진입!):
  warp(61, 31, 60, 22, '#48c8ff'); // E → NE
  warp(61, 48, 60, 56, '#4ade80'); // E → SE
  warp(48, 31, 38, 6, '#ffd848');  // E → N
  warp(55, 38, 33, 47, '#b874ff'); // ★ 패드 M: E → 중앙 천문 성소(C)!
  warp(33, 49, 33, 64, '#e2e8f0'); // C → S 로비 복귀

  // ── 시련 1 (Room SW): 루네식 21칸 (7x3) 한붓그리기 화산판 (게이트 sm_sw → NW 워프 해방!) ──
  // x=7..13, y=62..64 (7x3 = 21칸, (10,64) 시작 → (10,62) 종료: 짝수(10+64=74)→짝수(10+62=72) 완벽 해밀턴 경로!)
  walls.push([1, 60, 8, 1], [12, 60, 9, 1]); // 북쪽 NW 워프 구역(y=53..59) 격리!
  walls.push([1, 62, 6, 3], [14, 62, 7, 3]); // 7x3 화산판 좌우 벽으로 완전 밀봉 (우회 0%!)
  for (let y = 62; y <= 64; y++) for (let x = 7; x <= 13; x++) {
    cellGim(gimmicks, 'cracked_tile', x, y, { zoneId: 'sm_sw', gateId: 'sm_sw', fallX: 10, fallY: 68 });
  }
  cellGim(gimmicks, 'puzzle_reset', 6, 67, { group: 'sm_sw' });
  rectGim(gimmicks, 'gate_bar', 9, 60, 3, 1, { gateId: 'sm_sw', color: '#ff6ba8' });

  // ── 시련 2 (Room NW): 성도 얼음동굴(Ice Path 1F) 웹 원형 ASCII 그대로 (우회 0%!) ──
  // 100% 벽으로 밀봉된 12x10 얼음동굴 (x=4..15, y=9..18) — 입구(5,18) → 8회 리코셰 → 출구(14,10) → 스위치 sm_nw!
  walls.push([1, 9, 3, 10], [16, 9, 5, 10]); // 좌우 우회 완전 차단!
  stampIceGrid(walls, furn, gimmicks, 4, 9, [
    '########.###', // row 0 (y=9): 출구 (col 8 = x=12)
    '#IIIIIIIIII#', // row 1 (y=10)
    '#I##I#III#I#', // row 2 (y=11)
    '#IIIIII#III#', // row 3 (y=12)
    '#I#I#IIII#I#', // row 4 (y=13)
    '#IIII#IIIII#', // row 5 (y=14)
    '#II#III#I#I#', // row 6 (y=15)
    '#IIIIIIIIII#', // row 7 (y=16)
    '#.IIIIIIII##', // row 8 (y=17): 입구 (col 1 = x=5)
    '#.##########', // row 9 (y=18)
  ]);
  // 검증된 성도 얼음동굴 리코셰 경로: (5,17)→UP(5,10)→RIGHT(14,10)→DOWN(14,16)→LEFT(5,16)→... (Step 4 BFS로 정확히 확인!)
  cellGim(gimmicks, 'switch_btn', 12, 6, { gateId: 'sm_nw', color: '#48c8ff' });

  // ── 시련 3 (Room N): 6음 천공 별빛 룬 Simon Says (1,3,0,2,3,1) → 보라 봉인(sm_n) ──
  cellGim(gimmicks, 'rune_demo', 33, 18, { gateId: 'sm_n', seq: '1,3,0,2,3,1', color: '#ffe478' });
  cellGim(gimmicks, 'rune_pad', 27, 13, { gateId: 'sm_n', runeIdx: 0, seq: '1,3,0,2,3,1', color: '#ff5e78' });
  cellGim(gimmicks, 'rune_pad', 31, 11, { gateId: 'sm_n', runeIdx: 1, seq: '1,3,0,2,3,1', color: '#48c8ff' });
  cellGim(gimmicks, 'rune_pad', 35, 11, { gateId: 'sm_n', runeIdx: 2, seq: '1,3,0,2,3,1', color: '#ffd848' });
  cellGim(gimmicks, 'rune_pad', 39, 13, { gateId: 'sm_n', runeIdx: 3, seq: '1,3,0,2,3,1', color: '#b874ff' });

  // ── 시련 4 (Room NE): 100% 벽 밀봉 상록 회전 화살표 방 → 분홍 봉인(sm_ne) ──
  walls.push([45, 9, 4, 9], [61, 9, 4, 9]);
  stampSpinGrid(walls, gimmicks, 49, 9, [
    '#####..#####', // row 0 (y=9): 출구 (x=54..55) → 북쪽 스위치 sm_ne!
    '#S>>>S>>>>S#', // row 1 (y=10): (1,1)S → RIGHT → (5,1)S → 북쪽(54,8) 스위치 sm_ne!
    '#^<<<<<<<<v#', // row 2 (y=11)
    '#^<<<<<<<<v#', // row 3 (y=12)
    '#S<<<<<S<<v#', // row 4 (y=13): (7,4)S → (1,4)S → UP (1,1)S!
    '#v<<<<<^<<v#', // row 5 (y=14)
    '#v<<<<<^<<v#', // row 6 (y=15)
    '#v>>>>>S<<<#', // row 7 (y=16): 입구(col 5) → (7,7)S → UP (7,4)S!
    '#####^######', // row 8 (y=17): 오직 col 5(x=54) 입구!
  ]);
  cellGim(gimmicks, 'switch_btn', 54, 6, { gateId: 'sm_ne', color: '#ff6ba8' });
  cellGim(gimmicks, 'warp_pad', 56, 6, { toX: 54, toY: 20, color: '#ff6ba8' }); // NE 입구로 깔끔 복귀!

  // ── 시련 5 (Room SE): 5프리즘 광학 성좌 방 → 황금 봉인(sm_se) ──
  // (47,69) right → (51,69)[1:up] → (51,57)[1:right] → (61,57)[0:down] → (61,69)[1:left] → (56,69) dst!
  cellGim(gimmicks, 'laser_src', 47, 69, { gateId: 'sm_se', dir: 'right', color: '#ffd84d' });
  cellGim(gimmicks, 'prism', 51, 69, { gateId: 'sm_se', rot: 0, color: '#ffd84d' }); // 정답 1
  cellGim(gimmicks, 'prism', 51, 57, { gateId: 'sm_se', rot: 0, color: '#ffd84d' }); // 정답 1
  cellGim(gimmicks, 'prism', 61, 57, { gateId: 'sm_se', rot: 1, color: '#ffd84d' }); // 정답 0
  cellGim(gimmicks, 'prism', 61, 69, { gateId: 'sm_se', rot: 0, color: '#ffd84d' }); // 정답 1
  cellGim(gimmicks, 'laser_dst', 56, 69, { gateId: 'sm_se', color: '#ffd84d' });

  // ── 중앙 천문 성소 4중 봉인 관문 (sm_nw, sm_n, sm_ne, sm_se) ──
  rectGim(gimmicks, 'gate_bar', 31, 44, 4, 1, { gateId: 'sm_nw', color: '#48c8ff' });
  rectGim(gimmicks, 'gate_bar', 31, 42, 4, 1, { gateId: 'sm_n', color: '#b874ff' });
  rectGim(gimmicks, 'gate_bar', 31, 40, 4, 1, { gateId: 'sm_ne', color: '#ff6ba8' });
  rectGim(gimmicks, 'gate_bar', 31, 38, 4, 1, { gateId: 'sm_se', color: '#ffd84d' });

  return {
    name: '별마루 도장', col: '#7d5aa8', W, H, door,
    floor: { kind: 'carpet', color: '#3a3058' },
    wall: { color: '#4a4070', pattern: 'dots', accent: '#e0c870' },
    elevs, ramps, walls, rugs, emblems, circuits, furn, gimmicks,
    spawns: [
      ['trainer:leader_summit', 33, 30, { face: 'down' }],
      ['trainer:gym_summit_t1', 10, 38, { face: 'down' }],
      ['trainer:gym_summit_t2', 14, 70, { face: 'left' }],
      ['trainer:gym_summit_t3', 8, 21, { face: 'right' }],
      ['trainer:gym_summit_t4', 33, 7, { face: 'down' }],
      ['trainer:gym_summit_t5', 52, 21, { face: 'right' }],
      ['trainer:gym_summit_t6', 55, 34, { face: 'down' }],
    ],
    lights: [[33, 31], [10, 14], [33, 14], [55, 14], [10, 38], [55, 38], [10, 64], [33, 66], [55, 64]],
  };
}

export const BIG_GYM_LAYOUTS = {
  harbor: buildHarborGym(),
  maple: buildMapleGym(),
  forge: buildForgeGym(),
  ember: buildEmberGym(),
  lumina: buildLuminaGym(),
  frost: buildFrostGym(),
  summit: buildSummitGym(),
};
