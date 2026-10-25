import { format, parseISO } from "date-fns";
import { enGB, pl } from "date-fns/locale";

/** Languages the client portal can be shown in (per project; the app itself stays English). */
export const PORTAL_LANGS = [
  { value: "en", label: "English" },
  { value: "pl", label: "Polish" },
] as const;
export type PortalLang = (typeof PORTAL_LANGS)[number]["value"];

const toDate = (d: Date | string) => (typeof d === "string" ? parseISO(d) : d);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const en = {
  locale: enGB,
  fallbackTitle: "Project status",
  status: { planned: "Planned", active: "In progress", paused: "Paused", done: "Finished", archived: "Archived" } as Record<string, string>,
  due: (d: string) => `due ${d}`,
  downloadPdf: "Download PDF",
  sections: "Sections",
  overview: "Overview",
  decisions: "Decisions",
  hoursReport: "Hours report",
  documentation: "Documentation",
  billing: "Billing",
  nothingShared: "Nothing has been shared yet.",
  contents: "Contents",
  progress: "Progress",
  workProgress: "Work progress",
  doneOf: (done: number, total: number) => `${done} of ${total} done`,
  inProgress: (n: number) => `${n} in progress`,
  updates: "Updates",
  summary: "Summary",
  hoursWorked: "Hours worked",
  rate: (r: string) => `rate ${r}/h`,
  workValue: "Value of work",
  paid: "Paid",
  due_: "Due",
  overpaid: "Overpaid",
  budgetUsed: (h: number) => `Estimate used (${h} h)`,
  payments: "Payments",
  paidOn: (d: string) => `paid ${d}`,
  dueOn: (d: string) => `due ${d}`,
  unpaid: "to be paid",
  workDone: "Work done",
  noEntries: "No entries.",
  noDecisions: "No decisions logged.",
  me: "contractor",
  both: "both sides",
  client: "(client)",
  updated: (d: string) => `Updated ${d}`,
  darkOn: "Switch to dark theme",
  darkOff: "Switch to light theme",
  dark: "Dark theme",
  light: "Light theme",
  printHint: "In the print dialog, choose “Save as PDF”.",
  back: "Back",
  saveAsPdf: "Save as PDF",
};

const plText: typeof en = {
  locale: pl,
  fallbackTitle: "Status projektu",
  status: { planned: "Planowany", active: "W realizacji", paused: "Wstrzymany", done: "Zakończony", archived: "Zarchiwizowany" },
  due: (d) => `termin ${d}`,
  downloadPdf: "Pobierz PDF",
  sections: "Sekcje",
  overview: "Przegląd",
  decisions: "Decyzje",
  hoursReport: "Raport godzin",
  documentation: "Dokumentacja",
  billing: "Rozliczenie",
  nothingShared: "Nic jeszcze nie udostępniono.",
  contents: "Spis treści",
  progress: "Postęp",
  workProgress: "Postęp prac",
  doneOf: (done, total) => `ukończone ${done} z ${total}`,
  inProgress: (n) => `w toku ${n}`,
  updates: "Aktualności",
  summary: "Podsumowanie",
  hoursWorked: "Przepracowane godziny",
  rate: (r) => `stawka ${r}/h`,
  workValue: "Wartość prac",
  paid: "Wpłacono",
  due_: "Do zapłaty",
  overpaid: "Nadpłata",
  budgetUsed: (h) => `Wykorzystanie szacunku (${h} h)`,
  payments: "Płatności",
  paidOn: (d) => `wpłacono ${d}`,
  dueOn: (d) => `termin ${d}`,
  unpaid: "do zapłaty",
  workDone: "Wykonane prace",
  noEntries: "Brak wpisów.",
  noDecisions: "Brak zapisanych decyzji.",
  me: "wykonawca",
  both: "wspólnie",
  client: "(klient)",
  updated: (d) => `Aktualizacja: ${d}`,
  darkOn: "Przełącz na ciemny motyw",
  darkOff: "Przełącz na jasny motyw",
  dark: "Ciemny motyw",
  light: "Jasny motyw",
  printHint: "W oknie drukowania wybierz „Zapisz jako PDF”.",
  back: "Wróć",
  saveAsPdf: "Zapisz jako PDF",
};

/** Texts and date formats for the client portal in its language. */
export function portalText(lang: PortalLang) {
  const t = lang === "pl" ? plText : en;
  return {
    ...t,
    /** "2 October 2026" / "2 października 2026" */
    day: (d: Date | string) => format(toDate(d), "d MMMM yyyy", { locale: t.locale }),
    /** "2 Oct" / "2 paź" */
    shortDay: (d: Date | string) => format(toDate(d), "d MMM", { locale: t.locale }),
    /** "October 2026" / "Październik 2026" */
    month: (d: Date | string) => capitalize(format(toDate(d), "LLLL yyyy", { locale: t.locale })),
  };
}
export type PortalText = ReturnType<typeof portalText>;
