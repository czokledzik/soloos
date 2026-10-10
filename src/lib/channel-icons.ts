import {
  MailIcon,
  MessageCircleIcon,
  MessagesSquareIcon,
  PhoneIcon,
  SendIcon,
  StickyNoteIcon,
  UsersIcon,
} from "lucide-react";
import type { Interaction } from "@/db/schema";

// Lives outside "use client" files so server components can use it too.
export const CHANNEL_ICON = {
  facebook: MessagesSquareIcon,
  email: MailIcon,
  telegram: SendIcon,
  whatsapp: MessageCircleIcon,
  call: PhoneIcon,
  meeting: UsersIcon,
  other: StickyNoteIcon,
} satisfies Record<Interaction["channel"], unknown>;
