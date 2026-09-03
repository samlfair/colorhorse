#!/usr/bin/env bash
#
# run-container.sh
# Starts (or attaches to) the project's devcontainer from a plain terminal,
# equivalent to VS Code's "Reopen in Container".
#
# Usage:
#   ./run-container.sh              # start (if needed) and open a shell
#   ./run-container.sh --rebuild    # rebuild without cache, then open a shell
#   ./run-container.sh -- <cmd>     # run a one-off command instead of a shell

set -euo pipefail

# --- Config -----------------------------------------------------------------
# Path to the folder containing .devcontainer/ (edit if you run this from
# somewhere other than the project root).
WORKSPACE_FOLDER="$(pwd)"
CONTAINER_USER="node"
SHELL_CMD="bash"

# --- Helpers ------------------------------------------------------------------
err()  { echo "❌ $*" >&2; }
info() { echo "▶ $*"; }

# --- Pre-flight checks --------------------------------------------------------

# 1. devcontainer CLI installed?
if ! command -v devcontainer >/dev/null 2>&1; then
  err "devcontainer CLI not found. Install it with: npm install -g @devcontainers/cli"
  exit 1
fi

# 2. Docker running?
if ! docker info >/dev/null 2>&1; then
  err "Docker isn't running. Start Docker Desktop and try again."
  exit 1
fi

# 3. Are we in (or above) a folder with .devcontainer/?
if [ ! -d "$WORKSPACE_FOLDER/.devcontainer" ]; then
  err "No .devcontainer/ found in $WORKSPACE_FOLDER"
  err "cd into your project root (the one containing .devcontainer/) and try again."
  exit 1
fi

# --- Parse args -----------------------------------------------------------
REBUILD=false
RUN_CMD=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --rebuild)
      REBUILD=true
      shift
      ;;
    --)
      shift
      RUN_CMD=("$@")
      break
      ;;
    *)
      err "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# --- Build/start the container ----------------------------------------------
UP_ARGS=(up --workspace-folder "$WORKSPACE_FOLDER")
if [ "$REBUILD" = true ]; then
  info "Rebuilding without cache — this will take a minute..."
  UP_ARGS+=(--remove-existing-container --build-no-cache)
fi

info "Starting devcontainer..."
if ! devcontainer "${UP_ARGS[@]}"; then
  err "devcontainer up failed. Common causes:"
  err "  - Docker Desktop not fully started yet (wait a few seconds and retry)"
  err "  - A build error in Dockerfile or postCreateCommand (check output above)"
  exit 1
fi

# --- Attach ---------------------------------------------------------------
if [ "${#RUN_CMD[@]}" -gt 0 ]; then
  info "Running: ${RUN_CMD[*]}"
  # Don't let a failed one-off command (e.g. a failed git push) stop us from
  # still dropping into a shell below.
  devcontainer exec --workspace-folder "$WORKSPACE_FOLDER" "${RUN_CMD[@]}" || \
    err "Command exited with an error (see above). Dropping into a shell anyway..."
fi

info "Opening shell..."
devcontainer exec --workspace-folder "$WORKSPACE_FOLDER" "$SHELL_CMD"