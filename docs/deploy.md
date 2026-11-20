# 部署与发布（ai-leaming）

> 面向"单机 Docker + 宝塔面板"的实际部署方式。设计前提见 `docs/decisions.md`（部署相关条目）。
> 一句话原则：**镜像不可变、部署可回滚、迁移前必备份。**
> 移动端（Android APK）不走这套：签名密钥备份见 §9，APK 回滚见 §10。

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
IMAGE_TAG=<commit-sha>      # 例如 83a8d54c…（完整 40 位）
```

## 2. 镜像标签约定（CI 产出）

`.github/workflows/docker-image.yml` 每次 CI 绿后在 main 上推两个标签：

| 标签          | 用途                                   |
| ------------- | -------------------------------------- |
| `:latest`     | 只给"想试最新"的场景，**不要用于生产** |
| `:<full-sha>` | 生产部署用这个，不可变、可回滚         |

检出源码与打标签使用**同一个 SHA 表达式**（`workflow_run.head_sha || github.sha`），
所以镜像上的 revision 一定对应镜像里的代码。

镜像带 OCI 标签，随时能回答"线上跑的是哪个 commit"：

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

`JWT_SECRET` 与 `BACKUP_ENCRYPTION_KEY` 缺失时 `start.sh` 会自动生成并写入 `data/.env.production`
（持久化，重启不变）。后者用于加解密 WebDAV 密码：**它丢了就等于备份密码丢了**，
换机器/迁移时必须连 `data/` 一起搬，否则已保存的 WebDAV 密码解不开（页面会提示重新填写）。
多实例共享同一个数据库时，两个实例必须拿到**同一个** `BACKUP_ENCRYPTION_KEY`（共享 `data/`，
或显式在 compose 的 `environment` 里给同一个值）。

**不要手工清 `data/`**——那是数据库和所有登录态。

## 4. 日常更新（三选一）

### 4.1 宝塔「计划任务」一键（推荐）

面板 → 计划任务 → Shell 脚本 → 粘下面这段 → 列表里点「执行」。
精确升级到某版本：任务命令写成 `bash deploy.sh <full-sha>`。

```bash
#!/bin/bash
set -uo pipefail
APP_DIR=/www/wwwroot/ai-leaming/my-next-app        # ← 改成实际目录
IMAGE=ghcr.io/mintleaf84/ai-leaming
TARGET="${1:-latest}"                               # 传 sha 则精确升级
LOG=/www/wwwlogs/ai-learning-deploy.log
KEEP=5

exec >>"$LOG" 2>&1
echo "===== $(date '+%F %T') deploy start (target=$TARGET) ====="
cd "$APP_DIR" || { echo "❌ 目录不存在"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "❌ 找不到 docker compose"; exit 1; }

# ── 0. 回滚点：优先记 sha（可重新拉取），拿不到就把当前镜像 id 打成可用的本地标签
CUR_SHA=$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' ai-learning-app 2>/dev/null || echo "")
CUR_ID=$(docker inspect -f '{{.Image}}' ai-learning-app 2>/dev/null || echo "")
HAVE_ROLLBACK=0
if [ -n "$CUR_SHA" ]; then
  HAVE_ROLLBACK=1; echo "回滚点 sha=$CUR_SHA"
elif [ -n "$CUR_ID" ]; then
  docker tag "$CUR_ID" "$IMAGE:rollback" && HAVE_ROLLBACK=1 && echo "回滚点 本地 tag=:rollback（id=${CUR_ID:0:12}）"
else
  echo "⚠ 没有可回滚的旧版本（首次部署？）——本次失败将无法自动回滚"
fi

set_tag() {   # .env 里没有 IMAGE_TAG 时要追加，否则 sed 改不到、会静默用默认 latest
  touch .env
  if grep -q '^IMAGE_TAG=' .env; then
    sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$1|" .env
  else
    echo "IMAGE_TAG=$1" >> .env
  fi
}

