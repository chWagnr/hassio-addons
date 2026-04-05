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

- **Persistent storage** mapped to `/data/papra`, included in every HA backup
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

## Source

- Add-on source: <https://github.com/chWagnr/hassio-addons/tree/main/papra>
- Upstream Papra: <https://github.com/papra-hq/papra>
