# hadolint ignore=DL3006
FROM ghcr.io/papra-hq/papra:26.4.0-root

LABEL org.opencontainers.image.title="Papra" \
  org.opencontainers.image.description="Minimal document management platform" \
  org.opencontainers.image.source="https://github.com/chWagnr/hassio-addons" \
  org.opencontainers.image.licenses="MIT"

# Install bashio
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl jq ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && curl -J -L -o /tmp/bashio.tar.gz \
  "https://github.com/hassio-addons/bashio/archive/refs/heads/main.tar.gz" \
  && mkdir -p /usr/lib/bashio \
  && tar -xzf /tmp/bashio.tar.gz --strip 1 -C /usr/lib/bashio \
  && ln -s /usr/lib/bashio/bashio /usr/bin/bashio \
  && rm /tmp/bashio.tar.gz

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
