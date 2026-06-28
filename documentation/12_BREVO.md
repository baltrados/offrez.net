# 📧 BREVO — Gestion des Emails Marketing
*Document 12 — Intégration Brevo (anciennement Sendinblue) dans OFFREZ*

---

## 1. C'est quoi Brevo ?

**Brevo** (ex-Sendinblue) est un service externe de gestion d'emails marketing. Au lieu de stocker les emails des visiteurs dans un fichier CSV sur notre serveur (risque RGPD), on les envoie directement à Brevo via leur API.

### Pourquoi ce choix ?
| Avant (v2.0) | Après (v2.1) |
|---|---|
| Emails stockés dans `emails.csv` en clair | Emails envoyés à Brevo, **aucun stockage local** |
| IP du visiteur enregistrée | Plus aucune IP collectée pour les emails |
| Pas de campagne email possible | Campagnes, newsletters, automatisations |
| Risque RGPD (données perso en fichier plat) | Conforme RGPD (Brevo est certifié) |

---

## 2. Comment ça fonctionne dans OFFREZ

### Le parcours d'un email

```
Visiteur → Formulaire "Restez informé" → Frontend (POST /api/subscribe)
    → server.js valide l'email + le consentement
    → Le frontend envoie aussi le prénom de la cible et le cadeau affiché
    → Appel API Brevo (createContact + attributes)
    → Contact créé/mis à jour avec PRENOM_CIBLE et CADEAU_CHOISI
    → Aucune trace locale (pas de CSV, pas de log)
```

### Le code dans `server.js`

```javascript
async function sendToBrevo(email, attributes = {}) {
    const body = {
        email: email,
        listIds: [2],              // ← ID de votre liste Brevo
        updateEnabled: true        // ← Met à jour si le contact existe déjà
    };

    // Attributs de contexte cadeau (envoyés par le frontend)
    const attrs = {};
    if (attributes.prenomCible) attrs.PRENOM_CIBLE = String(attributes.prenomCible).slice(0, 100);
    if (attributes.cadeauChoisi) attrs.CADEAU_CHOISI = String(attributes.cadeauChoisi).slice(0, 200);
    if (Object.keys(attrs).length > 0) body.attributes = attrs;

    const res = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    return res.ok;
}
```

**Points clés :**
- `listIds: [2]` → L'ID de la liste de contacts dans Brevo. Changez ce numéro si votre liste a un autre ID.
- `updateEnabled: true` → Si l'email existe déjà, il est mis à jour (les attributs sont écrasés).
- `PRENOM_CIBLE` → Le prénom de la personne à qui le cadeau est destiné (ex: "Maman").
- `CADEAU_CHOISI` → Le titre du produit Amazon affiché au moment de l'inscription (ex: "Coffret Bio Nature...").
- La clé API est dans `.env` sous `BREVO_API_KEY`.

---

## 3. Accès au Dashboard Brevo

### URL
🔗 **https://app.brevo.com**

### Identifiants
Connectez-vous avec le compte qui a généré la clé API.

### Ce que vous pouvez y faire

| Action | Où dans Brevo |
|---|---|
| Voir tous les emails collectés | **Contacts** → Listes |
| Voir les attributs cadeau (PRENOM_CIBLE, CADEAU_CHOISI) | **Contacts** → Fiche d'un contact |
| Envoyer une newsletter | **Campagnes** → Créer |
| Voir les stats d'ouverture | **Campagnes** → Statistiques |
| Configurer un email automatique | **Automatisation** → Scénarios |
| Exporter les contacts en CSV | **Contacts** → Exporter |

---

## 4. Configuration

### 4.1 La clé API (`.env`)

```ini
BREVO_API_KEY=xkeysib-xxxxx-yyyyy
```

**Où la trouver / régénérer :**
1. Aller sur https://app.brevo.com
2. Cliquer sur votre profil (en haut à droite)
3. **SMTP & API** → Clés API
4. Copier la clé `v3`

### 4.2 L'ID de la liste (`server.js`)

Par défaut, les contacts sont ajoutés à la liste **ID 2**. Pour trouver ou changer l'ID :

1. Aller dans Brevo → **Contacts** → **Listes**
2. Cliquer sur votre liste
3. L'ID est visible dans l'URL : `https://app.brevo.com/contact/list/id/2`
4. Modifier `listIds: [2]` dans `sendToBrevo()` si besoin

### 4.3 Créer les attributs de contact

Pour que `PRENOM_CIBLE` et `CADEAU_CHOISI` apparaissent dans les fiches contacts :

1. Brevo → **Contacts** → **Paramètres** → **Attributs de contacts**
2. Cliquer **Ajouter un nouvel attribut**
3. Créer :
   - **Nom** : `PRENOM_CIBLE` → Type : **Texte**
   - **Nom** : `CADEAU_CHOISI` → Type : **Texte**
4. Sauvegarder

> ⚠️ Sans cette étape, l'API acceptera les données mais elles ne seront pas visibles dans le dashboard.

### 4.4 Créer une nouvelle liste

1. Brevo → **Contacts** → **Listes** → **Ajouter une liste**
2. Nommer la liste (ex: "OFFREZ - Inscrits")
3. Noter l'ID et le mettre dans `server.js`

---

## 5. Plan Gratuit Brevo

| Fonctionnalité | Limite gratuite |
|---|---|
| Contacts | **Illimité** |
| Emails/jour | **300** |
| Campagnes | Illimitées |
| API | Illimitée |

Le plan gratuit est largement suffisant pour démarrer. Vous n'avez rien à payer tant que vous ne dépassez pas 300 emails envoyés par jour.

---

## 6. Dépannage

### "L'email n'apparaît pas dans Brevo"

1. Vérifier que `BREVO_API_KEY` est bien dans le `.env` du serveur
2. Vérifier les logs PM2 : `pm2 logs offrly --lines 20`
3. Chercher `[BREVO]` dans les logs pour voir les erreurs

### "Erreur 401 Unauthorized"

La clé API est invalide ou expirée. Régénérez-la dans Brevo → SMTP & API.

### "Erreur 400 Bad Request"

L'email envoyé a un format invalide. La validation côté serveur devrait empêcher ça, mais vérifiez les logs.

### Tester l'intégration manuellement

```bash
# Depuis le serveur
curl -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","consent":true}'
```

Puis vérifier dans Brevo → Contacts si `test@example.com` apparaît.

---

## 7. Commandes Utiles

```bash
# Voir les logs Brevo dans PM2
pm2 logs offrly --lines 50 | grep BREVO

# Tester l'API Brevo directement
curl -s https://api.brevo.com/v3/account \
  -H "api-key: VOTRE_CLE" | python3 -m json.tool

# Lister les listes de contacts
curl -s https://api.brevo.com/v3/contacts/lists \
  -H "api-key: VOTRE_CLE" | python3 -m json.tool
```

---

*Document mis à jour le 11/03/2026 — OFFREZ v2.1 (Attributs cadeau ajoutés)*
