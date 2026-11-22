/**
 * ANALYSE/PRODUCTS.JS - Logique pure de l'analyse (sans DOM, sans réseau)
 * ======================================================================
 * Normalisation du profil, payload /api/analyze, fourchette de prix de recherche,
 * filtrage qualité à 3 niveaux, scoring, déduplication et termes de secours.
 * Importable sous Node (tests unitaires) : aucun effet de bord à l'import.
 */

import {
    MIN_PRICE_RATIO,
    MIN_PRICE_COLLAPSE_RATIO,
    FALLBACK_MIN_PRICE_RATIO,
    MIN_VALID_PRICE,
    STRICT_MIN_RATING,
    STRICT_MIN_REVIEWS,
    INTERMEDIATE_MIN_RATING,
    INTERMEDIATE_MIN_REVIEWS,
    MAX_PRODUCTS_PER_PERSON,
    TITLE_SIMILARITY_THRESHOLD,
    TITLE_MIN_WORD_LENGTH
} from './settings.js?v=2026112205';

// ============================================
// PROFIL & PAYLOAD
// ============================================

/**
 * Normalise un profil brut de l'étape 2.
 * @param {any} raw
 * @returns {{nom: string, sexe: string, age: any, budget: number, tags: any[], details: object}|null}
 *          null si le budget est absent, invalide ou ≤ 0 (profil ignoré).
 */
export function normalizeProfile(raw) {
    const budget = Number(raw?.budget);
    if (!Number.isFinite(budget) || budget <= 0) return null;
    return {
        nom: String(raw.nom || 'Anonyme'),
        sexe: String(raw.sexe || 'Non précisé'),
        age: raw.age ?? null,
        budget,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        details: raw.details || {}
    };
}

/**
 * Corps de POST /api/analyze : profil structuré uniquement (le prompt est construit côté serveur).
 * @param {any} contexte - Occasion (data.contexte)
 * @param {ReturnType<typeof normalizeProfile>} personne - Profil normalisé
 */
export function buildAnalyzePayload(contexte, personne) {
    return {
        contexte,
        profile: {
            nom: personne.nom,
            sexe: personne.sexe,
            age: personne.age,
            budget: personne.budget,
            tags: personne.tags,
            adore: personne.details?.adore || '',
            eviter: personne.details?.eviter || ''
        }
    };
}

/**
 * Fourchette de prix d'une recherche Amazon : min = 20 % du budget (entier inférieur),
 * ramené à 0 s'il est trop proche du max (RapidAPI n'aime pas min ≈ max).
 * @param {number} budget
 * @returns {{maxPrice: number, minPrice: number}}
 */
export function computeSearchPriceRange(budget) {
    let minPrice = Math.floor(budget * MIN_PRICE_RATIO);
    if (minPrice >= budget * MIN_PRICE_COLLAPSE_RATIO) minPrice = 0;
    return { maxPrice: budget, minPrice };
}

/** Prix minimum de la recherche de secours (10 % du budget, entier inférieur). */
export function computeFallbackMinPrice(budget) {
    return Math.floor(budget * FALLBACK_MIN_PRICE_RATIO);
}

// ============================================
// FILTRAGE QUALITÉ (3 niveaux)
// ============================================

/** Niveaux de filtrage, du plus exigeant au plus souple. */
export const FILTER_LEVELS = Object.freeze({
    STRICT: Object.freeze({ name: 'strict', minRating: STRICT_MIN_RATING, minReviews: STRICT_MIN_REVIEWS }),
    INTERMEDIATE: Object.freeze({ name: 'intermediate', minRating: INTERMEDIATE_MIN_RATING, minReviews: INTERMEDIATE_MIN_REVIEWS }),
    SOFT: Object.freeze({ name: 'soft', minRating: null, minReviews: null }) // prix + titre uniquement
});

const FILTER_CASCADE = [FILTER_LEVELS.STRICT, FILTER_LEVELS.INTERMEDIATE, FILTER_LEVELS.SOFT];

/** Note Amazon tolérante ("4,5" → 4.5) ; 0 si absente ou illisible. */
export function parseRating(item) {
    return parseFloat(String(item?.rating || '0').replace(',', '.')) || 0;
}

