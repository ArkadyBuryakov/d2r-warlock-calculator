import { DATA } from './data.js';
import { TREE, DIFFS, QUALITIES, defaultState, levels, goatman, tainted, defiler, bound, monster, defaultMlvl, skillLines } from './calc.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const STORE = 'd2r-warlock.summoner.v1';

// ---------- persistence ----------
function loadStore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && Array.isArray(s.profiles)) return s;
  } catch { /* corrupt or unavailable storage: start fresh */ }
  return { profiles: [], activeId: null, draft: null };
}
function persist() {
  store.draft = state;
  try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { status('Could not write to local storage.'); }
}
// merge onto defaults so profiles saved by older versions keep working
function hydrate(saved) {
  const d = defaultState();
  if (!saved) return d;
  const s = { ...d, ...saved, bound: { ...d.bound, ...saved.bound }, skills: { ...d.skills } };
  for (const t of TREE) s.skills[t.id] = { ...d.skills[t.id], ...(saved.skills || {})[t.id] };
  return s;
}

const store = loadStore();
let state = hydrate(store.draft);
let selected = 'Summon Goatman';
const active = () => store.profiles.find((p) => p.id === store.activeId);
const dirty = () => { const a = active(); return a && JSON.stringify(hydrate(a.state)) !== JSON.stringify(state); };

// ---------- skill tree ----------
function buildTree() {
  const lines = TREE.flatMap((t) => t.req.map((r) => {
    const f = TREE.find((x) => x.id === r);
    return `<line data-from="${esc(r)}" data-to="${esc(t.id)}" x1="${f.col - 0.5}" y1="${f.row - 0.5}" x2="${t.col - 0.5}" y2="${t.row - 0.5}" vector-effect="non-scaling-stroke"/>`;
  })).join('');
  $('tree').innerHTML = `<svg viewBox="0 0 3 6" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>` + TREE.map((t) => `
    <div class="node${t.passive ? ' passive' : ''}" data-skill="${esc(t.id)}" style="grid-row:${t.row};grid-column:${t.col}">
      <button class="icon" title="${esc(t.id)}" aria-label="${esc(t.id)}">${t.glyph}</button>
      <span class="lvl"></span>
      <div class="step" title="Skill points"><button data-d="-1" aria-label="Remove point from ${esc(t.id)}">−</button><output class="base"></output><button data-d="1" aria-label="Add point to ${esc(t.id)}">+</button></div>
      <div class="step items" data-k="bonus" title="+ to ${esc(t.id)} from items"><button data-d="-1" aria-label="Lower item bonus to ${esc(t.id)}">−</button><output class="bonus"></output><button data-d="1" aria-label="Raise item bonus to ${esc(t.id)}">+</button></div>
    </div>`).join('');

  // k: 'base' = hard points (max 20), 'bonus' = "+ to this skill" from items
  const addPoints = (id, n, k = 'base') => {
    const s = state.skills[id];
    s[k] = Math.max(0, Math.min(k === 'base' ? 20 : 99, s[k] + n));
    selected = id;
    update();
  };
  $('tree').addEventListener('click', (e) => {
    const node = e.target.closest('.node');
    if (!node) return;
    const step = e.target.closest('[data-d]');
    addPoints(node.dataset.skill, (step ? +step.dataset.d : 1) * (e.shiftKey ? 5 : 1), step?.parentElement.dataset.k);
  });
  $('tree').addEventListener('contextmenu', (e) => {
    const node = e.target.closest('.node');
    if (!node) return;
    e.preventDefault();
    addPoints(node.dataset.skill, e.shiftKey ? -5 : -1);
  });
  const select = (e) => {
    const node = e.target.closest('.node');
    if (node && node.dataset.skill !== selected) { selected = node.dataset.skill; renderTree(); renderDetail(); }
  };
  $('tree').addEventListener('mouseover', select);
  $('tree').addEventListener('focusin', select);
}

