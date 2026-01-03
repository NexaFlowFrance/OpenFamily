# OpenFamily

**Application 100% locale et open source pour gérer la vie de famille**

OpenFamily est une Progressive Web App (PWA) complète conçue pour aider les familles à s'organiser au quotidien. L'application fonctionne entièrement en local, garantissant la confidentialité de vos données familiales.

## 🚀 Démarrage rapide avec Docker

```bash
# 1. Créer le réseau
docker network create openfamily-network

# 2. Démarrer PostgreSQL
docker run -d \
  --name openfamily-postgres \
  --network openfamily-network \
  -e POSTGRES_DB=openfamily \
  -e POSTGRES_USER=openfamily \
  -e POSTGRES_PASSWORD=your_secure_password \
  -v openfamily_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine

# 3. Démarrer OpenFamily
docker run -d \
  --name openfamily-app \
  --network openfamily-network \
  -p 3000:3000 \
  -e DB_HOST=openfamily-postgres \
  -e DB_PASSWORD=your_secure_password \
  -e NODE_ENV=production \
  nexaflow/openfamily:latest
```

Accédez à l'application : http://localhost:3000

## 🏗️ Installation complète avec Docker Compose

Pour une installation complète et automatisée :

```bash
# Télécharger la configuration
curl -L https://github.com/NexaFlowFrance/OpenFamily/archive/main.zip -o openfamily.zip
unzip openfamily.zip && cd OpenFamily-main

# Configurer l'environnement
cp .env.example .env
# Éditez .env pour changer le mot de passe !

# Démarrer tous les services
docker compose up -d
```

## ✨ Fonctionnalités principales

- 🛍️ **Listes de courses** partagées en temps réel
- ✅ **Gestionnaire de tâches** avec attribution par membre
- 💰 **Suivi budgétaire** avec catégories et graphiques
- 📅 **Calendrier familial** unifié
- 🍽️ **Planification des repas** avec recettes
- 📊 **Statistiques** et tableaux de bord
- 🔄 **Synchronisation temps réel** entre tous les appareils
- 🌍 **Multilingue** (FR, EN, DE, ES)
- 📱 **PWA** - Installable comme une app native
- 🔒 **100% local** - Vos données restent chez vous

## 🛠️ Configuration avancée

### Variables d'environnement

| Variable | Description | Défaut | Requis |
|----------|-------------|---------|---------|
| `DB_HOST` | Hôte PostgreSQL | `postgres` | ✅ |
| `DB_PORT` | Port PostgreSQL | `5432` | ❌ |
| `DB_NAME` | Nom de la base | `openfamily` | ❌ |
| `DB_USER` | Utilisateur DB | `openfamily` | ❌ |
| `DB_PASSWORD` | Mot de passe DB | - | ✅ |
| `NODE_ENV` | Environnement | `production` | ❌ |
| `PORT` | Port de l'app | `3000` | ❌ |

### Volumes recommandés

```bash
# Pour persister les données
-v openfamily_postgres_data:/var/lib/postgresql/data
-v openfamily_app_data:/app/data
-v openfamily_app_logs:/app/logs
```

## 🔒 Sécurité

OpenFamily intègre plusieurs couches de sécurité :

- Headers de sécurité HTTP
- Rate limiting automatique
- Validation des entrées
- Chiffrement des communications
- Isolation réseau Docker

## 📚 Documentation

- **Démarrage rapide / Installation** : https://github.com/NexaFlowFrance/OpenFamily#-d%C3%A9marrage-rapide
- **Déploiement (domaine/HTTPS)** : https://github.com/NexaFlowFrance/OpenFamily/blob/main/docs/DEPLOYMENT.md
- **Configuration sécurité** : https://github.com/NexaFlowFrance/OpenFamily/blob/main/SECURITY.md
- **Code source** : https://github.com/NexaFlowFrance/OpenFamily

## 🆘 Support

- **Issues** : https://github.com/NexaFlowFrance/OpenFamily/issues
- **Discussions** : https://github.com/NexaFlowFrance/OpenFamily/discussions
- **Documentation** : https://github.com/NexaFlowFrance/OpenFamily/tree/main/docs

## 📄 Licence

AGPL-3.0 Non-Commercial - Voir le fichier [LICENSE](https://github.com/NexaFlowFrance/OpenFamily/blob/main/LICENSE) pour plus de détails.

---

**🏠 OpenFamily - Organisez votre famille en toute simplicité !**