/** Nombre d'avis tolérant ("1 200", "1,200" → 1200) ; 0 si absent ou illisible. */
export function parseReviewCount(item) {
    const digits = String(item?.reviews || item?.reviews_count || '0').replace(/[^0-9]/g, '');
    return parseInt(digits, 10) || 0;
}

/** Prix valide (> 1 € et ≤ budget max) et titre présent : condition commune à tous les niveaux. */
function hasValidPriceAndTitle(item, maxPrice) {
    const price = Number(item?.price?.value);
    return Number.isFinite(price) && price > MIN_VALID_PRICE && price <= maxPrice && Boolean(item?.title);
}

/**
 * Filtre des résultats Amazon selon un niveau.
 * @param {any[]} results
 * @param {number} maxPrice
 * @param {{minRating: number|null, minReviews: number|null}} level - un de FILTER_LEVELS
 * @returns {any[]}
 */
export function filterProducts(results, maxPrice, level) {
    return results.filter(item => {
        if (!hasValidPriceAndTitle(item, maxPrice)) return false;
        if (level.minRating !== null && parseRating(item) < level.minRating) return false;
        if (level.minReviews !== null && parseReviewCount(item) < level.minReviews) return false;
        return true;
    });
}

/**
 * Applique la cascade strict → intermédiaire → souple : renvoie les produits du premier
 * niveau qui en conserve au moins un.
 * @param {any[]} results
 * @param {number} maxPrice
 * @returns {{products: any[], level: string|null}} level null si aucun produit ne passe.
 */
export function selectValidProducts(results, maxPrice) {
    for (const level of FILTER_CASCADE) {
        const products = filterProducts(results, maxPrice, level);
        if (products.length > 0) return { products, level: level.name };
    }
    return { products: [], level: null };
}

// ============================================
// SCORING
// ============================================

const SCORE_WEIGHTS = Object.freeze({ budget: 0.35, rating: 0.35, popularity: 0.20, position: 0.10 });
const PRIME_BONUS = 0.1;
/** Note supposée quand elle est absente ou non numérique (le scoring n'utilise pas parseRating). */
const DEFAULT_SCORING_RATING = 4;

/**
 * Score budget : favorise les produits qui utilisent 60-90 % du budget.
 * 60-90 % → 1 ; 90-100 % → 0.9 ; 40-60 % → 0.6 à 1 ; 20-40 % → 0.3 à 0.6 ; < 20 % → pénalisé ; sinon 0.
 * @param {number} budgetRatio - prix / budget
 */
export function computeBudgetScore(budgetRatio) {
    if (budgetRatio >= 0.60 && budgetRatio <= 0.90) return 1.0;
    if (budgetRatio > 0.90 && budgetRatio <= 1.0) return 0.9;
    if (budgetRatio >= 0.40 && budgetRatio < 0.60) return 0.6 + (budgetRatio - 0.40) * 2;
    if (budgetRatio >= 0.20 && budgetRatio < 0.40) return 0.3 + (budgetRatio - 0.20) * 1.5;
    if (budgetRatio > 0 && budgetRatio < 0.20) return budgetRatio * 1.5;
    return 0; // trop cher ou invalide
}

/**
 * Score pondéré d'un produit (budget 35 %, note 35 %, popularité 20 %, position 10 %, bonus Prime).
 * @param {any} item
 * @param {number} index - position dans les résultats Amazon (0 = premier)
 * @param {number} budget
 * @returns {{score: number, budgetRatio: number}}
 */
export function scoreProduct(item, index, budget) {
    const priceValue = Number(item.price?.value) || 0;
    const rating = Number(item.rating) || DEFAULT_SCORING_RATING;
    const reviewCount = Number(item.reviews || item.reviews_count) || 0;
    const isPrime = item.is_prime || false;

    const budgetRatio = priceValue / budget;
    const ratingScore = rating / 5;
    const popularityScore = Math.min(1, Math.log10(reviewCount + 1) / 3);
    const primeBonus = isPrime ? PRIME_BONUS : 0;

    const score = (computeBudgetScore(budgetRatio) * SCORE_WEIGHTS.budget)
        + (ratingScore * SCORE_WEIGHTS.rating)
        + (popularityScore * SCORE_WEIGHTS.popularity)
        + (1 / (index + 1)) * SCORE_WEIGHTS.position
        + primeBonus;
    return { score, budgetRatio };
}

