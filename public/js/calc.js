// Formulas mirror skills.txt / monstats.txt / monpet.txt (see scripts/build-data.mjs).
// Calc codes: lnXY = parX + (lvl-1)*parY, dmXY = diminishing returns between parX and parY.
import { DATA } from './data.js';

export const DIFFS = ['Normal', 'Nightmare', 'Hell'];
export const QUALITIES = ['Normal', 'Champion', 'Unique', 'Minion'];

// row/col are the in-game Demon tab positions (skilldesc.txt)
export const TREE = [
  { id: 'Demonic Mastery', row: 1, col: 1, passive: true, desc: 'Passive - Enhances your summoned and bound demons' },
  { id: 'Summon Goatman', row: 1, col: 3, desc: 'Summons a Goatman to fight by your side' },
  { id: 'Blood Oath', row: 2, col: 1, passive: true, desc: 'Passive - Bind the lifeforce of your demon to protect from enemy attacks' },
  { id: 'Death Mark', row: 2, col: 2, desc: 'Forces your demon to teleport to and attack an enemy' },
  { id: 'Summon Tainted', row: 3, col: 3, desc: 'Summons a Tainted to fight by your side' },
  { id: 'Blood Boil', row: 4, col: 2, desc: "Erupt your demon's blood to damage nearby enemies" },
  { id: 'Summon Defiler', row: 4, col: 3, desc: 'Summons a defiler that binds enemy souls together to take shared damage' },
  { id: 'Engorge', row: 5, col: 2, desc: 'Heal and empower your demon by feeding it a corpse' },
  { id: 'Consume', row: 6, col: 1, desc: 'Sacrifice your demon in exchange for power' },
  { id: 'Bind Demon', row: 6, col: 3, desc: 'Force an injured demon to do your bidding' },
].map((t) => ({ ...t, req: DATA.skills[t.id].req, reqlevel: DATA.skills[t.id].reqlevel }));

export function defaultState() {
  return {
    difficulty: 2, allSkills: 0, treeSkills: 0,
    engorge: false, deathMark: false, frenzy: false, // active effects currently on the demons
    skills: Object.fromEntries(TREE.map((t) => [t.id, { base: 0, bonus: 0 }])),
    bound: { monster: '', quality: 0, difficulty: 2, mlvl: null, players: 1 },
  };
}

const int = (v) => Math.max(0, Math.trunc(Number(v) || 0));
const S = (name) => DATA.skills[name];
const ln = (name, a, b, lvl) => (lvl > 0 ? S(name).par[a] + (lvl - 1) * S(name).par[b] : 0);
const dm = (name, a, b, lvl) => {
  if (lvl <= 0) return 0;
  const p = S(name).par;
  return Math.trunc((110 * lvl * (p[b] - p[a])) / (100 * (lvl + 6))) + p[a];
};
// elemental / physical per-level damage brackets: 2-8, 9-16, 17-22, 23-28, 29+
function bracket(t, lvl) {
  const span = [[1, 8], [8, 16], [16, 22], [22, 28], [28, Infinity]];
  return span.reduce((sum, [lo, hi], i) => sum + Math.max(0, Math.min(lvl, hi) - lo) * t[i + 1], t[0]);
}
const skillDmg = (name, key, lvl, synPct = 0) =>
  Math.trunc((Math.trunc((bracket(S(name)[key], lvl) * 2 ** S(name).hitshift) / 256) * (100 + synPct)) / 100);

/** Base points and effective level of every tree skill. */
export function levels(state) {
  const out = {};
  for (const t of TREE) {
    const s = state.skills[t.id] || {};
    const base = Math.min(20, int(s.base)), bonus = int(s.bonus);
    // +all/+tree only apply once a hard point is spent; "+X to <skill>" items grant the skill by themselves
    out[t.id] = { base, lvl: base > 0 ? base + bonus + int(state.allSkills) + int(state.treeSkills) : bonus };
  }
  return out;
}

