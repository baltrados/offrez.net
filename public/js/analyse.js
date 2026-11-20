import { callGemini, searchAmazon } from './api.js';
import { escapeHtml, sanitizeUrl, truncateText } from './security.js';
import { STORAGE_KEYS } from './constants.js';

/**
 * ANALYSE.JS - Cerveau de l'application (Étape 3)
 * ================================================
 * Ce script orchestre tout le processus de recommandation :
 * 1. Récupération des profils depuis le localStorage.
 * 2. Génération de prompts complexes pour l'IA (Gemini).
 * 3. Recherche de produits correspondants sur Amazon (via serveur).
 * 4. Filtrage, scoring et sélection des meilleurs cadeaux.
 * 5. Affichage interactif des résultats et gestion du panier.
 */

// ============================================
// CONFIGURATION & DEBUG
// ============================================
const DEBUG_MODE = false; // Mode Production (logs limités)
const AFFILIATE_TAG = "offreznet-21"; // Tag Amazon Partenaire
const logOutput = document.getElementById('logOutput'); // Terminal visuel (si présent)

// Styles pour la console du navigateur (F12)
const CONSOLE_STYLES = {
    success: 'background: #166534; color: #4ade80; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    error: 'background: #991b1b; color: #fca5a5; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    warning: 'background: #854d0e; color: #fde047; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    info: 'background: #1e40af; color: #93c5fd; padding: 2px 6px; border-radius: 3px; font-weight: bold;',
    debug: 'background: #6b21a8; color: #d8b4fe; padding: 2px 6px; border-radius: 3px; font-weight: bold;'
};

/**
 * Système de logging centralisé.
 * Affiche les messages dans la console ET dans le terminal visuel (si activé).
 */
