# OpenFamily — Roadmap

This document tracks larger ideas that are not yet implemented, and records decisions
about features that were considered.

## Shipped

- **Family command center / kiosk display** *(v1.1, expanded in v1.2)* — full-screen
  view for a wall tablet (fridge / hallway): today's shared calendar, meals, tasks,
  who's where. v1.2 added weather (Open-Meteo), an optional Immich photo background,
  a shopping panel and touch interactions (tap to complete/check). A free alternative
  to hardware like Skylight Calendar.
- **Kids mode with chores → allowance** *(v1.2)* — points on tasks, parent approval
  flow, pocket-money page (balances, streaks, adjust/redeem), savings goals with
  progress bars and a dedicated kid view (piggy bank, confetti at 100%).
- **Local-first AI assistant** *(v1.2, first slice)* — provider abstraction
  (Ollama / OpenAI-compatible / Anthropic, bring-your-own-key, keys encrypted at
  rest): natural-language magic input (Ctrl+K) that turns a sentence into tasks,
  appointments, shopping items or budget entries, and automatic weekly dinner
  suggestions from the recipe library.
- **Recipe import from URL** *(v1.2)* — paste a link, the server parses the
  schema.org/Recipe JSON-LD and prefills the recipe form.
- **Recipes → shopping list** *(v1.2)* — aggregate the displayed week's ingredients
  into the shopping list, with deduplication and review before adding.
- **Family sticky notes** *(v1.2)* — digital fridge notes with colors and expiry,
  shown on the Dashboard and the Kiosk in realtime.

## Under consideration (high "wow", marketing value)

- **Two-way Google Calendar / CalDAV sync** (today: Nextcloud import + iCal export
  only). CalDAV two-way first (covers Nextcloud, iCloud, Fastmail), Google later
  (OAuth verification burden).
- **Self-hosted family location** — a private "Life360" via OwnTracks / Traccar /
  Home Assistant `device_tracker`, plus geo-reminders ("you're near the supermarket,
  5 items on the list"). Would replace the static planning on the Kiosk "who's where".
- **AI assistant, next slices** — receipt photo → budget entries and dish photo →
  recipe (needs a vision-capable model), streaming responses, per-member rate limits.
- **Barcode scanning & native pantry** — camera (PWA) + OpenFoodFacts for shopping
  and pantry; expiry dates with "use it up" recipe suggestions; connects to Grocy
  for those who have it, works standalone otherwise.
- **Public temporary list sharing** — share a shopping list via an expiring public
  link (partner without an account, babysitter, grandparents).

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
scraping), most likely a small Python service built on `pronotepy`. The ROI is much lower
than the items above for attracting users/stars, and the maintenance burden is high.
