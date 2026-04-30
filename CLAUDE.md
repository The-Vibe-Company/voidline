# Voidline — Agent Guide

## Concept du jeu

Voidline est un rogue-lite spatial browser-first: le joueur lance une run courte, survit dans une arene suivie par camera, ramasse de l'XP, choisit des armes/technologies de run, puis meurt ou bat un boss pour alimenter une progression a cristaux.

La boucle principale est volontairement simple:

1. **Run**: le vaisseau tire automatiquement sur l'ennemi le plus proche; le joueur se concentre sur le deplacement, le positionnement, les choix d'upgrades et les reliques temporaires.
2. **Objectif**: chaque niveau dure 10 minutes; a la fin du timer, un boss apparait. Le battre fait passer au niveau suivant dans la meme run.
3. **Resultat**: a la mort, l'ecran de recap montre temps, niveau atteint, niveau de run, boss battus, records et cristaux gagnes.
4. **Hangar**: les cristaux achetent des unlocks permanents: personnages, armes de depart et technologies.
5. **Nouvelle run**: les achats ouvrent de nouveaux chemins de build; battre le boss du niveau 1 debloque gratuitement le depart direct niveau 2, avec bonus de cristaux mais sans puissance gratuite.

Le fun doit venir du buildcraft, pas d'une inflation brute de stats permanentes. Les synergies de `src/systems/synergies.ts` sont le coeur du jeu: armes, technologies et reliques portent des tags de build (`cannon`, `salvage`, `magnet`, `shield`, `pierce`, `drone`, `crit`) qui orientent les drafts. Une nouvelle feature doit donc, par defaut, renforcer des chemins de build lisibles plutot qu'ajouter une ressource ou un systeme parallele.

Les challenges ne donnent pas de bonus permanents directs. Ils servent d'objectifs lisibles et de gates d'unlocks; les cristaux restent la seule monnaie meta. Les reliques restent des rewards temporaires de run, mais leur disponibilite passe par les tags de build et les unlocks de boss.

La home est un hangar jouable, pas une landing page: le premier ecran doit permettre de lancer une run, voir les cristaux, choisir personnage/arme/niveau de depart, acheter des technologies et lire les objectifs. L'ecran de mort doit aider le joueur a comprendre ce qu'il a gagne et quoi acheter ensuite.

## Architecture (rappel)

