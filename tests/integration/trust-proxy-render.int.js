'use strict';
// Chaîne réelle de Render avec TRUST_PROXY non défini (défaut 3) : X-Forwarded-For contient
// « client, Cloudflare, répartiteur Render » et la socket vient du proxy local (127.0.0.1).
// Le quota par IP doit suivre le vrai client, quel que soit le serveur Cloudflare ou le répartiteur,
// et une IP forgée en tête de X-Forwarded-For ne doit pas permettre de le contourner.
// Fichier dédié : l'environnement est lu au chargement du serveur.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer } = require('./helpers');

configureEnv({ NODE_ENV: 'production', TRUST_PROXY: undefined, GEMINI_DAILY_LIMIT_PER_IP: '1', GEMINI_DAILY_LIMIT: '10' });
const { app } = require('../../server.js');

let srv;
let mock;
before(async () => { mock = installFetchMock(); srv = await startServer(app); });
after(async () => { await srv.close(); mock.restore(); });
beforeEach(() => {
    mock.reset();
    mock.handlers.gemini = () => jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: '{"suggestions":[{"term":"coffret thé","reason":"r","prix_estime":"30€"}]}' }] }, finishReason: 'STOP' }]
    });
});

async function analyze(xff, budget) {
    const res = await fetch(`${srv.base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff },
        body: JSON.stringify({ contexte: 'Noël', profile: { budget, tags: ['Sport'] } })
    });
    return res.status;
}

const CLIENT_A = '203.0.113.50';
const CLIENT_B = '203.0.113.60';

describe('TRUST_PROXY par défaut = 3 (Cloudflare → répartiteur Render → proxy local)', () => {
    test('même client via un autre serveur Cloudflare et un autre répartiteur : même quota (2e recherche → 429)', async () => {
        assert.equal(await analyze(`${CLIENT_A}, 172.69.222.241, 10.25.75.188`, 31), 200);
        assert.equal(await analyze(`${CLIENT_A}, 104.23.229.80, 10.27.115.103`, 32), 429);
        assert.equal(mock.callsTo('gemini').length, 1);
    });

    test('IP forgée en tête de X-Forwarded-For : le vrai client reste identifié (429)', async () => {
        assert.equal(await analyze(`1.2.3.4, ${CLIENT_A}, 141.101.69.84, 10.24.221.144`, 33), 429);
        assert.equal(mock.calls.length, 0);
    });

    test("un autre client n'est pas affecté (200)", async () => {
        assert.equal(await analyze(`${CLIENT_B}, 172.69.222.241, 10.25.75.188`, 34), 200);
    });
});
