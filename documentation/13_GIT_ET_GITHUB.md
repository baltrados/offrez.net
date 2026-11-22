# 📘 OFFREZ — GIT & GITHUB
*Document 13 — Versionnement et déploiement*

---

## 1. PRINCIPE

**GitHub est la source de vérité du code.** Le PC local sert à développer ; Render déploie automatiquement la branche `main`.

```
PC local (branche)  →  GitHub (PR)  →  fusion dans main  →  Render (déploiement automatique)
```

| Élément | Où il vit | Versionné sur GitHub ? |
|---------|-----------|------------------------|
| Code source (HTML, JS, CSS, server.js) | GitHub | ✅ Oui |
| `.env` (clés API) | PC local ; variables d'environnement sur Render | ❌ Non |
| `node_modules/` | PC | ❌ Non (réinstaller avec `npm ci`) |

> L'ancien serveur CM3588 reste en production jusqu'à la bascule DNS vers Render : voir `COMMANDES_UTILES.md` (section « Ancien serveur ») et `15_DEPLOIEMENT_RENDER.md`.

---

## 2. DÉPÔT GITHUB

- **URL :** https://github.com/baltrados/offrez.net
- **Visibilité :** privé
- **Branche principale :** `main`

### Cloner le projet (nouveau PC)

```powershell
git clone https://github.com/baltrados/offrez.net.git
cd offrez.net
npm ci
copy .env.example .env
# Éditer .env avec vos clés API
npm start
```

---

## 3. WORKFLOW QUOTIDIEN

### Règles du projet

- Travailler sur une branche, **jamais de commit direct sur `main`**.
- Ouvrir une Pull Request (PR), puis fusionner dans `main` après vérification.
- Lancer `npm test` (et `npm run test:e2e` si le navigateur est concerné) avant la PR.
- Ne jamais pousser, fusionner ou déployer sans accord explicite.

```powershell
git switch main
git pull
git switch -c ma-branche          # 1. nouvelle branche

# 2. Modifier le code, lancer les tests...

git add <fichiers>                # 3. committer
git commit -m "Description claire du changement"
git push -u origin ma-branche     # 4. pousser, puis ouvrir la PR sur GitHub
```

### Déploiement

La fusion de la PR dans `main` déclenche le déploiement sur Render (voir `15_DEPLOIEMENT_RENDER.md`). Vérifier ensuite `https://offrez.net/api/health`.

---

## 4. FICHIER `.gitignore`

Le `.gitignore` empêche Git de versionner les fichiers sensibles ou inutiles.

| Exclu | Raison |
|-------|--------|
| `.env` | Clés API secrètes |
| `*.csv` | Exports de données éventuels (rien n'en génère plus) |
| `node_modules/` | Réinstallable via `npm install` |
| `backups_*/` | Sauvegardes manuelles locales |
| `.vscode/`, `*.bak` | Fichiers temporaires / IDE |

> ⚠️ Le `.gitignore` ne protège que l'avenir. Ne jamais committer un `.env` par erreur.

---

## 5. MODIFICATION CSS (cas particulier)

> 📁 Depuis le Lot 0 sécurité (nov. 2026), tous les fichiers servis au navigateur sont dans `public/`
> (HTML, `css/`, `js/`, images, `manifest.json`, `sw.js`…). Le serveur ne sert QUE ce dossier ;
> `server.js`, les CSV, `tools/` et la doc restent à la racine, hors web. Les URLs publiques sont inchangées.

Après modification d'un fichier dans `public/css/partials/` :

```powershell
# 1. Recompiler le CSS (à lancer depuis la racine du repo)
python tools/minify_css.py

# 2. Bumper le ?v= dans tous les HTML de public/
# Ex: style.min.css?v=202603151840 → style.min.css?v=YYYYMMDDHHMI

# 3. Committer sur une branche (déploiement par fusion dans main)
git add public/css/partials/ public/style.min.css public/*.html public/blog/*.html
git commit -m "CSS: description du changement"
```

---

## 6. SCRIPTS UTILES

| Script | Rôle |
|--------|------|
| `tools/minify_css.py` | Compilation CSS `public/css/partials/` → `public/style.min.css` |
| `tools/fontawesome/build_fa.py` | Régénération du sous-ensemble Font Awesome |

Les scripts de l'ancien serveur (`tools/deploy-server.sh`, `tools/setup-server-git.sh`) restent dans le dépôt jusqu'à la bascule vers Render, puis seront supprimés.

---

## 7. DÉPANNAGE GIT

### `src refspec main does not match any`

La branche s'appelle autrement (ex. faute de frappe `mai`). Corriger :
```powershell
git branch -M main
git push -u origin main
```

### `Repository not found` au push

- Vérifier l'URL : `https://github.com/baltrados/offrez.net.git`
- Vérifier que le dépôt existe et que vous êtes authentifié (PAT si demandé)

---

*Dernière mise à jour : novembre 2026*
