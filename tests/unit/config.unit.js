'use strict';
// Tests unitaires de lib/config.js (parseTrustProxy).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTrustProxy } = require('../../lib/config');

test('parseTrustProxy : absent ou vide -> 3 (chaîne Render) sans avertissement', () => {
    for (const v of [undefined, null, '', '   ']) {
        assert.deepEqual(parseTrustProxy(v), { value: 3, warning: null });
    }
});

test('parseTrustProxy : entiers valides', () => {
    assert.equal(parseTrustProxy('0').value, 0);
    assert.equal(parseTrustProxy('1').value, 1);
    assert.equal(parseTrustProxy(' 2 ').value, 2);
    assert.equal(parseTrustProxy('10').value, 10);
    assert.equal(parseTrustProxy('2').warning, null);
});

test('parseTrustProxy : valeurs invalides -> 3 avec avertissement', () => {
    for (const v of ['true', 'false', '-1', '1.5', 'abc', '1e2', '0x1', '+1', '1,2', 'loopback', '99999']) {
        const r = parseTrustProxy(v);
        assert.equal(r.value, 3, v);
        assert.equal(typeof r.warning, 'string', v);
    }
});

const { sanitizeApiKey } = require('../../lib/config');

test('sanitizeApiKey : trim, absent, et rejet des caractères de contrôle ou espaces internes', () => {
    assert.deepEqual(sanitizeApiKey('  abc123\n'), { value: 'abc123', valid: true, present: true });
    for (const v of [undefined, null, '', '  \n']) {
        assert.deepEqual(sanitizeApiKey(v), { value: '', valid: false, present: false });
    }
    for (const v of ['AIza\nKEY', 'AIza KEY', 'AIza\tKEY', 'AIza\u0000KEY', 'AIza\u007fKEY']) {
        const r = sanitizeApiKey(v);
        assert.deepEqual(r, { value: '', valid: false, present: true }, JSON.stringify(v));
    }
});
