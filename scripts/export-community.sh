#!/bin/sh
# Copies the plugin into a checkout of a fork of standardnotes/plugins, as
# packages/org.esl1h.sn-stave-editor, the way that monorepo holds plugins:
# sources only, built there by `yarn build` (Yarn 3 workspace), with the
# `sn` field it reads and an entry in cdn/plugins.json. Run it by hand from
# this repository's root, on the tag of a release:
#
#   sh scripts/export-community.sh ../plugins          # copy, then review
#   sh scripts/export-community.sh ../plugins --pr     # also commit, push, open the PR
#
# Without --pr it changes files in the fork checkout only. scripts/
# community-build.sh checks the same sources build with Yarn 3 first.
set -eu

IDENTIFIER=org.esl1h.sn-stave-editor
UPSTREAM=standardnotes/plugins

usage() {
  echo "usage: $0 <fork checkout of $UPSTREAM> [--pr]" >&2
  exit 2
}

[ $# -ge 1 ] || usage
fork=$1
pr=false
if [ $# -ge 2 ]; then
  [ "$2" = --pr ] || usage
  pr=true
fi

[ -f "$fork/cdn/plugins.json" ] || {
  echo "$fork does not look like a checkout of $UPSTREAM (no cdn/plugins.json)" >&2
  exit 1
}
[ -z "$(git status --porcelain)" ] || {
  echo "Commit or stash the changes here first: the export takes HEAD." >&2
  exit 1
}

version=$(node -p "require('./package.json').version")
dest="$fork/packages/$IDENTIFIER"

# What the build and the license need; tests, CI, ADRs and the npm
# lockfile stay here (the monorepo has its own yarn.lock).
rm -rf "$dest"
mkdir -p "$dest"
git archive HEAD -- \
  index.html package.json tsconfig.json vite.config.ts \
  src public examples \
  LICENSE README.md CHANGELOG.md SECURITY.md |
  tar -x -C "$dest"

DEST="$dest" IDENTIFIER="$IDENTIFIER" node -e '
  const fs = require("fs");
  const file = process.env.DEST + "/package.json";
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  pkg.private = true;
  pkg.repository = {
    type: "git",
    url: "https://github.com/standardnotes/plugins",
    directory: "packages/" + process.env.IDENTIFIER,
  };
  pkg.sn = {
    name: "Stave",
    content_type: "SN|Component",
    area: "editor-editor",
    main: "build/index.html",
  };
  // The monorepo builds; tests and release tooling live upstream.
  pkg.scripts = { build: pkg.scripts.build };
  if (pkg.overrides) {
    // Yarn 3 reads resolutions; npm overrides would be ignored.
    pkg.resolutions = pkg.overrides;
    delete pkg.overrides;
  }
  fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
'

# Appended as text, in the file's own layout, so the diff is the entry.
FORK="$fork" IDENTIFIER="$IDENTIFIER" node -e '
  const fs = require("fs");
  const file = process.env.FORK + "/cdn/plugins.json";
  const text = fs.readFileSync(file, "utf8");
  const id = process.env.IDENTIFIER;
  if (JSON.parse(text).some((entry) => entry.identifier === id)) process.exit(0);
  const entry =
    "  {\n    \"identifier\": \"" + id + "\",\n" +
    "    \"staticFiles\": [\"build\", \"package.json\"]\n  }";
  fs.writeFileSync(file, text.replace(/\}\s*\]\s*$/, "},\n" + entry + "\n]\n"));
'

echo "Copied Stave $version into $dest"

if [ "$pr" = false ]; then
  echo "Review it (cd $fork && git status), then run again with --pr."
  exit 0
fi

branch="stave-$version"
cd "$fork"
git switch -c "$branch"
git add -A "packages/$IDENTIFIER" cdn/plugins.json
git commit -m "feat($IDENTIFIER): Stave $version"
git push -u origin "$branch"
gh pr create --repo "$UPSTREAM" --head "$(gh api user --jq .login):$branch" \
  --title "feat($IDENTIFIER): Stave $version" \
  --body "Adds Stave $version, a music notation and tablature editor (ABC, alphaTex), from https://github.com/Esl1h/StandardNotes-Stave. AGPL-3.0-or-later, no git dependencies, builds with \`yarn build\` into build/."
