// @ts-check
// Parcours complet : accueil → config → profils → analyse (API mockées) → carte cadeau.
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

    // 1. Accueil
    await page.goto('/');

    // 2. Configuration (occasion, 1 personne, stratégie par défaut « custom »)
    await page.goto('/config.html');
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
            // le prénom n'est jamais envoyé au serveur (reste dans le navigateur)
            sexe: 'Homme',
            age: null,
            budget: 49.5,
            tags: ['Sport'],
            adore: '',
            eviter: '',
        },
    });

    // Recherche : une seule par personne (coût RapidAPI), prix entiers par palier (budget 49,5 € → 45 €)
    expect(searchRequests).toHaveLength(1);
    expect(searchRequests[0]).toMatchObject({ term: 'montre sport homme', min_price: '9', max_price: '45' });
    expect(searchRequests[0]).not.toHaveProperty('consent');

    // CTA affilié : https://www.amazon.fr/..., un seul tag, celui d'OFFREZ
    const cta = giftCard.locator('a.btn-amazon-cta');
    const href = await cta.getAttribute('href');
    expect(href).toMatch(/^https:\/\/www\.amazon\.fr\//);
    const ctaUrl = new URL(/** @type {string} */ (href));
    expect(ctaUrl.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
    expect((href || '').match(/tag=/g)).toHaveLength(1);
    // Lien canonique /dp/<ASIN> : paramètres de suivi et tag concurrent retirés
    expect(href).toBe(`https://www.amazon.fr/dp/B0TESTE2E1?tag=${AFFILIATE_TAG}`);
    // Confiance : nombre d'avis affiché ; plus de faux badge « économisés »
    await expect(giftCard.locator('.gift-reviews')).toHaveText('250 avis');
    await expect(giftCard.locator('.savings-badge')).toHaveCount(0);
    await expect(giftCard.locator('.gift-title')).not.toContainText('...');
    await expect(cta).toHaveAttribute('target', '_blank');
    for (const token of ['nofollow', 'sponsored', 'noopener']) {
        await expect(cta).toHaveAttribute('rel', new RegExp(`\\b${token}\\b`));
    }
    await expect(giftCard.locator('.gift-title')).toContainText('Produit test');
    await expect(giftCard.locator('.gift-owner')).toContainText('Paul');

    // Visibilité (mobile et desktop) : CTA visible, cible tactile ≥ 44 px, dans la largeur de l'écran
    await cta.scrollIntoViewIfNeeded();
    const box = await cta.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    for (const btn of await giftCard.locator('.btn-nav-suggestion').all()) {
        await expect(btn).toHaveAttribute('aria-label', /Suggestion (précédente|suivante)/);
        const b = await btn.boundingBox();
        if (b) expect(Math.round(b.height)).toBeGreaterThanOrEqual(44);
    }

    // Clic : Amazon s'ouvre dans un nouvel onglet dans le geste (pas de window.open différé),
    // la modale de remerciement s'affiche et se ferme avec Échap
    await page.context().route('https://www.amazon.fr/**', route => route.fulfill({ body: '<html><title>Amazon</title></html>', contentType: 'text/html' }));
    const [popup] = await Promise.all([page.waitForEvent('popup'), cta.click()]);
    expect(popup.url()).toContain(`tag=${AFFILIATE_TAG}`);
    await popup.close();
    const modal = page.locator('#purchaseModal');
    await expect(modal).toBeVisible();
    await expect(page.locator('#closePurchaseModal')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // 2e idée : lien de recherche Amazon taggé (aucun appel RapidAPI supplémentaire)
    await giftCard.locator('.btn-next').click();
    const ideaCard = page.locator('.gift-card-search').first();
    await expect(ideaCard).toBeVisible();
    await expect(ideaCard.locator('.gift-title')).toHaveText('Idée : gourde isotherme');
    const ideaUrl = new URL(/** @type {string} */ (await ideaCard.locator('a.btn-amazon-cta').getAttribute('href')));
    expect(ideaUrl.origin + ideaUrl.pathname).toBe('https://www.amazon.fr/s');
    expect(ideaUrl.searchParams.get('k')).toBe('gourde isotherme');
    expect(ideaUrl.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
    await expect(ideaCard.locator('a.btn-amazon-cta')).toHaveAttribute('rel', /\bsponsored\b/);
    expect(searchRequests).toHaveLength(1);

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
});
