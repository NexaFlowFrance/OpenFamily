# Contributing to OpenFamily

Thank you for being here. OpenFamily is built for families who host their own tools, and a good part of it came from the people who use it: languages, integrations, ideas that became features. This page says how to take part, with or without writing code.

## Without writing code

- **Tell us what does not work.** A [bug report](https://github.com/NexaFlowFrance/OpenFamily/issues/new/choose) with what you did, what you expected and what happened is a real contribution.
- **Suggest something.** An idea starts best as a [discussion](https://github.com/NexaFlowFrance/OpenFamily/discussions): others can say whether they need it too, and how they would use it.
- **Translate.** The interface exists in eight languages, and a new one can arrive one string at a time. See [TRANSLATING.md](TRANSLATING.md).
- **Try an install we could not.** The definitions for Unraid, CasaOS, Runtipi, Umbrel and Home Assistant in [packaging](packaging/README.md) were started with Docker, not installed from each catalog. If you run one of them, telling us how it went helps everyone after you.
- **Answer a question.** If you have been through an install or a setting someone asks about in the discussions, your answer is worth more than ours.

## Running it on your machine

You need Node.js 22 or later and Docker (for the database).

```bash
git clone https://github.com/NexaFlowFrance/OpenFamily.git
cd OpenFamily
cp .env.example .env              # then give JWT_SECRET any long random text
docker compose up -d postgres     # the database only
npm run install:all
npm run dev:server                # API on http://localhost:3001
npm run dev:client                # app on http://localhost:5173
```

The project has three parts: `client` (React, Vite, Tailwind), `server` (Express, PostgreSQL) and `shared` (types used by both). The Android app is the client wrapped with Capacitor.

## Before a pull request

For anything larger than a fix, open an issue or a discussion first. It avoids building something that is already under way, or that would be declined for a reason nobody could guess.

Then check what the automated build will check:

```bash
npm run build                     # types, and the translation files
cd server && npm test             # needs a PostgreSQL to test against, see below
```

The server tests run against a real database, emptied between tests. Point them at one that holds nothing you care about:

```bash
docker run -d --name openfamily-test-db -p 5432:5432 \
  -e POSTGRES_USER=openfamily -e POSTGRES_PASSWORD=openfamily -e POSTGRES_DB=openfamily_test \
  postgres:16-alpine
cd server
POSTGRES_HOST=localhost POSTGRES_USER=openfamily POSTGRES_PASSWORD=openfamily \
  POSTGRES_DB=openfamily_test JWT_SECRET=any-long-secret-of-at-least-32-characters npm test
```

A few things the tests will tell you about, so you may as well know:

- **A new text in the interface** goes into `client/src/i18n/locales/en`, and into the seven other complete languages. If you cannot write them all, put the English text in the ones you do not speak and say so in the pull request: we will translate before merging.
- **A new table that refers to a user** has to be listed in `server/src/lib/familyData.ts`, which decides what follows a family when its ownership changes.
- **A new route meant for other programs** has to be described in `server/src/lib/openapi.ts`.
- **A change to the database** is a migration in `server/src/migrations`, never an edit of an existing one.

## What we look at

- Does it work, and is there a test that would fail without it?
- Does it stay simple for a family that knows nothing about servers?
- Do the comments say why, where the code alone does not?

Send the pull request the way you work. One change or several, it does not have to be split or rebased: we would rather adapt it ourselves than send you back to Git.

Use the tools you like, AI assistants included. What we ask is that you have run what you submit and can talk about it.

## Security

Please do not open a public issue for a vulnerability. [SECURITY.md](SECURITY.md) says how to report it privately.

## Licence

OpenFamily is under the [AGPL-3.0 licence](licence.md). By contributing, you agree that your contribution is published under it.
