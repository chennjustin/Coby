import mongoose, { Schema, Document } from "mongoose";

export type FlowType = "add_deadline_step" | "add_deadline_nlp" | "edit_deadline" | "update_deadline" | "delete_deadline" | null;

export interface ConversationHistoryItem {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface IUserState extends Document {
  userId: string; // LINE userId
  currentFlow: FlowType;
  flowData?: Record<string, unknown>;
  conversationHistory?: ConversationHistoryItem[];
  updatedAt: Date;
}

const UserStateSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    currentFlow: {
      type: String,
      enum: ["add_deadline_step", "add_deadline_nlp", "edit_deadline", "update_deadline", "delete_deadline", null],
      default: null,
    },
    flowData: {
      type: Schema.Types.Mixed,
    },
    conversationHistory: {
      type: [
        {
          role: {
            type: String,
            enum: ["user", "assistant"],
            required: true,
          },
          content: {
            type: String,
            required: true,
          },
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.models.UserState || mongoose.model<IUserState>("UserState", UserStateSchema);

