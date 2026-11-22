// @ts-check
// [LOT4a] RGPD côté navigateur : contenu minimal du suivi, consentement expiré, purge de finalData.
const { test, expect, CONSENT_KEY, acceptedConsent } = require('./fixtures');

const FINAL_DATA = {
    contexte: 'Anniversaire',
    equipe: [{ nom: 'Julie', sexe: 'Femme', age: 28, budget: 50, tags: ['Voyage'], details: { adore: 'randonnée', eviter: '' } }],
};
const GIFT_CONFIG = { occasion: 'Noël', nb: 2, strategy: 'custom', amount: null };

/** Consentement accepté mais expiré depuis hier. */
function expiredConsent() {
    const day = 24 * 3600 * 1000;
    return JSON.stringify({ accepted: true, date: new Date(Date.now() - 366 * day).toISOString(), expiry: new Date(Date.now() - day).toISOString() });
}

async function mockAnalysisApis(page, { analyzeStatus = 200 } = {}) {
    const calls = { analyze: 0, search: [] };
    await page.route('**/api/analyze', (route) => {
        calls.analyze++;
        if (analyzeStatus !== 200) return route.fulfill({ status: analyzeStatus, json: { error: 'Erreur serveur interne' } });
        return route.fulfill({ json: { suggestions: [{ term: 'sac de voyage', reason: 'Pour ses escapades', prix_estime: '40€' }] } });
    });
    await page.route('**/api/search?**', (route) => {
        calls.search.push(Object.fromEntries(new URL(route.request().url()).searchParams));
        return route.fulfill({
            json: {
                search_results: [{
                    title: 'Sac de voyage cabine', link: 'https://www.amazon.fr/dp/B0PRIVACY1', image: 'https://m.media-amazon.com/i.jpg',
                    price: { value: 39.9, raw: '39,90 €' }, rating: 4.5, reviews: 120, asin: 'B0PRIVACY1', is_prime: true,
                }],
            },
        });
    });
    return calls;
}

/** Remplit 2 profils sur profils.html avec des données personnelles. */
async function fillProfiles(page) {
    const cards = page.locator('.profile-card');
    await expect(cards).toHaveCount(2);
    for (const [i, name] of ['Julie', 'Marc'].entries()) {
        const card = cards.nth(i);
        await card.locator('.p-name').fill(name);
        await card.locator('.p-age').fill('34');
        await card.locator('.p-budget').fill('40');
        await card.locator('.p-details').fill('Adore la randonnée');
    }
}

test('track-profiles n\'envoie que { count, consent } (aucun contenu de profil)', async ({ page, consoleErrors }) => {
    await page.addInitScript(([consentKey, consent, config]) => {
        localStorage.setItem(consentKey, consent);
        localStorage.setItem('giftConfig', config);
    }, [CONSENT_KEY, acceptedConsent(), JSON.stringify(GIFT_CONFIG)]);
    await mockAnalysisApis(page);
    const bodies = [];
    await page.route('**/api/track-profiles', (route) => {
        bodies.push(route.request().postData());
        return route.fulfill({ json: { success: true } });
    });

    await page.goto('/profils.html');
    await fillProfiles(page);
    await page.locator('#launchAnalysis').click();
    await page.waitForURL('**/analyse.html');

    await expect.poll(() => bodies.length).toBe(1);
    expect(JSON.parse(/** @type {string} */ (bodies[0]))).toEqual({ count: 2, consent: true });
    for (const leaked of ['Julie', 'Marc', 'randonnée', '34', 'Noël', 'profiles', 'occasion']) {
        expect(bodies[0]).not.toContain(leaked);
    }
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    expect(consoleErrors).toEqual([]);
});

