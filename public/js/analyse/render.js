/**
 * ANALYSE/RENDER.JS - Affichage des résultats (cartes cadeaux, navigation, panier groupé)
 * ======================================================================================
 * Toute donnée externe (IA, Amazon, profil) passe par escapeHtml ; toute URL par buildAffiliateUrl.
 */

import { escapeHtml, buildAffiliateUrl } from '../security.js?v=2026112001';
import { getSelectedProducts, computeCartTotal, generateCartURL } from './cart.js?v=2026112204';
import { buildAnalysisFailedState } from './ui.js?v=2026112204';
import {
    AFFILIATE_TAG,
    TITLE_MAX_CHARS,
    REVEAL_START_DELAY_MS,
    REVEAL_STAGGER_MS,
    DISCOVERY_DELAY_MIN_MS,
    DISCOVERY_DELAY_JITTER_MS
} from './settings.js?v=2026112204';

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%231e293b' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E";

const AFFILIATION_DISCLAIMER = `<div class="affiliation-disclaimer" style="text-align:center; padding: 10px; margin-bottom: 20px; font-size: 0.85rem; color: #94a3b8; font-style: italic; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1);">
  <i class="fas fa-info-circle"></i> OFFREZ est soutenu par ses utilisateurs. Si vous finalisez un achat via les boutons Amazon ci-dessous, nous pouvons percevoir une commission sans frais supplémentaires pour vous.
</div>`;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * HTML d'une carte cadeau (produit courant d'une personne).
 * @param {{personne: any, products: any[], currentIndex: number}} pr
 * @param {number} personIndex
 */
