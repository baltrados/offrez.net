---
description: Deploy changes to CM3588 production server and manage OFFREZ remotely
---

# Déployer sur le serveur CM3588

## Informations de connexion

- **Serveur** : CM3588 (Rockchip RK3588, 4 Go RAM, Debian, SD 32 Go)
- **IP locale** : `192.168.1.100`
- **Utilisateur** : `pi`
- **Authentification** : Clé SSH (pas de mot de passe nécessaire)
- **Projet distant** : `~/offrly/`
- **Projet local** : `c:\site cadeau\save\`
- **Process Manager** : PM2 (process name: `offrly`)
- **Port** : 3000

## Commandes de connexion SSH

// turbo-all

### Exécuter une commande sur le serveur
```powershell
ssh pi@192.168.1.100 "COMMANDE_ICI"
```

### Vérifier que le serveur tourne
```powershell
ssh pi@192.168.1.100 "pm2 status"
```

### Voir les logs
```powershell
ssh pi@192.168.1.100 "pm2 logs offrly --lines 20"
```

## ⚠️ RÈGLE N°1 : TOUJOURS SYNCHRONISER AVANT DE MODIFIER

Le serveur peut avoir des fichiers plus récents que le local. **TOUJOURS** tirer du serveur avant de toucher un fichier.

### Structure CSS
```
├── css/partials/              ← 12 fichiers CSS modulaires (source de vérité)
├── style.min.css              ← Généré par python minify_css.py
├── style.css                  ← Ancien monolithique (NE PLUS MODIFIER)
```

### Étape 1 : Synchroniser serveur → local (OBLIGATOIRE)
```powershell
# Tirer TOUS les fichiers du serveur vers le local
scp -r pi@192.168.1.100:~/offrly/* "c:\site cadeau\save\"
```

Ou pour un fichier spécifique :
```powershell
scp pi@192.168.1.100:~/offrly/CHEMIN_DU_FICHIER "c:\site cadeau\save\CHEMIN_DU_FICHIER"
```

### Étape 2 : Créer un backup sur le serveur (OBLIGATOIRE)
```powershell
ssh pi@192.168.1.100 "cp ~/offrly/FICHIER ~/offrly/FICHIER.bak"
```

### Étape 3 : Modifier le fichier localement
Faire les modifications dans `c:\site cadeau\save\`

### Étape 4 : Déployer local → serveur
```powershell
scp "c:\site cadeau\save\CHEMIN_DU_FICHIER" pi@192.168.1.100:~/offrly/CHEMIN_DU_FICHIER
```

### Étape 5 : Redémarrer si nécessaire
```powershell
# Seulement pour les fichiers JS côté serveur (server.js)
ssh pi@192.168.1.100 "pm2 restart offrly"
```

### Étape 5b : Si modification CSS — Build + cache-bust
```powershell
# 1. Minifier les partiels en style.min.css
python minify_css.py

# 2. Bumper le ?v= dans tous les HTML (remplacer l'ancien timestamp)
# Ex: style.min.css?v=202603030910 → style.min.css?v=YYYYMMDDHHMI

# 3. Déployer le CSS ET les HTML
scp "c:\site cadeau\save\style.min.css" pi@192.168.1.100:~/offrly/style.min.css
scp c:\site cadeau\save\*.html pi@192.168.1.100:~/offrly/

# 4. Restart PM2 (le serveur cache les HTML)
ssh pi@192.168.1.100 "pm2 restart offrly"
```

### Si ça casse : restaurer le backup
```powershell
ssh pi@192.168.1.100 "cp ~/offrly/FICHIER.bak ~/offrly/FICHIER"
```

### Exemples courants
```powershell
# Déployer le CSS (build + deploy + cache-bust)
python minify_css.py
scp "c:\site cadeau\save\style.min.css" pi@192.168.1.100:~/offrly/style.min.css
# ⚠️ Bumper le ?v= dans TOUS les HTML (sinon cache navigateur)
# Puis déployer les HTML modifiés :
scp "c:\site cadeau\save\*.html" pi@192.168.1.100:~/offrly/

# Déployer un fichier JS frontend
scp "c:\site cadeau\save\js\analyse.js" pi@192.168.1.100:~/offrly/js/analyse.js

# Déployer server.js (+ restart obligatoire)
scp "c:\site cadeau\save\server.js" pi@192.168.1.100:~/offrly/server.js
ssh pi@192.168.1.100 "pm2 restart offrly"
```

## Lancer un tunnel Cloudflare (temporaire)
```powershell
ssh pi@192.168.1.100 "nohup cloudflared tunnel --url http://localhost:3000 > ~/cloudflared.log 2>&1 &"
ssh pi@192.168.1.100 "sleep 3 && grep trycloudflare.com ~/cloudflared.log"
```

## Dépannage

### Le serveur ne répond pas
```powershell
ssh pi@192.168.1.100 "pm2 status && pm2 restart offrly"
```

### Voir les erreurs
```powershell
ssh pi@192.168.1.100 "pm2 logs offrly --err --lines 30"
```

### Vérifier l'espace disque
```powershell
ssh pi@192.168.1.100 "df -h /"
```

### Vérifier la température CPU
```powershell
ssh pi@192.168.1.100 "echo CPU: $(($(cat /sys/class/thermal/thermal_zone0/temp)/1000))°C"
```

### Vérifier que les fichiers sensibles sont protégés
```powershell
ssh pi@192.168.1.100 "curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/server.js && echo ' server.js' && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/emails.csv && echo ' emails.csv' && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/visitors.json && echo ' visitors.json' && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/.env && echo ' .env'"
```
Tous les fichiers sensibles doivent retourner **404**, seul `.env` retournait déjà 404 avant le fix.

### Vérifier l'encodage UTF-8 (AVANT chaque déploiement de HTML)
```powershell
ssh pi@192.168.1.100 "find ~/offrly -maxdepth 3 -name '*.html' -not -path '*/node_modules/*' -not -path '*/backups*' -exec file -i {} \; | grep -v utf-8 | grep -v us-ascii"
```
**Attendu** : aucune sortie. Si un fichier apparaît → il est mal encodé (probablement ISO-8859-1). Convertir avec :
```bash
iconv -f ISO-8859-1 -t UTF-8 fichier.html > fichier_utf8.html && mv fichier_utf8.html fichier.html
```

## Notes importantes

- **Encodage** : Un `.editorconfig` à la racine force UTF-8 + LF sur tout le projet. Ne jamais éditer les HTML avec le Notepad classique Windows (il sauvegarde en ANSI/ISO-8859-1).
- **style.css** : Le fichier source monolithique n'est plus utilisé directement. Le CSS est dans `css/partials/` (12 fichiers en UTF-8). Lancer `python minify_css.py` pour générer `style.min.css`.
- **sudo** : Les commandes sudo requièrent le mot de passe de l'utilisateur, demander à l'utilisateur de les exécuter manuellement en SSH.
- **PM2** : `pm2 restart offrly` après modification de `server.js`. Pour CSS : `python minify_css.py` + `scp` + bump `?v=` dans les HTML. Pour HTML : `scp` + `pm2 restart offrly` (le serveur cache les HTML).
- **Cloudflare Tunnel** : Le tunnel rapide donne une URL aléatoire temporaire. Pour un domaine permanent, il faut configurer un tunnel nommé via le dashboard Cloudflare.
- **Sécurité** : Un middleware bloque l'accès aux fichiers sensibles (.env, server.js, CSV, JSON, MD). Vérifier après chaque déploiement avec la commande ci-dessus.
