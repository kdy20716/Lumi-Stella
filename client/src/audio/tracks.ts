// 배경음악 악보 — 전부 이 게임을 위해 새로 쓴 곡 (기존 게임 음악의 멜로디를 옮기지 않음)
// 표기: 음표 "D5:4" = 레(5옥타브) 16분음표 4칸, 쉼표 "-:4", 화음 "C5+E5:4", 마디 구분 "|" (무시됨)
// 반주는 chords(화음:칸수) 로부터 gen 패턴으로 자동 생성. 드럼은 마디당 16칸 문자열
//  k 킥 · s 스네어 · S 고스트 · h 하이햇 · o 열린햇 · t/T 탐 · c 심벌 · x 림
export type Inst = 'lead' | 'lead2' | 'pulse' | 'brass' | 'strings' | 'bass' | 'sbass' | 'bell' | 'flute' | 'pluck' | 'organ' | 'drum';
export interface Part { inst: Inst; seq?: string; gen?: 'bass-half' | 'bass-8' | 'bass-pump' | 'bass-walk' | 'bass-gallop' | 'arp16' | 'arp8' | 'pad' | 'stab' | 'offbeat'; oct?: number; vol?: number; pan?: number }
export interface Track { id: string; title: string; bpm: number; bars: number; chords?: string; parts: Part[]; drums?: string[]; once?: boolean; night?: boolean }

