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

// Domaines Amazon autorisés (sous-domaines acceptés via endsWith('.' + domaine))
const ALLOWED_URL_DOMAINS = [
    'amazon.fr',
    'amazon.com',
    'www.amazon.fr',
    'www.amazon.com',
    'amzn.to'
];

/**
 * Parse une URL et la retourne seulement si elle est en https et sur un domaine autorisé.
 * @param {string} url
 * @returns {URL|null}
 */
function parseAllowedUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') return null;
        const hostname = parsed.hostname.toLowerCase();
        const allowed = ALLOWED_URL_DOMAINS.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        );
        return allowed ? parsed : null;
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
