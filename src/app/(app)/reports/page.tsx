import { Empty, PageHeader } from "@/components/app/page-header";

export const metadata = { title: "Reports" };

export default function Page() {
  return (
    <div>
      <PageHeader title="Reports" />
      <div className="px-6">
        <Empty>Coming in a later milestone — see PLAN.md.</Empty>
      </div>
    </div>
  );
}
