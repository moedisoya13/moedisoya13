#!/usr/bin/env bash
# Unpack the bundled engine into a work folder and give it a Python environment.
#
#   bash setup.sh WORKDIR                 copy engine + create WORKDIR/.venv (uv if present, else python -m venv)
#   bash setup.sh WORKDIR --no-venv       copy only (use an interpreter that already has requirements.txt)
#   bash setup.sh WORKDIR --mocap         also install requirements-mocap.txt (MediaPipe)
#
# Files that already exist in WORKDIR are kept (your edited template survives a second run);
# pass --force to overwrite them with the bundled copies.
set -euo pipefail

if [ $# -lt 1 ]; then sed -n '2,9p' "$0"; exit 2; fi
WORK=$1; shift
VENV=1; MOCAP=0; FORCE=0
for arg in "$@"; do
  case "$arg" in
    --no-venv) VENV=0 ;;
    --mocap) MOCAP=1 ;;
    --force) FORCE=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

ENGINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../engine" && pwd)"
mkdir -p "$WORK"
WORK="$(cd "$WORK" && pwd)"

copied=0; kept=0
while IFS= read -r -d '' src; do
  rel="${src#"$ENGINE"/}"
  dst="$WORK/$rel"
  if [ -e "$dst" ] && [ "$FORCE" -eq 0 ]; then
    kept=$((kept + 1))
  else
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    copied=$((copied + 1))
  fi
done < <(find "$ENGINE" -type f -not -name '*.pyc' -not -path '*/__pycache__/*' -print0)
echo "[setup] engine -> $WORK  ($copied files copied, $kept already there and kept)"

if [ "$VENV" -eq 1 ]; then
  if [ ! -x "$WORK/.venv/bin/python" ]; then
    if command -v uv >/dev/null 2>&1; then
      uv venv "$WORK/.venv" -p 3.13
    else
      python3 -m venv "$WORK/.venv"
    fi
  fi
  PY="$WORK/.venv/bin/python"
  REQS=(-r "$WORK/requirements.txt")
  if [ "$MOCAP" -eq 1 ]; then REQS+=(-r "$WORK/requirements-mocap.txt"); fi
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python "$PY" "${REQS[@]}"
  else
    "$PY" -m pip install "${REQS[@]}"
  fi
  echo "[setup] environment ready: $PY"
else
  echo "[setup] --no-venv: run the engine with an interpreter that has $WORK/requirements.txt installed"
fi
echo "[setup] next: <python> $(dirname "${BASH_SOURCE[0]}")/selftest.py $WORK"
