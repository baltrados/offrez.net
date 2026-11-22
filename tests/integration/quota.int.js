'use strict';
// Tests d'intégration des quotas journaliers (lus au chargement du module) : fichier dédié,
// node:test exécute chaque fichier dans son propre process, les limites basses n'impactent pas les autres.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, assertNoLeak } = require('./helpers');

configureEnv({
    GEMINI_DAILY_LIMIT_PER_IP: '1',
    GEMINI_DAILY_LIMIT: '2',
    RAPIDAPI_DAILY_LIMIT_PER_IP: '1',
    RAPIDAPI_DAILY_LIMIT: '2'
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
        candidates: [{ content: { parts: [{ text: '{"suggestions":[{"term":"coffret thé","reason":"r","prix_estime":"30€"}]}' }] } }]
    });
    mock.handlers.rapid = () => jsonResponse(200, {
        data: { products: [{ product_title: 'Coffret', product_url: 'https://www.amazon.fr/dp/B0TESTOK01', product_price: '20 €' }] }
    });
});

const body = { contexte: 'Noël', profile: { budget: 30, tags: ['Sport'] } };

async function analyze(ip, payload = body) {
    const res = await fetch(`${srv.base}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify(payload)
    });
    return { status: res.status, text: await res.text() };
}

async function search(ip, term) {
    const res = await fetch(`${srv.base}/api/search?term=${encodeURIComponent(term)}&max_price=50`, {
        headers: { 'X-Forwarded-For': ip }
    });
    return { status: res.status, text: await res.text() };
}

describe('quotas Gemini (par IP = 1, global = 2)', () => {
    test('requête invalide ne consomme pas de quota', async () => {
        const r = await analyze('203.0.113.1', { profile: { budget: -1 } });
        assert.equal(r.status, 400);
        assert.equal(mock.calls.length, 0);
    });

    test('IP A : 1er appel 200, 2e appel 429 (quota par IP), upstream appelé une fois', async () => {
        assert.equal((await analyze('203.0.113.1')).status, 200);
        const r2 = await analyze('203.0.113.1');
        assert.equal(r2.status, 429);
        assert.match(JSON.parse(r2.text).error, /Limite quotidienne/);
        assertNoLeak(assert, r2.text);
        assert.equal(mock.callsTo('gemini').length, 1);
    });

    test('IP B (autre client) non impactée par le quota de A → 200', async () => {
        assert.equal((await analyze('203.0.113.2')).status, 200);
    });

    test('IP C : quota global (2/jour) atteint → 503 générique, sans appel upstream', async () => {
        const r = await analyze('203.0.113.3');
        assert.equal(r.status, 503);
        assert.match(JSON.parse(r.text).error, /indisponible/);
        assert.equal(mock.calls.length, 0);
    });

    test('IPv6 : deux adresses du même /64 partagent le quota', async () => {
        // Le quota global est épuisé : on vérifie ici l'ordre des contrôles (IP avant global)
        // via le message 429 pour la 2e adresse du même /64.
        const r1 = await analyze('2001:db8:1:2::1');
        assert.equal(r1.status, 503, '1re adresse : quota IP libre mais global épuisé');
        const r2 = await analyze('2001:db8:1:2::ffff');
        assert.equal(r2.status, 429, '2e adresse du même /64 : quota IP déjà consommé');
    });
});

describe('quotas RapidAPI (par IP = 1, global = 2)', () => {
    test('IP A : 1re recherche 200, même terme servi par le cache (pas de quota), autre terme 429', async () => {
        assert.equal((await search('198.51.100.1', 'quota-terme-1')).status, 200);
        assert.equal((await search('198.51.100.1', 'quota-terme-1')).status, 200);
        assert.equal(mock.callsTo('rapid').length, 1);
        const r = await search('198.51.100.1', 'quota-terme-2');
        assert.equal(r.status, 429);
        assert.equal(mock.callsTo('rapid').length, 1);
    });

    test('IP B → 200 puis IP C → 503 (quota global)', async () => {
        assert.equal((await search('198.51.100.2', 'quota-terme-3')).status, 200);
        assert.equal((await search('198.51.100.3', 'quota-terme-4')).status, 503);
        assert.equal(mock.callsTo('rapid').length, 1);
    });

    test('un terme en cache reste servi même quota épuisé', async () => {
        const r = await search('198.51.100.9', 'quota-terme-1');
        assert.equal(r.status, 200);
        assert.equal(mock.calls.length, 0);
    });
});
