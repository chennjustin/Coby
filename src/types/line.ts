export interface LineEvent {
  type: string;
  timestamp: number;
  source: {
    type: string;
    userId?: string;
  };
  message?: {
    type: string;
    id: string;
    text?: string;
  };
}

export interface LineWebhookPayload {
  events: LineEvent[];
  destination: string;
}

