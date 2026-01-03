# OpenFamily Scripts for Proxmox VE Community Scripts

Ces scripts permettent d'installer **OpenFamily** sur Proxmox VE via les Community Scripts.

## 📁 Structure

```
proxmox-scripts/
├── ct/
│   ├── openfamily.sh          # Script de création du container LXC
│   └── headers/
│       └── openfamily         # Header ASCII personnalisé
└── install/
    └── openfamily-install.sh  # Script d'installation dans le container
```

## 🚀 Utilisation

### Installation Automatique via Proxmox VE

Une fois les scripts ajoutés au repo `community-scripts/ProxmoxVE`, l'installation se fera simplement :

```bash
bash -c "$(wget -qLO - https://github.com/community-scripts/ProxmoxVE/raw/main/ct/openfamily.sh)"
```

**Ressources recommandées :**
- CPU : 2 cores
- RAM : 2048 MB
- Disque : 8 GB
- OS : Debian 13
- Mode : Unprivileged

### Post-Installation

Les identifiants de base de données sont sauvegardés dans `/root/openfamily.creds` :

```bash
cat /root/openfamily.creds
```

**Accès à l'application :**
- Si vous avez choisi **HTTP** : `http://[IP_DU_CONTAINER]:3000`
- Si vous avez choisi **HTTPS public** (domaine) : `https://votre-domaine`
- Si vous avez choisi **HTTPS local/LAN** : `https://[IP_DU_CONTAINER]`

> Note : les **notifications** et le **Service Worker** sont généralement bloqués en HTTP (hors `localhost`).

### HTTPS local/LAN : faire confiance à la CA de Caddy

En mode **HTTPS local/LAN**, Caddy utilise une **CA interne** (`tls internal`).
Pour enlever l'avertissement navigateur et activer Notifications/SW sur vos appareils, il faut installer le certificat CA comme autorité de confiance.

- Chemin (dans le container) : `/var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt`
- Copie simple (depuis le shell du container) :

```bash
cp /var/lib/caddy/.local/share/caddy/pki/authorities/local/root.crt /root/openfamily-local-ca.crt
```

Vous pouvez ensuite récupérer `/root/openfamily-local-ca.crt` et l'importer sur PC/mobile.

## 🔧 Fonctionnalités

### Container Script (`ct/openfamily.sh`)

- ✅ Création automatique du container LXC
- ✅ Configuration des ressources (CPU, RAM, disque)
- ✅ Fonction `update_script()` pour mises à jour
- ✅ Détection de version via GitHub API
- ✅ Unprivileged container par défaut
- ✅ Choix interactif du mode HTTPS (HTTP / HTTPS public / HTTPS local)

### Installation Script (`install/openfamily-install.sh`)

- ✅ Installation Node.js 20
- ✅ Installation PostgreSQL 17
- ✅ Configuration automatique de la base de données
- ✅ Installation pnpm
- ✅ Clonage et build de l'application
- ✅ Variables d'environnement sécurisées
- ✅ Service systemd
- ✅ Sauvegarde des credentials
- ✅ (Optionnel) Reverse proxy HTTPS via Caddy

## 📝 Standards Respectés

Ces scripts suivent les conventions de `community-scripts/ProxmoxVE` :

- ✅ Source de `build.func` depuis le repo officiel
- ✅ Variables standardisées (`var_cpu`, `var_ram`, `var_disk`, etc.)
- ✅ Fonction `update_script()` complète
- ✅ Utilisation de `$STD` pour suppression d'output
- ✅ Messages formatés (`msg_info`, `msg_ok`, `msg_error`)
- ✅ Version tracking dans `/opt/OpenFamily_version.txt`
- ✅ Cleanup avec `cleanup_lxc`
- ✅ MOTD et customization

## 🔄 Mise à Jour

Pour mettre à jour OpenFamily dans le container :

```bash
bash -c "$(wget -qLO - https://github.com/community-scripts/ProxmoxVE/raw/main/misc/update.sh)" -s openfamily
```

Ou depuis le shell du container :

```bash
update
```

## 📦 Contribution à community-scripts/ProxmoxVE

### Étapes pour soumettre une PR

1. **Fork du repo** :
   ```bash
   gh repo fork community-scripts/ProxmoxVE --clone
   ```

2. **Créer une branche** :
   ```bash
   cd ProxmoxVE
   git checkout -b feat/openfamily
   ```

3. **Copier les scripts** :
   ```bash
   cp /path/to/proxmox-scripts/ct/openfamily.sh ct/
   cp /path/to/proxmox-scripts/ct/headers/openfamily ct/headers/
   cp /path/to/proxmox-scripts/install/openfamily-install.sh install/
   ```

4. **Commit et push** :
   ```bash
   git add ct/openfamily.sh ct/headers/openfamily install/openfamily-install.sh
   git commit -m "feat: Add OpenFamily - Family Organization Platform"
   git push origin feat/openfamily
   ```

5. **Créer la Pull Request** sur GitHub

### Description de la PR

```markdown
## OpenFamily - Family Organization Platform

### Description
OpenFamily est une plateforme open-source de gestion familiale permettant de gérer le calendrier, les repas, les courses, le budget, les tâches et les statistiques familiales.

### Features
- 📅 Calendrier partagé avec événements et rendez-vous
- 🍽️ Planification des repas avec suggestions de recettes
- 🛒 Liste de courses collaborative
- 💰 Gestion du budget familial
- 📋 To-do list et tâches récurrentes
- 📊 Statistiques et visualisation des données

### Technical Stack
- **Backend**: Node.js, Express
- **Frontend**: React, Vite
- **Database**: PostgreSQL 17
- **Runtime**: Node.js 20

### Resources
- **CPU**: 2 cores
- **RAM**: 2048 MB
- **Disk**: 8 GB
- **OS**: Debian 13 (unprivileged)

### Links
- GitHub: https://github.com/NexaFlowFrance/OpenFamily
- Documentation: https://github.com/NexaFlowFrance/OpenFamily/blob/main/README.md

### Checklist
- [x] Tested on Proxmox VE
- [x] Container creates successfully
- [x] Application starts and runs
- [x] Update function implemented
- [x] Follows community-scripts standards
- [x] Header ASCII included
- [x] Credentials saved to /root/openfamily.creds
```

## 🛠️ Développement Local

Pour tester les scripts localement avant soumission :

```bash
# Tester le script de container
bash proxmox-scripts/ct/openfamily.sh

# Tester le script d'installation (dans un container existant)
bash proxmox-scripts/install/openfamily-install.sh
```

## 📚 Ressources

- [community-scripts/ProxmoxVE](https://github.com/community-scripts/ProxmoxVE)
- [Documentation ProxmoxVE](https://github.com/community-scripts/ProxmoxVE/tree/main/docs)
- [OpenFamily Repository](https://github.com/NexaFlowFrance/OpenFamily)

## 📄 Licence

MIT License - Voir [LICENSE](../../LICENSE)
