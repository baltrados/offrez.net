// @ts-check
// Parcours complet : accueil (cookies) → config → profils → analyse (API mockées) → carte cadeau.
const { test, expect, AFFILIATE_TAG, expectNoHorizontalOverflow, analyzeResponse } = require('./fixtures');

test('parcours utilisateur complet jusqu\'à la carte cadeau affiliée', async ({ page, consoleErrors }) => {
    const analyzeRequests = [];
    const searchRequests = [];

    await page.route('**/api/analyze', async (route) => {
        analyzeRequests.push(route.request().postDataJSON());
        await route.fulfill({
            json: analyzeResponse([
                { term: 'montre sport homme', reason: 'Parfait pour un sportif', prix_estime: '45€' },
                { term: 'gourde isotherme', reason: 'Pratique au quotidien', prix_estime: '25€' },
            ]),
        });
    });
    await page.route('**/api/search?**', async (route) => {
        const url = new URL(route.request().url());
        searchRequests.push(Object.fromEntries(url.searchParams));
        const n = searchRequests.length;
        await route.fulfill({
            json: {
                search_results: [{
                    title: `Produit test ${n} pour le sport`,
                    link: `https://www.amazon.fr/dp/B0TESTE2E${n}?tag=concurrent-21&psc=1`,
                    image: 'https://m.media-amazon.com/images/I/test.jpg',
                    price: { value: 39.9, raw: '39,90 €', currency: 'EUR' },
                    rating: 4.6,
                    reviews: 250,
                    asin: `B0TESTE2E${n}`,
                    is_prime: true,
                    is_best_seller: false,
                }],
            },
        });
    });

    // 1. Accueil + bannière cookies
    await page.goto('/');
    const accept = page.locator('#cookieAccept');
    await expect(accept).toBeVisible();
    await accept.click();
    await expect(page.locator('#cookieBanner')).toHaveCount(0);
    const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('OFFREZ_cookie_consent') || 'null'));
    expect(consent?.accepted).toBe(true);

    // 2. Configuration (occasion, 1 personne, stratégie par défaut « custom »)
    await page.goto('/config.html');
    await expect(page.locator('#cookieBanner')).toHaveCount(0);
    await page.locator('.occasion-chip[data-value="Fête des Pères"]').click();
    await expect(page.locator('#occasion')).toHaveValue('Fête des Pères');
    await page.locator('#nbPeople').fill('1');
    await expect(page.locator('#budgetStrategy')).toHaveValue('custom');
    await expectNoHorizontalOverflow(page);
    await page.locator('.btn-next').click();

    // 3. Profil
    await page.waitForURL('**/profils.html');
    const card = page.locator('.profile-card');
    await expect(card).toHaveCount(1);
    await card.locator('.p-name').fill('Paul');
    await card.locator('.p-budget').fill('49.5');
    await card.locator('.gender-chip[data-value="Homme"]').click();
    await expect(card.locator('.p-sexe')).toHaveValue('Homme');
    // Le checkbox est enveloppé dans un label (chip visuel) : on clique le label
    await card.locator('label.tag-chip', { has: page.locator('input.p-tag[value="Sport"]') }).click();
    await expect(card.locator('input.p-tag[value="Sport"]')).toBeChecked();
    await expectNoHorizontalOverflow(page);
    await page.locator('#launchAnalysis').click();

    // 4. Analyse : carte cadeau rendue
    await page.waitForURL('**/analyse.html');
    const giftCard = page.locator('.gift-card').first();
    await expect(giftCard).toBeVisible({ timeout: 15000 });

    // Contrat /api/analyze structuré (aucun prompt libre côté client)
    expect(analyzeRequests).toHaveLength(1);
    const payload = analyzeRequests[0];
    expect(payload).not.toHaveProperty('prompt');
    expect(payload).toEqual({
        contexte: 'Fête des Pères',
        profile: {
            nom: 'Paul',
            sexe: 'Homme',
            age: null,
            budget: 49.5,
            tags: ['Sport'],
            adore: '',
            eviter: '',
        },
    });

    // Recherche : prix entiers (le serveur n'accepte que ^\d{1,5}$), max 2 recherches
    expect(searchRequests.length).toBeGreaterThanOrEqual(1);
    expect(searchRequests.length).toBeLessThanOrEqual(2);
    expect(searchRequests[0]).toMatchObject({ term: 'montre sport homme', min_price: '9', max_price: '49' });
    expect(searchRequests[0]).not.toHaveProperty('consent');

    // CTA affilié : https://www.amazon.fr/..., un seul tag, celui d'OFFREZ
    const cta = giftCard.locator('a.btn-amazon-cta');
    const href = await cta.getAttribute('href');
    expect(href).toMatch(/^https:\/\/www\.amazon\.fr\//);
    const ctaUrl = new URL(/** @type {string} */ (href));
    expect(ctaUrl.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
    expect((href || '').match(/tag=/g)).toHaveLength(1);
    expect(ctaUrl.searchParams.get('psc')).toBe('1');
    await expect(cta).toHaveAttribute('rel', /noopener/);
    await expect(giftCard.locator('.gift-title')).toContainText('Produit test');
    await expect(giftCard.locator('.gift-owner')).toContainText('Paul');

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
});
