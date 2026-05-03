# Voidline — Agent Guide

## ⚠️ RÈGLE PRIORITAIRE — Mesurer sur Modal avant chaque commit gameplay

Avant tout commit qui touche un composant de gameplay (`src/game/balance.ts`, `src/game/*-catalog.ts`, `src/systems/synergies.ts`, `src/simulation/`, `sim/crates/voidline-{sim,data,meta}/`), tu DOIS lancer `npm run balance:quick` sur Modal et lire le rapport. C'est la seule façon de prouver que le changement ne casse pas l'équilibre (clear rates, runs cibles par stage, warnings `op-pick` / `dead-pick`).

- Pas d'estimation. Pas de chiffre inventé pour des coûts, yields, courbes ou caps : passer par Modal, lire les pick rates / clear rates / `runs_to_stage{1,2,3}_clear` réels.
- Si `balance:quick` ne passe pas (ex. ONNX manquant), lancer `npm run balance:train` d'abord, puis `balance:quick`.
- Si l'outillage est en panne, le dire explicitement et demander la donnée à l'utilisateur AVANT de finaliser le commit.
- Une formule lue dans le code n'est PAS une mesure : elle décrit un calcul, pas une distribution.

Cibles de progression (à reverifier dans le rapport) :
- Stage 1 clear : 10–20 runs cumulés
- Stage 2 clear : ~50 runs cumulés
- Stage 3 clear : ~100 runs cumulés

Aucun pilote, arme, carte, upgrade, relique ou synergie ne doit créer un build dominant qui trivialise ces fenêtres.

---

## ⚠️ RÈGLE PRIORITAIRE — Parité TS ↔ Rust dans le même PR

`sim/` n'est pas un projet annexe : c'est la source de vérité gameplay (`stepSimulation` est un wrapper WASM autour du moteur Rust).

- Modifier un knob (`balance.ts`, catalogs) → `npm run data:export` puis `npm run data:check` doit passer.
- Modifier un effet : utiliser la DSL `EffectOp[]` dans `src/game/effect-dsl.ts`. Nouveau type d'op → port simultané dans `sim/crates/voidline-data/src/dsl.rs` ET `sim/crates/voidline-sim/src/effects.rs`.
- Modifier la simulation (entities, systems, simulation) → port dans `sim/crates/voidline-sim/src/{enemies,bullets,player_update,simulation,...}.rs` + `cargo test --workspace` vert.
- Nouveau type d'ennemi / synergie / requirement → TS + Rust + tests dans le même PR.

**Bloquer toute PR avec divergence TS↔Rust observée.** Voir `sim/README.md`.

---

## ⚠️ RÈGLE PRIORITAIRE — Cartes single-stat, malus pour les stats OP

Une carte d'upgrade run-time (`src/game/upgrade-catalog.ts`) doit augmenter **un seul attribut** à la fois. Pas de stack de deux buffs purs : splitter la carte en deux.

Exception : multi-effets autorisés uniquement si l'un est un **malus explicite** (`scaleCurrentPct factor < 1`, ou `addPct`/`addCappedPctBonus amount < 0`).

