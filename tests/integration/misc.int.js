'use strict';
// Tests d'intégration : rate limits des endpoints d'écriture, tracking sans consentement, route d'inscription supprimée.
// Chaque scénario utilise sa propre IP (X-Forwarded-For, trust proxy = 1) : les compteurs en mémoire
// du process ne se « volent » pas les requêtes entre tests.
// Aucun test n'envoie consent:true à /api/track-click : clicks.csv ne doit jamais être créé.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    configureEnv, installFetchMock, startServer, uniqueIp
} = require('./helpers');

configureEnv();
const { app } = require('../../server.js');

const ROOT = path.resolve(__dirname, '..', '..');
const CSV_FILES = ['clicks.csv', 'searches.csv'].map(f => path.join(ROOT, f));

let srv;
let mock;
let csvBefore;

before(async () => {
    csvBefore = CSV_FILES.map(f => fs.existsSync(f));
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

describe('POST /api/track-profiles', () => {
    // Capture tout ce qui est journalisé pendant fn() (le serveur tourne dans ce process)
    async function captureLogs(fn) {
        const methods = ['log', 'info', 'warn', 'error', 'debug'];
        const saved = {};
        const lines = [];
        for (const m of methods) {
            saved[m] = console[m];
            console[m] = (...args) => { lines.push(args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
        }
        try {
            await fn();
        } finally {
            for (const m of methods) console[m] = saved[m];
        }
        return lines.join('\n');
    }

    test("sans consentement → success:false, rien n'est traité", async () => {
        const r = await postJson('/api/track-profiles', { count: 2, consent: false }, uniqueIp());
        assert.equal(r.status, 200);
        assert.deepEqual(r.json, { success: false, reason: 'no_consent' });
        const legacy = await postJson('/api/track-profiles', { profiles: [{ nom: 'A' }], consent: false }, uniqueIp());
        assert.deepEqual(legacy.json, { success: false, reason: 'no_consent' });
    });

    test('consent chaîne "true" (non booléen) → success:false', async () => {
        const r = await postJson('/api/track-profiles', { count: 1, consent: 'true' }, uniqueIp());
        assert.deepEqual(r.json, { success: false, reason: 'no_consent' });
    });

    test('nouveau contrat { count, consent:true } → { success:true, count }', async () => {
        for (const count of [1, 3, 10]) {
            const r = await postJson('/api/track-profiles', { count, consent: true }, uniqueIp());
            assert.equal(r.status, 200, `count=${count}`);
            assert.deepEqual(r.json, { success: true, count });
        }
    });

    test('count invalide → 400 générique', async () => {
        const invalid = [0, 11, -1, 1.5, '3', [3], null, true, {}, 1e309 /* → null en JSON */];
        for (const count of invalid) {
            const r = await postJson('/api/track-profiles', { count, consent: true }, uniqueIp());
            assert.equal(r.status, 400, `count=${JSON.stringify(count)}`);
            assert.deepEqual(r.json, { error: 'Requête invalide' });
        }
    });

    test('count invalide non rattrapé par un ancien champ profiles', async () => {
        const r = await postJson('/api/track-profiles', { count: 0, profiles: [{ nom: 'A' }], consent: true }, uniqueIp());
        assert.equal(r.status, 400);
        assert.deepEqual(r.json, { error: 'Requête invalide' });
    });

    test('ni count ni profiles / corps non-objet → 400 générique', async () => {
        for (const body of [{ consent: true }, { profiles: [], consent: true }, { profiles: 'abc', consent: true }]) {
            const r = await postJson('/api/track-profiles', body, uniqueIp());
            assert.equal(r.status, 400, JSON.stringify(body));
            assert.deepEqual(r.json, { error: 'Requête invalide' });
        }
        const arr = await postJson('/api/track-profiles', [{ consent: true }], uniqueIp());
        assert.deepEqual(arr.json, { success: false, reason: 'no_consent' });
    });

    test('transition : ancien format { profiles:[...] } accepté, compté et plafonné à 10', async () => {
        const r = await postJson('/api/track-profiles', { profiles: [{ nom: 'A' }, { nom: 'B' }], consent: true }, uniqueIp());
        assert.equal(r.status, 200);
        assert.deepEqual(r.json, { success: true, count: 2 });
        const big = await postJson('/api/track-profiles', { profiles: Array.from({ length: 25 }, () => ({})), consent: true }, uniqueIp());
        assert.equal(big.status, 200);
        assert.deepEqual(big.json, { success: true, count: 10 });
    });

    test("le contenu des profils n'est jamais journalisé ni renvoyé", async () => {
        const SECRET = 'PROFIL-PRIVE-Zx9q';
        let r;
        const logs = await captureLogs(async () => {
            r = await postJson('/api/track-profiles', {
                profiles: [{ nom: SECRET, age: 42, interets: [SECRET] }], consent: true
            }, uniqueIp());
            await postJson('/api/track-profiles', { count: SECRET, consent: true }, uniqueIp());
        });
        assert.deepEqual(r.json, { success: true, count: 1 });
        assert.ok(!r.text.includes(SECRET), 'contenu absent de la réponse');
        assert.ok(!logs.includes(SECRET), 'contenu absent des logs');
    });

    test('rate limit : la 11e requête en 1 min → 429', async () => {
        const ip = uniqueIp();
        for (let i = 1; i <= 10; i++) {
            const r = await postJson('/api/track-profiles', { count: 1, consent: true }, ip);
            assert.equal(r.status, 200, `requête ${i}`);
            assert.deepEqual(r.json, { success: true, count: 1 });
        }
        const r11 = await postJson('/api/track-profiles', { count: 1, consent: true }, ip);
        assert.equal(r11.status, 429);
    });
});

describe('POST /api/track-click', () => {
    test('consent:false → success:false, aucun CSV écrit', async () => {
        const r = await postJson('/api/track-click', {
            product: 'Coffret', price: '29,99 €', asin: 'B0TESTOK01', consent: false
        }, uniqueIp());
        assert.equal(r.status, 200);
        assert.deepEqual(r.json, { success: false, reason: 'Consent required' });
        await new Promise(res => setTimeout(res, 100)); // laisse le temps à une éventuelle écriture async
        assert.deepEqual(CSV_FILES.map(f => fs.existsSync(f)), csvBefore, 'aucun fichier CSV créé à la racine');
    });

    test('consent chaîne "true" (non booléen) → success:false', async () => {
        const r = await postJson('/api/track-click', { product: 'X', consent: 'true' }, uniqueIp());
        assert.deepEqual(r.json, { success: false, reason: 'Consent required' });
        await new Promise(res => setTimeout(res, 50));
        assert.deepEqual(CSV_FILES.map(f => fs.existsSync(f)), csvBefore);
    });

    test('rate limit : la 31e requête en 1 min → 429 (sans consentement, donc sans écriture)', async () => {
        const ip = uniqueIp();
        for (let i = 1; i <= 30; i++) {
            const r = await postJson('/api/track-click', { consent: false }, ip);
            assert.equal(r.status, 200, `requête ${i}`);
        }
        const r31 = await postJson('/api/track-click', { consent: false }, ip);
        assert.equal(r31.status, 429);
        assert.deepEqual(CSV_FILES.map(f => fs.existsSync(f)), csvBefore);
    });
});

describe('divers', () => {
    test('payload > 50 ko → 413 générique', async () => {
        const r = await postJson('/api/track-profiles', { profiles: ['x'.repeat(60 * 1024)], consent: true }, uniqueIp());
        assert.equal(r.status, 413);
        assert.deepEqual(r.json, { error: 'Requête invalide' });
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

describe('X-Forwarded-For : usurpation d\'IP (trust proxy = 1)', () => {
    test('faire varier les entrées forgées en tête de X-Forwarded-For ne contourne pas le rate limit', async () => {
        // Avec trust proxy = 1, seule l'entrée la plus à droite (ajoutée par le proxy) est retenue.
        // Un client qui préfixe des IP aléatoires reste identifié par son IP réelle.
        const realIp = uniqueIp();
        const statuses = [];
        for (let i = 1; i <= 11; i++) {
            const r = await postJson('/api/track-profiles', { profiles: [{ nom: 'A' }], consent: true },
                `198.18.${i}.${i}, ${realIp}`);
            statuses.push(r.status);
        }
        assert.deepEqual(statuses.slice(0, 10), Array(10).fill(200));
        assert.equal(statuses[10], 429, '11e requête limitée malgré des IP forgées différentes');
    });
});
