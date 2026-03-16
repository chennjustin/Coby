# Coby 開發者說明

## 目錄結構與職責

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由（webhook、deadlines、study-blocks、schedule、conversations）
│   └── schedule/          # 時程表網頁
├── bot/
│   ├── handlers/          # 處理 LINE 事件，負責路由
│   │   ├── text.handler.ts    # 文字訊息路由（< 400 行）
│   │   ├── follow.handler.ts  # 關注事件
│   │   ├── deadline.handler.ts # Deadline 流程
│   │   └── ...
│   ├── controllers/       # 流程處理，組裝回應
│   │   ├── checkin.controller.ts
│   │   ├── schedule.controller.ts
│   │   ├── deadline.controller.ts
│   │   └── chat.controller.ts
│   └── utils.ts           # Quick Reply、sendMainMenu 等共用
├── lib/
│   ├── formatters/        # 顯示格式化
│   │   └── deadline-formatter.ts
│   ├── line/              # LINE API 客戶端
│   ├── llm/               # LLM 客戶端
│   └── utils/             # 工具函數（date、timezone、validation）
├── models/                # Mongoose 模型
├── services/              # 業務邏輯
└── types/                 # TypeScript 類型
```

## 事件處理流程

```
LINE Webhook
    → route.ts (驗證簽名、解析事件)
    → text.handler / follow.handler / unfollow.handler
    → text.handler 依關鍵字或意圖路由
    → controller (checkin / schedule / deadline / chat)
    → service (業務邏輯)
    → model (資料存取)
```

## 本地啟動與測試

1. 安裝依賴：

```bash
npm install
```

2. 設定環境變數：

```bash
cp .env.example .env
# 填入 MONGODB_URI, LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN, OPENAI_API_KEY, NEXT_PUBLIC_APP_URL
```

3. 啟動開發伺服器：

```bash
npm run dev
```

4. 執行測試：

```bash
npm run test
```

## 新增功能流程

若要新增功能（例如「待辦清單」或「提醒功能」）：

1. **新增 controller**：在 `src/bot/controllers/` 建立對應 controller（如 `todo.controller.ts`）
2. **在 handler 中路由**：在 `text.handler.ts` 加入關鍵字或意圖路由，呼叫新 controller
3. **必要時新增 service**：在 `src/services/` 建立業務邏輯
4. **必要時新增 model**：在 `src/models/` 建立對應 schema

## 時間處理

- 一律以 **UTC** 儲存到 MongoDB
- 顯示時使用 `formatForDisplay()` 或 `formatForDisplayLocale()` 轉為 `Asia/Taipei`
- 解析使用者輸入時使用 `parseToUTC()`，視為 `Asia/Taipei` 本地時間

## 重構變更摘要

- **新增**：`src/bot/controllers/`、`src/bot/utils.ts`、`src/lib/formatters/deadline-formatter.ts`、`src/lib/utils/timezone.ts`、`PERSONALITY.md`、`docs/DEVELOPMENT.md`、`src/__tests__/`
- **修改**：`text.handler.ts` 精簡為路由邏輯，`Deadline`、`StudyBlock` 新增 `timeZone` 欄位，多處 date 解析改用 `parseToUTC`、`formatForDisplay`
- **Bot 名稱**：統一為 Coby
