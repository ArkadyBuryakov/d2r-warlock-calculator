import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, levels, goatman, tainted, defiler, bound, skillLines, TREE } from '../public/js/calc.js';

const withSkills = (pts, extra = {}) => {
  const s = defaultState();
  for (const [k, v] of Object.entries(pts)) s.skills[k].base = v;
  return Object.assign(s, extra);
};

test('skill levels: +all only applies with a hard point', () => {
  const s = withSkills({ 'Summon Goatman': 1 }, { allSkills: 3, treeSkills: 2 });
  s.skills['Blood Oath'].bonus = 2;
  const L = levels(s);
  assert.equal(L['Summon Goatman'].lvl, 6);
  assert.equal(L['Demonic Mastery'].lvl, 0);
  assert.equal(L['Blood Oath'].lvl, 2);
});

test('level 1 goatman matches monstats base per difficulty', () => {
  for (const [d, hp, dmg] of [[0, 100, [4, 5]], [1, 175, [34, 56]], [2, 275, [254, 303]]]) {
    const g = goatman(withSkills({ 'Summon Goatman': 1 }, { difficulty: d }));
    assert.equal(g.life, hp);
    assert.deepEqual(g.dmg, dmg); // (base + 1 flat) * 110%
    assert.equal(g.max, 1);
    assert.equal(g.cb, 5);
  }
  assert.equal(goatman(defaultState()), null);
});

test('goatman scaling with mastery, blood oath and death mark', () => {
  const g = goatman(withSkills({ 'Summon Goatman': 20, 'Demonic Mastery': 20, 'Blood Oath': 20, 'Death Mark': 5 }));
  assert.equal(g.life, Math.trunc(275 * (100 + 35 * 19 + 50 + 35 * 19) / 100));
  assert.deepEqual(g.dmg, [Math.trunc((230 + 39) * 5), Math.trunc((275 + 39) * 5)]); // +200% skill +200% mastery
  assert.equal(g.ar, 92 + 500 + 140 + 40 * 19);
  assert.equal(g.defense, 200 + 100 + 20 * 19);
  assert.equal(g.ias, 49); // skill capped at 25 + mastery 24
  assert.equal(g.max, 3);
  assert.equal(g.cb, 10);
  assert.equal(g.abilities.length, 4);
});

test('tainted fire ball and defiler health link', () => {
  const t = tainted(withSkills({ 'Summon Tainted': 1 }));
  assert.deepEqual(t.fire, [5, 7]);
  assert.equal(t.life, 290);
  const t20 = tainted(withSkills({ 'Summon Tainted': 20, 'Blood Boil': 10, 'Demonic Mastery': 10 }));
  // min: (10 + 7*4 + 8*8 + 4*36)/2 = 123, x3 synergy = 369, +100% mastery
  assert.equal(t20.fire[0], 738);
  const d = defiler(withSkills({ 'Summon Defiler': 20 }));
  assert.match(d.abilities[0][1], /^53% of damage shared between up to 5 bound souls/);
  assert.deepEqual(d.dmg, [87, 261]);
});

test('bound demon: life cap, bind requirements and chance', () => {
  const s = withSkills({ 'Bind Demon': 20, 'Death Mark': 3 });
  s.bound = { monster: 'venomlord', quality: 2, difficulty: 2, mlvl: null, players: 8 };
  const b = bound(s);
  assert.equal(b.mlvl, 96);
  assert.ok(b.capped);
  assert.equal(b.life[1], 27000);
  assert.equal(b.bind.req, 15);
  assert.equal(b.bind.atThreshold, 56 + 3 + Math.trunc(26 / 20));
  assert.equal(b.abilities.length, 4);
  s.skills['Bind Demon'].base = 10;
  assert.equal(bound(s).bind.canBind, false);
  s.bound.monster = '';
  assert.equal(bound(s), null);
});

test('tooltips render for every skill', () => {
  const s = withSkills(Object.fromEntries(TREE.map((t) => [t.id, 1])));
  for (const t of TREE) {
    const lines = skillLines(t.id, 2, s);
    assert.ok(lines.length > 0, t.id);
    assert.ok(!lines.join().match(/NaN|undefined/), t.id + ': ' + lines.join(' | '));
  }
});

test('active effects modify minion stats', () => {
  const pts = { 'Summon Goatman': 10, 'Demonic Mastery': 1, 'Death Mark': 5, 'Blood Boil': 1, 'Blood Oath': 2, Engorge: 1 };
  const off = goatman(withSkills(pts));
  const on = goatman(withSkills(pts, { deathMark: true, frenzy: true, engorge: true }));
  assert.deepEqual(on.dmg, off.dmg.map((v) => v + 13)); // 5 + 2 per Death Mark level
  assert.equal(on.ias, off.ias + 85 + 15);              // frenzy 30 + trunc(110*10*80/1600), engorge 15
  assert.equal(on.defense, off.defense + 50);
  const rows = Object.fromEntries(on.rows);
  assert.match(rows['Marked Target'], /\+13 damage per hit, -190 Defense/);
  assert.equal(Object.fromEntries(off.rows)['Marked Target'], undefined);
  // no points in the skill: the toggle does nothing
  assert.deepEqual(goatman(withSkills({ 'Summon Goatman': 10 }, { deathMark: true, engorge: true })).dmg, goatman(withSkills({ 'Summon Goatman': 10 })).dmg);
});
