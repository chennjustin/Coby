import OpenAI from "openai";
import { LLMClient, LLMMessage } from "./client";
import { Logger } from "@/lib/utils/logger";

export class OpenAIClient implements LLMClient {
  private client: OpenAI;
  private model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set in environment variables");
    }

    const model = process.env.OPENAI_MODEL;
    if (!model) {
      throw new Error(
        "OPENAI_MODEL is not set in environment variables. Please add OPENAI_MODEL to your .env file"
      );
    }

    this.client = new OpenAI({
      apiKey,
    });
    this.model = model;
  }

  async chat(messages: LLMMessage[]): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: 0.7,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error("No content in OpenAI response");
      }

      Logger.debug("OpenAI API 調用成功", {
        tokens: response.usage?.total_tokens,
        model: this.model,
      });

      return content;
    } catch (error) {
      Logger.error("OpenAI API 調用失敗", { 
        error,
        model: this.model,
      });
      throw error;
    }
  }
}

