# 部署与发布（ai-leaming）

> 面向"单机 Docker + 宝塔面板"的实际部署方式。设计前提见 `docs/decisions.md`（部署相关条目）。
> 一句话原则：**镜像不可变、部署可回滚、迁移前必备份。**

## 1. 部署形态

```
Caddy / Nginx（HTTPS 反代，PWA 依赖它）
        ↓  127.0.0.1:3000
docker compose（image: ghcr.io/mintleaf84/ai-leaming:<sha>）
        ↓
./data  ← 唯一状态：SQLite + .env.production(JWT_SECRET)
```

`docker-compose.yml` 有两种写法，**生产用后者**：

```yaml
    # ❌ 本地构建：每次结果取决于当时的依赖解析，无法复现
    build: { context: ., dockerfile: Dockerfile }

    # ✅ 用 CI 构建好的镜像，按 commit sha 钉版本
    image: ghcr.io/mintleaf84/ai-leaming:${IMAGE_TAG:-latest}
```

`IMAGE_TAG` 放在同目录的 `.env` 里，改一行就是换版本：

```ini
IMAGE_TAG=<commit-sha>      # 例如 83a8d54c...（完整 40 位）
```

## 2. 镜像标签约定（CI 产出）

`.github/workflows/docker-image.yml` 每次 CI 绿后在 main 上推两个标签：

| 标签 | 用途 |
| --- | --- |
| `:latest` | 只给"想试最新"的场景，**不要用于生产** |
| `:<full-sha>` | 生产部署用这个，不可变、可回滚 |

镜像带 OCI 标签，所以随时能回答"线上跑的是哪个 commit"：

```bash
docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' ai-learning-app
```

## 3. 首次配置

```bash
docker login ghcr.io -u mintleaf84        # token 需 read:packages（package 默认 private）
cd /www/wwwroot/<站点目录>
cp .env.example .env 2>/dev/null || true  # 至少填 JWT_SECRET / AI_API_KEY
docker compose pull
docker compose up -d
```

`JWT_SECRET` 缺失时 `start.sh:6-22` 会自动生成并写入 `data/.env.production`（持久化，重启不变）。**不要手工清 `data/`**——清掉等于让所有登录态失效、并丢掉数据库。

## 4. 日常更新（三选一）

### 4.1 宝塔「计划任务」一键（推荐）

面板 → 计划任务 → Shell 脚本 → 粘下面这段 → 列表里点「执行」。

```bash
#!/bin/bash
set -uo pipefail
APP_DIR=/www/wwwroot/ai-leaming/my-next-app        # ← 改成实际目录
TARGET=${1:-latest}                                 # 传 sha 则精确升级
LOG=/www/wwwlogs/ai-learning-deploy.log
KEEP=5

exec >>"$LOG" 2>&1
echo "===== $(date '+%F %T') deploy start (target=$TARGET) ====="
cd "$APP_DIR" || { echo "❌ 目录不存在"; exit 1; }

# ── 0. 回滚点：记录当前镜像 id + sha（两者都留，id 用于本地回滚，sha 用于重新拉取）
CUR_ID=$(docker inspect -f '{{.Image}}' ai-learning-app 2>/dev/null || true)
CUR_SHA=$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' ai-learning-app 2>/dev/null || true)
echo "当前镜像 id=${CUR_ID:-none} sha=${CUR_SHA:-none}"

# ── 1. 一致备份（VACUUM INTO，容器运行中也能拿到一致快照，无需停机）
SNAP="backup-$(date +%F-%H%M).db"
docker compose exec -T ai-learning node -e "
const D=require('better-sqlite3');
new D('/app/data/ai-learning.db').exec(\"VACUUM INTO '/app/data/${SNAP}'\")" \
  && echo "✔ 备份 data/${SNAP}" \
  || { echo "❌ 备份失败，中止（不更新）"; exit 1; }
ls -1t data/backup-*.db 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

# ── 2. 切换版本并重启
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${TARGET}/" .env 2>/dev/null || echo "IMAGE_TAG=${TARGET}" >> .env
docker compose pull || { echo "❌ pull 失败（未登录 GHCR 或网络）"; exit 1; }
docker compose up -d --pull never || { echo "❌ up 失败"; exit 1; }

# ── 3. 健康检查（60s）
ok=0
for i in $(seq 1 30); do
  curl -fsS -m 2 http://127.0.0.1:3000/api/hello >/dev/null 2>&1 && { ok=1; break; }
  sleep 2
done

if [ "$ok" != 1 ]; then
  echo "❌ 健康检查失败，回滚"
  docker compose stop
  # 数据先回退，再退镜像：迁移是单向的，顺序反了旧代码会读到新 schema
  rm -f data/ai-learning.db data/ai-learning.db-wal data/ai-learning.db-shm
  cp -a "data/${SNAP}" data/ai-learning.db
  if [ -n "${CUR_SHA}" ] && [ "${CUR_SHA}" != "none" ]; then
    sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=${CUR_SHA}/" .env
  else
    docker tag "$CUR_ID" "ghcr.io/mintleaf84/ai-leaming:rollback" && \
      sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=rollback/" .env
  fi
  docker compose up -d --pull never
  echo "↩ 已回滚到 ${CUR_SHA:-$CUR_ID} + data/${SNAP}"
  exit 1
fi

echo "✔ 健康检查通过"
docker compose exec -T ai-learning node -e "
const D=require('better-sqlite3');
console.log('migrations:', new D('/app/data/ai-learning.db',{readonly:true})
  .prepare('select count(*) n from __drizzle_migrations').get().n)" || true
echo "===== $(date '+%F %T') deploy done ====="
```

