
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

# Builder 阶段也需要系统库：Next.js 打包时会预渲染页面，
# 执行到 initDatabase() 和 sqlite-vec 扩展加载，需要 openssl 等 C 运行时
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Environment variables for build time
ENV NEXT_TELEMETRY_DISABLED=1
# 构建时需要跳过数据库连接等运行时逻辑，提供占位环境变量
ENV NODE_ENV=production
ENV DB_FILENAME=build-placeholder.db
# 构建阶段缺少运行时密钥，跳过 env.ts 的变量验证
ENV SKIP_ENV_VALIDATION=1
# Next.js 预渲染页面时需要通过 env.ts 校验，提供占位值
ENV AI_API_KEY=build-placeholder
ENV JWT_SECRET=build-placeholder-secret

# 创建临时 data 目录，防止 Next.js 预渲染页面时 initDatabase() 找不到路径
RUN mkdir -p /app/data

# 执行数据库迁移，确保构建阶段（如静态生成）所需的表结构已创建
RUN npm run db:migrate

RUN npm run build

# 使用 esbuild 将迁移脚本编译为单文件 JS（排除 C++ 原生扩展 better-sqlite3 避免打包错误）
# 注意：esbuild 只会打包 TypeScript 源码，运行时的 native 模块由 standalone 的 node_modules 提供
RUN npx esbuild scripts/migrate-runner.ts --bundle --platform=node --target=node20 \
    --external:better-sqlite3 --external:sqlite-vec \
    --outfile=.next/standalone/migrate-runner.js

# 将迁移文件逐个编译为 JS（它们是运行时动态加载的，无法打包进主 bundle）
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

# Install runtime dependencies for sqlite-vec or other native modules
# openssl is usually required by Prisma (if used later) or native networking
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

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

# 补回 esbuild 标记为 external 的原生模块（standalone trace 可能遗漏 sqlite-vec）
# 这两个包加起来只有 ~2MB，远小于之前的完整 node_modules
COPY --from=deps /app/node_modules/sqlite-vec ./node_modules/sqlite-vec
COPY --from=deps /app/node_modules/sqlite-vec-linux-x64 ./node_modules/sqlite-vec-linux-x64

# COPY start script
COPY start.sh .
RUN chmod +x start.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
# Ensure Hostname is 0.0.0.0 for Docker
ENV HOSTNAME="0.0.0.0"


CMD ["./start.sh"]