/**
 * Score et trie (décroissant, tri stable) les produits d'une recherche, annotés avec la suggestion IA.
 * @param {any[]} products
 * @param {number} budget
 * @param {{term: string, reason?: string}} suggestion
 * @returns {any[]} nouveaux objets { ...item, score, budgetRatio, searchTerm, reason }
 */
export function rankProducts(products, budget, suggestion) {
    return products
        .map((item, index) => ({ ...item, ...scoreProduct(item, index, budget), searchTerm: suggestion.term, reason: suggestion.reason }))
        .sort((a, b) => b.score - a.score);
}

/**
 * Meilleur produit d'une recherche (filtrage 3 niveaux puis scoring), ou null.
 * @param {any[]} results - search_results bruts
 * @param {number} budget
 * @param {{term: string, reason?: string}} suggestion
 */
export function pickBestProduct(results, budget, suggestion) {
    const { products } = selectValidProducts(results, budget);
    if (products.length === 0) return null;
    return rankProducts(products, budget, suggestion)[0];
}

// ============================================
// DÉDUPLICATION
// ============================================

function titleWords(title) {
    return new Set(title.toLowerCase().split(/\s+/).filter(w => w.length > TITLE_MIN_WORD_LENGTH));
}

/**
 * Deux titres sont similaires si plus de 70 % de leurs mots (> 2 lettres) sont communs
 * (rapporté au titre qui a le plus de mots).
 */
export function areTitlesSimilar(title1, title2) {
    if (!title1 || !title2) return false;
    const words1 = titleWords(title1);
    const words2 = titleWords(title2);
    if (words1.size === 0 || words2.size === 0) return false;
    const intersection = [...words1].filter(w => words2.has(w));
    return intersection.length / Math.max(words1.size, words2.size) > TITLE_SIMILARITY_THRESHOLD;
}

/**
 * Sélection finale diversifiée :
 * 1re passe : le premier produit de chaque terme de recherche (sans titre similaire déjà retenu) ;
 * 2e passe : complète avec les autres produits non similaires, jusqu'à 5.
 * @param {any[]} products - dans l'ordre de préférence
 * @returns {any[]}
 */
export function dedupeProducts(products) {
    const usedSearchTerms = new Set();
    const uniqueProducts = [];
    const isDuplicate = product => uniqueProducts.some(existing => areTitlesSimilar(existing.title, product.title));

    for (const product of products) {
        if (!usedSearchTerms.has(product.searchTerm) && !isDuplicate(product)) {
            usedSearchTerms.add(product.searchTerm);
            uniqueProducts.push(product);
        }
    }
    for (const product of products) {
        if (uniqueProducts.length >= MAX_PRODUCTS_PER_PERSON) break;
        if (!isDuplicate(product)) uniqueProducts.push(product);
    }
    return uniqueProducts;
}

// ============================================
// RECHERCHE DE SECOURS
// ============================================

/**
 * Termes génériques quand aucune suggestion IA n'a donné de produit.
 * @param {ReturnType<typeof normalizeProfile>} personne
 * @param {any} contexte
 * @returns {string[]}
 */
export function buildFallbackTerms(personne, contexte) {
    const terms = [];
    if (personne.tags.length > 0) {
        const genre = personne.sexe === 'Femme' ? 'femme' : personne.sexe === 'Homme' ? 'homme' : '';
        terms.push(`cadeau ${personne.tags[0].toLowerCase()} ${genre}`.trim());
    }
    if (personne.age) {
        const ageRange = personne.age < 18 ? 'adolescent' : personne.age < 30 ? 'jeune adulte' : personne.age < 60 ? 'adulte' : 'senior';
        terms.push(`idée cadeau ${ageRange}`);
    }
    if (terms.length === 0) {
        terms.push(`coffret cadeau ${contexte || 'anniversaire'}`);
    }
    return terms;
}

/** Filtre de la recherche de secours : identique au niveau souple (prix + titre). */
export function filterFallbackProducts(results, budget) {
    return filterProducts(results, budget, FILTER_LEVELS.SOFT);
}
