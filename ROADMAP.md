# OpenFamily roadmap

This document tracks larger ideas that are not yet implemented, and records decisions
about features that were considered. It is not a commitment or a schedule: priorities
can shift based on feedback: issues and discussions are welcome.

## Shipped

- **Family command center / kiosk display** *(v1.1, expanded in v1.2)*: full-screen
  view for a wall tablet (fridge / hallway): today's shared calendar, meals, tasks,
  who's where. v1.2 added weather (Open-Meteo), an optional Immich photo background,
  a shopping panel and touch interactions (tap to complete/check).
- **Kids mode, from chores to an allowance** *(v1.2)*: points on tasks, parent approval
  flow, pocket-money page (balances, streaks, adjust/redeem), savings goals with
  progress bars and a dedicated kid view.
- **Local-first AI assistant** *(v1.2, first slice)*: provider abstraction
  (Ollama / OpenAI-compatible / Anthropic / Google Gemini, bring-your-own-key, keys encrypted at
  rest): natural-language input (Ctrl+K) that turns a sentence into tasks,
  appointments, shopping items or budget entries, and automatic weekly dinner
  suggestions from the recipe library.
- **Recipe import from URL** *(v1.2)*: paste a link, the server parses the
  schema.org/Recipe JSON-LD and prefills the recipe form.
- **From recipes to the shopping list** *(v1.2)*: aggregate the displayed week's ingredients
  into the shopping list, with deduplication and review before adding.
- **Family sticky notes** *(v1.2)*: digital fridge notes with colors and expiry,
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
- **Family posts** *(v1.7)*: a small shared feed for the household, text, photo or
  link, where every member sees who has already read a post. The latest one is
  shown on the dashboard. Contributed by @thecybermacgyver.
- **Recurring, all-day and coloured appointments** *(v1.7)*: daily, weekly, monthly
  or yearly series with a single occurrence editable or skipped on its own, whole-day
  entries without a time slot, a colour per appointment and search in the calendar.
  From the community set in #85.
- **Portuguese and Russian interface** *(v1.7)*: joining English, French and
  Simplified Chinese, with the server's emails and reminders following the same
  choice. Contributed by @filipevieira and @streletskiy.
- **Server-owned database schema** *(v1.7)*: the server creates and upgrades the
  whole schema on startup, so packaging (Docker, TrueNAS, the installers) no longer
  needs to mount an init script. Contributed by @blastik.
- **Complete family export** *(v1.7.1)*: the export covers every module (rewards,
  Kakeibo, recurring expenses, notes, posts, appointment exceptions) and never
  includes passwords, tokens or credentials. A restore maps accounts by e-mail and
  can be repeated without creating duplicates. Contributed by @thecybermacgyver.
- **Other calendars** *(v1.8)*: import an .ics file, or follow Google Calendar,
  Outlook, Apple or any iCal address; followed calendars refresh every 30 minutes
  and keep their events in step with the source.
- **Reminders at any time** *(v1.8)*: up to five per appointment, from the start
  time to four weeks before, on every occurrence of a recurring appointment.
- **Recurring budget and Kakeibo** *(v1.8)*: recurring expenses and income on any
  schedule, linked to the calendar, with Kakeibo as a third view. Contributed by
  @thecybermacgyver.
- **Spanish, and each member's own week** *(v1.8)*: the interface, e-mails and
  notifications follow each member's language; each member picks the first day of
  the week. Contributed by @thecybermacgyver.
- **Recipes by ingredient and Tandoor meal plans** *(v1.8)*: find the recipes that
  use what you have at home, and import the week's Tandoor meal plan (contributed by
  @foulek57).

- **German interface** *(v1.9)*: the seventh language, including the e-mails,
  reminders and notifications the server sends. Contributed by @sawmans.
- **Invitation-only servers** *(v1.9)*: with sign-ups closed, an invitation from
  the Family page still lets someone in, and the login page follows the server's
  setting without a rebuild.
