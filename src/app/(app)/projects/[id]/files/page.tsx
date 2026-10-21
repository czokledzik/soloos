import { FilesPanel } from "@/components/app/files-panel";
import { listAttachments } from "@/server/file-queries";

export default async function ProjectFilesPage({ params }: PageProps<"/projects/[id]/files">) {
  const id = Number((await params).id);
  const files = await listAttachments({ projectId: id });
  return (
    <div className="px-6 pb-6">
      <FilesPanel projectId={id} files={files} />
    </div>
  );
}
