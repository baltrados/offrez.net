// @ts-check
// Lot 3 : articles avec liens de recherche Amazon taggés, liens de pré-remplissage de l'outil.
const { test, expect, AFFILIATE_TAG, expectNoHorizontalOverflow } = require('./fixtures');

const ARTICLES = [
    '/blog/cadeau-noel-pas-cher.html',
    '/blog/cadeau-couple-saint-valentin.html',
    '/blog/cadeau-saint-valentin-homme.html',
    '/blog/cadeau-saint-valentin-femme.html',
    '/blog/cadeau-saint-valentin-moins-de-30-euros.html',
];

for (const path of ARTICLES) {
    test(`${path} : mention d'affiliation, liens Amazon taggés et sûrs, outil pré-rempli`, async ({ page, consoleErrors }) => {
        await page.goto(path);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('.affiliate-notice')).toBeVisible();

        const links = page.locator('a.gift-pick-cta');
        expect(await links.count()).toBeGreaterThanOrEqual(8);
        for (const link of await links.all()) {
            const url = new URL(/** @type {string} */ (await link.getAttribute('href')));
            expect(url.origin + url.pathname).toBe('https://www.amazon.fr/s');
            expect(url.searchParams.get('k')?.length).toBeGreaterThan(2);
            expect(url.searchParams.getAll('tag')).toEqual([AFFILIATE_TAG]);
            await expect(link).toHaveAttribute('target', '_blank');
            await expect(link).toHaveAttribute('rel', /\bnofollow\b.*\bsponsored\b.*\bnoopener\b/);
            const box = await link.boundingBox();
            expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        }

        // Les appels à l'action mènent à l'outil avec une occasion valide
        const ctas = page.locator('.cta-banner-blog a[href*="config.html?"]');
        expect(await ctas.count()).toBeGreaterThanOrEqual(2);
        for (const a of await ctas.all()) {
            const href = /** @type {string} */ (await a.getAttribute('href'));
            expect(new URL(href, 'https://offrez.net/blog/').searchParams.get('occasion')).toMatch(/^(Noël|Saint-Valentin)$/);
        }

        // Données structurées valides (JSON) : BlogPosting + BreadcrumbList
        const ld = JSON.parse(/** @type {string} */ (await page.locator('script[type="application/ld+json"]').textContent()));
        expect(ld.map((x) => x['@type'])).toEqual(['BlogPosting', 'BreadcrumbList']);

        await expectNoHorizontalOverflow(page);
        expect(consoleErrors).toEqual([]);
    });
}

test('config.html?occasion=Saint-Valentin&budget=30 : occasion et budget par personne pré-remplis', async ({ page }) => {
    await page.goto('/config.html?occasion=Saint-Valentin&budget=30');
    await expect(page.locator('.occasion-chip[data-value="Saint-Valentin"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#occasion')).toHaveValue('Saint-Valentin');
    await expect(page.locator('#budgetStrategy')).toHaveValue('same');
    await expect(page.locator('#budgetAmount')).toHaveValue('30');
    await expect(page.locator('#budgetAmountContainer')).toBeVisible();
});

test('config.html : paramètres invalides ignorés (occasion inconnue, budget hors bornes)', async ({ page }) => {
    await page.goto('/config.html?occasion=%3Cscript%3E&budget=999999');
    await expect(page.locator('.occasion-chip[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#occasion')).not.toHaveValue('<script>');
    await expect(page.locator('#budgetStrategy')).toHaveValue('custom');
});

test('lien d\'article → outil pré-rempli (parcours réel)', async ({ page }) => {
    await page.goto('/blog/cadeau-noel-pas-cher.html');
    await page.locator('.cta-banner-blog a[href*="budget=15"]').click();
    await page.waitForURL('**/config.html?**');
    await expect(page.locator('#occasion')).toHaveValue('Noël');
    await expect(page.locator('#budgetAmount')).toHaveValue('15');
});
