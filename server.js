/**
 * SERVER.JS - Backend Node/Express
 * ================================
 * Ce serveur agit comme un Proxy API sécurisé pour le frontend.
 * 
 * Rôles principaux :
 * 1. Masquer les clés API (Gemini & RapidAPI) qui ne doivent pas être exposées au client.
 * 2. Gérer le Rate Limiting pour éviter les abus et l'explosion du budget.
 * 3. Cacher en mémoire les résultats Amazon (24h) et les suggestions Gemini (12h) pour réduire les coûts API.
 * 4. Servir l'application statique (HTML/CSS/JS).
 */

require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const path = require('path');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { parseTrustProxy, sanitizeApiKey, RATE_LIMITS } = require('./lib/config');
const { safeErrorInfo } = require('./lib/safe-log');
const { parseAnalyticsOrigin } = require('./lib/analytics-config');
const fs = require('fs');
const crypto = require('crypto');

// Clés API : trim() au démarrage ; une clé qui contient encore un espace ou un caractère de contrôle
// est ignorée (avertissement SANS la valeur) : fetch inclurait sinon la clé dans son message d'erreur.
// La valeur nettoyée est réécrite dans process.env : tout le code lit la valeur nettoyée.
for (const name of ['GEMINI_API_KEY', 'RAPIDAPI_KEY']) {
    const key = sanitizeApiKey(process.env[name]);
    if (key.present && !key.valid) {
        console.warn(`[CONFIG] ${name} contient un espace ou un caractère de contrôle : clé ignorée (service concerné désactivé)`);
    }
    process.env[name] = key.value;
}

// Sel aléatoire tiré à chaque démarrage : ne sert qu'aux clés de quota en mémoire (jamais persistées)
const QUOTA_KEY_SALT = crypto.randomBytes(32);
function hashIp(ip) {
    if (!ip) return 'unknown';
    return crypto.createHash('sha256').update(QUOTA_KEY_SALT).update(String(ip)).digest('hex').slice(0, 16);
}

// [LOT1] fetch global natif (Node >= 18) via fetchWithTimeout : plus de dépendance node-fetch
const {
    validateAnalyzeInput,
    buildGiftPrompt,
    parseSuggestions,
    normalizeSearchParams,
    normalizeProducts,
    createDailyQuota,
    createPerKeyDailyQuota,
    quotaClientKey,
    parseNonNegativeIntEnv,
    secondsUntilMidnight,
    createTtlCache,
    buildAnalyzeCacheKey,
    fetchJsonWithTimeout
} = require('./lib/analyze');

// Timeouts des appels externes (ms)
const GEMINI_TIMEOUT_MS = 20000;
const RAPIDAPI_TIMEOUT_MS = 10000;

// [LOT1] Modèle Gemini configurable, format strictement contrôlé (il est inséré dans l'URL)
// gemini-2.0-flash et gemini-2.5-flash-lite ne sont plus disponibles pour les nouvelles clés (404, nov. 2026).
// gemini-3.5-flash-lite : testé le 24/11/2026 avec la requête réelle (systemInstruction + responseSchema),
// 0 jeton de réflexion, réponse complète en ~1,6 s. Surchargeable via GEMINI_MODEL dans .env.
const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_MODEL = (() => {
    const raw = (process.env.GEMINI_MODEL || '').trim();
    if (!raw) return DEFAULT_GEMINI_MODEL;
    if (!/^[a-z0-9.\-]{1,60}$/.test(raw)) {
        console.warn('[GEMINI] GEMINI_MODEL invalide, modèle par défaut utilisé');
        return DEFAULT_GEMINI_MODEL;
    }
    return raw;
})();

// Plafonds journaliers : valeurs par défaut prudentes (un oubli de configuration reste sans danger).
// 0 = interrupteur « aucun appel autorisé » ; texte, négatif ou décimal → valeur par défaut + avertissement.
function quotaLimitFromEnv(name, defaultValue) {
    const value = parseNonNegativeIntEnv(process.env[name], defaultValue,
        () => console.warn(`[QUOTA] ${name} invalide, valeur par défaut utilisée (${defaultValue})`));
    if (value === 0) console.warn(`[QUOTA] ${name}=0 : aucun appel autorisé`);
    return value;
}

