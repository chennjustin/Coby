# Coby

# LINE ID 在這：@445kyihz

# 後台網址：https://saving-the-finals.vercel.app/

## 專案簡介

「Coby」是一個整合 LINE Messaging API 的智能時間管理助手，使用 LLM 進行自然語言理解，自動為使用者的作業、專題和考試安排學習時程。系統會根據截止日期、使用者偏好和現有行程，分配學習時間，讓用戶不再因為忘記作業而熬夜趕工。

## 核心功能

### 每日簽到

記錄用戶的連續簽到天數，簽到後會自動顯示今天的待辦事項和今日占卜。

**使用方式：**

- 輸入「簽到」或「每日簽到」
- 點擊 Quick Reply 按鈕
- 手機版可透過 Rich Menu 點擊

### 今日占卜

使用 LLM 生成專屬的占卜內容，包含讀書指數、耍廢指數、幸運時段和建議。每次抽到的內容都不一樣。

**使用方式：**

- 輸入「今日占卜」、「占卜」或「抽!!!」
- 點擊 Quick Reply 按鈕
- 手機版可透過 Rich Menu 點擊

### 查看時程

提供個人專屬的學習時程表網頁，顯示所有已安排的學習時間段和所有 Deadline。支援拖曳調整時間、縮放調整時長等功能。

**使用方式：**

- 輸入「查看時程」、「時程」、「今天要幹嘛」等
- Bot 會發送帶有 token 驗證的時程表連結
- 也可直接詢問 Bot 今日或指定日期的待辦事項

### 新增 Deadline

記錄作業、專題、考試等死線，系統會自動為你安排學習時間。

**支援兩種輸入方式：**

- **一句話輸入**：直接說出所有資訊，例如「我下週一有網服作業要交，大概要 8 小時」
- **步驟輸入**：Bot 會引導你逐步填寫標題、類型、截止日期和預估時間

**使用方式：**

- 輸入「新增 Deadline」或「新增死線」
- 點擊 Quick Reply 按鈕
- 手機版可透過 Rich Menu 點擊

### 修改、刪除 Deadline

可以透過自然語言與 Bot 溝通來修改或刪除 Deadline。修改時系統會自動重新排程，刪除時會同時刪除所有相關的學習時程。

**使用方式：**

- 直接跟 Bot 說，例如「我想要更改我的deadline」、「修改deadline」、「我不需要這個deadline了」
- LLM 會自動識別你的意圖並執行操作

### 修改時程

當系統自動排的時間不符合你的習慣時，可以透過自然語言告訴 Bot 你想要怎麼調整。

**支援的調整：**

- 時段偏好（例如：都擺在早上、一次三小時）
- 排除特定日期（例如：29跟30沒時間）
- 排除特定時段（例如：不要在早上）
- 同時修改截止日期和時程偏好

**使用方式：**

- 直接跟 Bot 說，例如「我想要把做專題的時間都擺在早上」、「我29跟30沒時間，幫我排開」
- 系統會自動識別意圖並重新排程

## 技術棧

- **框架**: Next.js 14+ (App Router) + TypeScript
- **資料庫**: MongoDB Atlas + Mongoose
- **向量儲存**: Qdrant Cloud（Mem0 記憶用）
- **LINE API**: Line Messaging API + Loading Indicator
- **LLM**: OpenAI (GPT-4o-mini / GPT-4)
- **長期記憶**: Mem0 OSS（RAG 增強回應）
- **樣式**: Tailwind CSS
- **日期處理**: Day.js
- **拖曳功能**: react-beautiful-dnd
- **驗證**: Zod

### 記憶系統 (Mem0)

- 每次聊天結束後，對話會自動儲存到 Mem0（向量化記憶）和 MongoDB（SavedItem 原始記錄）
- 下次對話時透過語意搜尋檢索相關記憶，注入 system prompt 實現個人化回應
- 簽到時會結合記憶生成個人化回饋（FeedbackService）
- 當使用者問學習建議時，會結合記憶生成個人化推薦（RecommendationService）

### 快取機制

專案使用 in-memory TTL Cache（`src/lib/utils/ttl-cache.ts`）降低重複的外部 API 呼叫：

| 快取目標 | TTL | 說明 |
|----------|-----|------|
| Mem0 搜尋結果 | 60 秒 | 同一 user + query 不重打 Qdrant |
| Intent 意圖識別 | 30 秒 | 同一句話不重跑 LLM 意圖分類 |
| 日期解析 | 30 秒 | 同一句話不重跑 LLM 日期提取 |

在 Vercel Serverless 環境下，每次 cold start 快取會自動清空，不需額外管理。新增記憶或刪除記憶時會自動清除對應的搜尋快取。

## 環境變數設定

建立 `.env.local` 檔案，填入以下變數（完整範例見 `.env.example`）：

