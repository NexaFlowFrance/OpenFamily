# OpenFamily - Déploiement Proxmox

Guide complet pour déployer OpenFamily sur Proxmox VE en utilisant des conteneurs LXC ou des machines virtuelles.

## 📋 Prérequis

- Proxmox VE 7.x ou supérieur
- Accès root au serveur Proxmox
- Connexion Internet active
- Au moins 2 CPU cores et 2GB RAM disponibles

## 🚀 Méthode 1 : Déploiement Automatique (Community-Scripts) - **RECOMMANDÉ**

Utilise le framework officiel ProxmoxVE Community-Scripts pour une installation complète et automatique.

### Installation en une seule commande

Sur votre serveur Proxmox, exécutez :

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-scripts/ct/openfamily.sh)"
```

### Ce que fait le script

1. ✅ Crée un conteneur LXC Debian 12 optimisé
2. ✅ Installe Node.js 20 + pnpm automatiquement
3. ✅ Configure PostgreSQL 17 avec identifiants auto-générés
4. ✅ Télécharge et build OpenFamily (dernière release)
5. ✅ Crée un service systemd avec auto-start
6. ✅ Configure HTTPS (3 modes au choix)
7. ✅ Génère les identifiants dans `/root/openfamily.creds`

### Options HTTPS interactives

Le script vous propose 3 modes :

- **HTTP simple** : Accès sur port 3000 (test local)
- **HTTPS public** : Let's Encrypt automatique (requiert domaine)
- **HTTPS local** : CA locale téléchargeable (LAN sécurisé)

📖 **Documentation complète** : [Guide Community-Scripts](ct/README.md)

---

## 🔧 Méthode 2 : Déploiement Manuel (Script Bash)

Si vous préférez un contrôle total de la configuration.

Le conteneur LXC est plus léger et démarre plus rapidement qu'une VM.

### Installation en une seule commande

Sur votre serveur Proxmox, exécutez :

```bash
wget -qO- https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-scripts/deploy-openfamily.sh | bash
```

ou téléchargez et exécutez le script :

```bash
wget https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-scripts/deploy-openfamily.sh
chmod +x deploy-openfamily.sh
./deploy-openfamily.sh
```

### Configuration interactive

Le script vous demandera :
- **Container name** : Nom du conteneur (défaut: openfamily)
- **CPU cores** : Nombre de cœurs CPU (défaut: 2)
- **Memory** : RAM en MB (défaut: 2048)
- **Disk size** : Taille du disque en GB (défaut: 10)
- **Storage pool** : Pool de stockage Proxmox (défaut: local-lvm)
- **Network bridge** : Bridge réseau (défaut: vmbr0)
- **IP Configuration** : DHCP ou IP statique

### Ce que fait le script

1. ✅ Crée un conteneur LXC Debian 13
2. ✅ Configure les ressources (CPU, RAM, Disque)
3. ✅ Active le nesting pour Docker
4. ✅ Installe Docker et Docker Compose
5. ✅ Clone le dépôt OpenFamily
6. ✅ Lance les services via docker-compose
7. ✅ Génère et affiche le mot de passe de la base de données

### Résultat

Une fois terminé, vous obtiendrez :

```
==============================================
  Installation Complete!
==============================================
Container ID: 100
Container Name: openfamily
IP Address: 192.168.1.100

OpenFamily URL: http://192.168.1.100:3000
Database Password: OF_xxxxxxxxxxxxx

Save this password in a secure location!
```

## 🖥️ Méthode 2 : Déploiement VM (Virtual Machine)

Pour un isolement maximal, utilisez une VM :

```bash
wget https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-scripts/deploy-openfamily-vm.sh
chmod +x deploy-openfamily-vm.sh
./deploy-openfamily-vm.sh
```

**Note** : Cette méthode nécessite une installation manuelle de Debian. Le script crée la VM et vous guide à travers les étapes.

## 📦 Après l'installation

### Accéder à OpenFamily

Ouvrez votre navigateur et accédez à :
```
http://IP_DU_CONTENEUR:3000
```

### Commandes utiles

#### Gestion du conteneur
```bash
# Entrer dans le conteneur
pct enter CTID

# Arrêter le conteneur
pct stop CTID

# Démarrer le conteneur
pct start CTID

# Redémarrer le conteneur
pct reboot CTID

