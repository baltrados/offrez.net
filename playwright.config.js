// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// E2E OFFREZ : le serveur réel (node server.js) sert public/ sur le port 3100, SANS vraies clés API.
// Tous les appels /api/* et les ressources externes sont mockés dans les specs (page.route).
const PORT = 3100;
const BASE_URL = `http://127.0.0.1:${PORT}`;

module.exports = defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.js',
    timeout: 30000,
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: BASE_URL,
        headless: true,
        serviceWorkers: 'block',
        screenshot: 'only-on-failure',
        trace: 'retain-on-failure',
    },
    webServer: {
        command: 'node server.js',
        url: `${BASE_URL}/api/health`,
        // Jamais de réutilisation : un serveur déjà lancé sur 3100 pourrait avoir de vraies clés (.env)
        reuseExistingServer: false,
        timeout: 30000,
        env: {
            PORT: String(PORT),
            // Valeurs vides : dotenv ne réinjecte pas un éventuel .env local (aucune vraie clé en E2E)
            GEMINI_API_KEY: '',
            RAPIDAPI_KEY: '',
        },
    },
    projects: [
        { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'mobile', use: { ...devices['Pixel 5'] } },
        // Safari (moteur WebKit) sur iPhone : parcours critique et démarrage de l'analyse
        {
            name: 'webkit-iphone',
            use: { ...devices['iPhone 13'] },
            testMatch: ['**/journey.spec.js', '**/boot.spec.js', '**/retention.spec.js', '**/search-ideas.spec.js', '**/conversion.spec.js'],
        },
    ],
});
