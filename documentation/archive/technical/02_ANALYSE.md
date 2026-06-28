# 🧠 LE CERVEAU — `js/analyse.js`
*Document 2/9 — L'intelligence de l'application (894 lignes)*

---

## 1. RÔLE DE CE FICHIER

`analyse.js` est le **fichier le plus important** et le plus gros du projet (974 lignes). C'est lui qui :
1. Récupère les profils que l'utilisateur a saisis.
2. Construit un "prompt" intelligent pour l'IA (le texte qu'on envoie à Gemini).
3. Reçoit les idées de cadeaux de l'IA.
4. Cherche les vrais produits sur Amazon.
5. Filtre, note et classe les résultats par qualité.
6. Affiche les cartes cadeaux dans la page.
7. Gère le panier, les clics, le partage et la capture d'emails.

**Analogie** : Si OFFREZ était un détective privé, `analyse.js` serait l'enquêteur principal. Il reçoit le dossier du client (profils), demande conseil à un expert (Gemini), mène l'enquête sur le terrain (Amazon), trie les preuves (scoring), et présente ses conclusions (cartes cadeaux).

---

## 2. STRUCTURE GLOBALE

Le fichier est organisé en 6 grandes sections :

```
Lignes 1-73    : Configuration, debug, et outils de log
Lignes 86-94   : Fonction updateProgress (barre de progression)
Lignes 100-422 : Fonction principale lancerAnalyse() — LE CŒUR
Lignes 438-577 : displayAllResults() — Affichage des cartes
Lignes 580-651 : Gestion du panier Amazon multi-produits
Lignes 656-974 : Email capture, modal d'achat, tracking clics
```

---

## 3. EXPLICATION DÉTAILLÉE

### 3.1 L'import des dépendances (Ligne 1-2)

```javascript
import { callGemini, searchAmazon } from './api.js';
import { escapeHtml, sanitizeUrl, truncateText } from './security.js';
```

**`import ... from`** : C'est la syntaxe "ES Modules" pour dire "va chercher ces fonctions dans tel fichier".
- `callGemini` et `searchAmazon` viennent de `api.js` (les fonctions qui parlent au serveur).
- `escapeHtml`, `sanitizeUrl`, `truncateText` viennent de `security.js` (les fonctions de sécurité).

### 3.2 Configuration et Debug (Lignes 15-79)

```javascript
const DEBUG_MODE = false;
const AFFILIATE_TAG = "offreznet-21";
```

- **`DEBUG_MODE`** : À `false` en production. Si on le met à `true`, le site affichera des tonnes d'informations dans la console F12. Utile pour trouver des bugs, inutile pour les visiteurs.
- **`AFFILIATE_TAG`** : Votre identifiant Amazon Partenaire. C'est ce tag qui est ajouté à chaque lien Amazon pour que vous touchiez votre commission. **⚠️ À remplacer par votre vrai tag !**

```javascript
const CONSOLE_STYLES = {
    success: 'background: #166534; color: #4ade80; ...',
    error: 'background: #991b1b; color: #fca5a5; ...',
    // ...
};
```

Des styles CSS pour colorer les messages dans la console F12 (vert pour succès, rouge pour erreur, etc.). Purement cosmétique pour faciliter le débugage.

#### La fonction `log()` (Lignes 35-52)

```javascript
function log(title, message, type = 'info') {
    if (DEBUG_MODE) {
        console.log(`%c[${time}] ${title}`, style, message);
    }
    if (logOutput) {
        // Ajoute aussi le message dans le "terminal visuel" HTML (si présent)
    }
}
```

Fonction de logging centralisée. Elle fait deux choses :
1. Affiche le message dans la console F12 **uniquement en mode debug**.
2. L'ajoute aussi dans un terminal visuel HTML si l'élément `logOutput` existe dans la page.

#### Les helpers de debug (Lignes 55-79)

