'use strict';
// Interrupteur : GEMINI_DAILY_LIMIT=0 et RAPIDAPI_DAILY_LIMIT=0 → « aucun appel autorisé ».
// Variables lues au chargement du module : fichier dédié (un process node:test par fichier).

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, uniqueIp, assertNoLeak } = require('./helpers');

configureEnv({ GEMINI_DAILY_LIMIT: '0', RAPIDAPI_DAILY_LIMIT: '0' });
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
beforeEach(() => {
    mock.reset();
    mock.handlers.gemini = () => jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: '{"suggestions":[{"term":"coffret thé","reason":"r"}]}' }] }, finishReason: 'STOP' }]
    });
    mock.handlers.rapid = () => jsonResponse(200, { data: { products: [] } });
});

describe('GEMINI_DAILY_LIMIT=0 / RAPIDAPI_DAILY_LIMIT=0', () => {
    test('/api/analyze → 503 « indisponible », Retry-After, aucun appel Gemini (même répété)', async () => {
        for (let i = 0; i < 3; i++) {
            const res = await fetch(`${srv.base}/api/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': uniqueIp() },
                body: JSON.stringify({ contexte: 'Noël', profile: { budget: 30, tags: ['Sport'] } })
            });
            const text = await res.text();
            assert.equal(res.status, 503);
            assert.match(JSON.parse(text).error, /indisponible/);
            const retry = Number(res.headers.get('retry-after'));
            assert.ok(retry >= 1 && retry <= 86400);
            assertNoLeak(assert, text);
        }
        assert.equal(mock.callsTo('gemini').length, 0);
    });

    test('/api/search → 503 « indisponible », Retry-After, aucun appel RapidAPI', async () => {
        const res = await fetch(`${srv.base}/api/search?term=${encodeURIComponent('montre sport')}&max_price=50`, {
            headers: { 'X-Forwarded-For': uniqueIp() }
        });
        const text = await res.text();
        assert.equal(res.status, 503);
        assert.match(JSON.parse(text).error, /indisponible/);
        const retry = Number(res.headers.get('retry-after'));
        assert.ok(retry >= 1 && retry <= 86400);
        assert.equal(mock.callsTo('rapid').length, 0);
    });

    test('une requête invalide reste un 400 (validation avant quota)', async () => {
        const res = await fetch(`${srv.base}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': uniqueIp() },
            body: JSON.stringify({ profile: { budget: -1 } })
        });
        assert.equal(res.status, 400);
        assert.equal(mock.calls.length, 0);
    });
});
