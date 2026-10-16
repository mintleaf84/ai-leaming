
# ========================================
# Stage 1: Dependencies
# ========================================
FROM node:20-slim AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ========================================
# Stage 2: Builder
# ========================================
FROM node:20-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DB_FILENAME=build-placeholder.db
ENV SKIP_ENV_VALIDATION=1
ENV AI_API_KEY=build-placeholder
ENV JWT_SECRET=build-placeholder-secret

RUN mkdir -p /app/data
RUN npm run db:migrate
RUN npm run build

RUN npx esbuild scripts/migrate-runner.ts --bundle --platform=node --target=node20 \
    --external:better-sqlite3 --external:sqlite-vec \
    --outfile=.next/standalone/migrate-runner.js

RUN mkdir -p .next/standalone/src/lib/migrations \
    && for f in src/lib/migrations/*.ts; do \
         npx esbuild "$f" --platform=node --target=node20 \
           --outdir=.next/standalone/src/lib/migrations/; \
       done

# ========================================
# Stage 3: Runner
# ========================================
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME /app/data

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# 补回原生模块，根据架构自动选择
COPY --from=deps /app/node_modules/sqlite-vec ./node_modules/sqlite-vec
COPY --from=deps /app/node_modules/sqlite-vec-linux-* ./node_modules/

COPY start.sh .
RUN chmod +x start.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["./start.sh"]
