/**
 * CONSTANTS.JS - Clés centralisées
 * =================================
 * Source unique pour les clés localStorage.
 */

export const STORAGE_KEYS = {
    GIFT_CONFIG: 'giftConfig',
    FINAL_DATA: 'finalData',
    COOKIE_CONSENT: 'OFFREZ_cookie_consent'
};

// [TASK-005] Limites centralisées
export const LIMITS = {
    MAX_BUDGET: 5000,   // Budget max par personne (€)
    MAX_PROFILES: 10    // Nombre max de profils
};