// [LOT1] Quotas journaliers globaux (plafond de coût des API payantes), en mémoire
const GEMINI_DAILY_LIMIT = quotaLimitFromEnv('GEMINI_DAILY_LIMIT', 100);
const RAPIDAPI_DAILY_LIMIT = quotaLimitFromEnv('RAPIDAPI_DAILY_LIMIT', 150);
const geminiQuota = createDailyQuota(GEMINI_DAILY_LIMIT);
const rapidApiQuota = createDailyQuota(RAPIDAPI_DAILY_LIMIT);
const quotaWarnedDay = new Map(); // nom du quota -> date du dernier warning (1 log / jour)

// [LOT1] Quotas journaliers par IP (hashée) : un seul client ne peut pas épuiser le quota global
const GEMINI_DAILY_LIMIT_PER_IP = quotaLimitFromEnv('GEMINI_DAILY_LIMIT_PER_IP', 35);
const RAPIDAPI_DAILY_LIMIT_PER_IP = quotaLimitFromEnv('RAPIDAPI_DAILY_LIMIT_PER_IP', 70);
const geminiIpQuota = createPerKeyDailyQuota(GEMINI_DAILY_LIMIT_PER_IP);
const rapidApiIpQuota = createPerKeyDailyQuota(RAPIDAPI_DAILY_LIMIT_PER_IP);

// Clé de quota du client : req.ip (dérivée de X-Forwarded-For selon TRUST_PROXY, entrée ajoutée par le proxy
// Render), regroupée en /56 pour l'IPv6, puis hachée avec un sel tiré au démarrage.
function clientQuotaKey(req) {
    return hashIp(quotaClientKey(req.ip || req.socket?.remoteAddress));
}

// Retry-After : secondes jusqu'au prochain minuit (heure locale du process ; TZ=Europe/Paris sur Render)
function sendIpQuotaExceeded(res) {
    res.set('Retry-After', String(secondsUntilMidnight()));
    return res.status(429).json({ error: 'Limite quotidienne de recherches atteinte. Réessayez demain.' });
}

function warnQuotaExceeded(name, quota, limit) {
    const day = quota.day();
    if (quotaWarnedDay.get(name) !== day) {
        quotaWarnedDay.set(name, day);
        console.warn(`[QUOTA] Quota journalier ${name} atteint (${limit}/jour) : appels refusés jusqu'à demain`);
    }
}

function sendQuotaExceeded(res) {
    res.set('Retry-After', String(secondsUntilMidnight()));
    return res.status(503).json({ error: 'Service temporairement indisponible, réessayez plus tard.' });
}

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// [LOT0 C2/C3] Seul le dossier public/ est servi (le code, les CSV et la config restent hors web)
const PUBLIC_DIR = path.resolve(__dirname, 'public');
const NOT_FOUND_PAGE = path.join(PUBLIC_DIR, '404.html');

// FIX #9 : Avertissement si NODE_ENV pas défini
if (!process.env.NODE_ENV) {
    console.warn('⚠️  NODE_ENV non défini ! Ajoutez NODE_ENV=production dans .env pour la production.');
}

// ======================
// LOGGER (Mode dev)
// ======================
function log(message, ...args) {
    if (!IS_PRODUCTION) {
        console.log(message, ...args);
    }
}

// ============================================
// CACHES SERVEUR EN MÉMOIRE (Amazon + Gemini)
// ============================================
// Économisent des crédits API : TTL + éviction LRU, taille bornée, perdus à chaque redémarrage.
const searchCache = createTtlCache({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 1000 }); // produits : changent peu
// Suggestions Gemini : la clé ne contient ni prénom ni IP (voir buildAnalyzeCacheKey)
const analyzeCache = createTtlCache({ ttlMs: 12 * 60 * 60 * 1000, maxEntries: 500 });

// X-Cache (HIT/MISS) : hors production uniquement (en production il révélerait si un profil identique a déjà été soumis)
function setCacheHeader(res, value) {
    if (!IS_PRODUCTION) res.set('X-Cache', value);
}