# ── 1. 一致备份：VACUUM INTO 生成"快照点当时"的一致副本（无需停写）
SNAP="backup-$(date +%F-%H%M).db"
docker compose exec -T ai-learning node -e "
const D=require('better-sqlite3');
new D('/app/data/ai-learning.db').exec(\"VACUUM INTO '/app/data/${SNAP}'\")" \
  && echo "✔ 备份 data/${SNAP}" \
  || { echo "❌ 备份失败，中止（不更新）"; exit 1; }
ls -1t data/backup-*.db 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f

rollback() {
  echo "↩ 开始回滚（数据先退，镜像再退：迁移单向，顺序反了旧代码会读新 schema）"
  docker compose stop
  rm -f data/ai-learning.db data/ai-learning.db-wal data/ai-learning.db-shm
  cp -a "data/${SNAP}" data/ai-learning.db || { echo "❌ 数据恢复失败，需人工介入"; exit 1; }
  if [ -n "$CUR_SHA" ]; then
    set_tag "$CUR_SHA"
  elif [ -n "$CUR_ID" ]; then
    set_tag "rollback"
  else
    echo "❌ 没有回滚点，保持当前状态，需人工介入"; exit 1
  fi
  docker compose up -d --pull never
  echo "↩ 已回滚到 ${CUR_SHA:-本地 :rollback} + data/${SNAP}"
}

# ── 2. 切换版本并重启；启动失败也要回滚，不能直接退出
set_tag "$TARGET"
docker compose pull || { echo "❌ pull 失败（未登录 GHCR 或网络），未改动运行中的版本"; exit 1; }
if ! docker compose up -d --pull never; then
  echo "❌ up 失败"
  [ "$HAVE_ROLLBACK" = 1 ] && rollback
  exit 1
fi

# ── 3. 健康检查（60s）
ok=0
for i in $(seq 1 30); do
  curl -fsS -m 2 http://127.0.0.1:3000/api/hello >/dev/null 2>&1 && { ok=1; break; }
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "❌ 健康检查失败"
  [ "$HAVE_ROLLBACK" = 1 ] && rollback || echo "⚠ 无回滚点，保留现场供排查"
  exit 1
fi

echo "✔ 健康检查通过（镜像 ${TARGET}）"
docker compose exec -T ai-learning node -e "
const D=require('better-sqlite3');
console.log('migrations:', new D('/app/data/ai-learning.db',{readonly:true})
  .prepare('select count(*) n from __drizzle_migrations').get().n)" || true
echo "===== $(date '+%F %T') deploy done ====="
```

**为什么备份用 `VACUUM INTO`**：WAL 模式下 `cp` 可能拷到不一致状态，而 `VACUUM INTO`
产出的是一致快照、且不需要停写。代价是它是**时间点快照**——快照之后到重启之间
产生的写入不包含在内（几秒窗口）。需要"绝对完整"就先 `docker compose stop` 再拷。

### 4.2 手工（SSH）

一次性粘贴即可；`set -e` 保证任一步失败就停，不会带着坏状态往下走：

```bash
set -euo pipefail
cd /www/wwwroot/<站点目录>

# 1) 备份 + 立刻验一次完整性
docker compose exec -T ai-learning node -e "
const D=require('better-sqlite3');
new D('/app/data/ai-learning.db').exec(\"VACUUM INTO '/app/data/backup-manual.db'\");"
docker compose exec -T ai-learning node -e "
const D=require('better-sqlite3');
const r=String(new D('/app/data/backup-manual.db',{readonly:true}).pragma('quick_check'));
if(!/^ok/.test(r)) { console.error('备份不可用:', r); process.exit(1); }
console.log('备份 quick_check:', r);"

# 2) 切版本并重启
grep -q '^IMAGE_TAG=' .env || echo 'IMAGE_TAG=latest' >> .env
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=<full-sha>|" .env
docker compose pull
docker compose up -d --pull never

# 3) 验证
curl -fsS http://127.0.0.1:3000/api/hello && echo " OK"
```

### 4.3 宝塔 Docker 面板的"重建"按钮

**不推荐**：不备份、不做健康检查、不记录回滚点。只在"容器起不来"的应急救火时用。

## 5. 回滚

```bash
set -euo pipefail
cd /www/wwwroot/<站点目录>
BK=data/backup-<时间戳>.db

# 1) 先确认备份文件可用（不可用的备份等于没有备份）
docker compose run --rm --entrypoint node ai-learning -e "
const D=require('better-sqlite3');
const r=String(new D('/app/data/$(basename "$BK")',{readonly:true}).pragma('quick_check'));
if(!/^ok/.test(r)) { console.error('备份损坏:', r); process.exit(1); }
console.log('quick_check:', r);"

# 2) 停容器 → 用备份替换（-wal/-shm 必须一起删，否则会把旧 WAL 应用到新库上）
docker compose stop
rm -f data/ai-learning.db data/ai-learning.db-wal data/ai-learning.db-shm
cp -a "$BK" data/ai-learning.db

# 3) 镜像退到上一个 sha
sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=<上一版 full-sha>|" .env
docker compose up -d --pull never
curl -fsS http://127.0.0.1:3000/api/hello && echo " OK"
```

**数据必须先退、镜像再退**：`start.sh` 每次启动都跑 `migrate-runner.js`，而 drizzle
迁移只进不退（没有 down 脚本）。旧镜像 + 新 schema 会读到不认识的列。

## 6. 迁移的硬约束（必须知道）

- 迁移在**容器启动时自动执行**（`start.sh:26-31`），失败则 `set -e` 退出，容器起不来；
- 迁移**没有回滚**，唯一退路是 §4 的备份；
- `data/backup-*.db` 就是那个退路，脚本保留最近 5 份；
- 因此任何 schema 变更的 PR，都要回答"旧代码能否在新 schema 上跑"；不能就要按
  expand/contract 拆两步（见 `docs/decisions.md`）。

## 7. HTTPS 与 PWA

Service Worker 只在 **HTTPS 或 localhost** 下注册。用 `http://IP:3000` 直接访问时：

- 预缓存、离线兜底、二次启动加速**全部不生效**；
- `web_vitals` 里仍有 INP/LCP，但"PWA 有没有用"的结论是假的（`launch` 会偏乐观）。

宝塔三步：添加站点 → 反向代理 `http://127.0.0.1:3000` → SSL 申请 Let's Encrypt。

## 8. 排错清单

| 现象                         | 检查                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| 容器反复重启                 | `docker compose logs --tail=100 ai-learning`，多半是迁移失败或环境变量缺失 |
| `pull` 报 denied             | `docker login ghcr.io`；package 若为 private 需要 `read:packages`          |
| `pull` 报 manifest unknown   | 该 sha 的镜像还没构建（CI 未绿，或刚合并几分钟内）                         |
| 拉起即退出、日志有 `GLIBC`   | 部署机是 arm64，而镜像是 amd64                                             |
| 页面能开但 PWA 不装/不缓存   | 是否 HTTPS；`chrome://inspect` → Application → Service Workers             |
| 更新后登录态全丢             | 是否误删了 `data/.env.production`                                          |
| 更新后读库报"no such column" | 数据没回退就回退了镜像，按 §5 顺序重来                                     |

## 9. Android 签名密钥备份

APK 不走应用商店，升级靠用户手动装新包，而 Android 只接受**同一个签名证书**的覆盖安装。
因此 release keystore 是这条链路上**唯一不可再生**的资产：它只存在于 GitHub Actions secrets，
仓库里（按设计）没有任何副本，一旦丢失或密码遗忘，就再也无法给已装机的用户发升级包。

### 9.1 secrets 清单（缺任意一项，`android.yml` 直接失败）

| Secret                      | 内容                                      |
| --------------------------- | ----------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `.jks` 文件的 base64 原文（`base64 -w0`） |
| `ANDROID_KEYSTORE_PASSWORD` | keystore 口令                             |
| `ANDROID_KEY_ALIAS`         | 密钥别名                                  |
| `ANDROID_KEY_PASSWORD`      | 密钥口令（可与 keystore 口令相同）        |

证书主体固定为 `CN=ai-leaming-mobile, OU=dev, O=mintleaf84, C=CN`（见 `docs/mobile-ui-kit.md` §9.2），
升级前后可用下面这条命令核对"装机的包是不是同一把钥匙签的"：

```bash
# 打印 APK 签名证书指纹（对比两个包是否同源）
keytool -printcert -jarfile app-release.apk | grep -E "Owner|SHA256"
```

### 9.2 离线备份要求

**必须在 CI 之外保留两份副本**，且都不能是仓库、不能是同一台机器上的同一块盘：

1. **密码管理器条目** `ai-leaming-android-release`：keystore 文件作为附件，外加三条口令
   （store / key alias / key password）写在同一入口，避免"有文件没密码"；
2. **离线加密介质**：keystore 文件放进加密容器（VeraCrypt / 加密 U 盘）单独存放，
   与密码管理器互为兜底——只存密码管理器，账号被锁就全丢；只存 U 盘，介质损坏就全丢。

备份后按下表登记，每次新建或轮换 keystore 时更新（**这张表只写位置，不写口令、不放文件**）：

| 备份副本     | 位置（填写具体条目/介质编号） | 最后核对日期 |
| ------------ | ----------------------------- | ------------ |
| 密码管理器   | 待登记                        | 待登记       |
| 离线加密介质 | 待登记                        | 待登记       |

### 9.3 仓库侧的硬约束

- `mobile_app/android/key.properties`、`*.jks`、`*.keystore` 已在 `.gitignore`；
- 合并前可用下面这条自查（输出必须为空）：

```bash
git ls-files | grep -E '\.(jks|keystore)$|key\.properties$' || echo "OK: 仓库内无密钥文件"
```

- **不要把 keystore 写进 `docs/`、issue、PR 描述或聊天记录**——一旦进了 git 历史，
  就等于永久公开（force push 也清不掉 fork 与缓存）。

### 9.4 已经丢了怎么办

无法补救，只能换身份重发：

1. 改 `mobile_app/android/app/build.gradle.kts` 的 `applicationId`（如
   `com.mintleaf84.aileaming` → `com.mintleaf84.aileaming2`），`namespace` 同步；
2. 重新生成 keystore 并更新 4 个 secrets；
3. 用户必须**卸载旧包再装新包**（两个包名在系统里是两个应用），旧包的本地数据
   （离线答题记录、待同步队列）随之丢失——这也是 §9.2 要备份的唯一理由。

## 10. APK 回滚

### 10.1 为什么不能"装回旧包"

Android 的覆盖安装要求 `versionCode` **不小于**已安装版本，否则 `adb install` 报
`INSTALL_FAILED_VERSION_DOWNGRADE`，系统安装器直接拒绝。所以 APK 的回滚不是"下载旧
APK 再装一次"，而是**用旧代码重新出一个 versionCode 更大的包**。

`android.yml` 的版本号规则（R1）正好支持这件事：

- `versionName` 来自 `pubspec.yaml` 的语义版本（`1.0.0+1` → `1.0.0`），由代码决定，回滚时会**变小**；
- `versionCode` 来自 `${{ github.run_number }}`，仓库级单调递增，**重跑旧代码也只会更大**。

判断"能不能装上"看的是 versionCode（`aapt dump badging app-release.apk | head -1` 或
`adb shell dumpsys package com.mintleaf84.aileaming | grep versionCode`），
不是设置页显示的那串语义版本号——回滚后显示旧版本号是**预期行为**，不是失败。

### 10.2 操作步骤

前提：tag 上的 workflow 文件是"旧版"的，直接 `--ref <旧 tag>` 重跑会用旧 workflow
（没有 R1 的版本派生，versionCode 又回到 1，装不上）。因此**先把新 workflow 带到旧代码上**：

```bash
# 1) 以旧 tag 为基线建回滚分支（代码是旧的，workflow 是新的）
git fetch --tags origin
git switch -c rollback/v1.1.0 v1.1.0
git checkout origin/main -- .github/workflows/android.yml   # 只取新版 workflow
git commit -m "chore: 回滚构建引入新版 android.yml（版本号派生 + Release）"
git push -u origin rollback/v1.1.0

# 2) 用分支触发构建（workflow_dispatch 读的是该 ref 上的 workflow 文件）
gh workflow run android.yml --ref rollback/v1.1.0
gh run watch "$(gh run list --workflow=android.yml --limit=1 --json databaseId --jq '.[0].databaseId')"

# 3) 取产物：artifact 名带版本（app-release-1.1.0+<run_number>）
gh run download <run-id> -n 'app-release-1.1.0+<run_number>'
```

若要**同时**产出一个正式 Release（例如要发给多个用户），把回滚分支打成新 tag
（不要复用旧 tag：tag 不可变，重指会让人分不清哪个是原始发布）：

```bash
git tag v1.1.0-rollback.1
git push origin v1.1.0-rollback.1   # tag 触发 → 自动建 Release 并附 APK
```

### 10.3 验收判据

1. `adb install -r app-release-1.1.0+<code>.apk` 成功，**没有** `INSTALL_FAILED_VERSION_DOWNGRADE`；
2. 新包的 versionCode 严格大于出问题那版：
   `aapt dump badging app-release.apk | grep versionCode` 两包对比；
3. 打开 App 功能回到旧 tag 的行为（例如出问题的功能消失/恢复原样）；
4. 用户数据仍在：离线答题记录与待同步队列未丢（同包名 + 同签名覆盖安装才会保留，
   换包名等于新应用，见 §9.4）。

### 10.4 两个容易踩的点

- **Release 资产会被覆盖**：同一 tag 重跑构建时，`android.yml` 走的是
  `gh release upload --clobber`（幂等），不会因"Release 已存在"报错，但该 tag 的 APK
  会被这次构建的产物替换——所以回滚请用新 tag，别重跑旧 tag 的 workflow；
- **`run_number` 不是无限资源**：workflow 文件被改名/重建时计数会重置。真到那一步，
  在 `pubspec.yaml` 的 `version` 里手工抬主段（如 `1.2.0+1`）仍然无效（versionCode 由 CI 覆盖），
  正确做法是临时把 `--build-number` 钉成一个大数，并立刻在 `docs/decisions.md` 记一笔。
