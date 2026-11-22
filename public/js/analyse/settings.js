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
/** « Temps de réflexion » affiché avant l'appel IA (ms). */
export const THINK_DELAY_MS = 800;

// --- Recherche Amazon (via /api/search) -------------------------------------
/** Nombre maximal de suggestions IA cherchées sur Amazon par profil (coût API). */
export const MAX_AMAZON_SEARCHES = 2;
/** Prix minimum demandé = budget × ce ratio (arrondi à l'entier inférieur). */
export const MIN_PRICE_RATIO = 0.20;
/** Si le prix minimum atteint budget × ce ratio, il est ramené à 0 (RapidAPI refuse min ≈ max). */
export const MIN_PRICE_COLLAPSE_RATIO = 0.9;
/** Prix minimum de la recherche de secours = budget × ce ratio. */
export const FALLBACK_MIN_PRICE_RATIO = 0.10;
/** Nombre de termes génériques essayés par la recherche de secours. */
export const FALLBACK_MAX_TERMS = 1;
/** Score attribué au produit de secours. */
export const FALLBACK_PRODUCT_SCORE = 0.5;

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
/** Effet de chargement à la découverte d'une nouvelle suggestion : 800 à 1500 ms. */
export const DISCOVERY_DELAY_MIN_MS = 800;
export const DISCOVERY_DELAY_JITTER_MS = 700;
/** Modale d'achat : compte à rebours avant redirection (secondes). */
export const PURCHASE_COUNTDOWN_SECONDS = 3;
/** Retour visuel « Lien copié ! » (ms). */
export const SHARE_FEEDBACK_MS = 2000;
