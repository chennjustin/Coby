/**
 * 時區工具單元測試
 *
 * 執行方式：npx tsx src/__tests__/timezone.test.ts
 *
 * 驗證在 UTC 伺服器（如 Vercel）上，所有日期操作都能正確使用台灣時區。
 */

import assert from "assert";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { createTaiwanDate, toTaiwanDayjs, taiwanNow, taiwanYear } from "../lib/utils/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${e.message}`);
    failed++;
  }
}

console.log("\n=== timezone.ts 單元測試 ===\n");

// --- createTaiwanDate ---

test("createTaiwanDate: 12/20 23:59 應建立為台灣時間（UTC+8）", () => {
  const date = createTaiwanDate(2025, 12, 20, 23, 59);
  const tw = dayjs(date).tz("Asia/Taipei");
  assert.strictEqual(tw.year(), 2025);
  assert.strictEqual(tw.month(), 11); // 0-indexed
  assert.strictEqual(tw.date(), 20);
  assert.strictEqual(tw.hour(), 23);
  assert.strictEqual(tw.minute(), 59);
});

test("createTaiwanDate: 不應因 UTC 偏移導致日期+1", () => {
  // 在 UTC 伺服器上，台灣 23:59 = UTC 15:59，同一天
  // 如果誤用 new Date(2025, 11, 20, 23, 59)，UTC 伺服器上就是 UTC 12/20 23:59 = TW 12/21 07:59
  const date = createTaiwanDate(2025, 12, 20, 23, 59);
  const twDate = dayjs(date).tz("Asia/Taipei").format("YYYY-MM-DD");
  assert.strictEqual(twDate, "2025-12-20");
});

test("createTaiwanDate: 預設時間 00:00", () => {
  const date = createTaiwanDate(2025, 6, 15);
  const tw = dayjs(date).tz("Asia/Taipei");
  assert.strictEqual(tw.hour(), 0);
  assert.strictEqual(tw.minute(), 0);
});

test("createTaiwanDate: 跨年 12/31 23:59 不應變成隔年", () => {
  const date = createTaiwanDate(2025, 12, 31, 23, 59);
  const tw = dayjs(date).tz("Asia/Taipei");
  assert.strictEqual(tw.year(), 2025);
  assert.strictEqual(tw.month(), 11);
  assert.strictEqual(tw.date(), 31);
});

// --- toTaiwanDayjs ---

test("toTaiwanDayjs: 正確轉換 UTC Date 到台灣時區", () => {
  // UTC 2025-12-20T16:00:00Z = TW 2025-12-21T00:00:00+08:00
  const utcDate = new Date("2025-12-20T16:00:00Z");
  const tw = toTaiwanDayjs(utcDate);
  assert.strictEqual(tw.format("YYYY-MM-DD"), "2025-12-21");
  assert.strictEqual(tw.hour(), 0);
});

test("toTaiwanDayjs: 從 ISO string 轉換", () => {
  const tw = toTaiwanDayjs("2025-06-15T08:30:00Z");
  assert.strictEqual(tw.format("YYYY-MM-DD"), "2025-06-15");
  assert.strictEqual(tw.hour(), 16); // UTC+8
  assert.strictEqual(tw.minute(), 30);
});

// --- taiwanNow ---

test("taiwanNow: 回傳的時區為 Asia/Taipei", () => {
  const now = taiwanNow();
  // dayjs tz 物件的 utcOffset 應為 +480 分鐘 (UTC+8)
  assert.strictEqual(now.utcOffset(), 480);
});

// --- taiwanYear ---

test("taiwanYear: 回傳正整數年份", () => {
  const year = taiwanYear();
  assert.ok(year >= 2025, `年份應 >= 2025, 實際: ${year}`);
  assert.ok(year < 2100, `年份應 < 2100, 實際: ${year}`);
});

// --- calculateDaysLeft 模擬 ---

test("calculateDaysLeft 邏輯: 在 UTC 伺服器上正確計算台灣時區天數差", () => {
  // 模擬 deadline.service.ts 的 calculateDaysLeft 新邏輯
  function calculateDaysLeft(dueDate: Date): number {
    const today = taiwanNow().startOf("day");
    const due = toTaiwanDayjs(dueDate).startOf("day");
    return due.diff(today, "day");
  }

  // 建立一個明天的截止日（台灣時區）
  const tomorrow = taiwanNow().add(1, "day").startOf("day");
  const result = calculateDaysLeft(tomorrow.toDate());
  assert.strictEqual(result, 1, `明天的 deadline 應剩 1 天, 實際: ${result}`);

  // 今天的截止日
  const today = taiwanNow().startOf("day");
  const todayResult = calculateDaysLeft(today.toDate());
  assert.strictEqual(todayResult, 0, `今天的 deadline 應剩 0 天, 實際: ${todayResult}`);
});

// --- 總結 ---

console.log(`\n結果: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
