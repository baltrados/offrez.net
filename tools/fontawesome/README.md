# Font Awesome réduit (outil de build, non servi)

Le site n'embarque qu'un **sous-ensemble** de Font Awesome Free 6.5.0 (Lot 4c) :
`public/css/fontawesome/fa-offrez.min.css` + `public/css/webfonts/fa-solid-900.woff2` / `fa-brands-400.woff2`,
contenant uniquement les icônes réellement utilisées.

`src/` contient les sources d'origine nécessaires à la régénération (licence : icônes CC BY 4.0,
polices SIL OFL 1.1, code MIT — voir l'en-tête de `src/fontawesome/all.min.css`).

## Ajouter / retirer une icône

1. Utiliser la classe `fa-xxx` (icône **Free** uniquement) dans un HTML de `public/` ou un JS de `public/js/`.
2. Depuis la racine du dépôt (Python 3 + `pip install fonttools brotli`) :

   ```bash
   python -I tools/fontawesome/build_fa.py tools/fontawesome/src public <NOUVEAU_JETON>
   ```

   Le script recense les classes `fa-*`, génère la feuille réduite et sous-échantillonne les polices.
   Il affiche `NOT FOUND in FA Free css` si une icône n'existe pas en version Free
   (`fa-offrez` y apparaît toujours : c'est le nom de la feuille dans les `<link>`, faux positif sans conséquence).
   Vérifié le 24/11/2026 : la régénération avec le jeton `650a` reproduit les fichiers à l'octet près.
3. **Changer le jeton de version** (actuellement `650a`) : les polices sont servies en `?v=<jeton>`
   et mises en cache 1 an. Reporter le nouveau jeton dans `PRECACHE_URLS` de `public/sw.js`
   et incrémenter `CACHE_NAME` (voir `documentation/14_SUIVI_CHANTIER_QUALITE.md` §3).
4. `npm test` vérifie que chaque icône utilisée existe dans la feuille réduite ;
   `npm run test:e2e` vérifie qu'elle s'affiche réellement.
