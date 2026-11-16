# OpenFamily for CasaOS and ZimaOS

An app store for [CasaOS](https://casaos.zimaspace.com) and ZimaOS with one app: [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily), the family organizer you host yourself. Shared calendar, tasks, shopping lists, meals, pantry and budget, with an Android app.

## Add it to your CasaOS

1. Open the **App Store** in CasaOS.
2. At the top right, open the list of sources and choose to add one.
3. Paste this address and add it:

   ```
   https://github.com/NexaFlowFrance/casaos-appstore/archive/refs/heads/main.zip
   ```

4. Find **OpenFamily** in the store, and install it.

OpenFamily answers on port 8480. Create your account on the first visit: it becomes the owner of a new family.

Without adding the store, the app can also be installed alone: **Install a customized app**, **Import**, and paste the content of [`Apps/openfamily/docker-compose.yml`](Apps/openfamily/docker-compose.yml).

## What is installed

One container that holds the web interface, the API and the database. Its data goes to `/DATA/AppData/openfamily/data`, the folder to back up. There is no secret to prepare: they are generated on the first start and kept in that folder.

## Help

Questions and bug reports go to the main project: <https://github.com/NexaFlowFrance/OpenFamily/issues>

This repository is published from the [`packaging/casaos-store`](https://github.com/NexaFlowFrance/OpenFamily/tree/main/packaging/casaos-store) folder of OpenFamily. It is new: if something does not work on your system, please tell us.
