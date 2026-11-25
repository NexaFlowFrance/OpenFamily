# Installer OpenFamily sur un serveur

*[English version](INSTALLATION.md) · [日本語版](INSTALLATION.ja.md)*

Ce guide va d'un serveur vide à OpenFamily en service pour votre famille, joignable depuis vos téléphones et tenu à jour. Il suppose un serveur Linux (un VPS, un mini-PC, un NAS qui fait tourner Docker, un Raspberry Pi 4/5 ou un conteneur Proxmox) et un terminal. Node.js n'est pas nécessaire sur le serveur : tout tourne dans Docker.

- [Choisir sa méthode](#choisir-sa-méthode)
- [La voie rapide, en un seul conteneur](#la-voie-rapide-en-un-seul-conteneur)
- [1. Installer Docker](#1-installer-docker)
- [2. Récupérer OpenFamily](#2-récupérer-openfamily)
- [3. Le configurer](#3-le-configurer)
- [4. Le démarrer](#4-le-démarrer)
- [5. Créer votre famille](#5-créer-votre-famille)
- [6. Y accéder hors de chez vous, en HTTPS](#6-y-accéder-hors-de-chez-vous-en-https)
- [7. Mettre à jour](#7-mettre-à-jour)
- [8. Sauvegarder et restaurer](#8-sauvegarder-et-restaurer)
- [Dépannage](#dépannage)
- [Développement local](#développement-local)

## Choisir sa méthode

| Vous avez | Utilisez |
|---|---|
| Un PC Windows allumé en permanence | L'[installateur Windows](https://github.com/NexaFlowFrance/OpenFamily/releases/latest/download/OpenFamily-Setup.exe). Pas de Docker, rien à configurer. |
| Un hôte Proxmox | Le [script Proxmox](#proxmox) : il crée le conteneur, installe Docker et configure tout. |
| Home Assistant, Umbrel, CasaOS, Runtipi, Unraid ou TrueNAS | Le catalogue d'applications du système : voir [la liste](README.fr.md#-depuis-le-catalogue-dapplications-de-votre-serveur). |
| N'importe quelle machine avec Docker : un serveur, un NAS, un Raspberry Pi | [Un seul conteneur](#la-voie-rapide-en-un-seul-conteneur) : une commande, rien à configurer. |
| Un serveur où vous voulez PostgreSQL, l'API et le serveur web dans des conteneurs séparés, ou construire depuis les sources | Docker Compose : ce guide, dès l'étape 1. |

**Ressources :** 1 cœur et 1 Go de RAM suffisent pour une famille ; 2 Go sont confortables pendant la construction des images. L'image unique prend environ 500 Mo de disque ; comptez 3 Go pour construire les images vous-même, et quelques centaines de Mo pour la base. amd64 et arm64 (Raspberry Pi) sont pris en charge.

## La voie rapide, en un seul conteneur

Une seule image contient l'interface web, l'API et PostgreSQL. Elle n'a pas besoin de fichier `.env` : les secrets sont créés au premier démarrage et rangés avec les données. Si Docker n'est pas encore installé, faites d'abord l'[étape 1](#1-installer-docker).

```bash
docker run -d --name openfamily --restart unless-stopped \
  -p 3000:3000 -v openfamily:/data \
  ghcr.io/nexaflowfrance/openfamily:latest
```

OpenFamily répond sur `http://<adresse-du-serveur>:3000` une dizaine de secondes plus tard, un peu plus la première fois sur un Raspberry Pi, le temps de créer la base. L'application Android se connecte à la même adresse. Continuez ensuite avec [5. Créer votre famille](#5-créer-votre-famille) et [6. Y accéder hors de chez vous, en HTTPS](#6-y-accéder-hors-de-chez-vous-en-https) : les deux s'appliquent tels quels.

Vous préférez un fichier compose ? [`docker/all-in-one/docker-compose.yml`](docker/all-in-one/docker-compose.yml) démarre le même conteneur : téléchargez-le, puis lancez `docker compose up -d` à côté.

**Ce qu'il faut garder.** Tout est dans `/data` : la base de données, et `openfamily.env`, les secrets créés au premier démarrage (la clé qui signe les sessions et chiffre les mots de passe d'intégrations enregistrés, le mot de passe de la base, les clés des notifications push). Utilisez un volume Docker comme ci-dessus, ou un dossier d'un disque Linux (`-v /srv/openfamily:/data`). Un dossier Windows ou un partage SMB ne convient pas : PostgreSQL a besoin d'un système de fichiers qui conserve les permissions Unix.

**Réglages.** Aucun n'est obligatoire. Chaque variable facultative de l'[étape 3](#3-le-configurer) peut être donnée avec `-e`, ou toutes ensemble dans un fichier avec `--env-file` :

```bash
docker run -d --name openfamily --restart unless-stopped \
  -p 3000:3000 -v openfamily:/data \
  -e REGISTRATION_ENABLED=false \
  -e SMTP_HOST=smtp.example.com -e MAIL_FROM="OpenFamily <famille@example.com>" \
  ghcr.io/nexaflowfrance/openfamily:latest
```

- Un `JWT_SECRET` ou une paire de clés `VAPID_*` donnés ainsi l'emportent sur ceux du volume. C'est la façon de reprendre les secrets d'une installation existante.
- Les réglages de la base et `SERVER_PORT` appartiennent à l'image. Pour un autre port, changez la partie gauche de `-p` (`-p 8080:3000`).
- `TZ` est facultatif : une nouvelle famille prend le fuseau horaire du navigateur qui la crée, et un parent peut le changer dans les Paramètres.
- Pour joindre un service qui tourne sur la même machine, comme Ollama, ajoutez `--add-host host.docker.internal:host-gateway` et donnez `http://host.docker.internal:11434` comme adresse.

**Mettre à jour.** Sauvegardez d'abord. Récupérez la nouvelle image et remplacez le conteneur : les données restent dans le volume, et les changements de base de données s'appliquent tout seuls au démarrage.

```bash
docker pull ghcr.io/nexaflowfrance/openfamily:latest
docker stop openfamily && docker rm openfamily
docker run -d --name openfamily ...   # la même commande que la première fois
```

Pour rester sur une version de votre choix, mettez son numéro à la place de `latest`, par exemple `ghcr.io/nexaflowfrance/openfamily:2.3.0`.

**Sauvegarder et restaurer.** Deux fichiers contiennent tout :

```bash
docker exec openfamily pg_dump -U openfamily -d openfamily -Fc > openfamily-$(date +%F).dump
docker exec openfamily cat /data/openfamily.env > openfamily-secrets.env
```

Gardez-les ensemble, ailleurs que sur le serveur. Pour restaurer dans une installation neuve, démarrez le conteneur comme ci-dessus, puis :

```bash
docker exec -i openfamily pg_restore -U openfamily -d openfamily --clean --if-exists --no-owner < openfamily-2026-11-16.dump
docker cp openfamily-secrets.env openfamily:/data/openfamily.env
docker restart openfamily
```

Sans le fichier des secrets, les comptes et les données sont bien là, mais les mots de passe d'intégrations et les adresses d'agendas suivis enregistrés ne peuvent plus être lus, et chaque téléphone doit autoriser de nouveau les notifications.

**Venir de l'installation Docker Compose, ou y revenir.** Les deux utilisent PostgreSQL 16 : une copie faite d'un côté se restaure de l'autre. Faites-la avec la commande de l'[étape 8](#8-sauvegarder-et-restaurer), restaurez-la avec la ligne `pg_restore` ci-dessus, et donnez au nouveau conteneur le `JWT_SECRET` et les clés `VAPID_*` de votre `.env` avec `-e`.

## 1. Installer Docker

Passez cette étape si `docker compose version` répond déjà.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # puis déconnectez-vous et reconnectez-vous
docker compose version            # doit afficher v2.x
```

## 2. Récupérer OpenFamily

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
git checkout "$(git describe --tags --abbrev=0)"   # la dernière version publiée plutôt que le travail en cours
```

## 3. Le configurer

```bash
cp .env.example .env
nano .env
```

Changez ces valeurs. Le serveur refuse de démarrer si `JWT_SECRET` est absent, fait moins de 32 caractères ou garde la valeur d'exemple.

| Variable | Valeur | Comment |
|---|---|---|
| `POSTGRES_PASSWORD` | Un mot de passe solide pour la base | `openssl rand -hex 24` |
| `JWT_SECRET` | Un secret aléatoire de 32 caractères ou plus | `openssl rand -hex 32` |
| `TZ` | Le fuseau horaire du serveur, par exemple `Europe/Paris`, `America/Montreal` | Sert aux rappels et aux agendas tant qu'un parent n'a pas choisi celui de la famille dans les Paramètres |
| `NODE_ENV` | `production` | |

Facultatif, mais utile :

| Variable | Rôle |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notifications push (rappels, activité de la famille). Générez les clés avec `docker run --rm node:26-alpine npx -y web-push generate-vapid-keys` ; `VAPID_SUBJECT` vaut `mailto:` suivi de votre e-mail. Le push demande aussi le HTTPS (étape 6). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | E-mails d'invitation et de réinitialisation du mot de passe. Sans eux, les invitations marchent quand même en partageant leur lien. |
| `REGISTRATION_ENABLED` | `false` ferme les inscriptions : seules les personnes que vous invitez peuvent créer un compte (voir l'étape 5). |
| `INTEGRATIONS_BLOCK_PRIVATE_IPS` | `true` fait refuser au serveur les appels vers les adresses privées (`192.168.x.x`, `10.x`, `localhost`) pour les intégrations, le fournisseur d'IA et les webhooks. À laisser désactivé à la maison, où Home Assistant ou Ollama sont sur votre réseau ; à activer sur un serveur ouvert à d'autres que votre famille. |
| `OIDC_*`, `PASSWORD_LOGIN_ENABLED` | Connexion par votre propre fournisseur d'identité (Authentik, Keycloak...) : voir [Connexion unique](#connexion-unique-sso). |

Laissez **vides**, sauf besoin précis : `VITE_API_URL`, `VITE_WS_URL` (l'application parle à sa propre adresse et transmet elle-même `/api`), `CORS_ORIGINS` (seulement pour une application web servie depuis un autre domaine), `APP_PUBLIC_URL` (seulement si les liens des e-mails montrent une mauvaise adresse derrière votre proxy, ou pour la connexion unique).

## 4. Le démarrer

**Option A : images prêtes à l'emploi** (plus rapide, conseillé sur les petites machines et le Raspberry Pi). Créez `docker-compose.override.yml` à côté de `docker-compose.yml`, avec la version récupérée :

```yaml
services:
  server:
    image: ghcr.io/nexaflowfrance/openfamily-server:2.3.0
  client:
    image: ghcr.io/nexaflowfrance/openfamily-client:2.3.0
```

```bash
docker compose pull server client
docker compose up -d
```

**Option B : construire sur le serveur** (quelques minutes, 2 Go de RAM) :

```bash
docker compose up -d --build
```

Puis vérifiez :

```bash
docker compose ps                        # les trois services sont "healthy"
curl -s http://localhost:3000/health     # {"status":"ok",...}
```

OpenFamily répond sur `http://<adresse-du-serveur>:3000`. Seul le port **3000** est nécessaire : il sert l'application et transmet l'API et les mises à jour en direct au serveur. L'application Android se connecte aussi à cette adresse.

> **N'exposez pas les autres ports sur Internet.** Le fichier compose publie aussi l'API (3001) et PostgreSQL (`POSTGRES_PORT`) pour les outils locaux. Sur un serveur joignable depuis Internet, n'autorisez que le 3000 (ou 80/443 via votre proxy) dans le pare-feu, ou gardez-les sur la machine en ajoutant à `docker-compose.override.yml` (Docker Compose 2.24 ou plus récent) :
>
> ```yaml
>   postgres:
>     ports: !override
>       - "127.0.0.1:5432:5432"
> ```
>
> et de même `127.0.0.1:3001:3001` sous `server:`.

## 5. Créer votre famille

1. Ouvrez OpenFamily et créez votre compte : il devient propriétaire d'une nouvelle famille.
2. Dans **Famille**, ajoutez chaque personne (avec ou sans compte) et invitez les adultes qui veulent leur propre connexion.
3. Une fois votre propre compte créé, fermez les inscriptions : mettez `REGISTRATION_ENABLED=false` dans `.env`, puis `docker compose up -d`. Dès lors, plus personne ne peut créer de compte de lui-même, mais toute personne que vous invitez depuis **Famille** (par lien ou par e-mail) le peut toujours : l'invitation est son billet d'entrée. Une invitation dure de 1 à 30 jours et peut être réservée à une adresse e-mail.

## 6. Y accéder hors de chez vous, en HTTPS

Le HTTPS est nécessaire pour les notifications push, pour installer OpenFamily comme une application sur un téléphone, et pour protéger les mots de passe sur Internet. Au choix :

**Tailscale (aucun port ouvert, rien de public).** Installez [Tailscale](https://tailscale.com/download) sur le serveur et sur chaque téléphone. Ouvrez `http://<nom-tailscale-du-serveur>:3000`, ou lancez `tailscale serve --bg 3000` sur le serveur pour obtenir une adresse HTTPS.

**Un domaine et un reverse proxy.** Faites pointer un enregistrement DNS (`famille.example.com`) vers votre serveur, ouvrez les ports 80 et 443 et envoyez tout vers le port 3000. Avec [Caddy](https://caddyserver.com), qui obtient le certificat tout seul, le `Caddyfile` complet est :

```
famille.example.com {
    reverse_proxy localhost:3000
}
```

Avec **Nginx Proxy Manager**, créez un proxy host vers `http://<ip-du-serveur>:3000`, activez **Websockets support** et demandez un certificat Let's Encrypt. Avec votre propre **nginx**, transmettez `/` au port 3000 avec les en-têtes `Upgrade`/`Connection` pour les WebSockets et `client_max_body_size 256m`.

Aucun changement de `.env` n'est nécessaire pour un proxy : l'application fonctionne à l'adresse avec laquelle on l'ouvre.

## 7. Mettre à jour

Sauvegardez d'abord (étape 8). Les changements de base de données s'appliquent tout seuls au démarrage du serveur.

**Images prêtes à l'emploi :** changez la version dans `docker-compose.override.yml`, puis :

```bash
git fetch --tags && git checkout <nouvelle-version>   # garde docker-compose.yml au même niveau
docker compose pull server client
docker compose up -d
```

**Construit sur le serveur :**

```bash
git fetch --tags && git checkout "$(git describe --tags --abbrev=0 origin/main)"
docker compose up -d --build
```

Les [notes de version](https://github.com/NexaFlowFrance/OpenFamily/releases) signalent tout nouveau réglage `.env` ; comparez avec `.env.example`.

## 8. Sauvegarder et restaurer

Tout est dans le volume PostgreSQL. Une copie quotidienne suffit :

```bash
docker compose exec -T postgres pg_dump -U openfamily -d openfamily -Fc > openfamily-$(date +%F).dump
```

Pour la restaurer dans une installation neuve (après `docker compose up -d`, avant de créer un compte) :

```bash
docker compose exec -T postgres pg_restore -U openfamily -d openfamily --clean --if-exists < openfamily-2026-09-26.dump
docker compose restart server
```

Gardez votre `.env` avec les copies : sans le même `JWT_SECRET`, les mots de passe d'intégrations et les adresses d'agendas suivis enregistrés ne peuvent plus être lus.

Chaque famille peut aussi télécharger ses propres données depuis **Paramètres → Exporter les données** et les importer dans un autre OpenFamily.

## Connexion unique (SSO)

Vos proches peuvent se connecter avec un fournisseur OpenID Connect que vous utilisez déjà : Authentik, Keycloak, Authelia, Pocket ID, Zitadel, Google... La connexion par mot de passe continue de fonctionner, sauf si vous la désactivez.

1. Chez votre fournisseur, créez un client OpenID Connect **confidentiel** (flux « authorization code ») avec :
   - URI de redirection : `https://famille.example.fr/api/auth/oidc/callback` (votre adresse, puis `/api/auth/oidc/callback`)
   - scopes `openid email profile`
   - jetons d'identité signés en RS256 (le réglage habituel)
2. Ajoutez dans `.env` :

   | Variable | Valeur |
   |---|---|
   | `APP_PUBLIC_URL` | `https://famille.example.fr`, l'adresse par laquelle commence l'URI de redirection |
   | `OIDC_ISSUER_URL` | L'émetteur (« issuer ») du fournisseur, par exemple `https://auth.example.fr/application/o/openfamily/` (Authentik), `https://auth.example.fr/realms/maison` (Keycloak), `https://id.example.fr` (Pocket ID) |
   | `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | Ceux de l'étape 1 |
   | `OIDC_PROVIDER_NAME` | Le libellé du bouton, par exemple `Authentik` |

3. Lancez `docker compose up -d` et ouvrez la page de connexion : elle propose **Continuer avec ...**. Sinon, le journal du serveur contient une ligne `auth.oidc_disabled` qui indique ce qui manque.

**Dans l'application Android.** Le même bouton s'y trouve. Il ouvre le fournisseur dans le navigateur du téléphone, et le téléphone revient dans l'application une fois connecté. Il n'y a rien de plus à déclarer chez le fournisseur : l'URI de redirection reste celle indiquée plus haut. Il faut un serveur et une application tous deux plus récents que la 2.2.0.

Le serveur doit joindre le fournisseur en HTTPS. Gardez le secret du client uniquement dans `.env` ; pour le changer, créez le nouveau chez le fournisseur, mettez `.env` à jour, lancez `docker compose up -d`, puis révoquez l'ancien.

**Qui peut entrer.** À la première connexion par SSO :
- si un compte utilise déjà la même adresse e-mail, le SSO ne l'ouvre pas : la personne se connecte avec son mot de passe et lie le SSO dans **Paramètres → Connexion**, une seule fois. Une adresse seule ne prouve jamais à qui appartient un compte (l'inscription par mot de passe ne la vérifie pas, et certains fournisseurs laissent saisir n'importe quelle adresse) : ensuite, le compte est reconnu par son lien avec le fournisseur, pas par son adresse ;
- si aucun compte n'utilise l'adresse, un nouveau compte est créé, seulement si le fournisseur a vérifié l'adresse, et seulement si l'inscription par SSO est ouverte (`OIDC_REGISTRATION_ENABLED`, qui suit `REGISTRATION_ENABLED` si elle n'est pas définie) ou si la personne vient d'une invitation. Dans Keycloak, les utilisateurs créés par un administrateur ont « Email vérifié » désactivé tant que vous ne le cochez pas.

| Objectif | `PASSWORD_LOGIN_ENABLED` | `REGISTRATION_ENABLED` | `OIDC_REGISTRATION_ENABLED` |
|---|---|---|---|
| Mots de passe et SSO, inscription libre | `true` | `true` | (non définie) |
| Les mots de passe restent, les nouveaux arrivent par SSO | `true` | `false` | `true` |
| Sur invitation uniquement, des deux façons | `true` | `false` | (non définie) |
| SSO uniquement | `false` | `false` | `true` |

Les invitations fonctionnent toujours. `PASSWORD_LOGIN_ENABLED=false` coupe aussi l'inscription et la réinitialisation par mot de passe, et reste ignorée tant que le SSO n'est pas configuré : une faute de frappe ne bloque personne. Testez une connexion par SSO avant de couper les mots de passe, et faites d'abord lier le SSO aux utilisateurs existants dans **Paramètres → Connexion** : sans lien, ils ne pourront plus se connecter une fois les mots de passe coupés.

**Si le fournisseur est en panne sur un serveur 100 % SSO**, mettez `PASSWORD_LOGIN_ENABLED=true`, lancez `docker compose up -d`, puis donnez un mot de passe à votre compte :

```bash
docker compose exec server node server/dist/scripts/authAdmin.js set-password --email vous@example.fr
```

`unlink-sso` à la place de `set-password` retire le lien SSO d'un compte. Les deux déconnectent le compte partout. Avec l'installeur Windows ou le script Proxmox, ajoutez les mêmes variables au fichier `.env` qu'ils ont créé ; sur Unraid, CasaOS et Runtipi, elles sont dans les réglages de l'application.

**Bon à savoir.**
- Se déconnecter chez le fournisseur ne déconnecte pas d'OpenFamily, et une personne retirée chez le fournisseur garde ses sessions ouvertes jusqu'à leur expiration (7 jours). Pour les fermer tout de suite : **Paramètres → Connexion → Se déconnecter de tous les appareils** pour votre propre compte, ou retirez la personne dans **Famille**. Une réinitialisation de mot de passe déconnecte aussi le compte partout.
- Retirer quelqu'un de la famille, ou transmettre la famille à un autre membre, déconnecte désormais les personnes concernées sur tous leurs appareils.
- Votre reverse proxy peut journaliser les adresses complètes, dont le code à usage unique que le fournisseur envoie à `/api/auth/oidc/callback`. Ce code ne sert plus à rien après quelques secondes, mais vous pouvez retirer les paramètres de requête du journal pour ce chemin.
- L'application Android garde pour l'instant la connexion par mot de passe.

## Proxmox

À lancer sur l'**hôte** Proxmox (pas dans un conteneur) :

```bash
curl -fsSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-lxc-install.sh -o openfamily-lxc.sh
bash openfamily-lxc.sh --help                       # toutes les options
bash openfamily-lxc.sh --id 210 --ip 192.168.1.50/24 --gw 192.168.1.1
```

Il crée un conteneur Debian avec Docker, génère les secrets et démarre OpenFamily. Pour mettre à jour ensuite : `pct exec 210 -- openfamily-update`, qui sauvegarde la base avant.

## Dépannage

**Regardez d'abord les journaux :** `docker compose logs --tail=200 server`.

| Symptôme | Cause et solution |
|---|---|
| Le serveur redémarre en boucle, les journaux parlent de `JWT_SECRET` | Absent, trop court ou resté à l'exemple : mettez une valeur aléatoire de 32 caractères ou plus. |
| `password authentication failed for user "openfamily"` | Le volume de la base a été créé avec un autre `POSTGRES_PASSWORD`. Remettez l'ancien mot de passe, ou, sur une installation neuve seulement, supprimez le volume avec `docker compose down -v` (cela efface les données). |
| `port is already allocated` | Un autre programme utilise 3000, 3001 ou le port PostgreSQL. Changez `POSTGRES_PORT` dans `.env`, ou publiez l'application sur un autre port (par exemple `"8080:80"` pour `client`). |
| Les rappels arrivent avec une ou deux heures de retard | `TZ` manque : ajoutez-le dans `.env` puis `docker compose up -d`. |
| « Créer un compte » absent ou refusé | `REGISTRATION_ENABLED=false` : invitez la personne depuis **Famille**, ou repassez-le à `true`. |
| Pas de bouton « Continuer avec ... » sur la page de connexion | Le SSO est désactivé : la ligne `auth.oidc_disabled` du journal du serveur indique la variable manquante (souvent `APP_PUBLIC_URL`). |
| Le SSO se termine sur « Échec de la connexion » | La ligne `auth.oidc_callback_failed` du journal du serveur donne la raison. Vérifiez que l'URI de redirection déclarée chez le fournisseur est exactement `APP_PUBLIC_URL` + `/api/auth/oidc/callback`. |
| Pas de notifications push | Il faut le HTTPS et les trois valeurs `VAPID_*`, et les autoriser sur chaque appareil. |
| La page s'affiche mais rien ne se met à jour en direct derrière un proxy | Les WebSockets ne passent pas : activez-les dans le proxy. |
| « 413 Request Entity Too Large » pendant un import | Votre propre proxy limite les envois : augmentez sa limite (`client_max_body_size 256m` dans nginx). |

Toujours bloqué ? Ouvrez une [issue](https://github.com/NexaFlowFrance/OpenFamily/issues) avec la sortie de `docker compose ps` et les journaux du serveur (sans aucun secret).

## Développement local

```bash
docker compose up -d postgres     # la base seulement
npm run install:all
npm run dev:server                # API sur http://localhost:3001
npm run dev:client                # application sur http://localhost:5173
```

Le serveur lit le `.env` à la racine du dépôt. `npm run smoke:api` vérifie une installation qui tourne de bout en bout (il faut `curl` et `jq`).
