/**
 * ANALYSE/SETTINGS.JS - Constantes nommées de l'analyse (étape 3)
 * ================================================================
 * Aucune logique, aucun effet de bord. Modifier une valeur ici = changer le comportement
 * (et donc bumper le ?v= des modules de l'analyse, voir documentation/14 §3).
 */

/** Tag Amazon Partenaire (liens produits et panier groupé). */
export const AFFILIATE_TAG = 'offreznet-21';

// --- Appels IA (Gemini via /api/analyze) -----------------------------------
/** Nombre d'appels à /api/analyze par profil (1 essai + 1 nouvelle tentative). */
export const GEMINI_MAX_ATTEMPTS = 2;
/** Pause avant la nouvelle tentative après une erreur (ms). */
export const GEMINI_RETRY_DELAY_MS = 1500;
/** Statuts HTTP pour lesquels une nouvelle tentative est inutile (requête invalide, quota ou plafond atteint). */
export const GEMINI_NO_RETRY_STATUSES = [400, 429, 503];

/**
 * Faut-il relancer /api/analyze après cette erreur ? Non pour 400, 429 et 503 (le résultat serait identique
 * et chaque nouvel appel peut consommer un quota) ; oui pour les erreurs réseau/timeout (pas de statut)
 * et les autres 5xx.
 * @param {{status?: number}|null|undefined} error
 */
export function shouldRetryGemini(error) {
    return !GEMINI_NO_RETRY_STATUSES.includes(error?.status);
}
/**
 * L'erreur signale-t-elle une limite atteinte (429 quota par IP, 503 plafond global ou service coupé) ?
 * Dans ce cas un nouvel appel est voué à l'échec : pas de « Réessayer », pas de données conservées.
 * @param {{status?: number}|null|undefined} error
 */
export function isLimitReachedError(error) {
    return error?.status === 429 || error?.status === 503;
}
/** « Temps de réflexion » affiché avant l'appel IA (ms) : court, l'appel IA prend déjà 1 à 3 s. */
export const THINK_DELAY_MS = 300;

// --- Recherche Amazon (via /api/search) -------------------------------------
/**
 * Nombre maximal de recherches RapidAPI par profil (coût API : le plan Basic n'offre que 100 requêtes
 * par mois). Les autres idées de l'IA deviennent des liens de recherche Amazon taggés, sans appel API.
 */
export const MAX_AMAZON_SEARCHES = 1;
/**
 * Paliers de prix maximum (€, croissants) : la recherche utilise le plus grand palier ≤ budget, pour
 * que des budgets voisins (47 € et 49 €) partagent la même clé de cache serveur.
 */
export const PRICE_BUCKETS = Object.freeze([
    10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 175, 200, 250, 300, 350, 400,
    500, 600, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000
]);
/** Prix minimum demandé = palier maximum × ce ratio (arrondi à l'entier inférieur). */
export const MIN_PRICE_RATIO = 0.20;
/** Si le prix minimum atteint max × ce ratio, il est ramené à 0 (RapidAPI refuse min ≈ max). */
export const MIN_PRICE_COLLAPSE_RATIO = 0.9;

// --- Filtrage qualité des produits (3 niveaux puis repli) ---------------------
/** Prix strictement supérieur à ce seuil (€) pour écarter les prix aberrants (0, 1 €). */
export const MIN_VALID_PRICE = 1;
/** Niveau 1 (strict) : note et nombre d'avis minimum. */
export const STRICT_MIN_RATING = 3.5;
export const STRICT_MIN_REVIEWS = 5;
/** Niveau 2 (intermédiaire) : note et nombre d'avis minimum. */
export const INTERMEDIATE_MIN_RATING = 3.0;
export const INTERMEDIATE_MIN_REVIEWS = 1;

// --- Sélection finale -------------------------------------------------------
/** Nombre maximal de produits proposés par personne. */
export const MAX_PRODUCTS_PER_PERSON = 5;
/** Deux titres sont « similaires » si la part de mots communs dépasse ce seuil. */
export const TITLE_SIMILARITY_THRESHOLD = 0.7;
/** Longueur minimale (exclusive) d'un mot pris en compte dans la similarité des titres. */
export const TITLE_MIN_WORD_LENGTH = 2;

// --- Progression (pourcentages de la barre) -----------------------------------
export const PROGRESS_START = 5;
export const PROGRESS_PROFILES_BASE = 10;
export const PROGRESS_PROFILES_SPAN = 70;

// --- Rendu et interactions --------------------------------------------------
/** Longueur maximale du titre produit affiché sur la carte. */
export const TITLE_MAX_CHARS = 80;
/** Animation « Gift Reveal » : délai initial et décalage entre cartes (ms). */
export const REVEAL_START_DELAY_MS = 100;
export const REVEAL_STAGGER_MS = 150;
/** Retour visuel « Lien copié ! » (ms). */
export const SHARE_FEEDBACK_MS = 2000;

// --- Rétention (compléments, partage, rappel) -------------------------------
/** Compléments cadeau proposés en liens de recherche Amazon taggés (aucun appel API). */
export const GIFT_ADDONS = Object.freeze([
    Object.freeze({ label: 'Papier cadeau', term: 'papier cadeau', icon: '🎀' }),
    Object.freeze({ label: 'Sac cadeau', term: 'sac cadeau', icon: '🛍️' }),
    Object.freeze({ label: 'Carte de vœux', term: 'carte de voeux', icon: '💌' }),
    Object.freeze({ label: 'Piles (si le cadeau en a besoin)', term: 'piles alcalines', icon: '🔋' })
]);
/** Alerte du rappel calendrier : nombre de jours avant l'occasion. */
export const REMINDER_ALERT_DAYS = 7;
