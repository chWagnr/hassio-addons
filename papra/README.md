# Home Assistant Add-on: Papra

Minimalistic, self-hosted document archiving platform.

<picture>
    <source srcset="./icon.png" media="(prefers-color-scheme: light)">
    <source srcset="./dark_icon.png" media="(prefers-color-scheme: dark)">
    <img src="./icon.png" alt="Papra logo">
</picture>

## About

[Papra](https://papra.app) is a clean, minimal document management solution you can run
entirely on your own hardware. This add-on wraps the official Papra container image and
wires it into the Home Assistant ecosystem, giving you:

- **Persistent storage** with the database in add-on config storage and documents in `/share/papra`
- **Easy configuration** through the Home Assistant UI
- **Automatic startup** on Home Assistant OS boot

## Installation

1. Add this repository to your Home Assistant add-on store:  
   `https://github.com/chWagnr/hassio-addons`
2. Find **Papra** in the add-on store and click **Install**.
3. Configure at minimum `app_base_url` and `auth_secret` in the add-on configuration.
4. Start the add-on.
5. Open the Web UI on port `1221`.

## Documentation

Full configuration reference: [DOCS.md](DOCS.md)

## File Storage

Papra splits its persistent data across the Home Assistant add-on config directory and
the shared folder.

This includes:

- the SQLite database in `/config/db`
- uploaded and managed documents in `/share/papra/documents`

Inside Home Assistant, the database lives in Papra's add-on config storage. On the host
this is under `/addon_configs/papra`, and inside the container it is available at
`/config`. Documents are stored in the shared folder so they can also be reached via
Samba or SSH.

## Backing up

The simplest way to back up Papra is to create a Home Assistant backup. This add-on is
configured so its add-on config directory is included in backups.

For a complete backup, make sure you include both:

- `/config/db`
- `/share/papra/documents`

Another way is to make copies of both locations manually.

Note: Papra uses `backup: cold`, so Home Assistant will stop the add-on during backup
creation and start it again afterwards. This helps keep the SQLite database in a
consistent state.

Note: A backup that includes the add-on but does not include the `share` directory will
not include your Papra documents.

## Source

- Add-on source: <https://github.com/chWagnr/hassio-addons/tree/main/papra>
- Upstream Papra: <https://github.com/papra-hq/papra>
