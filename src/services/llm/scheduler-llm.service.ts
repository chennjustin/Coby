import { OpenAIClient } from "@/lib/llm/openai";
import { Logger } from "@/lib/utils/logger";
import { LLMMessage } from "@/lib/llm/client";
import { IDeadline } from "@/models/Deadline";
import { IStudyBlock } from "@/models/StudyBlock";
import { UserPreferences } from "./preference-extractor.service";
import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { getCurrentDateTimeChinese } from "@/lib/utils/date";
import { APP_CONFIG } from "@/lib/config/app.config";

dayjs.extend(utc);
dayjs.extend(timezone);

export interface LLMScheduleBlock {
  date: string; // YYYY-MM-DD
  startTime: string; // ISO 8601 format with timezone
  endTime: string; // ISO 8601 format with timezone
  duration: number; // hours
  blockIndex: number;
  totalBlocks: number;
}

export interface LLMScheduleResult {
  blocks: LLMScheduleBlock[];
  totalHours: number;
  reasoning?: string;
}

export class SchedulerLLMService {
  private llmClient: OpenAIClient;

  constructor() {
    this.llmClient = new OpenAIClient();
  }

  /**
   * 使用 LLM 生成排程建議
   */
  async generateSchedule(
    deadline: IDeadline,
    existingDeadlines: IDeadline[],
    existingStudyBlocks: IStudyBlock[],
    preferences: UserPreferences,
    availableSlots: Map<string, boolean[]>
  ): Promise<LLMScheduleResult | null> {
    try {
      const now = dayjs().tz("Asia/Taipei");
      const dueDate = dayjs(deadline.dueDate).tz("Asia/Taipei");
      const estimatedHours = deadline.estimatedHours;

      // 格式化現有行程
      const existingScheduleText = this.formatExistingSchedule(
        existingDeadlines,
        existingStudyBlocks,
        now,
        dueDate
      );

      // 格式化可用時間
      const availableSlotsText = this.formatAvailableSlots(
        availableSlots,
        now,
        dueDate
      );

      // 格式化偏好
      const preferencesText = this.formatPreferences(preferences);

      const prompt = `你是一個智能排程系統，專門為大學生安排學習時間。

**任務資訊：**
- 標題：${deadline.title}
- 類型：${deadline.type}
- 截止日期：${dueDate.format("YYYY年M月D日 HH:mm")}
- 預估時數：${estimatedHours} 小時
- 當前時間：${getCurrentDateTimeChinese()}（${APP_CONFIG.CURRENT_YEAR}年）

**排程規則（非常重要，必須嚴格遵守）：**
1. **絕對禁止時段（絕對不能安排任何學習時間）：**
   - 00:00-08:00（凌晨0點到早上8點）
   - 23:00-24:00（晚上11點到午夜12點）
   - 範例：不能安排 01:00、02:00、07:00、23:00 等時間
   - **重要：任何跨越這些時段的時間段都不允許，例如 00:30-02:00、23:30-00:30 等**
2. **允許時段：08:00-23:00（早上8點到晚上11點）**
3. 每天最大讀書時間：4 小時
4. 每天最多 blocks：2 個
5. 必須在截止日期之前完成所有時數
6. 不能安排在過去的時間
7. 不能與現有行程衝突

**用戶偏好：**
${preferencesText}

**現有行程：**
${existingScheduleText}

**可用時間區間：**
${availableSlotsText}

**重要要求：**
1. **必須安排完整的 ${estimatedHours} 小時，不能少於預估時數，這是絕對要求！**
2. 如果用戶有偏好（如「不要在早上」），必須遵守
3. 優先使用偏好時段，如果不可用則使用其他可用時段
4. 合理分散時間，避免集中在一天
5. 每個 block 建議 1-2 小時
6. **絕對不能安排在禁止時段（00:00-08:00），即使只有一小時也不行！**
7. **所有時間必須在 08:00-24:00 之間，例如：08:00-10:00、09:00-11:00、14:00-16:00、23:00-24:00 等**

**輸出格式：**
請以 JSON 格式輸出，格式如下：
{
  "blocks": [
    {
      "date": "2025-11-27",
      "startTime": "2025-11-27T09:00:00+08:00",
      "endTime": "2025-11-27T11:00:00+08:00",
      "duration": 2,
      "blockIndex": 1,
      "totalBlocks": 4
    }
  ],
  "totalHours": 8,
  "reasoning": "根據你的偏好，我將學習時間安排在下午和晚上，避開早上時段..."
}

**注意：**
- 所有時間必須使用 ISO 8601 格式，時區為 +08:00（台灣時區）
- date 格式為 YYYY-MM-DD
- startTime 和 endTime 必須包含完整的日期時間和時區
- totalHours 必須等於所有 blocks 的 duration 總和
- totalHours 必須等於 ${estimatedHours}
- blockIndex 從 1 開始
- totalBlocks 必須等於 blocks 陣列的長度

請只返回 JSON，不要有其他文字。`;

      const messages: LLMMessage[] = [
        {
          role: "system",
          content:
            "你是一個智能排程系統。請只返回 JSON 格式的結果，不要有其他文字。\n\n**絕對禁止時段（必須嚴格遵守）：**\n- 00:00-08:00（凌晨0點到早上8點）\n- 23:00-24:00（晚上11點到午夜12點）\n\n**允許時段：08:00-23:00（早上8點到晚上11點）**\n\n確保所有時間都在允許時段內，絕對不能安排在禁止時段。",
        },
        {
          role: "user",
          content: prompt,
        },
      ];

      const response = await this.llmClient.chat(messages);

      // 解析 JSON（可能包含 markdown code block）
      let jsonStr = response.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "");
      }

