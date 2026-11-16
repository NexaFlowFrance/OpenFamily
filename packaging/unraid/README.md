# OpenFamily for Unraid

A Docker template for [Unraid](https://unraid.net): [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily), the family organizer you host yourself. Shared calendar, tasks, shopping lists, meals, pantry and budget, with an Android app.

## Install it on your Unraid

Until the template is listed in Community Applications, add it by hand. In the Unraid terminal:

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-OpenFamily.xml \
  https://raw.githubusercontent.com/NexaFlowFrance/unraid-templates/main/openfamily.xml
```

Then open the **Docker** tab, choose **Add Container**, and pick **OpenFamily** in the **Template** list. The defaults are fine: apply, and open the Web UI.

OpenFamily answers on port 8480 of your server. Create your account on the first visit: it becomes the owner of a new family.

## What is installed

One container that holds the web interface, the API and the database. Its data goes to `/mnt/user/appdata/openfamily`, the folder to back up. There is no secret to prepare: they are generated on the first start and kept in that folder.

## Help

Questions and bug reports go to the main project: <https://github.com/NexaFlowFrance/OpenFamily/issues>

This repository is published from the [`packaging/unraid`](https://github.com/NexaFlowFrance/OpenFamily/tree/main/packaging/unraid) folder of OpenFamily. It is new: if something does not work on your system, please tell us.
