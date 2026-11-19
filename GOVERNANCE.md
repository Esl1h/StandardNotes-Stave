# Governance

StandardNotes Stave is a small project with one maintainer. This page says how decisions are made, who does what, and what the project cannot yet promise.

## Decision making

The maintainer, [Esl1h](https://github.com/Esl1h), makes the final decision on everything: what goes into the code, which pull requests are merged, what a release contains and what the project will not do (see the [Roadmap](README.md#roadmap)). Decisions that shape the design are written down as [architecture decision records](docs/adr/README.md); a record is never rewritten, a later one supersedes it.

Anyone may propose a change in an issue or a pull request. Disagreements are settled in that issue or pull request: the discussion stays civil under the [Code of Conduct](CODE_OF_CONDUCT.md), and when the participants do not agree, the maintainer decides and gives the reason. The project is free software under the [AGPL-3.0-or-later](LICENSE), so anyone who disagrees with a decision can fork it.

## How contributions are accepted

The rules for acceptable contributions are in [CONTRIBUTING.md](CONTRIBUTING.md): coding standards, tests, commit messages and scope. A pull request is merged when CI passes and the maintainer judges that it fits the scope. Nobody else reviews it, because there is no second maintainer; the repository settings still require a pull request, signed commits and green CI for every change, the maintainer's own included (see [record 6](docs/adr/0006-merge-commits-signed-history-verifiable-releases.md)).

## Roles

- **Maintainer** (Esl1h): decides what is built, reviews and merges pull requests, triages issues, answers security reports, cuts releases and keeps the hosted build and the repository settings. The only person with write access to the repository, the release workflow and the hosting.
- **Contributor** (anyone): reports bugs, suggests features, sends pull requests. Follows CONTRIBUTING.md and the Code of Conduct. Contributors have no special access.
- **Security reporter** (anyone): reports a vulnerability privately as described in [SECURITY.md](SECURITY.md), gives the maintainer time to fix it before it is made public, and is credited in the release notes unless they ask not to be.

## Releases

The maintainer cuts releases by tagging a commit on `main`; the `Release` workflow checks it, builds it, signs its provenance and publishes it. The steps are under [Releases](README.md#releases) in the README, and the way to verify a download is under [Verifying a release](README.md#verifying-a-release).

## Support policy

Only the [latest release](https://github.com/Esl1h/StandardNotes-Stave/releases/latest) is supported. Fixes, security fixes included, go into a new release and are not backported.

Upgrading needs no migration. The Standard Notes app checks `ext.json` and installs the new version by itself; otherwise install the new version from the same URL (see [Installation](README.md#installation)). Notes are plain text in ABC, alphaTex or ChordPro, and Stave stores nothing else in them, so a note written with an older version opens in a newer one, and in any other tool that reads the same notation.

## Continuity

The project does not meet the criterion of continuing with minimal interruption if its one maintainer becomes unable to work on it. No second person holds access today: only the maintainer can merge, publish a release, change the repository settings or the hosting, and no one else holds the signing identity of the maintainer's commits and tags. If the maintainer is lost, the project stops receiving fixes until someone forks it. Releases already published keep working and stay verifiable, since their provenance is signed by GitHub Actions and recorded on GitHub, not held by the maintainer.

Adding a second maintainer with access is not planned yet. This section will change when it happens.
