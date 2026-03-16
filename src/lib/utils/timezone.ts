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