const maxDemons = (L) => (L['Demonic Mastery'].base >= 10 ? 3 : L['Demonic Mastery'].base >= 5 ? 2 : 1);
const marked = (sh) => (sh.markDmg ? `, +${sh.markDmg} vs marked target` : '');
const pct = (v) => `${v >= 0 ? '+' : ''}${v}%`;
const sec = (frames) => `${+(frames / 25).toFixed(1)}s`;
const RES = [['fi', 'Fire'], ['co', 'Cold'], ['li', 'Lightning'], ['po', 'Poison'], ['ma', 'Magic']];

const CONSUME_LABEL = {
  fireresist: 'Fire Resist +{v}%', coldresist: 'Cold Resist +{v}%', lightresist: 'Lightning Resist +{v}%',
  poisonresist: 'Poison Resist +{v}%', magicresist: 'Magic Resist +{v}%',
  maxfireresist: 'Maximum Fire Resist +{v}%', maxcoldresist: 'Maximum Cold Resist +{v}%',
  maxlightresist: 'Maximum Lightning Resist +{v}%', maxpoisonresist: 'Maximum Poison Resist +{v}%',
  maxmagicresist: 'Maximum Magic Resist +{v}%',
  passive_fire_pierce: '-{v}% to Enemy Fire Resistance', passive_cold_pierce: '-{v}% to Enemy Cold Resistance',
  passive_ltng_pierce: '-{v}% to Enemy Lightning Resistance', passive_mag_pierce: '-{v}% to Enemy Magic Resistance',
  passive_fire_mastery: '+{v}% to Fire Skill Damage', passive_mag_mastery: '+{v}% to Magic Skill Damage',
  damageresist: 'Physical Damage Reduced by {v}%', damagepercent: '+{v}% Enhanced Damage',
  item_allskills: '+{v} to All Skills', item_crushingblow: '{v}% Chance of Crushing Blow',
  item_aura: 'Level {v} {p} Aura',
};

/** What the Warlock gains from consuming this demon (Consume + the monster's own bonus). */
function consumeBonus(list, state, L, diff) {
  const c = L.Consume.lvl;
  if (!c) return null;
  const lines = [
    `Duration: ${sec(ln('Consume', 1, 2, c))}`,
    `Max Life: ${pct(ln('Consume', 3, 4, c))}`,
    `Run/Walk Speed: ${pct(dm('Consume', 5, 6, c))}`,
  ];
  for (const b of list) {
    // expressions come from our own generated data file, never from user input
    const v = Math.trunc(new Function('c', 'diff', 'dmk', `return ${b.expr}`)(c, diff + 1, L['Death Mark'].base));
    lines.push((CONSUME_LABEL[b.stat] || `${b.stat}: {v}`).replace('{v}', v).replace('{p}', b.par || ''));
  }
  return lines;
}

function shared(state, L, base, d) {
  const eng = state.engorge ? L.Engorge.lvl : 0;
  const bo = L['Blood Oath'];
  const taintedAura = L['Summon Tainted'].lvl ? dm('Tainted Resist Fire', 3, 4, Math.min(L['Summon Tainted'].lvl, 30)) : 0;
  const resAll = dm('Blood Oath', 7, 8, bo.lvl);
  const mark = state.deathMark ? L['Death Mark'].lvl : 0;
  return {
    eng,
    // Death Mark lowers the target's flat damage reduction below zero: every physical or magic hit lands for that much more
    markDmg: -ln('Death Mark', 1, 2, mark),
    mark: mark && ['Marked Target', `takes +${-ln('Death Mark', 1, 2, mark)} damage per hit, ${ln('Death Mark', 5, 6, mark)} Defense`, `Death Mark, lasts ${sec(ln('Death Mark', 3, 4, mark))}`],
    engIas: eng ? Math.min(ln('Engorge', 1, 2, eng), 35) : 0,
    engAc: eng ? bo.base * S('Blood Oath').par[11] : 0,
    velocity: dm('Demonic Mastery', 9, 10, L['Demonic Mastery'].lvl),
    physRes: base.res.dm[d] + dm('Blood Oath', 9, 10, bo.lvl) + (eng ? S('Engorge').par[7] : 0),
    res: RES.map(([k, label]) => ({ label, v: base.res[k][d] + resAll + (k === 'fi' ? taintedAura : 0) })),
    extra: eng ? [
      ['Life Steal', pct(ln('Engorge', 11, 12, eng))],
      ['Replenish Life', `+${bo.base * S('Blood Oath').par[12]}`],
    ] : [],
  };
}

