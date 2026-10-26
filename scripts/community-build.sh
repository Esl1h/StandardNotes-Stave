#!/bin/sh
# Builds the plugin the way the standardnotes/plugins repository would: a
# clean copy of the committed files, without package-lock.json, installed
# and built with Yarn 3 and the node-modules linker their workspace uses.
# Catches a dependency or build step that only works with npm or with a
# network at build time. Run from the repository root.
#
#   YARN="corepack yarn@3.2.1" sh scripts/community-build.sh
set -eu

YARN=${YARN:-yarn}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

git archive HEAD | tar -x -C "$work"
cd "$work"
rm -f package-lock.json
printf 'nodeLinker: node-modules\n' > .yarnrc.yml
# An empty lockfile marks this directory as the project root, so Yarn does
# not look for one in the directories above.
: > yarn.lock
export YARN_ENABLE_IMMUTABLE_INSTALLS=false

$YARN install
$YARN build
test -f build/index.html
echo "community build: build/index.html produced with $($YARN --version)"
