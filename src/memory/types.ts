export interface MemoryMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface MemorySearchResult {
  id: string;
  memory: string;
  score: number;
  metadata?: Record<string, unknown>;
  userId?: string;
}

export interface MemoryItem {
  id: string;
  memory: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemoryAddOptions {
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchOptions {
  userId: string;
  limit?: number;
}

export interface MemoryProvider {
  add(
    messages: MemoryMessage[],
    options: MemoryAddOptions
  ): Promise<void>;

  search(
    query: string,
    options: MemorySearchOptions
  ): Promise<MemorySearchResult[]>;

  getAll(options: { userId: string }): Promise<MemoryItem[]>;

  delete(memoryId: string): Promise<void>;

  deleteAll(options: { userId: string }): Promise<void>;
}
