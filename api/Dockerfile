# syntax=docker/dockerfile:1
# ============================================================================
# buy-simple-dca API (Flux component "api") - replaces Supabase:
#   SIWE wallet auth (EOA + Safe EIP-1271) -> JWT sessions, PostgREST (RLS in Postgres),
#   the server functions (api/functions) and the scheduled jobs.
# Build from the REPO ROOT:  docker buildx build --platform linux/amd64 -f api/Dockerfile .
# Secrets come only from runtime files/env of THIS container; nothing is baked in.
# ============================================================================
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY api ./api
COPY shared ./shared
RUN npx vitest run --config api/vitest.config.ts && node api/build.mjs

FROM alpine:3.22 AS postgrest
ARG POSTGREST_VERSION=v14.18
ARG POSTGREST_SHA256=98de1c0be7787aea5f5e11a25f303ea0077634d6fc1000b687bfa825fd27d299
RUN apk add --no-cache curl xz \
 && curl -fsSL -o /tmp/pgrst.tar.xz "https://github.com/PostgREST/postgrest/releases/download/${POSTGREST_VERSION}/postgrest-${POSTGREST_VERSION}-linux-static-x86-64.tar.xz" \
 && echo "${POSTGREST_SHA256}  /tmp/pgrst.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/pgrst.tar.xz -C /usr/local/bin postgrest \
 && /usr/local/bin/postgrest --version

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/Simro0987/buy-simple-dca" \
      org.opencontainers.image.description="buy-simple-dca API: SIWE auth + PostgREST + edge functions on own Postgres"
RUN apk add --no-cache su-exec tini
WORKDIR /app
COPY --from=postgrest /usr/local/bin/postgrest /usr/local/bin/postgrest
COPY --from=builder /app/api/dist ./dist
COPY --chmod=0755 api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=160 \
    API_PORT=8070 \
    DATA_DIR=/appdata \
    API_SECRETS_FILE=/appdata/secrets.env \
    POSTGREST_BIN=/usr/local/bin/postgrest
EXPOSE 8070
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8070/healthz >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/sbin/tini", "-g", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "/app/dist/api.mjs"]
