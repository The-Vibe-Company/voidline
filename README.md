# Voidline

Petit Brotato-like spatial jouable dans le navigateur. 100 % TypeScript + Phaser 4.

## Lancer

```sh
npm install
npm run dev
```

Puis ouvre l'URL affichée par Vite (par défaut `http://127.0.0.1:5173`).

## Build production

```sh
npm run build
npm run preview
```

## Boucle de jeu

- Déplace le vaisseau avec les flèches ou WASD ; le vaisseau tire automatiquement sur l'ennemi le plus proche.
- Tu démarres en wave 1 (~20 s). À la fin d'une wave : transition shop.
- **Monnaie = boules d'XP** ramassées pendant la wave (`runCurrency`). Les XP non ramassées laissent un **carry de 25 %** récupérable lors de la wave suivante.
- Le shop propose 4 augmentations (dégâts, cadence, vitesse, PV max, projectiles, pénétration, calibre, crit, vélocité). Re-roll possible (coût croissant).
- Toutes les 5 waves (5, 10, 15, …) : wave boss.
- Mort → écran de fin → cristaux gagnés → hangar pour acheter des méta-upgrades permanentes.
- Pause avec ESC ou P.

## Structure

- `index.html` / `styles.css` : structure DOM et HUD.
- `src/main.ts` : point d'entrée.
- `src/state.ts` : état runtime (player, enemies, bullets, …).
- `src/types.ts` : interfaces TS.
- `src/game/balance.ts` : constantes gameplay (durée wave, scaling ennemis, XP, shop, boss).
- `src/game/wave-loop.ts` : moteur TS — `stepWave(dt)` (mouvement, spawn, IA, tir, collisions, XP).
- `src/game/wave-flow.ts` : transitions `startRun` / `startWave` / `transitionToShop` / `advanceFromShop`.
- `src/game/shop.ts` : offres, achat, re-roll.
- `src/game/upgrade-catalog.ts` : objets shop.
- `src/game/meta-upgrade-catalog.ts` : méta-upgrades hangar.
- `src/systems/run.ts` : `update(dt)` orchestre la boucle.
- `src/systems/account.ts` : cristaux, records, persistence (`localStorage` clé `voidline:metaProgress:v2`).
- `src/render/hud.ts` : overlays DOM (HUD, shop, hangar, pause, gameover).
- `src/phaser/` : rendu Phaser (scenes, textures générées, pools de sprites).
