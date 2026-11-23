/**
 * CONSTANTS.JS - Clés centralisées
 * =================================
 * Source unique pour les clés localStorage.
 */

export const STORAGE_KEYS = {
    GIFT_CONFIG: 'giftConfig',
    FINAL_DATA: 'finalData'
};

// [TASK-005] Limites centralisées
export const LIMITS = {
    MIN_BUDGET: 5,      // Budget min par personne (€) : en dessous, la recherche Amazon ne peut rien trouver
    MAX_BUDGET: 5000,   // Budget max par personne (€)
    MAX_PROFILES: 10    // Nombre max de profils
};
