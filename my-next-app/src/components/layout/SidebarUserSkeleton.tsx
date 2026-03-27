'use client';

import React from 'react';
import { ChevronsUpDown } from 'lucide-react';

export function SidebarUserSkeleton() {
  return (
    <div className="p-4 border-t border-sidebar-border bg-sidebar animate-pulse">
      <div className="flex items-center gap-3 p-2 rounded-xl">
        <div className="w-9 h-9 rounded-full bg-muted shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-3 bg-muted rounded w-16" />
        </div>
        <ChevronsUpDown className="w-4 h-4 text-muted/30" />
      </div>
    </div>
  );
}
