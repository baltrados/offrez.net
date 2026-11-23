/**
 * SECURITY.JS - Utilitaires de sécurité OFFREZ
 * =============================================
 * Fonctions pour prévenir les attaques XSS et sécuriser les données.
 */

/**
 * Échappe les caractères HTML dangereux pour prévenir les attaques XSS.
 * @param {string} str - Chaîne à assainir
 * @returns {string} - Chaîne sécurisée
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Hôtes Amazon autorisés (correspondance exacte) : amazon.fr seulement, le tag partenaire (-21) n'étant
// attribué que sur amazon.fr (amazon.com et amzn.to le perdraient).
const ALLOWED_URL_DOMAINS = [
    'amazon.fr',
    'www.amazon.fr'
];

/** ASIN Amazon : 10 caractères alphanumériques majuscules. */
const ASIN_PATTERN = /^[A-Z0-9]{10}$/;

/**
 * Parse une URL et la retourne seulement si elle est en https et sur un domaine autorisé.
 * @param {string} url
 * @returns {URL|null}
 */
function parseAllowedUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port !== '') return null;
        return ALLOWED_URL_DOMAINS.includes(parsed.hostname.toLowerCase()) ? parsed : null;
    } catch (e) {
        return null; // URL invalide
    }
}

/**
 * Valide et nettoie une URL (pour les liens Amazon).
 * @param {string} url - URL à valider
 * @returns {string} - URL normalisée (href encodé) ou '#'
 */
export function sanitizeUrl(url) {
    const parsed = parseAllowedUrl(url);
    return parsed ? parsed.href : '#';
}

/**
 * Construit un lien affilié Amazon : remplace/ajoute le paramètre `tag`.
 * @param {string} url - URL produit Amazon
 * @param {string} tag - Tag partenaire
 * @returns {string} - URL normalisée avec tag, ou '#'
 */
export function buildAffiliateUrl(url, tag) {
    const parsed = parseAllowedUrl(url);
    if (!parsed) return '#';
    parsed.searchParams.set('tag', String(tag));
    return parsed.href;
}

/**
 * Lien affilié d'un produit : URL canonique https://www.amazon.fr/dp/<ASIN>?tag=<tag> si l'ASIN est valide
 * (sans paramètres de suivi), sinon le lien fourni passé par buildAffiliateUrl (amazon.fr, ou '#').
 * @param {{asin?: unknown, link?: unknown}} product
 * @param {string} tag
 * @returns {string}
 */
export function buildProductUrl(product, tag) {
    const asin = product?.asin;
    if (typeof asin === 'string' && ASIN_PATTERN.test(asin)) {
        const url = new URL(`https://www.amazon.fr/dp/${asin}`);
        url.searchParams.set('tag', String(tag));
        return url.href;
    }
    return buildAffiliateUrl(/** @type {string} */ (product?.link), tag);
}

/** Longueur maximale du terme placé dans un lien de recherche Amazon. */
const SEARCH_TERM_MAX_CHARS = 100;

/**
 * Lien de recherche Amazon.fr taggé pour une idée cadeau (repli sans appel API) :
 * https://www.amazon.fr/s?k=<terme>&tag=<tag>. Domaine fixe ; le terme est encodé par URLSearchParams.
 * @param {string} term - Idée cadeau (texte libre venant de l'IA)
 * @param {string} tag - Tag partenaire
 * @returns {string} - URL de recherche, ou '#' si le terme est inexploitable
 */
export function buildAmazonSearchUrl(term, tag) {
    // Array.from : coupe par caractère (un emoji n'est jamais coupé en deux)
    const cleaned = Array.from(String(term ?? '').replace(/\s+/g, ' ').trim()).slice(0, SEARCH_TERM_MAX_CHARS).join('');
    if (cleaned.length < 2) return '#';
    const url = new URL('https://www.amazon.fr/s');
    url.searchParams.set('k', cleaned);
    url.searchParams.set('tag', String(tag));
    return url.href;
}

/**
 * Tronque un texte de manière sécurisée.
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur maximale
 * @returns {string} - Texte tronqué et échappé
 */
export function truncateText(text, maxLength = 50) {
    if (!text) return '';
    const str = String(text);
    // [TASK-006] Tronquer d'abord (sur le texte brut), PUIS échapper
    // Évite de couper une entité HTML au milieu (ex: &amp; → &am)
    if (str.length <= maxLength) return escapeHtml(str);
    return escapeHtml(str.substring(0, maxLength)) + '...';
}

/**
 * Génère un ID unique pour les éléments DOM.
 * @returns {string}
 */
export function generateId() {
    return 'OFFREZ_' + Math.random().toString(36).substr(2, 9);
}
