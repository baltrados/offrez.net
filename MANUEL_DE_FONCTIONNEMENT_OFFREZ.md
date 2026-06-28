# 📘 LE GRAND MANUEL OFFREZ : LA BIBLE DU PROJET (VERSION INTÉGRALE)
*Tout ce qu'il faut savoir de A à Z : Fonctionnement, Business, et ANATOMIE DU CODE.*

---

# 🔎 PARTIE 1 : VUE D'ENSEMBLE (Fonctionnel)

## 1. À quoi sert ce site ?
OFFREZ est un moteur de recommandation de cadeaux intelligent.
*   **Entrée** : L'utilisateur décrit une personne ("Femme, 30 ans, aime le yoga").
*   **Magie** : L'IA (Google Gemini) imagine des idées de cadeaux.
*   **Réalité** : Le site cherche ces idées sur Amazon (via RapidAPI) pour trouver les VRAIS produits avec prix et photo.
*   **Sortie** : L'utilisateur voit 2 cartes produits avec calcul d'économies.

## 2. Business Model (L'argent)
*   **Affiliation Amazon** : Chaque lien sortant contient votre tag `offreznet-21`.
*   **Cookie 24h** : Si l'utilisateur clique et achète n'importe quoi dans les 24h sur Amazon, vous touchez une commission.

> **💰 IMPORTANT - LA QUESTION QUI VAUT DE L'OR :**
> *"Si le visiteur refuse les cookies sur mon site, est-ce que je perds ma commission ?"*
> **RÉPONSE : NON ! Vous touchez quand même votre argent.**
>
> *Explication :* Votre bannière bloque les espions "sur votre site" (Google Analytics). Mais quand le visiteur clique sur "Voir l'offre", il **quitte** votre site pour aller chez Amazon. C'est Amazon qui pose son cookie à ce moment-là. Comme c'est une action volontaire (le clic), c'est 100% légal et fonctionnel, même s'il a dit "Non" à vos stats.

## 3. Conformité Légale (RGPD)
*   **Popup Cookies** : Bloque les traqueurs tant que l'utilisateur n'a pas dit "Oui".
*   **Overlay** : Un écran noir force l'attention sur le choix cookie (Cookie Wall partiel).
*   **Emails** : Envoyés directement vers Brevo (aucun stockage local). Consentement vérifié côté serveur.

---

# 🛠️ PARTIE 2 : GUIDE TECHNIQUE (Installation & Maintenance)

