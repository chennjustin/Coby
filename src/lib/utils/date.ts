import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

export const TAIPEI_TIMEZONE = "Asia/Taipei";

/**
 * 取得台灣時區的當前時間
 */
export function getTaiwanNow(): dayjs.Dayjs {
  return dayjs().tz(TAIPEI_TIMEZONE);
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

/**
 * 將使用者輸入的日期時間字串（台灣語意）正規化為 UTC Date。
 * 支援：
 * - YYYY-MM-DD（會補 23:59）
 * - YYYY-MM-DDTHH:mm（視為台灣本地時間）
 * - ISO string（含 Z 或時區）
 */
export function parseTaipeiInputToUtc(input: string | Date): Date {
  if (input instanceof Date) {
    return new Date(input.toISOString());
  }

  const normalized = input.trim();
  if (!normalized) {
    throw new Error("日期時間不可為空");
  }

  // 已包含時區資訊的 ISO，直接交給 Date
  if (/[zZ]|[+-]\d{2}:\d{2}$/.test(normalized)) {
    const parsed = new Date(normalized);
    if (isNaN(parsed.getTime())) {
      throw new Error(`無效的日期時間格式: ${input}`);
    }
    return parsed;
  }

  // 只有日期，預設當天 23:59
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const taipei = dayjs.tz(`${normalized}T23:59`, TAIPEI_TIMEZONE);
    if (!taipei.isValid()) {
      throw new Error(`無效的日期格式: ${input}`);
    }
    return taipei.utc().toDate();
  }

  // 無時區 local datetime，視為台灣時間
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(normalized)) {
    const taipei = dayjs.tz(normalized, TAIPEI_TIMEZONE);
    if (!taipei.isValid()) {
      throw new Error(`無效的日期時間格式: ${input}`);
    }
    return taipei.utc().toDate();
  }

  // 其他格式再嘗試，仍以台灣語意處理
  const fallback = dayjs.tz(normalized, TAIPEI_TIMEZONE);
  if (!fallback.isValid()) {
    throw new Error(`無效的日期時間格式: ${input}`);
  }
  return fallback.utc().toDate();
}

/**
 * 將 UTC 或任意 Date 轉為台灣時區格式字串。
 */
export function formatUtcToTaipei(input: string | Date, format = "YYYY-MM-DD HH:mm"): string {
  const parsed = input instanceof Date ? dayjs(input) : dayjs(input);
  if (!parsed.isValid()) {
    throw new Error("無效的日期時間");
  }
  return parsed.tz(TAIPEI_TIMEZONE).format(format);
}

/**
 * 將日期範圍正規化為 UTC 邊界。
 * start -> 台灣時區當天 00:00
 * end -> 台灣時區當天 23:59:59.999
 */
export function normalizeDateRange(start?: string | Date, end?: string | Date): {
  start?: Date;
  end?: Date;
} {
  const normalized: { start?: Date; end?: Date } = {};

  if (start) {
    const startInput = typeof start === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start)
      ? `${start}T00:00`
      : start;
    const startDate = parseTaipeiInputToUtc(startInput);
    normalized.start = dayjs(startDate).utc().toDate();
  }

  if (end) {
    const endInput = typeof end === "string" && /^\d{4}-\d{2}-\d{2}$/.test(end)
      ? `${end}T23:59`
      : end;
    const endDate = parseTaipeiInputToUtc(endInput);
    normalized.end = dayjs(endDate).utc().toDate();
  }

  return normalized;
}

/**
 * 以台灣時區日界線計算剩餘天數（負數表示已過期）。
 */
export function calculateDaysLeftInTaipei(dueDate: Date): number {
  const today = getTaiwanNow().startOf("day");
  const due = dayjs(dueDate).tz(TAIPEI_TIMEZONE).startOf("day");
  return due.diff(today, "day");
}

