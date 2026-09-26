# Installing OpenFamily on a server

*[Version française](INSTALLATION.fr.md)*

This guide takes you from an empty server to OpenFamily running for your family, reachable from your phones, and kept up to date. It assumes a Linux server (a VPS, a mini PC, a NAS that runs Docker, a Raspberry Pi 4/5 or a Proxmox container) and a terminal. No Node.js is needed on the server: everything runs in Docker.

- [Choose how to install](#choose-how-to-install)
- [1. Install Docker](#1-install-docker)
- [2. Get OpenFamily](#2-get-openfamily)
- [3. Configure it](#3-configure-it)
- [4. Start it](#4-start-it)
- [5. Create your family](#5-create-your-family)
- [6. Reach it from outside your home, over HTTPS](#6-reach-it-from-outside-your-home-over-https)
- [7. Update](#7-update)
- [8. Back up and restore](#8-back-up-and-restore)
- [Troubleshooting](#troubleshooting)
- [Local development](#local-development)

## Choose how to install

| You have | Use |
|---|---|
| A Windows PC that stays on | The [Windows installer](https://github.com/NexaFlowFrance/OpenFamily/releases/latest/download/OpenFamily-Setup.exe). No Docker, nothing to configure. |
| A Proxmox host | The [Proxmox script](#proxmox): it creates the container, installs Docker and configures everything. |
| Any Linux server with Docker | This guide, from step 1. |

**Resources:** 1 CPU core and 1 GB of RAM are enough for a family; 2 GB is comfortable while building the images. Count 3 GB of disk for Docker images and a few hundred MB for the database. amd64 and arm64 (Raspberry Pi) are both supported.

## 1. Install Docker

Skip this step if `docker compose version` already answers.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # then log out and back in
docker compose version            # must print v2.x
```

## 2. Get OpenFamily

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
git checkout "$(git describe --tags --abbrev=0)"   # latest release rather than work in progress
```

## 3. Configure it

```bash
cp .env.example .env
nano .env
```

Change these values. The server refuses to start while `JWT_SECRET` is missing, shorter than 32 characters or left as the example.

| Variable | What to put | How |
|---|---|---|
| `POSTGRES_PASSWORD` | A strong database password | `openssl rand -hex 24` |
| `JWT_SECRET` | A random secret of 32+ characters | `openssl rand -hex 32` |
| `TZ` | Your family's time zone, e.g. `Europe/Paris`, `America/Montreal` | Reminders and imported calendars use it |
| `NODE_ENV` | `production` | |

Optional, but worth it:

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications (reminders, family activity). Generate the keys with `docker run --rm node:20-alpine npx -y web-push generate-vapid-keys`; `VAPID_SUBJECT` is `mailto:` followed by your e-mail. Push also needs HTTPS (step 6). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Invitation e-mails and password reset. Without them, invitations still work by sharing their link. |
| `REGISTRATION_ENABLED` | `false` stops anyone from creating an account (see step 5). |

Leave these **empty** unless you know you need them: `VITE_API_URL`, `VITE_WS_URL` (the web app talks to its own address and forwards `/api` itself), `CORS_ORIGINS` (only for a web app served from another domain), `APP_PUBLIC_URL` (only if e-mail links show the wrong address behind your proxy).

## 4. Start it

**Option A: ready-made images** (faster, recommended on small machines and Raspberry Pi). Create `docker-compose.override.yml` next to `docker-compose.yml`, with the version you checked out:

```yaml
services:
  server:
    image: ghcr.io/nexaflowfrance/openfamily-server:1.7.1
  client:
    image: ghcr.io/nexaflowfrance/openfamily-client:1.7.1
```

```bash
docker compose pull server client
docker compose up -d
```

**Option B: build on the server** (a few minutes, 2 GB of RAM):

```bash
docker compose up -d --build
```

Then check:

```bash
docker compose ps                        # the three services are "healthy"
curl -s http://localhost:3000/health     # {"status":"ok",...}
```

OpenFamily is at `http://<server-address>:3000`. Only port **3000** is needed: it serves the app and forwards the API and live updates to the server. The Android app also connects to this address.

> **Do not expose the other ports to the internet.** The compose file also publishes the API (3001) and PostgreSQL (`POSTGRES_PORT`) for local tools. On a server reachable from the internet, allow only 3000 (or 80/443 through your proxy) in the firewall, or keep them on the machine itself by adding to `docker-compose.override.yml` (Docker Compose 2.24 or later):
>
> ```yaml
>   postgres:
>     ports: !override
>       - "127.0.0.1:5432:5432"
> ```
>
> and the same with `127.0.0.1:3001:3001` under `server:`.

## 5. Create your family

1. Open OpenFamily and create your account: it becomes the owner of a new family.
2. In **Family**, add each person (with or without an account) and invite the adults who want their own login.
3. Once everyone who needs an account has created it, you can close sign-ups: set `REGISTRATION_ENABLED=false` in `.env`, then `docker compose up -d`. Each new account creates or joins a family, and with sign-ups closed nobody can create an account, not even with an invitation, so reopen it for a moment when someone new joins.

## 6. Reach it from outside your home, over HTTPS

HTTPS is needed for push notifications, for installing OpenFamily as an app on a phone, and to keep passwords private on the internet. Pick one:

**Tailscale (no open port, nothing public).** Install [Tailscale](https://tailscale.com/download) on the server and on each phone. Open `http://<server-tailscale-name>:3000`, or run `tailscale serve --bg 3000` on the server to get an HTTPS address.

**A domain and a reverse proxy.** Point a DNS record (`family.example.com`) to your server, open ports 80 and 443, and send everything to port 3000. With [Caddy](https://caddyserver.com), which gets the certificate by itself, the whole `Caddyfile` is:

```
family.example.com {
    reverse_proxy localhost:3000
}
```

With **Nginx Proxy Manager**, create a proxy host to `http://<server-ip>:3000`, turn on **Websockets support** and request a Let's Encrypt certificate. With your own **nginx**, forward `/` to port 3000 with the `Upgrade`/`Connection` headers for WebSockets and `client_max_body_size 256m`.

No `.env` change is needed for a proxy: the app works on whatever address it is opened with.

## 7. Update

Back up first (step 8). Database changes run by themselves when the server starts.

**Ready-made images:** change the version in `docker-compose.override.yml`, then:

```bash
git fetch --tags && git checkout <new-version>     # keeps docker-compose.yml in step
docker compose pull server client
docker compose up -d
```

**Built on the server:**

```bash
git fetch --tags && git checkout "$(git describe --tags --abbrev=0 origin/main)"
docker compose up -d --build
```

The [release notes](https://github.com/NexaFlowFrance/OpenFamily/releases) mention any new `.env` setting; compare with `.env.example`.

## 8. Back up and restore

Everything lives in the PostgreSQL volume. A daily dump is enough:

```bash
docker compose exec -T postgres pg_dump -U openfamily -d openfamily -Fc > openfamily-$(date +%F).dump
```

Restore it into a fresh install (after `docker compose up -d`, before creating any account):

```bash
docker compose exec -T postgres pg_restore -U openfamily -d openfamily --clean --if-exists < openfamily-2026-09-26.dump
docker compose restart server
```

Keep your `.env` with the dumps: without the same `JWT_SECRET`, saved integration passwords and followed calendar addresses cannot be read.

Each family can also download its own data from **Settings → Export data** and import it into another OpenFamily.

## Proxmox

Run on the Proxmox **host** (not inside a container):

```bash
curl -fsSL https://raw.githubusercontent.com/NexaFlowFrance/OpenFamily/main/scripts/proxmox-lxc-install.sh -o openfamily-lxc.sh
bash openfamily-lxc.sh --help                       # all options
bash openfamily-lxc.sh --id 210 --ip 192.168.1.50/24 --gw 192.168.1.1
```

It creates a Debian container with Docker, generates the secrets and starts OpenFamily. Update later with `pct exec 210 -- openfamily-update`, which backs up the database first.

## Troubleshooting

**Look at the logs first:** `docker compose logs --tail=200 server`.

| Symptom | Cause and fix |
|---|---|
| The server restarts in a loop, logs mention `JWT_SECRET` | Missing, too short or left as the example: set a 32+ character random value. |
| `password authentication failed for user "openfamily"` | The database volume was created with another `POSTGRES_PASSWORD`. Put the old password back, or, on a new install only, delete the volume with `docker compose down -v` (this erases the data). |
| `port is already allocated` | Another program uses 3000, 3001 or the PostgreSQL port. Change `POSTGRES_PORT` in `.env`, or map another port for the app (for example `"8080:80"` for `client`). |
| Reminders arrive one or two hours late | `TZ` is missing: set it in `.env` and run `docker compose up -d`. |
| "Sign up" is refused | `REGISTRATION_ENABLED=false`: set it to `true` for a moment. |
| No push notifications | They need HTTPS and the three `VAPID_*` values, and must be allowed on each device. |
| The page loads but nothing updates live behind a proxy | WebSockets are not forwarded: turn on WebSocket support in the proxy. |
| "413 Request Entity Too Large" when importing | Your own proxy limits uploads: raise its limit (`client_max_body_size 256m` in nginx). |

Still stuck? Open an [issue](https://github.com/NexaFlowFrance/OpenFamily/issues) with the output of `docker compose ps` and the server logs (remove any secret).

## Local development

```bash
docker compose up -d postgres     # the database only
npm run install:all
npm run dev:server                # API on http://localhost:3001
npm run dev:client                # app on http://localhost:5173
```

The server reads `.env` from the repository root. `npm run smoke:api` checks a running stack end to end (needs `curl` and `jq`).
