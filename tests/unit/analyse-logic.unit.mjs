// Tests unitaires de la logique pure de l'analyse (public/js/analyse/*.js).
// Ces modules ESM navigateur importent d'autres modules (avec ?v=) : on ne peut pas les charger en data: URL
// comme security.js. Un hook de chargement force le format ESM pour les fichiers de public/js/
// (package sans "type": "module", Node 20 ne détecte pas la syntaxe ESM).
// Lancement : node --test tests/unit/analyse-logic.unit.mjs

import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

const HOOKS = `
export async function load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\\/public\\/js\\/[^?#]*\\.js(?:[?#]|$)/.test(url)) {
        return nextLoad(url, { ...context, format: 'module' });
    }
    return nextLoad(url, context);
}`;
register('data:text/javascript,' + encodeURIComponent(HOOKS));

// --- Stubs minimaux des stockages navigateur (installés avant tout import) ---
class MemoryStorage {
    constructor() { this.map = new Map(); }
    getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
    setItem(k, v) { this.map.set(k, String(v)); }
    removeItem(k) { this.map.delete(k); }
    clear() { this.map.clear(); }
}
globalThis.localStorage = new MemoryStorage();
globalThis.sessionStorage = new MemoryStorage();

const JS = new URL('../../public/js/', import.meta.url);
// Mêmes URL (avec ?v=) que celles importées par analyse.js : une seule instance par module.
const products = await import(new URL('analyse/products.js?v=2026112406', JS).href);
const cart = await import(new URL('analyse/cart.js?v=2026112406', JS).href);
const session = await import(new URL('analyse/session-data.js?v=2026112406', JS).href);
const settings = await import(new URL('analyse/settings.js?v=2026112406', JS).href);

const {
    normalizeProfile, buildAnalyzePayload, computeSearchPriceRange, bucketMaxPrice, buildSearchIdea, usableSuggestions,
    FILTER_LEVELS, filterProducts, selectValidProducts, parseRating, parseReviewCount,
    computeBudgetScore, scoreProduct, rankProducts, pickBestProduct,
    areTitlesSimilar, dedupeProducts
} = products;

/** Produit Amazon minimal valide. */
const item = (over = {}) => ({ title: 'Produit test', price: { value: 30 }, rating: 4.5, reviews: 100, ...over });

// ============================================================================
// Import sans effet de bord DOM
// ============================================================================
test('les modules purs se chargent sans document/window', () => {
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(typeof products.selectValidProducts, 'function');
    assert.equal(settings.AFFILIATE_TAG, 'offreznet04-21');
});

// ============================================================================
// Profil et payload /api/analyze
// ============================================================================
describe('normalizeProfile', () => {
    test('budget invalide, nul, négatif ou absent → null (profil ignoré)', () => {
        for (const budget of [undefined, null, '', 'abc', 0, -5, NaN, Infinity]) {
            assert.equal(normalizeProfile({ nom: 'A', budget }), null, `budget=${budget}`);
        }
        assert.equal(normalizeProfile(null), null);
    });
    test('valeurs par défaut et budget numérique', () => {
        assert.deepEqual(normalizeProfile({ budget: '49.5' }), {
            nom: 'Anonyme', sexe: 'Non précisé', age: null, budget: 49.5, tags: [], details: {}
        });
    });
    test('champs conservés ; tags non tableau ignorés ; age 0 conservé (??)', () => {
        const p = normalizeProfile({ nom: 'Paul', sexe: 'Homme', age: 0, budget: 50, tags: 'Sport', details: { adore: 'x' } });
        assert.deepEqual(p, { nom: 'Paul', sexe: 'Homme', age: 0, budget: 50, tags: [], details: { adore: 'x' } });
    });
});

describe('buildAnalyzePayload', () => {
    test('contrat structuré, aucun prompt, adore/eviter par défaut à ""', () => {
        const personne = normalizeProfile({ nom: 'Paul', sexe: 'Homme', age: null, budget: 49.5, tags: ['Sport'] });
        const payload = buildAnalyzePayload('Fête des Pères', personne);
        assert.deepEqual(payload, {
            contexte: 'Fête des Pères',
            profile: { sexe: 'Homme', age: null, budget: 49.5, tags: ['Sport'], adore: '', eviter: '' }
        });
        assert.equal('prompt' in payload, false);
    });
    test("le prénom n'est jamais envoyé à /api/analyze", () => {
        const personne = normalizeProfile({ nom: 'Zéphyrine', budget: 30 });
        assert.equal(personne.nom, 'Zéphyrine', "le prénom reste disponible pour l'affichage local");
        const payload = buildAnalyzePayload('Noël', personne);
        assert.ok(!('nom' in payload.profile));
        assert.ok(!JSON.stringify(payload).includes('Zéphyrine'));
    });
    test('adore / eviter repris des détails', () => {
        const personne = normalizeProfile({ budget: 20, details: { adore: 'thé', eviter: 'café' } });
        assert.equal(buildAnalyzePayload('Noël', personne).profile.adore, 'thé');
        assert.equal(buildAnalyzePayload('Noël', personne).profile.eviter, 'café');
    });
});

describe('décision de nouvelle tentative IA', () => {
    test('pas de relance après 400, 429 ou 503', () => {
        for (const status of [400, 429, 503]) {
            assert.equal(settings.shouldRetryGemini(Object.assign(new Error('x'), { status })), false, String(status));
        }
    });
    test('relance pour une erreur réseau / timeout (sans statut) et les autres 5xx', () => {
        assert.equal(settings.shouldRetryGemini(new Error('Failed to fetch')), true);
        assert.equal(settings.shouldRetryGemini(undefined), true);
        for (const status of [500, 502, 504]) {
            assert.equal(settings.shouldRetryGemini(Object.assign(new Error('x'), { status })), true, String(status));
        }
    });
});

