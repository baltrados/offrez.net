/**
 * ANALYSE.JS - Orchestrateur de l'étape 3 (point d'entrée de analyse.html)
 * ========================================================================
 * 1. Récupère les profils de l'étape 2 (et les retire du localStorage, voir analyse/session-data.js).
 * 2. Pour chaque profil : suggestions IA (serveur → Gemini), recherches Amazon (serveur → RapidAPI),
 *    filtrage / scoring / déduplication (analyse/products.js), recherche de secours si besoin.
 * 3. Affiche les résultats (analyse/render.js), la modale email et le suivi des clics d'achat.
 *
 * Modules : analyse/settings.js (constantes), products.js et cart.js (logique pure, testée sous Node),
 * session-data.js (cycle de vie de finalData), ui.js (progression, erreurs), render.js (cartes, panier),
 * email-capture.js, purchase.js.
 * Versionnage : tout module versionné importé ici porte le même ?v= que ce fichier dans analyse.html
 * (voir documentation/14_SUIVI_CHANTIER_QUALITE.md §3).
 */

import { callGemini, searchAmazon } from './api.js?v=2026112202';
import {
    normalizeProfile,
    buildAnalyzePayload,
    computeSearchPriceRange,
    computeFallbackMinPrice,
    pickBestProduct,
    dedupeProducts,
    buildFallbackTerms,
    filterFallbackProducts
} from './analyse/products.js?v=2026112202';
import { takeAnalysisData, purgeAnalysisData } from './analyse/session-data.js?v=2026112202';
import { updateProgress, hideStatusIndicator, showMissingDataState, showFatalErrorOverlay } from './analyse/ui.js?v=2026112202';
import { renderResults } from './analyse/render.js?v=2026112202';
import { initEmailCapture } from './analyse/email-capture.js?v=2026112202';
import { initPurchaseTracking } from './analyse/purchase.js?v=2026112202';
import {
    GEMINI_MAX_ATTEMPTS,
    GEMINI_RETRY_DELAY_MS,
    THINK_DELAY_MS,
    MAX_AMAZON_SEARCHES,
    FALLBACK_MAX_TERMS,
    FALLBACK_PRODUCT_SCORE,
    PROGRESS_START,
    PROGRESS_PROFILES_BASE,
    PROGRESS_PROFILES_SPAN
} from './analyse/settings.js?v=2026112202';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Résultat affichable pour une personne. */
function personResult(personne, products) {
    return { personne, products, currentIndex: 0, viewedIndices: new Set([0]) };
}

/**
 * Suggestions IA avec une nouvelle tentative (réponse vide ou erreur).
 * @returns {Promise<{suggestions: any[]}|null>} null si rien d'exploitable après toutes les tentatives.
 */
async function fetchSuggestions(payload, personne, profileProgress) {
    let iaResult = null;
    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt++) {
        try {
            iaResult = await callGemini(payload);
            if (iaResult?.suggestions?.length > 0) break;
        } catch {
            if (attempt === 0) {
                updateProgress(profileProgress + 18, `Nouvelle tentative pour ${personne.nom}...`);
                await wait(GEMINI_RETRY_DELAY_MS);
            }
        }
    }
    return iaResult?.suggestions?.length > 0 ? iaResult : null;
}

/** Meilleur produit de chacune des premières suggestions IA (une recherche Amazon par suggestion). */
async function searchSuggestedProducts(suggestions, personne) {
    const products = [];
    for (const sugg of suggestions.slice(0, MAX_AMAZON_SEARCHES)) {
        if (!sugg?.term || typeof sugg.term !== 'string') continue;
        const { maxPrice, minPrice } = computeSearchPriceRange(personne.budget);

        let response;
        try {
            response = await searchAmazon(sugg.term, maxPrice, minPrice);
        } catch {
            continue; // recherche suivante
        }
        const results = response?.search_results ?? [];
        if (!Array.isArray(results) || results.length === 0) continue;

        // Diversité stricte : un seul produit (le meilleur) par idée de l'IA
        const best = pickBestProduct(results, personne.budget, sugg);
        if (best) products.push(best);
    }
    return products;
}

