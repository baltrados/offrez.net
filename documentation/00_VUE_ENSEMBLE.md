# 📘 OFFREZ — VUE D'ENSEMBLE DU PROJET
*Document 0/11 — Introduction générale et architecture*

---

## 1. QU'EST-CE QU'OFFREZ ?

OFFREZ est un **site web** qui aide les gens à trouver le **cadeau parfait** pour leurs proches.

**En résumé :**
- L'utilisateur décrit la personne à qui il veut offrir un cadeau (âge, sexe, centres d'intérêt, budget).
- Une **intelligence artificielle** (Google Gemini) réfléchit à des idées de cadeaux adaptées.
- Le site cherche ensuite les **vrais produits** disponibles sur Amazon.fr (avec prix, photos, avis).
- L'utilisateur voit des cartes produits et peut cliquer pour acheter sur Amazon.

**Comment OFFREZ gagne de l'argent ?**
- Chaque lien vers Amazon contient un **tag d'affiliation**.
- Si l'utilisateur clique et achète quoi que ce soit sur Amazon dans les 24h, le propriétaire d'OFFREZ touche une **commission** (entre 1% et 12% selon la catégorie).

---

## 2. VOCABULAIRE ESSENTIEL

Voici les termes techniques utilisés dans le projet, expliqués simplement :

| Terme | Signification simple |
|---|---|
| **Backend** | La partie "invisible" du site qui tourne sur le serveur (le chef cuisinier en cuisine) |
| **Frontend** | La partie que l'utilisateur voit dans son navigateur (le plat servi au restaurant) |
| **API** | Un "guichet" qui permet à un logiciel de demander des informations à un autre logiciel |
| **Serveur** | Un ordinateur (ou programme) qui tourne en permanence et répond aux demandes des visiteurs |
| **Node.js** | Le moteur qui permet de faire tourner du JavaScript côté serveur |
| **Express** | Un outil (bibliothèque) qui simplifie la création d'un serveur web avec Node.js |
| **localStorage** | Un espace de stockage dans le navigateur de l'utilisateur (comme un post-it qu'il garde chez lui) |
| **JSON** | Un format universel pour échanger des données (comme un tableau structuré) |
| **CSS** | Le langage qui décrit l'apparence visuelle du site (couleurs, polices, mises en page) |
| **HTML** | Le langage qui structure le contenu d'une page web (titres, paragraphes, boutons) |
| **JavaScript (JS)** | Le langage de programmation qui rend le site interactif (réagir aux clics, animer, calculer) |
| **IA / Gemini** | Intelligence Artificielle de Google utilisée pour générer des idées de cadeaux |
| **RapidAPI** | Un service intermédiaire qui permet d'accéder aux données Amazon (produits, prix) |
| **PWA** | Progressive Web App = un site qui peut s'installer comme une application sur mobile |
| **RGPD** | Règlement européen sur la protection des données personnelles |
| **XSS** | Une attaque informatique où un pirate injecte du code malveillant dans un site |
| **Cache** | Une mémoire temporaire qui évite de refaire les mêmes opérations inutilement |
| **Git / GitHub** | Système de versionnement du code — GitHub est la source de vérité du projet |
| **CSV** | Un format de fichier simple (tableur), lisible avec Excel |
| **Endpoint / Route** | Une "adresse" sur le serveur à laquelle on peut envoyer une demande |
| **Rate Limiting** | Un système qui limite le nombre de demandes par minute pour éviter les abus |
| **Affiliation** | Un système commercial où on touche une commission sur les ventes qu'on génère |

---

## 3. ARCHITECTURE GÉNÉRALE

### 3.1 Vue simplifiée

