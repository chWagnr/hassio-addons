ARG BUILD_FROM
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

# Install bashio
RUN apk add --no-cache bash curl jq \
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
