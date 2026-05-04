# Voidline — Agent Guide

## Concept du jeu

Hyper-arcade roguelite browser-first. Format "90 secondes" inspiré de 20 Minutes Till Dawn / Vampire Survivors / Balatro / Downwell.

Une **run = 90 secondes max** :

1. **Hangar** : choix de l'arme starter (1 parmi celles débloquées, 6 archétypes au total). Affiche le daily seed du jour, le top-5 leaderboard local, et le prochain palier d'arme à débloquer en cristaux.
2. **Run = 6 mini-vagues × 15s**, durée fixe (pas de scaling de durée). Pas de scroll, arène = écran. Tir auto sur l'ennemi le plus proche. Joueur gère déplacement, esquive, ramassage XP (compteur visuel).
3. **Entre chaque mini-vague (5 fois)** : modal **2 cartes → choisir 1**. Pas de monnaie, pas de re-roll, pas de shop. Touches **1**/**2** (clavier) ou clic. Le run ne s'arrête jamais plus de 1,5s.
4. **Mini-vague 6 = boss final unique**. Pas de boss tous les 5 waves : un seul climax garanti par run.
5. **Mort ou victoire** : kill-cam ralenti 0.25× sur le coup final (boss kill), recap (mini-vague atteinte / temps / score / kills / cristaux), **Espace = restart en 0,5s** vers une nouvelle run avec la même arme starter.
6. **Méta cristaux** : 1 nouvelle arme starter débloquée par palier (80 / 180 / 320 / 500 / 750 cristaux). Pas d'autres méta-upgrades.

### Identité du build = mutations d'arme unique

Au lieu de 6 slots × 4 tiers, **1 seule arme active**. Elle peut :
- **Promouvoir** son tier T1 → T4 (carte "Promotion")
- **Muter** une fois en endgame (carte "Mutation", éligible à partir du tier 3 ou de la 4e pick) — chaque archétype a 2 mutations possibles (ex : Pulse → Pulse Storm ou Pulse Cannon)

Les 12-13 cartes du catalogue mixent stat boosts ciblés (damage, fireRate, projectileCount, pierce, range, critChance, etc.), un effet rare lifesteal, la carte Promotion, et la carte Mutation.

### Daily seed

`getDailySeedString(date)` produit `YYYY-MM-DD`. Hashé via `hashSeedString` puis utilisé dans `mulberry32` pour seeder un RNG par run. Tout ce qui appelle `getActiveRng()` partage le seed : roll des cartes, spawn des ennemis, choix RNG du boss.

---

## Architecture

Stack : TypeScript 5.6 strict + Vite + Phaser 4 (WebGL) + Vitest. Gameplay runtime 100 % TypeScript.

Exception : `/sim/` contient un champion Rust et un pipeline bench headless qui pilote le moteur TS via `sim/headless-host` (protocole stdio framé). Le bench actuel a été migré vers le nouveau format (host.mjs expose `card-pick` via les anciens noms `shop_state`/`buy`), mais la stratégie Rust reste calibrée pour l'ancien modèle Brotato — les tests Rust passent en compilation/protocole mais le bot n'optimise plus le métagame du nouveau format.

### Fichiers clés

- `src/types.ts` — types globaux (`GameState`, `Player.activeWeapon`, `Weapon`, `WeaponMutation`, `CardDef`, `LeaderboardEntry`, …)
- `src/state.ts` — état runtime (`state`, `player`, `enemies`, `bullets`, …) + `world.hitstop`/`world.timescale` pour le juice
- `src/game/balance.ts` — constantes : `MINI_WAVE_COUNT = 6`, `MINI_WAVE_DURATION = 15`, `BOSS_MINI_WAVE_INDEX`, scaling enemyHp/Speed/Damage par index 0-5
- `src/game/wave-flow.ts` — `startRun(starterId)` (init RNG seed jour), `startMiniWave(index)`, `transitionToCardPick()`, `applyCardAndAdvance(0|1)`, `finishRunWithVictory()`
- `src/game/wave-loop.ts` — `stepWave(dt)` : mouvement, spawn, IA, tir mono-arme via `player.activeWeapon`, collisions, XP. Plus de carry XP, plus de runCurrency. Trigger `triggerHitstop` sur kill, `triggerKillCam` sur boss kill
- `src/game/weapon-catalog.ts` — 6 archétypes × 4 tiers de base. `weaponBaseStats(weapon)` lit dans `mutation-catalog.ts` si `weapon.mutationId` est set. Plus de slot-management ; `promoteWeapon(weapon)` et `applyMutation(weapon, mutationId)` opèrent sur l'arme active
- `src/game/mutation-catalog.ts` — pour chaque archétype, 2 mutations finales
- `src/game/card-catalog.ts` — 13 cartes, `rollTwoCards(rng, player, picksTaken)`, `applyCardToPlayer`
- `src/game/daily-seed.ts` — `getDailySeedString`, `hashSeedString`, `mulberry32`, `createRng(seed)`
- `src/game/hitstop.ts` — `triggerHitstop(duration)`, `triggerKillCam()`, `tickWorldFx(realDt)`
- `src/render/leaderboard.ts` — localStorage `voidline:leaderboard:v1` (top 5 par seed-jour + top 5 all-time)
- `src/systems/account.ts` — cristaux + `unlockedStarters` (localStorage v3, migration depuis v2)
- `src/systems/run.ts` — `beginRun(starter)`, `update(dt)`, `onGameOver`
- `src/render/hud.ts` — overlays (hangar simplifié, `card-pick` modal, gameover, pause)
- `src/game/input.ts` — Espace dans menu/gameover = beginRun, Esc = pause, 1/2 = pick card
- `src/phaser/scenes/BattleScene.ts` — rendu Phaser, caméra fixe (arène = canvas size)

---

## Règles

- **Pas de magnet, pas de health pickup, pas de bombe** : seuls drops au sol = boules d'XP (compteur visuel uniquement)
- **Un run = 90s pile**, 6 mini-vagues 15s + boss à la 6e
- **1 arme active**, mutation possible 1 fois en endgame
- **5 picks de carte max** (entre chaque mini-vague non-boss). 2 cartes proposées, 1 choisie. Pas de re-roll
- **Seed du jour partagé** : tous les joueurs ont le même cycle de spawn et de cartes pour la date courante
- **Leaderboard local** : top 5 du jour + all-time, classé par `bossDefeated` (priorité), puis score, puis temps croissant
- **Restart 1 touche** : Espace en gameover relance avec la même arme starter

---

## Commandes

- `npm run dev` — Vite dev server (Conductor : `npm run dev -- --port ${CONDUCTOR_PORT:-4173} --strictPort`)
- `npm run build` — typecheck + Vite production build
- `npm run typecheck`
- `npm test` — Vitest single run + cargo test (sim Rust)
- `npm run test:watch`
- `npm run smoke` — build + Playwright headless

---

## Testing

**Tout changement de logique s'accompagne d'au moins un test.** Cibles prioritaires :
- `balance.ts` : `MINI_WAVE_COUNT`, `isBossMiniWave`, scaling
- `wave-flow.ts` : transitions des 6 mini-vagues, card-pick, gameover
- `card-catalog.ts` : `rollTwoCards` reproductible via seed, `applyCardToPlayer`
- `daily-seed.ts` : déterminisme `mulberry32` / `createRng`
- `account.ts` : migration v2 → v3, unlock starter
- `weapon-catalog.ts` : promote, applyMutation, effectiveWeaponStats
- `wave-loop.ts` : transitionToCardPick à la fin du timer non-boss, attente boss kill sur la 6e

Pas de tests : rendu Canvas/DOM, wiring d'event listeners, constantes triviales.

---

## Conductor

Le repo tourne dans Conductor. Chaque workspace a un port (`CONDUCTOR_PORT`). Script Conductor local dans `conductor.json`.
