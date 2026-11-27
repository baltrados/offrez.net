# Commandes utiles - OFFREZ

## npm / Node

```bash
npm ci                 # installer les dépendances (exactement le package-lock.json)
npm start              # démarrer le serveur (http://localhost:3000)
npm test               # unitaires puis intégration
npm run test:unit      # unitaires seulement
npm run test:integration   # intégration seulement
npm run test:e2e       # Playwright (serveur de test sur le port 3100)
npm run test:e2e:ui    # Playwright en mode interface
```

Arrêter le serveur : `Ctrl+C` dans le terminal (arrêt propre), ou sous PowerShell `Get-Process -Name node | Stop-Process -Force`.

### Build CSS (après modification d'un fichier de `public/css/partials/`)

```bash
python tools/minify_css.py
# puis changer le jeton ?v= de style.min.css dans tous les HTML de public/
# et incrémenter CACHE_NAME dans public/sw.js
```

## Variables d'environnement (.env)

Modèle : `.env.example`. Variables : `GEMINI_API_KEY`, `RAPIDAPI_KEY`, `NODE_ENV`, `PORT`, `GEMINI_MODEL`, `GEMINI_DAILY_LIMIT`, `RAPIDAPI_DAILY_LIMIT`, `GEMINI_DAILY_LIMIT_PER_IP`, `RAPIDAPI_DAILY_LIMIT_PER_IP`, `TRUST_PROXY`, `TZ`. Redémarrer le serveur après toute modification.

## Git

Règles : travailler sur une branche, jamais de commit direct sur `main`, PR puis fusion.

```bash
git status
git log -5 --oneline
git switch -c ma-branche      # nouvelle branche
git add <fichiers>
git commit -m "Description"
git push -u origin ma-branche
```

Voir `documentation/13_GIT_ET_GITHUB.md`.

## Vérifier en production

```bash
curl https://offrez.net/api/health          # attendu : {"status":"ok"}
curl -si "https://offrez.net/api/search?term=livre&min_price=10&max_price=50" | grep -i ratelimit
```

L'en-tête `X-Cache` (`HIT` = réponse servie par le cache, aucun appel payant ; `MISS` = appel au fournisseur) est visible uniquement en local (hors production). Les réponses 429 et 503 portent un en-tête `Retry-After`. Sur l'offre gratuite de Render, le premier appel après une période d'inactivité peut prendre une minute (réveil du service).

## Console du navigateur (F12)

```javascript
localStorage.setItem('OFFREZ_debug', 'true'); location.reload();   // mode debug
JSON.parse(localStorage.getItem('giftConfig'));                      // configuration
localStorage.clear(); sessionStorage.clear(); location.href = '/';   // tout réinitialiser
fetch('/api/search?term=livre&min_price=10&max_price=50').then(r => r.json()).then(console.log);
```

`/api/analyze` n'accepte pas de texte libre : il attend un profil structuré (voir `lib/analyze.js`), sinon il répond 400.

## Dépannage

- Port déjà utilisé : `netstat -ano | findstr :3000`, puis `taskkill /F /PID <PID>`.
- Erreur Amazon : vérifier `RAPIDAPI_KEY`, l'abonnement RapidAPI et son quota.
- Pages non mises à jour : `Ctrl+Shift+R`.

*Dernière mise à jour : novembre 2026*