test('consentement expiré → aucun appel de suivi, consent=false, bannière réaffichée', async ({ page, consoleErrors }) => {
    await page.addInitScript(([consentKey, consent, config]) => {
        localStorage.setItem(consentKey, consent);
        localStorage.setItem('giftConfig', config);
    }, [CONSENT_KEY, expiredConsent(), JSON.stringify(GIFT_CONFIG)]);
    const calls = await mockAnalysisApis(page);
    const tracking = [];
    await page.route('**/api/track-*', (route) => {
        tracking.push(route.request().url());
        return route.fulfill({ json: { success: true } });
    });

    await page.goto('/profils.html');
    // Consentement expiré = plus de décision valide : la bannière cookies est de nouveau proposée
    await expect(page.locator('#cookieBanner')).toBeVisible();
    await fillProfiles(page);
    // La bannière (modale) recouvre la page : on déclenche le bouton sans passer par le hit-testing
    await page.locator('#launchAnalysis').dispatchEvent('click');
    await page.waitForURL('**/analyse.html');

    const card = page.locator('.gift-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    expect(calls.search.length).toBeGreaterThanOrEqual(1);
    expect(calls.search.every((q) => q.consent === 'false')).toBe(true);

    // Clic d'achat : la modale s'ouvre, mais aucun /api/track-click
    await card.locator('a.btn-amazon-cta').dispatchEvent('click');
    await expect(page.locator('#purchaseModal')).toBeVisible();
    await page.locator('#purchaseModal .modal-overlay').dispatchEvent('click');
    await page.waitForTimeout(300);
    expect(tracking).toEqual([]);
    expect(consoleErrors).toEqual([]);
});

test('consentement valide → le clic d\'achat est suivi (contrôle positif)', async ({ page }) => {
    await page.addInitScript(([consentKey, consent, data]) => {
        localStorage.setItem(consentKey, consent);
        localStorage.setItem('finalData', data);
    }, [CONSENT_KEY, acceptedConsent(), JSON.stringify(FINAL_DATA)]);
    await mockAnalysisApis(page);
    const clicks = [];
    await page.route('**/api/track-click', (route) => {
        clicks.push(route.request().postData());
        return route.fulfill({ json: { success: true } });
    });
    await page.goto('/analyse.html');
    const card = page.locator('.gift-card').first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await card.locator('a.btn-amazon-cta').click();
    await expect(page.locator('#purchaseModal')).toBeVisible();
    await page.locator('#purchaseModal .modal-overlay').dispatchEvent('click');
    await expect.poll(() => clicks.length).toBe(1);
    expect(JSON.parse(/** @type {string} */ (clicks[0]))).toEqual({ product: 'Sac de voyage cabine', price: '39,90 €', asin: 'B0PRIVACY1', consent: true });
});

test('finalData purgé du navigateur une fois les résultats affichés', async ({ page, consoleErrors }) => {
    await page.addInitScript(([consentKey, consent, data]) => {
        localStorage.setItem(consentKey, consent);
        // Semé une seule fois (pas à chaque rechargement) pour observer la purge réelle
        if (!sessionStorage.getItem('__seeded')) {
            localStorage.setItem('finalData', data);
            sessionStorage.setItem('__seeded', '1');
        }
    }, [CONSENT_KEY, acceptedConsent(), JSON.stringify(FINAL_DATA)]);
    await mockAnalysisApis(page);

    await page.goto('/analyse.html');
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    const stored = await page.evaluate(() => ({ local: localStorage.getItem('finalData'), session: sessionStorage.getItem('finalData') }));
    expect(stored).toEqual({ local: null, session: null });

    // Rechargement : plus aucune donnée personnelle → invitation à recommencer
    await page.reload();
    await expect(page.locator('.analysis-error')).toContainText('Aucun profil à analyser');
    expect(consoleErrors).toEqual([]);
});

test('échec technique : finalData retiré du localStorage mais « Réessayer » relance l\'analyse (copie de session)', async ({ page, consoleErrors }) => {
    await page.addInitScript(([consentKey, consent, data]) => {
        localStorage.setItem(consentKey, consent);
        if (!sessionStorage.getItem('__seeded')) {
            localStorage.setItem('finalData', data);
            sessionStorage.setItem('__seeded', '1');
        }
    }, [CONSENT_KEY, acceptedConsent(), JSON.stringify(FINAL_DATA)]);

    let analyzeOk = false;
    let analyzeCalls = 0;
    await page.route('**/api/analyze', (route) => {
        analyzeCalls++;
        return analyzeOk
            ? route.fulfill({ json: { suggestions: [{ term: 'sac de voyage', reason: 'Pour ses escapades' }] } })
            : route.fulfill({ status: 500, json: { error: 'Erreur serveur interne' } });
    });
    await page.route('**/api/search?**', (route) => route.fulfill({
        json: { search_results: [{ title: 'Sac de voyage cabine', link: 'https://www.amazon.fr/dp/B0PRIVACY1', price: { value: 39.9, raw: '39,90 €' }, rating: 4.5, reviews: 120 }] },
    }));

    await page.goto('/analyse.html');
    const errorState = page.locator('#singleResult .analysis-error');
    await expect(errorState).toBeVisible({ timeout: 15000 });
    expect(analyzeCalls).toBe(2);
    const afterFailure = await page.evaluate(() => ({ local: localStorage.getItem('finalData'), session: sessionStorage.getItem('finalData') }));
    expect(afterFailure.local).toBeNull();
    expect(JSON.parse(/** @type {string} */ (afterFailure.session))).toEqual(FINAL_DATA);

    analyzeOk = true;
    await errorState.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    expect(analyzeCalls).toBe(3);
    const afterSuccess = await page.evaluate(() => ({ local: localStorage.getItem('finalData'), session: sessionStorage.getItem('finalData') }));
    expect(afterSuccess).toEqual({ local: null, session: null });
    expect(consoleErrors.filter((e) => !/Failed to load resource/.test(e))).toEqual([]);
});
