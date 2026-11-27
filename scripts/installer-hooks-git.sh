#!/bin/sh
# Hooks git locaux : refusent avant le push ce que la CI refuserait.
# - commit-msg : hook conventional-commit de la Fabnum (dnum-mi/fabnum-cicd), épinglé au même SHA
#   que les workflows fabnum-cicd d'ADA et vérifié par son empreinte ;
# - pre-commit : gitleaks, par pre-commit (.pre-commit-config.yaml), s'il est installé.
# Usage : sh scripts/installer-hooks-git.sh (depuis le dépôt ou l'un de ses worktrees).
set -eu

FABNUM_SHA=fcdf649638c865c9b6fb85df12bf25fa9e89d8c6 # v0.25.5
COMMIT_MSG_SHA256=62c234d78a28a9a47e80b8e063c179970719bfdda44cbd951a40e3ab01477158

hooks_dir=$(git rev-parse --git-path hooks)
mkdir -p "$hooks_dir"
downloaded=$(mktemp)
trap 'rm -f "$downloaded"' EXIT

curl -fsSL -o "$downloaded" \
  "https://raw.githubusercontent.com/dnum-mi/fabnum-cicd/$FABNUM_SHA/git-hooks/commit-msg/conventional-commit"
echo "$COMMIT_MSG_SHA256  $downloaded" | shasum -a 256 -c - > /dev/null
install -m 0755 "$downloaded" "$hooks_dir/commit-msg"
echo "commit-msg (Conventional Commits, Fabnum) installé dans $hooks_dir"

if command -v pre-commit > /dev/null 2>&1; then
  pre-commit install --hook-type pre-commit
else
  echo "pre-commit absent : gitleaks ne tournera qu'en CI (pipx install pre-commit pour l'ajouter)"
fi
