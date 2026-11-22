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

test('/profils.html avec configuration : pas de débordement horizontal', async ({ page, consoleErrors }) => {
    // Régression : les checkboxes masquées des centres d'intérêt (input.p-tag) débordaient sur desktop
    // (scrollWidth ≈ 1985 px pour 1280 px) avant le correctif `.tag-chip { position: relative }` + visually-hidden.
    await page.addInitScript(() => {
        localStorage.setItem('giftConfig', JSON.stringify({ occasion: 'Noël', nb: 2, strategy: 'custom', amount: null }));
    });
    await page.goto('/profils.html');
    await expect(page.locator('.profile-card')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
});
