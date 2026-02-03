# Corrections apportées pour l'installation Docker

## Problèmes résolus

### 1. ✅ Portainer Web Editor : Dockerfile manquant
**Problème** : Le compose utilisait `build:` qui nécessitait les fichiers sources.  
**Solution** : Le `docker-compose.yml` utilise maintenant uniquement `image: nexaflow/openfamily:latest` (pull depuis Docker Hub).

### 2. ✅ Schema SQL non appliqué automatiquement
**Problème** : Les tables n'étaient pas créées, erreurs `relation ... does not exist`.  
**Solution** : Ajout de 2 services :
- `schema-downloader` : Télécharge automatiquement le schema.sql depuis GitHub
- `schema-init` : Applique le schema après le démarrage de Postgres avec les bons credentials (`openfamily` au lieu de `postgres`)

### 3. ✅ Instructions d'erreur incorrectes
**Problème** : L'app suggérait `psql -U postgres` alors que l'utilisateur est `openfamily`.  
**Solution** : Le service `schema-init` utilise automatiquement les bons credentials.

### 4. ✅ Problème de bind mount avec fichier manquant
**Problème** : Si `./server/schema.sql` n'existe pas, Docker crée un dossier.  
**Solution** : Le schema est téléchargé dans un volume partagé, pas monté depuis l'hôte.

### 5. ✅ Authentification DB avec volumes persistants
**Problème** : Password authentication failed avec volumes existants.  
**Solution** : Le schema-init utilise le mot de passe depuis `/shared/.db_password` pour se connecter.

## Architecture de la solution

```
init (génère password)
  ↓
schema-downloader (télécharge schema.sql)
  ↓
postgres (démarre avec password)
  ↓
schema-init (applique schema avec credentials corrects)
  ↓
app (démarre avec DATABASE_URL correct)
```

## Fichiers modifiés

- `docker-compose.yml` : Version "production" utilisant l'image Docker Hub + téléchargement automatique du schema
- `docker-compose.build.yml` : Version "développement" pour builder localement
- `README.md` : Instructions mises à jour

## Installation simplifiée pour utilisateurs finaux

```bash
mkdir openfamily && cd openfamily
curl -O https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/docker-compose.yml
docker compose up -d
```

**Aucun fichier supplémentaire requis !**

## Compatible avec

- ✅ Docker Compose CLI
- ✅ Portainer Web Editor (copier/coller le docker-compose.yml)
- ✅ Portainer Git Repository
- ✅ Docker Desktop

## Vérification de l'installation

```bash
# Vérifier les services
docker compose ps

# Voir les logs de l'initialisation
docker compose logs schema-downloader
docker compose logs schema-init

# Vérifier que l'app fonctionne
curl http://localhost:3000
```

## Mise à jour

```bash
docker compose pull
docker compose up -d
```
