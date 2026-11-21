import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";

import {
  canStoreSecret,
  decryptSecret,
  encryptSecret,
  maskPhone,
  FenbiSecretDecryptError,
  FenbiSecretUnavailableError,
} from "../crypto";

/**
 * FENBI_SECRET 的口径（docs/fenbi-sync-design.md §3）：
 * **32 字节 base64**；缺失/不合格时拒绝存密码，只允许扫码。
 *
 * 这里用 beforeEach/afterEach 精确控制环境变量，覆盖"同一个进程里先有密钥、
 * 后没密钥"的分支 —— 所以实现里刻意不缓存密钥。
 */
const VALID_KEY = crypto.randomBytes(32).toString("base64");

describe("crypto / 密钥缺失", () => {
  const originalFenbi = process.env.FENBI_SECRET;
  const originalJwt = process.env.JWT_SECRET;

  afterEach(() => {
    if (originalFenbi === undefined) delete process.env.FENBI_SECRET;
    else process.env.FENBI_SECRET = originalFenbi;
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
  });

  it("FENBI_SECRET 与 JWT_SECRET 都没有时 canStoreSecret() 为 false", () => {
    delete process.env.FENBI_SECRET;
    delete process.env.JWT_SECRET;
    expect(canStoreSecret()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow(FenbiSecretUnavailableError);
    expect(() => decryptSecret("v1.aa.bb.cc")).toThrow(
      FenbiSecretUnavailableError,
    );
  });

  it("密钥不是 32 字节 base64 时同样视为缺失（不做静默降级）", () => {
    delete process.env.JWT_SECRET;
    process.env.FENBI_SECRET = Buffer.from("too-short").toString("base64");
    expect(canStoreSecret()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow(FenbiSecretUnavailableError);
  });

  it("密钥含非法 base64 字符时视为缺失", () => {
    delete process.env.JWT_SECRET;
    process.env.FENBI_SECRET = "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!";
    expect(canStoreSecret()).toBe(false);
  });

  it("配了非法 FENBI_SECRET 时 fail closed：即使有 JWT_SECRET 也不回退派生", () => {
    process.env.JWT_SECRET = "root-secret";
    process.env.FENBI_SECRET = Buffer.from("too-short").toString("base64");
    expect(canStoreSecret()).toBe(false);
    expect(() => encryptSecret("secret")).toThrow(FenbiSecretUnavailableError);
  });
});

describe("crypto / 从 JWT_SECRET 派生（HKDF）", () => {
  const originalFenbi = process.env.FENBI_SECRET;
  const originalJwt = process.env.JWT_SECRET;

  beforeEach(() => {
    delete process.env.FENBI_SECRET;
    process.env.JWT_SECRET = "root-secret-a";
  });

  afterEach(() => {
    if (originalFenbi === undefined) delete process.env.FENBI_SECRET;
    else process.env.FENBI_SECRET = originalFenbi;
    if (originalJwt === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalJwt;
  });

  it("只有 JWT_SECRET 时 canStoreSecret() 为 true，且可往返解密", () => {
    expect(canStoreSecret()).toBe(true);
    expect(decryptSecret(encryptSecret("p@ss"))).toBe("p@ss");
  });

  it("同一根秘密派生稳定：先加密、隔一次调用再解也能解开", () => {
    const cipher = encryptSecret("stable");
    expect(canStoreSecret()).toBe(true);
    expect(decryptSecret(cipher)).toBe("stable");
  });

  it("换 JWT_SECRET 后旧密文解不开（FenbiSecretDecryptError）", () => {
    const cipher = encryptSecret("will-break");
    process.env.JWT_SECRET = "root-secret-b";
    expect(() => decryptSecret(cipher)).toThrow(FenbiSecretDecryptError);
  });

  it("专用 FENBI_SECRET 优先于派生：配上之后 JWT 派生的密文解不开", () => {
    const derivedCipher = encryptSecret("derived");
    process.env.FENBI_SECRET = VALID_KEY;
    expect(() => decryptSecret(derivedCipher)).toThrow(FenbiSecretDecryptError);
  });
});

describe("crypto / 加解密往返", () => {
  beforeEach(() => {
    process.env.FENBI_SECRET = VALID_KEY;
  });

  const restore = process.env.FENBI_SECRET;
  afterEach(() => {
    process.env.FENBI_SECRET = restore;
  });

  it("canStoreSecret() 为 true", () => {
    expect(canStoreSecret()).toBe(true);
  });

  it("中文/emoji 密码往返一致", () => {
    const plaintext = "P@ssw0rd-中文-🔐";
    const cipher = encryptSecret(plaintext);
    expect(cipher.startsWith("v1.")).toBe(true);
    expect(decryptSecret(cipher)).toBe(plaintext);
  });

  it("同一明文两次加密得到不同密文（IV 随机），但都能解回原文", () => {
    const first = encryptSecret("same-password");
    const second = encryptSecret("same-password");
    expect(first).not.toBe(second);
    expect(decryptSecret(first)).toBe("same-password");
    expect(decryptSecret(second)).toBe("same-password");
  });

  it("密文被篡改 → FenbiSecretDecryptError（GCM 认证失败）", () => {
    const cipher = encryptSecret("tamper-me");
    const parts = cipher.split(".");
    const payload = Buffer.from(parts[3], "base64");
    payload[0] ^= 0xff;
    parts[3] = payload.toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow(
      FenbiSecretDecryptError,
    );
  });

  it("换密钥后解密失败（不是拿到乱码）", () => {
    const cipher = encryptSecret("bound-to-old-key");
    process.env.FENBI_SECRET = crypto.randomBytes(32).toString("base64");
    expect(() => decryptSecret(cipher)).toThrow(FenbiSecretDecryptError);
  });

  it("格式不对（版本未知/段数不足）直接拒绝", () => {
    expect(() => decryptSecret("v2.a.b.c")).toThrow(FenbiSecretDecryptError);
    expect(() => decryptSecret("abc")).toThrow(FenbiSecretDecryptError);
  });
});

describe("maskPhone", () => {
  it("11 位手机号只保留前 3 后 4", () => {
    expect(maskPhone("13800000000")).toBe("138****0000");
  });

  it("带分隔符也能掩码（只按数字处理）", () => {
    expect(maskPhone("138-0000-0000")).toBe("138****0000");
  });

  it("空值返回 null；过短返回 ***（不泄露位数）", () => {
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone("")).toBeNull();
    expect(maskPhone("12345")).toBe("***");
  });
});
