#!/usr/bin/env bash
# One command for the scale baseline (task 3.0).
#
#   npm run scale:baseline                 # full + full + small, then writes docs/scale/
#   bash scripts/scale/run.sh small        # a single size, no report rewrite
#   SCALE_ONLY=vote bash scripts/scale/run.sh small   # one phase of a single size
#
# Starts the solo emulators (npm run emulators:solo) with the trace shim, runs
# the measurement once per size, and always stops them and checks the ports.
# Nothing here can reach production: FIRESTORE_EMULATOR_HOST comes from
# env/ports.solo.sh and baseline.ts refuses anything else.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=../../env/ports.solo.sh
set -a
source "$ROOT/env/ports.solo.sh"
set +a

PORTS=(9119 8101 5021 5022 4420 9219 9020 5023 8105 9319 9519 4520)
WORK_DIR="${TMPDIR:-/tmp}/freedi-scale-baseline"
OUT_DIR="$WORK_DIR/results"
ENV_LOCAL="$ROOT/functions/.env.local"
LOG_FILE="$WORK_DIR/emulators.log"
READY_TIMEOUT_S=180
STOP_TIMEOUT_S=90
EMULATORS_PID=""

mkdir -p "$OUT_DIR"

fail() {
	echo "[scale] $*" >&2
	exit 1
}

ports_in_use() {
	local busy=""
	for port in "${PORTS[@]}"; do
		if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
			busy="$busy $port"
		fi
	done
	echo "$busy"
}

stop_emulators() {
	if [ -n "$EMULATORS_PID" ] && kill -0 "$EMULATORS_PID" 2>/dev/null; then
		kill -INT -- "-$EMULATORS_PID" 2>/dev/null
		local waited=0
		while kill -0 "$EMULATORS_PID" 2>/dev/null && [ "$waited" -lt "$STOP_TIMEOUT_S" ]; do
			sleep 1
			waited=$((waited + 1))
		done
		if kill -0 "$EMULATORS_PID" 2>/dev/null; then
			kill -KILL -- "-$EMULATORS_PID" 2>/dev/null
		fi
	fi
	EMULATORS_PID=""
	rm -f "$ENV_LOCAL"
	rm -rf "$ROOT/.emulator-data-solo"
}

cleanup() {
	stop_emulators
	local busy
	busy="$(ports_in_use)"
	if [ -n "$busy" ]; then
		echo "[scale] WARNING: ports still in use:$busy" >&2
		exit 2
	fi
}
trap cleanup EXIT INT TERM

start_emulators() {
	local trace_dir="$1"
	[ -z "$(ports_in_use)" ] || fail "solo ports are busy:$(ports_in_use)"
	[ ! -e "$ENV_LOCAL" ] || fail "$ENV_LOCAL already exists; refusing to overwrite it"

	# Emulator-only overrides: no real AI, email or Sentry traffic during the run.
	cat >"$ENV_LOCAL" <<'ENV'
OPENAI_API_KEY=
GEMINI_API_KEY=
SYNTHESIS_LIVE_SYNTH_ENABLED=false
SYNTHESIS_CLUSTER_AWARE_POLARIZATION=false
SENTRY_DSN=
EMAIL_USER=
EMAIL_PASSWORD=
ENV

	set -m
	NODE_OPTIONS="--require=$ROOT/scripts/scale/trace-shim.cjs" \
		SCALE_TRACE_DIR="$trace_dir" \
		npm run emulators:solo >"$LOG_FILE" 2>&1 &
	EMULATORS_PID=$!
	set +m

	local waited=0
	until curl -sf "http://localhost:4420/emulators" 2>/dev/null | grep -q '"functions"'; do
		kill -0 "$EMULATORS_PID" 2>/dev/null || fail "emulators exited early; see $LOG_FILE"
		[ "$waited" -lt "$READY_TIMEOUT_S" ] || fail "emulators not ready in ${READY_TIMEOUT_S}s"
		sleep 2
		waited=$((waited + 2))
	done
	until grep -q "All emulators ready" "$LOG_FILE"; do
		kill -0 "$EMULATORS_PID" 2>/dev/null || fail "emulators exited early; see $LOG_FILE"
		[ "$waited" -lt "$READY_TIMEOUT_S" ] || fail "emulators not ready in ${READY_TIMEOUT_S}s"
		sleep 2
		waited=$((waited + 2))
	done
}

run_one() {
	local label="$1" size="$2"
	local trace_dir="$WORK_DIR/trace-$label"
	rm -rf "$trace_dir"
	mkdir -p "$trace_dir"
	echo "[scale] === run $label (size $size) ==="
	start_emulators "$trace_dir"
	SCALE_TRACE_DIR="$trace_dir" SCALE_OUT_DIR="$OUT_DIR" \
		npx tsx scripts/scale/baseline.ts "--label=$label" "--size=$size" ${SCALE_ONLY:+"--only=$SCALE_ONLY"}
	local status=$?
	stop_emulators
	sleep 2
	[ "$status" -eq 0 ] || fail "run $label failed (exit $status); see $LOG_FILE"
}

if [ "$#" -gt 0 ]; then
	run_one "$1" "$1"
else
	run_one run1 full
	run_one run2 full
	run_one small small
	SCALE_OUT_DIR="$OUT_DIR" npx tsx scripts/scale/report.ts || fail "report failed"
fi
echo "[scale] done"
