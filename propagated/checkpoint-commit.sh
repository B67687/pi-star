#!/usr/bin/env bash
# Managed-By: AI-Prompting-Library
# =============================================================================
# checkpoint-commit.sh - Create a verified local checkpoint commit safely
# =============================================================================

set -euo pipefail

STAGE_ALL=true
DRY_RUN=false
MESSAGE=""
DETAIL=""

usage() {
  cat <<"USAGE"
Usage: ./checkpoint-commit.sh -m "summary" [options]

Create a local checkpoint commit after a verified phase.

Options:
  -m, --message TEXT   Commit summary (required)
  -d, --detail TEXT    Optional commit body paragraph
  --no-stage           Commit only what is already staged
  --show-diff          Show staged diff summary before committing
  --dry-run            Validate and stage, but do not commit
  -h, --help           Show this help
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      MESSAGE="${2:-}"
      shift 2
      ;;
    -d|--detail)
      DETAIL="${2:-}"
      shift 2
      ;;
    --no-stage)
      STAGE_ALL=false
      shift
      ;;
    --show-diff)
      SHOW_DIFF=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$MESSAGE" ]]; then
  echo "ERROR: commit message is required." >&2
  usage >&2
  exit 2
fi

if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "ERROR: not inside a git repository." >&2
  exit 1
fi

# Expected identity: env var, or auto-detect from global git config only.
# Using --global (not git var, not local config) catches repo-local
# overrides where the local identity differs from your global privacy identity.
if [[ -n "${EXPECTED_GIT_IDENT:-}" ]]; then
  EXPECTED_IDENT="$EXPECTED_GIT_IDENT"
else
  EXPECTED_NAME="$(git config --global --get user.name 2>/dev/null || true)"
  EXPECTED_EMAIL="$(git config --global --get user.email 2>/dev/null || true)"
  if [[ -z "$EXPECTED_NAME" || -z "$EXPECTED_EMAIL" ]]; then
    echo "ERROR: set user.name and user.email in global git config, or set EXPECTED_GIT_IDENT." >&2
    exit 1
  fi
  EXPECTED_IDENT="$EXPECTED_NAME <$EXPECTED_EMAIL>"
fi

AUTHOR_IDENT="$(git var GIT_AUTHOR_IDENT | sed "s/ [0-9][0-9]* [+-][0-9][0-9][0-9][0-9]$//")"
COMMITTER_IDENT="$(git var GIT_COMMITTER_IDENT | sed "s/ [0-9][0-9]* [+-][0-9][0-9][0-9][0-9]$//")"

if [[ "$AUTHOR_IDENT" != "$EXPECTED_IDENT" ]]; then
  echo "ERROR: unexpected author identity: $AUTHOR_IDENT" >&2
  exit 1
fi

if [[ "$COMMITTER_IDENT" != "$EXPECTED_IDENT" ]]; then
  echo "ERROR: unexpected committer identity: $COMMITTER_IDENT" >&2
  exit 1
fi

if git diff --name-only --diff-filter=U | grep -q .; then
  echo "ERROR: resolve merge conflicts before checkpoint committing." >&2
  git diff --name-only --diff-filter=U >&2
  exit 1
fi

if [[ "$STAGE_ALL" == true ]]; then
  git add -A
fi

if git diff --cached --quiet; then
  echo "ERROR: no staged changes to commit." >&2
  exit 1
fi

echo "Checkpoint commit review:"
git status --short

if [[ "$SHOW_DIFF" == true ]]; then
  echo
  git diff --cached --stat
fi

if [[ "$DRY_RUN" == true ]]; then
  echo
  echo "DRY RUN: staged checkpoint is ready, no commit created."
  exit 0
fi

if [[ -n "$DETAIL" ]]; then
  git commit -m "$MESSAGE" -m "$DETAIL"
else
  git commit -m "$MESSAGE"
fi
