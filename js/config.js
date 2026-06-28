/**
 * CONFIG.JS - Gestion de l'étape 1 (Mission & Budget)
 * ===================================================
 * Gère le formulaire de la page config.html.
 * Supporte 3 stratégies de budget : custom, same, global.
 */

import { STORAGE_KEYS, LIMITS } from './constants.js';

document.addEventListener('DOMContentLoaded', () => {
    // Récupération des éléments du DOM
    const form = document.getElementById('configForm');
    const strategyInput = document.getElementById('budgetStrategy');
    const budgetAmountContainer = document.getElementById('budgetAmountContainer');
    const nbPeopleInput = document.getElementById('nbPeople');
    const budgetAmountInput = document.getElementById('budgetAmount');
    const occasionInput = document.getElementById('occasion');



    /**
     * Charge la configuration existante si l'utilisateur revient sur la page.
     */
    const loadExistingConfig = () => {
        let raw;
        try {
            raw = localStorage.getItem(STORAGE_KEYS.GIFT_CONFIG);
        } catch (e) {
            return;
        }

        if (!raw) return;

        try {
            const parsed = JSON.parse(raw);
            const nb = Number(parsed.nb);
            const amount = parsed.amount !== undefined && parsed.amount !== null
                ? Number(parsed.amount)
                : null;

            // Remplissage des champs cachés (occasion)
            if (parsed.occasion && occasionInput) {
                occasionInput.value = parsed.occasion;
                // Synchroniser le chip visuel
                document.querySelectorAll('.occasion-chip').forEach(chip => {
                    chip.classList.toggle('selected', chip.dataset.value === parsed.occasion);
                });
            }

            if (Number.isFinite(nb) && nb > 0 && nbPeopleInput) {
                nbPeopleInput.value = String(nb);
            }

            // Stratégie budget (custom, same, global)
            if (strategyInput && parsed.strategy) {
                strategyInput.value = parsed.strategy;
                // Synchroniser la carte visuelle
                document.querySelectorAll('.budget-card').forEach(card => {
                    card.classList.toggle('selected', card.dataset.strategy === parsed.strategy);
                });
            }

            if (amount !== null && Number.isFinite(amount) && amount > 0 && budgetAmountInput) {
                budgetAmountInput.value = String(amount);
            }
        } catch (e) {
            localStorage.removeItem(STORAGE_KEYS.GIFT_CONFIG);
        }
    };

    // Initialisation
    loadExistingConfig();

    // ============================================
    // CRO : Budget Anchoring Logic (Chips rapides)
    // ============================================
    document.querySelectorAll('.chip-cro[data-amount]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.chip-cro').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            const amount = e.currentTarget.dataset.amount;
            if (budgetAmountInput) {
                budgetAmountInput.value = amount;
                budgetAmountInput.dispatchEvent(new Event('input'));
                budgetAmountInput.classList.add('flash');
                setTimeout(() => budgetAmountInput.classList.remove('flash'), 300);
            }
        });
    });

    // ============================================
    // CRO : Priming (Occasion par défaut selon la saison)
    // ============================================
    const month = new Date().getMonth(); // 0 = Janvier
    let defaultOccasion = "Anniversaire";
    if (month === 11) defaultOccasion = "Noël";
    else if (month === 1) defaultOccasion = "Saint-Valentin";
    else if (month === 4) defaultOccasion = "Fête des Mères";

    // Si aucune occasion n'est déjà sélectionnée
    if (occasionInput && !localStorage.getItem(STORAGE_KEYS.GIFT_CONFIG)) {
        occasionInput.value = defaultOccasion;
        document.querySelectorAll('.occasion-chip').forEach(chip => {
            chip.classList.toggle('selected', chip.dataset.value === defaultOccasion);
        });
    }

    // Soumission du formulaire
    if (form) {
        form.addEventListener('submit', (event) => {
            event.preventDefault();

            const nbRaw = nbPeopleInput ? nbPeopleInput.value : "1";
            const budgetRaw = budgetAmountInput ? budgetAmountInput.value : "0";
            const strategyValue = strategyInput ? strategyInput.value : "custom";

            const nb = Number.parseInt(nbRaw, 10);
            const amount = Number.parseFloat(budgetRaw);

            // Validation finale des données
            const safeNb = Number.isFinite(nb) && nb > 0 ? nb : 1;
            const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : null;

            // [TASK-005] Plafonnement du budget
            if (safeAmount !== null && safeAmount > LIMITS.MAX_BUDGET) {
                alert(`Budget maximum : ${LIMITS.MAX_BUDGET}€. Veuillez réduire le montant.`);
                return;
            }

            const config = {
                occasion: String(occasionInput ? occasionInput.value : 'Anniversaire'),
                nb: safeNb,
                strategy: strategyValue, // 'custom', 'same', ou 'global'
                amount: safeAmount
            };

            // Sauvegarde et redirection vers l'étape suivante (Profils)
            try {
                localStorage.setItem(STORAGE_KEYS.GIFT_CONFIG, JSON.stringify(config));
                window.location.href = 'profils.html';
            } catch (e) {
                alert("Erreur: Impossible de sauvegarder (Stockage navigateur plein ?)");
            }
        });
    }
});
