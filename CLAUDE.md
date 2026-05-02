# Voidline — Agent Guide

## ⚠️ RÈGLE PRIORITAIRE — Maintenance du sim Rust

**Le port Rust dans `sim/` est une obligation, pas un projet annexe.** Toute modification de la logique gameplay TS doit être reflétée côté Rust dans le même PR :

- **Si tu modifies un knob de balance** (`src/game/balance.ts`, catalogs): tu DOIS lancer `npm run data:export` pour régénérer `data/balance.json`. Le check `npm run data:check` doit passer.
- **Si tu ajoutes/modifies un effet d'upgrade/relique/character/weapon** : utilise la DSL `EffectOp[]` dans `src/game/effect-dsl.ts`. Si tu ajoutes un nouveau type d'op, tu dois le porter aussi dans `sim/crates/voidline-data/src/dsl.rs` ET `sim/crates/voidline-sim/src/effects.rs`.
- **Si tu modifies la logique de simulation** (entities, systems, simulation/simulation.ts) : tu DOIS porter le changement dans le module Rust correspondant (`sim/crates/voidline-sim/src/{enemies,bullets,player_update,simulation,...}.rs`) et faire passer `cargo test --workspace`.
- **Si tu ajoutes un nouveau type d'ennemi, synergie, requirement** : update simultanément TS + Rust + tests.

**Pour les reviewers (humains et IA)** : avant d'approuver une PR qui touche `src/game/` ou `src/{entities,systems,simulation}/`, vérifier explicitement :
1. `data/balance.json` est à jour (run `npm run data:check`)
2. La sim Rust compile et teste vert (`cd sim && cargo test --workspace`)
3. La parité bit-near est préservée (les valeurs hardcodées dans `sim/crates/voidline-sim/src/balance_curves.rs` matchent les nouveaux knobs)

**Bloquer la PR si la divergence TS↔Rust est observée.** Le coût d'un drift silencieux est élevé : balance reports faux, conclusions de game design erronées, fondation RL future cassée.

Voir `sim/README.md` pour l'architecture complète et les workflows de maintenance.

---

## ⚠️ RÈGLE PRIORITAIRE — Le modèle RL choisit, le Rust pilote

**Le modèle RL ne décide JAMAIS du déplacement.** Le mouvement (8 directions + noop) est entièrement contrôlé par un algorithme Rust déterministe (lookahead receding-horizon dans `voidline_meta::profiles::lookahead_movement`). Le rôle du modèle est strictement de choisir :

- **Upgrades** au level-up (slot 1-4 ou skip)
- **Reliques** sur chest spawn (slot 1-3 ou skip)
- **Achats meta** en phase Shop (slot 1-8 ou NextRun)

