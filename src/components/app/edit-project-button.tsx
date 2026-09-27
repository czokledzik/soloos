"use client";

import { useState } from "react";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Organization, Project } from "@/db/schema";
import { ProjectForm } from "./forms";

export function EditProjectButton({
  project,
  orgs,
}: {
  project: Project;
  orgs: Pick<Organization, "id" | "name">[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <ProjectForm project={project} orgs={orgs} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}
