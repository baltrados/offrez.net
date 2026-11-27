# 15 - DÉPLOIEMENT SUR RENDER

Hébergement cible : Render, offre gratuite, région Frankfurt (UE), une seule instance. Render déploie automatiquement la branche `main`. Le domaine `offrez.net` est conservé.

L'ancien serveur (CM3588, PM2, tunnel Cloudflare) est décommissionné depuis novembre 2026 : la bascule DNS (section 5) et le nettoyage (section 6) sont faits.

---

## 1. Variables d'environnement

Dashboard Render > service > Environment > Add Environment Variable.

| Variable | Valeur | Remarque |
|----------|--------|----------|
| `GEMINI_API_KEY` | clé Google Gemini | OBLIGATOIRE, secrète |
| `RAPIDAPI_KEY` | clé RapidAPI | OBLIGATOIRE, secrète |
| `NODE_ENV` | `production` | OBLIGATOIRE |
| `GEMINI_DAILY_LIMIT` | `100` | plafond global par jour ; `0` = service coupé |
| `RAPIDAPI_DAILY_LIMIT` | `150` | plafond global par jour ; `0` = service coupé |
| `GEMINI_DAILY_LIMIT_PER_IP` | `35` | |
| `RAPIDAPI_DAILY_LIMIT_PER_IP` | `70` | |
| `TRUST_PROXY` | `3` | Cloudflare, répartiteur Render et proxy local devant l'application (mesuré en production le 23/11/2026) ; valeur par défaut du code |
| `TZ` | `Europe/Paris` | les quotas repartent à minuit, heure de Paris |
| `GEMINI_MODEL` | (vide) | modèle par défaut du code : `gemini-3.5-flash-lite` |

- Ne PAS définir `PORT` : Render l'injecte lui-même.
- Ne plus définir `BREVO_API_KEY`, `IP_HASH_SALT`, `MAX_CSV_BYTES` (supprimés).

---

## 2. Plafonds durs chez les fournisseurs

Indispensable : les compteurs du site repartent à zéro à chaque redémarrage, et l'offre gratuite de Render s'endort après environ 15 minutes sans visite, donc redémarre souvent.

- Google Cloud Console > API « Generative Language API » > Quotas : fixer « requests per day ». Une simple alerte budgétaire ne coupe rien.
- RapidAPI : choisir un plan sans dépassement payant (hard limit).

---

## 3. Création du service (après la fusion de la PR dans `main`)

1. render.com > New > Web Service > connecter GitHub > dépôt `baltrados/offrez.net`.
2. Branch : `main`. Region : Frankfurt (EU Central). Runtime : Node.
3. Build Command : `npm ci --omit=dev`. Start Command : `npm start`.
4. Instance type : Free.
5. Advanced > Health Check Path : `/api/health`.
6. Ajouter les variables de la section 1, puis Create Web Service.
7. Tester l'adresse provisoire `https://<nom-du-service>.onrender.com` : page d'accueil, une recherche complète, installation de la PWA.

---

## 4. Préproduction (avant de toucher au DNS)

