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

// [LOT3b] Politique Cache-Control des fichiers statiques (cohérente avec public/sw.js)
describe('en-têtes Cache-Control des fichiers statiques', () => {
    const IMMUTABLE = 'public, max-age=31536000, immutable';
    for (const [p, expected, type] of [
        ['/', 'no-cache', /text\/html/],
        ['/index.html', 'no-cache', /text\/html/],
        ['/blog/cadeau-noel-pas-cher.html', 'no-cache', /text\/html/],
        ['/offline.html', 'no-cache', /text\/html/],
        ['/sw.js', 'no-cache', /javascript/],
        ['/sw.js?v=1', 'no-cache', /javascript/],
        ['/manifest.json', 'no-cache', /application\/json/],
        ['/js/config.js', 'no-cache', /javascript/],
        ['/js/analyse.js?v=2026112201', IMMUTABLE, /javascript/],
        ['/js/api.js?v=', 'no-cache', /javascript/],
        ['/js/api.js?v[]=x', 'no-cache', /javascript/],
        ['/js/api.js?v=%3Cscript%3E', 'no-cache', /javascript/],
        ['/style.min.css', 'no-cache', /text\/css/],
        ['/style.min.css?v=202611221200', IMMUTABLE, /text\/css/],
        ['/css/webfonts/fa-solid-900.woff2', 'public, max-age=31536000', /font\/woff2/],
        ['/icon-192.png', 'public, max-age=604800', /image\/png/],
        ['/og-image.png', 'public, max-age=604800', /image\/png/],
        ['/favicon.svg', 'public, max-age=604800', /image\/svg\+xml/]
    ]) {
        test(`GET ${p} → Cache-Control: ${expected}`, async () => {
            const r = await rawRequest(srv.port, p);
            assert.equal(r.status, 200);
            assert.match(r.headers['content-type'], type);
            assert.equal(r.headers['cache-control'], expected);
            assert.ok(r.headers.etag, 'ETag conservé');
            assert.ok(r.headers['last-modified'], 'Last-Modified conservé');
        });
    }

    test('revalidation ETag : 304 sur un fichier no-cache inchangé', async () => {
        const first = await rawRequest(srv.port, '/js/config.js');
        const second = await rawRequest(srv.port, '/js/config.js', { headers: { 'If-None-Match': first.headers.etag } });
        assert.equal(second.status, 304);
    });
});

// [LOT3b] PWA : précache du service worker, manifest et <head> cohérent sur toutes les pages
describe('PWA : service worker, manifest, en-têtes des pages', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const PUBLIC = path.join(__dirname, '..', '..', 'public');
    const swSource = fs.readFileSync(path.join(PUBLIC, 'sw.js'), 'utf8');

    test("sw.js : CACHE_NAME = 'OFFREZ-v16' et /offline.html précachée", () => {
        assert.match(swSource, /const CACHE_NAME = 'OFFREZ-v16';/);
        assert.match(swSource, /const OFFLINE_URL = '\/offline\.html';/);
        assert.match(swSource, /PRECACHE_URLS = \[[\s\S]*OFFLINE_URL[\s\S]*?\];/);
    });

    test('chaque URL précachée par sw.js répond 200 (cache.addAll échoue sinon)', async () => {
        const list = swSource.match(/PRECACHE_URLS = \[([\s\S]*?)\];/)[1];
        const urls = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]).concat('/offline.html');
        assert.ok(urls.length >= 15, `liste de précache trop courte (${urls.length})`);
        for (const u of urls) {
            const r = await rawRequest(srv.port, u);
            assert.equal(r.status, 200, `${u} → ${r.status}`);
        }
    });

    test('manifest.json : JSON valide sans BOM, id/scope, 3 icônes PNG distinctes any/maskable', async () => {
        const r = await rawRequest(srv.port, '/manifest.json');
        assert.notEqual(r.text.charCodeAt(0), 0xFEFF, 'pas de BOM');
        const m = JSON.parse(r.text);
        assert.equal(m.id, '/');
        assert.equal(m.scope, '/');
        assert.equal(m.start_url, '/');
        assert.match(m.theme_color, /^#[0-9a-f]{6}$/i);
        const png = m.icons.filter(i => i.type === 'image/png');
        assert.deepEqual(png.map(i => [i.src, i.sizes, i.purpose]), [
            ['/icon-192.png', '192x192', 'any'],
            ['/icon-512.png', '512x512', 'any'],
            ['/icon-maskable-512.png', '512x512', 'maskable']
        ]);
        assert.ok(m.icons.every(i => !/any maskable/.test(i.purpose || '')), 'pas de purpose "any maskable"');
        for (const i of png) {
            const img = await rawRequest(srv.port, i.src);
            assert.equal(img.status, 200, i.src);
            assert.match(img.headers['content-type'], /image\/png/);
        }
    });

    test('icônes PNG : dimensions réelles conformes et fichiers légers', () => {
        for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
            const buf = fs.readFileSync(path.join(PUBLIC, file));
            assert.equal(buf.toString('ascii', 12, 16), 'IHDR', file);
            assert.equal(buf.readUInt32BE(16), size, `${file} largeur`);
            assert.equal(buf.readUInt32BE(20), size, `${file} hauteur`);
            assert.ok(buf.length < 30 * 1024, `${file} : ${buf.length} octets`);
        }
        const og = fs.readFileSync(path.join(PUBLIC, 'og-image.png'));
        assert.deepEqual([og.readUInt32BE(16), og.readUInt32BE(20)], [1200, 630]);
        assert.ok(og.length < 150 * 1024, `og-image.png : ${og.length} octets`);
    });

    const manifest = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.json'), 'utf8'));
    const pages = ['404.html', 'analyse.html', 'blog.html', 'cgu.html', 'config.html', 'index.html', 'mentions-legales.html',
        'offline.html', 'politique-confidentialite.html', 'profils.html',
        ...fs.readdirSync(path.join(PUBLIC, 'blog')).filter(f => f.endsWith('.html')).map(f => `blog/${f}`)];
    for (const page of pages) {
        test(`${page} : manifest, theme-color, icônes et sw-register dans <head>`, () => {
            const html = fs.readFileSync(path.join(PUBLIC, page), 'utf8');
            const head = html.slice(0, html.indexOf('</head>'));
            assert.match(head, /<link rel="manifest" href="\/manifest\.json">/);
            assert.ok(head.includes(`<meta name="theme-color" content="${manifest.theme_color}">`), 'theme-color = manifest');
            assert.match(head, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png">/);
            assert.match(head, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
            assert.match(head, /<script src="\/js\/sw-register\.js" defer><\/script>/);
            assert.equal((html.match(/sw-register\.js/g) || []).length, 1, 'sw-register.js chargé une seule fois');
        });
    }
});
