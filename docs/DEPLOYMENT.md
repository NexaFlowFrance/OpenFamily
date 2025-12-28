# Guide de Déploiement du Serveur OpenFamily

Ce guide explique comment déployer votre propre serveur OpenFamily pour partager les données avec votre famille.

## Prérequis

- Un serveur Linux (VPS, Raspberry Pi, NAS, etc.)
- Docker et Docker Compose installés
- Un nom de domaine (optionnel mais recommandé)
- Connaissances basiques en ligne de commande

## Option 1 : Déploiement avec Docker Compose (Recommandé)

### 1. Cloner le projet

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
```

### 2. Configurer les variables d'environnement

Créez un fichier `.env` à la racine du projet :

```bash
cp .env.example .env
nano .env
```

Modifiez les valeurs suivantes :

```env
DB_PASSWORD=votre_mot_de_passe_securise
PORT=3000
NODE_ENV=production
```

**Important** : Changez le mot de passe de la base de données !

### 3. Démarrer les services

```bash
docker-compose up -d
```

Cette commande va :
- Créer une base de données PostgreSQL
- Initialiser le schema de la base de données
- Démarrer l'application OpenFamily
- Exposer l'application sur le port 3000

### 4. Vérifier le déploiement

```bash
curl http://localhost:3000/api/health
```

Vous devriez voir : `{"status":"ok","timestamp":"..."}`

### 5. Accéder à l'application

Ouvrez votre navigateur : `http://votre-serveur:3000`

## Option 2 : Déploiement Manuel

### 1. Installer PostgreSQL

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
```

### 2. Créer la base de données

```bash
sudo -u postgres psql

CREATE DATABASE openfamily;
CREATE USER openfamily WITH PASSWORD 'votre_mot_de_passe';
GRANT ALL PRIVILEGES ON DATABASE openfamily TO openfamily;
\q
```

### 3. Initialiser le schema

```bash
psql -U openfamily -d openfamily -f server/schema.sql
```

### 4. Installer Node.js (v20+)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 5. Installer pnpm

```bash
npm install -g pnpm
```

### 6. Installer les dépendances

```bash
pnpm install
```

### 7. Builder l'application

```bash
pnpm build
```

### 8. Configurer les variables d'environnement

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=openfamily
export DB_USER=openfamily
export DB_PASSWORD=votre_mot_de_passe
export PORT=3000
export NODE_ENV=production
```

### 9. Démarrer le serveur

```bash
pnpm start
```

Pour un démarrage automatique, utilisez PM2 :

```bash
npm install -g pm2
pm2 start dist/index.js --name openfamily
pm2 save
pm2 startup
```

## Configuration HTTPS avec Nginx (Recommandé)

### 1. Installer Nginx

```bash
sudo apt install nginx
```

### 2. Installer Certbot pour Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
```

### 3. Configurer Nginx

Créez un fichier `/etc/nginx/sites-available/openfamily` :

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activez la configuration :

```bash
sudo ln -s /etc/nginx/sites-available/openfamily /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Obtenir un certificat SSL

```bash
sudo certbot --nginx -d votre-domaine.com
```

## Configuration du Client

Une fois le serveur déployé, configurez l'application :

1. Lors de l'onboarding, choisissez **"Mode Serveur"**
2. Entrez l'URL : `https://votre-domaine.com/api`
3. (Optionnel) Entrez un token d'authentification
4. (Optionnel) Entrez un ID de famille

## Sécurité

### 1. Firewall

Configurez le firewall pour n'autoriser que les ports nécessaires :

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

### 2. Authentification

Pour l'instant, l'authentification est basique. Il est recommandé de :
- Utiliser des tokens forts (UUID v4)
- Restreindre l'accès par IP si possible
- Utiliser HTTPS obligatoirement

### 3. Sauvegardes

Configurez des sauvegardes automatiques de PostgreSQL :

```bash
# Ajouter dans crontab
0 2 * * * pg_dump -U openfamily openfamily > /backup/openfamily_$(date +\%Y\%m\%d).sql
```

## Mise à jour

### Avec Docker Compose

```bash
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

### Manuel

```bash
git pull
pnpm install
pnpm build
pm2 restart openfamily
```

## Monitoring

### Vérifier les logs

#### Docker
```bash
docker-compose logs -f app
```

#### PM2
```bash
pm2 logs openfamily
```

### Health Check

Configurez un cron pour vérifier la santé du serveur :

```bash
*/5 * * * * curl -f http://localhost:3000/api/health || systemctl restart openfamily
```

## Dépannage

### La base de données ne démarre pas

```bash
# Vérifier les logs
docker-compose logs db

# Réinitialiser le volume (ATTENTION : perte de données)
docker-compose down -v
docker-compose up -d
```

### L'application ne se connecte pas à la base

1. Vérifiez les variables d'environnement
2. Vérifiez que PostgreSQL est accessible
3. Vérifiez les credentials

```bash
psql -h localhost -U openfamily -d openfamily
```

### Erreur 502 Bad Gateway

1. Vérifiez que l'application tourne
2. Vérifiez les logs nginx
3. Vérifiez la configuration proxy_pass

## Support

Pour toute question ou problème :
- Ouvrez une issue sur GitHub : https://github.com/NexaFlowFrance/OpenFamily/issues
- Consultez la documentation : https://github.com/NexaFlowFrance/OpenFamily

## Ressources

- [Documentation Docker](https://docs.docker.com/)
- [Documentation PostgreSQL](https://www.postgresql.org/docs/)
- [Documentation Nginx](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)
