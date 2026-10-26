# component-relay (vendored)

The TypeScript sources of [`@standardnotes/component-relay`](https://github.com/standardnotes/component-relay) 2.3.2, at commit `164428640ba59e31e7ca3ca932b7d7521594f17c` (the commit the other Standard Notes plugins pin), under the AGPL-3.0 in `LICENSE`. See `docs/adr/0007-no-git-dependencies.md` for why they are copied here instead of installed.

Changes from upstream:

- `snjs-types.ts` is added, and the imports from `@standardnotes/snjs` point to it: the relay imports snjs for type names only
- `Types/MessagePayload.ts` imports `ComponentAction` from `./ComponentAction` instead of snjs
