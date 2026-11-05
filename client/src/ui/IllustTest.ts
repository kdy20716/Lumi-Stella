// 일러스트 테스트 페이지: http://localhost:5173/?illust
//  - 모든 인물 카드 (AI 그림이면 'AI', 아직 없으면 '임시 SVG' 표시) · 포즈 · 표정 · 성격
//  - 카드를 누르면 실제 대화창으로 미리보기 (게임 화면 대신 마을 느낌 배경)
//  - 그림 만들기: 프로젝트 맨 위 .env 에 GEMINI_API_KEY → npm run gen:illust (-- --only mom,rival_f)
import { AI_ILLUST, hasAiIllust, illustHtml, loadLooks, personaOf } from './Illust';
import { ui } from './UI';
import illustSpec from '@shared/data/illust.json';

const SPEC = illustSpec as Record<string, { name: string; role: string; persona: string; pose: string; face: string }>;
const POSE_KO: Record<string, string> = { wave: '손 흔들기', cross: '팔짱', hips: '허리에 손', think: '턱 괴고 생각', cheer: '주먹 응원', point: '손가락으로 가리키기', clasp: '두 손 모으기', behind: '뒷짐' };
const FACE_KO: Record<string, string> = { smile: '웃음', grin: '활짝', calm: '차분', smug: '자신만만', gentle: '다정', serious: '진지' };
const SAMPLE: Record<string, string[]> = {
  mom: ['열다섯 살 생일 축하해! 엄마가 준비한 선물이야.', '먼 길을 떠나도 연락 자주 하렴~'],
  rival_m: ['늦었잖아! 이번 경주는 내 승리야.', '첫 여행의 시작은… 너와의 대결이야!!!'],
  rival_f: ['늦었잖아! 이번 경주는 내 승리야.', '첫 여행의 시작은… 너와의 대결이야!!!'],
  minsu: ['배지를 땄다고? …좋아, 새 볼 만드는 법을 알려 주지.'],
  professor: ['오오, 흥미롭군! 루미가 진화하는 순간을 봤나?'],
};

export async function showIllustTest() {
  await loadLooks();
  document.body.classList.remove('overflow-hidden');
  document.body.style.overflow = 'auto';
  const root = document.getElementById('ui')!;
  root.classList.remove('pointer-events-none');
  const ids = Object.keys(SPEC);
  const ai = ids.filter(hasAiIllust).length;
  const page = document.createElement('div');
  page.className = 'illt pointer-events-auto';
  page.innerHTML = `
    <div class="illt-head">
      <div><b>🎨 대화 일러스트 테스트</b> <span>${ids.length}명 중 AI 그림 ${ai}장${AI_ILLUST.model ? ` · ${AI_ILLUST.model}` : ''}</span></div>
      <div class="illt-help">그림 만들기: <code>.env</code> 에 <code>GEMINI_API_KEY=키</code> → <code>npm run gen:illust</code> (일부만: <code>npm run gen:illust -- --only mom,rival_f</code> · 다시: <code>--force</code>) → 이 페이지 새로고침<br>
      카드를 누르면 실제 대화창으로 미리 봐요 · <a href="./">게임으로 돌아가기</a></div>
      <label class="illt-bg">배경 <select data-bg><option value="day">낮 마을</option><option value="night">밤</option><option value="room">실내</option></select></label>
    </div>
    <div class="illt-grid">${ids.map((id) => {
      const [pose, face] = personaOf(id), s = SPEC[id];
      return `<button class="illt-card" data-id="${id}"><div class="illt-pic">${illustHtml(id)}</div>
        <div class="illt-tag ${hasAiIllust(id) ? 'ai' : ''}">${hasAiIllust(id) ? 'AI' : '임시 SVG'}</div>
        <b>${s.name}</b> <small>${id}</small><div class="illt-sub">${s.role} · ${POSE_KO[s.pose ?? pose]} · ${FACE_KO[s.face ?? face]}</div></button>`;
    }).join('')}</div>`;
  root.appendChild(page);
  const setBg = (v: string) => { document.body.dataset.illbg = v; };
  setBg('day');
  page.querySelector<HTMLSelectElement>('[data-bg]')!.onchange = (e) => setBg((e.target as HTMLSelectElement).value);
  page.querySelectorAll<HTMLButtonElement>('[data-id]').forEach((b) => {
    b.onclick = () => {
      const id = b.dataset.id!, s = SPEC[id];
      ui.dialogue.show({ name: s.name, title: s.role, sprite: id, color: '#a8683a', pages: SAMPLE[id] ?? [`안녕! 나는 ${s.name}. (${s.persona})`, '대화창에서 이렇게 보여요. 클릭하면 닫혀요.'] });
    };
  });
}
