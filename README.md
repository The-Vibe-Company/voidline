# Voidline

Petit rogue-lite spatial jouable dans le navigateur.

## Lancer

Ouvre `index.html` dans un navigateur moderne.

## Boucle de jeu

- Deplace le vaisseau avec les fleches directionnelles ou WASD.
- Passe en mode trackpad pour diriger le vaisseau vers le curseur.
- Explore une arene plus grande que l'ecran avec une camera qui suit le vaisseau.
- Le vaisseau cible et tire automatiquement sur l'ennemi le plus proche.
- Les ennemis lachent des fragments d'XP a recuperer dans l'arene.
- Monte de niveau en ramassant assez d'XP pour choisir une amelioration avec le trackpad ou les touches 1/2/3.
- Les ameliorations existent en tiers Standard, Rare, Prototype et Singularity.
- Consulte les stats globales du vaisseau dans le panneau de gauche.
- Mets en pause avec Esc ou P.
- Survis le plus longtemps possible et maximise le score.

## Structure

- `index.html` : structure de la page et overlays.
- `styles.css` : interface, HUD et ecrans de menu.
- `src/game.js` : moteur canvas, vagues, upgrades, collisions et rendu.
