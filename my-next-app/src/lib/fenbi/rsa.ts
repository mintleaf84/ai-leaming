/**
 * 粉笔登录密码加密（docs/fenbi-sync-design.md §2.1）。
 *
 * 粉笔前端用 RSA/PKCS#1 v1.5 加密密码后 base64 提交（JSEncrypt，指数 65537）。
 * 服务端没有私钥，只是照做：
 *
 *   password = base64(RSA_PKCS1_v1_5(utf8 密码, 粉笔公钥))
 *
 * ## 关于公钥的形态（踩过的坑）
 *
 * 设计文档里给的那串 base64 解出来是 **129 字节**：`0x00 || modulus(128)`，
 * 也就是 DER INTEGER 的内容，**不是**完整的 SubjectPublicKeyInfo（1024 位 SPKI
 * 应当是 162 字节）。直接交给 `crypto.createPublicKey` 会报
 * `asn1: header too long`。
 *
 * 所以这里的顺序是：
 * 1. 先按 SPKI / PKCS#1 直接解析（若将来换成完整 DER 也能用）；
 * 2. 失败时按"0x00 + 128 字节模数"手工拼 SPKI 再解析；
 * 3. 解析后强校验 1024 位 / e=65537，不符就抛错（宁可绑定失败，也不要拿错
 *    公钥把密码加密成一段谁也解不开的密文）。
 */

import crypto from "node:crypto";

/** 粉笔前端写死的公钥（docs/fenbi-sync-design.md §2.1） */
const FENBI_RSA_PUBLIC_KEY =
  "ANKi9PWuvDOsagwIVvrPx77mXNV0APmjySsYjB1/GtUTY6cyKNRl2RCTt608m9nYk5VeCG2EAZRQmQNQTyfZkw0Uo+MytAkjj17BXOpY4o6+BToi7rRKfTGl6J60/XBZcGSzN1XVZ80ElSjaGE8Ocg8wbPN18tbmsy761zN5SuIl";

const MODULUS_LENGTH = 128; // 1024 位
const PUBLIC_EXPONENT = 65537;
/**
 * PKCS#1 v1.5 加密上限：k - 11 字节（k=128）。超过就必须在调用方报"密码过长"，
 * 而不是让 OpenSSL 抛一个看不懂的错。
 */
export const MAX_PASSWORD_BYTES = MODULUS_LENGTH - 11;

export class FenbiPasswordEncryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FenbiPasswordEncryptError";
  }
}

/** DER 长度前缀（短/长格式都覆盖，这里只用到 < 256，仍写全） */
function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTlv(tag: number, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(value.length), value]);
}

/** DER INTEGER：去掉多余前导 0，并在最高位为 1 时补 0（保持正数语义） */
function derInteger(value: Buffer): Buffer {
  let trimmed = value;
  while (trimmed.length > 1 && trimmed[0] === 0) trimmed = trimmed.subarray(1);
  const body =
    trimmed[0] & 0x80 ? Buffer.concat([Buffer.from([0]), trimmed]) : trimmed;
  return derTlv(0x02, body);
}

/** 由裸模数拼出 SubjectPublicKeyInfo（rsaEncryption + NULL 参数） */
function buildSpki(modulus: Buffer): Buffer {
  const rsaPublicKey = derTlv(
    0x30,
    Buffer.concat([
      derInteger(modulus),
      derInteger(Buffer.from([0x01, 0x00, 0x01])),
    ]),
  );
  const algorithmIdentifier = derTlv(
    0x30,
    Buffer.concat([
      // OID 1.2.840.113549.1.1.1 (rsaEncryption)
      derTlv(0x06, Buffer.from("2a864886f70d010101", "hex")),
      Buffer.from([0x05, 0x00]), // NULL
    ]),
  );
  return derTlv(
    0x30,
    Buffer.concat([
      algorithmIdentifier,
      derTlv(0x03, Buffer.concat([Buffer.from([0x00]), rsaPublicKey])),
    ]),
  );
}

let cachedKey: crypto.KeyObject | null = null;

function resolvePublicKey(): crypto.KeyObject {
  if (cachedKey) return cachedKey;

  const der = Buffer.from(FENBI_RSA_PUBLIC_KEY.replace(/\s+/g, ""), "base64");
  const candidates: crypto.KeyObject[] = [];

  for (const type of ["spki", "pkcs1"] as const) {
    try {
      candidates.push(
        crypto.createPublicKey({ key: der, format: "der", type }),
      );
    } catch {
      // audit-allow: 两种 DER 形态解析失败是预期分支，随后按「裸模数」手工拼 SPKI
      continue; // 试下一种形态，失败原因不影响后续拼装
    }
  }

  if (candidates.length === 0) {
    if (der.length === MODULUS_LENGTH + 1 && der[0] === 0x00) {
      candidates.push(
        crypto.createPublicKey({
          key: buildSpki(der.subarray(1)),
          format: "der",
          type: "spki",
        }),
      );
    } else {
      throw new FenbiPasswordEncryptError("粉笔公钥格式无法识别");
    }
  }

  const key = candidates[0];
  const details = key.asymmetricKeyDetails;
  if (
    details?.modulusLength !== MODULUS_LENGTH * 8 ||
    Number(details.publicExponent) !== PUBLIC_EXPONENT
  ) {
    // 公钥不对时加密出来的密文服务端必然解不开，早点失败比"登录成功但同步失败"好
    throw new FenbiPasswordEncryptError(
      "粉笔公钥参数不符合预期（1024 位 / e=65537）",
    );
  }

  cachedKey = key;
  return key;
}

/**
 * 加密登录密码。
 * @throws FenbiPasswordEncryptError 密码超长（>117 字节）或公钥不可用
 */
export function encryptPassword(password: string): string {
  const raw = Buffer.from(password, "utf8");
  if (raw.length === 0) {
    throw new FenbiPasswordEncryptError("密码不能为空");
  }
  if (raw.length > MAX_PASSWORD_BYTES) {
    throw new FenbiPasswordEncryptError(
      `密码过长（${raw.length} 字节，上限 ${MAX_PASSWORD_BYTES} 字节）`,
    );
  }

  const encrypted = crypto.publicEncrypt(
    {
      key: resolvePublicKey(),
      padding: crypto.constants.RSA_PKCS1_PADDING,
    },
    raw,
  );

  // 1024 位 RSA 的输出恒为 128 字节，短了说明上面的 padding 选错了
  if (encrypted.length !== MODULUS_LENGTH) {
    throw new FenbiPasswordEncryptError("粉笔密码加密结果长度异常");
  }
  return encrypted.toString("base64");
}

/** 仅供测试：暴露公钥解析，验证"文档给的是 INTEGER 而非完整 SPKI" */
export const __test__ = { resolvePublicKey, buildSpki, derInteger };
