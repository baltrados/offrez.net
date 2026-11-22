/**
 * ANALYSE/PURCHASE.JS - Clic « Voir sur Amazon » : modale de confirmation, redirection
 * ====================================================================================================
 */

import { sanitizeUrl } from '../security.js?v=2026112207';
import { PURCHASE_COUNTDOWN_SECONDS, SHARE_FEEDBACK_MS } from './settings.js?v=2026112207';

const SHARE_URL = 'https://offrez.net';

/** Ferme la modale et ouvre le lien Amazon (re-validé) dans un nouvel onglet. */
function redirectToAmazon(link) {
    const modal = document.getElementById('purchaseModal');
    if (modal) modal.style.display = 'none';
    const safeLink = sanitizeUrl(link);
    if (safeLink !== '#') window.open(safeLink, '_blank', 'noopener,noreferrer');
}

function bindShareButton(shareBtn) {
    shareBtn.onclick = () => {
        if (navigator.share) {
            navigator.share({
                title: 'OFFREZ - Trouvez le cadeau parfait',
                text: 'J\'ai trouvé des idées de cadeaux géniales avec OFFREZ ! Essaie-le :',
                url: SHARE_URL
            }).catch(() => { });
        } else {
            // Repli : copier le lien
            navigator.clipboard.writeText(SHARE_URL).then(() => {
                shareBtn.innerHTML = '<i class="fas fa-check"></i> Lien copié !';
                setTimeout(() => {
                    shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> Partager OFFREZ';
                }, SHARE_FEEDBACK_MS);
            });
        }
    };
}

/**
 * Modale de confirmation positive avant la redirection vers Amazon (compte à rebours).
 * @param {string} recipientName
 * @param {string} productLink - déjà passé par sanitizeUrl
 */
function showPurchaseModal(recipientName, productLink) {
    const modal = document.getElementById('purchaseModal');
    const recipientNameEl = document.getElementById('recipientNameModal');
    const countdownEl = document.getElementById('countdownSeconds');
    const skipBtn = document.getElementById('skipCountdown');
    const shareBtn = document.getElementById('shareButton');

    if (!modal) {
        // Pas de modale : ouverture directe
        if (productLink !== '#') window.open(productLink, '_blank', 'noopener,noreferrer');
        return;
    }

    if (recipientNameEl) recipientNameEl.textContent = recipientName;
    modal.style.display = 'flex';

    let countdown = PURCHASE_COUNTDOWN_SECONDS;
    if (countdownEl) countdownEl.textContent = countdown;

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdownEl) countdownEl.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            redirectToAmazon(productLink);
        }
    }, 1000);

    if (skipBtn) {
        skipBtn.onclick = () => {
            clearInterval(countdownInterval);
            redirectToAmazon(productLink);
        };
    }

    if (shareBtn) bindShareButton(shareBtn);

    // Clic sur l'overlay : ferme la modale et annule la redirection
    const overlay = modal.querySelector('.modal-overlay');
    if (overlay) {
        overlay.onclick = () => {
            clearInterval(countdownInterval);
            modal.style.display = 'none';
        };
    }
}

/** Délégation globale des clics sur les liens suivis (.js-track-click). À appeler une seule fois. */
export function initPurchaseTracking() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.js-track-click');
        if (!btn) return;

        if (btn.classList.contains('js-purchase-btn')) {
            e.preventDefault(); // la modale prend le relais de la navigation
            const recipientName = btn.dataset.recipient || 'cette personne';
            // Re-validation : ne jamais ouvrir une URL hors domaine Amazon/https
            const productLink = sanitizeUrl(btn.dataset.link || btn.href);
            showPurchaseModal(recipientName, productLink);
        }
    });
}
