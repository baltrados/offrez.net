'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseAnalyticsOrigin } = require('../../lib/analytics-config');

const INVALID_WARNING = 'ANALYTICS_ORIGIN invalide (origine https attendue, ex. https://plausible.io) : ignorée';

test('parseAnalyticsOrigin : vide → désactivé, sans avertissement', () => {
    for (const raw of [undefined, '', '   ']) {
        assert.deepEqual(parseAnalyticsOrigin(raw), { value: null, warning: null });
    }
});

test('parseAnalyticsOrigin : origines https valides normalisées', () => {
    assert.equal(parseAnalyticsOrigin('https://plausible.io').value, 'https://plausible.io');
    assert.equal(parseAnalyticsOrigin(' https://cloud.umami.is/ ').value, 'https://cloud.umami.is');
    assert.equal(parseAnalyticsOrigin('https://Stats.Example.com:8443').value, 'https://stats.example.com:8443');
});

test('parseAnalyticsOrigin : refuse tout ce qui pourrait affaiblir la CSP', () => {
    for (const raw of [
        'http://plausible.io', 'javascript:alert(1)', 'https://a.com/path', 'https://a.com/?x=1', 'https://a.com/#h',
        "https://a.com 'unsafe-inline'", 'https://a.com; script-src *', 'https://*.a.com', '*', "'self'",
        'https://u:p@a.com', 'https://localhost', 'https://a.com https://b.com', 'data:', 'https://'
    ]) {
        const r = parseAnalyticsOrigin(raw);
        assert.equal(r.value, null, `refusé : ${raw}`);
        assert.equal(r.warning, INVALID_WARNING, 'message fixe, sans recopier la valeur');
    }
});
