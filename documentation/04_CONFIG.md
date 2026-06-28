# ⚙️ ÉTAPE 1 : MISSION & BUDGET — `js/config.js`
*Document 4/9 — La logique du formulaire de configuration (141 lignes)*

---

## 1. RÔLE DE CE FICHIER

`config.js` gère le **premier formulaire** du parcours utilisateur (la page `config.html`). C'est un petit fichier (141 lignes) qui fait 3 choses :

1. **Charge** les données précédentes si l'utilisateur revient en arrière.
2. **Réagit** aux interactions (sélection de l'occasion, du budget, etc.).
3. **Sauvegarde** la configuration et redirige vers la page suivante.

---

## 2. EXPLICATION DÉTAILLÉE

### 2.1 Initialisation (Lignes 8-18)

```javascript
document.addEventListener('DOMContentLoaded', () => {
```

**`DOMContentLoaded`** : Cet événement se déclenche quand le navigateur a fini de lire tout le HTML de la page. On attend cet événement pour être sûr que tous les éléments existent avant de les manipuler.

```javascript
const form = document.getElementById('configForm');
const strategyInput = document.getElementById('budgetStrategy');
const nbPeopleInput = document.getElementById('nbPeople');
const budgetAmountInput = document.getElementById('budgetAmount');
const occasionInput = document.getElementById('occasion');
```

On récupère les éléments HTML par leur identifiant (`id`). C'est comme donner un nom à chaque case du formulaire pour pouvoir lire ou modifier son contenu plus tard.

```javascript
const STORAGE_KEY = 'giftConfig';
```

La clé sous laquelle on sauvegarde les données dans le `localStorage`. C'est comme l'étiquette sur un tiroir.

### 2.2 Chargement de la config existante (Lignes 23-68)

```javascript
const loadExistingConfig = () => {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) { return; }
    if (!raw) return;
```

**Pourquoi ?** Si l'utilisateur a déjà rempli l'étape 1 et qu'il revient en arrière (clic sur "Retour"), on recharge ses choix pour ne pas tout ressaisir.

Le `try/catch` protège contre les cas rares où le `localStorage` n'est pas accessible (mode privé sur certains navigateurs).

```javascript
if (parsed.occasion && occasionInput) {
    occasionInput.value = parsed.occasion;
    document.querySelectorAll('.occasion-chip').forEach(chip => {
        chip.classList.toggle('selected', chip.dataset.value === parsed.occasion);
    });
}
```

On met à jour le champ caché `occasion` ET on met visuellement en surbrillance le bon chip. `classList.toggle('selected', condition)` ajoute la classe `selected` si la condition est `true`, sinon la retire.

### 2.3 Anchoring CRO — Chips de budget rapide (Lignes 76-89)

```javascript
document.querySelectorAll('.chip-cro[data-amount]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.chip-cro').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        budgetAmountInput.value = amount;
        budgetAmountInput.dispatchEvent(new Event('input'));
    });
});
```

Les boutons "30€", "50€", "100€", "200€" sont des **suggestions d'ancrage** (technique CRO). Quand on clique dessus :
1. On retire la classe `active` de tous les chips.
2. On ajoute `active` au chip cliqué.
3. On remplit le champ budget avec la valeur.
4. On déclenche l'événement `input` pour que la mise à jour du calcul (dans le script de `config.html`) se fasse automatiquement.

`e.currentTarget` fait référence au bouton qui a reçu le clic (pas son enfant, le bouton lui-même).

### 2.4 Priming saisonnier (Lignes 92-106)

```javascript
const month = new Date().getMonth(); // 0 = Janvier
let defaultOccasion = "Anniversaire";
if (month === 11) defaultOccasion = "Noël";
else if (month === 1) defaultOccasion = "Saint-Valentin";
else if (month === 4) defaultOccasion = "Fête des Mères";
```

**Technique CRO "Priming"** : Si l'utilisateur n'a pas encore rempli le formulaire, on **pré-sélectionne** l'occasion la plus probable selon le mois actuel.
- Décembre → Noël
- Février → Saint-Valentin
- Mai → Fête des Mères
- Reste de l'année → Anniversaire (valeur sûre)

`getMonth()` renvoie 0 pour Janvier, 1 pour Février... 11 pour Décembre.

### 2.5 Soumission du formulaire (Lignes 108-139)

```javascript
form.addEventListener('submit', (event) => {
    event.preventDefault();
```

`event.preventDefault()` empêche le comportement par défaut du formulaire (rechargement de la page). On veut gérer la soumission nous-mêmes avec JavaScript.

```javascript
const config = {
    occasion: String(occasionInput.value),
    nb: safeNb,
    strategy: strategyValue,
    amount: safeAmount
};
localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
window.location.href = 'profils.html';
```

**Ce qui se passe à la soumission :**
1. On récupère toutes les valeurs du formulaire.
2. On les "assainit" (convertir en nombre, vérifier qu'ils sont valides).
3. On crée un objet `config` avec les données nettoyées.
4. On sauvegarde dans le `localStorage` (le "tableau blanc" entre les pages).
5. On redirige vers `profils.html` (l'étape 2).

**Structure des données sauvegardées :**
```json
{
    "occasion": "Anniversaire",
    "nb": 2,
    "strategy": "custom",
    "amount": null
}
```

---

## 3. LES 3 STRATÉGIES DE BUDGET

| Stratégie | ID | Comportement |
|---|---|---|
| **Personnalisé** | `custom` | Chaque profil a son propre budget (rempli à l'étape 2) |
| **Même pour tous** | `same` | Un budget identique pour chaque personne (ex: 50€ par personne) |
| **Global à répartir** | `global` | Un budget total divisé entre tous (ex: 150€ ÷ 3 = 50€ chacun) |

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
