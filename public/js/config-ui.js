/**
 * CONFIG-UI.JS — Interactions visuelles de config.html
 * =====================================================
 * Gère les sélecteurs d'occasion (chips) et les cartes de stratégie budget.
 * Externalisé depuis config.html pour supprimer 'unsafe-inline' de la CSP.
 */

// [TASK-003] Import escapeHtml pour sécuriser les innerHTML
import { escapeHtml } from './security.js';

document.addEventListener('DOMContentLoaded', () => {

    // ============================================
    // GESTION DES CHIPS D'OCCASION
    // ============================================
    document.querySelectorAll('.occasion-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.occasion-chip').forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            document.getElementById('occasion').value = chip.dataset.value;
        });
    });

    // ============================================
    // GESTION DES CARTES BUDGET
    // ============================================
    const budgetCards = document.querySelectorAll('.budget-card');
    const budgetStrategyInput = document.getElementById('budgetStrategy');
    const budgetAmountContainer = document.getElementById('budgetAmountContainer');
    const budgetAmountInput = document.getElementById('budgetAmount');
    const budgetAmountLabel = document.getElementById('budgetAmountLabel');
    const budgetCalculation = document.getElementById('budgetCalculation');
    const nbPeopleInput = document.getElementById('nbPeople');

    function updateBudgetUI() {
        const strategy = budgetStrategyInput.value;
        const nbPeople = parseInt(nbPeopleInput.value) || 1;
        const amount = parseFloat(budgetAmountInput.value) || 0;

        // Afficher/masquer le champ montant selon la stratégie
        if (strategy === 'custom') {
            budgetAmountContainer.classList.add('hidden');
            budgetCalculation.innerHTML = '';
        } else {
            budgetAmountContainer.classList.remove('hidden');

            // Mettre à jour le label et le calcul selon la stratégie
            if (strategy === 'global') {
                budgetAmountLabel.textContent = '💰 Budget total à répartir (€)';
                if (amount > 0) {
                    const perPerson = Math.floor(amount / nbPeople);
                    budgetCalculation.innerHTML = `📊 <strong>${escapeHtml(amount)}€</strong> ÷ ${escapeHtml(nbPeople)} profil${nbPeople > 1 ? 's' : ''} = <strong>~${escapeHtml(perPerson)}€</strong> par personne`;
                } else {
                    budgetCalculation.innerHTML = '';
                }
            } else if (strategy === 'same') {
                budgetAmountLabel.textContent = '💰 Budget par personne (€)';
                if (amount > 0) {
                    const total = amount * nbPeople;
                    budgetCalculation.innerHTML = `👥 <strong>${escapeHtml(amount)}€</strong> × ${escapeHtml(nbPeople)} profil${nbPeople > 1 ? 's' : ''} = <strong>${escapeHtml(total)}€</strong> total`;
                } else {
                    budgetCalculation.innerHTML = '';
                }
            }
        }
    }

    // Sélection des cartes
    budgetCards.forEach(card => {
        card.addEventListener('click', () => {
            budgetCards.forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            budgetStrategyInput.value = card.dataset.strategy;
            updateBudgetUI();
        });
    });

    // Mise à jour dynamique lors des changements
    nbPeopleInput.addEventListener('input', updateBudgetUI);
    budgetAmountInput.addEventListener('input', updateBudgetUI);

    // Chips de montant rapide
    document.querySelectorAll('.chip-cro').forEach(chip => {
        chip.addEventListener('click', () => {
            budgetAmountInput.value = chip.dataset.amount;
            updateBudgetUI();
        });
    });

    // Initialisation
    updateBudgetUI();
});
