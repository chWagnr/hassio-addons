ARG BUILD_FROM
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

# Copy run script
COPY --chmod=755 run.sh /

CMD ["/run.sh"]