- **`debugObj(label, obj)`** : Affiche un objet complexe dans la console de manière lisible (en tableau si c'est un tableau, en arborescence si c'est un objet).
- **`traceCall(fnName, args)`** : Affiche le nom de la fonction appelée et ses arguments.

Ces fonctions ne font **rien** en mode production grâce au `if (!DEBUG_MODE) return;`.

### 3.3 La barre de progression (Lignes 86-94)

```javascript
function updateProgress(percent, message) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const statusMessage = document.getElementById('statusMessage');

    if (progressBar) progressBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (progressText) progressText.textContent = `${Math.round(percent)}% - ${message}`;
    if (statusMessage) statusMessage.textContent = message;
}
```

**Que fait cette fonction ?** Elle met à jour 3 éléments visuels dans la page :
1. La **largeur** de la barre de progression (en pourcentage).
2. Le **texte** sous la barre ("42% - Analyse psychologique de Julie...").
3. Le **message de statut** ("Analyse de vos profils en cours...").

`Math.min(100, Math.max(0, percent))` s'assure que le pourcentage reste entre 0 et 100.

---

### 3.4 LA FONCTION PRINCIPALE : `lancerAnalyse()` (Lignes 100-422)

C'est le **cœur battant** du projet. Voici son déroulement pas à pas :

#### Étape A : Récupération des données (Lignes 104-128)

```javascript
const raw = localStorage.getItem('finalData');
```

On récupère les données du `localStorage`. Ces données ont été sauvegardées par `profils.js` à l'étape précédente. Elles contiennent l'occasion et la liste des profils.

```javascript
let data;
try {
    data = JSON.parse(raw);
} catch (e) {
    log("ERROR", "Données finales corrompues", "error");
    return;
}
```

On **parse** (transforme) la chaîne de texte JSON en objet JavaScript. Si les données sont corrompues → on s'arrête proprement.

```javascript
if (!data?.equipe || !Array.isArray(data.equipe) || data.equipe.length === 0) {
    log("ERROR", "Aucune équipe valide", "error");
    return;
}
```

Vérification que les données contiennent bien un tableau `equipe` avec au moins un profil.

#### Étape B : Boucle sur chaque profil (Lignes 144-422)

```javascript
for (const personneBrute of data.equipe) {
```

On **boucle** sur chaque personne de l'équipe. Si l'utilisateur a créé 3 profils (Julie, Marc, Sophie), cette boucle s'exécute 3 fois.

##### Normalisation du profil (Lignes 158-165)

```javascript
const personne = {
    nom: String(personneBrute.nom || "Anonyme"),
    sexe: String(personneBrute.sexe || "Non précisé"),
    age: personneBrute.age ?? null,
    budget: budgetNum,
    tags: Array.isArray(personneBrute.tags) ? personneBrute.tags : [],
    details: personneBrute.details || {}
};
```

On crée un objet **propre** avec des valeurs par défaut. C'est une protection : si l'utilisateur n'a pas rempli un champ, on utilise une valeur de secours au lieu de crasher.

- `??` : Opérateur "nullish coalescing" = "utilise la valeur de droite si celle de gauche est `null` ou `undefined`".
- `||` : Opérateur "ou logique" = "utilise la valeur de droite si celle de gauche est 'falsy' " (false, 0, "", null, undefined).

##### Construction du Prompt IA (Lignes 177-245) — LE TEXTE MAGIQUE

C'est peut-être la partie la plus intéressante. On construit un texte très précis pour que l'IA comprenne exactement ce qu'elle doit faire :

```javascript
const prompt = `
# RÔLE
Tu es OFFREZ, un expert en recommandation de cadeaux avec 15 ans d'expérience...

# MISSION CRITIQUE
Trouver 2 idées de cadeaux PARFAITES pour ${personne.nom}...

# CONTEXTE
- **Occasion** : ${data.contexte}
- **Budget MAXIMUM** : ${personne.budget}€
- **Centres d'intérêt** : ${personne.tags.join(', ')}