function common(out, sh, base, d) {
  out.rows.push(
    ['Run/Walk Speed', pct(sh.velocity), 'Demonic Mastery' + (sh.frenzied ? ' + Frenzy' : '')],
    ['Physical Resist', `${sh.physRes}%`, 'base + Blood Oath' + (sh.eng ? ' + Engorge' : '')],
    ['Resistances', sh.res.map((r) => `${r.label} ${r.v}%`).join(' · '), 'base + Blood Oath (fire incl. Tainted aura)'],
    ['Block', `${base.block[d]}%`],
    ...sh.extra,
  );
  if (sh.mark) out.rows.push(sh.mark);
  return out;
}

function summonLife(skill, base, d, L) {
  const lvl = L[skill].lvl;
  const lifePct = S(skill).par[1] * (lvl - 1) + ln('Blood Oath', 5, 6, L['Blood Oath'].lvl);
  return { lifePct, life: Math.trunc((base.hp[d][0] * (100 + lifePct)) / 100) };
}

export function goatman(state) {
  const L = levels(state), d = state.difficulty, lvl = L['Summon Goatman'].lvl, base = DATA.summons.wargoatman;
  if (!lvl) return null;
  const sk = 'Summon Goatman', sh = shared(state, L, base, d), dmL = L['Demonic Mastery'].lvl;
  const { life, lifePct } = summonLife(sk, base, d, L);
  const dmgPct = ln(sk, 5, 6, lvl) + ln('Demonic Mastery', 11, 12, dmL), flat = ln(sk, 3, 4, lvl);
  const dmg = base.d1[d].map((v) => Math.trunc(((v + flat) * (100 + dmgPct)) / 100) + sh.markDmg);
  const acBonus = ln(sk, 9, 10, lvl) + sh.engAc;
  const frenzy = state.frenzy && lvl >= 4 ? dm('Goatman Frenzy', 3, 4, lvl) : 0;
  sh.velocity += frenzy; sh.frenzied = frenzy > 0;
  const ar = base.th[d] + ln('Demonic Mastery', 5, 6, dmL) + ln(sk, 7, 8, lvl);
  const ias = Math.min(ln(sk, 11, 12, lvl), 25) + Math.min(ln('Demonic Mastery', 1, 2, dmL), 25) + sh.engIas + frenzy;
  const cb = L['Death Mark'].base * S(sk).par[2] + 5;
  const abilities = [];
  if (lvl >= 2) abilities.push(['Stun', `${pct(10 + lvl * 5)} Attack Rating, stuns for ${sec(Math.min(250, bracketLen(lvl)))}`]);
  if (lvl >= 3) abilities.push(['Berserk', `${pct(ln('Goatman Berserk', 1, 2, lvl))} magic damage, ${pct(S('Goatman Berserk').tohit + (lvl - 1) * S('Goatman Berserk').levtohit)} Attack Rating`]);
  if (lvl >= 4) abilities.push(['Frenzy', `${pct(dm('Goatman Frenzy', 3, 4, lvl))} attack & movement speed for ${sec(ln('Goatman Frenzy', 1, 2, lvl))}`]);
  if (lvl >= 5) abilities.push(['Cleave', `${pct(ln('Goatman Cleave', 1, 2, lvl))} damage in a 132° arc, ${pct(dm('Goatman Cleave', 3, 4, lvl))} attack speed, ${pct(S('Goatman Cleave').tohit + (lvl - 1) * S('Goatman Cleave').levtohit)} Attack Rating`]);
  return common({
    lvl, max: maxDemons(L), life, dmg, ar, defense: base.ac[d] + acBonus, ias, cb,
    rows: [
      ['Life', life, `${base.hp[d][0]} base ${pct(lifePct)}`],
      ['Damage', `${dmg[0]}-${dmg[1]}`, `(${base.d1[d].join('-')} base +${flat}) ${pct(dmgPct)}${marked(sh)}`],
      ['Attack Rating', ar, `${base.th[d]} base +${ar - base.th[d]}`],
      ['Defense', base.ac[d] + acBonus, `${base.ac[d]} base +${acBonus}`],
      ['Attack Speed', pct(ias), 'skill (max 25) + Demonic Mastery (max 25)' + (sh.eng ? ' + Engorge' : '') + (frenzy ? ' + Frenzy' : '')],
      ['Crushing Blow', `${cb}%`, '5% + 1% per base Death Mark level'],
    ],
    abilities, consume: consumeBonus(base.consume, state, L, d),
  }, sh, base, d);
}
function bracketLen(lvl) {
  const e = S('Goatman Stun').elen;
  return e[0] + Math.max(0, Math.min(lvl, 8) - 1) * e[1] + Math.max(0, Math.min(lvl, 16) - 8) * e[2] + Math.max(0, lvl - 16) * e[3];
}

