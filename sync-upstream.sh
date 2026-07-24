#!/usr/bin/env bash
set -euo pipefail

BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" != "master" ]; then
  echo "当前分支: $BRANCH"
  echo "此脚本需在 master 分支上运行，请先切换分支。"
  exit 1
fi

echo ">>> 拉取上游更新..."
git fetch upstream

echo ">>> 合并 upstream/master 到当前 master 分支..."
git merge upstream/main

echo ">>> 完成。如有冲突请手动解决后执行 git commit。"
