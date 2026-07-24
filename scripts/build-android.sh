#!/usr/bin/env bash
set -euo pipefail

# ── 配置 ──────────────────────────────────────────────────
APP_ENV="${APP_ENV:-production}"
export EXPO_PUBLIC_AGENTHUB_APP_VARIANT="$APP_ENV"
ARCHITECTURES="${ARCHITECTURES:-${AGENTHUB_ANDROID_ARCHITECTURES:-arm64-v8a}}"
BUILD_TYPE="${BUILD_TYPE:-release}"
NO_OTA="${NO_OTA:-false}"
PNPM_VERSION="${PNPM_VERSION:-10.11.0}"
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$PROJECT_ROOT/packages/agenthub-app"
ANDROID_DIR="$APP_DIR/android"
SERVER_URL="${EXPO_PUBLIC_AGENTHUB_SERVER_URL:-${AGENTHUB_SERVER_URL:-}}"
ARTIFACTS_DIR="${ANDROID_ARTIFACTS_DIR:-$PROJECT_ROOT/artifacts}"
ARTIFACT_PREFIX="${ANDROID_ARTIFACT_PREFIX:-agenthub}"
EXPO_USE_LEGACY_PACKAGING="${EXPO_USE_LEGACY_PACKAGING:-true}"
ANDROID_UPLOAD_KEYSTORE_INFO="${ANDROID_UPLOAD_KEYSTORE_INFO:-$HOME/.agenthub-credentials/android-upload-keystore/agenthub-upload-keystore-info.txt}"
PREBUILD_STAMP_FILE="$ANDROID_DIR/.agenthub-prebuild-stamp"
ANDROID_TREE_MUTATED=false
CURRENT_PREBUILD_STAMP=$(cat <<EOF
APP_ENV=$APP_ENV
NO_OTA=$NO_OTA
SERVER_URL=$SERVER_URL
ARCHITECTURES=$ARCHITECTURES
EXPO_USE_LEGACY_PACKAGING=$EXPO_USE_LEGACY_PACKAGING
EOF
)

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

restore_production_android_tree() {
    local exit_code=$?
    trap - EXIT

    if [ "$APP_ENV" = "production" ] || [ "$ANDROID_TREE_MUTATED" != "true" ]; then
        exit "$exit_code"
    fi

    warn "恢复 tracked Android 原生树为 Production canonical variant..."
    cd "$APP_DIR"
    rm -rf "$ANDROID_DIR"
    if APP_ENV=production EXPO_NO_OTA="$NO_OTA" run_pnpm --dir "$APP_DIR" exec expo prebuild --platform android; then
        rm -f "$PREBUILD_STAMP_FILE"
        ok "Android 原生树已恢复为 Production；Preview APK 仅保留在 artifacts/。"
    else
        warn "Android Production canonical tree 恢复失败。"
        if [ "$exit_code" -eq 0 ]; then
            exit_code=1
        fi
    fi

    exit "$exit_code"
}

resolve_pnpm() {
    if command -v pnpm &>/dev/null; then
        PNPM_CMD=(pnpm)
        return
    fi

    if command -v npx &>/dev/null; then
        PNPM_CMD=(npx -y "pnpm@$PNPM_VERSION")
        return
    fi

    fail "未找到 pnpm 或 npx。请安装 Node/npm，或安装 pnpm。"
}

run_pnpm() {
    "${PNPM_CMD[@]}" "$@"
}

