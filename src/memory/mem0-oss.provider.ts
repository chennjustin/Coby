import { Logger } from "@/lib/utils/logger";
import { TtlCache, makeCacheKey } from "@/lib/utils/ttl-cache";
import {
  MemoryProvider,
  MemoryMessage,
  MemoryAddOptions,
  MemorySearchOptions,
  MemorySearchResult,
  MemoryItem,
} from "./types";

let MemoryClass: any = null;

const SEARCH_CACHE_TTL_MS = 60_000; // 同一 user+query 60 秒內不重打 Qdrant

async function getMemoryClass() {
  if (!MemoryClass) {
    const mod = await import("mem0ai/oss");
    MemoryClass = mod.Memory;
  }
  return MemoryClass;
}

export class Mem0OssProvider implements MemoryProvider {
  private memory: any = null;
  private initPromise: Promise<void> | null = null;
  private searchCache = new TtlCache<MemorySearchResult[]>(SEARCH_CACHE_TTL_MS, 200);

  constructor(private config: Record<string, any>) {
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      const Memory = await getMemoryClass();
      this.memory = new Memory(this.config);
      Logger.info("Mem0 OSS provider initialized");
    } catch (error) {
      Logger.error("Failed to initialize Mem0 OSS provider", { error });
      this.memory = null;
    }
  }

  private async ensureReady(): Promise<boolean> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
    return this.memory !== null;
  }

  async add(messages: MemoryMessage[], options: MemoryAddOptions): Promise<void> {
    if (!(await this.ensureReady())) return;

    try {
      const formatted = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      await this.memory.add(formatted, {
        userId: options.userId,
        metadata: options.metadata,
      });
      this.invalidateUserCache(options.userId);
      Logger.debug("Mem0: memories added", { userId: options.userId });
    } catch (error) {
      Logger.error("Mem0: failed to add memories", { error, userId: options.userId });
    }
  }

  async search(
    query: string,
    options: MemorySearchOptions
  ): Promise<MemorySearchResult[]> {
    if (!(await this.ensureReady())) return [];

    const cacheKey = makeCacheKey(options.userId, query.slice(0, 200));
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      Logger.debug("Mem0: search cache hit", { userId: options.userId });
      return cached;
    }

    try {
      const result = await this.memory.search(query, {
        userId: options.userId,
        limit: options.limit ?? 10,
      });

      const results: MemorySearchResult[] = (result?.results ?? result ?? []).map(
        (r: any) => ({
          id: r.id ?? "",
          memory: r.memory ?? "",
          score: r.score ?? 0,
          metadata: r.metadata,
          userId: r.userId ?? r.user_id,
        })
      );

      this.searchCache.set(cacheKey, results);

      Logger.debug("Mem0: search completed", {
        userId: options.userId,
        resultCount: results.length,
      });
      return results;
    } catch (error) {
      Logger.error("Mem0: search failed", { error, userId: options.userId });
      return [];
    }
  }

  async getAll(options: { userId: string }): Promise<MemoryItem[]> {
    if (!(await this.ensureReady())) return [];

    try {
      const result = await this.memory.getAll({ userId: options.userId });
      const items: MemoryItem[] = (result?.results ?? result ?? []).map(
        (r: any) => ({
          id: r.id ?? "",
          memory: r.memory ?? "",
          metadata: r.metadata,
          userId: r.userId ?? r.user_id,
          createdAt: r.createdAt ?? r.created_at,
          updatedAt: r.updatedAt ?? r.updated_at,
        })
      );
      return items;
    } catch (error) {
      Logger.error("Mem0: getAll failed", { error, userId: options.userId });
      return [];
    }
  }

  async delete(memoryId: string): Promise<void> {
    if (!(await this.ensureReady())) return;

    try {
      await this.memory.delete(memoryId);
      Logger.debug("Mem0: memory deleted", { memoryId });
    } catch (error) {
      Logger.error("Mem0: delete failed", { error, memoryId });
    }
  }

  async deleteAll(options: { userId: string }): Promise<void> {
    if (!(await this.ensureReady())) return;

    try {
      await this.memory.deleteAll({ userId: options.userId });
      this.invalidateUserCache(options.userId);
      Logger.debug("Mem0: all memories deleted", { userId: options.userId });
    } catch (error) {
      Logger.error("Mem0: deleteAll failed", { error, userId: options.userId });
    }
  }

  private invalidateUserCache(userId: string): void {
    this.searchCache.clear();
  }
}
