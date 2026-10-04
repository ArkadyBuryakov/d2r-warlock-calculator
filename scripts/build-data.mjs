// Regenerates public/js/data.js from the blizzhackers/d2data dump of the game's txt tables.
// Usage: node scripts/build-data.mjs [dir-with-cached-json]
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/blizzhackers/d2data/master/json/';
const cache = process.argv[2];
async function load(name) {
  if (cache && existsSync(join(cache, name + '.json'))) return JSON.parse(await readFile(join(cache, name + '.json'), 'utf8'));
  const r = await fetch(BASE + name + '.json');
  if (!r.ok) throw new Error(`${name}: ${r.status}`);
  return r.json();
}
const [skills, monstats, monlvl, monpet, superuniques, monumod, strings] = await Promise.all(
  ['skills', 'monstats', 'monlvl', 'monpet', 'superuniques', 'monumod', 'allstrings-eng'].map((n) =>
    load(n).catch((e) => (n === 'allstrings-eng' ? load('strings') : Promise.reject(e)))));

const D = ['', '(N)', '(H)'];
const n = (v) => (typeof v === 'number' ? v : 0);
const per = (row, key, alt) => D.map((d, i) => n(row[(i && alt ? alt : key) + d]));

// --- skills: keep the params of every skill the calculator evaluates
const SKILLS = ['Summon Goatman', 'Demonic Mastery', 'Death Mark', 'Summon Tainted', 'Summon Defiler', 'Blood Oath',
  'Engorge', 'Blood Boil', 'Consume', 'Bind Demon', 'Goatman Stun', 'Goatman Frenzy', 'Goatman Berserk',
  'Goatman Cleave', 'Tainted Resist Fire', 'Tainted Fire Ball', 'Health Link'];
const skillOut = {};
for (const row of Object.values(skills)) {
  if (!SKILLS.includes(row.skill)) continue;
  const par = [0];
  for (let i = 1; i <= 20; i++) par.push(n(row['Param' + i]));
  const lev = (p) => [n(row[p]), ...[1, 2, 3, 4, 5].map((i) => n(row[`${p}Lev${i}`] ?? row[`${p.replace(/Dam$/, '')}LevDam${i}`]))];
  skillOut[row.skill] = {
    par, reqlevel: n(row.reqlevel), mana: n(row.mana), lvlmana: n(row.lvlmana), manashift: n(row.manashift),
    hitshift: n(row.HitShift), tohit: n(row.ToHit), levtohit: n(row.LevToHit),
    emin: lev('EMin'), emax: lev('EMax'), elen: [n(row.ELen), n(row.ELevLen1), n(row.ELevLen2), n(row.ELevLen3)],
    min: [n(row.MinDam), ...[1, 2, 3, 4, 5].map((i) => n(row['MinLevDam' + i]))],
    max: [n(row.MaxDam), ...[1, 2, 3, 4, 5].map((i) => n(row['MaxLevDam' + i]))],
    req: [row.reqskill1, row.reqskill2, row.reqskill3].filter(Boolean),
  };
}

// --- monsters
const MODS = { rndname: null, hpmultiply: null, light: null, leveladd: null, strong: 'Extra Strong', fast: 'Extra Fast',
  cursed: 'Cursed', resist: 'Magic Resistant', fire: 'Fire Enchanted', lightning: 'Lightning Enchanted',
  cold: 'Cold Enchanted', manaburn: 'Mana Burn', teleport: 'Teleportation', spectralhit: 'Spectral Hit',
  stoneskin: 'Stone Skin', multishot: 'Multiple Shots', aura: 'Aura Enchanted', thief: 'Thief', ghostly: 'Ghostly',
  fanatic: 'Fanatic', possessed: 'Possessed', berserk: 'Berserker', champion: 'Champion' };
const modName = Object.fromEntries(Object.values(monumod).map((m) => [m.id, MODS[m.uniquemod] ?? null]));