artifact_safe_tag() {
    printf '%s' "$1" \
        | tr '[:upper:]' '[:lower:]' \
        | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

artifact_arch_tag() {
    if [ "$ARCHITECTURES" = "arm64-v8a" ]; then
        printf 'arm64'
    else
        artifact_safe_tag "$ARCHITECTURES"
    fi
}

# ── 参数解析 ──────────────────────────────────────────────
DO_CLEAN=false
DO_PREBUILD=false
SHOW_HELP=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --clean)     DO_CLEAN=true; shift ;;
        --prebuild)  DO_PREBUILD=true; shift ;;
        -h|--help)
            echo "用法: ./build-android.sh [选项]"
            echo ""
            echo "选项:"
            echo "  --clean     全量清理：删除 android/、CMake 缓存、Gradle 构建缓存"
            echo "  --prebuild  重新生成 android/（app.config.js 改动后使用）"
            echo "  -h, --help  显示帮助"
            echo ""
            echo "环境变量:"
            echo "  APP_ENV       变体: development|preview|production (默认: production)"
            echo "  BUILD_TYPE    类型: release|debug (默认: release)"
            echo "  ARCHITECTURES 架构: arm64-v8a,armeabi-v7a (默认: arm64-v8a)"
            echo "  NO_OTA        禁用 OTA 更新检查: true|false (默认: false)"
            echo "  PNPM_VERSION  未安装全局 pnpm 时由 npx 调用的版本 (默认: 10.11.0)"
            echo "  ANDROID_ARTIFACTS_DIR"
            echo "                Android APK 归档目录 (默认: 仓库根目录 artifacts/)"
            echo "  ANDROID_UPLOAD_KEYSTORE_INFO"
            echo "                Android 上传 keystore 信息文件 (默认: ~/.agenthub-credentials/android-upload-keystore/agenthub-upload-keystore-info.txt)"
            echo "  EXPO_PUBLIC_AGENTHUB_SERVER_URL / AGENTHUB_SERVER_URL"
            echo "                打包进 APK 的服务端地址，例如 https://agenthub.yzsd.asia:8443"
            echo ""
            echo "示例:"
            echo "  ./build-android.sh                           # 增量构建（最快）"
            echo "  ./build-android.sh --prebuild                # 重新 prebuild + 构建"
            echo "  ./build-android.sh --clean                   # 全量清理 + 构建"
            echo "  APP_ENV=development BUILD_TYPE=debug ./build-android.sh"
            echo "  EXPO_PUBLIC_AGENTHUB_SERVER_URL=https://agenthub.yzsd.asia:8443 APP_ENV=development BUILD_TYPE=debug ./build-android.sh"
            exit 0
            ;;
        *) warn "未知参数: $1"; shift ;;
    esac
done

resolve_pnpm

if [ -n "$SERVER_URL" ]; then
    export EXPO_PUBLIC_AGENTHUB_SERVER_URL="$SERVER_URL"
else
    warn "未设置 EXPO_PUBLIC_AGENTHUB_SERVER_URL/AGENTHUB_SERVER_URL；APK 将使用源码默认服务端地址。公网自托管构建请显式传入域名。"
fi

# ── 环境检查（仅首次或 --clean 时执行） ───────────────────
ENV_CHECK_FILE="$APP_DIR/.build-env-check"
NEED_ENV_CHECK=true
PNPM_ACTUAL_VERSION="$(run_pnpm -v 2>/dev/null || echo unknown)"

if [ -f "$ENV_CHECK_FILE" ] && [ "$DO_CLEAN" = false ]; then
    # 检查环境是否变化
    CURRENT_CHECK="${JAVA_HOME:-none}:${ANDROID_HOME:-none}:$(node -v):${PNPM_ACTUAL_VERSION}"
    SAVED_CHECK=$(cat "$ENV_CHECK_FILE" 2>/dev/null || echo "")
    if [ "$CURRENT_CHECK" = "$SAVED_CHECK" ]; then
        NEED_ENV_CHECK=false
    fi
fi

if [ "$NEED_ENV_CHECK" = true ]; then
    info "检查构建环境..."

    # JAVA_HOME
    if [ -z "${JAVA_HOME:-}" ]; then
        for candidate in "$HOME/.local/share/jdks/temurin-17" "$HOME/.jdk17"; do
            if [ -d "$candidate" ]; then
                export JAVA_HOME="$candidate"
                info "自动设置 JAVA_HOME=$JAVA_HOME"
                break
            fi
        done
    fi

    if [ -z "${JAVA_HOME:-}" ]; then
        fail "未设置 JAVA_HOME 且未找到 ~/.local/share/jdks/temurin-17 或 ~/.jdk17。请安装 JDK 17。"
    fi

    JAVA_VERSION=$("$JAVA_HOME/bin/java" -version 2>&1 | head -1 | grep -oP '\d+' | head -1)
    if [ "$JAVA_VERSION" -ne 17 ]; then
        warn "JDK 版本为 $JAVA_VERSION，推荐 JDK 17。Gradle 9.0.0 与 JDK 21 不兼容。"
    fi

    # ANDROID_HOME
    if [ -z "${ANDROID_HOME:-}" ]; then
        if [ -d "$HOME/Android/Sdk" ]; then
            export ANDROID_HOME="$HOME/Android/Sdk"
            info "自动设置 ANDROID_HOME=$ANDROID_HOME"
        else
            fail "未设置 ANDROID_HOME 且未找到 ~/Android/Sdk。请安装 Android SDK。"
        fi
    fi

    # Node.js
    if ! command -v node &>/dev/null; then
        fail "未找到 Node.js。需要 Node.js >= 20。"
    fi
    NODE_MAJOR=$(node -e "console.log(process.version.split('.')[0].replace('v',''))")
    if [ "$NODE_MAJOR" -lt 20 ]; then
        fail "Node.js 版本过低 (v$NODE_MAJOR)，需要 >= 20。"
    fi

    ok "环境检查通过: JDK ${JAVA_VERSION}, Node $(node -v), pnpm ${PNPM_ACTUAL_VERSION}"

    # 缓存环境检查结果
    echo "${JAVA_HOME:-none}:${ANDROID_HOME:-none}:$(node -v):${PNPM_ACTUAL_VERSION}" > "$ENV_CHECK_FILE"
