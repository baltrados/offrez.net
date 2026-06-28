# 🖥️ LE SERVEUR — `server.js`
*Document 1/9 — Le backend, fondation de tout le projet*

---

## 1. RÔLE DE CE FICHIER

`server.js` est le **programme principal** qui tourne sur votre machine ou serveur. C'est lui qui :
- **Sert le site web** (les pages HTML, CSS, JS) aux visiteurs.
- **Cache les clés secrètes** (API Google et Amazon) pour qu'elles ne soient jamais visibles.
- **Fait le pont** entre le navigateur du visiteur et les services externes (Google Gemini, Amazon).
- **Protège** le site contre les abus (trop de requêtes, attaques).
- **Enregistre** les statistiques (recherches, emails, clics) dans des fichiers CSV.

**Analogie** : Si le site était un restaurant, `server.js` serait le chef cuisinier + le serveur + le vigile. Il reçoit les commandes (requêtes), les prépare (appels API), et sert les plats (réponses) tout en surveillant que personne ne triche.

---

## 2. EXPLICATION LIGNE PAR LIGNE

### 2.1 Les imports (Lignes 1-21) — "Les outils dans la boîte"

```javascript
require('dotenv').config();
```
**Que fait cette ligne ?** Elle charge le fichier `.env` qui contient vos clés secrètes (GEMINI_API_KEY, RAPIDAPI_KEY). C'est comme ouvrir un coffre-fort au démarrage pour avoir les clés à disposition.

```javascript
const express = require('express');
```
**Express** est le "framework web" — un outil tout-en-un pour créer un serveur web. Sans lui, il faudrait écrire des centaines de lignes pour gérer les requêtes HTTP. Avec Express, c'est simple : `app.get('/chemin', (requête, réponse) => { ... })`.

```javascript
const cors = require('cors');
```
**CORS** (Cross-Origin Resource Sharing) autorise d'autres sites à communiquer avec notre serveur. En gros, c'est comme dire "oui, j'accepte les appels venant de l'extérieur".

```javascript
const helmet = require('helmet');
```
**Helmet** ajoute automatiquement des protections de sécurité dans les en-têtes HTTP (les méta-données invisibles qui accompagnent chaque page servie). C'est comme mettre un casque de sécurité sur chaque réponse.

```javascript
const compression = require('compression');
```
**Compression** compresse les fichiers envoyés au navigateur (comme un fichier ZIP). Résultat : le site se charge **~70% plus vite**.

```javascript
const rateLimit = require('express-rate-limit');
```
**Rate Limit** empêche un utilisateur (ou un robot) de faire trop de requêtes en peu de temps. C'est un "compteur de passages" comme au supermarché.

```javascript
const fs = require('fs');
```
**fs** (File System) permet de lire et écrire des fichiers sur le disque dur. Utilisé ici pour sauvegarder les emails et les recherches dans des fichiers CSV.

```javascript
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
```
**fetch** est l'outil pour faire des requêtes HTTP depuis le serveur (appeler Google Gemini ou Amazon). Cette syntaxe bizarre est due au fait que `node-fetch` est un module "ES" et notre serveur utilise le format "CommonJS" — deux façons d'organiser le code JavaScript qui ne sont pas 100% compatibles.

```javascript
const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
```
- `app` : Notre application Express, c'est l'objet central. Tout le reste se branche dessus.
- `PORT` : Le numéro de port sur lequel le serveur écoute. Par défaut 3000. Si le fichier `.env` définit un autre port, il sera utilisé.
- `IS_PRODUCTION` : Un booléen (vrai/faux) qui indique si on est en mode production (site public) ou développement (test local). Cela change le comportement de certaines fonctionnalités (logs, cache...).

---

### 2.2 Le Logger (Lignes 27-34) — "Le carnet de notes"

```javascript
function log(message, ...args) {
    if (!IS_PRODUCTION) {
        console.log(message, ...args);
    }
}
```

