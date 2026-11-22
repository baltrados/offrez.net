# OFFREZ

Application web qui recommande des cadeaux personnalisés : l'utilisateur décrit le bénéficiaire et son budget, Google Gemini propose des idées, puis des produits réels d'Amazon.fr sont recherchés via RapidAPI. Installable comme application (PWA).

## Stack

- Node.js 22.x, Express 5 (Helmet, compression, express-rate-limit, dotenv)
- HTML, CSS et JavaScript natif (aucun framework), PWA (service worker)
- Google Gemini (recommandations), RapidAPI / Amazon (produits)
- Tests : `node --test` (unitaires, intégration), Playwright (E2E)
- Hébergement cible : Render (offre gratuite, région Francfort)

## Arborescence

```
server.js             Serveur Express : routes API, sécurité, fichiers statiques
lib/analyze.js        Validation, prompt Gemini, quotas, caches, normalisation des produits
lib/config.js         Lecture et validation de la configuration
public/               Seul dossier servi au navigateur (HTML, css/, js/, fonts/, sw.js, manifest.json)
public/js/analyse/    Modules de la page de résultats
tests/                unit/, integration/, e2e/
tools/                minify_css.py (CSS), fontawesome/ (icônes), scripts de l'ancien serveur
documentation/        Guides du projet
.env.example          Modèle de configuration
```

## Installation locale

```bash
npm ci
cp .env.example .env     # puis renseigner GEMINI_API_KEY et RAPIDAPI_KEY
npm start
```

Ouvrir http://localhost:3000. Le fichier `.env` n'est jamais versionné : les clés restent côté serveur.

## Tests

```bash
npm test             # unitaires puis intégration (aucun appel réel aux API)
npm run test:e2e     # Playwright, démarre son propre serveur sur le port 3100
```

## Déploiement

Render déploie automatiquement la branche `main`. Procédure complète (variables, plafonds chez les fournisseurs, bascule DNS) : [documentation/15_DEPLOIEMENT_RENDER.md](documentation/15_DEPLOIEMENT_RENDER.md).

## Protections contre les abus et les coûts

Les routes `/api/analyze` (12 requêtes/min par IP) et `/api/search` (30/min) sont limitées. Des plafonds journaliers globaux (Gemini 100, RapidAPI 150) et par IP (35 analyses, 70 recherches) bloquent les appels payants au-delà ; la valeur `0` coupe le service. Un cache mémoire évite les appels répétés (Gemini 12 h, sans le prénom ; Amazon 24 h) et l'en-tête `X-Cache` indique `HIT` ou `MISS`. Compteurs et caches sont en mémoire : ils repartent à zéro au redémarrage.

## Documentation

- [COMMANDES_UTILES.md](COMMANDES_UTILES.md) : commandes courantes
- [documentation/00_VUE_ENSEMBLE.md](documentation/00_VUE_ENSEMBLE.md) : vue d'ensemble
- [documentation/13_GIT_ET_GITHUB.md](documentation/13_GIT_ET_GITHUB.md) : Git et GitHub
- [documentation/14_SUIVI_CHANTIER_QUALITE.md](documentation/14_SUIVI_CHANTIER_QUALITE.md) : suivi qualité et sécurité
- [documentation/archive/](documentation/archive/) : anciennes docs (lecture seule)

## Licence

MIT
