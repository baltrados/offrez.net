'use strict';
// Tests d'intégration de GET /api/search (RapidAPI mocké via globalThis.fetch).

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
    TEST_KEYS, configureEnv, installFetchMock, jsonResponse, startServer, rawRequest, uniqueIp, assertNoLeak
} = require('./helpers');

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

beforeEach(() => mock.reset());

const RAW_PRODUCTS = [
    {
        // Produit valide
        asin: 'B0TESTOK01',
        product_title: 'Coffret thé vert bio',
        product_price: '29,99 €',
        product_url: 'https://www.amazon.fr/dp/B0TESTOK01',
        product_photo: 'https://m.media-amazon.com/images/I/thé.jpg',
        product_star_rating: '4,5',
        product_num_ratings: '1 234',
        is_prime: true,
        is_best_seller: 'yes'
    },
    {
        // Image sur un hôte non autorisé (suffixe trompeur) → image null mais produit gardé
        asin: 'B0TESTOK02',
        product_title: 'Théière fonte',
        product_price: 45,
        product_url: 'https://www.amazon.fr/dp/B0TESTOK02',
        product_photo: 'https://media-amazon.com.evil.com/x.jpg',
        product_star_rating: 4,
        product_num_ratings: 12
    },
    // Liens non sûrs → produits ignorés
    { product_title: 'HTTP', product_url: 'http://www.amazon.fr/dp/B0BAD00001', product_price: '10 €' },
    { product_title: 'Evil host', product_url: 'https://amazon.fr.evil.com/dp/B0BAD00002', product_price: '10 €' },
    { product_title: 'Userinfo', product_url: 'https://amazon.fr@evil.com/dp/B0BAD00003', product_price: '10 €' },
    { product_title: 'JS', product_url: 'javascript:alert(1)', product_price: '10 €' },
    { product_title: '', product_url: 'https://www.amazon.fr/dp/B0BAD00004' },
    null,
    'not-an-object',
    {
        // Note non conforme (injection) → rating null ; asin invalide → null
        asin: 'bad"asin',
        product_title: 'Note piégée',
        product_price: '19,90 €',
        product_url: 'https://www.amazon.fr/dp/B0TESTOK03',
        product_photo: 'javascript:alert(1)',
        product_star_rating: '4.5<img src=x onerror=alert(1)>',
        product_num_ratings: '12abc'
    }
];

function rapidOk(products = RAW_PRODUCTS) {
    return jsonResponse(200, { status: 'OK', request_id: 'req-123', data: { total_products: 999, products } });
}

async function search(query, { ip = uniqueIp() } = {}) {
    const res = await fetch(`${srv.base}/api/search?${query}`, { headers: { 'X-Forwarded-For': ip } });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = undefined; }
    return { status: res.status, text, json };
}

