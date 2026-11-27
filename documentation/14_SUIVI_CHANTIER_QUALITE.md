# 14 — SUIVI DU CHANTIER QUALITÉ & SÉCURITÉ

> Document de référence pour ne rien perdre : ce qui a été fait, ce qu'il faut vérifier avant la mise en ligne,
> les règles à respecter désormais, les risques restants et la liste des choses à faire.
> Branche de travail actuelle : `mvp-cloud-render` (non fusionnée dans `main`, non déployée au 2026-11-22).
> Les sections 1 et 2 décrivent l'état avant le 2026-11-22 (ancien serveur CM3588) : elles sont conservées comme historique.
> Pour le déploiement actuel, voir `15_DEPLOIEMENT_RENDER.md`.

---

## 0. CHANTIER « MVP + PASSAGE À RENDER » (2026-11-22)

| Lot | Commit | Ce qui a été fait |
|-----|--------|-------------------|
| Lot 1 | `3e20add` | Suppression de `admin-stats.js`, du script npm `stats` et de `tools/archive/`. |
| Lot 2 | `ba80b98` | Intégration Brevo et collecte d'emails retirées (route `/api/subscribe` supprimée ; la liste de contacts reste chez Brevo). |
| Lot 3a | `a991edb` | Suivi retiré : routes `/api/track-click` et `/api/track-profiles`, journaux `searches.csv` / `clicks.csv`. |
| Lot 3b | `ef59721` | Bannière cookies supprimée (`legal.js`, `consent.js`). |
| Lot 4 | `e836881` | Adaptation à Render : `TRUST_PROXY`, Node 22.x, `/api/health` = `{"status":"ok"}`, arrêt propre, écoute sur `0.0.0.0`, code PM2 retiré, dépendance `cors` et `IP_HASH_SALT` supprimées, nouveau `.env.example`. |
| Lot 5 | `fd8f349` | Protection des coûts : plafonds 100 / 150 (0 = service coupé), quotas par IP 35 / 70, rate limiting 12/min (analyze) et 30/min (search), caches mémoire (Gemini 12 h sans prénom, Amazon 24 h), `Retry-After`, en-tête `X-Cache`. |
| Lot 6 | (ce lot) | Documentation mise en cohérence : README, commandes, vue d'ensemble, Git, déploiement Render. |

Restent : revue de code indépendante, audit sécurité, PR vers `main`, création du service Render et bascule DNS (par le propriétaire), puis nettoyage de l'ancien serveur.

---

## 1. CE QUI A ÉTÉ FAIT

