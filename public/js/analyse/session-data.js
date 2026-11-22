/**
 * ANALYSE/SESSION-DATA.JS - Cycle de vie des profils de l'étape 2 (RGPD)
 * =======================================================================
 * profils.js écrit `finalData` (prénoms, âges, intérêts, texte libre) dans le localStorage.
 * Pour que ces données personnelles ne persistent pas :
 *  1. au démarrage de l'analyse, `finalData` est DÉPLACÉ du localStorage vers le sessionStorage
 *     (limité à l'onglet, effacé à sa fermeture) ;
 *  2. une fois les résultats affichés (ou en l'absence de résultat), la copie de session est supprimée ;
 *  3. en cas d'échec technique, la copie de session est conservée pour que « Réessayer »
 *     (rechargement de la page) relance l'analyse avec les mêmes profils.
 * Aucun effet de bord à l'import. Toutes les opérations de stockage sont protégées (navigation privée…).
 */

import { STORAGE_KEYS } from '../constants.js';

const KEY = STORAGE_KEYS.FINAL_DATA;

function safeGet(storage, key) {
    try { return storage?.getItem(key) ?? null; } catch { return null; }
}
function safeSet(storage, key, value) {
    try { storage?.setItem(key, value); return true; } catch { return false; }
}
function safeRemove(storage, key) {
    try { storage?.removeItem(key); } catch { /* stockage indisponible */ }
}

/** Données d'analyse exploitables : une équipe non vide. */
export function isValidAnalysisData(data) {
    return Boolean(data) && Array.isArray(data.equipe) && data.equipe.length > 0;
}

/**
 * Récupère les profils à analyser et retire `finalData` du localStorage.
 * Ordre de lecture : localStorage (nouvelle analyse), puis sessionStorage (« Réessayer »).
 * @param {{local?: Storage, session?: Storage}} [stores] - injectables pour les tests
 * @returns {{contexte: any, equipe: any[]}|null} null si absentes, corrompues ou vides (tout est alors purgé).
 */
export function takeAnalysisData({ local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) {
    let raw = safeGet(local, KEY);
    if (raw !== null) {
        // Copie de session pour un éventuel « Réessayer » ; si elle échoue, on garde le localStorage
        // (purgé en fin d'analyse) plutôt que de perdre les profils avant même l'analyse.
        if (safeSet(session, KEY, raw)) safeRemove(local, KEY);
    } else {
        raw = safeGet(session, KEY);
    }
    if (!raw) return null;

    let data;
    try {
        data = JSON.parse(raw);
    } catch {
        data = null;
    }
    if (!isValidAnalysisData(data)) {
        purgeAnalysisData({ local, session });
        return null;
    }
    return data;
}

/**
 * Fin de l'analyse : supprime toutes les copies de `finalData`,
 * sauf la copie de session si `keepForRetry` (échec technique → bouton « Réessayer »).
 * @param {{keepForRetry?: boolean, local?: Storage, session?: Storage}} [options]
 */
// Limite connue : si le sessionStorage est indisponible (stockage bloqué), la copie de session n'existe pas ;
// le localStorage étant toujours purgé ici, « Réessayer » après une panne mène alors à « Aucun profil à analyser ».
// Choix assumé : ne jamais laisser les profils persister dans le localStorage après l'analyse.
export function purgeAnalysisData({ keepForRetry = false, local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) {
    safeRemove(local, KEY);
    if (!keepForRetry) safeRemove(session, KEY);
}