# Supprimer le conteneur
pct destroy CTID
```

#### Gestion de l'application (depuis l'intérieur du conteneur)
```bash
# Voir les logs
cd /opt/OpenFamily
docker compose logs -f

# Redémarrer les services
docker compose restart

# Arrêter les services
docker compose down

# Mettre à jour OpenFamily
git pull
docker compose down
docker compose pull
docker compose up -d

# Voir le mot de passe de la base de données
cat shared/.db_password
```

### Sauvegarde et restauration

#### Sauvegarder le conteneur
```bash
# Créer un snapshot
pct snapshot CTID snapshot-name

# Ou faire un backup complet
vzdump CTID --mode snapshot --storage local
```

#### Restaurer depuis un backup
```bash
pct restore CTID /var/lib/vz/dump/vzdump-lxc-CTID-*.tar.zst
```

## 🔧 Configuration avancée

### Modifier les ressources après création

```bash
# Changer le nombre de CPU
pct set CTID --cores 4

# Changer la RAM
pct set CTID --memory 4096

# Redimensionner le disque
pct resize CTID rootfs +10G
```

### Configurer un domaine personnalisé

1. Dans Proxmox, notez l'IP du conteneur
2. Configurez votre DNS pour pointer vers cette IP
3. Optionnel : configurez un reverse proxy (Nginx, Caddy) avec HTTPS

Exemple avec Caddy dans le conteneur :

```bash
pct enter CTID

# Installer Caddy
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install caddy

# Configurer Caddy
cat > /etc/caddy/Caddyfile << EOF
openfamily.votredomaine.com {
    reverse_proxy localhost:3000
}
EOF

systemctl restart caddy
```

### Accès depuis l'extérieur

Pour accéder à OpenFamily depuis Internet :

1. **Configuration du firewall Proxmox** :
```bash
# Autoriser le port 3000
iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

2. **Configuration du routeur** :
   - Configurez le NAT/Port Forwarding
   - Port externe 3000 → IP_CONTENEUR:3000

3. **Sécurité recommandée** :
   - Utilisez un reverse proxy avec HTTPS
   - Configurez Cloudflare Zero Trust
   - Utilisez un VPN (Wireguard, Tailscale)

## ⚠️ Résolution de problèmes

### Le conteneur ne démarre pas
```bash
# Vérifier les logs
pct status CTID
journalctl -xe
```

### Docker ne démarre pas dans le conteneur
```bash
# Vérifier que le nesting est activé
pct config CTID | grep features

# Devrait afficher: features: nesting=1
# Si ce n'est pas le cas :
pct set CTID --features nesting=1
pct reboot CTID
```

### Problème de réseau
```bash
# Vérifier la configuration réseau
pct config CTID | grep net0

# Tester la connectivité
pct enter CTID
ping 8.8.8.8
```

### L'application ne répond pas sur le port 3000
```bash
pct enter CTID
cd /opt/OpenFamily

# Vérifier les containers Docker
docker compose ps

# Voir les logs
docker compose logs app
docker compose logs postgres

# Redémarrer si nécessaire
docker compose restart
```

## 🔐 Sécurité

### Recommandations importantes

1. **Changez le mot de passe de la base de données** après la première connexion
2. **Configurez un firewall** pour limiter l'accès
3. **Utilisez HTTPS** en production
4. **Activez les sauvegardes automatiques** Proxmox
5. **Mettez à jour régulièrement** :
```bash
pct enter CTID
apt update && apt upgrade -y
cd /opt/OpenFamily
git pull
docker compose pull
docker compose up -d
```

## 📊 Surveillance

### Monitorer les ressources
```bash
# CPU et RAM du conteneur
pct status CTID

# Utilisation disque
pct df CTID
```

### Logs de l'application
```bash
pct enter CTID
cd /opt/OpenFamily

# Logs en temps réel
docker compose logs -f

# Dernières 100 lignes
docker compose logs --tail=100
```

## 📝 Support

Pour obtenir de l'aide :
- 🐛 Issues GitHub : https://github.com/NexaFlowFrance/OpenFamily/issues
- 📖 Documentation : https://github.com/NexaFlowFrance/OpenFamily
- 💬 Discussions : https://github.com/NexaFlowFrance/OpenFamily/discussions

## 📜 Licence

OpenFamily est sous licence MIT. Voir le fichier LICENSE pour plus de détails.