| Lot | Commit | Contenu |
|-----|--------|---------|
| Lot 0 — Sécurité urgente | `3a35256` | Clé Gemini en header `x-goog-api-key` (plus dans l'URL) ; plus aucun message d'erreur brut renvoyé au client ; **seul `public/` est servi** (les fichiers du site ont été déplacés dans `public/`) ; filtre sur chemin décodé (encodage, `..`, dotfiles, extensions sensibles) ; rate limiting sur `/api/subscribe`, `/api/track-click`, `/api/track-profiles` ; CSV plafonnés (`MAX_CSV_BYTES`) et champs nettoyés. |
| Lot 1 — Sécurité applicative | `c4c1ba1` + `4b30742` | **Le prompt Gemini est construit côté serveur** (le navigateur n'envoie qu'un profil structuré, validé par listes blanches) ; sortie JSON imposée par schéma ; quotas journaliers globaux **et par IP** (IPv6 regroupées par /64) ; `/api/search` strictement validé (prix entiers, `URLSearchParams`) ; timeouts sur Gemini/RapidAPI/Brevo ; liste blanche des champs produits Amazon ; XSS des cartes produit corrigés (`sanitizeUrl` https uniquement, tag affilié via `searchParams`, échappement) ; `node-fetch` remplacé par le `fetch` natif. Nouveau module `lib/analyze.js`. |
| Lot 2 — Socle de tests | `78d6b21` | `server.js` testable (`module.exports = { app }`) ; tests unitaires + intégration (`npm test`) ; tests E2E Playwright (`npm run test:e2e`, desktop + mobile, toutes les API mockées) ; `test_security.js` corrompu supprimé ; `node-fetch` retiré de `package.json`. |
| Lot 3 — Accessibilité, bugs, PWA | (commit « Lot 3 ») | 3 bugs corrigés (débordement `profils.html` desktop, spinner infini sans données, pas d'écran d'erreur si l'IA échoue) ; boutons d'erreur sans `onclick` inline (bloqués par la CSP) ; cartes budget en groupe radio, `aria-pressed`, labels reliés, régions `aria-live`, barre de progression accessible, bannière cookies en vrai dialogue (focus piégé), `alert()` remplacés, `h1` ; **service worker v16** (réseau d'abord pour les pages, page `offline.html`) enregistré sur toutes les pages ; vraies icônes (192/512/maskable/apple) et image OG 1200×630 ; manifest corrigé ; en-têtes `Cache-Control` adaptés. |

| Lot 4b — Backend / dépendances | (commit « Lot 4b ») | **Express 4 → 5.3** et **Helmet 7 → 8.3** (seul changement de code : route de repli `app.get('/{*splat}')`, en-têtes HTTP identiques) ; `engines` Node `>=20` ; `/api/track-profiles` accepte le nouveau format `{ count, consent }` (nombre de profils seulement, RGPD) et encore l'ancien `{ profiles: [...] }` pendant la transition (seule la longueur est lue) ; `tools/deploy-server.sh` lance désormais `npm ci --omit=dev`. |
| Lot 4a — Refactor frontend | (commit « Lot 4a + 4c ») | `analyse.js` (1033 → 189 lignes) découpé en modules dans `public/js/analyse/` (`settings`, `products`, `cart`, `session-data`, `ui`, `render`, `email-capture`, `purchase`) — logique pure testable sous Node, comportement identique prouvé par test différentiel ; doublons fusionnés (filtre produits ×4 → `filterProducts`, échappement → `escapeHtml`, consentement ×4 → `public/js/consent.js` avec `isTrackingAllowed()` qui vérifie aussi l'**expiration**) ; code de debug mort supprimé ; RGPD : seul le nombre de profils est envoyé à `/api/track-profiles`, `finalData` est déplacé en `sessionStorage` au démarrage puis purgé après l'analyse (copie de session gardée uniquement pour « Réessayer » après une panne). |

| Lot 4c — Ressources & confidentialité | (commit « Lot 4a + 4c ») | **Font Awesome réduit** aux 41 icônes utilisées (CSS 102 Ko → 4 Ko, polices 273 Ko → 5 Ko ; outil de régénération dans `tools/fontawesome/`) ; `fa-sparkles` (icône Pro invisible) remplacée ; **polices auto-hébergées** dans `public/fonts/` (Outfit ; Poppins uniquement sur les 4 pages qui la chargeaient) — plus aucune requête vers Google Fonts ni cdnjs ; **CSP** sans hôtes tiers ; poids de la page d'accueil −73 % ; **politique de confidentialité** mise à jour pour décrire les traitements réels (**à faire relire**, voir §2). |

### Tests (à lancer avant chaque commit / déploiement)

```bash
npm test             # unitaires + intégration (315 tests au 24/11/2026)
npm run test:e2e     # Playwright (68 tests), démarre son propre serveur sur le port 3100 avec des clés vides
```

Aucun test n'appelle les vraies API payantes : tout est simulé (et un garde-fou E2E bloque tout `/api/*` non simulé).

---

## 2. CHECKLIST AVANT MISE EN LIGNE (HISTORIQUE, ancien serveur, avant le 2026-11-22)

1. ✅ **Testé en local avec les vraies clés le 24/11/2026 : parcours complet fonctionnel.**
   - `gemini-2.0-flash` puis `gemini-2.5-flash-lite` sont **retirés** pour les nouvelles clés (HTTP 404 → 502 côté site).
     Modèle par défaut du code passé à **`gemini-3.5-flash-lite`** (recommandé par Google), testé avec la requête
     réelle : 2 suggestions valides, 0 jeton de réflexion, ~1,6 s. Changer de modèle = `GEMINI_MODEL` dans `.env`.
   - ⚠️ Tous les modèles Gemini récents « réfléchissent » : si un futur modèle renvoie des réponses vides
     (`finishReason` MAX_TOKENS), augmenter `maxOutputTokens` (1024, `server.js`) ou désactiver la réflexion.
   - Diagnostic des erreurs : le navigateur ne voit qu'un 502 générique ; la cause est dans le terminal du serveur
     (`[GEMINI] Erreur API: HTTP …` / `[RAPIDAPI AMAZON] Erreur API: HTTP …`).
   - RapidAPI : la clé doit être **abonnée à « Real-Time Amazon Data »** (au moins le plan gratuit), sinon
     HTTP 403 « You are not subscribed to this API ». Le plan gratuit est limité (HTTP 429 au-delà).
   - Les clés vont dans **`.env`** (lu par le serveur, ignoré par git) — **jamais dans `.env.example`** (suivi par git).
   - Les clés Gemini et RapidAPI ayant été exposées pendant la mise au point, **les régénérer** avant la mise en ligne.
2. **Vérifier sur données réelles RapidAPI** que les liens produits sont bien en `https://` (les liens `http://` sont désormais rejetés → produit écarté).
3. **Sur le serveur (CM3588)** :
   - `IP_HASH_SALT` doit être défini dans `.env` avec une **valeur aléatoire propre** (pas la valeur d'exemple) :
     `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Il rend les empreintes d'IP de
     `clicks.csv` impossibles à inverser ; sans lui (ou avec la valeur d'exemple / par défaut, publiques), une IP
     se retrouve en quelques minutes. **Ne plus le changer ensuite** (sinon les statistiques de clics sont faussées) ;
   - `NODE_ENV=production` dans `.env` ;
   - le port 3000 ne doit être joignable **que** via le tunnel Cloudflare (sinon `X-Forwarded-For` peut être falsifié et les limites contournées) — idéalement écouter sur `127.0.0.1` (voir §5) ;
   - vérifier que `ssh.offrez.net` est protégé par Cloudflare Access + authentification SSH par clé uniquement ;
   - Node 20 est requis (fetch natif).
4. **Variables d'environnement optionnelles** (valeurs par défaut entre parenthèses) :
   `GEMINI_DAILY_LIMIT` (1000), `RAPIDAPI_DAILY_LIMIT` (500), `GEMINI_DAILY_LIMIT_PER_IP` (60),
   `RAPIDAPI_DAILY_LIMIT_PER_IP` (200), `MAX_CSV_BYTES` (10 Mo), `GEMINI_MODEL` (`gemini-3.5-flash-lite`).
   Adapter les quotas RapidAPI à l'abonnement réel.
5. **Mettre à jour le script de déploiement SUR LE SERVEUR avant de déployer** (Lot 4b) :
   `tools/deploy-server.sh` ajoute l'étape `npm ci --omit=dev`, indispensable depuis Express 5 / Helmet 8
   (sinon l'ancien `node_modules` en Express 4 reste en place et la route de repli ne fonctionne plus).
   La copie exécutée en production est `~/offrly/deploy.sh` : la recopier une fois
   (`scp tools/deploy-server.sh pi@192.168.1.100:~/offrly/deploy.sh`, cf. `13_GIT_ET_GITHUB.md` §7).
   Vérifier aussi que `npm` est disponible pour l'utilisateur qui lance le script.
6. **Déployer front et back ensemble** (le contrat `/api/analyze` a changé) : fusionner `ai-development` dans `main`, puis `deploy.sh` (`git checkout` + `npm ci --omit=dev` + `pm2 restart`). Les CSV existants restent à la racine, hors de `public/` — rien à déplacer.
7. **Après déploiement**, vérifier :
   - `https://offrez.net/server.js` et `https://offrez.net/%73erver.js` → 404 ;
   - une analyse complète fonctionne ;
   - `/api/health` répond.

8. **Faire relire la politique de confidentialité** (`public/politique-confidentialite.html`, sections marquées
   `<!-- … À FAIRE RELIRE (validation juridique) -->`). Points signalés :
   - la durée « 12 mois » des fichiers `searches.csv` / `clicks.csv` n'est **appliquée par aucun code** (pas de rotation ni de purge) ;
   - « IP pseudonymisée (hachée) » n'est vrai que si `IP_HASH_SALT` est défini en production (voir point 3) ;
   - base légale « exécution du service » pour l'envoi des profils (y compris texte libre) à Google Gemini ;
   - rien n'est dit sur les transferts hors UE (Google, RapidAPI, Brevo) ni sur la conservation chez ces prestataires ;
   - les images produits chargées depuis Amazon exposent l'IP du visiteur à Amazon ;
   - pas de double opt-in Brevo ; formulation « aucun profil comportemental ».

**Période de transition attendue** : pendant ~24 h, certains visiteurs ayant l'ancien code en cache verront
« OFFREZ a été mis à jour. Rechargez la page » ou une ancienne version (ancien service worker v15) jusqu'à leur
navigation suivante. C'est voulu et sans danger.

---

## 3. 📏 RÈGLES À RESPECTER DÉSORMAIS

### Versionnage des fichiers en cache (IMPORTANT)
Les fichiers appelés avec `?v=` sont mis en cache **1 an** par les navigateurs et en cache-first par le service worker.

- Toute modification de `style.min.css`, `js/analyse.js`, `js/api.js` ou `js/security.js` impose de **changer leur `?v=`**
  (dans tous les HTML qui les référencent, et dans les `import` de `analyse.js` pour `api.js`/`security.js`).
- **Modules de l'analyse (`js/analyse/*.js`)** : ils portent **le même `?v=` que `analyse.js`** (dans les `import`). Modifier l'un d'eux = changer ce jeton unique partout (HTML, imports, `sw.js`).
- Puis mettre à jour la liste `PRECACHE_URLS` de `public/sw.js` **et incrémenter `CACHE_NAME`** (actuellement `OFFREZ-v17` → `v18`…).
- Un oubli = les visiteurs gardent l'ancienne version (jusqu'à 1 an).
- Les modules non versionnés (`config.js`, `config-ui.js`, `profils.js`, `constants.js`) sont revalidés à chaque chargement : pas de bump nécessaire, mais bumper `CACHE_NAME` reste recommandé à chaque déploiement.

- **Font Awesome** : les polices réduites sont servies en `?v=650a`. Ajouter une icône = régénérer avec
  `tools/fontawesome/build_fa.py` et **changer ce jeton** (procédure dans `tools/fontawesome/README.md`).
- **Polices auto-hébergées** (`public/fonts/`) : sous-ensemble latin uniquement ; les caractères hors latin
  (latin-ext) s'affichent avec la police de repli.

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
| Bas | Retrait de modèles Gemini par Google | Déjà arrivé (2.0-flash, 2.5-flash-lite). Symptôme : 502 sur l'analyse + `[GEMINI] Erreur API: HTTP 404` dans les logs. Parade : `GEMINI_MODEL` dans `.env` (voir §2.1). Format de requête validé en réel le 24/11/2026. |
| Bas | Injection de prompt résiduelle | Un utilisateur peut orienter le texte des suggestions (≤ 300 caractères, quota consommé) ; seule cible : lui-même. |
| Moyen | Quotas, rate limits et caches en mémoire | Remis à zéro au redémarrage ou au réveil de l'offre gratuite de Render, non partagés entre plusieurs instances (une seule instance autorisée) ; plafonds durs à fixer chez Google et RapidAPI ; utilisateurs derrière une même IP (bureau, 4G) partagent le quota par IP. |
| Bas | Transition service worker v15 → v16 | Raisonnée, pas testée de bout en bout. |
| Bas | Versionnage manuel (`?v=`, `CACHE_NAME`) | Voir §3. Piste : test automatique comparant le contenu des fichiers à leur `?v=`. |
| Info | Parseur de requêtes Express 5 (« simple ») | `a[b]=1` n'est plus transformé en objet (clé littérale) ; un paramètre répété donne toujours un tableau. Aucun code actuel n'en dépend — à savoir pour les évolutions. |
| Bas | Copie de session des profils après une panne | Après un échec technique, une copie des profils reste dans le `sessionStorage` de l'onglet (pour « Réessayer ») jusqu'à « Modifier ma recherche » ou la fermeture de l'onglet. Si le `sessionStorage` est indisponible, « Réessayer » mène à « Aucun profil à analyser » (choix : ne jamais laisser les profils en `localStorage`). |
| Bas | Images produits | Échappées mais non filtrées par hôte côté navigateur (le serveur les filtre déjà : `*.media-amazon.com`) ; chargées directement depuis Amazon. |
| Info | Tests non exécutés sous Node 20 réel, Linux, Firefox, WebKit | Seulement Node 24 / Windows / Chromium. |

---

## 5. 📋 CHOSES À FAIRE (backlog)

### Fait (historique)
- [x] Découpage de `analyse.js`, doublons fusionnés, Font Awesome réduit, polices auto-hébergées, Express 5 / Helmet 8 (Lots 4a à 4c).
- [x] Brevo, collecte d'emails, CSV, suivi, bannière cookies, `cors`, `IP_HASH_SALT` : supprimés le 2026-11-22 (voir §0).

### Nettoyage et conformité
- [ ] Nettoyer le CSS mort (`.email-*`, `.cookie-banner`, `#resultNavigation`) : nécessite `python tools/minify_css.py` et un changement du jeton `?v=` (et `CACHE_NAME` du service worker).
- [ ] Relecture juridique de la politique de confidentialité (commentaires `À FAIRE RELIRE` dans `public/politique-confidentialite.html`).
- [x] Adresse de l'hébergeur (Render Services, Inc., 525 Brannan Street, Suite 300, San Francisco) ajoutée aux mentions légales le 2026-11-27 ; Render ne publie pas de téléphone : contact legal@render.com indiqué.

### Sécurité / exploitation
- [ ] Regrouper les requêtes Gemini identiques simultanées (une seule requête envoyée, les autres attendent son résultat).
- [ ] Compteurs et caches persistants (Redis) si plusieurs instances un jour.
- [ ] Quota global : réservation par bloc d'IP ou jeton de session (voir §4).
- [ ] `/api/health` public : ne renvoie plus que `{"status":"ok"}` (rien à restreindre pour l'instant).
- [x] `.well-known/security.txt` réécrit (RFC 9116, contact@offrez.net) et servi par une route dédiée (`server.js`), le filtre des dotfiles restant inchangé (2026-11-27).

### Accessibilité / UX (repéré, hors périmètre du Lot 3)
- [x] `profils.html` : `</div>` orphelin supprimé, tout le contenu est dans `<main>` (2026-11-27).
- [x] Modale d'achat : `role="dialog"`, Échap, focus restitué, et Tab / Maj+Tab maintenus dans la fenêtre (2026-11-27).
- [x] Boutons ‹ › de navigation entre suggestions : `aria-label` présents.
- [x] Chips de montant (`chip-cro`) : `aria-pressed` (2026-11-27).
- [x] `.badge-step` : #a5b4fc, contraste 7,4:1 (au lieu de 3,3:1) (2026-11-27).
- [x] `blog.html` : `<h1>` présent.
- [x] `profils.html` : titres des fiches en h2 ; fil d'étapes exposé comme liste (`role="list"`, connecteurs `aria-hidden`) sur les 3 pages (2026-11-27).
- [x] `politique-confidentialite.html` : plus de débordement horizontal en 375 px (PR #12, vérifié par `tests/e2e/audit-ux.spec.js`).
- [x] Puces des listes légales : `content: "2"` (2026-11-27).
- [x] `404.html` : `<base href="/">`, styles chargés quel que soit le sous-dossier.
- [ ] `offline.html` affiche désormais le logo en Outfit (avant : police système) — écart volontaire mineur, à valider.
- [ ] Faux « temps de réflexion » artificiels dans l'analyse (à reconsidérer) ; badge « € économisés » trompeur (budget − prix).

### Qualité / outillage
- [ ] Ajouter une CI (GitHub Actions) lançant `npm test` et `npm run test:e2e`.
- [ ] Tester sous Node 20 et Linux (prod) ; ajouter Firefox/WebKit aux projets Playwright si utile.
- [ ] Test automatique « hash du fichier ↔ `?v=` » pour éviter les oublis de versionnage.
- [x] `engines` de `package.json` : `22.x` (Lot 4).

---

## 6. OÙ TROUVER QUOI

| Sujet | Fichier |
|-------|---------|
| Validation des entrées, prompt Gemini, quotas, normalisation produits | `lib/analyze.js` |
| Routes API, filtre des fichiers, en-têtes de cache | `server.js` |
| Échappement / URLs sûres côté navigateur | `public/js/security.js` |
| Service worker (stratégies de cache, précache) | `public/sw.js` |
| Logique de l'analyse (filtres, scoring, panier, purge RGPD) | `public/js/analyse/` |
| Régénération de Font Awesome | `tools/fontawesome/` |
| Tests unitaires / intégration / E2E | `tests/unit/`, `tests/integration/`, `tests/e2e/` |
| Git | `documentation/13_GIT_ET_GITHUB.md` |
| Déploiement Render | `documentation/15_DEPLOIEMENT_RENDER.md` |
