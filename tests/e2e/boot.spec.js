// @ts-check
// Garde-fou de démarrage de analyse.html (public/js/analyse-boot.js) : si le module de l'analyse ne peut pas
// être chargé ou lu, la page ne doit plus rester bloquée sur « 0% - Initialisation... ».
const { test, expect, analyzeResponse } = require('./fixtures');

const FINAL_DATA = JSON.stringify({
    contexte: 'Noël',
    equipe: [{ nom: 'Léa', sexe: 'Femme', age: 30, budget: 40, tags: ['Voyage'], details: { adore: '', eviter: '' } }],
});

async function seed(page) {
    await page.addInitScript((data) => {
        if (!sessionStorage.getItem('__seeded')) {
            localStorage.setItem('finalData', data);
            sessionStorage.setItem('__seeded', '1');
        }
    }, FINAL_DATA);
    await page.route('**/api/analyze', (route) => route.fulfill({
        json: analyzeResponse([{ term: 'trousse de voyage', reason: 'Elle voyage', prix_estime: '30€' }]),
    }));
    await page.route('**/api/search?**', (route) => route.fulfill({
        json: { search_results: [{ title: 'Trousse', link: 'https://www.amazon.fr/dp/B0BOOTTEST', asin: 'B0BOOTTEST', price: { value: 29, raw: '29 €' }, rating: 4.5, reviews: 10 }] },
    }));
}

/** Erreurs console hors chargements volontairement refusés ou cassés par le test. */
const unexpected = (errors) => errors.filter((e) => !/Failed to load resource|retention\.js|SyntaxError|Unexpected token|module script/i.test(e));

test('module dépendant bloqué : message clair et « Réessayer », profils conservés, nouvel essai réussi', async ({ page }) => {
    await seed(page);
    let blocked = true;
    await page.route('**/js/analyse/retention.js*', (route) => (blocked ? route.abort('blockedbyclient') : route.continue()));

    await page.goto('/analyse.html');
    const error = page.locator('.boot-error');
    await expect(error).toBeVisible({ timeout: 5000 });
    await expect(error).toHaveAttribute('role', 'alert');
    await expect(error).toContainText("Le chargement de l'analyse a échoué");
    await expect(page.locator('#statusIndicator')).toBeHidden();
    await expect(page.getByText('0% - Initialisation...')).toBeHidden();
    // L'analyse n'a pas démarré : les profils sont toujours là pour « Réessayer »
    expect(await page.evaluate(() => localStorage.getItem('finalData'))).not.toBeNull();

    blocked = false;
    await error.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.boot-error')).toHaveCount(0);
});

test('module illisible (fonction non supportée par le navigateur) : message au lieu du blocage', async ({ page }) => {
    await seed(page);
    await page.route('**/js/analyse/retention.js*', (route) => route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        body: 'export const casse = ;',
    }));
    await page.goto('/analyse.html');
    await expect(page.locator('.boot-error')).toBeVisible({ timeout: 5000 });
    expect(['load', 'script']).toContain(await page.locator('.boot-error').getAttribute('data-reason'));
});

test('module qui ne répond jamais : message après le délai de garde', async ({ page }) => {
    await seed(page);
    // Délai de garde raccourci pour le test (attribut data-timeout-ms de la balise du garde-fou)
    await page.route('**/analyse.html', async (route) => {
        const response = await route.fetch();
        const html = (await response.text()).replace('<script src="/js/analyse-boot.js">', '<script src="/js/analyse-boot.js" data-timeout-ms="1500">');
        expect(html).toContain('data-timeout-ms="1500"'); // la balise du garde-fou a bien été trouvée
        await route.fulfill({ response, body: html });
    });
    await page.route('**/js/analyse.js*', () => { /* jamais de réponse */ });

    // Le module en attente retarde DOMContentLoaded : on n'attend que la réception de la page
    await page.goto('/analyse.html', { waitUntil: 'commit' });
    const error = page.locator('.boot-error');
    await expect(error).toBeVisible({ timeout: 6000 });
    await expect(error).toHaveAttribute('data-reason', 'timeout');
});

