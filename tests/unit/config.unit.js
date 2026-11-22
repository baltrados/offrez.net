'use strict';
// Tests unitaires de lib/config.js (parseTrustProxy).
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTrustProxy } = require('../../lib/config');

test('parseTrustProxy : absent ou vide -> 1 sans avertissement', () => {
    for (const v of [undefined, null, '', '   ']) {
        assert.deepEqual(parseTrustProxy(v), { value: 1, warning: null });
    }
});

test('parseTrustProxy : entiers valides', () => {
    assert.equal(parseTrustProxy('0').value, 0);
    assert.equal(parseTrustProxy('1').value, 1);
    assert.equal(parseTrustProxy(' 2 ').value, 2);
    assert.equal(parseTrustProxy('10').value, 10);
    assert.equal(parseTrustProxy('2').warning, null);
});

test('parseTrustProxy : valeurs invalides -> 1 avec avertissement', () => {
    for (const v of ['true', 'false', '-1', '1.5', 'abc', '1e2', '0x1', '+1', '1,2', 'loopback', '99999']) {
        const r = parseTrustProxy(v);
        assert.equal(r.value, 1, v);
        assert.equal(typeof r.warning, 'string', v);
    }
});
