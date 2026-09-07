#!/usr/bin/env bash
# Port map for a worktree that runs its OWN emulator suite.
#
# Only one process can own a port, so when two checkouts both start the default
# suite the second one silently talks to the first one's functions and new
# callables come back 404 (see docs: "worktree emulator collision"). This file
# is the single place the alternative ports are written down; firebase.solo.json
# holds the mirror image of it for the emulators themselves.
#
# Suites in use on this machine:
#   default  firebase.json       auth 9099  firestore 8081  functions 5001
#   alt      firebase.alt.json   auth 9109  firestore 8091  functions 5011
#   solo     firebase.solo.json  auth 9119  firestore 8101  functions 5021
#
# Usage:
#   set -a; source env/ports.solo.sh; set +a   # then run anything
# or just use the *:solo npm scripts, which source it for you.

export AGORA_PROJECT_ID="${AGORA_PROJECT_ID:-freedi-test}"
export AGORA_REGION="${AGORA_REGION:-me-west1}"

# --- hosts the e2e/seed/preflight scripts dial ---------------------------------
export AGORA_AUTH_HOST=http://localhost:9119
export AGORA_FIRESTORE_HOST=http://localhost:8101
export AGORA_FUNCTIONS_HOST=http://localhost:5021
export AGORA_VITE_HOST=http://localhost:3029

# --- what the browser bundle connects to (read in apps/agora/src/lib/firebase.ts)
export VITE_EMULATOR_AUTH_PORT=9119
export VITE_EMULATOR_FIRESTORE_PORT=8101
export VITE_EMULATOR_FUNCTIONS_PORT=5021
export VITE_EMULATOR_STORAGE_PORT=9219
export VITE_EMULATOR_DATABASE_PORT=9020

# --- what the Admin SDK (seed scripts, functions shell) connects to ------------
export FIRESTORE_EMULATOR_HOST=localhost:8101
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9119
export FIREBASE_STORAGE_EMULATOR_HOST=localhost:9219
export FIREBASE_DATABASE_EMULATOR_HOST=localhost:9020

# --- vite ----------------------------------------------------------------------
export AGORA_VITE_PORT=3029