      const result = JSON.parse(jsonStr) as LLMScheduleResult;

      Logger.info("LLM 排程成功", {
        deadlineId: deadline._id,
        blocksCount: result.blocks.length,
        totalHours: result.totalHours,
      });

      return result;
    } catch (error) {
      Logger.error("LLM 排程失敗", { error, deadlineId: deadline._id });
      return null;
    }
  }

  /**
   * 格式化現有行程
   */
  private formatExistingSchedule(
    deadlines: IDeadline[],
    studyBlocks: IStudyBlock[],
    now: dayjs.Dayjs,
    dueDate: dayjs.Dayjs
  ): string {
    let text = "";

    // 其他 deadlines
    const otherDeadlines = deadlines.filter(
      (d) => dayjs(d.dueDate).isBefore(dueDate) || dayjs(d.dueDate).isSame(dueDate)
    );
    if (otherDeadlines.length > 0) {
      text += "其他 Deadlines：\n";
      otherDeadlines.forEach((d) => {
        text += `- ${d.title}（${d.type}），截止：${dayjs(d.dueDate).format("M月D日 HH:mm")}，預估 ${d.estimatedHours} 小時\n`;
      });
    }

    // 現有 study blocks
    const relevantBlocks = studyBlocks.filter((b) => {
      const blockDate = dayjs(b.startTime);
      return (
        blockDate.isAfter(now) &&
        (blockDate.isBefore(dueDate) || blockDate.isSame(dueDate, "day"))
      );
    });

    if (relevantBlocks.length > 0) {
      text += "\n已安排的學習時間：\n";
      const blocksByDate = new Map<string, IStudyBlock[]>();
      relevantBlocks.forEach((b) => {
        const dateKey = dayjs(b.startTime).format("YYYY-MM-DD");
        if (!blocksByDate.has(dateKey)) {
          blocksByDate.set(dateKey, []);
        }
        blocksByDate.get(dateKey)!.push(b);
      });

      blocksByDate.forEach((blocks, dateKey) => {
        text += `${dateKey}：\n`;
        blocks.forEach((b) => {
          const start = dayjs(b.startTime).format("HH:mm");
          const end = dayjs(b.endTime).format("HH:mm");
          text += `  - ${start}-${end}（${b.duration}小時）：${b.title}\n`;
        });
      });
    }

    return text || "無現有行程";
  }

  /**
   * 格式化可用時間區間
   */
  private formatAvailableSlots(
    availableSlots: Map<string, boolean[]>,
    now: dayjs.Dayjs,
    dueDate: dayjs.Dayjs
  ): string {
    let text = "";
    let current = now.startOf("day");
    const slots: string[] = [];

    while (current.isBefore(dueDate) || current.isSame(dueDate, "day")) {
      const dateKey = current.format("YYYY-MM-DD");
      const hours = availableSlots.get(dateKey);
      if (hours) {
        const availableHours: number[] = [];
        for (let h = 0; h < 24; h++) {
          if (hours[h]) {
            availableHours.push(h);
          }
        }
        if (availableHours.length > 0) {
          // 將連續的小時合併成時段
          const ranges: string[] = [];
          let start = availableHours[0];
          let end = availableHours[0];

          for (let i = 1; i < availableHours.length; i++) {
            if (availableHours[i] === end + 1) {
              end = availableHours[i];
            } else {
              ranges.push(
                start === end
                  ? `${start}:00`
                  : `${start}:00-${end + 1}:00`
              );
              start = availableHours[i];
              end = availableHours[i];
            }
          }
          ranges.push(
            start === end ? `${start}:00` : `${start}:00-${end + 1}:00`
          );

          slots.push(`${dateKey}：${ranges.join(", ")}`);
        }
      }
      current = current.add(1, "day");
    }

    return slots.length > 0 ? slots.join("\n") : "無可用時間";
  }

  /**
   * 格式化偏好
   */
  private formatPreferences(preferences: UserPreferences): string {
    if (
      !preferences.excludeHours &&
      !preferences.preferHours &&
      !preferences.excludeDays &&
      !preferences.maxHoursPerDay
    ) {
      return "無特殊偏好";
    }

    let text = "";
    if (preferences.excludeHours && preferences.excludeHours.length > 0) {
      const hours = preferences.excludeHours.sort((a, b) => a - b);
      text += `排除時段：${hours.join(", ")}點\n`;
    }
    if (preferences.preferHours && preferences.preferHours.length > 0) {
      const hours = preferences.preferHours.sort((a, b) => a - b);
      text += `偏好時段：${hours.join(", ")}點\n`;
    }
    if (preferences.excludeDays && preferences.excludeDays.length > 0) {
      text += `排除日期：${preferences.excludeDays.join(", ")}\n`;
    }
    if (preferences.maxHoursPerDay) {
      text += `每天最大時數：${preferences.maxHoursPerDay} 小時\n`;
    }

    return text.trim();
  }
}

