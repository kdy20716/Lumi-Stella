// 루미 배틀 엔진 (서버 권한). 순수 로직 — Phaser/DOM 의존 없음
import { ENCOUNTERS, ITEMS, MOVES, SPECIES, TRAINERS } from '../data';
import type { BattleLog, BattleUpdate, BattleView, CreatureInst, CreatureView, LumiType, PlayerState, TrainerDef } from '../types';

export type Rand = () => number;

// ── 능력치 / 생성 ─────────────────────────────────────
export function stats(c: CreatureInst) {
  const b = SPECIES[c.species].base, L = c.level;
  return {
    maxHp: Math.floor((b.hp * 2 * L) / 100) + L + 10,
    atk: Math.floor((b.atk * 2 * L) / 100) + 5,
    def: Math.floor((b.def * 2 * L) / 100) + 5,
    spd: Math.floor((b.spd * 2 * L) / 100) + 5,
  };
}
export const expToNext = (level: number) => Math.floor(level * level * 4 + 10);
/** 만렙 */
export const MAX_LEVEL = 100;

export function movesAt(species: string, level: number) {
  const learned = SPECIES[species].learnset.filter(([lv]) => lv <= level).map(([, m]) => m);
  return learned.slice(-4);
}
let uidSeq = 0;
export function makeCreature(species: string, level: number): CreatureInst {
  const c: CreatureInst = { uid: `${species}-${Date.now().toString(36)}-${(uidSeq++).toString(36)}`, species, level, exp: 0, hp: 0, moves: movesAt(species, level) };
  c.hp = stats(c).maxHp; restorePp(c);
  return c;
}
// ── PP (기술 사용 횟수) ───────────────────────────────
/** 기술의 최대 PP (moves.json 의 pp, 없으면 위력으로 정함) */
export function maxPp(moveId: string) {
  const m = MOVES[moveId]; if (!m) return 0;
  if (m.pp != null) return m.pp;
  return m.power === 0 ? 20 : m.power >= 80 ? 10 : m.power >= 60 ? 15 : 30;
}
export function ppLeft(c: CreatureInst, i: number) { return c.pp?.[i] ?? maxPp(c.moves[i]); }
/** 기술 목록이 바뀐 뒤 PP 배열 맞추기 (남아 있던 기술은 PP 유지, 새 기술은 가득) */
export function syncPp(c: CreatureInst, before?: { moves: string[]; pp?: number[] }) {
  const old = new Map<string, number>();
  if (before) before.moves.forEach((m, i) => old.set(m, before.pp?.[i] ?? maxPp(m)));
  c.pp = c.moves.map((m) => old.get(m) ?? maxPp(m));
}
export function restorePp(c: CreatureInst) { c.pp = c.moves.map(maxPp); }
export function healAll(party: CreatureInst[]) { for (const c of party) { c.hp = stats(c).maxHp; restorePp(c); } }
export const alive = (party: CreatureInst[]) => party.filter((c) => c.hp > 0);

export function view(c: CreatureInst): CreatureView {
  const s = SPECIES[c.species];
  return {
    uid: c.uid, species: c.species, name: s.name, type: s.type, level: c.level, hp: c.hp, maxHp: stats(c).maxHp, exp: c.exp, expNext: expToNext(c.level),
    moves: c.moves.map((id, i) => ({ id, name: MOVES[id].name, type: MOVES[id].type, power: MOVES[id].power, category: MOVES[id].category, pp: ppLeft(c, i), maxPp: maxPp(id) })),
  };
}
export function effectiveness(atk: LumiType, def: LumiType) { return ENCOUNTERS.typeChart[atk]?.[def] ?? 1; }

