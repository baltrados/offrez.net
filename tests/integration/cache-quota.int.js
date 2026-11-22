'use strict';
// Un résultat en cache ne consomme AUCUN quota : plafond global Gemini/RapidAPI à 1, un MISS puis des HIT.
// Plafonds lus au chargement du module : fichier dédié.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, uniqueIp } = require('./helpers');

configureEnv({
    GEMINI_DAILY_LIMIT: '1',
    RAPIDAPI_DAILY_LIMIT: '1',
    GEMINI_DAILY_LIMIT_PER_IP: '1',
    RAPIDAPI_DAILY_LIMIT_PER_IP: '1'
});
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
        candidates: [{
            content: { parts: [{ text: '{"suggestions":[{"term":"coffret thé","reason":"r","prix_estime":"30€"}]}' }] },
            finishReason: 'STOP'
        }]
    });
    mock.handlers.rapid = () => jsonResponse(200, {
        data: { products: [{ product_title: 'Coffret', product_url: 'https://www.amazon.fr/dp/B0TESTOK01', product_price: '20 €' }] }
    });
});

async function analyze(profile, ip) {
    const res = await fetch(`${srv.base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ contexte: 'Noël', profile })
    });
    return { status: res.status, cache: res.headers.get('x-cache') };
}

async function search(term, ip) {
    const res = await fetch(`${srv.base}/api/search?term=${encodeURIComponent(term)}&max_price=50`, {
        headers: { 'X-Forwarded-For': ip }
    });
    return { status: res.status, cache: res.headers.get('x-cache') };
}

describe('un HIT ne consomme pas de quota', () => {
    test('/api/analyze : MISS (quota 1/1 consommé) puis HIT répétés, même IP et autres IP', async () => {
        const profile = { budget: 40, tags: ['Sport'], nom: 'Lou' };
        assert.deepEqual(await analyze(profile, '192.0.2.10'), { status: 200, cache: 'MISS' });
        for (let i = 0; i < 4; i++) {
            const ip = i < 2 ? '192.0.2.10' : uniqueIp();
            assert.deepEqual(await analyze({ ...profile, nom: 'Autre' + i }, ip), { status: 200, cache: 'HIT' });
        }
        assert.equal(mock.callsTo('gemini').length, 1);
        // Plafond bien atteint pour une demande différente : 503 (nouvelle IP), sans appel
        const other = await analyze({ budget: 41, tags: ['Sport'] }, uniqueIp());
        assert.equal(other.status, 503);
        assert.equal(mock.callsTo('gemini').length, 1);
    });

    test('/api/search : MISS puis HIT répétés malgré un plafond atteint', async () => {
        assert.deepEqual(await search('quota-cache-1', '192.0.2.20'), { status: 200, cache: 'MISS' });
        for (let i = 0; i < 3; i++) {
            assert.deepEqual(await search('quota-cache-1', '192.0.2.20'), { status: 200, cache: 'HIT' });
        }
        assert.equal(mock.callsTo('rapid').length, 1);
        assert.equal((await search('quota-cache-2', uniqueIp())).status, 503);
        assert.equal(mock.callsTo('rapid').length, 1);
    });
});
