/**
 * PROFILS.JS - Gestion de l'étape 2 (Création des profils)
 * ========================================================
 * Gère l'ajout dynamique et la configuration des profils bénéficiaires.
 * Supporte 3 stratégies de budget : custom, same, global.
 */

import { STORAGE_KEYS, LIMITS } from './constants.js';

const interets = [
    { value: "Sport", emoji: "⚽" },
    { value: "Lecture", emoji: "📚" },
    { value: "Cuisine", emoji: "🍳" },
    { value: "Voyage", emoji: "✈️" },
    { value: "Musique", emoji: "🎵" },
    { value: "Tech", emoji: "💻" },
    { value: "Gaming", emoji: "🎮" },
    { value: "Art", emoji: "🎨" },
    { value: "Bien-être", emoji: "🧘" },
    { value: "Mode", emoji: "👗" },
    { value: "Jardinage", emoji: "🌱" },
    { value: "Bricolage", emoji: "🔧" },
    { value: "Cinéma", emoji: "🎬" },
    { value: "Photo", emoji: "📷" },
    { value: "Nature", emoji: "🌲" }
];

let currentConfig = null;

/**
 * Crée une nouvelle carte de profil dans le DOM.
 */
function createProfileCard(index, defaultBudget = "", budgetReadonly = false) {
    const container = document.getElementById('profilesList');
    const template = document.getElementById('profileTemplate');
    const clone = template.content.cloneNode(true);

    const card = clone.querySelector('.profile-card');
    card.querySelector('.profile-title').textContent = `Bénéficiaire #${index + 1}`;

    // Budget pré-rempli selon la stratégie
    const budgetInput = card.querySelector('.p-budget');
    if (defaultBudget) {
        budgetInput.value = defaultBudget;
    }

    // En mode "same" ou "global", le budget peut être en lecture seule
    if (budgetReadonly) {
        budgetInput.readOnly = true;
        budgetInput.classList.add('readonly');
        budgetInput.title = "Budget défini à l'étape précédente";
    }

    // Génération des tags d'intérêt (style chips visuels)
    const tagsContainer = clone.querySelector('.tags-container');
    interets.forEach(it => {
        const tagLabel = document.createElement('label');
        tagLabel.className = 'tag-chip';
        tagLabel.innerHTML = `
            <input type="checkbox" class="p-tag" value="${it.value}">
            <span class="tag-chip-label">
                <span class="tag-emoji">${it.emoji}</span>
                <span>${it.value}</span>
            </span>
        `;
        tagsContainer.appendChild(tagLabel);
    });

    // Gestion des chips de genre
    const genderChips = card.querySelectorAll('.gender-chip');
    const genderInput = card.querySelector('.p-sexe');
    genderChips.forEach(chip => {
        chip.addEventListener('click', () => {
            genderChips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            genderInput.value = chip.dataset.value;
        });
    });

    // Bouton suppression
    const deleteBtn = card.querySelector('.btn-delete');
    deleteBtn.setAttribute('aria-label', `Supprimer le profil ${index + 1}`);
    deleteBtn.onclick = () => {
        if (document.querySelectorAll('.profile-card').length > 1) {
            card.remove();
            renumberProfiles();
        }
    };

    container.appendChild(clone);
}

/**
 * Renumérote les titres des profils après suppression.
 */
