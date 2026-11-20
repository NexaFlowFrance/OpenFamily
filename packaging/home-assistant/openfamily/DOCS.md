# OpenFamily

## First start

1. Start the app, then open its web interface: `http://homeassistant.local:8480`, or the address of your Home Assistant with port 8480.
2. Create your account. It becomes the owner of a new family.
3. In **Family**, add each person and invite the adults who want their own login.
4. Back in the **Configuration** tab of this app, turn off **Allow new accounts** and restart it. People you invite can still create theirs.

The Android app of OpenFamily connects to the same address.

## Settings

| Setting | What it does |
|---|---|
| Allow new accounts | On: anyone who reaches the address can create an account. Off: only people invited from the Family page. |
| Other settings | Any other setting of OpenFamily, as a name and a value. For example `SMTP_HOST` and `MAIL_FROM` to send invitations by e-mail, or `APP_PUBLIC_URL` and `OIDC_ISSUER_URL` for single sign-on. The [installation guide](https://github.com/NexaFlowFrance/OpenFamily/blob/main/INSTALLATION.md) lists them all. |

The port is changed in the **Network** section of the Configuration tab.

## Your data

Everything is kept in the data folder of the app: the database, and the secrets generated on the first start. It is part of Home Assistant backups. The app is stopped for the few seconds a backup takes, so that the database it contains can always be restored.

Include **OpenFamily** when creating a backup, and select it when restoring. A native app backup/restore was verified on HAOS 18.4 amd64 with OpenFamily 2.2.0 on 20 November 2026: the test account, session and shopping item were restored, including undoing a change made after the backup. Keep the backup encryption key separately if your backup is encrypted.

Each family can also download its own data from the Settings page of OpenFamily, and import it into another OpenFamily.

## From outside your home

Notifications on phones and installing OpenFamily as an app need HTTPS. If you already reach Home Assistant from outside through a reverse proxy, add an entry for port 8480 with WebSocket support. Tailscale works too, with nothing to open.

## Using OpenFamily from Home Assistant

OpenFamily has a [documented API](https://github.com/NexaFlowFrance/OpenFamily/blob/main/API.md). Create a token in the Settings page of OpenFamily, and a REST sensor or an automation can read the day's appointments, add an item to the shopping list or react to a webhook when a task is done.

OpenFamily also has a connector that imports shopping items from Home Assistant's `todo` entities or its legacy `shopping_list` integration. Configure it separately in OpenFamily's Integrations page. Installing this app does not create calendar or to-do entities in Home Assistant; there is currently no OpenFamily custom integration for Marketplace or HACS. The native app lifecycle test did not test that connector.

## Help

[Questions and bug reports](https://github.com/NexaFlowFrance/OpenFamily/issues)
