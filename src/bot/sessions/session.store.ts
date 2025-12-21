import connectDB from "@/lib/db/mongoose";
import mongoose from "mongoose";

interface SessionData {
  [key: string]: unknown;
}

class MongoSessionStore {
  private collection!: mongoose.mongo.Collection<SessionData>;

  async initialize() {
    await connectDB();
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database not connected");
    }
    this.collection = db.collection<SessionData>("sessions");
    await this.collection.createIndex({ sessionId: 1 }, { unique: true });
  }

  async read(sessionId: string): Promise<SessionData | null> {
    if (!this.collection) {
      await this.initialize();
    }
    const doc = await this.collection.findOne({ sessionId });
    return doc ? (doc as unknown as SessionData) : null;
  }

  async write(sessionId: string, data: SessionData): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }
    await this.collection.updateOne(
      { sessionId },
      { $set: { sessionId, ...data, updatedAt: new Date() } },
      { upsert: true }
    );
  }

  async destroy(sessionId: string): Promise<void> {
    if (!this.collection) {
      await this.initialize();
    }
    await this.collection.deleteOne({ sessionId });
  }
}

const sessionStore = new MongoSessionStore();
export default sessionStore;

