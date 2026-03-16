import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const TW_TZ = "Asia/Taipei";

/**
 * 以台灣時區建構 Date 物件。
 * 解決 Vercel (UTC) 上 `new Date(year, month-1, day)` 時區錯誤的根因。
 */
export function createTaiwanDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0
): Date {
  const padded = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${year}-${padded(month)}-${padded(day)} ${padded(hour)}:${padded(minute)}`;
  return dayjs.tz(dateStr, TW_TZ).toDate();
}

/**
 * 將任意 Date / ISO string 轉為台灣時區的 dayjs 物件。
 */
export function toTaiwanDayjs(date: Date | string): dayjs.Dayjs {
  return dayjs(date).tz(TW_TZ);
}

/**
 * 取得台灣時區「現在」的 dayjs 物件。
 */
export function taiwanNow(): dayjs.Dayjs {
  return dayjs().tz(TW_TZ);
}

/**
 * 取得台灣時區當前年份（動態）。
 */
export function taiwanYear(): number {
  return taiwanNow().year();
}

/**
 * 將使用者輸入的日期字串（視為 Asia/Taipei 本地時間）解析為 UTC Date。
 * @param dateStr 日期字串，例如 "2025-03-20" 或 "2025-03-20T14:00"
 * @param timeStr 可選的時間字串，例如 "09:00"；未提供時預設為 "23:59"
 */
export function parseToUTC(dateStr: string, timeStr?: string): Date {
  let input: string;
  if (timeStr) {
    const datePart = dateStr.split("T")[0];
    input = `${datePart} ${timeStr}`;
  } else if (dateStr.includes("T")) {
    input = dateStr.replace("T", " ");
  } else {
    input = `${dateStr} 23:59`;
  }
  return dayjs.tz(input, TW_TZ).toDate();
}

/**
 * 將 Date / ISO string 格式化為台灣時區的顯示字串。
 * @param date Date 物件或 ISO 字串
 * @param tz 時區（預設 Asia/Taipei）
 * @param format dayjs 格式字串（預設 "M月D日 HH:mm"）
 */
export function formatForDisplay(
  date: Date | string,
  tz: string = TW_TZ,
  format: string = "M月D日 HH:mm"
): string {
  return dayjs(date).tz(tz).format(format);
}

/**
 * 將 Date / ISO string 格式化為台灣時區的本地化顯示字串（含星期）。
 */
export function formatForDisplayLocale(date: Date | string): string {
  return dayjs(date).tz(TW_TZ).format("YYYY年M月D日（dd）HH:mm");
}