function log(title, message, type = 'info') {
    const time = new Date().toLocaleTimeString();

    // === CONSOLE F12 (verbeux) ===
    if (DEBUG_MODE) {
        const style = CONSOLE_STYLES[type] || CONSOLE_STYLES.info;
        console.log(`%c[${time}] ${title}`, style, message);
    }

    // === Terminal visuel HTML ===
    if (logOutput) {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type.toLowerCase()}`;
        // FIX #8 : Échapper le HTML pour éviter les injections XSS
        const safeTitle = String(title).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeMessage = String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        entry.innerHTML = `<span class="log-title">[${time}] ${safeTitle} :</span> <span class="log-${type}">${safeMessage}</span>`;
        logOutput.appendChild(entry);
        logOutput.scrollTop = logOutput.scrollHeight;
    }
}

// Helper pour inspecter les objets sans polluer la console de prod
function debugObj(label, obj) {
    if (!DEBUG_MODE) return;
    console.group(`🔍 DEBUG: ${label}`);
    console.log('%cTimestamp:', 'color: #888', new Date().toISOString());
    if (Array.isArray(obj)) {
        console.table(obj);
    } else if (typeof obj === 'object') {
        console.dir(obj, { depth: 4 });
    } else {
        console.log(obj);
    }
    console.groupEnd();
}

// Tracer les appels de fonctions importantes
function traceCall(fnName, args = {}) {
    if (!DEBUG_MODE) return;
    console.log(`%c⚡ CALL: ${fnName}`, 'background: #0f172a; color: #38bdf8; padding: 2px 6px; border-radius: 3px;', args);
}

// Initialisation du mode debug
if (DEBUG_MODE) {
    console.clear();
    console.log('%c🎁 OFFREZ - MODE DEBUG', 'background: linear-gradient(135deg, #ff6b35, #e55a2a); color: white; padding: 8px 16px; font-size: 14px; font-weight: bold; border-radius: 6px;');
}

/**
 * Met à jour l'interface utilisateur (barre de progression).
 * @param {number} percent - Pourcentage (0-100).
 * @param {string} message - Texte informatif pour l'utilisateur.
 */
function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const statusMessage = document.getElementById('statusMessage');

    if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (progressText) progressText.textContent = `${Math.round(percent)}% - ${message}`;
    if (statusMessage) statusMessage.textContent = message;
}


// ============================================
// FONCTION PRINCIPALE : Lancer l'analyse
// ============================================
async function lancerAnalyse() {
    traceCall('lancerAnalyse', { timestamp: new Date().toISOString() });
    log("SYSTEM", "Initialisation du moteur OFFREZ...", "info");

    // 1. Chargement des données stockées à l'étape précédente
    const raw = localStorage.getItem(STORAGE_KEYS.FINAL_DATA);
    debugObj('localStorage.finalData (raw)', raw);

    if (!raw) {
        log("ERROR", "Aucune donnée trouvée dans le localStorage !", "error");
        // Erreur silencieuse - gérée par log() ci-dessus
        return;
    }

    let data;
    try {
        data = JSON.parse(raw);
        debugObj('Données parsées (data)', data);
    } catch (e) {
        log("ERROR", "Données finales corrompues dans le localStorage.", "error");
        // Erreur silencieuse
        return;
    }

    if (!data?.equipe || !Array.isArray(data.equipe) || data.equipe.length === 0) {
        log("ERROR", "Aucune équipe valide à analyser.", "error");
        // Erreur silencieuse
        return;
    }

    // Log supprimé pour production
    debugObj('Contexte occasion', data.contexte);

    // Initialisation UI
    const totalProfiles = data.equipe.length;
    let processedProfiles = 0;
    updateProgress(5, 'Démarrage de l\'analyse...');

    const loading = document.getElementById('statusIndicator');

    // Stockage des résultats par personne pour affichage final
    const personResults = [];

    // 2. Boucle principale : Traitement de chaque profil
    for (const personneBrute of data.equipe) {
        if (DEBUG_MODE) console.group(`👤 Traitement profil: ${personneBrute?.nom || 'Anonyme'}`);
        debugObj('Profil brut reçu', personneBrute);

        const budgetNum = Number(personneBrute?.budget);
        // Budget parsing silencieux

        if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
            log("SYSTEM", `Profil ignoré (budget invalide)`, "warning");
            // Warning silencieux
            if (DEBUG_MODE && typeof console.groupEnd === 'function') console.groupEnd();
            continue;
        }

        const personne = {
            nom: String(personneBrute.nom || "Anonyme"),
            sexe: String(personneBrute.sexe || "Non précisé"),
            age: personneBrute.age ?? null,
            budget: budgetNum,
            tags: Array.isArray(personneBrute.tags) ? personneBrute.tags : [],
            details: personneBrute.details || {}
        };

        debugObj('Profil normalisé', personne);

        log("PROFIL", `Analyse pour ${personne.nom} (Budget Max: ${personne.budget}€)`, "info");

        // Calcul dynamique de la progression
        const profileProgress = 10 + (processedProfiles / totalProfiles) * 70;
        updateProgress(profileProgress, `Analyse de ${personne.nom}...`);

        // ============================================
        // PROMPT ENGINEERING (Le cœur de l'intelligence)
        // ============================================
        const sexeLabel = personne.sexe === 'Homme' ? 'un homme' : personne.sexe === 'Femme' ? 'une femme' : 'une personne';
        const ageLabel = personne.age ? `de ${personne.age} ans` : '';

        const prompt = `
# RÔLE
Tu es OFFREZ, un expert en recommandation de cadeaux avec 15 ans d'expérience dans le e-commerce et la psychologie du consommateur. Tu connais parfaitement Amazon.fr et ses catégories de produits.

# FRAÎCHEUR DES PRODUITS 📅
- Nous sommes en ${new Date().getFullYear()}
- Pour tout produit daté (édition annuelle, version millésimée) : propose UNIQUEMENT la version la plus récente disponible
- Privilégie les produits INTEMPORELS qui ne se démodent pas

# MISSION CRITIQUE
Trouver 2 idées de cadeaux PARFAITES pour ${personne.nom} (${sexeLabel} ${ageLabel}).

# CONTEXTE
- **Occasion** : ${data.contexte}
- **Budget MAXIMUM** : ${personne.budget}€ (INTERDIT de dépasser, vise 60-90% du budget)
- **Centres d'intérêt** : ${personne.tags.length > 0 ? personne.tags.join(', ') : 'Non spécifiés - propose des cadeaux universels appréciés'}
- **Ce qu'il/elle adore** : ${personne.details?.adore || 'Non précisé'}

⛔⛔⛔ LISTE NOIRE - À NE JAMAIS PROPOSER ⛔⛔⛔
${personne.details?.eviter || 'Rien de spécifié'}

${personne.details?.eviter?.toLowerCase().includes('technologie') || personne.details?.eviter?.toLowerCase().includes('tech') ? `
⚠️ ATTENTION SPÉCIALE : Cette personne n'aime PAS la technologie !
INTERDIT de proposer : souris, clavier, écran, ordinateur, smartphone, tablette, casque, enceinte, tapis de souris, accessoires PC/gaming, gadgets électroniques, objets connectés, etc.
` : ''}

# PROCESSUS DE RÉFLEXION (Chain of Thought)
Avant de répondre, réfléchis silencieusement :
1. Quels produits sont dans la LISTE NOIRE ? → Les exclure totalement
2. Quel type de personne est-ce ? (personnalité supposée)
3. Pour cette occasion, qu'est-ce qui ferait vraiment plaisir ?
4. Quels produits Amazon.fr correspondent ET respectent le budget ?
5. Les termes de recherche sont-ils optimisés pour Amazon.fr ?

# RÈGLES STRICTES POUR LES TERMES DE RECHERCHE
✅ BON : Court (2-5 mots), descriptif, catégorie + caractéristique
   Exemples : "montre connectée femme", "coffret whisky dégustation", "lampe bureau LED design"
   
❌ MAUVAIS : Phrases, articles (un/une/le/la), marques inventées, termes vagues
   Exemples à éviter : "un beau cadeau pour elle", "quelque chose de sympa", "produit de qualité"

# FORMAT DE SORTIE (JSON STRICT)
Réponds UNIQUEMENT avec ce JSON, sans texte avant/après, sans markdown :
{
  "suggestions": [
    {
      "term": "terme recherche amazon optimisé",
      "reason": "Pourquoi ce cadeau est parfait pour cette personne",
      "prix_estime": "XX€"
    },
    {
      "term": "deuxième terme recherche",
      "reason": "Justification personnalisée",
      "prix_estime": "XX€"
    }
  ]
}

# ANTI-HALLUCINATION
- Ne propose QUE des produits qui existent réellement sur Amazon.fr
- Les prix estimés doivent être réalistes (vérifie mentalement)
- Si un centre d'intérêt est vague, propose des valeurs sûres universelles
- VÉRIFIE que tes suggestions ne sont PAS dans la liste noire !

GÉNÈRE LE JSON MAINTENANT :`;

        try {
            log("ANALYSE", "Génération des suggestions...", "warning");

            // 3. Appel à Gemini (via Proxy) — AVEC RETRY
            // LABOR ILLUSION : On fait patienter un peu pour donner de la valeur
            updateProgress(profileProgress + 5, `Analyse psychologique de ${personne.nom}...`);
            await new Promise(r => setTimeout(r, 800)); // Fake think time

            updateProgress(profileProgress + 15, `Croisement avec les tendances actuelles...`);

            let iaResult = null;
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    iaResult = await callGemini(prompt);
                    if (iaResult?.suggestions?.length > 0) break;
                    log("RETRY", `Tentative ${attempt + 1} : réponse vide, retry...`, "warning");
                } catch (geminiErr) {
                    log("RETRY", `Tentative ${attempt + 1} échouée: ${geminiErr.message}`, "warning");
                    if (attempt === 0) {
                        updateProgress(profileProgress + 18, `Nouvelle tentative pour ${personne.nom}...`);
                        await new Promise(r => setTimeout(r, 1500));
                    }
                }
            }
            if (!iaResult || !iaResult.suggestions || iaResult.suggestions.length === 0) {
                log("ERREUR", `Gemini n'a rien renvoyé après 2 tentatives pour ${personne.nom}`, "error");
                if (DEBUG_MODE) console.groupEnd();
                continue;
            }
            log("ANALYSE", `${iaResult.suggestions.length} suggestions générées`, "success");

            updateProgress(profileProgress + 20, `Recherche produits pour ${personne.nom}...`);

            // 4. Recherche Amazon (via Proxy)
            // OPTIMISATION : On cherche TOUS les termes et on garde les meilleurs résultats.
            const allProducts = [];

            // LIMITATION STRICTE : Max 2 recherches Amazon pour économiser l'API
            const searchSuggestions = iaResult.suggestions.slice(0, 2);

            for (const sugg of searchSuggestions) {
                if (!sugg?.term || typeof sugg.term !== 'string') continue;

                log("AMAZON", `Recherche de "${sugg.term}"...`, "warning");

                const maxPrice = personne.budget;
                // MinPrice à 20% du budget pour filtrer sans bloquer les petits budgets
                let minPrice = Math.floor(maxPrice * 0.20);
                // Sécurité : Si minPrice est trop proche du max, on le baisse (RapidAPI n'aime pas min == max)
                if (minPrice >= maxPrice * 0.9) minPrice = 0;

                let rf;
                try {
                    rf = await searchAmazon(sugg.term, maxPrice, minPrice);
                } catch (errApi) {
                    log("ERREUR_API", `Erreur recherche Amazon: ${errApi.message}`, "error");
                    continue;
                }

                const results = rf?.search_results ?? [];
                if (Array.isArray(results) && results.length > 0) {
                    // FILTRE STRICT : Qualité garantie
                    let validProducts = results.filter(item => {
                        const rawVal = item?.price?.value;
                        const val = Number(rawVal);

                        // Nettoyage des données (Ratings/Reviews peuvent être "4,5" ou "1 200" ou "1,200")
                        const ratingRaw = String(item.rating || '0').replace(',', '.');
                        const rating = parseFloat(ratingRaw) || 0;

                        const reviewsRaw = String(item.reviews || item.reviews_count || '0').replace(/[^0-9]/g, ''); // Enlève tout sauf chiffres
                        const reviewCount = parseInt(reviewsRaw, 10) || 0;

                        const priceOk = Number.isFinite(val) && val > 1 && val <= maxPrice;
                        const hasTitle = !!item.title;
                        const goodRating = rating >= 3.5; // On garde 3.5 pour la qualité
                        const hasEnoughReviews = reviewCount >= 5; // On baisse à 5 avis min pour être moins sévère

                        return priceOk && hasTitle && goodRating && hasEnoughReviews;
                    });

                    // FALLBACK NIVEAU 2 : Filtre intermédiaire (note ≥ 3.0, ≥ 1 avis)
                    if (validProducts.length === 0) {
                        log("FALLBACK", `Filtre strict trop restrictif, mode INTERMÉDIAIRE activé`, "warning");
                        validProducts = results.filter(item => {
                            const rawVal = item?.price?.value;
                            const val = Number(rawVal);
                            const ratingRaw = String(item.rating || '0').replace(',', '.');
                            const rating = parseFloat(ratingRaw) || 0;
                            const reviewsRaw = String(item.reviews || item.reviews_count || '0').replace(/[^0-9]/g, '');
                            const reviewCount = parseInt(reviewsRaw, 10) || 0;
                            return Number.isFinite(val) && val > 1 && val <= maxPrice && item.title && rating >= 3.0 && reviewCount >= 1;
                        });
                    }

                    // FALLBACK NIVEAU 3 : Filtre souple (prix + titre uniquement)
                    if (validProducts.length === 0) {
                        log("FALLBACK", `Filtre intermédiaire trop restrictif, mode SOUPLE activé`, "warning");
                        validProducts = results.filter(item => {
                            const rawVal = item?.price?.value;
                            const val = Number(rawVal);
                            return Number.isFinite(val) && val > 1 && val <= maxPrice && item.title;
                        });
                    }

                    // SCORING : On classe les produits pour garder le "Best Match"
                    if (validProducts.length > 0) {
                        const scoredForThisSearch = validProducts.map((item, index) => {
                            const priceValue = Number(item.price?.value) || 0;
                            const rating = Number(item.rating) || 4;
                            const reviewCount = Number(item.reviews || item.reviews_count) || 0;
                            const isPrime = item.is_prime || false;

                            // Formule de score pondérée (Mise à jour v3 - Meilleure utilisation budget)
                            const budgetRatio = priceValue / personne.budget;

                            // Budget Score : On favorise les produits qui utilisent 60-90% du budget
                            // Zone idéale : 60-90% = score max
                            // Zone acceptable : 40-60% ou 90-100% = bon score
                            // Zone basse : 20-40% = score moyen
                            // Zone très basse : <20% = faible score
                            let budgetScore = 0;
                            if (budgetRatio >= 0.60 && budgetRatio <= 0.90) {
                                budgetScore = 1.0; // Zone idéale = score parfait
                            } else if (budgetRatio > 0.90 && budgetRatio <= 1.0) {
                                budgetScore = 0.9; // Proche du max, ok mais moins flexible
                            } else if (budgetRatio >= 0.40 && budgetRatio < 0.60) {
                                budgetScore = 0.6 + (budgetRatio - 0.40) * 2; // 0.6 à 1.0 progressif
                            } else if (budgetRatio >= 0.20 && budgetRatio < 0.40) {
                                budgetScore = 0.3 + (budgetRatio - 0.20) * 1.5; // 0.3 à 0.6 progressif
                            } else if (budgetRatio > 0 && budgetRatio < 0.20) {
                                budgetScore = budgetRatio * 1.5; // Très faible, pénalisé
                            } else {
                                budgetScore = 0; // Trop cher ou invalide
                            }

                            const ratingScore = rating / 5;
                            const popularityScore = Math.min(1, Math.log10(reviewCount + 1) / 3);
                            const primeBonus = isPrime ? 0.1 : 0;

                            // Score final : Budget a maintenant plus de poids (35%)
                            const score = (budgetScore * 0.35) + (ratingScore * 0.35) + (popularityScore * 0.20) + (1 / (index + 1)) * 0.10 + primeBonus;

                            return { ...item, score, budgetRatio, searchTerm: sugg.term, reason: sugg.reason };
                        }).sort((a, b) => b.score - a.score);

                        // DIVERSITÉ STRICTE : On ne garde QUE LE PREMIER (le meilleur) de chaque recherche
                        // Cela garantit 1 cadeau unique par idée de l'IA.
                        allProducts.push(scoredForThisSearch[0]);
                        log("SÉLECTION", `Meilleur produit unique sélectionné pour "${sugg.term}"`, "success");
                    }
                } else {
                    log("VIDE", `Aucun résultat Amazon pour "${sugg.term}"`, "info");
                }
            }

            // 5. Sélection Finale et Diversité
            if (allProducts.length > 0) {
                // RERANKING IA supprimé pour optimisation et préservation searchTerm
                let finalProducts = allProducts;

                // DIVERSITÉ : Garantir 1 produit par terme de recherche pour éviter les doublons
                const usedSearchTerms = new Set();
                const uniqueProducts = [];

                // Fonction de similarité par mots (remplace la comparaison 30 chars)
                function areTitlesSimilar(title1, title2) {
                    if (!title1 || !title2) return false;
                    const words1 = new Set(title1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
                    const words2 = new Set(title2.toLowerCase().split(/\s+/).filter(w => w.length > 2));
                    if (words1.size === 0 || words2.size === 0) return false;
                    const intersection = [...words1].filter(w => words2.has(w));
                    return intersection.length / Math.max(words1.size, words2.size) > 0.7;
                }

                function isDuplicate(product) {
                    return uniqueProducts.some(existing => areTitlesSimilar(existing.title, product.title));
                }

                // 1ère passe : prendre le meilleur de chaque recherche
                for (const product of finalProducts) {
                    const searchTerm = product.searchTerm;
                    if (!usedSearchTerms.has(searchTerm) && !isDuplicate(product)) {
                        usedSearchTerms.add(searchTerm);
                        uniqueProducts.push(product);
                    }
                }

                // 2ème passe : compléter avec des alternatives si besoin (jusqu'à 5 max)
                for (const product of finalProducts) {
                    if (uniqueProducts.length >= 5) break;
                    if (!isDuplicate(product)) {
                        uniqueProducts.push(product);
                    }
                }

                // Stocker les résultats pour ce profil dans notre tableau global
                personResults.push({
                    personne,
                    products: uniqueProducts,
                    currentIndex: 0,
                    viewedIndices: new Set([0]) // Pour tracker ce qu'on a déjà montré (loading effect)
                });

                log("RÉSUMÉ", `${uniqueProducts.length} cadeaux stockés pour ${personne.nom}`, "success");
                processedProfiles++;
            } else {
                // FALLBACK FINAL : Recherche de secours avec termes génériques
                log("FALLBACK_FINAL", `Aucun produit IA trouvé, tentative de secours pour ${personne.nom}`, "warning");
                updateProgress(profileProgress + 30, `Recherche alternative pour ${personne.nom}...`);

                const fallbackTerms = [];
                if (personne.tags.length > 0) {
                    fallbackTerms.push(`cadeau ${personne.tags[0].toLowerCase()} ${personne.sexe === 'Femme' ? 'femme' : personne.sexe === 'Homme' ? 'homme' : ''}`.trim());
                }
                if (personne.age) {
                    const ageRange = personne.age < 18 ? 'adolescent' : personne.age < 30 ? 'jeune adulte' : personne.age < 60 ? 'adulte' : 'senior';
                    fallbackTerms.push(`idée cadeau ${ageRange}`);
                }
                if (fallbackTerms.length === 0) {
                    fallbackTerms.push(`coffret cadeau ${data.contexte || 'anniversaire'}`);
                }

                for (const fbTerm of fallbackTerms.slice(0, 1)) {
                    try {
                        const fbResults = await searchAmazon(fbTerm, personne.budget, Math.floor(personne.budget * 0.10));
                        const fbProducts = (fbResults?.search_results ?? []).filter(item => {
                            const val = Number(item?.price?.value);
                            return Number.isFinite(val) && val > 1 && val <= personne.budget && item.title;
                        });
                        if (fbProducts.length > 0) {
                            const bestFallback = fbProducts[0];
                            bestFallback.searchTerm = fbTerm;
                            bestFallback.reason = `Suggestion alternative pour ${personne.nom}`;
                            bestFallback.score = 0.5;
                            bestFallback.budgetRatio = Number(bestFallback.price?.value) / personne.budget;
                            personResults.push({
                                personne,
                                products: [bestFallback],
                                currentIndex: 0,
                                viewedIndices: new Set([0])
                            });
                            log("FALLBACK_FINAL", `1 produit de secours trouvé via "${fbTerm}"`, "success");
                            processedProfiles++;
                        }
                    } catch (fbErr) {
                        log("FALLBACK_FINAL", `Échec recherche de secours: ${fbErr.message}`, "error");
                    }
                }
            }
        } catch (e) {
            log("ERREUR_CRITIQUE", e.message || String(e), "error");
        }

        if (DEBUG_MODE) console.groupEnd();
    } // Fin boucle profils

    // Fin de l'analyse
    if (loading) loading.style.display = 'none';
    updateProgress(100, 'Analyse terminée !');
    log("FIN", "Analyse terminée. Affichage des résultats.", "success");

    // ============================================
    // AFFICHAGE DES RÉSULTATS (DOM Manipulation)
    // ============================================
    const singleResultContainer = document.getElementById('singleResult');
    const resultNavigation = document.getElementById('resultNavigation');

    /**
     * Affiche tous les résultats (un par personne)
     */
    function displayAllResults() {
        if (personResults.length === 0) {
            singleResultContainer.innerHTML = '<p class="no-results">Aucun résultat trouvé.</p>';
            return;
        }

        // Générer le HTML pour tous les profils
        let html = `<div class="affiliation-disclaimer" style="text-align:center; padding: 10px; margin-bottom: 20px; font-size: 0.85rem; color: #94a3b8; font-style: italic; border-top: 1px solid rgba(255,255,255,0.1); border-bottom: 1px solid rgba(255,255,255,0.1);">
  <i class="fas fa-info-circle"></i> OFFREZ est soutenu par ses utilisateurs. Si vous finalisez un achat via les boutons Amazon ci-dessous, nous pouvons percevoir une commission sans frais supplémentaires pour vous.
</div>
<div class="gifts-grid">`;

        personResults.forEach((pr, personIndex) => {
            const { personne, products, currentIndex } = pr;

            if (products.length === 0) {
                html += `<div class="gift-card-mini no-result"><p>Aucun cadeau trouvé pour ${escapeHtml(personne.nom)}.</p></div>`;
                return;
            }

            // Données produit courant
            const product = products[currentIndex];
            const priceValue = Number(product.price?.value);
            const priceRaw = escapeHtml(product.price?.raw || `${priceValue}€`);
            const pct = Math.round((priceValue / personne.budget) * 100);
            const baseLink = product.link || '#';
            // Ajout du tag affilié + sécurisation URL
            const link = sanitizeUrl(`${baseLink}${baseLink.includes('?') ? '&' : '?'}tag=${AFFILIATE_TAG}`);

            // Sécurisation XSS des données textuelles
            const titleShort = escapeHtml((product.title || 'Produit sans titre').substring(0, 80));
            const imageUrl = escapeHtml(product.image || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Crect fill='%231e293b' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='14'%3ENo Image%3C/text%3E%3C/svg%3E");
            const displayReason = escapeHtml(product.aiReason || product.reason || '');
            const isPrime = product.is_prime || false;
            const safePersonName = escapeHtml(personne.nom);

            // Calcul économies CRO (budget - prix)
            const savings = Math.round(personne.budget - priceValue);
            const savingsDisplay = savings > 0 ? `<span class="savings-badge">💰 ${savings}€ économisés</span>` : '';
            // FIX #11 : Badge "Stock limité" supprimé (était aléatoire et trompeur)

            // Template Card HTML avec CRO
            html += `
                <div class="gift-card" data-person-index="${personIndex}">
                    <div class="gift-image">
                        <img src="${imageUrl}" alt="${titleShort}" loading="lazy">
                        ${product.rating ? `<div class="gift-rating-badge">⭐ ${product.rating}</div>` : ''}
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
                        <a href="${link}" target="_blank" rel="noopener" class="btn-amazon-cta js-track-click js-purchase-btn"
                           data-product="${escapeHtml(product.title)}"
                           data-price="${priceRaw}"
                           data-asin="${escapeHtml(product.asin || '')}"
                           data-recipient="${safePersonName}"
                           data-link="${link}">
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
        });

        html += '</div>';
        singleResultContainer.innerHTML = html;

        // Animation "Gift Reveal" (Peak-End Rule)
        // On applique l'animation uniquement au premier affichage
        setTimeout(() => {
            document.querySelectorAll('.gift-card').forEach((card, i) => {
                setTimeout(() => {
                    card.classList.add('gift-reveal');
                }, i * 150); // Décalage pour effet cascade
            });
        }, 100);

        // Attacher les écouteurs d'événements pour la navigation interne aux cartes
        document.querySelectorAll('.btn-nav-suggestion').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const personIndex = parseInt(e.currentTarget.dataset.person);
                const direction = e.currentTarget.dataset.direction;
                const person = personResults[personIndex];
                const card = document.querySelector(`.gift-card[data-person-index="${personIndex}"]`);
                const loadingOverlay = card?.querySelector('.card-loading-overlay');

                // Calculer le nouvel index
                let newIndex = person.currentIndex;
                if (direction === 'next' && person.currentIndex < person.products.length - 1) {
                    newIndex = person.currentIndex + 1;
                } else if (direction === 'prev' && person.currentIndex > 0) {
                    newIndex = person.currentIndex - 1;
                }

                // Si le nouvel index n'a jamais été vu, petit effet de chargement "Fake AI"
                const isNewDiscovery = !person.viewedIndices.has(newIndex);

                if (isNewDiscovery && loadingOverlay) {
                    loadingOverlay.style.display = 'flex';
                    // Délai aléatoire pour simulation de recherche (800-1500ms)
                    const delay = 800 + Math.random() * 700;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    // Marquer comme découvert
                    person.viewedIndices.add(newIndex);
                }

                // Appliquer le changement
                person.currentIndex = newIndex;

                displayAllResults();
                log("CHANGE", `Suggestion ${direction === 'next' ? 'suivante' : 'précédente'} pour ${person.personne.nom}`, "info");
            });
        });

        // Cacher la navigation globale obsolète
        resultNavigation.style.display = 'none';

        // Mettre à jour le bouton Panier Global
        updateCartButton();
    }

    // ============================================
    // GESTION DU PANIER AMAZON (Multi-Add)
    // ============================================

    function getSelectedProducts() {
        // Récupérer le produit actuellement sélectionné pour chaque profil
        return personResults.map(pr => {
            const product = pr.products[pr.currentIndex];
            return {
                personne: pr.personne.nom,
                product: product,
                asin: extractASIN(product.link)
            };
        }).filter(item => item.asin); // Garder seulement ceux avec ASIN valide
    }

    // Extraction de l'ASIN depuis une URL Amazon
    function extractASIN(url) {
        if (!url) return null;
        // Format supporté: /dp/ASIN/ ou /gp/product/ASIN/
        const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
        return match ? match[1] : null;
    }

    // Génère une URL pour ajouter plusieurs articles au panier en une fois
    function generateCartURL(selectedProducts) {
        const baseURL = 'https://www.amazon.fr/gp/aws/cart/add.html';
        const params = new URLSearchParams();

        selectedProducts.forEach((item, index) => {
            const num = index + 1;
            params.append(`ASIN.${num}`, item.asin);
            params.append(`Quantity.${num}`, '1');
        });

        params.append('tag', AFFILIATE_TAG);

        return `${baseURL}?${params.toString()}`;
    }

    // Affiche le bouton de panier global si des produits sont sélectionnés
    function updateCartButton() {
        const cartContainer = document.getElementById('cartContainer');
        if (!cartContainer) return;

        const selectedProducts = getSelectedProducts();

        if (selectedProducts.length === 0) {
            cartContainer.style.display = 'none';
            return;
        }

        const totalPrice = selectedProducts.reduce((sum, item) => {
            return sum + (Number(item.product?.price?.value) || 0);
        }, 0);

        const cartURL = generateCartURL(selectedProducts);

        cartContainer.innerHTML = `
            <div class="cart-summary">
                <div class="cart-info">
                    <span class="cart-count">${selectedProducts.length} cadeau${selectedProducts.length > 1 ? 'x' : ''} sélectionné${selectedProducts.length > 1 ? 's' : ''}</span>
                    <span class="cart-total">Total: ${totalPrice.toFixed(2)}€</span>
                </div>
                <a href="${cartURL}" target="_blank" rel="noopener noreferrer" class="btn btn-cart">
                    <i class="fas fa-shopping-cart"></i> Ajouter tout au panier Amazon
                </a>
            </div>
        `;
        cartContainer.style.display = 'block';

        log("PANIER", `${selectedProducts.length} produits - Total: ${totalPrice.toFixed(2)}€`, "success");
    }

    // Premier affichage
    displayAllResults();

    // ============================================
    // GESTION EMAIL CAPTURE
    // ============================================
    const emailCapture = document.getElementById('emailCapture');
    const emailForm = document.getElementById('emailForm');
    const emailSuccess = document.getElementById('emailSuccess');

    // MODALE EMAIL TEMPORISÉE (Lead Wall Soft)
    if (personResults.length > 0 && emailCapture) {
        // Timer silencieux pour la modale email

        // 1. Ajout du bouton de fermeture (Pour ne pas piéger l'utilisateur)
        // On vérifie s'il n'existe pas déjà pour éviter les doublons
        if (!emailCapture.querySelector('.btn-close-email')) {
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '<i class="fas fa-times"></i>'; // FontAwesome X
            closeBtn.className = 'btn-close-email';
            closeBtn.setAttribute('aria-label', 'Fermer la fenêtre');
            closeBtn.onclick = () => {
                emailCapture.classList.remove('visible');
                // On laisse le temps à l'animation de fin (500ms) avant de masquer
                setTimeout(() => { emailCapture.style.display = 'none'; }, 500);
            };
            emailCapture.appendChild(closeBtn);
        }

        // 2. Déclenchement retardé (5 secondes)
        // On attend que l'utilisateur soit "accroché" par les résultats
        setTimeout(() => {
            // Le display block est nécessaire car il est hidden par défaut en HTML
            emailCapture.style.display = 'block';

            // Petite astuce technique : on force le navigateur à calculer la taille
            // pour qu'il applique bien la transition CSS d'agrandissement qui suit.
            void emailCapture.offsetWidth;

            // Boum ! Apparition classe visible (Popup effect)
            emailCapture.classList.add('visible');

            log("MARKETING", "Affichage Modale Email (Lead Magnet)", "info");
        }, 5000); // 5000ms = 5 secondes
    }

    if (emailForm) {
        emailForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = emailForm.querySelector('button');
            const originalHtml = btn.innerHTML;

            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;

            const email = document.getElementById('userEmail').value;
            const consent = document.getElementById('emailConsent').checked;

            // Enrichissement Brevo : contexte cadeau actuel
            let prenomCible = null;
            let cadeauChoisi = null;
            if (personResults.length > 0) {
                const firstResult = personResults[0];
                prenomCible = firstResult.personne.nom || null;
                const currentProduct = firstResult.products[firstResult.currentIndex];
                cadeauChoisi = currentProduct?.title || null;
            }

            try {
                const res = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, consent, prenomCible, cadeauChoisi })
                });

                if (res.ok) {
                    emailForm.style.display = 'none';
                    emailSuccess.style.display = 'flex';
                    log("EMAIL", "Inscription réussie", "success");
                    // Confetti ou effet visuel pourrait être ajouté ici
                } else {
                    const err = await res.json();
                    alert("Erreur: " + (err.error || "Impossible d'enregistrer l'email"));
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                }
            } catch (error) {
                // Erreur silencieuse
                alert("Erreur de connexion serveur");
                btn.innerHTML = originalHtml;
                btn.disabled = false;
            }
        });
    }
}

// ============================================
// TRACKING CLICS AMAZON (Global Delegate) + Modal Confirmation
// ============================================
document.addEventListener('click', (e) => {
    // On cible le lien ou ses enfants
    const btn = e.target.closest('.js-track-click');
    if (btn) {
        // PEAK-END RULE: Afficher modal de confirmation avant redirection
        const isPurchaseBtn = btn.classList.contains('js-purchase-btn');

        if (isPurchaseBtn) {
            e.preventDefault(); // On bloque la navigation pour afficher le modal

            const recipientName = btn.dataset.recipient || 'cette personne';
            const productLink = btn.dataset.link || btn.href;

            showPurchaseModal(recipientName, productLink);
        }

        // FIX #4 : try/catch pour éviter un crash si le cookie est corrompu
        let hasConsent = false;
        try {
            const cookieConsent = localStorage.getItem(STORAGE_KEYS.COOKIE_CONSENT);
            hasConsent = cookieConsent && JSON.parse(cookieConsent).accepted === true;
        } catch (e) { }

        if (hasConsent) {
            const data = {
                product: btn.dataset.product || 'Produit Inconnu',
                price: btn.dataset.price || '0',
                asin: btn.dataset.asin || '',
                consent: true
            };

            // Envoi Beacon (Robuste pour les changements de page/onglets)
            if (navigator.sendBeacon) {
                const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
                navigator.sendBeacon('/api/track-click', blob);
            } else {
                // Fallback
                fetch('/api/track-click', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            }
        }
    }
});

/**
 * Modal de confirmation d'achat (Peak-End Rule)
 * Affiche une confirmation positive avant la redirection vers Amazon
 */
function showPurchaseModal(recipientName, productLink) {
    const modal = document.getElementById('purchaseModal');
    const recipientNameEl = document.getElementById('recipientNameModal');
    const countdownEl = document.getElementById('countdownSeconds');
    const skipBtn = document.getElementById('skipCountdown');
    const shareBtn = document.getElementById('shareButton');

    if (!modal) {
        // Fallback si pas de modal: ouvrir directement
        window.open(productLink, '_blank');
        return;
    }

    // Personnaliser avec le prénom du destinataire
    if (recipientNameEl) {
        recipientNameEl.textContent = recipientName;
    }

    // Afficher le modal
    modal.style.display = 'flex';

    // Countdown de 3 secondes
    let countdown = 3;
    if (countdownEl) countdownEl.textContent = countdown;

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdownEl) countdownEl.textContent = countdown;

        if (countdown <= 0) {
            clearInterval(countdownInterval);
            redirectToAmazon(productLink);
        }
    }, 1000);

    // Bouton "Continuer maintenant" (skip countdown)
    if (skipBtn) {
        const skipHandler = () => {
            clearInterval(countdownInterval);
            redirectToAmazon(productLink);
        };
        skipBtn.onclick = skipHandler;
    }

    // Bouton Partage
    if (shareBtn) {
        shareBtn.onclick = () => {
            if (navigator.share) {
                navigator.share({
                    title: 'OFFREZ - Trouvez le cadeau parfait',
                    text: 'J\'ai trouvé des idées de cadeaux géniales avec OFFREZ ! Essaie-le :',
                    url: 'https://offrez.net'
                }).catch(() => { });
            } else {
                // Fallback: copier le lien
                navigator.clipboard.writeText('https://offrez.net').then(() => {
                    shareBtn.innerHTML = '<i class="fas fa-check"></i> Lien copié !';
                    setTimeout(() => {
                        shareBtn.innerHTML = '<i class="fas fa-share-alt"></i> Partager OFFREZ';
                    }, 2000);
                });
            }
        };
    }

    // Clic sur l'overlay ferme le modal et annule la redirection
    const overlay = modal.querySelector('.modal-overlay');
    if (overlay) {
        overlay.onclick = () => {
            clearInterval(countdownInterval);
            modal.style.display = 'none';
        };
    }
}

/**
 * Redirection vers Amazon et fermeture du modal
 */
function redirectToAmazon(link) {
    const modal = document.getElementById('purchaseModal');
    if (modal) modal.style.display = 'none';
    window.open(link, '_blank');
}

// Lancement automatique au chargement du module avec sécurité globale
lancerAnalyse().catch(err => {
    const container = document.querySelector('.analysis-container') || document.body;

    // FIX #3 : Échapper err.message pour éviter les injections XSS
    const safeMsg = String(err.message || 'Erreur inconnue').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const errorHtml = `
        <div style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15, 23, 42, 0.95); z-index:999999; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:2rem;">
            <div style="font-size:3rem; margin-bottom:1rem;">😵</div>
            <h2 style="color:white; margin-bottom:1rem;">Oups ! Un petit souci technique</h2>
            <p style="color:#94a3b8; max-width:500px; margin-bottom:2rem;">
                Désolé, l'analyse a rencontré un imprévu. Cela arrive parfois avec les connexions API.
                <br><br>
                <code style="background:#334155; padding:4px 8px; border-radius:4px; font-size:0.8em;">${safeMsg}</code>
            </p>
            <button onclick="window.location.reload()" class="btn btn-primary" style="padding:1rem 2rem; font-size:1.2rem;">
                <i class="fas fa-sync-alt"></i> Réessayer
            </button>
            <button onclick="window.location.href='config.html'" class="btn btn-secondary" style="margin-top:1rem;">
                Modifier ma recherche
            </button>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = errorHtml;
    document.body.appendChild(div);
});