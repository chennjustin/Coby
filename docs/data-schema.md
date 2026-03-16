# Coby 資料 Schema 與時間策略

## 時間策略
- 儲存：資料庫一律存 UTC (`Date` / ISO)
- 顯示：回傳與前端顯示時轉換為 `Asia/Taipei`
- 輸入：可接受 `YYYY-MM-DD`、`YYYY-MM-DDTHH:mm`、ISO；無時區輸入一律視為台灣時間

## Deadline
- `userId`: 使用者 ObjectId
- `eventId`(對應 `_id`): Deadline 唯一識別
- `title`: 事項名稱
- `type`: `exam | assignment | project | other`
- `dueDate`: 截止時間 (UTC)
- `estimatedHours`: 預估時數
- `status`: `pending | done`
- `createdAt`: 建立時間
- `updatedAt`: 更新時間

## StudyBlock
- `userId`: 使用者 ObjectId
- `eventId`(對應 `_id`): Block 唯一識別
- `deadlineId`: 關聯 Deadline
- `date`: 區塊日期 (UTC Date)
- `startTime`: 開始時間 (UTC)
- `endTime`: 結束時間 (UTC)
- `duration`: 小時數
- `title`: 顯示名稱
- `blockIndex`: 第幾段
- `totalBlocks`: 總段數
- `status`: `pending | done`
- `createdAt`: 建立時間
- `updatedAt`: 更新時間
