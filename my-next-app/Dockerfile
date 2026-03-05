
# ========================================
# Stage 1: Dependencies
# ========================================
FROM node:20-slim AS deps
WORKDIR /app

# Install native dependencies required for some packages (like better-sqlite3)
# python3, make, g++ are often needed for node-gyp
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ========================================
# Stage 2: Builder
# ========================================
FROM node:20-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables for build time
ENV NEXT_TELEMETRY_DISABLED=1
# 构建时需要跳过数据库连接等运行时逻辑，提供占位环境变量
ENV NODE_ENV=production
ENV DB_FILENAME=build-placeholder.db

# 创建临时 data 目录，防止 Next.js 预渲染页面时 initDatabase() 找不到路径
RUN mkdir -p /app/data

RUN npm run build 2>&1 || (echo "=== BUILD FAILED ===" && cat /app/.next/build-error.log 2>/dev/null; exit 1)

# ========================================
# Stage 3: Runner
# ========================================
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime dependencies for sqlite-vec or other native modules
# openssl is usually required by Prisma (if used later) or native networking
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN npm install -g tsx

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create data directory for SQLite persistence
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME /app/data

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Next.js standalone mode excludes dev files; copy necessary files for runtime migration
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/migrations ./src/lib/migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/db.ts ./src/lib/db.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./

USER nextjs

EXPOSE 3000

ENV PORT=3000
# Ensure Hostname is 0.0.0.0 for Docker
ENV HOSTNAME="0.0.0.0"

# Copy start script
COPY start.sh .
RUN chmod +x start.sh

CMD ["./start.sh"]
