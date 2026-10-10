import type { OpportunityStage, TaskStatus } from "@/db/schema";

export const TASK_STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "done", label: "Done" },
];

export const TASK_STATUS_LABEL = Object.fromEntries(
  TASK_STATUSES.map((s) => [s.value, s.label]),
) as Record<TaskStatus, string>;

export const PRIORITIES = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Low" },
  { value: 2, label: "Medium" },
  { value: 3, label: "High" },
];

export const PROJECT_STATUSES = [
  { value: "planned", label: "Planned" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
] as const;

export const PRICING = [
  { value: "hourly", label: "Hourly" },
  { value: "fixed", label: "Fixed price" },
  { value: "none", label: "Not billed" },
] as const;

export const CONTRACT_TYPES = [
  { value: "umowa_zlecenie", label: "Umowa zlecenie" },
  { value: "umowa_o_dzielo", label: "Umowa o dzieło" },
  { value: "b2b", label: "B2B invoice" },
  { value: "useme", label: "Useme" },
  { value: "bizky", label: "Bizky" },
  { value: "internal", label: "Internal" },
] as const;

export const ORG_STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "active", label: "Active client" },
  { value: "past", label: "Past client" },
  { value: "internal", label: "Internal" },
] as const;

export const OPPORTUNITY_STAGES: { value: OpportunityStage; label: string }[] = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "call", label: "Call" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiating", label: "Negotiating" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

/** Tailwind classes for the stage color dot. */
export const STAGE_DOT: Record<OpportunityStage, string> = {
  new: "bg-sky-500",
  contacted: "bg-indigo-500",
  call: "bg-violet-500",
  proposal: "bg-amber-500",
  negotiating: "bg-orange-500",
  won: "bg-emerald-500",
  lost: "bg-muted-foreground/40",
};

export const LEAD_SOURCES = [
  { value: "fb_group", label: "Facebook group" },
  { value: "referral", label: "Referral" },
  { value: "email", label: "Email" },
  { value: "other", label: "Other" },
] as const;

export const CHANNELS = [
  { value: "facebook", label: "Facebook" },
  { value: "email", label: "Email" },
  { value: "telegram", label: "Telegram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "call", label: "Call" },
  { value: "meeting", label: "Meeting" },
  { value: "other", label: "Other" },
] as const;

export const DIRECTIONS = [
  { value: "both", label: "Conversation" },
  { value: "in", label: "From them" },
  { value: "out", label: "From me" },
  { value: "internal", label: "Internal note" },
] as const;

export function labelOf<T extends { value: string | number; label: string }>(
  list: readonly T[],
  value: string | number | null | undefined,
): string {
  return list.find((x) => x.value === value)?.label ?? "—";
}

export const SYSTEM_KINDS = [
  { value: "repo", label: "Repo" },
  { value: "n8n", label: "n8n" },
  { value: "elevenlabs", label: "ElevenLabs" },
  { value: "twilio", label: "Twilio" },
  { value: "baserow", label: "Baserow" },
  { value: "vercel", label: "Vercel" },
  { value: "database", label: "Database" },
  { value: "doc", label: "Doc" },
  { value: "other", label: "Other" },
] as const;

export const CHANGE_REQUEST_STATUSES = [
  { value: "proposed", label: "Proposed" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;
