/**
 * SERVICE API (api.js)
 * ====================
 * Ce fichier gère toutes les communications avec le serveur backend (Proxy).
 * Il contient deux fonctions principales :
 * 1. callGemini() : Envoie un prompt à l'IA pour générer des idées.
 * 2. searchAmazon() : Cherche des produits concrets sur Amazon via le serveur.
 * 
 * Les clés API (Gemini, RapidAPI) ne sont JAMAIS exposées ici, elles restent sur le serveur.
 */

import { STORAGE_KEYS } from './constants.js';

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
 * Vérifie le consentement cookies depuis le localStorage.
 * @returns {string} 'true' ou 'false'
 */
function getConsentStatus() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.COOKIE_CONSENT);
        if (!raw) return 'false';
        const data = JSON.parse(raw);
        return data.accepted === true ? 'true' : 'false';
    } catch {
        return 'false';
    }
}

/**
 * Appelle l'API Gemini via notre serveur proxy.
 * @param {string} prompt - Le texte envoyé à l'IA.
 * @returns {Object} - Le JSON parsé contenant les suggestions.
 */
export async function callGemini(prompt) {
    const startTime = performance.now();
    apiLog('🧠', 'callGemini() DÉMARRÉ', { promptLength: prompt?.length });

    if (API_DEBUG) {
        console.group('📤 REQUÊTE GEMINI');
        console.log('%cPrompt envoyé:', 'color: #f59e0b; font-weight: bold;');
        console.log(prompt?.substring(0, 500) + (prompt?.length > 500 ? '...' : ''));
        console.groupEnd();
    }

    // Contrôleur d'avortement pour gérer le timeout client (15s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        apiLog('📡', 'Fetch vers /api/analyze...');

        // Appel POST vers notre backend
        const response = await fetch(`${API_BASE}/api/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt }),
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
            throw new Error(msg);
        }

        const json = await response.json();

        if (API_DEBUG) {
            console.group('📥 RÉPONSE GEMINI RAW');
            console.dir(json, { depth: 3 });
            console.groupEnd();
        }

        // Extraction du texte depuis la structure complexe de la réponse Gemini
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        apiLog('📝', 'Texte extrait', { length: text?.length, preview: text?.substring(0, 100) });

        if (!text || typeof text !== 'string') {
            // Debug détaillé pour comprendre le problème si l'IA ne répond pas
            apiError('Format invalide - Détails:', {
                hasCandidates: !!json?.candidates,
                candidatesCount: json?.candidates?.length,
                firstCandidate: json?.candidates?.[0],
                promptFeedback: json?.promptFeedback, // Si bloqué pour sécurité
                finishReason: json?.candidates?.[0]?.finishReason,
                safetyRatings: json?.candidates?.[0]?.safetyRatings
            });

            // Message d'erreur plus informatif pour l'utilisateur
            const finishReason = json?.candidates?.[0]?.finishReason;
            const blockReason = json?.promptFeedback?.blockReason;

            if (blockReason) {
                throw new Error(`Contenu bloqué par Gemini: ${blockReason}`);
            } else if (finishReason && finishReason !== 'STOP') {
                throw new Error(`Génération interrompue: ${finishReason}`);
            } else if (!json?.candidates || json.candidates.length === 0) {
                throw new Error("Aucune réponse générée par l'IA (candidates vide)");
            } else {
                throw new Error("Format de réponse IA invalide (aucun texte reçu)");
            }
        }

        // TENTATIVE DE PARSING DU JSON
        // L'IA renvoie parfois du texte autour du JSON (ex: "Voici le JSON : ..."),
        // donc on doit être robuste.

        // 1) Tentative directe
        let parsed;
        try {
            parsed = JSON.parse(text);
            apiLog('✅', 'JSON parsé directement');
        } catch {
            apiLog('⚠️', 'JSON direct échoué, tentative extraction...');

            // 2) Fallback : Regex pour trouver le premier bloc { ... }
            const match = text.match(/\{[\s\S]*\}/);
            if (!match) {
                // 3) Dernier recours : nettoyer les balises markdown (```json ... ```)
                const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                    parsed = JSON.parse(cleaned);
                    apiLog('✅', 'JSON parsé après nettoyage markdown');
                } catch {
                    apiError('Parsing impossible', { text: text.substring(0, 200) });
                    throw new Error("Réponse IA non parsable en JSON pur");
                }
            } else {
                try {
                    parsed = JSON.parse(match[0]);
                    apiLog('✅', 'JSON extrait avec regex');
                } catch {
                    apiError('Extraction regex échouée', match[0]?.substring(0, 200));
                    throw new Error("Réponse IA non parsable en JSON pur");
                }
            }
        }

        // Vérification de la structure attendue
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
    const safeBudget = Number.isFinite(Number(budget)) ? Number(budget) : 0;
    const safeMin = Number.isFinite(Number(minPrice)) ? Number(minPrice) : 0;

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
        max_price: String(safeBudget),
        consent: getConsentStatus()
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
            throw new Error(errorData.error || `Échec API Recherche: ${response.status} ${response.statusText}`);
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