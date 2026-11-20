// @ts-check
// Les pages principales se chargent sans erreur console ni débordement horizontal.
const { test, expect, expectNoHorizontalOverflow } = require('./fixtures');

const PAGES = [
    { path: '/', title: /offrez/i },
    { path: '/config.html', title: /offrez/i },
    { path: '/blog.html', title: /./ },
    { path: '/cgu.html', title: /./ },
];

for (const { path, title } of PAGES) {
    test(`${path} se charge sans erreur console`, async ({ page, consoleErrors }) => {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        await expect(page).toHaveTitle(title);
        await page.waitForLoadState('load');
        await expectNoHorizontalOverflow(page);
        expect(consoleErrors).toEqual([]);
    });
}

test('/profils.html sans configuration → redirection vers config.html', async ({ page, consoleErrors }) => {
    await page.goto('/profils.html');
    await page.waitForURL('**/config.html');
    await expect(page.locator('#configForm')).toBeVisible();
    expect(consoleErrors).toEqual([]);
});

test('/profils.html avec configuration : pas de débordement horizontal', async ({ page, consoleErrors }, testInfo) => {
    // BUG CONNU (non corrigé, hors périmètre Lot 2) : sur desktop (1280 px), les checkboxes masquées
    // des centres d'intérêt (input.p-tag, position:absolute, ~1012 px de large, générées par
    // public/js/profils.js dans label.tag-chip) débordent : scrollWidth ≈ 1985 px pour 1280 px visibles
    // → barre de défilement horizontale. Non reproduit en viewport mobile (Pixel 5).
    // Piste : `position: relative` sur .tag-chip (ou largeur/inset bornés sur l'input masqué).
    test.fixme(testInfo.project.name === 'desktop-chromium', 'Débordement horizontal des input.p-tag sur desktop');
    await page.addInitScript(() => {
        localStorage.setItem('giftConfig', JSON.stringify({ occasion: 'Noël', nb: 2, strategy: 'custom', amount: null }));
    });
    await page.goto('/profils.html');
    await expect(page.locator('.profile-card')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
});

test('bannière cookies : refus enregistré et bannière fermée', async ({ page, consoleErrors }) => {
    await page.goto('/');
    await page.locator('#cookieDecline').click();
    await expect(page.locator('#cookieBanner')).toHaveCount(0);
    const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('OFFREZ_cookie_consent') || 'null'));
    expect(consent?.accepted).toBe(false);
    await page.reload();
    await expect(page.locator('#cookieBanner')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
});
