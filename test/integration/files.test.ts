import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { attachmentData, attachments, db } from "@/db";
import { GET } from "@/app/files/[id]/route";
import { MAX_FILE_BYTES } from "@/lib/files";
import { deleteAttachment, updateAttachment, uploadAttachments } from "@/server/file-actions";
import { listAttachments } from "@/server/file-queries";
import { form, makeOrg, makeProject, ok, resetDb } from "../db";

beforeEach(resetDb);

const pdf = (body = "offer") => new File([`%PDF-1.7\n${body}`], "Oferta – Acme Dental.pdf", { type: "application/pdf" });

function upload(target: Record<string, number>, ...files: File[]) {
  const fd = form({ ...target, note: "signed" });
  for (const f of files) fd.append("file", f);
  return uploadAttachments(fd);
}

async function download(id: number, query = "") {
  const res = await GET(new NextRequest(`http://localhost/files/${id}${query}`), { params: Promise.resolve({ id: String(id) }) });
  return res;
}

describe("attachments", () => {
  it("attaches files to a project, under its client, and serves them back", async () => {
    const project = await makeProject();
    expect(ok(await upload({ projectId: project.id }, pdf(), new File(["hello"], "notes.txt", { type: "text/plain" })))).toBe(2);

    const files = await listAttachments({ projectId: project.id });
    expect(files.map((f) => [f.name, f.mimeType, f.orgId, f.note])).toEqual([
      ["notes.txt", "text/plain", project.orgId, "signed"],
      ["Oferta – Acme Dental.pdf", "application/pdf", project.orgId, "signed"],
    ]);
    // The client sees its projects' files too.
    expect(await listAttachments({ orgId: project.orgId })).toHaveLength(2);

    const pdfRow = files[1];
    const res = await download(pdfRow.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^inline; .*filename\*=UTF-8''Oferta%20%E2%80%93/);
    expect(await res.text()).toBe("%PDF-1.7\noffer");

    expect((await download(pdfRow.id, "?download")).headers.get("content-disposition")).toMatch(/^attachment;/);
    expect((await download(files[0].id)).headers.get("content-disposition")).toMatch(/^attachment;/);
    expect((await download(9999)).status).toBe(404);
  });

  it("attaches files to the client itself when there's no project", async () => {
    const org = await makeOrg();
    ok(await upload({ orgId: org.id }, pdf()));
    const [row] = await listAttachments({ orgId: org.id });
    expect([row.projectId, row.projectName]).toEqual([null, null]);
  });

  it("refuses duplicates, oversized files and files with credentials, saving nothing", async () => {
    const project = await makeProject();
    ok(await upload({ projectId: project.id }, pdf()));

    const dup = await upload({ projectId: project.id }, new File(["x"], "a.txt"), pdf());
    expect(dup).toEqual({ ok: false, error: "Oferta – Acme Dental.pdf is already attached as Oferta – Acme Dental.pdf." });

    const big = await upload({ projectId: project.id }, new File([new Uint8Array(MAX_FILE_BYTES + 1)], "video.mp4"));
    expect(big).toMatchObject({ ok: false, error: expect.stringContaining("files can be up to 4.0 MB") });

    const secret = await upload({ projectId: project.id }, new File(["N8N_API_KEY=abcdef123456"], ".env"));
    expect(secret).toMatchObject({ ok: false, error: expect.stringContaining("a password or key") });

    expect(await db.select().from(attachments)).toHaveLength(1);
    // The same file can still go on another project.
    ok(await upload({ projectId: (await makeProject({ orgId: project.orgId })).id }, pdf()));
  });

  it("renames, and deleting removes the stored bytes", async () => {
    const project = await makeProject();
    ok(await upload({ projectId: project.id }, pdf()));
    const [row] = await listAttachments({ projectId: project.id });

    ok(await updateAttachment(row.id, form({ name: "Oferta v2.pdf", note: "" })));
    expect((await listAttachments({ projectId: project.id }))[0]).toMatchObject({ name: "Oferta v2.pdf", note: "" });
    expect(await updateAttachment(row.id, form({ name: "x", note: "hasło: tajne123" }))).toMatchObject({ ok: false });

    ok(await deleteAttachment(row.id));
    expect(await db.select().from(attachmentData)).toEqual([]);
  });
});
