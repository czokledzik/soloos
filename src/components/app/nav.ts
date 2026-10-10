import {
  BarChart3Icon,
  BriefcaseIcon,
  Building2Icon,
  ClockIcon,
  KanbanSquareIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  SunIcon,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Today", icon: SunIcon },
  { href: "/tasks", label: "My work", icon: ListTodoIcon },
  { href: "/projects", label: "Projects", icon: BriefcaseIcon },
  { href: "/time", label: "Time", icon: ClockIcon },
  { href: "/reports", label: "Reports", icon: BarChart3Icon },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquareIcon },
  { href: "/clients", label: "Clients", icon: Building2Icon },
  { href: "/messages", label: "Messages", icon: MessagesSquareIcon },
];