// ── 배틀 상태 ─────────────────────────────────────────
export interface BattleState {
  kind: 'wild' | 'trainer';
  trainerId?: string;
  tr?: TrainerDef;           // 트레이너 정보 (데이터 또는 스토리용 즉석 정의)
  script?: 'rival';
  eventId?: string;          // 본편 사건 승부 (이기면 그 사건 완료)          // 스토리 각본: 라이벌 첫 대결 (주고받다가 버프만 쓰고 짐)
  turn: number;
  bg: string;
  foes: CreatureInst[];
  foeIdx: number;
  myIdx: number;
  stage: { me: { atk: number; def: number }; foe: { atk: number; def: number } };
  over: boolean;
  participants: Set<string>; // 경험치 받을 아군 uid
}
const stageMul = (s: number) => (s >= 0 ? (2 + s) / 2 : 2 / (2 - s));

export class BattleEngine {
  constructor(private rand: Rand) {}

  startWild(p: PlayerState, species: string, level: number, bg: string): { state: BattleState; update: BattleUpdate } {
    const foe = makeCreature(species, level);
    const myIdx = Math.max(0, p.party.findIndex((c) => c.hp > 0));
    const st: BattleState = { kind: 'wild', turn: 0, bg, foes: [foe], foeIdx: 0, myIdx, stage: { me: { atk: 0, def: 0 }, foe: { atk: 0, def: 0 } }, over: false, participants: new Set([p.party[myIdx].uid]) };
    if (!p.seen.includes(species)) p.seen.push(species);
    const name = SPECIES[species].name;
    const log: BattleLog[] = [{ t: 'text', text: `앗! 야생 ${name}이(가) 나타났다!` }, { t: 'text', text: `가라, ${SPECIES[p.party[myIdx].species].name}!` }];
    return { state: st, update: { view: this.view(p, st), log } };
  }

  startTrainer(p: PlayerState, trainer: string | TrainerDef, script?: 'rival', bg?: string): { state: BattleState; update: BattleUpdate } {
    const tr = typeof trainer === 'string' ? TRAINERS[trainer] : trainer;
    const trainerId = tr.id;
    const foes = tr.team.map(([s, l]) => makeCreature(s, l));
    // 라이벌 첫 대결: 기본 공격 + 울음소리 + 으쓱으쓱(버프)
    if (script === 'rival') for (const f of foes) { f.moves = [f.moves[0], 'growl', 'puff_up']; restorePp(f); }
    const myIdx = Math.max(0, p.party.findIndex((c) => c.hp > 0));
    const st: BattleState = { kind: 'trainer', trainerId, tr, script, turn: 0, bg: bg ?? (tr.map === 'route1' || tr.map === 'farm' ? 'grass' : 'town'), foes, foeIdx: 0, myIdx, stage: { me: { atk: 0, def: 0 }, foe: { atk: 0, def: 0 } }, over: false, participants: new Set([p.party[myIdx].uid]) };
    for (const f of foes) if (!p.seen.includes(f.species)) p.seen.push(f.species);
    const log: BattleLog[] = [
      { t: 'text', text: `${tr.title} ${tr.name}이(가) 승부를 걸어왔다!` },
      { t: 'text', text: `${tr.name}은(는) ${SPECIES[foes[0].species].name}을(를) 내보냈다!` },
      { t: 'text', text: `가라, ${SPECIES[p.party[myIdx].species].name}!` },
    ];
    return { state: st, update: { view: this.view(p, st), log } };
  }

  view(p: PlayerState, st: BattleState): BattleView {
    const tr = st.tr;
    return {
      kind: st.kind, bg: st.bg,
      trainer: tr ? { name: tr.name, title: tr.title, sprite: tr.sprite, left: st.foes.filter((f) => f.hp > 0).length } : undefined,
      me: view(p.party[st.myIdx]), foe: view(st.foes[st.foeIdx]),
      party: p.party.map((c) => ({ uid: c.uid, species: c.species, name: SPECIES[c.species].name, level: c.level, hp: c.hp, maxHp: stats(c).maxHp })),
      bag: { ...p.bag },
    };
  }

