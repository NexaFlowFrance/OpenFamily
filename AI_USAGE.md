# AI assistance and review in OpenFamily

## Identified application contributions

These merged pull requests explicitly disclose Claude Code assistance in application functions and files:

| Contribution | Application work covered |
|---|---|
| [#37](https://github.com/NexaFlowFrance/OpenFamily/pull/37) | Budget navigation and statistics |
| [#38](https://github.com/NexaFlowFrance/OpenFamily/pull/38) | Data export and import |
| [#88](https://github.com/NexaFlowFrance/OpenFamily/pull/88) | Passing `REGISTRATION_ENABLED` through Docker Compose and the client build |
| [#123](https://github.com/NexaFlowFrance/OpenFamily/pull/123) | German translations in the interface and server |
| [#124](https://github.com/NexaFlowFrance/OpenFamily/pull/124) | Home Assistant synchronization |

## Review records and human oversight

The maintainer decides which contributions are accepted. Public records include the maintainer account's approvals and reported local checks on [#123](https://github.com/NexaFlowFrance/OpenFamily/pull/123#pullrequestreview-5642778899) and [#124](https://github.com/NexaFlowFrance/OpenFamily/pull/124#pullrequestreview-5642778262). A [maintainer-account comment on #88](https://github.com/NexaFlowFrance/OpenFamily/pull/88#issuecomment-5512380696) reports registration checks with the option disabled and enabled, including the resulting HTTP responses and client bundles; a [follow-up clarifies the test context](https://github.com/NexaFlowFrance/OpenFamily/pull/88#issuecomment-5512486353).

For #37 and #38, the records show successful build checks, while functional-testing checklist items remain unchecked in the PR descriptions and no GitHub approval was recorded. Those records do not determine whether someone read the changes outside GitHub's review system.

The [contribution guide](CONTRIBUTING.md) permits AI tools and asks contributors to run submitted work and be able to explain it. This is an expectation for contributions, not proof that every change has received the same review coverage.

## Validation evidence and limits

- [Project CI](https://github.com/NexaFlowFrance/OpenFamily/actions/workflows/ci.yml) checks builds, server tests and Docker API/all-in-one smoke tests. A passing run covers the behavior exercised by those tests.
- [Native Dokploy API test](https://github.com/NexaFlowFrance/openfamily-catalog-tests/actions/runs/44032449634): import, deployment, domain routing, a fictitious account, stop/start and container replacement with persisted account and session. It ran on a disposable Linux amd64 machine. Dashboard UI, ARM runtime, HTTPS, backup restoration and optional integrations were not tested.
- [Windows shutdown regression](https://github.com/NexaFlowFrance/OpenFamily/actions/runs/44077468800): four PID-file scenarios in Windows PowerShell 5.1 using process mocks. It does not test installer installation, upgrade or uninstallation.
- [Platform-testing discussion](https://github.com/NexaFlowFrance/OpenFamily/discussions/141) and package guides distinguish Docker checks from installation through each platform's own interface.

Automated checks, AI-assisted review and runtime tests serve different purposes from human code review. None of the records above establishes an independent security audit or universal platform certification.

## The optional in-app AI assistant

OpenFamily's optional in-app AI assistant is documented as a product feature. This development disclosure concerns the tools used to build and maintain the software.

## Keeping this disclosure current

This statement records confirmed use and public evidence as of 17 November 2026. Corrections and additional evidence can be raised in the [development disclosure discussion](https://github.com/NexaFlowFrance/OpenFamily/discussions/143).
