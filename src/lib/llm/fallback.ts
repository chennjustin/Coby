import { ERROR_MESSAGES, FALLBACK_MESSAGE } from "@/lib/constants";
import { Logger } from "@/lib/utils/logger";

export function handleLLMError(error: unknown): string {
  Logger.error("LLM API Error", { error });

  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();

    if (errorMessage.includes("429") || errorMessage.includes("rate limit")) {
      return ERROR_MESSAGES.RATE_LIMIT;
    }

    if (
      errorMessage.includes("quota") ||
      errorMessage.includes("insufficient")
    ) {
      return ERROR_MESSAGES.QUOTA_EXCEEDED;
    }

    if (
      errorMessage.includes("service unavailable") ||
      errorMessage.includes("503")
    ) {
      return ERROR_MESSAGES.SERVICE_UNAVAILABLE;
    }
  }

  return ERROR_MESSAGES.DEFAULT;
}

export function getFallbackResponse(): string {
  return FALLBACK_MESSAGE;
}

