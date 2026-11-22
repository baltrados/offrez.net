/**
 * CONSENT.JS - Lecture du consentement cookies (source unique)
 * ============================================================
 * Format stocké (inchangé, écrit par legal.js) :
 *   localStorage['OFFREZ_cookie_consent'] = { accepted: boolean, date: ISO, expiry: ISO }
 *
 * Module sans effet de bord à l'import (testable sous Node avec un stub de localStorage).
 * Non versionné (?v=) : revalidé à chaque chargement, comme constants.js.
 */

import { STORAGE_KEYS } from './constants.js';

/**
 * Lit et parse l'objet de consentement. Ne lève jamais d'exception.
 * @returns {{accepted?: unknown, date?: unknown, expiry?: unknown}|null}
 */
function readConsent() {
    try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEYS.COOKIE_CONSENT);
        if (!raw) return null;
        const data = JSON.parse(raw);
        return data && typeof data === 'object' ? data : null;
    } catch {
        return null; // stockage indisponible ou JSON corrompu
    }
}

/** Vrai si la date d'expiration (ISO) est valide et dans le futur. */
function isNotExpired(consent, now) {
    const expiry = Date.parse(consent.expiry);
    return Number.isFinite(expiry) && expiry > now;
}

/**
 * Le visiteur a-t-il AUTORISÉ le suivi (tracking/analytics) ?
 * Vrai uniquement si le consentement existe, accepted === true ET n'est pas expiré.
 * @param {number} [now=Date.now()] - horodatage de référence (tests)
 * @returns {boolean}
 */
export function isTrackingAllowed(now = Date.now()) {
    const consent = readConsent();
    return Boolean(consent) && consent.accepted === true && isNotExpired(consent, now);
}

/**
 * Le visiteur a-t-il déjà RÉPONDU à la bannière (accepté OU refusé) et ce choix est-il encore valide ?
 * Sert uniquement à décider d'afficher la bannière (ne signifie PAS que le suivi est autorisé).
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function hasConsentDecision(now = Date.now()) {
    const consent = readConsent();
    return Boolean(consent) && isNotExpired(consent, now);
}
