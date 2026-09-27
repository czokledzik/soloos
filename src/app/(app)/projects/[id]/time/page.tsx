import { OpenDialogButton } from "@/components/app/buttons";
import { EntriesList } from "@/components/app/entries-list";
import { Empty } from "@/components/app/page-header";
import { getPickerData, listProjectEntries } from "@/server/queries";

export default async function ProjectTimePage({ params }: PageProps<"/projects/[id]/time">) {
  const id = Number((await params).id);
  const [entries, pickers] = await Promise.all([listProjectEntries(id), getPickerData()]);
  return (
    <div className="grid gap-4 px-6 pb-6">
      <div className="flex justify-end">
        <OpenDialogButton kind="time" opts={{ projectId: id }} variant="outline">
          Log time
        </OpenDialogButton>
      </div>
      {entries.length ? (
        <EntriesList entries={entries} pickers={pickers} showProject={false} />
      ) : (
        <Empty>No time logged on this project yet.</Empty>
      )}
    </div>
  );
}
