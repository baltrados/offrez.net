/**
 * SERVICE WORKER (sw.js)
 * ======================
 * Transforme le site en PWA (Progressive Web App).
 * Permet le fonctionnement hors-ligne (partiel) et améliore les perfs.
 * 
 * Stratégies :
 * 1. Cache-First pour les fichiers statiques (images, CSS, JS local).
 * 2. Network-Only pour les appels API (on veut des données fraîches).
 * 3. Fallback hors-ligne pour les erreurs réseaux.
 */

const CACHE_NAME = 'OFFREZ-v14'; // v14 — constants.js ajouté au cache
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/config.html',
    '/profils.html',
    '/analyse.html',
    '/style.min.css',
    '/js/constants.js',
    '/js/config.js',
    '/js/config-ui.js',
    '/js/sw-register.js',
    '/js/profils.js',
    '/js/analyse.js',
    '/js/api.js',
    '/js/security.js',
    '/js/legal.js',
    '/css/fontawesome/all.min.css',
    '/favicon.svg',
    '/manifest.json'
];

// 1. INSTALLATION
// Téléchargement et mise en cache immédiate des fichiers essentiels (App Shell)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting()) // Force l'activation immédiate
    );
});

// 2. ACTIVATION
// On supprime les anciens caches pour éviter de servir des fichiers obsolètes
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim()) // Prend le contrôle des pages ouvertes
    );
});

// 3. INTERCEPTION RÉSEAU (FETCH)
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // IMPORTANT: Ne pas intercepter les ressources externes (CDN, fonts, images Amazon)
    // Cela évite les conflits CORS/CSP et laisse le navigateur gérer le cache HTTP standard.
    if (url.origin !== self.location.origin) {
        return;
    }

    // A. Appels API Backend -> Toujours réseau (Network Only)
    // On ne cache jamais les résultats de l'IA ou d'Amazon ici (géré côté serveur ou sessionStorage)
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => new Response(JSON.stringify({ error: 'Hors ligne' }), {
                    headers: { 'Content-Type': 'application/json' }
                }))
        );
        return;
    }

    // B. Assets statiques (HTML, CSS, JS) -> Cache First, fallback Network
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                // 1. Si dans le cache, on sert direct (rapide !)
                if (cached) return cached;

                // 2. Sinon, on va chercher sur le réseau
                return fetch(event.request).then(response => {
                    // Et on met en cache pour la prochaine fois
                    if (response.ok && event.request.method === 'GET') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                });
            })
    );
});
