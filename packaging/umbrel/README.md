# OpenFamily for Umbrel

A community app store for [umbrelOS](https://umbrel.com) with one app: [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily), the family organizer you host yourself. Shared calendar, tasks, shopping lists, meals, pantry and budget, with an Android app.

## Add it to your Umbrel

1. Open the **App Store** on your Umbrel.
2. Open the menu with the three dots, at the top right, and choose **Community App Stores**.
3. Paste this address and add it:

   ```
   https://github.com/NexaFlowFrance/umbrel-app-store
   ```

4. Open the NexaFlow store that appears, and install **OpenFamily**.

OpenFamily then opens from the home screen of your Umbrel. Create your account on the first visit: it becomes the owner of a new family. The Android app connects to `http://umbrel.local:8480`.

## What is installed

One container that holds the web interface, the API and the database. There is nothing to configure: its secrets are generated on the first start and kept with the data, in the data folder of the app.

## Help

Questions and bug reports go to the main project: <https://github.com/NexaFlowFrance/OpenFamily/issues>

This repository is published from the [`packaging/umbrel`](https://github.com/NexaFlowFrance/OpenFamily/tree/main/packaging/umbrel) folder of OpenFamily. It is new: if something does not work on your system, please tell us.
