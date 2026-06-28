# OFFREZ 🎁

> **Trouvez le cadeau parfait en 30 secondes avec l'IA**

Application web intelligente qui utilise l'IA (Google Gemini) pour recommander des cadeaux personnalisés sur Amazon.fr.

---

## ✨ Fonctionnalités

| Fonctionnalité | Description |
|----------------|-------------|
| 🧠 IA Gemini | Recommandation de cadeaux personnalisée |
| 💰 Budget strict | Jamais au-dessus du plafond |
| 🛒 Amazon.fr | Liens directs vers les produits |
| 📱 PWA | Installable sur mobile/desktop |
| 🔒 Sécurisé | Clés API côté serveur |
| ⚡ Cache | 80%+ économies requêtes API |

---

## 🚀 Installation

```bash
# Cloner le projet
git clone <votre-repo>
cd OFFREZ

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos clés API

# Lancer le serveur
npm start
```

Ouvrir **http://localhost:3000**

---

## 🔧 Configuration (.env)

```env
GEMINI_API_KEY=votre_cle_gemini
RAPIDAPI_KEY=votre_cle_rapidapi
PORT=3000
NODE_ENV=production
```

---

## 📖 Utilisation

1. **Configurez** l'occasion et le nombre de personnes
2. **Remplissez** les profils (goûts, budget, à éviter)
3. **Lancez** l'analyse IA
4. **Recevez** 2 suggestions par personne avec liens Amazon

---

## 📁 Structure

```
OFFREZ/
├── index.html          # Accueil
├── config.html         # Configuration
├── profils.html        # Profils bénéficiaires
├── analyse.html        # Analyse IA + résultats
├── style.min.css       # CSS minifié (servi en production)
├── css/partials/       # 12 fichiers CSS source
├── server.js           # Serveur Express + cache
├── manifest.json       # PWA
├── sw.js               # Service Worker
└── js/
    ├── api.js          # Appels API sécurisés
    ├── config.js       # Logique configuration
    ├── config-ui.js    # UI config (animations, chips)
    ├── profils.js      # Gestion profils
    ├── analyse.js      # Analyse IA + affichage
    ├── security.js     # Anti-XSS (escapeHtml, sanitizeUrl)
    ├── legal.js        # Bannière cookies RGPD
    └── sw-register.js  # Enregistrement Service Worker
```

---

## 🚢 Déploiement

### Serveur CM3588 (Production)
```bash
# Déployer sur le serveur
scp -r . pi@192.168.1.100:~/offrly/
ssh pi@192.168.1.100 "pm2 restart offrly"
```
Voir `.agents/workflows/deploy-to-server.md` pour le workflow complet.

---

## 📄 Licence

MIT

---

*Créé avec ❤️ par OFFREZ*