精确升级到某个 commit：计划任务里把命令写成 `bash deploy.sh <full-sha>`（宝塔支持在任务里带参数）。

### 4.2 手工（SSH）

```bash
cd /www/wwwroot/<站点目录>
# 备份 → 切版本 → 起 → 验
docker compose exec -T ai-learning node -e "const D=require('better-sqlite3');new D('/app/data/ai-learning.db').exec(\"VACUUM INTO '/app/data/backup-$(date +%F-%H%M).db'\")"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<full-sha>/" .env
docker compose pull && docker compose up -d --pull never
curl -fsS http://127.0.0.1:3000/api/hello && echo OK
```

### 4.3 宝塔 Docker 面板的"重建"按钮

**不推荐**：不备份、不做健康检查、不记录回滚点。只在"容器起不来"的应急救火时用。

## 5. 回滚

```bash
# 1. 数据先回退（迁移单向，必须先退数据再退镜像）
docker compose stop
rm -f data/ai-learning.db data/ai-learning.db-wal data/ai-learning.db-shm
cp -a data/backup-<时间戳>.db data/ai-learning.db

# 2. 镜像回退到上一个 sha
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<上一版 full-sha>/" .env
docker compose up -d --pull never
```

**为什么数据必须先退**：`start.sh` 每次启动都会跑 `migrate-runner.js`，而 drizzle 迁移只进不退（没有 down 脚本）。旧镜像 + 新 schema 会读到不认识的列。

## 6. 迁移的硬约束（必须知道）

- 迁移在**容器启动时自动执行**（`start.sh:26-31`），失败则 `set -e` 退出，容器起不来；
- 迁移**没有回滚**，唯一退路是第 5 节的数据备份；
- `VACUUM INTO` 生成的 `data/backup-*.db` 就是那个退路，**保留最近 5 份**（脚本里已做）；
- 因此：任何 schema 变更的 PR，都必须确认"旧代码能否在新 schema 上跑"——如果不能，就要按 expand/contract 拆两步（见 `docs/decisions.md`）。

## 7. HTTPS 与 PWA

Service Worker 只在 **HTTPS 或 localhost** 下注册。用 `http://IP:3000` 直接访问时：

- 预缓存、离线兜底、二次启动加速**全部不生效**；
- `web_vitals` 里仍然有 INP/LCP，但"PWA 有没有用"的结论会是假的。

宝塔三步：添加站点 → 反向代理 `http://127.0.0.1:3000` → SSL 申请 Let's Encrypt。之后用域名访问。

## 8. 排错清单

| 现象 | 检查 |
| --- | --- |
| 容器反复重启 | `docker compose logs --tail=100 ai-learning`，多半是迁移失败或环境变量缺失 |
| `pull` 报 denied | `docker login ghcr.io`；package 若为 private 需要 `read:packages` |
| `pull` 报 manifest unknown | 该 sha 的镜像还没构建（CI 未绿，或刚合并几分钟内） |
| 拉起即退出、日志有 `GLIBC` | 部署机是 arm64，而镜像是 amd64 |
| 页面能开但 PWA 不装/不缓存 | 是否 HTTPS；`chrome://inspect` 看 Application → Service Workers |
| 更新后登录态全丢 | 是否误删了 `data/.env.production` |
