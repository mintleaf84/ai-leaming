/**
 * 对拍用的渲染器：把任意错误交给**生产环境同一个** `toErrorResponse`，
 * 用内存 Hono app 取回真实 HTTP 响应（不 mock Context、不手搓 body）。
 *
 * 录快照与比快照共用它，保证"录的"和"比的"是同一根管道。
 */
import { Hono } from "hono";
import { toErrorResponse } from "@/lib/api/error-response";

export interface RenderedError {
  status: number;
  body: Record<string, unknown>;
}

export async function renderError(error: unknown): Promise<RenderedError> {
  const app = new Hono();
  app.get("/probe", (c) => toErrorResponse(c, error, { scope: "parity" }));
  const res = await app.request("/probe");
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}
