import { IDeadline } from "@/models/Deadline";
import { DeadlineService } from "@/services/deadline/deadline.service";

/**
 * 建構「查看時程」Flex Message（包含 token URL 按鈕）
 */
export function buildScheduleViewFlexMessage(token: string, domain: string, deadlineCount: number = 0) {
  const scheduleUrl = `${domain}/schedule?token=${token}`;
  
  return {
    type: "flex",
    altText: "查看時程表",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "📅 我的時程表",
            weight: "bold",
            size: "xl",
            color: "#1DB446",
            align: "center",
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            margin: "lg",
            contents: [
              {
                type: "text",
                text: deadlineCount === 0 
                  ? "目前沒有任何待辦事項 🌈" 
                  : `你有 ${deadlineCount} 個待辦事項`,
                size: "md",
                color: "#666666",
                wrap: true,
              },
              {
                type: "text",
                text: "點擊下方按鈕開啟時程表頁面查看詳細資訊",
                size: "sm",
                color: "#999999",
                wrap: true,
                margin: "md",
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "📅 打開時程表",
              uri: scheduleUrl,
            },
            style: "primary",
            color: "#4ECDC4",
          },
        ],
      },
    },
  };
}

/**
 * 建構主選單 Flex Message（2x2 按鈕佈局）
 */
export function buildMainMenuFlexMessage() {
  return {
    type: "flex",
    altText: "主選單",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: "拯救期末大作戰",
            weight: "bold",
            size: "xl",
            color: "#1DB446",
            align: "center",
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "md",
            margin: "lg",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                spacing: "md",
                contents: [
                  {
                    type: "button",
                    action: {
                      type: "message",
                      label: "🍀 每日簽到",
                      text: "每日簽到",
                    },
                    style: "primary",
                    color: "#1DB446",
                    flex: 1,
                  },
                  {
                    type: "button",
                    action: {
                      type: "message",
                      label: "🔮 抽！！",
                      text: "今日占卜",
                    },
                    style: "primary",
                    color: "#FF6B6B",
                    flex: 1,
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                spacing: "md",
                contents: [
                  {
                    type: "button",
                    action: {
                      type: "message",
                      label: "📅 查看時程",
                      text: "查看時程",
                    },
                    style: "primary",
                    color: "#4ECDC4",
                    flex: 1,
                  },
                  {
                    type: "button",
                    action: {
                      type: "message",
                      label: "📝 新增死線",
                      text: "輸入 Deadline",
                    },
                    style: "primary",
                    color: "#FFE66D",
                    flex: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  };
}

/**
 * 建構 Deadline 詳情 Flex Message
 */
export function buildDeadlineDetailFlexMessage(deadline: IDeadline): {
  type: string;
  altText: string;
  contents: any;
} {
  const deadlineService = new DeadlineService();
  const daysLeft = deadlineService.calculateDaysLeft(deadline.dueDate);
  const daysText =
    daysLeft < 0
      ? `已過期 ${Math.abs(daysLeft)} 天`
      : daysLeft === 0
      ? "今天截止"
      : `剩餘 ${daysLeft} 天`;

  const typeEmoji = {
    exam: "📝",
    assignment: "📄",
    project: "📦",
    other: "📌",
  }[deadline.type];

  const typeText = {
    exam: "考試",
    assignment: "作業",
    project: "專題",
    other: "其他",
  }[deadline.type];

  const dateStr = deadline.dueDate.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    type: "flex",
    altText: `Deadline 詳情：${deadline.title}`,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "text",
            text: `${typeEmoji} ${deadline.title}`,
            weight: "bold",
            size: "xl",
            wrap: true,
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "md",
            margin: "lg",
            contents: [
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "類型：",
                    size: "sm",
                    color: "#666666",
                    flex: 0,
                  },
                  {
                    type: "text",
                    text: typeText,
                    size: "sm",
                    color: "#000000",
                    flex: 1,
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "截止日期：",
                    size: "sm",
                    color: "#666666",
                    flex: 0,
                  },
                  {
                    type: "text",
                    text: dateStr,
                    size: "sm",
                    color: "#000000",
                    flex: 1,
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "預估時間：",
                    size: "sm",
                    color: "#666666",
                    flex: 0,
                  },
                  {
                    type: "text",
                    text: `${deadline.estimatedHours} 小時`,
                    size: "sm",
                    color: "#000000",
                    flex: 1,
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "狀態：",
                    size: "sm",
                    color: "#666666",
                    flex: 0,
                  },
                  {
                    type: "text",
                    text: deadline.status === "done" ? "已完成" : "待處理",
                    size: "sm",
                    color: deadline.status === "done" ? "#1DB446" : "#000000",
                    weight: deadline.status === "done" ? "bold" : "regular",
                    flex: 1,
                  },
                ],
              },
              {
                type: "box",
                layout: "horizontal",
                contents: [
                  {
                    type: "text",
                    text: "剩餘時間：",
                    size: "sm",
                    color: "#666666",
                    flex: 0,
                  },
                  {
                    type: "text",
                    text: daysText,
                    size: "sm",
                    color: daysLeft < 0 ? "#FF0000" : "#000000",
                    weight: daysLeft < 0 ? "bold" : "regular",
                    flex: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            action: {
              type: "message",
              label: "✏️ 修改",
              text: `修改 Deadline ${deadline._id}`,
            },
            style: "primary",
            color: "#4ECDC4",
          },
          {
            type: "button",
            action: {
              type: "message",
              label: "✔️ 標記完成",
              text: `標記完成 ${deadline._id}`,
            },
            style: "primary",
            color: "#1DB446",
          },
          {
            type: "button",
            action: {
              type: "message",
              label: "🗑 刪除",
              text: `刪除 Deadline ${deadline._id}`,
            },
            style: "primary",
            color: "#FF6B6B",
          },
        ],
      },
    },
  };
}

/**
 * 建構快速回覆
 */
export function buildQuickReply(
  text: string,
  items: Array<{ label: string; text: string }>
): {
  type: string;
  text: string;
  quickReply?: {
    items: any[];
  };
} {
  return {
    type: "text",
    text,
    quickReply: {
      items: items.map((item) => ({
        type: "action",
        action: {
          type: "message",
          label: item.label,
          text: item.text,
        },
      })),
    },
  };
}