**Pourquoi** : la difficulté du jeu (3x density d'ennemis) rend l'apprentissage du déplacement par PPO trop coûteux et brouille le signal de balance. En séparant motricité (Rust algo) et stratégie (RL), on a :
1. Un signal d'oracle propre : si le modèle pick souvent une carte, c'est qu'elle est *stratégiquement* OP, pas que le pilote a appris à abuser d'un dodge.
2. Un budget compute beaucoup plus petit : action space passe de 9×5×4×9 = 1620 combos à 5×4×9 = 180.
3. Une survie déjà "résolue" par l'algo Rust → PPO se concentre sur le buildcraft.

**Comment c'est implémenté** :
- `EpisodeEnv::step_run` ignore `action[0]` quand `VOIDLINE_RUST_MOVEMENT=1` (default) et appelle `lookahead_movement(engine, frames=30)` à chaque tick.
- `EpisodeEnv::observe()` masque toutes les actions de mouvement sauf `noop` (slot 0) → PPO ne gaspille pas de capacité sur cette dim.
- L'algo Rust clone l'`Engine`, simule 30 frames sous chaque candidate movement (8-way + noop), score le résultat, et pick le meilleur (`+score_delta − hp_loss×80 − died×5000 − proximity_penalty + survival`).

**Bloquer toute PR qui réintroduit la motricité dans le modèle.** Si quelqu'un ajoute un reward shaping qui exige du mouvement précis, ou un test qui asserte que le modèle apprend à dodge, c'est une violation de cette règle. L'oracle est un *cerveau de joueur*, pas un *pilote*.

---

## ⚠️ RÈGLE PRIORITAIRE — Jamais d'hypothèse, toujours mesurer

Avant de proposer des chiffres de balance, de coût, de yield, de courbe de progression ou tout autre choix calibré sur des valeurs empiriques : **mesurer**, jamais estimer.

- Crystal yield par run, runs nécessaires pour atteindre un palier, valeurs de stats, taux de pick, fréquences de drop : passer par `npm run balance:quick` sur Modal, ou lire un rapport Modal existant. Si le quick est trop court, lancer `npm run balance:full` plutôt que d'inventer des chiffres.
- Si l'outillage manque pour mesurer, le dire explicitement et demander la donnée à l'utilisateur AVANT de finaliser un cost array, un cap, ou une courbe.
- Une formule lue dans `account-progression.ts` n'est PAS une mesure : elle décrit un calcul, pas une distribution observée. Toujours croiser avec un run réel ou un sim agrégé.
- Cette règle s'applique aussi aux niveaux de meta-progression, aux coûts d'unlocks, et à toute proposition de design qui fixe un nombre.

---

## Concept du jeu

Voidline est un rogue-lite spatial browser-first: le joueur lance une run courte, survit dans une arene suivie par camera, ramasse de l'XP, choisit des armes/technologies de run, puis meurt ou bat un boss pour alimenter une progression a cristaux.

La boucle principale est volontairement simple:

1. **Run**: le vaisseau tire automatiquement sur l'ennemi le plus proche; le joueur se concentre sur le deplacement, le positionnement, les choix d'upgrades et les reliques temporaires.
2. **Objectif**: chaque niveau dure 10 minutes; a la fin du timer, un boss apparait. Le battre fait passer au niveau suivant dans la meme run.
3. **Resultat**: a la mort, l'ecran de recap montre temps, niveau atteint, niveau de run, boss battus, records et cristaux gagnes.
4. **Hangar**: les cristaux achetent des unlocks permanents: personnages, armes de depart, cartes de run, cartes de rarete et options controlees.
5. **Nouvelle run**: les achats ouvrent de nouveaux chemins de build; battre le boss du niveau 1 debloque gratuitement le depart direct niveau 2, avec bonus de cristaux mais sans puissance gratuite.

Le fun doit venir du buildcraft, pas d'une inflation brute de stats permanentes. Les synergies de `src/systems/synergies.ts` sont le coeur du jeu: armes, technologies et reliques portent des tags de build (`cannon`, `salvage`, `magnet`, `shield`, `pierce`, `drone`, `crit`) qui orientent les drafts. Une nouvelle feature doit donc, par defaut, renforcer des chemins de build lisibles plutot qu'ajouter une ressource ou un systeme parallele.

Les challenges ne donnent pas de bonus permanents directs. Ils servent d'objectifs lisibles et de gates d'unlocks; les cristaux restent la seule monnaie meta. Les reliques restent des rewards temporaires de run, mais leur disponibilite passe par les tags de build et les unlocks de boss.

La home est un hangar jouable, pas une landing page: le premier ecran doit permettre de lancer une run, voir les cristaux, choisir personnage/arme/niveau de depart, acheter des cartes et lire les objectifs. L'ecran de mort doit aider le joueur a comprendre ce qu'il a gagne et quoi acheter ensuite.

### Objectifs de progression et balance

Les phases de progression correspondent aux boss de stage:

- **Phase 1 / stage 1**: un bon joueur doit pouvoir clear le boss stage 1 en 10-20 runs.
- **Phase 2 / stage 2**: un bon joueur doit pouvoir clear le boss stage 2 autour de 50 runs cumulees.
- **Phase 3 / stage 3**: un bon joueur doit pouvoir clear le boss stage 3 autour de 100 runs cumulees.

Aucun pilote, arme, carte, upgrade, relique ou synergie ne doit creer un build dominant qui trivialise ces fenetres. Si un changement ajoute de la puissance, il doit passer par `npm run balance:quick` sur Modal et ne doit pas generer de warning dominant/OP dans le rapport.

La densite cible est environ **3x plus d'ennemis vivants a l'ecran** que le baseline historique. Ce multiplicateur doit venir des knobs centraux de balance, avec XP, score, powerups et economie reequilibres pour que la progression meta ne soit pas acceleree gratuitement.

## Sim Rust (parité TS↔Rust pour balance massif)

Le repo héberge un **port headless de la sim en Rust** dans `sim/` (Cargo workspace) qui exécute jusqu'à **100k campaigns en quelques secondes** via `rayon`. Tous les knobs et effets sont déclaratifs : `data/balance.json` est la source unique de vérité, généré depuis `balance.ts` + catalogs via `npm run data:export`.

**Maintenance** :
- Modifier un knob (`balance.ts`) → `npm run data:export` → Rust pick-up auto.
- Ajouter une upgrade (avec `effects: EffectOp[]`) → `npm run data:export` → 0 Rust.
- Ajouter un type d'ennemi → `data:export` + 1 entry dans `EnemyKind` (Rust).
- Voir `sim/README.md` pour l'architecture complète.

**Commandes balance officielles (Modal uniquement)** :
- `npm run balance:quick` — rapport rapide (<5 min cible) pour tendances heuristiques + learned RL
- `npm run balance:full` — rapport profond, plus long, pour validation avant décision importante
- `npm run balance:train` — entraîne/exporte les personas RL sur H100 et persiste les ONNX dans Modal
- `npm run balance:hardcoded` — agent heuristique baseline (gate de décision pour la pipeline BC, ~2 min CPU)
- `npm run balance:bc` — rollout du hardcoded + Behavior Cloning → `oracle.zip` warm-start (~30-60 min CPU)
- `npm run balance:sweep -- --grid <name>` — fan out parallèle sur Modal H100. Grids : `reward`, `hparam`, `iter3`, `curriculum_stage1`, `curriculum_stage2`, `curriculum_stage3`
- `npm run balance:test-card -- --target-upgrade-id <id>` — force la carte dans le draft pool, verdict OP/dead/balanced
- `npm run balance:pull` / `npm run balance:pull -- --reports` — récupère modèles ou rapports Modal vers `.context/`
- `npm run data:export` — régénère `data/balance.json`
- `npm run data:check` — vérifie que `data/balance.json` est à jour
- `cd sim && cargo test --workspace` — tests parité Rust (28 tests)

**Pipeline curriculum (oracle RL)** :
1. `balance:hardcoded` → décision : env solvable par heuristique simple ?
2. `balance:bc` → seed la policy avec les rollouts du hardcoded
3. `balance:sweep --grid curriculum_stage1` → 8 H100 × 500k timesteps, force start_stage=1, best promu vers `/models/curriculum/stage1/best.zip`
4. `balance:sweep --grid curriculum_stage2` → warm-start depuis stage1.best, force start_stage=2, 1M timesteps
5. `balance:sweep --grid curriculum_stage3` → warm-start depuis stage2.best, force start_stage=3, 2M timesteps
6. `balance:full` final eval → verdict CONVERGED si `oracle.stage_clears.stage3.rate >= 0.15`

L'horizon `--max-steps` du `voidline_rl.eval` est mode-aware (quick=46800/full=93600/test-card=46800) pour que le boss de stage 1 (spawn @ 600s game-time) soit observable. `modal_app._oracle_args` passe `--max-steps` explicitement pour bloquer toute régression.

**Toute mesure d'équilibrage passe par Modal.** Ne lance pas de check/report/train balance en local et n'ajoute pas de workflow CI pour la balance. Le local sert seulement à lancer Modal, à exporter `data/balance.json`, à lancer les tests standard, et à récupérer des artefacts avec `balance:pull`.

## Architecture (rappel)

- **Logique gameplay** (testable): `sim/crates/voidline-sim` est la source de vérité. TypeScript garde les catalogues/UI, les inputs, le rendu et les wrappers WASM.
- **État centralisé**: `src/state.ts` — muté en place; les collections (`enemies`, `bullets`, `experienceOrbs`, `chests`, …) y vivent
- **Boucle de tick** (testable, déterministe): `src/simulation/simulation.ts` exporte `stepSimulation(input, deltaMs)` — wrapper autour du moteur Rust/WASM appelé chaque frame depuis `BattleScene.preupdate()`.
- **Rendu Phaser** (NON testé): `src/phaser/` — `game.ts` (init WebGL), `scenes/BootScene`, `scenes/BattleScene` (lit l'état post-simulation, pousse les display objects), `pools.ts` (recyclage), `textures.ts` (textures générées).
- **Rendu DOM** (NON testé): `src/render/*` — HUD, perf overlay, hangar (`src/render/hangar.ts`).
- **Entrée**: `src/game/input.ts` — teste les handlers, pas le wiring `addEventListener`.

Stack: TypeScript 5.6 (strict) + Vite + **Phaser 4 (WebGL)** + Vitest. Migration depuis Canvas 2D dans `c255df0` pour GPU + scene management.

Flux: `main.ts` → `initializeRustSimulationEngine()` → `createSimulation()` → `bindInput()` → `createVoidlineGame()` (Phaser). Chaque frame: `BattleScene.preupdate()` → `stepSimulation()` synchronise le snapshot Rust → `BattleScene` rend, `updateHud()` lit l'état. Unidirectionnel.

### Home / Hangar

La home est un **flux jeu vidéo à trois écrans** dans l'overlay `#hangarOverlay` (markup dans `index.html`), plus `#settingsOverlay`. Les trois écrans cohabitent dans `[data-screen-stage]` et basculent via `data-active="true|false"` (transition opacité + translateY) :

1. **Title** (`[data-screen="title"]`) — branding VOIDLINE plein écran, menu vertical (JOUER · Loadout · Boutique), reward chip, records repliables, raccourcis.
2. **Loadout** (`[data-screen="loadout"]`) — cartes Pilote / Arme + Stage de départ, footer collant avec récap + bouton "Lancer la run".
3. **Shop** (`[data-screen="shop"]`) — onglets Armes / Pilotes / Cartes / Rareté / Options qui filtrent la grille de méta-upgrades.

Chrome flottant fixe (haut-droite cristaux, bas-droite cog réglages, haut-gauche bouton retour visible uniquement sur les subscreens). Les écrans inactifs portent `inert` pour sortir du tab order. Raccourcis : `L` → Loadout, `B` → Boutique, `Espace`/`Entrée` → JOUER, `Échap` → retour au titre.

Le rendu vit dans `src/render/hangar.ts` (expose `bindCockpit`, `renderCockpit`, `showHangarTitle` ; ce dernier est appelé par `showHangar()` dans `hud.ts` pour réinitialiser sur le titre à chaque retour). À la mort, le bouton "Hangar →" du gameover overlay appelle `showHangar()`. Un nouveau run se lance via `#startButton` (titre) ou `[data-action="play-sub"]` (footer loadout), tous deux câblés à `resetGame()`.

`src/render/hud.ts` n'exporte plus que `showHangar()`, `showSettings()`, `closeSettings()`. Les anciens helpers multi-écrans (`MENU_OVERLAY_IDS`, `showMenuOverlay`, `bindMenuNavigation`) ont été supprimés.

### Équilibrage — knobs centralisés

**Source de vérité**: `src/game/balance.ts`. Tous les paramètres tunables du jeu vivent dans l'objet exporté `balance`, organisé en sous-objets thématiques :

- `balance.player` — stats de base (`stats`, `weaponSpread`, `drone`, `resetInvulnerability`)
- `balance.pressure` / `balance.latePressure` — cadence de spawn, courbes de target, scaling tardif
- `balance.enemy` — scaling par pression, chances de hunter/brute, `wobble`
- `balance.enemies` — array des types (scout/hunter/brute) avec stats de base
- `balance.bosses` — `boss`, `miniBoss`, `wobble`, `spawnOffsets`, `contactBackoff`, `stageDurationSeconds`
- `balance.upgrade` — `caps`, `tierWeights`, `effects`, `steppedGain`
- `balance.tiers` — array des `UpgradeTier` (standard/rare/prototype/singularity)
- `balance.xp` — courbes de level, valeur des orbes
- `balance.synergies` — `kineticRam`, `magnetStorm` (formules complètes : seuils, cooldowns, dégâts, knockback)
- `balance.powerups` — `heartHealRatio`, `dropChance`, `pullRadius`, `pullStrength`, `velocityDamping`
- `balance.progression` — `relicUnlockStages`

**Règle**: pas de magic numbers de gameplay dans `src/entities/*`, `src/systems/*` ou `src/simulation/*`. Si tu écris un littéral `0.85`, `2.4`, `0.18` dans un fichier qui n'est pas `balance.ts`, demande-toi si c'est un knob d'équilibrage (presque toujours oui) — ajoute-le à `balance.ts` sous le bon namespace, importe-le. Les valeurs purement mécaniques (`Math.PI`, taille de pixel, durée d'animation visuelle pure) restent locales ; tout ce qui change le ressenti gameplay se centralise.

**Courbes nommées**: `src/game/balance-curves.ts` expose des fonctions paramétriques en pressure/rank/role : `enemyHpAt(pressure, kind)`, `enemyDamageAt`, `enemySpeedAt`, `bossHpAt(pressure, role)`, `bossDamageAt`, `bossSpeedAt`, `rarityWeightsAt(pressure, rank)`, `rarityProbabilitiesAt`, `upgradeUnlocksAt(pressure)`. Sert à tester les courbes en isolation et à les plotter pour visualiser le ramp-up. Tests : `balance-curves.test.ts` (monotonie, bornes, somme de probas = 1, gates exacts).

**Test invariant**: `balance.test.ts` parcourt récursivement tout l'objet `balance` à chaque run et vérifie qu'aucune valeur n'est NaN, Infinity, ni négative — un knob ajouté avec une faute de frappe est attrapé immédiatement.

**Catalogues data-driven** (ajouter une entrée = 1 fichier touché) :
- `src/game/upgrade-catalog.ts` — `Upgrade` porte un `softCap?: { stat, max }` ; le filtre dans `availableUpgradesForPlayer` est générique (pas de `id ===` hardcodés).
- `src/game/relic-catalog.ts` — purement déclaratif.
- `src/game/boss-catalog.ts` — `BossDef` (`id`, `role`, `stats: { hp/damage/speed/radius/scoreMultiplier, color, accent, sides, wobble, wobbleRate, contactCooldown }`). `spawnElite` lit la def via `findBossDef(role)`. `bossStatsAt(def, stage)` (dans `balance-curves.ts`) applique `balance.bosses.stageScaling` (par défaut à 0 = pas de stage scaling, sinon multiplicateur additif par stage).
- `src/systems/synergies.ts` — chaque `SynergyDefinition` porte un `apply(traits)` et un `reset?(target)` ; `refreshPlayerTraits` est un dispatch (pas de switch).
- Spawn ennemis : `src/game/balance.ts:enemySpawnRules` est un `Record<EnemyKind, EnemySpawnRule | "residual">`. Ajouter un type d'ennemi = entrée dans `enemyTypes` + entrée dans `enemySpawnRules`.
- Unlock predicates : `src/game/shop-catalog.ts:unlockPredicates` est un `Record<UnlockRequirement, predicate>`. `isUnlockRequirementMet` est partagé entre shop et meta-upgrades.

### Validation balance — Modal uniquement

Le harness TS (`src/game/balance-simulation.ts`) a été supprimé : il était trop lent (25s pour 150 trials, capé à 120s sim time). **Toute validation balance passe par le Rust sim** (`sim/`, voir section "Sim Rust").

Pour la difficulté, ne pas exposer une forêt de paramètres dans les scripts courants. Utiliser uniquement :

- `npm run balance:quick` pour voir les tendances rapidement. Cette commande combine profils skilled heuristiques (`expert-human`, `optimizer`) et personas learned RL. Elle doit rester sous 5 minutes sur Modal après warm cache.
- `npm run balance:full` pour un rapport plus profond quand une décision de design dépend de la mesure. Cette commande peut dépasser 5 minutes.
- `npm run balance:train` pour régénérer les modèles learned RL quand `data/balance.json` ou l'encodeur d'observation change. Les modèles restent hors git dans le volume Modal `voidline-rl-models`, par hash de `data/balance.json`.
- `npm run balance:pull -- --reports` pour récupérer les rapports dans `.context/balance-reports`; `npm run balance:pull` récupère les ONNX dans `.context/rl-models`.

`quick` et `full` échouent si les ONNX attendus manquent: lancer `npm run balance:train` d'abord. Les rapports Modal vivent dans `voidline-balance-reports`; les caches Cargo/uv dans `voidline-balance-cache`.

Le CLI garde des options avancées (`--player-profile`, `--campaigns`, `--runs`, `--max-pressure`, `--trial-seconds`, `--seed`) uniquement pour rejouer un historique ou faire une investigation ponctuelle. Ne pas les ajouter aux scripts npm sans vraie raison.

Sweeps ponctuels : passer les options CLI avancées à `balance:quick` ou `balance:full` si nécessaire (`-- --sweep path=v1,v2`, `-- --set path=value`). Ces runs ne modifient pas `data/balance.json`; exporter ensuite le knob retenu via `npm run data:export`.

Checkpoints : les rapports Modal stockent les checkpoints dans le volume de reports par hash de balance. Ils sont un accélérateur de tuning, pas une validation finale. Toujours terminer par `npm run balance:quick` ou `npm run balance:full` sans phase isolée.

Historique : `--record-history` ajoute une entrée JSONL dans `data/balance-profile-history.jsonl` avec commit, branch, dirty flag, hash de `data/balance.json`, commande de replay, inputs résolus et output agrégé. Par défaut, l'écriture d'historique refuse un worktree dirty ; utiliser `--allow-dirty-history` seulement pour une capture de travail approximative.

Le rapport balance expose notamment : `runs_to_stage1_clear`, `runs_to_stage2_clear`, `runs_to_stage3_clear`, `cumulative_runs_to_stage*_clear`, clear rates, deaths rate, pick rates upgrades/reliques, warnings `op-pick` / `dead-pick`, et snapshots de stats. Pour valider un changement de balance : exécuter avant/après, lire les deltas, et garder un historique si le résultat doit être comparé en PR.

### Méta-progression — catalogue unique

Source de vérité: `src/game/meta-upgrade-catalog.ts`. Quatre types d'upgrade:

- **Uniques** (`kind: "unique"`, `maxLevel: 1`): unlocks one-shot — armes (`scatter`, `lance`, `drone`), personnages (`runner`, `tank`), et bonus définitifs (`extra-choice` = +1 choix au level-up).
- **Cards** (`kind: "card"`, `maxLevel: 4`): cartes individuelles de run. Le niveau 1 debloque l'upgrade, puis les niveaux 2/3/4 debloquent les tiers Rare/Prototype/Singularity pour cette carte. Les cartes starter peuvent avoir `baseLevel: 1`.
- **Rarity** (`kind: "rarity"`, `maxLevel: 3`): cartes globales qui augmentent les poids Rare/Prototype/Singularity, sans bypasser le cap de tier propre a chaque carte.
- **Utility** (`kind: "utility"`): options meta sans puissance directe excessive, par exemple le multiplicateur de cristaux.

Helpers exposés: `findMetaUpgrade`, `metaUpgradeLevel`, `nextLevelCost`, `canPurchaseLevel`, `unlockedTechnologyIdsFromMeta`, `unlockedBuildTagsFromMeta`. Achat via `purchaseMetaUpgradeLevel(id)` dans `src/systems/account.ts`.

Hooks runtime branchés sur le catalogue (dans `src/systems/account.ts`):
- `currentUpgradeTierCaps()` = cap Standard/Rare/Prototype/Singularity par `upgradeId`, derive des niveaux de cartes.
- `currentRarityProfile()` = niveaux des cartes Rare/Prototype/Singularity → alimente les poids de tiers dans le moteur Rust.
- `currentLevelUpChoiceCount()` = `3 + (extra-choice ? 1 : 0)`; aucun autre bonus de choix ne doit se cumuler.
- `currentCrystalRewardMultiplier()` = contrat cristal, plafonne a +15% → appliqué dans `applyCrystalReward` (`src/game/account-progression.ts`).

#### Migration legacy

`AccountProgress.upgradeLevels: Partial<Record<MetaUpgradeId, number>>` est la nouvelle structure. Le champ `purchasedUnlockIds: ShopItemId[]` reste dans le type pour rétro-compat et est migré au load par `sanitizeAccountProgress` → `migrateLegacyUnlocks` (`src/systems/account.ts`):
- `weapon:scatter|lance|drone`, `character:runner|tank` → `upgradeLevels["unique:..."] = 1`.
- `technology:heavy-caliber|kinetic-shield|crit-array` → **refundés** (crystals += cost, spentCrystals -= cost), aucune entrée ajoutée; les cartes les remplacent.
- `category:*` et `unique:reroll` → **refundés et supprimés**; ne pas les recreer.
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
- `npm run test:balance` — suites `balance.test.ts` + `balance-curves.test.ts`
- `npm run bench` — Vitest benchmarks
- `npm run smoke` — `npm run build && node scripts/browser-smoke.mjs` (smoke Playwright headless)
- `npm run balance:quick` — rapport balance Modal rapide, heuristique + learned RL
- `npm run balance:full` — rapport balance Modal profond
- `npm run balance:train` — entraînement/export ONNX sur Modal H100
- `npm run balance:pull` — récupère les modèles Modal; `-- --reports` récupère les rapports

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
2. Une **transition d'état** (level-up, damage, pickup, pressure progression)
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

1. `sim/crates/voidline-sim` — **fait** (tests Rust dans `balance_curves.rs`, `effects.rs`, `simulation.rs`, `engine.rs`)
2. `src/game/meta-upgrade-catalog.ts` — **fait** (`meta-upgrade-catalog.test.ts`: courbes de coût monotones, cap de niveau max, idempotence des uniques, complétude du catalogue) + migration couverte dans `src/systems/account.test.ts`
3. `src/game/upgrade-catalog.ts` + `src/systems/upgrades.ts` — UI/catalogue TS; logique draft/apply couverte côté Rust
4. `src/systems/run.ts` — wrapper UI autour du moteur Rust
5. XP, powerups, enemies, bullets, chests — couverts côté Rust; les anciens modules runtime TS ont été supprimés
7. `src/utils.ts` — TODO (`distance`, `circleCollide`, `clamp`, `shuffle` — purs, ROI immédiat)

Couverts hors-priorité (nouveaux systèmes): `relic-catalog.test.ts`, `roguelike.test.ts`, `relics.test.ts`, `simulation.test.ts`, `bullets.test.ts`, `enemies.test.ts`.

### Workflow

- `npm test` avant chaque commit (single run)
- `npm run test:watch` pendant le dev
- `npm run typecheck` doit aussi passer
- Un PR sans test pour une logique modifiée doit le justifier explicitement dans la description
