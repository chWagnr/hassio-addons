# Home Assistant Add-on: CertFlow

## Configuration

Example:

```yaml
email: admin@example.de
staging: true
strato_username: "123456789"
strato_password: "change-me"
propagation_seconds: 300
output_path: ""
certificates:
  - name: example.de
    domains:
      - example.de
      - "*.example.de"
```

### `email`

Email address used for the Let's Encrypt account.

### `staging`

Use Let's Encrypt's staging environment. Keep this enabled until the
configuration works, then switch it to `false` for trusted certificates.

### `strato_username`

Strato customer number or login name.

### `strato_password`

Strato password. CertFlow writes it to an internal Certbot credentials file with
`0600` permissions.

### `propagation_seconds`

Seconds Certbot waits for DNS TXT record propagation before validation.
Strato DNS updates can be slow, so `300` is a conservative default.

### `output_path`

Base directory for exported certificate files inside `/ssl`.

Leave it empty to export directly below `/ssl`. You can also configure it as a
relative path such as `certflow`, which becomes `/ssl/certflow`, or as an
absolute path below `/ssl`, such as `/ssl/certflow`.

CertFlow always appends the certificate group name. For example:

```text
/ssl/example.de/fullchain.pem
/ssl/example.de/privkey.pem
```

### `certificates`

List of certificate groups.

Each group has:

- `name`: Used for Certbot's `--cert-name` and the output directory.
- `domains`: All domains included in the certificate.

Use one group for a root domain and wildcard certificate:

```yaml
certificates:
  - name: example.de
    domains:
      - example.de
      - "*.example.de"
```

Use multiple groups when you want separate certificates and separate output
directories.

## Caddy

CertFlow does not reload Caddy. Configure Caddy to read the exported files and
restart or reload Caddy separately after a certificate changes, if your setup
requires it.

```caddyfile
home.example.de {
    tls /ssl/example.de/fullchain.pem /ssl/example.de/privkey.pem
    reverse_proxy 192.168.1.10:8123
}
```

## Renewal State

Certbot state is stored in the add-on config directory:

- `/config/letsencrypt`
- `/config/work`
- `/config/logs`

This keeps the Let's Encrypt account and renewal configuration stable across
restarts.

CertFlow checks for renewals every 12 hours, matching Certbot's common packaged
timer behavior.
