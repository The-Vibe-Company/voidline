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
- Monte de niveau en ramassant assez d'XP pour choisir une amelioration avec le trackpad ou les touches 1 a 5.
- Les ameliorations existent en tiers Standard, Rare, Prototype et Singularity.
- Consulte les stats globales du vaisseau dans le panneau de gauche.
- Mets en pause avec Esc ou P.
- Survis le plus longtemps possible et maximise le score.

## Structure

- `index.html` : structure de la page et overlays.
- `styles.css` : interface, HUD et ecrans de menu.
- `src/main.ts` : point d'entree (resize, input, loop).
- `src/state.ts` : singletons mutables (state, player, world, collections).
- `src/types.ts` : interfaces TypeScript du jeu.
- `src/utils.ts` : helpers (clamp, circleHit, xpToNextLevel, ...).
- `src/game/` : input, loop, progression.
- `src/entities/` : player, enemies, bullets, particles, experience.
- `src/systems/` : waves, upgrades, camera.
- `src/render/` : background, world (canvas), hud (DOM).

`src/render/hud.ts` est le seul module qui touche le DOM. Tout le reste manipule du state typé.