```
┌──────────────────────────────────────────────────┐
│              NAVIGATEUR DE L'UTILISATEUR           │
│                                                    │
│   index.html → config.html → profils.html          │
│                                    ↓               │
│                             analyse.html           │
│                      (affiche les résultats)       │
│                                                    │
│   JS : config.js, profils.js, analyse.js, api.js   │
│   CSS : style.css                                  │
│   Sécurité : security.js, legal.js                 │
└────────────────────────┬───────────────────────────┘
                         │ Requêtes HTTP
                         ↓
┌──────────────────────────────────────────────────┐
│              SERVEUR NODE.JS (server.js)           │
│                                                    │
│   /api/analyze  → Proxy vers Google Gemini         │
│   /api/search   → Proxy vers Amazon (RapidAPI)     │
│   /api/subscribe → Sauvegarde emails              │
│   /api/track-click → Log clics Amazon             │
│   /api/health   → État du serveur                 │
│                                                    │
│   Cache mémoire (24h) — Rate Limiter — Sécurité   │
└────────────────────────┬───────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ↓                     ↓
     Google Gemini API        Amazon RapidAPI
     (Génère les idées)       (Trouve les produits)
```

### 3.2 Pourquoi un serveur intermédiaire ?

L'utilisateur ne parle **jamais** directement à Google ou Amazon. Tout passe par notre serveur. Pourquoi ?

1. **Sécurité** : Les clés API (mots de passe pour accéder aux services) restent secrètes sur le serveur. Si elles étaient dans le code visible par le navigateur, n'importe qui pourrait les voler.
2. **Économie** : Le serveur met en cache (mémorise) les résultats Amazon pendant 24h. Si 10 personnes cherchent "Montre homme", on ne paie qu'un seul appel API au lieu de 10.
3. **Protection** : Le serveur limite le nombre de requêtes par minute pour éviter qu'un robot ne fasse exploser la facture API.

---

## 4. LE PARCOURS UTILISATEUR (FLUX)

Le site fonctionne en **3 étapes** linéaires :

```
ÉTAPE 1 : MISSION & BUDGET         ÉTAPE 2 : PROFILS              ÉTAPE 3 : RÉSULTATS
┌─────────────────────┐        ┌──────────────────────┐       ┌─────────────────────────┐
│                     │        │                      │       │                         │
│  Quelle occasion ?  │        │  Décrivez chaque     │       │  L'IA réfléchit...      │
│  (Anniversaire,     │───────>│  personne :           │──────>│  Recherche Amazon...    │
│  Noël, Mariage...)  │        │  - Prénom             │       │  Filtrage qualité...    │
│                     │        │  - Genre/Âge          │       │                         │
│  Combien de gens ?  │        │  - Budget             │       │  🎁 Cartes cadeaux !   │
│                     │        │  - Intérêts           │       │  → Voir sur Amazon      │
│  Stratégie budget ? │        │  - Ce qu'il adore     │       │  → Panier groupé        │
│  (Custom/Same/      │        │  - Ce qu'il déteste   │       │  → Partager             │
│   Global)           │        │                      │       │                         │
└─────────────────────┘        └──────────────────────┘       └─────────────────────────┘
     config.html                    profils.html                   analyse.html
     config.js                      profils.js                     analyse.js + api.js
```

### Comment les données circulent entre les pages ?

Les pages utilisent le **localStorage** du navigateur comme "mémoire de passage" :

1. `config.html` sauvegarde la config dans `localStorage["giftConfig"]`
2. `profils.html` lit `giftConfig` et sauvegarde les profils dans `localStorage["finalData"]`
3. `analyse.html` lit `finalData` et lance l'analyse

C'est comme si chaque page écrivait un mot sur un tableau blanc, et la page suivante le lisait.

---

## 5. LISTE DES FICHIERS DU PROJET

### 5.1 Fichiers principaux (Code)

