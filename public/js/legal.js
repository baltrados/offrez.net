/**
 * LEGAL.JS - Gestion des éléments légaux
 * ======================================
 * - Bannière de consentement cookies (Mode Modale avec Overlay)
 * - Tracking du consentement
 * 
 * [TASK-002] Migré de IIFE vers ESM pour cohérence architecturale
 *            et import centralisé de la clé cookie depuis constants.js
 */

import { STORAGE_KEYS } from './constants.js';

// Configuration
const CONSENT_KEY = STORAGE_KEYS.COOKIE_CONSENT;
const CONSENT_DURATION = 365; // jours

/**
 * Vérifie si le consentement a déjà été donné
 */
export function hasConsent() {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) return false;

    try {
        const data = JSON.parse(consent);
        const expiry = new Date(data.expiry);
        return expiry > new Date();
    } catch {
        return false;
    }
}

/**
 * Enregistre le consentement
 */
function saveConsent(accepted) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + CONSENT_DURATION);

    // FIX #13 : try/catch si localStorage est plein
    try {
        localStorage.setItem(CONSENT_KEY, JSON.stringify({
            accepted: accepted,
            date: new Date().toISOString(),
            expiry: expiry.toISOString()
        }));
    } catch (e) {
        console.warn('[LEGAL] Impossible de sauvegarder le consentement:', e.message);
    }
}

/**
 * Affiche la bannière cookies avec Overlay séparé
 */
export function showCookieBanner() {
    // Vérification silencieuse du consentement cookies
    if (hasConsent()) {
        // Consentement déjà donné - rien à afficher
        return;
    }

    // Affichage de la bannière si pas de consentement

    // 1. Créer l'overlay (Fond sombre)
    const overlay = document.createElement('div');
    overlay.id = 'cookieOverlay';
    overlay.className = 'cookie-overlay';

    // 2. Créer la bannière (Contenu) — boîte de dialogue modale accessible
    // (styles dans css/partials/_10-legal.css, plus de style inline)
    const banner = document.createElement('div');
    banner.id = 'cookieBanner';
    banner.className = 'cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'true');
    banner.setAttribute('aria-labelledby', 'cookieTitle');
    banner.setAttribute('aria-describedby', 'cookieDesc');
    banner.innerHTML = `
        <div class="cookie-content">
            <p class="cookie-text">
                <i class="fas fa-cookie-bite" aria-hidden="true"></i>
                <span id="cookieTitle" class="cookie-title">Votre expérience avant tout. 🎁</span><br>
                <span id="cookieDesc" class="cookie-desc">
                    Nous utilisons des cookies essentiels pour vous garantir la meilleure expérience et maintenir OFFREZ 100% gratuit. En acceptant, vous nous aidez à améliorer l'algorithme.
                </span>
                <br><a href="politique-confidentialite.html">En savoir plus</a>
            </p>
            <div class="cookie-buttons">
                <button type="button" class="cookie-btn cookie-btn-accept" id="cookieAccept">
                    Oui, j'accepte le fonctionnement optimal
                </button>
                <button type="button" class="cookie-btn cookie-btn-decline" id="cookieDecline">
                    Continuer sans accepter
                </button>
            </div>
        </div>
    `;

    // Élément qui avait le focus avant l'ouverture (restauré à la fermeture)
    const previouslyFocused = document.activeElement;

    document.body.appendChild(overlay);
    document.body.appendChild(banner);

    const btnAccept = document.getElementById('cookieAccept');
    const btnDecline = document.getElementById('cookieDecline');

    // Animation d'entrée
    // Petit délai pour permettre au DOM de se rendre
    requestAnimationFrame(() => {
        setTimeout(() => {
            overlay.classList.add('visible');
            banner.classList.add('visible');
            // Focus initial sur le premier bouton de la boîte de dialogue
            if (btnAccept) btnAccept.focus();
        }, 50);
    });

    // Piège à focus : Tab / Maj+Tab restent dans la bannière tant qu'elle est ouverte.
    // Échap ne fait rien (pas d'acceptation ni de refus implicite du consentement).
    function onKeydown(event) {
        if (event.key !== 'Tab') return;
        const focusables = Array.from(banner.querySelectorAll('a[href], button:not([disabled])'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (!banner.contains(active)) {
            event.preventDefault();
            first.focus();
        } else if (event.shiftKey && active === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    }
    document.addEventListener('keydown', onKeydown);

    // Fonction de fermeture
    function closeAll() {
        document.removeEventListener('keydown', onKeydown);
        overlay.classList.remove('visible');
        banner.classList.remove('visible');
        // Restaure le focus (si l'élément précédent est toujours présent et focusable)
        if (previouslyFocused && previouslyFocused !== document.body && document.contains(previouslyFocused)
            && typeof previouslyFocused.focus === 'function') {
            previouslyFocused.focus();
        } else if (document.activeElement && banner.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            if (banner.parentNode) banner.remove();
        }, 500); // Attendre fin transition CSS
    }

    // Gestionnaires de clic
    if (btnAccept) {
        btnAccept.addEventListener('click', () => {
            saveConsent(true);
            closeAll();
        });
    }

    if (btnDecline) {
        btnDecline.addEventListener('click', () => {
            saveConsent(false);
            closeAll();
        });
    }
}

// Initialisation au chargement de la page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showCookieBanner);
} else {
    showCookieBanner();
}
