/**
 * 應用程式配置
 * 包含系統的基本設定，如當前年份等
 */

export const APP_CONFIG = {
  /**
   * 當前年份
   * 用於日期解析和 LLM prompt
   */
  CURRENT_YEAR: 2025,
  
  /**
   * 當前日期（台灣時區）
   * 格式：YYYY-MM-DD
   */
  get CURRENT_DATE(): string {
    const { getTodayString } = require("@/lib/utils/date");
    return getTodayString();
  },
  
  /**
   * 當前日期中文格式
   * 格式：YYYY年M月D日
   */
  get CURRENT_DATE_CHINESE(): string {
    const { getTodayChinese } = require("@/lib/utils/date");
    return getTodayChinese();
  },
  
  /**
   * 當前日期完整中文格式
   * 格式：YYYY年M月D日 星期X
   */
  get CURRENT_DATE_CHINESE_FULL(): string {
    const { getTodayChineseFull } = require("@/lib/utils/date");
    return getTodayChineseFull();
  },
} as const;