```env
# Line Messaging API
LINE_CHANNEL_SECRET=your_line_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=your_line_channel_access_token

# LLM (OpenAI)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/line-bot?retryWrites=true&w=majority

# Mem0 Memory (Qdrant Cloud)
MEMORY_PROVIDER=mem0_oss
QDRANT_URL=https://your-cluster.region.cloud.qdrant.io
QDRANT_API_KEY=your_qdrant_api_key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### MongoDB Atlas 設定

1. 前往 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) 註冊免費帳號
2. 建立免費叢集（M0）
3. 設定資料庫使用者和網路存取權限
4. 取得連線字串並填入 `MONGODB_URI`

### LINE Bot 設定

1. 前往 [Line Developers](https://developers.line.biz/) 建立 Provider 和 Channel
2. 取得 Channel Secret 和 Channel Access Token
3. 設定 Webhook URL：`https://your-domain.com/api/webhook/line`
4. 啟用 Webhook

## 安裝與執行

1. 安裝依賴：

```bash
npm install
```

2. 設定環境變數（見上方）
3. 執行開發伺服器：

```bash
npm run dev
```

4. 開啟瀏覽器訪問 `http://localhost:3000`

## 專案結構

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   │   ├── webhook/       # LINE Webhook
│   │   ├── deadlines/     # Deadline API
│   │   ├── study-blocks/  # Study Block API
│   │   └── schedule/      # Schedule API
│   └── schedule/          # 時程表頁面
├── bot/                   # Bot 處理器
│   └── handlers/         # 訊息處理器
├── components/            # React 元件
│   ├── schedule/         # 時程表相關元件
│   └── ui/               # UI 元件
├── hooks/                 # React Hooks
├── lib/                   # 工具函數與配置
│   ├── line/             # LINE API 客戶端
│   ├── llm/              # LLM 客戶端
│   └── utils/            # 工具函數
├── models/                # Mongoose 資料模型
├── services/              # 業務邏輯層
│   ├── deadline/         # Deadline 服務
│   ├── llm/              # LLM 服務（意圖識別、排程等）
│   ├── scheduler/        # 排程服務
│   └── study-block/      # Study Block 服務
└── types/                 # TypeScript 類型定義
```

## API 端點

### LINE Webhook

- `POST /api/webhook/line` - LINE Webhook 接收端點
- 收到使用者**文字訊息**時，會先呼叫 [Loading indicator](https://developers.line.biz/en/docs/messaging-api/use-loading-indicator/)，在聊天室顯示載入動畫（僅 1 對 1 聊天；使用者需停留在該聊天畫面）。可選環境變數 `LINE_LOADING_SECONDS`（5–60，預設 35）。

### Deadline API

- `GET /api/deadlines?token={token}` - 取得用戶的 Deadlines
- `POST /api/deadlines?token={token}` - 建立新的 Deadline
- `PATCH /api/deadlines/[id]?token={token}` - 更新 Deadline
- `DELETE /api/deadlines/[id]?token={token}` - 刪除 Deadline

### Study Block API

- `GET /api/study-blocks?token={token}` - 取得用戶的 Study Blocks
- `POST /api/study-blocks?token={token}` - 建立新的 Study Block
- `PATCH /api/study-blocks/[id]?token={token}` - 更新 Study Block
- `DELETE /api/study-blocks/[id]?token={token}` - 刪除 Study Block

### Schedule API

- `GET /api/schedule/[id]?token={token}` - 取得用戶的時程表資料

## 排程系統

### 排程規則

- **禁止時段**：凌晨 0 點到早上 8 點（00:00-08:00）
- **允許時段**：早上 8 點到晚上 12 點（08:00-24:00）
- **每日限制**：每天最大讀書時間 4 小時，每天最多安排 2 個學習時段
- **排程策略**：從截止日期往前回推，優先使用偏好時段，避免衝突，合理分散時間

### 排程方式

系統有兩種排程方式：

1. **LLM 排程**：使用 LLM 根據用戶偏好和現有行程生成排程
2. **備用排程**：當 LLM 排程驗證失敗時，使用規則基礎的排程算法

## 自然語言理解

系統使用 LLM 進行意圖識別，支援以下意圖：

- `check_in` - 簽到
- `today_fortune` - 今日占卜
- `view_schedule` - 查看時程
- `add_deadline` - 新增 Deadline
- `update_deadline` - 修改 Deadline
- `delete_deadline` - 刪除 Deadline
- `modify_schedule` - 修改時程
- `other` - 其他對話

用戶不需要記住特定指令，用自然語言與 Bot 溝通即可。

## 對話管理

- 系統會記錄對話歷史（最近 10 條），讓 Bot 能記住上下文
- 支援多步驟流程（例如新增 Deadline），Bot 會引導完成每一步
- 輸入「取消」或「主選單」可退出當前流程

## 部署

### 部署至 Vercel

1. 將專案推送到 GitHub
2. 在 Vercel 中匯入專案
3. 設定環境變數
4. 部署完成後，更新 LINE Webhook URL

### 使用 ngrok 進行本地測試


```bash
ngrok http 3000
```

將 ngrok 提供的 HTTPS URL 設定為 LINE Webhook URL。

---

## 作者

Created by 陳竑齊, inspired by Web Service Programming Course (wp1141)
