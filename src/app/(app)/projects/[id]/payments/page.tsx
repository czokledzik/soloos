import { notFound } from "next/navigation";
import { PaymentsPanel } from "@/components/app/payments-panel";
import { getProject, listPayments } from "@/server/queries";

export default async function ProjectPaymentsPage({ params }: PageProps<"/projects/[id]/payments">) {
  const id = Number((await params).id);
  const [project, payments] = await Promise.all([getProject(id), listPayments(id)]);
  if (!project) notFound();
  return (
    <div className="px-6 pb-6">
      <PaymentsPanel
        projectId={id}
        payments={payments}
        fixedPrice={project.pricing === "fixed" ? project.fixedPrice : null}
        currency={project.currency}
      />
    </div>
  );
}
