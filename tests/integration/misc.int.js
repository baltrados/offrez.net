'use strict';
// Tests d'intégration : routes supprimées (inscription, suivi), limites de corps, usurpation X-Forwarded-For.
// Chaque scénario utilise sa propre IP (X-Forwarded-For, trust proxy = 1) : les compteurs en mémoire
// du process ne se « volent » pas les requêtes entre tests.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    configureEnv, installFetchMock, startServer, uniqueIp
} = require('./helpers');

configureEnv();
const { app } = require('../../server.js');

let srv;
let mock;

before(async () => {
    mock = installFetchMock();
    srv = await startServer(app);
});

after(async () => {
    await srv.close();
    mock.restore();
});

beforeEach(() => mock.reset());

async function postJson(p, body, ip) {
    const res = await fetch(`${srv.base}${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify(body)
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, text, json, headers: res.headers };
}

describe('POST /api/subscribe (route supprimée)', () => {
    test('renvoie 404 et ne contacte aucun service externe', async () => {
        const r = await postJson('/api/subscribe', { email: 'test@example.com', consent: true }, uniqueIp());
        assert.equal(r.status, 404);
        assert.equal(mock.calls.length, 0);
    });
});

describe('routes de suivi supprimées', () => {
    test('POST /api/track-click et /api/track-profiles → 404, aucun service externe contacté', async () => {
        for (const p of ['/api/track-click', '/api/track-profiles']) {
            const r = await postJson(p, { consent: true, count: 1, product: 'X' }, uniqueIp());
            assert.equal(r.status, 404, p);
        }
        assert.equal(mock.calls.length, 0);
    });
});

describe('divers', () => {
    test('payload > 50 ko → 413 générique', async () => {
        const r = await postJson('/api/analyze', { contexte: 'x'.repeat(60 * 1024), profile: {} }, uniqueIp());
        assert.equal(r.status, 413);
        assert.deepEqual(r.json, { error: 'Requête invalide' });
        assert.equal(mock.calls.length, 0, 'aucun appel externe (Gemini) déclenché');
    });

    test('méthode non gérée sur une route API → 404 (pas de stack)', async () => {
        const res = await fetch(`${srv.base}/api/analyze`, { method: 'GET' });
        const text = await res.text();
        assert.equal(res.status, 404);
        // Page 404.html (elle référence Google Fonts : pas d'assertNoLeak ici) sans trace de pile
        assert.match(text, /<html/i);
        assert.ok(!/node:internal|\bat\s+\S+\s+\(/.test(text));
    });

    test('/api/health → statut healthy sans données sensibles', async () => {
        const res = await fetch(`${srv.base}/api/health`);
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.status, 'healthy');
        assert.deepEqual(Object.keys(json).sort(), ['cacheSize', 'memoryUsage', 'status', 'timestamp', 'uptime']);
    });
});

describe("X-Forwarded-For : usurpation d'IP (trust proxy = 1)", () => {
    test('faire varier les entrées forgées en tête de X-Forwarded-For ne contourne pas le rate limit', async () => {
        // Avec trust proxy = 1, seule l'entrée la plus à droite (ajoutée par le proxy) est retenue.
        // Un client qui préfixe des IP aléatoires reste identifié par son IP réelle.
        // Corps vide : rejeté en 400 par la validation, sans aucun appel Gemini (le limiteur compte quand même).
        const realIp = uniqueIp();
        const statuses = [];
        for (let i = 1; i <= 21; i++) {
            const r = await postJson('/api/analyze', {}, `198.18.${i}.${i}, ${realIp}`);
            statuses.push(r.status);
        }
        assert.deepEqual(statuses.slice(0, 20), Array(20).fill(400));
        assert.equal(statuses[20], 429, '21e requête limitée malgré des IP forgées différentes');
        assert.equal(mock.calls.length, 0, 'aucun appel externe');
    });
});
