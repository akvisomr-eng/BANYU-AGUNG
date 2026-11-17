import { neon } from "@neondatabase/serverless";

type SqlClient = ReturnType<typeof neon>;

let client: SqlClient | undefined;

function getClient(): SqlClient {
  if (client) return client;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL belum dikonfigurasi.");
  }

  client = neon(connectionString);
  return client;
}

// Defer environment validation until a query is executed. This lets Next.js
// build public pages without database credentials while preserving a strict
// runtime failure if a database-backed action is actually invoked.
export const sql = ((strings: TemplateStringsArray, ...values: unknown[]) =>
  getClient()(strings, ...values)) as SqlClient;