function stats(m) {
  const o = {
    noRatio: n(m.noRatio), lvl: per(m, 'Level'),
    hp: D.map((d, i) => [n(m[(i ? 'MinHP' : 'minHP') + d]), n(m[(i ? 'MaxHP' : 'maxHP') + d])]),
    ac: per(m, 'AC'), th: per(m, 'A1TH'),
    d1: D.map((d) => [n(m['A1MinD' + d]), n(m['A1MaxD' + d])]),
    res: { dm: per(m, 'ResDm'), ma: per(m, 'ResMa'), fi: per(m, 'ResFi'), li: per(m, 'ResLi'), co: per(m, 'ResCo'), po: per(m, 'ResPo') },
    block: per(m, 'ToBlock'), vel: n(m.Velocity), run: n(m.Run),
  };
  if (n(m.A2MaxD)) o.d2 = D.map((d) => [n(m['A2MinD' + d]), n(m['A2MaxD' + d])]);
  return o;
}
const num = (s, re) => { const x = re.exec(String(s ?? '')); return x ? +x[1] : 0; };
const cleanExpr = (e) => String(e).replace(/^"|"$/g, '').replace(/sksrc\s*\('Consume'\.lvl\)/g, 'c')
  .replace(/sksrc\s*\('Death Mark'\.blvl\)/g, 'dmk').replace(/\bmin\(/g, 'Math.min(');

const SUMMONS = ['wargoatman', 'warbighead', 'warputriddefiler'];
const summons = {}; const monsters = [];
for (const row of Object.values(monpet)) {
  const consume = [];
  for (let i = 1; i <= 6; i++) {
    if (!row['consumestat' + i]) continue;
    const expr = cleanExpr(row['consumecalc' + i]);
    if (!/^[\w\s()+\-*/?:=<>.,]+$/.test(expr)) throw new Error('unexpected consume calc: ' + expr);
    consume.push({ stat: row['consumestat' + i], par: row['consumepar' + i] || undefined, expr });
  }
  if (SUMMONS.includes(row.monster)) { summons[row.monster] = { ...stats(monstats[row.monster]), consume }; continue; }
  if (!row.bindchancecalc) continue; // hirelings: listed but not bindable
  const su = superuniques[row.monster];
  const base = monstats[su ? su.Class : row.monster];
  if (!base) throw new Error('no monstats for ' + row.monster);
  const elite = /elte/.test(String(row.calc2));
  monsters.push({
    id: row.monster,
    name: su ? (strings[su.Name] || su.Name) : (strings[base.NameStr] || base.NameStr),
    type: base.MonType, su: su ? 1 : 0,
    mods: su ? [su.Mod1, su.Mod2, su.Mod3].map((x) => modName[x]).filter(Boolean) : undefined,
    ...stats(base),
    bind: {
      thr: num(row.bindchancecalc, /hpct<(\d+)/),
      div: elite ? 0 : num(row.calc4, /\/(\d+)\)?$/), // 0 => depends on quality (20 unique/minion, 10 champion, 5 normal)
      req: elite ? 0 : num(row.calc2, />=(\d+)/),     // 0 => depends on quality (15 unique/minion, 10 champion)
      cap: num(row.BoundCalc1, /pcl5>(\d+)/), capPer: num(row.BoundCalc1, /\((\d+)\*\(stat/),
      und: n(row.numunderlingcalc),
    },
    consume,
  });
}
for (const m of monsters) if (!m.bind.thr || !m.bind.cap || (!m.su && m.bind.div) ) console.warn('check', m.id, m.bind);

const lv = [];
for (const r of Object.values(monlvl)) {
  lv[r.Level] = { hp: per(r, 'L-HP'), ac: per(r, 'L-AC'), th: per(r, 'L-TH'), dm: per(r, 'L-DM') };
}
const out = { skills: skillOut, summons, monsters, monlvl: lv };
await writeFile(new URL('../public/js/data.js', import.meta.url),
  '// Generated by scripts/build-data.mjs from github.com/blizzhackers/d2data — do not edit.\nexport const DATA = ' + JSON.stringify(out) + ';\n');
console.log(`skills ${Object.keys(skillOut).length}, monsters ${monsters.length}, monlvl ${lv.length - 1}`);
