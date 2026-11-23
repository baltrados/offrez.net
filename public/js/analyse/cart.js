/**
 * ANALYSE/CART.JS - Panier Amazon groupé (logique pure, sans DOM)
 * ===============================================================
 * Extraction d'ASIN, produits sélectionnés, total et URL « ajouter au panier » multi-articles.
 */

import { AFFILIATE_TAG } from './settings.js?v=2026112406';

const CART_ADD_URL = 'https://www.amazon.fr/gp/aws/cart/add.html';
// Formats supportés : /dp/ASIN ou /gp/product/ASIN (ASIN = 10 caractères alphanumériques)
const ASIN_PATTERN = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i;

/**
 * ASIN extrait d'une URL produit Amazon, ou null.
 * @param {unknown} url
 * @returns {string|null}
 */
export function extractASIN(url) {
    if (!url || typeof url !== 'string') return null;
    const match = url.match(ASIN_PATTERN);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Produit actuellement affiché pour chaque personne, limité à ceux qui ont un ASIN valide.
 * @param {Array<{personne: {nom: string}, products: any[], currentIndex: number}>} personResults
 * @returns {Array<{personne: string, product: any, asin: string}>}
 */
export function getSelectedProducts(personResults) {
    return personResults.map(pr => {
        const product = pr.products[pr.currentIndex];
        const asin = typeof product?.asin === 'string' && /^[A-Z0-9]{10}$/.test(product.asin)
            ? product.asin
            : extractASIN(product?.link);
        return { personne: pr.personne.nom, product, asin };
    }).filter(item => item.asin);
}

/** Somme des prix des produits sélectionnés (prix illisible = 0). */
export function computeCartTotal(selectedProducts) {
    return selectedProducts.reduce((sum, item) => sum + (Number(item.product?.price?.value) || 0), 0);
}

/**
 * URL Amazon ajoutant tous les articles au panier en une fois (ASIN.n / Quantity.n + tag affilié).
 * Le tag est passé deux fois : `tag` (paramètre des liens actuels) et `AssociateTag` (nom documenté
 * historiquement pour cart/add.html) ; l'attribution réelle reste à confirmer dans Associates Central.
 * @param {Array<{asin: string}>} selectedProducts
 * @param {string} [tag=AFFILIATE_TAG]
 */
export function generateCartURL(selectedProducts, tag = AFFILIATE_TAG) {
    const params = new URLSearchParams();
    selectedProducts.forEach((item, index) => {
        const num = index + 1;
        params.append(`ASIN.${num}`, item.asin);
        params.append(`Quantity.${num}`, '1');
    });
    params.append('tag', tag);
    params.append('AssociateTag', tag);
    return `${CART_ADD_URL}?${params.toString()}`;
}
