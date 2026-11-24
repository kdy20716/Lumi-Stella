// 휴대폰 › 도감 앱 내 「생활 도감 (농사·채광·낚시 90종 & 마을 특산물 17곳)」 전용 뷰 모듈
import { ITEMS, LIFE_DEX, LIFE_DEX_MILESTONES, TOWN_SPECIALTIES } from '@shared/data';
import { lifeDexSummary, townSpecialtyProgress } from '@shared/sim/lifeDex';
import type { LifeDexCat, PlayerState } from '@shared/types';
import { iconStyle } from './UI';

export type LifeDexSubTab = LifeDexCat | 'towns';

const esc = (s: string) => s.replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

const KIND_BADGE: Record<'basic' | 'local' | 'rare', { label: string; bg: string; fg: string }> = {
  basic: { label: '기본', bg: '#e8dcc4', fg: '#5a3a22' },
  local: { label: '특산', bg: '#d8f3e4', fg: '#1e6b44' },
  rare: { label: '비경', bg: '#ede2ff', fg: '#5a32a8' },
};

export function renderLifeDexApp(me: PlayerState, subTab: LifeDexSubTab): string {
  const sum = lifeDexSummary(me);
  const claims = new Set(me.lifeDexClaims ?? []);
  const visited = new Set(me.visited ?? []);

  // 달성했지만 아직 수령하지 않은 마일스톤 + 다음 목표 마일스톤
  const unclaimed = LIFE_DEX_MILESTONES.filter((m) => sum.total >= m.count && !claims.has(m.id));
  const nextGoal = LIFE_DEX_MILESTONES.find((m) => sum.total < m.count);

  const milestoneHtml = `
    <div class="ph-card ph-col" style="margin-bottom:6px;padding:8px 10px;gap:5px">
      <div class="ph-row" style="width:100%">
        <b>🌿 종합 생활 도감</b>
        <span class="ml-auto ph-ok"><b>${sum.total} / ${sum.max}</b> (${sum.pct}%)</span>
      </div>
      <div class="ph-progress" style="margin:2px 0"><i style="width:${sum.pct}%"></i><span>${sum.pct}%</span></div>
      ${unclaimed.map((m) => {
        const rw = [
          m.gold ? `${m.gold.toLocaleString()}G` : '',
          ...Object.entries(m.items).map(([id, q]) => `${ITEMS[id]?.name ?? id} ×${q}`),
        ].filter(Boolean).join(' · ');
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:6px;background:#fff4d2;border:1.5px solid #e0a43a;border-radius:8px;padding:5px 8px">
          <div class="ph-small" style="line-height:1.3"><b>🎁 ${esc(m.title)} 달성!</b><br><span>${esc(rw)}</span></div>
          <button data-dexclaim="${m.id}" class="ph-btn sm">보상 받기</button>
        </div>`;
      }).join('')}
      ${!unclaimed.length && nextGoal
        ? `<div class="ph-small" style="opacity:.85">다음 보상: <b>${esc(nextGoal.title)}</b> (${sum.total}/${nextGoal.count}종 등록 시 수령)</div>`
        : !unclaimed.length
          ? `<div class="ph-small ph-ok">🏆 모든 생활 도감 달성 보상을 수령했어요!</div>`
          : ''}
    </div>`;

  const subTabs = `<div class="ph-tabs" style="margin-bottom:6px">
    <button data-ldextab="farm" class="${subTab === 'farm' ? 'on' : ''}">🌱 농사 ${sum.farm}/30</button>
    <button data-ldextab="mine" class="${subTab === 'mine' ? 'on' : ''}">⛏️ 채광 ${sum.mine}/30</button>
    <button data-ldextab="fish" class="${subTab === 'fish' ? 'on' : ''}">🎣 낚시 ${sum.fish}/30</button>
    <button data-ldextab="towns" class="${subTab === 'towns' ? 'on' : ''}">🏘️ 특산물</button>
  </div>`;

  if (subTab === 'towns') {
    const townRows = Object.keys(TOWN_SPECIALTIES).map((townId) => {
      const pr = townSpecialtyProgress(me, townId)!;
      const cell = (itemId: string, ok: boolean, tag: string) => {
        const it = ITEMS[itemId];
        return `<div style="display:flex;align-items:center;gap:4px;flex:1;min-width:0;padding:3px 5px;border-radius:6px;background:${ok ? '#f5fbf2' : '#efe7d6'};border:1px solid ${ok ? '#8fc97a' : '#d2be98'}">
          <span class="px-icon shrink-0" style="${iconStyle(it?.icon ?? itemId, 22)}${ok ? '' : ';filter:brightness(0) opacity(.35)'}"></span>
          <div class="ph-small" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
            <span style="opacity:.65">${tag}</span><br><b>${ok ? esc(it?.name ?? itemId) : '???'}</b>
          </div>
        </div>`;
      };
      return `<div class="ph-card ph-col" style="padding:7px 9px;gap:5px">
        <div class="ph-row" style="width:100%">
          <b>📍 ${esc(pr.spec.name)}</b>
          <span class="ml-auto ${pr.done === 3 ? 'ph-ok' : 'ph-small'}"><b>${pr.done === 3 ? '★ 3/3 완성' : `${pr.done}/3`}</b></span>
        </div>
        <div style="display:flex;gap:4px;width:100%">
          ${cell(pr.spec.crop, pr.hasCrop, '🌱작물')}
          ${cell(pr.spec.ore, pr.hasOre, '⛏️광물')}
          ${cell(pr.spec.fish, pr.hasFish, '🎣어종')}
        </div>
      </div>`;
    }).join('');
    return `${milestoneHtml}${subTabs}<div class="ph-list">${townRows}</div>
      <div class="ph-foot">마을 마트에서 특산 씨앗을 사고, 주변 도로·동굴·물가에서 채광·낚시해 보세요!</div>`;
  }

  const bucket = me.lifeDex?.[subTab] ?? {};
  const entries = LIFE_DEX.filter((e) => e.cat === subTab);
  const cards = entries.map((e, idx) => {
    const cnt = bucket[e.id] ?? 0;
    const got = cnt > 0;
    const it = ITEMS[e.item];
    const kb = KIND_BADGE[e.kind];
    const seenRegion = visited.has(e.region) || e.kind === 'basic';
    const hintText = got
      ? esc(it?.description ?? e.hint)
      : seenRegion
        ? `📍 힌트: ${esc(e.hint)}`
        : `📍 서식지: ${esc(e.regionName)} (방문 시 상세 힌트 공개)`;

    return `<div class="ph-card" style="padding:6px 8px;opacity:${got ? '1' : '.86'}">
      <span class="px-icon shrink-0" style="${iconStyle(it?.icon ?? e.item, 32)}${got ? '' : ';filter:brightness(0) opacity(.35)'}"></span>
      <div class="flex-1 min-w-0">
        <div class="ph-row" style="gap:5px">
          <span class="ph-small" style="opacity:.6">#${String(idx + 1).padStart(2, '0')}</span>
          <b>${got ? esc(e.name) : '???'}</b>
          <span style="font-size:10px;padding:1px 5px;border-radius:4px;background:${kb.bg};color:${kb.fg};font-weight:700">${kb.label}</span>
          ${got ? `<span class="ml-auto ph-small ph-ok">획득 ×${cnt}</span>` : `<span class="ml-auto ph-small" style="opacity:.65">${esc(e.regionName)}</span>`}
        </div>
        <div class="ph-small" style="line-height:1.35;margin-top:2px">${hintText}</div>
      </div>
    </div>`;
  }).join('');

  const footLabel = subTab === 'farm'
    ? '씨앗 구매만으로는 등록되지 않고, 밭에서 직접 수확(또는 도우미 수령)해야 등록돼요!'
    : subTab === 'mine'
      ? '곡괭이 등급이 높고 포만감이 든든할수록 지역 특산 광물이 더 잘 나와요!'
      : '물가에서 낚싯대로 직접 낚으면 등록돼요! (포만감이 든든하면 특산 어종 확률 ↑)';

  return `${milestoneHtml}${subTabs}<div class="ph-list">${cards}</div><div class="ph-foot">${footLabel}</div>`;
}
