---
description: Guide complet pour un agent IA travaillant sur le projet OFFREZ - architecture, conventions et pièges à éviter
---

# Guide Agent IA — Projet OFFREZ

## Vue d'ensemble

OFFREZ est un site de recommandation de cadeaux basé sur l'IA. L'utilisateur décrit des profils (âge, sexe, budget, centres d'intérêt) → Gemini génère des termes de recherche → Amazon RapidAPI retourne des produits réels → l'utilisateur est redirigé vers Amazon avec un tag affilié.

**Stack** : Node.js/Express (backend) + HTML/CSS/JS vanilla (frontend). Pas de framework, pas de bundler, pas de TypeScript.

---

## Architecture des fichiers

```
c:\site cadeau\save\          ← Projet local
~/offrly/                      ← Serveur de production (CM3588)

├── server.js                  ← Backend Express (API proxy, sécurité, cache)
├── .env                       ← Clés API (JAMAIS exposé publiquement)
├── package.json
│
├── index.html                 ← Landing page (étape 0)
├── config.html                ← Étape 1 : occasion + budget
├── profils.html               ← Étape 2 : création des profils
├── analyse.html               ← Étape 3 : résultats IA + produits
│
├── js/
│   ├── config.js              ← Logique étape 1 (formulaire config)
│   ├── profils.js             ← Logique étape 2 (création profils)
│   ├── analyse.js             ← Logique étape 3 (appels IA + Amazon + affichage)
│   ├── api.js                 ← Client API (callGemini, searchAmazon)
│   ├── security.js            ← Utilitaires XSS (escapeHtml, sanitizeUrl)
│   ├── config-ui.js          ← UI config (animations, chips)
│   └── sw-register.js        ← Enregistrement Service Worker
│
├── style.min.css              ← CSS minifié servi en production (35 KB)
├── style.css                  ← Ancien monolithique (NE PLUS MODIFIER)
├── css/partials/              ← 12 fichiers CSS modulaires (source de vérité)
│   ├── _01-variables.css      ← Variables :root
│   ├── _02-base.css          ← Reset, body, container
│   ├── ...                   ← (03 à 11)
│   └── _12-responsive.css    ← Media queries consolidées
├── css/fontawesome/           ← Icônes FontAwesome (local)
├── css/webfonts/              ← Polices (local)
│
├── cgu.html, mentions-legales.html, politique-confidentialite.html
├── 404.html                   ← Page d'erreur personnalisée
├── sw.js                      ← Service Worker (PWA)
├── manifest.json              ← Manifest PWA
│
├── emails.csv                 ← Leads collectés (⚠️ sensible)
├── clicks.csv                 ← Clics Amazon (⚠️ sensible)
├── searches.csv               ← Recherches populaires (⚠️ sensible)
├── visitors.json              ← Profils visiteurs (⚠️ sensible)
└── admin-stats.js             ← Script CLI dashboard (node admin-stats.js)
```

---

## Flux de données utilisateur

```
config.html → localStorage('giftConfig')
                    ↓
profils.html → localStorage('finalData')  → /api/track-profiles
                    ↓
analyse.html → lecture localStorage('finalData')
                    ↓
              callGemini() → /api/analyze → Gemini API
                    ↓ (termes de recherche)
              searchAmazon() → /api/search → RapidAPI Amazon
                    ↓ (produits filtrés + scorés)
              Affichage résultats + Panier Amazon
                    ↓
              Clic produit → /api/track-click + redirection Amazon
```

### Clés localStorage

| Clé | Contenu | Utilisé par |
|---|---|---|
| `giftConfig` | `{occasion, nb, strategy, amount}` | `config.js` → `profils.js` |
| `finalData` | `{contexte, equipe: [{nom,sexe,age,budget,tags,details}]}` | `profils.js` → `analyse.js` |
| `OFFREZ_cookie_consent` | `{accepted:bool, date, expiry}` | `legal.js` → `api.js` |

---

## Endpoints API

| Route | Méthode | Rôle | Rate Limit |
|---|---|---|---|
| `/api/analyze` | POST | Proxy vers Gemini (prompt → suggestions JSON) | 20/min |
| `/api/search` | GET | Proxy vers Amazon RapidAPI (terme → produits) | 40/min |
| `/api/subscribe` | POST | Inscription email (RGPD) | — |
| `/api/track-click` | POST | Tracking clic Amazon | — |
| `/api/track-profiles` | POST | Tracking profils créés | — |
| `/api/health` | GET | Healthcheck (uptime, mémoire, cache) | — |

---

## ⚠️ Règles critiques à respecter

### 1. Architecture CSS = 12 fichiers partiels

Le CSS est organisé en 12 fichiers dans `css/partials/`. Le fichier servi en production est `style.min.css`, généré par `python minify_css.py`. **Ne jamais modifier `style.css` directement** — il est conservé comme backup.

Les partiels sont en **UTF-8**. L'ancien `style.css` était en ISO-8859-1 mais ce n'est plus pertinent.

⚠️ Après toute modification CSS :
1. `python minify_css.py` (génère `style.min.css`)
2. Bumper le `?v=` dans tous les fichiers HTML
3. `scp style.min.css` + `scp *.html` vers le serveur
4. `pm2 restart offrly` (le serveur cache les HTML)

### 2. Fichiers sensibles bloqués côté serveur

Un middleware dans `server.js` bloque l'accès HTTP aux fichiers `.json`, `.csv`, `.md`, `.log`, `.env`, et aux fichiers nommés `server.js`, `admin-stats.js`, etc. **Exception** : `manifest.json` est autorisé (nécessaire pour la PWA).

Si tu ajoutes un nouveau fichier JSON/CSV/MD à la racine, il sera **automatiquement bloqué**. Pour exposer un nouveau fichier, il faut l'exclure dans la liste `BLOCKED_FILES` ou dans le filtre d'extension.

### 3. Build CSS uniquement — pas de bundler JS

Il n'y a pas de bundler JS (ni Webpack, ni Vite). Les fichiers JS utilisent des modules ESM natifs (`import/export`) chargés par le navigateur via `<script type="module">`. Le seul build step est `python minify_css.py` qui concatène et minifie les 12 partiels CSS en `style.min.css`.

### 4. NODE_ENV=production en production

Le `.env` du serveur contient `NODE_ENV=production`. Cela contrôle :
- Les logs (désactivés en prod)
- Les messages d'erreur (masqués en prod)
- Le cache navigateur (1 jour en prod)
- Le CORS (restreint à offrez.net en prod)

### 5. Consentement cookies — Pattern unifié

- **Depuis un query param** (GET): `consent === 'true' || consent === true`
- **Depuis un body JSON** (POST): `consent !== true` pour reject
- La source est toujours `localStorage('OFFREZ_cookie_consent').accepted`
- La fonction `getConsentStatus()` dans `api.js` centralise la lecture

### 6. Tag affilié Amazon

Le tag affilié est `offreznet-21`, défini dans `analyse.js` comme constante `AFFILIATE_TAG`. Il est ajouté à chaque URL Amazon et au panier multi-produits.

### 7. Cache Amazon côté serveur

Les résultats Amazon sont cachés 24h en mémoire (Map). Le cache est purgé automatiquement toutes les 30 minutes. Après un `pm2 restart`, le cache est perdu — c'est normal (pas de persistance disque).

---

## Processus de déploiement

Voir le [workflow deploy-to-server.md](deploy-to-server.md) pour les commandes exactes.

**Résumé rapide :**

```
1. ⚠️ SYNC : Tirer le fichier du serveur → local (scp serveur → PC)
2. BACKUP : Créer un .bak du fichier sur le serveur
3. MODIFIER : Faire les modifications localement
4. DEPLOY : scp fichier(s) → pi@192.168.1.100:~/offrly/
5. Si fichier JS/serveur → ssh "pm2 restart offrly"
6. Si CSS/HTML → simple refresh navigateur
7. Vérifier : ssh "curl -s http://localhost:3000/api/health"
```

### Checklist post-déploiement

- [ ] `pm2 status` → process `offrly` est `online`
- [ ] `/api/health` retourne `{"status":"healthy"}`
- [ ] Fichiers sensibles → `404` (tester avec `curl server.js, emails.csv, .env`)
- [ ] Pas d'erreurs dans `pm2 logs offrly --err --lines 10`

---

## Pièges courants à éviter

| Piège | Solution |
|---|---|
| **Déployer local → serveur sans sync** | **TOUJOURS tirer du serveur d'abord** — le serveur a la version de référence |
| Modifier un fichier CSS partial sans relancer `python minify_css.py` | Les changements ne seront pas dans `style.min.css` |
| Oublier de bumper le `?v=` dans les HTML après modif CSS | Le navigateur sert l'ancien CSS depuis le cache |
| Ajouter un `.json` à la racine et l'exposer | Il sera bloqué automatiquement, l'exclure si besoin |
| Oublier `pm2 restart offrly` après modif JS | Les fichiers JS backend ne sont PAS rechargés automatiquement |
| Utiliser le chemin `~/OFFREZ/` (ancien) | Le vrai chemin est `~/offrly/` |
| Utiliser le PM2 name `OFFREZ` (ancien) | Le vrai nom est `offrly` |
| Appeler `saveVisitors()` directement | Le système de debounce sauvegarde toutes les 5s automatiquement |
| Lire `visitors.json` avec `loadVisitors()` | Utiliser `getVisitorsFromMemory()` (cache mémoire) |
| Ajouter `'unsafe-eval'` dans CSP | Interdit — utiliser des modules ESM natifs |
| Supprimer le middleware de blocage de fichiers | Les CSV/JSON sensibles seraient immédiatement exposés |
| Modifier les prompt IA sans tester | Les prompts sont dans `analyse.js` lignes ~180-245, ils sont très calibrés |

---

## Structure des réponses IA (Gemini)

Le prompt dans `analyse.js` demande à Gemini de retourner :

```json
{
  "suggestions": [
    {
      "term": "terme recherche amazon optimisé",
      "reason": "Pourquoi ce cadeau est parfait",
      "prix_estime": "XX€"
    }
  ]
}
```

Le parsing dans `api.js` est robuste (3 fallbacks : JSON direct → regex `{...}` → nettoyage markdown). Si tu modifies le format attendu, il faut mettre à jour **à la fois** le prompt ET le parsing dans `callGemini()`.

---

## Commandes utiles

```powershell
# Vérifier l'état du serveur
ssh pi@192.168.1.100 "pm2 status"

# Voir les logs en temps réel
ssh pi@192.168.1.100 "pm2 logs offrly --lines 30"

# Voir les erreurs uniquement
ssh pi@192.168.1.100 "pm2 logs offrly --err --lines 30"

# Dashboard statistiques local
node admin-stats.js

# Vérifier la sécurité des fichiers exposés
ssh pi@192.168.1.100 "for f in server.js emails.csv clicks.csv visitors.json .env; do echo -n \"$f: \"; curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/$f; echo; done"
```