## 1. La Stack Technique
*   **Backend** : Node.js + Express.
*   **Frontend** : HTML5 + CSS3 + Vanilla JS (Pas de React/Vue, pour rester léger et durable).
*   **IA** : Google Gemini 2.0 Flash (Gratuit jusqu'à un certain seuil).
*   **Data** : RapidAPI (Real-Time Amazon Data).

## 2. Installation (PC ou Serveur)
**Bonne nouvelle : C'est exactement pareil.**
Que vous soyez sur votre PC Windows ou sur votre serveur perso (Linux/Ubuntu/Debian), Node.js fonctionne de la même façon.

1.  **Installer Node.js** (Version LTS) sur la machine.
2.  Copier le dossier du projet.
3.  Ouvrir le terminal (ou CMD).
4.  Lancer `npm install` (Cela télécharge les outils nécessaires).
5.  Créer le fichier `.env` avec les clés.
6.  **Sur PC (Test)** : Lancer `npm start`.
7.  **Sur Serveur (Prod)** : Utilisez **PM2** (voir plus bas) au lieu de `npm start` pour que le site tourne en tâche de fond 24/24.

## 3. Le Fichier `.env` (Vos secrets)
Créez ce fichier à la racine. Il ne doit JAMAIS être partagé.
```ini
PORT=3000
GEMINI_API_KEY=AIzaSy... (Votre clé Google AI Studio)
RAPIDAPI_KEY=... (Votre clé RapidAPI Ultra/RealTime Amazon)
```

---

# 🔧 PARTIE 2 BIS : LE COIN DU BRICOLEUR (Modifications Faciles)

**"Je ne suis pas codeur, mais je veux changer un truc..."**
Pas de panique. Voici les 3 modifications les plus courantes et OÙ les faire :

### 1. "Je veux que l'IA soit plus drôle / sérieuse / folle"
*   **Fichier** : `js/analyse.js`
*   **Ligne** : Cherchez "`# RÔLE`" (vers la ligne 180).
*   **Action** : Modifiez le texte.
    *   *Actuel* : "Tu es OFFREZ, un expert..."
    *   *Nouveau* : "Tu es un clown qui propose des cadeaux rigolos..."

### 2. "Je veux changer le texte de la page d'accueil"
*   **Fichier** : `index.html`
*   **Action** : Cherchez simplement le texte à changer (CTRL+F) et remplacez-le.
    *   *Attention* : Ne touchez pas aux balises `<...>`, juste au texte blanc/noir.

### 3. "Je veux que la popup cookies revienne plus souvent (ex: 30 jours)"
*   **Fichier** : `js/legal.js`
*   **Ligne** : Cherchez `const CONSENT_DURATION = 365;`
*   **Action** : Remplacez `365` par `30`.

---

# 🧠 PARTIE 3 : ANATOMIE DU CODE (Comment ça marche "Sous le capot")

Voici l'explication détaillée fichier par fichier. Utile pour modifier le site.

## A. LE CERVEAU : `server.js` (Backend)
C'est le fichier principal qui tourne sur votre machine/serveur.

### 1. Sécurité & Configuration (Lignes 13-138)
*   **Helmet** : Ajoute des en-têtes de sécurité HTTP pour empêcher les pirates d'injecter du code malveillant.
*   **Rate Limit** : `apiLimiter` (40 requêtes/min) empêche quelqu'un de spammer votre recherche Amazon et de vider votre compte bancaire RapidAPI.
*   **Compression** : Compresse le HTML/CSS pour que le site charge ultra-vite sur mobile.

### 2. Le Cache Intelligent (Lignes 36-65)
*   **Problème** : Chaque recherche Amazon coûte de l'argent (API).
*   **Solution** : Une mémoire (`searchCache`) retient les résultats pendant 24h.
*   **Fonctionnement** : Si quelqu'un cherche "Montre Homme", le serveur vérifie s'il l'a déjà en mémoire. Si oui, il répond GRATUITEMENT et INSTANTANÉMENT sans appeler Amazon.

### 3. API IA (Lignes 143-207)
*   Route : `POST /api/analyze`
*   Rôle : Reçoit le texte du client, l'envoie à Google Gemini, et renvoie la réponse.
*   Pourquoi passer par le serveur ? Pour ne pas donner votre clé API Google aux visiteurs.

### 4. API Amazon (Lignes 212-293)
*   Route : `GET /api/search`
*   Rôle : Appelle RapidAPI pour avoir les vrais produits.
*   **Astuce Business** : C'est ici qu'on logue les recherches dans `searches.csv` pour savoir ce que les gens veulent.

### 5. Capture Email (Lignes 299-336)
*   Route : `POST /api/subscribe`
*   Rôle : Valide l'email (vérifie le @), l'envoie vers Brevo via leur API. Aucun stockage local.

---

## B. L'INTELLIGENCE : `js/analyse.js` (Frontend)
C'est le chef d'orchestre dans le navigateur du visiteur.

### 1. La Logique (Fonction `lancerAnalyse`)
1.  Lit le `localStorage` pour retrouver le profil (ex: "Papa, 60 ans").
2.  Construit un **Prompt Géant** (Lignes 180-244) : C'est ici qu'on dit à l'IA "Tu es un expert cadeau... Interdit de proposer de la technologie...".
    *   *Pour changer le comportement de l'IA, c'est ici qu'il faut modifier le texte.*

### 2. Le Double Filtrage (Lignes 289-317)
L'IA propose parfois n'importe quoi. Ce script filtre :
*   Le prix est-il dans le budget ?
*   La note est-elle > 3.5 étoiles ?
*   Y a-t-il au moins 1 avis ? (fallback progressif)
Si non, le produit est jeté pour garantir la qualité "Premium".

### 3. Le Scoring CRO (Lignes 328-358)
On ne montre pas les produits au hasard. On calcule un "Score de perfection" :
*   On favorise les produits qui utilisent 60-90% du budget (pour maximiser votre commission et la valeur perçue du cadeau).
*   On favorise les produits Prime.

### 4. Affichage (Lignes 436-559)
Génère le HTML des cartes cadeaux.
*   Gère le carousel (flèches gauche/droite) pour voir les autres idées.


---

## C. LE JURIDIQUE : `js/legal.js`
Gère la bannière cookies.

### Fonctionnement (Lignes 48-126)
1.  Vérifie si `localStorage` contient déjà un choix.
2.  Si non, injecte deux éléments HTML :
    *   `<div id="cookieOverlay">` : Le fond noir qui bloque tout.
    *   `<div id="cookieBanner">` : La jolie boîte avec les boutons.
3.  Si l'utilisateur clique :
    *   Sauvegarde le choix.
    *   Supprime l'overlay et la bannière.

---

## D. LE DESIGN : CSS Modulaire
Le CSS est organisé en **12 fichiers** dans `css/partials/` :
*   `_01-variables.css` → Variables CSS (couleurs, spacing)
*   `_02-base.css` → Reset / box-sizing / typographie
*   ...
*   `_12-responsive.css` → Media queries consolidées (900px, 768px, 640px, 600px)
*   **Build** : `python minify_css.py` compile les 12 partiels en `style.min.css` (35 KB).
*   Les pages HTML chargent `style.min.css?v=TIMESTAMP`.

---

# 🚀 PARTIE 4 : DÉPLOIEMENT (Mise en Ligne)

Pour mettre ce site sur internet depuis votre serveur :

1.  **Cloudflare Tunnel** (configuré) :
    *   Le domaine `offrez.net` pointe vers le serveur CM3588 via un tunnel Cloudflare permanent.
    *   HTTPS est géré automatiquement par Cloudflare.
    *   Voir `.agents/workflows/deploy-to-server.md` pour les commandes.

2.  **Gestionnaire de Processus (PM2)** :
    *   Ne lancez pas avec `node server.js` (ça coupe si vous fermez la fenêtre).
    *   PM2 est installé : `pm2 restart offrly`
    *   Pour que ça redémarre si le PC reboote : `pm2 startup` puis `pm2 save`.

---

# 📊 PARTIE 5 : GÉRER VOTRE BUSINESS (Tableau de Bord)

J'ai inclus un petit outil "Secret" pour que vous puissiez suivre vos chiffres directement.

### Comment voir mes stats ?
1.  Ouvrez votre terminal (CMD ou PowerShell) dans le dossier du site.
2.  Tapez la commande magique :
    ```bash
    npm run stats
    ```
3.  Appuyez sur Entrée.

### Ce que ça vous dira :
*   **Visiteurs du jour** : Combien de gens ont lancé une recherche aujourd'hui.
*   **Clics Amazon du jour** : Combien de clics vers Amazon ont été enregistrés.
*   **Taux de Clic (CTR)** : Le % de gens qui cliquent vers Amazon (ex: 25%). C'est votre indicateur de performance clé (KPI).
*   **Emails** : Gérés par Brevo → https://app.brevo.com
*   **Lien Amazon** : Rappel du lien pour aller voir vos euros.

---

# 📝 LISTE DES FICHIERS DE DONNÉES (À Sauvegarder)

Ces fichiers se créent automatiquement sur votre serveur :
1.  `searches.csv` : Historique de ce que les gens tapent.
2.  `clicks.csv` : Historique des clics vers Amazon.

> **📧 Emails** : Les emails des inscrits sont gérés par **Brevo** (anciennement Sendinblue). Aucun email n'est stocké localement.

---

*Document mis à jour le 11/03/2026 - OFFREZ v2.1 (Refonte données RGPD)*