describe('GET /api/search — succès et normalisation', () => {
    test('produits normalisés : liens/hôtes douteux écartés, image stricte, note typée', async () => {
        mock.handlers.rapid = () => rapidOk();
        const r = await search('term=coffret+th%C3%A9&min_price=10&max_price=50');
        assert.equal(r.status, 200);
        assert.deepEqual(Object.keys(r.json), ['search_results']);
        const results = r.json.search_results;
        assert.deepEqual(results.map(p => p.title), ['Coffret thé vert bio', 'Théière fonte', 'Note piégée']);

        const [p1, p2, p3] = results;
        assert.deepEqual(p1, {
            title: 'Coffret thé vert bio',
            link: 'https://www.amazon.fr/dp/B0TESTOK01',
            image: 'https://m.media-amazon.com/images/I/th%C3%A9.jpg',
            price: { value: 29.99, raw: '29,99 €', currency: 'EUR' },
            rating: 4.5,
            reviews: 1234,
            asin: 'B0TESTOK01',
            is_prime: true,
            is_best_seller: false
        });
        assert.equal(p2.image, null, 'hôte image non autorisé → null');
        assert.equal(p2.price.value, 45);
        assert.equal(p2.rating, 4);
        assert.equal(p3.rating, null, 'note avec HTML → null');
        assert.equal(p3.reviews, null);
        assert.equal(p3.asin, null);
        assert.equal(p3.image, null);
        assert.ok(!r.text.includes('<img'));
        assert.ok(!r.text.includes('evil.com'));
        assert.ok(!r.text.includes('request_id'));
        assertNoLeak(assert, r.text);
    });

    test('URL upstream construite avec URLSearchParams (aucun paramètre injecté)', async () => {
        mock.handlers.rapid = () => rapidOk();
        const term = 'montre&page=9&country=US';
        const r = await search(`term=${encodeURIComponent(term)}&min_price=2&max_price=9999`);
        assert.equal(r.status, 200);
        const calls = mock.callsTo('rapid');
        assert.equal(calls.length, 1);
        const call = calls[0];
        const sp = call.parsedUrl.searchParams;
        assert.equal(call.parsedUrl.origin + call.parsedUrl.pathname, 'https://real-time-amazon-data.p.rapidapi.com/search');
        assert.equal(sp.get('query'), term);
        assert.deepEqual(sp.getAll('page'), ['1']);
        assert.deepEqual(sp.getAll('country'), ['FR']);
        assert.equal(sp.get('sort_by'), 'RELEVANCE');
        assert.equal(sp.get('min_price'), '4', 'plancher 4€');
        assert.equal(sp.get('max_price'), '5000', 'plafond 5000€');
        assert.deepEqual([...sp.keys()].sort(), [
            'country', 'deals_and_discounts', 'is_prime', 'max_price', 'min_price', 'page', 'product_condition', 'query', 'sort_by'
        ]);
        assert.equal(call.headers['x-rapidapi-key'], TEST_KEYS.RAPIDAPI_KEY);
        assert.equal(call.headers['x-rapidapi-host'], 'real-time-amazon-data.p.rapidapi.com');
        assert.ok(!call.url.includes(TEST_KEYS.RAPIDAPI_KEY), 'clé absente de l\'URL');
    });

    test('sans prix : min_price/max_price absents de la requête upstream', async () => {
        mock.handlers.rapid = () => rapidOk();
        const r = await search('term=sans-prix-unique');
        assert.equal(r.status, 200);
        const sp = mock.callsTo('rapid')[0].parsedUrl.searchParams;
        assert.equal(sp.has('min_price'), false);
        assert.equal(sp.has('max_price'), false);
    });

    test('deuxième appel identique servi par le cache (1 seul appel upstream)', async () => {
        mock.handlers.rapid = () => rapidOk();
        const q = 'term=cache-test-unique&min_price=10&max_price=60';
        const r1 = await search(q);
        const r2 = await search(q);
        // Clé de cache normalisée (casse / espaces)
        const r3 = await search('term=%20CACHE-TEST-unique%20&min_price=10&max_price=60');
        assert.equal(r1.status, 200);
        assert.equal(r2.status, 200);
        assert.equal(r3.status, 200);
        assert.deepEqual(r2.json, r1.json);
        assert.deepEqual(r3.json, r1.json);
        assert.equal(mock.callsTo('rapid').length, 1);
    });

    test('résultat vide non mis en cache (2 appels upstream)', async () => {
        mock.handlers.rapid = () => rapidOk([]);
        const q = 'term=vide-test-unique&max_price=40';
        const r1 = await search(q);
        const r2 = await search(q);
        assert.equal(r1.status, 200);
        assert.deepEqual(r1.json, { search_results: [] });
        assert.deepEqual(r2.json, { search_results: [] });
        assert.equal(mock.callsTo('rapid').length, 2);
    });

    test('réponse sans data.products → liste vide', async () => {
        mock.handlers.rapid = () => jsonResponse(200, { status: 'OK', data: { products: 'nope' } });
        const r = await search('term=structure-bizarre');
        assert.equal(r.status, 200);
        assert.deepEqual(r.json, { search_results: [] });
    });
});

