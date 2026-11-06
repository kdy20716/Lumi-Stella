// 루미 도감 개발/테스트 페이지: http://localhost:5173/?dex
import pokedexData from '@shared/data/pokedex.json';

interface MonsterStage {
  name: string;
  type: string;
  id: string;
  evo: string;
  how: string;
}

interface DexFamily {
  dexNo: string;
  class: string;
  stageCount: number;
  name: string;
  title?: string;
  type: string;
  kind: string;
  stages: MonsterStage[];
}

const DEX = pokedexData as DexFamily[];

const TYPE_COLORS: Record<string, string> = {
  '노말': '#94a3b8',
  '불': '#f97316',
  '물': '#38bdf8',
  '풀': '#4ade80',
  '전기': '#facc15',
  '얼음': '#67e8f9',
  '격투': '#ef4444',
  '독': '#c084fc',
  '땅': '#d97706',
  '바람': '#818cf8',
  '빛': '#f59e0b',
  '에스퍼': '#f472b6',
  '벌레': '#a3e635',
  '바위': '#a8a29e',
  '고스트': '#8b5cf6',
  '드래곤': '#6366f1',
  '악': '#475569',
  '강철': '#64748b',
  '페어리': '#fbcfe8',
};

function typeBadge(typeStr: string) {
  return typeStr.split('/').map(t => {
    const clean = t.trim();
    const bg = TYPE_COLORS[clean] || '#64748b';
    const isLight = clean === '페어리' || clean === '전기';
    return `<span style="background:${bg}; color:${isLight ? '#334155' : '#fff'}; font-size:11px; font-weight:700; padding:1px 6px; border-radius:4px; margin-right:3px;">${clean}</span>`;
  }).join('');
}

