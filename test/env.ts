// Tests run against their own database, never the one in DATABASE_URL.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://127.0.0.1:5432/soloos_test";

// Tests truncate every table, so refuse anything that doesn't look like a test database.
if (!/test/.test(new URL(TEST_DATABASE_URL).pathname)) {
  throw new Error(`TEST_DATABASE_URL must point at a database with "test" in its name (got ${TEST_DATABASE_URL})`);
}
