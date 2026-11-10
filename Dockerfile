# ============================================================================
# SafeBTC Agent · Institutional DeFi Operating System (Dockerfile)
# ============================================================================
# Zero secrets, zero private keys, fail-closed PAPER mode by default.
# Works identically in Docker, Podman, and on Akash Network decentralized cloud.
# ============================================================================

FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV TREASURY_LIVE=0
ENV VITE_SYSTEM_EXECUTION_MODE=PAPER

# Create writable /tmp and persistent state volume directory for paper.json, journal.jsonl, learned.json & audit logs
RUN mkdir -p /data/state /data/backups && chmod 1777 /tmp && chown -R node:node /app /data

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/scripts ./scripts

RUN npm install -g serve@14.2.4

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/manifest.json >/dev/null 2>&1 || exit 1

CMD ["serve", "-s", "dist", "-l", "8080"]
