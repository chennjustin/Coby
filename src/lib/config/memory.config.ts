export function getMemoryConfig(): Record<string, any> {
  const qdrantHost = process.env.QDRANT_HOST || "localhost";
  const qdrantPort = parseInt(process.env.QDRANT_PORT || "6333", 10);
  const qdrantUrl = process.env.QDRANT_URL;
  const qdrantApiKey = process.env.QDRANT_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY || "";

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

  return {
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
    historyDbPath: process.env.MEM0_HISTORY_DB_PATH || "mem0_history.db",
  };
}
