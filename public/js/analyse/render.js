/**
 * ANALYSE/RENDER.JS - Affichage des résultats (cartes cadeaux, navigation, panier groupé)
 * ======================================================================================
 * Toute donnée externe (IA, Amazon, profil) passe par escapeHtml ; toute URL par buildProductUrl
 * (produits : /dp/<ASIN> canonique) ou buildAmazonSearchUrl (idées affichées en lien de recherche).
 */

import { escapeHtml, buildProductUrl, buildAmazonSearchUrl } from '../security.js?v=2026112403';
import { getSelectedProducts, computeCartTotal, generateCartURL } from './cart.js?v=2026112403';
import { buildAnalysisFailedState, buildLimitReachedState } from './ui.js?v=2026112403';
import {
    AFFILIATE_TAG,
    TITLE_MAX_CHARS,
    REVEAL_START_DELAY_MS,
    REVEAL_STAGGER_MS
} from './settings.js?v=2026112403';

const PLACEHOLDER_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%231e293b' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E";

const AFFILIATION_DISCLAIMER = `<div class="affiliation-disclaimer" style="text-align:center; padding: 10px; margin-bottom: 20px; font-size: 0.85rem; color: #94a3b8; font-style: italic; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1);">
  <i class="fas fa-info-circle"></i> OFFREZ est soutenu par ses utilisateurs. Si vous finalisez un achat via les boutons Amazon ci-dessous, nous pouvons percevoir une commission sans frais supplémentaires pour vous.
</div>`;

/** Nombre d'avis au format français (1 234), ou '' s'il est absent. */
function formatReviewCount(reviews) {
    const n = Number(reviews);
    return Number.isInteger(n) && n > 0 ? n.toLocaleString('fr-FR') : '';
}

/** Navigation ‹ › entre les suggestions d'une personne (rien s'il n'y en a qu'une). */
function suggestionNavHtml(products, currentIndex, personIndex) {
    if (products.length <= 1) return '';
    return `
                        <div class="suggestion-nav">
                            <button class="btn-nav-suggestion btn-prev" data-person="${personIndex}" data-direction="prev" aria-label="Suggestion précédente" ${currentIndex === 0 ? 'disabled' : ''}>
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <span class="suggestion-indicator">${currentIndex + 1} / ${products.length}</span>
                            <button class="btn-nav-suggestion btn-next" data-person="${personIndex}" data-direction="next" aria-label="Suggestion suivante" ${currentIndex >= products.length - 1 ? 'disabled' : ''}>
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>`;
}

/**
 * Carte d'une idée proposée en lien de recherche Amazon taggé (aucun produit précis, aucun appel API) :
 * ni prix, ni image, ni ASIN (exclue du panier groupé).
 */
