// Tests unitaires de public/js/config-prefill.js (module ESM navigateur sans import, chargé via data: URL
// comme security.unit.mjs pour fonctionner à l'identique sur Node 20, 22 et 24).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../public/js/config-prefill.js', import.meta.url), 'utf8');
const { parsePrefill, PREFILL_MIN_BUDGET } = await import('data:text/javascript,' + encodeURIComponent(source));

const OCCASIONS = ['Anniversaire', 'Noël', 'Saint-Valentin', 'Fête des Mères'];

test('parsePrefill : occasion exacte et budget entier valides', () => {
    assert.deepEqual(parsePrefill('?occasion=No%C3%ABl&budget=30', OCCASIONS, 5000), { occasion: 'Noël', budget: 30 });
    assert.deepEqual(parsePrefill('?occasion=Saint-Valentin', OCCASIONS, 5000), { occasion: 'Saint-Valentin', budget: null });
    assert.deepEqual(parsePrefill('?budget=15', OCCASIONS, 5000), { occasion: null, budget: 15 });
    assert.deepEqual(parsePrefill('?occasion=F%C3%AAte+des+M%C3%A8res', OCCASIONS, 5000).occasion, 'Fête des Mères');
});

test('parsePrefill : occasion hors liste ou piégée ignorée', () => {
    for (const q of ['?occasion=noël', '?occasion=Noël<script>', '?occasion=', '?occasion=Halloween', '?occasion=Noël%00']) {
        assert.equal(parsePrefill(q, OCCASIONS, 5000).occasion, null, q);
    }
});

test('parsePrefill : budget hors bornes, décimal ou non numérique ignoré', () => {
    for (const q of ['?budget=4', '?budget=0', '?budget=-10', '?budget=30.5', '?budget=5001', '?budget=abc', '?budget=1e3', '?budget=999999']) {
        assert.equal(parsePrefill(q, OCCASIONS, 5000).budget, null, q);
    }
    assert.equal(parsePrefill(`?budget=${PREFILL_MIN_BUDGET}`, OCCASIONS, 5000).budget, PREFILL_MIN_BUDGET);
    assert.equal(parsePrefill('?budget=5000', OCCASIONS, 5000).budget, 5000);
});

test('parsePrefill : entrées absentes ou invalides → rien', () => {
    assert.deepEqual(parsePrefill('', OCCASIONS, 5000), { occasion: null, budget: null });
    assert.deepEqual(parsePrefill(undefined, OCCASIONS, 5000), { occasion: null, budget: null });
    assert.deepEqual(parsePrefill('?occasion=Noël', undefined, 5000), { occasion: null, budget: null });
});