test('connexion lente : le message de garde disparaît dès que l\'analyse démarre, résultats affichés', async ({ page }) => {
    await seed(page);
    await page.route('**/analyse.html', async (route) => {
        const response = await route.fetch();
        const html = (await response.text()).replace('<script src="/js/analyse-boot.js">', '<script src="/js/analyse-boot.js" data-timeout-ms="1000">');
        expect(html).toContain('data-timeout-ms="1000"');
        await route.fulfill({ response, body: html });
    });
    // Module principal servi avec 2,5 s de retard : au-delà du délai de garde, mais il finit par arriver
    await page.route('**/js/analyse.js*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.continue();
    });

    await page.goto('/analyse.html', { waitUntil: 'commit' });
    await expect(page.locator('.boot-error')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.boot-error')).toHaveCount(0);
});

test('erreur dans un script facultatif (sw-register.js) : aucune fausse alerte', async ({ page }) => {
    await seed(page);
    await page.route('**/js/sw-register.js', (route) => route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        body: 'throw new Error("panne volontaire du script facultatif");',
    }));
    await page.goto('/analyse.html');
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.boot-error')).toHaveCount(0);
});

test('« Modifier ma recherche » depuis le message : profils effacés, retour à la configuration', async ({ page }) => {
    await seed(page);
    await page.route('**/js/analyse/retention.js*', (route) => route.abort('blockedbyclient'));
    await page.goto('/analyse.html');
    await page.locator('.boot-error').getByRole('button', { name: 'Modifier ma recherche' }).click();
    await page.waitForURL('**/config.html');
    expect(await page.evaluate(() => localStorage.getItem('finalData'))).toBeNull();
});

test('script facultatif bloqué (analytics.js) : aucune fausse alerte, analyse normale', async ({ page, consoleErrors }) => {
    await seed(page);
    await page.route('**/js/analytics.js', (route) => route.abort('blockedbyclient'));
    await page.goto('/analyse.html');
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.boot-error')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-analyse-boot'))).toBe('started');
    expect(unexpected(consoleErrors)).toEqual([]);
});

test('échec ponctuel d\'un module : réparation et rechargement automatiques, analyse réussie sans message', async ({ page }) => {
    await seed(page);
    let failures = 0;
    await page.route('**/js/analyse/retention.js*', (route) => {
        if (failures === 0) {
            failures += 1;
            return route.abort('blockedbyclient');
        }
        return route.continue();
    });
    let loads = 0;
    page.on('load', () => { loads += 1; });

    await page.goto('/analyse.html');
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.boot-error')).toHaveCount(0);
    expect(failures).toBe(1);
    expect(loads).toBeGreaterThanOrEqual(2); // un rechargement automatique a eu lieu
    // Analyse démarrée : le drapeau de réparation est oublié
    expect(await page.evaluate(() => sessionStorage.getItem('offrezBootRepair'))).toBeNull();
});

test('échec persistant : un seul rechargement automatique (pas de boucle), puis message avec code de diagnostic', async ({ page }) => {
    await seed(page);
    await page.route('**/js/analyse/retention.js*', (route) => route.fulfill({
        contentType: 'text/javascript; charset=utf-8',
        body: 'export const casse = ;',
    }));
    let navigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });

    await page.goto('/analyse.html');
    const error = page.locator('.boot-error');
    await expect(error).toBeVisible({ timeout: 8000 });
    // Laisse le temps à un éventuel rechargement en trop de se produire
    await page.waitForTimeout(1500);
    expect(navigations).toBe(2); // chargement initial + une seule réparation
    const code = error.locator('.boot-error-code');
    await expect(code).toContainText('Code :');
    await expect(code).toContainText('réparation faite');
    expect(await page.evaluate(() => localStorage.getItem('finalData'))).not.toBeNull();
});
