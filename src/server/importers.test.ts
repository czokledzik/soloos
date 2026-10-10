import { describe, expect, it } from "vitest";
import { detectDateOrder, parseClockify, parseCsv, parseLinear } from "./importers";

const clockifyHeader =
  "Project,Client,Description,Task,User,Group,Email,Tags,Billable,Start Date,Start Time,End Date,End Time,Duration (h),Duration (decimal),Billable Rate (PLN),Billable Amount (PLN)";

describe("parseCsv", () => {
  it("strips a BOM and trims headers", () => {
    const { headers, rows } = parseCsv("﻿ Name , Value\nfoo,1\n\n");
    expect(headers).toEqual(["Name", "Value"]);
    expect(rows).toEqual([{ Name: "foo", Value: "1" }]);
  });
});

describe("detectDateOrder", () => {
  it("detects day-first, month-first and ISO", () => {
    expect(detectDateOrder(["27/09/2026", "01/10/2026"])).toBe("dmy");
    expect(detectDateOrder(["09/27/2026", "10/01/2026"])).toBe("mdy");
    expect(detectDateOrder(["2026-09-27"])).toBe("ymd");
  });

  it("defaults to day-first when ambiguous", () => {
    expect(detectDateOrder(["01/02/2026"])).toBe("dmy");
  });
});

describe("parseClockify", () => {
  const csv = [
    clockifyHeader,
    `Website,Acme,"Homepage, hero",Design,Me,,,,Yes,27/09/2026,09:00:00,27/09/2026,10:30:00,01:30:00,1.50,"150,00",225.00`,
    `Website,Acme,Call,,Me,,,,No,28/09/2026,23:30:00,29/09/2026,00:15:00,00:45:00,0.75,0,0`,
    `Website,Acme,Zero,,Me,,,,Yes,28/09/2026,12:00:00,28/09/2026,12:00:00,00:00:00,0,0,0`,
    `Website,Acme,Broken,,Me,,,,Yes,garbage,12:00:00,28/09/2026,13:00:00,01:00:00,1,0,0`,
  ].join("\n");

  it("reads entries, rates and billable flags", () => {
    const { items, errors, info } = parseClockify(csv);
    expect(info).toEqual(["Date format: DMY (detected)"]);
    expect(items).toHaveLength(2);
    const [a, b] = items;
    expect(a).toMatchObject({
      line: 2,
      client: "Acme",
      project: "Website",
      task: "Design",
      note: "Homepage, hero",
      billable: true,
      durationMin: 90,
      rate: 150_00,
    });
    expect(a.startedAt).toEqual(new Date(2026, 8, 27, 9, 0));
    expect(b).toMatchObject({ billable: false, durationMin: 45, rate: null });
    expect(errors).toEqual([`Line 5: can't read date/time "garbage 12:00:00"`]);
  });

  it("produces stable import keys", () => {
    const first = parseClockify(csv).items.map((i) => i.importKey);
    const again = parseClockify(csv).items.map((i) => i.importKey);
    expect(first).toEqual(again);
    expect(new Set(first).size).toBe(first.length);
    expect(first[0]).toMatch(/^clockify:[0-9a-f]{20}$/);
  });

  it("reads 12-hour times and month-first dates", () => {
    const { items } = parseClockify(
      [clockifyHeader, `P,C,D,,Me,,,,Yes,09/27/2026,12:15 PM,09/27/2026,01:45 PM,,,,`].join("\n"),
    );
    expect(items[0].startedAt).toEqual(new Date(2026, 8, 27, 12, 15));
    expect(items[0].durationMin).toBe(90);
  });

  it("rejects files that aren't detailed reports", () => {
    const { items, errors } = parseClockify("Project,Time\nA,1");
    expect(items).toEqual([]);
    expect(errors[0]).toMatch(/missing column\(s\) startDate, startTime, endDate, endTime/);
  });
});

describe("parseLinear", () => {
  const header = "ID,Team,Title,Description,Status,Estimate,Priority,Project ID,Project,Creator,Assignee,Labels,Cycle Number,Cycle Name,Cycle Start,Cycle End,Created,Updated,Started,Triaged,Completed,Canceled,Archived,Due Date,Parent issue,Initiatives,Project Milestone ID,Project Milestone,SLA Status,Roadmaps";
  const row = (cells: Record<string, string>) =>
    header
      .split(",")
      .map((h) => JSON.stringify(cells[h] ?? ""))
      .join(",");

  it("maps statuses, priorities and projects", () => {
    const csv = [
      header,
      row({ ID: "ENG-1", Team: "Eng", Title: "Ship it", Status: "In Progress", Priority: "High", Project: "Launch" }),
      row({ ID: "ENG-2", Team: "Eng", Title: "Review me", Status: "In Review", Priority: "Low" }),
      row({ ID: "ENG-3", Team: "Eng", Title: "Old", Status: "Backlog", Priority: "No priority" }),
      row({ ID: "ENG-4", Team: "Eng", Title: "Finished", Status: "Todo", Completed: "2026-09-01T10:00:00.000Z" }),
      row({ ID: "ENG-5", Team: "Eng", Title: "Dropped", Status: "Canceled", Canceled: "2026-09-02T10:00:00.000Z" }),
    ].join("\n");
    const { items } = parseLinear(csv);
    expect(items.map((i) => [i.identifier, i.status, i.priority, i.project, i.canceled])).toEqual([
      ["ENG-1", "in_progress", 3, "Launch", false],
      ["ENG-2", "review", 1, "Eng (Linear)", false],
      ["ENG-3", "backlog", 0, "Eng (Linear)", false],
      ["ENG-4", "done", 0, "Eng (Linear)", false],
      ["ENG-5", "todo", 0, "Eng (Linear)", true],
    ]);
    expect(items[0].importKey).toBe("linear:ENG-1");
  });

  it("keeps the due date's calendar day regardless of format", () => {
    const csv = [
      header,
      row({ ID: "A-1", Title: "ISO", "Due Date": "2026-10-05" }),
      row({ ID: "A-2", Title: "Long", "Due Date": "Mon Oct 05 2026 00:00:00 GMT+0200 (Central European Summer Time)" }),
      row({ ID: "A-3", Title: "Timestamp", "Due Date": "2026-10-05T00:00:00.000+02:00" }),
    ].join("\n");
    expect(parseLinear(csv).items.map((i) => i.dueDate)).toEqual(["2026-10-05", "2026-10-05", "2026-10-05"]);
  });

  it("reports line numbers from the original file even when rows are skipped", () => {
    const csv = [header, row({ ID: "", Title: "No id" }), row({ ID: "A-2", Title: "Kept" })].join("\n");
    expect(parseLinear(csv).items[0].line).toBe(3);
  });

  it("rejects files without ID and Title", () => {
    expect(parseLinear("Name\nfoo").errors[0]).toMatch(/need "ID" and "Title"/);
  });
});
