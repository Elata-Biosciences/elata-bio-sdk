#!/usr/bin/env bash
# ai-test.sh — AI-based documentation quality tests
#
# Runs 5 prompt scenarios through the published docs and verifies the output
# against working reference code. Claude runs from /tmp so it has no file
# access to the repo — only what we pipe in.
#
# Usage:   ./scripts/ai-test.sh          (or: ./run.sh ai-test)
# Output:  scripts/ai-test-results/

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_DIR="$REPO_ROOT/external/docs-site"
RESULTS_DIR="$REPO_ROOT/scripts/ai-test-results"

mkdir -p "$RESULTS_DIR"

# ── Preflight ─────────────────────────────────────────────────────────────────

if ! command -v claude &>/dev/null; then
  echo "Error: claude CLI not found." >&2
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

# App-dev docs only — no maintainer pages
DOC_FILES=$(find "$DOCS_DIR" -name "*.mdx" ! -path "*/maintainers/*" | sort)

build_doc_context() {
  for f in $DOC_FILES; do
    echo "=== FILE: $f ==="
    echo ""
    cat "$f"
    echo ""
  done
}

# Run claude in /tmp so file tools find nothing in the repo
call_claude() {
  local content="$1"
  ( cd /tmp && echo "$content" | claude -p "Answer based solely on the documentation or code provided in the input." )
}

# Colours
c_reset=$'\033[0m'
c_bold=$'\033[1m'
c_green=$'\033[32m'
c_red=$'\033[31m'
c_cyan=$'\033[36m'
c_yellow=$'\033[33m'

pass_count=0
fail_count=0
declare -a summary=()

# run_test NAME PROMPT REFERENCE_FILE RUBRIC
run_test() {
  local name="$1"
  local prompt="$2"
  local reference_file="$3"
  local rubric="$4"

  local out_file="$RESULTS_DIR/${name}-output.md"
  local verify_file="$RESULTS_DIR/${name}-verify.md"

  printf "\n${c_bold}${c_cyan}==> Test: %s${c_reset}\n" "$name"

  # Step 1: generate
  printf "    Generating...\n"
  local generation_input
  generation_input="$(build_doc_context)

=== END OF DOCUMENTATION ===

$prompt"

  local generated
  generated=$(call_claude "$generation_input")
  echo "$generated" > "$out_file"

  # Step 2: verify against reference
  printf "    Verifying...\n"
  local reference
  reference=$(cat "$reference_file")

  local verify_input
  verify_input="You are a strict code reviewer.

=== REFERENCE (working implementation from the SDK) ===

$reference

=== GENERATED (developer output after reading only the docs) ===

$generated

=== RUBRIC ===

Score each item PASS or FAIL with a one-line reason. Be strict — if something
is absent or wrong, it is a FAIL.

$rubric

End your response with exactly one of these lines:
OVERALL PASS
OVERALL FAIL"

  local verification
  verification=$(call_claude "$verify_input")
  echo "$verification" > "$verify_file"

  # Extract overall result
  if echo "$verification" | grep -q "^OVERALL PASS"; then
    printf "    ${c_green}PASS${c_reset}\n"
    summary+=("${c_green}PASS${c_reset}  $name")
    (( pass_count++ )) || true
  else
    printf "    ${c_red}FAIL${c_reset} — see $verify_file\n"
    summary+=("${c_red}FAIL${c_reset}  $name")
    (( fail_count++ )) || true
  fi
}

# ── Doc context (built once, reused) ─────────────────────────────────────────

DOC_CONTEXT=$(build_doc_context)

# ── Test A: rPPG from scratch ─────────────────────────────────────────────────

run_test "A-rppg" \
"I want to add camera-based heart rate monitoring to my existing Vite + React app.
I found the Elata SDK. Show me exactly how to do it — install steps, full code,
and anything I need to know about browser requirements or cleanup." \
"$REPO_ROOT/packages/create-elata-demo/templates/rppg-demo/src/App.tsx" \
"1. Correct package: installs @elata-biosciences/rppg-web (not eeg-web or eeg-web-ble)
2. Entry point: uses createRppgSession() as the session API
3. Video element: creates or references an HTMLVideoElement and passes it to createRppgSession
4. Camera access: calls navigator.mediaDevices.getUserMedia before starting the session
5. Cleanup: calls session.stop() or session.dispose() on unmount or component exit
6. No hallucination: does not reference API methods not present in the reference code"

# ── Test B: BLE from scratch ──────────────────────────────────────────────────

