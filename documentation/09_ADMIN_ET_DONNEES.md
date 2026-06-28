# 📊 ADMINISTRATION & DONNÉES — `admin-stats.js` + `package.json` + `.env`
*Document 9/9 — Gestion du projet, statistiques et configuration*

---

## 1. `admin-stats.js` — LE TABLEAU DE BORD (73 lignes)

### 1.1 Rôle

C'est un petit script qu'on lance en ligne de commande (`npm run stats`) pour voir les **statistiques du site** directement dans le terminal. Il ne fait pas partie du site web, c'est un **outil d'administration**.

### 1.2 Explication détaillée

```javascript
const fs = require('fs');
const SEARCHES_FILE = path.join(__dirname, 'searches.csv');
const CLICKS_FILE = path.join(__dirname, 'clicks.csv');
```

On charge les 2 fichiers CSV qui contiennent les données anonymes du site.

#### Comptage des lignes (Lignes 10-15)

```javascript
function countLines(filePath) {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return Math.max(0, lines.length - 1);
}
```

**Que fait cette fonction ?**
1. Vérifie si le fichier existe (`fs.existsSync`).
2. Lit tout le contenu du fichier.
3. Sépare le contenu en lignes (coupé au retour à la ligne `\n`).
4. Filtre les lignes vides.
5. Retourne le nombre de lignes **-1** (car la première ligne est le header du CSV, pas une donnée).

#### Comptage du jour (Lignes 18-30)

```javascript
function getTodaysCount(filePath) {
    const today = new Date().toISOString().split('T')[0]; // "2026-02-19"
    lines.forEach(line => {
        if (line.includes(today)) count++;
    });
}
```

Compte les lignes du CSV qui contiennent la date d'aujourd'hui. `new Date().toISOString().split('T')[0]` donne la date au format `"2026-02-19"`. On cherche simplement ce texte dans chaque ligne.

#### Affichage du dashboard (Lignes 34-72)

```javascript
console.log('📅 AUJOURD\'HUI :');
console.log(`- Visiteurs : ${todaySearches}`);
console.log(`- Clics Amazon : ${todayClicks}`);
console.log(`- Emails : ${todayEmails}`);

const clickRate = ((totalClicks / totalSearches) * 100).toFixed(1);
const emailConversion = ((totalEmails / totalSearches) * 100).toFixed(1);
```

Les **KPIs** (indicateurs de performance) calculés :
- **CTR** (Click-Through Rate) : Pourcentage de visiteurs qui ont cliqué vers Amazon. C'est l'indicateur le plus important pour la monétisation.
- **Emails** : Gérés par Brevo (voir `documentation/12_BREVO.md`).

`.toFixed(1)` affiche 1 décimale (ex: `12.5%`).

Les codes `\x1b[33m` et `\x1b[0m` sont des codes ANSI qui colorent le texte dans le terminal (33 = jaune, 32 = vert, 35 = magenta, 0 = reset).

---

## 2. `package.json` — LA FICHE D'IDENTITÉ DU PROJET

```json
{
    "name": "OFFREZ",
    "version": "1.0.0",
    "description": "OFFREZ - Trouvez le cadeau parfait en 30 secondes avec l'IA",
    "main": "server.js",
    "scripts": {
        "start": "node server.js",
        "dev": "node server.js",
        "stats": "node admin-stats.js"
    },
    "dependencies": {
        "compression": "^1.8.1",
        "cors": "^2.8.5",
        "dotenv": "^16.3.1",
        "express": "^4.18.2",
        "express-rate-limit": "^8.2.1",
        "helmet": "^7.1.0",
        "node-fetch": "^3.3.2"
    },
    "engines": {
        "node": ">=18.0.0"
    }
}
```

### Explication de chaque champ

| Champ | Rôle | Valeur |
|---|---|---|
| `name` | Nom technique du projet | `OFFREZ` |
| `version` | Version actuelle | `1.0.0` |
| `main` | Le fichier lancé par défaut | `server.js` |
| `scripts.start` | Commande `npm start` | Lance le serveur |
| `scripts.dev` | Commande `npm run dev` | Même chose (pas de rechargement auto) |
| `scripts.stats` | Commande `npm run stats` | Lance le dashboard admin |
| `engines.node` | Version Node.js requise | 18 ou plus |

### Les dépendances expliquées

