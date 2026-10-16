/**
 * Edge Runtime 兼容的认证模块
 * 仅包含不依赖 Node.js 原生模块的 JWT 操作
 * 供 middleware.ts 使用
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/env";

const SECRET = new TextEncoder().encode(env.JWT_SECRET);

export const COOKIE_NAME = "auth_token";

/**
 * 加密 JWT payload
 */
export async function encrypt(payload: JWTPayload | undefined) {
  if (process.env.NODE_ENV === "production" && !env.JWT_SECRET) {
    throw new Error("系统安全配置严重错误：生产环境缺少 JWT_SECRET");
  }
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

/**
 * 解密 JWT token
 */
export async function decrypt(input: string): Promise<unknown> {
  if (process.env.NODE_ENV === "production" && !env.JWT_SECRET) {
    throw new Error("系统安全配置严重错误：生产环境缺少 JWT_SECRET");
  }
  const { payload } = await jwtVerify(input, SECRET, {
    algorithms: ["HS256"],
  });
  return payload;
}