fi

# ── 依赖安装 ──────────────────────────────────────────────
if [ ! -d "$PROJECT_ROOT/node_modules" ]; then
    info "安装项目依赖..."
    cd "$PROJECT_ROOT"
    run_pnpm install
fi

if [ "$APP_ENV" != "production" ]; then
    # Preview/development prebuild rewrites the tracked native package tree.
    # Always restore the repository's canonical Production projection, even
    # when Gradle or artifact verification exits early.
    ANDROID_TREE_MUTATED=true
fi
trap restore_production_android_tree EXIT

# ── 原生依赖预处理（仅检查缺失，不重复下载）───────────────
SKIA_LIBS="$APP_DIR/node_modules/@shopify/react-native-skia/libs/android"
if [ ! -d "$SKIA_LIBS" ] || [ -z "$(ls -A "$SKIA_LIBS" 2>/dev/null)" ]; then
    info "下载 Skia 预编译库..."
    cd "$APP_DIR"
    run_pnpm --dir "$APP_DIR" exec install-skia
fi

LIBSODIUM_PACKAGE_DIR="$APP_DIR/node_modules/@more-tech/react-native-libsodium/libsodium"
LIBSODIUM_BUILD="$LIBSODIUM_PACKAGE_DIR/build"
if [ ! -d "$LIBSODIUM_BUILD" ]; then
    info "解压 libsodium 预编译库..."
    LIBSODIUM_TGZ="$LIBSODIUM_PACKAGE_DIR/build.tgz"
    if [ -f "$LIBSODIUM_TGZ" ]; then
        mkdir -p "$LIBSODIUM_PACKAGE_DIR"
        tar -xzf "$LIBSODIUM_TGZ" -C "$LIBSODIUM_PACKAGE_DIR" --warning=no-unknown-keyword 2>/dev/null
    else
        fail "未找到 libsodium build.tgz: $LIBSODIUM_TGZ"
    fi
fi

if [ ! -f "$LIBSODIUM_BUILD/libsodium-android-armv8-a+crypto/lib/libsodium.so" ]; then
    fail "libsodium arm64 预编译库缺失: $LIBSODIUM_BUILD/libsodium-android-armv8-a+crypto/lib/libsodium.so"
fi

# ── 全量清理（--clean） ───────────────────────────────────
if [ "$DO_CLEAN" = true ]; then
    info "全量清理..."
    rm -rf "$ANDROID_DIR"
    rm -rf "$ANDROID_DIR/app/build" 2>/dev/null || true
    for module_dir in "$APP_DIR/node_modules"/*/android "$APP_DIR/node_modules/@"*/*/android; do
        cxx_dir="$module_dir/.cxx"
        if [ -d "$cxx_dir" ]; then
            rm -rf "$cxx_dir"
        fi
    done
    ok "清理完成"
fi

# ── Expo Prebuild ─────────────────────────────────────────
# 需要 prebuild 的情况：
# 1. --clean 或 --prebuild 显式指定
# 2. android/ 目录不存在
# 3. app.config.js 比当前 android/ 更新
NEED_PREBUILD=false

if [ "$DO_CLEAN" = true ] || [ "$DO_PREBUILD" = true ]; then
    NEED_PREBUILD=true
elif [ ! -d "$ANDROID_DIR" ]; then
    NEED_PREBUILD=true
    info "android/ 目录不存在，需要 prebuild"
elif [ "$APP_DIR/app.config.js" -nt "$ANDROID_DIR/app/build.gradle" ] 2>/dev/null; then
    NEED_PREBUILD=true
    info "app.config.js 已更新，需要重新 prebuild"
elif [ ! -f "$PREBUILD_STAMP_FILE" ] || [ "$(cat "$PREBUILD_STAMP_FILE" 2>/dev/null || true)" != "$CURRENT_PREBUILD_STAMP" ]; then
    NEED_PREBUILD=true
    info "Android prebuild 环境已变化，需要重新 prebuild"
