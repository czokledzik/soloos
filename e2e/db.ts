import postgres from "postgres";
import { E2E_DATABASE_URL } from "../playwright.config";

/** Direct access to the e2e database, for setting up state the UI can't (like time passing). */
export const sql = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => {} });
