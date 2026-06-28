# 🖥️ GUIDE COMPLET : INSTALLER OFFREZ SUR UN CM3588
*Document 11 — Préparation hardware, installation OS et mise en réseau*

---

## 1. VOTRE MATÉRIEL : LE CM3588

Le **FriendlyElec CM3588** est une carte SBC (Single Board Computer) basée sur le Rockchip RK3588. C'est une **excellente machine** pour héberger OFFREZ.

| Composant | Spécification |
|---|---|
| **CPU** | RK3588 — 4x Cortex-A76 (2.4GHz) + 4x Cortex-A55 (1.8GHz) |
| **GPU** | Mali-G610 MP4 |
| **NPU** | 6 TOPs (IA intégrée) |
| **RAM** | 4/8/16/32 GB LPDDR4X |
| **Stockage** | eMMC (0/64/256 GB) + 4x M.2 NVMe |
| **Réseau** | Ethernet 2.5 Gbps |
| **USB** | 2x USB 3.0 Type-A, 1x USB-C (DP), 1x USB 2.0 |
| **Alimentation** | 12V DC (adaptateur 12V 2A minimum, 12V 5A+ si SSDs) |

> [!TIP]
> Pour OFFREZ (Node.js + Express), **4 GB de RAM suffisent largement**. Le CPU 8 cœurs est surpuissant pour ce besoin.

---

## 2. QUEL OS CHOISIR ?

### ✅ Recommandation : **Debian 12 Bookworm (Core/Minimal)**

| OS | Pour | Contre | Verdict |
|---|---|---|---|
| **Debian 13 Trixie Core** | Léger, stable, Node.js natif, idéal serveur | Pas d'interface graphique | ⭐ **RECOMMANDÉ** |
| Ubuntu Noble Minimal | Familier, beaucoup de tutos | Un peu plus lourd | Bon choix aussi |
| OpenMediaVault (OMV) | Interface web NAS intégrée | Overkill pour un serveur web seul | Pas nécessaire |
| Armbian | Communauté active, optimisé ARM | Peut être instable sur RK3588 | Bonne alternative |

