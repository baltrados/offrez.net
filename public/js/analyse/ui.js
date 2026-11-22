/**
 * ANALYSE/UI.JS - Barre de progression et états d'erreur (accessibles, compatibles CSP)
 * =====================================================================================
 * Construits avec createElement/textContent + addEventListener : aucun HTML injecté,
 * aucun gestionnaire inline (bloqué par la CSP script-src 'self' / script-src-attr 'none').
 */

import { purgeAnalysisData } from './session-data.js?v=2026112207';

/**
 * Met à jour la barre de progression et le message de statut (région aria-live).
 * @param {number} percent - Pourcentage (0-100).
 * @param {string} message - Texte informatif pour l'utilisateur.
 */
export function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const statusMessage = document.getElementById('statusMessage');
    const progressTrack = document.getElementById('progressTrack');
    const clamped = Math.min(100, Math.max(0, percent));

    if (progressBar) progressBar.style.width = `${clamped}%`;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(Math.round(clamped)));
    if (progressText) progressText.textContent = `${Math.round(percent)}% - ${message}`;
    if (statusMessage) statusMessage.textContent = message;
}

/** Masque l'indicateur de chargement (spinner + progression). */
export function hideStatusIndicator() {
    const status = document.getElementById('statusIndicator');
    if (status) status.style.display = 'none';
}

/** Action « Réessayer » : relance l'analyse avec les mêmes profils (copie de session). */
export const RETRY_ACTION = { label: 'Réessayer', icon: 'fas fa-sync-alt', className: 'btn btn-primary', onClick: () => window.location.reload() };
/** Action « Modifier ma recherche » : retour à l'étape 1. */
// RGPD : quitter l'analyse pour modifier la recherche supprime aussi la copie de session des profils
// (gardée seulement pour « Réessayer »).
export const EDIT_SEARCH_ACTION = {
    label: 'Modifier ma recherche',
    className: 'btn btn-secondary',
    onClick: () => {
        purgeAnalysisData();
        window.location.href = 'config.html';
    }
};

const TECHNICAL_ERROR_TITLE = 'Oups ! Un petit souci technique';

/**
 * Construit un bloc d'erreur (role="alert") avec un message générique et des actions.
 * @param {{icon?: string, title: string, message: string, actions?: Array<{label: string, className: string, icon?: string, href?: string, onClick?: Function}>}} options
 * @returns {HTMLElement}
 */
export function buildErrorState({ icon = '😵', title, message, actions = [] }) {
    const box = document.createElement('div');
    box.className = 'analysis-error';
    box.setAttribute('role', 'alert');

    const iconEl = document.createElement('div');
    iconEl.className = 'analysis-error-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;

    const titleEl = document.createElement('p');
    titleEl.className = 'analysis-error-title';
    titleEl.textContent = title;

    const textEl = document.createElement('p');
    textEl.className = 'analysis-error-text';
    textEl.textContent = message;

    const actionsEl = document.createElement('div');
    actionsEl.className = 'analysis-error-actions';
    actions.forEach(action => {
        let el;
        if (action.href) {
            el = document.createElement('a');
            el.href = action.href;
        } else {
            el = document.createElement('button');
            el.type = 'button';
            el.addEventListener('click', action.onClick);
        }
        el.className = action.className;
        if (action.icon) {
            const i = document.createElement('i');
            i.className = action.icon;
            i.setAttribute('aria-hidden', 'true');
            el.append(i, ' ');
        }
        el.append(action.label);
        actionsEl.appendChild(el);
    });

    box.append(iconEl, titleEl, textEl, actionsEl);
    return box;
}

/**
 * Données de l'étape 2 absentes, corrompues ou vides : on remplace le spinner
 * par un message clair et un lien vers config.html.
 */
export function showMissingDataState() {
    const status = document.getElementById('statusIndicator');
    const errorState = buildErrorState({
        icon: '🎁',
        title: 'Aucun profil à analyser',
        message: "Nous n'avons pas trouvé de recherche en cours. Définissez l'occasion et les profils pour obtenir vos recommandations.",
        actions: [{ label: 'Commencer ma recherche', icon: 'fas fa-arrow-right', className: 'btn btn-primary', href: 'config.html' }]
    });
    if (status) {
        status.style.display = 'none';
        status.after(errorState);
    } else {
        document.querySelector('main')?.appendChild(errorState);
    }
}

/** État d'erreur « analyse impossible pour tous les profils » (dans le conteneur de résultats). */
export function buildAnalysisFailedState() {
    return buildErrorState({
        title: TECHNICAL_ERROR_TITLE,
        message: "Nous n'avons pas pu générer vos recommandations pour le moment. Veuillez réessayer dans quelques instants.",
        actions: [RETRY_ACTION, EDIT_SEARCH_ACTION]
    });
}

/**
 * Limite atteinte (429 quota par IP, 503 plafond global / service coupé) : message fixe côté client
 * (le texte serveur n'est jamais injecté), aucun « Réessayer » : un nouvel appel échouerait.
 */
export function buildLimitReachedState() {
    return buildErrorState({
        icon: '⏳',
        title: 'Limite du jour atteinte',
        message: "Le service a atteint sa limite pour aujourd'hui. Revenez demain.",
        actions: [EDIT_SEARCH_ACTION]
    });
}

/**
 * Écran d'erreur plein écran (exception inattendue) : message générique, aucun détail technique.
 */
export function showFatalErrorOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'analysis-error-overlay';
    overlay.appendChild(buildErrorState({
        title: TECHNICAL_ERROR_TITLE,
        message: "Désolé, l'analyse a rencontré un imprévu. Cela arrive parfois avec les connexions aux services partenaires.",
        actions: [RETRY_ACTION, EDIT_SEARCH_ACTION]
    }));
    document.body.appendChild(overlay);
    overlay.querySelector('button')?.focus();
}
