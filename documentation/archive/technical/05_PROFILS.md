# 👥 ÉTAPE 2 : PROFILS — `js/profils.js`
*Document 5/9 — La gestion des formulaires de profils bénéficiaires (245 lignes)*

---

## 1. RÔLE DE CE FICHIER

`profils.js` gère la **deuxième étape** du parcours : la page où l'utilisateur décrit chaque personne à qui il veut offrir un cadeau. Ce fichier :

1. **Lit** la configuration sauvegardée par `config.js` (étape 1).
2. **Génère** dynamiquement autant de formulaires que de profils demandés.
3. **Pré-remplit** les budgets selon la stratégie choisie.
4. **Valide** les données avant de passer à l'analyse.
5. **Sauvegarde** les profils et redirige vers la page d'analyse.

---

## 2. EXPLICATION DÉTAILLÉE

### 2.1 La liste des centres d'intérêt (Lignes 8-24)

```javascript
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
```

C'est la **source de vérité** pour les tags d'intérêt. Chaque intérêt a un nom (`value`) et un emoji. On peut facilement en ajouter ou en retirer en modifiant ce tableau.

**Pour ajouter un centre d'intérêt**, il suffit d'ajouter une ligne. Exemple :
```javascript
{ value: "Animaux", emoji: "🐾" },
```

### 2.2 Fonction `createProfileCard()` (Lignes 31-89)

C'est la fonction qui **crée** physiquement une carte de profil dans la page.

```javascript
function createProfileCard(index, defaultBudget = "", budgetReadonly = false) {
    const template = document.getElementById('profileTemplate');
    const clone = template.content.cloneNode(true);
```

**Comment ça marche ?**
1. On récupère le `<template>` HTML (un modèle invisible défini dans `profils.html`).
2. On le **clone** (copie intégrale). Le `true` dans `cloneNode(true)` signifie "copie aussi tous les enfants".
3. On personnalise le clone.
4. On l'ajoute à la page.

C'est comme avoir un patron de couture et faire plusieurs vêtements à partir du même patron.

