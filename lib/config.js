'use strict';
// Configuration pure (sans effet de bord) : analyse des variables d'environnement.

const DEFAULT_TRUST_PROXY = 1;

/**
 * Analyse TRUST_PROXY : entier >= 0 (nombre de proxys de confiance devant l'app).
 * Absent/vide -> 1 sans avertissement. Invalide (non entier, négatif, 'true', etc.) -> 1 avec warning.
 * 'true' est volontairement refusé : il ferait confiance à tout X-Forwarded-For (IP falsifiable).
 * @returns {{ value: number, warning: string|null }}
 */
function parseTrustProxy(raw) {
    if (raw === undefined || raw === null) return { value: DEFAULT_TRUST_PROXY, warning: null };
    const str = String(raw).trim();
    if (str === '') return { value: DEFAULT_TRUST_PROXY, warning: null };
    if (/^\d{1,3}$/.test(str)) return { value: parseInt(str, 10), warning: null };
    return {
        value: DEFAULT_TRUST_PROXY,
        warning: `TRUST_PROXY invalide (entier >= 0 attendu), valeur par défaut ${DEFAULT_TRUST_PROXY} utilisée`
    };
}

module.exports = { parseTrustProxy, DEFAULT_TRUST_PROXY };
