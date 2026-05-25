#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=/dev/null
source /usr/lib/bashio/lib/bashio.sh

OPTIONS_FILE="/data/options.json"
CONFIG_DIR="/config"
LETSENCRYPT_DIR="${CONFIG_DIR}/letsencrypt"
WORK_DIR="${CONFIG_DIR}/work"
LOGS_DIR="${CONFIG_DIR}/logs"
CREDENTIALS_DIR="${CONFIG_DIR}/credentials"
CREDENTIALS_FILE="${CREDENTIALS_DIR}/strato.ini"
RENEW_INTERVAL_SECONDS=43200

require_string() {
    local key="$1"
    local value
    value="$(jq -r --arg key "${key}" '.[$key] // ""' "${OPTIONS_FILE}")"

    if [ -z "${value}" ] || [ "${value}" = "null" ]; then
        bashio::log.fatal "Configuration option '${key}' must not be empty."
        exit 1
    fi

    printf '%s' "${value}"
}

validate_name() {
    local name="$1"

    if [[ ! "${name}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
        bashio::log.fatal "Certificate name '${name}' is invalid. Use letters, digits, dots, underscores, and hyphens only."
        exit 1
    fi
}

validate_domain() {
    local domain="$1"

    if [[ ! "${domain}" =~ ^(\*\.)?[A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,}$ ]]; then
        bashio::log.fatal "Domain '${domain}' is invalid."
        exit 1
    fi
}

validate_output_path() {
    local output_path="$1"

    if [[ ! "${output_path}" =~ ^/ssl(/[A-Za-z0-9._-]+)*$ ]] || [[ "${output_path}" == *"/.."* ]] || [[ "${output_path}" == *"/."* ]]; then
        bashio::log.fatal "output_path must be an absolute path below /ssl using letters, digits, dots, underscores, and hyphens."
        exit 1
    fi
}

normalize_output_path() {
    local output_path="$1"

    output_path="${output_path%/}"
    if [ -z "${output_path}" ]; then
        printf '/ssl'
        return
    fi

    if [[ "${output_path}" == /ssl ]]; then
        printf '%s' "${output_path}"
        return
    fi

    if [[ "${output_path}" == /ssl/* ]]; then
        printf '%s' "${output_path}"
        return
    fi

    if [[ "${output_path}" == /* ]]; then
        bashio::log.fatal "output_path must be relative to /ssl or an absolute path below /ssl."
        exit 1
    fi

    printf '/ssl/%s' "${output_path}"
}

write_credentials_file() {
    local username="$1"
    local password="$2"

    mkdir -p "${CREDENTIALS_DIR}"
    umask 077
    {
        printf 'dns_strato_username = %s\n' "${username}"
        printf 'dns_strato_password = %s\n' "${password}"
    } > "${CREDENTIALS_FILE}"
    chmod 600 "${CREDENTIALS_FILE}"
}

copy_certificate() {
    local name="$1"
    local domains_json="$2"
    local output_path="$3"
    local live_dir="${LETSENCRYPT_DIR}/live/${name}"
    local destination="${output_path%/}/${name}"
    local temp_destination
    local renewed_at
    local expires_at

    if [ ! -s "${live_dir}/fullchain.pem" ] || [ ! -s "${live_dir}/privkey.pem" ]; then
        bashio::log.fatal "Certbot finished, but certificate files for '${name}' are missing."
        exit 1
    fi

    mkdir -p "${output_path%/}"
    temp_destination="$(mktemp -d "${output_path%/}/.${name}.tmp.XXXXXX")"

    cp -L "${live_dir}/fullchain.pem" "${temp_destination}/fullchain.pem"
    cp -L "${live_dir}/chain.pem" "${temp_destination}/chain.pem"
    cp -L "${live_dir}/cert.pem" "${temp_destination}/cert.pem"
    cp -L "${live_dir}/privkey.pem" "${temp_destination}/privkey.pem"
    chmod 600 "${temp_destination}/privkey.pem"

    renewed_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    expires_at="$(openssl x509 -enddate -noout -in "${temp_destination}/fullchain.pem" | sed 's/^notAfter=//')"

    jq -n \
        --arg name "${name}" \
        --arg output_path "${destination}" \
        --arg renewed_at "${renewed_at}" \
        --arg expires_at "${expires_at}" \
        --argjson domains "${domains_json}" \
        '{
            name: $name,
            domains: $domains,
            output_path: $output_path,
            renewed_at: $renewed_at,
            expires_at: $expires_at
        }' > "${temp_destination}/metadata.json"

    rm -rf "${destination}.previous"
    if [ -e "${destination}" ]; then
        mv "${destination}" "${destination}.previous"
    fi
    mv "${temp_destination}" "${destination}"
    rm -rf "${destination}.previous"

    bashio::log.info "Exported certificate '${name}' to ${destination}."
}

run_certbot_for_certificate() {
    local name="$1"
    local domains_json="$2"
    local email="$3"
    local staging="$4"
    local propagation_seconds="$5"
    local output_path="$6"
    local domain_args=()
    local staging_args=()
    local domain

    validate_name "${name}"

    while IFS= read -r domain; do
        validate_domain "${domain}"
        domain_args+=("-d" "${domain}")
    done < <(jq -r '.[]' <<< "${domains_json}")

    if [ "${#domain_args[@]}" -eq 0 ]; then
        bashio::log.fatal "Certificate '${name}' must contain at least one domain."
        exit 1
    fi

    if [ "${staging}" = "true" ]; then
        staging_args=("--staging")
    fi

    bashio::log.info "Requesting or renewing certificate '${name}'."
    certbot certonly \
        --non-interactive \
        --agree-tos \
        --email "${email}" \
        --config-dir "${LETSENCRYPT_DIR}" \
        --work-dir "${WORK_DIR}" \
        --logs-dir "${LOGS_DIR}" \
        --cert-name "${name}" \
        --authenticator dns-strato \
        --dns-strato-credentials "${CREDENTIALS_FILE}" \
        --dns-strato-propagation-seconds "${propagation_seconds}" \
        --keep-until-expiring \
        "${staging_args[@]}" \
        "${domain_args[@]}"

    copy_certificate "${name}" "${domains_json}" "${output_path}"
}

run_once() {
    local email="$1"
    local staging="$2"
    local propagation_seconds="$3"
    local output_path="$4"
    local cert_count
    local index
    local name
    local domains_json

    cert_count="$(jq '.certificates | length' "${OPTIONS_FILE}")"
    if [ "${cert_count}" -eq 0 ]; then
        bashio::log.fatal "At least one certificate group must be configured."
        exit 1
    fi

    for ((index = 0; index < cert_count; index++)); do
        name="$(jq -r --argjson index "${index}" '.certificates[$index].name // ""' "${OPTIONS_FILE}")"
        domains_json="$(jq -c --argjson index "${index}" '.certificates[$index].domains // []' "${OPTIONS_FILE}")"
        run_certbot_for_certificate "${name}" "${domains_json}" "${email}" "${staging}" "${propagation_seconds}" "${output_path}"
    done
}

bashio::log.info "Starting CertFlow..."

EMAIL="$(require_string "email")"
STRATO_USERNAME="$(require_string "strato_username")"
STRATO_PASSWORD="$(require_string "strato_password")"
STAGING="$(jq -r '.staging // false' "${OPTIONS_FILE}")"
PROPAGATION_SECONDS="$(jq -r '.propagation_seconds // 300' "${OPTIONS_FILE}")"
OUTPUT_PATH="$(jq -r '.output_path // ""' "${OPTIONS_FILE}")"
OUTPUT_PATH="$(normalize_output_path "${OUTPUT_PATH}")"

validate_output_path "${OUTPUT_PATH}"
mkdir -p "${LETSENCRYPT_DIR}" "${WORK_DIR}" "${LOGS_DIR}" "${OUTPUT_PATH}"
write_credentials_file "${STRATO_USERNAME}" "${STRATO_PASSWORD}"

bashio::log.info "Certificates will be exported below ${OUTPUT_PATH}/<certificate-name>."

while true; do
    run_once "${EMAIL}" "${STAGING}" "${PROPAGATION_SECONDS}" "${OUTPUT_PATH}"
    bashio::log.info "Next renewal check in 12 hours."
    sleep "${RENEW_INTERVAL_SECONDS}"
done
