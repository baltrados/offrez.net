// @ts-check
// Comportement de analyse.html en cas d'échec : message générique, aucun détail technique.
const { test, expect, CONSENT_KEY, acceptedConsent } = require('./fixtures');

const FINAL_DATA = {
    contexte: 'Anniversaire',
    equipe: [{ nom: 'Julie', sexe: 'Femme', age: 28, budget: 50, tags: ['Voyage'], details: { adore: '', eviter: '' } }],
};

test('/api/analyze en 500 → message générique, sans détail technique', async ({ page }) => {
    await page.addInitScript(([consentKey, consent, data]) => {
        localStorage.setItem(consentKey, consent);
        localStorage.setItem('finalData', data);
    }, [CONSENT_KEY, acceptedConsent(), JSON.stringify(FINAL_DATA)]);

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

    // Comportement actuel : 2 tentatives (retry), puis le profil est ignoré et un message
    // générique « Aucun résultat trouvé. » remplace le spinner (pas d'écran d'erreur dédié).
    const noResults = page.locator('#singleResult .no-results');
    await expect(noResults).toBeVisible({ timeout: 15000 });
    await expect(noResults).toHaveText('Aucun résultat trouvé.');
    await expect(page.locator('#statusIndicator')).toBeHidden();
    expect(analyzeCalls).toBe(2);
    expect(searchCalls).toBe(0);

    const visibleText = await page.locator('body').innerText();
    for (const forbidden of [/\b500\b/, /googleapis/i, /Erreur serveur interne/, /stack/i, /Error:/, /Erreur API/]) {
        expect(visibleText).not.toMatch(forbidden);
    }
    await expect(page.locator('.gift-card')).toHaveCount(0);
});

// BUG CONNU (non corrigé, hors périmètre Lot 2) : sans `finalData` dans le localStorage,
// lancerAnalyse() fait un `return` silencieux (public/js/analyse.js, début de lancerAnalyse) :
// le spinner « Analyse de vos profils en cours... » reste affiché indéfiniment, sans message
// ni redirection vers config.html. Le test décrit le comportement attendu ; retirer `fixme`
// une fois l'app corrigée.
test.fixme('analyse.html sans finalData → message ou redirection (spinner infini actuellement)', async ({ page }) => {
    await page.addInitScript(([consentKey, consent]) => {
        localStorage.setItem(consentKey, consent);
        localStorage.removeItem('finalData');
    }, [CONSENT_KEY, acceptedConsent()]);
    await page.goto('/analyse.html');
    await expect(async () => {
        const redirected = page.url().includes('config.html');
        const spinnerHidden = !(await page.locator('#statusIndicator').isVisible());
        expect(redirected || spinnerHidden).toBe(true);
    }).toPass({ timeout: 5000 });
});