function fireBall(lvl, L) {
  const syn = L['Blood Boil'].base * S('Tainted Fire Ball').par[8];
  const mastery = ln('Demonic Mastery', 11, 12, L['Demonic Mastery'].lvl); // Tainted has no fire mastery of its own
  return ['emin', 'emax'].map((k) => { const v = skillDmg('Tainted Fire Ball', k, lvl, syn); return v + Math.trunc((v * mastery) / 100); });
}

export function tainted(state) {
  const L = levels(state), d = state.difficulty, lvl = L['Summon Tainted'].lvl, base = DATA.summons.warbighead;
  if (!lvl) return null;
  const sk = 'Summon Tainted', sh = shared(state, L, base, d), dmL = L['Demonic Mastery'].lvl;
  const { life, lifePct } = summonLife(sk, base, d, L);
  const fire = fireBall(lvl, L), auraLvl = Math.min(lvl, 30);
  const acBonus = ln(sk, 7, 8, lvl) + sh.engAc;
  const ias = Math.min(ln(sk, 11, 12, lvl), 25) + Math.min(ln('Demonic Mastery', 1, 2, dmL), 25) + sh.engIas;
  return common({
    lvl, max: maxDemons(L), life, fire, defense: base.ac[d] + acBonus, ias,
    rows: [
      ['Life', life, `${base.hp[d][0]} base ${pct(lifePct)}`],
      ['Fire Ball Damage', `${fire[0]}-${fire[1]}`, `level ${lvl} Fire Ball, +${S('Tainted Fire Ball').par[8]}% per base Blood Boil level, ${pct(ln('Demonic Mastery', 11, 12, dmL))} from Demonic Mastery`],
      ['Defense', base.ac[d] + acBonus, `${base.ac[d]} base +${acBonus}`],
      ['Attack Speed', pct(ias), 'skill (max 25) + Demonic Mastery (max 25)' + (sh.eng ? ' + Engorge' : '')],
    ],
    abilities: [
      ['Resist Fire Aura', `${pct(dm('Tainted Resist Fire', 3, 4, auraLvl))} fire resist to you and your party, ${+(ln('Tainted Resist Fire', 1, 2, auraLvl) * 2 / 3).toFixed(1)} yard radius`],
      ...(L['Blood Boil'].base ? [['Blood Boil', `casts your level ${L['Blood Boil'].base} Blood Boil`]] : []),
    ],
    consume: consumeBonus(base.consume, state, L, d),
  }, sh, base, d);
}

