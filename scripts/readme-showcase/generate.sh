#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTPUT_DIR="${PROJECT_DIR}/docs/assets/readme/showcase"
SCREEN_DIR="${OUTPUT_DIR}/screens"
PHONE_DIR="${OUTPUT_DIR}/phones"
FRAME_SOURCE="${PROJECT_DIR}/design/phone.png"
FRAME_OVERLAY="${OUTPUT_DIR}/phone-frame-overlay.png"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TEMP_DIR}"' EXIT

pages=(
  welcome
  authorization
  devices
  sessions
  new-session
  conversation
  tools
  files
  transfers
  git-workspace
  git-graph
  artifacts
  secure-share
  usage
  settings
  changelog
)

mkdir -p "${SCREEN_DIR}" "${PHONE_DIR}"

# The silver hardware source already has a transparent screen opening.
# Resize it once, then let the browser place deterministic HTML/CSS
# product pages behind that opening.
convert "${FRAME_SOURCE}" \
  -resize 1080x2338! \
  "${FRAME_OVERLAY}"

for page in "${pages[@]}"; do
  for theme in dark light; do
    screen_png="${TEMP_DIR}/${page}-${theme}-screen.png"
    phone_png="${TEMP_DIR}/${page}-${theme}-phone.png"
    screen_webp="${SCREEN_DIR}/${page}-${theme}.webp"
    phone_webp="${PHONE_DIR}/${page}-${theme}.webp"

    google-chrome \
      --headless \
      --no-sandbox \
      --disable-gpu \
      --hide-scrollbars \
      --force-device-scale-factor=1 \
      --window-size=1080,2338 \
      --screenshot="${screen_png}" \
      "file://${SCRIPT_DIR}/mobile.html?page=${page}&theme=${theme}" >/dev/null 2>&1

    google-chrome \
      --headless \
      --no-sandbox \
      --disable-gpu \
      --hide-scrollbars \
      --force-device-scale-factor=1 \
      --virtual-time-budget=1200 \
      --window-size=1080,2338 \
      --screenshot="${phone_png}" \
      "file://${SCRIPT_DIR}/composite.html?page=${page}&theme=${theme}" >/dev/null 2>&1

    convert "${screen_png}" -strip -quality 88 "${screen_webp}"
    convert "${phone_png}" -strip -quality 88 "${phone_webp}"
  done
done

identify "${FRAME_OVERLAY}" "${SCREEN_DIR}"/*.webp "${PHONE_DIR}"/*.webp
