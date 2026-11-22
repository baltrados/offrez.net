// @ts-check
// Non-régression XSS du rendu des cartes (analyse.html) : données IA / Amazon / profil hostiles.
// Les réponses API sont mockées côté navigateur (page.route), donc NON normalisées par le serveur :
// on vérifie la défense côté client (escapeHtml, buildAffiliateUrl, sanitizeUrl).
const { test, expect, AFFILIATE_TAG } = require('./fixtures');

test('analyse.html : charges XSS dans titre, note, lien, image, prix, raison et prénom neutralisées', async ({ page, consoleErrors }) => {
    const finalData = {
        contexte: 'Anniversaire',
        equipe: [{
            nom: '<img src=x onerror="window.__xss=\'nom\'">Léa',
            sexe: 'Femme',
            age: 30,
            budget: 50,
            tags: ['Lecture'],
            details: { adore: '<script>window.__xss="adore"</script>', eviter: '' },
        }],
    };
    await page.addInitScript((data) => {
        localStorage.setItem('finalData', data);
    }, JSON.stringify(finalData));

    await page.route('**/api/analyze', (route) => route.fulfill({
        json: {
            suggestions: [{
                term: 'livre <b>polar</b>',
                reason: '<img src=x onerror="window.__xss=\'reason\'">Une raison',
                prix_estime: '30€',
            }],
        },
    }));
    await page.route('**/api/search?**', (route) => route.fulfill({
        json: {
            search_results: [{
                title: '<img src=x onerror="window.__xss=\'title\'">Livre piégé',
                rating: '4.5<img src=x onerror="window.__xss=\'rating\'">',
                link: 'https://www.amazon.fr/dp/B0XSSXSS01?tag=old" onmouseover="window.__xss=\'link\'" x="',
                image: 'https://m.media-amazon.com/i.jpg" onerror="window.__xss=\'image\'',
                price: { value: 29.99, raw: '<b onmouseover="window.__xss=\'price\'">29,99 €</b>', currency: 'EUR' },
                reviews: 100,
                asin: '"><svg onload="window.__xss=\'asin\'">',
                is_prime: false,
            }],
        },
    }));

    await page.goto('/analyse.html');
    const card = page.locator('.gift-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });

    // Interactions qui déclencheraient des handlers injectés
    const cta = card.locator('a.btn-amazon-cta');
    await cta.hover();
    await card.locator('.gift-price').hover();
    await page.waitForTimeout(300);

    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();

    // Une seule image dans la carte (celle du produit), aucun élément injecté
    await expect(card.locator('img')).toHaveCount(1);
    await expect(page.locator('#singleResult svg, #singleResult script, #singleResult b')).toHaveCount(0);
    const injectedHandlers = await page.evaluate(() =>
        Array.from(document.querySelectorAll('#singleResult *, #cartContainer *'))
            .filter((el) => Array.from(el.attributes).some((a) => /^on/i.test(a.name)))
            .map((el) => el.outerHTML.slice(0, 120))
    );
    expect(injectedHandlers).toEqual([]);

    // Le texte hostile est affiché comme texte
    await expect(card.locator('.gift-title')).toContainText('<img src=x');
    await expect(card.locator('.gift-owner')).toContainText('<img src=x');

    // Image : l'attribut src contient la chaîne entière (pas de sortie d'attribut)
    const imgAttrs = await card.locator('img').evaluate((img) => img.getAttributeNames());
    expect(imgAttrs.sort()).toEqual(['alt', 'loading', 'src']);

    // Lien affilié : https Amazon, un seul tag (le nôtre), guillemet encodé
    const href = /** @type {string} */ (await cta.getAttribute('href'));
    expect(href.startsWith('https://www.amazon.fr/dp/B0XSSXSS01?')).toBe(true);
    expect(href).not.toContain('"');
    expect(new URL(href).searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
    const ctaAttrs = await cta.evaluate((a) => a.getAttributeNames());
    expect(ctaAttrs.filter((n) => n.startsWith('on'))).toEqual([]);

    expect(consoleErrors).toEqual([]);
});

test('analyse.html : lien produit hors Amazon → CTA neutralisé (#)', async ({ page }) => {
    const finalData = {
        contexte: 'Noël',
        equipe: [{ nom: 'Tom', sexe: 'Homme', age: 40, budget: 80, tags: [], details: { adore: '', eviter: '' } }],
    };
    await page.addInitScript((data) => {
        localStorage.setItem('finalData', data);
    }, JSON.stringify(finalData));
    await page.route('**/api/analyze', (route) => route.fulfill({
        json: { suggestions: [{ term: 'coffret whisky', reason: 'r', prix_estime: '60€' }] },
    }));
    await page.route('**/api/search?**', (route) => route.fulfill({
        json: {
            search_results: [{
                title: 'Coffret whisky',
                link: 'javascript:window.__xss="js"',
                image: null,
                price: { value: 59, raw: '59 €' },
                rating: 4.2,
                reviews: 40,
            }],
        },
    }));

    await page.goto('/analyse.html');
    const cta = page.locator('.gift-card a.btn-amazon-cta').first();
    await expect(cta).toBeVisible({ timeout: 15000 });
    await expect(cta).toHaveAttribute('href', '#');
    expect(await page.evaluate(() => /** @type {any} */ (window).__xss)).toBeUndefined();
});
