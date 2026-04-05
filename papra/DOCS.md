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

Papra uses two persistent locations:

- `/config/db` for the SQLite database and internal add-on state
- `/share/papra/documents` for uploaded and managed documents

Inside Home Assistant, `addon_config:rw` maps this add-on's dedicated host directory
(`/addon_configs/{REPO}_papra`) to `/config` inside the container, while `/share` maps
to the shared folder that is also commonly available through Samba and SSH.

If the add-on is installed from a local repository, `{REPO}` is typically `local`. For
GitHub repositories, Home Assistant uses a generated identifier for the repository.

## Backup

Papra's add-on config storage is included in Home Assistant backups, but the documents
live in the shared folder.

For a complete backup, include both:

- the Papra add-on data directory
- the Home Assistant `share` directory

If you create a backup that includes the add-on but excludes `share`, the SQLite
database will be backed up but your document files will not.

This add-on is configured with `backup: cold`, which means Home Assistant will
temporarily stop the add-on before taking a snapshot and restart it afterwards.
This ensures the SQLite database is in a consistent state and the backup is safe
to restore from.

## Ports

| Port | Description |
|------|-------------|
| 1221 | Papra Web UI |

## Support

Please open an issue in the
[hassio-addons repository](https://github.com/chWagnr/hassio-addons/issues).
