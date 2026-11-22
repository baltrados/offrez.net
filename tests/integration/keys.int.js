'use strict';
// Tests d'intégration : clé API copiée avec un retour à la ligne (nettoyée ou ignorée, jamais journalisée).

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, uniqueIp } = require('./helpers');

const BAD_KEY = 'AIzaFAKE\nKEY';
configureEnv({ GEMINI_API_KEY: BAD_KEY, RAPIDAPI_KEY: '  rapid-ok-key\n' });

const warnings = [];
const origWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); };
const { app } = require('../../server.js');
console.warn = origWarn;

let srv;
let mock;
before(async () => {
    mock = installFetchMock();
    srv = await startServer(app);
    mock.handlers.rapid = () => jsonResponse(200, {
        data: { products: [{ product_title: 'Coffret', product_url: 'https://www.amazon.fr/dp/B0TESTOK01', product_price: '20 €' }] }
    });
});
after(async () => { await srv.close(); mock.restore(); });

describe('nettoyage des clés au démarrage', () => {
    test('clé invalide ignorée : avertissement sans la clé', () => {
        const w = warnings.find(x => x.includes('GEMINI_API_KEY'));
        assert.ok(w, 'avertissement émis');
        assert.ok(!w.includes('AIzaFAKE') && !w.includes('KEY\n'), 'la clé ne figure pas dans l\'avertissement');
    });

    test('analyze avec clé invalide : 500 générique, aucun appel Gemini', async () => {
        const res = await fetch(`${srv.base}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': uniqueIp() },
            body: JSON.stringify({ contexte: 'Noël', profile: { budget: 30, tags: ['Sport'] } })
        });
        assert.equal(res.status, 500);
        assert.equal(mock.callsTo('gemini').length, 0);
    });

    test('clé avec espaces/retour final : nettoyée par trim() et envoyée proprement', async () => {
        const res = await fetch(`${srv.base}/api/search?term=trim-key&max_price=50`, { headers: { 'X-Forwarded-For': uniqueIp() } });
        assert.equal(res.status, 200);
        assert.equal(mock.callsTo('rapid')[0].headers['x-rapidapi-key'], 'rapid-ok-key');
    });
});
