/**
 * SERVICE WORKER (sw.js)
 * ======================
 * PWA OFFREZ : installation, fonctionnement hors ligne (pages déjà visitées + page de secours).
 *
 * Stratégies (même origine uniquement, les ressources externes ne sont jamais interceptées) :
 * 1. /api/*            → réseau uniquement ; hors ligne : JSON 503 avec message en français.
 * 2. Navigations HTML  → network-first (revalidation), copie en cache, repli : page en cache puis /offline.html.
 * 3. Assets versionnés (?v=), polices, images → cache-first (l'URL change à chaque version).
 * 4. Autres GET (modules JS non versionnés, CSS, manifest) → stale-while-revalidate.
 * Jamais mis en cache : non-GET, réponses non-ok, opaques, redirigées ou d'une autre origine.
 */

// À incrémenter à chaque modification de PRECACHE_URLS ou de ce fichier.
const CACHE_NAME = 'OFFREZ-v30';
const RUNTIME_CACHE = 'OFFREZ-v17-runtime';
const RUNTIME_MAX_ENTRIES = 60;
const OFFLINE_URL = '/offline.html';

// App shell. Les assets sont listés EXACTEMENT comme les pages les demandent (avec leur ?v= courant) :
// la clé de cache inclut la query string, donc précacher l'URL versionnée est ce qui sert réellement hors ligne.
// Quand un ?v= change dans le HTML, la nouvelle URL est simplement absente du cache → réseau → mise en cache.
const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/config.html',
    '/profils.html',
    '/analyse.html',
    OFFLINE_URL,
    '/style.min.css?v=202611251700',
    '/fonts/outfit-latin.woff2',
    '/css/fontawesome/fa-offrez.min.css',
    '/css/webfonts/fa-solid-900.woff2?v=650a',
    '/css/webfonts/fa-brands-400.woff2?v=650a',
    '/js/sw-register.js',
    '/js/analytics.js',
    '/js/constants.js',
    '/js/security.js',
    '/js/security.js?v=2026112405',
    '/js/api.js?v=2026112405',
    '/js/config.js',
    '/js/config-ui.js',
    '/js/config-prefill.js',
    '/js/analyse-boot.js',
    '/js/profils.js',
    '/js/analyse.js?v=2026112405',
    '/js/analyse/settings.js?v=2026112405',
    '/js/analyse/products.js?v=2026112405',
    '/js/analyse/cart.js?v=2026112405',
    '/js/analyse/session-data.js?v=2026112405',
    '/js/analyse/ui.js?v=2026112405',
    '/js/analyse/render.js?v=2026112405',
    '/js/analyse/purchase.js?v=2026112405',
    '/js/analyse/results-store.js?v=2026112405',
    '/js/analyse/retention.js?v=2026112405',
    '/favicon.svg',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/manifest.json'
];
const PRECACHE_KEYS = new Set(PRECACHE_URLS);

const OFFLINE_API_BODY = JSON.stringify({
    error: 'Vous êtes hors ligne. Vérifiez votre connexion internet puis réessayez.'
});

// 1. INSTALLATION : précache de l'app shell (cache: 'reload' contourne le cache HTTP du navigateur)
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' }))))
            .then(() => self.skipWaiting())
    );
});

// 2. ACTIVATION : suppression des caches des versions précédentes puis prise de contrôle des pages
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// --- Utilitaires -------------------------------------------------------------

function isCacheable(response) {
    return Boolean(response) && response.ok && response.type === 'basic' && !response.redirected;
}

// Les URL de l'app shell sont rafraîchies dans le cache principal ; le reste va dans le cache runtime borné.
function cacheNameFor(url) {
    return PRECACHE_KEYS.has(url.pathname + url.search) ? CACHE_NAME : RUNTIME_CACHE;
}

async function trimRuntimeCache() {
    const cache = await caches.open(RUNTIME_CACHE);
    const keys = await cache.keys(); // ordre d'insertion : les plus anciennes d'abord
    const excess = keys.length - RUNTIME_MAX_ENTRIES;
    for (let i = 0; i < excess; i++) {
        await cache.delete(keys[i]);
    }
}

async function putInCache(request, response) {
    if (!isCacheable(response)) return;
    const url = new URL(request.url);
    const name = cacheNameFor(url);
    const cache = await caches.open(name);
    await cache.put(request, response);
    if (name === RUNTIME_CACHE) await trimRuntimeCache();
}

function isNavigation(request) {
    return request.mode === 'navigate' || request.destination === 'document';
}

function isCacheFirstAsset(request, url) {
    return url.searchParams.has('v')
        || request.destination === 'font'
        || request.destination === 'image'
        || /\.(woff2?|ttf|png|jpe?g|gif|webp|avif|svg|ico)$/i.test(url.pathname);
}

// --- Stratégies --------------------------------------------------------------

async function handleNavigation(event) {
    const request = event.request;
    // Revalidation systématique auprès du serveur (sémantique cache: 'no-cache').
    // Si un navigateur refuse un RequestInit sur une requête de navigation, on garde la requête brute
    // (le serveur renvoie de toute façon Cache-Control: no-cache sur le HTML).
    let networkRequest = request;
    try {
        networkRequest = new Request(request, { cache: 'no-cache' });
    } catch {
        networkRequest = request;
    }
    try {
        const response = await fetch(networkRequest);
        if (isCacheable(response)) {
            event.waitUntil(putInCache(request, response.clone()).catch(() => { }));
        }
        return response;
    } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const offline = await caches.match(OFFLINE_URL);
        if (offline) return offline;
        return new Response('Vous êtes hors ligne.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

async function cacheFirst(event) {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (isCacheable(response)) {
        event.waitUntil(putInCache(event.request, response.clone()).catch(() => { }));
    }
    return response;
}

// Assets non versionnés (modules JS partagés, CSS sans ?v=, manifest) : réseau d'abord, cache en secours.
// (Pas de stale-while-revalidate : après un déploiement, un module versionné neuf ne doit jamais
// s'exécuter avec un module partagé périmé servi depuis le cache.) Le serveur les envoie en no-cache + ETag,
// la revalidation coûte donc un 304 quand rien n'a changé.
async function networkFirstAsset(event) {
    try {
        const response = await fetch(event.request);
        if (isCacheable(response)) {
            event.waitUntil(putInCache(event.request, response.clone()).catch(() => { }));
        }
        return response;
    } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw err;
    }
}

// 3. INTERCEPTION RÉSEAU
self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // Ressources externes (CDN, polices Google, images Amazon) : jamais interceptées
    if (url.origin !== self.location.origin) return;

    // A. API backend : réseau uniquement (toutes méthodes), jamais de cache
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => new Response(OFFLINE_API_BODY, {
                status: 503,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            }))
        );
        return;
    }

    // Seules les requêtes GET sont gérées (le navigateur traite les autres normalement)
    if (request.method !== 'GET') return;

    if (isNavigation(request)) {
        event.respondWith(handleNavigation(event));
    } else if (isCacheFirstAsset(request, url)) {
        event.respondWith(cacheFirst(event));
    } else {
        event.respondWith(networkFirstAsset(event));
    }
});
