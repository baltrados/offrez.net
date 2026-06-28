---
description: Guide d'audit intelligent pour détecter bugs, incohérences et régressions dans le projet OFFREZ
---

# 🔍 Audit Intelligent — Projet OFFREZ

## Rôle

Tu es un **auditeur**. Tu ne modifies RIEN. Tu produis un rapport avec tes découvertes classées par sévérité (🔴 critique, 🟡 moyen, 🟢 mineur). Tu vérifies la **cohérence** entre le code, la documentation, le serveur et le navigateur.

---

## 1. Audit CSS — Cohérence source ↔ production

### 1.1 Vérifier que `style.min.css` est à jour

```powershell
# Regénérer et comparer
python minify_css.py
# Si le fichier a changé → les sources ont évolué sans rebuild
fc style.min.css style.min.css.bak
```

**Chercher** : des classes dans les partiels (`css/partials/`) qui ne sont pas dans `style.min.css`.

### 1.2 Vérifier le cache-busting

```powershell
# Extraire le ?v= de chaque HTML
Select-String -Path "c:\site cadeau\save\*.html" -Pattern "style\.min\.css\?v=(\d+)" | ForEach-Object { "$($_.Filename): $($_.Matches.Groups[1].Value)" }
```

**Chercher** : des `?v=` différents entre les HTML → un fichier a été oublié lors du bump.

### 1.3 Vérifier la synchro local ↔ serveur

```powershell
# Taille locale vs serveur
(Get-Item "c:\site cadeau\save\style.min.css").Length
ssh pi@192.168.1.100 "wc -c ~/offrly/style.min.css"
```

**Chercher** : tailles différentes → déploiement oublié ou partiel.

### 1.4 Classes CSS orphelines

Lancer ce script pour trouver les classes définies dans le CSS mais jamais utilisées dans HTML/JS :

```powershell
python /tmp/css_audit2.py
```

Ou faire une recherche manuelle : pour chaque classe dans les partiels, vérifier sa présence dans les `.html` et `js/*.js`.

### 1.5 Mobile responsive

Ouvrir chaque page dans le navigateur en **375×812** (iPhone) et vérifier :

| Page | Points de contrôle |
|---|---|
| `index.html` | Pas de scroll horizontal, CTA visible, cards en 1 colonne |
| `config.html` | Chips wrappent, budget cards empilées, bouton pleine largeur |
| `profils.html` | `.form-grid` en 1 colonne, pas d'overflow, inputs lisibles |
| `analyse.html` | Gift cards en 1 colonne, panier accessible, modale centrée |
| Pages légales | Texte lisible, pas de débordement de tableau |

---

## 2. Audit JS — Cohérence code ↔ comportement

### 2.1 localStorage : clés et format

Vérifier que les clés lues correspondent aux clés écrites :

| Clé | Écrite par | Lue par | Format attendu |
|---|---|---|---|
| `giftConfig` | `config.js` | `profils.js` | `{occasion, nb, strategy, amount}` |
| `finalData` | `profils.js` | `analyse.js` | `{contexte, equipe: [{nom,sexe,age,budget,tags,details}]}` |
| `OFFREZ_cookie_consent` | `legal.js` | `api.js` | `{accepted:bool, date, expiry}` |

**Chercher** : une clé écrite sous un nom mais lue sous un autre (ex: `cookieConsent` vs `OFFREZ_cookie_consent`).

### 2.2 Prompt IA ↔ Parsing

Le prompt dans `analyse.js` (~L180-245) demande un format JSON. Vérifier que :
- Le nombre de suggestions demandé (`2`) correspond à ce que le code attend (`slice(0, X)`)
- Le format JSON demandé dans le prompt correspond au parsing dans `api.js` (`callGemini`)
- Les champs du prompt (`term`, `reason`, `prix_estime`) sont utilisés côté affichage

### 2.3 Rate limits et erreurs

Vérifier dans `server.js` :
- Les rate limits sont cohérentes (ex: `/api/analyze` = 20/min, `/api/search` = 40/min)
- Les messages d'erreur sont propres en `NODE_ENV=production` (pas de stack traces)
- Les erreurs API (Gemini 429, Amazon 503) ont des fallbacks

### 2.4 Sécurité

```powershell
# Tester que les fichiers sensibles sont bloqués
ssh pi@192.168.1.100 "for f in server.js emails.csv clicks.csv visitors.json .env admin-stats.js package.json; do echo -n \"$f: \"; curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/$f; echo; done"
```

**Attendu** : tout en `404` sauf potentiellement `manifest.json` en `200`.

**Chercher** aussi :
- XSS : les données utilisateur (prénom, tags) passent-elles par `escapeHtml()` avant affichage ?
- CORS : est-il restreint à `offrez.net` en production ?
- CSP headers : sont-ils en place ?

---

## 3. Audit HTML — Cohérence structure ↔ CSS ↔ JS

### 3.1 Scripts et styles chargés

Pour chaque HTML, vérifier :
- `style.min.css?v=XXXXX` est chargé (pas `style.css`)
- Les scripts JS sont les bons et dans le bon ordre
- Pas de `<script>` inline (interdit par CSP)

### 3.2 IDs et classes référencés

Vérifier que chaque `id="xxx"` référencé dans le JS (`getElementById`, `querySelector('#xxx')`) existe dans le HTML correspondant.

