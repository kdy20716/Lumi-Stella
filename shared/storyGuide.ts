// 모험 수첩 (스토리 · 퀘스트 진행 가이드 & 막힌 관문 안내)
import { CHAPTERS, dexComplete, EVENTS, QUESTS, SPECIES } from './data';
import { rivalOf, STORY } from './story';
import type { MapId, PlayerState } from './types';

export interface GuideStep {
  id: string;
  chapter: string;
  title: string;
  detail: string;
  targetMap: MapId;
  done: boolean;
  current: boolean;
  side?: boolean;
}

export interface StoryGuide {
  chapter: string;
  title: string;
  detail: string;
  targetMap: MapId;
  mainDone: number;
  mainTotal: number;
  steps: GuideStep[];
}

export function getStoryGuide(me: PlayerState): StoryGuide {
  const f = (id: string) => !!me.flags?.includes(id);
  const b = (id: string) => !!me.badges?.includes(id);
  const d = (id: string) => !!me.defeated?.includes(id);
  const c = (id: string) => !!me.caught?.includes(id) || me.party.some((x) => x.species === id) || me.box.some((x) => x.species === id);
  const rv = rivalOf(me.look || 'm1').name;
  const dexGoal = Object.values(SPECIES).filter((sp) => sp.legend !== 'myth').length;
  const dexHave = Object.values(SPECIES).filter((sp) => sp.legend !== 'myth' && me.caught.includes(sp.id)).length;
  const litCount = Object.keys(QUESTS.spires).filter((k) => f(`lit_${k}`)).length;
  const nextUnlitSpire = (['n', 'e', 's', 'w'] as const).find((k) => !f(`lit_${k}`));

  const mainSteps: Omit<GuideStep, 'current'>[] = [
    {
      id: 'prologue',
      chapter: '프롤로그',
      title: me.story < STORY.PHONE
        ? '별빛 마을로 달려가 엄마 만나기'
        : me.story < STORY.MEET
          ? `호수 왼쪽 가로등 아래 ${rv} 만나기`
          : me.party.length === 0
            ? '마을회관에서 파트너 루미 받기'
            : `마을회관에서 ${rv}과(와) 첫 대결`,
      detail: me.story < STORY.PHONE
        ? '별빛 농장 동쪽 길로 나가 별빛 마을 입구로 가세요.'
        : me.story < STORY.MEET
          ? '별빛 마을 호수 서쪽 가로등 아래에서 기다리는 소꿉친구에게 말을 걸어 보세요.'
          : me.party.length === 0
            ? '별빛 마을 북쪽 광장의 큰 건물(마을회관)로 들어가 오 이장님께 첫 루미를 받으세요.'
            : '마을회관에서 소꿉친구와 첫 루미 배틀을 마치면 1번 도로가 열립니다!',
      targetMap: me.story < STORY.RACE ? 'farm' : 'town',
      done: me.story >= STORY.DONE && me.party.length > 0,
    },
    {
      id: 'ch1',
      chapter: '1장 · 바람이 부는 쪽으로',
      title: !f('ch1_call') ? '1번 도로로 출발하기' : !f('ch1_windvale') ? '바람골 마을 성간단 소란 해결' : '바람골 도장 관장 세나 도전',
      detail: !f('ch1_call')
        ? '별빛 마을 동쪽 1번 도로로 나가 한별 박사님의 연락을 받으세요.'
        : !f('ch1_windvale')
          ? '1번 도로를 지나 동쪽 바람골 마을에 들어가 성간단 단원을 물리치세요.'
          : '바람골 마을 남쪽 도장에서 바람 타입 관장 세나에게 승리해 바람 배지를 얻으세요. (비전 기술 풀베기 해금)',
      targetMap: !f('ch1_call') ? 'route1' : 'windvale',
      done: b('badge_wind'),
    },
    {
      id: 'ch2',
      chapter: '2장 · 항구의 그림자',
      title: !f('ch2_rival') ? `2번 도로에서 ${rv}과(와) 대결` : !f('ch2_harbor') ? '물결항 성간단 사건 해결' : '물결항 도장 관장 파도 도전',
      detail: !f('ch2_rival')
        ? '바람골 마을 동남쪽 2번 도로(갯바람길)로 나가 라이벌과 실력을 겨루세요.'
        : !f('ch2_harbor')
          ? '물결항에 도착해 부두를 점거한 성간단 단원을 막아내면 도장이 열립니다.'
          : '물결항 도장에서 물 타입 관장 파도를 이기고 물결 배지를 획득하세요.',
      targetMap: !f('ch2_rival') ? 'route2' : 'harbor',
      done: b('badge_water'),
    },
    {
      id: 'ch3',
      chapter: '3장 · 붉은 숲의 경고',
      title: !f('ch3_maple') ? '단풍골 마을 방문' : !b('badge_leaf') ? '단풍골 도장 관장 단비 도전' : '4번 도로에서 성간단 간부 월영 저지',
      detail: !f('ch3_maple')
        ? '바람골 북쪽 3번 도로를 따라 단풍골로 이동하세요.'
        : !b('badge_leaf')
          ? '단풍골 도장에서 풀 타입 관장 단비를 이겨 새싹 배지를 얻으세요. (바위 부수기 해금)'
          : '단풍골 북쪽 4번 도로(자갈비탈)로 나가 성간단 제2간부 월영과 대결하세요.',
      targetMap: !b('badge_leaf') ? 'maple' : 'route4',
      done: b('badge_leaf') && f('ch3_route4'),
    },
    {
      id: 'ch4',
      chapter: '4장 · 쇳불 아래의 어둠',
      title: !f('ch4_forge') ? '쇳불 도시 도착' : !f('ch4_underground') ? '땅속 통로에서 전광 박사 저지' : '쇳불 도시 도장 관장 무쇠 도전',
      detail: !f('ch4_forge')
        ? '4번 도로 북쪽의 공업 도시 쇳불 도시로 들어가 광부 반장의 이야기를 들으세요.'
        : !f('ch4_underground')
          ? '쇳불 도시 광산 입구(땅속 통로)로 내려가 성간단 수석 연구원 전광 박사를 물리치세요.'
          : '쇳불 도시 도장에서 땅 타입 관장 무쇠를 이기고 바위 배지를 얻으세요. (암석 오르기 해금)',
      targetMap: !f('ch4_forge') ? 'forge' : !f('ch4_underground') ? 'underground' : 'forge',
      done: b('badge_earth'),
    },
    {
      id: 'ch5',
      chapter: '5장 · 노을의 약속',
      title: !f('ch5_ember') ? `잿빛 마을에서 ${rv} 만나기` : '잿빛 마을 도장 관장 화련 도전',
      detail: !f('ch5_ember')
        ? '동쪽 화산 지대의 잿빛 마을로 향해 라이벌과 대결하고 고속 자전거를 받으세요.'
        : '잿빛 마을 도장에서 불 타입 관장 화련을 이겨 불꽃 배지를 획득하세요.',
      targetMap: 'ember',
      done: b('badge_flame'),
    },
    {
      id: 'ch6',
      chapter: '6장 · 빛누리 점거 사건',
      title: !f('ch6_lumina') ? '대도시 빛누리 시티 도착' : !f('ch6_nebula') ? '북쪽 빛누리 방송국 성간단 격퇴' : '빛누리 시티 도장 관장 샛별 도전',
      detail: !f('ch6_lumina')
        ? '대도시 빛누리 시티로 진입해 시내 소식을 확인하세요.'
        : !f('ch6_nebula')
          ? '빛누리 시티 북서쪽의 [빛누리 방송국] 앞으로 이동해 성간단 특공대와 제4간부 성운을 물리치세요.'
          : '구출된 관장 샛별과 빛누리 도장에서 대결해 샛별 배지를 얻으세요.',
      targetMap: 'lumina',
      done: b('badge_light'),
    },
    {
      id: 'ch7_frost',
      chapter: '7장 · 설원과 별마루산',
      title: !f('ch7_frost') ? `서리 마을에서 ${rv}과(와) 대결` : '서리 마을 도장 관장 설아 도전',
      detail: !f('ch7_frost')
        ? '북쪽 설원 지대의 서리 마을로 이동해 라이벌을 만나세요.'
        : '서리 마을 도장에서 얼음 퍼즐을 풀고 관장 설아에게 승리해 눈송이 배지를 얻으세요.',
      targetMap: 'frost',
      done: b('badge_normal'),
    },
    {
      id: 'ch7_summit',
      chapter: '7장 · 별마루산의 밤',
      title: !f('ch7_summit')
        ? '별마루 마을로 집결'
        : !f('ch7_cave')
          ? '별마루산 1층 돌파'
          : !f('ch7_solaris')
            ? '별마루산 정상 동굴 — 제1간부 홍염 격퇴'
            : !f('ch7_altar')
              ? '별의 제단 — 성간단 총수 흑야 결전'
              : '별마루 도장 관장 천문 도전',
      detail: !f('ch7_summit')
        ? '별마루 마을로 향해 관장 천문을 만나세요. (빛누리 사건 완료 및 눈송이 배지 필요)'
        : !f('ch7_cave')
          ? '별마루산 1층 동굴로 올라가 성간단 특공대를 돌파하세요.'
          : !f('ch7_solaris')
            ? '별마루산 3층 정상 동굴에서 제1간부 홍염을 막아내세요.'
            : !f('ch7_altar')
              ? '정상 너머 별의 제단에서 총수 흑야를 저지해 별빛을 지켜내세요!'
              : '별마루 도장에서 마지막 관장 천문을 이기고 8번째 별자리 배지를 손에 넣으세요.',
      targetMap: !f('ch7_summit') ? 'summit' : !f('ch7_cave') ? 'coronet_1f' : !f('ch7_solaris') ? 'coronet_3f' : !f('ch7_altar') ? 'altar' : 'summit',
      done: b('badge_star'),
    },
    {
      id: 'ch8_league',
      chapter: '8~9장 · 루미 리그 & 엔딩',
      title: !f('ch8_rival')
        ? `20번 도로(도전자의 길)에서 ${rv}과(와) 최종전`
        : !d('champion')
          ? '왕관 시티 루미 리그 — 사천왕 & 챔피언 하람 도전'
          : '챔피언 전당 엔딩 감상',
      detail: !f('ch8_rival')
        ? '빛누리 시티 북쪽 20번 도로를 지나 승리의 길 → 등대곶 항구에서 배를 타고 왕관 시티로 향하세요.'
        : '8개의 배지를 갖추고 왕관 시티 북쪽 [루미 리그]에서 사천왕 4인과 챔피언 하람을 꺾으세요!',
      targetMap: !f('ch8_rival') ? 'route20' : 'crown',
      done: f('ending'),
    },
  ];

  const sideSteps: Omit<GuideStep, 'current'>[] = [
    {
      id: 'side_stella',
      chapter: '포스트게임 · 별의 요람',
      title: !f('side_master') ? '별마루산 미로 → 시험의 방 (루미 마스터 하람)' : !c('stella') ? '별의 요람 — 전설의 루미 스텔라 포획' : '전설의 루미 스텔라 포획 완료',
      detail: !f('side_master')
        ? '별마루산 3층(coronet_3f)에서 암석 오르기로 숨겨진 [별마루산 미로]를 통과해 시험의 방으로 가세요.'
        : '하람에게 받은 태초볼(또는 루미볼)로 별의 요람에 잠든 Lv.60 스텔라를 만나세요!',
      targetMap: !f('side_master') ? 'star_maze' : 'stella_nest',
      done: c('stella'),
      side: true,
    },
    {
      id: 'side_flute',
      chapter: '포스트게임 · 시련의 오카리나',
      title: !dexComplete(me) ? `루미 도감 완성 (${dexHave}/${dexGoal}종)` : '별의 요람에서 시련의 오카리나 수령',
      detail: !dexComplete(me)
        ? `환상종을 제외한 120종 루미를 모두 포획·진화시켜 도감을 완성한 뒤 별의 요람으로 돌아가세요. (현재 ${dexHave}/${dexGoal})`
        : '도감을 완성했습니다! 별의 요람으로 돌아가 하람에게 시련의 오카리나를 받으세요.',
      targetMap: 'stella_nest',
      done: f('side_flute'),
      side: true,
    },
    {
      id: 'side_spires',
      chapter: '포스트게임 · 네 개의 탑',
      title: `동·서·남·북 네 개의 탑 빛 켜기 (${litCount}/4)`,
      detail: '18번 도로(북), 24번 도로(동), 5번 도로(남), 25번 도로(서)의 네 탑에서 성간단 간부들에게 악보를 되찾고 꼭대기에서 오카리나를 연주하세요.',
      targetMap: nextUnlitSpire ? `spire_${nextUnlitSpire}` : 'altar',
      done: litCount >= 4,
      side: true,
    },
    {
      id: 'side_genesis',
      chapter: '최종장 · 태초의 선율',
      title: !f('side_nox') ? '별의 제단 — 총수 흑야 최종 결전' : !f('genesis_awake') ? '별의 제단에서 마지막 선율 연주' : '태초의 창조신 제네시스(Lv.150) 포획',
      detail: !f('side_nox')
        ? '네 탑의 빛이 모인 별마루산 꼭대기 [별의 제단]으로 올라가 총수 흑야를 꺾으세요.'
        : !f('genesis_awake')
          ? '별의 제단 중앙 제단에서 오카리나로 마지막 선율을 연주해 태초의 루미를 깨우세요.'
          : '체력을 절반(50%) 이하로 깎아야 루미볼을 던질 수 있습니다! (20% 이하 시 포획률 대폭 상승)',
      targetMap: 'altar',
      done: f('side_genesis'),
      side: true,
    },
  ];

  const allRaw = [...mainSteps, ...sideSteps];
  const firstUndone = allRaw.findIndex((s) => !s.done);
  const steps: GuideStep[] = allRaw.map((s, idx) => ({ ...s, current: idx === firstUndone }));
  const cur = firstUndone >= 0 ? steps[firstUndone] : steps[steps.length - 1];
  const mainDone = mainSteps.filter((s) => s.done).length;

  return {
    chapter: firstUndone < 0 ? '★ 루미 마스터 완전 정복' : cur.chapter,
    title: firstUndone < 0 ? '루미나 지방의 모든 이야기를 마쳤어요!' : cur.title,
    detail: firstUndone < 0
      ? '별빛 농장과 17개 마을 텃밭을 가꾸며 친구들과 자유롭게 모험을 즐겨 보세요. (왕관 시티 루미 리그에서 하람과 Lv.100 재대결도 가능!)'
      : cur.detail,
    targetMap: cur.targetMap,
    mainDone,
    mainTotal: mainSteps.length,
    steps,
  };
}

