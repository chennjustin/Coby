/**
 * Rich Menu 配置
 * 四個按鈕：簽到、今日占卜、查看時程、新增 Deadline
 */

export const RICH_MENU_CONFIG = {
  size: {
    width: 2500,
    height: 1686,
  },
  selected: false,
  name: "Coby 主選單",
  chatBarText: "選單",
  areas: [
    // 左上：簽到
    {
      bounds: {
        x: 0,
        y: 0,
        width: 1250,
        height: 843,
      },
      action: {
        type: "message",
        text: "簽到",
      },
    },
    // 右上：今日占卜
    {
      bounds: {
        x: 1250,
        y: 0,
        width: 1250,
        height: 843,
      },
      action: {
        type: "message",
        text: "今日占卜",
      },
    },
    // 左下：查看時程
    {
      bounds: {
        x: 0,
        y: 843,
        width: 1250,
        height: 843,
      },
      action: {
        type: "message",
        text: "查看時程",
      },
    },
    // 右下：新增 Deadline
    {
      bounds: {
        x: 1250,
        y: 843,
        width: 1250,
        height: 843,
      },
      action: {
        type: "message",
        text: "新增 Deadline",
      },
    },
  ],
};

