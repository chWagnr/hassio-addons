ARG BUILD_FROM
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

# Install bashio for reading Home Assistant addon options
ARG BASHIO_VERSION="v0.16.2"
RUN apk add --no-cache curl jq \
    && curl -fsSL "https://github.com/hassio-addons/bashio/archive/${BASHIO_VERSION}.tar.gz" \
       | tar xzf - --strip-components=1 -C /usr/local/lib bashio-${BASHIO_VERSION#v}/lib \
    && ln -s /usr/local/lib/bashio/bashio /usr/local/bin/bashio

# Copy run script
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
