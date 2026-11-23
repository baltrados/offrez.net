/**
 * SERVICE API (api.js)
 * ====================
 * Ce fichier gère toutes les communications avec le serveur backend (Proxy).
 * Il contient deux fonctions principales :
 * 1. callGemini() : Envoie le profil au serveur, qui interroge l'IA pour générer des idées.
 * 2. searchAmazon() : Cherche des produits concrets sur Amazon via le serveur.
 * 
 * Les clés API (Gemini, RapidAPI) ne sont JAMAIS exposées ici, elles restent sur le serveur.
 */

// ============================================
// MODE DEBUG VERBEUX - Console F12
// ============================================
const API_DEBUG = false; // Mettre à true pour voir les logs détaillés dans la console

// Helper pour logger proprement avec des emojis
function apiLog(emoji, label, data) {
    if (!API_DEBUG) return;
    const time = new Date().toLocaleTimeString();
    console.log(`%c${emoji} [${time}] API: ${label}`, 'background: #1e40af; color: #93c5fd; padding: 2px 6px; border-radius: 3px;', data || '');
}

function apiError(label, error) {
    if (!API_DEBUG) return;
    console.error(`❌ API ERROR: ${label}`, error);
}

// Détermine l'URL de base du serveur (même origine en production)
const API_BASE = window.location.origin;
apiLog('🌐', 'API_BASE configuré', API_BASE);

/**
 * Demande des suggestions de cadeaux au serveur (qui construit le prompt Gemini).
 * Contrat POST /api/analyze :
 *   requête : { contexte, profile: { sexe, age, budget, tags, adore, eviter } } (jamais le prénom)
 *   réponse : { suggestions: [ { term, reason, prix_estime } ] }
 * @param {Object} payload - Contexte + profil normalisé (aucun prompt côté client).
 * @returns {Object} - { suggestions } validé.
 * @throws {Error} en cas d'échec HTTP, l'erreur porte `status` (code HTTP) pour décider d'une nouvelle tentative.
 */
export async function callGemini(payload) {
    const startTime = performance.now();
    apiLog('🧠', 'callGemini() DÉMARRÉ', { tagsCount: payload?.profile?.tags?.length });

    // Contrôleur d'avortement pour gérer le timeout client (25s > timeout Gemini serveur de 20s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
        apiLog('📡', 'Fetch vers /api/analyze...');

        // Appel POST vers notre backend
        const response = await fetch(`${API_BASE}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        clearTimeout(timeoutId); // Annule le timeout si réponse reçue

        apiLog('📨', 'Réponse reçue', { status: response.status, ok: response.ok });

        // Gestion des erreurs HTTP (400, 500...)
        if (!response.ok) {
            let details = null;
            try {
                details = await response.json();
                apiError('Réponse non-OK', details);
            } catch {
                // on garde un message générique si le body n'est pas JSON
            }
            const msg = details && details.error
                ? details.error
                : `Erreur API : ${response.status} ${response.statusText}`;
            const httpError = new Error(msg);
            httpError.status = response.status;
            throw httpError;
        }

        let parsed;
        try {
            parsed = await response.json();
        } catch {
            throw new Error("Réponse IA non parsable en JSON");
        }

        // Vérification de la structure attendue (ne jamais faire confiance à la réponse)
        if (!parsed || !Array.isArray(parsed.suggestions)) {
            apiError('Structure invalide', parsed);
            throw new Error("Réponse IA JSON sans champ 'suggestions' valide");
        }

        // Nettoyage des suggestions : filtrer les entrées invalides
        parsed.suggestions = parsed.suggestions.filter(s =>
            s && typeof s.term === 'string' && s.term.trim().length >= 2
        );
        // Ajouter un reason par défaut si manquant (évite "undefined" dans l'UI)
        parsed.suggestions.forEach(s => {
            if (!s.reason || typeof s.reason !== 'string') {
                s.reason = "Sélectionné pour correspondre à vos critères";
            }
        });

        const duration = (performance.now() - startTime).toFixed(0);
        apiLog('🎉', `callGemini() TERMINÉ en ${duration}ms`, { suggestionsCount: parsed.suggestions.length });

        return parsed;

    } catch (error) {
        clearTimeout(timeoutId);
        const duration = (performance.now() - startTime).toFixed(0);

        if (error.name === 'AbortError') {
            apiError(`Timeout après ${duration}ms`, 'Délai dépassé');
            throw new Error("Délai d'attente dépassé (timeout) pour l'API Gemini");
        }
        apiError(`Erreur après ${duration}ms`, error);
        throw error;
    }
}

/**
 * Cherche des produits sur Amazon via notre serveur proxy.
 * @param {string} term - Terme de recherche (ex: "Montre connectée").
 * @param {number} budget - Budget max.
 * @param {number} minPrice - Prix min (défaut 10€).
 * @returns {Object} - Résultats de recherche RapidAPI.
 */
export async function searchAmazon(term, budget, minPrice = 10) {
    const startTime = performance.now();
    apiLog('🛒', 'searchAmazon() DÉMARRÉ', { term, budget, minPrice });

    // Validation des entrées côté client pour éviter d'envoyer n'importe quoi
    // Entiers uniquement : le serveur n'accepte que des prix en euros entiers (^\d{1,5}$)
    const safeBudget = Number.isFinite(Number(budget)) ? Math.floor(Number(budget)) : 0;
    const safeMin = Number.isFinite(Number(minPrice)) ? Math.max(0, Math.floor(Number(minPrice))) : 0;

    if (!safeBudget || safeBudget <= 0) {
        throw new Error("Budget maximal invalide pour la recherche Amazon");
    }

    const safeTerm = String(term).trim();
    if (safeTerm.length < 2) {
        throw new Error("Terme de recherche trop court");
    }

    const params = new URLSearchParams({
        term: safeTerm,
        min_price: String(safeMin),
        max_price: String(safeBudget)
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
        apiLog('📡', `Fetch vers /api/search?${params}`);

        const response = await fetch(`${API_BASE}/api/search?${params}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        apiLog('📨', 'Réponse Amazon RapidAPI reçue', { status: response.status, ok: response.ok });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            apiError('Amazon RapidAPI non-OK', errorData);
            // Statut HTTP joint à l'erreur : 429 / 503 = quota ou plafond atteint (voir isLimitReachedError)
            const error = new Error(errorData.error || `Échec API Recherche: ${response.status} ${response.statusText}`);
            error.status = response.status;
            throw error;
        }

        const data = await response.json();
        const duration = (performance.now() - startTime).toFixed(0);

        const resultsCount = data?.search_results?.length || 0;
        apiLog('🎉', `searchAmazon() TERMINÉ en ${duration}ms`, { resultsCount });

        return data;
    } catch (error) {
        clearTimeout(timeoutId);
        const duration = (performance.now() - startTime).toFixed(0);

        if (error.name === 'AbortError') {
            apiError(`Timeout Amazon RapidAPI après ${duration}ms`, 'Délai dépassé');
            throw new Error("Délai d'attente dépassé (timeout) pour l'API Amazon");
        }
        apiError(`Erreur Amazon RapidAPI après ${duration}ms`, error);
        throw error;
    }
}