export function showPokedexTest() {
  document.body.classList.remove('overflow-hidden');
  document.body.style.overflow = 'auto';
  const root = document.getElementById('ui')!;
  root.classList.remove('pointer-events-none');
  root.style.overflowY = 'auto';
  root.style.overflowX = 'hidden';
  root.style.pointerEvents = 'auto';
  root.style.height = '100vh';

  const classes = Array.from(new Set(DEX.map(d => d.class)));
  const totalMonsters = DEX.reduce((acc, f) => acc + f.stages.length, 0);

  const page = document.createElement('div');
  page.className = 'dex-page pointer-events-auto';
  page.innerHTML = `
    <style>
      .dex-page { padding: 20px 24px 300px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; max-width: 1500px; margin: 0 auto; }
      .dex-header { background: #ffffffea; border: 3px solid #cbd5e1; border-radius: 16px; padding: 18px 24px; margin-bottom: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); position: sticky; top: 0; z-index: 10; backdrop-filter: blur(8px); }
      .dex-title { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
      .dex-title h1 { margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 8px; }
      .dex-nav { font-size: 13px; }
      .dex-nav a { color: #2563eb; text-decoration: none; font-weight: 600; margin-left: 12px; }
      .dex-nav a:hover { text-decoration: underline; }
      .dex-filters { display: flex; gap: 8px; flex-wrap: wrap; }
      .dex-btn { border: 1px solid #cbd5e1; background: #f8fafc; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .15s; }
      .dex-btn:hover { background: #e2e8f0; }
      .dex-btn.active { background: #0284c7; color: #fff; border-color: #0284c7; }
      .dex-search { padding: 6px 12px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 13px; width: 220px; }
      
      .dex-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 14px; }
      .dex-card { background: #fff; border: 2px solid #e2e8f0; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.03); transition: transform .15s, border-color .15s; position: relative; cursor: pointer; user-select: none; }
      .dex-card:hover { transform: translateY(-2px); border-color: #38bdf8; box-shadow: 0 6px 16px rgba(0,0,0,0.08); }
      .dex-card.open { border-color: #0284c7; background: #fafcff; }
      .dex-top { display: flex; justify-content: space-between; align-items: center; }
      .dex-no { font-family: ui-monospace, monospace; font-size: 13px; font-weight: 800; color: #64748b; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; }
      .dex-class { font-size: 11px; font-weight: 700; color: #0369a1; background: #e0f2fe; padding: 2px 8px; border-radius: 6px; }
      .dex-name { font-size: 18px; font-weight: 800; color: #0f172a; display: flex; align-items: flex-start; justify-content: space-between; }
      .dex-legend-title { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 800; color: #7c3aed; background: linear-gradient(135deg, #f5f3ff, #ede9fe); border: 1px solid #d8b4fe; padding: 1px 7px; border-radius: 6px; margin-bottom: 4px; }
      .dex-kind { font-size: 12px; font-weight: 600; color: #64748b; margin-top: 2px; }
      
      /* 축약 상태 안내 */
      .dex-summary { display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 8px 12px; border-radius: 8px; font-size: 12px; color: #475569; font-weight: 600; border: 1px dashed #cbd5e1; }
      .dex-summary span.arrow { transition: transform .2s ease; font-size: 14px; color: #0284c7; }
      .dex-card.open .dex-summary span.arrow { transform: rotate(180deg); }
      
      /* 펼쳐지는 진화 트리 상세창 */
      .dex-stages { display: none; flex-direction: column; gap: 8px; margin-top: 6px; }
      .dex-card.open .dex-stages { display: flex; }
      
      .dex-stage-card { background: #fff; border: 1.5px solid #cbd5e1; border-radius: 10px; padding: 10px; border-left: 4px solid #0284c7; font-size: 12px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); }
      .dex-stage-header { display: flex; justify-content: space-between; align-items: center; font-weight: 700; }
      .dex-stage-title { font-size: 14px; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px; }
      .dex-stage-id { font-size: 11px; color: #94a3b8; font-family: ui-monospace, monospace; }
      .dex-row { display: flex; gap: 6px; margin-top: 2px; }
      .dex-label { font-weight: 700; color: #64748b; flex-shrink: 0; width: 60px; }
      .dex-val { color: #1e293b; }
      .dex-how { color: #0f766e; font-weight: 600; }
    </style>

    <div class="dex-header">
      <div class="dex-title">
        <h1>📖 루미 도감 마스터 플랜 <span style="font-size:16px; font-weight:600; color:#0284c7;">(${DEX.length}개 가문 · 총 ${totalMonsters}마리 수납)</span></h1>
        <div class="dex-nav">
          <input type="text" class="dex-search" placeholder="루미 이름/수식어/타입/출현장소 검색..." data-search />
          <a href="./?illust">🎨 인물 일러스트 테스트</a>
          <a href="./">🎮 게임으로 돌아가기</a>
        </div>
      </div>
      <div class="dex-filters">
        <button class="dex-btn active" data-filter="all">전체보기 (${DEX.length}개 가문)</button>
        ${classes.map(c => {
          const count = DEX.filter(d => d.class === c).length;
          return `<button class="dex-btn" data-filter="${c}">${c} (${count})</button>`;
        }).join('')}
      </div>
    </div>

    <div class="dex-grid" data-container></div>
  `;

  root.appendChild(page);

  const container = page.querySelector('[data-container]')!;
  const searchInput = page.querySelector<HTMLInputElement>('[data-search]')!;
  let currentFilter = 'all';

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = DEX.filter(d => {
      const matchFilter = currentFilter === 'all' || d.class === currentFilter;
      const matchQuery = !q || 
        d.name.toLowerCase().includes(q) || 
        (d.title && d.title.toLowerCase().includes(q)) ||
        d.type.toLowerCase().includes(q) || 
        d.kind.toLowerCase().includes(q) || 
        d.dexNo.includes(q) ||
        d.stages.some(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.how.toLowerCase().includes(q));
      return matchFilter && matchQuery;
    });

    container.innerHTML = filtered.map((d, index) => {
      const stageNames = d.stages.map(s => s.name).join(' ➔ ');
      return `
        <div class="dex-card ${q ? 'open' : ''}" data-card-idx="${index}">
          <div class="dex-top">
            <span class="dex-no">${d.dexNo}</span>
            <span class="dex-class">${d.class} (${d.stageCount}단)</span>
          </div>
          <div class="dex-name">
            <div>
              ${d.title ? `<div class="dex-legend-title">✦ [${d.title}]</div>` : ''}
              <div>${d.name}</div>
            </div>
            <span class="dex-kind">${d.kind}</span>
          </div>
          <div>
            ${typeBadge(d.type)}
          </div>

          <div class="dex-summary">
            <span>🐾 ${stageNames}</span>
            <span class="arrow">▼</span>
          </div>

          <div class="dex-stages">
            ${d.stages.map((st, i) => `
              <div class="dex-stage-card">
                <div class="dex-stage-header">
                  <span class="dex-stage-title">
                    <span style="color:#0284c7;">[${i + 1}단계]</span> ${st.name} <small class="dex-stage-id">${st.id}</small>
                  </span>
                  <div>${typeBadge(st.type)}</div>
                </div>
                <div class="dex-row">
                  <span class="dex-label">진화 조건</span>
                  <span class="dex-val">${st.evo}</span>
                </div>
                <div class="dex-row">
                  <span class="dex-label">인게임 연동</span>
                  <span class="dex-val dex-how">📍 ${st.how}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // 카드 클릭 시 진화 단계 아코디언 토글
    container.querySelectorAll('.dex-card').forEach(card => {
      card.addEventListener('click', () => {
        card.classList.toggle('open');
      });
    });
  }

  render();

  page.querySelectorAll<HTMLButtonElement>('.dex-btn').forEach(btn => {
    btn.onclick = () => {
      page.querySelectorAll('.dex-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter!;
      render();
    };
  });

  searchInput.oninput = () => render();
}
