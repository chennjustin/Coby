import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 取得台灣時區的當前時間
 */
export function getTaiwanNow(): dayjs.Dayjs {
  return dayjs().tz("Asia/Taipei");
}

/**
 * 取得台灣時區的今天日期（只取日期部分，時間設為 00:00:00）
 */
export function getTodayInTaiwan(): Date {
  return getTaiwanNow().startOf("day").toDate();
}

/**
 * 取得台灣時區的今天日期字串（YYYY-MM-DD）
 */
export function getTodayString(): string {
  return getTaiwanNow().format("YYYY-MM-DD");
}

/**
 * 取得台灣時區的今天日期中文格式（例如：2025年11月25日）
 */
export function getTodayChinese(): string {
  return getTaiwanNow().format("YYYY年M月D日");
}

/**
 * 取得台灣時區的今天日期完整中文格式（例如：2025年11月25日 星期一）
 */
export function getTodayChineseFull(): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdays[getTaiwanNow().day()];
  return `${getTaiwanNow().format("YYYY年M月D日")} 星期${weekday}`;
}

/**
 * 取得台灣時區的當前完整日期時間字串（ISO 8601格式）
 * 例如：2025-11-26T14:30:00+08:00
 */
export function getCurrentDateTime(): string {
  return getTaiwanNow().toISOString();
}

/**
 * 取得台灣時區的當前日期時間中文格式（例如：2025年11月26日 星期三 14:30）
 */
export function getCurrentDateTimeChinese(): string {
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const weekday = weekdays[getTaiwanNow().day()];
  return `${getTaiwanNow().format("YYYY年M月D日")} 星期${weekday} ${getTaiwanNow().format("HH:mm")}`;
}

