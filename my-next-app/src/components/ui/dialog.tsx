"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * 弹窗内容的**唯一实现路径**：只给 Radix 行为，不带任何默认视觉。
 *
 * 两个导出共用它（`DialogContent` = 默认视觉预设，`DialogContentBare` = 裸壳），
 * 所以 `role="dialog"` / `aria-modal` / 焦点陷阱 / Esc / 关闭后焦点归还只会有一份实现，
 * 不会两套行为各自漂移。
 *
 * - `aria-modal` 显式给：Radix 1.x 只给 `role="dialog"`，不写 `aria-modal`
 * - 遮罩走 `overlay` 传入并 `asChild` 合并（可以是 `motion.div`），
 *   这样淡入淡出仍由调用方控制，同时保留 Radix Overlay 的 RemoveScroll
 *   （body 会拿到 `data-scroll-locked`；当前滚动容器是 `main`，另见 globals.css）
 */
interface DialogContentBareProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  /** 遮罩层节点，作为 Radix Overlay 渲染（点它 = 点内容之外，会触发 onInteractOutside）。不传则不渲染遮罩。 */
  overlay?: React.ReactNode;
}

const DialogContentBare = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentBareProps
>(({ className, children, overlay, ...props }, ref) => (
  <DialogPortal>
    {overlay ? (
      <DialogPrimitive.Overlay asChild>{overlay}</DialogPrimitive.Overlay>
    ) : null}
    <DialogPrimitive.Content
      ref={ref}
      aria-modal="true"
      className={className}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContentBare.displayName = "DialogContentBare";

/**
 * 默认视觉预设：居中、`max-w-lg`、`bg-background`、内置右上角 X。
 *
 * 实现上委托给 `DialogContentBare` —— **不要**在这里再写一份 Portal / Overlay /
 * aria-modal，那会让两个导出逐渐分叉。
 *
 * 调用方需要"换壳不改视觉"时（自建 `fixed inset-0` 浮层迁移），用 `DialogContentBare`；
 * 只是要调遮罩色/去掉内置 X 时，用下面两个 props。
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** 调用方自带关闭按钮时隐藏内置右上角 X，避免同一浮层出现两个关闭入口 */
    hideClose?: boolean;
    /** 遮罩样式覆盖（沿用改造前浮层的背景/模糊，避免换壳顺带改配色） */
    overlayClassName?: string;
  }
>(
  (
    { className, children, hideClose = false, overlayClassName, ...props },
    ref,
  ) => (
    <DialogContentBare
      ref={ref}
      // 换行只为可读性；className 会原样拼进 Content
      className={[
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      overlay={<DialogOverlay className={overlayClassName} />}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">关闭</span>
        </DialogPrimitive.Close>
      )}
    </DialogContentBare>
  ),
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogContentBare,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