⛔ LISTE NOIRE
${personne.details?.eviter || 'Rien de spécifié'}

# FORMAT DE SORTIE (JSON STRICT)
{
  "suggestions": [
    { "term": "...", "reason": "...", "prix_estime": "XX€" },
    { "term": "...", "reason": "...", "prix_estime": "XX€" }
  ]
}
`;
```

**Pourquoi le prompt est si long et détaillé ?**

Le prompt utilise des techniques de **Prompt Engineering** :
1. **Rôle** : On dit à l'IA QUI elle est (expert en cadeaux). Ça oriente sa manière de répondre.
2. **Mission** : On est très précis sur ce qu'on attend (2 idées, pas 5, pas 10).
3. **Budget** : On insiste sur la limite maximale avec le mot "INTERDIT".
4. **Liste noire** : On utilise des emojis ⛔ pour que l'IA comprenne l'importance d'exclure certains produits.
5. **Chain of Thought** : On demande à l'IA de "réfléchir silencieusement" avant de répondre. Cela améliore la qualité des réponses.
6. **Format strict** : On impose un format JSON précis pour pouvoir parser la réponse automatiquement.
7. **Anti-hallucination** : On rappelle à l'IA de ne proposer que des produits réels.

**Les variables dynamiques** (avec `${ }`) insèrent les données du profil dans le prompt. Exemple : si `personne.nom` = "Julie", le texte dira "Trouver 2 idées pour Julie".

##### Détection spéciale anti-tech (Lignes 202-205)

```javascript
${personne.details?.eviter?.toLowerCase().includes('technologie') ? `
⚠️ ATTENTION SPÉCIALE : Cette personne n'aime PAS la technologie !
INTERDIT de proposer : souris, clavier, écran...
` : ''}
```

Si l'utilisateur a écrit "technologie" ou "tech" dans la case "À éviter", on ajoute un **paragraphe entier** pour insister auprès de l'IA. C'est une protection supplémentaire parce que l'IA avait tendance à proposer des gadgets tech même quand on lui disait de ne pas le faire.

L'opérateur `? :` est un **ternaire** : `condition ? siVrai : siFaux`.

##### Labor Illusion (Lignes 251-256)

```javascript
updateProgress(profileProgress + 5, `Analyse psychologique de ${personne.nom}...`);
await new Promise(r => setTimeout(r, 800));
```

**"Labor Illusion"** est un concept de psychologie : les gens font plus confiance à un résultat qui a "pris du temps" qu'à un résultat instantané. Même si l'IA répond en 1 seconde, on ajoute un **délai artificiel de 800ms** avec des messages comme "Analyse psychologique..." pour donner l'impression d'un travail approfondi.

`await new Promise(r => setTimeout(r, 800))` = "attends 800ms puis continue".

##### Appel Gemini et recherche Amazon (Lignes 257-370)

```javascript
const iaResult = await callGemini(prompt);
```

On envoie le prompt à l'IA via `api.js` et on récupère les suggestions.

```javascript
const searchSuggestions = iaResult.suggestions.slice(0, 2);
```

On limite à **2 recherches Amazon maximum** par profil pour économiser les crédits API. `slice(0, 2)` prend les 2 premiers éléments du tableau.

##### Le filtre qualité strict (Lignes 291-318)

```javascript
let validProducts = results.filter(item => {
    const priceOk = val > 1 && val <= maxPrice;
    const hasTitle = !!item.title;
    const goodRating = rating >= 3.5;
    const hasEnoughReviews = reviewCount >= 5;
    return priceOk && hasTitle && goodRating && hasEnoughReviews;
});
```