  // ── 한 턴 ──────────────────────────────────────────
  move(p: PlayerState, st: BattleState, index: number) {
    const me = p.party[st.myIdx], foe = st.foes[st.foeIdx];
    const log: BattleLog[] = [];
    // PP: 남은 횟수가 없으면 못 씀 (다른 기술이 남았으면 턴을 쓰지 않고 다시 고름). 전부 0 이면 발버둥
    const i = me.moves[index] ? index : 0;
    let myMove = me.moves[i];
    const anyLeft = me.moves.some((_, k) => ppLeft(me, k) > 0);
    if (!anyLeft) myMove = 'struggle';
    else if (ppLeft(me, i) <= 0) { log.push({ t: 'text', text: '기술의 남은 PP가 없다!' }); return { view: this.view(p, st), log }; }
    else { if (!me.pp || me.pp.length !== me.moves.length) syncPp(me); me.pp![i] = ppLeft(me, i) - 1; }
    const foeMove = this.foeChoice(st, foe);
    const mPri = MOVES[myMove].priority, fPri = MOVES[foeMove].priority;
    const meFirst = mPri !== fPri ? mPri > fPri : stats(me).spd * stageMul(0) >= stats(foe).spd || (stats(me).spd === stats(foe).spd && this.rand() < 0.5);
    const order: ['me' | 'foe', string][] = meFirst ? [['me', myMove], ['foe', foeMove]] : [['foe', foeMove], ['me', myMove]];
    for (const [side, mv] of order) {
      if (st.over) break;
      const atk = side === 'me' ? p.party[st.myIdx] : st.foes[st.foeIdx];
      if (atk.hp <= 0) continue;
      this.useMove(p, st, side, mv, log);
      if (this.checkFaints(p, st, log)) break;
    }
    return this.finish(p, st, log);
  }

  /** 아이템 사용 (루미볼 / 회복약 / 도핑약) — 상대가 공격할 기회를 가짐 */
  item(p: PlayerState, st: BattleState, itemId: string) {
    const log: BattleLog[] = [];
    const def = ITEMS[itemId];
    if (!def || (p.bag[itemId] ?? 0) <= 0) return { ok: false as const, reason: 'no-item' };
    if (def.catchBonus) {
      if (st.kind === 'trainer') { log.push({ t: 'text', text: '남의 루미는 잡을 수 없어요!' }); return { ok: true as const, update: { view: this.view(p, st), log } }; }
      p.bag[itemId]--;
      const foe = st.foes[st.foeIdx], s = stats(foe);
      const hpFactor = 1 - (foe.hp / s.maxHp) * 0.7;
      const sp = SPECIES[foe.species];
      // 태초볼(catchBonus ≥ 100)은 반드시 · 환상 루미는 체력과 상관없이 고정 확률(0.1%)
      const chance = def.catchBonus >= 100 ? 1 : sp.fixedCatch != null ? sp.fixedCatch : Math.min(0.97, sp.catchRate * def.catchBonus * (0.35 + hpFactor * 1.1));
      const success = this.rand() < chance;
      const shakes = success ? 3 : chance > 0.5 ? 2 : chance > 0.2 ? 1 : 0;
      log.push({ t: 'text', text: `${def.name}을(를) 던졌다!` });
      log.push({ t: 'throw', item: itemId, shakes, success });
      if (success) {
        const name = SPECIES[foe.species].name;
        log.push({ t: 'text', text: `신난다! ${name}을(를) 붙잡았다!` });
        if (!p.caught.includes(foe.species)) { p.caught.push(foe.species); log.push({ t: 'text', text: `${name}의 정보가 루미 도감에 새로 등록되었다!` }); }
        foe.uid = `${foe.species}-${Date.now().toString(36)}-${(uidSeq++).toString(36)}`;
        if (p.party.length < 6) p.party.push(foe); else { p.box.push(foe); log.push({ t: 'text', text: `파티가 가득 차서 ${name}은(는) 보관함으로 보내졌다.` }); }
        st.over = true;
        return { ok: true as const, update: { view: this.view(p, st), log, ended: 'caught' as const } };
      }
      log.push({ t: 'text', text: ['아깝다! 볼에서 빠져나왔다!', '조금만 더였는데...!', '앗, 볼이 흔들리더니 빠져나왔다!'][shakes] ?? '빠져나왔다!' });
    } else if (def.heal) {
      p.bag[itemId]--;
      const me = p.party[st.myIdx], max = stats(me).maxHp;
      me.hp = Math.min(max, me.hp + def.heal);
      log.push({ t: 'text', text: `${def.name}을(를) 사용했다! ${SPECIES[me.species].name}의 체력이 회복되었다.` });
      log.push({ t: 'hp', side: 'me', hp: me.hp, maxHp: max });
    } else if (def.boost) {
      p.bag[itemId]--;
      const me = p.party[st.myIdx], name = SPECIES[me.species].name;
      log.push({ t: 'text', text: `${def.name}을(를) 사용했다!` });
      for (const [k, v] of Object.entries(def.boost) as ['atk' | 'def', number][]) {
        const before = st.stage.me[k]; st.stage.me[k] = Math.min(6, before + v);
        const stat = k === 'atk' ? ['공격은', '공격이'] : ['방어는', '방어가'];
        log.push({ t: 'text', text: st.stage.me[k] === before ? `${name}의 ${stat[0]} 더 오르지 않는다!` : `${name}의 ${stat[1]} 크게 올랐다!` });
      }
    } else return { ok: false as const, reason: 'not-usable' };
    this.foeTurn(p, st, log);
    return { ok: true as const, update: this.finish(p, st, log) };
  }

