#!/bin/bash
# Runs ON THE SERVER, launched detached (nohup) by .github/workflows/deploy-api.yml,
# against a pre-built `dist/` shipped from the CI runner (not built here —
# see that workflow for why). Only needs production dependencies (no
# typescript/@nestjs/cli/webpack — dist/ is already compiled JS), which
# keeps this fast and light on this account's tight disk quota.
set -e
cd "$(dirname "$0")"
# deploy.sh lives directly at the app root (== cPanel's document root for
# this subdomain, api.erp.sttps.co) — no subfolder nesting to climb out of.
APP_DIR=$(pwd)
source "$HOME/nodevenv/$(basename "$APP_DIR")/22/bin/activate"
# --ignore-scripts, then prisma generate as its own separate step: this
# account's LVE resource limiter SIGABRT-killed firebase-admin's postinstall
# script (a memory-cgroup kill, confirmed against `ulimit -a` showing no
# visible limit) when npm ran every package's postinstall hook together.
# Running just the one hook we actually need, in isolation, avoided it.
npm ci --omit=dev --ignore-scripts
npx prisma generate
mkdir -p tmp
date > tmp/restart.txt