describe('limite atteinte (429 / 503)', () => {
    test('isLimitReachedError : 429 et 503 uniquement', () => {
        for (const status of [429, 503]) {
            assert.equal(settings.isLimitReachedError(Object.assign(new Error('x'), { status })), true, String(status));
        }
        for (const status of [400, 500, 502, 504]) {
            assert.equal(settings.isLimitReachedError(Object.assign(new Error('x'), { status })), false, String(status));
        }
        assert.equal(settings.isLimitReachedError(new Error('Failed to fetch')), false);
        assert.equal(settings.isLimitReachedError(undefined), false);
    });
});

describe('fourchette de prix (paliers)', () => {
    test('max = plus grand palier ≤ budget, min = 20 % du palier', () => {
        assert.deepEqual(computeSearchPriceRange(49.5), { maxPrice: 45, minPrice: 9 });
        assert.deepEqual(computeSearchPriceRange(100), { maxPrice: 100, minPrice: 20 });
        assert.deepEqual(computeSearchPriceRange(30), { maxPrice: 30, minPrice: 6 });
    });
    test('des budgets voisins partagent la même fourchette (clé de cache serveur commune)', () => {
        assert.deepEqual(computeSearchPriceRange(47), computeSearchPriceRange(49));
        assert.deepEqual(computeSearchPriceRange(110), computeSearchPriceRange(119.9));
    });
    test('jamais au-dessus du budget', () => {
        for (const b of [5, 9.9, 10, 11, 44.99, 45, 199, 4999, 6000, 123456]) {
            assert.ok(bucketMaxPrice(b) <= b, `budget ${b}`);
        }
        assert.equal(bucketMaxPrice(6000), 5000);
    });
    test('sous le premier palier : entier inférieur du budget', () => {
        assert.deepEqual(computeSearchPriceRange(9.9), { maxPrice: 9, minPrice: 1 });
        assert.deepEqual(computeSearchPriceRange(4), { maxPrice: 4, minPrice: 0 });
    });
    test('budgets dégénérés : 0', () => {
        assert.equal(bucketMaxPrice(0), 0);
        assert.equal(bucketMaxPrice(-5), 0);
        assert.equal(bucketMaxPrice(Number.NaN), 0);
        assert.equal(computeSearchPriceRange(1).minPrice, 0);
        assert.equal(computeSearchPriceRange(0).minPrice, 0);
    });
});

describe('idées en lien de recherche', () => {
    test('buildSearchIdea : terme nettoyé, sans prix ni ASIN', () => {
        assert.deepEqual(buildSearchIdea({ term: '  gourde isotherme ', reason: 'Pratique' }),
            { kind: 'search', term: 'gourde isotherme', searchTerm: 'gourde isotherme', title: 'gourde isotherme', reason: 'Pratique' });
        assert.equal(buildSearchIdea({ term: 'x y' }).reason, '');
    });
    test('usableSuggestions : terme texte ≥ 2 caractères, doublons (casse) retirés', () => {
        const list = [{ term: 'Montre' }, { term: 'montre ' }, { term: 'a' }, { term: 42 }, null, { term: 'Gourde' }];
        assert.deepEqual(usableSuggestions(list).map(s => s.term), ['Montre', 'Gourde']);
        assert.deepEqual(usableSuggestions(undefined), []);
    });
    test("une idée en lien n'entre pas dans le panier groupé (pas d'ASIN)", () => {
        const idea = buildSearchIdea({ term: 'gourde' });
        const pr = [{ personne: { nom: 'A' }, products: [idea], currentIndex: 0 }];
        assert.deepEqual(cart.getSelectedProducts(pr), []);
    });
});

// ============================================================================
// Filtrage à 3 niveaux
// ============================================================================
describe('parseRating / parseReviewCount (formats Amazon tolérés)', () => {
    test('note : virgule décimale, absente, illisible', () => {
        assert.equal(parseRating({ rating: '4,5' }), 4.5);
        assert.equal(parseRating({ rating: 3.5 }), 3.5);
        assert.equal(parseRating({}), 0);
        assert.equal(parseRating({ rating: 'n/a' }), 0);
    });
    test('avis : séparateurs de milliers, reviews_count, absents', () => {
        assert.equal(parseReviewCount({ reviews: '1 200' }), 1200);
        assert.equal(parseReviewCount({ reviews: '1,200' }), 1200);
        assert.equal(parseReviewCount({ reviews_count: 7 }), 7);
        assert.equal(parseReviewCount({}), 0);
        assert.equal(parseReviewCount({ reviews: 'aucun' }), 0);
    });
});

describe('filterProducts : niveau strict (note ≥ 3.5 ET avis ≥ 5)', () => {
    const strict = (it, max = 50) => filterProducts([it], max, FILTER_LEVELS.STRICT).length === 1;
    test('valeurs limites incluses : 3.5 et 5 avis', () => {
        assert.equal(strict(item({ rating: 3.5, reviews: 5 })), true);
        assert.equal(strict(item({ rating: '3,5', reviews: '5' })), true);
    });
    test('juste sous les seuils → exclu', () => {
        assert.equal(strict(item({ rating: 3.49, reviews: 100 })), false);
        assert.equal(strict(item({ rating: 5, reviews: 4 })), false);
    });
    test('prix : > 1 € et ≤ budget max, numérique', () => {
        assert.equal(strict(item({ price: { value: 50 } })), true);
        assert.equal(strict(item({ price: { value: 50.01 } })), false);
        assert.equal(strict(item({ price: { value: 1 } })), false);
        assert.equal(strict(item({ price: { value: 1.01 } })), true);
        assert.equal(strict(item({ price: { value: '29.9' } })), true);
        assert.equal(strict(item({ price: { value: 'gratuit' } })), false);
        assert.equal(strict(item({ price: null })), false);
    });
    test('titre obligatoire', () => {
        assert.equal(strict(item({ title: '' })), false);
        assert.equal(strict(item({ title: undefined })), false);
    });
});

