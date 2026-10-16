// @vitest-environment node
import { describe, it, expect } from "vitest";
import { hashPassword, comparePassword } from "../password";

describe("password 工具（bcrypt 哈希）", () => {
  it("hashPassword 应返回 bcrypt 哈希字符串", async () => {
    const hash = await hashPassword("mySecret123");
    expect(typeof hash).toBe("string");
    // bcrypt 哈希以 $2b$ 或 $2a$ 开头
    expect(hash).toMatch(/^\$2[ab]\$/);
    expect(hash.length).toBeGreaterThan(50);
  });

  it("相同密码的哈希应不同（盐值随机）", async () => {
    const hash1 = await hashPassword("same-password");
    const hash2 = await hashPassword("same-password");
    // bcrypt 每次加盐不同，因此两次哈希结果不同
    expect(hash1).not.toBe(hash2);
  });

  it("comparePassword 密码匹配时应返回 true", async () => {
    const password = "correctPassword!";
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);
    expect(result).toBe(true);
  });

  it("comparePassword 密码不匹配时应返回 false", async () => {
    const hash = await hashPassword("correctPassword!");
    const result = await comparePassword("wrongPassword", hash);
    expect(result).toBe(false);
  });

  it("空密码与非空密码不匹配", async () => {
    const hash = await hashPassword("somePassword");
    const result = await comparePassword("", hash);
    expect(result).toBe(false);
  });

  it("特殊字符密码应正常处理", async () => {
    const password = "密码！@#$%^&*()<>?";
    const hash = await hashPassword(password);
    expect(await comparePassword(password, hash)).toBe(true);
    expect(await comparePassword("密码！@#$%^&*()<>?X", hash)).toBe(false);
  });
});
