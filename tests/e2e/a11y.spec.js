// @ts-check
// Accessibilité (Lot 3a) : clavier, ARIA des sélecteurs, bannière cookies modale, live regions.
const { test, expect, CONSENT_KEY, acceptedConsent, expectNoHorizontalOverflow } = require('./fixtures');

/** Consentement déjà donné : la bannière cookies ne s'affiche pas. */
async function withConsent(page, extra = {}) {
    await page.addInitScript(([consentKey, consent, entries]) => {
        localStorage.setItem(consentKey, consent);
        for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    }, [CONSENT_KEY, acceptedConsent(), extra]);
}

test('config : chaque page d\'étape a un h1 et l\'étape courante est marquée aria-current', async ({ page }) => {
    await withConsent(page, { giftConfig: JSON.stringify({ occasion: 'Noël', nb: 1, strategy: 'custom', amount: null }) });
    for (const path of ['/config.html', '/profils.html']) {
        await page.goto(path);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('.step[aria-current="step"]')).toHaveCount(1);
        await expect(page.locator('.step[aria-current="step"]')).toHaveClass(/step--active/);
    }
});

test('config : cartes budget utilisables au clavier (groupe radio natif)', async ({ page, consoleErrors }) => {
    await withConsent(page);
    await page.goto('/config.html');

    // Le groupe est nommé par sa légende
    const group = page.getByRole('group', { name: /Comment gérer le budget/ });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(page.locator('#budgetStrategy')).toHaveValue('custom');

    // Tab depuis le nombre de personnes → radio cochée du groupe
    await page.locator('#nbPeople').focus();
    await page.keyboard.press('Tab');
    const custom = group.getByRole('radio', { name: /Budget personnalisé/ });
    await expect(custom).toBeFocused();
    await expect(custom).toBeChecked();

    // Flèche bas → « Même budget par personne »
    await page.keyboard.press('ArrowDown');
    const same = group.getByRole('radio', { name: /Même budget par personne/ });
    await expect(same).toBeFocused();
    await expect(same).toBeChecked();
    await expect(page.locator('#budgetStrategy')).toHaveValue('same');
    await expect(page.locator('.budget-card[data-strategy="same"]')).toHaveClass(/selected/);
    await expect(page.locator('.budget-card[data-strategy="custom"]')).not.toHaveClass(/selected/);
    await expect(page.locator('#budgetAmountContainer')).toBeVisible();

    // Focus visible sur la carte (outline)
    const outline = await page.locator('.budget-card[data-strategy="same"]').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).toBe('solid');

    // Calcul toujours fonctionnel
    await page.locator('#nbPeople').fill('3');
    await page.locator('#budgetAmount').fill('40');
    await expect(page.locator('#budgetCalculation')).toContainText('120€');

    // Retour à « custom » : flèche haut depuis la radio « same »
    await same.focus();
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#budgetStrategy')).toHaveValue('custom');
    await expect(page.locator('#budgetAmountContainer')).toBeHidden();

    // Clic souris sur une carte (comportement historique)
    await page.locator('.budget-card[data-strategy="global"]').click();
    await expect(page.locator('#budgetStrategy')).toHaveValue('global');
    await expect(group.getByRole('radio', { name: /Budget global/ })).toBeChecked();
    expect(consoleErrors).toEqual([]);
});

test('config : configuration existante → la bonne radio budget est cochée', async ({ page }) => {
    await withConsent(page, { giftConfig: JSON.stringify({ occasion: 'Mariage', nb: 2, strategy: 'global', amount: 100 }) });
    await page.goto('/config.html');
    await expect(page.locator('input[name="budgetStrategyChoice"][value="global"]')).toBeChecked();
    await expect(page.locator('#budgetStrategy')).toHaveValue('global');
    await expect(page.locator('.occasion-chip[data-value="Mariage"]')).toHaveAttribute('aria-pressed', 'true');
    // L'UI dépendante de la stratégie est synchronisée avec la config restaurée (champ montant + calcul)
    await expect(page.locator('#budgetAmountContainer')).toBeVisible();
    await expect(page.locator('#budgetAmount')).toHaveValue('100');
    await expect(page.locator('#budgetCalculation')).toContainText('50');
});

