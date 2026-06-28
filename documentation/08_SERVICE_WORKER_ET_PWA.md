# 📱 SERVICE WORKER & PWA — `sw.js` + `manifest.json`
*Document 8/9 — Mode hors-ligne et installation mobile*

---

## 1. QU'EST-CE QU'UNE PWA ?

**PWA** = Progressive Web App. C'est une technologie qui permet à un site web de se comporter comme une **application native** :
- L'utilisateur peut **l'installer** sur son écran d'accueil (téléphone ou PC).
- Elle peut fonctionner **partiellement hors-ligne**.
- Elle se charge plus vite grâce au cache.

OFFREZ utilise un **Service Worker** (`sw.js`) et un **manifest** (`manifest.json`) pour ça.

---

## 2. `sw.js` — LE SERVICE WORKER (90 lignes)

### 2.1 Qu'est-ce qu'un Service Worker ?

C'est un **script qui tourne en arrière-plan** dans le navigateur, séparément de la page web. Il peut :
- **Intercepter** toutes les requêtes réseau (comme un proxy local).
- **Mettre en cache** les fichiers pour les servir instantanément la prochaine fois.
- **Fonctionner** même quand l'utilisateur est hors-ligne.

**Analogie** : C'est comme un concierge d'hôtel qui garde une copie des documents fréquemment demandés. Quand un client demande un document, le concierge vérifie d'abord s'il l'a en stock au lieu de courir le chercher à chaque fois.

### 2.2 La liste des fichiers à cacher (Lignes 13-24)

```javascript
const CACHE_NAME = 'OFFREZ-v9';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/config.html',
    '/profils.html',
    '/analyse.html',
    '/style.css',
    '/js/config.js',
    '/js/profils.js',
    '/favicon.svg',
    '/manifest.json'
];
```

- **`CACHE_NAME`** : Le nom du cache (version 9). Quand vous modifiez le site, **incrémentez ce numéro** (v10, v11...) pour forcer les anciens clients à re-télécharger les fichiers.
- **`STATIC_ASSETS`** : La liste des fichiers pré-cachés au premier chargement (l'"App Shell"). Ce sont les fichiers essentiels pour que le site s'affiche.

**Remarque :** `analyse.js` et `api.js` ne sont PAS dans cette liste car ils nécessitent une connexion internet (appels API). Les cacher serait inutile.

### 2.3 Phase d'installation (Lignes 28-34)

```javascript
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});
```

**Quand se déclenche ?** Au premier chargement du site (ou après un changement de version).

**Que fait-il ?**
1. Ouvre un espace de cache nommé `OFFREZ-v9`.
2. Télécharge TOUS les fichiers de la liste et les stocke dans le cache.
3. `skipWaiting()` : Active immédiatement le nouveau Service Worker (sans attendre que toutes les pages soient fermées).

`event.waitUntil()` dit au navigateur : "Ne considère pas l'installation comme terminée tant que toutes ces opérations ne sont pas finies."

### 2.4 Phase d'activation (Lignes 38-47)

```javascript
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});
```

**Quand se déclenche ?** Après l'installation, quand le nouveau Service Worker prend le relais.

**Que fait-il ?**
1. Liste TOUS les caches existants.
2. Supprime ceux qui ne sont PAS la version actuelle (`OFFREZ-v9`). Si l'ancien cache était `OFFREZ-v8`, il est supprimé.
3. `clients.claim()` : Prend immédiatement le contrôle de toutes les pages ouvertes.

C'est un mécanisme de **nettoyage** : on ne garde que le cache le plus récent.

### 2.5 Interception des requêtes (Lignes 50-89)

```javascript
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Ignorer les ressources externes
    if (url.origin !== self.location.origin) return;
```

Chaque fois que le navigateur fait une requête (HTML, CSS, image, API...), cet écouteur se déclenche.

**Règle 1** : On ignore les requêtes vers des domaines externes (Google Fonts, CDN, images Amazon). On les laisse passer normalement.

```javascript
    // API → Network Only
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => new Response(
                JSON.stringify({ error: 'Hors ligne' }),
                { headers: { 'Content-Type': 'application/json' } }
            ))
        );
        return;
    }
```

**Règle 2** : Les appels API (`/api/search`, `/api/analyze`, etc.) vont **toujours** au réseau. Si le réseau est indisponible, on renvoie une erreur JSON propre "Hors ligne" au lieu de laisser le navigateur afficher une page d'erreur.

```javascript
    // Assets statiques → Cache First, fallback Network
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response.ok && event.request.method === 'GET') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        })
    );
```

**Règle 3** (pour tous les autres fichiers — HTML, CSS, JS, images locales) :
1. Chercher dans le **cache** d'abord.
2. Si trouvé → servir directement (ultra rapide !).
3. Si pas trouvé → aller chercher sur le **réseau**.
4. Si la réponse réseau est OK → la stocker dans le cache pour la prochaine fois.

`response.clone()` est nécessaire car une Response ne peut être lue qu'une fois. On en fait une copie : une pour le cache, une pour le navigateur.

---

## 3. `manifest.json` — L'IDENTITÉ DE L'APPLICATION

```json
{
    "name": "OFFREZ – Cadeaux Parfaits",
    "short_name": "OFFREZ",
    "description": "Trouvez le cadeau parfait en 30 secondes",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#0f172a",
    "theme_color": "#6366f1",
    "icons": [...]
}
```

Ce fichier est lu par le système d'exploitation quand l'utilisateur "installe" le site :

| Champ | Rôle |
|---|---|
| `name` | Nom complet de l'app (affiché à l'installation) |
| `short_name` | Nom court (affiché sous l'icône) |
| `start_url` | Page à ouvrir quand on lance l'app |
| `display: "standalone"` | L'app s'ouvre SANS la barre d'adresse du navigateur (comme une vraie app) |
| `background_color` | Couleur de fond pendant le chargement |
| `theme_color` | Couleur de la barre de statut mobile |
| `icons` | Les icônes de l'app à différentes tailles |

---

## 4. CE QU'ON PEUT MODIFIER FACILEMENT

| Modification | Fichier | Variable |
|---|---|---|
| Forcer la mise à jour du cache | `sw.js` | Incrémenter `CACHE_NAME` (ex: `OFFREZ-v9`) |
| Ajouter un fichier au cache | `sw.js` | Ajouter le chemin dans `STATIC_ASSETS` |
| Changer la couleur de l'app | `manifest.json` | `theme_color` et `background_color` |
| Changer le nom de l'app | `manifest.json` | `name` et `short_name` |

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