/** 막힌 체육관/관문에 부딪혔을 때 스토리 대사 + 실제 선행 조건을 함께 안내 */
export function explainGate(me: PlayerState, eventId: string): string {
  const ev = EVENTS[eventId];
  const base = ev?.gate?.msg ?? '지금은 들어갈 수 없다.';
  if (!ev) return base;
  const f = (id: string) => !!me.flags?.includes(id);
  const b = (id: string) => !!me.badges?.includes(id);

  if (eventId === 'ch2_harbor') {
    if (!b('badge_wind')) return `${base} (힌트: 먼저 바람골 도장에서 바람 배지를 얻으세요!)`;
    if (!f('ch2_rival')) return `${base} (힌트: 2번 도로(갯바람길)에서 라이벌과 먼저 대결한 뒤 물결항으로 오세요!)`;
  } else if (eventId === 'ch4_underground') {
    if (!b('badge_leaf')) return `${base} (힌트: 먼저 단풍골 도장에서 새싹 배지를 얻으세요!)`;
    if (!f('ch3_route4')) return `${base} (힌트: 4번 도로(자갈비탈)에서 성간단 간부 월영과 대결한 뒤 쇳불 도시로 오세요!)`;
    if (!f('ch4_forge')) return `${base} (힌트: 쇳불 도시 입구에서 광부 반장 사건을 먼저 진행하세요!)`;
    return `${base} (힌트: 쇳불 도시 광산 입구 [땅속 통로]로 내려가 성간단을 막아내세요!)`;
  } else if (eventId === 'ch6_nebula') {
    if (!b('badge_flame')) return `${base} (힌트: 먼저 잿빛 마을 도장에서 불꽃 배지를 얻으세요!)`;
    if (!f('ch6_lumina')) return `${base} (힌트: 빛누리 시티 입구에서 방송국 점거 소식을 먼저 들으세요!)`;
    return `${base} (힌트: 빛누리 시티 북서쪽 [빛누리 방송국] 앞으로 가면 성간단 사건이 시작돼요!)`;
  } else if (eventId === 'ch7_altar') {
    if (!f('ch6_nebula')) return `${base} (힌트: 먼저 빛누리 시티 방송국 사건(6장)을 해결해야 해요!)`;
    if (!b('badge_normal')) return `${base} (힌트: 먼저 서리 마을 도장에서 눈송이 배지를 얻으세요!)`;
    return `${base} (힌트: 별마루산 동굴을 올라 꼭대기 [별의 제단]에서 총수 흑야를 저지하세요!)`;
  }
  const chTitle = CHAPTERS.chapters.find((c) => c.n === ev.chapter)?.title;
  return chTitle ? `${base} (${chTitle} 진행 필요)` : base;
}
