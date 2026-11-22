'use strict';
// Interrupteur par IP : GEMINI_DAILY_LIMIT_PER_IP=0 et RAPIDAPI_DAILY_LIMIT_PER_IP=0 → 429, aucun appel externe.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, uniqueIp } = require('./helpers');

configureEnv({ GEMINI_DAILY_LIMIT_PER_IP: '0', RAPIDAPI_DAILY_LIMIT_PER_IP: '0' });
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
    mock.handlers.gemini = () => jsonResponse(200, { candidates: [] });
    mock.handlers.rapid = () => jsonResponse(200, { data: { products: [] } });
});

describe('quotas par IP à 0', () => {
    test('/api/analyze → 429 avec Retry-After, aucun appel Gemini', async () => {
        const res = await fetch(`${srv.base}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': uniqueIp() },
            body: JSON.stringify({ contexte: 'Noël', profile: { budget: 30 } })
        });
        assert.equal(res.status, 429);
        const retry = Number(res.headers.get('retry-after'));
        assert.ok(retry >= 1 && retry <= 86400);
        assert.equal(mock.callsTo('gemini').length, 0);
    });

    test('/api/search → 429 avec Retry-After, aucun appel RapidAPI', async () => {
        const res = await fetch(`${srv.base}/api/search?term=${encodeURIComponent('montre sport')}&max_price=50`, {
            headers: { 'X-Forwarded-For': uniqueIp() }
        });
        assert.equal(res.status, 429);
        const retry = Number(res.headers.get('retry-after'));
        assert.ok(retry >= 1 && retry <= 86400);
        assert.equal(mock.callsTo('rapid').length, 0);
    });
});