- Vérifier que deux appareils sur deux réseaux différents (wifi et 4G) ne partagent pas le même quota : si l'un est bloqué à cause de l'autre, `TRUST_PROXY` est mal réglé.
- **Vérifier `TRUST_PROXY` (l'IP vue par le serveur ne doit pas être falsifiable).** Envoyer `GET https://<service>.onrender.com/api/search?term=x` : la réponse est un 400 (terme trop court) qui ne coûte rien mais est comptée par le limiteur ; lire l'en-tête `RateLimit-Remaining` de la réponse.
  1. Depuis deux réseaux différents (4G et box), les compteurs doivent être indépendants.
  2. Depuis un même poste, relancer avec `curl -si -H "X-Forwarded-For: 1.2.3.N" "https://<service>.onrender.com/api/search?term=x" | grep -i ratelimit-remaining` en changeant `N` à chaque appel : le compteur doit continuer à baisser. S'il repart de zéro, l'IP est falsifiable : baisser `TRUST_PROXY` (la valeur doit correspondre au nombre exact de proxys devant l'application).
- Regarder les logs Render : aucun avertissement `ERR_ERL_` (express-rate-limit), et au redéploiement une ligne `[SHUTDOWN]` (arrêt propre).

---

## 5. Bascule DNS de offrez.net

1. La veille : baisser le TTL des enregistrements `offrez.net` et `www` à 300 s (5 min).
2. Render > service > Settings > Custom Domains : ajouter `offrez.net` ET `www.offrez.net`. Render affiche les enregistrements exacts à créer : utiliser SES valeurs. En général :
   - `offrez.net` : enregistrement A vers l'IP indiquée par Render (ou ALIAS/ANAME vers `<service>.onrender.com` si le fournisseur DNS le permet) ;
   - `www.offrez.net` : CNAME vers `<service>.onrender.com`.
3. Chez le fournisseur DNS (Cloudflare si c'est lui qui gère `offrez.net`) :
   - supprimer ou remplacer les enregistrements actuels de `offrez.net` et `www` qui pointent vers le tunnel Cloudflare (CNAME vers `...cfargotunnel.com`) ;
   - créer ceux indiqués par Render ;
   - sur Cloudflare, mettre ces enregistrements en « DNS only » (nuage gris), pas en « Proxied » : sinon le certificat HTTPS de Render peut échouer, et il y aurait 2 proxys devant l'application (`TRUST_PROXY` devrait alors valoir 2) ;
   - NE PAS toucher à `ssh.offrez.net` tant que le CM3588 tourne.
4. Attendre que Render affiche « Verified » puis « Certificate issued » (quelques minutes à quelques heures).
5. Tester `https://offrez.net` et `https://www.offrez.net` (redirection vers `offrez.net`), faire une recherche complète, vérifier la PWA. L'application PWA déjà installée sur un téléphone continue de fonctionner (même domaine).
6. Garder le CM3588 allumé quelques jours en secours (retour arrière = remettre les anciens enregistrements DNS).

---

## 6. Après la bascule : nettoyage de l'ancien serveur (fait)

- Les scripts et la configuration du CM3588 (`tools/deploy-server.sh`, `tools/setup-server-git.sh`, `ssh-tunnel.yml`, `documentation/11_SETUP_CM3588_SERVEUR.md`) ont été retirés du dépôt. Les lignes Cloudflare du `.gitignore` sont gardées par prudence (elles empêchent de committer un fichier d'identifiants par erreur).
- Le CM3588 est décommissionné : plus aucune donnée ni clé dessus.
- Reste conseillé : supprimer le tunnel et l'enregistrement `ssh.offrez.net` chez Cloudflare s'ils existent encore, et régénérer les clés Gemini et RapidAPI (elles ont été stockées sur le CM3588) puis mettre les nouvelles dans Render.

---

## 7. Couper le service en urgence

Dans Render > Environment, mettre `GEMINI_DAILY_LIMIT=0` et/ou `RAPIDAPI_DAILY_LIMIT=0`. Render redémarre automatiquement le service. La valeur `0` coupe l'appel concerné (réponse 503 avec `Retry-After`) sans toucher au reste du site. Pour rétablir, remettre `100` / `150`.

---

## 8. Limites connues du MVP

- Compteurs de quotas et caches sont en mémoire : ils sont remis à zéro à chaque redémarrage ou réveil de l'offre gratuite. D'où l'importance des plafonds durs chez les fournisseurs (section 2).
- Un attaquant peut faire redémarrer l'instance gratuite (réveil après sommeil) et ainsi remettre les compteurs à zéro : les plafonds durs chez Google et RapidAPI (section 2) sont donc obligatoires, pas facultatifs.
- Option palliative : une sonde externe gratuite qui appelle `/api/health` toutes les 10 minutes évite le sommeil de l'instance (elle ne couvre pas les redéploiements, qui remettent aussi les compteurs à zéro).
- Une seule instance est obligatoire : avec plusieurs instances, les compteurs ne seraient pas partagés (il faudrait un stockage commun, par exemple Redis).
- `TZ=Europe/Paris` est nécessaire : sans lui, les quotas journaliers et le `Retry-After` suivent l'heure du serveur (UTC).
