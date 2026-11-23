// @ts-check
// Idées proposées en liens de recherche Amazon taggés (repli sans appel RapidAPI).
const { test, expect, AFFILIATE_TAG, expectNoHorizontalOverflow, analyzeResponse } = require('./fixtures');

const person = (nom, budget) => ({ nom, sexe: 'Homme', age: 40, budget, tags: ['Sport'], details: { adore: '', eviter: '' } });

async function seed(page, equipe) {
    await page.addInitScript((data) => {
        localStorage.setItem('finalData', data);
    }, JSON.stringify({ contexte: 'Noël', equipe }));
}

/** Erreurs console hors « Failed to load resource » (réponse HTTP d'erreur simulée, attendue ici). */
const unexpected = (errors) => errors.filter((e) => !e.includes('Failed to load resource'));

test('quota de recherche atteint (429) : plus aucune recherche, toutes les idées en liens taggés', async ({ page, consoleErrors }) => {
    await seed(page, [person('Paul', 50), person('Marc', 30)]);
    await page.route('**/api/analyze', (route) => route.fulfill({
        json: analyzeResponse([
            { term: 'montre sport', reason: 'Sportif', prix_estime: '40€' },
            { term: 'gourde isotherme', reason: 'Pratique', prix_estime: '25€' },
        ]),
    }));
    let searchCalls = 0;
    await page.route('**/api/search?**', (route) => {
        searchCalls++;
        return route.fulfill({ status: 429, headers: { 'Retry-After': '3600' }, json: { error: 'Limite quotidienne de recherches atteinte. Réessayez demain.' } });
    });

    await page.goto('/analyse.html');

    const cards = page.locator('.gift-card');
    await expect(cards).toHaveCount(2, { timeout: 15000 });
    await expect(page.locator('.gift-card-search')).toHaveCount(2);
    // Un seul appel : le 429 du 1er profil bloque les recherches du 2e
    expect(searchCalls).toBe(1);

    for (const card of await cards.all()) {
        await expect(card.locator('.gift-title')).toHaveText('Idée : montre sport');
        const cta = card.locator('a.btn-amazon-cta');
        await expect(cta).toHaveAttribute('target', '_blank');
        await expect(cta).toHaveAttribute('rel', /\bnofollow\b.*\bsponsored\b.*\bnoopener\b/);
        const url = new URL(/** @type {string} */ (await cta.getAttribute('href')));
        expect(url.origin + url.pathname).toBe('https://www.amazon.fr/s');
        expect(url.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
        await expect(card.locator('.suggestion-indicator')).toHaveText('1 / 2');
    }
    // Pas de produit précis : pas de panier groupé, pas de message de limite bloquant
    await expect(page.locator('#cartContainer')).toBeHidden();
    await expect(page.locator('.analysis-error')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(unexpected(consoleErrors)).toEqual([]);
});

test('terme hostile dans une idée : affiché comme texte, confiné au paramètre k', async ({ page, consoleErrors }) => {
    const hostile = 'montre"><img src=x onerror="window.__xss=1"><b>x</b>&tag=concurrent-21';
    await seed(page, [person('Tom', 80)]);
    await page.route('**/api/analyze', (route) => route.fulfill({
        json: analyzeResponse([{ term: hostile, reason: '<script>window.__xss=2</script>', prix_estime: '60€' }]),
    }));
    await page.route('**/api/search?**', (route) => route.fulfill({ json: { search_results: [] } }));

    await page.goto('/analyse.html');

    const card = page.locator('.gift-card-search');
    await expect(card).toHaveCount(1, { timeout: 15000 });
    await expect(card.locator('.gift-title')).toContainText('<img src=x');
    await expect(page.locator('#singleResult img, #singleResult script, #singleResult b')).toHaveCount(0);
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();

    const url = new URL(/** @type {string} */ (await card.locator('a.btn-amazon-cta').getAttribute('href')));
    expect(url.hostname).toBe('www.amazon.fr');
    expect(url.searchParams.get('k')).toBe(hostile);
    expect(url.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
    expect(consoleErrors).toEqual([]);
});

test('aucune idée exploitable (termes vides ou trop courts) : aucune recherche, aucune carte, état d\'échec', async ({ page, consoleErrors }) => {
    await seed(page, [person('Léa', 40)]);
    let analyzeCalls = 0;
    await page.route('**/api/analyze', (route) => {
        analyzeCalls++;
        return route.fulfill({
            json: analyzeResponse([{ term: 'a', reason: 'r', prix_estime: '20€' }, { term: '  ', reason: 'r', prix_estime: '20€' }]),
        });
    });
    let searchCalls = 0;
    await page.route('**/api/search?**', (route) => {
        searchCalls++;
        return route.fulfill({ json: { search_results: [] } });
    });

    await page.goto('/analyse.html');

    // api.js écarte les termes < 2 caractères : réponse vide = échec de l'IA (1 nouvelle tentative, puis « Réessayer »)
    await expect(page.locator('#singleResult .analysis-error')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.gift-card')).toHaveCount(0);
    expect(analyzeCalls).toBe(2);
    expect(searchCalls).toBe(0);
    expect(consoleErrors).toEqual([]);
});