describe('filterProducts : niveaux intermédiaire (≥ 3.0, ≥ 1 avis) et souple (prix + titre)', () => {
    test('intermédiaire : limites 3.0 / 1 avis', () => {
        const f = (it) => filterProducts([it], 50, FILTER_LEVELS.INTERMEDIATE).length;
        assert.equal(f(item({ rating: 3.0, reviews: 1 })), 1);
        assert.equal(f(item({ rating: 2.99, reviews: 1 })), 0);
        assert.equal(f(item({ rating: 3.0, reviews: 0 })), 0);
    });
    test('souple : ignore note et avis', () => {
        assert.equal(filterProducts([item({ rating: undefined, reviews: undefined })], 50, FILTER_LEVELS.SOFT).length, 1);
        assert.equal(filterProducts([item({ price: { value: 60 } })], 50, FILTER_LEVELS.SOFT).length, 0);
    });
    test('élément null/indéfini ignoré sans exception', () => {
        assert.deepEqual(filterProducts([null, undefined, item()], 50, FILTER_LEVELS.STRICT).length, 1);
    });
});

describe('selectValidProducts : cascade strict → intermédiaire → souple', () => {
    const good = item({ title: 'A', rating: 4.8, reviews: 500 });
    const mid = item({ title: 'B', rating: 3.2, reviews: 2 });
    const weak = item({ title: 'C', rating: 1, reviews: 0 });
    const tooExpensive = item({ title: 'D', price: { value: 99 } });

    test('des produits stricts existent → seuls ceux-ci sont gardés', () => {
        assert.deepEqual(selectValidProducts([mid, good, weak], 50), { products: [good], level: 'strict' });
    });
    test('aucun strict → niveau intermédiaire', () => {
        assert.deepEqual(selectValidProducts([weak, mid], 50), { products: [mid], level: 'intermediate' });
    });
    test('aucun intermédiaire → niveau souple', () => {
        assert.deepEqual(selectValidProducts([weak, tooExpensive], 50), { products: [weak], level: 'soft' });
    });
    test('rien ne passe → liste vide, level null', () => {
        assert.deepEqual(selectValidProducts([tooExpensive], 50), { products: [], level: null });
        assert.deepEqual(selectValidProducts([], 50), { products: [], level: null });
    });
    test('ordre d\'origine préservé', () => {
        const a = item({ title: 'X1' }); const b = item({ title: 'X2' });
        assert.deepEqual(selectValidProducts([a, b], 50).products, [a, b]);
    });
});

// ============================================================================
// Scoring
// ============================================================================
describe('computeBudgetScore', () => {
    test('zones et bornes', () => {
        assert.equal(computeBudgetScore(0.60), 1);
        assert.equal(computeBudgetScore(0.75), 1);
        assert.equal(computeBudgetScore(0.90), 1);
        assert.equal(computeBudgetScore(0.95), 0.9);
        assert.equal(computeBudgetScore(1.0), 0.9);
        assert.ok(Math.abs(computeBudgetScore(0.40) - 0.6) < 1e-12);
        assert.ok(Math.abs(computeBudgetScore(0.50) - 0.8) < 1e-12);
        assert.ok(Math.abs(computeBudgetScore(0.20) - 0.3) < 1e-12);
        assert.ok(Math.abs(computeBudgetScore(0.30) - 0.45) < 1e-12);
        assert.ok(Math.abs(computeBudgetScore(0.10) - 0.15) < 1e-12);
    });
    test('trop cher, nul ou invalide → 0', () => {
        assert.equal(computeBudgetScore(1.01), 0);
        assert.equal(computeBudgetScore(0), 0);
        assert.equal(computeBudgetScore(NaN), 0);
    });
});

