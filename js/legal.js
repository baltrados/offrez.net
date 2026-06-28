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

    // 2. Créer la bannière (Contenu)
    const banner = document.createElement('div');
    banner.id = 'cookieBanner';
    banner.className = 'cookie-banner';
    banner.innerHTML = `
        <div class="cookie-content">
            <p class="cookie-text">
                <i class="fas fa-cookie-bite"></i>
                Votre expérience avant tout. 🎁<br>
                <span style="font-size: 0.9em; opacity: 0.9; margin-top: 10px; display: inline-block;">
                    Nous utilisons des cookies essentiels pour vous garantir la meilleure expérience et maintenir OFFREZ 100% gratuit. En acceptant, vous nous aidez à améliorer l'algorithme.
                </span>
                <br><a href="politique-confidentialite.html" style="font-size:0.8em; margin-top:5px; display:inline-block; color:var(--primary-light);">En savoir plus</a>
            </p>
            <div class="cookie-buttons" style="display:flex; flex-direction:column; gap:8px; width:100%;">
                <button class="cookie-btn cookie-btn-accept" id="cookieAccept" style="width:100%; padding:14px; border-radius:12px; font-weight:700; background:linear-gradient(135deg, #6366f1, #4f46e5); color:white; border:none; box-shadow:0 4px 15px rgba(99,102,241,0.3); font-size:1.05rem;">
                    Oui, j'accepte le fonctionnement optimal
                </button>
                <button class="cookie-btn cookie-btn-decline" id="cookieDecline" style="width:100%; padding:14px; border-radius:12px; font-weight:600; background:rgba(255, 255, 255, 0.08); border:1px solid rgba(255,255,255,0.2); color:#e2e8f0; font-size:0.95rem; text-decoration:none; transition: background 0.2s;">
                    Continuer sans accepter
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(banner);

    // Animation d'entrée
    // Petit délai pour permettre au DOM de se rendre
    requestAnimationFrame(() => {
        setTimeout(() => {
            overlay.classList.add('visible');
            banner.classList.add('visible');
        }, 50);
    });

    // Fonction de fermeture
    function closeAll() {
        overlay.classList.remove('visible');
        banner.classList.remove('visible');
        setTimeout(() => {
            if (overlay.parentNode) overlay.remove();
            if (banner.parentNode) banner.remove();
        }, 500); // Attendre fin transition CSS
    }

    // Gestionnaires de clic
    const btnAccept = document.getElementById('cookieAccept');
    const btnDecline = document.getElementById('cookieDecline');

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