> [!IMPORTANT]
> Vérifiez sur le [wiki FriendlyElec](https://wiki.friendlyelec.com/wiki/index.php/CM3588) ou leur Google Drive que l'image **Trixie** est bien disponible pour le CM3588. Si elle ne l'est pas encore, prenez la dernière image Debian disponible (Bookworm) ou passez par **Armbian** qui suit les versions Debian plus rapidement.

**Pourquoi Debian Core ?**
- C'est un OS **sans interface graphique** → il utilise un minimum de RAM et CPU.
- Parfaitement stable pour un serveur 24/7.
- Node.js 20+ s'installe facilement dessus.
- FriendlyElec fournit des images **officielles et testées** pour le CM3588.

---

## 3. INSTALLATION DE L'OS (ÉTAPE PAR ÉTAPE)

### Ce qu'il vous faut

- Le CM3588 (évidemment)
- Une **carte microSD** de 8 Go minimum (16 Go recommandé)
- Un **PC Windows** (votre machine actuelle)
- Un **câble Ethernet** (pour le réseau local)
- Un **écran HDMI** + clavier USB (pour la première configuration, temporaire)
- L'**alimentation 12V** du CM3588

### Étape 1 : Télécharger l'image OS

1. Allez sur le **wiki officiel FriendlyElec** :
   - [https://wiki.friendlyelec.com/wiki/index.php/CM3588](https://wiki.friendlyelec.com/wiki/index.php/CM3588)
2. Descendez à la section **"Download"** ou **"Firmware Download"**.
3. Téléchargez l'image **SD-to-eMMC** pour **Debian Trixie Core** (ou la dernière version Debian disponible) :
   - Le nom ressemble à : `rk3588-eflasher-debian-trixie-core-6.x-arm64-XXXXXXXX.img.gz`
   - Prenez bien la version **"eflasher"** (c'est celle qui flashe la carte SD vers le stockage eMMC interne).

> [!IMPORTANT]
> Si le lien direct ne fonctionne pas, cherchez dans le Google Drive officiel FriendlyElec :
> `01_Official images` → `02_SD-to-eMMC images` → `debian-trixie-core`

### Étape 2 : Flasher la carte microSD

1. Téléchargez et installez [**Balena Etcher**](https://etcher.balena.io/) sur votre PC Windows.
2. Insérez la carte microSD dans votre PC (via un adaptateur si nécessaire).
3. Ouvrez Balena Etcher :
   - **"Flash from file"** → sélectionnez le fichier `.img.gz` téléchargé.
   - **"Select target"** → sélectionnez votre carte microSD.
   - **"Flash!"** → attendez que ça finisse (~2-5 minutes).
4. Éjectez la carte microSD proprement.

### Étape 3 : Flasher l'eMMC du CM3588

1. **Branchez** un écran HDMI au CM3588 (utilisez le **port HDMI du milieu**, c'est le port de sortie principal).
2. **Branchez** un clavier USB.
3. **Insérez** la carte microSD dans le CM3588.
4. **Branchez** le câble Ethernet (vers votre box/routeur).
5. **Alimentez** le CM3588 (branchez le 12V).

Le CM3588 va automatiquement :
- Démarrer depuis la carte microSD.
- Détecter l'eMMC interne.
- **Flasher Debian** sur l'eMMC.
- Afficher la progression sur l'écran HDMI (~3-5 minutes).

6. Quand l'écran affiche **"Flashing successful"** ou un message de fin → **éteignez** le CM3588 (débranchez l'alimentation).
7. **⚠️ RETIREZ LA CARTE MICROSD** (sinon il re-flashera au prochain démarrage !).
8. **Rallumez** le CM3588.

### Étape 4 : Premier démarrage et connexion

Le CM3588 démarre maintenant depuis Debian installé sur l'eMMC.

**Identifiants par défaut** (FriendlyElec) :

| Utilisateur | Mot de passe |
|---|---|
| `root` | `fa` |
| `pi` | `pi` |

> [!CAUTION]
> **Changez ces mots de passe immédiatement** après la première connexion !

```bash
# Connectez-vous en root
login: root
password: fa

# Changez le mot de passe root
passwd

# Créez votre propre utilisateur
adduser votreNom
usermod -aG sudo votreNom

# Supprimez l'utilisateur par défaut "pi"
deluser --remove-home pi
```

---

## 4. CONFIGURATION RÉSEAU (RÉSEAU LOCAL)

### 4.1 Vérifier la connexion Ethernet

Si vous avez branché le câble Ethernet avant le démarrage, il devrait déjà être connecté :

```bash
# Vérifier l'adresse IP attribuée
ip addr show eth0
```

Vous devriez voir quelque chose comme :
```
inet 192.168.1.XXX/24 brd 192.168.1.255
```

C'est votre **adresse IP locale**. Notez-la !

### 4.2 Fixer une IP statique (recommandé pour un serveur)

Votre routeur/box va attribuer une IP aléatoire à chaque démarrage. Pour un serveur, il faut une **IP fixe** :

```bash
# Éditez la configuration réseau
sudo nano /etc/network/interfaces
```

Ajoutez ou modifiez :
```
auto eth0
iface eth0 inet static
    address 192.168.1.100
    netmask 255.255.255.0
    gateway 192.168.1.1
    dns-nameservers 8.8.8.8 8.8.4.4
```

> [!NOTE]
> - `address` : L'IP fixe que vous voulez (choisissez une IP en dehors de la plage DHCP de votre box, souvent > .100).
> - `gateway` : L'IP de votre box (souvent `192.168.1.1` ou `192.168.0.1`).
> - `dns-nameservers` : Les serveurs DNS de Google (fiables).

```bash
# Redémarrez le réseau
sudo systemctl restart networking
```

### 4.3 Se connecter en SSH depuis votre PC Windows

Une fois l'IP fixe configurée, vous n'avez plus besoin de l'écran/clavier. Tout se fait en SSH :

```powershell
# Depuis PowerShell sur votre PC Windows
ssh pi@192.168.1.100
```

> [!TIP]
> Si `ssh` n'est pas reconnu sur Windows, installez **OpenSSH** via les paramètres Windows > Applications > Fonctionnalités facultatives > OpenSSH Client. Sinon, utilisez [PuTTY](https://www.putty.org/).

---

## 5. VÉRIFICATION DE LA CONFIG HARDWARE

Une fois connecté en SSH, exécutez ces commandes pour vérifier que tout fonctionne :

### 5.1 Vérifier le CPU

```bash
# Info CPU complète
lscpu
```

Vous devriez voir :
```
Architecture:           aarch64
CPU(s):                 8
Model name:             Cortex-A76 / Cortex-A55
CPU max MHz:            2400.0000
```

### 5.2 Vérifier la RAM

```bash
# RAM totale et utilisée
free -h
```

Exemple de sortie :
```
              total        used        free
Mem:          3.8Gi       524Mi       2.7Gi
```

### 5.3 Vérifier le stockage

```bash
# Espace disque
df -h

# Identifier les disques (eMMC + SSD si installés)
lsblk
```

### 5.4 Vérifier le réseau

```bash
# Vitesse de la carte réseau
ethtool eth0 | grep Speed
# Devrait afficher : Speed: 2500Mb/s ou 1000Mb/s

# Test de connectivité Internet
ping -c 4 google.com
```

### 5.5 Vérifier la température

```bash
# Température du CPU (important pour la stabilité)
cat /sys/class/thermal/thermal_zone0/temp
# Divisez par 1000 pour obtenir les °C (ex: 45000 = 45°C)
```

> [!WARNING]
> Si la température dépasse **70°C** au repos, vérifiez que le ventilateur ou le dissipateur thermique est bien installé.

### 5.6 Script de vérification rapide (tout en un)

```bash
echo "=== CPU ==="
lscpu | grep -E "Architecture|CPU\(s\)|Model name|max MHz"
echo ""
echo "=== RAM ==="
free -h | head -2
echo ""
echo "=== STOCKAGE ==="
df -h / | tail -1
echo ""
echo "=== RÉSEAU ==="
ip addr show eth0 | grep "inet "
echo ""
echo "=== TEMPÉRATURE ==="
TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null)
if [ ! -z "$TEMP" ]; then
    echo "CPU: $((TEMP/1000))°C"
else
    echo "Non disponible"
fi
echo ""
echo "=== KERNEL ==="
uname -a
```

---

## 6. INSTALLER NODE.JS & OFFREZ

### 6.1 Installer Node.js 20+ (via NodeSource)

```bash
# Mettre à jour le système
sudo apt update && sudo apt upgrade -y

# Installer les pré-requis
sudo apt install -y curl git

# Installer Node.js 20 LTS (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Vérifier l'installation
node --version    # Doit afficher v20.x.x ou supérieur
npm --version     # Doit afficher 10.x.x ou supérieur
```

### 6.2 Cloner le projet OFFREZ depuis GitHub

Depuis le CM3588 :

```bash
cd ~
git clone https://github.com/baltrados/offrez.net.git offrly
cd ~/offrly
```

> Pour un dépôt **privé**, configurer une deploy key SSH. Voir `documentation/13_GIT_ET_GITHUB.md` section 6.

Alternative (PC Windows, transfert initial sans Git) :

```powershell
scp -r "C:\site cadeau\save\*" pi@192.168.1.100:~/offrly/
```

> ⚠️ Méthode legacy. Préférer Git pour tous les déploiements futurs.

### 6.3 Installer les dépendances et configurer

```bash
cd ~/offrly

# Installer les packages Node.js
npm install

# Créer le fichier .env avec vos clés API
nano .env
```

Contenu du fichier `.env` :
```
GEMINI_API_KEY=AIzaSy...votre_clé...
RAPIDAPI_KEY=abc123...votre_clé...
PORT=3000
```

### 6.4 Test de lancement

```bash
# Lancer le serveur en mode test
npm start
```

Depuis votre PC Windows, ouvrez un navigateur et allez sur :
```
http://192.168.1.100:3000
```

Si tout fonctionne → le site OFFREZ s'affiche ! 🎉

### 6.5 Lancement en production avec PM2

```bash
# Installer PM2 (gestionnaire de processus)
sudo npm install -g pm2

# Lancer OFFREZ avec PM2
pm2 start server.js --name offrly

# Configurer le démarrage automatique au boot
pm2 startup
# PM2 va afficher une commande à copier-coller. Exécutez-la.
pm2 save

# Commandes utiles PM2
pm2 status          # Voir si offrly tourne
pm2 logs offrly     # Voir les logs en temps réel
pm2 restart offrly  # Redémarrer
pm2 stop offrly     # Arrêter
```

### 6.6 Déploiements futurs (Git)

Une fois Git configuré sur le serveur :

```powershell
# Depuis le PC, après git push :
ssh pi@192.168.1.100 "~/offrly/deploy.sh"
```

Voir `documentation/13_GIT_ET_GITHUB.md` pour la configuration complète.

---

## 9. EXPOSER AVEC CLOUDFLARE TUNNEL

```bash
# Installer cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Lancer un tunnel temporaire (test rapide)
cloudflared tunnel --url http://localhost:3000

# Le terminal affichera une URL comme :
# https://xxxxx-xxxxx-xxxxx.trycloudflare.com
```

Pour un tunnel **permanent** avec votre domaine `offrez.net`, suivez la [documentation Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

---

## 10. CHECKLIST FINALE AVANT MISE EN LIGNE

- [ ] Mots de passe root et utilisateur changés
- [ ] IP fixe configurée
- [ ] SSH fonctionne depuis votre PC
- [ ] Node.js v18+ installé
- [ ] Projet OFFREZ transféré et `npm install` effectué
- [ ] Fichier `.env` créé avec les bonnes clés API
- [ ] `AFFILIATE_TAG` changé dans `js/analyse.js`
- [ ] `DEBUG_MODE = false` dans `js/analyse.js`
- [ ] PM2 installé et démarrage automatique configuré
- [ ] Test bout-en-bout réussi (config → profils → analyse → clic Amazon)
- [ ] `npm run stats` affiche les données correctement
- [ ] Cloudflare Tunnel fonctionne et URL accessible

---


## 7. PM2 — GESTIONNAIRE DE PROCESSUS

### 7.1 Qu'est-ce que PM2 ?

PM2 est un **gestionnaire de processus** pour Node.js en production. Il assure 3 fonctions critiques :
- **Redémarrage automatique** si le serveur plante (crash, erreur non catchée).
- **Démarrage au boot** si le CM3588 redémarre (coupure de courant, mise à jour).
- **Monitoring** : CPU, RAM, logs en temps réel.

**Analogie** : PM2 est comme un vigile devant une porte. Si quelqu'un tombe (le serveur crash), il le relève immédiatement. Si le bâtiment ferme et rouvre (redémarrage), il est déjà à son poste.

### 7.2 Installation

```bash
sudo npm install -g pm2
```

### 7.3 Commandes essentielles

| Commande | Action |
|---|---|
| `pm2 start server.js --name OFFREZ` | Lancer OFFREZ avec PM2 |
| `pm2 stop OFFREZ` | Arrêter le serveur |
| `pm2 restart OFFREZ` | Redémarrer le serveur |
| `pm2 status` | Voir si OFFREZ tourne (online/stopped) |
| `pm2 logs OFFREZ` | Voir les logs en temps réel |
| `pm2 logs OFFREZ --lines 50` | Voir les 50 dernières lignes de log |
| `pm2 monit` | Dashboard temps réel (CPU, RAM, requêtes) |
| `pm2 delete OFFREZ` | Supprimer OFFREZ de PM2 |

### 7.4 Démarrage automatique au boot

```bash
# Générer le script de démarrage
pm2 startup
# PM2 affichera une commande à copier-coller (avec sudo). Exécutez-la.

# Sauvegarder la liste des processus actifs
pm2 save
```

Après ça, même si le CM3588 perd le courant et redémarre, OFFREZ se relancera **tout seul**.

### 7.5 Mettre à jour le code avec PM2

Quand vous modifiez un fichier et le transférez sur le serveur :

```bash
# Redémarrer pour prendre en compte les changements
pm2 restart OFFREZ
```

PM2 coupe proprement l'ancien processus et relance le nouveau. Pas d'interruption visible pour les utilisateurs (< 1 seconde).

### 7.6 Logs et debug

```bash
# Suivre les logs en direct
pm2 logs OFFREZ

# Voir les erreurs uniquement
pm2 logs OFFREZ --err

# Vider les anciens logs
pm2 flush
```

Les logs sont stockés dans `~/.pm2/logs/` :
- `OFFREZ-out.log` : la sortie standard (console.log)
- `OFFREZ-error.log` : les erreurs (console.error, crashes)

---

*Document généré le 28/02/2026 — OFFREZ Documentation v2.0*
