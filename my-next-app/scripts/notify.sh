#!/usr/bin/env bash
# 部署告警通道（O2）。
#
# 用法：
#   scripts/notify.sh <事件> <镜像tag> [失败原因...]
#   ALERT_WEBHOOK_URL=https://... scripts/notify.sh 健康检查失败 8f3c1ab "60s 内 /api/hello 未 200"
#
# 约定：
#   - 唯一配置项是环境变量 `ALERT_WEBHOOK_URL`（部署机的 .env 里配，或宝塔计划任务里 export）；
#   - 未配置时**只打印警告并 exit 0**：告警是旁路，绝不能因为它没配就卡住发布或回滚；
#   - 发送失败同样 exit 0，只留一行 stderr（curl 超时 10s，不会把部署脚本拖死）；
#   - 内容是纯文本一行：`[事件] 时间 | image=tag | reason=...`，
#     接收方是群机器人（企业微信/钉钉/Slack 的 text 字段）还是自建 echo 服务都能直接看。
#     需要 JSON 的接收方在网关侧自己包一层，本脚本不猜格式。

set -uo pipefail

EVENT="${1:-unknown}"
IMAGE_TAG="${2:-unknown}"
if [ "$#" -gt 2 ]; then
  shift 2
  REASON="$*"
else
  REASON=""
fi

TEXT="[${EVENT}] $(date '+%F %T %Z') | image=${IMAGE_TAG} | reason=${REASON:-无}"

if [ -z "${ALERT_WEBHOOK_URL:-}" ]; then
  echo "⚠ notify: ALERT_WEBHOOK_URL 未配置，跳过告警（部署流程不受影响）: ${TEXT}" >&2
  exit 0
fi

if ! curl -fsS -m 10 \
  -H 'Content-Type: text/plain; charset=utf-8' \
  --data-binary "${TEXT}" \
  "${ALERT_WEBHOOK_URL}" >/dev/null 2>&1; then
  echo "⚠ notify: 告警发送失败（不影响部署）: ${TEXT}" >&2
fi

exit 0