describe('scoreProduct / rankProducts', () => {
    test('formule pondérée exacte (budget 35 %, note 35 %, popularité 20 %, position 10 %, Prime +0.1)', () => {
        const { score, budgetRatio } = scoreProduct({ price: { value: 35 }, rating: 4, reviews: 999, is_prime: true }, 1, 50);
        assert.equal(budgetRatio, 0.7);
        const expected = 1 * 0.35 + (4 / 5) * 0.35 + 1 * 0.20 + (1 / 2) * 0.10 + 0.1;
        assert.ok(Math.abs(score - expected) < 1e-12, `${score} ≠ ${expected}`);
    });
    test('note absente ou non numérique ("4,5") → 3 dans le scoring (prudent)', () => {
        const a = scoreProduct({ price: { value: 30 }, rating: undefined, reviews: 0 }, 0, 50).score;
        const b = scoreProduct({ price: { value: 30 }, rating: '4,5', reviews: 0 }, 0, 50).score;
        const c = scoreProduct({ price: { value: 30 }, rating: 3, reviews: 0 }, 0, 50).score;
        assert.equal(a, c);
        assert.equal(b, c);
        // Un produit sans note ne passe pas devant un produit noté 4/5 à conditions égales
        assert.ok(scoreProduct({ price: { value: 30 }, rating: 4, reviews: 0 }, 0, 50).score > a);
    });
    test('bonus « Meilleure vente » : +0.05 seulement si is_best_seller === true', () => {
        const base = { price: { value: 30 }, rating: 4, reviews: 10 };
        const a = scoreProduct(base, 0, 50).score;
        assert.ok(Math.abs(scoreProduct({ ...base, is_best_seller: true }, 0, 50).score - a - 0.05) < 1e-12);
        assert.equal(scoreProduct({ ...base, is_best_seller: 'true' }, 0, 50).score, a);
    });
    test('tri décroissant, annotation searchTerm/reason, objets d\'origine non modifiés', () => {
        const cheap = item({ title: 'cheap', price: { value: 5 }, rating: 3.5, reviews: 5 });
        const ideal = item({ title: 'ideal', price: { value: 35 }, rating: 4.8, reviews: 2000, is_prime: true });
        const ranked = rankProducts([cheap, ideal], 50, { term: 'montre', reason: 'sport' });
        assert.deepEqual(ranked.map(p => p.title), ['ideal', 'cheap']);
        assert.equal(ranked[0].searchTerm, 'montre');
        assert.equal(ranked[0].reason, 'sport');
        assert.ok(ranked[0].score > ranked[1].score);
        assert.equal('score' in ideal, false);
    });
    test('à score égal, l\'ordre Amazon (position) départage', () => {
        const ranked = rankProducts([item({ title: 'p1' }), item({ title: 'p2' })], 50, { term: 't' });
        assert.deepEqual(ranked.map(p => p.title), ['p1', 'p2']);
    });
    test('pickBestProduct : filtre puis meilleur score, null si rien', () => {
        const results = [item({ title: 'faible', rating: 3.6, reviews: 6, price: { value: 10 } }), item({ title: 'top', rating: 4.9, reviews: 900, price: { value: 40 } })];
        assert.equal(pickBestProduct(results, 50, { term: 't', reason: 'r' }).title, 'top');
        assert.equal(pickBestProduct([item({ price: { value: 80 } })], 50, { term: 't' }), null);
    });
});

// ============================================================================
// Déduplication
// ============================================================================
describe('areTitlesSimilar', () => {
    test('mots communs > 70 % (mots de plus de 2 lettres, insensible à la casse)', () => {
        assert.equal(areTitlesSimilar('Montre Sport Connectée Noire', 'montre sport connectée noire'), true);
        // 3 mots communs sur 4 = 75 % > 70 %
        assert.equal(areTitlesSimilar('montre sport connectée noire', 'montre sport connectée blanche'), true);
        // 2 sur 3 = 66 % → non
        assert.equal(areTitlesSimilar('montre sport noire', 'montre sport blanche'), false);
    });
    test('mots courts ignorés ; titres vides → non similaires', () => {
        assert.equal(areTitlesSimilar('a de la', 'a de la'), false);
        assert.equal(areTitlesSimilar('', 'montre'), false);
        assert.equal(areTitlesSimilar(undefined, 'montre'), false);
    });
});

describe('dedupeProducts', () => {
    const p = (title, searchTerm) => ({ title, searchTerm });
    test('1re passe : un produit par terme ; titres similaires écartés', () => {
        const a = p('Montre sport connectée noire', 't1');
        const b = p('Montre sport connectée noire édition', 't2'); // similaire à a (4/5 = 80 %)
        const c = p('Gourde isotherme inox', 't3');
        assert.deepEqual(dedupeProducts([a, b, c]), [a, c]);
    });
    test('2e passe : complète avec des produits distincts du même terme', () => {
        const a = p('Montre sport connectée', 't1');
        const b = p('Gourde isotherme inox', 't1');
        assert.deepEqual(dedupeProducts([a, b]), [a, b]);
    });
    test('au plus 5 produits', () => {
        const list = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'].map((w, i) => p(`${w} produit${i}`, `t${i}`));
        // 1re passe sans limite (un par terme), comme l'original ; la limite de 5 s'applique au complément
        assert.equal(dedupeProducts(list).length, 7);
        const sameTerm = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'].map((w, i) => p(`${w} article${i}`, 't'));
        assert.equal(dedupeProducts(sameTerm).length, 5);
    });
});

// ============================================================================
// Panier Amazon
// ============================================================================
describe('panier', () => {
    test('extractASIN : /dp/ et /gp/product/, insensible à la casse, ASIN rendu en majuscules', () => {
        assert.equal(cart.extractASIN('https://www.amazon.fr/dp/B0TESTE2E1?tag=x'), 'B0TESTE2E1');
        assert.equal(cart.extractASIN('https://www.amazon.fr/Titre/dp/b0abcdefgh/ref=sr'), 'B0ABCDEFGH');
        assert.equal(cart.extractASIN('https://www.amazon.fr/gp/product/B012345678'), 'B012345678');
    });
    test('extractASIN : absent, trop court, non chaîne → null', () => {
        assert.equal(cart.extractASIN('https://www.amazon.fr/s?k=montre'), null);
        assert.equal(cart.extractASIN('https://www.amazon.fr/dp/B0123'), null);
        assert.equal(cart.extractASIN(''), null);
        assert.equal(cart.extractASIN(null), null);
        assert.equal(cart.extractASIN(42), null);
    });
    test('getSelectedProducts : produit courant de chaque personne, sans ASIN exclus', () => {
        const prs = [
            { personne: { nom: 'Paul' }, currentIndex: 1, products: [{ link: 'https://www.amazon.fr/dp/AAAAAAAAAA' }, { link: 'https://www.amazon.fr/dp/BBBBBBBBBB', price: { value: 10 } }] },
            { personne: { nom: 'Léa' }, currentIndex: 0, products: [{ link: 'https://www.amazon.fr/s?k=x' }] }
        ];
        const selected = cart.getSelectedProducts(prs);
        assert.equal(selected.length, 1);
        assert.equal(selected[0].personne, 'Paul');
        assert.equal(selected[0].asin, 'BBBBBBBBBB');
        assert.equal(cart.computeCartTotal(selected), 10);
    });
    test('computeCartTotal : prix illisibles comptés 0', () => {
        assert.equal(cart.computeCartTotal([{ product: { price: { value: '19.5' } } }, { product: {} }, { product: { price: { value: 'x' } } }]), 19.5);
    });
    test('generateCartURL : ASIN.n / Quantity.n + tag affilié unique', () => {
        const url = new URL(cart.generateCartURL([{ asin: 'AAAAAAAAAA' }, { asin: 'BBBBBBBBBB' }]));
        assert.equal(url.origin + url.pathname, 'https://www.amazon.fr/gp/aws/cart/add.html');
        assert.deepEqual([...url.searchParams], [
            ['ASIN.1', 'AAAAAAAAAA'], ['Quantity.1', '1'], ['ASIN.2', 'BBBBBBBBBB'], ['Quantity.2', '1'],
            ['tag', 'offreznet04-21'], ['AssociateTag', 'offreznet04-21']
        ]);
    });
    test('generateCartURL : valeurs encodées (pas d\'injection de paramètre)', () => {
        const url = new URL(cart.generateCartURL([{ asin: 'A&tag=evil' }]));
        assert.deepEqual(url.searchParams.getAll('tag'), ['offreznet04-21']);
        assert.equal(url.searchParams.get('ASIN.1'), 'A&tag=evil');
    });
});

