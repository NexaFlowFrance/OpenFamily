# OpenFamily - Script ProxmoxVE Community-Scripts

Ce script utilise le framework officiel [ProxmoxVE Community-Scripts](https://github.com/community-scripts/ProxmoxVE) pour un déploiement automatique et complet d'OpenFamily.

## 🚀 Installation en une commande

Sur votre serveur Proxmox, exécutez :

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-scripts/ct/openfamily.sh)"
```

## ✨ Fonctionnalités

Le script s'occupe automatiquement de :

- ✅ **Création du conteneur LXC** Debian 12 (2 cores, 2GB RAM, 6GB disk)
- ✅ **Installation automatique** de Node.js 20 + pnpm
- ✅ **Configuration PostgreSQL 17** avec génération automatique des identifiants
- ✅ **Téléchargement d'OpenFamily** depuis GitHub (dernière release)
- ✅ **Build de l'application** (client + server)
- ✅ **Service systemd** avec auto-start
- ✅ **Support HTTPS** avec Caddy (3 modes disponibles)
- ✅ **Script de mise à jour** intégré

## 🔐 Configuration HTTPS (Interactive)

Le script vous propose 3 options HTTPS :

### 1. HTTP Simple (port 3000)
- Aucune configuration requise
- Idéal pour test local
- ⚠️ Les notifications push ne fonctionneront pas (sauf sur localhost)

### 2. HTTPS Public (Let's Encrypt)
- Pour un accès depuis Internet
- Requiert un nom de domaine pointant vers votre serveur
- Certificat SSL automatique via Let's Encrypt
- **Configuration requise :**
  - Nom de domaine (ex: `openfamily.example.com`)
  - Email pour notifications ACME (optionnel)

### 3. HTTPS Local/LAN (CA locale)
- Pour un accès réseau local avec HTTPS
- Génère une autorité de certification (CA) locale
- Certificat téléchargeable sans commandes terminal
- **Après installation :**
  1. Téléchargez la CA : `http://IP_CONTENEUR/openfamily-local-ca.crt`
  2. Importez-la comme autorité de confiance sur vos appareils
  3. Accédez à : `https://IP_CONTENEUR`

## 📦 Ce qui est installé

```
/opt/openfamily/          # Application
/opt/openfamily/.env      # Configuration
/root/openfamily.creds    # Identifiants (sauvegardez-les!)
```

## 🔄 Mise à jour

Pour mettre à jour OpenFamily vers la dernière version :

```bash
pct enter CTID
bash /opt/openfamily/update.sh
```

Ou depuis Proxmox :

```bash
bash -c "$(wget -qLO - https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-scripts/ct/openfamily.sh)" -s --update
```

## 📊 Gestion du conteneur

```bash
# Voir les logs
pct enter CTID
journalctl -u openfamily -f

# Redémarrer le service
systemctl restart openfamily

# Voir les identifiants
cat /root/openfamily.creds

# Accéder à PostgreSQL
sudo -u postgres psql -d openfamily_db
```

## 🛠️ Configuration avancée

### Modifier les ressources par défaut

Avant de lancer le script, définissez les variables :

```bash
export var_cpu=4          # CPU cores
export var_ram=4096       # RAM en MB
export var_disk=20        # Disk en GB
bash -c "$(wget -qLO - https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-scripts/ct/openfamily.sh)"
```

### Changer le port (HTTP uniquement)

Éditez `/opt/openfamily/server/.env` :
```bash
PORT=8080
```

Puis redémarrez :
```bash
systemctl restart openfamily
```

## 🔍 Résolution de problèmes

### Le service ne démarre pas

```bash
# Voir les logs
journalctl -u openfamily -n 50

# Vérifier la configuration
cat /opt/openfamily/server/.env

# Tester PostgreSQL
sudo -u postgres psql -d openfamily_db -c "SELECT version();"
```

### Problème de connexion à la base de données

```bash
# Vérifier que PostgreSQL écoute
ss -ltn | grep 5432

# Tester la connexion
PGPASSWORD=votre_mot_de_passe psql -U openfamily -d openfamily_db -h localhost
```

### HTTPS local ne fonctionne pas

1. Vérifiez que Caddy écoute sur les ports 80 et 443 :
```bash
ss -ltn | grep -E ':(80|443)'
```

2. Téléchargez et importez la CA :
```bash
curl -O http://IP_CONTENEUR/openfamily-local-ca.crt
```

3. Sur Windows : Double-clic > Installer le certificat > Autorités racine de confiance
4. Sur macOS : Trousseaux > Importer > Toujours faire confiance
5. Sur Linux : 
```bash
sudo cp openfamily-local-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

## 🎯 Prochaines étapes

Après l'installation :

1. **Notez les identifiants** : `cat /root/openfamily.creds`
2. **Accédez à l'application** via l'URL affichée
3. **Configurez votre famille** dans les paramètres
4. **Activez les notifications** (requiert HTTPS sauf localhost)
5. **Installez en PWA** sur vos appareils mobiles

## 🐛 Support

- 📖 Documentation : [Guide Proxmox](../PROXMOX_DEPLOYMENT.md)
- 🐛 Issues : https://github.com/NexaFlowFrance/OpenFamily/issues
- 💬 Discussions : https://github.com/NexaFlowFrance/OpenFamily/discussions

## 📜 Licence

OpenFamily est sous licence MIT. Voir le fichier LICENSE pour plus de détails.
