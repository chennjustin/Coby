import crypto from "crypto";

/**
 * 生成安全的 viewToken
 * 使用 crypto.randomBytes 生成 32 bytes，轉換為 64 字元的 hex 字串
 */
export function generateViewToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

