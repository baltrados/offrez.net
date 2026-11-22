'use strict';
// Cohérence SEO des pages statiques (lecture des fichiers de public/) : sitemap ↔ canonical ↔ noindex,
// un seul <h1>, balises Open Graph / Twitter, emplacement analytics, liens Amazon affiliés.
// robots.txt et sitemap.xml servis par le serveur : voir aussi static.int.js.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { configureEnv, startServer } = require('./helpers');

configureEnv();
const { app } = require('../../server.js');

const PUBLIC = path.resolve(__dirname, '../../public');
const ORIGIN = 'https://offrez.net';

function htmlPages() {
    const top = fs.readdirSync(PUBLIC).filter(f => f.endsWith('.html')).map(f => f);
    const blog = fs.readdirSync(path.join(PUBLIC, 'blog')).filter(f => f.endsWith('.html')).map(f => 'blog/' + f);
    return [...top, ...blog];
}
const read = rel => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const meta = (html, attr, name) => {
    const re = new RegExp(`<meta[^>]+${attr}=["']${name}["'][^>]*>`, 'i');
    const tag = html.match(re)?.[0];
    return tag ? tag.match(/content=["']([^"']*)["']/i)?.[1] ?? null : null;
};
const canonical = html => html.match(/<link[^>]+rel=["']canonical["'][^>]*>/i)?.[0].match(/href=["']([^"']+)["']/i)?.[1] ?? null;
const isNoindex = html => /noindex/i.test(meta(html, 'name', 'robots') || '');
const urlFor = rel => rel === 'index.html' ? `${ORIGIN}/` : `${ORIGIN}/${rel}`;

const pages = htmlPages();
const indexable = pages.filter(p => !isNoindex(read(p)));
const sitemap = fs.readFileSync(path.join(PUBLIC, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());

describe('sitemap.xml ↔ pages', () => {
    test('chaque <loc> : https://offrez.net, fichier existant, page indexable, canonical identique', () => {
        assert.ok(locs.length > 0);
        for (const loc of locs) {
            assert.ok(loc.startsWith(`${ORIGIN}/`), `${loc} absolu sans www`);
            const rel = loc === `${ORIGIN}/` ? 'index.html' : loc.slice(ORIGIN.length + 1);
            assert.ok(fs.existsSync(path.join(PUBLIC, rel)), `${rel} existe`);
            const html = read(rel);
            assert.ok(!isNoindex(html), `${rel} ne doit pas être en noindex`);
            assert.equal(canonical(html), loc, `canonical de ${rel}`);
        }
    });

    test('chaque page indexable figure dans le sitemap', () => {
        assert.deepEqual([...indexable].map(urlFor).sort(), [...locs].sort());
    });

    test('lastmod au format AAAA-MM-JJ', () => {
        const mods = [...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map(m => m[1]);
        assert.equal(mods.length, locs.length);
        for (const d of mods) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('balises des pages', () => {
    test('exactement un <h1> par page HTML', () => {
        for (const p of pages) {
            const n = (read(p).match(/<h1[\s>]/gi) || []).length;
            assert.equal(n, 1, `${p} : ${n} <h1>`);
        }
    });

    test('pages indexables : title, description, Open Graph, Twitter, canonical, analytics', () => {
        for (const p of indexable) {
            const html = read(p);
            assert.match(html, /<title>[^<]{10,}<\/title>/, `${p} title`);
            assert.ok((meta(html, 'name', 'description') || '').length >= 50, `${p} description`);
            const canon = canonical(html);
            assert.equal(canon, urlFor(p), `${p} canonical`);
            assert.equal(meta(html, 'property', 'og:url'), canon, `${p} og:url = canonical`);
            for (const k of ['og:title', 'og:description', 'og:site_name', 'og:image:alt']) {
                assert.ok(meta(html, 'property', k), `${p} ${k}`);
            }
            assert.equal(meta(html, 'property', 'og:image'), `${ORIGIN}/og-image.png`, `${p} og:image`);
            assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image', `${p} twitter:card`);
            assert.equal(meta(html, 'name', 'twitter:image'), `${ORIGIN}/og-image.png`, `${p} twitter:image`);
            assert.match(html, /<script src="\/js\/analytics\.js" defer><\/script>/, `${p} emplacement analytics`);
        }
    });

    test('pages utilitaires en noindex, sans canonical', () => {
        for (const p of ['analyse.html', 'config.html', 'profils.html', '404.html', 'offline.html']) {
            const html = read(p);
            assert.ok(isNoindex(html), `${p} noindex`);
            assert.equal(canonical(html), null, `${p} sans canonical`);
        }
        for (const p of ['cgu.html', 'mentions-legales.html', 'politique-confidentialite.html']) {
            assert.ok(isNoindex(read(p)), `${p} noindex`);
        }
    });

    test('liens Amazon écrits en dur dans le HTML : tag affilié et rel sponsored', () => {
        for (const p of pages) {
            for (const a of read(p).match(/<a\s[^>]*href=["'][^"']*amazon\.[^"']*["'][^>]*>/gi) || []) {
                assert.match(a, /tag=offreznet-21/, `${p} : ${a}`);
                assert.match(a, /rel=["'][^"']*sponsored[^"']*["']/, `${p} : ${a}`);
                assert.match(a, /target=["']_blank["']/, `${p} : ${a}`);
            }
        }
    });

    test('analytics.js : désactivé par défaut (aucune source configurée)', () => {
        const js = fs.readFileSync(path.join(PUBLIC, 'js', 'analytics.js'), 'utf8');
        assert.match(js, /ANALYTICS_SRC\s*=\s*''/);
    });
});

describe('robots.txt et sitemap.xml servis', () => {
    let srv;
    before(async () => { srv = await startServer(app); });
    after(async () => { await srv.close(); });

    test('robots.txt : sitemap déclaré, /api/ exclu, pages noindex non bloquées', async () => {
        const res = await fetch(`${srv.base}/robots.txt`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /text\/plain/);
        const txt = await res.text();
        assert.match(txt, /^Sitemap: https:\/\/offrez\.net\/sitemap\.xml$/m);
        assert.match(txt, /^Disallow: \/api\/$/m);
        assert.doesNotMatch(txt, /Disallow: \/(config|profils|analyse)\.html/);
    });

    test('sitemap.xml : 200, type XML', async () => {
        const res = await fetch(`${srv.base}/sitemap.xml`);
        assert.equal(res.status, 200);
        assert.match(res.headers.get('content-type') || '', /xml/);
        assert.match(await res.text(), /<urlset/);
    });
});
