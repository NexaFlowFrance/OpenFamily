# KeurTonux

KeurTonux est une application de gestion familiale complète proposée en open source par tonuxcorp.dev, conçue pour être auto-hébergée. Gardez le contrôle total de vos données en hébergeant l'application sur votre propre serveur. Gérez vos courses, tâches, rendez-vous, recettes, planning des repas et budget familial en toute sécurité, accessible depuis tous vos appareils.

## 🎯 Fonctionnalités

### Modules principaux

- 🛒 **Liste de courses** - Catégorisation automatique, prix, quantités, templates, catalogue
- ✅ **Tâches** - Tâches récurrentes, assignation multi-membres, filtrage par membre, statistiques
- 📅 **Rendez-vous** - Calendrier mensuel, rappels automatiques, code couleur, événements multi-jours
- 🗓️ **Planning hebdomadaire** - Horaires de travail et emploi du temps scolaire par membre, horaires à cheval sur minuit
- 🍳 **Recettes** - Bibliothèque familiale, filtres avancés, temps de préparation
- 🍽️ **Planning repas** - Vue hebdomadaire, export PDF, liaison recettes, suivi des lunchbox
- 💰 **Budget** - Suivi mensuel, navigation par mois, limites par catégorie, dépenses par membre, statistiques avancées
- 👨‍👩‍👧‍👦 **Famille** - Profils membres, informations santé, contacts d'urgence
- 🏠 **Maison** - Suivi des équipements et des opérations de maintenance
- 🏖️ **Vacances** - Planification de voyages et gestion des bagages
- 📄 **Documents** - Stockage et organisation de documents familiaux (stockage objet MinIO/S3)

### Fonctionnalités transverses

- 🤖 **IA intégrée** - Couche IA branchable (NVIDIA NIM par défaut ou Google Gemini), désactivable :
  - Classification automatique et saisie en langage naturel des courses
  - Génération de recettes à partir d'ingrédients & analyse nutritionnelle
  - Analyse de la semaine de repas et idées de lunchbox
  - Scan de tickets de caisse (vision) → entrée budget automatique
  - Analyse mensuelle du budget et recommandations
  - Génération d'itinéraires de vacances et de listes de bagages
  - Suggestions de tenues pour les enfants selon la météo
- 🔔 **Notifications** - Notifications in-app + emails (SMTP Resend) avec digest quotidien
- 👥 **Invitations** - Invitation de membres / comptes par email
- 🌤️ **Météo** - Prévisions hebdomadaires et du lendemain (Open-Meteo)
- 💱 **Multi-devises** - Gestion de la devise par utilisateur avec onboarding
- 🌍 **Internationalisation** - Interface FR / EN (i18next)
- 🔒 **Mode confidentialité** - Masquage des montants et données sensibles
- 📤 **Export / Import** - Sauvegarde et restauration de toutes les données

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

## ⚙️ Configuration des services

Toutes les variables sont documentées dans `.env.example`. Les fonctionnalités optionnelles peuvent être désactivées sans modifier le code.

### Couche IA (`AI_ENABLED`)

Sélection du fournisseur via `AI_PROVIDER` :

- `nvidia` (par défaut) — NVIDIA NIM, clé `NVIDIA_API_KEY` ([build.nvidia.com](https://build.nvidia.com))
- `gemini` — Google Gemini via son endpoint compatible OpenAI, clé `GEMINI_API_KEY`

Paramètres communs : `AI_MODEL_DEFAULT`, `AI_MODEL_HEAVY`, `AI_MODEL_VISION`, `AI_MONTHLY_TOKEN_LIMIT_PER_USER` (quota par utilisateur), `AI_REQUEST_TIMEOUT_MS`.

### Emails & notifications (`EMAIL_ENABLED`)

SMTP Resend (`RESEND_SMTP_*`), expéditeur `EMAIL_FROM`, lien CTA `APP_BASE_URL`, heure du digest quotidien `EMAIL_DIGEST_HOUR`. La cloche de notifications in-app fonctionne même sans email configuré.

### Météo

Fournie par Open-Meteo (aucune clé requise) : `OPEN_METEO_BASE_URL`, `WEATHER_DEFAULT_LANG`, `WEATHER_CACHE_TTL_MS`.

### Stockage des documents (MinIO / S3)

`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_REGION`. Le service MinIO est inclus dans `docker-compose.yml`.

### Comptes

`REGISTRATION_ENABLED=false` désactive la création de nouveaux comptes (les invitations restent possibles).

## 🛠️ Technologies

### Frontend

- React 19 + TypeScript
- Vite 7
- TailwindCSS + Radix UI
- React Router
- date-fns, Recharts
- i18next / react-i18next (FR / EN)

### Backend

- Node.js 20 + Express
- PostgreSQL 16
- WebSocket (ws)
- JWT Authentication (cookies httpOnly)
- Couche IA : NVIDIA NIM & Google Gemini (branchable via `AI_PROVIDER`)
- Nodemailer (SMTP Resend) pour les emails
- Multer + MinIO/S3 pour le stockage de fichiers
- TypeScript

### DevOps

- Docker + Docker Compose
- MinIO (stockage objet S3-compatible)
- Multi-stage builds
- Nginx (production)

## 📦 Structure du projet

```
OpenFamily/
├── client/              # Application React
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/    # Auth, Theme, Privacy
│   │   ├── pages/
│   │   ├── i18n/        # Locales FR / EN
│   │   └── lib/
│   └── Dockerfile
├── server/              # API Express
│   ├── src/
│   │   ├── routes/      # shopping, tasks, budget, ai, house, vacations, documents…
│   │   ├── ai/          # Providers (NVIDIA, Gemini) + prompts
│   │   ├── email/       # EmailService + templates
│   │   ├── weather/     # WeatherService (Open-Meteo)
│   │   ├── middleware/
│   │   └── schemas/
│   ├── schema.sql
│   └── Dockerfile
├── shared/              # Types et constantes partagés
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

GNU Affero General Public License v3.0 (AGPL-3.0-only) - Voir le fichier licence.md pour plus de détails.

## 🙏 Crédits

Basé sur le projet [KeurTonux](https://github.com/tonuxcorp.devFrance/KeurTonux) inititié par tonuxcorp.dev France.
Ce projet respecte la philosophie open source et encourage le partage et la contribution communautaire.