// ============================================================================
// Cycle de vie de finalData (RGPD)
// ============================================================================
describe('session-data : finalData', () => {
    const DATA = { contexte: 'Noël', equipe: [{ nom: 'Julie', budget: 50 }] };
    let local; let sess;
    beforeEach(() => { local = new MemoryStorage(); sess = new MemoryStorage(); });

    test('takeAnalysisData déplace finalData du localStorage vers le sessionStorage', () => {
        local.setItem('finalData', JSON.stringify(DATA));
        assert.deepEqual(session.takeAnalysisData({ local, session: sess }), DATA);
        assert.equal(local.getItem('finalData'), null);
        assert.equal(sess.getItem('finalData'), JSON.stringify(DATA));
    });
    test('« Réessayer » : relit la copie de session quand le localStorage est vide', () => {
        sess.setItem('finalData', JSON.stringify(DATA));
        assert.deepEqual(session.takeAnalysisData({ local, session: sess }), DATA);
    });
    test('une nouvelle analyse (localStorage) a priorité sur une ancienne copie de session', () => {
        sess.setItem('finalData', JSON.stringify({ contexte: 'ancien', equipe: [{}] }));
        local.setItem('finalData', JSON.stringify(DATA));
        assert.deepEqual(session.takeAnalysisData({ local, session: sess }), DATA);
        assert.equal(sess.getItem('finalData'), JSON.stringify(DATA));
    });
    test('absent, corrompu ou équipe vide → null et tout est purgé', () => {
        assert.equal(session.takeAnalysisData({ local, session: sess }), null);
        for (const raw of ['{pas du json', JSON.stringify({ contexte: 'x', equipe: [] }), JSON.stringify({ contexte: 'x' }), 'null']) {
            local.setItem('finalData', raw);
            assert.equal(session.takeAnalysisData({ local, session: sess }), null, raw);
            assert.equal(local.getItem('finalData'), null);
            assert.equal(sess.getItem('finalData'), null);
        }
    });
    test('sessionStorage indisponible → les données restent lisibles (localStorage conservé jusqu\'à la purge)', () => {
        const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
        local.setItem('finalData', JSON.stringify(DATA));
        assert.deepEqual(session.takeAnalysisData({ local, session: broken }), DATA);
        assert.equal(local.getItem('finalData'), JSON.stringify(DATA));
        session.purgeAnalysisData({ local, session: broken });
        assert.equal(local.getItem('finalData'), null);
    });
    test('purgeAnalysisData : tout supprimé ; keepForRetry garde seulement la copie de session', () => {
        local.setItem('finalData', 'a'); sess.setItem('finalData', 'a');
        session.purgeAnalysisData({ keepForRetry: true, local, session: sess });
        assert.equal(local.getItem('finalData'), null);
        assert.equal(sess.getItem('finalData'), 'a');
        session.purgeAnalysisData({ local, session: sess });
        assert.equal(sess.getItem('finalData'), null);
    });
    test('utilise les stockages globaux par défaut', () => {
        localStorage.setItem('finalData', JSON.stringify(DATA));
        assert.deepEqual(session.takeAnalysisData(), DATA);
        assert.equal(localStorage.getItem('finalData'), null);
        session.purgeAnalysisData();
        assert.equal(sessionStorage.getItem('finalData'), null);
    });
});

