# Home Assistant Add-on: CertFlow

CertFlow issues and renews Let's Encrypt certificates with the Strato DNS-01
challenge and exports them into Home Assistant OS' `/ssl` directory.

It does not run a reverse proxy. Use it when Caddy, another add-on, or Home
Assistant itself should consume certificate files from `/ssl`.

## Installation

1. Add this repository to the Home Assistant add-on store:
   `https://github.com/chWagnr/hassio-addons`
2. Install **CertFlow**.
3. Configure your Let's Encrypt email, Strato credentials, optional
   `output_path`, and at least one certificate group.
4. Start the add-on.
5. Point Caddy or another service at the exported certificate files.

CertFlow is a one-shot add-on: it runs Certbot, exports the certificate files,
and then stops. Start it manually or with a Home Assistant automation on the
schedule you want.

## Output

The `output_path` option controls the base directory inside `/ssl`. Leave it
empty to write directly below `/ssl`, or set a relative path such as `certflow`.
CertFlow always appends the certificate group name and writes:

- `fullchain.pem`
- `chain.pem`
- `cert.pem`
- `privkey.pem`
- `metadata.json`

With an empty `output_path` and `name: example.de`, Caddy can use:

```caddyfile
example.de, *.example.de {
    tls /ssl/example.de/fullchain.pem /ssl/example.de/privkey.pem
    reverse_proxy 192.168.1.10:8123
}
```

## Documentation

Full configuration reference: [DOCS.md](DOCS.md)
