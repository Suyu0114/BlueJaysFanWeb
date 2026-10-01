import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add it to web/.env.local");
}

// Reuse a single client across hot reloads in dev to avoid exhausting connections.
const globalForDb = globalThis as unknown as {
  sql?: ReturnType<typeof postgres>;
};

// prepare: false — Supavisor's transaction pooler (port 6543) can't hold
// prepared statements. max_pipeline: 0 — once all `max` connections are busy,
// postgres.js pipelines further queries onto busy ones; through the
// transaction pooler that desyncs and leaves backends stuck in ClientRead
// (seen when the layout's header queries pushed /team past 10 concurrent
// queries during `next build`). Extra queries now wait for a free connection.
// (max_pipeline is a runtime option missing from postgres.js 3.4's types, so
// it goes through a variable rather than an object literal.)
const options = { ssl: "require" as const, prepare: false, max_pipeline: 0 };

export const sql = globalForDb.sql ?? postgres(connectionString, options);

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;
