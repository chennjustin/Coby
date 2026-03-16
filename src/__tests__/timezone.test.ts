import { describe, it, expect } from "vitest";
import { parseToUTC, formatForDisplay, formatForDisplayLocale, DEFAULT_TIMEZONE } from "@/lib/utils/timezone";

describe("parseToUTC", () => {
  it("應正確解析 YYYY-MM-DD 格式為當日 23:59 Asia/Taipei", () => {
    const result = parseToUTC("2025-03-20");
    expect(result).toBeInstanceOf(Date);
    // 2025-03-20 23:59 Asia/Taipei = 2025-03-20 15:59 UTC
    expect(result.getUTCHours()).toBe(15);
    expect(result.getUTCMinutes()).toBe(59);
    expect(result.getUTCDate()).toBe(20);
  });

  it("應正確解析 YYYY-MM-DDTHH:mm 格式", () => {
    const result = parseToUTC("2025-03-20T18:00");
    expect(result).toBeInstanceOf(Date);
    // 2025-03-20 18:00 Asia/Taipei = 2025-03-20 10:00 UTC
    expect(result.getUTCHours()).toBe(10);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it("應正確解析分開的 dateStr 和 timeStr", () => {
    const result = parseToUTC("2025-12-25", "14:30");
    expect(result).toBeInstanceOf(Date);
    // 2025-12-25 14:30 Asia/Taipei = 2025-12-25 06:30 UTC
    expect(result.getUTCHours()).toBe(6);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("跨日情境：應正確處理 23:00 之後", () => {
    const result = parseToUTC("2025-03-21T23:30");
    expect(result).toBeInstanceOf(Date);
    // 2025-03-21 23:30 Asia/Taipei = 2025-03-21 15:30 UTC
    expect(result.getUTCDate()).toBe(21);
    expect(result.getUTCHours()).toBe(15);
  });

  it("空字串應拋出錯誤", () => {
    expect(() => parseToUTC("")).toThrow();
  });
});

describe("formatForDisplay", () => {
  it("應將 UTC Date 格式化為 Asia/Taipei 顯示", () => {
    // 2025-03-20 10:00 UTC = 2025-03-20 18:00 Asia/Taipei
    const utcDate = new Date("2025-03-20T10:00:00.000Z");
    const result = formatForDisplay(utcDate);
    expect(result).toContain("18:00");
    expect(result).toContain("2025");
  });

  it("應支援自訂格式", () => {
    const utcDate = new Date("2025-03-20T10:00:00.000Z");
    const result = formatForDisplay(utcDate, DEFAULT_TIMEZONE, "YYYY-MM-DD");
    expect(result).toBe("2025-03-20");
  });

  it("應支援 ISO 字串輸入", () => {
    const result = formatForDisplay("2025-03-20T10:00:00.000Z");
    expect(result).toContain("18:00");
  });
});

describe("formatForDisplayLocale", () => {
  it("應產生 zh-TW 風格的日期字串", () => {
    const utcDate = new Date("2025-03-20T10:00:00.000Z");
    const result = formatForDisplayLocale(utcDate);
    expect(result).toMatch(/\d{4}年/);
    expect(result).toMatch(/\d+月/);
    expect(result).toMatch(/\d+日/);
  });
});