function renderTree() {
  const L = levels(state);
  for (const node of $('tree').querySelectorAll('.node')) {
    const l = L[node.dataset.skill];
    node.classList.toggle('has', l.lvl > 0);
    node.classList.toggle('sel', node.dataset.skill === selected);
    const badge = node.querySelector('.lvl');
    badge.textContent = l.lvl;
    badge.classList.toggle('boosted', l.lvl > l.base);
    node.querySelector('.base').textContent = l.base;
    node.querySelector('.bonus').textContent = `+${state.skills[node.dataset.skill].bonus}`;
  }
  for (const line of $('tree').querySelectorAll('line')) line.classList.toggle('on', L[line.dataset.from].base > 0 && L[line.dataset.to].base > 0);
  const spent = TREE.reduce((n, t) => n + L[t.id].base, 0);
  $('spent').textContent = `Skill points spent: ${spent}`;
}

function renderDetail() {
  const t = TREE.find((x) => x.id === selected), l = levels(state)[selected];
  const missing = t.req.filter((r) => !levels(state)[r].base);
  const block = (title, lvl) => `<p class="sub">${title}: ${lvl}</p>` + skillLines(selected, lvl, state).map((x) => `<p>${esc(x)}</p>`).join('');
  $('detail').innerHTML = `
    <h3>${esc(t.id)}</h3>
    <p>${esc(t.desc)}</p>
    <p class="dim">Required Level: ${t.reqlevel}</p>
    ${missing.length && l.base ? `<p class="req">Requires: ${esc(missing.join(', '))}</p>` : ''}
    ${l.lvl ? block('Current Skill Level', l.lvl) : ''}
    ${l.lvl ? '' : '<p class="dim">No points yet</p>'}
    ${block(l.lvl ? 'Next Level' : 'First Level', l.lvl + 1)}`;
}