| Fichier | Rôle | Doc détaillée |
|---|---|---|
| `server.js` | Serveur backend (le chef d'orchestre côté serveur) | → `01_SERVEUR.md` |
| `js/analyse.js` | Cerveau de l'app : IA + scoring + affichage résultats | → `02_ANALYSE.md` |
| `js/api.js` | Communication avec le serveur (Gemini + Amazon) | → `03_API.md` |
| `js/config.js` | Logique de l'étape 1 (Mission & Budget) | → `04_CONFIG.md` |
| `js/profils.js` | Logique de l'étape 2 (Création des profils) | → `05_PROFILS.md` |
| `js/security.js` | Fonctions de sécurité anti-XSS | → `06_SECURITE_ET_LEGAL.md` |
| `js/legal.js` | Bannière cookies RGPD | → `06_SECURITE_ET_LEGAL.md` |

### 5.2 Pages HTML

| Fichier | Rôle | Doc détaillée |
|---|---|---|
| `index.html` | Page d'accueil (landing page) | → `07_PAGES_HTML.md` |
| `config.html` | Formulaire étape 1 | → `07_PAGES_HTML.md` |
| `profils.html` | Formulaire étape 2 | → `07_PAGES_HTML.md` |
| `analyse.html` | Page de résultats étape 3 | → `07_PAGES_HTML.md` |
| `404.html` | Page d'erreur (page non trouvée) | → `07_PAGES_HTML.md` |
| `cgu.html` | Conditions Générales d'Utilisation | → `07_PAGES_HTML.md` |
| `mentions-legales.html` | Mentions Légales | → `07_PAGES_HTML.md` |
| `politique-confidentialite.html` | Politique de Confidentialité | → `07_PAGES_HTML.md` |

### 5.3 Configuration & Infrastructure

| Fichier | Rôle | Doc détaillée |
|---|---|---|
| `sw.js` | Service Worker (mode hors-ligne, PWA) | → `08_SERVICE_WORKER_ET_PWA.md` |
| `manifest.json` | Métadonnées PWA (icène, nom, couleurs) | → `08_SERVICE_WORKER_ET_PWA.md` |
| `admin-stats.js` | Script CLI pour voir les statistiques | → `09_ADMIN_ET_DONNEES.md` |
| `package.json` | Config Node.js (dépendances, scripts) | → `09_ADMIN_ET_DONNEES.md` |
| `.env` | Clés API secrètes (NE JAMAIS PARTAGER) | → `09_ADMIN_ET_DONNEES.md` |
| `style.css` | Tout le design du site (96Ko) | (trop volumineux pour documenter ligne par ligne) |

### 5.4 Fichiers de données (générés automatiquement)

| Fichier | Contenu |
|---|---|
| `emails.csv` | Liste des emails collectés |
| `searches.csv` | Historique de toutes les recherches |
| `clicks.csv` | Tous les clics vers Amazon |
| `visitors.json` | Base de données visiteurs unifiée (profils, recherches, clics, emails par IP) |

---

## 6. TECHNOLOGIES UTILISÉES

| Technologie | Rôle | Gratuit ? |
|---|---|---|
| **Node.js** | Fait tourner le serveur | ✅ Oui |
| **Express** | Simplifie la création du serveur | ✅ Oui |
| **Google Gemini 2.0 Flash** | IA qui génère les idées cadeaux | ✅ Oui (quota gratuit) |
| **RapidAPI (Amazon Data)** | Récupère les vrais produits Amazon | ⚠️ Payant au-delà du quota gratuit |
| **Helmet** | Sécurise les en-têtes HTTP du serveur | ✅ Oui |
| **Compression** | Compresse les fichiers (site plus rapide) | ✅ Oui |
| **Font Awesome** | Icônes (🎁, ⚡, 🔒...) | ✅ Oui |
| **Google Fonts (Poppins)** | Police de caractères moderne | ✅ Oui |

---

## 7. COMMENT LIRE LA SUITE

Chaque document de cette documentation suit la même structure :
1. **Rôle du fichier** — À quoi sert-il dans le projet ?
2. **Explication bloc par bloc** — Chaque section du code est expliquée en langage courant
3. **Ce qu'on peut modifier facilement** — Les points d'ajustement courants

Les documents sont numérotés dans l'ordre logique de lecture recommandé :
- **01** → Le serveur (fondation de tout)
- **02-03** → L'IA et l'API (le cœur intelligent)
- **04-05** → Les étapes utilisateur (formulaires)
- **06** → Sécurité et conformité légale
- **07** → Les pages visuelles
- **08** → L'aspect "application mobile" (PWA)
- **09** → Administration et statistiques
- **11** → Installation du serveur CM3588
- **13** → Git, GitHub et déploiement

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.1 (juin 2026 : ajout Git/GitHub)*
