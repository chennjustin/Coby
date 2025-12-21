export interface LLMClient {
  chat(messages: Array<{ role: string; content: string }>): Promise<string>;
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

