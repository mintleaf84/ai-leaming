/**
 * 粉笔账号凭据的加密与脱敏（docs/fenbi-sync-design.md §3）。
 *
 * ## 密钥来源（两级，见设计文档 §8）
 *
 * 1. `FENBI_SECRET`：专用密钥，必须是 32 字节 base64。配了就用它。
 * 2. 未配时从 `JWT_SECRET` 用 **HKDF-SHA256** 派生（info = `fenbi-cred-v1`）。
 *    这是「密钥分离」的标准做法（RFC 5869）：同一个根秘密派生出用途独立的子密钥，
 *    而不是把根秘密直接当 AES 密钥用。
 *
 * 配了 `FENBI_SECRET` 但格式非法时**fail closed**（拒绝加密），不会悄悄回退到
 * 派生——写错的密钥被当成另一个"合法密钥"用，比直接报错危险得多。
 *
 * 轮换语义：换 `JWT_SECRET`（派生根变化）会让所有已绑定账号解不开，必须重新绑定。
 * 已在文档里写明，不要在无迁移脚本的情况下轮换。
 *
 * ## 存储格式
 *
 * `v1.<iv-b64>.<tag-b64>.<ciphertext-b64>`：首段版本号，将来换算法时可以
 * 同时读旧格式、写新格式。IV 每次随机（GCM 下复用 IV 是致命的）。
 *
 * ## 不做的事
 *
 * 不记录任何明文、密文、手机号到日志。`maskPhone` 是唯一允许出现在
 * 日志/接口里的手机号形态。
 */

import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM 推荐 12 字节
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256
const FORMAT_VERSION = "v1";

/** 密钥缺失/不合格：调用方应回退到扫码绑定，而不是重试 */
export class FenbiSecretUnavailableError extends Error {
  constructor(
    message = "服务端缺少可用的加密密钥（FENBI_SECRET 或 JWT_SECRET），无法保存粉笔凭据",
  ) {
    super(message);
    this.name = "FenbiSecretUnavailableError";
  }
}

/** 密文损坏 / 密钥换过：与"密钥缺失"不同，这是数据问题 */
export class FenbiSecretDecryptError extends Error {
  constructor(message = "粉笔凭据解密失败，请重新绑定账号") {
    super(message);
    this.name = "FenbiSecretDecryptError";
  }
}

/** HKDF 的用途标签：换它等于换密钥，已绑定的账号会解不开 */
const DERIVE_INFO = "fenbi-cred-v1";
/** HKDF salt 留空即可（根秘密已有足够熵），显式写出来避免有人改动 */
const DERIVE_SALT = Buffer.alloc(0);

/**
 * 读取加密密钥。
 *
 * 优先 `FENBI_SECRET`（32 字节 base64）；未配置时从 `JWT_SECRET` 派生。
 * 配了但格式非法 → 返回 null（fail closed，不回退派生）。
 *
 * 每次调用都重新读环境变量（不缓存）：测试要在同一个进程里模拟"密钥缺失"，
 * 缓存会让第二次断言永远拿到第一次的密钥。
 */
function readSecret(): Buffer | null {
  const raw = process.env.FENBI_SECRET?.trim();
  if (raw) {
    // base64 只允许标准字符集：Buffer.from 对非法字符是静默丢弃的，
    // 不校验就会把「写错的密钥」当成另一个合法密钥用。
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) return null;
    if (raw.length % 4 !== 0) return null;

    const key = Buffer.from(raw, "base64");
    if (key.length !== KEY_LENGTH) return null;
    return key;
  }

  const root = process.env.JWT_SECRET?.trim();
  if (!root) return null;

  // HKDF-SHA256：同一根秘密 + 固定 info 得到稳定的 32 字节子密钥。
  // 与直接复用根秘密相比，JWT 的 HMAC 使用面不会碰到这把 AES 密钥。
  const derived = crypto.hkdfSync(
    "sha256",
    Buffer.from(root, "utf8"),
    DERIVE_SALT,
    Buffer.from(DERIVE_INFO, "utf8"),
    KEY_LENGTH,
  );
  return Buffer.from(derived);
}

/** 服务端是否具备保存凭据的条件（有专用密钥或可派生的 JWT_SECRET） */
export function canStoreSecret(): boolean {
  return readSecret() !== null;
}

/**
 * AES-256-GCM 加密。
 * @throws FenbiSecretUnavailableError 密钥缺失或不是 32 字节 base64
 */
export function encryptSecret(plaintext: string): string {
  const key = readSecret();
  if (!key) throw new FenbiSecretUnavailableError();

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/**
 * AES-256-GCM 解密。
 * @throws FenbiSecretUnavailableError 密钥缺失
 * @throws FenbiSecretDecryptError 格式不对、认证失败（篡改或换过密钥）
 */
export function decryptSecret(payload: string): string {
  const key = readSecret();
  if (!key) throw new FenbiSecretUnavailableError();

  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new FenbiSecretDecryptError();
  }

  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
      throw new FenbiSecretDecryptError();
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof FenbiSecretDecryptError) throw error;
    // 认证失败的具体原因（长度/密钥不对）不进日志：里面可能带密文片段
    throw new FenbiSecretDecryptError();
  }
}

/**
 * 手机号掩码：只保留前 3 位与后 4 位（`138****0000`）。
 *
 * 任何日志、错误、埋点里出现手机号都必须先过这一层（设计文档 §3 硬约束）。
 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return "***";
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

/** 供 test 覆盖"密钥形态"分支时复用，运行时不做校验以外的事 */
export const __test__ = { KEY_LENGTH, IV_LENGTH, TAG_LENGTH, FORMAT_VERSION };
