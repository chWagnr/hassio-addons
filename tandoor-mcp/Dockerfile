FROM node:24.15.0-alpine

ARG BUILD_VERSION=0.4.0
ARG BUILD_ARCH=amd64
LABEL io.hass.version="${BUILD_VERSION}" \
      io.hass.type="addon" \
      io.hass.arch="${BUILD_ARCH}" \
      org.opencontainers.image.title="Tandoor MCP" \
      org.opencontainers.image.description="Authenticated Tandoor recipe MCP server" \
      org.opencontainers.image.source="https://github.com/chWagnr/hassio-addons" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.mjs discovery.mjs auth.mjs setup.mjs ./
EXPOSE 3737
CMD ["node", "server.mjs"]