- **Task categories and filters** *(v1.9)*: categories each family defines for
  itself (by room, by kind of chore), quarterly and four-monthly frequencies,
  filters by frequency and category kept per account, and a child signed in on a
  shared tablet starts on their own tasks.
- **One clock style per region** *(v1.9)*: every screen shows times the way the
  member's region writes them, 12-hour or 24-hour, never both on one page.
- **Home Assistant to-do lists** *(v1.9)*: the configured list is synced even
  when Home Assistant's legacy shopping list is still around. Contributed by
  @sawmans.
- **Single sign-on** *(v2.0)*: sign in with your own OpenID Connect
  provider (Authentik, Keycloak, Pocket ID...), link it to an existing account,
  or run an SSO-only server. "Sign out of all devices" in Settings, and removing
  someone from the family now signs them out everywhere. Android follows later.
  Contributed by @macdows.
- **An API for other programs** *(v2.0)*: personal API tokens, read-only or
  read-and-write, made and revoked in Settings; webhooks that call Home
  Assistant, n8n or a script when the family's data changes, each call signed;
  a guide ([API.md](API.md)) and an OpenAPI description served by the server
  itself.
- **Gladys Assistant integration** *(v2.0)*: the family calendar, the shopping
  list and the tasks in Gladys, the open-source home assistant: dashboard
  widgets, scene actions and triggers. Published in the Gladys integration
  store, from [its own repository](https://github.com/NexaFlowFrance/gladys-openfamily).
- **Display links** *(v2.0)*: a stable address that shows the family's day
  without signing in, for an e-paper frame, an e-reader or any screen that
  cannot log in. Asked for by @Altomb.
- **Kiosk, one tap away and with a screensaver** *(v2.0)*: a shortcut in the top
  bar, then photos from Immich or a moving clock after a while without a touch,
  for screens left on all day; the weather in °C or °F. Asked for by
  @GingerZero and @khxmxle.
- **A time zone per family** *(v2.0)*: chosen in Settings instead of assumed
  from the server. Reminders, display links and the calendar feed follow it,
  and the feed now carries every occurrence of a recurring appointment.
- **Catalan interface** *(v2.0)*: the eighth language. Contributed by
  @giro-dev.
- **Several Home Assistant lists** *(v2.0)*: more than one to-do list can be
  imported. Asked for by @bino277.
- **Install in one command** *(v2.1)*: one image,
  `ghcr.io/nexaflowfrance/openfamily`, holds the interface, the API and the
  database, for amd64 and arm64. Nothing to configure: its secrets are
  generated on the first start and kept with the data. Definitions for Unraid,
  CasaOS, Runtipi, Umbrel and Home Assistant are built on it
  ([packaging](packaging/README.md)).
- **A bottom bar made for the phone** *(v2.1)*: home, calendar, tasks and
  shopping under the thumb, and every other section behind "More", laid out
  like the apps of a home screen.
- **The family's time zone without asking** *(v2.1)*: a new family takes the
  time zone of the browser that creates it.
- **Birthdays** *(v2.2)*: a family member with a date of birth has a birthday
  in the calendar every year, with the age reached, wherever the calendar is
  shown: the app, the kiosk, a display link, the calendar feed, the API. The
  family is told on the morning of the day.
- **Pantry** *(v2.2)*: what is at home, by place, with use-by dates and what
  to eat first, and one tap to the shopping list. A barcode names a product:
  typed, read by a handheld scanner, or scanned with the camera where the
  browser can, with Open Food Facts behind it.
- **A door open to contributors** *(v2.2)*: a language no longer has to be
  complete to be merged, the app shows the rest in English; guides for
  [contributing](CONTRIBUTING.md) and [translating](TRANSLATING.md), issue
  forms, and GitHub Discussions.
- **A new look, and yours to adjust** *(v2.3)*: a navigation bar at the bottom,
  on the left or on the right, or the sidebar; a neutral dark theme; a home
  page that shows tasks, meals, shopping, birthdays and the pantry; an accent
  colour, corner style and text size per device; a short setup on first
  launch; pages that use the width of the screen.
- **In the app catalog of home servers** *(v2.3)*: Home Assistant, Umbrel,
  CasaOS and ZimaOS, Runtipi and Unraid install OpenFamily from a repository
  each.
- **Recurring tasks that come back** *(v2.3)*: a daily, weekly or monthly task
  is to do again at its next occurrence, and earns its points again.
- **More ways to repeat** *(v2.3)*: a planning entry every N weeks, with
  alternate weeks sharing an hour; a weekly appointment on chosen weekdays.
- **Single sign-on in the Android app** *(v2.3)*: the sign-in happens in the
  phone's browser and comes back to the app.
- **Immich albums on the kiosk** *(v2.3)*: all photos, the favourites, or
  chosen albums.
- **Japanese** *(v2.3)*: the interface, the server's texts and the guides,
  contributed by Hyd3-14; dates in Chinese and Japanese order.

## Under consideration

- **More languages**: the interface is available in English, French, German,
  Portuguese, Russian, Spanish, Catalan, Simplified Chinese and Japanese. The i18n
  infrastructure is in place (namespaced JSON locales); the goal is to add
  Italian, Dutch and more, ideally through a community translation workflow
  (e.g. Weblate). Contributions welcome.
- **Two-way Google Calendar / CalDAV sync** (today: one-way from Nextcloud or any
  iCal address, including Google, plus iCal export). CalDAV two-way first (covers Nextcloud, iCloud, Fastmail), Google later
  (OAuth verification burden).
- **Self-hosted family location**: private location sharing via OwnTracks /
  Traccar / Home Assistant `device_tracker`, plus geo-reminders ("you're near the
  supermarket, 5 items on the list"). Would replace the static planning on the
  Kiosk "who's where".
- **AI assistant, next slices**: receipt photo to budget entries and dish photo to
  recipe (needs a vision-capable model), streaming responses, per-member rate limits.
- **Pantry, next steps**: "use it up" recipe suggestions from what is about to
  expire, barcodes on the shopping list, camera scanning in the Android app
  and on browsers without a barcode detector, a link with Grocy for those who
  have it.
- **Offline mode**: the PWA currently needs a network connection; the goal is
  read access to today's data (calendar, lists, meals) when offline, then queued
  writes with background sync.
- **Weekly family digest**: an optional email or notification every Sunday
  evening summarizing the week ahead: appointments, chores, meals, budget status.
- **Scheduled backups**: automatic, recurring export of the family data
  (JSON/SQL) to a local folder, S3-compatible storage or WebDAV, with retention.
- **Deeper Home Assistant integration**: beyond the list sync, an integration
  on the Home Assistant side that mirrors the one for Gladys Assistant, with the
  calendar, the lists and the tasks as Home Assistant entities that can drive
  automations (e.g. light up when a chore is due). The API tokens, webhooks and
  documented API of v2.0 are what it will be built on.
- **Guest access**: a temporary, limited account or share link for a babysitter
  or grandparents (today's schedule, emergency contacts), and public temporary
  shopping-list links for a partner without an account.

## Pronote / EcoleDirecte (deferred: no official free API)

There is **no official, free, public API** for either service.

- **Pronote** (Index Education): only unofficial, reverse-engineered libraries exist
  (`pronotepy` in Python, `pawnote` in JS). They rely on the ENT/CAS auth flow, can break
  whenever Pronote changes, and sit in a legal/ToS grey area (the vendor has historically
  been hostile to scraping). Precedent: the Home Assistant Pronote integration uses
  `pronotepy`.
- **EcoleDirecte**: same situation, with only an unofficial, community-maintained API.

**Decision:** not a pillar feature for now. If pursued later, it should be an **optional,
clearly-labelled "best-effort / unsupported" integration**, server-side (credentials +
scraping), most likely a small Python service built on `pronotepy`. The value would be
real for French families but the maintenance burden and fragility are high compared to
the items above.