```javascript
card.querySelector('.profile-title').textContent = `Bénéficiaire #${index + 1}`;
```

On numéro le profil (Bénéficiaire #1, #2, etc.). `index + 1` parce que les index commencent à 0 en programmation.

```javascript
if (defaultBudget) { budgetInput.value = defaultBudget; }
if (budgetReadonly) {
    budgetInput.readOnly = true;
    budgetInput.classList.add('readonly');
}
```

- Si un budget par défaut est fourni (stratégie "same" ou "global"), on pré-remplit le champ.
- Si le budget est en **lecture seule** (l'utilisateur l'a déjà défini à l'étape 1), on bloque la modification.

#### Génération des tags d'intérêt (Lignes 53-65)

```javascript
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
```

Pour chaque intérêt du tableau, on crée :
- Un **`<label>`** (étiquette cliquable).
- Un **checkbox** caché (`<input type="checkbox">`).
- Un visuel avec emoji + texte.

Le checkbox est caché par CSS, et le style du chip change quand il est coché (sélectionné). L'utilisateur ne voit que les jolis chips, pas les checkboxes.

#### Gestion du genre (Lignes 68-76)

```javascript
genderChips.forEach(chip => {
    chip.addEventListener('click', () => {
        genderChips.forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        genderInput.value = chip.dataset.value;
    });
});
```

Les boutons "👩 Femme" et "👨 Homme" fonctionnent comme un sélecteur exclusif (un seul actif à la fois). Au clic :
1. On retire la classe `selected` de TOUS les chips.
2. On l'ajoute au chip cliqué.
3. On met à jour le champ caché avec la valeur ("Homme" ou "Femme").

#### Bouton de suppression (Lignes 79-86)

```javascript
deleteBtn.onclick = () => {
    if (document.querySelectorAll('.profile-card').length > 1) {
        card.remove();
        renumberProfiles();
    }
};
```

Permet de supprimer un profil, **mais pas le dernier** (il doit rester au moins 1 profil). Après suppression, on renumérote les profils restants.

### 2.3 Initialisation au chargement (Lignes 100-127)

```javascript
const rawConfig = localStorage.getItem('giftConfig');
if (!rawConfig) {
    window.location.href = 'config.html';
    return;
}
```

**Protection** : Si l'utilisateur arrive directement sur la page profils sans passer par l'étape 1, on le redirige vers `config.html`. Sans config, impossible de savoir combien de profils créer.

```javascript
// Calcul du budget selon la stratégie
if (currentConfig.strategy === 'global' && currentConfig.amount) {
    budgetPerPerson = Math.floor(currentConfig.amount / currentConfig.nb);
    budgetReadonly = true;
} else if (currentConfig.strategy === 'same' && currentConfig.amount) {
    budgetPerPerson = currentConfig.amount;
    budgetReadonly = true;
}
```

Selon la stratégie choisie à l'étape 1 :
- **`global`** : Budget total ÷ nombre de personnes. Ex: 150€ ÷ 3 = 50€ par personne. `Math.floor()` arrondit vers le bas.
- **`same`** : Même budget pour tout le monde (celui défini à l'étape 1).
- **`custom`** : Pas de pré-remplissage, l'utilisateur saisit un budget différent par profil.

```javascript
for (let i = 0; i < currentConfig.nb; i++) {
    createProfileCard(i, budgetPerPerson ? String(budgetPerPerson) : "", budgetReadonly);
}
```

On crée autant de cartes que le nombre de profils défini à l'étape 1.

### 2.4 Validation et lancement (Lignes 163-222)

```javascript
launchAnalysisBtn.onclick = () => {
    const cards = document.querySelectorAll('.profile-card');
    const errors = [];

    const equipe = Array.from(cards).map((card, index) => {
```

Au clic sur "Lancer l'analyse", on parcourt **toutes les cartes profil** et on extrait les données de chaque formulaire.

```javascript
const name = nameRaw ? nameRaw.trim() : "Anonyme";
if (name.length > 50) errors.push(`Nom trop long pour le profil #${index + 1}`);
```

Validations :
- Si le nom est vide, on met "Anonyme".
- Si le nom dépasse 50 caractères, erreur.

```javascript
const safeAge = Number.isFinite(ageNum) && ageNum > 0 && ageNum < 120 ? ageNum : null;
const safeBudget = Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : 0;
```

Validation de l'âge (entre 1 et 120) et du budget (positif). Les valeurs invalides sont remplacées par `null` (âge) ou `0` (budget).

```javascript
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
```

**Structure de données finale pour chaque profil :**
```json
{
    "nom": "Julie",
    "sexe": "Femme",
    "age": 28,
    "budget": 50,
    "tags": ["Lecture", "Voyage", "Nature"],
    "details": {
        "adore": "Fan de Harry Potter, adore le thé vert",
        "eviter": "Pas de bijoux, pas de parfum"
    }
}
```

- `.p-tag:checked` : Sélectionne uniquement les checkboxes **cochés** (les intérêts sélectionnés).
- `.slice(0, 200)` : Tronque les textes à 200 caractères maximum (protection contre les textes trop longs).

```javascript
localStorage.setItem('finalData', JSON.stringify({
    contexte: currentConfig.occasion,
    equipe
}));
window.location.href = 'analyse.html';
```

**Sauvegarde finale :** On sauvegarde le tout dans `localStorage["finalData"]` et on redirige vers `analyse.html` (l'étape 3).

### 2.5 Récapitulatif visuel (Lignes 228-245)

```javascript
function displayConfigSummary() {
    let summaryText = `🎁 Occasion : <strong>${currentConfig.occasion}</strong>`;
    if (currentConfig.strategy === 'global') {
        summaryText += ` • 📊 Budget total : <strong>${currentConfig.amount}€</strong> à répartir`;
    }
    summaryContainer.innerHTML = summaryText;
}
```

Affiche un bandeau récapitulatif en haut de la page : "🎁 Occasion : Anniversaire • ✏️ Budget personnalisé par profil". C'est un rappel visuel pour l'utilisateur.

---

## 3. CE QU'ON PEUT MODIFIER FACILEMENT

| Modification | Où | Comment |
|---|---|---|
| Ajouter un centre d'intérêt | Tableau `interets` (ligne 8) | Ajouter `{ value: "...", emoji: "..." }` |
| Supprimer un centre d'intérêt | Tableau `interets` | Supprimer la ligne correspondante |
| Changer la longueur max du nom | `name.length > 50` (ligne 171) | Changer `50` |
| Changer l'âge max | `ageNum < 120` (ligne 182) | Changer `120` |
| Changer la troncature des textes | `.slice(0, 200)` (lignes 196-197) | Changer `200` |

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