  switchTo(p: PlayerState, st: BattleState, index: number) {
    const log: BattleLog[] = [];
    const c = p.party[index];
    if (!c || c.hp <= 0 || index === st.myIdx) return null;
    log.push({ t: 'text', text: `돌아와, ${SPECIES[p.party[st.myIdx].species].name}! 가라, ${SPECIES[c.species].name}!` });
    st.myIdx = index; st.stage.me = { atk: 0, def: 0 }; st.participants.add(c.uid);
    log.push({ t: 'send', side: 'me', view: view(c) });
    this.foeTurn(p, st, log);
    return this.finish(p, st, log);
  }

  run(p: PlayerState, st: BattleState) {
    const log: BattleLog[] = [];
    if (st.kind === 'trainer') { log.push({ t: 'text', text: '트레이너와의 승부에서는 도망칠 수 없다!' }); return { view: this.view(p, st), log }; }
    const me = stats(p.party[st.myIdx]), foe = stats(st.foes[st.foeIdx]);
    if (this.rand() < 0.55 + Math.min(0.4, (me.spd - foe.spd) / 40)) {
      log.push({ t: 'text', text: '무사히 도망쳤다!' }); st.over = true;
      return { view: this.view(p, st), log, ended: 'run' as const };
    }
    log.push({ t: 'text', text: '도망칠 수 없었다!' });
    this.foeTurn(p, st, log);
    return this.finish(p, st, log);
  }

  // ── 내부 ──────────────────────────────────────────
  private foeTurn(p: PlayerState, st: BattleState, log: BattleLog[]) {
    if (st.over) return;
    const foe = st.foes[st.foeIdx];
    if (foe.hp <= 0) return;
    this.useMove(p, st, 'foe', this.foeChoice(st, foe), log);
    this.checkFaints(p, st, log);
  }

  /** 상대 기술 선택: 보통은 무작위, 라이벌 각본이면 2턴 주고받은 뒤 버프·디버프만 */
  private foeChoice(st: BattleState, foe: CreatureInst) {
    st.turn++;
    if (st.script === 'rival') {
      const status = foe.moves.filter((m) => MOVES[m].power === 0);
      const attack = foe.moves.find((m) => MOVES[m].power > 0) ?? foe.moves[0];
      if (st.turn <= 2) return attack;
      return status[st.turn % status.length] ?? attack;
    }
    return foe.moves[Math.floor(this.rand() * foe.moves.length)];
  }