elif find "$APP_DIR/plugins" -type f -newer "$ANDROID_DIR/app/build.gradle" | grep -q .; then
    NEED_PREBUILD=true
    info "Expo config plugin 已更新，需要重新 prebuild"
elif find "$APP_DIR/sources/assets/images" -maxdepth 1 \
    \( -name 'agenthub-splash-*.png' -o -name 'agenthub-icon*.png' \) \
    -newer "$ANDROID_DIR/app/build.gradle" | grep -q .; then
    NEED_PREBUILD=true
    info "Android 启动图/图标资源已更新，需要重新 prebuild"
fi

if [ "$NEED_PREBUILD" = true ]; then
    info "运行 expo prebuild (APP_ENV=$APP_ENV, NO_OTA=$NO_OTA)..."
    cd "$APP_DIR"
    rm -rf "$ANDROID_DIR"
    APP_ENV="$APP_ENV" EXPO_NO_OTA="$NO_OTA" run_pnpm --dir "$APP_DIR" exec expo prebuild --platform android
    printf '%s' "$CURRENT_PREBUILD_STAMP" > "$PREBUILD_STAMP_FILE"
    ok "Expo prebuild 完成"
else
    ok "android/ 目录已是最新，跳过 prebuild"
fi

# ── 清理 Metro 缓存（防止 JS bundle 使用过期缓存） ──────────
info "清理 Metro/Hermes 缓存..."
rm -rf /tmp/metro-* /tmp/haste-map-* /tmp/react-*
rm -rf "$APP_DIR/node_modules/.cache/metro" "$APP_DIR/node_modules/.cache/haste-map"
rm -rf "$ANDROID_DIR/app/build/generated/assets/react"
rm -rf "$ANDROID_DIR/app/build/generated/source/codegen"
ok "缓存清理完成"

# ── Gradle 构建 ───────────────────────────────────────────
if [ -n "${EXPO_PUBLIC_AGENTHUB_SERVER_URL:-}" ]; then
    info "APK 服务端地址: $EXPO_PUBLIC_AGENTHUB_SERVER_URL"
fi

info "开始 Gradle 构建 (APP_ENV=$APP_ENV, ARCH=$ARCHITECTURES, TYPE=$BUILD_TYPE)..."

cd "$ANDROID_DIR"

GRADLE_TASK="assemble${BUILD_TYPE^}"

read_keystore_info_field() {
    local field="$1"
    sed -n "s/^${field}: //p" "$ANDROID_UPLOAD_KEYSTORE_INFO" | tail -1
}

if [ "$BUILD_TYPE" = "release" ]; then
    if [ -z "${AGENTHUB_ANDROID_UPLOAD_STORE_FILE:-}" ] && [ -f "$ANDROID_UPLOAD_KEYSTORE_INFO" ]; then
        AGENTHUB_ANDROID_UPLOAD_STORE_FILE="$(read_keystore_info_field "Android Keystore File")"
        AGENTHUB_ANDROID_UPLOAD_STORE_PASSWORD="$(read_keystore_info_field "Android Keystore Password")"
        AGENTHUB_ANDROID_UPLOAD_KEY_ALIAS="$(read_keystore_info_field "Android Key Alias")"
        AGENTHUB_ANDROID_UPLOAD_KEY_PASSWORD="$(read_keystore_info_field "Android Key Password")"
    fi

    if [ -z "${AGENTHUB_ANDROID_UPLOAD_STORE_FILE:-}" ] ||
       [ -z "${AGENTHUB_ANDROID_UPLOAD_STORE_PASSWORD:-}" ] ||
       [ -z "${AGENTHUB_ANDROID_UPLOAD_KEY_ALIAS:-}" ] ||
       [ -z "${AGENTHUB_ANDROID_UPLOAD_KEY_PASSWORD:-}" ]; then
        fail "release 构建缺少 Android upload keystore 信息。请设置 AGENTHUB_ANDROID_UPLOAD_* 环境变量，或提供 ANDROID_UPLOAD_KEYSTORE_INFO=$ANDROID_UPLOAD_KEYSTORE_INFO。"
    fi

    if [ ! -f "$AGENTHUB_ANDROID_UPLOAD_STORE_FILE" ]; then
        fail "Android upload keystore 文件不存在: $AGENTHUB_ANDROID_UPLOAD_STORE_FILE"
    fi

    info "release 构建将使用 Android upload keystore: $AGENTHUB_ANDROID_UPLOAD_STORE_FILE"
fi

START_TIME=$(date +%s)

