"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2Icon,
  MessageSquarePlusIcon,
  SparklesIcon,
  BriefcaseIcon,
  CircleDotIcon,
  ClipboardPasteIcon,
  ClockIcon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
} from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { CrmPickers } from "@/server/crm-queries";
import type { PickerData } from "@/server/queries";
import { startTimer, stopTimer } from "@/server/actions";
import { NAV_ITEMS } from "./nav";
import { openGlobalDialog } from "./global-dialogs";
import { useAction } from "./use-action";

export function CommandPalette({
  data,
  crm,
  timerRunning,
}: {
  data: PickerData;
  crm: CrmPickers;
  timerRunning: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { exec } = useAction();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onOpen);
    };
  }, []);

  function run(fn: () => void) {
    setOpen(false);
    setSearch("");
    fn();
  }

  const projectName = new Map(data.projects.map((p) => [p.id, `${p.orgName} · ${p.name}`]));
  const searching = search.trim().length > 0;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} className="sm:max-w-xl">
      <Command>
        <CommandInput placeholder="Jump to, start a timer, create…" value={search} onValueChange={setSearch} />
        <CommandList className="max-h-96">
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Actions">
            {timerRunning && (
              <CommandItem onSelect={() => run(() => exec(stopTimer, "Time logged"))}>
                <SquareIcon /> Stop timer <CommandShortcut>⌥S</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem onSelect={() => run(() => openGlobalDialog("task"))}>
              <PlusIcon /> New task
            </CommandItem>
            <CommandItem onSelect={() => run(() => openGlobalDialog("time"))}>
              <ClockIcon /> Log time manually
            </CommandItem>
            <CommandItem onSelect={() => run(() => openGlobalDialog("lead"))}>
              <SparklesIcon /> Add lead
            </CommandItem>
            <CommandItem onSelect={() => run(() => openGlobalDialog("interaction"))}>
              <MessageSquarePlusIcon /> Log conversation
            </CommandItem>
            <CommandItem onSelect={() => run(() => router.push("/messages/new"))}>
              <ClipboardPasteIcon /> Paste chat messages
            </CommandItem>
            <CommandItem onSelect={() => run(() => openGlobalDialog("project"))}>
              <PlusIcon /> New project
            </CommandItem>
            <CommandItem onSelect={() => run(() => openGlobalDialog("org"))}>
              <PlusIcon /> New client
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Go to">
            {NAV_ITEMS.map((n) => (
              <CommandItem key={n.href} value={`go ${n.label}`} onSelect={() => run(() => router.push(n.href))}>
                <n.icon /> {n.label}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup heading="Projects">
            {data.projects.map((p) => (
              <CommandItem
                key={p.id}
                value={`project ${p.id} ${p.orgName} ${p.name}`}
                onSelect={() => run(() => router.push(`/projects/${p.id}`))}
              >
                <BriefcaseIcon />
                <span className="truncate">{p.name}</span>
                <span className="truncate text-xs text-muted-foreground">{p.orgName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          {searching && (
            <>
              <CommandGroup heading="Clients">
                {crm.orgs.map((o) => (
                  <CommandItem
                    key={o.id}
                    value={`client ${o.id} ${o.name}`}
                    onSelect={() => run(() => router.push(`/clients/${o.id}`))}
                  >
                    <Building2Icon />
                    <span className="truncate">{o.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Leads">
                {crm.opportunities
                  .filter((o) => o.stage !== "won")
                  .map((o) => (
                    <CommandItem
                      key={o.id}
                      value={`lead ${o.id} ${o.title}`}
                      onSelect={() => run(() => router.push(`/pipeline?opp=${o.id}`))}
                    >
                      <SparklesIcon />
                      <span className="truncate">{o.title}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
              <CommandGroup heading="Tasks">
                {data.tasks.map((t) => (
                  <CommandItem
                    key={t.id}
                    value={`task ${t.id} ${t.title} ${projectName.get(t.projectId) ?? ""}`}
                    onSelect={() => run(() => router.push(`/projects/${t.projectId}?task=${t.id}`))}
                  >
                    <CircleDotIcon />
                    <span className="truncate">{t.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{projectName.get(t.projectId)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Start timer">
                {data.projects.map((p) => (
                  <CommandItem
                    key={`p${p.id}`}
                    value={`start timer ${p.orgName} ${p.name}`}
                    onSelect={() => run(() => exec(() => startTimer(p.id), "Timer started"))}
                  >
                    <PlayIcon />
                    <span className="truncate">{p.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{p.orgName}</span>
                  </CommandItem>
                ))}
                {data.tasks.map((t) => (
                  <CommandItem
                    key={`t${t.id}`}
                    value={`start timer ${t.id} ${t.title} ${projectName.get(t.projectId) ?? ""}`}
                    onSelect={() => run(() => exec(() => startTimer(t.projectId, t.id), "Timer started"))}
                  >
                    <PlayIcon />
                    <span className="truncate">{t.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{projectName.get(t.projectId)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
