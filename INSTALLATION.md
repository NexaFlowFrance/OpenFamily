# Installing OpenFamily on a server

*[Version française](INSTALLATION.fr.md) · [日本語版](INSTALLATION.ja.md)*

This guide takes you from an empty server to OpenFamily running for your family, reachable from your phones, and kept up to date. It assumes a Linux server (a VPS, a mini PC, a NAS that runs Docker, a Raspberry Pi 4/5 or a Proxmox container) and a terminal. No Node.js is needed on the server: everything runs in Docker.

- [Choose how to install](#choose-how-to-install)
- [The quick way: one container](#the-quick-way-one-container)
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
| Home Assistant, Umbrel, CasaOS, Runtipi, Unraid or TrueNAS | The app catalog of that system: see [the list](README.md#-from-the-app-catalog-of-your-server). |
| Any machine with Docker: a server, a NAS, a Raspberry Pi | [One container](#the-quick-way-one-container): one command, nothing to configure. |
| A server where you want PostgreSQL, the API and the web server in separate containers, or want to build from the sources | Docker Compose: this guide, from step 1. |

**Resources:** 1 CPU core and 1 GB of RAM are enough for a family; 2 GB is comfortable while building the images. The single image takes about 500 MB of disk; count 3 GB to build the images yourself, and a few hundred MB for the database. amd64 and arm64 (Raspberry Pi) are both supported.

## The quick way: one container

One image holds the web interface, the API and PostgreSQL. It needs no `.env` file: the secrets are generated on the first start and stored with the data. If Docker is not installed yet, do [step 1](#1-install-docker) first.

```bash
docker run -d --name openfamily --restart unless-stopped \
  -p 3000:3000 -v openfamily:/data \
  ghcr.io/nexaflowfrance/openfamily:latest
```

OpenFamily is at `http://<server-address>:3000` about ten seconds later, a little longer the first time on a Raspberry Pi, while the database is created. The Android app connects to the same address. Then continue with [5. Create your family](#5-create-your-family) and [6. Reach it from outside your home, over HTTPS](#6-reach-it-from-outside-your-home-over-https): both apply as they are.

Prefer a compose file? [`docker/all-in-one/docker-compose.yml`](docker/all-in-one/docker-compose.yml) starts the same container: download it, then run `docker compose up -d` next to it.

**What to keep.** Everything is in `/data`: the database, and `openfamily.env`, the secrets made on the first start (the key that signs sessions and encrypts saved integration passwords, the database password, the push notification keys). Use a Docker volume as above, or a folder of a Linux disk (`-v /srv/openfamily:/data`). A Windows folder or an SMB share will not do: PostgreSQL needs a file system that keeps Unix permissions.

**Settings.** None is required. Every optional variable of [step 3](#3-configure-it) can be given with `-e`, or all of them in a file with `--env-file`:

```bash
docker run -d --name openfamily --restart unless-stopped \
  -p 3000:3000 -v openfamily:/data \
  -e REGISTRATION_ENABLED=false \
  -e SMTP_HOST=smtp.example.com -e MAIL_FROM="OpenFamily <family@example.com>" \
  ghcr.io/nexaflowfrance/openfamily:latest
```

- A `JWT_SECRET` or a pair of `VAPID_*` keys given this way wins over the one stored in the volume. That is how the secrets of an existing install are carried over.
- The database settings and `SERVER_PORT` belong to the image. To use another port, change the left side of `-p` (`-p 8080:3000`).
- `TZ` is optional: a new family takes the time zone of the browser that creates it, and a parent can change it in Settings.
- To reach a service running on the same machine, such as Ollama, add `--add-host host.docker.internal:host-gateway` and use `http://host.docker.internal:11434` as its address.

**Update.** Back up first. Pull the new image and replace the container: the data stays in the volume, and database changes run by themselves when it starts.

```bash
docker pull ghcr.io/nexaflowfrance/openfamily:latest
docker stop openfamily && docker rm openfamily
docker run -d --name openfamily ...   # the same command as the first time
```

To stay on a version of your choice, use its number in place of `latest`, for example `ghcr.io/nexaflowfrance/openfamily:2.2.0`.

**Back up and restore.** Two files hold everything:

```bash
docker exec openfamily pg_dump -U openfamily -d openfamily -Fc > openfamily-$(date +%F).dump
docker exec openfamily cat /data/openfamily.env > openfamily-secrets.env
```

Keep them together, somewhere other than the server. To restore into a new install, start the container as above, then:

```bash
docker exec -i openfamily pg_restore -U openfamily -d openfamily --clean --if-exists --no-owner < openfamily-2026-11-16.dump
docker cp openfamily-secrets.env openfamily:/data/openfamily.env
docker restart openfamily
```

Without the secrets file the accounts and the data are all there, but saved integration passwords and followed calendar addresses can no longer be read, and each phone has to allow notifications again.

**Coming from the Docker Compose install, or going back.** Both run PostgreSQL 16, so a dump made on one side restores on the other. Make it with the command of [step 8](#8-back-up-and-restore), restore it with the `pg_restore` line above, and give the new container the `JWT_SECRET` and the `VAPID_*` keys of your `.env` with `-e`.

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
| `TZ` | The time zone the server runs in, e.g. `Europe/Paris`, `America/Montreal` | Used for reminders and calendars until a parent chooses the family's own in Settings |
| `NODE_ENV` | `production` | |

Optional, but worth it:

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push notifications (reminders, family activity). Generate the keys with `docker run --rm node:26-alpine npx -y web-push generate-vapid-keys`; `VAPID_SUBJECT` is `mailto:` followed by your e-mail. Push also needs HTTPS (step 6). |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Invitation e-mails and password reset. Without them, invitations still work by sharing their link. |
| `REGISTRATION_ENABLED` | `false` closes sign-ups: only people you invite can create an account (see step 5). |
| `INTEGRATIONS_BLOCK_PRIVATE_IPS` | `true` makes the server refuse to call private addresses (`192.168.x.x`, `10.x`, `localhost`) for integrations, the AI provider and webhooks. Leave it off at home, where Home Assistant or Ollama are on your network; turn it on for a server open to people outside your family. |
| `OIDC_*`, `PASSWORD_LOGIN_ENABLED` | Sign-in through your own identity provider (Authentik, Keycloak...): see [Single sign-on](#single-sign-on-sso). |

Leave these **empty** unless you know you need them: `VITE_API_URL`, `VITE_WS_URL` (the web app talks to its own address and forwards `/api` itself), `CORS_ORIGINS` (only for a web app served from another domain), `APP_PUBLIC_URL` (only if e-mail links show the wrong address behind your proxy, or for single sign-on).

## 4. Start it

**Option A: ready-made images** (faster, recommended on small machines and Raspberry Pi). Create `docker-compose.override.yml` next to `docker-compose.yml`, with the version you checked out:

```yaml
services:
  server:
    image: ghcr.io/nexaflowfrance/openfamily-server:2.2.0
  client:
    image: ghcr.io/nexaflowfrance/openfamily-client:2.2.0
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
3. Once your own account exists, close sign-ups: set `REGISTRATION_ENABLED=false` in `.env`, then `docker compose up -d`. From then on nobody can create an account on their own, but anyone you invite from **Family** (by link or by e-mail) still can: the invitation is their ticket in. An invitation lasts 1 to 30 days and can be reserved for one e-mail address.

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

## Single sign-on (SSO)

People can sign in with an OpenID Connect provider you already run: Authentik, Keycloak, Authelia, Pocket ID, Zitadel, Google... Password sign-in keeps working unless you turn it off.

1. At your provider, create a **confidential** OpenID Connect client (authorization code flow) with:
   - redirect URI: `https://family.example.com/api/auth/oidc/callback` (your address, then `/api/auth/oidc/callback`)
   - scopes `openid email profile`
   - ID tokens signed with RS256 (the usual default)
2. Add to `.env`:

   | Variable | Value |
   |---|---|
   | `APP_PUBLIC_URL` | `https://family.example.com`, the address the redirect URI starts with |
   | `OIDC_ISSUER_URL` | The provider's issuer, for example `https://auth.example.com/application/o/openfamily/` (Authentik), `https://auth.example.com/realms/home` (Keycloak), `https://id.example.com` (Pocket ID) |
   | `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | From step 1 |
   | `OIDC_PROVIDER_NAME` | The button label, for example `Authentik` |

3. Run `docker compose up -d` and open the sign-in page: it shows **Continue with ...**. If it does not, the server log has an `auth.oidc_disabled` line saying what is missing.

The server must reach the provider over HTTPS. Keep the client secret in `.env` only; to change it, set the new one at the provider, update `.env`, run `docker compose up -d`, then revoke the old one.

**Who gets in.** The first time someone signs in with SSO:
- if an account already uses the same email, SSO does not open it: the person signs in with their password and links SSO in **Settings → Sign-in**, once. An email alone never proves who owns an account (password sign-up does not check it, and some providers let people set any address), so after that the account is recognised by its link to the provider, not by email;
- if no account uses the email, a new one is created, only if the provider verified the email, and only if SSO sign-up is open (`OIDC_REGISTRATION_ENABLED`, which follows `REGISTRATION_ENABLED` when unset) or they came through an invitation. In Keycloak, users created by an administrator have "Email verified" off until you tick it.

| Goal | `PASSWORD_LOGIN_ENABLED` | `REGISTRATION_ENABLED` | `OIDC_REGISTRATION_ENABLED` |
|---|---|---|---|
| Passwords and SSO, anyone can sign up | `true` | `true` | (unset) |
| Passwords still work, new people only through SSO | `true` | `false` | `true` |
| Invitations only, either way | `true` | `false` | (unset) |
| SSO only | `false` | `false` | `true` |

Invitations always work. `PASSWORD_LOGIN_ENABLED=false` also turns off password sign-up and reset, and is ignored until SSO is configured, so nobody is locked out by a typo. Test an SSO sign-in before turning passwords off, and have existing users link SSO in **Settings → Sign-in** first: without a link, they cannot sign in once passwords are off.

**If the provider is down on an SSO-only server**, set `PASSWORD_LOGIN_ENABLED=true`, run `docker compose up -d`, and give your account a password:

```bash
docker compose exec server node server/dist/scripts/authAdmin.js set-password --email you@example.com
```

`unlink-sso` instead of `set-password` removes an account's SSO link. Both sign the account out everywhere. With the Windows installer or the Proxmox script, add the same variables to the `.env` file they created; on Unraid, CasaOS and Runtipi they are in the app's settings.

**Good to know.**
- Signing out at the provider does not sign people out of OpenFamily, and someone removed at the provider keeps their open sessions until they expire (7 days). To end them now: **Settings → Sign-in → Sign out of all devices** for your own account, or remove the person in **Family**. A password reset also signs an account out everywhere.
- Removing someone from the family or handing the family over to another member now signs the people concerned out of every device.
- Your reverse proxy may log full addresses, including the one-time code the provider sends to `/api/auth/oidc/callback`. The code is useless after a few seconds, but you can leave query strings out of the log for that path.
- The Android app keeps password sign-in for now.

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
| "Sign up" is missing or refused | `REGISTRATION_ENABLED=false`: invite the person from **Family** instead, or set it to `true`. |
| No "Continue with ..." button on the sign-in page | SSO is off: the server log's `auth.oidc_disabled` line says which variable is missing (often `APP_PUBLIC_URL`). |
| SSO ends on "Sign-in failed" | The server log's `auth.oidc_callback_failed` line has the reason. Check that the redirect URI registered at the provider is exactly `APP_PUBLIC_URL` + `/api/auth/oidc/callback`. |
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
