# Architecture decision records

Decisions that shape how this plugin is built and released, one file each, in the format of [Michael Nygard's ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Records 1 to 6 are shared with the other Standard Notes plugins (Kanban, API Client and Milkdown) and kept identical to theirs; from 7 on they are specific to Stave. A record is never rewritten once accepted; a later one supersedes it.

1. [Record architecture decisions](0001-record-architecture-decisions.md)
2. [Pin the Standard Notes git dependencies](0002-pin-standard-notes-git-dependencies.md), superseded here by 7
3. [Generate the changelog with git-cliff](0003-changelog-with-git-cliff.md)
4. [Check formatting in CI, not in a pre-commit hook](0004-format-check-in-ci.md)
5. [Set a Content Security Policy at build time](0005-content-security-policy.md)
6. [Merge commits, signed history and verifiable releases](0006-merge-commits-signed-history-verifiable-releases.md)
7. [No git dependencies](0007-no-git-dependencies.md)
8. [Notation engines and libraries](0008-notation-engines-and-libraries.md)
9. [One engine interface, one chunk per engine](0009-engine-interface.md)
10. [Detect the engine from the note text](0010-engine-detection.md)
11. [Ship every asset with the build](0011-offline-assets.md), its workers from a blob since 15
12. [Build the UI on the patterns of the Milkdown plugin](0012-ui-from-the-milkdown-plugin.md)
13. [A bundle budget, reported at every milestone](0013-bundle-budget.md)
14. [Play ABC with piano samples shipped in the build](0014-abc-playback-samples.md)
15. [Run alphaTab in the Standard Notes iframe](0015-alphatab-in-the-standard-notes-iframe.md)
16. [No Verovio renderer for ABC, for now](0016-no-verovio-renderer-for-abc.md)
