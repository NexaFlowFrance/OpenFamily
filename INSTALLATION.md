# Guide d'installation OpenFamily

Ce guide couvre:
- un run local rapide avec Docker
- un run developpement local (code sur machine, DB Docker)
- une checklist de deploiement production

## Prerequis

- Docker + Docker Compose
- Node.js 20+
- npm 10+
- `curl` + `jq` pour les smoke tests API

## 1) Demarrage rapide Docker (recommande)

```bash
cp .env.example .env
# adapte les valeurs si besoin

docker-compose up -d --build
```

Services exposes:
- Frontend: `http://localhost:3000`
- API: `http://localhost:3001`
- PostgreSQL: `localhost:5433`

Verification rapide:

```bash
curl -sS http://localhost:3001/health
npm run smoke:api
```

## 2) Developpement local (API/Front sur machine)

Mode conseille: garder uniquement la DB dans Docker.

```bash
# DB uniquement
docker-compose up -d postgres

# puis en local
npm run dev:server
npm run dev:client
```

Acces:
- Frontend dev: `http://localhost:5173`
- API dev: `http://localhost:3001`

Important:
- le backend charge maintenant automatiquement `../.env` quand lance depuis `server/`
- si le mot de passe DB change apres initialisation du volume, il faut reinitialiser le volume

Reinitialiser la DB (destructif):

```bash
docker-compose down -v
docker-compose up -d postgres
```

## 3) Deploiement production (mise en ligne)

### Variables d'environnement

Base de reference:
- `.env.production.example`

En production, definir au minimum:
- `POSTGRES_PASSWORD` fort
- `JWT_SECRET` fort (32+ chars)
- `CORS_ORIGINS` vers le domaine frontend
- `VITE_API_URL` et `VITE_WS_URL` vers ton endpoint public API

### Build + run

```bash
docker-compose up -d --build
```

### Validation post-deploiement

```bash
curl -sS https://api.votre-domaine.tld/health
API_BASE=https://api.votre-domaine.tld npm run smoke:api
```

## 4) Observabilite et exploitation

Logs:

```bash
docker-compose logs -f
docker-compose logs -f server
docker-compose logs -f client
docker-compose logs -f postgres
```

Etat:

```bash
docker-compose ps
```

Arret:

```bash
docker-compose down
```

## 5) Depannage

### `password authentication failed for user "openfamily"`

Cause frequente:
- volume PostgreSQL initialise avec un ancien mot de passe

Solutions:
1. remettre l'ancien mot de passe dans `.env`
2. ou reinitialiser le volume (`docker-compose down -v`)

### Port deja utilise

```bash
sudo lsof -i :3000
sudo lsof -i :3001
sudo lsof -i :5433
```

### API KO mais conteneur up

- verifier `docker-compose logs --tail=200 server`
- verifier `curl -sS http://localhost:3001/health`

## 6) Couverture fonctionnelle

Le projet couvre maintenant:
- Auth
- Dashboard
- Courses + templates
- Taches
- Rendez-vous
- Recettes
- Planning repas (creation + edition)
- Budget
- Famille

Validation automatique disponible via `npm run smoke:api`.
