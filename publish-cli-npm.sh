#!/usr/bin/env bash

set -Eeuo pipefail

readonly REPOSITORY_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly CLI_DIRECTORY="${REPOSITORY_ROOT}/packages/agenthub-cli"
readonly REGISTRY_URL="https://registry.npmjs.org/"
readonly PNPM_VERSION="10.11.0"
readonly MAX_PUBLISH_ATTEMPTS="${MAX_PUBLISH_ATTEMPTS:-3}"
readonly NPM_FETCH_TIMEOUT_MS="${NPM_FETCH_TIMEOUT_MS:-1800000}"
readonly VERIFY_ATTEMPTS="${VERIFY_ATTEMPTS:-12}"
readonly VERIFY_DELAY_SECONDS="${VERIFY_DELAY_SECONDS:-5}"

DRY_RUN=false
SKIP_TESTS=false
DAEMON_WAS_ACTIVE=false

usage() {
  cat <<'EOF'
用法：./publish-cli-npm.sh [--dry-run] [--skip-tests]

发布 packages/agenthub-cli 到 npm，并验证当前版本已成为 latest。
大包上传的 fetch timeout 默认提高到 30 分钟，可通过 NPM_FETCH_TIMEOUT_MS 调整。

凭据读取顺序：
  1. 当前进程的 NPM_TOKEN
  2. ${NPM_CONFIG_USERCONFIG:-$HOME/.npmrc} 中 registry.npmjs.org 的 _authToken

选项：
  --dry-run     完成鉴权、版本、构建和测试检查，但不发布
  --skip-tests  跳过 CLI 单元测试（仍会构建）
  -h, --help    显示帮助
EOF
}

log() {
  printf '[cli-release] %s\n' "$*"
}

fail() {
  printf '[cli-release] 错误：%s\n' "$*" >&2
  exit 1
}

run_pnpm() {
  npx --yes "pnpm@${PNPM_VERSION}" "$@"
}

read_package_field() {
  node -e 'const value=require(process.argv[1]); console.log(value[process.argv[2]])' \
    "${CLI_DIRECTORY}/package.json" "$1"
}

load_npm_token() {
  if [[ -n "${NPM_TOKEN:-}" ]]; then
    return
  fi

  local user_config="${NPM_CONFIG_USERCONFIG:-${HOME}/.npmrc}"
  [[ -r "${user_config}" ]] || fail "未设置 NPM_TOKEN，且无法读取 ${user_config}"

  NPM_TOKEN="$({
    sed -n 's#^[[:space:]]*//registry\.npmjs\.org/:_authToken[[:space:]]*=[[:space:]]*##p' "${user_config}" || true
  } | tail -n 1 | tr -d '\r')"
  [[ -n "${NPM_TOKEN}" ]] || fail "${user_config} 中没有 npm registry token"
  [[ "${NPM_TOKEN}" != '\${NPM_TOKEN}' ]] || fail "${user_config} 只包含 NPM_TOKEN 占位符"
  export NPM_TOKEN
}

npm_registry() {
  npm --registry="${REGISTRY_URL}" "$@"
}

published_version() {
  npm_registry view "$1@$2" version 2>/dev/null || true
}

verify_latest() {
  local package_name="$1"
  local package_version="$2"
  local attempt latest=""

  for ((attempt = 1; attempt <= VERIFY_ATTEMPTS; attempt += 1)); do
    latest="$(npm_registry view "${package_name}" dist-tags.latest 2>/dev/null || true)"
    if [[ "${latest}" == "${package_version}" ]] && \
       [[ "$(published_version "${package_name}" "${package_version}")" == "${package_version}" ]]; then
      log "npm 校验通过：${package_name}@${package_version}（latest）"
      return 0
    fi
    log "等待 npm 元数据同步（${attempt}/${VERIFY_ATTEMPTS}，当前 latest=${latest:-不可见}）"
    sleep "${VERIFY_DELAY_SECONDS}"
  done

  fail "发布命令已结束，但 npm latest 尚未指向 ${package_name}@${package_version}"
}

record_process_state() {
  command -v agenthub >/dev/null 2>&1 || return 0
  log '发布前 daemon 状态：'
  agenthub daemon status || true
  agenthub daemon list || true
  ps -eo pid,ppid,stat,etime,rss,cmd | \
    rg 'agenthub|codex --agenthub|codex app-server --listen stdio|daemon start-sync' || true
}

