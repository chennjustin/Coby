import { MemoryProvider } from "./types";
import { Mem0OssProvider } from "./mem0-oss.provider";
import { getMemoryConfig } from "@/lib/config/memory.config";
import { Logger } from "@/lib/utils/logger";

let instance: MemoryProvider | null = null;

export function getMemoryProvider(): MemoryProvider {
  if (instance) return instance;

  const provider = process.env.MEMORY_PROVIDER || "mem0_oss";

  switch (provider) {
    case "mem0_oss":
      instance = new Mem0OssProvider(getMemoryConfig());
      break;
    default:
      Logger.warn(`Unknown MEMORY_PROVIDER "${provider}", falling back to mem0_oss`);
      instance = new Mem0OssProvider(getMemoryConfig());
  }

  return instance;
}

export function resetMemoryProvider(): void {
  instance = null;
}
