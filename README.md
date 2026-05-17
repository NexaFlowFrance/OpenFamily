<div align="center">
  <img src="client/public/OpenFamily.png" alt="OpenFamily" width="90">
  <h1>OpenFamily</h1>
  <p><strong>Application de gestion familiale open source, auto-hébergeable</strong><br>
  Gardez le contrôle total de vos données — hébergez-la sur votre propre serveur.</p>

  [![Release](https://img.shields.io/github/v/release/NexaFlowFrance/OpenFamily?color=2563eb&label=version)](https://github.com/NexaFlowFrance/OpenFamily/releases/latest)
  [![CI](https://img.shields.io/github/actions/workflow/status/NexaFlowFrance/OpenFamily/ci.yml?branch=main&label=CI)](https://github.com/NexaFlowFrance/OpenFamily/actions/workflows/ci.yml)
  [![Docker](https://img.shields.io/badge/Docker-ghcr.io-2496ED?logo=docker&logoColor=white)](https://github.com/NexaFlowFrance/OpenFamily/pkgs/container/openfamily-client)
  [![License: AGPL v3](https://img.shields.io/badge/License-AGPL--v3-blue.svg)](licence.md)
  [![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org)
  [![PWA](https://img.shields.io/badge/PWA-ready-5A0FC8)](https://github.com/NexaFlowFrance/OpenFamily)
</div>

---

## 🎯 Fonctionnalités

| | |
|---|---|
| 🛒 **Liste de courses** | Catégorisation automatique, prix, quantités, templates |
| ✅ **Tâches** | Tâches récurrentes, assignation familiale, statistiques |
| 📅 **Rendez-vous** | Calendrier mensuel, rappels automatiques, code couleur |
| 🗓️ **Planning hebdomadaire** | Horaires de travail et emploi du temps scolaire par membre |
| 🍳 **Recettes** | Bibliothèque familiale, filtres avancés, temps de préparation |
| 🍽️ **Planning repas** | Vue hebdomadaire, export PDF, liaison recettes |
| 💰 **Budget** | Suivi mensuel, limites par catégorie, statistiques |
| 👨‍👩‍👧‍👦 **Famille** | Profils membres, informations santé, contacts d'urgence |
| 🔄 **Sync temps réel** | Mise à jour instantanée entre tous les appareils (WebSocket) |
| 🔔 **Notifications push** | Rappels de rendez-vous, alertes tâches (Web Push VAPID) |
| 👥 **Comptes partagés** | Invitez des membres à rejoindre votre famille via lien |

## 🚀 Démarrage rapide

### Prérequis

- Node.js 20+
- PostgreSQL 16+ (ou Docker)
- npm 10+

### Installation avec Docker (Recommandé)

1. Clonez le projet et configurez l'environnement :

```bash
cp .env.example .env
# Éditez .env avec vos paramètres
```

2. Démarrez l'application :

```bash
docker-compose up -d --build
```

3. Accédez à l'application :
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

4. Vérifiez le fonctionnement bout-en-bout :

```bash
npm run smoke:api
```

### Installation manuelle

1. Installez les dépendances :

```bash
npm run install:all
```

2. Configurez PostgreSQL et créez la base de données :

```bash
psql -U postgres -c "CREATE DATABASE openfamily;"
psql -U postgres -d openfamily -f server/schema.sql
```

3. Configurez les variables d'environnement :

```bash
cp .env.example .env
# Éditez .env avec vos paramètres
```

4. Démarrez le serveur de développement :

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- PostgreSQL (Docker): localhost:5433

## 🧪 Validation API

Smoke test complet des modules API :

```bash
npm run smoke:api
```

Pour une instance distante :

```bash
API_BASE=https://api.votre-domaine.tld npm run smoke:api
```

## 🏭 Mise En Production

1. Préparez vos variables :
   - utilisez `.env.production.example`
   - définissez un `JWT_SECRET` fort
   - définissez un `POSTGRES_PASSWORD` fort
   - configurez `CORS_ORIGINS`, `VITE_API_URL`, `VITE_WS_URL`

2. Construisez et démarrez :

```bash
docker-compose up -d --build
```

3. Vérifiez :

```bash
curl -sS http://localhost:3001/health
npm run smoke:api
```

## 🛠️ Technologies

### Frontend
- **React 19** + TypeScript + Vite 7
- TailwindCSS + Radix UI + React Router
- WebSocket client — sync temps réel
- PWA (service worker, web push, offline)

### Backend
- **Node.js 20** + Express + TypeScript
- **PostgreSQL 16** — auto-migration au démarrage
- **WebSocket (ws)** — broadcast temps réel
- **Web Push (VAPID)** — notifications push
- JWT + bcrypt 12 + helmet + rate limiting

### DevOps
- Docker + Docker Compose — 3 services (postgres, server, client/nginx)
- Multi-stage builds
- GitHub Actions CI + Docker Publish (ghcr.io)

## 📦 Structure du projet

```
Nexus/
├── client/          # Application React
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── pages/
│   │   └── lib/
│   └── Dockerfile
├── server/          # API Express
│   ├── src/
│   │   ├── routes/
│   │   └── middleware/
│   ├── schema.sql
│   └── Dockerfile
├── shared/          # Types et constantes partagés
└── docker-compose.yml
```

## 🔐 Sécurité

- Authentification JWT (7j, refresh automatique)
- Mots de passe hashés avec **bcrypt (cost 12)**
- En-têtes HTTP sécurisés via **helmet**
- Rate limiting sur les endpoints d'authentification
- CORS strict configurable
- Validation des entrées côté serveur
- Logs structurés (pas de données sensibles)

## 📱 PWA

L'application est une Progressive Web App installable sur mobile et desktop avec :
- Mode offline
- Service Worker
- Manifest
- Notifications push (nécessite HTTPS)

## 🧯 Dépannage UI

Si des onglets semblent ne pas réagir après un déploiement (ancienne version en cache) :

```bash
# 1) reconstruire et redémarrer
docker-compose up -d --build

# 2) vérifier l'état des services
docker-compose ps
```

Puis dans le navigateur :
- hard refresh (`Ctrl+Shift+R`)
- ou supprimer les données du site / unregister du service worker

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une [issue](https://github.com/NexaFlowFrance/OpenFamily/issues) ou une [pull request](https://github.com/NexaFlowFrance/OpenFamily/pulls).

## 📄 Licence

GNU Affero General Public License v3.0 (AGPL-3.0-only) - voir [licence.md](licence.md) pour plus de détails.

## 🙏 Crédits

Développé et maintenu par [NexaFlow France](https://nexaflow.fr).
Ce projet respecte la philosophie open source et encourage le partage et la contribution communautaire.
