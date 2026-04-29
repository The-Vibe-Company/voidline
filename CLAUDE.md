# Voidline — Agent Guide

## Architecture (rappel)

- **Logique pure** (testable): `src/game/`, `src/entities/`, `src/systems/`, `src/simulation/`, `src/utils.ts`
- **État centralisé**: `src/state.ts` — muté en place; les collections (`enemies`, `bullets`, `experienceOrbs`, `chests`, …) y vivent
- **Boucle de tick** (testable, déterministe): `src/simulation/simulation.ts` exporte `stepSimulation(input, deltaMs)` — appelé chaque frame depuis `BattleScene.preupdate()`. RNG seedé dans `src/simulation/random.ts`. Spatial grid pour collisions O(1) dans `src/simulation/spatial-grid.ts`.
- **Rendu Phaser** (NON testé): `src/phaser/` — `game.ts` (init WebGL), `scenes/BootScene`, `scenes/BattleScene` (lit l'état post-simulation, pousse les display objects), `pools.ts` (recyclage), `textures.ts` (textures générées).
- **Rendu DOM** (NON testé): `src/render/*` — HUD, perf overlay.
- **Entrée**: `src/game/input.ts` — teste les handlers, pas le wiring `addEventListener`.

Stack: TypeScript 5.6 (strict) + Vite + **Phaser 4 (WebGL)** + Vitest. Migration depuis Canvas 2D dans `c255df0` pour GPU + scene management.

Flux: `main.ts` → `createSimulation()` → `bindInput()` → `createVoidlineGame()` (Phaser). Chaque frame: `BattleScene.preupdate()` → `stepSimulation()` mute l'état → `BattleScene` rend, `updateHud()` lit l'état. Unidirectionnel.

## Commands

- `npm run dev` — Vite dev server
- `npm run build` — `tsc --noEmit && vite build` (typecheck + production build)
- `npm run preview` — sert le build de production en local
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest, single run (mode CI)
- `npm run test:watch` — Vitest watch mode
- `npm run test:balance` — uniquement les suites `balance.test.ts` + `balance-simulation.test.ts`
- `npm run bench` — Vitest benchmarks
- `npm run smoke` — `npm run build && node scripts/browser-smoke.mjs` (smoke Playwright headless)

Lancer un test isolé (par fichier ou par nom):

```bash
npx vitest run src/game/balance.test.ts
npx vitest run -t "spawn gap"
```

Stress mode (manuel, dans le navigateur): ajouter `?bench=1&enemies=2000&bullets=300&orbs=1000&seconds=20` à l'URL du dev server.

## Testing Standard

### La règle

**Tout changement de logique doit s'accompagner d'au moins un test.**
Un test "intelligent" attrape une vraie régression. Un test qui n'attrape rien pollue le repo et ralentit les refactors — il est pire que pas de test.

### Quand écrire un test (decision rule)

Écris un test SI le changement touche:

1. Une **fonction pure** (balance, upgrades, formules, math)
2. Une **transition d'état** (level-up, damage, pickup, wave progression)
3. Un **invariant de gameplay** (HP ≥ 0, cap respecté, courbe monotone)
4. Un **bug fix** → test de régression qui échoue AVANT le fix

N'écris PAS de test pour:

- Rendu Canvas / DOM (`src/render/*`)
- Code qui ne fait que déléguer (1-liner forwarders)
- Constantes, types, getters triviaux
- Modifs cosmétiques (couleur, copie texte, ordre visuel)
- Wiring d'event listeners (teste le handler, pas `addEventListener`)

### Les 7 principes du test intelligent

1. **Behavior, not implementation** — un refactor interne ne doit pas casser le test. Si tu dois modifier le test à chaque refactor, il teste l'implémentation, pas le comportement.

2. **Invariants > examples** — pour la logique de jeu, préfère les propriétés universelles (monotonicité, bornes, conservation, idempotence) à un cas chiffré unique. Voir `balance.test.ts` qui itère sur 50 niveaux pour vérifier la monotonie de la courbe XP — c'est le pattern de référence.

3. **Une intention par test** — le nom du `it(...)` décrit UN comportement. Plusieurs `expect` sont OK s'ils valident la même intention.

4. **AAA structuré** — Arrange / Act / Assert visuellement séparés. Pas de logique conditionnelle (`if`, `try/catch`, `for` masqués) dans le test — elle masque les bugs.

5. **Déterministe & isolé** — pas de `Math.random` non-seedé, pas de `Date.now()`, pas de timers réels, pas d'état global qui fuit. Reset via `beforeEach` si besoin. Utilise `vi.useFakeTimers()` pour le temps.

6. **Rapide** — < 50 ms par test unitaire. Si c'est lent, c'est probablement un test d'intégration mal placé ou un mock manquant.

7. **Échoue pour la bonne raison** — avant de committer un test neuf, casse volontairement le code testé et vérifie que le test rouge pointe vers le vrai problème. Un test qui passe toujours est invisible.

### Anti-patterns interdits

- **Tautologie**: `expect(add(2, 3)).toBe(2 + 3)` — réimplémente la fonction dans l'assertion. Compare à une valeur littérale ou à un invariant, pas à la même formule.
- **Mock-the-world**: si tes mocks pèsent plus que la logique testée, tu testes les mocks. Préfère des objets réels minimaux (factories) aux mocks profonds.
- **Snapshot non-déterministe**: snapshots sur du contenu qui bouge → faux positifs en boucle. Réservé aux sorties stables.
- **Test "couvre la ligne"**: écrit pour la couverture sans assertion qui ait un sens métier.
- **Sleeps / timers réels**: `setTimeout(..., 100)` → flaky. Toujours `vi.useFakeTimers()` + `vi.advanceTimersByTime`.
- **Test couplé à l'ordre**: dépendance entre tests via état partagé. Chaque `it` doit pouvoir tourner seul.

### Pattern de référence: `src/game/balance.test.ts`

Ce fichier illustre ce qu'on veut:

- Teste des **propriétés** (courbe XP strictement croissante sur N niveaux)
- Teste des **bornes** (spawn gap dans `[min, max]`)
- Teste des **transitions** (application d'upgrade → effets sur stats)
- Teste les **caps** (un upgrade ne dépasse pas son plafond, même appliqué N fois)

Reproduis cette approche pour les nouveaux tests.

### Cibles prioritaires de couverture (ordre)

1. `src/game/balance.ts` — **fait** (`balance.test.ts`, `balance-simulation.test.ts`)
2. `src/game/upgrade-catalog.ts` + `src/systems/upgrades.ts` — TODO (application des effets, caps additifs)
3. `src/systems/waves.ts` — TODO (progression de difficulté, invariants de spawn)
4. `src/game/progression.ts` + `src/entities/experience.ts` — partiel (`experience.test.ts` couvre la collecte; level-up à compléter)
5. `src/entities/powerups.ts` — TODO (heart / magnet / bomb)
6. `src/utils.ts` — TODO (`distance`, `circleCollide`, `clamp`, `shuffle` — purs, ROI immédiat)

Couverts hors-priorité (nouveaux systèmes): `relic-catalog.test.ts`, `roguelike.test.ts`, `relics.test.ts`, `simulation.test.ts`, `bullets.test.ts`, `enemies.test.ts`.

### Workflow

- `npm test` avant chaque commit (single run)
- `npm run test:watch` pendant le dev
- `npm run typecheck` doit aussi passer
- Un PR sans test pour une logique modifiée doit le justifier explicitement dans la description