**Que fait ce code ?**
- Crée une fonction `log()` qui affiche des messages dans la console (le terminal où tourne le serveur).
- **Mais** elle ne s'affiche **que** si on n'est PAS en production. En production, on ne veut pas afficher de logs inutiles (ça ralentit et risque d'exposer des infos sensibles).

**Pourquoi ?** C'est comme un mode "bavard" pour le développement. Quand vous testez, vous voyez tout ce qui se passe. Quand le site est en ligne, il se tait.

---

### 2.3 Le Système de Cache (Lignes 36-65) — "La mémoire à court terme"

Le cache est **l'un des mécanismes les plus importants du projet** car il économise de l'argent.

```javascript
const searchCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures
```

**`Map()`** est un dictionnaire (comme un carnet d'adresses). On y stocke une **clé** (le terme de recherche) et une **valeur** (les résultats Amazon).

**`CACHE_TTL`** (Time To Live) = durée de vie du cache = 24h en millisecondes (24 × 60 × 60 × 1000 = 86 400 000 ms).

```javascript
function getCacheKey(term, minPrice, maxPrice) {
    return `${term.toLowerCase().trim()}|${minPrice}|${maxPrice}`;
}
```

**Que fait cette fonction ?** Elle crée une clé unique pour chaque recherche. Par exemple :
- Recherche "montre homme" entre 20€ et 50€ → clé : `"montre homme|20|50"`
- Même recherche plus tard → même clé → on retrouve les résultats en cache !

**`.toLowerCase()`** met tout en minuscules (pour que "Montre" et "montre" soient considérés comme identiques).
**`.trim()`** enlève les espaces en début et fin.

```javascript
function getFromCache(key) {
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        log(`[CACHE HIT] ${key}`);
        return cached.data;
    }
    if (cached) searchCache.delete(key);
    return null;
}
```

**Que fait cette fonction ?**
1. Elle cherche la clé dans le dictionnaire.
2. Si elle existe ET qu'elle a moins de 24h → **"CACHE HIT"** (bingo !) = on renvoie les données gratuitement.
3. Si elle existe MAIS qu'elle a plus de 24h → on la supprime (données périmées).
4. Si elle n'existe pas → on renvoie `null` (rien trouvé, il faudra appeler Amazon).

```javascript
function setCache(key, data) {
    if (searchCache.size > 500) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
    searchCache.set(key, { data, timestamp: Date.now() });
}
```

**Que fait cette fonction ?**
1. **Protection mémoire** : Si le cache dépasse 500 entrées, on supprime la plus ancienne (FIFO = First In, First Out = premier arrivé, premier supprimé). Cela évite que le serveur consomme trop de mémoire RAM.
2. On ajoute les nouvelles données avec un horodatage (`timestamp`) pour savoir quand elles ont été stockées.

---

### 2.4 Configuration Express (Lignes 67-154) — "Les règles de la maison"

#### Trust Proxy (Ligne 70)
```javascript
app.set('trust proxy', 1);
```
Dit à Express de faire confiance au premier proxy (intermédiaire réseau) devant lui. C'est **indispensable** si votre serveur est derrière Cloudflare ou un reverse proxy, sinon le rate limiter verrait tout le monde comme le même utilisateur.

#### Rate Limiting (Lignes 72-90)

```javascript
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,  // Fenêtre de 1 minute
    max: 40,                   // Maximum 40 requêtes par minute
    message: { error: 'Oups ! Trop de recherches...' },
});
```

**Analogie** : C'est comme dire "un visiteur ne peut appuyer sur le bouton 'Chercher' que 40 fois par minute". Au-delà, il reçoit un message d'erreur poli.

- **`windowMs`** : La "fenêtre temporelle" en millisecondes. Ici 60 000ms = 1 minute.
- **`max`** : Le nombre maximum de requêtes autorisées dans cette fenêtre.
- **`message`** : Le texte renvoyé quand la limite est atteinte.

```javascript
const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20,
    message: { error: 'Limite d\'analyses atteinte...' },
});
```

Une deuxième limite **plus stricte** (20/min) pour l'IA Gemini, car chaque appel à l'IA coûte plus cher que la recherche Amazon.

#### Compression GZIP (Lignes 97-104)
```javascript
app.use(compression({
    level: 6,        // Niveau de compression (1=rapide mais gros, 9=lent mais petit)
    threshold: 1024, // On ne compresse que les fichiers > 1Ko
}));
```

**`app.use()`** signifie "applique ce traitement à TOUTES les requêtes". Ici, chaque réponse du serveur sera compressée. Le navigateur sait automatiquement la décompresser.

#### Sécurité Helmet (Lignes 107-129)

```javascript
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
            // ...
        }
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));
```

**CSP (Content Security Policy)** = une liste blanche qui dit au navigateur : "Tu as le droit de charger des scripts UNIQUEMENT depuis mon site, des polices UNIQUEMENT depuis Google Fonts, etc." Cela empêche un pirate d'injecter du code malveillant.

**HSTS** = Force l'utilisation de HTTPS (connexion sécurisée) pendant 1 an.

#### Permissions-Policy (Lignes 132-135)
```javascript
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    next();
});
```

Dit au navigateur : "Ce site n'utilisera JAMAIS la géolocalisation, le micro, la caméra ou le paiement." C'est une déclaration de bonne foi pour la vie privée.

#### Serveur de fichiers statiques (Lignes 141-154)
```javascript
app.use(express.static(path.join(__dirname, '.'), {
    maxAge: IS_PRODUCTION ? '1d' : 0,
    etag: true,
}));
```

**`express.static()`** dit à Express de servir tous les fichiers du dossier courant (HTML, CSS, JS, images) directement. Pas besoin de créer une route pour chaque fichier.

- **`maxAge: '1d'`** : En production, le navigateur peut garder les fichiers en cache pendant 1 jour. Il n'a pas besoin de les re-télécharger à chaque visite.
- **`etag: true`** : Un mécanisme qui vérifie si un fichier a changé sans le re-télécharger entièrement.

---

### 2.5 Endpoint IA — `/api/analyze` (Lignes 156-223) — "Le guichet Gemini"

```javascript
app.post('/api/analyze', strictLimiter, async (req, res) => {
```

**Que veut dire cette ligne ?**
- `app.post(...)` : Crée une route qui répond aux requêtes **POST** (envoi de données).
- `'/api/analyze'` : L'adresse de cette route. Quand le navigateur envoie une requête à `/api/analyze`, ce code s'exécute.
- `strictLimiter` : Applique la limite de 20 requêtes/minute.
- `async` : Permet d'utiliser `await` (attendre la réponse d'un service externe sans bloquer le serveur).
- `(req, res)` : `req` = la requête (ce que le client envoie), `res` = la réponse (ce que le serveur renvoie).

```javascript
const { prompt } = req.body;
if (!prompt) return res.status(400).json({ error: 'Prompt required' });
```

1. On extrait le champ `prompt` du corps de la requête (le texte envoyé par le frontend).
2. Si aucun prompt n'est fourni → erreur 400 (Bad Request = "ta demande est mal formulée").

```javascript
if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Server misconfiguration: Gemini API Key missing' });
}
```

Vérification que la clé API Gemini est bien configurée dans le fichier `.env`. Si non → erreur 500 (problème serveur).

```javascript
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
```

Construction de l'URL d'appel à l'API Google Gemini. Le modèle utilisé est **Gemini 2.0 Flash** (rapide et économique). La clé API est ajoutée en paramètre.

```javascript
const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024
        }
    })
});
```

**L'appel à Gemini :**
- On envoie le prompt (le texte de la question) au format que Google attend.
- **`temperature: 0.7`** : Contrôle la "créativité" de l'IA. 0 = très prévisible, 1 = très créatif/aléatoire. 0.7 est un bon équilibre.
- **`maxOutputTokens: 1024`** : Limite la longueur de la réponse à ~750 mots. Économise des crédits.

```javascript
const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
```

**Chaîne de navigation sécurisée** (les `?.`) : On creuse dans la réponse complexe de Google pour extraire le texte. Si un maillon manque, on obtient `undefined` au lieu d'une erreur qui crasherait le serveur.

La structure de réponse de Gemini est : `data.candidates[0].content.parts[0].text`.

---

### 2.6 Endpoint Amazon — `/api/search` (Lignes 225-309) — "Le guichet Amazon"

```javascript
app.get('/api/search', apiLimiter, async (req, res) => {
```

Route **GET** (demande de données, sans envoyer de corps). Limitée à 40 requêtes/minute.

```javascript
const { term, min_price, max_price } = req.query;
```

Récupère les paramètres de l'URL. Exemple : `/api/search?term=montre&min_price=20&max_price=50` → `term = "montre"`, `min_price = "20"`, `max_price = "50"`.

```javascript
// 1. VÉRIFICATION CACHE
const cacheKey = getCacheKey(term, min_price, max_price);
const cached = getFromCache(cacheKey);
if (cached) {
    return res.json(cached);  // Réponse instantanée et GRATUITE !
}
```

**Première chose** : On regarde si cette recherche est déjà en cache. Si oui, on la renvoie directement **sans appeler Amazon** → économie d'argent.

```javascript
// TRACKING ANALYTICS
const searchLine = `"${searchTimestamp}","${term}","${min_price}","${max_price}"\n`;
fs.appendFile(searchLogPath, searchLine, () => { });
```

**Tracking discret** : Chaque recherche est ajoutée au fichier `searches.csv`. Le `() => { }` signifie "ne rien faire si ça échoue" pour ne pas bloquer la réponse.

```javascript
const url = `https://real-time-amazon-data.p.rapidapi.com/search?query=${cleanTerm}&page=1&country=FR&sort_by=RELEVANCE...`;
```

Construction de l'URL pour l'API RapidAPI. Paramètres importants :
- `country=FR` : Résultats Amazon.**fr** (pas amazon.com)
- `sort_by=RELEVANCE` : Triés par pertinence
- `product_condition=ALL` : Neuf + Occasion
- `is_prime=false` : On ne filtre pas sur Prime pour avoir plus de choix

```javascript
const response = await fetch(url, {
    headers: {
        'x-rapidapi-key': process.env.RAPIDAPI_KEY,
        'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
    }
});
```

Appel à RapidAPI avec la clé API dans les en-têtes (headers). C'est le format standard exigé par RapidAPI.

```javascript
// 3. NORMALISATION DONNÉES
const adaptedData = {
    search_results: (data.data?.products || []).map(product => ({
        title: product.product_title,
        link: product.product_url,
        image: product.product_photo,
        price: {
            value: parseFloat(product.product_price?.replace(/[^0-9.,]/g, '').replace(',', '.')) || 0,
            raw: product.product_price || 'Prix non disponible',
        },
        rating: product.product_star_rating,
        reviews: product.product_num_ratings,
        asin: product.asin,
    }))
};
```

**Normalisation** : L'API RapidAPI renvoie des données dans un format compliqué (noms longs, structure imbriquée). On les transforme dans un format simple et propre pour notre frontend.

Le prix est nettoyé : `"29,99 €"` → on retire tout sauf les chiffres et la virgule → `"29.99"` → on convertit en nombre `29.99`.

---

### 2.7 Endpoint Emails — `/api/subscribe` (Lignes 311-354) — "La boîte aux lettres"

```javascript
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: 'Format email invalide' });
}
```

**Validation** : On vérifie que l'email a une forme valide (quelquechose@domaine.extension). La regex (expression régulière) est un "patron" de vérification.

```javascript
if (consent !== true) {
    return res.status(400).json({ error: 'Consentement requis (RGPD)' });
}
```

**RGPD** : On refuse de sauvegarder l'email si l'utilisateur n'a pas coché la case de consentement.

```javascript
const csvLine = `"${timestamp}","${email}","${ip}"\n`;
fs.appendFile(filePath, csvLine, (err) => { ... });
```

On ajoute une ligne au fichier `emails.csv` avec la date, l'email et l'adresse IP (preuve de consentement pour la RGPD).

---

### 2.8 Endpoint Tracking — `/api/track-click` (Lignes 356-389) — "Le compteur de clics"

Ce endpoint enregistre chaque clic vers Amazon dans `clicks.csv`. Les données sont nettoyées pour éviter les injections CSV (un type d'attaque où des guillemets pourraient casser le format du fichier).

---

### 2.9 Healthcheck — `/api/health` (Lignes 391-402)

```javascript
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        cacheSize: searchCache.size,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});
```

Un endpoint de diagnostic accessible à `/api/health`. Renvoie :
- Le statut du serveur
- Depuis combien de temps il tourne (`uptime`)
- Combien d'entrées sont en cache
- La mémoire utilisée

Utile pour vérifier que le serveur fonctionne bien.

---

### 2.10 Route Fallback (Lignes 404-414) — "Le filet de sécurité"

```javascript
app.get('*', (req, res) => {
    if (req.path.includes('.') && !req.path.endsWith('.html')) {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});
```

**Que fait ce code ?**
- `'*'` : Attrape TOUTES les requêtes qui n'ont pas été traitées par les routes précédentes.
- Si l'URL contient un point (= c'est un fichier comme `photo.jpg`) mais que le fichier n'existe pas → page 404.
- Sinon (URL sans extension comme `/about`) → on renvoie `index.html`. C'est le comportement "SPA" (Single Page Application).

---

### 2.11 Démarrage du serveur (Lignes 428-451) — "L'ouverture des portes"

```javascript
const server = app.listen(PORT, () => {
    console.log(`🎁 OFFREZ Server running on http://localhost:${PORT}`);
});
```

Lance le serveur sur le port défini. C'est la dernière ligne exécutée au démarrage.

```javascript
process.on('SIGTERM', () => { ... });
```

**Graceful Shutdown** : Quand le système envoie un signal d'arrêt (redémarrage serveur, déploiement), le serveur ferme proprement les connexions en cours au lieu de les couper brutalement.

```javascript
process.on('uncaughtException', (err) => { ... });
process.on('unhandledRejection', (reason) => { ... });
```

**Filets de sécurité** : Si une erreur non gérée survient, le serveur l'affiche mais **continue de tourner** au lieu de crasher.

---

## 3. CE QU'ON PEUT MODIFIER FACILEMENT

| Modification | Où | Ligne |
|---|---|---|
| Changer le port du serveur | `.env` → `PORT=8080` | — |
| Modifier la durée du cache | `CACHE_TTL` | 41 |
| Changer les limites de requêtes | `max: 40` / `max: 20` | 79 / 88 |
| Limite taille du cache | `searchCache.size > 500` | 60 |
| Modèle Gemini | `gemini-2.0-flash` dans l'URL | 171 |
| Créativité de l'IA | `temperature: 0.7` | 179 |
| Longueur réponse IA | `maxOutputTokens: 1024` | 180 |
| Pays Amazon | `country=FR` | 249 |
| Tri Amazon | `sort_by=RELEVANCE` | 249 |

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
