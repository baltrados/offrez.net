/**
 * ANALYSE.JS - Orchestrateur de l'étape 3 (point d'entrée de analyse.html)
 * ========================================================================
 * 1. Récupère les profils de l'étape 2 (et les retire du localStorage, voir analyse/session-data.js).
 * 2. Pour chaque profil : suggestions IA (serveur → Gemini), une recherche Amazon (serveur → RapidAPI)
 *    pour la première idée, filtrage / scoring / déduplication (analyse/products.js). Les autres idées,
 *    et toute idée sans produit (aucun résultat, erreur, quota atteint), deviennent des liens de
 *    recherche Amazon taggés : aucun appel API supplémentaire.
 * 3. Affiche les résultats (analyse/render.js) et le suivi des clics d'achat.
 *
 * Modules : analyse/settings.js (constantes), products.js et cart.js (logique pure, testée sous Node),
 * session-data.js (cycle de vie de finalData), ui.js (progression, erreurs), render.js (cartes, panier),
 * purchase.js.
 * Versionnage : tout module versionné importé ici porte le même ?v= que ce fichier dans analyse.html
 * (voir documentation/14_SUIVI_CHANTIER_QUALITE.md §3).
 */

import { callGemini, searchAmazon } from './api.js?v=2026112405';
import {
    normalizeProfile,
    buildAnalyzePayload,
    computeSearchPriceRange,
    pickBestProduct,
    dedupeProducts,
    buildSearchIdea,
    usableSuggestions
} from './analyse/products.js?v=2026112405';
import { takeAnalysisData, purgeAnalysisData } from './analyse/session-data.js?v=2026112405';
import { updateProgress, hideStatusIndicator, showMissingDataState, showFatalErrorOverlay } from './analyse/ui.js?v=2026112405';
import { renderResults } from './analyse/render.js?v=2026112405';
import { initPurchaseTracking } from './analyse/purchase.js?v=2026112405';
import { saveResults, loadResults, clearResults } from './analyse/results-store.js?v=2026112405';
import { renderRetentionTools } from './analyse/retention.js?v=2026112405';
import {
    GEMINI_MAX_ATTEMPTS,
    GEMINI_RETRY_DELAY_MS,
    shouldRetryGemini,
    isLimitReachedError,
    THINK_DELAY_MS,
    MAX_AMAZON_SEARCHES,
    PROGRESS_START,
    PROGRESS_PROFILES_BASE,
    PROGRESS_PROFILES_SPAN
} from './analyse/settings.js?v=2026112405';

// Tout le graphe de modules est chargé et lu : signal pour le garde-fou de démarrage (analyse-boot.js).
// Démarrage tardif (connexion lente) : on retire son éventuel message d'échec et on réaffiche la progression.
document.documentElement.setAttribute('data-analyse-boot', 'started');
document.querySelector('.boot-error')?.remove();
const bootStatus = document.getElementById('statusIndicator');
if (bootStatus) bootStatus.style.display = '';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Résultat affichable pour une personne. */
function personResult(personne, products) {
    return { personne, products, currentIndex: 0 };
}

/**
 * Suggestions IA avec une nouvelle tentative (réponse vide ou erreur réseau / 5xx ; jamais après 400, 429, 503).
 * @returns {Promise<{iaResult: {suggestions: any[]}|null, limitReached: boolean}>}
 *   iaResult null si rien d'exploitable ; limitReached vrai si le serveur a répondu 429 ou 503.
 */
async function fetchSuggestions(payload, personne, profileProgress) {
    let iaResult = null;
    let limitReached = false;
    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS; attempt++) {
        try {
            iaResult = await callGemini(payload);
            if (iaResult?.suggestions?.length > 0) break;
        } catch (error) {
            if (isLimitReachedError(error)) limitReached = true;
            if (!shouldRetryGemini(error)) break; // 400 / 429 / 503 : inutile (et coûteux) de réessayer
            if (attempt === 0) {
                updateProgress(profileProgress + 18, `Nouvelle tentative pour ${personne.nom}...`);
                await wait(GEMINI_RETRY_DELAY_MS);
            }
        }
    }
    return { iaResult: iaResult?.suggestions?.length > 0 ? iaResult : null, limitReached };
}

/**
 * Meilleur produit des premières suggestions IA (MAX_AMAZON_SEARCHES recherches au plus).
 * Dès qu'une recherche répond 429 / 503 (quota ou plafond atteint), searchState.blocked passe à vrai :
 * plus aucune recherche n'est lancée pendant cette analyse (les idées restent proposées en liens).
 * @param {Array<{term: string, reason?: string}>} suggestions - suggestions exploitables
 * @param {{budget: number}} personne
 * @param {{blocked: boolean}} searchState - partagé entre les profils d'une même analyse
 */
async function searchSuggestedProducts(suggestions, personne, searchState) {
    const products = [];
    for (const sugg of suggestions.slice(0, MAX_AMAZON_SEARCHES)) {
        if (searchState.blocked) break;
        const { maxPrice, minPrice } = computeSearchPriceRange(personne.budget);

        let response;
        try {
            response = await searchAmazon(sugg.term, maxPrice, minPrice);
        } catch (error) {
            if (isLimitReachedError(error)) searchState.blocked = true;
            continue; // l'idée sera proposée en lien de recherche
        }
        const results = response?.search_results ?? [];
        if (!Array.isArray(results) || results.length === 0) continue;

        // Diversité stricte : un seul produit (le meilleur) par idée de l'IA
        const best = pickBestProduct(results, personne.budget, sugg);
        if (best) products.push(best);
    }
    return products;
}

