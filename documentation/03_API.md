# 📡 LE SERVICE API — `js/api.js`
*Document 3/9 — La communication avec le serveur (247 lignes)*

---

## 1. RÔLE DE CE FICHIER

`api.js` est le **facteur** du projet. Il contient exactement 2 fonctions qui envoient des requêtes au serveur backend :

1. **`callGemini(prompt)`** → Envoie le texte à l'IA et récupère les suggestions.
2. **`searchAmazon(term, budget, minPrice)`** → Cherche des produits Amazon et récupère les résultats.

Le navigateur ne parle **jamais** directement à Google ou Amazon. Il passe toujours par notre serveur (`server.js`) qui lui sert de proxy. Ce fichier est la couche qui gère cette communication.

**Analogie** : Si le projet était un restaurant, `api.js` serait le serveur (le garçon de café) qui fait les allers-retours entre la salle (le navigateur) et la cuisine (le backend).

---

## 2. EXPLICATION DÉTAILLÉE

### 2.1 Configuration et outils de debug (Lignes 1-31)

```javascript
const API_DEBUG = false;
```
Mode debug désactivé en production. Passer à `true` pour voir les détails de chaque appel API dans la console F12.

```javascript
const API_BASE = window.location.origin;
```
`window.location.origin` renvoie l'URL de base du site actuel. Exemples :
- En local : `http://localhost:3000`
- En production : `https://offrez.net`

Cela permet au code de fonctionner **partout** sans modification.

### 2.2 Fonction `callGemini(prompt)` (Lignes 38-178)

#### Signature

```javascript
export async function callGemini(prompt) {
```