function getCacheKey(term, minPrice, maxPrice) {
    // Clé unique basée sur les paramètres de recherche
    return `${term.toLowerCase().trim()}|${minPrice}|${maxPrice}`;
}

// FIX #1 : Purge périodique des entrées expirées (toutes les 30 minutes)
setInterval(() => {
    const purged = searchCache.purgeExpired() + analyzeCache.purgeExpired();
    if (purged > 0) log(`[CACHE PURGE] ${purged} entrées expirées supprimées`);
}, 30 * 60 * 1000).unref(); // [LOT2] ne maintient pas le process en vie (tests) ; le serveur HTTP le fait en prod

// ======================
// CONFIGURATION EXPRESS
// ======================
// Nombre de proxys de confiance (TRUST_PROXY, entier >= 0, défaut 1 : Render). Jamais 'true' (IP falsifiable).
const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy.warning) console.warn('[CONFIG] ' + trustProxy.warning);
app.set('trust proxy', trustProxy.value);

// Redirection SEO WWW -> NON-WWW. La destination est TOUJOURS le domaine fixe : jamais une valeur tirée
// de la requête (avec trust proxy, req.hostname lirait X-Forwarded-Host, falsifiable). On ne compare que
// l'en-tête Host réel, sans port, en minuscules.
const CANONICAL_ORIGIN = 'https://offrez.net';
app.use((req, res, next) => {
    if (IS_PRODUCTION) {
        const host = String(req.get('host') || '').toLowerCase().replace(/:\d+$/, '');
        if (host === 'www.offrez.net') {
            return res.redirect(301, CANONICAL_ORIGIN + req.originalUrl); // 301 : vital pour le SEO
        }
    }
    next();
});

// Requêtes déclenchées depuis un site tiers (ex. <img src="https://offrez.net/api/search?...">) : un navigateur
// envoie Sec-Fetch-Site ; seules les valeurs 'same-origin' et 'none' (saisie directe) sont acceptées.
// En-tête absent (anciens navigateurs, curl, tests) : accepté. Placé AVANT limiteurs, cache et appels externes.
function rejectCrossSite(req, res, next) {
    const site = req.get('sec-fetch-site');
    if (site !== undefined && site !== 'same-origin' && site !== 'none') {
        return res.status(403).json({ error: 'Requête non autorisée' });
    }
    next();
}
app.use(['/api/search', '/api/analyze'], rejectCrossSite);

// ----------------------
// Rate Limiting (Sécurité)
// ----------------------

// 1. Limite globale pour les recherches produits (Amazon)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    limit: RATE_LIMITS.searchPerMinute, // requêtes/min par IP
    message: { error: 'Oups ! Trop de recherches. Veuillez patienter une minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// 2. Limite stricte pour l'IA (Coûteuse en ressources)
const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    limit: RATE_LIMITS.analyzePerMinute, // générations/min par IP
    message: { error: 'Limite d\'analyses atteinte, patientez une minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ----------------------
// Helpers erreurs (ne jamais exposer de détails internes / upstream au client)
// ----------------------

// Code machine court et non sensible (enum Gemini ex: SAFETY, MAX_TOKENS)
function safeReasonCode(value) {
    return typeof value === 'string' && /^[A-Z_]{1,40}$/.test(value) ? value : 'UNKNOWN';
}

// Mapping générique des échecs d'API externes : 429 -> 429, le reste -> 502
function sendUpstreamError(res, upstreamStatus) {
    if (upstreamStatus === 429) {
        return res.status(429).json({ error: 'Service saturé, réessayez dans quelques instants.' });
    }
    return res.status(502).json({ error: 'Service momentanément indisponible. Réessayez plus tard.' });
}

// ----------------------
// Middleware Globaux
// ----------------------

// Compression GZIP (accélère le chargement de ~70%)
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// Mesure d'audience sans cookies (optionnelle) : origine ajoutée à script-src et connect-src si ANALYTICS_ORIGIN est valide
const analyticsOrigin = parseAnalyticsOrigin(process.env.ANALYTICS_ORIGIN);
if (analyticsOrigin.warning) console.warn('[CONFIG] ' + analyticsOrigin.warning);
const analyticsSources = analyticsOrigin.value ? [analyticsOrigin.value] : [];

// Sécurité Headers (Helmet) + CSP + Headers 2026
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", ...analyticsSources], // FIX CSP : unsafe-inline supprimé (scripts externalisés)
            styleSrc: ["'self'", "'unsafe-inline'"], // [LOT4c] polices et Font Awesome auto-hébergés
            fontSrc: ["'self'", "data:"],
            imgSrc: ["'self'", "data:", "https:", "http:"], // Images produits Amazon externes
            connectSrc: ["'self'", ...analyticsSources],
            frameAncestors: ["'none'"], // Clickjacking protection
            upgradeInsecureRequests: null
        }
    },
    // Headers de sécurité additionnels
    xContentTypeOptions: true, // X-Content-Type-Options: nosniff
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    frameguard: { action: 'deny' }, // X-Frame-Options: DENY
    hsts: {
        maxAge: 31536000, // 1 an
        includeSubDomains: true,
        preload: true
    }
}));

