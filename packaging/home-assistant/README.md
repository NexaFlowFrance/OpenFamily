# OpenFamily for Home Assistant

A Home Assistant app repository (apps are what Home Assistant used to call add-ons) with one app: [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily), the family organizer you host yourself. Shared calendar, tasks, shopping lists, meals, pantry and budget, next to your home automation.

## Add it to Home Assistant

[![Add this repository to your Home Assistant](https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg)](https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2FNexaFlowFrance%2Fhome-assistant-apps)

Or by hand:

1. In Home Assistant, open **Settings**, then **Apps**, then the **App store**.
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

## Help

Questions and bug reports go to the main project: <https://github.com/NexaFlowFrance/OpenFamily/issues>

This repository is published from the [`packaging/home-assistant`](https://github.com/NexaFlowFrance/OpenFamily/tree/main/packaging/home-assistant) folder of OpenFamily. It is new: if something does not work on your system, please tell us.
