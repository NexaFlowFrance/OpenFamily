# OpenFamily — Roadmap

This document tracks larger ideas that are not yet implemented, and records decisions
about features that were considered. It is not a commitment or a schedule: priorities
can shift based on feedback — issues and discussions are welcome.

## Shipped

- **Family command center / kiosk display** *(v1.1, expanded in v1.2)* — full-screen
  view for a wall tablet (fridge / hallway): today's shared calendar, meals, tasks,
  who's where. v1.2 added weather (Open-Meteo), an optional Immich photo background,
  a shopping panel and touch interactions (tap to complete/check).
- **Kids mode with chores → allowance** *(v1.2)* — points on tasks, parent approval
  flow, pocket-money page (balances, streaks, adjust/redeem), savings goals with
  progress bars and a dedicated kid view.
- **Local-first AI assistant** *(v1.2, first slice)* — provider abstraction
  (Ollama / OpenAI-compatible / Anthropic, bring-your-own-key, keys encrypted at
  rest): natural-language input (Ctrl+K) that turns a sentence into tasks,
  appointments, shopping items or budget entries, and automatic weekly dinner
  suggestions from the recipe library.
- **Recipe import from URL** *(v1.2)* — paste a link, the server parses the
  schema.org/Recipe JSON-LD and prefills the recipe form.
- **Recipes → shopping list** *(v1.2)* — aggregate the displayed week's ingredients
  into the shopping list, with deduplication and review before adding.
- **Family sticky notes** *(v1.2)* — digital fridge notes with colors and expiry,
  shown on the Dashboard and the Kiosk in realtime.
- **Password reset by email** *(v1.5)*: one-time link valid for 60 minutes; only
  the token's SHA-256 is stored, the response never reveals whether an address is
  registered. Requires SMTP; without it the endpoint says so explicitly instead of
  failing silently.
- **Email invitations & reliable invite links** *(v1.5)*: the owner can have the
  invitation emailed directly, and the share link is now built server-side (it used
  to be `http://localhost/...` when generated from the Android app). Android App Links
  open these links straight in the app when you publish your own assetlinks file.
- **Customisable dashboard** *(v1.5)*: per-member widget order and visibility, a
  day/week toggle for the agenda, and the week's plannings on the home page.
- **Planning activities with several participants** *(v1.6)*: swimming with both
  children is one entry, not two. Overlap detection covers every participant, and
  removing someone from the family removes them from the activities rather than
  leaving an id pointing at nobody.
- **Skip a single occurrence** *(v1.6)*: call off one date of a weekly entry, for a
  day off or a cancelled lesson, without touching the series. Recorded as a
  subtraction, the way `EXDATE` works in iCalendar.
- **Appointments in the planning week** *(v1.6)*: shown read-only next to the
  schedule, since a week you have to read in two places is not a week you can plan
  against.
- **Editable shopping quantities** *(v1.6)*: correct a quantity in place instead of
  deleting the line and typing it again, plus around fifty ready-made items offered
  as you type.

## Under consideration

- **More languages** — the interface is currently English/French. The i18n
  infrastructure is in place (namespaced JSON locales); the goal is to add German,
  Spanish, Italian, Dutch and more, ideally through a community translation
  workflow (e.g. Weblate). Contributions welcome.
- **Two-way Google Calendar / CalDAV sync** (today: Nextcloud import + iCal export
  only). CalDAV two-way first (covers Nextcloud, iCloud, Fastmail), Google later
  (OAuth verification burden).
- **Self-hosted family location** — private location sharing via OwnTracks /
  Traccar / Home Assistant `device_tracker`, plus geo-reminders ("you're near the
  supermarket, 5 items on the list"). Would replace the static planning on the
  Kiosk "who's where".
- **AI assistant, next slices** — receipt photo → budget entries and dish photo →
  recipe (needs a vision-capable model), streaming responses, per-member rate limits.
- **Barcode scanning & native pantry** — camera (PWA) + OpenFoodFacts for shopping
  and pantry; expiry dates with "use it up" recipe suggestions; connects to Grocy
  for those who have it, works standalone otherwise.
- **Offline mode** — the PWA currently needs a network connection; the goal is
  read access to today's data (calendar, lists, meals) when offline, then queued
  writes with background sync.
- **Weekly family digest** — an optional email or notification every Sunday
  evening summarizing the week ahead: appointments, chores, meals, budget status.
- **Scheduled backups** — automatic, recurring export of the family data
  (JSON/SQL) to a local folder, S3-compatible storage or WebDAV, with retention.
- **Deeper Home Assistant integration** — beyond the shopping-list sync: expose
  appointments and tasks as HA calendars/sensors so they can drive automations
  (e.g. light up when a chore is due).
- **Guest access** — a temporary, limited account or share link for a babysitter
  or grandparents (today's schedule, emergency contacts), and public temporary
  shopping-list links for a partner without an account.

## Pronote / EcoleDirecte (deferred — no official free API)

There is **no official, free, public API** for either service.

- **Pronote** (Index Education): only unofficial, reverse-engineered libraries exist
  (`pronotepy` in Python, `pawnote` in JS). They rely on the ENT/CAS auth flow, can break
  whenever Pronote changes, and sit in a legal/ToS grey area (the vendor has historically
  been hostile to scraping). Precedent: the Home Assistant Pronote integration uses
  `pronotepy`.
- **EcoleDirecte**: same situation — only an unofficial, community-maintained API.

**Decision:** not a pillar feature for now. If pursued later, it should be an **optional,
clearly-labelled "best-effort / unsupported" integration**, server-side (credentials +
scraping), most likely a small Python service built on `pronotepy`. The value would be
real for French families but the maintenance burden and fragility are high compared to
the items above.