- **Logique pure** (testable): `src/game/`, `src/entities/`, `src/systems/`, `src/simulation/`, `src/utils.ts`
- **État centralisé**: `src/state.ts` — muté en place; les collections (`enemies`, `bullets`, `experienceOrbs`, `chests`, …) y vivent
- **Boucle de tick** (testable, déterministe): `src/simulation/simulation.ts` exporte `stepSimulation(input, deltaMs)` — appelé chaque frame depuis `BattleScene.preupdate()`. RNG seedé dans `src/simulation/random.ts`. Spatial grid pour collisions O(1) dans `src/simulation/spatial-grid.ts`.
- **Rendu Phaser** (NON testé): `src/phaser/` — `game.ts` (init WebGL), `scenes/BootScene`, `scenes/BattleScene` (lit l'état post-simulation, pousse les display objects), `pools.ts` (recyclage), `textures.ts` (textures générées).
- **Rendu DOM** (NON testé): `src/render/*` — HUD, perf overlay, hangar (`src/render/hangar.ts`).
- **Entrée**: `src/game/input.ts` — teste les handlers, pas le wiring `addEventListener`.

Stack: TypeScript 5.6 (strict) + Vite + **Phaser 4 (WebGL)** + Vitest. Migration depuis Canvas 2D dans `c255df0` pour GPU + scene management.

Flux: `main.ts` → `createSimulation()` → `bindInput()` → `createVoidlineGame()` (Phaser). Chaque frame: `BattleScene.preupdate()` → `stepSimulation()` mute l'état → `BattleScene` rend, `updateHud()` lit l'état. Unidirectionnel.

### Home / Hangar

La home est un **unique overlay** `#hangarOverlay` (markup dans `index.html`), plus `#settingsOverlay`. Pas d'écran titre, pas d'arbre orbital séparé. Le rendu vit dans `src/render/hangar.ts` (expose `bindCockpit` / `renderCockpit` pour rétro-compat avec `src/main.ts` et `src/render/hud.ts`). À la mort, le bouton "Hangar →" du gameover overlay appelle `showHangar()`; un nouveau run se lance via le bouton LANCER du hangar.

`src/render/hud.ts` n'exporte plus que `showHangar()`, `showSettings()`, `closeSettings()`. Les anciens helpers multi-écrans (`MENU_OVERLAY_IDS`, `showMenuOverlay`, `bindMenuNavigation`) ont été supprimés.

### Équilibrage — knobs centralisés

**Source de vérité**: `src/game/balance.ts`. Tous les paramètres tunables du jeu vivent dans l'objet exporté `balance`, organisé en sous-objets thématiques :

- `balance.player` — stats de base (`stats`, `weaponSpread`, `drone`, `resetInvulnerability`)
- `balance.wave` / `balance.lateWave` — cadence de spawn, courbes de target, scaling tardif
- `balance.enemy` — scaling per-wave, chances de hunter/brute, `wobble`
- `balance.enemies` — array des types (scout/hunter/brute) avec stats de base
- `balance.bosses` — `boss`, `miniBoss`, `wobble`, `spawnOffsets`, `contactBackoff`, `stageDurationSeconds`
- `balance.upgrade` — `caps`, `tierWeights`, `effects`, `steppedGain`
- `balance.tiers` — array des `UpgradeTier` (standard/rare/prototype/singularity)
- `balance.xp` — courbes de level, valeur des orbes
- `balance.synergies` — `kineticRam`, `magnetStorm` (formules complètes : seuils, cooldowns, dégâts, knockback)
- `balance.powerups` — `heartHealRatio`, `dropChance`, `pullRadius`, `pullStrength`, `velocityDamping`
- `balance.progression` — `relicUnlockWaves`

**Règle**: pas de magic numbers de gameplay dans `src/entities/*`, `src/systems/*` ou `src/simulation/*`. Si tu écris un littéral `0.85`, `2.4`, `0.18` dans un fichier qui n'est pas `balance.ts`, demande-toi si c'est un knob d'équilibrage (presque toujours oui) — ajoute-le à `balance.ts` sous le bon namespace, importe-le. Les valeurs purement mécaniques (`Math.PI`, taille de pixel, durée d'animation visuelle pure) restent locales ; tout ce qui change le ressenti gameplay se centralise.

**Courbes nommées**: `src/game/balance-curves.ts` expose des fonctions paramétriques en wave/rank/role : `enemyHpAt(wave, kind)`, `enemyDamageAt`, `enemySpeedAt`, `bossHpAt(wave, role)`, `bossDamageAt`, `bossSpeedAt`, `rarityWeightsAt(wave, rank)`, `rarityProbabilitiesAt`, `upgradeUnlocksAt(wave)`. Sert à tester les courbes en isolation et à les plotter pour visualiser le ramp-up. Tests : `balance-curves.test.ts` (monotonie, bornes, somme de probas = 1, gates exacts).

**Test invariant**: `balance.test.ts` parcourt récursivement tout l'objet `balance` à chaque run et vérifie qu'aucune valeur n'est NaN, Infinity, ni négative — un knob ajouté avec une faute de frappe est attrapé immédiatement.

