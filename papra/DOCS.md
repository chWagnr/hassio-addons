# Papra – Home Assistant Add-on

## Overview

Papra is a minimalistic, self-hosted document archiving platform. This add-on wraps the
official [Papra](https://github.com/papra-hq/papra) container image and integrates it
cleanly into Home Assistant OS.

## Configuration

### Option: `app_base_url` (required)

The publicly reachable base URL of your Papra instance, including port when not using the
default HTTP/HTTPS ports.

**Example:** `http://homeassistant.local:1221`

---

### Option: `auth_secret` (required)

A long, random secret string used to sign authentication tokens. **Change this from the
default value before exposing Papra to the network.**

You can generate a suitable secret with:

```bash
openssl rand -hex 32
```

---

### Option: `trusted_origins` (optional)

A comma-separated list of trusted cross-origin URLs. Leave empty unless you access Papra
from a different origin than `app_base_url`.

**Example:** `https://papra.example.com,https://docs.example.com`

---

### Option: `extra_env` (optional)

A list of additional environment variables to pass to Papra, in `KEY=VALUE` format.
Use this to configure advanced Papra options not yet exposed as first-class add-on options.

**Example:**

```yaml
extra_env:
  - PAPRA_UPLOAD_MAX_FILE_SIZE=52428800
```

---

## Persistent Data

All Papra data (SQLite database, uploaded documents) is stored in
`/data/papra` inside the add-on container, which maps to
`/addon_configs/<slug>/data/papra` on the host. This directory is preserved across add-on
restarts and updates.

## Ports

| Port | Description |
|------|-------------|
| 1221 | Papra Web UI |

## Support

Please open an issue in the
[hassio-addons repository](https://github.com/chWagnr/hassio-addons/issues).
