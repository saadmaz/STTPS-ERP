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
#
# Even in isolation, npm ci itself has now been seen killed (exit 137) by
# the same LVE limiter -- confirmed via cgroup inspection (this account
# runs inside an lveN cgroup with no memory.limit file readable, so the
# cap is invisible to `free`/`ulimit`, only shows up as a kill). It read as
# transient (a plain reinstall of ~275M/577 packages, no different from
# runs that succeeded before), so retry rather than trying to guess at and
# tune around an invisible ceiling.
NPM_CI_OK=false
for attempt in 1 2 3; do
  if npm ci --omit=dev --ignore-scripts --no-audit --no-fund; then
    NPM_CI_OK=true
    break
  fi
  echo "npm ci attempt $attempt failed (possible LVE memory kill) -- retrying in 20s"
  rm -rf node_modules
  sleep 20
done
if [ "$NPM_CI_OK" != "true" ]; then
  echo "npm ci failed after 3 attempts, giving up."
  exit 1
fi
npx prisma generate
mkdir -p tmp
date > tmp/restart.txt