// ============================================================================
// Non-régression différentielle : implémentation d'origine (analyse.js avant le Lot 4a, copiée
// à l'identique) comparée aux modules extraits sur des milliers d'entrées pseudo-aléatoires.
// ============================================================================
function originalBestProduct(results, budget, sugg) {
    const maxPrice = budget;
    let validProducts = results.filter(item => {
        const val = Number(item?.price?.value);
        const rating = parseFloat(String(item.rating || '0').replace(',', '.')) || 0;
        const reviewCount = parseInt(String(item.reviews || item.reviews_count || '0').replace(/[^0-9]/g, ''), 10) || 0;
        return Number.isFinite(val) && val > 1 && val <= maxPrice && !!item.title && rating >= 3.5 && reviewCount >= 5;
    });
    if (validProducts.length === 0) {
        validProducts = results.filter(item => {
            const val = Number(item?.price?.value);
            const rating = parseFloat(String(item.rating || '0').replace(',', '.')) || 0;
            const reviewCount = parseInt(String(item.reviews || item.reviews_count || '0').replace(/[^0-9]/g, ''), 10) || 0;
            return Number.isFinite(val) && val > 1 && val <= maxPrice && item.title && rating >= 3.0 && reviewCount >= 1;
        });
    }
    if (validProducts.length === 0) {
        validProducts = results.filter(item => {
            const val = Number(item?.price?.value);
            return Number.isFinite(val) && val > 1 && val <= maxPrice && item.title;
        });
    }
    if (validProducts.length === 0) return null;
    return validProducts.map((item, index) => {
        const priceValue = Number(item.price?.value) || 0;
        const rating = Number(item.rating) || 3; // lot 2 : note absente comptée 3 (au lieu de 4)
        const reviewCount = Number(item.reviews || item.reviews_count) || 0;
        const isPrime = item.is_prime || false;
        const budgetRatio = priceValue / budget;
        let budgetScore = 0;
        if (budgetRatio >= 0.60 && budgetRatio <= 0.90) budgetScore = 1.0;
        else if (budgetRatio > 0.90 && budgetRatio <= 1.0) budgetScore = 0.9;
        else if (budgetRatio >= 0.40 && budgetRatio < 0.60) budgetScore = 0.6 + (budgetRatio - 0.40) * 2;
        else if (budgetRatio >= 0.20 && budgetRatio < 0.40) budgetScore = 0.3 + (budgetRatio - 0.20) * 1.5;
        else if (budgetRatio > 0 && budgetRatio < 0.20) budgetScore = budgetRatio * 1.5;
        else budgetScore = 0;
        const ratingScore = rating / 5;
        const popularityScore = Math.min(1, Math.log10(reviewCount + 1) / 3);
        const primeBonus = isPrime ? 0.1 : 0;
        const bestSellerBonus = item.is_best_seller === true ? 0.05 : 0; // lot 2
        const score = (budgetScore * 0.35) + (ratingScore * 0.35) + (popularityScore * 0.20) + (1 / (index + 1)) * 0.10 + primeBonus + bestSellerBonus;
        return { ...item, score, budgetRatio, searchTerm: sugg.term, reason: sugg.reason };
    }).sort((a, b) => b.score - a.score)[0];
}

