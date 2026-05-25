FROM python:3.12-slim-bookworm

LABEL org.opencontainers.image.title="CertFlow" \
  org.opencontainers.image.description="ACME DNS-01 certificate exporter for Home Assistant OS" \
  org.opencontainers.image.source="https://github.com/chWagnr/hassio-addons" \
  org.opencontainers.image.licenses="MIT"

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    coreutils \
    curl \
    jq \
    openssl \
    tar \
  && pip install --no-cache-dir \
    certbot==4.2.0 \
    certbot-dns-strato==0.2.4 \
  && curl -J -L -o /tmp/bashio.tar.gz \
    "https://github.com/hassio-addons/bashio/archive/refs/heads/main.tar.gz" \
  && mkdir -p /usr/lib/bashio \
  && tar -xzf /tmp/bashio.tar.gz --strip 1 -C /usr/lib/bashio \
  && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
  && rm -rf /var/lib/apt/lists/* /tmp/bashio.tar.gz

COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
