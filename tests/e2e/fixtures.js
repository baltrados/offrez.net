// @ts-check
// Fixtures E2E partagées : aucune requête ne sort de 127.0.0.1:3100.
const base = require('@playwright/test');

const AFFILIATE_TAG = 'offreznet-21';

// PNG 1x1 transparent
const PIXEL_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
);

/**
 * Bloque/mocke tout ce qui n'est pas servi par le serveur local de test :
 * Google Fonts → CSS vide, images externes → pixel PNG, autre → 204 vide.
 */
async function isolateNetwork(page, baseURL) {
    const origin = new URL(baseURL).origin;
    // Garde-fou : tout /api/* non mocké par la spec est bloqué (jamais d'appel au vrai serveur ni aux API payantes).
    // Enregistré en premier = priorité la plus basse : les mocks des specs (enregistrés après) passent avant.
    await page.route('**/api/**', (route) => route.abort('blockedbyclient'));
    await page.route((url) => url.origin !== origin, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.hostname === 'fonts.googleapis.com') {
            return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
        }
        if (req.resourceType() === 'image') {
            return route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL_PNG });
        }
        return route.fulfill({ status: 204, body: '' });
    });
}

const test = base.test.extend({
    /** Erreurs console + exceptions page collectées pendant le test. */
    consoleErrors: async ({ page }, use) => {
        const errors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
        });
        page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
        await use(errors);
    },
    page: async ({ page, baseURL }, use) => {
        await isolateNetwork(page, baseURL || 'http://127.0.0.1:3100');
        await use(page);
    },
});

/** Aucun débordement horizontal (mobile-first). */
async function expectNoHorizontalOverflow(page) {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }));
    base.expect(scrollWidth, `scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`).toBeLessThanOrEqual(clientWidth + 1);
}

/** Réponse Gemini (côté serveur OFFREZ, déjà normalisée) pour /api/analyze. */
function analyzeResponse(suggestions) {
    return { suggestions };
}

module.exports = {
    test,
    expect: base.expect,
    AFFILIATE_TAG,
    expectNoHorizontalOverflow,
    analyzeResponse,
};
