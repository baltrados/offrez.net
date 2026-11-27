// @ts-check
// Correctifs d'accessibilité (2026-11-27) : structure de profils.html, hiérarchie des titres, fil d'étapes,
// état des montants rapides, contraste du badge d'étape, puces des pages légales, focus de la modale d'achat.
const { test, expect, analyzeResponse } = require('./fixtures');

const GIFT_CONFIG = JSON.stringify({ occasion: 'Noël', nb: 2, strategy: 'custom', amount: null });

test('profils : tout le contenu reste dans <main> (plus de </div> orphelin), fiches en h2 sous le h1', async ({ page }) => {
    await page.addInitScript((cfg) => localStorage.setItem('giftConfig', cfg), GIFT_CONFIG);
    await page.goto('/profils.html');
    await expect(page.locator('.profile-card').first()).toBeVisible();

    for (const sel of ['#launchAnalysis', '#launchError', '.cta-microcopy', '.loss-aversion-hint', '.security-note']) {
        await expect(page.locator(`.app-shell main ${sel}`), `${sel} dans .app-shell > main`).toHaveCount(1);
    }
    await expect(page.locator('main h1')).toHaveCount(1);
    await expect(page.locator('main h3')).toHaveCount(0); // plus de saut h1 → h3
    const titles = page.locator('main h2.profile-title');
    await expect(titles).toHaveCount(2);
    await expect(titles.first()).toHaveText('Bénéficiaire #1');
});

test('profils : badge d\'étape en couleur contrastée (#a5b4fc)', async ({ page }) => {
    await page.addInitScript((cfg) => localStorage.setItem('giftConfig', cfg), GIFT_CONFIG);
    await page.goto('/profils.html');
    await expect(page.locator('.badge-step')).toHaveCSS('color', 'rgb(165, 180, 252)');
});

test('fil d\'étapes : liste de 3 étapes pour les lecteurs d\'écran, connecteurs masqués', async ({ page }) => {
    await page.addInitScript((cfg) => localStorage.setItem('giftConfig', cfg), GIFT_CONFIG);
    for (const path of ['/config.html', '/profils.html']) {
        await page.goto(path);
        const list = page.getByRole('list', { name: 'Étapes' });
        await expect(list).toHaveCount(1);
        await expect(list.getByRole('listitem')).toHaveCount(3);
        await expect(page.locator('.step-connector:not([aria-hidden="true"])')).toHaveCount(0);
    }
});

test('config : montants rapides → aria-pressed suit la sélection', async ({ page }) => {
    await page.goto('/config.html');
    // Les montants rapides n'apparaissent qu'avec un budget fixé (pas en « Budget personnalisé »)
    await page.getByRole('radio', { name: /Même budget par personne/ }).check({ force: true });
    await expect(page.locator('#budgetAmountContainer')).toBeVisible();
    const chips = page.locator('.chip-cro');
    await expect(chips).toHaveCount(4);
    await expect(page.locator('.chip-cro[aria-pressed="true"]')).toHaveCount(0);

    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.chip-cro[aria-pressed="true"]')).toHaveCount(1);

    await chips.nth(3).focus();
    await page.keyboard.press('Enter');
    await expect(chips.nth(3)).toHaveAttribute('aria-pressed', 'true');
    await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#budgetAmount')).toHaveValue('200');
});

test('pages légales : puces « • » (plus de « ? »)', async ({ page }) => {
    await page.goto('/mentions-legales.html');
    const content = await page.locator('.legal-section li').first().evaluate((el) => getComputedStyle(el, '::before').content);
    expect(content).toBe('"•"');
});

test('modale d\'achat : Tab et Maj+Tab restent dans la fenêtre, Échap la ferme', async ({ page }) => {
    const person = (nom) => ({ nom, sexe: 'Femme', age: 35, budget: 50, tags: ['Voyage'], details: { adore: '', eviter: '' } });
    await page.addInitScript((data) => localStorage.setItem('finalData', data),
        JSON.stringify({ contexte: 'Noël', equipe: [person('Julie'), person('Marie')] }));
    await page.route('**/api/analyze', (route) => route.fulfill({
        json: analyzeResponse([{ term: 'trousse de voyage', reason: 'Elle voyage', prix_estime: '30€' }]),
    }));
    let n = 0;
    await page.route('**/api/search?**', (route) => {
        n++;
        return route.fulfill({
            json: { search_results: [{ title: `Trousse ${n}`, link: `https://www.amazon.fr/dp/B0FOCUS00${n}`, asin: `B0FOCUS00${n}`, price: { value: 29, raw: '29 €' }, rating: 4.5, reviews: 10 }] },
        });
    });
    await page.context().route('https://www.amazon.fr/**', (route) => route.fulfill({ body: '<html></html>', contentType: 'text/html' }));

    await page.goto('/analyse.html');
    const cards = page.locator('.gift-card');
    await expect(cards).toHaveCount(2, { timeout: 15000 });
    const [popup] = await Promise.all([page.waitForEvent('popup'), cards.nth(0).locator('a.btn-amazon-cta').click()]);
    await popup.close();

    const modal = page.locator('#purchaseModal');
    await expect(modal).toBeVisible();
    const content = modal.locator('.modal-content');
    const insideModal = () => content.evaluate((el) => el.contains(document.activeElement));
    await expect(page.locator('#closePurchaseModal')).toBeFocused();

    for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Tab');
        expect(await insideModal(), `Tab n°${i + 1} : focus dans la modale`).toBe(true);
    }
    for (let i = 0; i < 8; i++) {
        await page.keyboard.press('Shift+Tab');
        expect(await insideModal(), `Maj+Tab n°${i + 1} : focus dans la modale`).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
});
