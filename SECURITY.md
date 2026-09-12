# Security Policy

## Reporting a Vulnerability

If you find a security issue in this project, please report it privately
rather than opening a public issue:

- Email: lucasgomez.inbox@gmail.com

Please include:
- A description of the issue and its potential impact
- Steps to reproduce (a minimal repro is ideal)
- Any relevant logs, request/response samples with secrets redacted

You should get an acknowledgement within a few days. There's no bug bounty —
this is a solo hobby project — but reported issues will be fixed and
credited (unless you'd rather stay anonymous).

## Scope

This app is a single Anthropic-API-backed chat client with no user accounts.
Sensitive areas to flag:
- Leakage of `ANTHROPIC_API_KEY` or other server-side secrets
- Ways to make `/api/*` routes read/write another user's stored data
  (chat history, MyComputer files) without knowing their character ID
- XSS or injection via chat content, file names, or FILE_ACTION parsing
- Bypasses of the CSP / security headers in `next.config.mjs`

## Supported Versions

Only the latest commit on `main` (what's deployed to production) is
supported. There are no older maintained versions.

## Dependency Audits

Dependencies are checked with `npm audit` on every push to `main` and weekly
via GitHub Actions (`.github/workflows/npm-audit.yml`). Run it locally with:

```
npm audit --audit-level=moderate
```
