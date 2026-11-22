'use strict';
// Tests d'intégration en NODE_ENV=production : pas d'X-Cache, redirection www vers un domaine fixe.

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, rawRequest, uniqueIp } = require('./helpers');

configureEnv({ NODE_ENV: 'production' });
const { app } = require('../../server.js');

let srv;
let mock;
before(async () => { mock = installFetchMock(); srv = await startServer(app); });
after(async () => { await srv.close(); mock.restore(); });
beforeEach(() => {
    mock.reset();
    mock.handlers.rapid = () => jsonResponse(200, {
        data: { products: [{ product_title: 'Coffret', product_url: 'https://www.amazon.fr/dp/B0TESTOK01', product_price: '20 €' }] }
    });
});

describe('X-Cache', () => {
    test('absent en production (MISS puis HIT)', async () => {
        const ip = uniqueIp();
        for (let i = 0; i < 2; i++) {
            const r = await rawRequest(srv.port, '/api/search?term=prod-cache&max_price=50', { headers: { 'X-Forwarded-For': ip } });
            assert.equal(r.status, 200);
            assert.equal(r.headers['x-cache'], undefined);
        }
        assert.equal(mock.callsTo('rapid').length, 1, 'le cache fonctionne toujours');
    });
});

describe('redirection www', () => {
    test('Host www.offrez.net (avec port, casse mixte) → 301 vers le domaine fixe', async () => {
        const r = await rawRequest(srv.port, '/blog.html?x=1', { headers: { Host: 'WWW.Offrez.net:443' } });
        assert.equal(r.status, 301);
        assert.equal(r.headers.location, 'https://offrez.net/blog.html?x=1');
    });

    test('X-Forwarded-Host forgé (www.evil.tld) → aucune redirection', async () => {
        const r = await rawRequest(srv.port, '/blog.html', {
            headers: { 'X-Forwarded-Host': 'www.evil.tld', 'X-Forwarded-For': uniqueIp() }
        });
        assert.notEqual(r.status, 301);
        assert.ok(!String(r.headers.location || '').includes('evil.tld'));
    });

    test('Host quelconque en www.* (www.evil.tld) → pas de redirection', async () => {
        const r = await rawRequest(srv.port, '/blog.html', { headers: { Host: 'www.evil.tld' } });
        assert.notEqual(r.status, 301);
        assert.ok(!String(r.headers.location || '').includes('evil.tld'));
    });

    test('X-Forwarded-Host forgé + Host www.offrez.net → destination toujours offrez.net', async () => {
        const r = await rawRequest(srv.port, '/a', { headers: { Host: 'www.offrez.net', 'X-Forwarded-Host': 'evil.tld' } });
        assert.equal(r.status, 301);
        assert.equal(r.headers.location, 'https://offrez.net/a');
    });
});
