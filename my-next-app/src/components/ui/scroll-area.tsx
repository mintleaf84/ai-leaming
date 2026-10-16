"use client";

import * as React from "react";
import { cn } from "@/lib/utils/utils";

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("relative overflow-auto", className)}
      style={style}
      {...props}
    >
      {children}
    </div>
  ),
);
ScrollArea.displayName = "ScrollArea";

export { ScrollArea };