**Catalogues data-driven** (ajouter une entrée = 1 fichier touché) :
- `src/game/upgrade-catalog.ts` — `Upgrade` porte un `softCap?: { stat, max }` ; le filtre dans `availableUpgradesForPlayer` est générique (pas de `id ===` hardcodés).
- `src/game/relic-catalog.ts` — purement déclaratif.
- `src/game/boss-catalog.ts` — `BossDef` (`id`, `role`, `stats: { hp/damage/speed/radius/scoreMultiplier, color, accent, sides, wobble, wobbleRate, contactCooldown }`). `spawnElite` lit la def via `findBossDef(role)`. `bossStatsAt(def, stage)` (dans `balance-curves.ts`) applique `balance.bosses.stageScaling` (par défaut à 0 = pas de stage scaling, sinon multiplicateur additif par stage).
- `src/systems/synergies.ts` — chaque `SynergyDefinition` porte un `apply(traits)` et un `reset?(target)` ; `refreshPlayerTraits` est un dispatch (pas de switch).
- Spawn ennemis : `src/game/balance.ts:enemySpawnRules` est un `Record<EnemyKind, EnemySpawnRule | "residual">`. Ajouter un type d'ennemi = entrée dans `enemyTypes` + entrée dans `enemySpawnRules`.
- Unlock predicates : `src/game/shop-catalog.ts:unlockPredicates` est un `Record<UnlockRequirement, predicate>`. `isUnlockRequirementMet` est partagé entre shop et meta-upgrades.

### Validation harness (RL-ready)

`src/game/balance-simulation.ts` expose `runBalanceTrial(options)` qui exécute une simulation pure et déterministe (RNG seedée). Personae : `idle`, `panic`, `kiter`, `optimizer`, `randomized` (jitter sur kiter, picks d'upgrades aléatoires).

Options utiles :
- `seed`, `persona`, `maxWave`, `maxSeconds` — base.
- `buildSeed?: number` — force les K premières upgrades à être tirées au hasard (cf. `randomBuildPicks`, défaut 3).
- `excludedTags?: BuildTag[]` — exclut des tags du draft (utile pour tester des builds non-cannon).
- `fullyUnlocked?: boolean` — débloque toutes les méta-upgrades pour la trial (toutes catégories L4 + tous uniques L1).

`BalanceTrialResult` est enrichi : `killsByKind`, `upgradesByTag`, `upgradesByTier`, `bossesDefeatedWaves`, `bossesDefeatedStages`, `synergiesActivated`. Sert aux tests d'invariants gating CI (cf. `balance-simulation.test.ts > randomized persona explores the build space`) : taux d'activation des synergies, couverture des tags.

Commande `npm run balance:report` (3 personae × 10 seeds × 5 build seeds = 150 trials) émet `scripts/balance-report.json` avec `waveDistribution`, `buildTagShare`, `upgradeTierShare`, `killShareByEnemy`, `synergyActivationRate`, `bossesDefeatedAvg` par persona. À chaque PR qui touche balance, lire ce JSON pour décision factuelle.

### Méta-progression — catalogue unique

Source de vérité: `src/game/meta-upgrade-catalog.ts`. Deux types d'upgrade:

- **Uniques** (`kind: "unique"`, `maxLevel: 1`): unlocks one-shot — armes (`scatter`, `lance`, `drone`), personnages (`runner`, `tank`), et bonus définitifs (`extra-choice` = +1 choix au level-up; `reroll` = 1 reroll par chest).
- **Categories** (`kind: "category"`, `maxLevel: 4`): chemins paliers — `attack` (cannon), `defense` (shield), `salvage`, `tempo` (crit). Coûts par niveau: `[40, 75, 130, 220]`. Une catégorie qui porte un `technologyId` injecte automatiquement cette tech dans le pool des tech débloquées dès le niveau 1.

Helpers exposés: `findMetaUpgrade`, `metaUpgradeLevel`, `nextLevelCost`, `canPurchaseLevel`, `unlockedTechnologyIdsFromMeta`, `unlockedBuildTagsFromMeta`. Achat via `purchaseMetaUpgradeLevel(id)` dans `src/systems/account.ts`.

Hooks runtime branchés sur le catalogue (dans `src/systems/account.ts`):
- `currentRarityRank()` = `min(3, max(level over 4 categories))` → alimente `upgradeTierWeights(wave, rarityRank)` dans `src/game/balance.ts`.
- `currentLevelUpChoiceCount()` = `3 + (extra-choice ? 1 : 0) + (tempo>=4 ? 1 : 0)` → consommé par `pickUpgrades(...)` dans `src/render/hud.ts`. Volontairement **non câblé** dans `src/game/balance-simulation.ts` (les trials de balance gardent un 3 fixe pour le déterminisme).
- `currentRerollCount()` = `reroll-unique + (tempo>=2 ? 1 : 0)`. Computé mais **UI non implémentée** côté chest/upgrade overlay (deferred).
- `currentCrystalRewardMultiplier()` = `1 + (salvage>=2 ? 0.10 : 0)` → appliqué dans `applyCrystalReward` (`src/game/account-progression.ts`).

#### Migration legacy

`AccountProgress.upgradeLevels: Partial<Record<MetaUpgradeId, number>>` est la nouvelle structure. Le champ `purchasedUnlockIds: ShopItemId[]` reste dans le type pour rétro-compat et est migré au load par `sanitizeAccountProgress` → `migrateLegacyUnlocks` (`src/systems/account.ts`):
- `weapon:scatter|lance|drone`, `character:runner|tank` → `upgradeLevels["unique:..."] = 1`.
- `technology:heavy-caliber|kinetic-shield|crit-array` → **refundés** (crystals += cost, spentCrystals -= cost), aucune entrée ajoutée; les catégories les possèdent désormais.
- `purchasedUnlockIds` est ensuite vidé → migration idempotente.

Clé localStorage inchangée (`voidline:metaProgress:v1`). `resetAccountProgress` réinitialise `upgradeLevels` à `{}`. Ne pas recréer cette migration: elle s'exécute au load et est idempotente.

`purchaseShopItem` (legacy) reste dans le code mais n'a plus de consommateur en prod (seuls ses tests l'appellent).

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
- `npm run balance:report` — lance 150 trials simulées et écrit `scripts/balance-report.json` (distribution des waves, builds, synergies, kills par type)

