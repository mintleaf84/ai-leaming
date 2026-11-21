"use client";

import * as React from "react";
import { Loader2, RefreshCw, ScanLine, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createFenbiQrcode,
  describeFenbiError,
  fetchFenbiQrcodeState,
  linkFenbiAccount,
  type FenbiQrcodeState,
  type FenbiQrcodeTicket,
} from "@/lib/hooks/useFenbiSync";

export type FenbiBindMode = "qrcode" | "password";

const QRCODE_POLL_INTERVAL_MS = 2000;

interface FenbiBindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 打开时默认落在哪种方式（卡片上两个入口各自指定） */
  defaultMode?: FenbiBindMode;
  /** 绑定成功：刷新账号状态 */
  onLinked: () => void;
}

/**
 * 粉笔账号绑定弹窗：扫码（推荐）+ 手机号密码（备用）。
 *
 * 弹窗内容拆成 `BindBody`，靠 `open && <BindBody />` 控制挂载，
 * 这样每次重新打开都是全新状态，不需要一个"关闭时清空表单"的 effect。
 */
export function FenbiBindDialog({
  open,
  onOpenChange,
  defaultMode = "qrcode",
  onLinked,
}: FenbiBindDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>绑定粉笔账号</DialogTitle>
          <DialogDescription>
            绑定后可以把粉笔里的知识点练习记录同步过来。我们只会读取练习记录，不会代你做任何操作。
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <BindBody
            defaultMode={defaultMode}
            onLinked={onLinked}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BindBody({
  defaultMode,
  onLinked,
  onClose,
}: {
  defaultMode: FenbiBindMode;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = React.useState<FenbiBindMode>(defaultMode);

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="选择绑定方式"
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Button
          type="button"
          size="lg"
          aria-pressed={mode === "qrcode"}
          variant={mode === "qrcode" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setMode("qrcode")}
        >
          <ScanLine className="mr-2 h-4 w-4" aria-hidden />
          扫码绑定（推荐）
        </Button>
        <Button
          type="button"
          size="lg"
          aria-pressed={mode === "password"}
          variant={mode === "password" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setMode("password")}
        >
          用手机号密码绑定
        </Button>
      </div>

      {mode === "qrcode" ? (
        <QrcodePanel onLinked={onLinked} onClose={onClose} />
      ) : (
        <PasswordPanel onLinked={onLinked} onClose={onClose} />
      )}
    </div>
  );
}

/**
 * 二维码面板。
 *
 * 拆成两层是为了「重新获取」：`QrcodePanel` 只持有 attempt，
 * 真正的会话状态放在 `QrcodeSession` 里，换一张二维码就换 key 重新挂载，
 * 不需要在 effect 里同步清空状态。
 */
function QrcodePanel({
  onLinked,
  onClose,
}: {
  onLinked: () => void;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = React.useState(0);

  return (
    <QrcodeSession
      key={attempt}
      onRetry={() => setAttempt((value) => value + 1)}
      onLinked={onLinked}
      onClose={onClose}
    />
  );
}

/**
 * 一次扫码会话。
 *
 * 轮询实现：`qrState` 变化后 effect 重新排一个 2 秒的定时器，
 * 所以「请求中」不会和「下一次请求」重叠；关闭弹窗或状态变成
 * confirmed / expired 时定时器被清掉。
 */
function QrcodeSession({
  onRetry,
  onLinked,
  onClose,
}: {
  onRetry: () => void;
  onLinked: () => void;
  onClose: () => void;
}) {
  const [ticket, setTicket] = React.useState<FenbiQrcodeTicket | null>(null);
  const [qrState, setQrState] = React.useState<FenbiQrcodeState>("pending");
  const [isLoadingCode, setIsLoadingCode] = React.useState(true);
  const [qrError, setQrError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    createFenbiQrcode()
      .then((next) => {
        if (cancelled) return;
        setTicket(next);
        setIsLoadingCode(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setQrError(describeFenbiError(error));
        setIsLoadingCode(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!ticket) return;
    if (qrState === "confirmed" || qrState === "expired") return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await fetchFenbiQrcodeState(ticket.lgtoken);
        if (cancelled) return;
        setQrState(next);
        if (next === "confirmed") {
          toast.success("粉笔账号已绑定");
          onLinked();
          onClose();
        }
      } catch (error) {
        // audit-allow: 轮询失败转成弹层内可读文案（setQrError），组件卸载时静默退出
        if (cancelled) return;
        setQrError(describeFenbiError(error));
      }
    }, QRCODE_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ticket, qrState, onLinked, onClose]);

  const qrImageSrc = ticket
    ? `https://api.qrserver.com/v1/create-qr-code/?size=224x224&margin=8&data=${encodeURIComponent(ticket.qrContent)}`
    : null;

  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-muted-foreground">
        打开粉笔 App，点右上角「扫一扫」，对准下面的二维码，在手机上点确认即可。
      </p>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 p-6">
        {isLoadingCode ? (
          <div className="flex h-56 w-56 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2
              className="h-6 w-6 animate-spin text-primary"
              aria-hidden
            />
            <span role="status">正在生成二维码…</span>
          </div>
        ) : qrError ? (
          <div className="flex h-56 w-56 flex-col items-center justify-center gap-3 text-center">
            <ShieldAlert className="h-6 w-6 text-destructive" aria-hidden />
            <p role="alert" className="text-sm text-destructive">
              {qrError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={onRetry}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              重新获取
            </Button>
          </div>
        ) : qrState === "expired" ? (
          <div className="flex h-56 w-56 flex-col items-center justify-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              二维码已过期，重新获取一张就行。
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={onRetry}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
              重新获取二维码
            </Button>
          </div>
        ) : (
          <>
            {qrImageSrc ? (
              <div
                role="img"
                aria-label="粉笔登录二维码，请用粉笔 App 扫码"
                className="rounded-lg bg-white p-3"
              >
                {/* 临时方案：项目里没有引入二维码库，先借公共服务渲染这张图。
                    上线前应换成自建二维码组件（qrContent 是粉笔给的原始链接）。 */}
                {/* eslint-disable-next-line @next/next/no-img-element -- 临时二维码渲染，见上方注释 */}
                <img
                  src={qrImageSrc}
                  alt=""
                  width={224}
                  height={224}
                  className="h-56 w-56"
                />
              </div>
            ) : null}

            <p role="status" className="text-sm text-muted-foreground">
              {qrState === "scanned"
                ? "已扫码，请在手机上点「确认登录」。"
                : "等待扫码…页面每 2 秒自动刷新一次状态。"}
            </p>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        扫码只用于读取你的练习记录，不会在粉笔里留下任何操作。
      </p>
    </div>
  );
}

function PasswordPanel({
  onLinked,
  onClose,
}: {
  onLinked: () => void;
  onClose: () => void;
}) {
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    if (!/^1\d{10}$/.test(phone.trim())) {
      setFormError("请输入 11 位手机号。");
      return;
    }
    if (!password) {
      setFormError("请输入粉笔的登录密码。");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);
    try {
      await linkFenbiAccount({ phone: phone.trim(), password });
      toast.success("粉笔账号已绑定");
      onLinked();
      onClose();
    } catch (error) {
      // audit-allow: 错误已转成表单内可读文案，不吞也不上抛（弹层保持打开可重试）
      // 后端的 error 已经是中文，直接用；风控类会换成「等 10 分钟 / 改扫码」
      setFormError(describeFenbiError(error));
      return;
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="fenbi-phone">粉笔登录手机号</Label>
        <Input
          id="fenbi-phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={11}
          placeholder="请输入 11 位手机号"
          className="h-11"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          disabled={isSubmitting}
          aria-describedby={formError ? "fenbi-bind-error" : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="fenbi-password">粉笔登录密码</Label>
        <Input
          id="fenbi-password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="请输入粉笔的登录密码"
          className="h-11"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
          aria-describedby={formError ? "fenbi-bind-error" : undefined}
        />
      </div>

      {formError ? (
        <div
          id="fenbi-bind-error"
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {formError}
        </div>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            正在绑定…
          </>
        ) : (
          "绑定账号"
        )}
      </Button>

      <p className="text-xs leading-5 text-muted-foreground">
        密码只用于这一次登录，绑定完成后会换成粉笔下发的登录凭证保存，不会留下明文密码。
        如果反复提示风控，请改用扫码绑定。
      </p>
    </form>
  );
}

export default FenbiBindDialog;
