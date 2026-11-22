'use strict';
// Tests d'intégration : refus des requêtes cross-site (Sec-Fetch-Site) sur /api/search et /api/analyze.
// Les requêtes sont envoyées en HTTP brut (Sec-Fetch-Site est un en-tête interdit côté fetch).

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, rawRequest, uniqueIp } = require('./helpers');

configureEnv();
const { app } = require('../../server.js');

let srv;
let mock;
before(async () => { mock = installFetchMock(); srv = await startServer(app); });
after(async () => { await srv.close(); mock.restore(); });
beforeEach(() => {
    mock.reset();
    mock.handlers.gemini = () => jsonResponse(200, {
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"suggestions":[{"term":"coffret thé","reason":"r","prix_estime":"30€"}]}' }] } }]
    });
    mock.handlers.rapid = () => jsonResponse(200, {
        data: { products: [{ product_title: 'Coffret', product_url: 'https://www.amazon.fr/dp/B0TESTOK01', product_price: '20 €' }] }
    });
});

const analyzeBody = JSON.stringify({ contexte: 'Noël', profile: { budget: 30, tags: ['Sport'] } });

function search(site, term = 'cross-site-test') {
    const headers = { 'X-Forwarded-For': uniqueIp() };
    if (site !== undefined) headers['Sec-Fetch-Site'] = site;
    return rawRequest(srv.port, `/api/search?term=${term}&max_price=50`, { headers });
}
function analyze(site) {
    const headers = { 'X-Forwarded-For': uniqueIp(), 'Content-Type': 'application/json' };
    if (site !== undefined) headers['Sec-Fetch-Site'] = site;
    return rawRequest(srv.port, '/api/analyze', { method: 'POST', headers, body: analyzeBody });
}

describe('Sec-Fetch-Site refusé : 403 sans appel externe', () => {
    for (const site of ['cross-site', 'same-site', 'bogus', '']) {
        test(`/api/search avec "${site}"`, async () => {
            const r = await search(site);
            assert.equal(r.status, 403);
            assert.deepEqual(JSON.parse(r.text), { error: 'Requête non autorisée' });
            assert.equal(mock.calls.length, 0);
        });
        test(`/api/analyze avec "${site}"`, async () => {
            const r = await analyze(site);
            assert.equal(r.status, 403);
            assert.deepEqual(JSON.parse(r.text), { error: 'Requête non autorisée' });
            assert.equal(mock.calls.length, 0);
        });
    }

    test('le 403 ne consomme ni limiteur ni cache : une requête cross-site ne laisse aucune trace', async () => {
        const ip = uniqueIp();
        const r = await rawRequest(srv.port, '/api/search?term=trace&max_price=50',
            { headers: { 'X-Forwarded-For': ip, 'Sec-Fetch-Site': 'cross-site' } });
        assert.equal(r.status, 403);
        assert.equal(r.headers['ratelimit-remaining'], undefined, 'limiteur non atteint');
    });
});

describe('Sec-Fetch-Site accepté : comportement normal', () => {
    for (const site of ['same-origin', 'none', undefined]) {
        test(`/api/search avec ${JSON.stringify(site)}`, async () => {
            const r = await search(site, `ok-${String(site)}`);
            assert.equal(r.status, 200);
            assert.equal(mock.callsTo('rapid').length, 1);
        });
        test(`/api/analyze avec ${JSON.stringify(site)}`, async () => {
            const r = await analyze(site);
            assert.equal(r.status, 200);
            assert.ok(JSON.parse(r.text).suggestions.length >= 1);
        });
    }
});
