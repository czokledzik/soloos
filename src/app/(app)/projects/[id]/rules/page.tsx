import { notFound } from "next/navigation";
import { BusinessRules, OpenQuestions } from "@/components/app/rules-panels";
import { listBusinessRules, listDecisions, listOpenQuestions } from "@/server/doc-queries";

export default async function ProjectRulesPage({ params }: PageProps<"/projects/[id]/rules">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [questions, rules, decisions] = await Promise.all([listOpenQuestions(id), listBusinessRules(id), listDecisions(id)]);

  return (
    <div className="grid gap-6 px-6 pb-6 lg:grid-cols-2">
      <div className="grid content-start gap-6">
        <OpenQuestions projectId={id} rows={questions} />
      </div>
      <div className="grid content-start gap-6">
        <BusinessRules projectId={id} rows={rules} decisions={decisions} />
      </div>
    </div>
  );
}
