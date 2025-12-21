import { z } from "zod";

export const LineWebhookEventSchema = z.object({
  type: z.string(),
  timestamp: z.number(),
  replyToken: z.string().optional(),
  source: z.object({
    type: z.string(),
    userId: z.string().optional(),
  }),
  message: z
    .object({
      type: z.string(),
      id: z.string(),
      text: z.string().optional(),
    })
    .optional(),
});

export const LineWebhookSchema = z.object({
  events: z.array(LineWebhookEventSchema),
  destination: z.string(),
});

export const ConversationQuerySchema = z.object({
  userId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export type LineWebhook = z.infer<typeof LineWebhookSchema>;
export type LineWebhookEvent = z.infer<typeof LineWebhookEventSchema>;
export type ConversationQuery = z.infer<typeof ConversationQuerySchema>;