  private useMove(p: PlayerState, st: BattleState, side: 'me' | 'foe', moveId: string, log: BattleLog[]) {
    const atk = side === 'me' ? p.party[st.myIdx] : st.foes[st.foeIdx];
    const def = side === 'me' ? st.foes[st.foeIdx] : p.party[st.myIdx];
    const other = side === 'me' ? 'foe' : 'me';
    const m = MOVES[moveId], an = SPECIES[atk.species].name, dn = SPECIES[def.species].name;
    const prefix = side === 'foe' ? (st.kind === 'wild' ? '야생 ' : '상대 ') : '';
    log.push({ t: 'text', text: `${prefix}${an}의 ${m.name}!` });
    log.push({ t: 'attack', side, move: moveId, type: m.type });
    if (this.rand() * 100 > m.accuracy) { log.push({ t: 'text', text: '그러나 빗나갔다!' }); return; }
    if (m.category === 'heal') {
      const max = stats(atk).maxHp; atk.hp = Math.min(max, atk.hp + Math.ceil(max / 2));
      log.push({ t: 'hp', side, hp: atk.hp, maxHp: max }); log.push({ t: 'text', text: `${an}의 체력이 회복되었다!` }); return;
    }
    if (m.category === 'debuffAtk' || m.category === 'debuffDef' || m.category === 'buffDef') {
      const target = m.category === 'buffDef' ? st.stage[side] : st.stage[other];
      const key = m.category === 'debuffAtk' ? 'atk' : 'def';
      const delta = m.category === 'buffDef' ? 1 : -1;
      if (Math.abs(target[key] + delta) > 4) { log.push({ t: 'text', text: '그러나 더 이상 변하지 않는다!' }); return; }
      target[key] += delta;
      const who = m.category === 'buffDef' ? an : dn;
      log.push({ t: 'text', text: `${who}의 ${key === 'atk' ? '공격' : '방어'}이(가) ${delta > 0 ? '올라갔다' : '떨어졌다'}!` });
      return;
    }
    const sa = stats(atk), sd = stats(def);
    const A = sa.atk * stageMul(st.stage[side].atk), D = sd.def * stageMul(st.stage[other].def);
    const eff = effectiveness(m.type, SPECIES[def.species].type);
    const stab = m.type === SPECIES[atk.species].type ? 1.25 : 1;
    const crit = this.rand() < 0.0625;
    const base = (((2 * atk.level) / 5 + 2) * m.power * (A / D)) / 40 + 2;
    let dmg = Math.max(1, Math.floor(base * stab * eff * (crit ? 1.5 : 1) * (0.85 + this.rand() * 0.15)));
    // 라이벌 첫 대결: 상대 공격으로 주인공 루미가 쓰러지지는 않음
    if (st.script === 'rival' && side === 'foe') dmg = Math.max(0, Math.min(Math.ceil(dmg * 0.7), def.hp - 1));
    def.hp = Math.max(0, def.hp - dmg);
    log.push({ t: 'hp', side: other, hp: def.hp, maxHp: sd.maxHp, eff, crit });
    if (moveId === 'struggle') {
      atk.hp = Math.max(0, atk.hp - Math.max(1, Math.floor(sa.maxHp / 4)));
      log.push({ t: 'hp', side, hp: atk.hp, maxHp: sa.maxHp });
      log.push({ t: 'text', text: `${an}은(는) 반동으로 데미지를 입었다!` });
    }
    if (crit) log.push({ t: 'text', text: '급소에 맞았다!' });
    if (eff > 1) log.push({ t: 'text', text: '효과가 굉장했다!' });
    else if (eff < 1) log.push({ t: 'text', text: '효과가 별로인 듯하다...' });
  }

