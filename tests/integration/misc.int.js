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
const { RATE_LIMITS } = require('../../lib/config');

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

    test('/api/health → { status: "ok" } uniquement', async () => {
        const res = await fetch(`${srv.base}/api/health`);
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.deepEqual(json, { status: 'ok' });
    });
});

describe('CORS : aucun en-tête Access-Control-Allow-Origin', () => {
    test('une requête cross-origin ne reçoit pas Access-Control-Allow-Origin', async () => {
        const res = await fetch(`${srv.base}/api/health`, { headers: { Origin: 'https://evil.example' } });
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
        const pre = await fetch(`${srv.base}/api/analyze`, {
            method: 'OPTIONS',
            headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' }
        });
        assert.equal(pre.headers.get('access-control-allow-origin'), null);
    });
});

describe("X-Forwarded-For : usurpation d'IP (trust proxy = 1)", () => {
    test('faire varier les entrées forgées en tête de X-Forwarded-For ne contourne pas le rate limit', async () => {
        // Avec trust proxy = 1, seule l'entrée la plus à droite (ajoutée par le proxy) est retenue.
        // Un client qui préfixe des IP aléatoires reste identifié par son IP réelle.
        // Corps vide : rejeté en 400 par la validation, sans aucun appel Gemini (le limiteur compte quand même).
        const realIp = uniqueIp();
        const statuses = [];
        const limit = RATE_LIMITS.analyzePerMinute;
        for (let i = 1; i <= limit + 1; i++) {
            const r = await postJson('/api/analyze', {}, `198.18.${i}.${i}, ${realIp}`);
            statuses.push(r.status);
        }
        assert.deepEqual(statuses.slice(0, limit), Array(limit).fill(400));
        assert.equal(statuses[limit], 429, `requête n°${limit + 1} limitée malgré des IP forgées différentes`);
        assert.equal(mock.calls.length, 0, 'aucun appel externe');
    });
});

describe('route de diagnostic IP (retirée après validation de TRUST_PROXY)', () => {
    test('/api/debug-ip → 404, aucune information réseau renvoyée', async () => {
        const res = await fetch(`${srv.base}/api/debug-ip`, { headers: { 'X-Forwarded-For': uniqueIp() } });
        assert.equal(res.status, 404);
        const text = await res.text();
        assert.ok(!/xForwardedFor|quotaKey/.test(text));
    });
});
