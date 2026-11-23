// @ts-check
// Lot 2 : genre neutre par défaut, badges de confiance, relances dans la modale après clic, défilement mobile.
const { test, expect, AFFILIATE_TAG, analyzeResponse } = require('./fixtures');

const person = (nom, budget) => ({ nom, sexe: 'Femme', age: 35, budget, tags: ['Voyage'], details: { adore: '', eviter: '' } });

async function seedTwoPeople(page) {
    await page.addInitScript((data) => {
        localStorage.setItem('finalData', data);
    }, JSON.stringify({ contexte: 'Noël', equipe: [person('Julie', 50), person('Marie', 40)] }));
    await page.route('**/api/analyze', (route) => route.fulfill({
        json: analyzeResponse([
            { term: 'trousse de voyage', reason: 'Elle voyage souvent', prix_estime: '30€' },
            { term: 'oreiller de voyage', reason: 'Confort', prix_estime: '25€' },
        ]),
    }));
    let n = 0;
    await page.route('**/api/search?**', (route) => {
        n++;
        return route.fulfill({
            json: {
                search_results: [{
                    title: `Trousse de toilette ${n}`,
                    link: `https://www.amazon.fr/dp/B0CONVERT${n}?psc=1`,
                    image: 'https://m.media-amazon.com/images/I/t.jpg',
                    price: { value: 29.9, raw: '29,90 €', currency: 'EUR' },
                    rating: 4.5,
                    reviews: 1234,
                    asin: `B0CONVERT${n}`,
                    is_prime: true,
                    is_best_seller: n === 1,
                }],
            },
        });
    });
    await page.context().route('https://www.amazon.fr/**', (route) => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));
}

test('profils : genre « Peu importe » sélectionné par défaut (aucune orientation implicite)', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('giftConfig', JSON.stringify({ occasion: 'Noël', nb: 1, budgetStrategy: 'custom' }));
    });
    await page.goto('/profils.html');
    const card = page.locator('.profile-card').first();
    await expect(card.getByRole('button', { name: 'Peu importe' })).toHaveAttribute('aria-pressed', 'true');
    await expect(card.getByRole('button', { name: 'Femme' })).toHaveAttribute('aria-pressed', 'false');
    await expect(card.locator('.p-sexe')).toHaveValue('Non précisé');
});

test('badges de confiance et relances après clic : panier groupé et cadeau suivant', async ({ page, consoleErrors }) => {
    await seedTwoPeople(page);
    await page.goto('/analyse.html');

    const cards = page.locator('.gift-card');
    await expect(cards).toHaveCount(2, { timeout: 15000 });
    const first = cards.nth(0);
    await expect(first.locator('.best-seller-mini')).toHaveText('🏆 Meilleure vente');
    await expect(cards.nth(1).locator('.best-seller-mini')).toHaveCount(0);
    await expect(first.locator('.gift-reviews')).toHaveText(/1\s234 avis/);

    // Mobile : les résultats sont amenés à l'écran
    if ((page.viewportSize()?.width ?? 1280) <= 900) {
        await expect.poll(async () => (await page.locator('#singleResult').boundingBox())?.y ?? 9999).toBeLessThan(page.viewportSize().height);
    }

    const [popup] = await Promise.all([page.waitForEvent('popup'), first.locator('a.btn-amazon-cta').click()]);
    await popup.close();

    const modal = page.locator('#purchaseModal');
    await expect(modal).toBeVisible();
    // Panier groupé (2 produits) proposé dans la modale, même URL que le bouton panier, tag dans les deux paramètres
    const cartAction = page.locator('#purchaseModalCart');
    await expect(cartAction).toBeVisible();
    const cartHref = /** @type {string} */ (await cartAction.getAttribute('href'));
    expect(cartHref).toBe(await page.locator('#cartContainer .btn-cart').getAttribute('href'));
    const cartUrl = new URL(cartHref);
    expect(cartUrl.searchParams.get('ASIN.1')).toBe('B0CONVERT1');
    expect(cartUrl.searchParams.get('ASIN.2')).toBe('B0CONVERT2');
    expect(cartUrl.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
    expect(cartUrl.searchParams.getAll('AssociateTag')).toEqual([AFFILIATE_TAG]);
    await expect(cartAction).toHaveAttribute('rel', /\bsponsored\b/);

    // « Voir le cadeau suivant » : ferme la modale, focus sur le bouton du cadeau de Marie
    await page.locator('#purchaseModalNext').click();
    await expect(modal).toBeHidden();
    await expect(cards.nth(1).locator('a.btn-amazon-cta')).toBeFocused();

    // Dernier cadeau : plus de « cadeau suivant »
    const [popup2] = await Promise.all([page.waitForEvent('popup'), cards.nth(1).locator('a.btn-amazon-cta').click()]);
    await popup2.close();
    await expect(modal).toBeVisible();
    await expect(page.locator('#purchaseModalNext')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    expect(consoleErrors).toEqual([]);
});

test('navigation entre suggestions instantanée (plus de faux chargement)', async ({ page }) => {
    await seedTwoPeople(page);
    await page.goto('/analyse.html');
    const first = page.locator('.gift-card').first();
    await expect(first).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.card-loading-overlay')).toHaveCount(0);
    await first.locator('.btn-next').click();
    await expect(page.locator('.gift-card').first().locator('.gift-title')).toHaveText('Idée : oreiller de voyage', { timeout: 300 });
});

test('clavier : en bout de carrousel, le focus reste dans la navigation', async ({ page }) => {
    await seedTwoPeople(page);
    await page.goto('/analyse.html');
    const first = page.locator('.gift-card').first();
    await expect(first).toBeVisible({ timeout: 15000 });
    await first.locator('.btn-next').focus();
    await page.keyboard.press('Enter');
    // Dernière suggestion : « suivant » désactivé, le focus passe sur « précédent »
    const card = page.locator('.gift-card').first();
    await expect(card.locator('.btn-next')).toBeDisabled();
    await expect(card.locator('.btn-prev')).toBeFocused();
});
