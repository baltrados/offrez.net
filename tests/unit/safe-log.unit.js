'use strict';
// Tests unitaires de lib/safe-log.js (safeErrorInfo).
const test = require('node:test');
const assert = require('node:assert/strict');
const { safeErrorInfo } = require('../../lib/safe-log');

test('safeErrorInfo : message réel fetch avec clé à retour à la ligne → clé masquée', () => {
    const err = new TypeError('Headers.append: "AIzaFAKE\nKEY" is an invalid header value.');
    const out = safeErrorInfo(err);
    assert.ok(!out.includes('AIzaFAKE'), out);
    assert.ok(!out.includes('KEY"'), out);
    assert.match(out, /"\[masqué\]" is an invalid header value\./);
});

test('safeErrorInfo : texte entre guillemets très long masqué avant troncature', () => {
    const out = safeErrorInfo(new Error('x "' + 'S'.repeat(500) + '" y'));
    assert.ok(!out.includes('SSS'), out);
});

test('safeErrorInfo : URL masquée, nom et code conservés, entrées vides tolérées', () => {
    const e = new Error('fetch failed https://exemple.test/?key=abc');
    e.code = 'ECONNRESET';
    const out = safeErrorInfo(e);
    assert.ok(!out.includes('abc') && !out.includes('exemple.test'));
    assert.match(out, /^Error \| ECONNRESET \| fetch failed \[url\]/);
    assert.equal(safeErrorInfo(null), 'Erreur inconnue');
    assert.equal(safeErrorInfo({}), 'Error');
});
