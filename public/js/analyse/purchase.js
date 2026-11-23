/**
 * ANALYSE/PURCHASE.JS - Clic « Voir sur Amazon » : modale de remerciement non bloquante
 * ====================================================================================================
 * Le lien <a target="_blank"> natif ouvre Amazon dans le geste utilisateur (fiable sur Safari iOS et
 * avec les bloqueurs de popups) : aucun preventDefault ni window.open différé ici.
 */

import { SHARE_FEEDBACK_MS } from './settings.js?v=2026112404';

const SHARE_URL = 'https://offrez.net';

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

let lastTrigger = null;

function closePurchaseModal() {
    const modal = document.getElementById('purchaseModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    if (lastTrigger && document.contains(lastTrigger)) lastTrigger.focus();
    lastTrigger = null;
}

/** Carte cadeau suivante (personne suivante) après celle du lien cliqué, ou null. */
function nextGiftCard(trigger) {
    const card = trigger?.closest('.gift-card');
    let next = card?.nextElementSibling;
    while (next && !next.classList.contains('gift-card')) next = next.nextElementSibling;
    return next || null;
}

/**
 * Actions de relance dans la modale : « Ajouter tous les cadeaux au panier » (au moins 2 produits dans le
 * panier groupé) et « Voir le cadeau suivant » (s'il reste une personne). Masquées sinon.
 */
function bindFollowUpActions(trigger) {
    const cartAction = document.getElementById('purchaseModalCart');
    const nextAction = document.getElementById('purchaseModalNext');

    if (cartAction) {
        const cartLink = document.querySelector('#cartContainer .btn-cart');
        const count = Number(cartLink?.dataset.count) || 0;
        const show = count >= 2 && cartLink.getAttribute('href') !== '#';
        if (show) cartAction.setAttribute('href', cartLink.getAttribute('href'));
        cartAction.style.display = show ? '' : 'none';
    }

    if (nextAction) {
        const next = nextGiftCard(trigger);
        nextAction.style.display = next ? '' : 'none';
        nextAction.onclick = () => {
            const nextCta = next?.querySelector('.btn-amazon-cta');
            lastTrigger = nextCta || lastTrigger; // le focus ira sur le bouton du cadeau suivant
            closePurchaseModal();
            next?.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        };
    }
}

function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Modale de remerciement affichée pendant que le lien Amazon s'ouvre dans un nouvel onglet.
 * @param {string} recipientName
 * @param {Element} trigger - lien cliqué
 */
function showPurchaseModal(recipientName, trigger) {
    const modal = document.getElementById('purchaseModal');
    if (!modal) return;

    const recipientNameEl = document.getElementById('recipientNameModal');
    const closeBtn = document.getElementById('closePurchaseModal');
    const shareBtn = document.getElementById('shareButton');

    if (recipientNameEl) recipientNameEl.textContent = recipientName;
    bindFollowUpActions(trigger);
    modal.style.display = 'flex';

    if (closeBtn) {
        closeBtn.onclick = closePurchaseModal;
        closeBtn.focus();
    }
    if (shareBtn) bindShareButton(shareBtn);

    // Clic sur l'overlay : ferme la modale
    const overlay = modal.querySelector('.modal-overlay');
    if (overlay) overlay.onclick = closePurchaseModal;
}

/** Délégation globale des clics sur les liens suivis (.js-track-click). À appeler une seule fois. */
export function initPurchaseTracking() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closePurchaseModal();
    });

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.js-track-click');
        if (!btn) return;

        if (btn.classList.contains('js-purchase-btn')) {
            // Lien refusé par buildAffiliateUrl ('#') : aucune ouverture, pas de modale
            if (btn.getAttribute('href') === '#') {
                e.preventDefault();
                return;
            }
            // Pas de preventDefault : la navigation native (target="_blank") ouvre Amazon.
            lastTrigger = btn;
            showPurchaseModal(btn.dataset.recipient || 'cette personne', btn);
        }
    });
}