export function defiler(state) {
  const L = levels(state), d = state.difficulty, lvl = L['Summon Defiler'].lvl, base = DATA.summons.warputriddefiler;
  if (!lvl) return null;
  const sk = 'Summon Defiler', sh = shared(state, L, base, d), dmS = L['Demonic Mastery'];
  const { life, lifePct } = summonLife(sk, base, d, L);
  const dmgPct = S(sk).par[2] * (lvl - 1 + dmS.base);
  const dmg = base.d1[d].map((v) => Math.trunc((v * (100 + dmgPct)) / 100) + sh.markDmg);
  const acBonus = ln(sk, 7, 8, lvl) + sh.engAc;
  const ias = Math.min(ln('Demonic Mastery', 1, 2, dmS.lvl), 25) + sh.engIas;
  return common({
    lvl, max: maxDemons(L), life, dmg, defense: base.ac[d] + acBonus, ias,
    rows: [
      ['Life', life, `${base.hp[d][0]} base ${pct(lifePct)}`],
      ['Damage', `${dmg[0]}-${dmg[1]}`, `${base.d1[d].join('-')} base ${pct(dmgPct)}${marked(sh)}`],
      ['Attack Rating', base.th[d], 'base'],
      ['Defense', base.ac[d] + acBonus, `${base.ac[d]} base +${acBonus}`],
      ['Attack Speed', pct(ias), 'Demonic Mastery (max 25)' + (sh.eng ? ' + Engorge' : '')],
    ],
    abilities: [['Health Link', `${dm('Health Link', 1, 2, lvl)}% of damage shared between up to ${dm('Health Link', 3, 4, lvl)} bound souls`]],
    consume: consumeBonus(base.consume, state, L, d),
  }, sh, base, d);
}

// monster life multipliers by quality per difficulty: normal, champion, unique, minion
const HP_MULT = [[1, 1, 1], [3, 2.5, 2], [4, 3, 2], [2, 1.75, 1.5]];
const LVL_ADD = [0, 2, 3, 3];
const ELITE_DIV = [5, 10, 20, 20], ELITE_REQ = [0, 10, 15, 15];

export const monster = (id) => DATA.monsters.find((m) => m.id === id);
export const boundQuality = (m, b) => (m.su ? 2 : int(b.quality) % 4);
export const defaultMlvl = (m, b) => Math.min(110, m.lvl[b.difficulty] + LVL_ADD[boundQuality(m, b)]);