// Permissions-Policy (anciennement Feature-Policy)
app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    next();
});

app.use(express.json({ limit: '50kb' })); // Protection contre payloads géants

function sendNotFound(res) {
    return res.status(404).sendFile(NOT_FOUND_PAGE);
}

// FIX #17 / [LOT0 C2/C3] Défense en profondeur AVANT express.static.
// public/ ne contient que des assets publics ; ce filtre bloque en plus, sur le chemin DÉCODÉ :
// encodage invalide, octets NUL, segments '..', dotfiles et extensions sensibles.
const BLOCKED_EXTENSIONS = new Set(['.csv', '.md', '.log', '.env', '.py', '.sh', '.yml', '.yaml', '.json']);
const ALLOWED_JSON_FILES = new Set(['manifest.json']);
app.use((req, res, next) => {
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(req.path);
    } catch {
        return sendNotFound(res); // Encodage malformé
    }
    if (decodedPath.includes('\0')) return sendNotFound(res);

    const segments = decodedPath.split(/[\\/]+/).filter(Boolean);
    // '..' (traversal), '.' et tout segment commençant par '.' (dotfiles / dossiers cachés)
    if (segments.some(seg => seg.startsWith('.'))) return sendNotFound(res);

    // Nom de fichier normalisé (les points/espaces finaux sont ignorés par certains FS)
    const fileName = (segments[segments.length - 1] || '').toLowerCase().replace(/[. ]+$/, '');
    const ext = path.extname(fileName);
    if (BLOCKED_EXTENSIONS.has(ext) && !ALLOWED_JSON_FILES.has(fileName)) {
        return sendNotFound(res);
    }
    // [TASK-004] Bloquer les fichiers test et backup par pattern
    if (fileName.includes('_test.') || fileName.includes('_backup') || fileName.includes('.pre_split')) {
        return sendNotFound(res);
    }
    next();
});

