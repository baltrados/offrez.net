// Tests unitaires de public/js/security.js (module ESM du navigateur, sans dépendance DOM).
// Remplace l'ancien test_security.js (corrompu). Lancement : node --test "tests/unit/*.unit.mjs"

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// public/js/security.js est un module ESM navigateur dans un package sans "type": "module".
// Node 22+ détecte la syntaxe ESM, mais pas Node 20 (prod) : on charge donc le source via une
// URL data: (module sans import), ce qui fonctionne à l'identique sur Node 20, 22 et 24.
const source = await readFile(new URL('../../public/js/security.js', import.meta.url), 'utf8');
const {
    escapeHtml,
    sanitizeUrl,
    buildAffiliateUrl,
    truncateText,
    isValidEmail,
    generateId
} = await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));

const TAG = 'offreznet-21';

// ---------- escapeHtml ----------
test('escapeHtml : balise script neutralisée', () => {
    assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('escapeHtml : guillemets, apostrophes et esperluette', () => {
    assert.equal(escapeHtml(`"a" & 'b'`), '&quot;a&quot; &amp; &#039;b&#039;');
    assert.equal(escapeHtml('" onmouseover="alert(1)'), '&quot; onmouseover=&quot;alert(1)');
});

test('escapeHtml : & échappé en premier (pas de double échappement incohérent)', () => {
    assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('escapeHtml : null / undefined → chaîne vide, nombres convertis', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(0), '0');
    assert.equal(escapeHtml(4.5), '4.5');
    assert.equal(escapeHtml(false), 'false');
});

// ---------- sanitizeUrl ----------
test('sanitizeUrl : URL Amazon https valide → href normalisé', () => {
    assert.equal(sanitizeUrl('https://www.amazon.fr/dp/B08XYZ1234'), 'https://www.amazon.fr/dp/B08XYZ1234');
    assert.equal(sanitizeUrl('https://AMAZON.FR/dp/B08XYZ1234'), 'https://amazon.fr/dp/B08XYZ1234');
    assert.equal(sanitizeUrl('https://amzn.to/abc'), 'https://amzn.to/abc');
    assert.equal(sanitizeUrl('https://smile.amazon.com/dp/X'), 'https://smile.amazon.com/dp/X');
});

test('sanitizeUrl : protocoles et hôtes refusés → #', () => {
    for (const url of [
        'http://www.amazon.fr/dp/B08XYZ1234',
        'https://amazon.fr.evil.com/dp/X',
        'https://evilamazon.fr/dp/X',
        'https://amazon.fr@evil.com/dp/X',
        '//amazon.fr/dp/X',
        '/dp/X',
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        ' javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'vbscript:msgbox(1)',
        'https://evil.com/?u=https://amazon.fr',
        '',
        null,
        undefined,
        42,
        {}
    ]) {
        assert.equal(sanitizeUrl(url), '#', `refus attendu pour ${String(url)}`);
    }
});

test('sanitizeUrl : un " injecté est encodé (impossible de sortir de l\'attribut)', () => {
    const out = sanitizeUrl('https://www.amazon.fr/dp/X?tag=old" onmouseover="alert(1)');
    assert.ok(!out.includes('"'), out);
    assert.ok(!out.includes(' '), out);
    assert.ok(out.startsWith('https://www.amazon.fr/dp/X?'));
    assert.ok(out.includes('%22'));
});

test('sanitizeUrl : chevrons dans le chemin encodés', () => {
    const out = sanitizeUrl('https://www.amazon.fr/<img src=x>');
    assert.ok(!out.includes('<') && !out.includes('>'), out);
});

// ---------- buildAffiliateUrl ----------
test('buildAffiliateUrl : ajoute le tag', () => {
    assert.equal(buildAffiliateUrl('https://www.amazon.fr/dp/B08XYZ1234', TAG),
        'https://www.amazon.fr/dp/B08XYZ1234?tag=offreznet-21');
});

test('buildAffiliateUrl : conserve les autres paramètres', () => {
    const out = new URL(buildAffiliateUrl('https://www.amazon.fr/dp/X?psc=1&ref=abc', TAG));
    assert.equal(out.searchParams.get('psc'), '1');
    assert.equal(out.searchParams.get('ref'), 'abc');
    assert.deepEqual(out.searchParams.getAll('tag'), [TAG]);
});

test('buildAffiliateUrl : remplace un tag existant (un seul tag au final)', () => {
    const out = buildAffiliateUrl('https://www.amazon.fr/dp/X?tag=concurrent-21&tag=autre-21', TAG);
    const u = new URL(out);
    assert.deepEqual(u.searchParams.getAll('tag'), [TAG]);
    assert.equal(out.match(/tag=/g).length, 1);
});

test('buildAffiliateUrl : tag placé avant le #fragment', () => {
    const out = buildAffiliateUrl('https://www.amazon.fr/dp/X#avis', TAG);
    assert.equal(out, 'https://www.amazon.fr/dp/X?tag=offreznet-21#avis');
});

test('buildAffiliateUrl : tag malveillant dans l\'URL source neutralisé', () => {
    const out = buildAffiliateUrl('https://www.amazon.fr/dp/X?tag=old" onmouseover="alert(1)', TAG);
    assert.ok(!out.includes('"'));
    assert.deepEqual(new URL(out).searchParams.getAll('tag'), [TAG]);
});

test('buildAffiliateUrl : le tag fourni est encodé', () => {
    const out = buildAffiliateUrl('https://www.amazon.fr/dp/X', 'a&b="c"');
    assert.ok(!out.includes('"'));
    assert.equal(new URL(out).searchParams.get('tag'), 'a&b="c"');
});

test('buildAffiliateUrl : URL non https ou hôte hors liste → #', () => {
    for (const url of [
        'http://www.amazon.fr/dp/X',
        'https://amazon.fr.evil.com/dp/X',
        'https://amazon.fr@evil.com/dp/X',
        'javascript:alert(1)',
        'data:text/html,x',
        '//amazon.fr/dp/X',
        null
    ]) {
        assert.equal(buildAffiliateUrl(url, TAG), '#', `refus attendu pour ${String(url)}`);
    }
});

// ---------- isValidEmail ----------
test('isValidEmail : formats valides', () => {
    assert.equal(isValidEmail('test@example.com'), true);
    assert.equal(isValidEmail('  prenom.nom+tag@sous.domaine.fr  '), true);
});

test('isValidEmail : formats invalides', () => {
    for (const v of ['not-an-email', 'a@b', '@b.fr', 'a b@c.fr', 'a@b .fr', '', null, undefined, 42, ['a@b.fr']]) {
        assert.equal(isValidEmail(v), false, `invalide attendu pour ${String(v)}`);
    }
});

// ---------- truncateText ----------
test('truncateText : texte court échappé, non tronqué', () => {
    assert.equal(truncateText('A & B', 10), 'A &amp; B');
});

test('truncateText : tronque le texte brut AVANT échappement (pas d\'entité coupée)', () => {
    assert.equal(truncateText('A & B & C', 3), 'A &amp;...');
    assert.equal(truncateText('<script>', 4), '&lt;scr...');
});

test('truncateText : longueur par défaut 50', () => {
    const out = truncateText('x'.repeat(60));
    assert.equal(out, 'x'.repeat(50) + '...');
});

test('truncateText : valeurs vides → chaîne vide, nombres convertis', () => {
    assert.equal(truncateText(''), '');
    assert.equal(truncateText(null), '');
    assert.equal(truncateText(undefined), '');
    assert.equal(truncateText(12345, 3), '123...');
});

// ---------- generateId ----------
test('generateId : préfixe OFFREZ_ et identifiants distincts', () => {
    const a = generateId();
    const b = generateId();
    assert.match(a, /^OFFREZ_[a-z0-9]+$/);
    assert.notEqual(a, b);
});
