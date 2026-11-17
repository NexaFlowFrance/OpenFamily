# OpenFamily for Unraid

A Docker template for [Unraid](https://unraid.net): [OpenFamily](https://github.com/NexaFlowFrance/OpenFamily), the family organizer you host yourself. Shared calendar, tasks, shopping lists, meals, pantry and budget, with an Android app.

## Install it on your Unraid

1. Open the **Apps** tab (Community Applications) in Unraid.
2. Search for **OpenFamily** or **NexaFlowFrance**.
3. Select [OpenFamily](https://ca.unraid.net/apps/openfamily-0zg8vge15c4pd6?q=OpenFamily), then choose **Install**.
4. Keep the defaults or adjust the port and data folder, apply, and open the Web UI.

OpenFamily answers on port 8480 of your server. Create your account on the first visit: it becomes the owner of a new family.

### Manual installation

You can also add the template by hand. In the Unraid terminal:

```bash
wget -O /boot/config/plugins/dockerMan/templates-user/my-OpenFamily.xml \
  https://raw.githubusercontent.com/NexaFlowFrance/unraid-templates/main/openfamily.xml
```

Then open the **Docker** tab, choose **Add Container**, and pick **OpenFamily** in the **Template** list. The defaults are fine: apply, and open the Web UI.

## What is installed

One container that holds the web interface, the API and the database. Its data goes to `/mnt/user/appdata/openfamily`, the folder to back up. There is no secret to prepare: they are generated on the first start and kept in that folder.

## Help

Questions and bug reports go to the main project: <https://github.com/NexaFlowFrance/OpenFamily/issues>

This repository is published from the [`packaging/unraid`](https://github.com/NexaFlowFrance/OpenFamily/tree/main/packaging/unraid) folder of OpenFamily.

Installation through the Unraid interface has not yet been tested by the maintainer. If something does not work on your system, please tell us.