**4 critères stricts** pour garder uniquement les bons produits :
1. **Prix** : Supérieur à 1€ (pour exclure les accessoires ridicules) ET inférieur au budget.
2. **Titre** : Le produit doit avoir un titre (certains résultats sont vides).
3. **Note** : Au moins 3.5 étoiles sur 5.
4. **Avis** : Au moins 5 avis clients (pour éviter les produits sans retour d'expérience).

`!!item.title` convertit `item.title` en booléen (`true` si le titre existe et n'est pas vide, `false` sinon).

##### Le fallback souple (Lignes 312-319)

```javascript
if (validProducts.length === 0) {
    validProducts = results.filter(item => {
        return val > 1 && val <= maxPrice && item.title;
    });
}
```

Si le filtre strict ne laisse passer **aucun** produit, on relâche les critères : on garde juste prix + titre, sans exiger de note minimum ni d'avis. C'est mieux d'afficher un produit moyen que rien du tout.

##### Le système de scoring (Lignes 321-360) — L'ALGORITHME DE TRI

Chaque produit reçoit un **score** calculé sur 5 critères :

**1. Budget Score (35% du score final)**
```javascript
if (budgetRatio >= 0.60 && budgetRatio <= 0.90) {
    budgetScore = 1.0; // Zone idéale
} else if (budgetRatio > 0.90 && budgetRatio <= 1.0) {
    budgetScore = 0.9; // Proche du max, ok
}
// etc.
```

On favorise les produits qui utilisent **60 à 90%** du budget. Pourquoi ?
- Un cadeau à 10€ pour un budget de 100€ paraît cheap.
- Un cadeau à 98€ pour un budget de 100€ est bon mais ne laisse pas de marge.
- Un cadeau à 75€ pour un budget de 100€ est le "sweet spot" : il paraît généreux sans être trop cher.

Le `budgetRatio` = prix du produit ÷ budget. Exemple : produit à 75€, budget 100€ → ratio = 0.75 → dans la zone idéale → score = 1.0.

**2. Rating Score (35%)**
```javascript
const ratingScore = rating / 5;
```
Note du produit divisée par 5. Un produit noté 4.5/5 → score = 0.9.

**3. Popularity Score (20%)**
```javascript
const popularityScore = Math.min(1, Math.log10(reviewCount + 1) / 3);
```
Score basé sur le nombre d'avis, avec une **échelle logarithmique**. Ça signifie que la différence entre 0 et 100 avis compte plus que la différence entre 1000 et 10 000 avis. `Math.log10(101) / 3 ≈ 0.67`.

**4. Position Score (10%)**
```javascript
(1 / (index + 1)) * 0.10
```
Le premier résultat Amazon est légèrement favorisé (il est souvent le plus pertinent).

**5. Prime Bonus**
```javascript
const primeBonus = isPrime ? 0.1 : 0;
```
Un petit bonus de 0.1 pour les produits Prime (livraison gratuite et rapide).

**Score final** = (budget × 35%) + (rating × 35%) + (popularité × 20%) + (position × 10%) + prime bonus.

Les produits sont ensuite **triés par score décroissant** : le meilleur en premier.

##### Diversité : 1 produit par recherche (Lignes 362-401)

```javascript
// 1ère passe : prendre le meilleur de chaque recherche
for (const product of finalProducts) {
    if (!usedSearchTerms.has(searchTerm) && !displayedTitles.has(titleKey)) {
        uniqueProducts.push(product);
    }
}
```

On s'assure que le résultat final est **diversifié** :
- On ne prend qu'**un produit par terme de recherche** (si l'IA a suggéré "montre homme" et "livre cuisine", on prend le meilleur de chaque).
- On vérifie que les titres ne sont pas trop similaires (dé-doublonnage par similarité de mots via la fonction `areTitlesSimilar`).

---

### 3.5 Affichage des résultats : `displayAllResults()` (Lignes 438-577)

Cette fonction génère le **HTML** des cartes cadeaux. Elle est appelée au premier affichage et à chaque changement de suggestion.

#### Construction d'une carte cadeau (Lignes 476-519)

```javascript
html += `
    <div class="gift-card" data-person-index="${personIndex}">
        <div class="gift-image">
            <img src="${imageUrl}" alt="${titleShort}" loading="lazy">
            ${product.rating ? `<div class="gift-rating-badge">⭐ ${product.rating}</div>` : ''}
            ${stockUrgency}
        </div>
        <div class="gift-content">
            <div class="gift-owner">🎁 ${safePersonName}</div>
            <h4 class="gift-title">${titleShort}...</h4>
            <div class="gift-price-row">
                <span class="gift-price">${priceRaw}</span>
                ${savingsDisplay}
            </div>
            <p class="gift-reason">${displayReason.substring(0, 100)}...</p>
            <a href="${link}" class="btn-amazon-cta">
                <i class="fab fa-amazon"></i> Voir sur Amazon
            </a>
        </div>
    </div>
`;
```

Chaque carte contient :
- **Image** du produit (chargée en lazy = seulement quand visible).
- **Badge note** (étoile + nombre).
- **Badge "Stock limité"** (affiché aléatoirement 1 fois sur 2, technique FOMO).
- **Nom** du bénéficiaire ("🎁 Julie").
- **Titre** du produit (tronqué à 80 caractères).
- **Prix** + **économies** ("💰 25€ économisés" si le prix est sous le budget).
- **Raison IA** (pourquoi ce cadeau est adapté).
- **Bouton Amazon** avec lien affilié.
- **Navigation** (flèches gauche/droite si plusieurs suggestions).

#### L'animation "Gift Reveal" (Lignes 527-533)

```javascript
setTimeout(() => {
    document.querySelectorAll('.gift-card').forEach((card, i) => {
        setTimeout(() => {
            card.classList.add('gift-reveal');
        }, i * 150);
    });
}, 100);
```

Les cartes apparaissent avec un **effet cascade** : la première après 100ms, la deuxième 150ms plus tard, etc. C'est un effet "Peak-End Rule" — la fin de l'expérience est mémorable.

#### Navigation entre suggestions (Lignes 536-570)

```javascript
btn.addEventListener('click', async (e) => {
    const isNewDiscovery = !person.viewedIndices.has(newIndex);
    if (isNewDiscovery && loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        const delay = 800 + Math.random() * 700;
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    person.currentIndex = newIndex;
    displayAllResults();
});
```

Quand l'utilisateur clique sur une flèche :
1. Si c'est une suggestion **jamais vue** → petit effet de chargement "Fake AI" (800-1500ms) pour donner l'impression que le système recalcule.
2. On change l'index courant.
3. On re-dessine TOUTES les cartes (c'est une approche simple mais efficace).

---

### 3.6 Gestion du panier Amazon (Lignes 580-651)

```javascript
function generateCartURL(selectedProducts) {
    const baseURL = 'https://www.amazon.fr/gp/aws/cart/add.html';
    const params = new URLSearchParams();
    selectedProducts.forEach((item, index) => {
        params.append(`ASIN.${index + 1}`, item.asin);
        params.append(`Quantity.${index + 1}`, '1');
    });
    params.append('tag', AFFILIATE_TAG);
    return `${baseURL}?${params.toString()}`;
}
```

**Cette fonction crée un lien unique** qui ajoute TOUS les cadeaux sélectionnés au panier Amazon en un seul clic. Le format `ASIN.1`, `ASIN.2` est le format officiel d'Amazon pour l'ajout groupé.

**ASIN** = Amazon Standard Identification Number, c'est l'identifiant unique de chaque produit sur Amazon (ex: `B08N5WRWNW`).

```javascript
function extractASIN(url) {
    const match = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    return match ? match[1] : null;
}
```

Extrait l'ASIN d'une URL Amazon. Exemples :
- `https://amazon.fr/dp/B08N5WRWNW/...` → `B08N5WRWNW`
- `https://amazon.fr/gp/product/B08N5WRWNW/...` → `B08N5WRWNW`

La regex `\/(?:dp|gp\/product)\/([A-Z0-9]{10})` cherche `/dp/` ou `/gp/product/` suivi de 10 caractères alphanumériques.

---

### 3.7 Capture email (Lignes 656-736)

```javascript
setTimeout(() => {
    emailCapture.style.display = 'block';
    void emailCapture.offsetWidth; // Force recalcul layout
    emailCapture.classList.add('visible');
}, 5000);
```

La modale email apparaît **5 secondes** après l'affichage des résultats. Pourquoi 5s ? L'utilisateur a eu le temps de voir les résultats et d'être "accroché" — il sera plus enclin à laisser son email.

`void emailCapture.offsetWidth` : Astuce technique. On force le navigateur à recalculer la taille de l'élément avant d'ajouter la classe d'animation. Sans ça, l'animation CSS d'apparition ne se jouerait pas.

---

### 3.8 Tracking clics et modal d'achat (Lignes 742-894)

#### Tracking par délégation d'événement (Lignes 742-777)

```javascript
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.js-track-click');
    if (btn) { ... }
});
```

Au lieu d'ajouter un écouteur sur chaque bouton Amazon individuellement, on en met **un seul** sur tout le document. Quand un clic se produit, on vérifie si l'élément cliqué (ou un de ses parents) a la classe `js-track-click`. C'est la technique de **"Event Delegation"** — plus performant et fonctionne même sur des éléments ajoutés dynamiquement.

```javascript
if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    navigator.sendBeacon('/api/track-click', blob);
}
```

**`sendBeacon`** : Une méthode spéciale qui envoie des données au serveur de manière **non-bloquante**. Même si l'utilisateur ferme l'onglet ou change de page, le tracking sera envoyé. C'est plus fiable que `fetch` pour le tracking.

#### Modal de confirmation (Lignes 783-856)

```javascript
function showPurchaseModal(recipientName, productLink) {
    // Countdown de 3 secondes avant redirection Amazon
    let countdown = 3;
    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            redirectToAmazon(productLink);
        }
    }, 1000);
}
```

**"Peak-End Rule"** : Les gens se souviennent surtout de la FIN d'une expérience. Cette modale crée un **moment positif** ("Excellent choix ! 🎉 Vous allez offrir un cadeau inoubliable") avec un compte à rebours de 3 secondes avant de rediriger vers Amazon. L'utilisateur peut aussi cliquer pour sauter le countdown.

#### Gestion des erreurs globales (Lignes 867-894)

```javascript
lancerAnalyse().catch(err => {
    // Affiche une modale d'erreur plein écran
    const errorHtml = `
        <div style="position:fixed; ...">
            <h2>Oups ! Un petit souci technique</h2>
            <code>${err.message}</code>
            <button onclick="window.location.reload()">Réessayer</button>
        </div>
    `;
});
```

Si `lancerAnalyse()` échoue complètement (crash), au lieu de laisser l'utilisateur face à une page blanche, on affiche une **modale d'erreur conviviale** avec un bouton "Réessayer" et un bouton "Modifier ma recherche".

---

## 4. CE QU'ON PEUT MODIFIER FACILEMENT

| Modification | Variable/Ligne | Valeur actuelle |
|---|---|---|
| Passer en mode debug | `DEBUG_MODE` (ligne 18) | `false` |
| Changer le tag affilié | `AFFILIATE_TAG` (ligne 19) | `"offreznet-21"` |
| Nombre de suggestions IA | `slice(0, 2)` (ligne 267) | 2 |
| Note minimum | `rating >= 3.5` (ligne 304) | 3.5 |
| Avis minimum | `reviewCount >= 5` (ligne 305) | 5 |
| Zone idéale budget | `0.60` et `0.90` (ligne 338) | 60%-90% |
| Délai modale email | `5000` (ligne 696) | 5 secondes |
| Durée fake loading | `800` (ligne 253) | 800ms |
| Personnalité de l'IA | Texte du prompt (lignes 181-245) | Expert cadeau |
| Poids du scoring | Coefficients (ligne 357) | 35/35/20/10 |

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
