# Security Policy

## Supported Versions

OpenFamily is actively maintained on the `main` branch and latest release tags.

- `main`: supported
- Latest release (`v*`): supported
- Older releases: best effort only

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public issue.

Send a private report with the following information:

- A clear description of the issue
- Steps to reproduce
- Impact assessment
- Proposed mitigation (if available)

Contact: contact@nexaflow.fr

If email is unavailable, open a GitHub issue with no exploit details and ask for a private contact channel.

## Disclosure Process

- We acknowledge new reports within 72 hours.
- We triage and assess severity.
- We work on a fix and coordinate disclosure with the reporter.
- We publish a patch release and security notes when applicable.

## Security Best Practices for Self-Hosting

- Set a strong `JWT_SECRET` (minimum 32 characters).
- Restrict `CORS_ORIGINS` to trusted frontend domains.
- Use HTTPS for both app and API in production.
- Keep Docker images and dependencies up to date.
- Do not expose PostgreSQL publicly unless required.
