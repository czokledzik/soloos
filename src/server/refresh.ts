import { revalidatePath } from "next/cache";

// Single-user app: every page renders fresh from the DB, so refreshing the
// whole tree after a mutation is cheap and keeps everything consistent.
export function refreshAll() {
  revalidatePath("/", "layout");
}
