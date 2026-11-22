'use strict';
// ANALYTICS_ORIGIN valide → ajoutée à script-src et connect-src ; le reste de la CSP est inchangé.
// (Vide : CSP par défaut, vérifiée dans static.int.js.) Lu au chargement du module : fichier dédié.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, startServer } = require('./helpers');

configureEnv({ ANALYTICS_ORIGIN: 'https://plausible.io/' });
const { app } = require('../../server.js');

let srv;
before(async () => { srv = await startServer(app); });
after(async () => { await srv.close(); });

function directive(csp, name) {
    return csp.split(';').map(s => s.trim()).find(s => s.startsWith(name + ' '));
}

test('CSP : origine analytics autorisée pour script-src et connect-src uniquement', async () => {
    const res = await fetch(`${srv.base}/`);
    const csp = res.headers.get('content-security-policy') || '';
    assert.equal(directive(csp, 'script-src'), "script-src 'self' https://plausible.io");
    assert.equal(directive(csp, 'connect-src'), "connect-src 'self' https://plausible.io");
    assert.equal(directive(csp, 'default-src'), "default-src 'self'");
    assert.ok(!/unsafe-eval/.test(csp));
    assert.ok(!directive(csp, 'script-src').includes('unsafe-inline'));
});
