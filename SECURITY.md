# Security Policy

## Supported versions

Only the [latest release](https://github.com/Esl1h/StandardNotes-Stave/releases/latest)
receives security fixes.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting (Security tab > Report a
vulnerability) instead of opening a public issue. Please include the
affected version and, if possible, the note content that triggers the
problem.

## Supply chain

- Every change reaches `main` through a pull request with signed commits and passing CI; force pushes and deletions are blocked, and release tags cannot be moved or deleted
- Workflow actions are pinned to commit hashes and run with read-only tokens unless a job needs more
- Releases are immutable and carry `SHA256SUMS` and a build provenance attestation; the README explains how to verify them
- The [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/Esl1h/StandardNotes-Stave) checks these practices weekly. Its Code-Review and Branch-Protection checks stay low by design: this is a single-maintainer project, so pull requests are not reviewed by a second person

## Scope

- The editor runs entirely client side; notes live inside your Standard
  Notes account, encrypted with the rest of your data
- Nothing is transmitted anywhere except through Standard Notes itself;
  the editor has no network access of its own
- Every asset the editor needs (renderers, music fonts, the SoundFont) ships with the build; nothing is fetched from a CDN at runtime
- Imported files are read in the browser only
- The hosted build is static content served from GitHub Pages
- Vulnerabilities in Standard Notes itself belong to
  [Standard Notes security](https://standardnotes.com/help/2/has-standard-notes-completed-a-third-party-security-audit)
