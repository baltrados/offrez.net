# 🛠️ COMMANDES UTILES - OFFREZ

## 📦 Commandes Terminal (npm / node)

### Démarrage du serveur
```bash
npm start
# ou directement :
node server.js
```
Le site sera accessible sur `http://localhost:3000`

### Voir les statistiques
```bash
npm run stats
# ou directement :
node admin-stats.js
```
Affiche :
- Visiteurs du jour
- Emails récoltés
- Taux de conversion
- Totaux depuis le début

### Arrêter le serveur
```bash
# Windows (PowerShell) :
Get-Process -Name "node" | Stop-Process -Force

# Windows (CMD) :
taskkill /F /IM node.exe

# Ou simplement : Ctrl+C dans le terminal
```

### Installer les dépendances (si nouveau PC)
```bash
npm install
```

### Build CSS (après modification d'un partial)
```bash
# Compiler les 12 partiels en style.min.css
python minify_css.py

# Bumper le cache-busting dans les HTML
# Remplacer l'ancien ?v= par un nouveau timestamp
# Ex: style.min.css?v=202603050130
```

---

## 🔧 Commandes Console F12 (Navigateur)

### Activer le mode DEBUG
Ouvre la console (F12 > Console) et tape :
```javascript
// Dans analyse.js - recharge la page après
localStorage.setItem('OFFREZ_debug', 'true');
location.reload();
```

### Voir les données stockées
```javascript
// Voir la configuration actuelle
JSON.parse(localStorage.getItem('giftConfig'));

// Voir les profils sauvegardés
JSON.parse(localStorage.getItem('finalData'));

// Voir le consentement cookies
localStorage.getItem('OFFREZ_cookie_consent');
```

### Effacer les données (reset complet)
```javascript
// Tout effacer (attention !)
localStorage.clear();
location.reload();
```

### Effacer uniquement les profils
```javascript
localStorage.removeItem('finalData');
localStorage.removeItem('OFFREZConfig');
location.reload();
```

### Tester une recherche Amazon manuellement
```javascript
fetch('/api/search?term=livre&min_price=10&max_price=50')
  .then(r => r.json())
  .then(data => console.log(data));
```

### Tester l'API Gemini manuellement
```javascript
fetch('/api/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: 'Dis bonjour' })
}).then(r => r.json()).then(console.log);
```

### Voir les cookies
```javascript
document.cookie;
```

---

## 📊 Fichiers de Données (CSV)

| Fichier | Contenu | Ouvrir avec |
|---------|---------|-------------|
| `emails.csv` | Liste des inscrits email | Excel |
| `searches.csv` | Historique des recherches | Excel |
| `clicks.csv` | Clics vers Amazon | Excel |

### Exporter les données (PowerShell)
```powershell
# Copier les CSV vers le Bureau
Copy-Item emails.csv, searches.csv, clicks.csv $env:USERPROFILE\Desktop\
```

---

## 🔐 Variables d'Environnement (.env)

| Variable | Description |
|----------|-------------|
| `GEMINI_API_KEY` | Clé API Google Gemini |
| `RAPIDAPI_KEY` | Clé API RapidAPI (Amazon) |
| `PORT` | Port du serveur (défaut: 3000) |

### Vérifier les clés (PowerShell)
```powershell
Get-Content .env
```

---

## 🖥️ Commandes Serveur (CM3588)

### Voir l'état du serveur
```powershell
ssh pi@192.168.1.100 "pm2 status"
```

### Voir les logs
```powershell
ssh pi@192.168.1.100 "pm2 logs offrly --lines 20"
```

### Redémarrer le serveur
```powershell
ssh pi@192.168.1.100 "pm2 restart offrly"
```

### Déployer un fichier
```powershell
scp "c:\site cadeau\save\FICHIER" pi@192.168.1.100:~/offrly/FICHIER
```

---

## 🐛 Dépannage Rapide

### Le serveur ne démarre pas
```bash
# Vérifier si le port est déjà utilisé
netstat -ano | findstr :3000

# Tuer le processus qui bloque
taskkill /F /PID <numero_du_PID>
```

### L'API Amazon renvoie une erreur
1. Vérifier la clé RapidAPI dans `.env`
2. Vérifier le quota sur [rapidapi.com](https://rapidapi.com)
3. Redémarrer le serveur après modification du `.env`

### Les pages ne se mettent pas à jour
```bash
# Vider le cache navigateur : Ctrl+Shift+R
# Ou en console F12 :
location.reload(true);
```

### Réinitialiser tout le localStorage utilisateur
```javascript
localStorage.clear();
sessionStorage.clear();
location.href = '/';
```

---

## 📱 URLs Importantes

| Page | URL |
|------|-----|
| Accueil | `http://localhost:3000/` |
| Configuration | `http://localhost:3000/config.html` |
| Profils | `http://localhost:3000/profils.html` |
| Analyse | `http://localhost:3000/analyse.html` |
| Mentions Légales | `http://localhost:3000/mentions-legales.html` |

---

## 🚀 Checklist Avant Mise en Production


3. ✅ Clés API valides dans `.env`
4. ✅ HTTPS configuré (Let's Encrypt)
5. ✅ Domaine pointé vers le serveur
6. ✅ Mentions légales à jour

---

*Dernière mise à jour : Mars 2026*
