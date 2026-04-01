#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source /usr/lib/bashio/bashio.sh

# ---------------------------------------------------------------------------
# Papra – Home Assistant Add-on run script
# ---------------------------------------------------------------------------

bashio::log.info "Starting Papra..."

# Ensure persistent data directory exists (db and documents sub-dirs required by Papra)
DATA_DIR="/data/papra"
mkdir -p "${DATA_DIR}/db" "${DATA_DIR}/documents"

# Symlink /app/app-data -> /data/papra so Papra persists data through HA
if [ ! -L /app/app-data ]; then
    rm -rf /app/app-data
    ln -s "${DATA_DIR}" /app/app-data
fi

# ---------------------------------------------------------------------------
# Read configuration from Home Assistant options
# ---------------------------------------------------------------------------

APP_BASE_URL="$(bashio::config 'app_base_url')"
AUTH_SECRET="$(bashio::config 'auth_secret')"

if bashio::var.is_empty "${AUTH_SECRET}"; then
    bashio::log.fatal "auth_secret must not be empty. Please set a long, random secret in the add-on configuration."
    exit 1
fi

export APP_BASE_URL
export AUTH_SECRET

if bashio::config.has_value 'trusted_origins'; then
    TRUSTED_ORIGINS="$(bashio::config 'trusted_origins')"
    export TRUSTED_ORIGINS
fi

# Protected variable names that must not be overridden via extra_env
readonly -a _PROTECTED_VARS=(APP_BASE_URL AUTH_SECRET TRUSTED_ORIGINS)

# Apply any extra environment variables supplied by the user (KEY=VALUE pairs)
if bashio::config.has_value 'extra_env'; then
    while IFS= read -r env_line; do
        var_name="${env_line%%=*}"
        # Validate: name must consist only of letters, digits, and underscores,
        # must start with a letter or underscore, and must not override protected vars.
        if [[ ! "${var_name}" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
            bashio::log.warning "Skipping extra_env entry with invalid variable name: '${var_name}'"
            continue
        fi
        for protected in "${_PROTECTED_VARS[@]}"; do
            if [ "${var_name}" = "${protected}" ]; then
                bashio::log.warning "Skipping extra_env entry: '${var_name}' is a protected variable."
                continue 2
            fi
        done
        bashio::log.debug "Exporting extra env: ${var_name}"
        export "${env_line?}"
    done < <(bashio::config 'extra_env | .[]')
fi

bashio::log.info "APP_BASE_URL: ${APP_BASE_URL}"
bashio::log.info "Launching Papra..."

# Hand off to the upstream startup command (runs migrations then starts server)
cd /app
exec npm run start:with-migrations
