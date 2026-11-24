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

    // [LOT4c] Polices et Font Awesome auto-hébergés : plus aucun hôte tiers pour les styles/polices
    test('CSP : aucun hôte Google Fonts ni cdnjs, styles/polices/connexions limités à self', async () => {
        const r = await rawRequest(srv.port, '/');
        const csp = r.headers['content-security-policy'];
        for (const host of ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com']) {
            assert.ok(!csp.includes(host), `${host} absent de la CSP`);
        }
        const directive = (name) => csp.split(';').map(s => s.trim()).find(s => s.startsWith(`${name} `));
        assert.equal(directive('style-src'), "style-src 'self' 'unsafe-inline'");
        assert.equal(directive('font-src'), "font-src 'self' data:");
        assert.equal(directive('connect-src'), "connect-src 'self'");
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
        ['/js/analyse.js?v=2026112406', IMMUTABLE, /javascript/],
        ['/js/api.js?v=', 'no-cache', /javascript/],
        ['/js/api.js?v[]=x', 'no-cache', /javascript/],
        ['/js/api.js?v=%3Cscript%3E', 'no-cache', /javascript/],
        ['/style.min.css', 'no-cache', /text\/css/],
        ['/style.min.css?v=202611251800', IMMUTABLE, /text\/css/],
        ['/css/webfonts/fa-solid-900.woff2', 'public, max-age=31536000', /font\/woff2/],
        ['/css/webfonts/fa-solid-900.woff2?v=650a', 'public, max-age=31536000', /font\/woff2/],
        ['/css/fontawesome/fa-offrez.min.css', 'no-cache', /text\/css/],
        ['/fonts/outfit-latin.woff2', 'public, max-age=31536000', /font\/woff2/],
        ['/fonts/poppins.css', 'no-cache', /text\/css/],
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

    test("sw.js : CACHE_NAME = 'OFFREZ-v33' et /offline.html précachée", () => {
        assert.match(swSource, /const CACHE_NAME = 'OFFREZ-v33';/);
        assert.match(swSource, /const OFFLINE_URL = '\/offline\.html';/);
        assert.match(swSource, /PRECACHE_URLS = \[[\s\S]*OFFLINE_URL[\s\S]*?\];/);
    });

    test("sw.js : RUNTIME_CACHE = 'OFFREZ-v17-runtime' ; activate purge tout autre cache ; jeton ?v= commun", () => {
        assert.match(swSource, /const RUNTIME_CACHE = 'OFFREZ-v17-runtime';/);
        assert.match(swSource, /key !== CACHE_NAME && key !== RUNTIME_CACHE[\s\S]*?caches\.delete\(key\)/);
        const tokens = new Set([...swSource.matchAll(/\.js\?v=(\d+)/g)].map(m => m[1]));
        assert.deepEqual([...tokens], ['2026112406'], 'un seul jeton ?v= pour les modules JS précachés');
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

// [LOT4c] Polices auto-hébergées, Font Awesome réduit, versionnage cohérent
describe('Lot 4c : polices auto-hébergées et Font Awesome réduit', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const PUBLIC = path.join(__dirname, '..', '..', 'public');
    const read = (p) => fs.readFileSync(path.join(PUBLIC, p), 'utf8');
    const walk = (dir, ext) => fs.readdirSync(path.join(PUBLIC, dir), { withFileTypes: true }).flatMap(e => {
        const rel = dir ? `${dir}/${e.name}` : e.name;
        return e.isDirectory() ? walk(rel, ext) : (rel.endsWith(ext) ? [rel] : []);
    });
    const htmlPages = walk('', '.html');
    const swSource = read('sw.js');
    const precache = [...swSource.match(/PRECACHE_URLS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    const POPPINS_PAGES = ['404.html', 'cgu.html', 'mentions-legales.html', 'politique-confidentialite.html'];

    test('aucune page ne référence Google Fonts ou cdnjs', () => {
        for (const page of htmlPages) {
            assert.doesNotMatch(read(page), /fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com/, page);
        }
    });

    test('toutes les pages utilisent le même style.min.css?v=, précaché par sw.js', () => {
        const versions = new Set();
        for (const page of htmlPages) {
            for (const m of read(page).matchAll(/style\.min\.css\?v=([0-9A-Za-z._-]+)/g)) versions.add(m[1]);
        }
        assert.equal(versions.size, 1, `versions : ${[...versions]}`);
        assert.ok(precache.includes(`/style.min.css?v=${[...versions][0]}`));
    });

    test('Poppins uniquement sur les pages qui la chargeaient déjà ; Outfit préchargée sur les pages à police', () => {
        for (const page of htmlPages) {
            const head = read(page).split('</head>')[0];
            assert.equal(/fonts\/poppins\.css/.test(head), POPPINS_PAGES.includes(page), `${page} : poppins.css`);
            if (page !== 'offline.html') {
                assert.match(head, /<link rel="preload" href="(\.\.\/)?fonts\/outfit-latin\.woff2" as="font" type="font\/woff2" crossorigin>/, page);
            }
        }
    });

    test('chaque feuille de style / police référencée (pages et CSS) répond 200', async () => {
        const urls = new Set();
        const add = (ref, base) => {
            const u = new URL(ref.replace(/['"]/g, ''), `http://x/${base}`);
            urls.add(u.pathname + u.search);
        };
        for (const page of htmlPages) {
            const head = read(page).split('</head>')[0];
            for (const m of head.matchAll(/<link[^>]+href="([^"]+\.(?:css|woff2)(?:\?[^"]*)?)"/g)) add(m[1], page);
        }
        for (const css of ['css/fontawesome/fa-offrez.min.css', 'fonts/poppins.css', 'style.min.css']) {
            for (const m of read(css).matchAll(/url\(([^)]+)\)/g)) add(m[1], css);
        }
        assert.ok(urls.size >= 8, [...urls].join(' '));
        for (const u of urls) {
            const r = await rawRequest(srv.port, u);
            assert.equal(r.status, 200, `${u} → ${r.status}`);
        }
    });

    test('polices Font Awesome précachées exactement comme la feuille les demande', () => {
        const faCss = read('css/fontawesome/fa-offrez.min.css');
        const fontUrls = [...faCss.matchAll(/url\(\.\.\/webfonts\/([^)]+)\)/g)].map(m => `/css/webfonts/${m[1]}`);
        assert.deepEqual(fontUrls.sort(), ['/css/webfonts/fa-brands-400.woff2?v=650a', '/css/webfonts/fa-solid-900.woff2?v=650a']);
        for (const u of fontUrls) assert.ok(precache.includes(u), `${u} précachée`);
        assert.ok(precache.includes('/css/fontawesome/fa-offrez.min.css'));
        assert.ok(precache.includes('/fonts/outfit-latin.woff2'));
    });

    test('chaque icône fa-* utilisée (HTML et JS) existe dans la feuille Font Awesome réduite', () => {
        const faCss = read('css/fontawesome/fa-offrez.min.css');
        const defined = new Set([...faCss.matchAll(/\.(fa-[a-z0-9-]+)(?=[:,{\s])/g)].map(m => m[1]));
        const used = new Set();
        for (const f of [...htmlPages, ...walk('js', '.js')]) {
            // Noms de classe uniquement (exclut les noms de fichiers : fa-offrez.min.css, fa-solid-900.woff2…)
            for (const m of read(f).matchAll(/\bfa-[a-z0-9-]+(?![\w.-])/g)) used.add(m[0]);
        }
        const missing = [...used].filter(c => !defined.has(c));
        assert.deepEqual(missing, [], 'icône absente : régénérer fa-offrez.min.css + sous-ensemble woff2');
        assert.ok(!used.has('fa-sparkles'), 'fa-sparkles est une icône Pro');
    });

    test('fichiers Font Awesome inutiles supprimés, licence OFL des polices présente', () => {
        const webfonts = fs.readdirSync(path.join(PUBLIC, 'css', 'webfonts')).sort();
        assert.deepEqual(webfonts, ['fa-brands-400.woff2', 'fa-solid-900.woff2']);
        assert.ok(!fs.existsSync(path.join(PUBLIC, 'css', 'fontawesome', 'all.min.css')));
        assert.match(read('fonts/OFL.txt'), /SIL Open Font License/);
    });
});
