#!/usr/bin/env bash
# Publishes packaging/ to the repositories that app catalogs read.
#
# Each folder of packaging/ listed below is the content of one public
# repository: umbrelOS, Home Assistant, Runtipi, CasaOS and Unraid fetch
# OpenFamily's definition from there. After a release, once the version has
# been changed in packaging/ (see packaging/README.md):
#
#   bash scripts/publish-catalogs.sh "OpenFamily 2.3.0"
#
# The repositories are cloned next to this one, in ../openfamily-catalogs,
# unless a second argument names another folder. A file removed from
# packaging/ is not removed there: do that by hand, it is rare.
set -euo pipefail

MESSAGE="${1:?Give the commit message, for instance \"OpenFamily 2.3.0\"}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${2:-$ROOT/../openfamily-catalogs}"
OWNER="NexaFlowFrance"
mkdir -p "$WORK"

publish() {
  local name="$1" folder="$2"
  if [ ! -d "$WORK/$name/.git" ]; then
    git clone -q "https://github.com/$OWNER/$name.git" "$WORK/$name"
  fi
  git -C "$WORK/$name" pull -q --ff-only
  cp -R "$ROOT/packaging/$folder/." "$WORK/$name/"
  git -C "$WORK/$name" add -A
  if git -C "$WORK/$name" diff --cached --quiet; then
    echo "[$name] already up to date"
    return
  fi
  git -C "$WORK/$name" commit -q -m "$MESSAGE"
  git -C "$WORK/$name" push -q origin HEAD
  echo "[$name] $(git -C "$WORK/$name" log --oneline -1)"
}

publish umbrel-app-store    umbrel
publish home-assistant-apps home-assistant
publish runtipi-appstore    runtipi
publish unraid-templates    unraid
publish casaos-appstore     casaos-store
