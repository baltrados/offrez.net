/**
 * ANALYSE/RESULTS-STORE.JS - Résultats conservés dans l'onglet (retour depuis Amazon)
 * ===================================================================================
 * Sur mobile, revenir d'Amazon peut recharger l'onglet d'OFFREZ ; les profils ayant été purgés (RGPD,
 * voir session-data.js), l'utilisateur perdait ses résultats. On garde donc les cartes affichées
 * (prénom, budget, produits) dans le sessionStorage : limité à l'onglet, effacé à sa fermeture,
 * expiré après RESULTS_TTL_MS. Rien n'est envoyé au serveur. Lecture : validation stricte (stockage
 * modifiable par l'utilisateur), champs connus seulement ; l'affichage échappe tout de toute façon.
 * Aucun effet de bord à l'import.
 */

export const RESULTS_KEY = 'offrezResults';
/** Durée de conservation des résultats dans l'onglet (2 h). */
export const RESULTS_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_PEOPLE = 20;
const MAX_PRODUCTS = 10;

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Copie bornée d'un produit (ou d'une idée en lien de recherche), champs connus seulement. */
function cleanProduct(p) {
    if (!p || typeof p !== 'object') return null;
    if (p.kind === 'search') {
        const term = str(p.term, 100).trim();
        if (term.length < 2) return null;
        return { kind: 'search', term, searchTerm: term, title: term, reason: str(p.reason, 300) };
    }
    const title = str(p.title, 300);
    if (!title) return null;
    return {
        title,
        link: str(p.link, 2048),
        asin: typeof p.asin === 'string' && /^[A-Z0-9]{10}$/.test(p.asin) ? p.asin : null,
        image: str(p.image, 2048) || null,
        price: { value: num(p.price?.value) ?? 0, raw: str(p.price?.raw, 30) },
        rating: num(p.rating),
        reviews: Number.isSafeInteger(p.reviews) && p.reviews >= 0 ? p.reviews : null,
        is_prime: p.is_prime === true,
        is_best_seller: p.is_best_seller === true,
        reason: str(p.reason, 300),
        searchTerm: str(p.searchTerm, 100)
    };
}

function cleanPersonResult(pr) {
    if (!pr || typeof pr !== 'object') return null;
    const budget = num(pr.personne?.budget);
    if (budget === null || budget <= 0) return null;
    const products = (Array.isArray(pr.products) ? pr.products : []).slice(0, MAX_PRODUCTS).map(cleanProduct).filter(Boolean);
    if (products.length === 0) return null;
    const index = Number.isInteger(pr.currentIndex) && pr.currentIndex >= 0 && pr.currentIndex < products.length ? pr.currentIndex : 0;
    return { personne: { nom: str(pr.personne?.nom, 60) || 'Anonyme', budget }, products, currentIndex: index };
}

/**
 * Enregistre les résultats affichés.
 * @param {any[]} personResults
 * @param {string} contexte - occasion
 * @param {{session?: Storage, now?: number}} [opts]
 */
export function saveResults(personResults, contexte, { session = globalThis.sessionStorage, now = Date.now() } = {}) {
    const results = (Array.isArray(personResults) ? personResults : []).slice(0, MAX_PEOPLE).map(cleanPersonResult).filter(Boolean);
    if (results.length === 0) return false;
    try {
        session?.setItem(RESULTS_KEY, JSON.stringify({ v: 1, savedAt: now, contexte: str(contexte, 60), results }));
        return true;
    } catch {
        return false; // stockage plein ou bloqué : fonctionnalité de confort, sans conséquence
    }
}

/**
 * Résultats enregistrés encore valides, ou null (absents, expirés, corrompus : purgés).
 * @param {{session?: Storage, now?: number}} [opts]
 * @returns {{contexte: string, results: any[]}|null}
 */
export function loadResults({ session = globalThis.sessionStorage, now = Date.now() } = {}) {
    let raw = null;
    try { raw = session?.getItem(RESULTS_KEY) ?? null; } catch { return null; }
    if (!raw) return null;
    let data = null;
    try { data = JSON.parse(raw); } catch { /* corrompu */ }
    const fresh = data && data.v === 1 && typeof data.savedAt === 'number'
        && now - data.savedAt >= 0 && now - data.savedAt <= RESULTS_TTL_MS;
    const results = fresh && Array.isArray(data.results)
        ? data.results.slice(0, MAX_PEOPLE).map(cleanPersonResult).filter(Boolean)
        : [];
    if (results.length === 0) {
        clearResults({ session });
        return null;
    }
    return { contexte: str(data.contexte, 60), results };
}

/** Supprime les résultats enregistrés (nouvelle analyse). */
export function clearResults({ session = globalThis.sessionStorage } = {}) {
    try { session?.removeItem(RESULTS_KEY); } catch { /* stockage indisponible */ }
}