Stats OP par nature (multiplient la puissance plutôt que de l'additionner) → toujours assorties d'un malus damage proportionnel :

- `addCapped projectileCount +N` → `scaleCurrentPct damage` avec `factor < 1` (`balance.upgrade.effects.projectileDamageFactor`).
- `addCapped pierce +N` → idem (`balance.upgrade.effects.pierceDamageFactor`).
- Toute future stat multiplicative (multi-frappe, ricochet, etc.) suit la même règle.

Le test invariant `src/game/upgrade-catalog-shape.test.ts` parcourt `upgradePool` et fait échouer la suite si la règle est violée. Ne pas le contourner — corriger la carte. Cette règle ne s'applique pas aux **reliques** (drops temporaires multi-stat OK).

---

## Concept du jeu

Rogue-lite spatial browser-first. Boucle :

1. **Run** : tir auto sur ennemi le plus proche ; le joueur gère déplacement, positionnement, picks d'upgrades, reliques temporaires.
2. **Stage** : 10 minutes, puis boss. Battre le boss enchaîne au stage suivant dans la même run.
3. **Mort** : recap (temps, niveau, boss battus, records, cristaux).
4. **Hangar** : cristaux → unlocks permanents (personnages, armes, cartes de run, cartes de rareté, options).
5. **Loop** : nouveaux builds débloqués ; battre stage 1 ouvre le départ direct stage 2 (bonus cristaux, pas de puissance gratuite).

Le fun vient du **buildcraft**, pas d'inflation brute des stats permanentes. Les synergies (`src/systems/synergies.ts`) sont le cœur : armes/technos/reliques portent des build tags (`cannon`, `salvage`, `magnet`, `shield`, `pierce`, `drone`, `crit`) qui orientent les drafts. Une nouvelle feature renforce un chemin de build lisible plutôt qu'ajouter une ressource parallèle.

Densité cible : ~3× le baseline historique d'ennemis vivants à l'écran. Multiplicateur via les knobs centraux ; XP / score / powerups / économie rééquilibrés pour ne pas accélérer la meta gratuitement.

La **home** est un hangar jouable, pas une landing : le premier écran lance une run, montre les cristaux, choisit perso/arme/stage, achète, lit les objectifs.

---

## Architecture

Stack : TypeScript 5.6 strict + Vite + Phaser 4 (WebGL) + Vitest. Logique gameplay = Rust (`sim/crates/voidline-sim`), TypeScript garde catalogues/UI/inputs/rendu/wrappers WASM.

Flux : `main.ts` → `initializeRustSimulationEngine()` → `createSimulation()` → `bindInput()` → `createVoidlineGame()` (Phaser). Chaque frame : `BattleScene.preupdate()` → `stepSimulation()` (WASM) synchronise le snapshot Rust → `BattleScene` rend, `updateHud()` lit l'état. Unidirectionnel.

- État centralisé : `src/state.ts` (mutation in-place ; `enemies`, `bullets`, `experienceOrbs`, `chests`).
- Tick : `src/simulation/simulation.ts` exporte `stepSimulation(input, deltaMs)`.
- Rendu Phaser (non testé) : `src/phaser/{game.ts, scenes/BattleScene, pools.ts, textures.ts}`.
- Rendu DOM (non testé) : `src/render/*` (HUD, hangar, perf overlay).
- Entrée : `src/game/input.ts` (tester les handlers, pas `addEventListener`).

### Home / Hangar

Trois écrans dans `#hangarOverlay` (`title`, `loadout`, `shop`), bascule via `data-active`. Chrome flottant : cristaux haut-droite, cog haut-droite, retour haut-gauche (subscreens uniquement). Raccourcis : `L` Loadout, `B` Boutique, `Espace`/`Entrée` JOUER, `Échap` retour.

Rendu dans `src/render/hangar.ts` (`bindCockpit`, `renderCockpit`, `showHangarTitle`). `src/render/hud.ts` n'expose plus que `showHangar()`, `showSettings()`, `closeSettings()`.

---

## Balance — knobs et catalogues

**Source de vérité** : `src/game/balance.ts` (objet `balance`). Sous-objets thématiques :

- `player` (stats de base, drone, reset invuln)
- `pressure` / `latePressure` (cadence, target, scaling tardif)
- `enemy` / `enemies` (scaling, types)
- `bosses` (boss, miniBoss, durée stage, scaling)
- `upgrade` (caps, tierWeights, effects, steppedGain)
- `tiers` (standard/rare/prototype/singularity)
- `xp` (courbes, valeurs d'orbes)
- `synergies` (kineticRam, magnetStorm)
- `powerups` / `progression`

**Règle** : pas de magic number gameplay hors `balance.ts`. Un littéral `0.85`, `2.4`, etc. dans `entities/`, `systems/`, `simulation/` qui change le ressenti → centraliser dans `balance.ts`. Math pur (`Math.PI`, animation visuelle) reste local.

Courbes paramétriques : `src/game/balance-curves.ts` (`enemyHpAt`, `bossHpAt`, `rarityProbabilitiesAt`, etc.). Tests : `balance-curves.test.ts`.

Test invariant : `balance.test.ts` parcourt récursivement `balance` à chaque run et refuse NaN, Infinity, négatif.

**Catalogues data-driven** (ajouter une entrée = 1 fichier touché) :
- `upgrade-catalog.ts` : `Upgrade` avec `softCap?` ; le filtre `availableUpgradesForPlayer` est générique.
- `relic-catalog.ts` : déclaratif.
- `boss-catalog.ts` : `BossDef` ; `bossStatsAt(def, stage)` applique `balance.bosses.stageScaling`.
- `synergies.ts` : `SynergyDefinition.apply(traits)` + `reset?(target)` ; `refreshPlayerTraits` dispatche.
- `enemySpawnRules` : `Record<EnemyKind, EnemySpawnRule | "residual">`.
- `shop-catalog.ts:unlockPredicates` : `Record<UnlockRequirement, predicate>` partagé entre shop et meta.

---

## Méta-progression

Source unique : `src/game/meta-upgrade-catalog.ts`. Quatre kinds :

- **unique** (`maxLevel: 1`) : armes (`scatter|lance|drone`), persos (`runner|tank|engineer`), `extra-choice` (+1 pick au level-up).
- **card** (`maxLevel: 4`) : cartes individuelles. L1 débloque l'upgrade, L2/3/4 débloquent Rare/Prototype/Singularity. Starter cards peuvent avoir `baseLevel: 1`.
- **rarity** (`maxLevel: 3`) : poids globaux Rare/Prototype/Singularity sans bypass des caps de carte.
- **utility** : options meta (ex. multiplicateur cristaux, bounty boss).

Helpers : `findMetaUpgrade`, `metaUpgradeLevel`, `nextLevelCost`, `canPurchaseLevel`, `unlockedTechnologyIdsFromMeta`, `unlockedBuildTagsFromMeta`. Achat : `purchaseMetaUpgradeLevel(id)` dans `src/systems/account.ts`.

Hooks runtime (`src/systems/account.ts`) :
- `currentUpgradeTierCaps()` : caps Standard→Singularity par `upgradeId`.
- `currentRarityProfile()` : niveaux Rare/Prototype/Singularity → poids des tiers Rust.
- `currentLevelUpChoiceCount()` : `3 + (extra-choice ? 1 : 0)`. Aucun autre bonus de choix ne se cumule.
- `currentCrystalRewardMultiplier()` : contrat cristal capé à +15%.

**Migration legacy** (idempotente, `sanitizeAccountProgress` → `migrateLegacyUnlocks`) : `weapon:*`/`character:*` legacy → niveaux uniques ; `technology:*` legacy → refund cristaux ; `category:*` / `unique:reroll` → refund + supprimés. localStorage : `voidline:metaProgress:v1`.

---

## Sim Rust + RL

Le port Rust dans `sim/` exécute jusqu'à 100k campagnes en quelques secondes via `rayon`. `data/balance.json` (généré depuis TS) est la source unique.

Deux IA pour valider la balance :
- **Champion** (heuristique, déterministe, `voidline-meta/src/champion.rs`) : Velocity Obstacles + champ TTC + mini-MPC + routage greedy d'orbes. Mesure le plafond mécanique d'un build. Profil `--player-profile champion` ou `skilled`.
- **Personas RL** (ONNX, `learned_policy.rs`) : 4 personas (`learned-human|optimizer|explorer|novice`). Mesurent le plafond stratégique. Entraînement Modal H100, modèles persistés par hash de `data/balance.json` dans le volume `voidline-rl-models`.

Un bot dédié pour les choix d'upgrades/reliques est prévu en futur PR ; en attendant, scoring heuristique de `profiles.rs` + 4 personas learned.

---

## Commandes

### Dev / build

- `npm run dev` — Vite dev server (Conductor : `npm run dev -- --port ${CONDUCTOR_PORT:-4173} --strictPort`)
- `npm run build` — typecheck + Vite production build
- `npm run typecheck`
- `npm test` — Vitest single run
- `npm run test:watch`
- `npm run test:balance` — `balance.test.ts` + `balance-curves.test.ts`
- `npm run smoke` — build + Playwright headless
- Test isolé : `npx vitest run path/to/file.test.ts` ou `-t "nom"`
- Stress mode navigateur : `?bench=1&enemies=2000&bullets=300&orbs=1000&seconds=20`

### Data + sim

- `npm run data:export` — régénère `data/balance.json`
- `npm run data:check` — vérifie que `data/balance.json` est à jour
- `cd sim && cargo test --workspace`

### Balance (Modal uniquement)

Toute mesure d'équilibrage passe par Modal. Pas de check / report / train balance en local. Pas de workflow CI pour la balance. Local sert à lancer Modal, exporter `data/balance.json`, lancer les tests standard, récupérer les artefacts.

- `npm run balance:quick` — rapport rapide (<5 min cible). Combine Champion heuristique + 4 personas learned.
- `npm run balance:full` — rapport profond (peut dépasser 5 min) pour décisions importantes.
- `npm run balance:train` — entraîne / exporte les ONNX sur H100. À relancer quand `data/balance.json` ou l'encodeur d'observation change.
- `npm run balance:pull` — récupère les ONNX dans `.context/rl-models`. `-- --reports` récupère les rapports dans `.context/balance-reports`.

`quick` et `full` échouent si les ONNX manquent → lancer `train` d'abord. Volumes : `voidline-rl-models`, `voidline-balance-reports`, `voidline-balance-cache`.

Le rapport balance expose : `runs_to_stage{1,2,3}_clear`, `cumulative_runs_to_stage*_clear`, clear / death rates, pick rates upgrades / reliques, warnings `op-pick` / `dead-pick`, snapshots de stats. Pour valider un changement : exécuter avant/après, lire les deltas.

Options CLI avancées (`--player-profile`, `--campaigns`, `--runs`, `--max-pressure`, `--trial-seconds`, `--seed`, `--sweep path=v1,v2`, `--set path=value`) : pour replay d'historique ou investigation. Ne pas les ajouter aux scripts npm sans raison. Sweeps ne modifient pas `data/balance.json` ; exporter ensuite via `data:export` si un knob est retenu.

Historique : `--record-history` ajoute une entrée JSONL dans `data/balance-profile-history.jsonl` (refuse worktree dirty sans `--allow-dirty-history`).

---

## Testing standard

**Tout changement de logique s'accompagne d'au moins un test.** Un test "intelligent" attrape une vraie régression. Un test qui n'attrape rien est pire que pas de test.

Écris un test si le changement touche :
1. Une fonction pure (balance, upgrades, formules, math)
2. Une transition d'état (level-up, damage, pickup, pressure)
3. Un invariant gameplay (HP ≥ 0, cap respecté, courbe monotone)
4. Un bug fix → test de régression qui échoue AVANT le fix

Pas de test pour : rendu Canvas/DOM (`src/render/*`), forwarders 1-liner, constantes/types/getters triviaux, modifs cosmétiques, wiring d'event listeners.

### Principes

- **Behavior, not implementation.** Un refactor interne ne doit pas casser le test.
- **Invariants > examples.** Préfère propriétés universelles (monotonie, bornes, conservation) à un cas chiffré unique. `balance.test.ts` itère sur 50 niveaux pour la courbe XP — pattern de référence.
- **Une intention par test.** Le `it(...)` décrit UN comportement.
- **AAA structuré.** Pas de `if`/`try`/`for` masqué dans le test.
- **Déterministe & isolé.** Pas de `Math.random` non-seedé, pas de `Date.now()`, pas de timers réels (`vi.useFakeTimers()`), pas d'état global qui fuit.
- **Rapide** (< 50 ms par test unitaire).
- **Échoue pour la bonne raison.** Casse volontairement le code testé avant de committer le test, vérifie qu'il pointe le vrai problème.

### Anti-patterns interdits

- Tautologie (`expect(add(2,3)).toBe(2+3)` qui réimplémente la formule)
- Mock-the-world (mocks plus lourds que la logique testée)
- Snapshot non-déterministe
- Test "couvre la ligne" sans assertion métier
- Sleeps / timers réels (`setTimeout(..., 100)` flaky)
- Test couplé à l'ordre via état partagé

### Workflow

- `npm test` avant chaque commit (single run)
- `npm run typecheck` doit aussi passer
- `npm run balance:quick` sur Modal avant tout commit gameplay (voir règle prioritaire)
- Un PR sans test pour une logique modifiée doit le justifier explicitement

---

## Conductor

Le repo tourne dans Conductor. Chaque workspace a un port (`CONDUCTOR_PORT`). Configurations cloud demandant un port → renseigner `_port` avec ce port. Script Conductor local dans `conductor.json`.
