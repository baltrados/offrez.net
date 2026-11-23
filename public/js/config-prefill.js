/**
 * CONFIG-PREFILL.JS - Pré-remplissage de config.html depuis l'URL (liens des articles du blog)
 * =========================================================================================
 * Exemple : /config.html?occasion=Noël&budget=30. Logique pure (sans DOM) : l'appelant fournit la liste
 * des occasions proposées par la page. Toute valeur hors liste ou hors bornes est ignorée.
 */

/** Budget par personne accepté dans l'URL (€, entier). */
export const PREFILL_MIN_BUDGET = 5;

/**
 * @param {string} search - location.search (ex. "?occasion=No%C3%ABl&budget=30")
 * @param {string[]} allowedOccasions - valeurs exactes des chips d'occasion de la page
 * @param {number} maxBudget - plafond de budget (LIMITS.MAX_BUDGET)
 * @returns {{ occasion: string|null, budget: number|null }}
 */
export function parsePrefill(search, allowedOccasions, maxBudget) {
    let params;
    try {
        params = new URLSearchParams(typeof search === 'string' ? search : '');
    } catch {
        return { occasion: null, budget: null };
    }
    const rawOccasion = (params.get('occasion') || '').trim();
    const occasion = Array.isArray(allowedOccasions) && allowedOccasions.includes(rawOccasion) ? rawOccasion : null;

    const rawBudget = (params.get('budget') || '').trim();
    const n = /^\d{1,5}$/.test(rawBudget) ? Number(rawBudget) : NaN;
    const budget = Number.isInteger(n) && n >= PREFILL_MIN_BUDGET && n <= maxBudget ? n : null;

    return { occasion, budget };
}
