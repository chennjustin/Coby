import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/** 預設時區（台灣） */
export const DEFAULT_TIMEZONE = "Asia/Taipei";

/**
 * 將日期字串解析為 UTC Date 物件
 * 輸入視為指定時區的本地時間，輸出為 UTC 儲存用
 *
 * @param dateStr 日期字串，格式 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm
 * @param timeStr 可選，時間字串 HH:mm（當 dateStr 只有日期時使用）
 * @param tz 時區，預設 Asia/Taipei
 * @returns UTC Date 物件，適合存入 MongoDB
 */
export function parseToUTC(
  dateStr: string,
  timeStr?: string,
  tz: string = DEFAULT_TIMEZONE
): Date {
  const trimmed = dateStr.trim();
  if (!trimmed) {
    throw new Error("dateStr 不可為空");
  }

  let input: string;
  if (timeStr) {
    const timeTrimmed = timeStr.trim();
    input = trimmed.includes("T") ? trimmed : `${trimmed}T${timeTrimmed}`;
  } else {
    input = trimmed;
  }

  // 若無完整時間部分（HH:mm），補上 23:59 作為當日截止
  const hasTime = /T\d{1,2}:\d{2}/.test(input);
  if (!hasTime) {
    input = input.replace(/T?$/, "T23:59");
  }

  // 若無時區，視為指定 tz 的本地時間
  if (!input.includes("+") && !input.includes("Z")) {
    const parsed = dayjs.tz(input, "YYYY-MM-DDTHH:mm", tz);
    if (!parsed.isValid()) {
      const fallback = dayjs.tz(input, "YYYY-MM-DD", tz).endOf("day");
      if (fallback.isValid()) {
        return fallback.utc().toDate();
      }
      throw new Error(`無法解析日期：${dateStr}`);
    }
    return parsed.utc().toDate();
  }

  // 已有時區或 Z，直接解析
  const parsed = dayjs(input);
  if (!parsed.isValid()) {
    throw new Error(`無法解析日期：${dateStr}`);
  }
  return parsed.utc().toDate();
}

/**
 * 將 UTC Date 格式化為顯示用字串（指定時區）
 *
 * @param date UTC Date 或 ISO 字串
 * @param tz 顯示時區，預設 Asia/Taipei
 * @param format 可選，dayjs 格式，預設為中文日期
 * @returns 格式化後的字串
 */
export function formatForDisplay(
  date: Date | string,
  tz: string = DEFAULT_TIMEZONE,
  format?: string
): string {
  const d = dayjs.utc(date).tz(tz);
  if (!d.isValid()) {
    return String(date);
  }
  if (format) {
    return d.format(format);
  }
  return d.format("YYYY年M月D日 HH:mm");
}

/**
 * 將 UTC Date 格式化為 zh-TW 的 toLocaleDateString 風格
 * 用於與現有 toLocaleDateString 相容的顯示
 */
export function formatForDisplayLocale(
  date: Date | string,
  tz: string = DEFAULT_TIMEZONE,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = dayjs.utc(date).tz(tz);
  if (!d.isValid()) {
    return String(date);
  }
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...options,
  };
  return d.toDate().toLocaleDateString("zh-TW", defaultOptions);
}
