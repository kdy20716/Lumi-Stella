// 프롤로그 스토리 (서버 권한으로 단계 저장)
//  0 집: 친구가 찾아옴 → 1 마을까지 경주 → 2 마을 입구에서 엄마(휴대폰) → 3 호수 가로등의 친구 → 4 마을회관 이장님(지도·루미) → 5 친구와 첫 대결 승리 = 모험 시작
export const STORY = { HOME: 0, RACE: 1, PHONE: 2, MEET: 3, HALL: 4, DONE: 5 } as const;

/** 주인공과 반대 성별의 소꿉친구(라이벌) */
export const rivalOf = (look: string) => (look.startsWith('f') ? { id: 'rival_m', name: '한결', look: 'rival_m' } : { id: 'rival_f', name: '새봄', look: 'rival_f' });

/** 라이벌은 언제나 주인공에게 상성이 불리한 루미를 고름 (풀▶물▶불▶풀) */
export const RIVAL_PICK: Record<string, string> = { morak: 'saerok', saerok: 'chalang', chalang: 'morak' };