- **`export`** : Rend la fonction disponible pour d'autres fichiers (ici, `analyse.js` l'importe).
- **`async`** : Permet d'utiliser `await` (attendre une réponse sans bloquer).
- **Paramètre `prompt`** : Le texte à envoyer à l'IA (celui construit dans `analyse.js`).
- **Retourne** : Un objet JavaScript avec un champ `suggestions` (tableau d'idées cadeaux).

#### Timeout de sécurité (Lignes 50-51)

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);
```

**AbortController** est un mécanisme natif JavaScript pour **annuler** une requête en cours. Si l'IA (ou le serveur) ne répond pas dans les **15 secondes**, on annule.

- `setTimeout(() => controller.abort(), 15000)` : Programme l'annulation après 15s.
- `controller.signal` est branché sur le `fetch` pour qu'il sache qu'il peut être annulé.
- `clearTimeout(timeoutId)` : Si la réponse arrive avant 15s, on annule le minuteur.

#### L'appel fetch (Lignes 57-62)

```javascript
const response = await fetch(`${API_BASE}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
    signal: controller.signal
});
```

- **`fetch()`** : Fonction native du navigateur pour faire des requêtes HTTP.
- **`method: 'POST'`** : On envoie des données (le prompt), pas une simple demande.
- **`headers`** : On dit au serveur que le corps est du JSON.
- **`body: JSON.stringify({ prompt })`** : On convertit l'objet `{ prompt: "..." }` en texte JSON.
- **`signal`** : Branchement du AbortController pour pouvoir annuler.

#### Gestion des erreurs HTTP (Lignes 69-81)

```javascript
if (!response.ok) {
    let details = null;
    try { details = await response.json(); } catch { }
    const msg = details?.error || `Erreur API : ${response.status}`;
    throw new Error(msg);
}
```

`response.ok` est `true` si le code HTTP est entre 200 et 299 (succès). Sinon :
- On essaie de lire le corps de la réponse pour avoir un message d'erreur détaillé.
- On lance une erreur avec un message informatif.

#### Extraction du texte IA (Lignes 92-93)

```javascript
const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
```

La réponse de Gemini est un objet complexe à plusieurs niveaux :
```
json
  └── candidates (tableau)
        └── [0] (premier candidat)
              └── content
                    └── parts (tableau)
                          └── [0] (première partie)
                                └── text ← C'EST LÀ !
```

Les `?.` (optional chaining) évitent une erreur si un niveau n'existe pas.

#### Parsing robuste du JSON (Lignes 127-154) — 3 TENTATIVES

L'IA ne renvoie pas toujours du JSON pur. Parfois elle ajoute du texte autour. Le parsing se fait en **3 tentatives** :

**Tentative 1 : Parsing direct**
```javascript
try { parsed = JSON.parse(text); }
```
Fonctionne si l'IA a renvoyé du JSON propre : `{"suggestions": [...]}`.

**Tentative 2 : Extraction par regex**
```javascript
const match = text.match(/\{[\s\S]*\}/);
parsed = JSON.parse(match[0]);
```
Si l'IA a renvoyé : `Voici le JSON : {"suggestions": [...]}`, la regex extrait `{...}`.

`\{[\s\S]*\}` signifie : "trouve un `{`, puis n'importe quel caractère (y compris les retours à la ligne), puis un `}`".

**Tentative 3 : Nettoyage markdown**
```javascript
const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
parsed = JSON.parse(cleaned);
```
Si l'IA a renvoyé du markdown :
````
```json
{"suggestions": [...]}
```
````
On retire les balises markdown et on essaie de parser.

#### Vérification de structure (Lignes 157-160)

```javascript
if (!parsed || !Array.isArray(parsed.suggestions)) {
    throw new Error("Réponse IA sans champ 'suggestions' valide");
}
```

Même si le JSON est valide, on vérifie qu'il contient bien un tableau `suggestions` comme attendu.

---

### 2.3 Fonction `searchAmazon(term, budget, minPrice)` (Lignes 187-247)

#### Signature

```javascript
export async function searchAmazon(term, budget, minPrice = 10) {
```

- **`term`** : Le terme de recherche (ex: "montre connectée femme").
- **`budget`** : Le prix maximum.
- **`minPrice = 10`** : Le prix minimum (par défaut 10€). Le `= 10` est une "valeur par défaut".
- **Retourne** : Un objet avec un champ `search_results` (tableau de produits).

#### Validation des entrées (Lignes 192-202)

```javascript
const safeBudget = Number.isFinite(Number(budget)) ? Number(budget) : 0;
const safeTerm = String(term).trim();
if (safeTerm.length < 2) throw new Error("Terme trop court");
```

On "assainit" les données avant de les envoyer au serveur :
- Budget : on vérifie que c'est un nombre valide (pas `NaN`, pas `Infinity`).
- Terme : on le convertit en texte et on enlève les espaces. S'il fait moins de 2 caractères, c'est une erreur.

#### Construction de l'URL (Lignes 204-208)

```javascript
const params = new URLSearchParams({
    term: safeTerm,
    min_price: String(safeMin),
    max_price: String(safeBudget)
});
```

`URLSearchParams` construit automatiquement les paramètres d'URL :
`term=montre+connectée&min_price=20&max_price=50`

C'est plus propre et plus sûr que de construire la chaîne à la main (les caractères spéciaux sont automatiquement encodés).

#### L'appel et le timeout (Lignes 216-218)

```javascript
const response = await fetch(`${API_BASE}/api/search?${params}`, {
    signal: controller.signal
});
```

Appel GET au serveur avec les paramètres dans l'URL. Même système de timeout de 15s que pour Gemini.

---

## 3. SCHÉMA DE FLUX DES DONNÉES

```
analyse.js                    api.js                     server.js                Services externes
    │                           │                            │                          │
    │ callGemini(prompt)        │                            │                          │
    ├──────────────────────────>│                            │                          │
    │                           │ POST /api/analyze          │                          │
    │                           ├───────────────────────────>│                          │
    │                           │                            │ POST Gemini API          │
    │                           │                            ├─────────────────────────>│
    │                           │                            │     Réponse Gemini       │
    │                           │                            │<────────────────────────-│
    │                           │     Réponse JSON           │                          │
    │                           │<──────────────────────────-│                          │
    │ { suggestions: [...] }    │                            │                          │
    │<─────────────────────────-│                            │                          │
    │                           │                            │                          │
    │ searchAmazon(term, budget)│                            │                          │
    ├──────────────────────────>│                            │                          │
    │                           │ GET /api/search?term=...   │                          │
    │                           ├───────────────────────────>│                          │
    │                           │                            │ (Cache ? → sinon API)    │
    │                           │                            ├─────────────────────────>│
    │                           │                            │<────────────────────────-│
    │                           │     Produits Amazon        │                          │
    │                           │<──────────────────────────-│                          │
    │ { search_results: [...] } │                            │                          │
    │<─────────────────────────-│                            │                          │
```

---

## 4. CE QU'ON PEUT MODIFIER FACILEMENT

| Modification | Variable/Ligne | Valeur actuelle |
|---|---|---|
| Mode debug API | `API_DEBUG` (ligne 15) | `false` |
| Timeout des appels | `15000` (lignes 51, 211) | 15 secondes |
| Prix minimum par défaut | `minPrice = 10` (ligne 187) | 10€ |
| Longueur minimum terme | `safeTerm.length < 2` (ligne 200) | 2 caractères |

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