// Serveur de fichiers statiques (Frontend) — uniquement public/
app.use(express.static(PUBLIC_DIR, {
    maxAge: IS_PRODUCTION ? '1d' : 0, // Cache navigateur pour assets
    etag: true,
    lastModified: true,
    dotfiles: 'deny', // Bloque les fichiers .env, .git, etc.
    redirect: false, // Pas de /blog -> /blog/ : la route fallback redirige directement vers /blog.html
    setHeaders: (res, filePath) => {
        // [LOT3b] Politique de cache HTTP (cohérente avec le service worker public/sw.js) :
        // - HTML, sw.js, manifest.json : toujours revalidés (no-cache + ETag) pour propager les mises à jour
        // - CSS/JS demandés avec ?v= : immuables 1 an (l'URL change à chaque version) ; sans ?v= : no-cache
        // - Polices : 1 an ; images : 7 jours
        const name = path.basename(filePath).toLowerCase();
        const ext = path.extname(name);
        const query = res.req && res.req.query;
        // ?v= doit être une chaîne courte et simple (pas de tableau ?v[]=x ni de valeur arbitraire)
        const versioned = Boolean(query && typeof query.v === 'string' && /^[0-9A-Za-z._-]{1,32}$/.test(query.v));
        if (ext === '.html' || name === 'sw.js' || name === 'manifest.json') {
            res.setHeader('Cache-Control', 'no-cache');
        } else if (ext === '.css' || ext === '.js') {
            res.setHeader('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'no-cache');
        } else if (ext === '.woff2' || ext === '.woff' || ext === '.ttf') {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) {
            res.setHeader('Cache-Control', 'public, max-age=604800');
        }
    }
}));

// ============================================
// ENDPOINT IA : /api/analyze (Google Gemini)
// ============================================
// [LOT1] Le prompt est construit côté serveur à partir d'un profil validé :
// le client n'envoie plus jamais de prompt libre (fin du proxy Gemini ouvert).
const GEMINI_RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        suggestions: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    term: { type: 'STRING' },
                    reason: { type: 'STRING' },
                    prix_estime: { type: 'STRING' }
                },
                required: ['term', 'reason']
            }
        }
    },
    required: ['suggestions']
};

app.post('/api/analyze', strictLimiter, async (req, res) => {
    try {
        const body = req.body;

        // Ancien frontend en cache (envoyait un prompt libre) : refus explicite, rien n'est relayé
        if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'prompt')) {
            return res.status(400).json({ error: 'OFFREZ a été mis à jour. Rechargez la page pour continuer.' });
        }

        const validation = validateAnalyzeInput(body);
        if (!validation.ok) {
            return res.status(400).json({ error: validation.error });
        }

        // Cache (12 h) : un résultat déjà validé est renvoyé tout de suite, sans consommer aucun quota
        const cacheKey = buildAnalyzeCacheKey(validation.value, { model: GEMINI_MODEL, year: new Date().getFullYear() });
        const cached = analyzeCache.get(cacheKey);
        if (cached) {
            log('[CACHE HIT] analyze');
            setCacheHeader(res, 'HIT');
            return res.json(cached);
        }
        setCacheHeader(res, 'MISS');

        if (!process.env.GEMINI_API_KEY) {
            console.error('[GEMINI] Configuration manquante : GEMINI_API_KEY');
            return res.status(500).json({ error: 'Service d\'analyse temporairement indisponible.' });
        }

        // Quota consommé uniquement juste avant un appel upstream réel : IP vérifiée d'abord (429),
        // puis global (503) ; l'IP n'est débitée que si le global a accepté (un 503 ne lui coûte rien).
        // Un appel lancé reste décompté même s'il échoue ensuite (Google peut le facturer).
        const geminiIpKey = clientQuotaKey(req);
        if (!geminiIpQuota.canConsume(geminiIpKey)) {
            return sendIpQuotaExceeded(res);
        }
        if (!geminiQuota.tryConsume()) {
            warnQuotaExceeded('GEMINI', geminiQuota, GEMINI_DAILY_LIMIT);
            return sendQuotaExceeded(res);
        }
        geminiIpQuota.tryConsume(geminiIpKey);

        const { systemInstruction, userText } = buildGiftPrompt(validation.value);
        log('[GEMINI] Génération (' + validation.value.tags.length + ' centre(s) d\'intérêt, contexte: ' + validation.value.contexte + ')');

        // [LOT0 C1] Clé envoyée en header (jamais dans l'URL, donc jamais dans les logs/erreurs réseau)
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

        const { ok, status, data } = await fetchJsonWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': process.env.GEMINI_API_KEY
            },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemInstruction }] },
                contents: [{ role: 'user', parts: [{ text: userText }] }],
                generationConfig: {
                    temperature: 0.7, // Créativité modérée
                    maxOutputTokens: 1024,
                    responseMimeType: 'application/json',
                    responseSchema: GEMINI_RESPONSE_SCHEMA
                }
            })
        }, GEMINI_TIMEOUT_MS);

        // Gestion erreurs API Google (corps upstream jamais renvoyé au client)
        if (!ok) {
            console.error('[GEMINI] Erreur API: HTTP', status, safeReasonCode(data?.error?.status));
            return sendUpstreamError(res, status);
        }
        if (!data || typeof data !== 'object') {
            console.error('[GEMINI] Réponse non JSON');
            return sendUpstreamError(res, 502);
        }

        // Vérification Safety Filters (Contenu bloqué)
        if (data.promptFeedback?.blockReason) {
            const reason = safeReasonCode(data.promptFeedback.blockReason);
            console.warn('[GEMINI] Contenu bloqué:', reason);
            return res.status(400).json({
                error: 'Votre demande a été refusée par le filtre de contenu. Modifiez la description et réessayez.',
                reason
            });
        }

        const parts = data.candidates?.[0]?.content?.parts;
        const text = Array.isArray(parts)
            ? parts.map(p => (p && typeof p.text === 'string' ? p.text : '')).join('')
            : '';
        if (!text) {
            const finishReason = data.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== 'STOP') {
                const reason = safeReasonCode(finishReason);
                console.warn('[GEMINI] Génération interrompue:', reason);
                return res.status(400).json({
                    error: 'La génération a été interrompue. Réessayez.',
                    reason
                });
            }
            console.error('[GEMINI] Réponse vide');
            return res.status(502).json({ error: 'Réponse vide du service d\'analyse. Réessayez.' });
        }

        // Réponse IA non fiable : parsing + validation stricte, seul { suggestions } est renvoyé
        const suggestions = parseSuggestions(text);
        if (suggestions.length === 0) {
            console.error('[GEMINI] Réponse inexploitable (' + text.length + ' caractères)');
            return sendUpstreamError(res, 502);
        }

        log('[GEMINI] ' + suggestions.length + ' suggestion(s) valide(s)');
        const result = { suggestions };
        // Mise en cache uniquement d'une génération complète (finishReason STOP) déjà validée/assainie
        if (data.candidates?.[0]?.finishReason === 'STOP') analyzeCache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        if (error && error.name === 'AbortError') {
            console.error('[GEMINI] Timeout upstream');
            return res.status(504).json({ error: 'Le service d\'analyse met trop de temps à répondre. Réessayez.' });
        }
        console.error('[GEMINI] Erreur serveur:', safeErrorInfo(error));
        res.status(502).json({ error: 'Service d\'analyse momentanément indisponible. Réessayez plus tard.' });
    }
});

