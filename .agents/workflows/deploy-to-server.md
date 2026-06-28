---
description: Deploy changes to CM3588 production server via GitHub and manage OFFREZ remotely
---

# Déployer sur le serveur CM3588

## Informations de connexion

- **Serveur** : CM3588 (Rockchip RK3588, 4 Go RAM, Debian, SD 32 Go)
- **IP locale** : `192.168.1.100`
- **Utilisateur** : `pi`
- **Authentification** : Clé SSH (pas de mot de passe nécessaire)
- **Projet distant** : `~/offrly/`
- **Projet local** : `c:\site cadeau\save\`
- **GitHub** : https://github.com/baltrados/offrez.net (branche `main`, privé)
- **Process Manager** : PM2 (process name: `offrly`)
- **Port** : 3000

## ⚠️ RÈGLE N°1 : GITHUB EST LA SOURCE DE VÉRITÉ

Ne plus éditer directement sur le serveur. Toujours :

```
git pull  →  modifier  →  git commit  →  git push  →  deploy.sh
```

Documentation complète : `documentation/13_GIT_ET_GITHUB.md`

---

## Workflow standard (recommandé)

### Sur le PC

```powershell
cd "C:\site cadeau\save"
git pull
# ... modifications ...
git add .
git commit -m "Description du changement"
git push
```

### Déployer en production

```powershell
ssh pi@192.168.1.100 "~/offrly/deploy.sh"
```

---

## Commandes SSH utiles

// turbo-all

```powershell
# État PM2
ssh pi@192.168.1.100 "pm2 status"

# Logs
ssh pi@192.168.1.100 "pm2 logs offrly --lines 20"

# État Git sur le serveur
ssh pi@192.168.1.100 "cd ~/offrly && git log -1 --oneline && git status --short"

# Healthcheck
ssh pi@192.168.1.100 "curl -s http://localhost:3000/api/health"
```

---

## Modification CSS

```powershell
python tools/minify_css.py
# Bumper ?v= dans tous les HTML
git add css/partials/ style.min.css *.html
git commit -m "CSS: description"
git push
ssh pi@192.168.1.100 "~/offrly/deploy.sh"
```

Structure CSS :
```
├── css/partials/     ← 12 fichiers source (modifier ici)
├── style.min.css     ← Généré par python tools/minify_css.py
├── style.css         ← Ancien monolithique (NE PLUS MODIFIER)
```

---

## Installation Git serveur (première fois uniquement)

```bash
# Sur le serveur
bash tools/setup-server-git.sh
# → Ajouter la deploy key affichée sur GitHub (Settings → Deploy keys)
~/offrly/deploy.sh
```

Deploy key : https://github.com/baltrados/offrez.net/settings/keys

---

## Fallback SCP (urgence)

Uniquement si Git est indisponible. **Recommitter sur GitHub ensuite.**

```powershell
scp "c:\site cadeau\save\FICHIER" pi@192.168.1.100:~/offrly/FICHIER
ssh pi@192.168.1.100 "pm2 restart offrly"
```

---

## Dépannage

### Le serveur ne répond pas
```powershell
ssh pi@192.168.1.100 "pm2 status && pm2 restart offrly"
```

### Erreurs PM2
```powershell
ssh pi@192.168.1.100 "pm2 logs offrly --err --lines 30"
```

### Fichiers sensibles protégés (doivent retourner 404)
```powershell
ssh pi@192.168.1.100 "for f in server.js emails.csv .env; do echo -n \"$f: \"; curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/$f; echo; done"
```

### Encodage UTF-8 des HTML
```powershell
ssh pi@192.168.1.100 "find ~/offrly -maxdepth 3 -name '*.html' -not -path '*/node_modules/*' -exec file -i {} \; | grep -v utf-8 | grep -v us-ascii"
```

---

## Notes importantes

- **`.env`** : jamais sur GitHub. Existe uniquement sur PC et serveur.
- **PM2** : `deploy.sh` redémarre automatiquement `offrly`.
- **Chemin projet** : `~/offrly/` (pas `~/OFFREZ/`)
- **PM2 name** : `offrly` (pas `OFFREZ`)
- **Encodage** : `.editorconfig` force UTF-8. Ne pas utiliser Notepad classique Windows.
