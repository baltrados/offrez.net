/**
 * ANALYSE/EMAIL-CAPTURE.JS - Modale « rappel avant le jour J » (inscription Brevo)
 * ================================================================================
 * Affichée quelques secondes après les résultats ; formulaire envoyé à /api/subscribe.
 */

import { EMAIL_MODAL_DELAY_MS, EMAIL_MODAL_CLOSE_ANIMATION_MS } from './settings.js?v=2026112202';

/** Ajoute (une seule fois) le bouton de fermeture : l'utilisateur n'est jamais piégé. */
function ensureCloseButton(emailCapture) {
    if (emailCapture.querySelector('.btn-close-email')) return;
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    closeBtn.className = 'btn-close-email';
    closeBtn.setAttribute('aria-label', 'Fermer la fenêtre');
    closeBtn.onclick = () => {
        emailCapture.classList.remove('visible');
        // Laisser l'animation de fin se terminer avant de masquer
        setTimeout(() => { emailCapture.style.display = 'none'; }, EMAIL_MODAL_CLOSE_ANIMATION_MS);
    };
    emailCapture.appendChild(closeBtn);
}

/** Affichage retardé de la modale (transition CSS « popup »). */
function scheduleModal(emailCapture) {
    setTimeout(() => {
        emailCapture.style.display = 'block';
        void emailCapture.offsetWidth; // force le calcul de layout pour que la transition s'applique
        emailCapture.classList.add('visible');
    }, EMAIL_MODAL_DELAY_MS);
}

/**
 * Contexte cadeau transmis à Brevo : prénom et produit affiché de la première personne.
 * @param {Array<{personne: {nom: string}, products: any[], currentIndex: number}>} personResults
 */
export function buildSubscribeContext(personResults) {
    if (personResults.length === 0) return { prenomCible: null, cadeauChoisi: null };
    const firstResult = personResults[0];
    const currentProduct = firstResult.products[firstResult.currentIndex];
    return {
        prenomCible: firstResult.personne.nom || null,
        cadeauChoisi: currentProduct?.title || null
    };
}

function bindEmailForm(emailForm, personResults) {
    const emailSuccess = document.getElementById('emailSuccess');
    emailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = emailForm.querySelector('button');
        const originalHtml = btn.innerHTML;
        const emailError = document.getElementById('emailError');
        const showEmailError = (message) => { if (emailError) emailError.textContent = message; };
        const restoreButton = () => { btn.innerHTML = originalHtml; btn.disabled = false; };
        showEmailError('');

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const email = document.getElementById('userEmail').value;
        const consent = document.getElementById('emailConsent').checked;
        const { prenomCible, cadeauChoisi } = buildSubscribeContext(personResults);

        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, consent, prenomCible, cadeauChoisi })
            });

            if (res.ok) {
                emailForm.style.display = 'none';
                emailSuccess.style.display = 'flex';
            } else {
                const err = await res.json();
                showEmailError(String(err.error || "Impossible d'enregistrer l'email."));
                restoreButton();
            }
        } catch (error) {
            showEmailError('Connexion au serveur impossible. Veuillez réessayer.');
            restoreButton();
        }
    });
}

/**
 * Active la modale email (seulement s'il y a des résultats) et le formulaire d'inscription.
 * @param {Array} personResults
 */
export function initEmailCapture(personResults) {
    const emailCapture = document.getElementById('emailCapture');
    const emailForm = document.getElementById('emailForm');

    if (personResults.length > 0 && emailCapture) {
        ensureCloseButton(emailCapture);
        scheduleModal(emailCapture);
    }
    if (emailForm) bindEmailForm(emailForm, personResults);
}
