// @ts-check
// [LOT4a] RGPD côté navigateur : purge de finalData.
const { test, expect } = require('./fixtures');

const FINAL_DATA = {
    contexte: 'Anniversaire',
    equipe: [{ nom: 'Julie', sexe: 'Femme', age: 28, budget: 50, tags: ['Voyage'], details: { adore: 'randonnée', eviter: '' } }],
};

async function mockAnalysisApis(page, { analyzeStatus = 200 } = {}) {
    const calls = { analyze: 0, search: [] };
    await page.route('**/api/analyze', (route) => {
        calls.analyze++;
        if (analyzeStatus !== 200) return route.fulfill({ status: analyzeStatus, json: { error: 'Erreur serveur interne' } });
        return route.fulfill({ json: { suggestions: [{ term: 'sac de voyage', reason: 'Pour ses escapades', prix_estime: '40€' }] } });
    });
    await page.route('**/api/search?**', (route) => {
        calls.search.push(Object.fromEntries(new URL(route.request().url()).searchParams));
        return route.fulfill({
            json: {
                search_results: [{
                    title: 'Sac de voyage cabine', link: 'https://www.amazon.fr/dp/B0PRIVACY1', image: 'https://m.media-amazon.com/i.jpg',
                    price: { value: 39.9, raw: '39,90 €' }, rating: 4.5, reviews: 120, asin: 'B0PRIVACY1', is_prime: true,
                }],
            },
        });
    });
    return calls;
}

test('finalData purgé du navigateur une fois les résultats affichés', async ({ page, consoleErrors }) => {
    await page.addInitScript((data) => {
        // Semé une seule fois (pas à chaque rechargement) pour observer la purge réelle
        if (!sessionStorage.getItem('__seeded')) {
            localStorage.setItem('finalData', data);
            sessionStorage.setItem('__seeded', '1');
        }
    }, JSON.stringify(FINAL_DATA));
    await mockAnalysisApis(page);

    await page.goto('/analyse.html');
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    const stored = await page.evaluate(() => ({ local: localStorage.getItem('finalData'), session: sessionStorage.getItem('finalData') }));
    expect(stored).toEqual({ local: null, session: null });

    // Rechargement : plus aucune donnée personnelle → invitation à recommencer
    await page.reload();
    await expect(page.locator('.analysis-error')).toContainText('Aucun profil à analyser');
    expect(consoleErrors).toEqual([]);
});

test('échec technique : finalData retiré du localStorage mais « Réessayer » relance l\'analyse (copie de session)', async ({ page, consoleErrors }) => {
    await page.addInitScript((data) => {
        if (!sessionStorage.getItem('__seeded')) {
            localStorage.setItem('finalData', data);
            sessionStorage.setItem('__seeded', '1');
        }
    }, JSON.stringify(FINAL_DATA));

    let analyzeOk = false;
    let analyzeCalls = 0;
    await page.route('**/api/analyze', (route) => {
        analyzeCalls++;
        return analyzeOk
            ? route.fulfill({ json: { suggestions: [{ term: 'sac de voyage', reason: 'Pour ses escapades' }] } })
            : route.fulfill({ status: 500, json: { error: 'Erreur serveur interne' } });
    });
    await page.route('**/api/search?**', (route) => route.fulfill({
        json: { search_results: [{ title: 'Sac de voyage cabine', link: 'https://www.amazon.fr/dp/B0PRIVACY1', price: { value: 39.9, raw: '39,90 €' }, rating: 4.5, reviews: 120 }] },
    }));

    await page.goto('/analyse.html');
    const errorState = page.locator('#singleResult .analysis-error');
    await expect(errorState).toBeVisible({ timeout: 15000 });
    expect(analyzeCalls).toBe(2);
    const afterFailure = await page.evaluate(() => ({ local: localStorage.getItem('finalData'), session: sessionStorage.getItem('finalData') }));
    expect(afterFailure.local).toBeNull();
    expect(JSON.parse(/** @type {string} */ (afterFailure.session))).toEqual(FINAL_DATA);

    analyzeOk = true;
    await errorState.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    expect(analyzeCalls).toBe(3);
    const afterSuccess = await page.evaluate(() => ({ local: localStorage.getItem('finalData'), session: sessionStorage.getItem('finalData') }));
    expect(afterSuccess).toEqual({ local: null, session: null });
    expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});
