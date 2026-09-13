FROM postgres:17-bookworm@sha256:051f7b7b3abdd564d5d1bd1e8c4b9c1b6e77087d1dd22020ede611c096a272e0
# Same reviewed PostgreSQL major/platform and distribution patch as local deployment.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpcre2-8-0=10.42-1+deb12u1 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
COPY --chmod=0755 deployment/postgres-init.sh /docker-entrypoint-initdb.d/10-catalog-roles.sh
