#!/bin/sh
# Installs the client-name pre-push hook in this clone and points it at the list.
#
#   hooks/install.sh <path to the client-name list>
#
# The list must live outside the repo, so it can never be committed. The hook is
# copied into the clone's shared hooks folder, so every worktree uses it; re-run
# this after hooks/pre-push changes. The clone's own core.hooksPath is pointed at
# that folder, so a machine-wide core.hooksPath cannot shadow the hook.
set -e

[ $# -eq 1 ] || { echo "usage: hooks/install.sh <path to the client-name list>" >&2; exit 2; }

top=$(git rev-parse --show-toplevel)
list=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
case $list in
  "$top"/*) echo "install: the list must live outside the repo" >&2; exit 1 ;;
esac
[ -f "$list" ] || { echo "install: no list at that path" >&2; exit 1; }

hooks=$(cd "$(git rev-parse --git-common-dir)" && pwd)/hooks
mkdir -p "$hooks"
cp "$top/hooks/pre-push" "$hooks/pre-push"
chmod +x "$hooks/pre-push"
git config core.hooksPath "$hooks"
git config skills.clientList "$list"
echo "install: pre-push hook installed"
