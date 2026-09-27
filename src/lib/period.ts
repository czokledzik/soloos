import {
  addDays,
  endOfMonth,
  endOfYear,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
} from "date-fns";

export const PERIODS = [
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["value"];

export type Period = { key: PeriodKey; from: Date; to: Date; label: string };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Resolves ?period= (or ?from=&to= for custom) into a half-open [from, to) range. */
export function parsePeriod(params: Params, now = new Date()): Period {
  const key = (one(params.period) ?? "this-month") as PeriodKey;
  const week = { weekStartsOn: 1 as const };
  let from: Date;
  let to: Date;
  switch (key) {
    case "this-week":
      from = startOfWeek(now, week);
      to = addDays(from, 7);
      break;
    case "last-week":
      from = startOfWeek(subWeeks(now, 1), week);
      to = addDays(from, 7);
      break;
    case "last-month":
      from = startOfMonth(subMonths(now, 1));
      to = addDays(endOfMonth(from), 1);
      break;
    case "this-year":
      from = startOfYear(now);
      to = addDays(endOfYear(now), 1);
      break;
    case "custom": {
      const f = parseISO(one(params.from) ?? "");
      const t = parseISO(one(params.to) ?? "");
      from = isValid(f) ? startOfDay(f) : startOfMonth(now);
      to = isValid(t) ? addDays(startOfDay(t), 1) : addDays(startOfDay(now), 1);
      break;
    }
    default:
      from = startOfMonth(now);
      to = addDays(endOfMonth(now), 1);
      return { key: "this-month", from: startOfDay(from), to: startOfDay(to), label: labelFor(from, to) };
  }
  return { key, from: startOfDay(from), to: startOfDay(to), label: labelFor(from, to) };
}

function labelFor(from: Date, to: Date) {
  const last = addDays(to, -1);
  return from.getFullYear() === last.getFullYear()
    ? `${format(from, "d MMM")} – ${format(last, "d MMM yyyy")}`
    : `${format(from, "d MMM yyyy")} – ${format(last, "d MMM yyyy")}`;
}
