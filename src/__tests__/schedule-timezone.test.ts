import { describe, it, expect } from "vitest";
import { parseToUTC, formatForDisplay } from "@/lib/utils/timezone";

/**
 * 驗證行事曆相關的日期處理在各種情境下正確
 * 確保「跑掉」問題不會發生
 */
describe("行事曆日期處理", () => {
  it("截止日期 23:59 應正確解析為當日最後一刻", () => {
    const dueDate = parseToUTC("2025-03-20"); // 預設 23:59
    const display = formatForDisplay(dueDate);
    expect(display).toContain("23:59");
    expect(display).toContain("3月20日");
  });

  it("學習時段 09:00-11:00 應正確解析", () => {
    const start = parseToUTC("2025-03-20", "09:00");
    const end = parseToUTC("2025-03-20", "11:00");
    expect(start.getTime()).toBeLessThan(end.getTime());
    expect(formatForDisplay(start)).toContain("09:00");
    expect(formatForDisplay(end)).toContain("11:00");
  });

  it("跨日不應發生：同一天的不同時段應保持同一天", () => {
    const morning = parseToUTC("2025-03-20", "08:00");
    const evening = parseToUTC("2025-03-20", "22:00");
    expect(morning.getUTCDate()).toBe(evening.getUTCDate());
  });

  it("ISO 字串往返應保持一致", () => {
    const original = parseToUTC("2025-06-15T14:00");
    const iso = original.toISOString();
    const display = formatForDisplay(iso);
    // 14:00 Asia/Taipei 存為 UTC 後，顯示應還原為 14:00
    expect(display).toContain("14:00");
    expect(display).toContain("6月15日");
  });
});
