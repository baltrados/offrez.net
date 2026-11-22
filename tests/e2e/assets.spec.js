// @ts-check
// [LOT4c] Polices auto-hébergées et Font Awesome réduit :
// - aucune requête vers Google Fonts / cdnjs (requêtes RÉELLES observées, avant tout mock) ;
// - chaque icône de la feuille réduite a un ::before non vide et son glyphe est présent dans la police chargée ;
// - Outfit (et Poppins sur les pages légales) se chargent depuis le serveur local.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');

const PUBLIC = path.join(__dirname, '..', '..', 'public');
const THIRD_PARTY = /^https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)\//;
const PAGES = ['/', '/config.html', '/profils.html', '/analyse.html', '/blog.html', '/blog/cadeau-noel-pas-cher.html',
    '/cgu.html', '/mentions-legales.html', '/politique-confidentialite.html', '/offline.html', '/page-inexistante'];

// Icônes déclarées dans la feuille réduite : [classe, style] (fab pour la section Brands)
const faCss = fs.readFileSync(path.join(PUBLIC, 'css', 'fontawesome', 'fa-offrez.min.css'), 'utf8');
const brandsStart = faCss.indexOf('"Font Awesome 6 Brands";font-style');
const ICONS = [...faCss.matchAll(/\.(fa-[a-z0-9-]+):before/g)].map(m => [m[1], m.index > brandsStart ? 'fab' : 'fas']);

test('aucune requête vers Google Fonts ou cdnjs, polices servies localement', async ({ page, consoleErrors }) => {
    const thirdParty = [];
    const localFonts = new Set();
    page.on('request', (req) => {
        if (THIRD_PARTY.test(req.url())) thirdParty.push(req.url());
        if (req.resourceType() === 'font') localFonts.add(new URL(req.url()).pathname);
    });
    for (const url of PAGES) {
        await page.goto(url);
        await page.evaluate(() => document.fonts.ready);
    }
    expect(thirdParty).toEqual([]);
    expect([...localFonts]).toEqual(expect.arrayContaining([
        '/fonts/outfit-latin.woff2', '/fonts/poppins-400-latin.woff2', '/css/webfonts/fa-solid-900.woff2',
    ]));
    // Seules erreurs tolérées : le 404 volontaire et l'analyse sans profil
    expect(consoleErrors.filter((e) => !/Failed to load resource: .*404/.test(e))).toEqual([]);
});

test('Outfit et Poppins chargées par les pages qui les utilisent', async ({ page }) => {
    await page.goto('/');
    await expect.poll(() => page.evaluate(async () => {
        await document.fonts.ready;
        return document.fonts.check('800 16px "Outfit"', 'OFFREZ') && [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Outfit' && f.status === 'loaded');
    })).toBe(true);
    // Pas de Poppins sur l'accueil (comportement inchangé : police système pour le texte courant)
    expect(await page.evaluate(() => [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Poppins'))).toBe(false);

    await page.goto('/cgu.html');
    await expect.poll(() => page.evaluate(async () => {
        await document.fonts.ready;
        return [...document.fonts].filter(f => f.family.replace(/"/g, '') === 'Poppins' && f.status === 'loaded').length;
    })).toBeGreaterThan(0);
});

test(`les ${ICONS.length} icônes de la feuille réduite s'affichent (::before non vide + glyphe présent)`, async ({ page }) => {
    expect(ICONS.length).toBeGreaterThanOrEqual(40);
    await page.goto('/cgu.html');
    const results = await page.evaluate(async (icons) => {
        const box = document.createElement('div');
        document.body.appendChild(box);
        const out = [];
        for (const [cls, style] of icons) {
            const i = document.createElement('i');
            i.className = `${style} ${cls}`;
            box.appendChild(i);
            const content = getComputedStyle(i, '::before').content;
            const char = content.replace(/^"|"$/g, '');
            const family = style === 'fab' ? '"Font Awesome 6 Brands"' : '"Font Awesome 6 Free"';
            const weight = style === 'fab' ? 400 : 900;
            await document.fonts.load(`${weight} 16px ${family}`, char);
            out.push({
                cls,
                content,
                loaded: document.fonts.check(`${weight} 16px ${family}`, char),
                width: i.getBoundingClientRect().width,
                hasGlyph: hasGlyph(`${weight} 40px ${family}`, char),
            });
        }
        // Témoin : un glyphe retiré du sous-ensemble (cœur f004) doit être détecté comme absent
        out.push({ witnessMissing: !hasGlyph('900 40px "Font Awesome 6 Free"', '') });
        return out;

        // Glyphe présent dans la police si son RENDU (pixels) diffère de celui d'un caractère certainement
        // absent (U+10FFFD, zone privée du plan 16) : deux caractères absents donnent le même glyphe de repli.
        // (Comparer les largeurs ne suffit pas : plusieurs icônes font 0,75 em, comme le glyphe de repli.)
        function hasGlyph(font, ch) {
            const draw = (c) => {
                const canvas = document.createElement('canvas');
                canvas.width = 80; canvas.height = 80;
                const ctx = canvas.getContext('2d');
                if (!ctx) return '';
                ctx.font = font;
                ctx.textBaseline = 'top';
                ctx.fillText(c, 10, 10);
                return canvas.toDataURL();
            };
            return draw(ch) !== draw('\u{10FFFD}');
        }
    }, ICONS);
    const witness = results.pop();
    expect(witness, 'le contrôle de glyphe détecte bien une icône absente').toEqual({ witnessMissing: true });
    const broken = results.filter(r => !r.content || r.content === 'none' || r.content === 'normal' || !r.loaded || r.width === 0 || !r.hasGlyph);
    expect(broken).toEqual([]);
    // L'ancienne icône Pro (invisible) a bien été remplacée
    expect(results.map(r => r.cls)).toContain('fa-wand-magic-sparkles');
});
