export function getMemoryConfig(): Record<string, any> {
  const qdrantHost = process.env.QDRANT_HOST || "localhost";
  const qdrantPort = parseInt(process.env.QDRANT_PORT || "6333", 10);
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY || "";
  const isVercel = !!process.env.VERCEL;

  const useQdrant = qdrantUrl || process.env.QDRANT_HOST;

  const vectorStore = useQdrant
    ? {
        provider: "qdrant" as const,
        config: {
          ...(qdrantUrl
            ? { url: qdrantUrl, apiKey: qdrantApiKey }
            : { host: qdrantHost, port: qdrantPort }),
          collectionName: "coby_memories",
          embeddingModelDims: 1536,
        },
      }
    : {
        provider: "memory" as const,
        config: {
          collectionName: "coby_memories",
          dimension: 1536,
        },
      };

  const config: Record<string, any> = {
    version: "v1.1",
    embedder: {
      provider: "openai",
      config: {
        apiKey: openaiKey,
        model: "text-embedding-3-small",
      },
    },
    vectorStore,
    llm: {
      provider: "openai",
      config: {
        apiKey: openaiKey,
        model: process.env.MEM0_LLM_MODEL || "gpt-4.1-nano",
      },
    },
  };

  // Vercel serverless 沒有持久檔案系統，停用 SQLite history
  // 對話記錄已透過 SavedItemRepository 存到 MongoDB
  if (isVercel) {
    config.disableHistory = true;
  } else {
    config.historyDbPath =
      process.env.MEM0_HISTORY_DB_PATH || "mem0_history.db";
  }

  return config;
}
