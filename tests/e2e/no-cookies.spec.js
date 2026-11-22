// @ts-check
// Aucune bannière cookies et aucun cookie déposé par offrez.net.
const { test, expect } = require('./fixtures');

const GIFT_CONFIG = { occasion: 'Noël', nb: 1, strategy: 'custom', amount: null };
const FINAL_DATA = {
    contexte: 'Anniversaire',
    equipe: [{ nom: 'Julie', sexe: 'Femme', age: 28, budget: 50, tags: ['Voyage'], details: { adore: '', eviter: '' } }],
};

for (const path of ['/', '/analyse.html']) {
    test(`${path} : aucune bannière cookies et aucun cookie déposé`, async ({ page, context, baseURL, consoleErrors }) => {
        await page.addInitScript(([config, data]) => {
            localStorage.setItem('giftConfig', config);
            localStorage.setItem('finalData', data);
        }, [JSON.stringify(GIFT_CONFIG), JSON.stringify(FINAL_DATA)]);
        await page.route('**/api/analyze', (route) => route.fulfill({
            json: { suggestions: [{ term: 'sac de voyage', reason: 'Pour ses escapades', prix_estime: '40€' }] },
        }));
        await page.route('**/api/search?**', (route) => route.fulfill({ json: { search_results: [] } }));

        await page.goto(path);
        await page.waitForLoadState('networkidle');

        await expect(page.locator('#cookieBanner, #cookieOverlay, .cookie-banner')).toHaveCount(0);
        expect(await context.cookies(baseURL)).toEqual([]);
        expect(await page.evaluate(() => document.cookie)).toBe('');
        expect(consoleErrors).toEqual([]);
    });
}
