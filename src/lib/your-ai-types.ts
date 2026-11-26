/** "Your AI" view types (docs/your-ai.md), free of React Query so src/lib/api-client.ts can use them. */
export type YourAiTone = "friendly" | "professional" | "casual";

export interface YourAiSwitch {
  key: string;
  group: "customers" | "paid" | "jobs" | "growing" | "posted";
  label: string;
  description: string;
  customize: string | null;
  choices?: Array<{ value: string; label: string }>;
  on: boolean;
  choice?: string;
  needs?: string;
  /** An automation that also does this (switching off here doesn't stop it). */
  alsoDoneBy?: string;
}

export interface YourAiView {
  companyId: string;
  persona: { name: string | null; tone: YourAiTone | null; defaultName: string; ownerName?: string | null };
  switches: YourAiSwitch[];
  /**
   * Calling your own assistant (docs/owner-line.md): what you've told it about you and your
   * businesses. Null unless that is switched on for the account and you are an owner or admin.
   */
  ownerLine?: { brief: string | null; maxChars: number } | null;
}
