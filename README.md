# D2R Warlock Tools

A summon calculator for the Warlock in Diablo II: Resurrected — Reign of the Warlock.
Set your Demon tree skill points and item bonuses and see the resulting stats of your
Goatman, Tainted, Defiler and bound demon.

Live at <https://d2r-warlock.buryakov.pro>.

## Features

- Demon skill tree with hard points and per-skill "+ to skill" item bonuses, plus `+All Skills` and `+Demon Skills`
- In-game style skill tooltips showing the current and next level
- Life, damage, attack rating, defense, resistances and abilities for each summon
- Bound demon stats for any bindable monster, including champions, uniques and super uniques, with bind chance
- Bonuses granted when a demon is consumed
- Difficulty and active effects (Engorge, Death Mark, Goatman Frenzy) toggles
- Named build profiles saved in the browser's local storage

The game does not show minion character sheets, so the totals are best estimates computed
from the game's data tables. Bound demon values cover its melee attack only.

## Development

It is a static site with no build step: plain HTML, CSS and ES modules in `public/`,
served by Cloudflare Workers static assets. Node.js is required for the tooling.

```sh
make dev      # local server at http://localhost:8787 (wrangler dev)
make test     # run the calculator tests (node --test)
make data     # regenerate public/js/data.js from the game tables
make deploy   # run tests, then deploy with wrangler
```

`make deploy` publishes to the custom domain set in `wrangler.jsonc`; change the route
there before deploying your own copy.

### Layout

| Path | Contents |
|---|---|
| `public/js/calc.js` | The formulas: skill levels, summon and bound demon stats |
| `public/js/app.js` | UI: skill tree, tooltips, tabs, profiles |
| `public/js/data.js` | Generated game data — do not edit by hand |
| `scripts/build-data.mjs` | Builds `data.js` from the game's txt tables |
| `test/calc.test.mjs` | Tests for the formulas |

## Data

`public/js/data.js` is generated from the JSON dump of the game's tables (skills, monstats,
monlvl, monpet, superuniques, monumod) published by
[blizzhackers/d2data](https://github.com/blizzhackers/d2data). Run `make data` after a game
patch once that repository has been updated.

## License

The source code is released under the [MIT License](LICENSE).

The license does not cover the game content in this repository: the skill icons in
`public/img/skills/` and the game data in `public/js/data.js` are the property of Blizzard
Entertainment. Diablo is a trademark of Blizzard Entertainment, Inc. This is a fan-made
project, not affiliated with or endorsed by Blizzard Entertainment.
