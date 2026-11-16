# OpenFamily for Runtipi

An app store for [Runtipi](https://runtipi.io) with one app: [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily), the family organizer you host yourself. Shared calendar, tasks, shopping lists, meals, pantry and budget, with an Android app.

## Add it to your Runtipi

1. In Runtipi, open **Settings**, then **App Stores**.
2. Choose **Add**, and give this address:

   ```
   https://github.com/NexaFlowFrance/runtipi-appstore
   ```

3. Install **OpenFamily** from the store.

OpenFamily answers on port 8480. Create your account on the first visit: it becomes the owner of a new family.

## What is installed

One container that holds the web interface, the API and the database. There is nothing to fill in at install: its secrets are generated on the first start and kept with the data. The install form only offers what is optional: closing sign-ups, and single sign-on.

## Help

Questions and bug reports go to the main project: <https://github.com/NexaFlowFrance/OpenFamily/issues>

This repository is published from the [`packaging/runtipi`](https://github.com/NexaFlowFrance/OpenFamily/tree/main/packaging/runtipi) folder of OpenFamily. It is new: if something does not work on your system, please tell us.
