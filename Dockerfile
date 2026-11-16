# syntax=docker/dockerfile:1
# ============================================================================
# buy-simple-dca / SafeBTC Agent - static web terminal image
# ============================================================================
# - Zero secrets, zero private keys. The app never signs anything itself:
#   every transaction is signed by the Safe owners inside app.safe.global.
# - Built for linux/amd64 (Flux nodes are x86_64). On Apple Silicon build with
#     docker buildx build --platform linux/amd64 ...
# - Listens on 0.0.0.0:8080 as an unprivileged user (uid 101), read-only rootfs OK.
# - Runtime env vars (Flux "environmentParameters") are exposed to the browser via
#   /env-config.js, see deploy/nginx/40-runtime-config.sh.
# ============================================================================

FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Build-time defaults (public values only). Can still be overridden at runtime.
ARG VITE_SYSTEM_EXECUTION_MODE=PAPER
ENV VITE_SYSTEM_EXECUTION_MODE=$VITE_SYSTEM_EXECUTION_MODE
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/Simro0987/buy-simple-dca" \
      org.opencontainers.image.description="buy-simple-dca web terminal (static SPA, non-custodial, PAPER mode by default)" \
      org.opencontainers.image.licenses="MIT"

ENV TREASURY_LIVE=0 \
    VITE_SYSTEM_EXECUTION_MODE=PAPER

USER root
# Remove stock entrypoint helpers that try to rewrite /etc/nginx (fail on read-only rootfs).
RUN rm -f /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh \
          /docker-entrypoint.d/20-envsubst-on-templates.sh \
    && mkdir -p /etc/nginx/snippets /tmp/runtime \
    && chown -R 101:101 /tmp/runtime
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=0755 deploy/nginx/40-runtime-config.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=builder /app/dist /usr/share/nginx/html
USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1
# Base image ENTRYPOINT (/docker-entrypoint.sh) runs /docker-entrypoint.d/*.sh then CMD.
CMD ["nginx", "-g", "daemon off;"]
