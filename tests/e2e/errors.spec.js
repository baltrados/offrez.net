// @ts-check
// Comportement de analyse.html en cas d'échec : message générique, aucun détail technique.
const { test, expect } = require('./fixtures');

const FINAL_DATA = {
    contexte: 'Anniversaire',
    equipe: [{ nom: 'Julie', sexe: 'Femme', age: 28, budget: 50, tags: ['Voyage'], details: { adore: '', eviter: '' } }],
};

test('/api/analyze en 500 → état d\'erreur générique avec « Réessayer » et « Modifier ma recherche »', async ({ page, consoleErrors }) => {
    await page.addInitScript((data) => {
        localStorage.setItem('finalData', data);
    }, JSON.stringify(FINAL_DATA));

    let analyzeCalls = 0;
    let searchCalls = 0;
    await page.route('**/api/analyze', (route) => {
        analyzeCalls++;
        return route.fulfill({
            status: 500,
            json: { error: 'Erreur serveur interne' },
        });
    });
    await page.route('**/api/search?**', (route) => {
        searchCalls++;
        return route.fulfill({ json: { search_results: [] } });
    });

    await page.goto('/analyse.html');

    // 2 tentatives (retry) puis état d'erreur dédié (role="alert") à la place du spinner
    const errorState = page.locator('#singleResult .analysis-error');
    await expect(errorState).toBeVisible({ timeout: 15000 });
    await expect(errorState).toHaveAttribute('role', 'alert');
    await expect(errorState).toContainText('Un petit souci technique');
    await expect(page.locator('#singleResult .no-results')).toHaveCount(0);
    await expect(page.locator('#statusIndicator')).toBeHidden();
    expect(analyzeCalls).toBe(2);
    expect(searchCalls).toBe(0);

    const visibleText = await page.locator('body').innerText();
    for (const forbidden of [/\b500\b/, /googleapis/i, /Erreur serveur interne/, /stack/i, /Error:/, /Erreur API/]) {
        expect(visibleText).not.toMatch(forbidden);
    }
    await expect(page.locator('.gift-card')).toHaveCount(0);

    // Boutons construits sans onclick inline (CSP) et fonctionnels
    const retry = errorState.getByRole('button', { name: 'Réessayer' });
    const edit = errorState.getByRole('button', { name: 'Modifier ma recherche' });
    await expect(retry).toBeVisible();
    await expect(edit).toBeVisible();
    const inlineHandlers = await errorState.evaluate((el) =>
        Array.from(el.querySelectorAll('*')).filter((n) => Array.from(n.attributes).some((a) => /^on/i.test(a.name))).length
    );
    expect(inlineHandlers).toBe(0);

    // « Réessayer » relance l'analyse (rechargement → 2 nouveaux appels)
    await retry.click();
    await expect(page.locator('#singleResult .analysis-error')).toBeVisible({ timeout: 15000 });
    expect(analyzeCalls).toBe(4);

    // « Modifier ma recherche » → config.html
    await page.locator('#singleResult .analysis-error').getByRole('button', { name: 'Modifier ma recherche' }).click();
    await page.waitForURL('**/config.html');
    await expect(page.locator('#configForm')).toBeVisible();
    // RGPD : la copie de session des profils (gardée pour « Réessayer ») est supprimée en quittant l'analyse
    expect(await page.evaluate(() => sessionStorage.getItem('finalData'))).toBeNull();
    // Seuls les « Failed to load resource » des 500 mockés sont tolérés (aucune exception JS)
    expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});

// 429 (quota par IP) et 503 (plafond global / service coupé) : message de limite, pas de « Réessayer »
for (const { status, error } of [
    { status: 429, error: 'Limite quotidienne de recherches atteinte. Réessayez demain.' },
    { status: 503, error: 'Service temporairement indisponible, réessayez plus tard.' },
]) {
    test(`/api/analyze en ${status} → message de limite, pas de « Réessayer », un seul appel`, async ({ page, consoleErrors }) => {
        await page.addInitScript((data) => {
            localStorage.setItem('finalData', data);
        }, JSON.stringify(FINAL_DATA));

        let analyzeCalls = 0;
        await page.route('**/api/analyze', (route) => {
            analyzeCalls++;
            return route.fulfill({ status, headers: { 'Retry-After': '3600' }, json: { error } });
        });
        await page.route('**/api/search?**', (route) => route.fulfill({ json: { search_results: [] } }));

        await page.goto('/analyse.html');

        const errorState = page.locator('#singleResult .analysis-error');
        await expect(errorState).toBeVisible({ timeout: 15000 });
        await expect(errorState).toHaveAttribute('role', 'alert');
        await expect(errorState).toContainText("Le service a atteint sa limite pour aujourd'hui. Revenez demain.");
        await expect(errorState.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Réessayer' })).toHaveCount(0);
        await expect(errorState.getByRole('button', { name: 'Modifier ma recherche' })).toBeVisible();
        await expect(page.locator('#statusIndicator')).toBeHidden();
        // Pas de données conservées pour une relance immédiate
        expect(await page.evaluate(() => sessionStorage.getItem('finalData'))).toBeNull();
        // Laisse passer le délai de relance (1,5 s) : aucun second appel ne doit partir
        await page.waitForTimeout(2500);
        expect(analyzeCalls).toBe(1);
        expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
    });
}

// Données de l'étape 2 absentes, corrompues ou vides : plus de spinner infini.
const MISSING_DATA_CASES = [
    { name: 'sans finalData', value: null },
    { name: 'finalData corrompu', value: '{pas du json' },
    { name: 'équipe vide', value: JSON.stringify({ contexte: 'Noël', equipe: [] }) },
];

for (const { name, value } of MISSING_DATA_CASES) {
    test(`analyse.html ${name} → message clair + lien vers config.html`, async ({ page, consoleErrors }) => {
        await page.addInitScript((data) => {
            if (data === null) localStorage.removeItem('finalData');
            else localStorage.setItem('finalData', data);
        }, value);
        await page.goto('/analyse.html');

        const errorState = page.locator('.analysis-error');
        await expect(errorState).toBeVisible({ timeout: 5000 });
        await expect(errorState).toHaveAttribute('role', 'alert');
        await expect(errorState).toContainText('Aucun profil à analyser');
        await expect(page.locator('#statusIndicator')).toBeHidden();
        await expect(page.locator('.spinner')).toBeHidden();

        const link = errorState.getByRole('link', { name: 'Commencer ma recherche' });
        await expect(link).toHaveAttribute('href', 'config.html');
        await link.click();
        await page.waitForURL('**/config.html');
        expect(consoleErrors).toEqual([]);
    });
}
