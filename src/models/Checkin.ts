import mongoose, { Schema, Document } from "mongoose";

export interface ICheckin extends Document {
  userId: mongoose.Types.ObjectId;
  checkinDate: Date;
  consecutiveDays: number;
  createdAt: Date;
  updatedAt: Date;
}

const CheckinSchema: Schema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    checkinDate: {
      type: Date,
      required: true,
      index: true,
    },
    consecutiveDays: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// 複合索引：確保每個使用者每天只有一筆記錄
CheckinSchema.index({ userId: 1, checkinDate: 1 }, { unique: true });

export default mongoose.models.Checkin || mongoose.model<ICheckin>("Checkin", CheckinSchema);