stop_daemon_for_build() {
  command -v systemctl >/dev/null 2>&1 || return 0
  if systemctl --user is-active --quiet agenthub-daemon.service; then
    DAEMON_WAS_ACTIVE=true
    log '停止 systemd 托管的 agenthub daemon，避免构建时加载到一半更新的 bundle'
    systemctl --user stop agenthub-daemon.service
  fi
}

restore_daemon() {
  if [[ "${DAEMON_WAS_ACTIVE}" == true ]]; then
    log '恢复 systemd 托管的 agenthub daemon'
    systemctl --user start agenthub-daemon.service || true
  fi
}

for argument in "$@"; do
  case "${argument}" in
    --dry-run) DRY_RUN=true ;;
    --skip-tests) SKIP_TESTS=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; fail "未知参数：${argument}" ;;
  esac
done

[[ "${MAX_PUBLISH_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]] || fail 'MAX_PUBLISH_ATTEMPTS 必须是正整数'
[[ "${NPM_FETCH_TIMEOUT_MS}" =~ ^[1-9][0-9]*$ ]] || fail 'NPM_FETCH_TIMEOUT_MS 必须是正整数'
[[ "${VERIFY_ATTEMPTS}" =~ ^[1-9][0-9]*$ ]] || fail 'VERIFY_ATTEMPTS 必须是正整数'
[[ "${VERIFY_DELAY_SECONDS}" =~ ^[0-9]+$ ]] || fail 'VERIFY_DELAY_SECONDS 必须是非负整数'
[[ -f "${CLI_DIRECTORY}/package.json" ]] || fail '找不到 CLI package.json'

readonly PACKAGE_NAME="$(read_package_field name)"
readonly PACKAGE_VERSION="$(read_package_field version)"

load_npm_token
NPM_ACCOUNT="$(npm_registry whoami 2>/dev/null)" || fail 'npm Token 无效或无权访问 registry'
readonly NPM_ACCOUNT
log "npm 鉴权通过：${NPM_ACCOUNT}"
log "准备发布 ${PACKAGE_NAME}@${PACKAGE_VERSION}"

if [[ "$(published_version "${PACKAGE_NAME}" "${PACKAGE_VERSION}")" == "${PACKAGE_VERSION}" ]]; then
  verify_latest "${PACKAGE_NAME}" "${PACKAGE_VERSION}"
  log '该版本已存在，无需重复发布'
  exit 0
fi

record_process_state
stop_daemon_for_build
trap restore_daemon EXIT

log '构建 CLI'
run_pnpm --filter "${PACKAGE_NAME}" build

if [[ "${SKIP_TESTS}" != true ]]; then
  log '运行 CLI 单元测试'
  run_pnpm --filter "${PACKAGE_NAME}" exec vitest run --project unit
fi

if [[ "${DRY_RUN}" == true ]]; then
  log 'dry-run 完成：未执行 npm publish'
  exit 0
fi

for ((attempt = 1; attempt <= MAX_PUBLISH_ATTEMPTS; attempt += 1)); do
  log "上传到 npm（${attempt}/${MAX_PUBLISH_ATTEMPTS}）"
  if (
    cd "${CLI_DIRECTORY}"
    npm_config_fetch_timeout="${NPM_FETCH_TIMEOUT_MS}" run_pnpm publish \
      --registry "${REGISTRY_URL}" --tag latest --access public \
      --no-git-checks --ignore-scripts
  ); then
    break
  fi

  if [[ "$(published_version "${PACKAGE_NAME}" "${PACKAGE_VERSION}")" == "${PACKAGE_VERSION}" ]]; then
    log '发布命令返回失败，但 registry 已存在该版本；转入一致性校验'
    break
  fi

  ((attempt < MAX_PUBLISH_ATTEMPTS)) || fail "连续 ${MAX_PUBLISH_ATTEMPTS} 次发布失败"
  log '上传失败，5 秒后重试'
  sleep 5
done

verify_latest "${PACKAGE_NAME}" "${PACKAGE_VERSION}"
log 'CLI npm 发布完成'
