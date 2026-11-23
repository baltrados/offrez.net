// @ts-check
// Correctifs de l'audit fonctionnel : débordement des pages légales sur mobile, budget minimum de 5 €,
// cibles tactiles de 44 px.
const { test, expect, expectNoHorizontalOverflow } = require('./fixtures');

for (const path of ['/politique-confidentialite.html', '/mentions-legales.html', '/cgu.html']) {
    test(`${path} : aucun débordement horizontal`, async ({ page }) => {
        await page.goto(path);
        await expectNoHorizontalOverflow(page);
    });
}

test('profils : budget inférieur à 5 € refusé (aucune analyse lancée)', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('giftConfig', JSON.stringify({ occasion: 'Noël', nb: 1, strategy: 'custom', amount: null }));
    });
    await page.goto('/profils.html');
    const card = page.locator('.profile-card').first();
    await card.locator('.p-name').fill('Léa');
    await card.locator('.p-budget').fill('3');
    await page.locator('#launchAnalysis').click();
    await expect(page.locator('#launchError')).toContainText('Budget trop faible pour Léa (minimum 5€)');
    await expect(page).toHaveURL(/profils\.html$/);
    expect(await page.evaluate(() => localStorage.getItem('finalData'))).toBeNull();

    await card.locator('.p-budget').fill('5');
    await page.route('**/api/**', (route) => route.abort());
    await page.locator('#launchAnalysis').click();
    await page.waitForURL('**/analyse.html');
});

test('configuration « même budget » : moins de 5 € bloqué par le navigateur (min="5")', async ({ page }) => {
    await page.goto('/config.html');
    await page.locator('#nbPeople').fill('2');
    await page.locator('.budget-strategy-radio[value="same"]').click({ force: true });
    await page.locator('#budgetAmount').fill('4');
    await page.locator('.btn-next').click();
    await expect(page).toHaveURL(/config\.html$/);
    expect(await page.locator('#budgetAmount').evaluate((el) => /** @type {HTMLInputElement} */ (el).validity.rangeUnderflow)).toBe(true);
});

test('configuration « budget total » : réparti à moins de 5 € par personne refusé', async ({ page }) => {
    await page.goto('/config.html');
    await page.locator('#nbPeople').fill('3');
    await page.locator('.budget-strategy-radio[value="global"]').click({ force: true });
    await page.locator('#budgetAmount').fill('12'); // ≥ 5 pour le navigateur, mais 4 € par personne
    await page.locator('.btn-next').click();
    await expect(page.locator('#configError')).toHaveText('Budget trop faible : au moins 5€ par personne (actuellement 4€).');
    await expect(page).toHaveURL(/config\.html$/);
});

test('cibles tactiles d\'au moins 44 px : logo, pied de page, fil d\'Ariane, puces, champs, suppression de profil, liens légaux', async ({ page }) => {
    const tooSmall = async (selector) => page.locator(selector).evaluateAll((els) => els
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => ({ t: (el.textContent || el.getAttribute('aria-label') || el.className).trim().slice(0, 30), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
        .filter((r) => r.h < 43.5 || r.w < 43.5));

    await page.goto('/blog/cadeau-noel-pas-cher.html');
    expect(await tooSmall('.logo-link, .footer-links a, .breadcrumb a')).toEqual([]);

    await page.goto('/config.html');
    expect(await tooSmall('.occasion-chip, #nbPeople')).toEqual([]);

    await page.addInitScript(() => {
        localStorage.setItem('giftConfig', JSON.stringify({ occasion: 'Noël', nb: 2, strategy: 'custom', amount: null }));
    });
    await page.goto('/profils.html');
    expect(await tooSmall('.btn-delete, .gender-chip, .p-name, .p-budget, .p-age')).toEqual([]);

    await page.goto('/mentions-legales.html');
    expect(await tooSmall('.legal-links a, .footer-links a')).toEqual([]);
});
