'use strict';
// Quota Gemini par IP = 2 dans la configuration de Render (NODE_ENV=production, TRUST_PROXY=1).
// Ce qui est compté : les appels réels à Gemini (pas les requêtes servies par le cache, ni les requêtes invalides).
// Un appel lancé reste compté même s'il échoue. Un 503 (plafond global) ne débite pas l'IP.
// Plafonds lus au chargement du module : fichier dédié, l'ordre des tests compte (compteurs partagés).

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer } = require('./helpers');

configureEnv({
    NODE_ENV: 'production',
    TRUST_PROXY: '1',
    GEMINI_DAILY_LIMIT_PER_IP: '2',
    GEMINI_DAILY_LIMIT: '5'
});
const { app } = require('../../server.js');

let srv;
let mock;
before(async () => { mock = installFetchMock(); srv = await startServer(app); });
after(async () => { await srv.close(); mock.restore(); });

const okGemini = () => jsonResponse(200, {
    candidates: [{
        content: { parts: [{ text: '{"suggestions":[{"term":"coffret thé","reason":"r","prix_estime":"30€"}]}' }] },
        finishReason: 'STOP'
    }]
});
beforeEach(() => {
    mock.reset();
    mock.handlers.gemini = okGemini;
});

// Le proxy Render ajoute l'IP réelle en dernier dans X-Forwarded-For ; avec TRUST_PROXY=1 c'est elle qui compte.
async function analyze(xff, budget) {
    const res = await fetch(`${srv.base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff },
        body: JSON.stringify({ contexte: 'Noël', profile: { budget, tags: ['Sport'] } })
    });
    return { status: res.status, retryAfter: res.headers.get('retry-after') };
}

const IP_A = '203.0.113.10';
const IP_B = '203.0.113.20';
const IP_C = '203.0.113.30';

describe('GEMINI_DAILY_LIMIT_PER_IP=2 (production, TRUST_PROXY=1)', () => {
    test('2 recherches différentes passent, la 3e → 429 avec Retry-After, sans appel Gemini', async () => {
        assert.equal((await analyze(IP_A, 31)).status, 200);
        assert.equal((await analyze(IP_A, 32)).status, 200);
        const r3 = await analyze(IP_A, 33);
        assert.equal(r3.status, 429);
        assert.match(r3.retryAfter ?? '', /^\d+$/);
        assert.equal(mock.callsTo('gemini').length, 2);
    });

    test('entrées forgées en tête de X-Forwarded-For : même IP réelle → toujours 429', async () => {
        for (const forged of ['1.1.1.1', '8.8.8.8, 9.9.9.9', '2001:db8::1']) {
            assert.equal((await analyze(`${forged}, ${IP_A}`, 34)).status, 429, `forgé : ${forged}`);
        }
        assert.equal(mock.calls.length, 0);
    });

    test('un profil déjà en cache reste servi après la limite, sans appel Gemini (choix assumé)', async () => {
        assert.equal((await analyze(IP_A, 31)).status, 200);
        assert.equal(mock.calls.length, 0);
    });

    test('un appel Gemini qui échoue est décompté : erreur, succès, puis 429', async () => {
        mock.handlers.gemini = () => jsonResponse(500, { error: { status: 'INTERNAL' } });
        assert.equal((await analyze(IP_B, 41)).status, 502);
        mock.handlers.gemini = okGemini;
        assert.equal((await analyze(IP_B, 42)).status, 200);
        assert.equal((await analyze(IP_B, 43)).status, 429);
        assert.equal(mock.callsTo('gemini').length, 2);
    });

    test('plafond global atteint : 503 qui ne débite pas le quota de l\'IP', async () => {
        assert.equal((await analyze(IP_C, 51)).status, 200, '5e et dernier appel global');
        // Sans la correction, la 3e tentative de C répondait 429 (IP débitée par les deux 503 précédents)
        for (let i = 0; i < 3; i++) {
            assert.equal((await analyze(IP_C, 52 + i)).status, 503, `tentative ${i + 1}`);
        }
        assert.equal((await analyze(IP_A, 60)).status, 429, 'quota IP vérifié avant le global');
        assert.equal(mock.callsTo('gemini').length, 1);
    });
});
