import { Logger } from "@/lib/utils/logger";

/**
 * 取得應用程式的完整 URL（統一邏輯，避免多處重複）。
 * 優先順序：NEXT_PUBLIC_APP_URL > VERCEL_URL > localhost
 */
export function getAppUrl(): string {
  let appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    if (process.env.VERCEL_URL) {
      const vercelUrl = process.env.VERCEL_URL;
      appUrl =
        vercelUrl.startsWith("http://") || vercelUrl.startsWith("https://")
          ? vercelUrl
          : `https://${vercelUrl}`;
    } else {
      appUrl = "http://localhost:3000";
      Logger.warn("使用預設 localhost URL，請確認環境變數設定");
    }
  }

  appUrl = appUrl.replace(/\/$/, "");
  if (!appUrl.startsWith("http://") && !appUrl.startsWith("https://")) {
    appUrl = `https://${appUrl}`;
  }

  return appUrl;
}
