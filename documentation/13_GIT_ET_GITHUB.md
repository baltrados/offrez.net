# 📘 OFFREZ — GIT & GITHUB
*Document 13/13 — Versionnement et déploiement*

---

## 1. PRINCIPE

**GitHub est la source de vérité du code.** Le PC local sert à développer, le serveur CM3588 sert à exécuter.

```
GitHub (privé)          PC local                 Serveur CM3588
baltrados/offrez.net ←→ c:\site cadeau\save  ←→  ~/offrly/
     ↑                        ↑                        ↑
  Historique              Développement              Production
```

| Élément | Où il vit | Versionné sur GitHub ? |
|---------|-----------|------------------------|
| Code source (HTML, JS, CSS, server.js) | GitHub | ✅ Oui |
| `.env` (clés API) | PC + serveur uniquement | ❌ Non |
| `*.csv`, `visitors.json` (données RGPD) | Serveur uniquement | ❌ Non |
| `node_modules/` | PC + serveur | ❌ Non (réinstaller avec `npm install`) |

---

## 2. DÉPÔT GITHUB

- **URL :** https://github.com/baltrados/offrez.net
- **Visibilité :** privé
- **Branche principale :** `main`

### Cloner le projet (nouveau PC)

```powershell
git clone https://github.com/baltrados/offrez.net.git
cd offrez.net
npm install
copy .env.example .env
# Éditer .env avec vos clés API
npm start
```

---

## 3. WORKFLOW QUOTIDIEN

### Sur le PC (développement)

```powershell
cd "C:\site cadeau\save"

# 1. Récupérer la dernière version
git pull

# 2. Modifier le code...

# 3. Committer et pousser
git add .
git commit -m "Description claire du changement"
git push
```

### Sur le serveur (déploiement)

```powershell
ssh pi@192.168.1.100 "~/offrly/deploy.sh"
```

Le script `deploy.sh` exécute automatiquement :
1. `git fetch origin main`
2. `git checkout -f -B main origin/main`
3. `git pull --ff-only origin main`
4. `pm2 restart offrly`
5. Vérification `/api/health`

---

## 4. FICHIER `.gitignore`

Le `.gitignore` empêche Git de versionner les fichiers sensibles ou inutiles.

| Exclu | Raison |
|-------|--------|
| `.env` | Clés API secrètes |
| `*.csv`, `visitors.json` | Données utilisateurs (RGPD) |
| `node_modules/` | Réinstallable via `npm install` |
| `backups_*/` | Sauvegardes manuelles locales |
| `.vscode/`, `*.bak` | Fichiers temporaires / IDE |

> ⚠️ Le `.gitignore` ne protège que l'avenir. Ne jamais committer un `.env` par erreur.

---

## 5. MODIFICATION CSS (cas particulier)

Après modification d'un fichier dans `css/partials/` :

```powershell
# 1. Recompiler le CSS
python tools/minify_css.py

# 2. Bumper le ?v= dans tous les HTML
# Ex: style.min.css?v=202603151840 → style.min.css?v=YYYYMMDDHHMI

# 3. Committer et déployer
git add css/partials/ style.min.css *.html
git commit -m "CSS: description du changement"
git push
ssh pi@192.168.1.100 "~/offrly/deploy.sh"
```

---

## 6. CONFIGURATION GIT SUR LE SERVEUR (installation initiale)

> ✅ Déjà fait sur le CM3588 en juin 2026. Cette section sert de référence en cas de réinstallation.

### 6.1 Script d'installation

```bash
# Sur le serveur, depuis une copie du script :
bash tools/setup-server-git.sh
```

Le script :
- Crée une clé SSH dédiée (`~/.ssh/offrez_deploy`)
- Configure `~/.ssh/config` (alias `github.com-offrez`)
- Initialise Git dans `~/offrly/`
- Affiche la clé publique à ajouter sur GitHub

### 6.2 Ajouter la deploy key sur GitHub

1. Ouvrir : https://github.com/baltrados/offrez.net/settings/keys
2. **Add deploy key** → coller la clé publique affichée
3. Title : `CM3588 offrly`
4. **Ne pas** cocher « Allow write access » (lecture seule)

### 6.3 Premier déploiement

```powershell
ssh pi@192.168.1.100 "~/offrly/deploy.sh"
```

Au premier lancement, le checkout force (`-f`) aligne les fichiers existants sur GitHub sans toucher à `.env` ni aux CSV.

---

## 7. SCRIPTS UTILES

| Script | Emplacement | Rôle |
|--------|-------------|------|
| `tools/deploy-server.sh` | GitHub (source) | Recette de déploiement versionnée |
| `~/offrly/deploy.sh` | Serveur (copie active) | Raccourci exécuté en prod |
| `tools/setup-server-git.sh` | GitHub | Installation Git initiale serveur |
| `check_sync.js` | GitHub | Comparer MD5 local vs serveur (legacy) |

> Après modification de `tools/deploy-server.sh`, recopier sur le serveur :
> ```powershell
> scp tools/deploy-server.sh pi@192.168.1.100:~/offrly/deploy.sh
> ```

---

## 8. DÉPANNAGE GIT

### `src refspec main does not match any`

La branche s'appelle autrement (ex. faute de frappe `mai`). Corriger :
```powershell
git branch -M main
git push -u origin main
```

### `Repository not found` au push

- Vérifier l'URL : `https://github.com/baltrados/offrez.net.git`
- Vérifier que le dépôt existe et que vous êtes authentifié (PAT si demandé)

### `untracked working tree files would be overwritten` (serveur)

Normal au **premier** checkout. Le script `deploy.sh` utilise `git checkout -f` pour résoudre ce cas.

### `Permission denied (publickey)` (serveur)

La deploy key n'est pas configurée sur GitHub. Refaire la section 6.2.

### Vérifier l'état Git sur le serveur

```powershell
ssh pi@192.168.1.100 "cd ~/offrly && git status && git log -1 --oneline"
```

---

## 9. FALLBACK : SCP (urgence uniquement)

Si Git est indisponible, déploiement manuel d'un fichier :

```powershell
scp "C:\site cadeau\save\FICHIER" pi@192.168.1.100:~/offrly/FICHIER
ssh pi@192.168.1.100 "pm2 restart offrly"
```

> ⚠️ Toujours recommitter sur GitHub après un déploiement SCP pour resynchroniser l'historique.

---

*Dernière mise à jour : juin 2026*
