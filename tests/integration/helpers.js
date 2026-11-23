'use strict';
// Helpers partagés des tests d'intégration (node:test, sans dépendance).
// - configureEnv() : variables d'environnement de test, À APPELER AVANT require('../../server.js')
// - installFetchMock() : intercepte les appels upstream (Gemini, RapidAPI) via globalThis.fetch
// - startServer() : écoute sur un port libre (127.0.0.1:0)
// - rawRequest() : requête HTTP brute (chemin non normalisé, pas de suivi de redirection)

const http = require('node:http');

const TEST_KEYS = Object.freeze({
    GEMINI_API_KEY: 'test-gemini-key-SECRET-g3m1n1',
    RAPIDAPI_KEY: 'test-rapid-key-SECRET-r4p1d'
});

const UPSTREAM_HOSTS = Object.freeze({
    gemini: 'generativelanguage.googleapis.com',
    rapid: 'real-time-amazon-data.p.rapidapi.com'
});

/**
 * Prépare l'environnement du serveur. Les valeurs `undefined` suppriment la variable.
 * dotenv ne surcharge pas les variables déjà définies : les clés de test priment sur un éventuel .env.
 */
function configureEnv(extra = {}) {
    const env = {
        GEMINI_API_KEY: TEST_KEYS.GEMINI_API_KEY,
        RAPIDAPI_KEY: TEST_KEYS.RAPIDAPI_KEY,
        NODE_ENV: undefined,
        GEMINI_MODEL: undefined,
        // Les tests simulent un seul proxy (X-Forwarded-For à une entrée) ; la chaîne réelle de Render
        // (3 proxys, valeur par défaut du code) est couverte par trust-proxy-render.int.js.
        TRUST_PROXY: '1',
        GEMINI_DAILY_LIMIT: undefined,
        GEMINI_DAILY_LIMIT_PER_IP: undefined,
        RAPIDAPI_DAILY_LIMIT: undefined,
        RAPIDAPI_DAILY_LIMIT_PER_IP: undefined,
        ANALYTICS_ORIGIN: undefined,
        ...extra
    };
    for (const [k, v] of Object.entries(env)) {
        if (v === undefined) {
            // Valeur vide plutôt que delete : empêche dotenv de la réinjecter depuis un .env local
            process.env[k] = '';
        } else {
            process.env[k] = v;
        }
    }
}

function headersToObject(headers) {
    const out = {};
    if (!headers) return out;
    new Headers(headers).forEach((value, key) => { out[key] = value; });
    return out;
}

function jsonResponse(status, body, extraHeaders = {}) {
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...extraHeaders }
    });
}

/**
 * Remplace globalThis.fetch : les appels vers 127.0.0.1/localhost (le test lui-même) passent,
 * les appels vers les API externes connues sont enregistrés et servis par `handlers[name]`.
 * Tout autre hôte fait échouer la requête (aucun appel réseau réel possible).
 */
function installFetchMock() {
    const realFetch = globalThis.fetch;
    const calls = [];
    const handlers = { gemini: null, rapid: null };

    globalThis.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' ? input : (input instanceof URL ? input.href : input.url);
        const u = new URL(url);
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') {
            return realFetch(input, init);
        }
        const name = Object.keys(UPSTREAM_HOSTS).find(k => UPSTREAM_HOSTS[k] === u.hostname);
        let body = init.body;
        let json;
        if (typeof body === 'string') {
            try { json = JSON.parse(body); } catch { json = undefined; }
        }
        const call = {
            name: name || 'unknown',
            url,
            parsedUrl: u,
            method: init.method || 'GET',
            headers: headersToObject(init.headers),
            body,
            json,
            signal: init.signal
        };
        calls.push(call);
        const handler = name && handlers[name];
        if (!handler) {
            throw new Error(`Appel upstream inattendu vers ${u.hostname}`);
        }
        return handler(call);
    };

    return {
        calls,
        handlers,
        callsTo(name) { return calls.filter(c => c.name === name); },
        reset() {
            calls.length = 0;
            handlers.gemini = null;
            handlers.rapid = null;
        },
        restore() { globalThis.fetch = realFetch; }
    };
}

function startServer(app) {
    return new Promise((resolve, reject) => {
        const server = app.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            resolve({
                server,
                port,
                base: `http://127.0.0.1:${port}`,
                close: () => new Promise(r => {
                    server.closeAllConnections?.();
                    server.close(() => r());
                })
            });
        });
        server.on('error', reject);
    });
}

/**
 * Requête HTTP brute : le chemin est envoyé tel quel (aucune normalisation de type WHATWG URL),
 * les redirections ne sont pas suivies.
 */
function rawRequest(port, rawPath, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            method,
            path: rawPath,
            headers: { Connection: 'close', ...headers }
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve({
                status: res.statusCode,
                headers: res.headers,
                text: Buffer.concat(chunks).toString('utf8')
            }));
        });
        req.on('error', reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

let ipCounter = 0;
/** Adresse IP de test unique (X-Forwarded-For, trust proxy = 1) pour isoler rate limits et quotas. */
function uniqueIp() {
    ipCounter++;
    return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

/** Vérifie qu'une réponse ne divulgue ni clé, ni hôte upstream, ni trace de pile. */
function assertNoLeak(assert, text) {
    for (const key of Object.values(TEST_KEYS)) {
        assert.ok(!text.includes(key), 'la réponse ne doit pas contenir de clé API');
    }
    assert.ok(!/googleapis/i.test(text), 'la réponse ne doit pas mentionner googleapis');
    assert.ok(!/rapidapi/i.test(text), 'la réponse ne doit pas mentionner rapidapi');
    assert.ok(!/\bat\s+\S+\s+\(|node:internal|\.js:\d+/.test(text), 'la réponse ne doit pas contenir de stack trace');
}

module.exports = {
    TEST_KEYS,
    UPSTREAM_HOSTS,
    configureEnv,
    installFetchMock,
    jsonResponse,
    startServer,
    rawRequest,
    uniqueIp,
    assertNoLeak
};