```powershell
# Extraire les getElementById du JS
Select-String -Path "c:\site cadeau\save\js\*.js" -Pattern "getElementById\(['""](\w+)['""]\)" -AllMatches | ForEach-Object { $_.Matches | ForEach-Object { $_.Groups[1].Value } } | Sort-Object -Unique
```

Puis vérifier chacun dans les HTML.

### 3.3 SEO et accessibilité

| Check | Comment vérifier |
|---|---|
| `<title>` unique par page | Grep `<title>` dans chaque HTML |
| `<meta description>` | Grep `meta name="description"` |
| Un seul `<h1>` par page | Grep `<h1>` — doit être unique |
| `alt` sur les images | Grep `<img` sans `alt` |
| `aria-label` sur les boutons icône | Grep `<button` et `<a` avec seulement des icônes |
| Contraste couleurs | Vérifier les textes gris (#94a3b8) sur fond sombre (#0f172a) |

---

## 4. Audit Documentation — Cohérence docs ↔ code

### 4.1 Termes obsolètes

Rechercher ces termes qui ne devraient plus exister dans la documentation :

```powershell
$terms = @("D:\\site cadeaux", "glass-card", "Double IA", "DEBUG_MODE", "3 suggestions", "Gemini Pro", "Vercel", "style.css (", "cookieConsent")
$docs = Get-ChildItem "c:\site cadeau\save\*.md" -Recurse | Where-Object { $_.FullName -notlike "*node_modules*" }
foreach ($t in $terms) {
    $found = $docs | Select-String -Pattern $t -SimpleMatch
    if ($found) { Write-Host "❌ '$t' dans: $($found.Filename -join ', ')" }
}
```

### 4.2 Chemins fichiers

Vérifier que les chemins mentionnés dans la doc existent réellement :

```powershell
# Extraire les fichiers référencés et vérifier leur existence
Select-String -Path "c:\site cadeau\save\*.md" -Pattern '`([a-zA-Z_/\\.-]+\.(js|css|html|py))`' -AllMatches | ForEach-Object { $_.Matches | ForEach-Object { $_.Groups[1].Value } } | Sort-Object -Unique
```

### 4.3 Workflow de déploiement

Vérifier que les étapes dans `deploy-to-server.md` sont complètes :
- [ ] Sync serveur → local mentionné
- [ ] Backup `.bak` mentionné
- [ ] `python minify_css.py` mentionné (pour modifs CSS)
- [ ] Bump `?v=` mentionné
- [ ] `pm2 restart` mentionné (pour server.js ET HTML)
- [ ] Chemin local correct (`c:\site cadeau\save\`)

---

## 5. Audit Serveur — État de production

### 5.1 Santé

```powershell
ssh pi@192.168.1.100 "curl -s http://localhost:3000/api/health" | python -m json.tool
```

**Vérifier** : `status: healthy`, uptime raisonnable, mémoire < 300 MB.

### 5.2 Fichiers sur le serveur

```powershell
# Comparer la liste des fichiers HTML/CSS/JS
ssh pi@192.168.1.100 "find ~/offrly -maxdepth 2 -name '*.html' -o -name '*.css' -o -name '*.js' | grep -v node_modules | sort"
```

**Chercher** : des fichiers manquants ou en trop par rapport au local.

### 5.3 PM2 et processus

```powershell
ssh pi@192.168.1.100 "pm2 status"
ssh pi@192.168.1.100 "pm2 logs offrly --err --lines 20"
```

**Chercher** : restarts fréquents, erreurs récurrentes, statut `errored`.

### 5.4 Espace disque et température

```powershell
ssh pi@192.168.1.100 "df -h / && echo '---' && echo CPU: $(($(cat /sys/class/thermal/thermal_zone0/temp)/1000))°C"
```

---

## 6. Audit Navigateur — Test fonctionnel (via browser tools)

### 6.1 Parcours utilisateur complet

1. Ouvrir `https://offrez.net/` — vérifier la landing page
2. Cliquer "C'est parti" → `config.html` doit s'ouvrir
3. Sélectionner une occasion + budget → cliquer "Suivant"
4. `profils.html` doit s'ouvrir avec le bon nombre de profils
5. Remplir un profil → cliquer "Révéler"
6. `analyse.html` doit afficher le spinner puis les résultats

**Chercher** : redirections cassées, localStorage perdu entre pages, erreurs console.

### 6.2 Test mobile (375×812)

Redimensionner le viewport à 375×812 et refaire le parcours. Vérifier :
- Pas de scroll horizontal sur aucune page
- Tous les boutons sont cliquables (touch target ≥ 44px)
- Le clavier virtuel ne cache pas les modales

### 6.3 Console navigateur

Ouvrir la console et chercher :
- Erreurs JS (TypeError, ReferenceError)
- Requêtes réseau en erreur (4xx, 5xx)
- Warnings CSP

---

## Format du rapport

```markdown
# 🔍 Rapport d'Audit — [DATE]

## Résumé
| Catégorie | 🔴 | 🟡 | 🟢 |
|---|---|---|---|
| CSS | X | X | X |
| JS | X | X | X |
| HTML | X | X | X |
| Serveur | X | X | X |
| Documentation | X | X | X |

## Détails
### 🔴 Critique — [Titre]
- **Fichier** : ...
- **Problème** : ...
- **Preuve** : ...
- **Correction suggérée** : ...

### 🟡 Moyen — [Titre]
...
```
