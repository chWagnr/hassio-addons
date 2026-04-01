ARG BUILD_FROM
# hadolint ignore=DL3006
FROM ${BUILD_FROM}

# Copy run script
COPY run.sh /run.sh
RUN chmod a+x /run.sh

CMD ["/run.sh"]