const T: Track[] = [
  {
    id: 'title', title: '별빛의 씨앗 (타이틀)', bpm: 132, bars: 8,
    chords: 'C:16 Em:16 F:16 G:16 Am:16 F:16 D:16 G:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'G4:4 C5:4 E5:6 D5:2 | E5:3 D5:1 E5:4 G5:6 E5:2 | F5:4 A5:4 C6:4 A5:4 | G5:10 D5:2 E5:2 F5:2 | E5:4 C5:4 A4:6 B4:2 | C5:4 A4:4 F5:6 E5:2 | D5:4 F#5:4 A5:4 F#5:4 | G5:6 F5:2 E5:4 D5:4' },
      { inst: 'brass', oct: -1, vol: 0.8, pan: 0.15, seq: 'G4:4 C5:4 E5:6 D5:2 | E5:3 D5:1 E5:4 G5:6 E5:2 | F5:4 A5:4 C6:4 A5:4 | G5:10 D5:2 E5:2 F5:2 | E5:4 C5:4 A4:6 B4:2 | C5:4 A4:4 F5:6 E5:2 | D5:4 F#5:4 A5:4 F#5:4 | G5:6 F5:2 E5:4 D5:4' },
      { inst: 'strings', gen: 'pad', pan: 0.2 },
      { inst: 'pulse', gen: 'arp16', vol: 0.6, pan: -0.3 },
      { inst: 'bass', gen: 'bass-8' },
    ],
    drums: ['c...s...k.k.s...', 'k...s...k.k.s..s', 'k...s...k.k.s...', 'k...s...k.k.ssss', 'c...s...k.k.s...', 'k...s...k.k.s..s', 'k...s...k.k.s...', 'k.s.s.s.ksssssss'],
  },
  {
    id: 'hometown', title: '별빛 마을', bpm: 92, bars: 8,
    chords: 'F:16 C:16 Dm:16 Bb:16 F:16 Bb:16 Gm:16 C:16',
    parts: [
      { inst: 'flute', pan: -0.1, seq: 'A4:4 C5:4 F5:6 E5:2 | D5:4 C5:4 G4:8 | A4:4 D5:4 F5:4 E5:4 | D5:6 C5:2 Bb4:8 | A4:4 C5:4 F5:4 A5:4 | G5:4 F5:4 D5:8 | Bb4:4 D5:4 G5:4 F5:2 E5:2 | E5:6 D5:2 C5:8' },
      { inst: 'bell', gen: 'arp8', oct: 0, vol: 0.45, pan: 0.35 },
      { inst: 'strings', gen: 'pad', vol: 0.6, pan: -0.2 },
      { inst: 'bass', gen: 'bass-half', vol: 0.9 },
    ],
    drums: ['k.....h.x.....h.', 'k.....h.x...k.h.'],
  },
  {
    id: 'town', title: '산들바람 마을', bpm: 112, bars: 8,
    chords: 'D:16 A:16 Bm:16 G:16 D:16 G:16 Em:16 A:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'F#5:2 A5:2 F#5:2 D5:2 E5:4 F#5:4 | E5:2 C#5:2 A4:4 B4:4 C#5:4 | D5:2 F#5:2 B5:4 A5:2 F#5:2 D5:4 | B4:4 D5:4 G5:6 F#5:2 | A5:4 F#5:2 A5:2 D6:4 C#6:2 B5:2 | B5:4 G5:4 D5:4 G5:4 | E5:2 G5:2 B5:4 A5:2 G5:2 F#5:2 E5:2 | C#5:4 E5:4 A5:8' },
      { inst: 'pulse', gen: 'arp8', vol: 0.8, pan: 0.35 },
      { inst: 'pluck', gen: 'offbeat', oct: -1, vol: 0.5, pan: -0.3 },
      { inst: 'bass', gen: 'bass-walk' },
    ],
    drums: ['k...s...k.k.s...', 'k.h.s.h.k.k.s.h.'],
  },
  {
    id: 'city', title: '빛누리 거리', bpm: 120, bars: 8,
    chords: 'Bbmaj7:16 Gm7:16 Cm7:16 F7:16 Dm7:16 G7:16 Cm7:16 F7:16',
    parts: [
      { inst: 'lead2', pan: -0.1, seq: 'D5:3 F5:3 A5:2 G5:4 F5:4 | Bb4:2 D5:2 F5:4 E5:2 F5:2 D5:4 | Eb5:3 G5:3 Bb5:2 A5:4 G5:4 | F5:2 Eb5:2 C5:4 A4:8 | A4:2 C5:2 F5:4 E5:2 D5:2 C5:4 | B4:2 D5:2 F5:4 G5:8 | G5:3 F5:3 Eb5:2 D5:4 C5:4 | A4:4 C5:4 Eb5:4 F5:4' },
      { inst: 'brass', gen: 'stab', oct: -1, vol: 0.55, pan: 0.3 },
      { inst: 'bass', gen: 'bass-walk' },
    ],
    drums: ['k..hs.hk.hhs.h.h', 'k..hs.hk.hhs.hoh'],
  },
  {
    id: 'snow', title: '서리 내린 마을', bpm: 84, bars: 8,
    chords: 'Am:16 F:16 C:16 G:16 Am:16 Dm:16 E:16 E:16',
    parts: [
      { inst: 'bell', pan: -0.15, seq: 'E5:4 A5:4 B5:2 C6:2 B5:4 | A5:8 F5:4 E5:4 | G5:4 E5:4 C5:4 D5:4 | B4:8 D5:8 | E5:4 A5:4 C6:4 B5:4 | A5:4 F5:4 D5:4 F5:4 | G#5:4 B5:4 E5:8 | E5:12 -:4' },
      { inst: 'flute', oct: -1, vol: 0.55, pan: 0.25, seq: '-:16 | C5:8 A4:8 | E5:8 G4:8 | D5:16 | -:16 | F5:8 D5:8 | B4:8 G#4:8 | B4:16' },
      { inst: 'pulse', gen: 'arp16', vol: 0.35, pan: 0.4 },
      { inst: 'strings', gen: 'pad', vol: 0.7 },
      { inst: 'bass', gen: 'bass-half', vol: 0.8 },
    ],
    drums: ['k.......x.......'],
  },
  {
    id: 'harbor', title: '물결항의 오후', bpm: 126, bars: 8,
    chords: 'G:16 C:16 D:16 G:16 Em:16 C:16 A7:16 D:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'D5:2 G5:2 -:2 B5:2 A5:2 G5:2 E5:4 | E5:2 G5:2 -:2 C6:2 B5:2 A5:2 G5:4 | F#5:2 A5:2 F#5:2 D5:2 E5:4 F#5:4 | G5:12 -:4 | B4:2 E5:2 G5:2 B5:2 A5:4 G5:4 | E5:2 G5:2 C6:4 B5:4 G5:4 | A5:4 G5:2 E5:2 C#5:4 E5:4 | D5:8 F#5:4 A5:4' },
      { inst: 'pluck', gen: 'arp8', vol: 0.7, pan: 0.35 },
      { inst: 'bass', gen: 'bass-pump' },
    ],
    drums: ['k.h.s.hkk.h.s.h.', 'k.h.s.hkk.h.s.ho'],
  },
  {
    id: 'route', title: '산들길을 따라', bpm: 144, bars: 8,
    chords: 'A:16 E:16 F#m:16 D:16 A:16 D:16 Bm:16 E:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'E5:4 A5:4 C#6:6 B5:2 | B5:4 G#5:2 E5:2 B4:8 | C#5:2 E5:2 F#5:4 A5:4 G#5:2 F#5:2 | F#5:6 E5:2 D5:8 | C#5:2 E5:2 A5:4 C#6:4 E6:4 | D6:4 C#6:2 B5:2 A5:4 F#5:4 | D5:4 F#5:4 B5:4 A5:2 G#5:2 | G#5:4 B5:4 E5:4 G#5:4' },
      { inst: 'brass', oct: -1, vol: 0.6, pan: 0.2, seq: '-:8 E5:4 C#5:4 | -:8 B4:8 | -:8 C#5:4 A4:4 | A4:16 | -:8 C#5:4 E5:4 | F#5:8 D5:8 | B4:8 D5:8 | E5:16' },
      { inst: 'strings', gen: 'pad', vol: 0.7, pan: -0.25 },
      { inst: 'pulse', gen: 'arp16', vol: 0.5, pan: 0.4 },
      { inst: 'bass', gen: 'bass-8' },
    ],
    drums: ['k.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hs'],
  },
  {
    id: 'route2', title: '먼 길의 바람', bpm: 150, bars: 8,
    chords: 'Dm:16 C:16 Bb:16 A:16 Dm:16 F:16 G:16 A:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'A4:2 D5:2 F5:2 A5:2 G5:4 F5:4 | E5:2 G5:2 C6:4 Bb5:4 A5:4 | F5:4 D5:4 Bb4:4 D5:4 | E5:6 C#5:2 A4:8 | D5:2 F5:2 A5:4 D6:4 C6:2 Bb5:2 | A5:4 F5:4 C5:4 F5:4 | G5:2 A5:2 B5:4 D6:4 B5:4 | C#6:4 A5:4 E5:4 C#5:4' },
      { inst: 'brass', gen: 'stab', oct: -1, vol: 0.5, pan: 0.3 },
      { inst: 'strings', gen: 'pad', vol: 0.6, pan: -0.3 },
      { inst: 'bass', gen: 'bass-gallop' },
    ],
    drums: ['k.h.s.hkk.h.s.h.', 'k.hks.h.k.hks.ss'],
  },
  {
    id: 'cave', title: '동굴 깊은 곳', bpm: 76, bars: 8,
    chords: 'Em:16 C:16 Am:16 B:16 Em:16 C:16 D:16 B:16',
    parts: [
      { inst: 'pulse', vol: 1.6, pan: -0.2, seq: 'E5:6 -:2 G5:4 F#5:4 | E5:8 -:8 | C5:6 -:2 E5:4 D5:4 | B4:8 D#5:8 | G5:6 -:2 B5:4 A5:4 | G5:8 E5:8 | F#5:4 A5:4 D5:8 | D#5:8 B4:8' },
      { inst: 'bell', oct: 1, vol: 0.25, pan: 0.5, seq: '-:12 B5:4 | -:16 | -:12 E5:4 | -:16 | -:12 D6:4 | -:16 | -:12 A5:4 | -:16' },
      { inst: 'strings', gen: 'pad', oct: -1, vol: 0.8 },
      { inst: 'sbass', gen: 'bass-half' },
    ],
    drums: ['k.......t.......', 'k.......t...T...'],
  },
  {
    id: 'mystic', title: '안개 속의 숲', bpm: 88, bars: 8,
    chords: 'Dm:16 C:16 Bb:16 C:16 Dm:16 Am:16 Bb:16 A:16',
    parts: [
      { inst: 'flute', pan: -0.15, seq: 'D5:4 E5:4 F5:4 A5:4 | G5:8 E5:4 C5:4 | D5:4 F5:4 Bb5:6 A5:2 | G5:12 -:4 | A5:4 G5:4 F5:4 E5:4 | C5:4 E5:4 A5:8 | Bb4:4 D5:4 F5:4 G5:4 | E5:4 C#5:4 A4:8' },
      { inst: 'bell', gen: 'arp16', vol: 0.3, pan: 0.4 },
      { inst: 'strings', gen: 'pad', vol: 0.7, pan: -0.3 },
      { inst: 'bass', gen: 'bass-half', vol: 0.7 },
    ],
    drums: ['........t.......', '....x.......t...'],
  },
  {
    id: 'legend', title: '태초의 메아리', bpm: 70, bars: 8,
    chords: 'Cm:16 Ab:16 Fm:16 G:16 Cm:16 Db:16 Fm:16 G:16',
    parts: [
      { inst: 'organ', pan: -0.1, seq: 'C5:8 Eb5:8 | G5:12 F5:4 | Ab5:8 G5:4 F5:4 | D5:16 | C6:8 Bb5:4 G5:4 | Ab5:8 F5:8 | Eb5:4 F5:4 Ab5:4 G5:4 | B4:8 D5:8' },
      { inst: 'strings', gen: 'pad', vol: 0.9, pan: 0.2 },
      { inst: 'bell', oct: 1, vol: 0.3, pan: 0.5, seq: '-:14 G5:2 | -:14 C6:2 | -:14 F5:2 | -:14 B5:2 | -:14 G5:2 | -:14 Ab5:2 | -:14 C6:2 | -:14 D6:2' },
      { inst: 'sbass', gen: 'bass-half', vol: 0.9 },
    ],
    drums: ['T...............', 'T.......t.......'],
  },
  {
    id: 'lab', title: '따뜻한 실내', bpm: 100, bars: 8,
    chords: 'G:16 Em7:16 Am7:16 D7:16 C:16 Bm7:16 Am7:16 D7:16',
    parts: [
      { inst: 'pluck', pan: -0.1, seq: 'B4:2 D5:2 G5:4 F#5:2 G5:2 A5:4 | G5:4 E5:4 B4:8 | C5:2 E5:2 A5:4 G5:2 A5:2 B5:4 | A5:4 F#5:4 D5:8 | E5:2 G5:2 C6:4 B5:4 G5:4 | F#5:4 D5:4 B4:8 | A4:2 C5:2 E5:4 D5:2 E5:2 F#5:4 | A5:8 F#5:8' },
      { inst: 'flute', oct: -1, vol: 0.45, pan: 0.3, seq: 'D5:16 | B4:16 | C5:16 | C5:16 | E5:16 | D5:16 | C5:16 | C5:16' },
      { inst: 'bass', gen: 'bass-walk', vol: 0.75 },
    ],
    drums: ['k...h...x...h...', 'k...h...x.h.h...'],
  },
  {
    id: 'center', title: '루미 센터', bpm: 104, bars: 8,
    chords: 'C:16 Am:16 F:16 G:16 C:16 Am:16 Dm:16 G:16',
    parts: [
      { inst: 'bell', pan: -0.1, seq: 'E5:4 G5:4 C6:8 | B5:4 A5:4 E5:8 | F5:4 A5:4 C6:4 A5:4 | G5:12 -:4 | E5:4 G5:4 C6:4 E6:4 | D6:4 C6:4 A5:8 | F5:4 A5:4 D6:4 C6:4 | B5:8 G5:8' },
      { inst: 'pluck', gen: 'arp8', vol: 0.6, pan: 0.35 },
      { inst: 'strings', gen: 'pad', vol: 0.5 },
      { inst: 'bass', gen: 'bass-half', vol: 0.8 },
    ],
    drums: ['k.......x.......'],
  },
  {
    id: 'gym', title: '도장의 긴장', bpm: 132, bars: 8,
    chords: 'Em:16 Em:16 C:16 D:16 Em:16 Em:16 C:16 B:16',
    parts: [
      { inst: 'brass', pan: -0.1, seq: 'E5:4 -:2 E5:2 G5:4 B5:4 | A5:2 G5:2 F#5:4 E5:8 | C5:4 -:2 C5:2 E5:4 G5:4 | F#5:4 E5:2 D5:2 A5:8 | B5:4 -:2 B5:2 C6:4 B5:4 | A5:2 G5:2 F#5:2 E5:2 G5:8 | E5:4 G5:4 C6:4 B5:4 | B5:8 D#5:8' },
      { inst: 'lead', oct: 1, vol: 0.35, pan: 0.3, seq: 'E5:4 -:2 E5:2 G5:4 B5:4 | A5:2 G5:2 F#5:4 E5:8 | C5:4 -:2 C5:2 E5:4 G5:4 | F#5:4 E5:2 D5:2 A5:8 | B5:4 -:2 B5:2 C6:4 B5:4 | A5:2 G5:2 F#5:2 E5:2 G5:8 | E5:4 G5:4 C6:4 B5:4 | B5:8 D#5:8' },
      { inst: 'strings', gen: 'pad', vol: 0.7, pan: -0.3 },
      { inst: 'bass', gen: 'bass-gallop' },
    ],
    drums: ['k...s...k...s.ss', 'k...s...k.k.s...', 'k...s...k...s.ss', 'k...s...ssssssss'],
  },
  // ── 맵 확장으로 늘어난 곡 ──
  {
    id: 'route_forest', title: '나뭇잎 사이 오솔길', bpm: 128, bars: 8,
    chords: 'G:16 Em:16 C:16 D:16 G:16 Bm:16 C:16 D:16',
    parts: [
      { inst: 'flute', pan: -0.1, seq: 'D5:4 G5:4 B5:6 A5:2 | G5:4 E5:4 D5:8 | E5:4 G5:4 C6:4 B5:4 | A5:6 G5:2 F#5:8 | D5:4 G5:4 B5:4 D6:4 | C6:4 B5:4 F#5:8 | E5:4 G5:4 C6:6 B5:2 | A5:4 F#5:4 G5:8' },
      { inst: 'pluck', gen: 'arp8', vol: 0.5, pan: 0.3 },
      { inst: 'strings', gen: 'pad', vol: 0.5, pan: -0.25 },
      { inst: 'bass', gen: 'bass-walk', vol: 0.85 },
    ],
    drums: ['k...h.h.s...h.h.', 'k...h.h.s...h.hh', 'k...h.h.s...h.h.', 'k...h.h.s..sh.h.', 'k...h.h.s...h.h.', 'k...h.h.s...h.hh', 'k...h.h.s...h.h.', 'k.h.s.h.k.h.ssss'],
  },
  {
    id: 'route_beach', title: '파도 소리 해변길', bpm: 138, bars: 8,
    chords: 'C:16 Am:16 F:16 G:16 C:16 Am:16 Dm:16 G:16',
    parts: [
      { inst: 'pluck', pan: -0.15, seq: 'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4 | A5:4 E5:4 C5:8 | F5:2 A5:2 C6:4 A5:2 F5:2 D5:4 | G5:6 F5:2 E5:4 D5:4 | E5:2 G5:2 C6:4 D6:4 E6:4 | C6:4 A5:4 E5:8 | D5:4 F5:4 A5:4 C6:4 | B5:6 A5:2 G5:8' },
      { inst: 'lead2', oct: -1, vol: 0.45, pan: 0.2, seq: 'E5:2 G5:2 C6:4 B5:2 G5:2 E5:4 | A5:4 E5:4 C5:8 | F5:2 A5:2 C6:4 A5:2 F5:2 D5:4 | G5:6 F5:2 E5:4 D5:4 | E5:2 G5:2 C6:4 D6:4 E6:4 | C6:4 A5:4 E5:8 | D5:4 F5:4 A5:4 C6:4 | B5:6 A5:2 G5:8' },
      { inst: 'organ', gen: 'offbeat', vol: 0.45, pan: 0.3 },
      { inst: 'bass', gen: 'bass-pump' },
    ],
    drums: ['k..hs..hk.k.s..h', 'k..hs..hk.k.s.oh', 'k..hs..hk.k.s..h', 'k..hs..hk.k.ssss', 'k..hs..hk.k.s..h', 'k..hs..hk.k.s.oh', 'k..hs..hk.k.s..h', 'c..hs..hk.s.s.ss'],
  },
  {
    id: 'route_snow', title: '눈발 날리는 고개', bpm: 112, bars: 8,
    chords: 'Dm:16 Bb:16 F:16 C:16 Dm:16 Gm:16 A:16 Dm:16',
    parts: [
      { inst: 'bell', pan: -0.1, seq: 'D5:4 F5:4 A5:8 | Bb5:4 A5:4 F5:8 | C5:4 F5:4 A5:4 C6:4 | G5:8 E5:8 | D5:4 F5:4 A5:4 D6:4 | Bb5:6 A5:2 G5:8 | A5:4 C#6:4 E6:4 C#6:4 | D6:12 -:4' },
      { inst: 'strings', oct: -1, vol: 0.55, pan: 0.2, seq: 'D5:4 F5:4 A5:8 | Bb5:4 A5:4 F5:8 | C5:4 F5:4 A5:4 C6:4 | G5:8 E5:8 | D5:4 F5:4 A5:4 D6:4 | Bb5:6 A5:2 G5:8 | A5:4 C#6:4 E6:4 C#6:4 | D6:12 -:4' },
      { inst: 'pulse', gen: 'arp16', vol: 0.35, pan: -0.3 },
      { inst: 'sbass', gen: 'bass-half', vol: 0.8 },
    ],
    drums: ['k.......s.......', 'k.......s...k...', 'k.......s.......', 'k.......s...k.s.', 'k.......s.......', 'k.......s...k...', 'k.......s.......', 'k...k...s.s.s.s.'],
  },
  {
    id: 'route_desert', title: '신기루 너머', bpm: 120, bars: 8,
    chords: 'Am:16 Bb:16 Am:16 G:16 F:16 E:16 Am:16 E:16',
    parts: [
      { inst: 'lead2', pan: -0.1, seq: 'A4:4 C5:2 B4:2 A4:8 | Bb4:4 D5:4 F5:6 E5:2 | A4:2 C5:2 E5:4 D5:4 C5:4 | B4:4 G4:4 D5:8 | C5:4 F5:4 A5:6 G5:2 | G#5:4 E5:4 B4:8 | A4:4 C5:4 E5:4 A5:4 | G#5:8 E5:8' },
      { inst: 'pluck', gen: 'arp16', vol: 0.4, pan: 0.3 },
      { inst: 'strings', gen: 'pad', vol: 0.45, pan: -0.2 },
      { inst: 'bass', gen: 'bass-gallop', vol: 0.8 },
    ],
    drums: ['k..t..t.s..t.t..', 'k..t..t.s..t.tt.', 'k..t..t.s..t.t..', 'k..t..t.s.TtTt..', 'k..t..t.s..t.t..', 'k..t..t.s..t.tt.', 'k..t..t.s..t.t..', 'k.TtTtT.sTsTsTss'],
  },
  {
    id: 'island', title: '등대 너머 리그 섬', bpm: 116, bars: 8,
    chords: 'Eb:16 Bb:16 Cm:16 Ab:16 Eb:16 Bb:16 Ab:16 Bb:16',
    parts: [
      { inst: 'brass', pan: -0.1, seq: 'Bb4:4 Eb5:4 G5:6 F5:2 | F5:4 D5:4 Bb4:8 | C5:4 Eb5:4 G5:4 C6:4 | Ab5:8 G5:4 F5:4 | Eb5:4 G5:4 Bb5:6 Ab5:2 | G5:4 F5:4 D5:8 | C5:4 Eb5:4 Ab5:4 C6:4 | Bb5:12 -:4' },
      { inst: 'strings', gen: 'pad', vol: 0.6, pan: 0.2 },
      { inst: 'bell', gen: 'arp8', vol: 0.35, pan: -0.3 },
      { inst: 'bass', gen: 'bass-8', vol: 0.85 },
    ],
    drums: ['c...s...k.k.s...', 'k...s...k.k.s..s', 'k...s...k.k.s...', 'k...s...k.k.ssss', 'c...s...k.k.s...', 'k...s...k.k.s..s', 'k...s...k.k.s...', 'k.s.s.s.ksssssss'],
  },
  {
    id: 'inn', title: '포근한 숙소의 밤', bpm: 84, bars: 8,
    chords: 'F:16 Dm:16 Bb:16 C:16 F:16 Am:16 Bb:16 C:16',
    parts: [
      { inst: 'flute', pan: -0.1, seq: 'C5:6 A4:2 F5:8 | E5:4 D5:4 A4:8 | D5:4 F5:4 Bb5:6 A5:2 | G5:8 E5:8 | F5:4 A5:4 C6:8 | A5:4 G5:4 E5:8 | D5:4 F5:4 G5:4 Bb5:4 | A5:4 G5:4 F5:8' },
      { inst: 'pluck', gen: 'arp8', vol: 0.4, pan: 0.3 },
      { inst: 'strings', gen: 'pad', vol: 0.5, pan: -0.2 },
      { inst: 'bass', gen: 'bass-half', vol: 0.7 },
    ],
  },
  {
    id: 'challenge', title: '승리의 길', bpm: 140, bars: 8,
    chords: 'Em:16 C:16 D:16 B:16 Em:16 C:16 Am:16 B7:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'E5:4 G5:4 B5:6 A5:2 | G5:4 E5:4 C5:8 | D5:4 F#5:4 A5:4 D6:4 | D#6:8 B5:8 | E5:4 G5:4 B5:4 E6:4 | E6:4 C6:4 G5:8 | A5:4 C6:4 E6:4 C6:4 | B5:6 A5:2 F#5:4 D#5:4' },
      { inst: 'brass', oct: -1, vol: 0.7, pan: 0.2, seq: 'E5:4 G5:4 B5:6 A5:2 | G5:4 E5:4 C5:8 | D5:4 F#5:4 A5:4 D6:4 | D#6:8 B5:8 | E5:4 G5:4 B5:4 E6:4 | E6:4 C6:4 G5:8 | A5:4 C6:4 E6:4 C6:4 | B5:6 A5:2 F#5:4 D#5:4' },
      { inst: 'pulse', gen: 'arp16', vol: 0.45, pan: -0.3 },
      { inst: 'bass', gen: 'bass-gallop' },
    ],
    drums: ['k.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hs', 'k.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.ssss', 'c.h.s.h.k.k.s.h.', 'k.h.s.h.k.k.s.hs', 'k.h.s.h.k.k.s.h.', 'k.s.s.s.kssssTTT'],
  },
  {
    id: 'battle_wild', title: '배틀! 야생 루미', bpm: 168, bars: 8,
    chords: 'Am:16 Am:16 F:16 G:16 Am:16 Am:16 F:16 E:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'A5:2 A5:1 A5:1 G5:2 A5:2 C6:4 B5:4 | A5:2 E5:2 -:2 C5:2 E5:4 G5:4 | F5:2 A5:2 C6:2 A5:2 F5:4 E5:4 | D5:2 G5:2 B5:4 D6:4 B5:4 | C6:2 B5:2 A5:2 E5:2 A5:4 C6:4 | E6:4 D6:2 C6:2 B5:4 A5:4 | A5:2 C6:2 F6:4 E6:2 D6:2 C6:4 | B5:4 G#5:4 E5:4 B5:4' },
      { inst: 'brass', oct: -1, vol: 0.55, pan: 0.2, seq: 'A5:2 A5:1 A5:1 G5:2 A5:2 C6:4 B5:4 | A5:2 E5:2 -:2 C5:2 E5:4 G5:4 | F5:2 A5:2 C6:2 A5:2 F5:4 E5:4 | D5:2 G5:2 B5:4 D6:4 B5:4 | C6:2 B5:2 A5:2 E5:2 A5:4 C6:4 | E6:4 D6:2 C6:2 B5:4 A5:4 | A5:2 C6:2 F6:4 E6:2 D6:2 C6:4 | B5:4 G#5:4 E5:4 B5:4' },
      { inst: 'pulse', gen: 'arp16', vol: 0.55, pan: 0.45 },
      { inst: 'sbass', gen: 'bass-gallop', vol: 1.1 },
    ],
    drums: ['k.h.s.h.k.k.s.hs', 'k.hks.h.k.k.s.h.', 'k.h.s.h.k.k.s.hs', 'k.hks.h.k.ksssss'],
    night: false,
  },
  {
    id: 'battle_trainer', title: '배틀! 트레이너', bpm: 172, bars: 8,
    chords: 'Dm:16 Dm:16 Bb:16 C:16 Dm:16 Gm:16 Bb:16 A:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:4 | G5:2 A5:2 F5:2 D5:2 E5:4 F5:4 | D6:4 Bb5:2 F5:2 D5:4 F5:4 | E5:2 G5:2 C6:2 E6:2 D6:4 C6:4 | A5:2 D6:2 F6:4 E6:2 D6:2 A5:4 | G5:2 Bb5:2 D6:4 C6:2 Bb5:2 G5:4 | F5:2 Bb5:2 D6:2 F6:2 E6:4 D6:4 | C#6:4 A5:4 E5:4 C#6:4' },
      { inst: 'brass', gen: 'stab', oct: -1, vol: 0.5, pan: 0.3 },
      { inst: 'strings', gen: 'pad', vol: 0.6, pan: -0.3 },
      { inst: 'sbass', gen: 'bass-gallop', vol: 1.1 },
    ],
    drums: ['k.h.s.hkk.h.s.h.', 'k.hks.hkk.h.s.hs', 'k.h.s.hkk.h.s.h.', 'kkhks.hkk.ssssss'],
    night: false,
  },
  {
    id: 'battle_leader', title: '배틀! 도장 관장', bpm: 176, bars: 8,
    chords: 'Em:16 C:16 D:16 B:16 Em:16 C:16 Am:16 B7:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'B5:4 E6:4 D6:2 B5:2 G5:4 | E5:2 G5:2 C6:4 B5:4 G5:4 | F#5:2 A5:2 D6:4 C6:2 A5:2 F#5:4 | D#6:8 B5:8 | E6:2 D6:2 B5:2 G5:2 E5:4 G5:4 | C6:2 B5:2 G5:2 E5:2 G5:4 C6:4 | A5:2 C6:2 E6:4 D6:2 C6:2 A5:4 | B5:4 D#6:4 F#6:4 D#6:4' },
      { inst: 'brass', gen: 'stab', oct: -1, vol: 0.7, pan: 0.25 },
      { inst: 'strings', oct: -1, vol: 0.8, pan: -0.3, seq: 'E5:16 | E5:16 | F#5:16 | F#5:16 | G5:16 | G5:16 | A5:16 | B5:16' },
      { inst: 'pulse', gen: 'arp16', vol: 0.45, pan: 0.45 },
      { inst: 'sbass', gen: 'bass-gallop', vol: 1.15 },
    ],
    drums: ['c.h.s.hkk.hks.h.', 'k.hks.hkk.h.s.hs', 'k.h.s.hkk.hks.h.', 'k.hks.hkkssssssc'],
    night: false,
  },
  {
    id: 'battle_champion', title: '배틀! 루미 리그', bpm: 184, bars: 8,
    chords: 'Gm:16 Eb:16 F:16 D:16 Gm:16 Eb:16 Cm:16 D:16',
    parts: [
      { inst: 'lead', oct: -1, pan: -0.1, seq: 'G5:2 Bb5:2 D6:2 G6:2 F6:4 D6:4 | Eb6:4 D6:2 C6:2 Bb5:4 G5:4 | A5:2 C6:2 F6:4 Eb6:2 D6:2 C6:4 | D6:6 C6:2 A5:8 | Bb5:2 D6:2 G6:4 A6:2 G6:2 F6:4 | G6:4 Eb6:4 Bb5:4 G5:4 | C6:2 Eb6:2 G6:4 F6:2 Eb6:2 C6:4 | F#6:4 D6:4 A5:4 F#5:4' },
      { inst: 'brass', oct: -2, vol: 0.8, pan: 0.2, seq: 'G5:2 Bb5:2 D6:2 G6:2 F6:4 D6:4 | Eb6:4 D6:2 C6:2 Bb5:4 G5:4 | A5:2 C6:2 F6:4 Eb6:2 D6:2 C6:4 | D6:6 C6:2 A5:8 | Bb5:2 D6:2 G6:4 A6:2 G6:2 F6:4 | G6:4 Eb6:4 Bb5:4 G5:4 | C6:2 Eb6:2 G6:4 F6:2 Eb6:2 C6:4 | F#6:4 D6:4 A5:4 F#5:4' },
      { inst: 'strings', gen: 'pad', vol: 0.8, pan: -0.3 },
      { inst: 'pulse', gen: 'arp16', vol: 0.5, pan: 0.45 },
      { inst: 'sbass', gen: 'bass-gallop', vol: 1.2 },
    ],
    drums: ['c.hks.hkk.hks.hs', 'k.hks.hkk.hks.hs', 'k.hks.hkk.hks.hs', 'kkhks.hkksssssss'],
    night: false,
  },
  {
    id: 'victory', title: '승리!', bpm: 120, bars: 8,
    chords: 'C:16 F:16 G:16 C:16 Am:16 F:16 G:16 G:16',
    parts: [
      { inst: 'lead', pan: -0.1, seq: 'G4:2 C5:2 E5:2 G5:2 C6:8 | A5:4 C6:4 F5:8 | G5:4 B5:4 D6:4 B5:4 | C6:12 -:4 | E5:4 A5:4 C6:4 A5:4 | F5:4 A5:4 C6:8 | D6:4 B5:4 G5:4 B5:4 | D6:8 -:8' },
      { inst: 'brass', gen: 'stab', oct: -1, vol: 0.5, pan: 0.3 },
      { inst: 'bass', gen: 'bass-8' },
    ],
    drums: ['c...s...k.k.s...', 'k...s...k.k.s...'],
    night: false,
  },
  // ── 짧은 곡 (한 번만) ──
  {
    id: 'jingle_heal', title: '회복 완료', bpm: 120, bars: 2, once: true,
    chords: 'C:8 G:8 C:16',
    parts: [
      { inst: 'bell', seq: 'C5:2 E5:2 G5:2 C6:2 B5:2 G5:2 D6:4 | C6:8 -:8' },
      { inst: 'pluck', oct: -1, vol: 0.6, seq: 'E5+G5:8 D5+G5:8 | E5+G5+C6:8 -:8' },
      { inst: 'bass', gen: 'bass-half', vol: 0.7 },
    ],
  },
  {
    id: 'jingle_badge', title: '배지 획득', bpm: 132, bars: 3, once: true,
    chords: 'C:8 F:8 G:16 C:16',
    parts: [
      { inst: 'lead', seq: 'G4:2 C5:2 E5:2 G5:2 A5:4 C6:4 | B5:4 G5:2 B5:2 D6:8 | C6:12 -:4' },
      { inst: 'brass', oct: -1, vol: 0.6, seq: 'G4:2 C5:2 E5:2 G5:2 A5:4 C6:4 | B5:4 G5:2 B5:2 D6:8 | C6:12 -:4' },
      { inst: 'bass', gen: 'bass-8' },
    ],
    drums: ['k...s...k...s...', 'k...s...k.k.ssss', 'c...............'],
  },
];

export const TRACKS: Record<string, Track> = Object.fromEntries(T.map((t) => [t.id, t]));