function searchIdeaCardHtml(pr, personIndex) {
    const { personne, products, currentIndex } = pr;
    const idea = products[currentIndex];
    const link = buildAmazonSearchUrl(idea.term, AFFILIATE_TAG);
    const term = escapeHtml(idea.term);
    const safePersonName = escapeHtml(personne.nom);

    return `
                <div class="gift-card gift-card-search" data-person-index="${personIndex}">
                    <div class="gift-image gift-image-search" aria-hidden="true">
                        <i class="fas fa-magic"></i>
                    </div>
                    <div class="gift-content">
                        <div class="gift-owner">🎁 ${safePersonName}</div>
                        <h4 class="gift-title">Idée : ${term}</h4>
                        <p class="gift-search-hint">Comparez les modèles et les prix directement sur Amazon.</p>
                        <p class="gift-reason">${escapeHtml(idea.reason)}</p>
                        <a href="${escapeHtml(link)}" target="_blank" rel="nofollow sponsored noopener" class="btn-amazon-cta js-track-click js-purchase-btn"
                           data-recipient="${safePersonName}">
                            <i class="fab fa-amazon"></i> Voir les idées sur Amazon
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        ${suggestionNavHtml(products, currentIndex, personIndex)}
                    </div>
                </div>
            `;
}

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
    if (product.kind === 'search') return searchIdeaCardHtml(pr, personIndex);

    const priceValue = Number(product.price?.value);
    const priceRaw = escapeHtml(product.price?.raw || `${priceValue}€`);
    // Lien canonique amazon.fr/dp/<ASIN> + tag affilié (sinon lien amazon.fr vérifié, ou '#') ; échappé à l'interpolation
    const link = buildProductUrl(product, AFFILIATE_TAG);

    const fullTitle = product.title || 'Produit sans titre';
    const titleShort = escapeHtml(fullTitle.length > TITLE_MAX_CHARS ? `${fullTitle.substring(0, TITLE_MAX_CHARS)}…` : fullTitle);
    const imageUrl = escapeHtml(product.image || PLACEHOLDER_IMAGE);
    const displayReason = escapeHtml(product.reason || '');
    const isPrime = product.is_prime || false;
    const safePersonName = escapeHtml(personne.nom);

    const reviewCount = formatReviewCount(product.reviews);
    const isBestSeller = product.is_best_seller === true;

    return `
                <div class="gift-card" data-person-index="${personIndex}">
                    <div class="gift-image">
                        <img src="${imageUrl}" alt="${titleShort}" loading="lazy">
                        ${product.rating ? `<div class="gift-rating-badge">⭐ ${escapeHtml(String(product.rating))}</div>` : ''}
                    </div>
                    <div class="gift-content">
                        <div class="gift-owner">🎁 ${safePersonName}</div>
                        ${isPrime ? '<span class="prime-mini">✓ Prime</span>' : ''}
                        ${isBestSeller ? '<span class="best-seller-mini">🏆 Meilleure vente</span>' : ''}
                        <h4 class="gift-title">${titleShort}</h4>
                        <div class="gift-price-row">
                            <span class="gift-price">${priceRaw}</span>
                            ${reviewCount ? `<span class="gift-reviews">${escapeHtml(reviewCount)} avis</span>` : ''}
                        </div>
                        <p class="gift-reason">${displayReason}</p>
                        <a href="${escapeHtml(link)}" target="_blank" rel="nofollow sponsored noopener" class="btn-amazon-cta js-track-click js-purchase-btn"
                           data-product="${escapeHtml(product.title)}"
                           data-price="${priceRaw}"
                           data-asin="${escapeHtml(product.asin || '')}"
                           data-recipient="${safePersonName}"
                           data-link="${escapeHtml(link)}">
                            <i class="fab fa-amazon"></i> Voir sur Amazon
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        ${suggestionNavHtml(products, currentIndex, personIndex)}
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

/** Navigation ‹ › entre les suggestions d'une personne (instantanée : les données sont déjà chargées). */
function bindSuggestionNavigation(personResults) {
    document.querySelectorAll('.btn-nav-suggestion').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const personIndex = parseInt(e.currentTarget.dataset.person);
            const direction = e.currentTarget.dataset.direction;
            const person = personResults[personIndex];

            if (direction === 'next' && person.currentIndex < person.products.length - 1) {
                person.currentIndex += 1;
            } else if (direction === 'prev' && person.currentIndex > 0) {
                person.currentIndex -= 1;
            }
            renderResults(personResults, 0);
            // Le focus suit le bouton utilisé (la carte vient d'être redessinée) ; en bout de carrousel ce bouton
            // est désactivé : le focus passe à l'autre bouton plutôt que de retomber sur <body>.
            const nav = document.querySelector(`.gift-card[data-person-index="${personIndex}"] .suggestion-nav`);
            (nav?.querySelector(`[data-direction="${direction}"]:not([disabled])`) || nav?.querySelector('button:not([disabled])'))?.focus();
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
                <a href="${escapeHtml(cartURL)}" target="_blank" rel="nofollow sponsored noopener" class="btn btn-cart" data-count="${selectedProducts.length}">
                    <i class="fas fa-shopping-cart"></i> Ajouter tout au panier Amazon
                </a>
            </div>
        `;
    cartContainer.style.display = 'block';
}

/**
 * Affiche tous les résultats (une carte par personne), ou l'état vide / d'erreur.
 * @param {Array<{personne: any, products: any[], currentIndex: number}>} personResults
 * @param {number} apiFailures - profils dont l'analyse IA a échoué (distingue panne / aucun produit)
 * @param {boolean} [limitReached] - le serveur a répondu 429 / 503 (limite atteinte : pas de « Réessayer »)
 */
export function renderResults(personResults, apiFailures, limitReached = false) {
    const container = document.getElementById('singleResult');

    if (personResults.length === 0) {
        if (limitReached) {
            container.replaceChildren(buildLimitReachedState());
        } else if (apiFailures > 0) {
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