Lancer un test isolé (par fichier ou par nom):

```bash
npx vitest run src/game/balance.test.ts
npx vitest run -t "spawn gap"
```

Stress mode (manuel, dans le navigateur): ajouter `?bench=1&enemies=2000&bullets=300&orbs=1000&seconds=20` à l'URL du dev server.

## Conductor

Ce repo est utilisé dans Conductor. Chaque workspace Conductor a un port associé; quand une configuration cloud demande un port, renseigner `_port` avec ce port Conductor.

Le script Conductor local est défini dans `conductor.json` et lance Vite avec `CONDUCTOR_PORT`:

```bash
npm run dev -- --port ${CONDUCTOR_PORT:-4173} --strictPort
```

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
2. `src/game/meta-upgrade-catalog.ts` — **fait** (`meta-upgrade-catalog.test.ts`: courbes de coût monotones, cap de niveau max, idempotence des uniques, complétude du catalogue) + migration couverte dans `src/systems/account.test.ts`
3. `src/game/upgrade-catalog.ts` + `src/systems/upgrades.ts` — TODO (application des effets, caps additifs)
4. `src/systems/waves.ts` — TODO (progression de difficulté, invariants de spawn)
5. `src/game/progression.ts` + `src/entities/experience.ts` — partiel (`experience.test.ts` couvre la collecte; level-up à compléter)
6. `src/entities/powerups.ts` — TODO (heart / magnet / bomb)
7. `src/utils.ts` — TODO (`distance`, `circleCollide`, `clamp`, `shuffle` — purs, ROI immédiat)

Couverts hors-priorité (nouveaux systèmes): `relic-catalog.test.ts`, `roguelike.test.ts`, `relics.test.ts`, `simulation.test.ts`, `bullets.test.ts`, `enemies.test.ts`.

### Workflow

- `npm test` avant chaque commit (single run)
- `npm run test:watch` pendant le dev
- `npm run typecheck` doit aussi passer
- Un PR sans test pour une logique modifiée doit le justifier explicitement dans la description
