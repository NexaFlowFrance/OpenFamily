# OpenFamily

OpenFamily est une application de gestion familiale complète proposée en open source par NexaFlow, conçue pour être auto-hébergée. Gardez le contrôle total de vos données en hébergeant l'application sur votre propre serveur. Gérez vos courses, tâches, rendez-vous, recettes, planning des repas et budget familial en toute sécurité, accessible depuis tous vos appareils.

## 🎯 Fonctionnalités

- 🛒 **Liste de courses** - Catégorisation automatique, prix, quantités, templates
- ✅ **Tâches** - Tâches récurrentes, assignation familiale, statistiques
- 📅 **Rendez-vous** - Calendrier mensuel, rappels automatiques, code couleur
- 🗓️ **Planning hebdomadaire** - Horaires de travail et emploi du temps scolaire par membre
- 🍳 **Recettes** - Bibliothèque familiale, filtres avancés, temps de préparation
- 🍽️ **Planning repas** - Vue hebdomadaire, export PDF, liaison recettes
- 💰 **Budget** - Suivi mensuel, limites par catégorie, statistiques
- 👨‍👩‍👧‍👦 **Famille** - Profils membres, informations santé, contacts d'urgence

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
- React 19 + TypeScript
- Vite 7
- TailwindCSS + Radix UI
- React Router
- date-fns, Recharts

### Backend
- Node.js 20 + Express
- PostgreSQL 16
- WebSocket (ws)
- JWT Authentication
- TypeScript

### DevOps
- Docker + Docker Compose
- Multi-stage builds
- Nginx (production)

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

- Authentification JWT
- Mots de passe hashés avec bcrypt
- CORS configuré
- Variables d'environnement pour les secrets
- Validation des entrées

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

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

## 📄 Licence

MIT License - Voir le fichier LICENSE pour plus de détails.

## 🙏 Crédits

Basé sur le projet [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily) inititié par NexaFlow France.
Ce projet respecte la philosophie open source et encourage le partage et la contribution communautaire.
