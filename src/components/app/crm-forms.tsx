"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Contact, Interaction, Organization } from "@/db/schema";
import { moneyInput, toDateString } from "@/lib/format";
import { CHANNELS, DIRECTIONS, LEAD_SOURCES, OPPORTUNITY_STAGES, ORG_STATUSES } from "@/lib/labels";
import { createLead, saveContact, saveInteraction, saveOrganization, updateOpportunity } from "@/server/crm-actions";
import type { CrmPickers, OpportunityDetail } from "@/server/crm-queries";
import type { PickerData } from "@/server/queries";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { useAction } from "./use-action";
import { submitForm } from "./submit-form";

type OnDone = (id?: number) => void;

function Options({ list }: { list: readonly { value: string | number; label: string }[] }) {
  return (
    <>
      {list.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}

// ---------- Quick-add lead ----------

export function LeadForm({ crm, onDone }: { crm: CrmPickers; onDone?: OnDone }) {
  const { pending, exec } = useAction();
  const [orgId, setOrgId] = useState("");
  const [source, setSource] = useState("fb_group");
  return (
    <form
      className="grid gap-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => createLead(fd), "Lead added");
        if (res.ok) onDone?.(res.data);
      })}
    >
      <Field label="Their post / request" hint="Paste the whole thing. The first line becomes the title unless you set one.">
        <Textarea name="originalPostMd" autoFocus className="min-h-32 text-sm" placeholder="Szukam kogoś do automatyzacji…" />
      </Field>
      <Field label="Title (optional)">
        <Input name="title" placeholder="e.g. n8n + CRM sync for a clinic" />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Source">
          <NativeSelect name="source" value={source} onChange={(e) => setSource(e.target.value)}>
            <Options list={LEAD_SOURCES} />
          </NativeSelect>
        </Field>
        <Field label={source === "fb_group" ? "Group name" : "Source detail"}>
          <Input name="sourceDetail" placeholder={source === "fb_group" ? "n8n Polska" : ""} />
        </Field>
        <Field label="Link to post">
          <Input name="sourceUrl" type="url" placeholder="https://facebook.com/…" />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Existing client">
          <NativeSelect name="orgId" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">New →</option>
            {crm.orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Person">
          <Input name="contactName" placeholder="Jan Kowalski" />
        </Field>
        {orgId ? (
          <Field label="Email">
            <Input name="contactEmail" type="email" />
          </Field>
        ) : (
          <Field label="Company (optional)">
            <Input name="companyName" placeholder="leave empty if just a person" />
          </Field>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Profile link">
          <Input name="contactFacebookUrl" type="url" placeholder="https://facebook.com/…" />
        </Field>
        <Field label="Next action">
          <Input name="nextAction" defaultValue="Reply to post" />
        </Field>
        <Field label="When">
          <Input name="nextActionAt" type="date" defaultValue={toDateString(new Date())} />
        </Field>
      </div>
      <Field label="Estimated value (optional)" className="w-1/3">
        <Input name="estValue" inputMode="decimal" />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          Add lead
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- Interaction (conversation log) ----------

export function InteractionForm({
  crm,
  projects,
  interaction,
  defaults = {},
  onDone,
}: {
  crm: CrmPickers;
  projects: PickerData["projects"];
  interaction?: Interaction;
  defaults?: { orgId?: number; opportunityId?: number; projectId?: number };
  onDone?: OnDone;
}) {
  const { pending, exec } = useAction();
  const [orgId, setOrgId] = useState<number | null>(interaction?.orgId ?? defaults.orgId ?? null);
  const orgOpps = crm.opportunities.filter((o) => o.orgId === orgId);
  const orgContacts = crm.contacts.filter((c) => c.orgId === orgId);
  const orgProjects = projects.filter((p) => p.orgId === orgId);
  const [when] = useState(() => interaction?.occurredAt ?? new Date());

  return (
    <form
      className="grid gap-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => saveInteraction(interaction?.id ?? null, fd), interaction ? "Saved" : "Logged");
        if (res.ok) onDone?.();
      })}
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Client">
          <NativeSelect
            name="orgId"
            required
            disabled={interaction != null}
            value={orgId ?? ""}
            onChange={(e) => setOrgId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select…</option>
            {crm.orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Channel">
          <NativeSelect name="channel" defaultValue={interaction?.channel ?? "facebook"}>
            <Options list={CHANNELS} />
          </NativeSelect>
        </Field>
        <Field label="Type">
          <NativeSelect name="direction" defaultValue={interaction?.direction ?? "both"}>
            <Options list={DIRECTIONS} />
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3" key={orgId ?? "none"}>
        <Field label="Person">
          <NativeSelect name="contactId" defaultValue={interaction?.contactId ?? ""}>
            <option value="">—</option>
            {orgContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Lead">
          <NativeSelect name="opportunityId" defaultValue={interaction?.opportunityId ?? defaults.opportunityId ?? ""}>
            <option value="">—</option>
            {orgOpps.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Project">
          <NativeSelect name="projectId" defaultValue={interaction?.projectId ?? defaults.projectId ?? ""}>
            <option value="">—</option>
            {orgProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_8rem_6rem] gap-3">
        <Field label="Title (optional)">
          <Input name="title" defaultValue={interaction?.title ?? ""} placeholder="e.g. Scope call, pricing questions" />
        </Field>
        <Field label="Date">
          <Input name="date" type="date" required defaultValue={format(when, "yyyy-MM-dd")} />
        </Field>
        <Field label="Time">
          <Input name="time" type="time" defaultValue={format(when, "HH:mm")} />
        </Field>
      </div>
      <Field label="Conversation / notes" hint="Paste the whole thread, transcript, or summary.">
        <Textarea name="bodyMd" defaultValue={interaction?.bodyMd ?? ""} className="min-h-56 font-mono text-xs" />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {interaction ? "Save" : "Log conversation"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- Organization ----------

export function OrgForm({ org, onDone }: { org?: Organization; onDone?: OnDone }) {
  const { pending, exec } = useAction();
  return (
    <form
      className="grid gap-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => saveOrganization(org?.id ?? null, fd), org ? "Saved" : "Client created");
        if (res.ok) onDone?.(res.data);
      })}
    >
      <Field label="Name">
        <Input name="name" required autoFocus defaultValue={org?.name} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Status">
          <NativeSelect name="status" defaultValue={org?.status ?? "active"}>
            <Options list={ORG_STATUSES} />
          </NativeSelect>
        </Field>
        <Field label="Kind">
          <NativeSelect name="kind" defaultValue={org?.kind ?? "company"}>
            <option value="company">Company</option>
            <option value="person">Person</option>
          </NativeSelect>
        </Field>
      </div>
      <Field label="Website">
        <Input name="website" defaultValue={org?.website ?? ""} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default hourly rate" hint="Used when a project has no rate">
          <Input name="defaultRate" inputMode="decimal" defaultValue={moneyInput(org?.defaultRate)} />
        </Field>
        <Field label="Currency">
          <Input name="currency" maxLength={3} defaultValue={org?.currency ?? "PLN"} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {org ? "Save" : "Create client"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- Contact ----------

export function ContactForm({ orgId, contact, onDone }: { orgId: number; contact?: Contact; onDone?: OnDone }) {
  const { pending, exec } = useAction();
  return (
    <form
      className="grid gap-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => saveContact(contact?.id ?? null, fd), contact ? "Saved" : "Contact added");
        if (res.ok) onDone?.();
      })}
    >
      <input type="hidden" name="orgId" value={orgId} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input name="name" required autoFocus defaultValue={contact?.name} />
        </Field>
        <Field label="Role">
          <Input name="role" defaultValue={contact?.role ?? ""} />
        </Field>
        <Field label="Emails" hint="Comma separated">
          <Input name="emails" defaultValue={contact?.emails.join(", ") ?? ""} />
        </Field>
        <Field label="Phone">
          <Input name="phone" defaultValue={contact?.phone ?? ""} />
        </Field>
        <Field label="Telegram">
          <Input name="telegram" defaultValue={contact?.telegram ?? ""} placeholder="@handle" />
        </Field>
        <Field label="Facebook">
          <Input name="facebookUrl" defaultValue={contact?.facebookUrl ?? ""} />
        </Field>
        <Field label="LinkedIn" className="col-span-2">
          <Input name="linkedinUrl" defaultValue={contact?.linkedinUrl ?? ""} />
        </Field>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {contact ? "Save" : "Add contact"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ---------- Opportunity edit ----------

export function OpportunityForm({ opp, onDone }: { opp: OpportunityDetail; onDone?: OnDone }) {
  const { pending, exec } = useAction();
  const [stage, setStage] = useState<string>(opp.stage);
  return (
    <form
      className="grid gap-3"
      onSubmit={submitForm(async (fd) => {
        const res = await exec(() => updateOpportunity(opp.id, fd), "Saved");
        if (res.ok) onDone?.();
      })}
    >
      <Field label="Title">
        <Input name="title" required defaultValue={opp.title} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Stage">
          <NativeSelect name="stage" value={stage} onChange={(e) => setStage(e.target.value)}>
            <Options list={OPPORTUNITY_STAGES} />
          </NativeSelect>
        </Field>
        <Field label="Estimated value">
          <Input name="estValue" inputMode="decimal" defaultValue={moneyInput(opp.estValue)} />
        </Field>
        <Field label="Person">
          <NativeSelect name="contactId" defaultValue={opp.contactId ?? ""}>
            <option value="">—</option>
            {opp.org.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_10rem] gap-3">
        <Field label="Next action">
          <Input name="nextAction" defaultValue={opp.nextAction ?? ""} />
        </Field>
        <Field label="When">
          <Input name="nextActionAt" type="date" defaultValue={opp.nextActionAt ?? ""} />
        </Field>
      </div>
      {stage === "lost" && (
        <Field label="Why lost?">
          <Input name="lostReason" defaultValue={opp.lostReason ?? ""} placeholder="price, timing, went with someone else…" />
        </Field>
      )}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Source">
          <NativeSelect name="source" defaultValue={opp.source}>
            <Options list={LEAD_SOURCES} />
          </NativeSelect>
        </Field>
        <Field label="Source detail">
          <Input name="sourceDetail" defaultValue={opp.sourceDetail ?? ""} />
        </Field>
        <Field label="Link">
          <Input name="sourceUrl" defaultValue={opp.sourceUrl ?? ""} />
        </Field>
      </div>
      <Field label="Proposal (ofertownik slug)">
        <Input name="offerSlug" defaultValue={opp.offerSlug ?? ""} placeholder="e.g. acme-dental" />
      </Field>
      <Field label="Original post">
        <Textarea name="originalPostMd" defaultValue={opp.originalPostMd} className="min-h-28 text-sm" />
      </Field>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
