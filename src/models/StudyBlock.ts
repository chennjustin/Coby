import mongoose, { Schema, Document } from "mongoose";

export type StudyBlockStatus = "pending" | "done";

export interface IStudyBlock extends Document {
  userId: mongoose.Types.ObjectId;
  deadlineId: mongoose.Types.ObjectId;
  date: Date; // Block 日期（僅日期部分）
  startTime: Date; // 開始時間（包含日期和時間）
  endTime: Date; // 結束時間
  duration: number; // 持續時間（小時）
  title: string; // 顯示標題，例如 "OS HW4（進度 1/3）"
  blockIndex: number; // 第幾個 block，從 1 開始
  totalBlocks: number; // 總共幾個 blocks
  status: StudyBlockStatus;
  createdAt: Date;
  updatedAt: Date;
}

const StudyBlockSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    deadlineId: {
      type: Schema.Types.ObjectId,
      ref: "Deadline",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    startTime: {
      type: Date,
      required: true,
      index: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    blockIndex: {
      type: Number,
      required: true,
    },
    totalBlocks: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "done"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// 複合索引：方便查詢使用者的 blocks
StudyBlockSchema.index({ userId: 1, date: 1, startTime: 1 });
StudyBlockSchema.index({ deadlineId: 1, blockIndex: 1 });

export default mongoose.models.StudyBlock || mongoose.model<IStudyBlock>("StudyBlock", StudyBlockSchema);

