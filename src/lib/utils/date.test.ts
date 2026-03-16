import { describe, expect, it } from "vitest";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import {
  calculateDaysLeftInTaipei,
  formatUtcToTaipei,
  normalizeDateRange,
  parseTaipeiInputToUtc,
  TAIPEI_TIMEZONE,
} from "@/lib/utils/date";

dayjs.extend(utc);
dayjs.extend(timezone);

describe("date utils timezone safety", () => {
  it("將 YYYY-MM-DD 視為台灣當天 23:59 存成 UTC", () => {
    const date = parseTaipeiInputToUtc("2026-03-20");
    expect(date.toISOString()).toBe("2026-03-20T15:59:00.000Z");
  });

  it("將 YYYY-MM-DDTHH:mm 視為台灣本地時間", () => {
    const date = parseTaipeiInputToUtc("2026-03-20T09:30");
    expect(date.toISOString()).toBe("2026-03-20T01:30:00.000Z");
  });

  it("UTC 顯示回台灣時間格式正確", () => {
    const formatted = formatUtcToTaipei("2026-03-20T01:30:00.000Z", "YYYY-MM-DD HH:mm");
    expect(formatted).toBe("2026-03-20 09:30");
  });

  it("normalizeDateRange 會產生 UTC 範圍邊界", () => {
    const range = normalizeDateRange("2026-03-20", "2026-03-21");
    expect(range.start?.toISOString()).toBe("2026-03-19T16:00:00.000Z");
    expect(range.end?.toISOString()).toBe("2026-03-21T15:59:00.000Z");
  });

  it("跨日時段顯示仍保留台灣日期切分", () => {
    const startUtc = parseTaipeiInputToUtc("2026-03-20T23:30");
    const endUtc = parseTaipeiInputToUtc("2026-03-21T00:30");
    const startDisplay = formatUtcToTaipei(startUtc, "YYYY-MM-DD HH:mm");
    const endDisplay = formatUtcToTaipei(endUtc, "YYYY-MM-DD HH:mm");
    expect(startDisplay).toBe("2026-03-20 23:30");
    expect(endDisplay).toBe("2026-03-21 00:30");
  });
});

describe("days left calculation", () => {
  it("以台灣時區日界線計算剩餘天數", () => {
    const todayTaipei = dayjs().tz(TAIPEI_TIMEZONE).startOf("day");
    const tomorrowTaipei = todayTaipei.add(1, "day");
    const yesterdayTaipei = todayTaipei.subtract(1, "day");

    expect(calculateDaysLeftInTaipei(todayTaipei.toDate())).toBe(0);
    expect(calculateDaysLeftInTaipei(tomorrowTaipei.toDate())).toBe(1);
    expect(calculateDaysLeftInTaipei(yesterdayTaipei.toDate())).toBe(-1);
  });
});
