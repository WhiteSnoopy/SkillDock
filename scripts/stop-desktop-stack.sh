#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.runtime/desktop-stack"
PID_DIR="${RUNTIME_DIR}/pids"

API_PORT="${API_PORT:-2027}"
DESKTOP_PORT="${DESKTOP_PORT:-1420}"

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  if [[ ! -f "${pid_file}" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if kill -0 "${pid}" 2>/dev/null; then
    echo "[stack] stopping ${name} (PID ${pid})"
    kill "${pid}" 2>/dev/null || true
    sleep 1
    if kill -0 "${pid}" 2>/dev/null; then
      kill -9 "${pid}" 2>/dev/null || true
    fi
  fi
  rm -f "${pid_file}"
}

cleanup_port() {
  local port="$1"
  local pids
  pids="$(lsof -nP -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "[stack] cleaning port ${port} PID(s): ${pids}"
    kill ${pids} 2>/dev/null || true
    sleep 1
    local remain
    remain="$(lsof -nP -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${remain}" ]]; then
      kill -9 ${remain} 2>/dev/null || true
    fi
  fi
}

stop_pid_file "desktop" "${PID_DIR}/desktop.pid"
stop_pid_file "backend" "${PID_DIR}/backend.pid"

cleanup_port "${DESKTOP_PORT}"
cleanup_port "${API_PORT}"

echo "[stack] stopped"
