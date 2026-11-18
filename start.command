#!/bin/bash
# Double-click this file on a Mac to start JobScout.
cd "$(dirname "$0")" || exit 1

# Finder-launched shells can miss Node installed with Homebrew or nvm.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "JobScout needs Node.js, which isn't installed yet."
  echo "Download the LTS version from https://nodejs.org (opening it now), install it,"
  echo "then double-click start.command again."
  open "https://nodejs.org" 2>/dev/null
  read -r -p "Press Enter to close this window..."
  exit 1
fi

if ! node scripts/launch.mjs; then
  echo
  read -r -p "JobScout stopped with an error (see above). Press Enter to close this window..."
  exit 1
fi
