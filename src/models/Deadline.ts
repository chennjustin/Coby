import mongoose, { Schema, Document } from "mongoose";

export type DeadlineType = "exam" | "assignment" | "project" | "other";
export type DeadlineStatus = "pending" | "done";

export interface IDeadline extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  type: DeadlineType;
  dueDate: Date;
  estimatedHours: number;
  status: DeadlineStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DeadlineSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["exam", "assignment", "project", "other"],
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
      index: true,
    },
    estimatedHours: {
      type: Number,
      default: 2,
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

// 複合索引：方便查詢使用者的待辦事項
DeadlineSchema.index({ userId: 1, status: 1, dueDate: 1 });

export default mongoose.models.Deadline || mongoose.model<IDeadline>("Deadline", DeadlineSchema);

