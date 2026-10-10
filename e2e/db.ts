import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";

/** Direct access to the e2e database, for setting up state the UI can't (like time passing). */
// Shared by all spec files in the worker; closes itself when idle instead of per file.
export const sql = postgres(E2E_DATABASE_URL, { max: 1, idle_timeout: 1, onnotice: () => {} });
