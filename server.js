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

// FIX #16 : Import top-level au lieu de dynamic import à chaque appel
let fetch;
import('node-fetch').then(mod => { fetch = mod.default; });

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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
        log(`[CACHE HIT] ${key}`);
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
}, 30 * 60 * 1000);

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

        const res = await fetch('https://api.brevo.com/v3/contacts', {
            method: 'POST',
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            console.error('[BREVO] Erreur API:', res.status, errData);
        }
        return res.ok;
    } catch (e) {
        console.error('[BREVO] Erreur réseau:', e.message);
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

// FIX #17 : Middleware de blocage des fichiers sensibles AVANT express.static
// [TASK-004] Liste étendue des fichiers bloqués
const BLOCKED_FILES = [
    '.env', '.env.example', 'server.js', 'admin-stats.js', 'package.json', 'package-lock.json',
    'clicks.csv', 'searches.csv',
    'AUDIT_LANCEMENT.md', 'COMMANDES_UTILES.md', 'MANUEL_DE_FONCTIONNEMENT_OFFREZ.md', 'README.md',
    'replace_ia.js'
];
app.use((req, res, next) => {
    const fileName = path.basename(req.path).toLowerCase();
    const ext = path.extname(req.path).toLowerCase();
    // Bloquer les fichiers sensibles et les dotfiles
    if (BLOCKED_FILES.includes(fileName) || fileName.startsWith('.')) {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    // [TASK-004] Bloquer les fichiers test et backup par pattern
    if (fileName.includes('_test.') || fileName.includes('_backup') || fileName.includes('.pre_split')) {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    // [TASK-004] Bloquer les extensions sensibles (ajout .py)
    if (['.json', '.csv', '.md', '.log', '.env', '.py'].includes(ext) && fileName !== 'manifest.json') {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
    }
    next();
});

// Serveur de fichiers statiques (Frontend)
app.use(express.static(path.join(__dirname, '.'), {
    maxAge: IS_PRODUCTION ? '1d' : 0, // Cache navigateur pour assets
    etag: true,
    lastModified: true,
    dotfiles: 'deny', // Bloque les fichiers .env, .git, etc.
    setHeaders: (res, filePath) => {
        // Cache agressif pour CSS/JS/Fonts
        if (filePath.endsWith('.css') || filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
        if (filePath.endsWith('.woff2') || filePath.endsWith('.woff')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

// ============================================
// ENDPOINT IA : /api/analyze (Google Gemini)
// ============================================
app.post('/api/analyze', strictLimiter, async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt required' });

        // FIX #18 : Limiter la taille du prompt (max 8000 caractères ~2000 tokens)
        if (prompt.length > 8000) {
            return res.status(400).json({ error: 'Prompt trop long (max 8000 caractères)' });
        }

        if (!process.env.GEMINI_API_KEY) {
            return res.status(500).json({ error: 'Server misconfiguration: Gemini API Key missing' });
        }

        log('[GEMINI] Envoi du prompt (' + prompt.length + ' caractères)');

        // Appel direct à l'API REST Google Gemini
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

        // Timeout serveur : 20s (le client frontend a 15s, on laisse une marge)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7, // Créativité modérée
                    maxOutputTokens: 1024
                }
            })
        });
        clearTimeout(timeoutId);

        const data = await response.json();

        // Gestion erreurs API Google
        if (!response.ok) {
            console.error('[GEMINI] Erreur API:', data);
            return res.status(response.status).json(data);
        }

        // Vérification Safety Filters (Contenu bloqué)
        if (data.promptFeedback?.blockReason) {
            console.error('[GEMINI] Contenu bloqué:', data.promptFeedback);
            return res.status(400).json({
                error: 'Contenu bloqué par Gemini',
                reason: data.promptFeedback.blockReason,
                details: data.promptFeedback
            });
        }

        // FIX #4 : Vérification intégrité réponse (ne plus envoyer de réponse vide)
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
            const finishReason = data.candidates?.[0]?.finishReason;
            if (finishReason && finishReason !== 'STOP') {
                return res.status(400).json({
                    error: `Génération interrompue: ${finishReason}`,
                    details: data.candidates?.[0]
                });
            }
            // Réponse vide même avec finishReason STOP → erreur au lieu de renvoyer du vide
            return res.status(502).json({
                error: 'Réponse vide de Gemini',
                details: 'L\'IA n\'a généré aucun texte malgré un statut OK.'
            });
        }

        log('[GEMINI] Texte reçu (' + text.length + ' caractères)');
        res.json(data);
    } catch (error) {
        console.error('[GEMINI] Erreur serveur:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ENDPOINT AMAZON : /api/search (RapidAPI)
// ============================================
app.get('/api/search', apiLimiter, async (req, res) => {
    try {
        let { term, min_price, max_price, consent } = req.query;

        // Guardrail: L'API Amazon refuse les prix <= 0. On force un minimum de 4€.
        if (min_price) {
            let pMin = parseInt(min_price, 10);
            if (isNaN(pMin) || pMin < 4) min_price = '4';
        }

        // FIX #12 : Valider que max_price >= min_price
        if (min_price && max_price) {
            const pMin = parseInt(min_price, 10);
            const pMax = parseInt(max_price, 10);
            if (!isNaN(pMin) && !isNaN(pMax) && pMax < pMin) {
                max_price = min_price; // Correction silencieuse
            }
        }

        if (!term) return res.status(400).json({ error: 'Search term required' });

        if (!process.env.RAPIDAPI_KEY) {
            return res.status(500).json({ error: 'Server misconfiguration: RapidAPI Key missing' });
        }

        // 1. VÉRIFICATION CACHE (Hit or Miss)
        const cacheKey = getCacheKey(term, min_price, max_price);
        const cached = getFromCache(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const cleanTerm = encodeURIComponent(term.trim());

        // 2. APPEL API EXTERNE (RapidAPI Real-Time Amazon Data)
        // Paramètres optimisés : France, Pertinence, Prime ignoré pour plus de choix
        const url = `https://real-time-amazon-data.p.rapidapi.com/search?query=${cleanTerm}&page=1&country=FR&sort_by=RELEVANCE&product_condition=ALL&is_prime=false&deals_and_discounts=NONE${min_price ? `&min_price=${min_price}` : ''}${max_price ? `&max_price=${max_price}` : ''}`;

        log(`[RAPIDAPI AMAZON] Requête pour: "${term}" (${min_price}€-${max_price}€)`);

        // FIX #14 : Normalisation du consentement (string 'true' depuis query params)
        const hasConsent = consent === 'true' || consent === true;

        // TRACKING ANALYTICS (Recherches populaires)
        if (hasConsent) {
            try {
                const searchLogPath = path.join(__dirname, 'searches.csv');
                const searchTimestamp = new Date().toISOString();
                // FIX #7 : Échappement CSV renforcé (protection injection formules)
                const safeTerm = term.replace(/"/g, '""').replace(/^[=+\-@]/g, "'$&");
                const searchLine = `"${searchTimestamp}","${safeTerm}","${min_price || ''}","${max_price || ''}"\n`;

                if (!fs.existsSync(searchLogPath)) {
                    fs.writeFileSync(searchLogPath, '"timestamp","term","min_price","max_price"\n');
                }
                // FIX #15 : Logger l'erreur au lieu d'ignorer le callback
                fs.appendFile(searchLogPath, searchLine, (err) => {
                    if (err) console.error('[ANALYTICS] Erreur écriture searches.csv:', err.message);
                });

            } catch (e) { console.error('Analytics error:', e); }
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_KEY,
                'x-rapidapi-host': 'real-time-amazon-data.p.rapidapi.com'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('[RAPIDAPI AMAZON] Error:', data);
            return res.status(response.status).json({ error: data.message || 'API Error' });
        }

        // 3. NORMALISATION DONNÉES
        // On transforme la réponse complexe de RapidAPI en un format plus simple pour notre front
        const adaptedData = {
            search_results: (data.data?.products || []).map(product => ({
                title: product.product_title,
                link: product.product_url,
                image: product.product_photo,
                price: {
                    value: parseFloat(product.product_price?.replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(',', '.')) || 0,
                    raw: product.product_price || 'Prix non disponible',
                    currency: 'EUR'
                },
                rating: product.product_star_rating,
                reviews: product.product_num_ratings,
                asin: product.asin,
                is_prime: product.is_prime,
                is_best_seller: product.is_best_seller
            }))
        };

        // 4. SAUVEGARDE CACHE
        setCache(cacheKey, adaptedData);
        log(`[CACHE SET] ${cacheKey} (${adaptedData.search_results?.length || 0} résultats)`);

        res.json(adaptedData);
    } catch (error) {
        console.error('RapidAPI Amazon Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// ENDPOINT EMAILS : /api/subscribe (Lead Magnet)
// ============================================

app.post('/api/subscribe', async (req, res) => {
    try {
        const { email, consent, prenomCible, cadeauChoisi } = req.body;

        // Validation stricte (Regex standard)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ error: 'Format email invalide (ex: nom@domaine.com)' });
        }
        // Vérification consent normalisée (boolean depuis JSON body)
        if (consent !== true) {
            return res.status(400).json({ error: 'Consentement requis (RGPD)' });
        }

        // Envoi vers Brevo avec attributs de contexte cadeau
        const success = await sendToBrevo(email, { prenomCible, cadeauChoisi });
        if (success) {
            log(`[BREVO] Nouvel inscrit envoyé vers Brevo`);
            res.json({ success: true, message: 'Email enregistré' });
        } else {
            res.status(502).json({ error: 'Erreur lors de l\'envoi. Réessayez plus tard.' });
        }

    } catch (error) {
        console.error('Erreur subscribe:', error);
        res.status(500).json({ error: IS_PRODUCTION ? 'Erreur serveur' : error.message });
    }
});

// ============================================
// ENDPOINT TRACKING CLICS : /api/track-click
// ============================================
app.post('/api/track-click', (req, res) => {
    try {
        const { product, price, asin, consent } = req.body;

        // FIX #14 : Vérification consent normalisée (boolean depuis JSON body)
        if (consent !== true) {
            return res.json({ success: false, reason: 'Consent required' });
        }

        // FIX #13 : req.socket au lieu de req.connection
        const ip = hashIp(req.ip || req.socket?.remoteAddress); // RGPD : IP hashée
        const timestamp = new Date().toISOString();

        // FIX #7 : Échappement CSV renforcé (protection injection formules)
        const safeProduct = (product || 'Inconnu').replace(/"/g, '""').replace(/^[=+\-@]/g, "'$&");
        const safePrice = (price || '0').toString().replace('€', '').trim();
        const safeAsin = (asin || '').replace(/"/g, '');

        const csvLine = `"${timestamp}","${ip}","${safeProduct}","${safePrice}","${safeAsin}"\n`;

        const filePath = path.join(__dirname, 'clicks.csv');

        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, '"timestamp","ip","product_name","price","asin"\n');
        }

        fs.appendFile(filePath, csvLine, (err) => {
            if (err) console.error('Erreur log click:', err);
        });



        res.json({ success: true });
    } catch (e) {
        console.error('Erreur tracking click:', e);
        // FIX #9 : Ne pas exposer le message d'erreur en production
        res.status(500).json({ error: IS_PRODUCTION ? 'Erreur serveur' : e.message });
    }
});

// ============================================
// ENDPOINT TRACKING PROFILS : /api/track-profiles
// ============================================
app.post('/api/track-profiles', (req, res) => {
    try {
        const { profiles, consent } = req.body;

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
        console.error('Erreur track-profiles:', e);
        res.status(500).json({ error: IS_PRODUCTION ? 'Erreur serveur' : e.message });
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
app.get('*', (req, res) => {
    // 1. Redirection SEO pour les dossiers (ex: /blog ou /blog/ -> /blog.html)
    const cleanPath = req.path.replace(/\/$/, '');
    // [TASK-008] Utiliser les constantes fs/path déjà importées en haut du fichier
    if (cleanPath && fs.existsSync(path.join(__dirname, cleanPath + '.html'))) {
        return res.redirect(301, cleanPath + '.html');
    }
    // 2. Vraie erreur 404
    res.status(404).sendFile(path.join(__dirname, '404.html'));
});

// ======================
// GESTION D'ERREUR GLOBALE
// ======================
app.use((err, req, res, next) => {
    console.error('[GLOBAL ERROR]', err);
    res.status(500).json({
        error: 'Erreur serveur interne',
        message: IS_PRODUCTION ? 'Une erreur est survenue' : err.message
    });
});

// ======================
// DÉMARRAGE SERVEUR
// ======================
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
