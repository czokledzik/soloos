import { startOfMonth } from "date-fns";
import { OpenDialogButton } from "@/components/app/buttons";
import { OpportunitySheet } from "@/components/app/opportunity-sheet";
import { PageHeader } from "@/components/app/page-header";
import { PipelineBoard } from "@/components/app/pipeline-board";
import { formatMoneyTotals } from "@/lib/format";
import { getCrmPickers, getOpportunity, listInteractions, listPipeline } from "@/server/crm-queries";
import { listThreads } from "@/server/message-queries";
import { LeadAiPanel } from "@/components/app/ai-panel";
import { aiProvider, jobView } from "@/server/ai/run";
import { getPickerData } from "@/server/queries";

// "Ask Claude" runs as a server action of this page and can take a while.
export const maxDuration = 300;

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: PageProps<"/pipeline">) {
  const sp = await searchParams;
  const oppId = Number(sp.opp);
  const hasOpp = Number.isInteger(oppId) && oppId > 0;
  const [rows, crm, pickers, opp, interactions, threads, leadJob] = await Promise.all([
    listPipeline(),
    getCrmPickers(),
    getPickerData(),
    hasOpp ? getOpportunity(oppId) : null,
    hasOpp ? listInteractions({ opportunityId: oppId }) : [],
    hasOpp ? listThreads({ opportunityId: oppId }) : [],
    hasOpp ? jobView("lead_reply", oppId) : null,
  ]);

  const open = rows.filter((r) => r.stage !== "won" && r.stage !== "lost");
  const openValue = formatMoneyTotals(open.map((r) => ({ amount: r.estValue, currency: r.currency })));
  const monthStart = startOfMonth(new Date());
  const wonThisMonth = rows.filter((r) => r.stage === "won" && r.updatedAt >= monthStart).length;

  return (
    <div>
      <PageHeader
        title="Pipeline"
        subtitle={`${open.length} open · ${openValue} estimated · ${wonThisMonth} won this month`}
        actions={
          <>
            <OpenDialogButton kind="interaction" variant="outline">
              Log conversation
            </OpenDialogButton>
            <OpenDialogButton kind="lead">Add lead</OpenDialogButton>
          </>
        }
      />
      <PipelineBoard rows={rows} />
      <OpportunitySheet
        opp={opp}
        interactions={interactions}
        threads={threads}
        crm={crm}
        projects={pickers.projects}
        ai={opp && <LeadAiPanel key={opp.id} leadId={opp.id} job={leadJob} enabled={aiProvider() !== "off"} />}
      />
    </div>
  );
}