/**
 * Analyse complète d'un profil.
 * @param {{blocked: boolean}} searchState - état des recherches Amazon partagé entre les profils
 * @returns {Promise<{status: 'ok', result: object}|{status: 'empty'}|{status: 'failed', limitReached?: boolean}>}
 */
async function analyseProfile(personne, contexte, profileProgress, searchState) {
    try {
        // « Temps de réflexion » affiché avant l'appel IA
        updateProgress(profileProgress + 5, `Analyse psychologique de ${personne.nom}...`);
        await wait(THINK_DELAY_MS);
        updateProgress(profileProgress + 15, `Croisement avec les tendances actuelles...`);

        const { iaResult, limitReached } = await fetchSuggestions(buildAnalyzePayload(contexte, personne), personne, profileProgress);
        if (!iaResult) return { status: 'failed', limitReached };

        const suggestions = usableSuggestions(iaResult.suggestions);
        updateProgress(profileProgress + 20, `Recherche produits pour ${personne.nom}...`);
        const products = dedupeProducts(await searchSuggestedProducts(suggestions, personne, searchState));

        // Idées sans produit affiché : liens de recherche Amazon taggés (coût API nul)
        const shownTerms = new Set(products.map(p => p.searchTerm));
        const searchIdeas = suggestions.filter(s => !shownTerms.has(s.term)).map(buildSearchIdea);

        const items = [...products, ...searchIdeas];
        return items.length > 0 ? { status: 'ok', result: personResult(personne, items) } : { status: 'empty' };
    } catch {
        return { status: 'failed' };
    }
}

/**
 * Sur mobile (une colonne), les résultats sont sous le journal d'analyse : on les amène à l'écran.
 * Défilement instantané si l'utilisateur a demandé moins d'animations.
 */
function scrollToResultsOnMobile() {
    if (!window.matchMedia?.('(max-width: 900px)').matches) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('singleResult')?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * Réaffiche les résultats conservés dans l'onglet (sans aucun appel API).
 * @returns {boolean} vrai si des résultats ont été restaurés
 */
function restoreSavedResults() {
    const saved = loadResults();
    if (!saved) return false;
    hideStatusIndicator();
    updateProgress(100, "Vos résultats de tout à l'heure");
    renderResults(saved.results, 0, false);
    renderRetentionTools({ container: document.getElementById('retentionContainer'), personResults: saved.results, contexte: saved.contexte });
    keepSavedResultsInSync(saved.results, saved.contexte);
    return true;
}

/**
 * Réenregistre les résultats après chaque navigation entre suggestions : au retour d'Amazon, l'utilisateur
 * retrouve la suggestion qu'il regardait. Le gestionnaire du bouton (render.js) a déjà mis à jour
 * currentIndex quand l'événement remonte jusqu'au document.
 */
function keepSavedResultsInSync(personResults, contexte) {
    document.addEventListener('click', (e) => {
        if (e.target instanceof Element && e.target.closest('.btn-nav-suggestion')) saveResults(personResults, contexte);
    });
}

async function lancerAnalyse() {
    const data = takeAnalysisData();
    if (!data) {
        // Retour d'Amazon après rechargement de l'onglet : les profils sont purgés, mais les résultats
        // affichés plus tôt dans cet onglet sont conservés (results-store.js)
        if (!restoreSavedResults()) showMissingDataState();
        return;
    }
    clearResults(); // nouvelle analyse : les anciens résultats de l'onglet ne doivent pas réapparaître

    const totalProfiles = data.equipe.length;
    let processedProfiles = 0;
    updateProgress(PROGRESS_START, 'Démarrage de l\'analyse...');

    const personResults = [];
    // Profils dont l'analyse IA a échoué : distingue « service en échec » de « aucun produit trouvé ».
    let apiFailures = 0;
    // Limite serveur atteinte (429 / 503) : inutile d'appeler pour les profils suivants, et pas de « Réessayer ».
    let limitReached = false;
    // Recherches Amazon bloquées (429 / 503) : les profils suivants n'appellent plus /api/search
    const searchState = { blocked: false };

    for (const raw of data.equipe) {
        const personne = normalizeProfile(raw);
        if (!personne) continue; // budget invalide : profil ignoré

        const profileProgress = PROGRESS_PROFILES_BASE + (processedProfiles / totalProfiles) * PROGRESS_PROFILES_SPAN;
        updateProgress(profileProgress, `Analyse de ${personne.nom}...`);

        const outcome = await analyseProfile(personne, data.contexte, profileProgress, searchState);
        if (outcome.status === 'ok') {
            personResults.push(outcome.result);
            processedProfiles++;
        } else if (outcome.status === 'failed') {
            apiFailures++;
            if (outcome.limitReached) {
                limitReached = true;
                break;
            }
        }
    }

    hideStatusIndicator();
    updateProgress(100, 'Analyse terminée !');

    renderResults(personResults, apiFailures, limitReached);
    renderRetentionTools({ container: document.getElementById('retentionContainer'), personResults, contexte: data.contexte });
    saveResults(personResults, data.contexte);
    keepSavedResultsInSync(personResults, data.contexte);
    scrollToResultsOnMobile();
    // RGPD : profils purgés une fois l'analyse terminée ; copie de session gardée seulement si
    // l'échec est technique (« Réessayer » recharge la page et relance l'analyse).
    // Limite atteinte : rien à relancer, la copie de session n'est pas conservée.
    purgeAnalysisData({ keepForRetry: personResults.length === 0 && apiFailures > 0 && !limitReached });
}

initPurchaseTracking();
lancerAnalyse().catch(() => {
    purgeAnalysisData({ keepForRetry: true });
    showFatalErrorOverlay();
});
