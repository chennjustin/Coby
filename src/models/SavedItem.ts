import mongoose, { Schema, Document } from "mongoose";

export interface SavedItemMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface ISavedItem extends Document {
  userId: string;
  sessionId: string;
  messages: SavedItemMessage[];
  metadata?: {
    intent?: string;
    entities?: Record<string, unknown>;
    memoryExtracted?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SavedItemSchema: Schema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
    },
    messages: [
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
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

SavedItemSchema.index({ userId: 1, createdAt: -1 });
SavedItemSchema.index({ userId: 1, sessionId: 1 });

export default mongoose.models.SavedItem ||
  mongoose.model<ISavedItem>("SavedItem", SavedItemSchema);
