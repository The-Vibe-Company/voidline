# Voidline — Agent Guide

## Concept du jeu

Brotato-like spatial browser-first. Boucle :

1. **Wave** : durée croissante (~20s wave 1 → ~45s wave 20). Le tir est auto sur l'ennemi le plus proche. Le joueur gère déplacement, esquive, ramassage des boules d'XP. Pas de level-up en cours de wave.
2. **Fin de wave** : tous les ennemis morts ou plus de spawns + timer écoulé → transition shop. Les boules d'XP non ramassées laissent un **carry de 25 %** récupérable lors de la wave suivante (chaque pickup XP draine ce pool en plus de sa valeur).
3. **Shop** : 4 offres aléatoires depuis `upgrade-catalog.ts`. La monnaie = **les boules d'XP** (`state.runCurrency`). Re-roll à coût croissant. Bouton "Wave suivante" pour relancer.
4. **Boss waves** : toutes les 5 waves (wave 5, 10, 15, …) une wave boss remplace la wave standard.
5. **Mort** : recap (wave, score, temps) → cristaux gagnés selon performance → hangar.
6. **Hangar** : cristaux dépensés sur `meta-upgrade-catalog.ts` (5 amélio permanentes simples : maxHp, damage, fireRate, speed, crystal yield).

---

## Architecture

Stack jeu : TypeScript 5.6 strict + Vite + Phaser 4 (WebGL) + Vitest. Le gameplay runtime reste **100 % TypeScript**.

Exception explicitement réautorisée par l'utilisateur : `/sim/` contient un champion Rust et un pipeline bench headless. Ce bench ne duplique pas le moteur : il pilote le moteur TS via `sim/headless-host` et un protocole stdio framé.

Fichiers clés :
- `src/types.ts` — types globaux (`GameState`, `Player`, `EnemyEntity`, etc.).
- `src/state.ts` — état global runtime (`state`, `player`, `enemies`, `bullets`, …).
- `src/game/balance.ts` — constantes gameplay (durées de wave, scaling ennemis, XP, shop).
- `src/game/wave-loop.ts` — moteur TS du gameplay : `stepWave(dt)` (mouvement, spawn, IA, tir, collisions, XP).
- `src/game/wave-flow.ts` — transitions `startRun` / `startWave` / `transitionToShop` / `advanceFromShop`.
- `src/game/shop.ts` — offres, achats, re-roll.
- `src/game/upgrade-catalog.ts` — catalogue d'objets shop.
- `src/game/meta-upgrade-catalog.ts` — méta-upgrades du hangar.
- `src/systems/run.ts` — `update(dt)` orchestre la boucle, gère mort → reward.
- `src/systems/account.ts` — méta-progression cristaux + persistence localStorage (`voidline:metaProgress:v2`).
- `src/render/hud.ts` — overlays HUD/shop/hangar/pause/gameover.
- `src/phaser/scenes/BattleScene.ts` — rendu Phaser, appelle `update(dt)` chaque frame.

---

## Règles

- **Pas de magnet, pas de health pickup, pas de bombe** : les seuls drops au sol sont les boules d'XP.
- **Une carte d'upgrade modifie un seul attribut** (sauf cas explicite avec malus compensateur). Les stats OP qui multiplient (projectiles, pierce) doivent porter un malus damage.
- **Pas de level-up screen** : tous les choix se font au shop entre waves.
- **Boss tous les 5 waves** : `isBossWave(wave)` dans `balance.ts`.
- **XP = monnaie** : `state.runCurrency`. Carry 25 % géré dans `transitionToShop()` puis drainé pickup par pickup dans `wave-loop.ts:collectOrb()`.

---

## Commandes

- `npm run dev` — Vite dev server (Conductor : `npm run dev -- --port ${CONDUCTOR_PORT:-4173} --strictPort`)
- `npm run build` — typecheck + Vite production build
- `npm run typecheck`
- `npm test` — Vitest single run
- `npm run test:watch`
- `npm run smoke` — build + Playwright headless

---

## Testing

**Tout changement de logique s'accompagne d'au moins un test.** Cibles prioritaires :
- Fonctions pures de `balance.ts` (waveDuration, enemy*Scale, isBossWave, …).
- `upgrade-catalog.ts:applyUpgradeToPlayer` (stat → effet attendu).
- `shop.ts` (re-roll cost, achats, retrait de l'offre achetée).
- `wave-flow.ts` (carry-over, transition shop ↔ wave).

Pas de test pour : rendu Canvas/DOM, wiring d'event listeners, constantes triviales.

---

## Conductor

Le repo tourne dans Conductor. Chaque workspace a un port (`CONDUCTOR_PORT`). Script Conductor local dans `conductor.json`.