function renumberProfiles() {
    document.querySelectorAll('.profile-card').forEach((card, i) => {
        card.querySelector('.profile-title').textContent = `Bénéficiaire #${i + 1}`;
    });
}

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
    const rawConfig = localStorage.getItem(STORAGE_KEYS.GIFT_CONFIG);

    // Redirection si l'étape 1 n'est pas faite
    if (!rawConfig) {
        window.location.href = 'config.html';
        return;
    }

    try {
        const parsed = JSON.parse(rawConfig);
        const nb = Number(parsed.nb);
        const amount = parsed.amount !== undefined && parsed.amount !== null
            ? Number(parsed.amount)
            : null;

        currentConfig = {
            occasion: String(parsed.occasion || ''),
            nb: Number.isFinite(nb) && nb > 0 ? nb : 1,
            strategy: parsed.strategy || 'custom', // 'custom', 'same', 'global'
            amount: Number.isFinite(amount) && amount > 0 ? amount : null
        };
    } catch {
        window.location.href = 'config.html';
        return;
    }

    // Afficher un récapitulatif de la config dans le header si besoin
    displayConfigSummary();

    // Calcul du budget par personne selon la stratégie
    let budgetPerPerson = "";
    let budgetReadonly = false;

    if (currentConfig.strategy === 'global' && currentConfig.amount) {
        // Budget global divisé entre tous
        budgetPerPerson = Math.floor(currentConfig.amount / currentConfig.nb);
        budgetReadonly = true;
    } else if (currentConfig.strategy === 'same' && currentConfig.amount) {
        // Même budget pour chacun
        budgetPerPerson = currentConfig.amount;
        budgetReadonly = true;
    }
    // Si 'custom', pas de pré-remplissage

    // Création des cartes profil
    for (let i = 0; i < currentConfig.nb; i++) {
        createProfileCard(i, budgetPerPerson ? String(budgetPerPerson) : "", budgetReadonly);
    }

    // Boutons
    const addProfileBtn = document.getElementById('addProfile');
    const launchAnalysisBtn = document.getElementById('launchAnalysis');

    if (!addProfileBtn || !launchAnalysisBtn) return;

    addProfileBtn.onclick = () => {
        const currentCount = document.querySelectorAll('.profile-card').length;
        // [TASK-005] Utiliser la constante centralisée
        if (currentCount >= LIMITS.MAX_PROFILES) {
            alert(`Maximum ${LIMITS.MAX_PROFILES} profils pour garantir la qualité des recommandations.`);
            return;
        }
        createProfileCard(currentCount, budgetPerPerson ? String(budgetPerPerson) : "", budgetReadonly);
    };

    // Validation et Lancement de l'analyse
    launchAnalysisBtn.onclick = () => {
        const cards = document.querySelectorAll('.profile-card');
        const errors = [];

        const equipe = Array.from(cards).map((card, index) => {
            const nameRaw = card.querySelector('.p-name').value;
            const name = nameRaw ? nameRaw.trim() : "Anonyme";

            if (name.length > 50) {
                errors.push(`Nom trop long pour le profil #${index + 1}`);
            }

            const sexe = card.querySelector('.p-sexe').value;
            const ageRaw = card.querySelector('.p-age').value;
            const budgetRaw = card.querySelector('.p-budget').value;

            const ageNum = ageRaw !== '' ? Number.parseInt(ageRaw, 10) : null;
            const budgetNum = Number.parseFloat(budgetRaw);

            const safeAge = Number.isFinite(ageNum) && ageNum > 0 && ageNum < 120 ? ageNum : null;
            const safeBudget = Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : 0;

            if (safeBudget <= 0) {
                errors.push(`Budget invalide pour ${name}`);
            }
            // [TASK-005] Plafonnement du budget par personne
            if (safeBudget > LIMITS.MAX_BUDGET) {
                errors.push(`Budget trop élevé pour ${name} (max ${LIMITS.MAX_BUDGET}€)`);
            }

            return {
                nom: name,
                sexe,
                age: safeAge,
                budget: safeBudget,
                tags: Array.from(card.querySelectorAll('.p-tag:checked')).map(t => String(t.value)),
                details: {
                    adore: String(card.querySelector('.p-details').value || '').slice(0, 200),
                    eviter: String(card.querySelector('.p-hates').value || '').slice(0, 200)
                }
            };
        }).filter(personne => personne.budget > 0);

        if (errors.length > 0) {
            alert("Erreurs détectées :\n" + errors.join("\n"));
            return;
        }

        if (equipe.length === 0) {
            alert("Veuillez ajouter au moins un profil avec un budget valide.");
            return;
        }

        // Sauvegarde finale pour l'analyseur
        try {
            localStorage.setItem(STORAGE_KEYS.FINAL_DATA, JSON.stringify({
                contexte: currentConfig.occasion,
                equipe
            }));

            // TRACKING — Envoi des profils au serveur (seulement si cookies acceptés)
            const cookieConsent = localStorage.getItem(STORAGE_KEYS.COOKIE_CONSENT);
            let hasConsent = false;
            try { hasConsent = cookieConsent && JSON.parse(cookieConsent).accepted === true; } catch (e) { }
            if (hasConsent) {
                // FIX #9 : sendBeacon au lieu de fetch (évite l'annulation lors de la navigation)
                try {
                    navigator.sendBeacon('/api/track-profiles', new Blob([JSON.stringify({
                        occasion: currentConfig.occasion,
                        profiles: equipe,
                        consent: true
                    })], { type: 'application/json' }));
                } catch (e) { } // Fire-and-forget
            }

            window.location.href = 'analyse.html';
        } catch (e) {
            alert("Erreur de sauvegarde (LocalStorage plein ?)");
        }
    };
});

/**
 * Affiche un récapitulatif de la configuration en haut de page.
 */
function displayConfigSummary() {
    if (!currentConfig) return;

    const summaryContainer = document.querySelector('.card-subtitle');
    if (summaryContainer && currentConfig.occasion) {
        // FIX #2 : Échapper l'occasion pour éviter les injections XSS
        const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        let summaryText = `🎁 Occasion : <strong>${esc(currentConfig.occasion)}</strong>`;

        if (currentConfig.strategy === 'global' && currentConfig.amount) {
            summaryText += ` • 📊 Budget total : <strong>${esc(currentConfig.amount)}€</strong> à répartir`;
        } else if (currentConfig.strategy === 'same' && currentConfig.amount) {
            summaryText += ` • 👥 Budget : <strong>${esc(currentConfig.amount)}€</strong> par personne`;
        } else {
            summaryText += ` • ✏️ Budget personnalisé par profil`;
        }

        summaryContainer.innerHTML = summaryText;
    }
}