run_test "B-ble" \
"I have a Muse S headset and an existing Vite + React app running on localhost.
Show me exactly how to stream live EEG data into my app using the Elata SDK.
Include all install steps, the full code, and any platform requirements." \
"$REPO_ROOT/packages/eeg-web-ble/README.md" \
"1. Both packages: installs both @elata-biosciences/eeg-web and @elata-biosciences/eeg-web-ble
2. WASM init order: calls initEegWasm() before AthenaWasmDecoder is instantiated
3. Connect API: uses startStreaming() as the primary connect method
4. Platform constraint: states Chrome or Edge required, Safari not supported
5. Secure context: mentions https:// or localhost requirement
6. Cleanup: calls stop() or disconnect() on unmount or exit
7. No hallucination: does not reference methods absent from the reference"

# ── Test C: EEG-only, no headset ─────────────────────────────────────────────

run_test "C-eeg-only" \
"I want to add EEG band power analysis to my Vite + React app but I don't have
a headset yet. Show me how to get the WASM runtime working and compute alpha
band powers from synthetic data." \
"$REPO_ROOT/packages/create-elata-demo/templates/eeg-demo/src/App.tsx" \
"1. Correct package: installs @elata-biosciences/eeg-web
2. WASM init: calls initEegWasm() before using analysis functions
3. band_powers usage: calls band_powers() with a Float32Array and sample rate
4. Vite WASM: mentions or addresses WASM asset serving (plugin or URL import)
5. No BLE required: does not require eeg-web-ble for this path
6. No hallucination: does not reference methods absent from the reference"

# ── Test D: Wrong door ────────────────────────────────────────────────────────

run_test "D-wrong-door" \
"I just cloned the Elata SDK repo from GitHub and want to build a demo app.
Where do I start?" \
"$REPO_ROOT/packages/create-elata-demo/README.md" \
"1. Correct entry point: directs toward create-elata-demo / pnpm create, not ./run.sh or repo internals
2. Does not suggest cloning: does not tell the developer to work inside the cloned repo as their app
3. Template guidance: mentions available templates (rppg-demo, eeg-demo) or the interactive chooser
4. No hallucination: does not invent commands or workflows not present in the reference"

# ── Test E: Channel extraction ────────────────────────────────────────────────

run_test "E-channel-extract" \
"I'm receiving HeadbandFrameV1 frames from BleTransport in my browser app.
How do I extract the AF7 channel data and pass it to band_powers()?" \
"$REPO_ROOT/packages/create-elata-demo/templates/eeg-demo/src/App.tsx" \
"1. Correct layout: describes frame.eeg.samples as [timeIdx][channelIdx] (outer = time, inner = channels)
2. Correct extraction: uses frame.eeg.samples.map(row => row[channelIdx]) — not frame.eeg.samples[channelIdx]
3. Correct channel index: identifies AF7 as index 1 (TP9=0, AF7=1, AF8=2, TP10=3)
4. Float32Array: wraps the extracted values in new Float32Array() before passing to band_powers
5. No hallucination: does not reference methods absent from the reference"

# ── Test F: Package selection ─────────────────────────────────────────────────

run_test "F-package-selection" \
"I want to add EEG to my browser app. I see there are two packages:
@elata-biosciences/eeg-web and @elata-biosciences/eeg-web-ble.
Which one do I need, and what is the difference between them?" \
"$REPO_ROOT/packages/eeg-web/README.md" \
"1. Correct split: explains eeg-web is for WASM/signal processing and eeg-web-ble is for Bluetooth transport
2. eeg-web-only path: states eeg-web alone is sufficient if no live headset is needed
3. BLE dependency: states eeg-web-ble requires eeg-web alongside it (not standalone)
4. Does not conflate: does not suggest eeg-web-ble is required for all EEG use cases
5. No hallucination: does not describe capabilities absent from the reference"

# ── Summary ───────────────────────────────────────────────────────────────────

printf "\n${c_bold}==============================${c_reset}\n"
printf "${c_bold} AI DOC TEST RESULTS${c_reset}\n"
printf "${c_bold}==============================${c_reset}\n\n"

for line in "${summary[@]}"; do
  printf "  %b\n" "$line"
done

printf "\n  %s passed, %s failed\n" "$pass_count" "$fail_count"
printf "  Results saved to %s\n\n" "$RESULTS_DIR"

if [[ "$fail_count" -gt 0 ]]; then
  exit 1
fi
