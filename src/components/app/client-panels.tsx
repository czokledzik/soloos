"use client";

import { useState } from "react";
import { MailIcon, PencilIcon, PhoneIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Contact, Organization } from "@/db/schema";
import { deleteContact } from "@/server/crm-actions";
import { ContactForm, OrgForm } from "./crm-forms";
import { useAction } from "./use-action";

export function EditOrgButton({ org }: { org: Organization }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
          </DialogHeader>
          <OrgForm org={org} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ContactsCard({ orgId, contacts }: { orgId: number; contacts: Contact[] }) {
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const { exec } = useAction();
  return (
    <section className="rounded-xl border">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Contacts</h2>
        <Button size="icon-xs" variant="ghost" title="Add contact" onClick={() => setEditing("new")}>
          <PlusIcon />
        </Button>
      </div>
      {contacts.length === 0 ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">No contacts yet.</p>
      ) : (
        <div className="divide-y">
          {contacts.map((c) => (
            <div key={c.id} className="group px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {c.role && <span className="text-xs text-muted-foreground">{c.role}</span>}
                <div className="ml-auto flex opacity-0 group-hover:opacity-100">
                  <Button size="icon-xs" variant="ghost" onClick={() => setEditing(c)}>
                    <PencilIcon />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => confirm(`Delete ${c.name}?`) && exec(() => deleteContact(c.id))}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              </div>
              <div className="mt-1 grid gap-0.5 text-xs text-muted-foreground">
                {c.emails.map((e) => (
                  <a key={e} href={`mailto:${e}`} className="flex items-center gap-1.5 hover:text-foreground">
                    <MailIcon className="size-3" /> {e}
                  </a>
                ))}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                    <PhoneIcon className="size-3" /> {c.phone}
                  </a>
                )}
                {c.telegram && (
                  <a
                    href={`https://t.me/${c.telegram.replace(/^@/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 hover:text-foreground"
                  >
                    <SendIcon className="size-3" /> {c.telegram}
                  </a>
                )}
                <div className="flex gap-3">
                  {c.facebookUrl && (
                    <a href={c.facebookUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                      Facebook ↗
                    </a>
                  )}
                  {c.linkedinUrl && (
                    <a href={c.linkedinUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                      LinkedIn ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <Dialog open={editing != null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add contact" : "Edit contact"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <ContactForm
              key={editing === "new" ? "new" : editing.id}
              orgId={orgId}
              contact={editing === "new" ? undefined : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
