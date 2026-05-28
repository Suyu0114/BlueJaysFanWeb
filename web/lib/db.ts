import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to web/.env.local");
}

// Reuse a single client across hot reloads in dev to avoid exhausting connections.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

export const sql =
  globalForDb.sql ??
  postgres(connectionString, { ssl: "require", prepare: false });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
