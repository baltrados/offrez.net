# 🔬 PIPELINE DE TRAITEMENT — ANALYSE COMPLÈTE ET CRITIQUE
*Document 10/9 — Du clic utilisateur jusqu'à la carte cadeau*

---

## SOMMAIRE

1. [Le pipeline complet (vue séquentielle)](#1-le-pipeline-complet)
2. [Phase 1 : Construction du prompt IA](#2-phase-1--construction-du-prompt)
3. [Phase 2 : Appel Gemini et parsing du JSON](#3-phase-2--appel-gemini-et-parsing)
4. [Phase 3 : Recherche Amazon](#4-phase-3--recherche-amazon)
5. [Phase 4 : Filtrage et scoring](#5-phase-4--filtrage-et-scoring)
6. [Phase 5 : Sélection finale et diversité](#6-phase-5--sélection-finale)
7. [Analyse critique : Forces du système](#7-forces-du-système)
8. [Analyse critique : Faiblesses et limites](#8-faiblesses-et-limites)
9. [Axes d'amélioration classés par priorité](#9-axes-damélioration)
10. [Scénarios de casse (Edge Cases)](#10-scénarios-de-casse)
11. [Benchmarks et métriques estimées](#11-benchmarks-et-métriques)

---

## 1. LE PIPELINE COMPLET

### Vue séquentielle (ce qui se passe quand l'utilisateur clique « Lancer l'analyse »)

```
ÉTAPE    DURÉE     ACTION                              FICHIER          RISQUE
─────────────────────────────────────────────────────────────────────────────────
 1       ~0ms      Lecture localStorage (finalData)     analyse.js       Faible
 2       ~0ms      Validation profils (nom, budget)     analyse.js       Faible
 ─── BOUCLE SUR CHAQUE PROFIL ────────────────────────────────────────────────
 3       ~0ms      Construction du prompt texte         analyse.js       Nul
 4       800ms     Labor Illusion (délai artificiel)    analyse.js       Nul
 5       1-5s      Envoi prompt → serveur → Gemini      api.js→server.js Moyen
 6       ~0ms      Parsing JSON de la réponse IA        api.js           Élevé
 7       1-3s      Recherche Amazon (terme 1/2)         api.js→server.js Moyen
 8       1-3s      Recherche Amazon (terme 2/2)         api.js→server.js Moyen
 9       ~0ms      Filtrage qualité (strict + souple)   analyse.js       Faible
 10      ~0ms      Scoring pondéré + tri                analyse.js       Nul
 11      ~0ms      Déduplication et diversité           analyse.js       Faible
 ─── FIN DE BOUCLE ───────────────────────────────────────────────────────────
 12      ~0ms      Génération HTML des cartes           analyse.js       Nul
 13      100ms+    Animation cascade                    analyse.js       Nul
```

**Durée totale estimée** : 4-12 secondes par profil (selon la réponse IA et le cache Amazon).

### Flux de données (format JSON à chaque étape)

```
localStorage                  Gemini API                    Amazon API
     │                            │                              │
     ▼                            ▼                              ▼
{ "contexte": "Noël",       { "suggestions": [           { "search_results": [
  "equipe": [                  { "term": "coffret         { "title": "Coffret
    { "nom": "Julie",            whisky",                    Whisky Glenfiddich",
      "budget": 50,              "reason": "Fan de          "price": { "value":
      "tags": ["Cuisine"],       spiritueux...",               39.99 },
      "details": {               "prix_estime": "45€"       "rating": "4.5",
        "adore": "...",        }                             "reviews": 892,
        "eviter": "..."       ]                              "asin": "B09XY..."
      }                     }                              }
    }                                                    ]
  ]                                                    }
}
```

---

## 2. PHASE 1 — CONSTRUCTION DU PROMPT

### 2.1 Le prompt disséqué

Le prompt envoyé à Gemini fait environ **1 500 à 2 000 caractères** et contient 7 sections :

| Section | Rôle | Efficacité |
|---|---|---|
| `# RÔLE` | Donne une identité à l'IA ("expert 15 ans") | ⭐⭐⭐⭐ Excellent — force un registre professionnel |
| `# FRAÎCHEUR` | Rappelle l'année en cours | ⭐⭐⭐ Bon — évite les suggestions obsolètes |
| `# MISSION CRITIQUE` | Demande exactement 2 suggestions | ⭐⭐⭐⭐⭐ Crucial — cadre le scope |
| `# CONTEXTE` | Variables dynamiques (occasion, budget, tags) | ⭐⭐⭐⭐ Bon — personnalise la réponse |
| `⛔ LISTE NOIRE` | Ce qu'il ne faut pas proposer | ⭐⭐⭐ Moyen — l'IA ne respecte pas toujours |
| `# Chain of Thought` | Demande à l'IA de réfléchir en 5 étapes | ⭐⭐⭐⭐ Bon — améliore la qualité |
| `# FORMAT JSON` | Impose un format de sortie strict | ⭐⭐⭐⭐ Bon — mais nécessite un parsing robuste |
| `# ANTI-HALLUCINATION` | Rappelle de ne proposer que des produits réels | ⭐⭐ Faible — l'IA hallucine quand même |

### 2.2 Variables injectées dans le prompt

```javascript
personne.nom           → "Julie"
sexeLabel              → "une femme" (calculé depuis personne.sexe)
ageLabel               → "de 28 ans" (calculé depuis personne.age)
data.contexte          → "Noël" (l'occasion choisie à l'étape 1)
personne.budget        → 50 (le budget maximum en euros)
personne.tags.join()   → "Cuisine, Voyage, Nature"
personne.details.adore → "Fan de Harry Potter, adore le thé vert"
personne.details.eviter → "Pas de bijoux, pas de parfum"
new Date().getFullYear() → 2026
```

### 2.3 Le mécanisme anti-tech

Si le texte "technologie" ou "tech" apparaît dans la liste noire, un paragraphe supplémentaire est ajouté avec une liste exhaustive de produits interdits. C'est une **bonne pratique** : l'IA respecte mieux une liste explicite qu'une règle vague.

**Constat actuel** : Ce mécanisme n'existe que pour "technologie". Les autres catégories problématiques (bijoux, vêtements sur Amazon = risque taille) n'ont pas de traitement spécial.

---

## 3. PHASE 2 — APPEL GEMINI ET PARSING

### 3.1 Chemin réseau complet

```
analyse.js → callGemini(prompt)
  → fetch('/api/analyze', POST, {prompt})     [navigateur → serveur local]
    → server.js reçoit la requête
      → Vérifie le rate limit (20/min)
      → Vérifie que la clé API existe
      → fetch('googleapis.com/v1beta/...')     [serveur → Google]
        → Gemini génère la réponse
      ← Réponse JSON brute de Google
    ← server.js renvoie data au navigateur
  ← api.js reçoit le JSON
    → Extraction : data.candidates[0].content.parts[0].text
    → Parsing JSON (3 tentatives)
  ← Retourne l'objet { suggestions: [...] }
← analyse.js a les suggestions
```

### 3.2 Le parsing robuste en 3 tentatives

C'est l'une des parties les plus critiques. L'IA ne renvoie pas toujours du JSON propre.

**Tentative 1 — Parsing direct :**
```
Entrée IA :  {"suggestions": [{"term": "montre"}]}
Résultat  :  ✅ SUCCESS — JSON.parse() fonctionne directement
Fréquence :  ~70% des cas avec Gemini 2.0 Flash
```

**Tentative 2 — Extraction regex :**
```
Entrée IA :  Voici mes suggestions :
             {"suggestions": [{"term": "montre"}]}
             J'espère que ça aide !
Résultat  :  ✅ SUCCESS — Regex /\{[\s\S]*\}/ extrait le bloc JSON
Fréquence :  ~25% des cas
```

**Tentative 3 — Nettoyage markdown :**
````
Entrée IA :  ```json
             {"suggestions": [{"term": "montre"}]}
             ```
Résultat  :  ✅ SUCCESS — On retire les balises markdown
Fréquence :  ~4% des cas
````

**Échec total :**
```
Entrée IA :  Je pense que pour Julie, une bonne idée serait
             une montre et un livre de cuisine. Elle adorerait !
Résultat  :  ❌ ERREUR — Aucun JSON trouvable
Fréquence :  ~1% des cas
```

### 3.3 Vérification de structure

Après le parsing, le code vérifie que :
- L'objet parsé existe (`!parsed`) → sinon erreur
- Il contient un champ `suggestions` qui est un tableau (`Array.isArray`) → sinon erreur

**Ce qui n'est PAS vérifié :**
- Que chaque suggestion a un champ `term` (vérifié plus tard, ligne 270)
- Que chaque suggestion a un champ `reason` (pas vérifié → risque d'afficher `undefined`)
- Que `prix_estime` est un nombre valide (pas utilisé dans la logique, juste affiché)

---

## 4. PHASE 3 — RECHERCHE AMAZON

### 4.1 Paramètres de la recherche

Pour chaque suggestion de l'IA, une recherche Amazon est lancée avec :

```
terme    = suggestion.term            (ex: "coffret whisky dégustation")
maxPrice = personne.budget            (ex: 50)
minPrice = Math.floor(budget * 0.20)  (ex: 10)
```

**Le minPrice dynamique (20% du budget)** est une bonne idée :
- Budget 50€ → min 10€ (exclut les produits < 10€, trop cheap pour un cadeau)
- Budget 200€ → min 40€ (exclut les accessoires insignifiants)
- Budget 20€ → min 4€ (reste large pour les petits budgets)

**Protection** : Si `minPrice >= maxPrice * 0.9`, il est ramené à 0 (pour éviter que RapidAPI refuse une fourchette trop étroite).

### 4.2 Chemin réseau Amazon

```
analyse.js → searchAmazon(term, budget, minPrice)
  → fetch('/api/search?term=...&min_price=...&max_price=...')
    → server.js reçoit la requête
      → Vérifie le rate limit (40/min)
      → Vérifie le cache (clé = "terme|min|max")
        → SI CACHE HIT : Réponse instantanée et GRATUITE
        → SI CACHE MISS :
          → fetch('real-time-amazon-data.p.rapidapi.com/search?...')
          → Normalisation des données
          → Stockage en cache (TTL 24h)
      ← Réponse normalisée
    ← api.js reçoit les résultats
  ← analyse.js a les produits
```

### 4.3 Normalisation des données Amazon (côté serveur)

Le serveur transforme la structure complexe de RapidAPI en un format simplifié :

```
Donnée RapidAPI                      →  Donnée normalisée
─────────────────────────────────────────────────────────
product_title                        →  title
product_url                          →  link
product_photo                        →  image
product_price ("29,99 €")            →  price.value (29.99)
product_price                        →  price.raw ("29,99 €")
product_star_rating                  →  rating
product_num_ratings                  →  reviews
asin                                 →  asin
is_prime                             →  is_prime
```

**⚠️ Point sensible** : Le parsing du prix `"29,99 €"` se fait par regex :
1. `replace(/[^0-9.,]/g, '')` → retire tout sauf chiffres, virgules et points → `"29,99"`
2. `replace(',', '.')` → remplace la virgule décimale par un point → `"29.99"`
3. `parseFloat(...)` → convertit en nombre → `29.99`

**Faille potentielle** : Un prix comme `"1.299,00 €"` (1 299€) donnerait `"1.299.00"` après transformation, et `parseFloat("1.299.00")` = `1.299` au lieu de `1299`. Ce cas est rare pour les budgets ciblés (< 200€ typiquement), mais c'est une faille réelle pour les gros budgets.

---

## 5. PHASE 4 — FILTRAGE ET SCORING

### 5.1 Le filtre strict (1ère passe)

Les produits doivent satisfaire **4 critères simultanés** :

| Critère | Condition | Justification |
|---|---|---|
| Prix valide | `> 1€ ET ≤ budget` | Exclut les accessoires à 0,99€ et les dépassements |
| Titre existant | `!!item.title` | Exclut les résultats vides/corrompus |
| Note ≥ 3.5/5 | `rating >= 3.5` | Garantit un minimum de qualité perçue |
| ≥ 5 avis | `reviewCount >= 5` | Évite les produits sans retour d'expérience |

### 5.2 Le fallback souple (si 0 résultats)

Si le filtre strict est trop restrictif :
- On garde seulement **prix + titre** (sans exigence de note ni d'avis).
- C'est "mieux qu'afficher rien", mais la qualité n'est plus garantie.

### 5.3 L'algorithme de scoring (formule détaillée)

```
Score = (BudgetScore × 0.35) + (RatingScore × 0.35) + (PopularityScore × 0.20)
      + (PositionScore × 0.10) + PrimeBonus
```

#### BudgetScore (35% du total)

```
Ratio = prix_produit ÷ budget_max

Si ratio ∈ [0.60, 0.90] → BudgetScore = 1.0    (ZONE IDÉALE)
Si ratio ∈ (0.90, 1.00] → BudgetScore = 0.9    (Proche du max)
Si ratio ∈ [0.40, 0.60) → BudgetScore = 0.6 à 1.0 (progressif)
Si ratio ∈ [0.20, 0.40) → BudgetScore = 0.3 à 0.6 (progressif)
Si ratio ∈ (0.00, 0.20) → BudgetScore = 0 à 0.3 (pénalisé)
Si ratio = 0 ou > 1     → BudgetScore = 0      (invalide)
```

**Exemple concret** (budget 100€) :

| Produit | Prix | Ratio | BudgetScore | Interprétation |
|---|---|---|---|---|
| Montre A | 75€ | 0.75 | 1.0 | 🟢 Zone idéale |
| Montre B | 95€ | 0.95 | 0.9 | 🟡 Bon mais tendu |
| Montre C | 45€ | 0.45 | 0.7 | 🟡 Un peu cheap |
| Montre D | 15€ | 0.15 | 0.23 | 🔴 Trop cheap |
| Montre E | 110€ | 1.10 | 0 | ⛔ Hors budget (filtré avant) |

#### RatingScore (35%)
```
RatingScore = note ÷ 5
```
Exemple : Note 4.5/5 → Score = 0.90.

#### PopularityScore (20%)
```
PopularityScore = min(1, log10(nb_avis + 1) ÷ 3)
```

| Nb avis | Calcul | Score | Interprétation |
|---|---|---|---|
| 0 | log10(1)/3 = 0 | 0.00 | Aucune popularité |
| 10 | log10(11)/3 | 0.35 | Faible |
| 100 | log10(101)/3 | 0.67 | Correct |
| 1 000 | log10(1001)/3 | 1.00 | Populaire (plafonné) |
| 10 000 | log10(10001)/3 | 1.00 | (plafonné à 1.0) |

L'échelle logarithmique est un bon choix : la différence entre 0 et 100 avis est beaucoup plus significative qu'entre 5 000 et 10 000.

#### PositionScore (10%)
```
PositionScore = (1 ÷ (index + 1)) × 0.10
```
Le premier résultat Amazon vaut 0.10, le deuxième 0.05, etc. Léger bonus pour le classement Amazon natif.

#### PrimeBonus (+0.1 si Prime)
Bonus fixe de +0.1 pour les produits Amazon Prime.

### 5.4 Exemple de scoring complet

Budget 80€, recherche "coffret thé japonais" :

| Produit | Prix | Note | Avis | Prime | Index | Score final |
|---|---|---|---|---|---|---|
| Coffret Matcha Premium | 68€ | 4.7 | 450 | ✅ | 0 | **0.35 + 0.33 + 0.18 + 0.10 + 0.10 = 1.06** |
| Coffret Thé Bio | 42€ | 4.3 | 120 | ❌ | 1 | 0.25 + 0.30 + 0.14 + 0.05 + 0.00 = 0.74 |
| Service à Thé Céramique | 72€ | 4.8 | 2000 | ✅ | 2 | 0.35 + 0.34 + 0.20 + 0.03 + 0.10 = 1.02 |

→ Le Coffret Matcha Premium gagne (meilleure combinaison prix/qualité/position).

---

## 6. PHASE 5 — SÉLECTION FINALE

### 6.1 Logique de déduplication

Après le scoring, le code fait **2 passes** :

**1ère passe — 1 produit unique par terme de recherche :**
```
Si l'IA a suggéré ["coffret thé", "livre cuisine"]
→ On prend le #1 scoré du "coffret thé" + le #1 scoré du "livre cuisine"
→ On vérifie aussi que les titres ne sont pas trop similaires
   (comparaison des 30 premiers caractères en minuscules)
```

**2ème passe — Compléter avec des alternatives (max 5) :**
```
S'il reste de la place (< 5 produits), on ajoute d'autres produits
à condition que leurs titres soient suffisamment différents.
```

### 6.2 Structure finale stockée

```javascript
personResults.push({
    personne: { nom, sexe, age, budget, tags, details },
    products: [
        { title, link, image, price, rating, reviews, asin,
          score, budgetRatio, searchTerm, reason },
        // ... jusqu'à 5 produits
    ],
    currentIndex: 0,                // Le produit actuellement affiché
    viewedIndices: new Set([0])     // Les indices déjà vus (pour l'animation)
});
```

---

## 7. FORCES DU SYSTÈME

### ✅ Ce qui est bien pensé

| Aspect | Détail | Note |
|---|---|---|
| **Parsing robuste** | 3 niveaux de fallback pour le JSON IA | ⭐⭐⭐⭐⭐ |
| **Cache serveur** | 24h, économise 50-80% des appels Amazon | ⭐⭐⭐⭐⭐ |
| **Budget Score graduel** | Zone idéale 60-90%, pas un filtre binaire | ⭐⭐⭐⭐ |
| **Fallback souple** | Si filtres stricts = 0 résultats, on relâche | ⭐⭐⭐⭐ |
| **Popularité log** | Échelle logarithmique = pondération réaliste | ⭐⭐⭐⭐ |
| **Prompt structuré** | Rôle + Chain of Thought + format strict | ⭐⭐⭐⭐ |
| **Timeouts** | 15s sur chaque appel API, AbortController | ⭐⭐⭐⭐ |
| **MinPrice dynamique** | 20% du budget = adapté à chaque cas | ⭐⭐⭐⭐ |
| **Rate limiting** | 40/min Amazon + 20/min Gemini | ⭐⭐⭐⭐ |
| **Labor Illusion** | 800ms de faux délai = confiance accrue | ⭐⭐⭐ |
| **Déduplication** | Par similarité sémantique de mots | ⭐⭐⭐⭐ |
| **Parsing prix** | Robuste face aux montants > 999€ | ⭐⭐⭐⭐ |
| **Filtre Fallback** | 3 niveaux : strict, moyen, souple | ⭐⭐⭐⭐ |

---

## 8. FAIBLESSES ET LIMITES

### 🔴 Problèmes critiques

**1. L'IA hallucine des termes de recherche inadaptés**
- Gemini peut proposer des termes trop spécifiques ("Coffret dégustation gin artisanal London"), qui ne correspondent à aucun produit Amazon.
- Ou trop vagues ("cadeau femme") qui renvoient des résultats génériques.
- **Impact** : 0 résultats Amazon pour ce terme → 1 recherche gaspillée sur 2.
- **Fréquence estimée** : 15-25% des termes.

**2. Le champ `reason` n'est pas vérifié après le parsing**
- Si l'IA oublie le champ `reason`, le code ne plante pas mais affiche `undefined` dans la carte cadeau.
- **Impact** : Expérience utilisateur dégradée (texte "undefined" visible).

**3. Pas de retry en cas d'échec Gemini**
- Si l'appel IA échoue (timeout, erreur 500, blocage sécurité), le profil est simplement ignoré.
- L'utilisateur ne sait pas que le profil a été sauté.
- **Impact** : Un profil sur 3 ou 4 peut donner 0 résultats sans explication.

### 🟡 Problèmes modérés

**4. Seulement 2 recherches Amazon par profil**
- L'IA génère 2 termes, mais si les 2 donnent 0 résultats → aucun cadeau pour ce profil.
- Pas de mécanisme de "recherche de secours" avec des termes génériques.

**5. Le scoring ne tient pas compte de la pertinence sémantique**
- Un produit bien noté et bien pricé mais totalement hors sujet peut scorer plus haut qu'un produit parfaitement adapté mais avec moins d'avis.
- Le `reason` de l'IA n'est pas exploité pour le scoring.

**6. Pas de gestion de la pagination Amazon**
- L'API ne demande que `page=1` (les 10-20 premiers résultats).
- Les meilleurs produits peuvent être en page 2 ou 3.

**7. Les données `rating` et `reviews` de RapidAPI sont parfois des strings**
- `"4,5"` (virgule française) pour rating → correctement géré (`replace(',', '.')`)
- `"1 200"` (espace comme séparateur de milliers) pour reviews → correctement géré (`replace(/[^0-9]/g, '')`)
- Mais `null` ou `undefined` → converti en `0`, ce qui pénalise le produit.

---

## 9. AXES D'AMÉLIORATION

### 🔥 Priorité haute (impact immédiat sur la qualité)

**A. Ajouter un système de retry pour Gemini**
```javascript
// Pseudo-code
let iaResult = null;
for (let attempt = 0; attempt < 2; attempt++) {
    try {
        iaResult = await callGemini(prompt);
        if (iaResult?.suggestions?.length > 0) break;
    } catch (e) {
        if (attempt === 0) await new Promise(r => setTimeout(r, 1000));
    }
}
```
- **Effort** : Faible (~15 lignes)
- **Impact** : Réduit les échecs de 15% à ~2%
- **Coût** : Quelques appels Gemini en plus (gratuit dans le quota)

**B. Ajouter des termes de recherche de secours**
```javascript
// Si l'IA donne 0 résultat, on génère des termes génériques
if (allProducts.length === 0) {
    const fallbackTerms = generateFallbackTerms(personne);
    // Ex: "cadeau femme 30 ans", "idée cadeau cuisine"
    for (const term of fallbackTerms) {
        const results = await searchAmazon(term, budget);
        // ...
    }
}
```
- **Effort** : Moyen (~30 lignes)
- **Impact** : Élimine quasi totalement les "0 résultats"
- **Coût** : 1-2 appels Amazon supplémentaires (cachés si déjà en cache)

**C. Valider la structure complète de la réponse IA**
```javascript
// Après le parsing JSON
parsed.suggestions = parsed.suggestions.filter(s =>
    s && typeof s.term === 'string' && s.term.length >= 2
);
// Ajouter un reason par défaut si manquant
parsed.suggestions.forEach(s => {
    if (!s.reason) s.reason = "Sélectionné pour correspondre à vos critères";
});
```
- **Effort** : Très faible (~5 lignes)
- **Impact** : Élimine les `undefined` dans l'UI

### 💡 Priorité basse (optimisations futures)

**G. Multi-page Amazon**
- Demander les pages 1 et 2 pour avoir plus de choix.
- **Attention** : double le coût API.

**H. Scoring sémantique**
- Utiliser un 2ème appel IA léger pour scorer la pertinence de chaque produit par rapport au profil.
- **Attention** : ajoute 1-2s de latence + coûts Gemini.

**I. Feedback loop utilisateur**
- Permettre à l'utilisateur de noter les suggestions ("👍 Pertinent" / "👎 Pas adapté").
- Stocker ces feedbacks pour améliorer les prompts futurs.

**J. Prompt adaptatif par occasion**
- Un prompt différent pour Noël (insister sur l'emballage, les éditions limitées) vs. Anniversaire (plus personnel).

---

## 10. SCÉNARIOS DE CASSE (EDGE CASES)

| Scénario | Que se passe-t-il ? | Résultat |
|---|---|---|
| Budget = 1€ | minPrice = 0€, l'IA proposera quand même des produits | Probablement 0 résultats |
| Budget = 10 000€ | Fonctionne, mais le parsing prix > 999€ est buggé | Résultats incorrects possibles |
| Nom avec HTML : `<script>alert(1)</script>` | `escapeHtml()` neutralise l'injection | ✅ Sécurisé |
| Tags vides (aucun intérêt) | Le prompt dit "propose des cadeaux universels" | ✅ Géré |
| IA renvoie 0 suggestions | Le tableau `suggestions` est vide, boucle sautée | 0 résultats silencieux |
| IA renvoie 10 suggestions | `slice(0, 2)` ne garde que les 2 premières | ✅ Maîtrisé |
| Amazon renvoie 0 produits | Log "Aucun résultat" et continue | ❌ Pas de fallback |
| Amazon timeout (15s) | AbortController annule, erreur catchée | Le terme est sauté |
| Gemini bloqué (sécurité) | Erreur "Contenu bloqué par Gemini: SAFETY" | Le profil est ignoré |
| 2 profils avec le même nom | Pas de problème, chaque profil est traité indépendamment | ✅ OK |
| Caractères spéciaux dans le terme | `encodeURIComponent` sur le serveur | ✅ Sécurisé |
| localStorage corrompu | `try/catch` sur `JSON.parse` → erreur gérée | Le process s'arrête proprement |
| Navigateur en mode privé (Safari) | `localStorage` peut échouer sur Safari iOS | ⚠️ Pas de protection |

---

## 11. COÛTS RÉELS DE CHAQUE ACTION

### 11.1 Tarifs officiels des APIs (vérifiés février 2026)

#### Google Gemini 2.0 Flash

| | Gratuit (Free Tier) | Payant |
|---|---|---|
| **Limite** | 1 500 requêtes/jour, 1M tokens/min | Illimité |
| **Input** | $0.00 | **$0.10 / million de tokens** |
| **Output** | $0.00 | **$0.40 / million de tokens** |
| **Contexte max** | 1 000 000 tokens | Idem |

> **Qu'est-ce qu'un token ?** C'est un bout de mot. En moyenne, 1 token ≈ 4 caractères en anglais, ~3 caractères en français (le français est plus "coûteux" en tokens car les mots sont plus longs et les accents comptent).

#### RapidAPI Real-Time Amazon Data (par OpenWeb Ninja)

| Plan | Prix/mois | Requêtes incluses | Coût par requête supplémentaire |
|---|---|---|---|
| **Basic (Gratuit)** | $0 | 100/mois | Impossible (bloqué) |
| **Pro** | $20/mois | 10 000/mois | $0.003/requête |
| **Ultra** | $75/mois | 50 000/mois | $0.003/requête |
| **Mega** | $150/mois | 200 000/mois | ~$0.002/requête |

#### Amazon Partenaires France (commissions)

| Catégorie de produit | Taux de commission |
|---|---|
| Jeux Amazon | **20%** |
| Beauté Luxe, Amazon Explore | **10%** |
| Amazon Haul | **7%** |
| Montres | **6,5%** |
| Musique, Articles Faits Main, Vidéos | **5%** |
| Livres, Cuisine, Automobile | **4,5%** |
| Mode, Bijoux, Chaussures, Bagages | **4%** |
| Jouets, Maison, Jardin, Sports, Bébé | **3%** |
| PC, Composants, DVD/Blu-Ray | **2,5%** |
| Télévisions, Jeux vidéo digitaux | **2%** |
| Épicerie, Santé, Jeux vidéo physiques | **1%** |
| Cartes cadeaux, Alcool | **0%** |

**Cookie de tracking** : 24 heures. L'utilisateur doit acheter dans les 24h suivant le clic pour que la commission soit créditée.

---

### 11.2 Coût réel de chaque action du pipeline

Voici le **coût au centime** de chaque étape pour **1 visiteur avec 2 profils** :

```
PIPELINE POUR 1 VISITEUR (2 profils, budget moyen 60€)
═══════════════════════════════════════════════════════════════════════

ÉTAPE                              TOKENS         COÛT GRATUIT    COÛT PAYANT
──────────────────────────────────────────────────────────────────────────────

1. Lecture localStorage              —             0.000€          0.000€
2. Validation profils                —             0.000€          0.000€

── PROFIL 1 ───────────────────────────────────────────────────────────

3. Construction prompt               —             0.000€          0.000€
4. Labor Illusion (800ms)            —             0.000€          0.000€
5. Appel Gemini (prompt)     ~600 input tokens     0.000€          0.000005€
   Réponse Gemini            ~200 output tokens    0.000€          0.000007€
6. Parsing JSON                      —             0.000€          0.000€
7. Recherche Amazon #1               —             0.000€          0.0015-0.003€
8. Recherche Amazon #2               —             0.000€          0.0015-0.003€
9. Filtrage/Scoring                  —             0.000€          0.000€

── PROFIL 2 ───────────────────────────────────────────────────────────

   (Même cycle → mêmes coûts)

── FIN ────────────────────────────────────────────────────────────────

10. Affichage HTML                   —             0.000€          0.000€
11. Animation                        —             0.000€          0.000€

═══════════════════════════════════════════════════════════════════════
TOTAL PAR VISITEUR (2 profils)                     0.000€         ~0.006-0.012€
     dont Gemini                                   0.000€         ~0.000024€
     dont Amazon RapidAPI                          0.000€         ~0.006-0.012€
```

> [!IMPORTANT]
> **Le coût Gemini est négligeable** (~0.002 centimes par visiteur en payant). C'est RapidAPI Amazon qui représente **99.8% du coût variable**.

---

### 11.3 Détail du calcul des tokens Gemini

#### Prompt (Input tokens) — ce qu'on envoie à l'IA

Le prompt fait environ **1 500 à 2 000 caractères** en français. En comptant la tokenisation :

```
Section du prompt                    Caractères    Tokens estimés
─────────────────────────────────────────────────────────────────
# RÔLE (texte fixe)                 ~200           ~65
# FRAÎCHEUR (texte fixe)            ~150           ~50
# MISSION (avec variables)          ~100           ~35
# CONTEXTE (variables utilisateur)  ~200           ~70
⛔ LISTE NOIRE (variable)           ~100           ~35
# Chain of Thought (fixe)           ~250           ~80
# RÈGLES (fixe)                     ~300           ~100
# FORMAT JSON (fixe)                ~200           ~65
# ANTI-HALLUCINATION (fixe)         ~200           ~65
─────────────────────────────────────────────────────────────────
TOTAL INPUT                         ~1 700         ~565 tokens
```

**Coût input** = 565 tokens × ($0.10 / 1 000 000) = **$0.0000565** = 0.005 centimes

#### Réponse (Output tokens) — ce que l'IA renvoie

La réponse attendue est un JSON compact :
```json
{
  "suggestions": [
    { "term": "coffret thé japonais", "reason": "Passionnée de cuisine et de voyage, ce coffret alliera...", "prix_estime": "35€" },
    { "term": "carnet voyage cuir", "reason": "Son amour du voyage mérite un carnet premium...", "prix_estime": "25€" }
  ]
}
```

Environ **~150-250 caractères** → **~60-100 tokens**.

**Coût output** = 80 tokens × ($0.40 / 1 000 000) = **$0.000032** = 0.003 centimes

#### Total Gemini par appel = ~0.008 centimes = quasi gratuit

---

### 11.4 Impact du cache serveur sur les coûts Amazon

Le cache serveur (24h, `Map()` en mémoire) réduit considérablement les appels réels à RapidAPI.

```
Scénario              Visiteurs/jour    Requêtes Amazon brutes    Taux de cache    Requêtes réelles
────────────────────────────────────────────────────────────────────────────────────────────────────
Lancement             10/jour           ~40                       ~10%             ~36
Croissance            100/jour          ~400                      ~40%             ~240
Traction              500/jour          ~2 000                    ~55%             ~900
Objectif              1 000/jour        ~4 000                    ~65%             ~1 400
Succès                5 000/jour        ~20 000                   ~75%             ~5 000
```

**Pourquoi le taux de cache augmente avec le volume ?** Plus il y a de visiteurs, plus les mêmes termes reviennent ("cadeau femme 30 ans", "coffret whisky", "livre cuisine"...). Les recherches populaires sont servies gratuitement depuis le cache.

---

### 11.5 Simulations de coût mensuel (30 jours)

#### Scénario A : Phase de test (10 visiteurs/jour)

| Poste | Calcul | Coût mensuel |
|---|---|---|
| Gemini | 20 appels/jour × 30 = 600 → **Gratuit** (quota: 1 500/jour) | **0.00€** |
| RapidAPI | ~36 requêtes/jour → **100 gratuites/mois suffisent presque** | **0.00€** (plan Basic) |
| Serveur | PC local ou Cloudflare Tunnel | **0.00€** |
| **TOTAL** | | **0.00€** 🎉 |

#### Scénario B : Premiers vrais visiteurs (100/jour)

| Poste | Calcul | Coût mensuel |
|---|---|---|
| Gemini | 200 appels/jour → **Gratuit** | **0.00€** |
| RapidAPI | ~240 requêtes/jour × 30 = **7 200/mois** → Plan Pro (10K) | **$20 (~18.50€)** |
| Serveur | VPS entrée de gamme (Hetzner, OVH) | **~5€** |
| **TOTAL** | | **~23.50€/mois** |

#### Scénario C : Traction (500/jour)

| Poste | Calcul | Coût mensuel |
|---|---|---|
| Gemini | 1 000 appels/jour → **Gratuit** (limite 1 500/jour) | **0.00€** |
| RapidAPI | ~900 requêtes/jour × 30 = **27 000/mois** → Plan Ultra (50K) | **$75 (~69€)** |
| Serveur | VPS correct (4 Go RAM) | **~10€** |
| **TOTAL** | | **~79€/mois** |

#### Scénario D : Objectif (1 000/jour)

| Poste | Calcul | Coût mensuel |
|---|---|---|
| Gemini | 2 000 appels/jour → ⚠️ **DÉPASSE le quota gratuit** (1 500/jour) | **~$0.84/mois** (~0.78€) |
| RapidAPI | ~1 400 requêtes/jour × 30 = **42 000/mois** → Plan Ultra (50K) | **$75 (~69€)** |
| Serveur | VPS robuste (8 Go RAM) | **~15€** |
| **TOTAL** | | **~85€/mois** |

> [!TIP]
> Même en dépassant le quota gratuit Gemini, les coûts restent **dérisoires** (~$0.84/mois pour 60 000 appels). Le vrai poste de dépense est toujours RapidAPI Amazon.

#### Scénario E : Succès (5 000/jour)

| Poste | Calcul | Coût mensuel |
|---|---|---|
| Gemini | 10 000 appels/jour → payant | **~$4.20/mois (~3.90€)** |
| RapidAPI | ~5 000 requêtes/jour × 30 = **150 000/mois** → Plan Mega (200K) | **$150 (~139€)** |
| Serveur | VPS dédié (16 Go RAM) | **~30€** |
| **TOTAL** | | **~173€/mois** |

---

### 11.6 Revenus estimés (Retour sur investissement)

#### Hypothèses

- **Panier moyen Amazon** : 45€ (cohérent avec un budget cadeau de 30-100€)
- **Taux de commission moyen** : 3.5% (moyenne pondérée des catégories cadeaux)
- **CTR** (taux de clic vers Amazon) : 35%
- **Taux de conversion Amazon** : 8% (moyen pour le trafic affilié qualifié)
- **Durée cookie** : 24h

```
Commission par vente = 45€ × 3.5% = 1.575€ (~1.58€)
```

#### Simulations de revenus

| Scénario | Visiteurs/jour | Clics Amazon | Achats (8%) | Revenus/jour | Revenus/mois | Coût/mois | **Bénéfice** |
|---|---|---|---|---|---|---|---|
| Test | 10 | ~3.5 | ~0.3 | ~0.47€ | ~14€ | 0€ | **+14€** |
| Premiers | 100 | ~35 | ~2.8 | ~4.42€ | ~133€ | 24€ | **+109€** |
| Traction | 500 | ~175 | ~14 | ~22.12€ | ~664€ | 79€ | **+585€** |
| Objectif | 1 000 | ~350 | ~28 | ~44.24€ | ~1 327€ | 85€ | **+1 242€** |
| Succès | 5 000 | ~1 750 | ~140 | ~221.20€ | ~6 636€ | 173€ | **+6 463€** |

> [!NOTE]
> Ces estimations sont optimistes mais réalistes pour un trafic **qualifié** (l'utilisateur cherche activement un cadeau à acheter). Le taux de conversion de 8% est cohérent avec un site de recommandation à forte intention d'achat.

---

### 11.7 Coût par clic (CPC) et rentabilité

| Métrique | Calcul | Résultat |
|---|---|---|
| **Coût par visiteur** | 85€ ÷ 30 000 visiteurs/mois | **0.0028€** |
| **Coût par clic Amazon** | 85€ ÷ 10 500 clics | **0.0081€** |
| **Revenu par clic Amazon** | 1 327€ ÷ 10 500 clics | **0.126€** |
| **ROAS** (Return on Ad Spend) | 1 327€ ÷ 85€ | **15.6x** |
| **Marge brute** | (1 327 - 85) ÷ 1 327 | **93.6%** |

---

### 11.8 Seuil de rentabilité

Le plan **Pro RapidAPI** ($20/mois = 18.50€) est le premier coût incompressible. Avec les hypothèses ci-dessus :

```
Seuil de rentabilité = 18.50€ ÷ 1.58€ par vente = ~12 ventes/mois
12 ventes ÷ 8% conversion = ~150 clics Amazon nécessaires
150 clics ÷ 35% CTR = ~429 visiteurs/mois → ~14 visiteurs/jour
```

> [!IMPORTANT]
> **Le seuil de rentabilité est à ~14 visiteurs/jour.** En dessous, le site coûte plus qu'il ne rapporte. Au-dessus, chaque visiteur supplémentaire génère du profit quasi pur (les coûts marginaux sont minimes grâce au cache).

---

### 11.9 Résumé visuel : où part l'argent ?

```
À 1 000 visiteurs/jour (85€/mois de coûts) :

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   RapidAPI Amazon  ████████████████████████████████  81%     │
│   Serveur VPS      █████████                        18%     │
│   Gemini API       ▏                                 1%     │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Répartition des revenus (1 327€/mois) :

┌──────────────────────────────────────────────────────────────┐
│                                                              │
│   Bénéfice net     ████████████████████████████████████ 94%  │
│   RapidAPI         ████                                  5%  │
│   Serveur + Gemini █                                     1%  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

### 11.10 Recommandations d'optimisation des coûts

| Action | Économie | Effort | Impact qualité |
|---|---|---|---|
| **Implémenter un cache Gemini** (mêmes profils type = même réponse) | -30-50% appels Gemini | Moyen | Aucun |
| **Augmenter le TTL cache Amazon** de 24h à 48h | -20% appels RapidAPI | 1 ligne | Léger (données moins fraîches) |
| **Réduire à 1 suggestion IA** au lieu de 2 | -50% appels Amazon | 1 ligne | Modéré (moins de choix) |
| **Passer au plan Mega RapidAPI** à partir de 1 000 req/jour | -50% coût/requête | Configuration | Aucun |
| **Limiter à 3 profils max** par session | Plafonner les abus | 1 ligne | Modéré |

---

*Document mis à jour le 28/02/2026 — OFFREZ Documentation v2.0*