/** Recherche de secours avec un terme générique ; renvoie un produit ou null. */
async function searchFallbackProduct(personne, contexte) {
    for (const term of buildFallbackTerms(personne, contexte).slice(0, FALLBACK_MAX_TERMS)) {
        try {
            const response = await searchAmazon(term, personne.budget, computeFallbackMinPrice(personne.budget));
            const products = filterFallbackProducts(response?.search_results ?? [], personne.budget);
            if (products.length > 0) {
                const best = products[0];
                best.searchTerm = term;
                best.reason = `Suggestion alternative pour ${personne.nom}`;
                best.score = FALLBACK_PRODUCT_SCORE;
                best.budgetRatio = Number(best.price?.value) / personne.budget;
                return best;
            }
        } catch {
            // échec de la recherche de secours : profil sans résultat
        }
    }
    return null;
}

/**
 * Analyse complète d'un profil.
 * @returns {Promise<{status: 'ok', result: object}|{status: 'empty'}|{status: 'failed'}>}
 */
async function analyseProfile(personne, contexte, profileProgress) {
    try {
        // « Temps de réflexion » affiché avant l'appel IA
        updateProgress(profileProgress + 5, `Analyse psychologique de ${personne.nom}...`);
        await wait(THINK_DELAY_MS);
        updateProgress(profileProgress + 15, `Croisement avec les tendances actuelles...`);

        const iaResult = await fetchSuggestions(buildAnalyzePayload(contexte, personne), personne, profileProgress);
        if (!iaResult) return { status: 'failed' };

        updateProgress(profileProgress + 20, `Recherche produits pour ${personne.nom}...`);
        const products = await searchSuggestedProducts(iaResult.suggestions, personne);
        if (products.length > 0) {
            return { status: 'ok', result: personResult(personne, dedupeProducts(products)) };
        }

        updateProgress(profileProgress + 30, `Recherche alternative pour ${personne.nom}...`);
        const fallback = await searchFallbackProduct(personne, contexte);
        return fallback ? { status: 'ok', result: personResult(personne, [fallback]) } : { status: 'empty' };
    } catch {
        return { status: 'failed' };
    }
}

async function lancerAnalyse() {
    const data = takeAnalysisData();
    if (!data) {
        showMissingDataState();
        return;
    }

    const totalProfiles = data.equipe.length;
    let processedProfiles = 0;
    updateProgress(PROGRESS_START, 'Démarrage de l\'analyse...');

    const personResults = [];
    // Profils dont l'analyse IA a échoué : distingue « service en échec » de « aucun produit trouvé ».
    let apiFailures = 0;

    for (const raw of data.equipe) {
        const personne = normalizeProfile(raw);
        if (!personne) continue; // budget invalide : profil ignoré

        const profileProgress = PROGRESS_PROFILES_BASE + (processedProfiles / totalProfiles) * PROGRESS_PROFILES_SPAN;
        updateProgress(profileProgress, `Analyse de ${personne.nom}...`);

        const outcome = await analyseProfile(personne, data.contexte, profileProgress);
        if (outcome.status === 'ok') {
            personResults.push(outcome.result);
            processedProfiles++;
        } else if (outcome.status === 'failed') {
            apiFailures++;
        }
    }

    hideStatusIndicator();
    updateProgress(100, 'Analyse terminée !');

    renderResults(personResults, apiFailures);
    // RGPD : profils purgés une fois l'analyse terminée ; copie de session gardée seulement si
    // l'échec est technique (« Réessayer » recharge la page et relance l'analyse).
    purgeAnalysisData({ keepForRetry: personResults.length === 0 && apiFailures > 0 });

    // Les résultats sont déjà affichés et les données purgées : un échec de la modale email
    // (fonction annexe) ne doit pas déclencher l'écran d'erreur fatal avec un « Réessayer » sans données.
    try {
        initEmailCapture(personResults);
    } catch { /* modale email indisponible : sans impact sur les résultats */ }
}

initPurchaseTracking();
lancerAnalyse().catch(() => {
    purgeAnalysisData({ keepForRetry: true });
    showFatalErrorOverlay();
});