function originalDedupe(finalProducts) {
    const usedSearchTerms = new Set();
    const uniqueProducts = [];
    function areSimilar(title1, title2) {
        if (!title1 || !title2) return false;
        const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        if (words1.size === 0 || words2.size === 0) return false;
        const intersection = [...words1].filter(w => words2.has(w));
        return intersection.length / Math.max(words1.size, words2.size) > 0.7;
    }
    const isDuplicate = product => uniqueProducts.some(existing => areSimilar(existing.title, product.title));
    for (const product of finalProducts) {
        if (!usedSearchTerms.has(product.searchTerm) && !isDuplicate(product)) {
            usedSearchTerms.add(product.searchTerm);
            uniqueProducts.push(product);
        }
    }
    for (const product of finalProducts) {
        if (uniqueProducts.length >= 5) break;
        if (!isDuplicate(product)) uniqueProducts.push(product);
    }
    return uniqueProducts;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('non-régression différentielle vs implémentation d\'origine', () => {
    const rand = rng(20261122);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const WORDS = ['montre', 'sport', 'connectée', 'noire', 'gourde', 'inox', 'sac', 'voyage', 'de', 'la', 'livre', 'polar'];
    const phrase = (max) => Array.from({ length: 1 + Math.floor(rand() * max) }, () => pick(WORDS)).join(' ');
    // Éléments toujours objets : l'original levait une TypeError sur un élément null (écart volontaire, testé plus haut).
    const randomItem = () => ({
        title: pick(['', undefined, null, phrase(5), phrase(5), phrase(5), phrase(5)]),
        price: pick([undefined, null, {}, { value: pick([0, 1, 1.01, 2, 9.99, 20, 35, 49.5, 50, 50.01, 80, 'x', '29.9', null]) }]),
        rating: pick([undefined, null, 0, 2.99, 3, 3.49, 3.5, '3,5', '4,5', 4.8, 5, 'n/a', '']),
        reviews: pick([undefined, 0, 1, 4, 5, 6, '1 200', '1,200', 250, 'aucun']),
        reviews_count: pick([undefined, 0, 3, 12]),
        is_prime: pick([undefined, true, false]),
        is_best_seller: pick([undefined, true, false, 'true'])
    });

    test('pickBestProduct ≡ filtre 3 niveaux + scoring d\'origine (3000 cas)', () => {
        for (let i = 0; i < 3000; i++) {
            const results = Array.from({ length: Math.floor(rand() * 8) }, randomItem);
            const budget = pick([5, 10, 20, 49.5, 50, 100]);
            const sugg = { term: 'terme', reason: 'raison' };
            assert.deepEqual(pickBestProduct(results, budget, sugg), originalBestProduct(results, budget, sugg), `cas ${i}`);
        }
    });

    test('dedupeProducts ≡ déduplication d\'origine (3000 cas)', () => {
        for (let i = 0; i < 3000; i++) {
            const list = Array.from({ length: Math.floor(rand() * 9) }, () => ({
                title: pick(['', phrase(4), phrase(4), phrase(4), phrase(4)]),
                searchTerm: pick(['t1', 't2', 't3'])
            }));
            assert.deepEqual(dedupeProducts(list), originalDedupe(list), `cas ${i}`);
        }
    });
});

// ============================================================================
// Lot 4 : résultats conservés dans l'onglet, rappel calendrier, partage
// ============================================================================
const store = await import(new URL('analyse/results-store.js?v=2026112406', JS).href);
const retention = await import(new URL('analyse/retention.js?v=2026112406', JS).href);

describe("results-store (sessionStorage de l'onglet)", () => {
    const NOW = Date.UTC(2026, 10, 23, 12);
    const pr = (over = {}) => ({
        personne: { nom: 'Julie', budget: 50, age: 28, tags: ['Voyage'], details: { adore: 'randonnée' } },
        currentIndex: 1,
        products: [
            { title: 'Sac cabine', link: 'https://www.amazon.fr/dp/B0PRIVACY1', asin: 'B0PRIVACY1', price: { value: 39.9, raw: '39,90 €' }, rating: 4.5, reviews: 120, is_prime: true, score: 0.9, budgetRatio: 0.8 },
            { kind: 'search', term: 'gourde isotherme', searchTerm: 'gourde isotherme', title: 'gourde isotherme', reason: 'Pratique' }
        ],
        ...over
    });
    let s;
    beforeEach(() => { s = new MemoryStorage(); });

    test('aller-retour : champs connus seulement (ni âge, ni intérêts, ni texte libre), suggestion affichée conservée', () => {
        assert.equal(store.saveResults([pr()], 'Noël', { session: s, now: NOW }), true);
        const raw = s.getItem(store.RESULTS_KEY);
        for (const secret of ['randonnée', 'Voyage', '"age"', 'score', 'budgetRatio']) assert.ok(!raw.includes(secret), secret);
        const loaded = store.loadResults({ session: s, now: NOW + 1000 });
        assert.equal(loaded.contexte, 'Noël');
        assert.deepEqual(loaded.results[0].personne, { nom: 'Julie', budget: 50 });
        assert.equal(loaded.results[0].currentIndex, 1);
        // Index hors bornes ou invalide → 0
        store.saveResults([pr({ currentIndex: 9 })], 'Noël', { session: s, now: NOW });
        assert.equal(store.loadResults({ session: s, now: NOW }).results[0].currentIndex, 0);
        store.saveResults([pr({ currentIndex: '1' })], 'Noël', { session: s, now: NOW });
        assert.equal(store.loadResults({ session: s, now: NOW }).results[0].currentIndex, 0);
        assert.equal(loaded.results[0].products[0].asin, 'B0PRIVACY1');
        assert.equal(loaded.results[0].products[1].kind, 'search');
    });
    test('expiré (> 2 h) ou daté dans le futur → null et purgé', () => {
        store.saveResults([pr()], 'Noël', { session: s, now: NOW });
        assert.equal(store.loadResults({ session: s, now: NOW + store.RESULTS_TTL_MS + 1 }), null);
        assert.equal(s.getItem(store.RESULTS_KEY), null);
        store.saveResults([pr()], 'Noël', { session: s, now: NOW });
        assert.equal(store.loadResults({ session: s, now: NOW - 1 }), null);
    });
    test('contenu corrompu ou modifié : purgé, champs invalides écartés', () => {
        s.setItem(store.RESULTS_KEY, '{pas du json');
        assert.equal(store.loadResults({ session: s, now: NOW }), null);
        assert.equal(s.getItem(store.RESULTS_KEY), null);
        s.setItem(store.RESULTS_KEY, JSON.stringify({ v: 1, savedAt: NOW, contexte: 'Noël', results: [
            { personne: { nom: 'A', budget: -5 }, products: [{ title: 'x' }] },
            { personne: { nom: 'B', budget: 30 }, products: [{ title: 'Ok', asin: 'bad"asin', rating: '5<img>' }, { kind: 'search', term: 'a' }] }
        ] }));
        const loaded = store.loadResults({ session: s, now: NOW });
        assert.equal(loaded.results.length, 1);
        assert.deepEqual([loaded.results[0].products.length, loaded.results[0].products[0].asin, loaded.results[0].products[0].rating], [1, null, null]);
    });
    test('rien à enregistrer ou stockage indisponible → false, sans erreur', () => {
        assert.equal(store.saveResults([], 'Noël', { session: s }), false);
        const broken = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
        assert.equal(store.saveResults([pr()], 'Noël', { session: broken }), false);
        assert.equal(store.loadResults({ session: broken }), null);
        assert.doesNotThrow(() => store.clearResults({ session: broken }));
    });
});

describe("rappel calendrier : dates d'occasion", () => {
    const ymd = d => retention.toInputDate(d);
    test('Pâques (dates connues)', () => {
        assert.equal(ymd(retention.easterSunday(2024)), '2024-03-31');
        assert.equal(ymd(retention.easterSunday(2026)), '2026-04-05');
        assert.equal(ymd(retention.easterSunday(2027)), '2027-03-28');
    });
    test('fête des mères : dernier dimanche de mai, décalée au 1er dimanche de juin si Pentecôte', () => {
        assert.equal(ymd(retention.mothersDay(2026)), '2026-05-31');
        assert.equal(ymd(retention.mothersDay(2027)), '2027-05-30');
        assert.equal(ymd(retention.mothersDay(2004)), '2004-06-06'); // Pentecôte le 30 mai 2004
    });
    test('fête des pères : 3e dimanche de juin', () => {
        assert.equal(ymd(retention.fathersDay(2026)), '2026-06-21');
        assert.equal(ymd(retention.fathersDay(2027)), '2027-06-20');
    });
    test("prochaine occurrence strictement après aujourd'hui ; occasion sans date : dans un an", () => {
        const from = new Date(2026, 10, 23);
        assert.equal(ymd(retention.nextOccasionDate('Noël', from)), '2026-12-25');
        assert.equal(ymd(retention.nextOccasionDate('Noël', new Date(2026, 11, 25))), '2027-12-25');
        assert.equal(ymd(retention.nextOccasionDate('Saint-Valentin', from)), '2027-02-14');
        assert.equal(ymd(retention.nextOccasionDate('Fête des Mères', from)), '2027-05-30');
        assert.equal(ymd(retention.nextOccasionDate('Anniversaire', from)), '2027-11-23');
        // 31 décembre → Noël de l'année suivante ; 14 février le jour même → l'année suivante
        assert.equal(ymd(retention.nextOccasionDate('Noël', new Date(2026, 11, 31))), '2027-12-25');
        assert.equal(ymd(retention.nextOccasionDate('Saint-Valentin', new Date(2027, 1, 14, 23, 59))), '2028-02-14');
        // Changement d'heure (29 mars 2026) sans effet : dates locales
        assert.equal(ymd(retention.nextOccasionDate('Fête des Pères', new Date(2026, 2, 29, 2, 30))), '2026-06-21');
    });
    test('parseInputDate : dates réelles seulement', () => {
        assert.equal(ymd(retention.parseInputDate('2027-02-14')), '2027-02-14');
        for (const bad of ['2027-02-30', '2027-13-01', '14/02/2027', '', null, '2027-2-14']) {
            assert.equal(retention.parseInputDate(bad), null, String(bad));
        }
    });
});

describe('rappel calendrier : fichier .ics', () => {
    const ics = retention.buildIcs({ date: new Date(2027, 11, 25), occasion: 'Noël, en famille; enfin', now: new Date(Date.UTC(2026, 10, 23, 10, 0, 0)), uid: 'abc-123' });
    test('événement journée entière, alerte 7 jours avant, fins de ligne CRLF', () => {
        assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n'));
        assert.ok(ics.includes('\r\nDTSTART;VALUE=DATE:20271225\r\n'));
        assert.ok(ics.includes('\r\nDTEND;VALUE=DATE:20271226\r\n'));
        assert.ok(ics.includes('\r\nTRIGGER:-P7D\r\n'));
        assert.ok(ics.includes('\r\nUID:abc-123@offrez.net\r\n'));
        assert.ok(ics.includes('\r\nDTSTAMP:20261123T100000Z\r\n'));
        assert.ok(ics.trimEnd().endsWith('END:VCALENDAR'));
        assert.ok(!/[^\r]\n/.test(ics), 'aucun saut de ligne sans CR');
    });
    test("texte échappé (virgule, point-virgule) et lien vers l'outil pré-rempli", () => {
        const unfolded = ics.replace(/\r\n /g, ''); // lignes longues pliées (RFC 5545)
        assert.ok(unfolded.includes('SUMMARY:🎁 Noël\\, en famille\\; enfin : penser au cadeau'));
        assert.ok(unfolded.includes('URL:https://offrez.net/config.html?occasion=No%C3%ABl%2C%20en%20famille%3B%20enfin'));
        assert.equal(retention.escapeIcsText('a\\b\nc'), 'a\\\\b\\nc');
        assert.equal(retention.escapeIcsText('a\rb\r\nc'), 'a\\nb\\nc', 'retour chariot isolé échappé (pas de nouvelle ligne iCal)');
    });
    test('pliage RFC 5545 : aucune ligne de plus de 75 octets, dépliage identique', () => {
        // Occasion ≤ 60 caractères (borne de buildIcs), mais SUMMARY > 75 octets (emojis et accents)
        const occasion = 'Fête très spéciale 🎉🎉 avec toute la famille réunie';
        const long = retention.buildIcs({ date: new Date(2027, 1, 14), occasion, uid: 'x' });
        assert.ok(long.includes('\r\n '), 'au moins une ligne pliée');
        for (const line of long.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
        const unfolded = long.replace(/\r\n /g, '');
        assert.ok(unfolded.includes(`SUMMARY:🎁 ${occasion} : penser au cadeau`));
        assert.equal(retention.foldIcsLine('court'), 'court');
        // Un caractère multi-octet n'est jamais coupé
        const folded = retention.foldIcsLine('X'.repeat(74) + 'é' + 'Y');
        assert.deepEqual(folded.split('\r\n'), ['X'.repeat(74), ' éY']);
    });
});

describe('partage de la liste', () => {
    test('une ligne par personne, élément affiché, liens affiliés taggés', () => {
        const text = retention.buildShareText([
            { personne: { nom: 'Julie' }, currentIndex: 0, products: [{ title: 'Sac cabine', asin: 'B0PRIVACY1', link: 'https://www.amazon.fr/dp/B0PRIVACY1' }] },
            { personne: { nom: 'Marc' }, currentIndex: 1, products: [{ title: 'X', asin: 'B0AAAAAAA1' }, { kind: 'search', term: 'gourde isotherme' }] }
        ]);
        assert.ok(text.startsWith('Mes idées cadeaux trouvées avec OFFREZ :'));
        assert.ok(text.includes('🎁 Julie : Sac cabine\nhttps://www.amazon.fr/dp/B0PRIVACY1?tag=offreznet04-21'));
        assert.ok(text.includes('🎁 Marc : Idée : gourde isotherme\nhttps://www.amazon.fr/s?k=gourde+isotherme&tag=offreznet04-21'));
    });
    test('élément sans lien valide ignoré ; rien à partager → chaîne vide', () => {
        assert.equal(retention.buildShareText([{ personne: { nom: 'A' }, currentIndex: 0, products: [{ title: 'x', link: 'javascript:alert(1)' }] }]), '');
        assert.equal(retention.buildShareText(undefined), '');
    });
});