function giftCardHtml(pr, personIndex) {
    const { personne, products, currentIndex } = pr;

    if (products.length === 0) {
        return `<div class="gift-card-mini no-result"><p>Aucun cadeau trouvé pour ${escapeHtml(personne.nom)}.</p></div>`;
    }

    const product = products[currentIndex];
    const priceValue = Number(product.price?.value);
    const priceRaw = escapeHtml(product.price?.raw || `${priceValue}€`);
    // Ajout du tag affilié + sécurisation URL (https + domaine Amazon) ; échappée à l'interpolation
    const link = buildAffiliateUrl(product.link, AFFILIATE_TAG);

    const titleShort = escapeHtml((product.title || 'Produit sans titre').substring(0, TITLE_MAX_CHARS));
    const imageUrl = escapeHtml(product.image || PLACEHOLDER_IMAGE);
    const displayReason = escapeHtml(product.reason || '');
    const isPrime = product.is_prime || false;
    const safePersonName = escapeHtml(personne.nom);

    // Économies affichées (budget - prix)
    const savings = Math.round(personne.budget - priceValue);
    const savingsDisplay = savings > 0 ? `<span class="savings-badge">💰 ${savings}€ économisés</span>` : '';

    return `
                <div class="gift-card" data-person-index="${personIndex}">
                    <div class="gift-image">
                        <img src="${imageUrl}" alt="${titleShort}" loading="lazy">
                        ${product.rating ? `<div class="gift-rating-badge">⭐ ${escapeHtml(String(product.rating))}</div>` : ''}
                    </div>
                    <div class="gift-content">
                        <div class="gift-owner">🎁 ${safePersonName}</div>
                        ${isPrime ? '<span class="prime-mini">✓ Prime</span>' : ''}
                        <h4 class="gift-title">${titleShort}...</h4>
                        <div class="gift-price-row">
                            <span class="gift-price">${priceRaw}</span>
                            ${savingsDisplay}
                        </div>
                        <p class="gift-reason">${displayReason}</p>
                        <a href="${escapeHtml(link)}" target="_blank" rel="noopener" class="btn-amazon-cta js-track-click js-purchase-btn"
                           data-product="${escapeHtml(product.title)}"
                           data-price="${priceRaw}"
                           data-asin="${escapeHtml(product.asin || '')}"
                           data-recipient="${safePersonName}"
                           data-link="${escapeHtml(link)}">
                            <i class="fab fa-amazon"></i> Voir sur Amazon
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        ${products.length > 1 ? `
                            <div class="suggestion-nav">
                                <button class="btn-nav-suggestion btn-prev" data-person="${personIndex}" data-direction="prev" ${currentIndex === 0 ? 'disabled' : ''}>
                                    <i class="fas fa-chevron-left"></i>
                                </button>
                                <span class="suggestion-indicator">${currentIndex + 1} / ${products.length}</span>
                                <button class="btn-nav-suggestion btn-next" data-person="${personIndex}" data-direction="next" ${currentIndex >= products.length - 1 ? 'disabled' : ''}>
                                    <i class="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                    <!-- Loading overlay pour effet visuel au changement -->
                    <div class="card-loading-overlay" style="display: none;">
                        <div class="loading-spinner"></div>
                        <span>Analyse en cours...</span>
                    </div>
                </div>
            `;
}

/** Animation « Gift Reveal » en cascade. */
function revealCards() {
    setTimeout(() => {
        document.querySelectorAll('.gift-card').forEach((card, i) => {
            setTimeout(() => card.classList.add('gift-reveal'), i * REVEAL_STAGGER_MS);
        });
    }, REVEAL_START_DELAY_MS);
}

/**
 * Navigation ‹ › entre les suggestions d'une personne. Une suggestion jamais vue affiche
 * un court effet de chargement avant d'être révélée.
 */
function bindSuggestionNavigation(personResults) {
    document.querySelectorAll('.btn-nav-suggestion').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const personIndex = parseInt(e.currentTarget.dataset.person);
            const direction = e.currentTarget.dataset.direction;
            const person = personResults[personIndex];
            const card = document.querySelector(`.gift-card[data-person-index="${personIndex}"]`);
            const loadingOverlay = card?.querySelector('.card-loading-overlay');

            let newIndex = person.currentIndex;
            if (direction === 'next' && person.currentIndex < person.products.length - 1) {
                newIndex = person.currentIndex + 1;
            } else if (direction === 'prev' && person.currentIndex > 0) {
                newIndex = person.currentIndex - 1;
            }

            if (!person.viewedIndices.has(newIndex) && loadingOverlay) {
                loadingOverlay.style.display = 'flex';
                await wait(DISCOVERY_DELAY_MIN_MS + Math.random() * DISCOVERY_DELAY_JITTER_MS);
                person.viewedIndices.add(newIndex);
            }

            person.currentIndex = newIndex;
            renderResults(personResults, 0);
        });
    });
}

/** Affiche le résumé du panier groupé si au moins un produit a un ASIN. */
export function updateCartButton(personResults) {
    const cartContainer = document.getElementById('cartContainer');
    if (!cartContainer) return;

    const selectedProducts = getSelectedProducts(personResults);
    if (selectedProducts.length === 0) {
        cartContainer.style.display = 'none';
        return;
    }

    const totalPrice = computeCartTotal(selectedProducts);
    const cartURL = generateCartURL(selectedProducts);
    const plural = selectedProducts.length > 1;

    cartContainer.innerHTML = `
            <div class="cart-summary">
                <div class="cart-info">
                    <span class="cart-count">${selectedProducts.length} cadeau${plural ? 'x' : ''} sélectionné${plural ? 's' : ''}</span>
                    <span class="cart-total">Total: ${totalPrice.toFixed(2)}€</span>
                </div>
                <a href="${escapeHtml(cartURL)}" target="_blank" rel="noopener noreferrer" class="btn btn-cart">
                    <i class="fas fa-shopping-cart"></i> Ajouter tout au panier Amazon
                </a>
            </div>
        `;
    cartContainer.style.display = 'block';
}

/**
 * Affiche tous les résultats (une carte par personne), ou l'état vide / d'erreur.
 * @param {Array<{personne: any, products: any[], currentIndex: number, viewedIndices: Set<number>}>} personResults
 * @param {number} apiFailures - profils dont l'analyse IA a échoué (distingue panne / aucun produit)
 */
export function renderResults(personResults, apiFailures) {
    const container = document.getElementById('singleResult');

    if (personResults.length === 0) {
        if (apiFailures > 0) {
            container.replaceChildren(buildAnalysisFailedState());
        } else {
            container.innerHTML = '<p class="no-results">Aucun résultat trouvé.</p>';
        }
        return;
    }

    container.innerHTML = `${AFFILIATION_DISCLAIMER}
<div class="gifts-grid">${personResults.map(giftCardHtml).join('')}</div>`;

    revealCards();
    bindSuggestionNavigation(personResults);

    updateCartButton(personResults);
}
