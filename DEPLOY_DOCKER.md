# Déploiement Docker rapide

Prérequis sur le serveur:
- Docker et Docker Compose (ou Docker Engine + compose plugin)
- Accès root ou utilisateur avec droits Docker

Commandes pour builder et lancer (dans la racine du repo):

```bash
# Builder les images
docker compose build --pull --no-cache

# Lancer en arrière-plan
docker compose up -d

# Voir les logs
docker compose logs -f

# Arrêter
docker compose down
```

Remarques:
- Le `Dockerfile` est multi-stage: il exécute `pnpm build` puis produit deux targets:
  - `web` (nginx) qui sert `dist/public`
  - `api` (node) qui exécute `dist/index.js` (port 3000)
- Si votre hôte n'a pas `pnpm` disponible, le Dockerfile installe `pnpm` dans l'image de build.

Options utiles:
- Pour exposer seulement localement (sur la machine hébergeant Docker), modifiez `docker-compose.yml`
  en liant les ports sur `127.0.0.1` (ex: `127.0.0.1:80:80`). Cela empêche l'accès depuis l'extérieur.
