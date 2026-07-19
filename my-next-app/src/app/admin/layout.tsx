import React from "react";
import { AdminLayoutShell } from "./_components/admin-layout-shell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminLayoutShell>{children}</AdminLayoutShell>;
}