export function bound(state) {
  const b = state.bound, m = monster(b.monster);
  if (!m) return null;
  const L = levels(state), d = b.difficulty, q = boundQuality(m, b);
  const lvl = L['Bind Demon'].lvl, blvl = L['Bind Demon'].base, dmL = L['Demonic Mastery'].lvl;
  const mlvl = Math.min(110, Math.max(1, int(b.mlvl) || defaultMlvl(m, b)));
  const players = Math.min(8, Math.max(1, int(b.players) || 1));
  const ML = m.noRatio ? { hp: [100, 100, 100], ac: [100, 100, 100], th: [100, 100, 100], dm: [100, 100, 100] } : DATA.monlvl[mlvl];
  const sh = shared(state, L, m, d);

  const cap = m.bind.cap + m.bind.capPer * (players - 1);
  const raw = m.hp[d].map((p) => Math.trunc((ML.hp[d] * p) / 100 * HP_MULT[q][d] * (players + 1) / 2));
  const life = raw.map((v) => (v > m.bind.cap ? Math.min(v, cap) : v));
  const capped = raw[1] > m.bind.cap;

  const dmgPct = ln('Bind Demon', 5, 6, lvl) + ln('Demonic Mastery', 11, 12, dmL), flat = ln('Bind Demon', 13, 14, lvl);
  const attack = (dd) => dd[d].map((p) => Math.trunc(((Math.trunc((ML.dm[d] * p) / 100) + flat) * (100 + dmgPct)) / 100) + sh.markDmg);
  const dmg = attack(m.d1), dmg2 = m.d2 && attack(m.d2);
  const baseAc = Math.trunc((ML.ac[d] * m.ac[d]) / 100), acBonus = ln('Bind Demon', 9, 10, lvl) + sh.engAc;
  const baseAr = Math.trunc((ML.th[d] * m.th[d]) / 100);
  const ar = baseAr + ln('Demonic Mastery', 5, 6, dmL) + ln('Bind Demon', 7, 8, lvl);
  const ias = Math.min(ln('Demonic Mastery', 1, 2, dmL), 25) + sh.engIas;

  const affixes = [
    lvl >= 5 && ['Extra Strong', `×2.5 damage (≈ ${dmg.map((v) => Math.trunc(v * 2.5)).join('-')}), +25% Attack Rating`],
    lvl >= 10 && ['Extra Fast', 'greatly increased movement and attack speed'],
    lvl >= 15 && ['Spectral Hit', 'adds random elemental damage, doubles Attack Rating, +20% fire/cold/lightning resist'],
    lvl >= 20 && ['Aura Enchanted', 'gains a random Paladin aura'],
    ...(m.mods || []).map((x) => [x, 'native super unique modifier']),
  ].filter(Boolean);

  const div = m.bind.div || ELITE_DIV[q], req = m.bind.req || ELITE_REQ[q];
  const skillChance = dm('Bind Demon', 3, 4, lvl) + L['Death Mark'].base;
  const chance = (hp) => (lvl && blvl >= req && hp < m.bind.thr ? skillChance + Math.trunc((100 - hp) / div) : 0);

  const fmtLife = life[0] === life[1] ? `${life[0]}` : `${life[0]}-${life[1]}`;
  const out = {
    name: m.name, lvl, mlvl, players, life, dmg, ar, defense: baseAc + acBonus, ias, capped,
    bind: { req, canBind: lvl > 0 && blvl >= req, threshold: m.bind.thr, atThreshold: chance(m.bind.thr - 1), atLow: chance(1), underlings: m.bind.und },
    rows: [
      ['Life', fmtLife, capped ? `capped at ${cap} (${m.bind.cap} +${m.bind.capPer} per extra player); uncapped ${raw.join('-')}` : `level ${mlvl} ${DIFFS[d]} ${QUALITIES[q].toLowerCase()}, players ${players}`],
      ['Damage', `${dmg[0]}-${dmg[1]}`, `(base +${flat}) ${pct(dmgPct)} from Bind Demon + Demonic Mastery${marked(sh)}`],
      ...(dmg2 ? [['Damage (2nd attack)', `${dmg2[0]}-${dmg2[1]}`]] : []),
      ['Attack Rating', ar, `${baseAr} base +${ar - baseAr}`],
      ['Defense', baseAc + acBonus, `${baseAc} base +${acBonus}`],
      ['Attack Speed', pct(ias), 'Demonic Mastery (max 25)' + (sh.eng ? ' + Engorge' : '')],
    ],
    abilities: affixes, consume: consumeBonus(m.consume, state, L, d),
  };
  return common(out, sh, m, d);
}

