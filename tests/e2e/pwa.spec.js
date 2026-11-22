// @ts-check
// [LOT3b] PWA : enregistrement du service worker, précache, mode hors ligne, manifest et icônes.
// Les service workers sont bloqués par défaut (playwright.config.js) : autorisés uniquement ici.
const { test, expect } = require('./fixtures');

test.use({ serviceWorkers: 'allow' });

const CACHE_NAME = 'OFFREZ-v23';

/** Attend que le SW soit actif et contrôle la page (après rechargement si nécessaire). */
async function waitForControl(page) {
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
        await page.reload();
    }
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test.describe('PWA', () => {
    test('le service worker s\'enregistre, contrôle la page et précache l\'app shell', async ({ page, consoleErrors }) => {
        await page.goto('/');
        await waitForControl(page);
        await page.reload();
        expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

        const state = await page.evaluate(async (name) => {
            const keys = await caches.keys();
            const cache = await caches.open(name);
            return {
                keys,
                offline: Boolean(await cache.match('/offline.html')),
                css: Boolean(await cache.match(document.querySelector('link[rel="stylesheet"][href*="style.min.css"]')?.getAttribute('href') || 'x')),
            };
        }, CACHE_NAME);
        expect(state.keys).toContain(CACHE_NAME);
        expect(state.offline).toBe(true);
        expect(state.css, 'style.min.css versionné tel que référencé par la page est précaché').toBe(true);
        expect(consoleErrors).toEqual([]);
    });

    test('hors ligne : page visitée servie depuis le cache, page jamais visitée → page hors ligne', async ({ page, context }) => {
        await page.goto('/');
        await waitForControl(page);
        // Page non précachée visitée en ligne → mise en cache runtime (network-first)
        await page.goto('/blog.html');
        await expect(page.getByRole('heading', { name: 'Le Mag OFFREZ' })).toBeVisible();
        await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/blog.html')))).toBe(true);

        await context.setOffline(true);
        try {
            // Rechargement d'une page visitée
            await page.reload();
            await expect(page).toHaveURL(/\/blog\.html$/);
            await expect(page.getByRole('heading', { name: 'Le Mag OFFREZ' })).toBeVisible();
            await expect(page.getByText('Vous êtes hors ligne')).toHaveCount(0);

            // Page de l'app shell précachée
            await page.goto('/config.html');
            await expect(page.locator('h1').first()).toBeVisible();
            await expect(page.getByText('Vous êtes hors ligne')).toHaveCount(0);

            // Page jamais visitée ni précachée → /offline.html
            await page.goto('/cgu.html');
            await expect(page.locator('h1')).toHaveText('Vous êtes hors ligne');
            await expect(page.getByRole('link', { name: 'Réessayer' })).toHaveAttribute('href', '/');

            // API hors ligne : JSON 503 avec message en français, jamais mis en cache
            const api = await page.evaluate(async () => {
                const r = await fetch('/api/health');
                return { status: r.status, body: await r.json() };
            });
            expect(api.status).toBe(503);
            expect(api.body.error).toMatch(/hors ligne/i);
        } finally {
            await context.setOffline(false);
        }
    });

    test('manifest valide : 3 icônes PNG aux dimensions déclarées', async ({ request }) => {
        const res = await request.get('/manifest.json');
        expect(res.status()).toBe(200);
        const manifest = await res.json();
        expect(manifest.id).toBe('/');
        expect(manifest.scope).toBe('/');
        const pngIcons = manifest.icons.filter((i) => i.type === 'image/png');
        expect(pngIcons.map((i) => i.purpose)).toEqual(['any', 'any', 'maskable']);
        for (const icon of pngIcons) {
            const img = await request.get(icon.src);
            expect(img.status(), icon.src).toBe(200);
            expect(img.headers()['content-type']).toMatch(/image\/png/);
            const buf = await img.body();
            expect(buf.toString('ascii', 12, 16)).toBe('IHDR');
            expect(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`, icon.src).toBe(icon.sizes);
        }
        const apple = await request.get('/apple-touch-icon.png');
        expect(apple.status()).toBe(200);
        const appleBuf = await apple.body();
        expect([appleBuf.readUInt32BE(16), appleBuf.readUInt32BE(20)]).toEqual([180, 180]);
    });

    test('toutes les pages publiques déclarent manifest, theme-color, apple-touch-icon et sw-register', async ({ page }) => {
        const manifest = await (await page.request.get('/manifest.json')).json();
        const pages = ['/', '/config.html', '/profils.html', '/analyse.html', '/blog.html', '/cgu.html', '/mentions-legales.html',
            '/politique-confidentialite.html', '/offline.html', '/blog/cadeau-noel-pas-cher.html', '/blog/idees-cadeaux-femme.html',
            '/blog/cadeau-anniversaire-maman.html', '/blog/cadeau-couple-saint-valentin.html', '/blog/cadeau-original-homme.html'];
        for (const url of pages) {
            await page.goto(url);
            const head = await page.evaluate(() => ({
                manifest: document.querySelector('link[rel="manifest"]')?.href,
                theme: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
                apple: document.querySelector('link[rel="apple-touch-icon"]')?.href,
                sw: [...document.scripts].filter((s) => s.src.endsWith('/js/sw-register.js')).length,
            }));
            expect(head.manifest, url).toMatch(/\/manifest\.json$/);
            expect(head.theme, url).toBe(manifest.theme_color);
            expect(head.apple, url).toMatch(/\/apple-touch-icon\.png$/);
            expect(head.sw, url).toBe(1);
        }
    });
});
