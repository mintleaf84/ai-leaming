import { Metadata } from "next";

export const metadata: Metadata = {
  title: "使用文档 - AI 教招",
  description: "AI 教招学习系统使用指南，帮助你快速上手各项功能。",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