// ---------- minion cards ----------
function statTable(rows) {
  return `<table class="stats">${rows.map(([k, v, note], i) =>
    `<tr${i < 2 ? ' class="key"' : ''}><th scope="row">${esc(k)}</th><td>${esc(v)}${note ? `<small>${esc(note)}</small>` : ''}</td></tr>`).join('')}</table>`;
}
function sections(m) {
  return statTable(m.rows)
    + (m.abilities.length ? `<h3>Abilities</h3><ul>${m.abilities.map(([n, d]) => `<li><b>${esc(n)}</b> — ${esc(d)}</li>`).join('')}</ul>` : '')
    + (m.consume ? `<h3>When consumed</h3><ul class="magic">${m.consume.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');
}
function summonCard(el, title, skill, m) {
  el.classList.toggle('off', !m);
  el.innerHTML = `<header><h2>${title}</h2><span>${m ? `Skill level ${m.lvl} · Max Demons ${m.max}` : ''}</span></header>`
    + (m ? sections(m) : `<p class="empty">Put a point into ${skill} to summon it.</p>`);
}

function renderBound() {
  const b = state.bound, m = monster(b.monster);
  $('b-quality').disabled = !m || !!m.su;
  $('b-quality').value = m && m.su ? 2 : b.quality;
  $('b-mlvl').placeholder = m ? defaultMlvl(m, b) : '';
  const r = bound(state);
  if (!r) { $('bound-out').innerHTML = '<p class="empty">Choose the demon you bound to see its stats.</p>'; return; }
  const bind = r.bind;
  const info = [
    !r.lvl ? '<li class="warn">Put a point into Bind Demon — bonuses below assume none.</li>'
      : !bind.canBind ? `<li class="warn">Needs base Bind Demon level ${bind.req} to bind this rank.</li>` : '',
    bind.canBind ? `<li>Bindable below ${bind.threshold}% life: ${bind.atThreshold}% chance per attempt, up to ${bind.atLow}% near death</li>` : '',
    bind.underlings ? `<li>Brings up to ${bind.underlings} underlings</li>` : '',
  ].join('');
  $('bound-out').innerHTML = `<header><h2>${esc(r.name)}</h2><span>Monster level ${r.mlvl} · Bind Demon ${r.lvl}</span></header>`
    + sections(r) + (info ? `<h3>Binding</h3><ul>${info}</ul>` : '');
}

function renderCards() {
  summonCard($('card-goatman'), 'Goatman', 'Summon Goatman', goatman(state));
  summonCard($('card-tainted'), 'Tainted', 'Summon Tainted', tainted(state));
  summonCard($('card-defiler'), 'Defiler', 'Summon Defiler', defiler(state));
  renderBound();
}

// ---------- inputs ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.trunc(Number(v) || 0)));
const TYPE_LABEL = { fallen: 'Fallen', megademon: 'Balrogs', demon: 'Minions of Destruction', councilmember: 'Council Members',
  corruptrogue: 'Corrupt Rogues', imp: 'Imps', bighead: 'Tainted', overseer: 'Overseers', fetish: 'Fetishes', blunderbore: 'Blunderbores',
  goatman: 'Goatmen', minion: 'Hell Spawn', vilekind: 'Vile Mothers, Children & Worms', putriddefiler: 'Defilers', regurgitator: 'Regurgitators',
  succubus: 'Succubi', vulture: 'Vultures' };

const monsterLabel = (m) => (m ? `${m.name} (lvl ${m.lvl.join('/')})` : '');

// combobox: type to filter the bindable demons by name or family
function buildMonsterPicker() {
  const input = $('b-monster'), list = $('b-monster-list');
  const entries = DATA.monsters.map((m) => ({ m, group: m.su ? 'Super Uniques' : TYPE_LABEL[m.type] || m.type }))
    .sort((a, b) => (b.m.su - a.m.su) || a.group.localeCompare(b.group) || a.m.name.localeCompare(b.m.name) || a.m.lvl[2] - b.m.lvl[2]);
  let active = -1;
  const options = () => [...list.querySelectorAll('[role=option]')];
  const setActive = (i) => {
    const o = options();
    active = o.length ? (i + o.length) % o.length : -1;
    o.forEach((el, n) => el.classList.toggle('active', n === active));
    o[active]?.scrollIntoView({ block: 'nearest' });
  };
  const render = (q) => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const hits = entries.filter((e) => words.every((w) => `${e.m.name} ${e.group}`.toLowerCase().includes(w)));
    let group, html = q ? '' : '<li role="option" data-id="">— none —</li>';
    for (const e of hits) {
      if (e.group !== group) { group = e.group; html += `<li class="group" role="presentation">${esc(group)}</li>`; }
      html += `<li role="option" data-id="${esc(e.m.id)}">${esc(monsterLabel(e.m))}</li>`;
    }
    list.innerHTML = html || '<li class="group" role="presentation">No demons match</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    setActive(q && hits.length ? 0 : -1);
  };
  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.value = monsterLabel(monster(state.bound.monster));
  };
  const choose = (id) => {
    state.bound.monster = id; state.bound.mlvl = null; $('b-mlvl').value = '';
    close(); input.blur();
    update({ keepInputs: true });
  };
  input.addEventListener('focus', () => { input.select(); render(''); });
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (list.hidden) render(''); setActive(active + (e.key === 'ArrowDown' ? 1 : -1)); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(options()[active].dataset.id); }
    else if (e.key === 'Escape') { close(); input.blur(); }
  });
  // mousedown, not click: it fires before the input's blur closes the list
  list.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const o = e.target.closest('[role=option]');
    if (o) choose(o.dataset.id);
  });
  list.addEventListener('click', (e) => e.preventDefault()); // keep the enclosing <label> from refocusing the input
}

const EFFECTS = ['engorge', 'deathMark', 'frenzy'];

function buildInputs() {
  const opts = (list) => list.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  $('difficulty').innerHTML = opts(DIFFS);
  $('b-difficulty').innerHTML = opts(DIFFS);
  $('b-quality').innerHTML = opts(QUALITIES);

  buildMonsterPicker();

  const bind = (id, set) => $(id).addEventListener('input', (e) => { set(e.target); update({ keepInputs: true }); });
  bind('difficulty', (el) => { state.difficulty = +el.value; });
  bind('allSkills', (el) => { state.allSkills = clamp(el.value, 0, 99); });
  bind('treeSkills', (el) => { state.treeSkills = clamp(el.value, 0, 99); });
  for (const k of EFFECTS) bind(`fx-${k}`, (el) => { state[k] = el.checked; });
  bind('b-quality', (el) => { state.bound.quality = +el.value; });
  bind('b-difficulty', (el) => { state.bound.difficulty = +el.value; });
  bind('b-mlvl', (el) => { state.bound.mlvl = el.value === '' ? null : clamp(el.value, 1, 110); });
  bind('b-players', (el) => { state.bound.players = clamp(el.value, 1, 8); });
}
function syncInputs() {
  $('difficulty').value = state.difficulty;
  $('allSkills').value = state.allSkills;
  $('treeSkills').value = state.treeSkills;
  for (const k of EFFECTS) $(`fx-${k}`).checked = state[k];
  $('b-monster').value = monsterLabel(monster(state.bound.monster));
  $('b-quality').value = state.bound.quality;
  $('b-difficulty').value = state.bound.difficulty;
  $('b-mlvl').value = state.bound.mlvl ?? '';
  $('b-players').value = state.bound.players;
}

// ---------- profiles ----------
let statusTimer;
function status(msg) {
  $('profile-status').textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(renderProfiles, 2500);
}
function renderProfiles() {
  const a = active();
  $('profile-select').innerHTML = '<option value="">— unsaved build —</option>'
    + store.profiles.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('profile-select').value = a ? a.id : '';
  $('profile-save').disabled = !!a && !dirty();
  $('profile-delete').disabled = !a;
  if (!statusTimer || !$('profile-status').textContent) $('profile-status').textContent = a ? (dirty() ? 'Unsaved changes.' : '') : '';
}
function saveAs(name) {
  const p = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, state: structuredClone(state) };
  store.profiles.push(p);
  store.activeId = p.id;
}
function buildProfiles() {
  const name = () => $('profile-name').value.trim() || `Summoner ${store.profiles.length + 1}`;
  const done = (msg) => { persist(); statusTimer = null; renderProfiles(); $('profile-name').value = active()?.name ?? ''; status(msg); };
  $('profile-save').addEventListener('click', () => {
    const a = active();
    if (a) { a.name = $('profile-name').value.trim() || a.name; a.state = structuredClone(state); } else saveAs(name());
    done(`Saved “${active().name}”.`);
  });
  $('profile-save-new').addEventListener('click', () => {
    const a = active();
    saveAs(a && $('profile-name').value.trim() === a.name ? `${a.name} (copy)` : name());
    done(`Saved “${active().name}” as a new profile.`);
  });
  let armed;
  const disarm = () => { clearTimeout(armed); armed = null; $('profile-delete').textContent = 'Delete'; };
  $('profile-delete').addEventListener('click', () => {
    const a = active();
    if (!a) return;
    if (!armed) { $('profile-delete').textContent = 'Confirm delete?'; armed = setTimeout(disarm, 4000); return; }
    disarm();
    store.profiles = store.profiles.filter((p) => p !== a);
    store.activeId = null;
    done(`Deleted “${a.name}”. The build stays loaded until you reset it.`);
  });
  $('profile-select').addEventListener('change', (e) => {
    disarm();
    store.activeId = e.target.value || null;
    const a = active();
    if (a) state = hydrate(structuredClone(a.state));
    $('profile-name').value = a?.name ?? '';
    update();
  });
  $('profile-reset').addEventListener('click', () => { state = defaultState(); update(); });
  $('profile-name').value = active()?.name ?? '';
}

function update({ keepInputs } = {}) {
  if (!keepInputs) syncInputs();
  renderTree(); renderDetail(); renderCards();
  persist(); renderProfiles();
}

buildTree(); buildInputs(); buildProfiles(); update();
