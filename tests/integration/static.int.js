'use strict';
// Tests d'intégration du service statique : seul public/ est servi, le code et la config restent hors web.
// Les chemins sont envoyés bruts via node:http (fetch normaliserait '..' et certains encodages).

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { configureEnv, installFetchMock, startServer, rawRequest } = require('./helpers');

configureEnv();
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

describe('fichiers publics servis', () => {
    for (const [p, type] of [
        ['/', /text\/html/],
        ['/index.html', /text\/html/],
        ['/config.html', /text\/html/],
        ['/profils.html', /text\/html/],
        ['/analyse.html', /text\/html/],
        ['/blog.html', /text\/html/],
        ['/js/api.js', /javascript/],
        ['/js/security.js', /javascript/],
        ['/sw.js', /javascript/],
        ['/manifest.json', /application\/json/],
        ['/robots.txt', /text\/plain/],
        ['/style.min.css', /text\/css/],
        ['/api/health', /application\/json/]
    ]) {
        test(`GET ${p} → 200`, async () => {
            const r = await rawRequest(srv.port, p);
            assert.equal(r.status, 200);
            assert.match(r.headers['content-type'], type);
        });
    }

    test('en-têtes de sécurité présents (CSP sans unsafe-inline pour les scripts, nosniff, DENY)', async () => {
        const r = await rawRequest(srv.port, '/');
        const csp = r.headers['content-security-policy'];
        assert.ok(csp, 'CSP présente');
        const scriptSrc = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src'));
        assert.equal(scriptSrc, "script-src 'self'");
        assert.match(csp, /frame-ancestors 'none'/);
        assert.equal(r.headers['x-content-type-options'], 'nosniff');
        assert.equal(r.headers['x-frame-options'], 'DENY');
        assert.ok(r.headers['permissions-policy']);
        assert.equal(r.headers['x-powered-by'], undefined);
    });
});

describe('fichiers hors public/ et chemins malveillants → 404', () => {
    for (const p of [
        '/server.js',
        '/%73erver.js',
        '/package.json',
        '/package-lock.json',
        '/lib/analyze.js',
        '/tests/unit/analyze.unit.js',
        '/tests/integration/helpers.js',
        '/node_modules/express/index.js',
        '/node_modules/express/package.json',
        '/.env',
        '/.env.example',
        '/.git/config',
        '/.gitignore',
        '/CLAUDE.md',
        '/README.md',
        '/clicks.csv',
        '/searches.csv',
        '/admin-stats.js',
        '/test_security.js',
        '/playwright.config.js',
        '/%2e%2e/server.js',
        '/%2e%2e%2fserver.js',
        '/..%5cserver.js',
        '/..%2fpackage.json',
        '/js/%2e%2e/%2e%2e/server.js',
        '/%E0%A4%A',
        '/%00',
        '/index.html%00.js',
        '/server.js.',
        '/manifest.json/..%2f..%2fserver.js'
    ]) {
        test(`GET ${p} → 404`, async () => {
            const r = await rawRequest(srv.port, p);
            assert.equal(r.status, 404);
            assert.match(r.headers['content-type'], /text\/html/);
            assert.ok(!r.text.includes('require('), 'aucun code source renvoyé');
            assert.ok(!r.text.includes('"dependencies"'), 'aucun package.json renvoyé');
        });
    }

    test('une ressource inexistante renvoie la page 404.html', async () => {
        const r = await rawRequest(srv.port, '/nexiste-pas');
        assert.equal(r.status, 404);
        assert.match(r.text, /<html/i);
    });
});

describe('redirections', () => {
    test('/blog → 301 /blog.html', async () => {
        const r = await rawRequest(srv.port, '/blog');
        assert.equal(r.status, 301);
        assert.equal(r.headers.location, '/blog.html');
    });

    test('/blog/ → 301 /blog.html', async () => {
        const r = await rawRequest(srv.port, '/blog/');
        assert.equal(r.status, 301);
        assert.equal(r.headers.location, '/blog.html');
    });

    test('//blog → 301 vers un chemin relatif à un seul slash (pas d\'open redirect)', async () => {
        const r = await rawRequest(srv.port, '//blog');
        assert.equal(r.status, 301);
        assert.equal(r.headers.location, '/blog.html');
    });

    for (const p of ['//evil.com', '//evil.com/', '///evil.com', '/%2fevil.com', '/%5cevil.com', '/%2F%2Fevil.com/blog', '/\\evil.com']) {
        test(`${p} ne redirige pas vers un autre hôte`, async () => {
            const r = await rawRequest(srv.port, p);
            const loc = r.headers.location;
            if (r.status >= 300 && r.status < 400) {
                assert.ok(loc, 'redirection avec Location');
                assert.ok(/^\/[^/\\]/.test(loc), `Location relative à un seul slash attendue, reçu ${loc}`);
                const resolved = new URL(loc, 'http://offrez.test');
                assert.equal(resolved.host, 'offrez.test');
            } else {
                assert.equal(r.status, 404);
                assert.equal(loc, undefined);
            }
        });
    }

    test('aucun appel upstream pendant les tests statiques', () => {
        assert.equal(mock.calls.length, 0);
    });
});
