# OpenFamily for Home Assistant

A Home Assistant app repository (apps are what Home Assistant used to call add-ons) with one app: [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily), the family organizer you host yourself. Shared calendar, tasks, shopping lists, meals, pantry and budget, next to your home automation.

## Add it to Home Assistant

[![Add this repository to your Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FNexaFlowFrance%2Fhome-assistant-apps)

Or by hand:

1. In Home Assistant, open **Settings**, then **Apps**, then **Install app** (called **App store** in some versions).
2. Open the menu with the three dots, at the top right, and choose **Repositories**.
3. Add this address:

   ```
   https://github.com/NexaFlowFrance/home-assistant-apps
   ```

4. Install **OpenFamily** from the store, start it, and open its web interface.

OpenFamily answers on port 8480 of your Home Assistant, for instance `http://homeassistant.local:8480`. Create your account on the first visit: it becomes the owner of a new family.

This needs Home Assistant OS or a Supervised install. Home Assistant Container has no apps: there, run OpenFamily [with Docker](https://github.com/NexaFlowFrance/OpenFamily#-docker-in-one-command).

## What is installed

One container that holds the web interface, the API and the database. Its data is kept in the data folder Home Assistant gives each app, and is part of your Home Assistant backups.

Installing this app hosts OpenFamily. To exchange data with Home Assistant, configure OpenFamily's shopping-list connector or use its [HTTP API](https://github.com/NexaFlowFrance/OpenFamily/blob/main/API.md). There is currently no OpenFamily custom integration for the Home Assistant Marketplace or HACS.

## Tested on Home Assistant OS

On **20 November 2026**, OpenFamily **2.2.0** was installed from this repository through the actual Home Assistant app store on **HAOS 18.4, amd64, in a Proxmox VM**. The initial installation and app backup/restore tests used Home Assistant Core **2026.11.2**. Persistence after a full VM reboot was also verified with Core **2026.10.2**.

Using synthetic data, the following worked:

- Adding the repository, installing OpenFamily and starting it from the Home Assistant interface.
- Creating an account, signing in, saving a shopping item and receiving a live WebSocket update through port 8480.
- Turning off **Allow new accounts** in the app configuration and restarting it: signup was disabled and existing data remained available.
- Creating and restoring a native Home Assistant backup of the app. An item changed after the backup returned to its original value; the original account and session still worked.
- Restarting the entire VM: the app started automatically and retained the account, session and shopping item.

This verifies the amd64 lifecycle over private HTTP. ARM runtime, public HTTPS, upgrades between OpenFamily versions, and the shopping-list connector's exchanges with Home Assistant were not covered by these tests. Feedback from other installations is welcome.

## Help

Questions and bug reports go to the main project: <https://github.com/NexaFlowFrance/OpenFamily/issues>

This repository is published from the [`packaging/home-assistant`](https://github.com/NexaFlowFrance/OpenFamily/tree/main/packaging/home-assistant) folder of OpenFamily. If something does not work on your system, please include your HAOS version, OpenFamily version and hardware architecture in your report. Do not post access tokens, generated secrets or private backups.
