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
# Cloner le dépôt (privé)
git clone https://github.com/baltrados/offrez.net.git
cd offrez.net

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env
# Éditer .env avec vos clés API

# Lancer le serveur
npm start
```

Ouvrir **http://localhost:3000**

> Projet local existant : `c:\site cadeau\save\` — toujours faire `git pull` avant de modifier.

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

**Source de vérité :** [GitHub — baltrados/offrez.net](https://github.com/baltrados/offrez.net) (privé)

### Workflow standard

```powershell
# 1. Sur le PC : committer et pousser
git add .
git commit -m "Description du changement"
git push

# 2. Déployer sur le serveur CM3588
ssh pi@192.168.1.100 "~/offrly/deploy.sh"
```

### Documentation

- **Git & GitHub :** `documentation/13_GIT_ET_GITHUB.md`
- **Commandes :** `COMMANDES_UTILES.md`
- **Setup serveur :** `documentation/11_SETUP_CM3588_SERVEUR.md`
- **Archive :** `documentation/archive/` (anciennes docs, lecture seule)

---

## 📄 Licence

MIT

---

*Créé avec ❤️ par OFFREZ*