/** In-game style tooltip lines for a tree skill at a given level. */
export function skillLines(id, lvl, state) {
  if (lvl <= 0) return [];
  const L = levels(state), s = S(id);
  // evaluate minions with this skill forced to `lvl` (used for "next level" previews)
  const forced = { ...state, allSkills: 0, treeSkills: 0,
    skills: Object.fromEntries(TREE.map((t) => [t.id, { base: L[t.id].base, bonus: (t.id === id ? lvl : L[t.id].lvl) - L[t.id].base }])) };
  const mana = (s.mana + s.lvlmana * (lvl - 1)) * 2 ** s.manashift / 256;
  const manaLine = `Mana Cost: ${+mana.toFixed(1)}`;
  const minion = (m) => m.rows.slice(0, 5).map(([k, v]) => `${k}: ${v}`);
  switch (id) {
    case 'Summon Goatman': return [manaLine, ...minion(goatman(forced))];
    case 'Summon Tainted': return [manaLine, ...minion(tainted(forced))];
    case 'Summon Defiler': { const m = defiler(forced); return [manaLine, ...minion(m), m.abilities[0][1]]; }
    case 'Demonic Mastery': return [
      `Run/Walk Speed: ${pct(dm(id, 9, 10, lvl))}`, `Damage: ${pct(ln(id, 11, 12, lvl))}`,
      `Attack Speed: ${pct(Math.min(ln(id, 1, 2, lvl), 25))}`, `Attack Rating: +${ln(id, 5, 6, lvl)}`,
      `Max Demons: ${maxDemons(L)} (2 at base level 5, 3 at base level 10)`];
    case 'Blood Oath': return [
      `${pct(dm(id, 1, 2, lvl))} Damage Taken Goes To your demon`, `Physical Damage to your demon Reduced by ${dm(id, 9, 10, lvl)}%`,
      `Resist All for your demon: ${pct(dm(id, 7, 8, lvl))}`, `Life of your demon: ${pct(ln(id, 5, 6, lvl))}`];
    case 'Death Mark': return [
      manaLine, `Duration: ${sec(ln(id, 3, 4, lvl))}`, `Target Defense: ${ln(id, 5, 6, lvl)}`,
      `Damage to target increased by ${-ln(id, 1, 2, lvl)}`, 'Goatman: +1% Crushing Blow per base level', 'Bind Demon: +1% Chance to Bind per base level'];
    case 'Blood Boil': {
      const fire = ['emin', 'emax'].map((k) => skillDmg(id, k, lvl, L['Blood Oath'].base * s.par[8]));
      const phys = ['min', 'max'].map((k) => skillDmg(id, k, lvl, L.Engorge.base * s.par[8]));
      return [manaLine, `Demon's Life Cost: ${Math.max(ln(id, 1, 2, lvl), 5)}%`, `Radius: ${lvl >= 10 ? 7 : lvl >= 5 ? 6 : 5} yards`,
        `Fire Damage: ${fire.join('-')}`, `Damage: ${phys.join('-')}`];
    }
    case 'Engorge': return [
      manaLine, `Duration: ${sec(ln(id, 5, 6, lvl))}`, `Life Steal: ${pct(ln(id, 11, 12, lvl))}`, `Heal Demon's Life: ${pct(ln(id, 3, 4, lvl))}`,
      `Attack Speed: ${pct(Math.min(ln(id, 1, 2, lvl), 35))}`, `Physical Damage to your demon Reduced by ${s.par[7]}%`,
      `Defense: +${L['Blood Oath'].base * S('Blood Oath').par[11]}`, `Replenish Life +${L['Blood Oath'].base * S('Blood Oath').par[12]}`];
    case 'Consume': return [manaLine, `Duration: ${sec(ln(id, 1, 2, lvl))}`, `Run/Walk Speed: ${pct(dm(id, 5, 6, lvl))}`, `Max Life: ${pct(ln(id, 3, 4, lvl))}`,
      'Plus a bonus that depends on the demon consumed'];
    case 'Bind Demon': return [
      `Chance to Bind: ${dm(id, 3, 4, lvl) + L['Death Mark'].base}%`, `Damage +${ln(id, 13, 14, lvl)}`,
      `Damage: ${pct(ln(id, 5, 6, lvl) + ln('Demonic Mastery', 11, 12, L['Demonic Mastery'].lvl))}`,
      `Attack Rating: +${ln(id, 7, 8, lvl) + ln('Demonic Mastery', 5, 6, L['Demonic Mastery'].lvl)}`, `Defense: +${ln(id, 9, 10, lvl)}`,
      ...[[5, 'Extra Strong'], [10, 'Extra Fast'], [15, 'Spectral Hit'], [20, 'Aura Enchanted']].filter(([n]) => lvl >= n).map(([, n]) => `Bound demons gain ${n}`),
      'Base level 10 binds champions, 15 uniques and minions, 20 super uniques'];
  }
  return [];
}
