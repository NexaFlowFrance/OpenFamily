# Scripts d'installation automatique OpenFamily

Ce dossier contient les scripts pour installer automatiquement OpenFamily dans différents environnements.

## 📋 Scripts disponibles

### 1. Installation locale (développement)

Pour installer OpenFamily en mode développement local :

```bash
curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-local.sh | bash
```

**Prérequis :**
- Node.js 20+
- pnpm (sera installé automatiquement si absent)

**Ce qui est installé :**
- Clone du repository
- Installation des dépendances
- Build de l'application
- Configuration pour démarrage rapide

**Après installation :**
```bash
cd openfamily
pnpm dev
```

---

### 2. Installation Docker (production)

Pour installer OpenFamily en mode serveur avec Docker :

```bash
curl -sSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/install-docker.sh | bash
```

**Prérequis :**
- Docker et docker-compose (sera installé si absent)
- Système Linux (Ubuntu, Debian, etc.)

**Ce qui est installé :**
- Docker et docker-compose
- PostgreSQL via Docker
- Application Node.js
- Configuration automatique avec mot de passe sécurisé

**Après installation :**
L'application sera accessible sur `http://votre-domaine:3000`

**Gestion des services :**
```bash
# Voir les logs
sudo docker-compose logs -f

# Arrêter
sudo docker-compose down

# Redémarrer
sudo docker-compose restart

# Mettre à jour
cd /opt/openfamily
git pull
sudo docker-compose up -d --build
```

---

## 🔧 Configuration manuelle

Si vous préférez installer manuellement, consultez :
- [DEPLOYMENT.md](../docs/DEPLOYMENT.md) - Guide de déploiement complet
- [README.md](../README.md) - Documentation générale

---

## 📦 Installation sur Proxmox VE

OpenFamily peut être installé sur Proxmox VE via [Proxmox VE Community Scripts](https://github.com/community-scripts/ProxmoxVE).

Les scripts spécifiques pour Proxmox seront soumis directement dans le repository community-scripts selon leurs guidelines.

---

## 🆘 Support

- 📖 [Documentation complète](../README.md)
- 🐛 [Signaler un bug](https://github.com/NexaFlowFrance/OpenFamily/issues)
- 💬 [Discussions](https://github.com/NexaFlowFrance/OpenFamily/discussions)

---

## 📄 Licence

Ces scripts sont fournis sous licence AGPL-3.0 avec clause non-commerciale, comme le reste du projet OpenFamily.
