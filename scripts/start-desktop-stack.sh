#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${ROOT_DIR}/.runtime/desktop-stack"
LOG_DIR="${RUNTIME_DIR}/logs"
PID_DIR="${RUNTIME_DIR}/pids"

load_env_file() {
  local env_file="$1"
  if [[ -f "${env_file}" ]]; then
    echo "[stack] loading env: ${env_file}"
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
  fi
}

load_env_file "${ROOT_DIR}/.env.local"
load_env_file "${ROOT_DIR}/.env"

API_HOST="${API_HOST:-127.0.0.1}"
API_PORT="${API_PORT:-2027}"
DESKTOP_HOST="${DESKTOP_HOST:-127.0.0.1}"
DESKTOP_PORT="${DESKTOP_PORT:-1420}"

API_HEALTH_URL="${API_HEALTH_URL:-http://${API_HOST}:${API_PORT}/api/health}"
DESKTOP_HEALTH_URL="${DESKTOP_HEALTH_URL:-http://${DESKTOP_HOST}:${DESKTOP_PORT}}"
DESKTOP_STABLE_SECONDS="${DESKTOP_STABLE_SECONDS:-12}"

BACKEND_CMD="${BACKEND_CMD:-node ${ROOT_DIR}/scripts/dev-local-api.mjs --host ${API_HOST} --port ${API_PORT}}"
DESKTOP_CMD="${DESKTOP_CMD:-pnpm tauri dev}"

DESKTOP_LOG_READY_PATTERN="${DESKTOP_LOG_READY_PATTERN:-}"
DESKTOP_LOG_READY_TIMEOUT="${DESKTOP_LOG_READY_TIMEOUT:-240}"
if [[ -z "${DESKTOP_LOG_READY_PATTERN}" && "${DESKTOP_CMD}" == *"tauri dev"* ]]; then
  DESKTOP_LOG_READY_PATTERN="target/debug/skilldock-desktop"
fi

mkdir -p "${LOG_DIR}" "${PID_DIR}"

BACKEND_LOG="${LOG_DIR}/backend.log"
DESKTOP_LOG="${LOG_DIR}/desktop.log"
BACKEND_PID_FILE="${PID_DIR}/backend.pid"
DESKTOP_PID_FILE="${PID_DIR}/desktop.pid"

if [[ -n "${SkillDock_GITHUB_TOKEN:-${GITHUB_TOKEN:-${GH_TOKEN:-}}}" ]]; then
  echo "[stack] GitHub token detected for release PR APIs"
else
  echo "[stack] GitHub token not detected (set SkillDock_GITHUB_TOKEN or GITHUB_TOKEN/GH_TOKEN)"
fi

stop_pid_file() {
  local name="$1"
  local pid_file="$2"
  if [[ ! -f "${pid_file}" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "${pid_file}")"
  if [[ -n "${pid}" ]] && kill -0 "${pid}" 2>/dev/null; then
    echo "[stack] stopping stale ${name} process (PID ${pid})"
    kill "${pid}" 2>/dev/null || true
    sleep 1
    if kill -0 "${pid}" 2>/dev/null; then
      echo "[stack] force killing stale ${name} process (PID ${pid})"
      kill -9 "${pid}" 2>/dev/null || true
      sleep 1
    fi
  fi
  rm -f "${pid_file}"
}

cleanup_port() {
  local port="$1"
  local pids
  pids="$(lsof -nP -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"

  if [[ -z "${pids}" ]]; then
    echo "[stack] port ${port} is free"
    return 0
  fi

  echo "[stack] port ${port} occupied by PID(s): ${pids}"
  echo "[stack] cleaning port ${port}..."
  kill ${pids} 2>/dev/null || true
  sleep 1

  local remain
  remain="$(lsof -nP -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${remain}" ]]; then
    echo "[stack] force killing PID(s): ${remain}"
    kill -9 ${remain} 2>/dev/null || true
    sleep 1
  fi
}

assert_port_free() {
  local port="$1"
  local pids
  pids="$(lsof -nP -tiTCP:${port} -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "[stack] ERROR: port ${port} is still occupied by PID(s): ${pids}" >&2
    return 1
  fi
}

start_process() {
  local name="$1"
  local cmd="$2"
  local pid_file="$3"
  local log_file="$4"

  echo "[stack] starting ${name}: ${cmd}"
  nohup /bin/zsh -lc "${cmd}" >"${log_file}" 2>&1 &
  local pid=$!
  echo "${pid}" >"${pid_file}"
  echo "[stack] ${name} PID: ${pid} (log: ${log_file})"
}

