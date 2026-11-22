# 14 — SUIVI DU CHANTIER QUALITÉ & SÉCURITÉ (Lots 0 à 3)

> Document de référence pour ne rien perdre : ce qui a été fait, ce qu'il faut vérifier avant la mise en ligne,
> les règles à respecter désormais, les risques restants et la liste des choses à faire.
> Branche de travail : `ai-development` (non fusionnée dans `main`, non déployée à la date de rédaction : 22/11/2026).

---

## 1. CE QUI A ÉTÉ FAIT

| Lot | Commit | Contenu |
|-----|--------|---------|
| Lot 0 — Sécurité urgente | `3a35256` | Clé Gemini en header `x-goog-api-key` (plus dans l'URL) ; plus aucun message d'erreur brut renvoyé au client ; **seul `public/` est servi** (les fichiers du site ont été déplacés dans `public/`) ; filtre sur chemin décodé (encodage, `..`, dotfiles, extensions sensibles) ; rate limiting sur `/api/subscribe`, `/api/track-click`, `/api/track-profiles` ; CSV plafonnés (`MAX_CSV_BYTES`) et champs nettoyés. |
| Lot 1 — Sécurité applicative | `c4c1ba1` + `4b30742` | **Le prompt Gemini est construit côté serveur** (le navigateur n'envoie qu'un profil structuré, validé par listes blanches) ; sortie JSON imposée par schéma ; quotas journaliers globaux **et par IP** (IPv6 regroupées par /64) ; `/api/search` strictement validé (prix entiers, `URLSearchParams`) ; timeouts sur Gemini/RapidAPI/Brevo ; liste blanche des champs produits Amazon ; XSS des cartes produit corrigés (`sanitizeUrl` https uniquement, tag affilié via `searchParams`, échappement) ; `node-fetch` remplacé par le `fetch` natif. Nouveau module `lib/analyze.js`. |
| Lot 2 — Socle de tests | `78d6b21` | `server.js` testable (`module.exports = { app }`) ; tests unitaires + intégration (`npm test`) ; tests E2E Playwright (`npm run test:e2e`, desktop + mobile, toutes les API mockées) ; `test_security.js` corrompu supprimé ; `node-fetch` retiré de `package.json`. |
| Lot 3 — Accessibilité, bugs, PWA | (commit « Lot 3 ») | 3 bugs corrigés (débordement `profils.html` desktop, spinner infini sans données, pas d'écran d'erreur si l'IA échoue) ; boutons d'erreur sans `onclick` inline (bloqués par la CSP) ; cartes budget en groupe radio, `aria-pressed`, labels reliés, régions `aria-live`, barre de progression accessible, bannière cookies en vrai dialogue (focus piégé), `alert()` remplacés, `h1` ; **service worker v16** (réseau d'abord pour les pages, page `offline.html`) enregistré sur toutes les pages ; vraies icônes (192/512/maskable/apple) et image OG 1200×630 ; manifest corrigé ; en-têtes `Cache-Control` adaptés. |

### Tests (à lancer avant chaque commit / déploiement)

```bash
npm test             # unitaires + intégration (233 tests au 22/11/2026)
npm run test:e2e     # Playwright (52 tests), démarre son propre serveur sur le port 3100 avec des clés vides
```

Aucun test n'appelle les vraies API payantes : tout est simulé (et un garde-fou E2E bloque tout `/api/*` non simulé).

---

## 2. ⚠️ À FAIRE AVANT LA MISE EN LIGNE (checklist)

1. **Tester avec la vraie clé Gemini en local** (`npm start`, parcours complet config → profils → analyse).
   Le nouveau format de requête (instruction système + schéma JSON) n'a **jamais été testé avec le vrai service**.
   Si le modèle `gemini-2.0-flash` est retiré par Google : définir `GEMINI_MODEL` dans `.env` (aucune modification de code).
2. **Vérifier sur données réelles RapidAPI** que les liens produits sont bien en `https://` (les liens `http://` sont désormais rejetés → produit écarté).
3. **Sur le serveur (CM3588)** :
   - `IP_HASH_SALT` doit être défini dans `.env` (sinon un sel par défaut public est utilisé → hash d'IP réversible) ;
   - `NODE_ENV=production` dans `.env` ;
   - le port 3000 ne doit être joignable **que** via le tunnel Cloudflare (sinon `X-Forwarded-For` peut être falsifié et les limites contournées) — idéalement écouter sur `127.0.0.1` (voir §5) ;
   - vérifier que `ssh.offrez.net` est protégé par Cloudflare Access + authentification SSH par clé uniquement ;
   - Node 20 est requis (fetch natif).
4. **Variables d'environnement optionnelles** (valeurs par défaut entre parenthèses) :
   `GEMINI_DAILY_LIMIT` (1000), `RAPIDAPI_DAILY_LIMIT` (500), `GEMINI_DAILY_LIMIT_PER_IP` (60),
   `RAPIDAPI_DAILY_LIMIT_PER_IP` (200), `MAX_CSV_BYTES` (10 Mo), `GEMINI_MODEL` (`gemini-2.0-flash`).
   Adapter les quotas RapidAPI à l'abonnement réel.
5. **Déployer front et back ensemble** (le contrat `/api/analyze` a changé) : fusionner `ai-development` dans `main`, puis `deploy.sh` (qui fait `git checkout` + `pm2 restart`). Les CSV existants restent à la racine, hors de `public/` — rien à déplacer.
6. **Après déploiement**, vérifier :
   - `https://offrez.net/server.js` et `https://offrez.net/%73erver.js` → 404 ;
   - une analyse complète fonctionne ;
   - `/api/health` répond.

**Période de transition attendue** : pendant ~24 h, certains visiteurs ayant l'ancien code en cache verront
« OFFREZ a été mis à jour. Rechargez la page » ou une ancienne version (ancien service worker v15) jusqu'à leur
navigation suivante. C'est voulu et sans danger.

---

## 3. 📏 RÈGLES À RESPECTER DÉSORMAIS

### Versionnage des fichiers en cache (IMPORTANT)
Les fichiers appelés avec `?v=` sont mis en cache **1 an** par les navigateurs et en cache-first par le service worker.

- Toute modification de `style.min.css`, `js/analyse.js`, `js/api.js` ou `js/security.js` impose de **changer leur `?v=`**
  (dans tous les HTML qui les référencent, et dans les `import` de `analyse.js` pour `api.js`/`security.js`).
- Puis mettre à jour la liste `PRECACHE_URLS` de `public/sw.js` **et incrémenter `CACHE_NAME`** (`OFFREZ-v16` → `v17`…).
- Un oubli = les visiteurs gardent l'ancienne version (jusqu'à 1 an).
- Les modules non versionnés (`config.js`, `config-ui.js`, `profils.js`, `legal.js`, `constants.js`) sont revalidés à chaque chargement : pas de bump nécessaire, mais bumper `CACHE_NAME` reste recommandé à chaque déploiement.

### CSS
Modifier les sources dans `public/css/partials/`, puis `python tools/minify_css.py` (depuis la racine), puis bumper `style.min.css?v=` partout (voir ci-dessus et `13_GIT_ET_GITHUB.md` §5).

### API
- Le navigateur n'envoie **jamais** de prompt : le prompt est construit dans `lib/analyze.js` (`buildGiftPrompt`). Ne pas réintroduire de champ texte libre relayé tel quel à Gemini.
- Ne jamais renvoyer `error.message`, un corps d'API externe ou une URL au client : utiliser les helpers `sendUpstreamError` / messages génériques de `server.js`.
- Toute donnée externe affichée dans le navigateur passe par `escapeHtml` / `textContent`, et toute URL par `sanitizeUrl` / `buildAffiliateUrl`.

### Fichiers publics
Tout ce qui est dans `public/` est en ligne. Rien d'autre ne l'est. Ne jamais y mettre de script, de CSV, de config ou de doc interne.

---

## 4. RISQUES RESTANTS (connus et acceptés pour l'instant)

| Gravité | Risque | Détail / piste |
|---------|--------|----------------|
| Moyen | **Quota global épuisable par un attaquant disposant de beaucoup d'IP** | Le coût reste plafonné, mais le service peut être coupé (503) jusqu'à minuit. Pistes : réserver une part du quota global par bloc d'IP, jeton de session ou preuve de travail sur `/api/analyze`. |
| Moyen | **Format Gemini non testé en réel** | Voir checklist §2.1. |
| Bas | Injection de prompt résiduelle | Un utilisateur peut orienter le texte des suggestions (≤ 300 caractères, quota consommé) ; seule cible : lui-même. |
| Bas | Quotas et rate limits en mémoire | Remis à zéro au redémarrage, non partagés entre plusieurs processus ; utilisateurs derrière une même IP (bureau, 4G) partagent le quota par IP. |
| Bas | Plafond CSV approximatif | Des requêtes simultanées peuvent le dépasser de quelques lignes ; une fois atteint, l'analytics s'arrête (pas de rotation). |
| Bas | Transition service worker v15 → v16 | Raisonnée, pas testée de bout en bout. |
| Bas | Versionnage manuel (`?v=`, `CACHE_NAME`) | Voir §3. Piste : test automatique comparant le contenu des fichiers à leur `?v=`. |
| Bas | `IP_HASH_SALT` a une valeur par défaut dans le code | Faire échouer le démarrage en production si absent. |
| Bas | Handlers `uncaughtException` / `unhandledRejection` | Ils journalisent l'objet d'erreur brut et laissent tourner le processus dans un état incertain (préférer laisser PM2 redémarrer). |
| Info | Tests non exécutés sous Node 20 réel, Linux, Firefox, WebKit | Seulement Node 24 / Windows / Chromium. |

---

## 5. 📋 CHOSES À FAIRE (backlog)

### Lot 4 prévu — Dette technique
- [ ] Découper `public/js/analyse.js` (~1000 lignes, `lancerAnalyse()` géante) en modules testables (prompt/filtrage/scoring/rendu/panier/email).
- [ ] Fusionner les doublons : filtre produits (×4), échappement HTML (×3), logique de consentement (×4) — utiliser un seul `isTrackingAllowed()` qui vérifie aussi l'**expiration** du consentement (actuellement ignorée).
- [ ] Réduire Font Awesome aux icônes utilisées (~75 % du poids de la page d'accueil) ; `fa-sparkles` (`profils.html`) est une icône Pro → invisible, à remplacer.
- [ ] RGPD : ne plus envoyer les profils complets à `/api/track-profiles` (le serveur ne les stocke pas) ; purger `finalData` du `localStorage` après l'analyse ; documenter les traitements dans la politique de confidentialité ; auto-héberger les polices Google.
- [ ] Monter Express 5 / Helmet 8 (les tests servent de filet).

### Sécurité / exploitation
- [ ] Écouter sur `127.0.0.1` uniquement (`app.listen(PORT, '127.0.0.1')`) si cloudflared tourne sur la même machine.
- [ ] Exiger `IP_HASH_SALT` en production ; utiliser un HMAC.
- [ ] Quota global : réservation par bloc d'IP ou jeton de session (voir §4).
- [ ] `/api/health` public (mémoire, uptime) : restreindre si possible.
- [ ] `.well-known/security.txt` : son contenu désigne encore « OFFRLY / offrly.fr » ; le corriger puis l'autoriser explicitement dans le filtre des dotfiles (`server.js`).
- [ ] Double opt-in Brevo pour `/api/subscribe` (le consentement n'est qu'un booléen envoyé par le client).

### Accessibilité / UX (repéré, hors périmètre du Lot 3)
- [ ] `profils.html` : un `</div>` orphelin (~ligne 94) sort une partie du contenu de `<main>`.
- [ ] Modales email et d'achat (`analyse.js`) : pas de `role="dialog"` ni de gestion du focus.
- [ ] Boutons ‹ › de navigation entre suggestions : ajouter un `aria-label`.
- [ ] Chips de montant (`chip-cro`) : pas d'état ARIA.
- [ ] `.badge-step` (#6366f1 sur fond sombre) : contraste faible.
- [ ] `blog.html` : pas de `<h1>`.
- [ ] Saut de titres h1 → h3 sur `profils.html` ; fil d'étapes en `div` (pourrait être une liste `<ol>`).
- [ ] Modale email affichée après 5 s sans mémoriser sa fermeture ; faux « temps de réflexion » artificiels dans l'analyse (à reconsidérer) ; badge « € économisés » trompeur (budget − prix).

### Qualité / outillage
- [ ] Ajouter une CI (GitHub Actions) lançant `npm test` et `npm run test:e2e`.
- [ ] Tester sous Node 20 et Linux (prod) ; ajouter Firefox/WebKit aux projets Playwright si utile.
- [ ] Test automatique « hash du fichier ↔ `?v=` » pour éviter les oublis de versionnage.
- [ ] Mettre à jour les docs qui décrivent encore l'ancienne arborescence (avant `public/`) :
      `README.md`, `COMMANDES_UTILES.md`, `documentation/00_VUE_ENSEMBLE.md`, `documentation/11_SETUP_CM3588_SERVEUR.md`.
- [ ] `engines` de `package.json` : passer de `>=18` à `>=20`.

---

## 6. OÙ TROUVER QUOI

| Sujet | Fichier |
|-------|---------|
| Validation des entrées, prompt Gemini, quotas, normalisation produits | `lib/analyze.js` |
| Routes API, filtre des fichiers, en-têtes de cache | `server.js` |
| Échappement / URLs sûres côté navigateur | `public/js/security.js` |
| Service worker (stratégies de cache, précache) | `public/sw.js` |
| Tests unitaires / intégration / E2E | `tests/unit/`, `tests/integration/`, `tests/e2e/` |
| Git et déploiement | `documentation/13_GIT_ET_GITHUB.md` |
