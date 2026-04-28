# Voidline

Petit rogue-lite spatial jouable dans le navigateur.

## Lancer

Ouvre `index.html` dans un navigateur moderne.

## Boucle de jeu

- Deplace le vaisseau avec les fleches directionnelles ou WASD.
- Passe en mode trackpad pour diriger le vaisseau vers le curseur.
- Le vaisseau cible et tire automatiquement sur l'ennemi le plus proche.
- Termine une vague pour choisir une amelioration avec le trackpad ou les touches 1/2/3.
- Les ameliorations existent en tiers Standard, Rare, Prototype et Singularity.
- Mets en pause avec Esc ou P.
- Survis le plus longtemps possible et maximise le score.

## Structure

- `index.html` : structure de la page et overlays.
- `styles.css` : interface, HUD et ecrans de menu.
- `src/game.js` : moteur canvas, vagues, upgrades, collisions et rendu.