wait_http_ready() {
  local name="$1"
  local url="$2"
  local pid_file="$3"
  local log_file="$4"
  local retries="${5:-40}"

  for ((i=1; i<=retries; i++)); do
    if curl -fsS -m 2 "${url}" >/dev/null 2>&1; then
      echo "[stack] ${name} healthy: ${url}"
      return 0
    fi

    if [[ -f "${pid_file}" ]]; then
      local pid
      pid="$(cat "${pid_file}")"
      if ! kill -0 "${pid}" 2>/dev/null; then
        echo "[stack] ${name} process exited unexpectedly (PID ${pid})"
        echo "[stack] --- ${name} log ---"
        tail -n 120 "${log_file}" || true
        return 1
      fi
    fi

    sleep 1
  done

  echo "[stack] ${name} health timeout: ${url}"
  echo "[stack] --- ${name} log ---"
  tail -n 120 "${log_file}" || true
  return 1
}

wait_http_stable() {
  local name="$1"
  local url="$2"
  local seconds="$3"
  local pid_file="$4"
  local log_file="$5"

  for ((i=1; i<=seconds; i++)); do
    if ! curl -fsS -m 2 "${url}" >/dev/null 2>&1; then
      echo "[stack] ${name} became unhealthy during stability window (${i}/${seconds}): ${url}"
      if [[ -f "${pid_file}" ]]; then
        local pid
        pid="$(cat "${pid_file}")"
        if ! kill -0 "${pid}" 2>/dev/null; then
          echo "[stack] ${name} process exited (PID ${pid})"
        fi
      fi
      echo "[stack] --- ${name} log ---"
      tail -n 120 "${log_file}" || true
      return 1
    fi
    sleep 1
  done
  echo "[stack] ${name} remained healthy for ${seconds}s"
}

wait_log_pattern() {
  local name="$1"
  local pattern="$2"
  local timeout="$3"
  local pid_file="$4"
  local log_file="$5"

  if [[ -z "${pattern}" ]]; then
    return 0
  fi

  echo "[stack] waiting ${name} log pattern (${timeout}s): ${pattern}"
  for ((i=1; i<=timeout; i++)); do
    if grep -Fq "${pattern}" "${log_file}" 2>/dev/null; then
      echo "[stack] ${name} log pattern matched"
      return 0
    fi

    if [[ -f "${pid_file}" ]]; then
      local pid
      pid="$(cat "${pid_file}")"
      if ! kill -0 "${pid}" 2>/dev/null; then
        if grep -Fq "${pattern}" "${log_file}" 2>/dev/null; then
          echo "[stack] ${name} log pattern matched before process exit"
          return 0
        fi
        echo "[stack] ${name} process exited while waiting log pattern (PID ${pid})"
        echo "[stack] --- ${name} log ---"
        tail -n 200 "${log_file}" || true
        return 1
      fi
    fi
    sleep 1
  done

  echo "[stack] ${name} log pattern timeout: ${pattern}"
  echo "[stack] --- ${name} log ---"
  tail -n 200 "${log_file}" || true
  return 1
}

stop_pid_file "backend" "${BACKEND_PID_FILE}"
stop_pid_file "desktop" "${DESKTOP_PID_FILE}"
cleanup_port "${API_PORT}"
cleanup_port "${DESKTOP_PORT}"
assert_port_free "${API_PORT}"
assert_port_free "${DESKTOP_PORT}"

start_process "backend" "${BACKEND_CMD}" "${BACKEND_PID_FILE}" "${BACKEND_LOG}"
wait_http_ready "backend" "${API_HEALTH_URL}" "${BACKEND_PID_FILE}" "${BACKEND_LOG}" 30

start_process "desktop" "${DESKTOP_CMD}" "${DESKTOP_PID_FILE}" "${DESKTOP_LOG}"
wait_http_ready "desktop" "${DESKTOP_HEALTH_URL}" "${DESKTOP_PID_FILE}" "${DESKTOP_LOG}" 40
wait_http_stable "desktop" "${DESKTOP_HEALTH_URL}" "${DESKTOP_STABLE_SECONDS}" "${DESKTOP_PID_FILE}" "${DESKTOP_LOG}"
wait_log_pattern "desktop" "${DESKTOP_LOG_READY_PATTERN}" "${DESKTOP_LOG_READY_TIMEOUT}" "${DESKTOP_PID_FILE}" "${DESKTOP_LOG}"

echo "[stack] backend : ${API_HEALTH_URL}"
echo "[stack] desktop : ${DESKTOP_HEALTH_URL}"
echo "[stack] startup complete"