// ============================================
// ENDPOINT AMAZON : /api/search (RapidAPI)
// ============================================
app.get('/api/search', apiLimiter, async (req, res) => {
    try {
        // [LOT1] Validation stricte : terme borné, prix entiers uniquement (aucune injection
        // de paramètres possible dans l'URL RapidAPI), garde-fous min 4€ / max 5000€ / max >= min.
        const params = normalizeSearchParams(req.query);
        if (!params.ok) {
            return res.status(400).json({ error: params.error });
        }
        const { term, minPrice, maxPrice } = params.value;

        if (!process.env.RAPIDAPI_KEY) {
            console.error('[RAPIDAPI AMAZON] Configuration manquante : RAPIDAPI_KEY');
            return res.status(500).json({ error: 'Service de recherche temporairement indisponible.' });
        }

        // 1. VÉRIFICATION CACHE (Hit or Miss) — clé construite sur les valeurs normalisées
        const cacheKey = getCacheKey(term, minPrice ?? '', maxPrice ?? '');
        const cached = searchCache.get(cacheKey);
        if (cached) {
            log('[CACHE HIT] search'); // pas de terme saisi dans les logs
            setCacheHeader(res, 'HIT');
            return res.json(cached);
        }
        setCacheHeader(res, 'MISS');

        // Quota consommé uniquement juste avant un appel upstream réel (pas sur cache hit) :
        // IP vérifiée d'abord, global ensuite, IP débitée seulement si le global a accepté
        const rapidIpKey = clientQuotaKey(req);
        if (!rapidApiIpQuota.canConsume(rapidIpKey)) {
            return sendIpQuotaExceeded(res);
        }
        if (!rapidApiQuota.tryConsume()) {
            warnQuotaExceeded('RAPIDAPI', rapidApiQuota, RAPIDAPI_DAILY_LIMIT);
            return sendQuotaExceeded(res);
        }
        rapidApiIpQuota.tryConsume(rapidIpKey);

        // 2. APPEL API EXTERNE (RapidAPI Real-Time Amazon Data)
        // Paramètres optimisés : France, Pertinence, Prime ignoré pour plus de choix
        const qs = new URLSearchParams({
            query: term,
            page: '1',
            country: 'FR',
            sort_by: 'RELEVANCE',
            product_condition: 'ALL',
            is_prime: 'false',
            deals_and_discounts: 'NONE'
        });
        if (minPrice !== undefined) qs.set('min_price', String(minPrice));
        if (maxPrice !== undefined) qs.set('max_price', String(maxPrice));
        const url = `https://real-time-amazon-data.p.rapidapi.com/search?${qs.toString()}`;

        log(`[RAPIDAPI AMAZON] Requête (${term.length} car., ${minPrice ?? '-'}€-${maxPrice ?? '-'}€)`);

        const { ok, status, data } = await fetchJsonWithTimeout(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
            }
        }, RAPIDAPI_TIMEOUT_MS);

        if (!ok) {
            console.error('[RAPIDAPI AMAZON] Erreur API: HTTP', status);
            return sendUpstreamError(res, status);
        }
        if (!data || typeof data !== 'object') {
            console.error('[RAPIDAPI AMAZON] Réponse non JSON');
            return sendUpstreamError(res, 502);
        }

        // 3. NORMALISATION DONNÉES (réponse externe non fiable : liens/images filtrés, types stricts)
        const adaptedData = {
            search_results: normalizeProducts(data.data?.products)
        };

        // 4. SAUVEGARDE CACHE
        // Un résultat vide n'est pas mis en cache 24h (permet un nouvel essai)
        if (adaptedData.search_results.length > 0) searchCache.set(cacheKey, adaptedData);
        log(`[CACHE SET] ${adaptedData.search_results.length} résultats`);

        res.json(adaptedData);
    } catch (error) {
        if (error && error.name === 'AbortError') {
            console.error('[RAPIDAPI AMAZON] Timeout upstream');
            return res.status(504).json({ error: 'Le service de recherche met trop de temps à répondre. Réessayez.' });
        }
        console.error('[RAPIDAPI AMAZON] Erreur serveur:', safeErrorInfo(error));
        res.status(502).json({ error: 'Service de recherche momentanément indisponible. Réessayez plus tard.' });
    }
});

