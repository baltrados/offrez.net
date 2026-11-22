/**
 * SERVER.JS - Backend Node/Express
 * ================================
 * Ce serveur agit comme un Proxy API sécurisé pour le frontend.
 * 
 * Rôles principaux :
 * 1. Masquer les clés API (Gemini & RapidAPI) qui ne doivent pas être exposées au client.
 * 2. Gérer le Rate Limiting pour éviter les abus et l'explosion du budget.
 * 3. Cacher les résultats Amazon (24h) pour réduire drastiquement les coûts API.
 * 4. Servir l'application statique (HTML/CSS/JS).
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const crypto = require('crypto');

// FIX RGPD : Hashage des IPs pour pseudo-anonymisation (CNIL-friendly)
// [TASK BUG-012] Salt déplacé vers .env pour rotation sécurisée
const IP_HASH_SALT = process.env.IP_HASH_SALT || 'OFFREZ_2026_SALT';
function hashIp(ip) {
    if (!ip) return 'unknown';
    return crypto.createHash('sha256').update(ip + IP_HASH_SALT).digest('hex').slice(0, 16);
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
    parsePositiveIntEnv,
    fetchWithTimeout,
    fetchJsonWithTimeout
} = require('./lib/analyze');

// Timeouts des appels externes (ms)
const GEMINI_TIMEOUT_MS = 20000;
const RAPIDAPI_TIMEOUT_MS = 10000;
const BREVO_TIMEOUT_MS = 8000;

// [LOT1] Modèle Gemini configurable, format strictement contrôlé (il est inséré dans l'URL)
const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_MODEL = (() => {
    const raw = (process.env.GEMINI_MODEL || '').trim();
    if (!raw) return DEFAULT_GEMINI_MODEL;
    if (!/^[a-z0-9.\-]{1,60}$/.test(raw)) {
        console.warn('[GEMINI] GEMINI_MODEL invalide, modèle par défaut utilisé');
        return DEFAULT_GEMINI_MODEL;
    }
    return raw;
})();

// [LOT1] Quotas journaliers globaux (plafond de coût des API payantes), en mémoire
const GEMINI_DAILY_LIMIT = parsePositiveIntEnv(process.env.GEMINI_DAILY_LIMIT, 1000,
    () => console.warn('[QUOTA] GEMINI_DAILY_LIMIT invalide, valeur par défaut utilisée (1000)'));
const RAPIDAPI_DAILY_LIMIT = parsePositiveIntEnv(process.env.RAPIDAPI_DAILY_LIMIT, 500,
    () => console.warn('[QUOTA] RAPIDAPI_DAILY_LIMIT invalide, valeur par défaut utilisée (500)'));
const geminiQuota = createDailyQuota(GEMINI_DAILY_LIMIT);
const rapidApiQuota = createDailyQuota(RAPIDAPI_DAILY_LIMIT);
const quotaWarnedDay = new Map(); // nom du quota -> date du dernier warning (1 log / jour)

// [LOT1] Quotas journaliers par IP (hashée) : un seul client ne peut pas épuiser le quota global
const GEMINI_DAILY_LIMIT_PER_IP = parsePositiveIntEnv(process.env.GEMINI_DAILY_LIMIT_PER_IP, 60,
    () => console.warn('[QUOTA] GEMINI_DAILY_LIMIT_PER_IP invalide, valeur par défaut utilisée (60)'));
const RAPIDAPI_DAILY_LIMIT_PER_IP = parsePositiveIntEnv(process.env.RAPIDAPI_DAILY_LIMIT_PER_IP, 200,
    () => console.warn('[QUOTA] RAPIDAPI_DAILY_LIMIT_PER_IP invalide, valeur par défaut utilisée (200)'));
const geminiIpQuota = createPerKeyDailyQuota(GEMINI_DAILY_LIMIT_PER_IP);
const rapidApiIpQuota = createPerKeyDailyQuota(RAPIDAPI_DAILY_LIMIT_PER_IP);

function sendIpQuotaExceeded(res) {
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
// SYSTÈME DE CACHE SERVEUR (Amazon API)
// ============================================
// Permet d'économiser des crédits API en stockant les résultats pour une même recherche.
const searchCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 heures (TTL long car les produits changent peu)

function getCacheKey(term, minPrice, maxPrice) {
    // Clé unique basée sur les paramètres de recherche
    return `${term.toLowerCase().trim()}|${minPrice}|${maxPrice}`;
}

function getFromCache(key) {
    const cached = searchCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        log('[CACHE HIT]'); // pas de terme saisi dans les logs
        return cached.data;
    }
    if (cached) searchCache.delete(key); // Nettoyage si expiré
    return null;
}

function setCache(key, data) {
    // Protection mémoire : limite à 500 entrées (FIFO simple)
    if (searchCache.size > 500) {
        const firstKey = searchCache.keys().next().value;
        searchCache.delete(firstKey);
    }
    searchCache.set(key, { data, timestamp: Date.now() });
}

// FIX #1 : Purge périodique des entrées expirées (toutes les 30 minutes)
setInterval(() => {
    const now = Date.now();
    let purged = 0;
    for (const [key, value] of searchCache) {
        if (now - value.timestamp >= CACHE_TTL) {
            searchCache.delete(key);
            purged++;
        }
    }
    if (purged > 0) log(`[CACHE PURGE] ${purged} entrées expirées supprimées`);
}, 30 * 60 * 1000).unref(); // [LOT2] ne maintient pas le process en vie (tests) ; le serveur HTTP le fait en prod

// ============================================
// INTÉGRATION BREVO (Email Marketing)
// ============================================
async function sendToBrevo(email, attributes = {}) {
    if (!process.env.BREVO_API_KEY) {
        console.warn('[BREVO] API Key manquante, email non envoyé');
        return false;
    }
    try {
        // Construction du body avec attributs optionnels
        const body = {
            email: email,
            listIds: [2],
            updateEnabled: true
        };

        // Ajout des attributs de contexte cadeau (si fournis)
        const attrs = {};
        if (attributes.prenomCible) attrs.PRENOM_CIBLE = String(attributes.prenomCible).slice(0, 100);
        if (attributes.cadeauChoisi) attrs.CADEAU_CHOISI = String(attributes.cadeauChoisi).slice(0, 200);
        if (Object.keys(attrs).length > 0) body.attributes = attrs;

        const res = await fetchWithTimeout('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        }, BREVO_TIMEOUT_MS);
        if (!res.ok) {
            // [LOT1] Statut seul : le corps d'erreur Brevo peut contenir l'email ou des détails internes
            console.error('[BREVO] Erreur API: HTTP', res.status);
        }
        // Libère la connexion sans exploiter le corps
        res.body?.cancel?.().catch?.(() => {});
        return res.ok;
    } catch (e) {
        if (e && e.name === 'AbortError') {
            console.error('[BREVO] Timeout upstream');
        } else {
            console.error('[BREVO] Erreur réseau:', safeErrorInfo(e));
        }
        return false;
    }
}

// ======================
// CONFIGURATION EXPRESS
// ======================
app.set('trust proxy', 1); // Indispensable derrière un reverse proxy (ex: Cloudflare/Heroku)

// NOUVEAU MIDDLEWARE SEO : Redirection WWW -> NON-WWW
app.use((req, res, next) => {
    // Si on est en production et que l'hôte commence par 'www.'
    if (IS_PRODUCTION && req.hostname && req.hostname.startsWith('www.')) {
        const nonWwwHost = req.hostname.replace(/^www\./, '');
        // Redirection Permanente (301) vitale pour le SEO
        const newUrl = `https://${nonWwwHost}${req.originalUrl}`;
        return res.redirect(301, newUrl);
    }
    next();
});

// ----------------------
// Rate Limiting (Sécurité)
// ----------------------

// 1. Limite globale pour les recherches produits (Amazon)
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 40, // 40 requêtes/min (suffisant pour ~10 utilisateurs simultanés)
    message: { error: 'Oups ! Trop de recherches. Veuillez patienter une minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// 2. Limite stricte pour l'IA (Coûteuse en ressources)
const strictLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 20, // 20 générations/min
    message: { error: 'Limite d\'analyses atteinte, patientez une minute.' },
});

// [LOT0 H3] Limites dédiées aux endpoints d'écriture / tracking
const subscribeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 5,
    message: { error: 'Trop de tentatives d\'inscription. Réessayez dans 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const trackClickLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    limit: 30,
    message: { error: 'Trop de requêtes. Veuillez patienter une minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const trackProfilesLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    limit: 10,
    message: { error: 'Trop de requêtes. Veuillez patienter une minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ----------------------
// Helpers erreurs (ne jamais exposer de détails internes / upstream au client)
// ----------------------

// Résumé d'erreur sûr pour les logs : nom, code, message court sans URL (pas d'objet brut)
function safeErrorInfo(err) {
    if (!err) return 'Erreur inconnue';
    const parts = [err.name || 'Error'];
    if (err.code) parts.push(String(err.code));
    if (err.type) parts.push(String(err.type));
    const msg = String(err.message || '').replace(/https?:\/\/\S+/gi, '[url]').slice(0, 200);
    if (msg) parts.push(msg);
    return parts.join(' | ');
}

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
// [LOT0 H3] Écriture CSV analytics plafonnée
// ----------------------
// Taille max par fichier CSV : 10 Mo par défaut, surchargeable via la variable
// d'environnement MAX_CSV_BYTES (entier positif en octets ; valeur invalide ignorée).
const DEFAULT_MAX_CSV_BYTES = 10 * 1024 * 1024;
const MAX_CSV_BYTES = (() => {
    const raw = (process.env.MAX_CSV_BYTES || '').trim();
    if (!raw) return DEFAULT_MAX_CSV_BYTES;
    const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isSafeInteger(n) || n <= 0) {
        console.warn('[ANALYTICS] MAX_CSV_BYTES invalide, valeur par défaut utilisée (10 Mo)');
        return DEFAULT_MAX_CSV_BYTES;
    }
    return n;
})();
const csvCapWarned = new Set();

// Neutralise un champ CSV : une ligne = un enregistrement, longueur bornée,
// guillemets échappés et protection contre l'injection de formules.
function csvField(value, maxLen) {
    let s = String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, maxLen);
    s = s.replace(/"/g, '""');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return s;
}

// Ajoute une ligne (asynchrone) ; crée le fichier avec l'en-tête si absent.
// Si le fichier atteint le plafond, l'écriture est ignorée (warning une seule fois par fichier).
async function appendCsvLine(filePath, header, line) {
    let size = 0;
    try {
        size = (await fs.promises.stat(filePath)).size;
    } catch (e) {
        if (e.code !== 'ENOENT') throw e;
        try {
            await fs.promises.writeFile(filePath, header, { flag: 'wx' });
        } catch (e2) {
            if (e2.code !== 'EEXIST') throw e2;
        }
    }
    if (size >= MAX_CSV_BYTES) {
        if (!csvCapWarned.has(filePath)) {
            csvCapWarned.add(filePath);
            console.warn(`[ANALYTICS] ${path.basename(filePath)} a atteint la taille max (${MAX_CSV_BYTES} octets) : écritures ignorées`);
        }
        return false;
    }
    await fs.promises.appendFile(filePath, line);
    return true;
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

// Sécurité Headers (Helmet) + CSP + Headers 2026
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"], // FIX CSP : unsafe-inline supprimé (scripts externalisés)
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "data:"],
            imgSrc: ["'self'", "data:", "https:", "http:"], // Images produits Amazon externes
            connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
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

// FIX #6 : CORS restreint à l'origine de production uniquement
app.use(cors({
    origin: IS_PRODUCTION ? ['https://offrez.net', 'https://www.offrez.net'] : '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
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

        if (!process.env.GEMINI_API_KEY) {
            console.error('[GEMINI] Configuration manquante : GEMINI_API_KEY');
            return res.status(500).json({ error: 'Service d\'analyse temporairement indisponible.' });
        }

        // Quota consommé uniquement juste avant un appel upstream réel (par IP, puis global)
        if (!geminiIpQuota.tryConsume(hashIp(quotaClientKey(req.ip || req.socket?.remoteAddress)))) {
            return sendIpQuotaExceeded(res);
        }
        if (!geminiQuota.tryConsume()) {
            warnQuotaExceeded('GEMINI', geminiQuota, GEMINI_DAILY_LIMIT);
            return sendQuotaExceeded(res);
        }

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
        res.json({ suggestions });
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
        const { consent } = req.query;

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
        const cached = getFromCache(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Quota consommé uniquement juste avant un appel upstream réel (pas sur cache hit), par IP puis global
        if (!rapidApiIpQuota.tryConsume(hashIp(quotaClientKey(req.ip || req.socket?.remoteAddress)))) {
            return sendIpQuotaExceeded(res);
        }
        if (!rapidApiQuota.tryConsume()) {
            warnQuotaExceeded('RAPIDAPI', rapidApiQuota, RAPIDAPI_DAILY_LIMIT);
            return sendQuotaExceeded(res);
        }

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

        // FIX #14 : Normalisation du consentement (string 'true' depuis query params)
        const hasConsent = consent === 'true' || consent === true;

        // TRACKING ANALYTICS (Recherches populaires)
        if (hasConsent) {
            // Fichier hors du dossier public (racine du repo). Écriture async, plafonnée, non bloquante.
            const searchLogPath = path.join(__dirname, 'searches.csv');
            const searchTimestamp = new Date().toISOString();
            // FIX #7 : Échappement CSV renforcé (protection injection formules) + longueurs bornées
            const searchLine = `"${searchTimestamp}","${csvField(term, 200)}","${csvField(minPrice ?? '', 20)}","${csvField(maxPrice ?? '', 20)}"\n`;
            appendCsvLine(searchLogPath, '"timestamp","term","min_price","max_price"\n', searchLine)
                .catch(err => console.error('[ANALYTICS] Erreur écriture searches.csv:', safeErrorInfo(err)));
        }

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
        if (adaptedData.search_results.length > 0) setCache(cacheKey, adaptedData);
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

// ============================================
// ENDPOINT EMAILS : /api/subscribe (Lead Magnet)
// ============================================

app.post('/api/subscribe', subscribeLimiter, async (req, res) => {
    try {
        const { email, consent, prenomCible, cadeauChoisi } = req.body || {};

        // Validation stricte (Regex standard) — chaîne uniquement (pas de tableau coercé), 254 car. max (RFC 5321)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (typeof email !== 'string' || email.length > 254 || !emailRegex.test(email)) {
            return res.status(400).json({ error: 'Format email invalide (ex: nom@domaine.com)' });
        }
        // Vérification consent normalisée (boolean depuis JSON body)
        if (consent !== true) {
            return res.status(400).json({ error: 'Consentement requis (RGPD)' });
        }

        // Envoi vers Brevo avec attributs de contexte cadeau
        const success = await sendToBrevo(email, {
            prenomCible: typeof prenomCible === 'string' ? prenomCible : undefined,
            cadeauChoisi: typeof cadeauChoisi === 'string' ? cadeauChoisi : undefined
        });
        if (success) {
            log(`[BREVO] Nouvel inscrit envoyé vers Brevo`);
            res.json({ success: true, message: 'Email enregistré' });
        } else {
            res.status(502).json({ error: 'Erreur lors de l\'envoi. Réessayez plus tard.' });
        }

    } catch (error) {
        console.error('[SUBSCRIBE] Erreur serveur:', safeErrorInfo(error));
        res.status(500).json({ error: 'Erreur serveur. Réessayez plus tard.' });
    }
});

// ============================================
// ENDPOINT TRACKING CLICS : /api/track-click
// ============================================
app.post('/api/track-click', trackClickLimiter, (req, res) => {
    try {
        const { product, price, asin, consent } = req.body || {};

        // FIX #14 : Vérification consent normalisée (boolean depuis JSON body)
        if (consent !== true) {
            return res.json({ success: false, reason: 'Consent required' });
        }

        // FIX #13 : req.socket au lieu de req.connection
        const ip = hashIp(req.ip || req.socket?.remoteAddress); // RGPD : IP hashée
        const timestamp = new Date().toISOString();

        // FIX #7 : Échappement CSV renforcé (protection injection formules) + longueurs bornées
        // Types stricts : seules les chaînes (et nombres pour le prix) sont acceptées, sinon valeur par défaut
        const asText = (v, allowNumber = false) =>
            typeof v === 'string' ? v : (allowNumber && typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
        const safeProduct = csvField(asText(product) || 'Inconnu', 300);
        const safePrice = csvField((asText(price, true) || '0').replace('€', '').trim(), 20);
        const safeAsin = csvField(asText(asin).replace(/"/g, ''), 20);

        const csvLine = `"${timestamp}","${ip}","${safeProduct}","${safePrice}","${safeAsin}"\n`;

        // Fichier hors du dossier public (racine du repo). Écriture async, plafonnée, non bloquante :
        // la réponse au client reste 200 même si le plafond est atteint ou l'écriture échoue.
        const filePath = path.join(__dirname, 'clicks.csv');
        appendCsvLine(filePath, '"timestamp","ip","product_name","price","asin"\n', csvLine)
            .catch(err => console.error('[ANALYTICS] Erreur écriture clicks.csv:', safeErrorInfo(err)));

        res.json({ success: true });
    } catch (e) {
        console.error('[TRACK-CLICK] Erreur serveur:', safeErrorInfo(e));
        // [LOT0 C1] Jamais de message d'erreur brut côté client, quel que soit NODE_ENV
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================
// ENDPOINT TRACKING PROFILS : /api/track-profiles
// ============================================
app.post('/api/track-profiles', trackProfilesLimiter, (req, res) => {
    try {
        const { profiles, consent } = req.body || {};

        if (consent !== true) {
            return res.json({ success: false, reason: 'no_consent' });
        }

        if (!profiles || !Array.isArray(profiles) || profiles.length === 0) {
            return res.status(400).json({ error: 'Aucun profil fourni' });
        }

        // Plus de stockage de profils (RGPD) — l'endpoint reste actif pour la compatibilité frontend
        log(`[PROFILES] ${profiles.length} profil(s) reçu(s) (non stockés)`);
        res.json({ success: true, count: profiles.length });
    } catch (e) {
        console.error('[TRACK-PROFILES] Erreur serveur:', safeErrorInfo(e));
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ======================
// HEALTHCHECK (Monitoring)
// ======================
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        cacheSize: searchCache.size,
        memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
    });
});

// ======================
// ROUTE FALLBACK (404 & Redirections)
// ======================
app.get('*', async (req, res) => {
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
// [LOT2] Démarrage uniquement si lancé directement (`node server.js`) ;
// require('./server.js') (tests d'intégration) obtient l'app sans écouter de port ni handlers process.
// pm_id : défini par PM2 (prod), dont certaines versions/modes chargent le script via leur propre
// conteneur (require.main !== module) ; garantit que le serveur démarre toujours sous PM2.
if (require.main === module || process.env.pm_id !== undefined) {
    const server = app.listen(PORT, () => {
        console.log(`🎁 OFFREZ Server running on http://localhost:${PORT}`);
        console.log(`📦 Cache Amazon (RapidAPI) activé (TTL: 24h)`);
    });

    // Graceful Shutdown (pour déploiements propres)
    process.on('SIGTERM', () => {
        console.log('⚠️ SIGTERM reçu - Arrêt gracieux...');
        server.close(() => {
            console.log('✅ Serveur arrêté proprement');
            process.exit(0);
        });
    });

    process.on('uncaughtException', (err) => {
        console.error('❌ Uncaught Exception:', err);
        // En production, on continue (le serveur reste up)
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    });
}

module.exports = { app };
