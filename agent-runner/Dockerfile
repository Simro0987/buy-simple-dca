# syntax=docker/dockerfile:1
# ============================================================================
# buy-simple-dca agent-runner (server-side trading agents)
# Build from the REPO ROOT:  docker buildx build --platform linux/amd64 -f agent-runner/Dockerfile .
# - linux/amd64, runs as uid 1000 (node) after fixing ownership of the state volume
# - The ONLY on-chain action: AgentSwapModule.swapExactInputSingle (+ pause for the kill switch)
# - Keys come ONLY from runtime env/files (AGENT_<ID>_PRIVATE_KEY[_FILE]); nothing is baked in.
# ============================================================================
FROM --platform=$BUILDPLATFORM node:22-alpine AS builder
WORKDIR /app
ENV CI=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY agent-runner ./agent-runner
COPY src/lib/rsi.ts src/lib/safetyBrakeBoost.ts ./src/lib/
RUN npx vitest run --config agent-runner/vitest.config.ts && npm run build:runner

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/Simro0987/buy-simple-dca" \
      org.opencontainers.image.description="buy-simple-dca agent-runner (swap-only via AgentSwapModule, testnet + DRY_RUN by default)"
RUN apk add --no-cache su-exec tini
WORKDIR /app
COPY --from=builder /app/agent-runner/dist/runner.mjs ./runner.mjs
COPY --chmod=0755 agent-runner/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=128 \
    NETWORK=arbitrum-sepolia \
    DRY_RUN=true \
    KILL_SWITCH=false \
    ALLOW_MAINNET=false \
    STATE_DIR=/appdata \
    STATUS_PORT=8090
EXPOSE 8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/healthz >/dev/null 2>&1 || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "/app/runner.mjs"]
