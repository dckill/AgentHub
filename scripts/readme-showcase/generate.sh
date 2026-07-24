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

showcases=(
  "设备页面-亮.jpg|devices-light"
  "设备页面-暗.jpg|devices-dark"
  "会话页面-暗.jpg|sessions-dark"
  "新建会话-亮.jpg|new-session-light"
  "新建会话-暗.jpg|new-session-dark"
  "对话页面-亮.jpg|conversation-light"
  "对话页面-暗.jpg|conversation-dark"
  "对话页面-对话折叠.jpg|conversation-collapsed-dark"
  "文件管理-暗.jpg|files-dark"
  "文件查看-暗.jpg|file-preview-dark"
  "Git管理-亮.jpg|git-light"
  "Git管理-暗.jpg|git-dark"
  "Git-diff.jpg|git-diff-light"
  "设置页面-亮.jpg|settings-light"
  "设置页面-暗.jpg|settings-dark"
)

mkdir -p "${SCREEN_DIR}" "${PHONE_DIR}"

convert "${FRAME_SOURCE}" \
  -resize 1080x2337! \
  "${FRAME_OVERLAY}"

for showcase in "${showcases[@]}"; do
  source_name="${showcase%%|*}"
  slug="${showcase##*|}"
  source_image="${SCREEN_DIR}/${source_name}"
  phone_webp="${PHONE_DIR}/${slug}.webp"
  fitted_screen="${TEMP_DIR}/${slug}-fitted.png"
  composed_phone="${TEMP_DIR}/${slug}-phone.png"

  identify "${source_image}" | rg -q 'JPEG 1080x2376 '

  convert "${source_image}" \
    -resize x1580 \
    -gravity center \
    -crop 674x1580+0+0 \
    +repage \
    "${fitted_screen}"

  convert -size 1080x2337 xc:none \
    "${fitted_screen}" -geometry +204+355 -composite \
    "${FRAME_OVERLAY}" -composite \
    "${composed_phone}"

  convert "${composed_phone}" \
    -strip \
    -quality 90 \
    "${phone_webp}"
done

identify "${FRAME_OVERLAY}" "${SCREEN_DIR}"/*.jpg "${PHONE_DIR}"/*.webp
