#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source /usr/lib/bashio/lib/bashio.sh

# ---------------------------------------------------------------------------
# Papra – Home Assistant Add-on run script
# ---------------------------------------------------------------------------

bashio::log.info "Starting Papra..."

# Keep the database in add-on config storage and expose documents via /share.
CONFIG_DIR="/config"
DB_DIR="${CONFIG_DIR}/db"
SHARE_DIR="/share/papra"
DOCUMENTS_DIR="${SHARE_DIR}/documents"
APP_DATA_DIR="/app/app-data"

mkdir -p "${DB_DIR}" "${DOCUMENTS_DIR}"

# Papra expects /app/app-data/{db,documents}. Wire those subdirectories to the
# Home Assistant add-on config dir and the shared documents folder.
if [ -L "${APP_DATA_DIR}" ]; then
    rm -f "${APP_DATA_DIR}"
fi
mkdir -p "${APP_DATA_DIR}"
rm -rf "${APP_DATA_DIR}/db" "${APP_DATA_DIR}/documents"
ln -s "${DB_DIR}" "${APP_DATA_DIR}/db"
ln -s "${DOCUMENTS_DIR}" "${APP_DATA_DIR}/documents"

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

# Apply any extra environment variables supplied by the user (KEY=VALUE pairs).
# Iterate directly over the configured list instead of using has_value, which is
# reliable for scalar fields but fragile for arrays.
while IFS= read -r env_line; do
    env_line="${env_line#"${env_line%%[![:space:]]*}"}"
    env_line="${env_line%"${env_line##*[![:space:]]}"}"

    if [ -z "${env_line}" ]; then
        continue
    fi

    if [[ "${env_line}" != *=* ]]; then
        bashio::log.warning "Skipping malformed extra_env entry without '=': '${env_line}'"
        continue
    fi

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

    bashio::log.info "Exporting extra env: ${var_name}"
    export "${env_line?}"
done < <(bashio::config 'extra_env[]?')

bashio::log.info "APP_BASE_URL: ${APP_BASE_URL}"
bashio::log.info "Launching Papra..."

# Hand off to the upstream startup command (runs migrations then starts server)
cd /app
exec npm run start:with-migrations