| Package | Rôle | Pourquoi on l'utilise |
|---|---|---|
| `compression` | Compresse les réponses HTTP | Site 70% plus rapide |
| `cors` | Autorise les requêtes cross-origin | Nécessaire pour les API |
| `dotenv` | Charge le fichier `.env` | Cache les clés API |
| `express` | Framework web serveur | Simplifie tout le backend |
| `express-rate-limit` | Limite les requêtes par IP | Protège contre les abus |
| `helmet` | Sécurise les en-têtes HTTP | Protège contre les attaques |
| `node-fetch` | Permet `fetch()` en Node.js | Appelle les API externes |

Le `^` devant les versions signifie "compatible avec" (accepte les mises à jour mineures et correctifs).

### Comment installer les dépendances ?

```bash
npm install
```

Cette commande lit `package.json`, télécharge tous les packages listés dans `dependencies`, et les installe dans le dossier `node_modules/`. Le fichier `package-lock.json` fige les versions exactes installées.

---

## 3. `.env` — LES SECRETS

```
GEMINI_API_KEY=AIzaSy...
RAPIDAPI_KEY=abc123...
BREVO_API_KEY=xkeysib-...
PORT=3000
```

Ce fichier contient les **clés secrètes**. Il est chargé au démarrage par `dotenv` et accessible via `process.env.GEMINI_API_KEY`.

### ⚠️ RÈGLES DE SÉCURITÉ

1. **NE JAMAIS** mettre ce fichier sur GitHub ou le partager.
2. **NE JAMAIS** l'afficher dans la console ou les logs.
3. Si une clé est compromise → la révoquer immédiatement sur la plateforme concernée.
4. Le fichier `.env.example` montre le format attendu SANS les vraies valeurs.

### Où obtenir les clés ?

| Clé | Où l'obtenir | Lien |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio | https://aistudio.google.com/apikey |
| `RAPIDAPI_KEY` | RapidAPI Dashboard | https://rapidapi.com/developer/apps |
| `BREVO_API_KEY` | Brevo (SMTP & API) | https://app.brevo.com |

---

## 4. LES FICHIERS CSV — VOS DONNÉES

> **📧 Emails** : Les emails des inscrits ne sont plus stockés localement. Ils sont envoyés directement à **Brevo** via l'API. Voir `documentation/12_BREVO.md` pour les détails.

### 4.1 `searches.csv`

```csv
"timestamp","term","min_price","max_price"
"2026-02-19T14:30:00.000Z","montre connectée femme","10","50"
```

Chaque ligne = une recherche Amazon effectuée. Utile pour comprendre ce que les visiteurs cherchent et adapter l'offre.

### 4.2 `clicks.csv`

```csv
"timestamp","ip","product_name","price","asin"
"2026-02-19T14:31:00.000Z","123.45.67.89","Montre Fossil Gen 6","89.99","B09XYZ1234"
```

Chaque ligne = un clic vers Amazon. C'est votre **indicateur de monétisation**.

### Comment exploiter ces fichiers ?

1. **Option simple** : Ouvrir avec Excel ou Google Sheets.
2. **Option terminal** : `npm run stats` (le dashboard intégré).
3. **Option avancée** : Copier sur le Bureau avec PowerShell :
```powershell
Copy-Item searches.csv, clicks.csv $env:USERPROFILE\Desktop\
```

---

## 5. `robots.txt` — INSTRUCTIONS POUR GOOGLE

```
User-agent: *
Allow: /
Sitemap: https://offrez.net/sitemap.xml
```

Dit aux robots de Google (et autres moteurs de recherche) :
- `User-agent: *` : Ces règles s'appliquent à TOUS les robots.
- `Allow: /` : Vous pouvez indexer tout le site.
- `Sitemap` : Voici l'adresse de mon plan du site.

## 6. `sitemap.xml` — LE PLAN DU SITE

```xml
<url>
    <loc>https://offrez.net/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
</url>
```

Un fichier XML qui liste toutes les pages du site pour que Google les découvre facilement. Chaque `<url>` contient :
- `loc` : L'adresse de la page.
- `changefreq` : La fréquence de mise à jour (weekly = hebdomadaire).
- `priority` : L'importance relative de la page (1.0 = très important, 0.5 = moyen).

---

*Document mis à jour le 11/03/2026 — OFFREZ Documentation v2.1 (Refonte données RGPD)*
