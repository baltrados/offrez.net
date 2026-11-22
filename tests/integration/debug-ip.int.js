'use strict';
// Route de diagnostic /api/debug-ip (temporaire), active avec DEBUG_IP=1 : ce que le serveur voit comme IP
// derrière le proxy (TRUST_PROXY) et le décompte de quota de la clé de l'appelant. Fichier dédié (env au chargement).

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, jsonResponse, startServer, assertNoLeak } = require('./helpers');

configureEnv({ NODE_ENV: 'production', TRUST_PROXY: '1', DEBUG_IP: '1', GEMINI_DAILY_LIMIT_PER_IP: '2' });
const { app } = require('../../server.js');

let srv;
let mock;
before(async () => { mock = installFetchMock(); srv = await startServer(app); });
after(async () => { await srv.close(); mock.restore(); });
beforeEach(() => {
    mock.reset();
    mock.handlers.gemini = () => jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: '{"suggestions":[{"term":"coffret thé","reason":"r"}]}' }] }, finishReason: 'STOP' }]
    });
});

async function debugIp(headers) {
    const res = await fetch(`${srv.base}/api/debug-ip`, { headers });
    const text = await res.text();
    return { status: res.status, cacheControl: res.headers.get('cache-control'), text, body: JSON.parse(text) };
}

describe('/api/debug-ip (DEBUG_IP=1)', () => {
    test('affiche la chaîne X-Forwarded-For, l\'IP retenue (dernière entrée avec TRUST_PROXY=1) et les en-têtes proxy', async () => {
        const r = await debugIp({
            'X-Forwarded-For': '198.51.100.7, 203.0.113.77',
            'CF-Connecting-IP': '198.51.100.7',
            'True-Client-IP': '198.51.100.7'
        });
        assert.equal(r.status, 200);
        assert.equal(r.cacheControl, 'no-store');
        assert.equal(r.body.trustProxy, 1);
        assert.deepEqual(r.body.xForwardedFor, ['198.51.100.7', '203.0.113.77']);
        assert.equal(r.body.reqIp, '203.0.113.77');
        assert.equal(r.body.cfConnectingIp, '198.51.100.7');
        assert.equal(r.body.trueClientIp, '198.51.100.7');
        assert.equal(r.body.xRealIp, null);
        assert.match(r.body.quotaKey, /^[0-9a-f]{16}$/, 'clé hachée, jamais l\'IP en clair');
        assert.equal(typeof r.body.uptimeSeconds, 'number');
        assertNoLeak(assert, r.text);
        assert.equal(mock.calls.length, 0);
    });

    test('décompte Gemini de la clé de l\'appelant : 0, puis 1 après un appel réel ; autre IP non concernée', async () => {
        const ip = '203.0.113.88';
        const before = await debugIp({ 'X-Forwarded-For': ip });
        assert.deepEqual(before.body.gemini, { usedToday: 0, limitPerIp: 2 });
        const res = await fetch(`${srv.base}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
            body: JSON.stringify({ contexte: 'Noël', profile: { budget: 30, tags: ['Sport'] } })
        });
        assert.equal(res.status, 200);
        const afterCall = await debugIp({ 'X-Forwarded-For': `1.1.1.1, ${ip}` });
        assert.equal(afterCall.body.quotaKey, before.body.quotaKey, 'entrée forgée en tête : même clé');
        assert.equal(afterCall.body.gemini.usedToday, 1);
        const other = await debugIp({ 'X-Forwarded-For': '203.0.113.99' });
        assert.notEqual(other.body.quotaKey, before.body.quotaKey);
        assert.equal(other.body.gemini.usedToday, 0);
    });

    test('valeurs d\'en-tête bornées (512 caractères)', async () => {
        const r = await debugIp({ 'X-Forwarded-For': '203.0.113.5', 'X-Real-IP': 'a'.repeat(2000) });
        assert.equal(r.body.xRealIp.length, 512);
    });
});