JAVA_HOME="$JAVA_HOME" \
APP_ENV="$APP_ENV" \
EXPO_NO_OTA="$NO_OTA" \
EXPO_PUBLIC_AGENTHUB_SERVER_URL="${EXPO_PUBLIC_AGENTHUB_SERVER_URL:-}" \
ORG_GRADLE_PROJECT_agenthubUploadStoreFile="${AGENTHUB_ANDROID_UPLOAD_STORE_FILE:-}" \
ORG_GRADLE_PROJECT_agenthubUploadStorePassword="${AGENTHUB_ANDROID_UPLOAD_STORE_PASSWORD:-}" \
ORG_GRADLE_PROJECT_agenthubUploadKeyAlias="${AGENTHUB_ANDROID_UPLOAD_KEY_ALIAS:-}" \
ORG_GRADLE_PROJECT_agenthubUploadKeyPassword="${AGENTHUB_ANDROID_UPLOAD_KEY_PASSWORD:-}" \
./gradlew "$GRADLE_TASK" \
    -Preact.nativeArchitectures="$ARCHITECTURES" \
    -PreactNativeArchitectures="$ARCHITECTURES" \
    -Pexpo.useLegacyPackaging="$EXPO_USE_LEGACY_PACKAGING" \
    --no-configuration-cache \
    -Dorg.gradle.java.installations.auto-download=false

END_TIME=$(date +%s)
BUILD_TIME=$((END_TIME - START_TIME))

# ── 输出结果 ──────────────────────────────────────────────
APK_DIR="$ANDROID_DIR/app/build/outputs/apk/$BUILD_TYPE"
APK_FILE=""

if [ "$BUILD_TYPE" = "release" ]; then
    for f in "$APK_DIR/app-release.apk" "$APK_DIR/app-release-unsigned.apk"; do
        if [ -f "$f" ]; then
            APK_FILE="$f"
            break
        fi
    done
else
    APK_FILE="$APK_DIR/app-debug.apk"
fi

echo ""
if [ -n "$APK_FILE" ] && [ -f "$APK_FILE" ]; then
    APK_SIZE=$(du -h "$APK_FILE" | cut -f1)
    ok "构建成功! (耗时 ${BUILD_TIME}s)"
    echo ""
    echo "  APK: $APK_FILE"
    echo "  大小: $APK_SIZE"

    # 输出 APK 信息
    AAPT=$(find "$ANDROID_HOME/build-tools" -name "aapt" -type f 2>/dev/null | sort -V | tail -1)
    APK_VERSION=""
    if [ -n "$AAPT" ] && [ -f "$AAPT" ]; then
        BADGING_LINE=$("$AAPT" dump badging "$APK_FILE" 2>/dev/null | sed -n '1p')
        PACKAGE=$(printf '%s\n' "$BADGING_LINE" | grep -oP "^package: name='\K[^']+" || true)
        VERSION=$(printf '%s\n' "$BADGING_LINE" | grep -oP " versionName='\K[^']+" || true)
        APK_VERSION="${VERSION:-unknown}"
        echo "  包名: $PACKAGE"
        echo "  版本: $VERSION"
    fi

    # 签名状态检查
    if echo "$APK_FILE" | grep -q "unsigned"; then
        warn "APK 未签名，安装前需要签名或使用 adb install --no-verify。"
    fi

    # Android 交付产物统一归档到仓库根目录 artifacts/。
    TIMESTAMP=$(date +%Y%m%d-%H%M)
    ARCH_TAG=$(artifact_arch_tag)
    ARTIFACT_BASENAME="${ARTIFACT_PREFIX}-${APP_ENV}-${ARCH_TAG}"
    if [ "$BUILD_TYPE" != "release" ]; then
        ARTIFACT_BASENAME="${ARTIFACT_BASENAME}-${BUILD_TYPE}"
    fi
    ARCHIVED_APK="$ARTIFACTS_DIR/${ARTIFACT_BASENAME}-${TIMESTAMP}.apk"
    LATEST_APK="$ARTIFACTS_DIR/${ARTIFACT_BASENAME}-latest.apk"

    mkdir -p "$ARTIFACTS_DIR"
    cp "$APK_FILE" "$ARCHIVED_APK"
    cp "$APK_FILE" "$LATEST_APK"
    ok "已归档到: ${ARCHIVED_APK#$PROJECT_ROOT/}"
    ok "已刷新 latest: ${LATEST_APK#$PROJECT_ROOT/}"
else
    fail "构建完成但未找到 APK 文件。检查 $APK_DIR"
fi
