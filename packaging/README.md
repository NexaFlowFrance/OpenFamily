# OpenFamily in app catalogs

Ready-made definitions of OpenFamily for the catalogs of home servers: **Unraid**, **CasaOS**, **Runtipi**, **Umbrel** and **Home Assistant**.

> ## Submissions are made by the maintainer, in person
>
> These files are technical material only. Every submission to a catalog (pull request, forum post, issue) is written **by hand, by the maintainer**:
>
> - Read the contribution guide and the pull request template of the catalog in full.
> - Fill the template yourself, field by field. Never paste generated text over it, never delete its sections.
> - Answer the reviewers yourself.
>
> OpenFamily was banned from *awesome-selfhosted* because a pull request prepared by an AI replaced the submission template. No tool, script or assistant writes the text of a submission.

## One container everywhere

Every definition here runs the same image, `ghcr.io/nexaflowfrance/openfamily`: the web interface, the API and PostgreSQL in one container (see [`docker/all-in-one`](../docker/all-in-one)).

- **One port**: 3000 in the container, for the pages, the API and live updates. The definitions publish it on **8480**, away from the ports other apps like to take.
- **One folder to keep**: `/data`, the database and the secrets.
- **No secret to prepare**: the key that signs sessions, the database password and the push notification keys are generated on the first start and stored in `/data/openfamily.env`.
- **Settings are optional**: `REGISTRATION_ENABLED`, the `SMTP_*`, `OIDC_*` and other variables of [INSTALLATION.md](../INSTALLATION.md) are passed as environment variables where the catalog allows it.
- **Versions**: the definitions name a release (`2.2.0`), which catalogs prefer to `latest`. Unraid is the exception: its users expect `latest` and the update button that goes with it.

What was checked, and what was not: each file was validated for its format, and each compose file was started with Docker and answered on its port. **None of them was installed from the catalog software itself** (no Unraid, CasaOS, Runtipi, umbrelOS or Home Assistant OS at hand). Install it once on the real thing before submitting.

## Unraid, `unraid/`

`openfamily.xml` is a Community Applications template (`<Container version="2">`): one port, one path (`/mnt/user/appdata/openfamily`), the registration switch, and the e-mail and single sign-on settings under *advanced*.

**Try it:** copy the file to `/boot/config/plugins/dockerMan/templates-user/` on the server, then *Docker*, *Add Container*, and pick it in the *Template* list.

**Submit it:**

1. Host the template in a public repository of its own (for example `NexaFlowFrance/unraid-templates`) and make `<TemplateURL>` match its final address.
2. Open a support thread on the Unraid forums and put its address in `<Support>`.
3. Follow the current Community Applications policies to ask for inclusion: <https://forums.unraid.net/topic/87144-ca-application-policies-notes/>.

## CasaOS, `casaos/`

`openfamily/docker-compose.yml` follows the BigBearCasaOS format (`big-bear-` names, `/DATA/AppData/$AppID`, `x-casaos` descriptions in English and French).

**Try it:** CasaOS dashboard, *+*, *Install a customized app*, *Import*, paste the file.

**Submit it:** fork <https://github.com/bigbeartechworld/big-bear-casaos>, add `Apps/openfamily/docker-compose.yml` with whatever their guidelines ask for today, and open the pull request yourself. Their forum is a good place to announce it first: <https://community.bigbeartechworld.com>.

## Runtipi, `runtipi/`

`apps/openfamily/` holds `config.json` (metadata and the install form), `docker-compose.yml` (schema version 2) and `metadata/` (description and logo).

**Try it:** push the content of `runtipi/` to a public repository, so that `apps/` is at its root, then in Runtipi: *Settings*, *App Stores*, *Add*.

**Submit it:** the official store no longer takes new apps. The supported way is a store of your own, made from <https://github.com/runtipi/example-appstore>, whose address you give in the README and on the website.

On a new release: change the image tag and `version`, add one to `tipi_version`, refresh `updated_at`.

## Umbrel, `umbrel/`

A community app store: `umbrel-app-store.yml` names it (`nexaflow`), and `nexaflow-openfamily/` holds the app (`umbrel-app.yml` and `docker-compose.yml`). The app turns off Umbrel's own sign-in page in front of it (`PROXY_AUTH_ADD: "false"`): OpenFamily has its accounts, and its Android app and API clients could not get past it.

**Try it:** push the content of `umbrel/` to a public repository, so that `umbrel-app-store.yml` is at its root, then in umbrelOS: *App Store*, the three dots, *Community App Stores*, and add the address of the repository.

**Submit it:** the community store needs no approval. For the official store, follow <https://github.com/getumbrel/umbrel-apps>.

The image is pinned by digest, as Umbrel asks (`image: ...:2.2.0@sha256:...`). The digest of a release is the one of its multi-architecture manifest: `docker buildx imagetools inspect ghcr.io/nexaflowfrance/openfamily:2.2.0` prints it.

## Home Assistant, `home-assistant/`

An app repository (what Home Assistant called add-ons): `repository.yaml` names it, and `openfamily/` holds the app: `config.yaml`, the documentation shown in Home Assistant (`README.md`, `DOCS.md`), the translations of its settings and its icons. It pulls the published image, stores everything in the `/data` folder Home Assistant gives each app, and is stopped during backups so that the database is copied whole.

The two settings of the app reach the container through `/data/options.json`, which the image reads at start: the registration switch, and a list of name and value pairs for any other variable.

**Try it:** push the content of `home-assistant/` to a public repository, so that `repository.yaml` is at its root, then in Home Assistant: *Settings*, *Apps*, *App store*, the three dots, *Repositories*, and add the address of the repository.

**Submit it:** nothing to submit, the repository is the catalog. Give its address in the README, with the button from <https://my.home-assistant.io/create-link/>.

On a new release: change `version` in `config.yaml`. Home Assistant then offers the update.

## On each release

1. Change the image tag in `casaos/`, `runtipi/` and `umbrel/`, and `version` in `home-assistant/openfamily/config.yaml`.
2. Runtipi: `version`, `tipi_version` and `updated_at` in `config.json`. Umbrel: `version` and `releaseNotes` in `umbrel-app.yml`, and the digest after the tag in its compose file.
3. Copy the folders to the repositories that publish them.
