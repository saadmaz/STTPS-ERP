#!/bin/bash
# Runs ON THE SERVER, launched detached (nohup) by .github/workflows/deploy-api.yml
# so a dropped SSH connection (this host regularly drops long-lived sessions
# mid-build) can't kill the build.
set -e
cd "$(dirname "$0")"
APP_DIR=$(cd .. && pwd)
source "$HOME/nodevenv/$(basename "$APP_DIR")/22/bin/activate"
npm ci
npm run build
mkdir -p tmp
date > tmp/restart.txt