// ======================
// HEALTHCHECK (Monitoring)
// ======================
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// ======================
// DIAGNOSTIC IP (TEMPORAIRE) : actif seulement si DEBUG_IP=1, à retirer une fois TRUST_PROXY validé
// ======================
// Renvoie à l'appelant SES PROPRES informations réseau (ce que le serveur voit derrière le proxy Render)
// et le décompte de quota de SA clé. Rien n'est écrit dans les logs. Route absente (404) sans DEBUG_IP=1.
const DEBUG_IP_ENABLED = process.env.DEBUG_IP === '1';
if (DEBUG_IP_ENABLED) {
    console.warn('[CONFIG] DEBUG_IP=1 : route de diagnostic /api/debug-ip active (à désactiver après vérification)');
    const headerValue = (req, name) => {
        const v = req.get(name);
        return typeof v === 'string' ? v.slice(0, 512) : null;
    };
    app.get('/api/debug-ip', apiLimiter, (req, res) => {
        const xff = headerValue(req, 'x-forwarded-for');
        const key = clientQuotaKey(req);
        res.set('Cache-Control', 'no-store');
        res.json({
            trustProxy: trustProxy.value,
            xForwardedFor: xff ? xff.split(',').map(s => s.trim()).slice(0, 20) : [],
            reqIp: req.ip || null,
            socketRemoteAddress: req.socket?.remoteAddress || null,
            cfConnectingIp: headerValue(req, 'cf-connecting-ip'),
            trueClientIp: headerValue(req, 'true-client-ip'),
            xRealIp: headerValue(req, 'x-real-ip'),
            quotaKey: key,
            gemini: { usedToday: geminiIpQuota.used(key), limitPerIp: GEMINI_DAILY_LIMIT_PER_IP },
            amazon: { usedToday: rapidApiIpQuota.used(key), limitPerIp: RAPIDAPI_DAILY_LIMIT_PER_IP },
            // Uptime : s'il retombe près de 0 entre deux appels, l'instance a redémarré (compteurs remis à zéro)
            uptimeSeconds: Math.round(process.uptime())
        });
    });
}

