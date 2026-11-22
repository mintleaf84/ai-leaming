import QRCode from "qrcode";

/** 与前端展示尺寸一致（CSS 像素）；SVG 本身可缩放，这个值只决定模块密度。 */
export const QR_IMAGE_SIZE = 224;

/**
 * 把登录二维码内容渲染成 **内联 data URL**（SVG）。
 *
 * 为什么在服务端生成、并且不用第三方二维码图片服务：
 * - 之前前端拼的是 `https://api.qrserver.com/v1/create-qr-code/?data=…`，
 *   国内网络/受限网络下这个域名不可达，二维码就是一块空白（真实故障）；
 * - 把二维码内容（登录 token）发给第三方服务本身也没必要。
 *
 * 用 SVG + base64 而不是 PNG：不引入 canvas/pngjs，输出可缩放且体积更小。
 */
export async function buildQrDataUrl(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    width: QR_IMAGE_SIZE,
    errorCorrectionLevel: "M",
  });
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

/**
 * PNG 版本的 data URL，供移动端 `Image.memory` 使用。
 *
 * Flutter 不渲染 SVG 数据 URL（除非引入 flutter_svg），而 `qrcode` 在 Node 侧
 * 自带 pngjs，可以直接出 PNG，不必给 App 增加依赖。
 */
export async function buildQrPngDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, {
    type: "image/png",
    margin: 1,
    width: QR_IMAGE_SIZE,
    errorCorrectionLevel: "M",
  });
}
