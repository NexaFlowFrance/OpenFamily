# OpenFamily API

OpenFamily has an HTTP API that other programs can use: Home Assistant, Gladys Assistant, n8n,
Node-RED, a script of your own. This guide covers what such a program needs: how to sign in,
how the data is shaped, how to be told when something changes.

The full list of routes and fields is served by your own server, as an OpenAPI 3.1 document:

```
GET http://your-server:3000/api/openapi.json
```

It needs no sign-in and can be imported into Swagger UI, Postman, Insomnia or n8n.

## Quick start

1. In OpenFamily, a parent opens **Settings**, then **API tokens**, and creates a token:
   **Read only** to display things, **Read and write** to add or change them. The token starts
   with `ofk_` and is shown only once.
2. Check it. The answer names the account the token stands for:

   ```bash
   curl -H "Authorization: Bearer ofk_..." http://your-server:3000/api/auth/me
   ```

3. Read the shopping list, then add to it:

   ```bash
   curl -H "Authorization: Bearer ofk_..." http://your-server:3000/api/shopping

   curl -H "Authorization: Bearer ofk_..." -H "Content-Type: application/json" \
        -d '{"name": "Milk", "category": "Autre", "quantity": 2, "unit": "L"}' \
        http://your-server:3000/api/shopping
   ```

## Signing in

Send the token in the `Authorization` header of every request:

```
Authorization: Bearer ofk_...
```

A token acts as the parent who made it, on the data of that parent's family. It never expires
and is revoked in Settings, which also shows when it was last used.

Whatever its scope, a token cannot reach what manages the account or other credentials: the
profile, password and sessions, the family's accounts and invitations, the integrations, the
followed calendars, display links, webhooks, the export and import of everything, and the tokens
themselves. `GET /api/auth/me` stays open.

| Answer                    | Meaning                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `401`                     | No token, or a token that is unknown or revoked            |
| `403 read_only_token`     | A write with a read-only token                             |
| `403 api_token_forbidden` | A route that is closed to API tokens                       |
| `403` with another text   | The account may not do this (a child account, for example) |

## How the data is shaped

**Answers.** Every answer is JSON, with the same envelope:

```json
{ "success": true, "data": [] }
```

```json
{ "success": false, "error": "name and category are required" }
```

**A family, not an account.** Everything a token reads or writes belongs to the family: every
member sees the same shopping list, tasks and calendar.

**Identifiers** are UUIDs. Family members have their own, listed by `GET /api/family`; they are
what `family_member_ids` (appointments) and `assigned_to` (tasks) hold.

**Times and the family's time zone.** OpenFamily stores times as the family types them:
`2026-11-15T09:30:00` means half past nine on the family's clocks, with no zone attached. To
turn that into a moment in time you need the family's time zone, which a parent sets in
Settings and which `GET /api/auth/me` returns as `timezone` (an IANA name such as
`Europe/Paris`).

Appointments save you the conversion: next to `start_time` and `end_time`, each one carries
`start_at` and `end_at`, the same moments as ISO 8601 instants in UTC.

```json
{
  "title": "Dentist",
  "start_time": "2026-11-15T09:30:00",
  "start_at": "2026-11-15T08:30:00.000Z",
  "is_all_day": false
}
```

When you create or change an appointment, send `start_time` and `end_time` in the family's
wall-clock time. For a whole-day event (`is_all_day`), read the day from `start_time`: its
`start_at` is the midnight that starts it, which falls on another day in other zones.

**Recurring appointments.** Ask for a range and each occurrence comes as its own entry, with an
`occurrence_id` and an `occurrence_date`:

```bash
curl -H "Authorization: Bearer ofk_..." \
  "http://your-server:3000/api/appointments?start_date=2026-11-01T00:00:00&end_date=2026-11-30T23:59:59"
```

**Birthdays.** The same request also returns the birthdays of the family members that fall in
the range. They are worked out from the dates of birth and stored nowhere: whole-day entries
whose `kind` is `birthday`, with a `birthday` object (`member_id`, `name`, `age`,
`birth_date`) and a title in the language of the family's owner. Their `id` is not a UUID, and
they cannot be changed or deleted (`409 birthday_read_only`): a date of birth is changed with
`PUT /api/family/{id}`.

## The main routes

| What          | Routes                                                                             |
| ------------- | ---------------------------------------------------------------------------------- |
| Account       | `GET /api/auth/me`                                                                 |
| Shopping list | `GET` `POST /api/shopping`, `PUT` `DELETE /api/shopping/{id}`                      |
| Tasks         | `GET` `POST /api/tasks`, `PUT` `DELETE /api/tasks/{id}`                            |
| Appointments  | `GET` `POST /api/appointments`, `PUT` `DELETE /api/appointments/{id}`              |
| Meal plan     | `GET` `POST /api/meal-plans`, `PUT` `DELETE /api/meal-plans/{id}`                  |
| Recipes       | `GET /api/recipes`, `GET /api/recipes/{id}`                                        |
| Family        | `GET /api/family`                                                                  |
| Planning      | `GET /api/planning`                                                                |
| Notes         | `GET` `POST /api/notes`, `DELETE /api/notes/{id}`                                  |