  /** 기절 처리. 배틀이 끝나면 true */
  private checkFaints(p: PlayerState, st: BattleState, log: BattleLog[]): boolean {
    const foe = st.foes[st.foeIdx];
    if (foe.hp <= 0) {
      const fn = SPECIES[foe.species].name;
      log.push({ t: 'faint', side: 'foe' });
      log.push({ t: 'text', text: `${st.kind === 'wild' ? '야생 ' : '상대 '}${fn}은(는) 쓰러졌다!` });
      this.giveExp(p, st, foe, log);
      const next = st.foes.findIndex((f) => f.hp > 0);
      if (next >= 0) {
        st.foeIdx = next; st.stage.foe = { atk: 0, def: 0 };
        st.participants = new Set([p.party[st.myIdx].uid]);
        const tr = st.tr!;
        log.push({ t: 'text', text: `${tr.name}은(는) ${SPECIES[st.foes[next].species].name}을(를) 내보냈다!` });
        log.push({ t: 'send', side: 'foe', view: view(st.foes[next]) });
        return true;
      }
      st.over = true;
      return true;
    }
    const me = p.party[st.myIdx];
    if (me.hp <= 0) {
      log.push({ t: 'faint', side: 'me' });
      log.push({ t: 'text', text: `${SPECIES[me.species].name}은(는) 쓰러졌다!` });
      const next = p.party.findIndex((c) => c.hp > 0);
      if (next >= 0) {
        st.myIdx = next; st.stage.me = { atk: 0, def: 0 }; st.participants.add(p.party[next].uid);
        log.push({ t: 'text', text: `가라, ${SPECIES[p.party[next].species].name}!` });
        log.push({ t: 'send', side: 'me', view: view(p.party[next]) });
        return true;
      }
      st.over = true;
      return true;
    }
    return false;
  }

  private giveExp(p: PlayerState, st: BattleState, foe: CreatureInst, log: BattleLog[]) {
    const bonus = SPECIES[p.party[0]?.species]?.helps === 'exp' ? 1.25 : 1;
    const total = Math.floor(((SPECIES[foe.species].expYield * foe.level) / 6) * (st.kind === 'trainer' ? 1.5 : 1) * bonus);
    const members = p.party.filter((c) => st.participants.has(c.uid) && c.hp > 0);
    for (const c of members) {
      const gain = Math.max(1, Math.floor(total / members.length));
      c.exp += gain;
      log.push({ t: 'text', text: `${SPECIES[c.species].name}은(는) 경험치 ${gain}을(를) 얻었다!` });
      let leveled = false;
      while (c.exp >= expToNext(c.level) && c.level < MAX_LEVEL) {
        c.exp -= expToNext(c.level); const before = stats(c).maxHp; c.level++; leveled = true;
        c.hp = Math.min(stats(c).maxHp, c.hp + (stats(c).maxHp - before));
        log.push({ t: 'text', text: `${SPECIES[c.species].name}의 레벨이 ${c.level}(으)로 올랐다!` });
        const learn = SPECIES[c.species].learnset.filter(([lv]) => lv === c.level).map(([, m]) => m);
        for (const mv of learn) if (!c.moves.includes(mv)) {
          const before = { moves: [...c.moves], pp: c.pp ? [...c.pp] : undefined };
          if (c.moves.length >= 4) c.moves.shift();
          c.moves.push(mv);
          syncPp(c, before);
          log.push({ t: 'text', text: `${SPECIES[c.species].name}은(는) 새로 ${MOVES[mv].name}을(를) 배웠다!` });
        }
      }
      if (c === p.party[st.myIdx]) log.push({ t: 'exp', exp: c.exp, expNext: expToNext(c.level), level: c.level, leveled });
      // 진화: 정해진 레벨에 닿으면 다음 모습으로 (도감에도 등록)
      const evo = SPECIES[c.species].evolves;
      if (leveled && evo && c.level >= evo.level && SPECIES[evo.to]) {
        const from = SPECIES[c.species].name, before = stats(c).maxHp;
        c.species = evo.to;
        c.hp = Math.min(stats(c).maxHp, c.hp + (stats(c).maxHp - before));
        if (!p.seen.includes(evo.to)) p.seen.push(evo.to);
        if (!p.caught.includes(evo.to)) p.caught.push(evo.to);
        log.push({ t: 'text', text: `…어라? ${from}의 모습이…!` }, { t: 'text', text: `축하합니다! ${from}은(는) ${SPECIES[evo.to].name}(으)로 진화했다!` });
      }
    }
  }

  private finish(p: PlayerState, st: BattleState, log: BattleLog[]): BattleUpdate {
    let ended: BattleUpdate['ended'];
    if (st.over) ended = st.foes.every((f) => f.hp <= 0) ? 'win' : 'lose';
    return { view: this.view(p, st), log, ended };
  }
}
