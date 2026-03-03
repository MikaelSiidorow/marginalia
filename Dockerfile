# Stage 1: Build
FROM oven/bun:1-slim AS builder

# Build metadata (passed from CI)
ARG GITHUB_SHA=unknown
ARG GITHUB_REF_NAME=unknown

WORKDIR /app

# Copy dependency files first for better caching
COPY package.json bun.lock ./

# Install all dependencies (including devDeps for build)
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Generate Zero schema from Drizzle schema
RUN bun run zero:generate

# Build application with metadata
ENV GITHUB_SHA=${GITHUB_SHA}
ENV GITHUB_REF_NAME=${GITHUB_REF_NAME}
RUN bun run build

# Stage 2: Production
FROM oven/bun:1-slim

WORKDIR /app

# Copy built app from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Copy migration files (for K8s init container: bun run drizzle-kit migrate)
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/lib/server/db ./src/lib/server/db

# Install production deps + drizzle-kit for migrations
RUN bun install --frozen-lockfile --production && \
    bun add drizzle-kit drizzle-orm postgres

# Create non-root user
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD bun --eval "fetch('http://localhost:3000/').then(r => r.ok || process.exit(1)).catch(() => process.exit(1))"

ENV NODE_ENV=production

# Default: run the app. Override in K8s init container for migrations.
CMD ["bun", "run", "build/index.js"]