To check off a shopping item, send `{"is_checked": true}` to `PUT /api/shopping/{id}`. To
complete a task, send `{"is_completed": true}` to `PUT /api/tasks/{id}`. A change only needs the
fields that change.

The OpenAPI document has every field of every route above.

## Being told when something changes

Two ways, so that a program does not have to ask over and over.

### Real-time updates over WebSocket

The channel the apps themselves use. Connect to `/ws` on the same address, send the token once,
then listen:

```js
const socket = new WebSocket('ws://your-server:3000/ws');
socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token: 'ofk_...' }));
socket.onmessage = (message) => {
  const update = JSON.parse(message.data);
  if (update.type === 'update') {
    // { type: 'update', entity: 'shopping', action: 'created' }
    console.log(`${update.entity} changed`);
  }
};
```

The first answer is `{ "type": "auth", "success": true }`. An update names what changed
(`shopping`, `tasks`, `appointments`, `meal-plans`, `planning`, `recipes`, `notes`, `posts`,
`family`, `budget`, `rewards`) and how (`created`, `updated`, `deleted`, `synced`); read the
matching route to get the new state. The socket is closed with code `4001` when the token is
revoked.

### Webhooks

For a program that waits to be called. A parent opens **Settings**, then **Webhooks**, and
registers an address with the kinds of change it wants to hear about. OpenFamily then sends it a
`POST` when one happens:

```json
{
  "event": "shopping.created",
  "entity": "shopping",
  "action": "created",
  "occurred_at": "2026-11-15T19:04:11.512Z",
  "webhook_id": "3f2c1c1e-8a54-4a52-9d0f-6f0f1f2a7a10",
  "delivery_id": "0b8b7d4e-2c1a-4a1e-9f57-0a4b6a1d2c33"
}
```

A call says what kind of thing changed, never the thing itself: read the API with a token to
get it. This keeps the family's data out of requests sent to an address that may have changed
hands.

| Header                   | Content                                                    |
| ------------------------ | ---------------------------------------------------------- |
| `X-OpenFamily-Event`     | The event, as in the body: `shopping.created`              |
| `X-OpenFamily-Delivery`  | The identifier of this call                                |
| `X-OpenFamily-Signature` | `sha256=` and the HMAC-SHA256 of the body, with the secret |

**Checking the signature.** The signing secret (`whsec_...`) is shown once when the webhook is
added. Compute the HMAC of the body exactly as received, and compare:

```js
import crypto from 'node:crypto';

const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
const genuine =
  expected.length === signature.length &&
  crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
```

```python
import hashlib, hmac

expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
genuine = hmac.compare_digest(expected, signature)
```

**What to expect.**

- Changes of the same kind within a second are sent as one call.
- Answer with a `2xx` status within five seconds. A call that fails is not sent again; the next
  change sends a new one.
- A webhook that fails twenty times in a row is switched off, and Settings says so. Switch it
  back on there once the address works; the **Send a test** button sends a `webhook.test` event.
- A redirect is not followed: the address you entered is the only one called.
- The address is stored encrypted and only its host is shown again, since an address such as a
  Home Assistant webhook is a password in itself.

### Example: Home Assistant

A sensor that counts the items to buy, an action that adds one, and an automation that refreshes
the sensor the moment the list changes. Keep the token in `secrets.yaml`.

```yaml
sensor:
  - platform: rest
    name: OpenFamily shopping list
    resource: "http://your-server:3000/api/shopping"
    headers:
      Authorization: !secret openfamily_bearer # "Bearer ofk_..."
    value_template: "{{ value_json.data | rejectattr('is_checked') | list | count }}"

rest_command:
  openfamily_add_item:
    url: "http://your-server:3000/api/shopping"
    method: post
    headers:
      Authorization: !secret openfamily_bearer
    content_type: "application/json"
    payload: '{"name": "{{ item }}", "category": "Autre"}'

automation:
  - alias: OpenFamily shopping list changed
    trigger:
      - platform: webhook
        webhook_id: openfamily-choose-a-long-random-id
        allowed_methods: [POST]
        local_only: true
    action:
      - service: homeassistant.update_entity
        target:
          entity_id: sensor.openfamily_shopping_list
```

Register `http://your-home-assistant:8123/api/webhook/openfamily-choose-a-long-random-id` as the
webhook address in OpenFamily, for the shopping list. Home Assistant does not check the
signature: there, the webhook id is the secret, so choose a long random one.

## Addresses that need no token

Two addresses carry their own key and are read without a token:

- **The calendar feed**, `/api/calendar/{token}/openfamily.ics`, shown in the app on the
  Appointments page: subscribe to it from any calendar application.
- **Display links**, `/api/display/{token}`, made in Settings: a page of the family's day for an
  e-paper frame or any screen that cannot sign in.

## Good manners

- Prefer the WebSocket or a webhook to asking in a loop. If you must poll, once a minute is
  plenty for a family's data.
- Send a `User-Agent` that names your program.
- Keep the token out of logs and out of addresses: it belongs in the `Authorization` header.

## Stability

The document at `/api/openapi.json` carries the version of the server it comes from. The routes
and fields it describes stay compatible within a major version: fields may be added, so ignore
the ones you do not know. A program that needs a route that is not described there can open an
issue on GitHub.
