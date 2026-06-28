# 🌐 LES PAGES HTML
*Document 7/9 — Toutes les pages visuelles du site*

---

## 1. VUE D'ENSEMBLE

Le projet contient **8 pages HTML** :
- 4 pages du parcours utilisateur (index, config, profils, analyse)
- 1 page d'erreur (404)
- 3 pages légales (mentions légales, politique de confidentialité, CGU)

Chaque page HTML a la **même structure** de base :

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <!-- Métadonnées, SEO, styles -->
</head>
<body>
    <div class="app-shell">
        <header>...</header>
        <main class="container">
            <!-- Contenu spécifique -->
        </main>
    </div>
    <footer class="site-footer">...</footer>
    <script src="js/legal.js"></script>  <!-- Bannière cookies -->
</body>
</html>
```

---

## 2. `index.html` — PAGE D'ACCUEIL (317 lignes)

### 2.1 Le `<head>` — Métadonnées invisibles

```html
<title>OFFREZ – Trouvez le cadeau parfait en 30 secondes</title>
<meta name="description" content="...">
<meta name="keywords" content="cadeau, idée cadeau, offrir...">
```

**SEO** (optimisation pour les moteurs de recherche) :
- **`<title>`** : Le texte affiché dans l'onglet du navigateur ET dans les résultats Google.
- **`<meta description>`** : Le résumé affiché sous le titre dans Google.
- **`<meta keywords>`** : Mots-clés pour Google (moins utilisé aujourd'hui mais ne fait pas de mal).

```html
<meta property="og:title" content="OFFREZ – Le cadeau parfait en 30 secondes">
<meta property="og:image" content="https://offrez.net/og-image.png">
```

**Open Graph** : Définit l'apparence du lien quand il est partagé sur Facebook, Discord, LinkedIn. Le titre, la description et l'image sont contrôlés par ces balises.

```html
<link rel="manifest" href="manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
```

**PWA** : Permet d'installer le site comme une application sur mobile (voir doc 08).

```html
<script type="application/ld+json">
{
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "OFFREZ",
    "aggregateRating": { "ratingValue": "4.8", "ratingCount": "150" }
}
</script>
```

**Structured Data (Schema.org)** : Données structurées pour que Google affiche des "Rich Snippets" (étoiles, prix) dans les résultats de recherche. C'est du JSON-LD (un format standardisé pour décrire du contenu web).

### 2.2 Le stepper (indicateur d'étapes)

```html
<div class="steps">
    <div class="step step--active">
        <div class="step-index">1</div>
        <div class="step-label">Mission & contexte</div>
    </div>
    <div class="step-connector"></div>
    <div class="step">
        <div class="step-index">2</div>
        <div class="step-label">Profils & budgets</div>
    </div>
    <!-- etc. -->
</div>
```

Une **barre de progression visuelle** en 3 étapes. La classe `step--active` met l'étape en surbrillance. La classe `step--done` ajoute une coche ✓ (utilisée sur les pages suivantes).

### 2.3 La section héros

```html
<section class="page-hero">
    <div class="hero-copy">
        <!-- Badge d'urgence -->
        <div class="urgency-badge">
            <span id="urgencyText">Amazon ne garantit plus la livraison !</span>
        </div>

        <!-- Titre principal -->
        <h2>Ne soyez plus <strong>JAMAIS</strong> celui
            qui offre un cadeau <span class="text-muted-strike">banal</span></h2>

        <!-- Sous-titre avec avantages -->
        <p>✓ 100% gratuit · ✓ Budget respecté à l'euro · ✓ Produits Amazon réels</p>

        <!-- Accroche Loss Aversion -->
        <div class="loss-aversion-banner">
            68% des cadeaux finissent oubliés dans un tiroir.
        </div>

        <!-- CTA Principal -->
        <a href="config.html" class="btn-cta-main btn-cta-glow">
            Trouver mes cadeaux parfaits
        </a>
    </div>
</section>
```

**Techniques CRO (Conversion Rate Optimization) utilisées :**
- **Urgency Badge** : Crée un sentiment d'urgence ("Noël dans X jours").
- **Loss Aversion** : "68% des cadeaux finissent oubliés" pousse à agir pour éviter ça.
- **Social Proof** : "4.8/5 (150+ avis)" rassure via la preuve sociale.
- **CTA Glow** : Le bouton principal a une animation "glow" (halo lumineux) pour attirer l'œil.
- **Micro-copy** : "Gratuit · Sans inscription · 30s" lève les objections potentielles.

### 2.4 Les scripts inline

```html
<script>
    // LIVE COUNTER
    const baseCount = 180 + (new Date().getHours() * 12) + Math.floor(Math.random() * 50);
    // S'incrémente aléatoirement toutes les 3-8 secondes

    // URGENCE INTELLIGENTE
    const events = [
        { date: new Date(year, 11, 25), name: 'Noël', emoji: '🎄' },
        { date: new Date(year, 1, 14), name: 'Saint-Valentin', emoji: '❤️' },
        // ...
    ];
    // Affiche "Noël dans X jours" si < 21 jours
