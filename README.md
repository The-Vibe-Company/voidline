# Voidline

Petit rogue-lite spatial jouable dans le navigateur.

## Lancer

```sh
npm install
npm run dev
```

Puis ouvre l'URL affichee par Vite (par defaut `http://127.0.0.1:5173`).

## Build production

```sh
npm run build
npm run preview
```

## Boucle de jeu

- Deplace le vaisseau avec les fleches directionnelles ou WASD.
- Passe en mode trackpad pour diriger le vaisseau vers le curseur.
- Explore une arene plus grande que l'ecran avec une camera qui suit le vaisseau.
- Le vaisseau cible et tire automatiquement sur l'ennemi le plus proche.
- Les ennemis lachent des fragments d'XP a recuperer dans l'arene.
- Monte de niveau en ramassant assez d'XP pour choisir une arme level-up ou une technologie.
- Les technologies remplacent les tomes: degats, cadence, projectiles, calibre, aimant, crit, defense, vitesse.
- Survis 10 minutes pour faire apparaitre le boss du niveau; le battre fait passer au niveau suivant.
- Les cristaux gagnes a la fin d'une run achetent personnages, armes et technologies.
- Battre le boss du niveau 1 debloque le depart direct niveau 2, avec bonus de cristaux mais sans bonus de puissance.
- Les ameliorations existent en tiers Standard, Rare, Prototype et Singularity.
- Consulte les stats globales du vaisseau dans le panneau de gauche.
- Mets en pause avec Esc ou P.
- Survis le plus longtemps possible, bats les boss et reinvestis tes cristaux dans le hangar.

## Structure

- `index.html` : structure de la page et overlays.
- `styles.css` : interface, HUD et ecrans de menu.
- `src/main.ts` : point d'entree (simulation, Phaser, input, HUD).
- `src/state.ts` : singletons mutables (state, player, world, collections).
- `src/types.ts` : interfaces TypeScript du jeu.
- `src/utils.ts` : helpers (clamp, circleHit, xpToNextLevel, ...).
- `src/simulation/` : wrapper TypeScript autour du moteur Rust/WASM.
- `src/phaser/` : runtime WebGL Phaser, scenes, textures generees, pools de rendu.
- `src/generated/voidline-wasm/` : bindings WASM generes depuis `sim/crates/voidline-wasm`.
- `sim/crates/voidline-sim/` : moteur gameplay Rust source de verite.
- `src/game/` : catalogues, balance exportee, input, progression meta.
- `src/entities/` : entites visuelles TypeScript restantes (particules, zones XP).
- `src/systems/` : wrappers UI/systemes pour waves, upgrades, relics, compte.
- `src/render/` : HUD DOM et overlays.

`src/render/hud.ts` conserve les overlays DOM. Phaser rend le monde et lit le snapshot produit par Rust; les regles de jeu ne dependent pas des sprites ni d'une copie TypeScript.

## Perf

Le mode stress navigateur accepte des parametres d'URL :

```text
?bench=1&enemies=2000&bullets=300&orbs=1000&seconds=20
```

Le jeu cible 60 FPS desktop avec un fixture de rendu WebGL lourd, culling camera, pools de rendu et budgets visuels pour les particules, textes et XP visibles.
