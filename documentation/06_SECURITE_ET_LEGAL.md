# 🔒 SÉCURITÉ & LEGAL — `js/security.js` + `js/legal.js`
*Document 6/9 — Protection contre les attaques et conformité RGPD*

---

# PARTIE A : SÉCURITÉ — `js/security.js` (84 lignes)

## 1. RÔLE

`security.js` contient des **fonctions utilitaires de sécurité** utilisées dans tout le projet. Son rôle principal est de **prévenir les attaques XSS** (Cross-Site Scripting).

### Qu'est-ce qu'une attaque XSS ?

Imaginez qu'un utilisateur entre comme nom : `<script>alert('Piraté!')</script>`. Si on affiche ce nom tel quel dans la page HTML, le navigateur va **exécuter le script** ! Un pirate pourrait ainsi voler des données, rediriger l'utilisateur, etc.

La solution : on **échappe** les caractères dangereux avant de les afficher.

---

## 2. EXPLICATION DÉTAILLÉE

### 2.1 `escapeHtml(str)` — La fonction la plus utilisée (Lignes 12-20)

```javascript
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
```

**Que fait cette fonction ?** Elle remplace tous les caractères HTML dangereux par des entités HTML inoffensives :

| Caractère dangereux | Remplacement | Pourquoi ? |
|---|---|---|
| `&` | `&amp;` | Le caractère `&` est le début d'une entité HTML |
| `<` | `&lt;` | Le `<` ouvre une balise HTML |
| `>` | `&gt;` | Le `>` ferme une balise HTML |
| `"` | `&quot;` | Les guillemets doubles ferment des attributs HTML |
| `'` | `&#039;` | Les apostrophes peuvent fermer des attributs HTML |

**Exemple :**
- Entrée : `<script>alert("XSS")</script>`
- Sortie : `&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;`

Le texte s'affiche tel quel sans être exécuté. Le `/g` à la fin de chaque regex signifie "global" = remplace TOUTES les occurrences, pas seulement la première.

### 2.2 `sanitizeUrl(url)` — Le garde-fou des liens (Lignes 27-51)

```javascript
export function sanitizeUrl(url) {
    if (!url || typeof url !== 'string') return '#';

    const allowedDomains = [
        'amazon.fr', 'amazon.com', 'www.amazon.fr', 'www.amazon.com', 'amzn.to'
    ];

    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.toLowerCase();
        if (allowedDomains.some(domain => hostname.includes(domain))) {
            return url;
        }
    } catch (e) { }

    return '#';
}
```

**Que fait cette fonction ?** Elle vérifie qu'un lien pointe **exclusivement** vers Amazon. Si le lien pointe ailleurs → renvoi `#` (lien mort inoffensif).

**Pourquoi ?** Si l'API Amazon (ou un pirate) renvoyait un lien vers un site malveillant, cette fonction le bloquerait.

**Étapes :**
1. Si l'URL est vide ou n'est pas du texte → `#`.
2. On essaie de parser l'URL avec `new URL()`.
3. On compare le domaine avec la liste blanche (amazon.fr, amazon.com, amzn.to).
4. Si le domaine est autorisé → on renvoie le lien.
5. Sinon ou si erreur → `#`.

### 2.3 `truncateText(text, maxLength)` (Lignes 59-64)

```javascript
export function truncateText(text, maxLength = 50) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    if (escaped.length <= maxLength) return escaped;
    return escaped.substring(0, maxLength) + '...';
}
```

Tronque un texte à une longueur maximale et ajoute "..." à la fin. Le texte est aussi échappé pour la sécurité. Utile pour les titres de produits qui peuvent être très longs.

### 2.4 `isValidEmail(email)` (Lignes 71-75)

```javascript
export function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
}
```

Valide le format d'un email avec une regex. La regex vérifie :
- Au moins un caractère avant le `@`
- Un `@`
- Au moins un caractère entre le `@` et le `.`
- Un `.`
- Au moins un caractère après le `.`

**Note :** Cette validation est volontairement simple. Elle accepte `a@b.c` mais c'est OK car le but est juste d'éviter les erreurs grossières, pas de valider tous les cas de la norme RFC 5322.

### 2.5 `generateId()` (Lignes 81-83)

```javascript
export function generateId() {
    return 'OFFREZ_' + Math.random().toString(36).substr(2, 9);
}
```

Génère un identifiant aléatoire unique (ex: `OFFREZ_a7bx3km92`). `Math.random().toString(36)` convertit un nombre aléatoire en base 36 (chiffres + lettres). `.substr(2, 9)` retire le "0." initial et prend 9 caractères.

---

# PARTIE B : BANNIÈRE COOKIES — `js/legal.js` (140 lignes)

## 1. RÔLE

`legal.js` gère la **bannière de consentement cookies** conformément au RGPD. Il :
1. Vérifie si l'utilisateur a déjà donné son consentement.
2. Si non, affiche une modale avec overlay.
3. Sauvegarde le choix (accepter ou refuser).

## 2. EXPLICATION DÉTAILLÉE

### 2.1 Structure du fichier