// ======================
// ROUTE FALLBACK (404 & Redirections)
// ======================
// [LOT4b] Express 5 (path-to-regexp v8) : '*' n'est plus un joker valide ; '/{*splat}' couvre
// toutes les URL, racine comprise (équivalent exact de l'ancien app.get('*')).
app.get('/{*splat}', async (req, res) => {
    // 1. Redirection SEO pour les dossiers (ex: /blog ou /blog/ -> /blog.html)
    // [LOT0 C2/C3] Recherche limitée à PUBLIC_DIR, résistante au path traversal
    let decodedPath;
    try {
        decodedPath = decodeURIComponent(req.path);
    } catch {
        return sendNotFound(res);
    }
    const cleanPath = decodedPath.replace(/[\\/]+$/, '');
    if (cleanPath && !cleanPath.includes('\0')) {
        const candidate = path.resolve(PUBLIC_DIR, '.' + path.sep + cleanPath + '.html');
        if (candidate.startsWith(PUBLIC_DIR + path.sep)) {
            try {
                const stat = await fs.promises.stat(candidate);
                if (stat.isFile()) {
                    // Un seul '/' en tête : empêche une redirection "//hote" (open redirect)
                    const target = '/' + req.path.replace(/[\\/]+$/, '').replace(/^[\\/]+/, '') + '.html';
                    return res.redirect(301, target);
                }
            } catch { /* inexistant → 404 */ }
        }
    }
    // 2. Vraie erreur 404
    sendNotFound(res);
});

// ======================
// GESTION D'ERREUR GLOBALE
// ======================
// [LOT0 C1] Message générique quel que soit NODE_ENV ; log sans objet brut (ni body ni stack).
// Les erreurs client (ex: JSON malformé → entity.parse.failed, 400 ; payload trop gros, 413) gardent leur statut 4xx.
app.use((err, req, res, next) => {
    const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) {
        console.error('[GLOBAL ERROR]', safeErrorInfo(err));
        return res.status(500).json({ error: 'Erreur serveur interne' });
    }
    log('[CLIENT ERROR]', status, err?.type || '');
    res.status(status).json({ error: 'Requête invalide' });
});

// ======================
// DÉMARRAGE SERVEUR
// ======================
// Démarrage uniquement si lancé directement (`node server.js`) ;
// require('./server.js') (tests d'intégration) obtient l'app sans écouter de port ni handlers process.
if (require.main === module) {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`OFFREZ Server démarré (port ${PORT}, environnement ${process.env.NODE_ENV || 'non défini'})`);
    });

    // Arrêt propre (SIGTERM de Render, SIGINT) : une seule exécution, forcé au bout de 10 s
    let shuttingDown = false;
    function shutdown(signal) {
        if (shuttingDown) return;
        shuttingDown = true;
        console.log(`[SHUTDOWN] ${signal} reçu, arrêt en cours`);
        setTimeout(() => process.exit(0), 10000).unref();
        server.close(() => {
            console.log('[SHUTDOWN] Serveur arrêté proprement');
            process.exit(0);
        });
        server.closeIdleConnections();
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Erreur fatale : journalisation sûre (jamais l'objet brut) puis sortie ; Render redémarre le service
    process.on('uncaughtException', (err) => {
        console.error('[FATAL] uncaughtException:', safeErrorInfo(err));
        process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
        console.error('[FATAL] unhandledRejection:', safeErrorInfo(reason));
        process.exit(1);
    });
}

module.exports = { app, analyzeCache, searchCache, RATE_LIMITS };