</script>
```

- **Live Counter** : Un compteur qui s'incrémente pour donner l'impression que le site est populaire (social proof dynamique). Le nombre de base est calculé à partir de l'heure actuelle pour paraître réaliste.
- **Urgence Intelligente** : Détecte le prochain événement (Noël, Saint-Valentin, Fête des Mères, Fête des Pères) et affiche un message d'urgence si c'est dans moins de 21 jours. Urgence critique (rouge) si < 7 jours.

---

## 3. `config.html` — FORMULAIRE MISSION (301 lignes)

### Éléments clés

- **Sélecteur d'occasion** : Chips visuels groupés (Fréquentes, Calendrier, Événements de vie).
- **Input nombre de personnes** : `<input type="number" min="1" max="10">`.
- **Sélecteur de stratégie budget** : 3 cartes cliquables (Custom, Same, Global).
- **Champ montant** : Apparaît/disparaît selon la stratégie (caché si "custom").
- **Chips CRO** : Boutons 30€, 50€, 100€, 200€ pour pré-remplir rapidement.
- **Calcul dynamique** : Affiche en temps réel le résultat (ex: "100€ ÷ 3 = ~33€ par personne").

Le script inline gère la logique visuelle (afficher/masquer le champ montant, calculer la répartition). La logique métier (sauvegarde + navigation) est dans `config.js`.

---

## 4. `profils.html` — FORMULAIRES DE PROFILS (191 lignes)

### Le système de template HTML

```html
<template id="profileTemplate">
    <section class="card profile-card">
        <button class="btn-delete">×</button>
        <h3 class="profile-title">Bénéficiaire</h3>
        <div class="form-grid">
            <input class="p-name" placeholder="Ex: Julie">
            <input class="p-budget" placeholder="Ex: 50" type="number">
            <div class="gender-chips">...</div>
            <input class="p-age" type="number">
            <div class="tags-container"></div>
            <textarea class="p-details"></textarea>
            <input class="p-hates" placeholder="À éviter...">
        </div>
    </section>
</template>
```

**`<template>`** est un élément HTML spécial :
- Son contenu est **invisible** dans la page.
- Il sert de **modèle** que JavaScript copie (clone) pour créer les formulaires dynamiquement.
- C'est plus propre que de construire le HTML dans une chaîne de texte JavaScript.

### Barre de progression Zeigarnik

```html
<div class="progress-bar-fill" style="width: 66%;"></div>
```

**Effet Zeigarnik** : Les gens détestent laisser les choses inachevées. En montrant que l'utilisateur a déjà fait 66% du parcours, on l'incite à finir.

---

## 5. `analyse.html` — PAGE DE RÉSULTATS (199 lignes)

### Les zones d'injection dynamique

```html
<div id="singleResult" class="single-result-container"></div>
```

Ce `div` est **vide** au chargement. C'est `analyse.js` qui va y injecter les cartes cadeaux (le `innerHTML` est modifié par la fonction `displayAllResults()`).

```html
<div id="cartContainer" class="cart-container" style="display: none;"></div>
```

Le conteneur du panier global. Caché par défaut (`display: none`), il apparaît quand `analyse.js` le rend visible.

### La modale de confirmation d'achat

```html
<div id="purchaseModal" class="purchase-confirmation-modal" style="display: none;">
    <div class="modal-overlay"></div>
    <div class="modal-content">
        <h3>Excellent choix ! 🎉</h3>
        <p>Vous allez offrir un cadeau que <strong id="recipientNameModal">[Prénom]</strong> n'oubliera jamais.</p>
        <p>Redirection vers Amazon.fr dans <span id="countdownSeconds">3</span>s...</p>
    </div>
</div>
```

Cette modale HTML est pré-construite mais cachée. `analyse.js` la rend visible quand l'utilisateur clique sur "Voir sur Amazon" et personnalise le prénom et le lien.

---

## 6. `404.html` — PAGE D'ERREUR (110 lignes)

Une page simple et sympathique avec :
- Un gros "404" en gradient coloré.
- Un message amical ("Le cadeau parfait n'est pas ici... 🎁❓").
- Deux boutons : retour accueil + trouver un cadeau.
- `<meta name="robots" content="noindex">` pour que Google ne l'indexe pas.

---

## 7. PAGES LÉGALES

Les 3 pages légales (`mentions-legales.html`, `politique-confidentialite.html`, `cgu.html`) sont des pages HTML statiques avec :
- Du texte juridique structuré en sections.
- Pas de JavaScript spécifique (juste `legal.js` pour la bannière cookies).
- Liées depuis le footer de toutes les pages.

---

## 8. ÉLÉMENTS COMMUNS À TOUTES LES PAGES

### Header
```html
<header>
    <div class="header-inner">
        <h1><i class="fas fa-gift"></i> OFFREZ</h1>
        <div class="badge-env">Étape X/3 · Nom</div>
    </div>
</header>
```

### Footer
```html
<footer class="site-footer">
    <p class="amazon-affiliate">En tant que Partenaire Amazon...</p>
    <div class="footer-links">
        <a href="mentions-legales.html">Mentions légales</a>
        <a href="politique-confidentialite.html">Confidentialité</a>
        <a href="cgu.html">CGU</a>
    </div>
    <p class="copyright">© 2026 OFFREZ - Tous droits réservés</p>
</footer>
```

La mention "Partenaire Amazon" est **obligatoire** selon les CGU d'Amazon Affiliates.

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
