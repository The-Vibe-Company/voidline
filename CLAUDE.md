# Voidline — Agent Guide

## ⚠️ RÈGLE PRIORITAIRE — `npm run balance:check` avant chaque commit gameplay

Avant tout commit qui touche un composant de gameplay (`src/game/balance.ts`, `src/game/*-catalog.ts`, `src/systems/synergies.ts`, `src/simulation/`, `sim/crates/`), tu DOIS lancer `npm run balance:check` localement et lire le rapport.

- Champion heuristique, déterministe, < 2 min, pas de Modal, pas de réseau, pas d'ONNX.
- `--check-target balance` fait crasher la commande si un gate 20 / 50 / 100 est violé.
- Output dans `.context/balance-check.json` (gitignoré). Lire `runs_to_stage{1,2,3}_clear`, clear rates, warnings `op-pick` / `dead-pick`.
- Une formule lue dans le code n'est PAS une mesure ; toujours croiser avec un run réel.

Cibles de progression (vérifiées par `--check-target balance`) :
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

## Les upgrades
- Une carte d'upgrades doit augmenter un seul attribut à la fois.
- Certains multi-effets sont autorisés par exemple pour des bonus trop bons (Penetration +1 vient avec un malus de dommage pour chaque penetration, projectiles +1, diminue les dégats globaux).

Stats OP par nature (multiplient la puissance plutôt que de l'additionner) → toujours assorties d'un malus damage proportionnel :

---

## Concept du jeu

Rogue-lite spatial browser-first. Boucle :

1. **Run** : tir auto sur ennemi le plus proche ; le joueur gère déplacement, positionnement, picks d'upgrades, reliques temporaires.
2. **Stage** : un stage dure exactement **10 minutes**. À 3 min et 6 min, deux **hordes** de 30 s déferlent (`balance.hordes.startsSeconds = [180, 360]`). À 10 min pile, le **boss** apparaît — le timer de stage s'arrête là, le joueur a **autant de temps qu'il veut pour le battre**. Tuer le boss enchaîne au stage suivant dans la même run, sans réinitialisation.
3. **Mort** : recap (temps, niveau, boss battus, records, cristaux).
4. **Hangar** : cristaux → unlocks permanents (personnages, armes, cartes de run, cartes de rareté, options).
5. **Loop** : nouveaux builds débloqués ; battre stage 1 ouvre le départ direct stage 2 (bonus cristaux, pas de puissance gratuite).

Le fun vient du **buildcraft**, pas d'inflation brute des stats permanentes. Les synergies (`src/systems/synergies.ts`) sont le cœur : armes/technos/reliques portent des build tags (`cannon`, `salvage`, `magnet`, `shield`, `pierce`, `drone`, `crit`) qui orientent les drafts. Une nouvelle feature renforce un chemin de build lisible plutôt qu'ajouter une ressource parallèle.

---

## Architecture

Stack : TypeScript 5.6 strict + Vite + Phaser 4 (WebGL) + Vitest. Logique gameplay = Rust (`sim/crates/voidline-sim`), TypeScript garde catalogues/UI/inputs/rendu/wrappers WASM.

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
- **rarity** (`maxLevel: 3`, pour l'instant 3, on augmentera plus tard) : poids globaux Rare/Prototype/Singularity sans bypass des caps de carte.
- **utility** : options meta (ex. multiplicateur cristaux, bounty boss).

---

## Sim Rust

Le port Rust dans `sim/` exécute jusqu'à 100k campagnes en quelques secondes via `rayon`. `data/balance.json` (généré depuis TS) est la source unique.

Champion (`sim/crates/voidline-meta/src/champion.rs`) est l'unique pilote pour les rapports balance : heuristique déterministe — Velocity Obstacles + champ TTC + mini-MPC + routage greedy d'orbes. Il mesure le plafond mécanique d'un build et alimente `npm run balance:check`. Le scoring heuristique d'upgrades/reliques vit dans `voidline-meta/src/profiles.rs` ; un futur RL spécialisé "max out le build" viendra le remplacer pour les choix de cartes.

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

### Balance (local Champion uniquement)

- `npm run balance:check` — wrapper local autour de `voidline-cli` avec `--player-profile champion --policy-set focused --check-target balance`. < 2 min, déterministe, exit non-zéro si un gate 20 / 50 / 100 est violé. Output dans `.context/balance-check.json`. Override via env vars : `VOIDLINE_BALANCE_CHECK_CAMPAIGNS`, `_RUNS`, `_BUDGET`, `_OUTPUT`.

Le rapport expose : `runs_to_stage{1,2,3}_clear`, `cumulative_runs_to_stage*_clear`, clear / death rates, pick rates upgrades / reliques, warnings `op-pick` / `dead-pick`, snapshots de stats. Pour valider un changement : exécuter avant/après, lire les deltas.

Options CLI avancées (`--campaigns`, `--runs`, `--max-pressure`, `--trial-seconds`, `--seed`, `--sweep path=v1,v2`, `--set path=value`) : pour replay d'historique ou investigation, en passant directement par `scripts/meta-progression-report.sh`. Ne pas multiplier les scripts npm. Sweeps ne modifient pas `data/balance.json` ; exporter ensuite via `data:export` si un knob est retenu.

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

---

## Conductor

Le repo tourne dans Conductor. Chaque workspace a un port (`CONDUCTOR_PORT`). Script Conductor local dans `conductor.json`.
