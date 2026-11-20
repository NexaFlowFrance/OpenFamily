# OpenFamily in app catalogs

OpenFamily's definitions for the catalogs of home servers. Each folder here is the content of a public repository that the system reads:

| System | Folder | Published to | What a user adds |
|---|---|---|---|
| Home Assistant | `home-assistant/` | [home-assistant-apps](https://github.com/NexaFlowFrance/home-assistant-apps) | the address of the repository, in the app store |
| Umbrel | `umbrel/` | [umbrel-app-store](https://github.com/NexaFlowFrance/umbrel-app-store) | the address of the repository, in Community App Stores |
| CasaOS, ZimaOS | `casaos-store/` | [casaos-appstore](https://github.com/NexaFlowFrance/casaos-appstore) | the address of its zip archive, as an app store source |
| Runtipi | `runtipi/` | [runtipi-appstore](https://github.com/NexaFlowFrance/runtipi-appstore) | the address of the repository, in App Stores |
| Unraid | `unraid/` | [unraid-templates](https://github.com/NexaFlowFrance/unraid-templates) | search for OpenFamily in Community Applications |

The `README.md` of each folder is the page of its repository: it says, step by step, how to add OpenFamily on that system.

`casaos/` keeps OpenFamily's definition in the BigBearCasaOS format. For current CasaOS and ZimaOS installs, use `casaos-store/` above.

## One container everywhere

Every definition runs the same image, `ghcr.io/nexaflowfrance/openfamily`: the web interface, the API and PostgreSQL in one container (see [`docker/all-in-one`](../docker/all-in-one)).

- **One port**: 3000 in the container, for the pages, the API and live updates. The definitions publish it on **8480**, away from the ports other apps like to take.
- **One folder to keep**: `/data`, the database and the secrets.
- **No secret to prepare**: the key that signs sessions, the database password and the push notification keys are generated on the first start and stored in `/data/openfamily.env`.
- **Settings are optional**: `REGISTRATION_ENABLED`, the `SMTP_*`, `OIDC_*` and other variables of [INSTALLATION.md](../INSTALLATION.md) are passed as environment variables where the catalog allows it. Home Assistant hands its two settings over in `/data/options.json`, which the image reads at start.
- **Versions**: the definitions name a release (`2.2.0`), which catalogs prefer to `latest`. Unraid is the exception: its users expect `latest` and the update button that goes with it. Umbrel wants the image named by tag and digest (`image: ...:2.2.0@sha256:...`); `docker buildx imagetools inspect ghcr.io/nexaflowfrance/openfamily:2.2.0` prints the digest of a release.

## What was checked, and what was not

Each file was validated for its format, and each compose file was started with Docker and answered on its port. Native tests completed on 17 November 2026, using synthetic data in separate Debian 12 amd64 VMs:

- **CasaOS 0.4.15**: added the ZIP/v1 source through the App Store UI, found OpenFamily, installed it from its card, and verified a test account, shopping item and live WebSocket update. After a full VM reboot, the original session and data still worked. The source also remained available after reloading the store. See the [community-store submission](https://github.com/IceWhaleTech/Awesome-CasaOS/pull/16).
- **CapRover 1.16.0**: tested the [proposed one-click template](https://github.com/caprover/one-click-apps/pull/1371) through the dashboard's TEMPLATE workflow. Verified the HTTP port, WebSocket support, persistent volume, test account and shopping item through its native proxy. The dashboard's Save & Restart action replaced the container while preserving the original session and data.

On **20 November 2026**, **Home Assistant OS 18.4 amd64** was also tested in a Proxmox VM: repository addition, installation and start through the app store, account, shopping item, live WebSocket update, the signup option, and a native app backup/restore that reverted a post-backup item change while preserving the original account and session. Initial tests used Core 2026.11.2; persistence and automatic app startup after a full VM reboot were also verified with Core 2026.10.2. See the [Home Assistant test details](home-assistant/README.md#tested-on-home-assistant-os).

These tests used private HTTP access. ZimaOS/v2 store installation, ARM runtime, public HTTPS and upgrades between OpenFamily versions were not tested. Backup/restore was tested for the Home Assistant app only. Unraid, Runtipi and umbrelOS installation from their own interfaces remain untested; feedback is welcome. The Home Assistant shopping-list connector and a native Marketplace/HACS integration are separate from installing the app; these lifecycle tests did not validate the connector, and no native custom integration exists yet.

## On each release

1. Change the image tag in `casaos/`, `casaos-store/`, `runtipi/` and `umbrel/`, and `version` in `home-assistant/openfamily/config.yaml`.
2. Runtipi: `version`, plus one to `tipi_version`, and `updated_at` in `config.json`. Umbrel: `version` and `releaseNotes` in `umbrel-app.yml`, and the digest after the tag in its compose file, once the image is published.
3. Publish: `bash scripts/publish-catalogs.sh "OpenFamily X.Y.Z"`.

## Official catalogs

The repositories above need nobody's approval: anyone can add them. Being listed in a system's own catalog is a submission to its maintainers.

> **Submissions are made by the maintainer, in person.** Read the contribution guide and the template of the catalog in full, fill the template yourself, field by field, and answer the reviewers yourself: the people who keep these catalogs expect someone on the other side.

- **Unraid Community Applications**: [OpenFamily is listed](https://ca.unraid.net/apps/openfamily-0zg8vge15c4pd6?q=OpenFamily). Open **Apps** in Unraid and search for **OpenFamily** or **NexaFlowFrance**. Manual template installation remains available in [`unraid/README.md`](unraid/README.md).
- **Umbrel App Store**: a pull request to <https://github.com/getumbrel/umbrel-apps>, from the files of `umbrel/nexaflow-openfamily/` renamed to the id they ask for.
- **BigBearCasaOS**: the maintainer [announced stepping back from the store on 4 November 2026](https://community.zimaspace.com/t/bigbear-is-stealing-my-work/9593/33) and made its repositories private. Public submissions are unavailable. Use the CasaOS/ZimaOS repository above instead.
- **Runtipi**: the official store no longer takes new apps. The repository above is the supported way.
- **TrueNAS**: already in the community catalog.