```javascript
(function () {
    'use strict';
    // ... tout le code ...
})();
```

C'est une **IIFE** (Immediately Invoked Function Expression) : une fonction qui s'exécute immédiatement. Les variables déclarées à l'intérieur sont **isolées** et ne polluent pas l'espace global. `'use strict'` active le mode strict de JavaScript (moins tolérant aux erreurs).

### 2.2 Configuration (Lignes 12-13)

```javascript
const CONSENT_KEY = 'OFFREZ_cookie_consent';
const CONSENT_DURATION = 365; // jours
```

- **`CONSENT_KEY`** : Le nom sous lequel le consentement est stocké dans le `localStorage`.
- **`CONSENT_DURATION`** : Durée de validité du consentement en jours. Après 365 jours, la bannière s'affiche à nouveau.

### 2.3 Vérification du consentement (Lignes 18-29)

```javascript
function hasConsent() {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) return false;
    try {
        const data = JSON.parse(consent);
        const expiry = new Date(data.expiry);
        return expiry > new Date();
    } catch { return false; }
}
```

**Logique :**
1. On lit le `localStorage`.
2. Si rien n'est stocké → pas de consentement.
3. Sinon, on vérifie la date d'expiration.
4. Si la date est passée → le consentement a expiré.

### 2.4 Sauvegarde du consentement (Lignes 34-43)

```javascript
function saveConsent(accepted) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + CONSENT_DURATION);
    localStorage.setItem(CONSENT_KEY, JSON.stringify({
        accepted: accepted,      // true ou false
        date: new Date().toISOString(),  // Quand le choix a été fait
        expiry: expiry.toISOString()     // Quand le choix expire
    }));
}
```

On sauvegarde :
- Si l'utilisateur a **accepté** ou **refusé**.
- La **date** du choix.
- La **date d'expiration** (dans 365 jours).

### 2.5 Affichage de la bannière (Lignes 48-125)

```javascript
function showCookieBanner() {
    // Vérification silencieuse du consentement cookies
    // On utilise la fonction hasConsent() définie plus haut (clé: OFFREZ_cookie_consent)
    if (hasConsent()) {
        // Consentement déjà donné - rien à afficher
        return;
    }
```

#### Création de l'overlay et de la bannière

```javascript
const overlay = document.createElement('div');
overlay.className = 'cookie-overlay';

const banner = document.createElement('div');
banner.className = 'cookie-banner';
banner.innerHTML = `
    <div class="cookie-content">
        <p class="cookie-text">
            <i class="fas fa-cookie-bite"></i>
            Ce site utilise des cookies essentiels...
        </p>
        <div class="cookie-buttons">
            <button class="cookie-btn-accept">Accepter</button>
            <button class="cookie-btn-decline">Continuer sans accepter</button>
        </div>
    </div>
`;
```

On crée **deux éléments HTML** par JavaScript :
1. **L'overlay** : un fond sombre semi-transparent qui couvre toute la page (pour forcer l'attention).
2. **La bannière** : la boîte modale avec le texte et les boutons.

#### Animation d'entrée (Lignes 91-96)

```javascript
requestAnimationFrame(() => {
    setTimeout(() => {
        overlay.classList.add('visible');
        banner.classList.add('visible');
    }, 50);
});
```

On ajoute la classe `visible` avec un petit délai de 50ms. Ce délai est nécessaire pour que le navigateur ait le temps de "prendre en compte" les éléments avant de lancer l'animation CSS (transition d'opacité de 0 à 1).

`requestAnimationFrame` : Dit au navigateur "fais ça au prochain cycle de rendu". C'est la méthode la plus propre pour déclencher des animations.

#### Fermeture (Lignes 99-106)

```javascript
function closeAll() {
    overlay.classList.remove('visible');
    banner.classList.remove('visible');
    setTimeout(() => {
        if (overlay.parentNode) overlay.remove();
        if (banner.parentNode) banner.remove();
    }, 500);
}
```

1. On retire la classe `visible` → déclenche la transition CSS de fermeture (opacité 1 → 0).
2. On attend 500ms (durée de la transition CSS).
3. On supprime les éléments du DOM.

`overlay.parentNode` vérifie que l'élément est encore dans la page avant de le supprimer (protection contre les clics multiples).

### 2.6 Export global (Lignes 135-138)

```javascript
window.OFFREZLegal = {
    hasConsent,
    showCookieBanner
};
```

On rend les fonctions accessibles globalement via `window.OFFREZLegal`. Ça permet à d'autres scripts (ou à la console F12) d'appeler `OFFREZLegal.hasConsent()` ou `OFFREZLegal.showCookieBanner()`.

---

## 3. CE QU'ON PEUT MODIFIER FACILEMENT

| Modification | Fichier | Variable |
|---|---|---|
| Durée du consentement | `legal.js` | `CONSENT_DURATION = 365` |
| Texte de la bannière | `legal.js` | Le HTML dans `banner.innerHTML` |
| Domaines autorisés pour les liens | `security.js` | Tableau `allowedDomains` |
| Longueur max troncature | `security.js` | `maxLength = 50` dans `truncateText` |

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
