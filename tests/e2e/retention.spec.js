// @ts-check
// Lot 4 : sous les résultats, compléments cadeau (liens taggés), partage de la liste, rappel calendrier (.ics).
const { test, expect, AFFILIATE_TAG, analyzeResponse, expectNoHorizontalOverflow } = require('./fixtures');

async function seed(page) {
    await page.addInitScript((data) => {
        if (!sessionStorage.getItem('__seeded')) {
            localStorage.setItem('finalData', data);
            sessionStorage.setItem('__seeded', '1');
        }
        // Partage : pas de feuille de partage native en test, presse-papiers simulé
        Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText: (t) => { window.__copied = t; return Promise.resolve(); } },
            configurable: true,
        });
    }, JSON.stringify({
        contexte: 'Saint-Valentin',
        equipe: [{ nom: 'Julie', sexe: 'Femme', age: 30, budget: 50, tags: ['Voyage'], details: { adore: '', eviter: '' } }],
    }));
    await page.route('**/api/analyze', (route) => route.fulfill({
        json: analyzeResponse([
            { term: 'trousse de voyage', reason: 'Elle voyage', prix_estime: '30€' },
            { term: 'oreiller de voyage', reason: 'Confort', prix_estime: '25€' },
        ]),
    }));
    await page.route('**/api/search?**', (route) => route.fulfill({
        json: {
            search_results: [{
                title: 'Trousse de toilette', link: 'https://www.amazon.fr/dp/B0RETENT01', image: 'https://m.media-amazon.com/i.jpg',
                price: { value: 29.9, raw: '29,90 €' }, rating: 4.6, reviews: 300, asin: 'B0RETENT01', is_prime: true,
            }],
        },
    }));
}

test('compléments cadeau en liens taggés, liste partagée, rappel calendrier téléchargé', async ({ page, consoleErrors }) => {
    await seed(page);
    await page.goto('/analyse.html');
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });

    const tools = page.locator('.retention-tools');
    await expect(tools).toBeVisible();

    // Compléments : 4 liens de recherche amazon.fr taggés, ouverts dans un nouvel onglet
    const addons = tools.locator('a.addon-link');
    await expect(addons).toHaveCount(4);
    for (const a of await addons.all()) {
        const url = new URL(/** @type {string} */ (await a.getAttribute('href')));
        expect(url.origin + url.pathname).toBe('https://www.amazon.fr/s');
        expect(url.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
        await expect(a).toHaveAttribute('target', '_blank');
        await expect(a).toHaveAttribute('rel', /\bnofollow\b.*\bsponsored\b.*\bnoopener\b/);
    }

    // Partage (repli presse-papiers) : prénom, élément affiché, lien affilié
    await tools.getByRole('button', { name: /Partager ma liste/ }).click();
    await expect(tools.locator('#retentionFeedback')).toHaveText('Liste copiée !');
    const copied = /** @type {string} */ (await page.evaluate(() => /** @type {any} */ (window).__copied));
    expect(copied).toContain('🎁 Julie : Trousse de toilette');
    expect(copied).toContain(`https://www.amazon.fr/dp/B0RETENT01?tag=${AFFILIATE_TAG}`);

    // Le partage suit la suggestion affichée (2e idée = lien de recherche)
    await page.locator('.gift-card .btn-next').first().click();
    await tools.getByRole('button', { name: /Partager ma liste/ }).click();
    const copied2 = /** @type {string} */ (await page.evaluate(() => /** @type {any} */ (window).__copied));
    expect(copied2).toContain('Idée : oreiller de voyage');

    // Rappel : date proposée = prochaine Saint-Valentin ; fichier .ics téléchargé, sans prénom
    const dateInput = tools.locator('#reminderDate');
    await expect(dateInput).toHaveValue(/^\d{4}-02-14$/);
    await dateInput.fill('2027-02-14');
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        tools.getByRole('button', { name: /Ajouter à mon agenda/ }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('offrez-rappel-cadeau.ics');
    const ics = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString('utf8'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20270214');
    expect(ics).toContain('TRIGGER:-P7D');
    expect(ics).toContain('SUMMARY:🎁 Saint-Valentin : penser au cadeau');
    expect(ics).not.toContain('Julie');

    // Date invalide : message, pas de téléchargement
    await dateInput.fill('');
    await tools.getByRole('button', { name: /Ajouter à mon agenda/ }).click();
    await expect(tools.locator('#retentionFeedback')).toHaveText('Choisissez une date valide.');

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
});

test('résultats restaurés après rechargement : panier, navigation, suggestion affichée et outils conservés', async ({ page }) => {
    await seed(page);
    await page.goto('/analyse.html');
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });

    await page.reload();
    const card = page.locator('.gift-card').first();
    await expect(card.locator('.gift-title')).toContainText('Trousse de toilette');
    await expect(page.locator('#cartContainer .btn-cart')).toHaveAttribute('href', /ASIN\.1=B0RETENT01/);
    await expect(page.locator('.retention-tools a.addon-link')).toHaveCount(4);
    await expect(page.locator('#reminderDate')).toHaveValue(/^\d{4}-02-14$/);

    // Navigation sur les résultats restaurés, puis nouveau rechargement : la suggestion regardée est retrouvée
    await card.locator('.btn-next').click();
    await expect(page.locator('.gift-card').first().locator('.gift-title')).toHaveText('Idée : oreiller de voyage');
    await page.reload();
    await expect(page.locator('.gift-card').first().locator('.gift-title')).toHaveText('Idée : oreiller de voyage');
});