test('config : aria-pressed suit la sélection des chips d\'occasion (souris et clavier)', async ({ page }) => {
    await withConsent(page);
    await page.goto('/config.html');
    await expect(page.locator('.occasion-chip[aria-pressed="true"]')).toHaveCount(1);

    const noel = page.getByRole('button', { name: 'Noël' });
    await noel.click();
    await expect(noel).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.occasion-chip[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#occasion')).toHaveValue('Noël');

    const mariage = page.getByRole('button', { name: 'Mariage' });
    await mariage.focus();
    await page.keyboard.press('Enter');
    await expect(mariage).toHaveAttribute('aria-pressed', 'true');
    await expect(noel).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#occasion')).toHaveValue('Mariage');

    // Groupes nommés
    await expect(page.getByRole('group', { name: /Fêtes du calendrier/ })).toBeVisible();
});

test('config : budget trop élevé → message inline (role=alert), pas de alert()', async ({ page }) => {
    await withConsent(page);
    page.on('dialog', (d) => { throw new Error(`alert() inattendu : ${d.message()}`); });
    await page.goto('/config.html');
    await page.locator('.budget-card[data-strategy="same"]').click();
    await page.locator('#budgetAmount').fill('999999');
    await page.locator('.btn-next').click();
    await expect(page.locator('#configError')).toHaveAttribute('role', 'alert');
    await expect(page.locator('#configError')).toContainText('Budget maximum');
    await expect(page).toHaveURL(/config\.html/);
});

test('profils : labels associés (id uniques), groupes nommés, chips clavier', async ({ page, consoleErrors }) => {
    await withConsent(page, { giftConfig: JSON.stringify({ occasion: 'Noël', nb: 2, strategy: 'custom', amount: null }) });
    page.on('dialog', (d) => { throw new Error(`alert() inattendu : ${d.message()}`); });
    await page.goto('/profils.html');
    const cards = page.locator('.profile-card');
    await expect(cards).toHaveCount(2);

    // Chaque champ est atteignable par son libellé, avec des id distincts par carte
    for (const label of ['Prénom', 'Budget (€)', 'Âge', 'À éviter absolument']) {
        await expect(page.getByLabel(label, { exact: true })).toHaveCount(2);
    }
    await expect(page.getByLabel(/Ce qu'il\/elle adore/)).toHaveCount(2);
    const ids = await page.locator('.profile-card .p-name').evaluateAll((els) => els.map((e) => e.id));
    expect(new Set(ids).size).toBe(2);
    expect(ids.every(Boolean)).toBe(true);

    const first = cards.first();
    await expect(first.getByRole('group', { name: 'Genre' })).toBeVisible();
    await expect(first.getByRole('group', { name: "Centres d'intérêt" })).toBeVisible();

    // Genre : aria-pressed
    const homme = first.getByRole('button', { name: 'Homme' });
    await homme.click();
    await expect(homme).toHaveAttribute('aria-pressed', 'true');
    await expect(first.getByRole('button', { name: 'Femme' })).toHaveAttribute('aria-pressed', 'false');
    await expect(first.locator('.p-sexe')).toHaveValue('Homme');

    // Centres d'intérêt : checkbox masquée mais focusable, focus visible sur le chip, Espace coche
    const sport = first.getByRole('checkbox', { name: 'Sport' });
    await sport.focus();
    await expect(sport).toBeFocused();
    await page.keyboard.press('Space');
    await expect(sport).toBeChecked();
    const chipOutline = await first.locator('label.tag-chip', { has: page.locator('input[value="Sport"]') })
        .locator('.tag-chip-label').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(chipOutline).toBe('solid');

    // Validation : message inline au lieu d'alert()
    await page.locator('#launchAnalysis').click();
    await expect(page.locator('#launchError')).toContainText('Budget invalide');
    await expect(page).toHaveURL(/profils\.html/);

    await expectNoHorizontalOverflow(page);
    expect(consoleErrors).toEqual([]);
});

test('bannière cookies : dialog modal, focus initial, piège à focus, Échap sans effet', async ({ page, consoleErrors }) => {
    await page.goto('/config.html');
    const banner = page.getByRole('dialog', { name: /Votre expérience avant tout/ });
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('aria-modal', 'true');
    await expect(banner).toHaveAttribute('aria-describedby', 'cookieDesc');

    const accept = page.locator('#cookieAccept');
    const decline = page.locator('#cookieDecline');
    const more = banner.getByRole('link', { name: 'En savoir plus' });
    await expect(accept).toBeFocused();

    const focusInBanner = () => page.evaluate(() => !!document.activeElement?.closest('#cookieBanner'));
    // Tab : accept → decline → (bouclage) lien → accept
    await page.keyboard.press('Tab');
    await expect(decline).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(more).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(accept).toBeFocused();
    // Maj+Tab depuis le premier élément → dernier
    await page.keyboard.press('Shift+Tab');
    await expect(more).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(decline).toBeFocused();
    for (let i = 0; i < 5; i++) {
        await page.keyboard.press('Tab');
        expect(await focusInBanner()).toBe(true);
    }

    // Échap : ne ferme pas et n'enregistre aucun choix
    await page.keyboard.press('Escape');
    await expect(banner).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('OFFREZ_cookie_consent'))).toBeNull();

    // Lien lisible : couleur opaque (plus de var(--primary-light) à 15 %)
    const linkColor = await more.evaluate((el) => getComputedStyle(el).color);
    expect(linkColor).toBe('rgb(165, 180, 252)');

    // Fermeture au clavier
    await decline.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cookieBanner')).toHaveCount(0);
    expect(await focusInBanner()).toBe(false);
    expect(consoleErrors).toEqual([]);
});

test('analyse : barre de progression ARIA (aria-valuenow croissant) et statut live', async ({ page, consoleErrors }) => {
    const finalData = {
        contexte: 'Anniversaire',
        equipe: [{ nom: 'Julie', sexe: 'Femme', age: 28, budget: 50, tags: ['Voyage'], details: { adore: '', eviter: '' } }],
    };
    await withConsent(page, { finalData: JSON.stringify(finalData) });

    // Réponse IA retardée pour observer la progression
    let releaseAnalyze = () => { };
    const analyzeGate = new Promise((resolve) => { releaseAnalyze = resolve; });
    await page.route('**/api/analyze', async (route) => {
        await analyzeGate;
        await route.fulfill({ json: { suggestions: [{ term: 'sac de voyage femme', reason: 'Pour ses voyages', prix_estime: '40€' }] } });
    });
    await page.route('**/api/search?**', (route) => route.fulfill({
        json: {
            search_results: [{
                title: 'Sac de voyage cabine', link: 'https://www.amazon.fr/dp/B0TESTA11Y', image: null,
                price: { value: 39.9, raw: '39,90 €' }, rating: 4.5, reviews: 120,
            }],
        },
    }));

    await page.goto('/analyse.html');
    const progress = page.getByRole('progressbar', { name: "Progression de l'analyse" });
    await expect(progress).toHaveAttribute('aria-valuemin', '0');
    await expect(progress).toHaveAttribute('aria-valuemax', '100');
    await expect(page.locator('#statusMessage')).toHaveAttribute('role', 'status');
    await expect(page.locator('#statusMessage')).toHaveAttribute('aria-live', 'polite');

    // Pendant l'attente de l'IA : progression > 0 et < 100
    await expect.poll(async () => Number(await progress.getAttribute('aria-valuenow')), { timeout: 5000 }).toBeGreaterThanOrEqual(25);
    const during = Number(await progress.getAttribute('aria-valuenow'));
    expect(during).toBeLessThan(100);

    releaseAnalyze();
    await expect(page.locator('.gift-card').first()).toBeVisible({ timeout: 15000 });
    // Analyse terminée : le bloc de statut est masqué, la valeur finale est 100
    await expect(page.locator('#progressTrack')).toHaveAttribute('aria-valuenow', '100');
    expect(consoleErrors).toEqual([]);
});
