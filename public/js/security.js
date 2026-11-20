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

/**
 * Valide et nettoie une URL (pour les liens Amazon).
 * @param {string} url - URL à valider
 * @returns {string} - URL sécurisée ou chaîne vide
 */
export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';

    // N'accepter que les URLs Amazon
    const allowedDomains = [
        'amazon.fr',
        'amazon.com',
        'www.amazon.fr',
        'www.amazon.com',
        'amzn.to'
    ];

    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();

        if (allowedDomains.some(domain =>
            hostname === domain || hostname.endsWith('.' + domain)
        )) {
            return url;
        }
    } catch (e) {
        // URL invalide
    }

    return '#';
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
 * Valide un email côté client.
 * @param {string} email - Email à valider
 * @returns {boolean}
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
}

/**
 * Génère un ID unique pour les éléments DOM.
 * @returns {string}
 */
export function generateId() {
    return 'OFFREZ_' + Math.random().toString(36).substr(2, 9);
}