describe('GET /api/search — validation des entrées', () => {
    for (const [label, query] of [
        ['max_price avec paramètre encodé injecté', 'term=montre&max_price=100%26page%3D9'],
        ['min_price décimal', 'term=montre&min_price=10.5'],
        ['min_price négatif', 'term=montre&min_price=-1'],
        ['max_price tableau', 'term=montre&max_price=10&max_price=20'],
        ['term tableau', 'term=montre&term=livre'],
        ['term trop court', 'term=a'],
        ['term absent', 'min_price=10'],
        ['term trop long', `term=${'a'.repeat(101)}`],
        ['term objet (qs étendu)', 'term[a]=montre']
    ]) {
        test(`${label} → 400, aucun appel upstream`, async () => {
            const r = await search(query);
            assert.equal(r.status, 400);
            assert.equal(typeof r.json.error, 'string');
            assert.equal(mock.calls.length, 0);
        });
    }

    test('clé RapidAPI absente → 500 générique', async () => {
        const saved = process.env.RAPIDAPI_KEY;
        process.env.RAPIDAPI_KEY = '';
        try {
            const r = await search('term=sans-cle-unique');
            assert.equal(r.status, 500);
            assert.ok(!/RAPIDAPI_KEY/.test(r.text));
            assert.equal(mock.calls.length, 0);
        } finally {
            process.env.RAPIDAPI_KEY = saved;
        }
    });
});

describe('GET /api/search — erreurs upstream', () => {
    test('RapidAPI 403 → 502 générique', async () => {
        mock.handlers.rapid = () => jsonResponse(403, {
            message: `You are not subscribed to this API. key=${TEST_KEYS.RAPIDAPI_KEY}`
        });
        const r = await search('term=erreur-403-unique');
        assert.equal(r.status, 502);
        assert.equal(r.json.error, 'Service momentanément indisponible. Réessayez plus tard.');
        assert.ok(!/subscribed/.test(r.text));
        assertNoLeak(assert, r.text);
    });

    test('RapidAPI 429 → 429 générique', async () => {
        mock.handlers.rapid = () => jsonResponse(429, { message: 'Too many requests' });
        const r = await search('term=erreur-429-unique');
        assert.equal(r.status, 429);
        assertNoLeak(assert, r.text);
    });

    test('RapidAPI non JSON → 502', async () => {
        mock.handlers.rapid = () => new Response('<html>oops</html>', { status: 200 });
        const r = await search('term=non-json-unique');
        assert.equal(r.status, 502);
        assertNoLeak(assert, r.text);
    });

    test('RapidAPI timeout → 504', async () => {
        mock.handlers.rapid = () => Promise.reject(new DOMException('aborted', 'AbortError'));
        const r = await search('term=timeout-unique');
        assert.equal(r.status, 504);
        assertNoLeak(assert, r.text);
    });

    test('une erreur upstream n\'est pas mise en cache', async () => {
        mock.handlers.rapid = () => jsonResponse(500, {});
        const q = 'term=erreur-puis-ok-unique';
        assert.equal((await search(q)).status, 502);
        mock.handlers.rapid = () => rapidOk();
        const r = await search(q);
        assert.equal(r.status, 200);
        assert.equal(r.json.search_results.length, 3);
        assert.equal(mock.callsTo('rapid').length, 2);
    });
});

describe('GET /api/search — hygiène', () => {
    test('le paramètre consent (ancien client) est ignoré sans erreur', async () => {
        mock.handlers.rapid = () => rapidOk();
        for (const value of ['true', 'false', 'n-importe-quoi']) {
            const r = await search(`term=consent-ignore-unique-${value}&consent=${value}`);
            assert.equal(r.status, 200, `consent=${value}`);
            assert.equal(r.json.search_results.length, 3);
        }
    });

    test('la clé n\'apparaît jamais dans /api/health', async () => {
        const r = await rawRequest(srv.port, '/api/health');
        assert.equal(r.status, 200);
        assertNoLeak(assert, r.text);
    });
});
