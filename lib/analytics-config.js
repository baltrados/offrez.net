'use strict';
/**
 * Origine de l'outil de mesure d'audience sans cookies (Plausible, Umami), ajoutée à la CSP
 * (script-src, connect-src) uniquement si elle est valide. Vide ou invalide : CSP inchangée.
 * Validation stricte : la valeur est insérée dans un en-tête de sécurité, elle ne doit pas pouvoir
 * l'affaiblir (pas de mot-clé CSP, pas d'espace, pas de joker, https uniquement, origine seule).
 * @param {string|undefined} raw
 * @returns {{ value: string|null, warning: string|null }}
 */
function parseAnalyticsOrigin(raw) {
    const s = String(raw ?? '').trim();
    if (!s) return { value: null, warning: null };
    const invalid = { value: null, warning: 'ANALYTICS_ORIGIN invalide (origine https attendue, ex. https://plausible.io) : ignorée' };
    if (!/^https:\/\/[a-z0-9.-]+(:\d{1,5})?\/?$/i.test(s)) return invalid;
    let url;
    try {
        url = new URL(s);
    } catch {
        return invalid;
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        return invalid;
    }
    if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) return invalid;
    return { value: url.origin, warning: null };
}

module.exports = { parseAnalyticsOrigin };
